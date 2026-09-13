/**
 * Unit + property tests for the Video Editor generative provider adapters
 * (task 17.5): the `VideoAIProvider` interface, the Gemini Omni / Veo adapters,
 * and the No-Mock integration rule.
 *
 * Framework: vitest + fast-check.
 *
 * Requirements exercised:
 *  - Req 7.6 — provider-neutral interface: capability reporting, cost estimation,
 *    generation, and editing are all present and provider-neutral.
 *  - Req 7.7 — a provider is "integrated" ONLY after a real successful call; a
 *    freshly constructed adapter is NOT integrated, and a failed/video-less call
 *    never flips it (No-Mock).
 *  - Req 7.8 — provider calls are routed through an injected server-side
 *    transport (no keys in the adapter); this test injects a fake transport so
 *    no network/keys are touched.
 *
 * The real transport (AIServiceManager/Gemini SDK) is never exercised here; a
 * fake transport stands in so the integration/estimation semantics are tested
 * deterministically. This is NOT a mock of the unit under test — the adapters'
 * real logic runs; only the external provider boundary is substituted, exactly
 * as the interface's dependency injection intends.
 */

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import {
  GeminiOmniAdapter,
  GEMINI_OMNI_PROVIDER,
  GEMINI_OMNI_MODEL,
} from '../server/features/video-editor/services/providers/gemini-omni-adapter';
import {
  VeoAdapter,
  VEO_PROVIDER,
  VEO_MODEL,
} from '../server/features/video-editor/services/providers/veo-adapter';
import {
  VideoProviderCallError,
  VideoProviderRequestError,
  type VideoProviderTransport,
  type TransportRequest,
  type TransportResult,
  type VideoOutput,
} from '../server/features/video-editor/services/providers/video-ai-provider';

// ---------------------------------------------------------------------------
// Fake transports (the external provider boundary only)
// ---------------------------------------------------------------------------

/** A transport that returns a real-looking video output for every call. */
function successTransport(): VideoProviderTransport {
  const make = (req: TransportRequest): TransportResult => {
    const output: VideoOutput = {
      videoBase64: 'AAAA', // non-empty payload
      mimeType: 'video/mp4',
      outputSeconds: req.outputSeconds > 0 ? req.outputSeconds : 1,
    };
    return { output, raw: { ok: true } };
  };
  return {
    generateVideo: vi.fn(async (req) => make(req)),
    editVideo: vi.fn(async (req) => make(req)),
  };
}

/** A transport that always throws, like an unsupported model / real API error. */
function failingTransport(): VideoProviderTransport {
  const boom = async (req: TransportRequest): Promise<TransportResult> => {
    throw new VideoProviderCallError('provider unavailable', req.provider, req.model);
  };
  return { generateVideo: vi.fn(boom), editVideo: vi.fn(boom) };
}

/** A transport that "succeeds" but returns an empty/placeholder output. */
function placeholderTransport(): VideoProviderTransport {
  const empty = async (): Promise<TransportResult> => ({
    output: { mimeType: 'video/mp4', outputSeconds: 0 } as VideoOutput,
  });
  return { generateVideo: vi.fn(empty), editVideo: vi.fn(empty) };
}

const OMNI_INSTRUCTION = 'Remove the background person; preserve the speaker.';

// ---------------------------------------------------------------------------
// Req 7.6 — provider-neutral interface surface
// ---------------------------------------------------------------------------

describe('VideoAIProvider interface (Req 7.6)', () => {
  it('exposes capability reporting, cost estimation, generation, and editing', () => {
    for (const p of [new GeminiOmniAdapter(successTransport()), new VeoAdapter(successTransport())]) {
      expect(typeof p.getCapabilities).toBe('function');
      expect(typeof p.estimateCost).toBe('function');
      expect(typeof p.generate).toBe('function');
      expect(typeof p.edit).toBe('function');
      // Capability reporting returns the provider's own record.
      const caps = p.getCapabilities();
      expect(caps.provider).toBe(p.provider);
      expect(caps.model).toBe(p.model);
      expect(caps.outputModalities).toContain('video');
    }
  });

  it('binds each adapter to its seeded provider/model identity', () => {
    const omni = new GeminiOmniAdapter(successTransport());
    expect([omni.provider, omni.model]).toEqual([GEMINI_OMNI_PROVIDER, GEMINI_OMNI_MODEL]);
    const veo = new VeoAdapter(successTransport());
    expect([veo.provider, veo.model]).toEqual([VEO_PROVIDER, VEO_MODEL]);
  });
});

// ---------------------------------------------------------------------------
// Req 7.7 — "integrated" only after a real successful call (No-Mock)
// ---------------------------------------------------------------------------

