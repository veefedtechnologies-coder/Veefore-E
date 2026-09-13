/**
 * Auto-cut (energy/beat-synced montage) — pure (DB-free, IO-free, FFmpeg-free)
 * analysis core for the Deterministic_Editor's `auto_cut` operation
 * (Increment 2 "professional editing").
 *
 * This module owns every auto-cut DECISION that can be made without touching
 * FFmpeg, a database, or an AI provider, so it is total and property-testable.
 * It mirrors the pattern of `silence-removal.logic.ts`: the pure logic computes
 * the keep-segments, and the deterministic engine merely RENDERS them (it never
 * analyses).
 *
 * Given an audio energy/amplitude envelope sampled at a fixed interval — an
 * ordered array of `{ tMs, energy }` samples — plus the source `durationMs` and
 * options (min segment length, max segments, target segment length), it:
 *
 *   1. Derives a peak/onset threshold from the envelope itself
 *      (`mean + k·stddev`), so louder/percussive moments stand out relative to
 *      the clip's own dynamics rather than an absolute magic number.
 *   2. Detects beat boundaries at RISING onsets (a sample whose energy crosses
 *      from at/below the threshold to above it) that are spaced at least
 *      `minGapMs` from the previous boundary AND leave at least `minSegmentMs`
 *      of runway before the start and after the end of the clip.
 *   3. Caps the number of cuts at `maxSegments` by keeping the STRONGEST
 *      boundaries (highest energy, ties broken by earliest time), then restores
 *      time order.
 *   4. Tiles the whole timeline `[0, durationMs]` into ordered, contiguous,
 *      non-overlapping keep-segments (`segment[i].endMs === segment[i+1].startMs`)
 *      — a montage/tightening that never drops content, so the output covers the
 *      full clip (any visual "punch" comes from the optional render-side zoom,
 *      not from discarding footage).
 *
 * Determinism: every export is pure and total — the same input always yields the
 * same output, there is no randomness, no `Date`/`now`, and boundaries are
 * rounded to whole milliseconds so numeric formatting is fixed. No-Mock
 * (Req 23): the segments are DERIVED from the supplied real signal; a degenerate
 * or flat envelope yields a single whole-clip segment (i.e. "no beats found"),
 * never invented cut points.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One point on the audio energy/amplitude envelope. */
export interface EnergySample {
  /** Sample time on the source timeline, in milliseconds (`>= 0`). */
  tMs: number;
  /** Non-negative energy/amplitude at that time (e.g. windowed RMS). */
  energy: number;
}

/** A single keep-segment `[startMs, endMs)` of the montage (ms). */
export interface AutoCutSegment {
  startMs: number;
  endMs: number;
}

/** Tunable options for {@link computeAutoCutSegments}. All optional. */
export interface AutoCutOptions {
  /**
   * Minimum length of any kept segment (ms). Boundaries are never placed closer
   * than this to the clip start/end, and (via `minGapMs`) never closer than this
   * to each other unless overridden. Default {@link DEFAULT_MIN_SEGMENT_MS}.
   */
  minSegmentMs?: number;
  /**
   * Hard ceiling on the number of kept segments (i.e. `cuts + 1`). When omitted,
   * it is derived from `targetSegmentMs` (bounded by {@link DEFAULT_MAX_SEGMENTS}).
   */
  maxSegments?: number;
  /**
   * Desired average segment length (ms) used to derive `maxSegments` when that
   * is not given explicitly. Default {@link DEFAULT_TARGET_SEGMENT_MS}.
   */
  targetSegmentMs?: number;
  /**
   * Minimum spacing between two detected boundaries (ms). Defaults to
   * `minSegmentMs` so consecutive above-threshold samples cannot produce a burst
   * of tiny segments.
   */
  minGapMs?: number;
  /**
   * Threshold sensitivity: a sample is a peak when its energy exceeds
   * `mean + thresholdK·stddev` of the envelope. Higher = fewer, stronger cuts.
   * Default {@link DEFAULT_THRESHOLD_K}.
   */
  thresholdK?: number;
}

/** The result of an auto-cut analysis. */
export interface AutoCutResult {
  /**
   * Ordered, contiguous, non-overlapping keep-segments tiling `[0, durationMs]`.
   * Empty ONLY when `durationMs` is not a positive finite number. A single
   * whole-clip segment means no usable beat boundaries were found (honest
   * "no cuts", not a fabricated montage).
   */
  segments: AutoCutSegment[];
  /** The interior cut boundaries (ms), excluding `0` and `durationMs`. */
  boundariesMs: number[];
}

// ---------------------------------------------------------------------------
// Engine defaults (deterministic constants, not preset values)
// ---------------------------------------------------------------------------

