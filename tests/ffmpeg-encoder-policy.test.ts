/**
 * Unit tests for the FFmpeg encoder policy
 * (`server/features/video-editor/services/ffmpeg-encoder-policy.ts`).
 *
 * Framework: vitest.
 *
 * The policy splits a PURE selection surface (capabilities + env overrides → the
 * ffmpeg `-c:v …` argument vector) from an IMPURE, cached capability probe. Both
 * halves are covered here with zero real process spawning:
 *
 *   • selection — hardware available ⇒ `h264_videotoolbox`; hardware absent ⇒
 *     `libx264 -preset veryfast`; forced-software env ⇒ `libx264` even when
 *     hardware exists; quality mode vs bitrate mode vectors; invalid env values
 *     fall back to the documented defaults.
 *   • detection — an injected prober that throws, times out (throws the way
 *     `execFileSync` does on ETIMEDOUT), or returns garbage must degrade to the
 *     software-only capability set and must NEVER throw.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  selectVideoEncoderArgs,
  resolveEncoderPolicyOverrides,
  detectEncoderCapabilities,
  resetEncoderCapabilitiesCache,
  SOFTWARE_ONLY_CAPABILITIES,
  DEFAULT_SOFTWARE_PRESET,
  DEFAULT_HARDWARE_QUALITY,
  DEFAULT_SOFTWARE_THREADS,
  SOFTWARE_QUALITY_CRF,
  FORCE_SOFTWARE_ENV_VAR,
  SOFTWARE_PRESET_ENV_VAR,
  HARDWARE_QUALITY_ENV_VAR,
  SOFTWARE_THREADS_ENV_VAR,
  type EncoderCapabilities,
} from '../server/features/video-editor/services/ffmpeg-encoder-policy';

const silentLogger = { info() {}, warn() {} };

/** Capabilities of the bundled Apple-Silicon ffmpeg 6.0 build. */
const HW: EncoderCapabilities = { h264Videotoolbox: true };

/** Capabilities of a typical Linux production box (no VideoToolbox). */
const SW: EncoderCapabilities = SOFTWARE_ONLY_CAPABILITIES;

