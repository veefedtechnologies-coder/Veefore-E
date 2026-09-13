/**
 * Caption_Renderer — pure (DB-free, IO-free, FFmpeg-free) layout core for the
 * Video_Editor captions (Req 11.1, 11.2, 11.4, 11.5, 11.6).
 *
 * The service-side Caption_Renderer burns captions into video with FFmpeg, but
 * every *decision* about a caption — which timing granularity to use, how to
 * wrap the text, where to place the box within the platform's safe area, and how
 * to guarantee legibility — is made here, as pure/total functions, so they can be
 * property-tested without a database, an encoder, or a font engine.
 *
 * This module owns four decisions:
 *
 *   1. Timing granularity (Req 11.1, 11.2). When a segment carries usable
 *      word-level timing, captions are emitted per word (word-level). When it
 *      does not, the segment/phrase-level timing is used instead — caption
 *      generation NEVER fails or throws because word timing is missing.
 *
 *   2. Line wrapping (Req 11.5). Text is wrapped so that NO rendered line exceeds
 *      the preset's configured maximum characters-per-line. A single token longer
 *      than the limit is hard-split so the invariant always holds.
 *
 *   3. Safe-area placement (Req 11.4). Each caption's complete bounding box is
 *      positioned so it falls ENTIRELY within the target Platform_Preset's safe
 *      area (fractional insets from `video-editor.config.ts`), anchored by the
 *      preset's caption placement (top/center/bottom).
 *
 *   4. Contrast treatment (Req 11.6). A contrast treatment between the caption
 *      text and its immediate background is applied so the text-to-background
 *      contrast ratio is at least the configured minimum (default 4.5:1 from
 *      `BrandDefaults.minContrastRatio`). The treatment keeps the text color and
 *      adds a scrim background chosen to guarantee the ratio.
 *
 * Every threshold (safe area, max chars-per-line, placement, min contrast ratio)
 * is read from the single-source `video-editor.config.ts` via the caller-supplied
 * `CaptionLayoutConfig`; this module hardcodes none of them (Req 13.1). The only
 * local constants are font-agnostic box-estimation heuristics, not preset values.
 *
 * All exports are pure and total: they never throw and never perform IO.
 */

import {
  BRAND_DEFAULTS,
  type BrandDefaults,
  type CaptionPlacement,
  type PlatformPreset,
  type SafeAreaInsets,
} from '../config/video-editor.config';

// ---------------------------------------------------------------------------
// Input timing types (Req 11.1, 11.2)
// ---------------------------------------------------------------------------

/** A single word with its own timing (word-level caption input, Req 11.1). */
export interface CaptionWord {
  /** Inclusive start on the source timeline (ms). */
  startMs: number;
  /** Exclusive end on the source timeline (ms); MUST be `> startMs`. */
  endMs: number;
  /** The word text (non-empty after trimming). */
  text: string;
}

/**
 * A transcript/caption segment (phrase-level timing) that MAY carry word-level
 * timing. When `words` is present and usable, captions are emitted per word;
 * otherwise the segment's own timing is used (Req 11.1, 11.2).
 */
export interface CaptionSegment {
  /** Inclusive start on the source timeline (ms). */
  startMs: number;
  /** Exclusive end on the source timeline (ms); MUST be `> startMs`. */
  endMs: number;
  /** The segment/phrase text. */
  text: string;
  /** Optional per-word timing; when usable, drives word-level captions. */
  words?: CaptionWord[];
}

/** Which timing granularity a caption cue was generated from (Req 11.1, 11.2). */
export type CaptionTimingLevel = 'word' | 'segment';

/** A resolved caption cue: a piece of text with a concrete timing and level. */
export interface CaptionCue {
  startMs: number;
  endMs: number;
  text: string;
  level: CaptionTimingLevel;
}

// ---------------------------------------------------------------------------
// Output layout types
// ---------------------------------------------------------------------------

/**
 * A caption bounding box expressed as fractions (0..1) of the frame. `xFrac`/
 * `yFrac` are the top-left origin; `widthFrac`/`heightFrac` are the extent. The
 * box is guaranteed to fall entirely within the preset safe area (Req 11.4).
 */
