import { describe, it, expect } from 'vitest';

import {
  getVideoEditorMediaAllowlist,
  guardedMediaFetch,
  materializeVideoOutput,
  SsrfBlockedError,
  GuardedFetchError,
  MEDIA_ALLOWLIST_ENV,
  MEDIA_ALLOWED_SCHEMES_ENV,
} from '../server/features/video-editor/services/guarded-media-fetch.service';
import type { VideoOutput } from '../server/features/video-editor/services/providers/video-ai-provider';

// A silent logger so the guard's warn() calls don't spam test output.
const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as any;

// ---------------------------------------------------------------------------
// getVideoEditorMediaAllowlist — config/env parsing (Req 19.6)
// ---------------------------------------------------------------------------
describe('getVideoEditorMediaAllowlist (config/env)', () => {
  it('parses a comma/whitespace-separated host list and de-duplicates', () => {
    const cfg = getVideoEditorMediaAllowlist({
      [MEDIA_ALLOWLIST_ENV]: 'cdn.example.com, .assets.example.org  cdn.example.com',
    } as any);
    expect(cfg.hosts).toEqual(['cdn.example.com', '.assets.example.org']);
  });

  it('defaults to https-only schemes when unset', () => {
    const cfg = getVideoEditorMediaAllowlist({} as any);
    expect(cfg.allowedSchemes).toEqual(['https']);
    expect(cfg.hosts).toEqual([]); // fail-closed: nothing fetchable
  });

  it('honors an explicit scheme override', () => {
    const cfg = getVideoEditorMediaAllowlist({
      [MEDIA_ALLOWLIST_ENV]: 'cdn.example.com',
      [MEDIA_ALLOWED_SCHEMES_ENV]: 'https, http',
    } as any);
    expect(cfg.allowedSchemes).toEqual(['https', 'http']);
  });
});

// ---------------------------------------------------------------------------
// guardedMediaFetch — blocks before any outbound request (Req 19.6, 19.7)
// ---------------------------------------------------------------------------
describe('guardedMediaFetch blocking (SSRF guard, no outbound request)', () => {
  const allowlist = { hosts: ['cdn.example.com'], allowedSchemes: ['https', 'http'] };

  it('rejects an off-allowlist host with NOT_ALLOWLISTED and no fetch', async () => {
    let resolved = false;
    await expect(
      guardedMediaFetch('https://evil.example.net/video.mp4', {
        allowlist,
        logger: silentLogger,
        // Even a "public" resolution must not matter — host is off allowlist.
        resolveHost: async () => {
          resolved = true;
          return ['8.8.8.8'];
        },
      }),
    ).rejects.toMatchObject({ name: 'SsrfBlockedError', reason: 'NOT_ALLOWLISTED' });
    // Resolution may run, but the point is no socket is opened (unreachable host).
    expect(resolved).toBe(true);
  });

  it('rejects DNS-rebinding: allowlisted host resolving to loopback (INTERNAL_ADDRESS)', async () => {
    await expect(
      guardedMediaFetch('https://cdn.example.com/video.mp4', {
        allowlist,
        logger: silentLogger,
        resolveHost: async () => ['127.0.0.1'],
      }),
    ).rejects.toMatchObject({ name: 'SsrfBlockedError', reason: 'INTERNAL_ADDRESS' });
  });

  it('rejects an allowlisted host that resolves to a private range', async () => {
    await expect(
      guardedMediaFetch('https://cdn.example.com/video.mp4', {
        allowlist,
        logger: silentLogger,
        resolveHost: async () => ['10.0.0.5'],
      }),
    ).rejects.toMatchObject({ name: 'SsrfBlockedError', reason: 'INTERNAL_ADDRESS' });
  });

  it('rejects when the host resolves to nothing (NO_RESOLVED_ADDRESSES)', async () => {
    await expect(
      guardedMediaFetch('https://cdn.example.com/video.mp4', {
        allowlist,
        logger: silentLogger,
        resolveHost: async () => [],
      }),
    ).rejects.toMatchObject({ name: 'SsrfBlockedError', reason: 'NO_RESOLVED_ADDRESSES' });
  });

  it('fails closed on an empty allowlist', async () => {
    await expect(
      guardedMediaFetch('https://cdn.example.com/video.mp4', {
        allowlist: { hosts: [] },
        logger: silentLogger,
        resolveHost: async () => ['8.8.8.8'],
      }),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it('rejects a disallowed scheme on an otherwise-allowlisted host', async () => {
    await expect(
      guardedMediaFetch('ftp://cdn.example.com/video.mp4', {
        allowlist,
        logger: silentLogger,
        resolveHost: async () => ['8.8.8.8'],
      }),
    ).rejects.toMatchObject({ name: 'SsrfBlockedError', reason: 'UNSUPPORTED_SCHEME' });
  });
});

// ---------------------------------------------------------------------------
// materializeVideoOutput — inline vs by-reference (provider transport path)
// ---------------------------------------------------------------------------
describe('materializeVideoOutput (provider output fetch path)', () => {
  it('materializes inline base64 output without any network fetch', async () => {
    const bytes = Buffer.from('inline-video');
    const output: VideoOutput = {
      videoBase64: bytes.toString('base64'),
      mimeType: 'video/mp4',
      outputSeconds: 5,
    };
    const result = await materializeVideoOutput(output, { logger: silentLogger });
    expect(result.buffer.equals(bytes)).toBe(true);
    expect(result.mimeType).toBe('video/mp4');
    expect(result.outputSeconds).toBe(5);
  });

  it('routes a by-reference URI through the SSRF guard (blocks internal target)', async () => {
    const output: VideoOutput = {
      uri: 'https://cdn.example.com/out.mp4',
      mimeType: 'video/mp4',
      outputSeconds: 5,
    };
    await expect(
      materializeVideoOutput(output, {
        allowlist: { hosts: ['cdn.example.com'] },
        logger: silentLogger,
        resolveHost: async () => ['169.254.169.254'], // cloud metadata / link-local
      }),
    ).rejects.toMatchObject({ name: 'SsrfBlockedError', reason: 'INTERNAL_ADDRESS' });
  });

  it('throws when output has neither inline bytes nor a URI', async () => {
    const output = { mimeType: 'video/mp4', outputSeconds: 5 } as VideoOutput;
    await expect(materializeVideoOutput(output)).rejects.toBeInstanceOf(GuardedFetchError);
  });
});
