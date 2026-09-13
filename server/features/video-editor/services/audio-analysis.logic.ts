/**
 * Audio & analysis well-formedness — pure (DB-free, IO-free) core for the
 * Video_Analysis_Service (Req 4.3, 4.5, 4.6).
 *
 * This module owns two decisions, both expressed as pure/total functions so they
 * can be property-tested without FFmpeg, a database, or any AI provider:
 *
 *   1. Silence classification (Req 4.5). Given a loudness curve, a time range is
 *      silence *if and only if* loudness stays below the configured loudness
 *      threshold (default −40 dB) continuously for at least the configured
 *      minimum duration (default 0.5 s / 500 ms). Both thresholds are read from
 *      the single-source `video-editor.config.ts` (`SILENCE_THRESHOLDS`) — this
 *      module hardcodes neither (Req 13.1).
 *
 *   2. Analysis well-formedness (Req 4.3, 4.6). Transcript segments, hook
 *      candidates, and important moments must be well-formed: `startMs < endMs`,
 *      in-bounds of the source duration, and (for scored moments) a normalized
 *      confidence in the closed interval [0.0, 1.0]. These predicates let the
 *      service reject or repair a malformed `VideoAnalysis` before marking it
 *      completed.
 *
 * All exports are pure and total: they never throw and never perform IO.
 */

import { SILENCE_THRESHOLDS, type SilenceThresholds } from '../config/video-editor.config';

// ---------------------------------------------------------------------------
// Shared timing types
// ---------------------------------------------------------------------------

/** A half-open time range on the source timeline, in milliseconds. */
export interface TimeRangeMs {
  /** Inclusive start on the source timeline (ms). */
  startMs: number;
  /** Exclusive end on the source timeline (ms); MUST be `> startMs`. */
  endMs: number;
}

/**
 * A single loudness measurement covering a contiguous slice of the source
 * timeline. A loudness curve is an ordered list of these frames; adjacent
 * silence is "continuous" only when frames abut (`prev.endMs === next.startMs`).
 */
export interface LoudnessFrame {
  /** Inclusive start of the measured slice (ms). */
  startMs: number;
  /** Exclusive end of the measured slice (ms); MUST be `> startMs`. */
  endMs: number;
  /** Measured loudness over the slice, in decibels (dB). */
  loudnessDb: number;
}

/** A transcript segment (Req 4.3). Timings in ms; text must be non-null. */
export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  /** Recognized speech text for the segment (non-null, Req 4.3). */
  text: string;
}

/**
 * A decision-support scored moment — a hook candidate or important moment
 * (Req 4.6). Timings in ms; `confidence` is normalized to [0.0, 1.0].
 */
export interface ScoredMoment {
  startMs: number;
  endMs: number;
  /** Normalized confidence in the closed interval [0.0, 1.0] (Req 4.6). */
  confidence: number;
}

// ---------------------------------------------------------------------------
// Numeric helpers
// ---------------------------------------------------------------------------

/** Is `value` a finite JS number (rejects NaN/±Infinity/non-number)? */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

// ---------------------------------------------------------------------------
// Silence classification (Req 4.5)
// ---------------------------------------------------------------------------

/**
 * Is a single frame below the silence loudness threshold? A frame counts toward
 * silence *iff* its loudness is strictly below the threshold (default −40 dB):
 * e.g. −50 dB (quieter) is below −40 dB and is silent (Req 4.5).
 */
export function isSilentFrame(frame: LoudnessFrame, thresholdDb: number): boolean {
  return isFiniteNumber(frame.loudnessDb) && frame.loudnessDb < thresholdDb;
}

/**
 * Classify the silence ranges in a loudness curve (Req 4.5).
 *
 * A time range is silence *if and only if* loudness stays below the configured
 * loudness threshold continuously for at least the configured minimum duration.
 * "Continuously" means an unbroken run of below-threshold frames that abut with
 * no time gap between them; a frame at/above threshold, or a gap between
 * below-threshold frames, ends the run. Runs whose total duration is at least
 * `minDurationMs` are returned as silence ranges, in timeline order.
 *
 * Thresholds default to the single-source config (`SILENCE_THRESHOLDS`); callers
 * MUST NOT pass hardcoded values (Req 13.1). Pure and total.
 *
 * @param frames Ordered loudness curve. Frames need not be pre-sorted; they are
 *   sorted by `startMs` defensively. Non-finite or zero/negative-length frames
 *   are ignored.
 * @param thresholds Loudness threshold (dB) and minimum duration (ms).
 */