describe('No-Mock integration classification (Req 7.7)', () => {
  it('a freshly constructed adapter is NOT integrated', () => {
    expect(new GeminiOmniAdapter(successTransport()).isIntegrated()).toBe(false);
    expect(new VeoAdapter(successTransport()).isIntegrated()).toBe(false);
    const status = new GeminiOmniAdapter(successTransport()).getIntegrationStatus();
    expect(status.integrated).toBe(false);
    expect(status.integratedOperations).toEqual([]);
    expect(status.lastSuccessAt).toBeNull();
  });

  it('a real successful generate marks the provider integrated', async () => {
    const adapter = new GeminiOmniAdapter(successTransport());
    const result = await adapter.generate({ instruction: OMNI_INSTRUCTION, outputSeconds: 4 });
    expect(result.output.videoBase64).toBeTruthy();
    expect(adapter.isIntegrated()).toBe(true);
    expect(adapter.getIntegrationStatus().integratedOperations).toContain('generate');
    expect(adapter.getIntegrationStatus().lastSuccessAt).toBeTypeOf('number');
  });

  it('a real successful edit marks the provider integrated', async () => {
    const adapter = new GeminiOmniAdapter(successTransport());
    await adapter.edit({
      instruction: OMNI_INSTRUCTION,
      inputVideoBase64: 'BBBB',
      inputVideoMimeType: 'video/mp4',
      affectedRangeMs: { startMs: 0, endMs: 4000 },
    });
    expect(adapter.isIntegrated()).toBe(true);
    expect(adapter.getIntegrationStatus().integratedOperations).toContain('edit');
  });

  it('a failing provider call leaves the adapter un-integrated and surfaces a real error', async () => {
    const adapter = new GeminiOmniAdapter(failingTransport());
    await expect(
      adapter.generate({ instruction: OMNI_INSTRUCTION, outputSeconds: 4 }),
    ).rejects.toBeInstanceOf(VideoProviderCallError);
    expect(adapter.isIntegrated()).toBe(false);
    expect(adapter.getIntegrationStatus().lastError).toBeTruthy();
  });

  it('a placeholder/empty output is rejected and never flips integration (No-Mock)', async () => {
    const adapter = new VeoAdapter(placeholderTransport());
    await expect(
      adapter.generate({ instruction: 'generate a clip', outputSeconds: 4 }),
    ).rejects.toBeInstanceOf(VideoProviderCallError);
    expect(adapter.isIntegrated()).toBe(false);
  });

  it('estimateCost is deterministic from capability metadata and marks that op integrated', async () => {
    const adapter = new VeoAdapter(successTransport());
    const caps = adapter.getCapabilities();
    const est = await adapter.estimateCost({ outputSeconds: caps.outputSeconds.min });
    expect(est.currency).toBe('INR');
    expect(est.costInr).toBeCloseTo(caps.outputSeconds.min * caps.costPerOutputSecondInr, 6);
    expect(adapter.getIntegrationStatus().integratedOperations).toContain('estimateCost');
  });
});

// ---------------------------------------------------------------------------
// Request validation happens before the transport is ever called (No-Mock guard)
// ---------------------------------------------------------------------------

describe('request validation precedes provider calls', () => {
  it('rejects an empty instruction without calling the transport', async () => {
    const transport = successTransport();
    const adapter = new GeminiOmniAdapter(transport);
    await expect(
      adapter.generate({ instruction: '   ', outputSeconds: 4 }),
    ).rejects.toBeInstanceOf(VideoProviderRequestError);
    expect(transport.generateVideo).not.toHaveBeenCalled();
    expect(adapter.isIntegrated()).toBe(false);
  });

  it('rejects an out-of-bounds output duration without calling the transport', async () => {
    const transport = successTransport();
    const adapter = new GeminiOmniAdapter(transport);
    const caps = adapter.getCapabilities();
    await expect(
      adapter.generate({ instruction: OMNI_INSTRUCTION, outputSeconds: caps.outputSeconds.max + 1000 }),
    ).rejects.toBeInstanceOf(VideoProviderRequestError);
    expect(transport.generateVideo).not.toHaveBeenCalled();
  });

  it('rejects an edit with no input segment without calling the transport', async () => {
    const transport = successTransport();
    const adapter = new VeoAdapter(transport);
    await expect(
      adapter.edit({ instruction: OMNI_INSTRUCTION }),
    ).rejects.toBeInstanceOf(VideoProviderRequestError);
    expect(transport.editVideo).not.toHaveBeenCalled();
  });

  it('property: estimateCost never returns a cost below zero and clamps to output bounds', async () => {
    const adapter = new GeminiOmniAdapter(successTransport());
    const caps = adapter.getCapabilities();
    await fc.assert(
      fc.asyncProperty(fc.double({ min: 0.001, max: 10_000, noNaN: true }), async (seconds) => {
        const est = await adapter.estimateCost({ outputSeconds: seconds });
        expect(est.costInr).toBeGreaterThanOrEqual(0);
        expect(est.outputSeconds).toBeGreaterThanOrEqual(caps.outputSeconds.min);
        expect(est.outputSeconds).toBeLessThanOrEqual(caps.outputSeconds.max);
      }),
      { numRuns: 200 },
    );
  });
});
