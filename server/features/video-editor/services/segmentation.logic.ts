/**
 * Generative segmentation — pure (DB-free, IO-free) core for the
 * Generative_Editor (Req 9.1–9.6).
 *
 * A generative visual edit (e.g. removing a background object) affects only a
 * bounded region of a possibly much longer video. Before any provider is
 * invoked, this module decides *what* to send:
 *
 *   1. Extraction (Req 9.1). Given the candidate source ranges (e.g. scenes /
 *      clips), keep every range that OVERLAPS the affected region and exclude
 *      every range that does NOT — the unaffected footage is never sent.
 *
 *   2. Bounded, gap-free partition (Req 9.2, 9.5, 9.6). Partition the affected
 *      region into contiguous sub-ranges that collectively cover it with no
 *      gaps and no overlaps, where every sub-range's duration is `≤`
 *      `caps.editableInputSeconds.max` (the provider's editable-input capability
 *      recorded in the Provider_Capability_Registry). A request that would
 *      exceed that capability is split; when it cannot be split within the
 *      constraints below it is flagged for reroute — an oversized range is
 *      NEVER emitted (Req 9.6).
 *
 *   3. Cut-point discipline (Req 9.3, 9.4). A cut between sub-ranges is placed
 *      ONLY at a detected scene boundary from the `VideoAnalysis`, and NEVER
 *      inside a range where a subject is continuously tracked or inside a
 *      continuous audio utterance.
 *
 * All timings are in milliseconds on the source timeline; the capability bound
 * is expressed in seconds (as stored in the registry) and converted here. The
 * capability-bounds types are reused from `provider-capability-registry.logic`
 * and the range/validation primitives from `audio-analysis.logic`, so this
 * module introduces no duplicate shapes. Every export is pure and total: it
 * never throws and never performs IO — matching the `*.logic.ts` convention and
 * enabling property-based testing (Property 22).
 */

import {
  isValidTimeRange,
  type TimeRangeMs,
} from './audio-analysis.logic';
import type {
  DurationBounds,
  VideoModelCapabilities,
} from './provider-capability-registry.logic';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The subset of provider capability metadata segmentation needs: the editable
 * input duration bounds (seconds) recorded in the Provider_Capability_Registry
 * (Req 9.2, 9.5, 9.6). Reuses the registry's `editableInputSeconds` shape so the
 * bound is never hardcoded or duplicated (Req 7.3).
 */
export type SegmentationCapabilityBounds = Pick<VideoModelCapabilities, 'editableInputSeconds'>;

/** Re-export for callers that thread bounds around without the whole record. */
export type { DurationBounds };

/**
 * Inputs to a generative segmentation decision. All timings are milliseconds on
 * the source timeline.
 */
export interface SegmentationInput {
  /** The bounded region the generative edit affects (Req 9.1). */
  affectedRegion: TimeRangeMs;
  /** Selected provider's editable-input capability bounds (Req 9.2, 9.5, 9.6). */
  caps: SegmentationCapabilityBounds;
  /**
   * Detected scene-boundary timestamps (ms) from the `VideoAnalysis`. A cut may
   * be placed ONLY at one of these boundaries (Req 9.3). Order is irrelevant;
   * duplicates and out-of-region values are ignored.
   */
  sceneBoundariesMs: readonly number[];
  /**
   * Ranges over which a subject is continuously tracked by the `VideoAnalysis`.
   * A cut is never placed strictly inside one of these (Req 9.4).
   */
  trackedSubjects?: readonly TimeRangeMs[];
  /**
   * Continuous audio utterances identified by the `VideoAnalysis`. A cut is
   * never placed strictly inside one of these (Req 9.4).
   */
  utterances?: readonly TimeRangeMs[];
  /**
   * Optional candidate source ranges (e.g. scenes / clips) to classify by
   * overlap with the affected region (Req 9.1). When provided, the result
   * reports which overlap (extracted) and which do not (excluded).
   */
  candidateRanges?: readonly TimeRangeMs[];
}

/** Why a segmentation could not produce a bounded, gap-free partition. */
export type SegmentationFailureReason =
  /** The affected region or capability bound was malformed. */
  | 'INVALID_INPUT'
  /**
   * The region exceeds the capability bound and no scene boundary permits a cut
   * within the bound (all candidate cuts are absent or fall inside a tracked
   * subject / continuous utterance). The edit must be rerouted to an alternative
   * pipeline; an oversized request is never sent (Req 9.6).
   */
  | 'REROUTE_REQUIRED';