export function classifySilence(
  frames: readonly LoudnessFrame[],
  thresholds: SilenceThresholds = SILENCE_THRESHOLDS,
): TimeRangeMs[] {
  const { thresholdDb, minDurationMs } = thresholds;

  // Keep only structurally valid frames, then order by start time so continuity
  // (abutting frames) is well-defined regardless of input ordering.
  const ordered = frames
    .filter(
      (f) =>
        isFiniteNumber(f.startMs) &&
        isFiniteNumber(f.endMs) &&
        f.endMs > f.startMs,
    )
    .slice()
    .sort((a, b) => a.startMs - b.startMs);

  const silences: TimeRangeMs[] = [];
  let runStart: number | null = null;
  let runEnd: number | null = null;

  const closeRun = () => {
    if (runStart !== null && runEnd !== null && runEnd - runStart >= minDurationMs) {
      silences.push({ startMs: runStart, endMs: runEnd });
    }
    runStart = null;
    runEnd = null;
  };

  for (const frame of ordered) {
    if (!isSilentFrame(frame, thresholdDb)) {
      // Loud frame breaks any open run.
      closeRun();
      continue;
    }

    if (runEnd !== null && frame.startMs === runEnd) {
      // Contiguous with the open silent run — extend it.
      runEnd = frame.endMs;
    } else {
      // A gap (or the first silent frame) starts a fresh run.
      closeRun();
      runStart = frame.startMs;
      runEnd = frame.endMs;
    }
  }
  closeRun();

  return silences;
}

// ---------------------------------------------------------------------------
// Timing / bounds / confidence predicates (Req 4.3, 4.6)
// ---------------------------------------------------------------------------

/**
 * Is `range` a well-formed non-empty timeline range: finite `startMs ≥ 0` and
 * finite `endMs > startMs` (Req 4.3, 4.6)?
 */
export function isValidTimeRange(range: TimeRangeMs): boolean {
  return (
    isFiniteNumber(range.startMs) &&
    isFiniteNumber(range.endMs) &&
    range.startMs >= 0 &&
    range.endMs > range.startMs
  );
}

/**
 * Is `range` well-formed AND fully within `[0, sourceDurationMs]` (Req 4.6)?
 * A non-positive/undefined source duration makes any range out-of-bounds.
 */
export function isInBounds(range: TimeRangeMs, sourceDurationMs: number): boolean {
  return (
    isValidTimeRange(range) &&
    isFiniteNumber(sourceDurationMs) &&
    sourceDurationMs > 0 &&
    range.endMs <= sourceDurationMs
  );
}

/** Is `value` a normalized confidence in the closed interval [0.0, 1.0] (Req 4.6)? */
export function isNormalizedConfidence(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

// ---------------------------------------------------------------------------
// Transcript segment well-formedness (Req 4.3)
// ---------------------------------------------------------------------------

/**
 * Is a transcript segment well-formed: `startMs < endMs` (with `startMs ≥ 0`)
 * and non-null string `text` (Req 4.3)? Text may be empty but MUST be a string.
 */
export function isWellFormedTranscriptSegment(segment: TranscriptSegment): boolean {
  return isValidTimeRange(segment) && typeof segment.text === 'string';
}

/**
 * Return the indices of every malformed transcript segment (Req 4.3). An empty
 * array means every segment is well-formed.
 */
export function findMalformedTranscriptSegments(
  segments: readonly TranscriptSegment[],
): number[] {
  const bad: number[] = [];
  segments.forEach((segment, index) => {
    if (!isWellFormedTranscriptSegment(segment)) bad.push(index);
  });
  return bad;
}

// ---------------------------------------------------------------------------
// Scored-moment (hook candidate / important moment) well-formedness (Req 4.6)
// ---------------------------------------------------------------------------

/**
 * Is a scored moment (hook candidate or important moment) well-formed:
 * `startMs < endMs`, in-bounds of the source duration, and a normalized
 * confidence in [0.0, 1.0] (Req 4.6)?
 */
export function isWellFormedScoredMoment(
  moment: ScoredMoment,
  sourceDurationMs: number,
): boolean {
  return isInBounds(moment, sourceDurationMs) && isNormalizedConfidence(moment.confidence);
}

/**
 * Return the indices of every malformed scored moment (Req 4.6). An empty array
 * means every moment is well-formed and in-bounds.
 */
export function findMalformedScoredMoments(
  moments: readonly ScoredMoment[],
  sourceDurationMs: number,
): number[] {
  const bad: number[] = [];
  moments.forEach((moment, index) => {
    if (!isWellFormedScoredMoment(moment, sourceDurationMs)) bad.push(index);
  });
  return bad;
}

// ---------------------------------------------------------------------------
// Aggregate analysis timing well-formedness (Req 4.3, 4.6)
// ---------------------------------------------------------------------------

/** Decision-support timing inputs to validate against a source duration. */
export interface AnalysisTiming {
  transcript: readonly TranscriptSegment[];
  hookCandidates: readonly ScoredMoment[];
  importantMoments: readonly ScoredMoment[];
}

/**
 * Are all transcript segments, hook candidates, and important moments
 * well-formed and in-bounds of the source duration (Req 4.3, 4.6)? Pure/total —
 * the service calls this before marking a `VideoAnalysis` completed.
 */
export function isWellFormedAnalysisTiming(
  timing: AnalysisTiming,
  sourceDurationMs: number,
): boolean {
  return (
    findMalformedTranscriptSegments(timing.transcript).length === 0 &&
    findMalformedScoredMoments(timing.hookCandidates, sourceDurationMs).length === 0 &&
    findMalformedScoredMoments(timing.importantMoments, sourceDurationMs).length === 0
  );
}