export interface CaptionBoundingBox {
  xFrac: number;
  yFrac: number;
  widthFrac: number;
  heightFrac: number;
}

/** The applied contrast treatment and its resulting ratio (Req 11.6). */
export interface ContrastTreatment {
  /** Final caption text color (hex `#RRGGBB`). Preserved from input. */
  textColorHex: string;
  /** Final immediate-background/scrim color behind the text (hex `#RRGGBB`). */
  backgroundColorHex: string;
  /** Resulting text-to-background contrast ratio (≥ configured minimum). */
  contrastRatio: number;
  /** Whether a treatment (scrim) was added to reach the minimum ratio. */
  treatmentApplied: boolean;
}

/** A fully laid-out caption ready for deterministic burn-in. */
export interface LaidOutCaption {
  startMs: number;
  endMs: number;
  level: CaptionTimingLevel;
  /** Wrapped lines, each ≤ `maxCharsPerLine` characters (Req 11.5). */
  lines: string[];
  /** Box entirely within the preset safe area (Req 11.4). */
  boundingBox: CaptionBoundingBox;
  /** Contrast treatment yielding ≥ minimum ratio (Req 11.6). */
  contrast: ContrastTreatment;
}

/**
 * Everything the layout core needs, sourced from the single-source config
 * (`PlatformPreset.safeArea`, `PlatformPreset.caption`, `BrandDefaults`). Build
 * one with `captionLayoutConfigFromPreset` so preset/brand values flow from the
 * single source (Req 13.1).
 */
export interface CaptionLayoutConfig {
  /** Preset safe-area insets (Req 11.4). */
  safeArea: SafeAreaInsets;
  /** Preset maximum characters per rendered line (Req 11.5). */
  maxCharsPerLine: number;
  /** Preset caption vertical anchor within the safe area (Req 11.4). */
  placement: CaptionPlacement;
  /** Minimum text-to-background contrast ratio (Req 11.6). */
  minContrastRatio: number;
  /** Caption text color (hex `#RRGGBB`). */
  textColorHex: string;
  /** Estimated immediate-background color behind the text (hex `#RRGGBB`). */
  backgroundColorHex: string;
}

// ---------------------------------------------------------------------------
// Box-estimation heuristics (font-agnostic; NOT preset values)
// ---------------------------------------------------------------------------

/**
 * Approximate fraction of frame WIDTH occupied by one caption character. Used
 * only to estimate the box extent; the box is always clamped inside the safe
 * area, so this heuristic can never push text outside it (Req 11.4).
 */
const APPROX_CHAR_WIDTH_FRAC = 0.028;

/** Approximate fraction of frame HEIGHT occupied by one caption line. */
const APPROX_LINE_HEIGHT_FRAC = 0.06;

// ---------------------------------------------------------------------------
// Numeric / string helpers
// ---------------------------------------------------------------------------

/** Is `value` a finite JS number (rejects NaN/±Infinity/non-number)? */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Clamp `value` into the closed interval `[lo, hi]` (assumes `lo ≤ hi`). */
function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

// ---------------------------------------------------------------------------
// Timing granularity selection (Req 11.1, 11.2)
// ---------------------------------------------------------------------------

/** Is a word structurally usable: finite `startMs ≥ 0`, `endMs > startMs`, non-empty text? */
export function isUsableWord(word: CaptionWord): boolean {
  return (
    isFiniteNumber(word?.startMs) &&
    isFiniteNumber(word?.endMs) &&
    word.startMs >= 0 &&
    word.endMs > word.startMs &&
    typeof word.text === 'string' &&
    word.text.trim().length > 0
  );
}

/** Is a segment's timeline range structurally valid: finite `startMs ≥ 0`, `endMs > startMs`? */
function hasValidSegmentRange(segment: CaptionSegment): boolean {
  return (
    isFiniteNumber(segment?.startMs) &&
    isFiniteNumber(segment?.endMs) &&
    segment.startMs >= 0 &&
    segment.endMs > segment.startMs
  );
}