/** Default minimum kept-segment length (ms). */
export const DEFAULT_MIN_SEGMENT_MS = 600;
/** Default desired average segment length (ms), used to derive `maxSegments`. */
export const DEFAULT_TARGET_SEGMENT_MS = 1500;
/** Default hard ceiling on the number of kept segments. */
export const DEFAULT_MAX_SEGMENTS = 24;
/** Default peak threshold sensitivity (stddev multiplier). */
export const DEFAULT_THRESHOLD_K = 1.0;

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

// ---------------------------------------------------------------------------
// Envelope computation (pure) — RMS per fixed window
// ---------------------------------------------------------------------------

/**
 * Compute a deterministic energy envelope as the root-mean-square (RMS) of the
 * raw mono PCM samples over fixed windows of `windowMs`. PURE and total — never
 * throws, never performs IO. The audio-envelope IO service decodes the source to
 * raw PCM and calls this to obtain the {@link EnergySample} array the auto-cut
 * logic consumes, so the RMS windowing itself stays unit-testable.
 *
 * The absolute RMS scale is irrelevant: the peak threshold is derived from the
 * envelope's own mean/stddev, so any consistent amplitude scale works.
 *
 * @param samples    Mono PCM samples (e.g. an `Int16Array`, or any numeric list).
 * @param sampleRate Samples per second (must be positive).
 * @param windowMs   Window length in ms (must be positive; default 50 ms).
 */
export function computeRmsEnvelope(
  samples: ArrayLike<number> | null | undefined,
  sampleRate: number,
  windowMs = 50,
): EnergySample[] {
  if (!samples || typeof samples.length !== 'number' || samples.length === 0) return [];
  if (!isPositive(sampleRate) || !isPositive(windowMs)) return [];

  const perWindow = Math.max(1, Math.round((sampleRate * windowMs) / 1000));
  const total = samples.length;
  const envelope: EnergySample[] = [];

  for (let start = 0, windowIndex = 0; start < total; start += perWindow, windowIndex += 1) {
    const end = Math.min(start + perWindow, total);
    let sumSquares = 0;
    let count = 0;
    for (let i = start; i < end; i += 1) {
      const v = samples[i];
      if (isFiniteNumber(v)) {
        sumSquares += v * v;
        count += 1;
      }
    }
    const rms = count > 0 ? Math.sqrt(sumSquares / count) : 0;
    envelope.push({ tMs: Math.round(windowIndex * windowMs), energy: rms });
  }

  return envelope;
}

// ---------------------------------------------------------------------------
// Auto-cut segmentation (pure)
// ---------------------------------------------------------------------------

/** A candidate boundary carrying its detected energy (for the max-cuts cap). */
interface Boundary {
  tMs: number;
  energy: number;
}

/**
 * Compute deterministic beat-synced keep-segments from an energy envelope
 * (Increment 2). PURE and total — never throws, never performs IO.
 *
 * Guarantees, for any input:
 *   - When `durationMs` is not a positive finite number, returns no segments.
 *   - Otherwise the returned segments are ORDERED, CONTIGUOUS, and
 *     NON-OVERLAPPING, and TILE the whole `[0, durationMs]` timeline exactly
 *     (`segments[0].startMs === 0`, `last.endMs === durationMs`, and every
 *     `segments[i].endMs === segments[i+1].startMs`).
 *   - Every kept segment is at least `minSegmentMs` long (a defensive merge
 *     absorbs any degenerate short piece).
 *   - The number of segments never exceeds `maxSegments`.
 *   - A flat/degenerate envelope (fewer than 3 usable samples, or no rising
 *     onset above the derived threshold) yields a SINGLE whole-clip segment —
 *     an honest "no beats found", never a fabricated cut (No-Mock, Req 23).
 *   - Deterministic: identical inputs always produce identical output.
 */
