/**
 * Highlight selection ("editorial brain") — pure (DB-free, IO-free, FFmpeg-free,
 * LLM-free) analysis core for the Deterministic_Editor's `highlight` operation
 * (automatic best-parts / highlight-reel selection).
 *
 * This module owns every highlight DECISION that can be made without touching
 * FFmpeg, a database, an AI provider, or a transcription service, so it is total
 * and property-testable. It mirrors the pattern of `auto-cut.logic.ts` and
 * `silence-removal.logic.ts`: the pure logic computes the keep-segments and the
 * deterministic engine merely RENDERS them (it never analyses). The highlight
 * render itself reuses the engine's existing `auto_cut` op — this module never
 * adds a new render engine.
 *
 * Given an audio energy envelope (the same `{ tMs, energy }` samples the auto-cut
 * pass consumes) PLUS speech spans (mapped from the reused transcription
 * service) and the source `durationMs`, it:
 *
 *   1. Tiles the timeline `[0, durationMs]` into fixed windows (`windowMs`,
 *      default 500 ms).
 *   2. Scores each window as normalized energy (average of the envelope samples
 *      falling in the window, divided by the envelope's peak) PLUS a speech bonus
 *      (+1.0 when the window overlaps any speech span). Windows that are both
 *      loud AND spoken score highest; a missing envelope leaves the energy term
 *      at 0 (speech-only scoring still works) and missing speech leaves the
 *      speech term at 0 (energy-only scoring still works).
 *   3. Greedily grows "keep" spans around the highest-scoring unused windows,
 *      expanding each into a contiguous span of at least `minSegmentMs` and into
 *      adjacent above-median windows, until the total kept duration reaches the
 *      target, `maxSegments` is hit, or no windows remain.
 *   4. Merges overlapping/adjacent selected spans, enforces `minSegmentMs`, sorts
 *      them CHRONOLOGICALLY (v1 never reorders shots), clamps everything within
 *      `[0, durationMs]`, and guarantees the result is non-overlapping.
 *
 * Determinism: every export is pure and total — the same input always yields the
 * same output, there is no randomness, no `Date`/`now`. No-Mock (Req 23): the
 * segments are DERIVED from the supplied real signal. When the clip is already
 * at/under the target, or there is no usable signal at all (a degenerate envelope
 * AND no speech), it returns the honest WHOLE CLIP rather than inventing a
 * highlight from nothing.
 */

import type { EnergySample } from './auto-cut.logic';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A detected speech span `[startMs, endMs)` (mapped from transcription). */
export interface HighlightSpeechSpan {
  startMs: number;
  endMs: number;
}

/** A single selected highlight segment `[startMs, endMs)` (ms). */
export interface HighlightSegment {
  startMs: number;
  endMs: number;
}

/** Tunable options for {@link computeHighlightSegments}. All optional. */
export interface HighlightOptions {
  /**
   * Desired total highlight duration (ms). Clamped to `[minSegmentMs, durationMs]`.
   * Default {@link DEFAULT_HIGHLIGHT_TARGET_MS}.
   */
  targetDurationMs?: number;
  /** Minimum length of any kept segment (ms). Default {@link DEFAULT_HIGHLIGHT_MIN_SEGMENT_MS}. */
  minSegmentMs?: number;
  /** Hard ceiling on the number of kept segments. Default {@link DEFAULT_HIGHLIGHT_MAX_SEGMENTS}. */
  maxSegments?: number;
  /** Timeline tiling window length (ms). Default {@link DEFAULT_HIGHLIGHT_WINDOW_MS}. */
  windowMs?: number;
}

/** The result of a highlight selection. */
export interface HighlightResult {
  /**
   * Ordered, non-overlapping highlight segments within `[0, durationMs]`. A
   * single whole-clip segment means the clip was already short enough or had no
   * usable signal (honest degrade, never a fabricated highlight). Empty ONLY when
   * `durationMs` is not a positive finite number.
   */
  segments: HighlightSegment[];
  /** Sum of the kept segment lengths (ms). */
  keptMs: number;
  /** `durationMs - keptMs` (ms). */
  droppedMs: number;
}

// ---------------------------------------------------------------------------
// Engine defaults (deterministic constants, not preset values)
// ---------------------------------------------------------------------------

/** Default desired highlight duration (ms). */
export const DEFAULT_HIGHLIGHT_TARGET_MS = 30000;
/** Default minimum kept-segment length (ms). */
export const DEFAULT_HIGHLIGHT_MIN_SEGMENT_MS = 1200;
/** Default hard ceiling on the number of kept segments. */
export const DEFAULT_HIGHLIGHT_MAX_SEGMENTS = 12;
/** Default timeline tiling window length (ms). */
export const DEFAULT_HIGHLIGHT_WINDOW_MS = 500;

