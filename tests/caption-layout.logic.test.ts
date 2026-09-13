/**
 * Property test for the Caption_Renderer layout pure core (task 13.2).
 *
 * Framework: vitest + fast-check, >=100 runs.
 *
 * Property under test (design.md):
 *  - Property 29: Rendered captions respect safe areas, line length, and contrast
 *      Validates: Requirements 11.4, 11.5, 11.6
 *
 * *For any* caption set rendered for a target `Platform_Preset`, each caption's
 * complete text bounding box falls entirely within the preset safe areas
 * (Req 11.4), no rendered line exceeds the configured maximum characters-per-line
 * (Req 11.5), and the text-to-immediate-background contrast ratio is at least the
 * configured minimum — 4.5:1 (Req 11.6).
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  layoutCaptions,
  captionLayoutConfigFromPreset,
  contrastRatio,
  type CaptionSegment,
  type CaptionWord,
} from '../server/features/video-editor/services/caption-layout.logic';
import {
  PLATFORM_PRESETS,
  BRAND_DEFAULTS,
  listPlatformPresetKeys,
  type SafeAreaInsets,
} from '../server/features/video-editor/config/video-editor.config';

const RUNS = 200;

// Floating-point slack for fractional-geometry containment checks.
const EPS = 1e-9;

// ---------------------------------------------------------------------------
// Smart generators constrained to the caption input space
// ---------------------------------------------------------------------------

/** Every configured platform preset key (drives per-preset safe area / wrap / placement). */
const presetKeyArb: fc.Arbitrary<string> = fc.constantFrom(...listPlatformPresetKeys());

/**
 * Caption text: a mix of ordinary words plus some tokens LONGER than any preset's
 * max-chars-per-line, so the hard-split wrapping path is exercised too.
 */
const wordTextArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 4, arbitrary: fc.string({ minLength: 1, maxLength: 12 }).filter((s) => s.trim().length > 0) },
  // A long unbreakable token (>= any preset maxCharsPerLine of 24..42).
  { weight: 1, arbitrary: fc.integer({ min: 40, max: 120 }).map((n) => 'x'.repeat(n)) },
);

/** A structurally-usable word with monotone timing on the source timeline. */
function wordArb(): fc.Arbitrary<CaptionWord> {
  return fc
    .record({
      startMs: fc.integer({ min: 0, max: 600_000 }),
      dur: fc.integer({ min: 1, max: 4_000 }),
      text: wordTextArb,
    })
    .map(({ startMs, dur, text }) => ({ startMs, endMs: startMs + dur, text }));
}

/** A phrase built by joining several word texts (used for segment-level fallback). */
const phraseArb: fc.Arbitrary<string> = fc
  .array(wordTextArb, { minLength: 1, maxLength: 8 })
  .map((ws) => ws.join(' '));

/**
 * A caption segment that EITHER carries usable word-level timing (word-level path,
 * Req 11.1) OR omits it (segment/phrase-level fallback path, Req 11.2). Also emits
 * some structurally-degenerate segments (empty text / no words) to confirm the
 * layout never produces a violating caption regardless of input shape.
 */
const segmentArb: fc.Arbitrary<CaptionSegment> = fc
  .record({
    startMs: fc.integer({ min: 0, max: 600_000 }),
    dur: fc.integer({ min: 1, max: 8_000 }),
    text: phraseArb,
    withWords: fc.boolean(),
    words: fc.array(wordArb(), { minLength: 0, maxLength: 6 }),
  })
  .map(({ startMs, dur, text, withWords, words }) => {
    const seg: CaptionSegment = { startMs, endMs: startMs + dur, text };
    if (withWords && words.length > 0) seg.words = words;
    return seg;
  });

const segmentsArb: fc.Arbitrary<CaptionSegment[]> = fc.array(segmentArb, {
  minLength: 0,
  maxLength: 12,
});

/** Optional arbitrary caption/background colors (hex) to stress the contrast guarantee. */
const hexColorArb: fc.Arbitrary<string> = fc
  .tuple(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }))
  .map(([r, g, b]) => `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`);

const colorsArb = fc.option(
  fc.record({ textColorHex: hexColorArb, backgroundColorHex: hexColorArb }),
  { nil: undefined },
);

