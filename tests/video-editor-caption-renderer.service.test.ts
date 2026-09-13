/**
 * Unit + property tests for the deterministic Caption_Renderer FFmpeg burn-in
 * service (task 13.3).
 *
 * Framework: vitest + fast-check.
 *
 * Covers (design.md, Req 11.3, 11.7, 11.8):
 *  - Deterministic burn-in: same captions + preset + typography → identical
 *    FFmpeg command on every build (Req 11.3).
 *  - Workspace brand typography applied when defined (Req 11.7).
 *  - Default-typography fallback + surfaced indication when the brand font fails
 *    to load, without failing caption generation (Req 11.8).
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  CaptionRendererService,
  resolveTypography,
  buildCaptionBurnInCommand,
  captionBurnInCommandToString,
  type CaptionFfmpegRunner,
  type RenderCaptionsRequest,
  type CaptionBurnInCommand,
} from '../server/features/video-editor/services/caption-renderer.service';
import {
  layoutCaptions,
  captionLayoutConfigFromPreset,
  type CaptionSegment,
} from '../server/features/video-editor/services/caption-layout.logic';
import { PLATFORM_PRESETS, BRAND_DEFAULTS } from '../server/features/video-editor/config/video-editor.config';
import {
  selectVideoEncoderArgs,
  resolveEncoderPolicyOverrides,
  resolveVideoEncoderArgs,
} from '../server/features/video-editor/services/ffmpeg-encoder-policy';

const RUNS = 200;

// Font loader stubs (real predicates, not mocks-to-pass): they model a font file
// that exists vs. one that cannot be loaded.
const loadableFont = (_f: string) => true;
const unloadableFont = (_f: string) => false;

const baseSegments: CaptionSegment[] = [
  { startMs: 0, endMs: 1000, text: 'Hello world' },
  { startMs: 1000, endMs: 2000, text: 'this is a caption test' },
];

function buildFor(segments: CaptionSegment[], presetKey = 'instagram_reel') {
  const svc = new CaptionRendererService({
    defaultFontFile: '/fonts/default.ttf',
    fontLoader: loadableFont,
    runner: async () => {},
  });
  return svc.buildCommand({
    segments,
    presetKey,
    inputPath: '/in.mp4',
    outputPath: '/out.mp4',
    dimensions: { width: 1080, height: 1920 },
  });
}

describe('CaptionRendererService — deterministic burn-in (Req 11.3)', () => {
  it('produces an identical command across repeated builds for identical inputs', () => {
    const a = buildFor(baseSegments);
    const b = buildFor(baseSegments);
    expect(a.command.args).toEqual(b.command.args);
    expect(captionBurnInCommandToString(a.command)).toEqual(captionBurnInCommandToString(b.command));
  });

  it('is order-independent: reordering segments yields the same command', () => {
    const forward = buildFor(baseSegments);
    const reversed = buildFor([...baseSegments].reverse());
    expect(forward.command.args).toEqual(reversed.command.args);
  });

  it('takes its encoder settings from the encoder policy and copies audio (voice byte-identical)', () => {
    const { command } = buildFor(baseSegments);
    // The encoder half is whatever the policy selected for this process; the audio
    // half must always be a stream copy so the voice bytes are untouched.
    expect(command.outputOptions).toEqual([
      ...resolveVideoEncoderArgs({ target: { mode: 'quality' } }),
      '-c:a',
      'copy',
    ]);
    expect(command.outputOptions).toContain('-pix_fmt');
    expect(command.outputOptions).toContain('yuv420p');
    expect(command.args).toContain('-vf');
  });

  it('forced-software mode burns in with libx264 + crf; hardware-capable mode uses the hardware codec', () => {
    const common = {
      captions: layoutCaptions(
        baseSegments,
        captionLayoutConfigFromPreset(PLATFORM_PRESETS.instagram_reel, BRAND_DEFAULTS),
        { width: 1080, height: 1920 },
      ),
      typography: resolveTypography(null, {
        brand: BRAND_DEFAULTS,
        defaultFontFile: '/fonts/default.ttf',
        fontLoader: loadableFont,
      }).typography,
      dimensions: { width: 1080, height: 1920 },
      inputPath: '/in.mp4',
      outputPath: '/out.mp4',
    };

    const software = buildCaptionBurnInCommand({
      ...common,
      videoEncoderArgs: selectVideoEncoderArgs(
        { target: { mode: 'quality' } },
        { h264Videotoolbox: true },
        resolveEncoderPolicyOverrides({ VIDEO_EDITOR_FORCE_SOFTWARE_ENCODE: 'true' }),
      ).args,
    });
    expect(software.outputOptions).toContain('libx264');
    expect(software.outputOptions).toContain('-crf');
    expect(software.outputOptions).toContain('copy');

    const hardware = buildCaptionBurnInCommand({
      ...common,
      videoEncoderArgs: selectVideoEncoderArgs(
        { target: { mode: 'quality' } },
        { h264Videotoolbox: true },
        resolveEncoderPolicyOverrides({}),
      ).args,
    });
    expect(hardware.outputOptions).toContain('h264_videotoolbox');
    expect(hardware.outputOptions).toContain('-q:v');
    expect(hardware.outputOptions).not.toContain('libx264');
    expect(hardware.outputOptions).toContain('copy');
  });

  it('emits an enable window and drawtext filter per caption cue', () => {
    const { command, captions } = buildFor(baseSegments);
    const drawCount = (command.videoFilter.match(/drawtext=/g) ?? []).length;
    expect(drawCount).toBe(captions.length);
    expect(command.videoFilter).toContain("enable='between(t,0.000,1.000)'");
  });

  it('property: identical inputs always produce byte-identical commands (Req 11.3)', () => {
    const textArb = fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0);
    const segArb = fc
      .array(
        fc
          .record({ start: fc.integer({ min: 0, max: 50_000 }), dur: fc.integer({ min: 1, max: 3_000 }), text: textArb })
          .map(({ start, dur, text }) => ({ startMs: start, endMs: start + dur, text }) as CaptionSegment),
        { minLength: 0, maxLength: 8 },
      );

    fc.assert(
      fc.property(segArb, fc.constantFrom(...Object.keys(PLATFORM_PRESETS)), (segments, presetKey) => {
        const first = buildFor(segments, presetKey);
        const second = buildFor(segments, presetKey);
        expect(first.command.args).toEqual(second.command.args);
      }),
      { numRuns: RUNS },
    );
  });
});

describe('CaptionRendererService — brand typography + fallback (Req 11.7, 11.8)', () => {
  it('applies workspace brand typography when its font loads (Req 11.7)', () => {
    const res = resolveTypography(
      { fontFamily: 'BrandSans', fontFile: '/brand/brand.ttf', fontSizeFrac: 0.06 },
      { defaultFontFile: '/fonts/default.ttf', fontLoader: loadableFont },
    );
    expect(res.fallbackApplied).toBe(false);
    expect(res.typography.fontFile).toBe('/brand/brand.ttf');
    expect(res.typography.fontFamily).toBe('BrandSans');
    expect(res.typography.fontSizeFrac).toBeCloseTo(0.06);
  });

  it('falls back to default typography AND surfaces an indication when brand font fails (Req 11.8)', () => {
    const res = resolveTypography(
      { fontFamily: 'BrandSans', fontFile: '/brand/missing.ttf' },
      { defaultFontFile: '/fonts/default.ttf', fontLoader: unloadableFont },
    );
    expect(res.fallbackApplied).toBe(true);
    expect(res.fallbackReason).toBeTruthy();
    expect(res.fallbackReason).toContain('/brand/missing.ttf');
    expect(res.typography.fontFile).toBe('/fonts/default.ttf');
    expect(res.typography.fontFamily).toBe(BRAND_DEFAULTS.captionFontFamily);
  });

  it('does not signal a fallback when no brand typography is defined', () => {
    const res = resolveTypography(undefined, { defaultFontFile: '/fonts/default.ttf', fontLoader: loadableFont });
    expect(res.fallbackApplied).toBe(false);
    expect(res.fallbackReason).toBeUndefined();
    expect(res.typography.fontFile).toBe('/fonts/default.ttf');
  });

  it('a font-load exception is treated as a failure and triggers fallback (never throws)', () => {
    const throwingLoader = () => {
      throw new Error('font engine exploded');
    };
    const res = resolveTypography(
      { fontFile: '/brand/x.ttf' },
      { defaultFontFile: '/fonts/default.ttf', fontLoader: throwingLoader },
    );
    expect(res.fallbackApplied).toBe(true);
    expect(res.typography.fontFile).toBe('/fonts/default.ttf');
  });

  it('renderCaptions surfaces the fallback indication and still runs (Req 11.8)', async () => {
    let executed: CaptionBurnInCommand | null = null;
    const runner: CaptionFfmpegRunner = async (cmd) => {
      executed = cmd;
    };
    const svc = new CaptionRendererService({
      defaultFontFile: '/fonts/default.ttf',
      fontLoader: unloadableFont,
      runner,
    });
    const request: RenderCaptionsRequest = {
      segments: baseSegments,
      presetKey: 'instagram_reel',
      inputPath: '/in.mp4',
      outputPath: '/out.mp4',
      dimensions: { width: 1080, height: 1920 },
      brandTypography: { fontFile: '/brand/missing.ttf' },
    };
    const result = await svc.renderCaptions(request);
    expect(result.typographyFallbackApplied).toBe(true);
    expect(result.typographyFallbackReason).toBeTruthy();
    expect(result.outputPath).toBe('/out.mp4');
    expect(executed).not.toBeNull();
    // The command references the default font, not the failed brand font.
    expect(result.command.videoFilter).toContain('/fonts/default.ttf');
    expect(result.command.videoFilter).not.toContain('/brand/missing.ttf');
  });
});

describe('buildCaptionBurnInCommand — layout-driven pure builder', () => {
  it('applies the contrast scrim box when the pure core applied a treatment (Req 11.6)', () => {
    const preset = PLATFORM_PRESETS.instagram_reel;
    // Force a low-contrast pairing so the pure core adds a scrim.
    const config = captionLayoutConfigFromPreset(preset, BRAND_DEFAULTS, {
      textColorHex: '#808080',
      backgroundColorHex: '#7F7F7F',
    });
    const captions = layoutCaptions([{ startMs: 0, endMs: 500, text: 'scrim me' }], config);
    const command = buildCaptionBurnInCommand({
      captions,
      typography: { fontFamily: 'Inter', fontFile: '/fonts/default.ttf', fontSizeFrac: 0.05, style: 'modern' },
      dimensions: { width: 1080, height: 1920 },
      inputPath: '/in.mp4',
      outputPath: '/out.mp4',
    });
    expect(command.videoFilter).toContain('box=1');
    expect(command.videoFilter).toContain('boxcolor=');
  });

  it('yields a valid identity filter for an empty caption set', () => {
    const command = buildCaptionBurnInCommand({
      captions: [],
      typography: { fontFamily: 'Inter', fontFile: '', fontSizeFrac: 0.05, style: 'modern' },
      dimensions: { width: 1080, height: 1920 },
      inputPath: '/in.mp4',
      outputPath: '/out.mp4',
    });
    expect(command.videoFilter).toBe('null');
  });
});