/** Read the value that follows `flag` in an argument vector. */
function valueOf(args: readonly string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

const DEFAULTS = resolveEncoderPolicyOverrides({});

// ---------------------------------------------------------------------------
// Pure selection
// ---------------------------------------------------------------------------

describe('selectVideoEncoderArgs — pure encoder selection', () => {
  it('picks the hardware encoder when VideoToolbox is available and software is not forced', () => {
    const sel = selectVideoEncoderArgs({ target: { mode: 'quality' } }, HW, DEFAULTS);

    expect(sel.encoder).toBe('h264_videotoolbox');
    expect(sel.hardware).toBe(true);
    expect(valueOf(sel.args, '-c:v')).toBe('h264_videotoolbox');
    expect(valueOf(sel.args, '-q:v')).toBe(String(DEFAULT_HARDWARE_QUALITY));
    // Never software-only flags on the hardware path.
    expect(sel.args).not.toContain('-crf');
    expect(sel.args).not.toContain('-preset');
  });

  it('falls back to libx264 + veryfast when no hardware encoder exists (Linux production)', () => {
    const sel = selectVideoEncoderArgs({ target: { mode: 'quality' } }, SW, DEFAULTS);

    expect(sel.encoder).toBe('libx264');
    expect(sel.hardware).toBe(false);
    expect(valueOf(sel.args, '-preset')).toBe('veryfast');
    expect(DEFAULT_SOFTWARE_PRESET).toBe('veryfast');
    expect(valueOf(sel.args, '-crf')).toBe(String(SOFTWARE_QUALITY_CRF));
  });

  it('honours forced-software mode even when hardware IS available (byte-reproducible path)', () => {
    const overrides = resolveEncoderPolicyOverrides({ [FORCE_SOFTWARE_ENV_VAR]: 'true' });
    const sel = selectVideoEncoderArgs({ target: { mode: 'quality' } }, HW, overrides);

    expect(overrides.forceSoftware).toBe(true);
    expect(sel.encoder).toBe('libx264');
    expect(sel.hardware).toBe(false);
    expect(valueOf(sel.args, '-crf')).toBe(String(SOFTWARE_QUALITY_CRF));
    expect(sel.args).not.toContain('h264_videotoolbox');
  });

  it('maps bitrate mode to -b:v on BOTH encoders (export-profile contract)', () => {
    const hw = selectVideoEncoderArgs(
      { target: { mode: 'bitrate', videoBitrateKbps: 6000 } },
      HW,
      DEFAULTS,
    );
    expect(hw.encoder).toBe('h264_videotoolbox');
    expect(valueOf(hw.args, '-b:v')).toBe('6000k');
    expect(hw.args).not.toContain('-q:v');

    const sw = selectVideoEncoderArgs(
      { target: { mode: 'bitrate', videoBitrateKbps: 6000 } },
      SW,
      DEFAULTS,
    );
    expect(sw.encoder).toBe('libx264');
    expect(valueOf(sw.args, '-b:v')).toBe('6000k');
    expect(sw.args).not.toContain('-crf');
  });

  it('degrades an unusable bitrate target to constant quality instead of emitting -b:v NaNk', () => {
    const sel = selectVideoEncoderArgs(
      { target: { mode: 'bitrate', videoBitrateKbps: Number.NaN } },
      SW,
      DEFAULTS,
    );
    expect(sel.args).not.toContain('-b:v');
    expect(valueOf(sel.args, '-crf')).toBe(String(SOFTWARE_QUALITY_CRF));
  });

  it('always emits yuv420p, and faststart for mp4 outputs only', () => {
    const withFaststart = selectVideoEncoderArgs({ target: { mode: 'quality' } }, HW, DEFAULTS);
    expect(valueOf(withFaststart.args, '-pix_fmt')).toBe('yuv420p');
    expect(valueOf(withFaststart.args, '-movflags')).toBe('+faststart');

    const noFaststart = selectVideoEncoderArgs(
      { target: { mode: 'quality' }, faststart: false },
      SW,
      DEFAULTS,
    );
    expect(valueOf(noFaststart.args, '-pix_fmt')).toBe('yuv420p');
    expect(noFaststart.args).not.toContain('-movflags');
  });

  it('never selects hardware for non-h264 families and never sends -preset to libvpx-vp9', () => {
    const h265 = selectVideoEncoderArgs({ codecFamily: 'h265', target: { mode: 'quality' } }, HW, DEFAULTS);
    expect(h265.encoder).toBe('libx265');
    expect(h265.hardware).toBe(false);
    expect(valueOf(h265.args, '-preset')).toBe(DEFAULT_SOFTWARE_PRESET);

    const vp9 = selectVideoEncoderArgs({ codecFamily: 'vp9', target: { mode: 'quality' } }, HW, DEFAULTS);
    expect(vp9.encoder).toBe('libvpx-vp9');
    expect(vp9.args).not.toContain('-preset');
    // libvpx-vp9 constant quality needs an explicit zero target bitrate.
    expect(valueOf(vp9.args, '-b:v')).toBe('0');
  });

  it('omits -threads by default and emits the cap when configured', () => {
    expect(DEFAULT_SOFTWARE_THREADS).toBe(0);
    const auto = selectVideoEncoderArgs({ target: { mode: 'quality' } }, SW, DEFAULTS);
    expect(auto.args).not.toContain('-threads');

    const capped = selectVideoEncoderArgs(
      { target: { mode: 'quality' } },
      SW,
      resolveEncoderPolicyOverrides({ [SOFTWARE_THREADS_ENV_VAR]: '4' }),
    );
    expect(valueOf(capped.args, '-threads')).toBe('4');

    // The thread cap is a SOFTWARE-path concern only.
    const hw = selectVideoEncoderArgs(
      { target: { mode: 'quality' } },
      HW,
      resolveEncoderPolicyOverrides({ [SOFTWARE_THREADS_ENV_VAR]: '4' }),
    );
    expect(hw.args).not.toContain('-threads');
  });

  it('is deterministic — identical inputs always yield an identical vector', () => {
    const a = selectVideoEncoderArgs({ target: { mode: 'quality' } }, HW, DEFAULTS);
    const b = selectVideoEncoderArgs({ target: { mode: 'quality' } }, HW, DEFAULTS);
    expect(a.args).toEqual(b.args);
  });
});

// ---------------------------------------------------------------------------
// Pure env resolution
// ---------------------------------------------------------------------------

describe('resolveEncoderPolicyOverrides — env parsing', () => {
  it('applies valid overrides', () => {
    const o = resolveEncoderPolicyOverrides({
      [FORCE_SOFTWARE_ENV_VAR]: 'TRUE',
      [SOFTWARE_PRESET_ENV_VAR]: 'ultrafast',
      [HARDWARE_QUALITY_ENV_VAR]: '70',
      [SOFTWARE_THREADS_ENV_VAR]: '8',
    });
    expect(o).toEqual({
      forceSoftware: true,
      softwarePreset: 'ultrafast',
      hardwareQuality: 70,
      softwareThreads: 8,
    });
  });

  it('falls back to defaults for every invalid value (a .env typo can never break rendering)', () => {
    const cases: Record<string, string>[] = [
      { [SOFTWARE_PRESET_ENV_VAR]: 'turbo' },
      { [SOFTWARE_PRESET_ENV_VAR]: '' },
      { [HARDWARE_QUALITY_ENV_VAR]: 'high' },
      { [HARDWARE_QUALITY_ENV_VAR]: '0' },
      { [HARDWARE_QUALITY_ENV_VAR]: '101' },
      { [HARDWARE_QUALITY_ENV_VAR]: '55.5' },
      { [SOFTWARE_THREADS_ENV_VAR]: '-2' },
      { [SOFTWARE_THREADS_ENV_VAR]: 'all' },
      { [SOFTWARE_THREADS_ENV_VAR]: '9999' },
    ];
    for (const env of cases) {
      const o = resolveEncoderPolicyOverrides(env);
      expect(o.softwarePreset).toBe(DEFAULT_SOFTWARE_PRESET);
      expect(o.hardwareQuality).toBe(DEFAULT_HARDWARE_QUALITY);
      expect(o.softwareThreads).toBe(DEFAULT_SOFTWARE_THREADS);
    }
  });

  it('only an explicit truthy token forces software; anything else leaves hardware enabled', () => {
    for (const raw of ['true', 'TRUE', ' 1 ', 'yes', 'on']) {
      expect(resolveEncoderPolicyOverrides({ [FORCE_SOFTWARE_ENV_VAR]: raw }).forceSoftware).toBe(true);
    }
    for (const raw of ['', 'false', '0', 'no', 'maybe', undefined as unknown as string]) {
      expect(resolveEncoderPolicyOverrides({ [FORCE_SOFTWARE_ENV_VAR]: raw }).forceSoftware).toBe(false);
    }
  });

  it('an empty env yields the documented defaults', () => {
    expect(resolveEncoderPolicyOverrides({})).toEqual({
      forceSoftware: false,
      softwarePreset: DEFAULT_SOFTWARE_PRESET,
      hardwareQuality: DEFAULT_HARDWARE_QUALITY,
      softwareThreads: DEFAULT_SOFTWARE_THREADS,
    });
  });
});

// ---------------------------------------------------------------------------
// Impure detection (injected prober — nothing is spawned)
// ---------------------------------------------------------------------------

describe('detectEncoderCapabilities — cached, never throws', () => {
  beforeEach(() => {
    resetEncoderCapabilitiesCache();
  });

  it('detects h264_videotoolbox from a realistic -encoders listing', () => {
    const listing = [
      'Encoders:',
      ' V..... libx264              libx264 H.264 / AVC / MPEG-4 AVC',
      ' V....D h264_videotoolbox    VideoToolbox H.264 Encoder',
      ' A..... aac                  AAC (Advanced Audio Coding)',
    ].join('\n');

    const caps = detectEncoderCapabilities(() => listing, silentLogger);
    expect(caps.h264Videotoolbox).toBe(true);
  });

  it('reports software-only for a Linux listing without VideoToolbox', () => {
    const listing = ' V..... libx264              libx264 H.264 / AVC\n V..... libx265  libx265';
    expect(detectEncoderCapabilities(() => listing, silentLogger)).toEqual(SOFTWARE_ONLY_CAPABILITIES);
  });

  it('falls back to software when the prober THROWS (missing binary / non-zero exit)', () => {
    const caps = detectEncoderCapabilities(() => {
      throw new Error('spawn ffmpeg ENOENT');
    }, silentLogger);
    expect(caps).toEqual(SOFTWARE_ONLY_CAPABILITIES);
  });

  it('falls back to software when the prober TIMES OUT', () => {
    const caps = detectEncoderCapabilities(() => {
      const err = new Error('spawnSync ffmpeg ETIMEDOUT') as Error & { code?: string };
      err.code = 'ETIMEDOUT';
      throw err;
    }, silentLogger);
    expect(caps).toEqual(SOFTWARE_ONLY_CAPABILITIES);
  });

  it('falls back to software for garbage / empty / non-string prober output', () => {
    for (const garbage of ['', '\u0000\u0001binary-noise', 'h264videotoolbox', undefined, null, 42]) {
      resetEncoderCapabilitiesCache();
      const caps = detectEncoderCapabilities(() => garbage as unknown as string, silentLogger);
      expect(caps).toEqual(SOFTWARE_ONLY_CAPABILITIES);
    }
  });

  it('probes ONCE and caches the result for the whole process', () => {
    let calls = 0;
    const prober = () => {
      calls += 1;
      return ' V....D h264_videotoolbox    VideoToolbox H.264 Encoder';
    };

    const first = detectEncoderCapabilities(prober, silentLogger);
    const second = detectEncoderCapabilities(prober, silentLogger);
    const third = detectEncoderCapabilities(() => {
      throw new Error('must not be called');
    }, silentLogger);

    expect(calls).toBe(1);
    expect(first.h264Videotoolbox).toBe(true);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });
});