// ---------------------------------------------------------------------------
// Containment helper
// ---------------------------------------------------------------------------

/** True iff the box lies entirely within the safe region bounded by the insets (Req 11.4). */
function boxWithinSafeArea(
  box: { xFrac: number; yFrac: number; widthFrac: number; heightFrac: number },
  safe: SafeAreaInsets,
): boolean {
  const safeLeft = safe.left;
  const safeTop = safe.top;
  const safeRight = 1 - safe.right;
  const safeBottom = 1 - safe.bottom;
  return (
    box.xFrac >= safeLeft - EPS &&
    box.yFrac >= safeTop - EPS &&
    box.xFrac + box.widthFrac <= safeRight + EPS &&
    box.yFrac + box.heightFrac <= safeBottom + EPS &&
    box.widthFrac >= -EPS &&
    box.heightFrac >= -EPS
  );
}

// ---------------------------------------------------------------------------
// Property 29: Rendered captions respect safe areas, line length, and contrast.
// Validates: Requirements 11.4, 11.5, 11.6
// ---------------------------------------------------------------------------

describe('Property 29: rendered captions respect safe areas, line length, and contrast', () => {
  it('every wrapped line <= preset maxCharsPerLine (Req 11.5)', () => {
    fc.assert(
      fc.property(presetKeyArb, segmentsArb, colorsArb, (presetKey, segments, colors) => {
        const preset = PLATFORM_PRESETS[presetKey];
        const config = captionLayoutConfigFromPreset(preset, BRAND_DEFAULTS, colors);
        const captions = layoutCaptions(segments, config);

        for (const caption of captions) {
          for (const line of caption.lines) {
            expect(line.length).toBeLessThanOrEqual(preset.caption.maxCharsPerLine);
          }
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('every caption bounding box lies entirely within the preset safe area (Req 11.4)', () => {
    fc.assert(
      fc.property(presetKeyArb, segmentsArb, colorsArb, (presetKey, segments, colors) => {
        const preset = PLATFORM_PRESETS[presetKey];
        const config = captionLayoutConfigFromPreset(preset, BRAND_DEFAULTS, colors);
        const captions = layoutCaptions(segments, config);

        for (const caption of captions) {
          expect(boxWithinSafeArea(caption.boundingBox, preset.safeArea)).toBe(true);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('every caption contrast ratio is at least the configured minimum, 4.5:1 (Req 11.6)', () => {
    fc.assert(
      fc.property(presetKeyArb, segmentsArb, colorsArb, (presetKey, segments, colors) => {
        const preset = PLATFORM_PRESETS[presetKey];
        const config = captionLayoutConfigFromPreset(preset, BRAND_DEFAULTS, colors);
        const captions = layoutCaptions(segments, config);

        for (const caption of captions) {
          expect(caption.contrast.contrastRatio).toBeGreaterThanOrEqual(config.minContrastRatio - EPS);
          expect(config.minContrastRatio).toBeGreaterThanOrEqual(4.5);
          // The reported ratio matches an independent WCAG recomputation of the treated colors.
          const recomputed = contrastRatio(
            caption.contrast.textColorHex,
            caption.contrast.backgroundColorHex,
          );
          expect(caption.contrast.contrastRatio).toBeCloseTo(recomputed, 6);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('all three invariants hold simultaneously for every caption across every preset (Req 11.4, 11.5, 11.6)', () => {
    fc.assert(
      fc.property(presetKeyArb, segmentsArb, colorsArb, (presetKey, segments, colors) => {
        const preset = PLATFORM_PRESETS[presetKey];
        const config = captionLayoutConfigFromPreset(preset, BRAND_DEFAULTS, colors);
        const captions = layoutCaptions(segments, config);

        for (const caption of captions) {
          // Line length (Req 11.5)
          for (const line of caption.lines) {
            expect(line.length).toBeLessThanOrEqual(preset.caption.maxCharsPerLine);
          }
          // Safe area (Req 11.4)
          expect(boxWithinSafeArea(caption.boundingBox, preset.safeArea)).toBe(true);
          // Contrast (Req 11.6)
          expect(caption.contrast.contrastRatio).toBeGreaterThanOrEqual(config.minContrastRatio - EPS);
        }
      }),
      { numRuns: RUNS },
    );
  });
});