/**
 * Does a segment carry usable word-level timing (Req 11.1)? True iff it has a
 * non-empty `words` array in which every word is structurally usable. When this
 * is false the segment/phrase-level timing is used instead (Req 11.2).
 */
export function hasUsableWordTiming(segment: CaptionSegment): boolean {
  return (
    Array.isArray(segment?.words) &&
    segment.words.length > 0 &&
    segment.words.every(isUsableWord)
  );
}

/**
 * Resolve caption cues from segments, choosing timing granularity per segment
 * (Req 11.1, 11.2). A segment with usable word-level timing yields one cue per
 * word (`level: 'word'`); otherwise it yields a single segment-level cue
 * (`level: 'segment'`) when its own range and text are usable.
 *
 * This NEVER throws and NEVER fails: a segment missing word timing simply falls
 * back to segment-level, and a structurally invalid segment is skipped rather
 * than aborting caption generation (Req 11.2). Pure and total.
 */
export function buildCaptionCues(segments: readonly CaptionSegment[]): CaptionCue[] {
  const cues: CaptionCue[] = [];
  if (!Array.isArray(segments)) return cues;

  for (const segment of segments) {
    if (!segment) continue;

    if (hasUsableWordTiming(segment)) {
      for (const word of segment.words as CaptionWord[]) {
        cues.push({
          startMs: word.startMs,
          endMs: word.endMs,
          text: word.text.trim(),
          level: 'word',
        });
      }
      continue;
    }

    // Fallback to segment/phrase-level timing rather than failing (Req 11.2).
    if (hasValidSegmentRange(segment) && typeof segment.text === 'string' && segment.text.trim().length > 0) {
      cues.push({
        startMs: segment.startMs,
        endMs: segment.endMs,
        text: segment.text.trim(),
        level: 'segment',
      });
    }
  }

  return cues;
}

// ---------------------------------------------------------------------------
// Line wrapping (Req 11.5)
// ---------------------------------------------------------------------------

/**
 * Wrap `text` so that NO produced line exceeds `maxCharsPerLine` characters
 * (Req 11.5). Words are packed greedily onto lines; a single token longer than
 * the limit is hard-split into chunks of at most `maxCharsPerLine` characters so
 * the invariant holds for every returned line.
 *
 * A non-positive `maxCharsPerLine` is treated as 1 defensively. Empty/whitespace
 * text yields an empty array. Pure and total.
 */
export function wrapText(text: string, maxCharsPerLine: number): string[] {
  const limit = Number.isInteger(maxCharsPerLine) && maxCharsPerLine > 0 ? maxCharsPerLine : 1;
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (trimmed.length === 0) return [];

  const tokens = trimmed.split(/\s+/).filter((t) => t.length > 0);
  const lines: string[] = [];
  let current = '';

  const pushCurrent = () => {
    if (current.length > 0) {
      lines.push(current);
      current = '';
    }
  };

  for (const token of tokens) {
    // Hard-split a token that cannot fit on any line by itself.
    if (token.length > limit) {
      pushCurrent();
      for (let i = 0; i < token.length; i += limit) {
        lines.push(token.slice(i, i + limit));
      }
      continue;
    }

    if (current.length === 0) {
      current = token;
    } else if (current.length + 1 + token.length <= limit) {
      current = `${current} ${token}`;
    } else {
      pushCurrent();
      current = token;
    }
  }
  pushCurrent();

  return lines;
}

// ---------------------------------------------------------------------------
// Safe-area placement (Req 11.4)
// ---------------------------------------------------------------------------

/**
 * Compute a caption bounding box that falls ENTIRELY within the preset safe area
 * (Req 11.4). The box is sized from the wrapped line content (longest line and
 * line count) using the font-agnostic heuristics, then clamped to the safe
 * region so it can never exceed it. It is centered horizontally and anchored
 * vertically by `placement`.
 *
 * Returns a zero-size box at the safe-area origin when the content is empty or
 * the safe area leaves no room. Pure and total.
 */