/** A successful segmentation decision. */
export interface SegmentationSuccess {
  ok: true;
  /**
   * Contiguous, gap-free, overlap-free sub-ranges covering exactly the affected
   * region, each with duration `≤` the capability bound (Req 9.2, 9.5).
   */
  subRanges: TimeRangeMs[];
  /** Candidate ranges overlapping the affected region (Req 9.1). */
  extracted: TimeRangeMs[];
  /** Candidate ranges NOT overlapping the affected region — excluded (Req 9.1). */
  excluded: TimeRangeMs[];
}

/** A rejected segmentation — nothing is emitted and no provider is invoked. */
export interface SegmentationFailure {
  ok: false;
  reason: SegmentationFailureReason;
  message: string;
}

/** Result of {@link segmentGenerativeEdit}. */
export type SegmentationResult = SegmentationSuccess | SegmentationFailure;

// ---------------------------------------------------------------------------
// Numeric helpers
// ---------------------------------------------------------------------------

/** Is `value` a finite JS number (rejects NaN/±Infinity/non-number)? */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Are the capability bounds well-formed with a strictly-positive maximum? */
function isValidBounds(bounds: DurationBounds | undefined | null): bounds is DurationBounds {
  return (
    !!bounds &&
    isFiniteNumber(bounds.min) &&
    isFiniteNumber(bounds.max) &&
    bounds.min >= 0 &&
    bounds.max >= bounds.min &&
    bounds.max > 0
  );
}

// ---------------------------------------------------------------------------
// Overlap & extraction (Req 9.1)
// ---------------------------------------------------------------------------

/**
 * Do two half-open ranges `[startMs, endMs)` overlap? Two ranges overlap iff
 * each starts before the other ends. Ranges that merely touch at an endpoint
 * (`a.endMs === b.startMs`) do NOT overlap. Malformed ranges never overlap.
 */
export function rangesOverlap(a: TimeRangeMs, b: TimeRangeMs): boolean {
  if (!isValidTimeRange(a) || !isValidTimeRange(b)) return false;
  return a.startMs < b.endMs && b.startMs < a.endMs;
}

/**
 * Partition `candidates` by whether they overlap the affected `region` (Req 9.1).
 * Every overlapping range is extracted; every non-overlapping range is excluded.
 * Malformed candidate ranges are treated as non-overlapping (excluded), so they
 * are never sent to a provider. Input order is preserved within each bucket.
 */
export function extractOverlappingRanges(
  candidates: readonly TimeRangeMs[],
  region: TimeRangeMs,
): { extracted: TimeRangeMs[]; excluded: TimeRangeMs[] } {
  const extracted: TimeRangeMs[] = [];
  const excluded: TimeRangeMs[] = [];
  for (const candidate of candidates) {
    if (rangesOverlap(candidate, region)) extracted.push(candidate);
    else excluded.push(candidate);
  }
  return { extracted, excluded };
}

// ---------------------------------------------------------------------------
// Cut-point discipline (Req 9.3, 9.4)
// ---------------------------------------------------------------------------

/**
 * Is `pointMs` strictly inside any of the given protected intervals — a range
 * where a subject is continuously tracked or a continuous audio utterance
 * (Req 9.4)? A point exactly on an interval boundary is NOT "inside" it, so a
 * cut may legitimately fall on the edge of a subject/utterance.
 */
export function isCutForbidden(
  pointMs: number,
  protectedIntervals: readonly TimeRangeMs[],
): boolean {
  return protectedIntervals.some(
    (iv) => isValidTimeRange(iv) && iv.startMs < pointMs && pointMs < iv.endMs,
  );
}

/**
 * Compute the set of legal cut points for the affected region (Req 9.3, 9.4):
 * detected scene boundaries that fall STRICTLY inside the region (a cut at the
 * region edge is not a cut) and do NOT fall inside any protected interval.
 * Returns finite, de-duplicated points sorted ascending.
 */
