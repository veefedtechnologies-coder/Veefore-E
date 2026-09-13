/**
 * Audio processing — pure (DB-free, IO-free) core for the Deterministic_Editor's
 * audio operations (task 11.2, Req 8.5, 12.1, 12.2, 12.3, 12.4).
 *
 * This module owns every audio decision that can be made without touching
 * FFmpeg, a database, or an AI provider, so each is total and property-testable:
 *
 *   1. Silence-removal planning (Req 8.5, 12.2, 12.3). Given the silence and
 *      speech segments reported by the Video_Analysis_Service and whether the
 *      user *explicitly* requested silence removal, decide which ranges may be
 *      removed and which are kept. Removal is restricted to analysis-classified
 *      silence, every detected speech segment is kept present and uncut, NOTHING
 *      is removed unless removal was explicitly requested, and any requested
 *      removal range that overlaps a detected speech segment blocks the whole
 *      operation with an error (leaving the source unmodified).
 *
 *   2. Loudness normalization targeting (Req 12.1). Build the deterministic
 *      `loudnorm` filter string from the single-source audio targets and provide
 *      a pure predicate that answers whether a measured integrated loudness /
 *      true-peak pair is within the configured tolerance and ceiling.
 *
 *   3. Voice preservation (Req 12.4). Decide whether the original voice audio
 *      must be kept byte-for-byte identical: it must, unless the user explicitly
 *      requested a voice change.
 *
 * All tunable values (loudness target, tolerance, true-peak ceiling, silence
 * thresholds) come from the single-source `video-editor.config.ts` (Req 13.1);
 * this module hardcodes none of them. Every export is pure and total: it never
 * throws and never performs IO.
 */

import {
  AUDIO_TARGETS,
  type AudioTargets,
} from '../config/video-editor.config';
import type { TimeRangeMs } from './audio-analysis.logic';

// ---------------------------------------------------------------------------
// Numeric / range helpers (internal)
// ---------------------------------------------------------------------------

/** Is `value` a finite JS number (rejects NaN/±Infinity/non-number)? */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Is `range` a well-formed non-empty half-open range: finite `0 ≤ start < end`? */
function isValidRange(range: TimeRangeMs): boolean {
  return (
    isFiniteNumber(range.startMs) &&
    isFiniteNumber(range.endMs) &&
    range.startMs >= 0 &&
    range.endMs > range.startMs
  );
}

/**
 * Do two half-open ranges `[a.start, a.end)` and `[b.start, b.end)` overlap on a
 * region of positive length? Ranges that merely touch at a boundary (e.g.
 * `[0,5)` and `[5,10)`) do NOT overlap.
 */
function overlaps(a: TimeRangeMs, b: TimeRangeMs): boolean {
  return a.startMs < b.endMs && b.startMs < a.endMs;
}

/**
 * Keep only structurally valid ranges, clamp them to `[0, durationMs]`, drop any
 * that become empty, and return them ordered by start time. Defensive so callers
 * may pass unsorted, out-of-bounds, or malformed analysis segments.
 */
function normalizeRanges(
  ranges: readonly TimeRangeMs[],
  durationMs: number,
): TimeRangeMs[] {
  const out: TimeRangeMs[] = [];
  for (const r of ranges) {
    if (!isValidRange(r)) continue;
    const startMs = Math.max(0, r.startMs);
    const endMs = Math.min(durationMs, r.endMs);
    if (endMs > startMs) out.push({ startMs, endMs });
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

/** Merge a set of ranges into a minimal ordered set of non-overlapping ranges. */
function mergeRanges(ranges: readonly TimeRangeMs[]): TimeRangeMs[] {
  const sorted = ranges.slice().sort((a, b) => a.startMs - b.startMs);
  const merged: TimeRangeMs[] = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, r.endMs);
    } else {
      merged.push({ startMs: r.startMs, endMs: r.endMs });
    }
  }
  return merged;
}

/** Intersect each range in `a` with each range in `b`; return merged pieces. */
function intersectRanges(
  a: readonly TimeRangeMs[],
  b: readonly TimeRangeMs[],
): TimeRangeMs[] {
  const pieces: TimeRangeMs[] = [];
  for (const ra of a) {
    for (const rb of b) {
      const startMs = Math.max(ra.startMs, rb.startMs);
      const endMs = Math.min(ra.endMs, rb.endMs);
      if (endMs > startMs) pieces.push({ startMs, endMs });
    }
  }
  return mergeRanges(pieces);
}

/**
 * The complement of `removed` within `[0, durationMs]`: the ordered kept ranges
 * that remain after removing every range in `removed`. `removed` need not be
 * pre-merged.
 */
function complementRanges(
  removed: readonly TimeRangeMs[],
  durationMs: number,
): TimeRangeMs[] {
  const merged = mergeRanges(normalizeRanges(removed, durationMs));
  const kept: TimeRangeMs[] = [];
  let cursor = 0;
  for (const r of merged) {
    if (r.startMs > cursor) kept.push({ startMs: cursor, endMs: r.startMs });
    cursor = Math.max(cursor, r.endMs);
  }
  if (cursor < durationMs) kept.push({ startMs: cursor, endMs: durationMs });
  return kept;
}