export function placeInSafeArea(
  lines: readonly string[],
  safeArea: SafeAreaInsets,
  placement: CaptionPlacement,
): CaptionBoundingBox {
  // Resolve the safe region as fractional bounds, defending against malformed insets.
  const insetTop = clamp(isFiniteNumber(safeArea?.top) ? safeArea.top : 0, 0, 1);
  const insetBottom = clamp(isFiniteNumber(safeArea?.bottom) ? safeArea.bottom : 0, 0, 1);
  const insetLeft = clamp(isFiniteNumber(safeArea?.left) ? safeArea.left : 0, 0, 1);
  const insetRight = clamp(isFiniteNumber(safeArea?.right) ? safeArea.right : 0, 0, 1);

  const safeLeft = insetLeft;
  const safeTop = insetTop;
  const availWidth = Math.max(0, 1 - insetLeft - insetRight);
  const availHeight = Math.max(0, 1 - insetTop - insetBottom);

  const lineCount = lines.length;
  const longestLine = lines.reduce((max, line) => Math.max(max, line.length), 0);

  if (lineCount === 0 || longestLine === 0 || availWidth === 0 || availHeight === 0) {
    return { xFrac: safeLeft, yFrac: safeTop, widthFrac: 0, heightFrac: 0 };
  }

  // Estimate the desired extent, then clamp into the available safe region so the
  // box is always fully contained (Req 11.4).
  const widthFrac = clamp(longestLine * APPROX_CHAR_WIDTH_FRAC, 0, availWidth);
  const heightFrac = clamp(lineCount * APPROX_LINE_HEIGHT_FRAC, 0, availHeight);

  // Center horizontally within the safe region.
  const xFrac = clamp(safeLeft + (availWidth - widthFrac) / 2, safeLeft, safeLeft + availWidth - widthFrac);

  // Anchor vertically by placement, clamped so the box stays inside the safe region.
  const safeBottomEdge = safeTop + availHeight;
  let yFrac: number;
  switch (placement) {
    case 'top':
      yFrac = safeTop;
      break;
    case 'bottom':
      yFrac = safeBottomEdge - heightFrac;
      break;
    case 'center':
    default:
      yFrac = safeTop + (availHeight - heightFrac) / 2;
      break;
  }
  yFrac = clamp(yFrac, safeTop, safeBottomEdge - heightFrac);

  return { xFrac, yFrac, widthFrac, heightFrac };
}

// ---------------------------------------------------------------------------
// Contrast treatment (Req 11.6) — WCAG relative luminance & contrast ratio
// ---------------------------------------------------------------------------

/**
 * Parse a `#RGB` or `#RRGGBB` hex color into `[r, g, b]` (0..255). Returns
 * `null` for anything unparseable so callers can fall back deterministically.
 */
export function parseHexColor(hex: string): [number, number, number] | null {
  if (typeof hex !== 'string') return null;
  const match = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) return null;

  let body = match[1];
  if (body.length === 3) {
    body = body
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const r = parseInt(body.slice(0, 2), 16);
  const g = parseInt(body.slice(2, 4), 16);
  const b = parseInt(body.slice(4, 6), 16);
  return [r, g, b];
}