export function legalCutPoints(
  region: TimeRangeMs,
  sceneBoundariesMs: readonly number[],
  protectedIntervals: readonly TimeRangeMs[],
): number[] {
  const seen = new Set<number>();
  const points: number[] = [];
  for (const raw of sceneBoundariesMs) {
    if (!isFiniteNumber(raw)) continue;
    if (raw <= region.startMs || raw >= region.endMs) continue; // strictly interior
    if (isCutForbidden(raw, protectedIntervals)) continue; // Req 9.4
    if (seen.has(raw)) continue;
    seen.add(raw);
    points.push(raw);
  }
  return points.sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Bounded partition (Req 9.2, 9.5, 9.6)
// ---------------------------------------------------------------------------

/**
 * Partition `region` into contiguous, gap-free, overlap-free sub-ranges each of
 * duration `≤ maxDurationMs`, cutting ONLY at the supplied `cutPoints`
 * (already filtered to legal scene boundaries). Uses a greedy farthest-reach
 * strategy: from the current position, take the farthest legal cut within the
 * capability bound. Greedy farthest-reach is feasibility-optimal — if it cannot
 * make progress, no legal partition exists and the edit must be rerouted
 * (Req 9.6); an oversized sub-range is never produced.
 *
 * @param cutPoints Legal, ascending, in-region cut points (see {@link legalCutPoints}).
 */
export function partitionRegion(
  region: TimeRangeMs,
  maxDurationMs: number,
  cutPoints: readonly number[],
): TimeRangeMs[] | null {
  const subRanges: TimeRangeMs[] = [];
  let cursor = region.startMs;
  // Ascending cut points; advance an index so each is considered once.
  let idx = 0;

  // Guard against pathological inputs producing an unbounded loop.
  const maxIterations = cutPoints.length + 2;
  let iterations = 0;

  while (region.endMs - cursor > maxDurationMs) {
    if (++iterations > maxIterations) return null;

    const reach = cursor + maxDurationMs;
    // Farthest legal cut that is strictly after the cursor and within reach.
    let chosen: number | null = null;
    while (idx < cutPoints.length && cutPoints[idx] <= reach) {
      if (cutPoints[idx] > cursor) chosen = cutPoints[idx];
      idx++;
    }

    if (chosen === null) {
      // No legal cut within the capability bound — cannot split further (Req 9.6).
      return null;
    }

    subRanges.push({ startMs: cursor, endMs: chosen });
    cursor = chosen;
  }

  // Final sub-range covers the remainder (now within the bound).
  subRanges.push({ startMs: cursor, endMs: region.endMs });
  return subRanges;
}

// ---------------------------------------------------------------------------
// Top-level segmentation (Req 9.1–9.6)
// ---------------------------------------------------------------------------

/**
 * Decide the generative-edit segmentation for an affected region (Req 9.1–9.6).
 *
 * On success returns the bounded, gap-free, overlap-free sub-range partition
 * covering exactly the affected region (each sub-range `≤`
 * `caps.editableInputSeconds.max`), together with the extracted (overlapping)
 * and excluded (non-overlapping) candidate ranges. On failure returns a reason:
 * `INVALID_INPUT` for a malformed region/bound, or `REROUTE_REQUIRED` when the
 * region exceeds the bound and no legal scene-boundary cut permits a compliant
 * split (Req 9.6) — in which case nothing is emitted and no provider is invoked.
 *
 * Pure and total.
 */
export function segmentGenerativeEdit(input: SegmentationInput): SegmentationResult {
  const { affectedRegion, caps, sceneBoundariesMs, candidateRanges = [] } = input;

  // Req 9 preconditions: a well-formed region and a valid capability bound.
  if (!isValidTimeRange(affectedRegion)) {
    return {
      ok: false,
      reason: 'INVALID_INPUT',
      message: 'affectedRegion must be a well-formed range with startMs >= 0 and endMs > startMs',
    };
  }
  if (!isValidBounds(caps?.editableInputSeconds)) {
    return {
      ok: false,
      reason: 'INVALID_INPUT',
      message: 'caps.editableInputSeconds must have a finite max > 0 with 0 <= min <= max',
    };
  }

  // Capability bound is stored in seconds; convert to milliseconds (Req 9.2).
  const maxDurationMs = caps.editableInputSeconds.max * 1000;

  // Req 9.1: classify candidate ranges by overlap with the affected region.
  const { extracted, excluded } = extractOverlappingRanges(candidateRanges, affectedRegion);

  // Req 9.4: a cut may not fall inside a tracked subject or a continuous utterance.
  const protectedIntervals: TimeRangeMs[] = [
    ...(input.trackedSubjects ?? []),
    ...(input.utterances ?? []),
  ];

  // Req 9.3 + 9.4: legal cut points are interior scene boundaries not inside a
  // protected interval.
  const cutPoints = legalCutPoints(affectedRegion, sceneBoundariesMs, protectedIntervals);

  // Req 9.2, 9.5, 9.6: build the bounded, gap-free partition.
  const subRanges = partitionRegion(affectedRegion, maxDurationMs, cutPoints);
  if (subRanges === null) {
    return {
      ok: false,
      reason: 'REROUTE_REQUIRED',
      message:
        'Affected region exceeds the provider editable-input capability and cannot be split at a legal scene boundary; reroute to an alternative pipeline (no oversized request will be sent)',
    };
  }

  return { ok: true, subRanges, extracted, excluded };
}