export function computeAutoCutSegments(
  envelope: readonly EnergySample[] | null | undefined,
  durationMs: number,
  options: AutoCutOptions = {},
): AutoCutResult {
  if (!isPositive(durationMs)) return { segments: [], boundariesMs: [] };

  const minSegmentMs = positiveOr(options.minSegmentMs, DEFAULT_MIN_SEGMENT_MS);
  const targetSegmentMs = positiveOr(options.targetSegmentMs, DEFAULT_TARGET_SEGMENT_MS);
  const minGapMs = Math.max(positiveOr(options.minGapMs, minSegmentMs), 1);
  const thresholdK = isFiniteNumber(options.thresholdK) ? options.thresholdK : DEFAULT_THRESHOLD_K;
  const maxSegments =
    Number.isInteger(options.maxSegments) && (options.maxSegments as number) >= 1
      ? (options.maxSegments as number)
      : Math.min(DEFAULT_MAX_SEGMENTS, Math.max(1, Math.floor(durationMs / targetSegmentMs)));

  // A whole-clip segment is the honest fallback when nothing can be detected.
  const wholeClip: AutoCutResult = {
    segments: [{ startMs: 0, endMs: durationMs }],
    boundariesMs: [],
  };

  // Sanitize the envelope: keep finite, in-bounds, non-negative samples, ordered.
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
    .map((s) => ({ tMs: Math.round(s.tMs), energy: s.energy }))
    .sort((a, b) => a.tMs - b.tMs);

  // Too little signal, or the clip is too short to hold even two min-segments.
  if (samples.length < 3 || durationMs < minSegmentMs * 2) return wholeClip;

  // Threshold derived from the envelope's own dynamics: mean + k·stddev.
  const n = samples.length;
  let sum = 0;
  for (const s of samples) sum += s.energy;
  const mean = sum / n;
  let variance = 0;
  for (const s of samples) variance += (s.energy - mean) * (s.energy - mean);
  variance /= n;
  const stddev = Math.sqrt(variance);
  const threshold = mean + thresholdK * stddev;

  // A flat envelope (no spread) has no peaks to sync to — honest whole clip.
  if (!(stddev > 0)) return wholeClip;

  // Detect RISING onsets above the threshold, spaced and inset by the minimums.
  const boundaries: Boundary[] = [];
  let prevAbove = samples[0].energy > threshold;
  let lastBoundaryMs = 0;
  for (let i = 1; i < n; i += 1) {
    const cur = samples[i];
    const above = cur.energy > threshold;
    const rising = above && !prevAbove;
    prevAbove = above;
    if (!rising) continue;
    if (cur.tMs - lastBoundaryMs < minGapMs) continue;
    if (cur.tMs < minSegmentMs) continue;
    if (durationMs - cur.tMs < minSegmentMs) continue;
    boundaries.push({ tMs: cur.tMs, energy: cur.energy });
    lastBoundaryMs = cur.tMs;
  }

  if (boundaries.length === 0) return wholeClip;

  // Cap the number of cuts: keep the STRONGEST boundaries (energy desc, ties by
  // earliest time), then restore chronological order. `maxSegments` segments
  // means at most `maxSegments - 1` interior cuts.
  let kept = boundaries;
  const maxCuts = Math.max(0, maxSegments - 1);
  if (boundaries.length > maxCuts) {
    kept = [...boundaries]
      .sort((a, b) => (b.energy !== a.energy ? b.energy - a.energy : a.tMs - b.tMs))
      .slice(0, maxCuts)
      .sort((a, b) => a.tMs - b.tMs);
  }

  if (kept.length === 0) return wholeClip;

  // Tile the timeline into contiguous keep-segments at the cut points.
  const cutPoints = kept.map((b) => b.tMs);
  const raw: AutoCutSegment[] = [];
  let start = 0;
  for (const cp of cutPoints) {
    if (cp > start && cp < durationMs) {
      raw.push({ startMs: start, endMs: cp });
      start = cp;
    }
  }
  raw.push({ startMs: start, endMs: durationMs });

  // Defensive merge: absorb any segment shorter than `minSegmentMs` into its
  // neighbour so coverage stays exact and the min invariant always holds. (The
  // detection constraints already guarantee this for well-formed input; this
  // keeps the guarantee total.)
  const merged = mergeShortSegments(raw, minSegmentMs, durationMs);

  const boundariesMs: number[] = [];
  for (let i = 0; i < merged.length - 1; i += 1) boundariesMs.push(merged[i].endMs);

  return { segments: merged, boundariesMs };
}

/**
 * Merge any segment shorter than `minSegmentMs` into the previous segment (or,
 * for the first segment, into the next), preserving exact `[0, durationMs]`
 * tiling. Total and pure. A single-segment input is returned unchanged.
 */
function mergeShortSegments(
  segments: readonly AutoCutSegment[],
  minSegmentMs: number,
  durationMs: number,
): AutoCutSegment[] {
  if (segments.length <= 1) return segments.slice();
  const out: AutoCutSegment[] = [];
  for (const seg of segments) {
    const last = out[out.length - 1];
    if (last && seg.endMs - seg.startMs < minSegmentMs) {
      // Too-short piece: extend the previous segment to swallow it.
      last.endMs = seg.endMs;
    } else {
      out.push({ startMs: seg.startMs, endMs: seg.endMs });
    }
  }
  // If the FIRST segment ended up too short (nothing before it to merge into),
  // fold it forward into the second.
  if (out.length >= 2 && out[0].endMs - out[0].startMs < minSegmentMs) {
    out[1].startMs = out[0].startMs;
    out.shift();
  }
  // Guarantee exact coverage of the whole timeline.
  if (out.length > 0) {
    out[0].startMs = 0;
    out[out.length - 1].endMs = durationMs;
  }
  return out;
}