// ---------------------------------------------------------------------------
// Silence-removal planning (Req 8.5, 12.2, 12.3)
// ---------------------------------------------------------------------------

/** A detected speech segment that MUST remain present and uncut (Req 12.2). */
export type SpeechSegment = TimeRangeMs;

/** A silence segment classified by the Video_Analysis_Service (Req 8.5). */
export type SilenceSegment = TimeRangeMs;

/** Stable error codes for a blocked / invalid silence-removal request. */
export const SILENCE_REMOVAL_INVALID_DURATION = 'SILENCE_REMOVAL_INVALID_DURATION';
export const SILENCE_REMOVAL_SPEECH_CONFLICT = 'SILENCE_REMOVAL_SPEECH_CONFLICT';

/** Input to {@link planSilenceRemoval}. */
export interface SilenceRemovalRequest {
  /**
   * TRUE iff the user *explicitly* requested silence removal. When false, the
   * plan removes nothing (Req 12.2: "SHALL NOT remove any silence segment when
   * silence removal was not explicitly requested").
   */
  requested: boolean;
  /**
   * Silence segments identified by the Video_Analysis_Service audio features —
   * the ONLY ranges eligible for removal (Req 8.5, 12.2).
   */
  silenceSegments: readonly SilenceSegment[];
  /**
   * Detected speech segments that must remain present and uncut in the output
   * (Req 12.2). Any requested removal overlapping one of these blocks the
   * operation (Req 12.3).
   */
  speechSegments: readonly SpeechSegment[];
  /** Total source audio duration in milliseconds. */
  sourceDurationMs: number;
  /**
   * Optional explicit ranges the user asked to clear. When omitted, the removal
   * target is every analysis-classified silence segment. When provided, removal
   * is the intersection of these ranges with analysis silence (Req 12.2), and a
   * requested range overlapping speech blocks the whole operation (Req 12.3).
   */
  requestedRanges?: readonly TimeRangeMs[];
}

/** A successful silence-removal plan. */
export interface SilenceRemovalOk {
  ok: true;
  /** Ranges to remove — analysis-classified silence only, merged & ordered. */
  removeRanges: TimeRangeMs[];
  /** Ranges to keep — the complement of `removeRanges` within the source. */
  keepRanges: TimeRangeMs[];
}

/** A blocked / invalid silence-removal plan (Req 12.3). */
export interface SilenceRemovalBlocked {
  ok: false;
  /** Stable error code identifying the block reason. */
  errorCode: string;
  /** Human-readable explanation of why the removal did not occur. */
  message: string;
  /** The requested ranges that conflicted with speech (empty for other errors). */
  conflicts: TimeRangeMs[];
}

/** The result of planning a silence removal — either a plan or a block. */
export type SilenceRemovalPlan = SilenceRemovalOk | SilenceRemovalBlocked;

/**
 * Plan a silence removal purely (Req 8.5, 12.2, 12.3).
 *
 * Guarantees, for any input:
 *   - Nothing is removed unless `requested` is true (Req 12.2).
 *   - Only ranges classified as silence by the analysis are removed; when the
 *     caller supplies `requestedRanges`, the removal is the intersection of
 *     those ranges with the analysis silence (Req 8.5, 12.2).
 *   - Every detected speech segment stays fully inside a kept range — i.e. no
 *     speech is ever cut (Req 12.2).
 *   - If any requested removal range overlaps a detected speech segment, the
 *     whole operation is blocked with `SILENCE_REMOVAL_SPEECH_CONFLICT` and no
 *     removal is planned, so the caller leaves the source audio unmodified
 *     (Req 12.3).
 *
 * Pure and total — never throws, never performs IO.
 */
export function planSilenceRemoval(request: SilenceRemovalRequest): SilenceRemovalPlan {
  const { requested, sourceDurationMs } = request;

  if (!isFiniteNumber(sourceDurationMs) || sourceDurationMs <= 0) {
    return {
      ok: false,
      errorCode: SILENCE_REMOVAL_INVALID_DURATION,
      message: `Invalid source duration: expected a positive number, got ${String(sourceDurationMs)}`,
      conflicts: [],
    };
  }

  const speech = mergeRanges(normalizeRanges(request.speechSegments, sourceDurationMs));
  const silence = mergeRanges(normalizeRanges(request.silenceSegments, sourceDurationMs));

  // Req 12.2: never remove anything unless removal was explicitly requested.
  if (!requested) {
    return {
      ok: true,
      removeRanges: [],
      keepRanges: [{ startMs: 0, endMs: sourceDurationMs }],
    };
  }

  // Determine the removal target.
  let removeRanges: TimeRangeMs[];
  if (request.requestedRanges && request.requestedRanges.length > 0) {
    const requestedNorm = mergeRanges(
      normalizeRanges(request.requestedRanges, sourceDurationMs),
    );

    // Req 12.3: any requested range overlapping speech blocks the whole
    // operation and leaves the source unmodified.
    const conflicts = requestedNorm.filter((r) => speech.some((s) => overlaps(r, s)));
    if (conflicts.length > 0) {
      return {
        ok: false,
        errorCode: SILENCE_REMOVAL_SPEECH_CONFLICT,
        message:
          'Requested silence-removal range overlaps a detected speech segment; ' +
          'removal was blocked and the source audio left unmodified.',
        conflicts,
      };
    }

    // Req 8.5 / 12.2: remove ONLY analysis-classified silence within the request.
    removeRanges = intersectRanges(requestedNorm, silence);
  } else {
    // No explicit ranges: the target is all analysis-classified silence.
    removeRanges = silence;
  }

  // Safety invariant (Req 12.2): removal must never touch a speech segment. This
  // cannot happen for well-formed analysis silence (silence excludes speech by
  // definition), but we enforce it defensively so a malformed analysis can never
  // cut speech.
  const speechConflicts = removeRanges.filter((r) => speech.some((s) => overlaps(r, s)));
  if (speechConflicts.length > 0) {
    return {
      ok: false,
      errorCode: SILENCE_REMOVAL_SPEECH_CONFLICT,
      message:
        'A silence range to remove overlaps a detected speech segment; removal ' +
        'was blocked and the source audio left unmodified.',
      conflicts: speechConflicts,
    };
  }

  const keepRanges = complementRanges(removeRanges, sourceDurationMs);
  return { ok: true, removeRanges, keepRanges };
}