/** WCAG per-channel linearization for relative luminance. */
function linearizeChannel(channel8bit: number): number {
  const c = channel8bit / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * WCAG relative luminance (0..1) of an `#RRGGBB` color. An unparseable color is
 * treated as black (luminance 0) so the function is total.
 */
export function relativeLuminance(hex: string): number {
  const rgb = parseHexColor(hex) ?? [0, 0, 0];
  const [r, g, b] = rgb;
  return 0.2126 * linearizeChannel(r) + 0.7152 * linearizeChannel(g) + 0.0722 * linearizeChannel(b);
}

/**
 * WCAG text-to-background contrast ratio (1..21) between two `#RRGGBB` colors
 * (Req 11.6). Pure and total.
 */
export function contrastRatio(foregroundHex: string, backgroundHex: string): number {
  const l1 = relativeLuminance(foregroundHex);
  const l2 = relativeLuminance(backgroundHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const BLACK_HEX = '#000000';
const WHITE_HEX = '#FFFFFF';

/**
 * Apply a contrast treatment guaranteeing the text-to-background ratio is at
 * least `minContrastRatio` (Req 11.6). If the original text/background already
 * meet the minimum, no treatment is applied. Otherwise the text color is kept
 * and a scrim background (black or white — whichever maximizes contrast against
 * the text) is added; a scrim of the higher-contrast polarity ALWAYS yields at
 * least 4.5:1 for any text color, so the guarantee holds.
 *
 * Pure and total: unparseable colors are handled by the total luminance helper.
 */
export function ensureContrast(
  textColorHex: string,
  backgroundColorHex: string,
  minContrastRatio: number,
): ContrastTreatment {
  const minRatio = isFiniteNumber(minContrastRatio) && minContrastRatio > 1 ? minContrastRatio : 4.5;

  const originalRatio = contrastRatio(textColorHex, backgroundColorHex);
  if (originalRatio >= minRatio) {
    return {
      textColorHex,
      backgroundColorHex,
      contrastRatio: originalRatio,
      treatmentApplied: false,
    };
  }

  // Keep the text color; add the scrim that maximizes contrast against the text.
  const blackRatio = contrastRatio(textColorHex, BLACK_HEX);
  const whiteRatio = contrastRatio(textColorHex, WHITE_HEX);
  const scrimHex = blackRatio >= whiteRatio ? BLACK_HEX : WHITE_HEX;
  const treatedRatio = Math.max(blackRatio, whiteRatio);

  return {
    textColorHex,
    backgroundColorHex: scrimHex,
    contrastRatio: treatedRatio,
    treatmentApplied: true,
  };
}

// ---------------------------------------------------------------------------
// Config assembly from the single-source preset + brand (Req 13.1)
// ---------------------------------------------------------------------------

/**
 * Build a `CaptionLayoutConfig` from a Platform_Preset and brand defaults, so
 * safe area, max chars-per-line, placement, and minimum contrast all flow from
 * the single-source config (Req 13.1). Real workspace brand colors, when known,
 * may be passed via `colors` to override the brand defaults.
 */
export function captionLayoutConfigFromPreset(
  preset: PlatformPreset,
  brand: BrandDefaults = BRAND_DEFAULTS,
  colors?: { textColorHex?: string; backgroundColorHex?: string },
): CaptionLayoutConfig {
  return {
    safeArea: preset.safeArea,
    maxCharsPerLine: preset.caption.maxCharsPerLine,
    placement: preset.caption.placement,
    minContrastRatio: brand.minContrastRatio,
    textColorHex: colors?.textColorHex ?? brand.secondaryColorHex,
    backgroundColorHex: colors?.backgroundColorHex ?? brand.primaryColorHex,
  };
}

// ---------------------------------------------------------------------------
// Full layout pipeline (Req 11.1, 11.2, 11.4, 11.5, 11.6)
// ---------------------------------------------------------------------------

/**
 * Lay out a single caption cue: wrap its text to the max line length (Req 11.5),
 * place its box within the safe area (Req 11.4), and apply the contrast treatment
 * (Req 11.6). Pure and total.
 */
export function layoutCaptionCue(cue: CaptionCue, config: CaptionLayoutConfig): LaidOutCaption {
  const lines = wrapText(cue.text, config.maxCharsPerLine);
  const boundingBox = placeInSafeArea(lines, config.safeArea, config.placement);
  const contrast = ensureContrast(config.textColorHex, config.backgroundColorHex, config.minContrastRatio);

  return {
    startMs: cue.startMs,
    endMs: cue.endMs,
    level: cue.level,
    lines,
    boundingBox,
    contrast,
  };
}

/**
 * Full caption layout: resolve timing granularity from the segments (Req 11.1,
 * 11.2), then wrap, place, and contrast-treat every cue (Req 11.4, 11.5, 11.6).
 *
 * Never fails: missing word timing falls back to segment-level and malformed
 * segments are skipped rather than aborting generation (Req 11.2). Every returned
 * caption has lines within the max length, a box inside the safe area, and a
 * contrast ratio at least the configured minimum. Pure and total.
 */
export function layoutCaptions(
  segments: readonly CaptionSegment[],
  config: CaptionLayoutConfig,
): LaidOutCaption[] {
  return buildCaptionCues(segments).map((cue) => layoutCaptionCue(cue, config));
}