// ---------------------------------------------------------------------------
// Numeric helpers (internal)
// ---------------------------------------------------------------------------

/** Is `value` a finite JS number (rejects NaN/±Infinity/non-number)? */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Is `value` a finite, strictly-positive number? */
function isPositive(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

/** Pick a positive numeric option, falling back to `fallback` when invalid. */
function positiveOr(value: number | undefined, fallback: number): number {
  return isPositive(value) ? (value as number) : fallback;
}

/** Clamp `value` into the inclusive `[lo, hi]` range. */
function clamp(value: number, lo: number, hi: number): number {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

// ---------------------------------------------------------------------------
// Highlight selection (pure)
// ---------------------------------------------------------------------------

/**
 * Compute deterministic highlight keep-segments from an energy envelope and/or
 * speech spans. PURE and total — never throws, never performs IO.
 *
 * Guarantees, for any input:
 *   - When `durationMs` is not a positive finite number, returns no segments
 *     (`keptMs === 0`, `droppedMs === 0`).
 *   - The returned segments are ORDERED chronologically, NON-OVERLAPPING, and
 *     every segment falls within `[0, durationMs]`.
 *   - `keptMs` is the sum of the segment lengths and `droppedMs === durationMs - keptMs`.
 *   - When the clip is already at/under the target, OR there is no usable signal
 *     at all (a degenerate envelope AND no speech spans), the result is the
 *     honest WHOLE CLIP `[{0, durationMs}]` — never a fabricated highlight
 *     (No-Mock, Req 23).
 *   - The number of segments never exceeds `maxSegments`.
 *   - Deterministic: identical inputs always produce identical output.
 */
export function computeHighlightSegments(
  envelope: readonly EnergySample[] | null | undefined,
  speechSpans: readonly HighlightSpeechSpan[] | null | undefined,
  durationMs: number,
  options: HighlightOptions = {},
): HighlightResult {
  // 1. Invalid duration → empty result.
  if (!isPositive(durationMs)) return { segments: [], keptMs: 0, droppedMs: 0 };

  const minSegmentMs = Math.min(
    positiveOr(options.minSegmentMs, DEFAULT_HIGHLIGHT_MIN_SEGMENT_MS),
    durationMs,
  );
  const windowMs = Math.max(1, Math.round(positiveOr(options.windowMs, DEFAULT_HIGHLIGHT_WINDOW_MS)));
  const maxSegments =
    Number.isInteger(options.maxSegments) && (options.maxSegments as number) >= 1
      ? (options.maxSegments as number)
      : DEFAULT_HIGHLIGHT_MAX_SEGMENTS;

  // 2. Target, clamped to [minSegmentMs, durationMs].
  const requestedTarget = positiveOr(options.targetDurationMs, DEFAULT_HIGHLIGHT_TARGET_MS);
  const target = clamp(requestedTarget, minSegmentMs, durationMs);

  const wholeClip: HighlightResult = {
    segments: [{ startMs: 0, endMs: durationMs }],
    keptMs: durationMs,
    droppedMs: 0,
  };

  // Clip already short enough — keep the whole thing (honest, nothing to trim).
  if (durationMs <= target) return wholeClip;

  // Sanitize the speech spans: finite, in-bounds, non-empty, ordered.
  const speech: HighlightSpeechSpan[] = (Array.isArray(speechSpans) ? speechSpans : [])
    .filter(
      (s): s is HighlightSpeechSpan =>
        !!s && isFiniteNumber(s.startMs) && isFiniteNumber(s.endMs) && s.endMs > s.startMs,
    )
    .map((s) => ({ startMs: Math.max(0, s.startMs), endMs: Math.min(durationMs, s.endMs) }))
    .filter((s) => s.endMs > s.startMs)
    .sort((a, b) => a.startMs - b.startMs);

  // Sanitize the envelope: finite, in-bounds, non-negative, ordered.
  const samples: EnergySample[] = (Array.isArray(envelope) ? envelope : [])
    .filter(
      (s): s is EnergySample =>
        !!s &&
        isFiniteNumber(s.tMs) &&
        isFiniteNumber(s.energy) &&
        s.tMs >= 0 &&
        s.tMs <= durationMs &&
        s.energy >= 0,
    )
    .map((s) => ({ tMs: s.tMs, energy: s.energy }))
    .sort((a, b) => a.tMs - b.tMs);

  // Does the energy envelope carry a USABLE (discriminating) signal? A flat or
  // all-zero envelope cannot rank windows, so it is treated as no energy signal.
  let maxEnergy = 0;
  let minEnergy = Number.POSITIVE_INFINITY;
  for (const s of samples) {
    if (s.energy > maxEnergy) maxEnergy = s.energy;
    if (s.energy < minEnergy) minEnergy = s.energy;
  }
  const hasEnergySignal = samples.length > 0 && maxEnergy > 0 && minEnergy < maxEnergy;
  const hasSpeechSignal = speech.length > 0;

  // 3. No usable signal at all → honest whole clip (never fabricate from nothing).
  if (!hasEnergySignal && !hasSpeechSignal) return wholeClip;

  // 4. Tile the timeline into fixed windows and score each one.
  const numWindows = Math.max(1, Math.ceil(durationMs / windowMs));
  const windowStart = (i: number): number => Math.min(durationMs, i * windowMs);
  const windowEnd = (i: number): number => Math.min(durationMs, (i + 1) * windowMs);

  const scores = new Array<number>(numWindows).fill(0);
  {
    // Accumulate energy per window in one pass over the samples.
    const energySum = new Array<number>(numWindows).fill(0);
    const energyCount = new Array<number>(numWindows).fill(0);
    for (const s of samples) {
      const idx = Math.min(numWindows - 1, Math.floor(s.tMs / windowMs));
      energySum[idx] += s.energy;
      energyCount[idx] += 1;
    }
    for (let i = 0; i < numWindows; i += 1) {
      const avg = energyCount[i] > 0 ? energySum[i] / energyCount[i] : 0;
      const energyComponent = maxEnergy > 0 ? avg / maxEnergy : 0;
      const speechBonus = speech.some((sp) => windowStart(i) < sp.endMs && sp.startMs < windowEnd(i))
        ? 1.0
        : 0;
      scores[i] = energyComponent + speechBonus;
    }
  }

  // Median score drives the "above-median" expansion.
  const median = medianOf(scores);

  // 5. Greedily grow keep spans around the highest-scoring unused windows.
  const used = new Array<boolean>(numWindows).fill(false);
  const rawSpans: HighlightSegment[] = [];
  let keptTotal = 0;

  while (rawSpans.length < maxSegments && keptTotal < target) {
    // Highest-scoring unused window (ties → earliest index).
    let seed = -1;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < numWindows; i += 1) {
      if (used[i]) continue;
      if (scores[i] > bestScore) {
        bestScore = scores[i];
        seed = i;
      }
    }
    if (seed < 0) break; // no windows left

    // Expand [lo, hi] to at least minSegmentMs, extending into adjacent
    // above-median windows while still under the global target.
    let lo = seed;
    let hi = seed;
    const spanMsOf = (): number => windowEnd(hi) - windowStart(lo);
    for (;;) {
      const canLeft = lo - 1 >= 0 && !used[lo - 1];
      const canRight = hi + 1 < numWindows && !used[hi + 1];
      if (!canLeft && !canRight) break;

      // Prefer the higher-scoring neighbour; ties prefer the right (later) side
      // so growth stays deterministic.
      const leftScore = canLeft ? scores[lo - 1] : Number.NEGATIVE_INFINITY;
      const rightScore = canRight ? scores[hi + 1] : Number.NEGATIVE_INFINITY;
      const goRight = canRight && (!canLeft || rightScore >= leftScore);
      const cand = goRight ? hi + 1 : lo - 1;

      const needMore = spanMsOf() < minSegmentMs;
      const aboveMedian = scores[cand] >= median;
      const withinTarget = keptTotal + spanMsOf() < target;
      // Extend when the span is still too short, or when the neighbour is
      // above-median and we have not yet reached the target overall.
      if (!needMore && !(aboveMedian && withinTarget)) break;

      if (goRight) hi = cand;
      else lo = cand;
    }

    for (let i = lo; i <= hi; i += 1) used[i] = true;

    const startMs = windowStart(lo);
    const endMs = windowEnd(hi);
    if (endMs - startMs >= minSegmentMs) {
      rawSpans.push({ startMs, endMs });
      keptTotal += endMs - startMs;
    }
    // Windows are marked used either way, so the loop always terminates.
  }

  // 6. Merge overlapping/adjacent spans, enforce minSegmentMs, sort chronologically.
  const ordered = rawSpans.slice().sort((a, b) => a.startMs - b.startMs);
  const merged: HighlightSegment[] = [];
  for (const span of ordered) {
    const last = merged[merged.length - 1];
    if (last && span.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, span.endMs);
    } else {
      merged.push({ startMs: clamp(span.startMs, 0, durationMs), endMs: clamp(span.endMs, 0, durationMs) });
    }
  }
  const enforced = merged.filter((s) => s.endMs - s.startMs >= minSegmentMs);

  // Nothing survived (couldn't build a real highlight) → honest whole clip.
  if (enforced.length === 0) return wholeClip;

  // 7. Return the ordered non-overlapping segments plus kept/dropped totals.
  let keptMs = 0;
  for (const s of enforced) keptMs += s.endMs - s.startMs;
  return { segments: enforced, keptMs, droppedMs: durationMs - keptMs };
}

/** Median of a numeric array (0 for empty). Pure and total. */
function medianOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