/**
 * Is every speech segment fully contained within the kept ranges (i.e. present
 * and uncut, Req 12.2)? A helper the service and property tests use to assert
 * the plan preserves speech. Pure and total.
 */
export function speechFullyPreserved(
  speechSegments: readonly SpeechSegment[],
  keepRanges: readonly TimeRangeMs[],
  sourceDurationMs: number,
): boolean {
  const speech = normalizeRanges(speechSegments, sourceDurationMs);
  const keep = mergeRanges(normalizeRanges(keepRanges, sourceDurationMs));
  return speech.every((s) =>
    keep.some((k) => k.startMs <= s.startMs && k.endMs >= s.endMs),
  );
}

// ---------------------------------------------------------------------------
// Loudness normalization (Req 12.1)
// ---------------------------------------------------------------------------

/** A measured loudness result to validate against the configured targets. */
export interface LoudnessMeasurement {
  /** Measured integrated loudness in LUFS. */
  integratedLufs: number;
  /** Measured true-peak level in dBTP. */
  truePeakDbtp: number;
}

/**
 * Is a measured loudness within the configured tolerance and under the ceiling
 * (Req 12.1)? TRUE iff the integrated loudness is within ±`loudnessToleranceLu`
 * of the target AND the true-peak level does not exceed `truePeakCeilingDbtp`.
 * Targets come from the single-source config (Req 13.1). Pure and total.
 */
export function isLoudnessWithinTolerance(
  measurement: LoudnessMeasurement,
  targets: AudioTargets = AUDIO_TARGETS,
): boolean {
  if (
    !isFiniteNumber(measurement.integratedLufs) ||
    !isFiniteNumber(measurement.truePeakDbtp)
  ) {
    return false;
  }
  const withinTolerance =
    Math.abs(measurement.integratedLufs - targets.integratedLoudnessLufs) <=
    targets.loudnessToleranceLu;
  const underCeiling = measurement.truePeakDbtp <= targets.truePeakCeilingDbtp;
  return withinTolerance && underCeiling;
}

/**
 * Build the deterministic FFmpeg `loudnorm` filter string that normalizes audio
 * to the configured integrated-loudness target with the configured true-peak
 * ceiling (Req 12.1). Deterministic: identical targets always yield the identical
 * filter. `LRA` (loudness range) is a fixed, standard-broadcast engine constant.
 */
export function buildLoudnormFilter(targets: AudioTargets = AUDIO_TARGETS): string {
  const i = targets.integratedLoudnessLufs.toFixed(1);
  const tp = targets.truePeakCeilingDbtp.toFixed(1);
  // LRA is a deterministic engine constant, not a tunable preset value.
  return `loudnorm=I=${i}:TP=${tp}:LRA=11`;
}

// ---------------------------------------------------------------------------
// Voice preservation (Req 12.4)
// ---------------------------------------------------------------------------

/**
 * A description of an audio operation's intent, used to decide whether the
 * original voice audio must remain byte-identical (Req 12.4).
 */
export interface AudioProcessingIntent {
  /**
   * TRUE iff the user explicitly requested a change to the voice itself
   * (e.g. voice replacement, pitch/timbre change, revoicing). The ONLY thing
   * that permits altering the original voice bytes (Req 12.4).
   */
  voiceChangeRequested: boolean;
}

/**
 * Must the original voice audio be kept byte-for-byte identical to the source
 * (Req 12.4)? TRUE unless the user explicitly requested a voice change. When
 * true, the service MUST stream-copy the source audio (`-c:a copy`) rather than
 * re-encoding it, so the voice bytes are preserved exactly. Pure and total.
 */
export function mustPreserveOriginalVoice(intent: AudioProcessingIntent): boolean {
  return intent.voiceChangeRequested !== true;
}
