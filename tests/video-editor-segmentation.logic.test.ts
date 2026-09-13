import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  segmentGenerativeEdit,
  rangesOverlap,
  extractOverlappingRanges,
  isCutForbidden,
  legalCutPoints,
  partitionRegion,
  type SegmentationInput,
  type SegmentationCapabilityBounds,
} from '../server/features/video-editor/services/segmentation.logic';
import {
  isValidTimeRange,
  type TimeRangeMs,
} from '../server/features/video-editor/services/audio-analysis.logic';

// ===========================================================================
// Task 17.2 — Property test for the pure generative-segmentation core
// (server/features/video-editor/services/segmentation.logic.ts).
//
//   Property 22: Segmentation partitions the affected region with no gaps or
//                overlaps within capability bounds
//                Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
//
// For any affected region, provider capability, and analysis:
//   - extracted candidate ranges overlap the region; excluded do not (Req 9.1)
//   - emitted sub-ranges are contiguous, gap-free, overlap-free, and cover
//     exactly the affected region (Req 9.5)
//   - every sub-range duration ≤ caps.editableInputSeconds.max (Req 9.2, 9.5)
//   - every internal cut lies on a detected scene boundary (Req 9.3) and never
//     inside a continuously tracked subject or continuous utterance (Req 9.4)
//   - a region over capability with no legal cut → REROUTE_REQUIRED and NO
//     oversized sub-range is ever emitted (Req 9.6)
//
// Every property runs ≥100 fast-check iterations with generators shaped to the
// real input space so the checks are meaningful rather than vacuous.
// ===========================================================================

const NUM_RUNS = 300;

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** A well-formed affected region on the source timeline (ms). */
const regionArb: fc.Arbitrary<TimeRangeMs> = fc
  .record({
    startMs: fc.integer({ min: 0, max: 20_000 }),
    len: fc.integer({ min: 1, max: 60_000 }),
  })
  .map(({ startMs, len }) => ({ startMs, endMs: startMs + len }));

/** Capability bounds with a strictly-positive editable-input max (seconds). */
const capsArb: fc.Arbitrary<SegmentationCapabilityBounds> = fc
  .record({
    min: fc.integer({ min: 0, max: 5 }),
    span: fc.integer({ min: 1, max: 30 }),
  })
  .map(({ min, span }) => ({ editableInputSeconds: { min, max: min + span } }));

/** An arbitrary (possibly malformed) time range. */
const anyRangeArb: fc.Arbitrary<TimeRangeMs> = fc.record({
  startMs: fc.integer({ min: -5_000, max: 40_000 }),
  endMs: fc.integer({ min: -5_000, max: 80_000 }),
});

/**
 * Build a full segmentation input whose scene boundaries are dense enough that
 * a legal partition is (usually) possible: boundaries every `step` ms across
 * the region, where `step ≤ maxDurationMs`. Protected intervals may forbid some
 * cuts; when that starves the partition, the module must REROUTE (never emit
 * oversized) — which the properties also assert.
 */
const inputArb: fc.Arbitrary<SegmentationInput> = fc
  .record({
    region: regionArb,
    caps: capsArb,
    // Extra boundary jitter and candidates below.
    candidateJitter: fc.array(anyRangeArb, { maxLength: 6 }),
    protectedFrac: fc.array(
      fc.record({
        startFrac: fc.double({ min: 0, max: 0.95, noNaN: true }),
        lenFrac: fc.double({ min: 0.01, max: 0.4, noNaN: true }),
        kind: fc.constantFrom('subject', 'utterance'),
      }),
      { maxLength: 4 },
    ),
  })
  .map(({ region, caps, candidateJitter, protectedFrac }) => {
    const maxDurationMs = caps.editableInputSeconds.max * 1000;
    const regionLen = region.endMs - region.startMs;
    // Dense scene boundaries so the region is generally splittable: one every
    // half the capability bound, ensuring reach between consecutive cuts.
    const step = Math.max(1, Math.floor(maxDurationMs / 2));
    const sceneBoundariesMs: number[] = [];
    for (let t = region.startMs + step; t < region.endMs; t += step) {
      sceneBoundariesMs.push(t);
    }
    // A few out-of-region / duplicate boundaries to exercise filtering.
    sceneBoundariesMs.push(region.startMs, region.endMs, region.startMs - 100, region.endMs + 100);
    if (sceneBoundariesMs.length > 0) sceneBoundariesMs.push(sceneBoundariesMs[0]);

    const toInterval = (f: { startFrac: number; lenFrac: number }): TimeRangeMs => {
      const s = region.startMs + Math.floor(f.startFrac * regionLen);
      const e = Math.min(region.endMs, s + Math.max(1, Math.floor(f.lenFrac * regionLen)));
      return { startMs: s, endMs: Math.max(s + 1, e) };
    };
    const trackedSubjects = protectedFrac
      .filter((p) => p.kind === 'subject')
      .map(toInterval);
    const utterances = protectedFrac
      .filter((p) => p.kind === 'utterance')
      .map(toInterval);

    // Candidate ranges: some guaranteed to overlap the region, plus jitter.
    const overlapping: TimeRangeMs = {
      startMs: Math.max(0, region.startMs - 10),
      endMs: region.startMs + Math.max(1, Math.floor(regionLen / 2)),
    };
    const nonOverlapping: TimeRangeMs = {
      startMs: region.endMs + 50,
      endMs: region.endMs + 500,
    };
    const candidateRanges = [overlapping, nonOverlapping, ...candidateJitter];

    return {
      affectedRegion: region,
      caps,
      sceneBoundariesMs,
      trackedSubjects,
      utterances,
      candidateRanges,
    } satisfies SegmentationInput;
  });

// ---------------------------------------------------------------------------
// Helpers for assertions
// ---------------------------------------------------------------------------

function isStrictlyInside(pointMs: number, iv: TimeRangeMs): boolean {
  return isValidTimeRange(iv) && iv.startMs < pointMs && pointMs < iv.endMs;
}

// ===========================================================================
// Property 22 — the main invariant
// ===========================================================================

describe('Property 22: Segmentation partitions the affected region within capability bounds (Req 9.1–9.6)', () => {
  // -------------------------------------------------------------------------
  // Req 9.1 — extraction/exclusion by overlap
  // -------------------------------------------------------------------------
  it('extracted candidates overlap the region and excluded do not (Req 9.1)', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const result = segmentGenerativeEdit(input);
        // Extraction is reported on success (and computed regardless of the
        // partition outcome). Only assert on the success shape here.
        if (!result.ok) return;

        for (const r of result.extracted) {
          expect(rangesOverlap(r, input.affectedRegion)).toBe(true);
        }
        for (const r of result.excluded) {
          expect(rangesOverlap(r, input.affectedRegion)).toBe(false);
        }
        // Every candidate is accounted for in exactly one bucket.
        expect(result.extracted.length + result.excluded.length).toBe(
          (input.candidateRanges ?? []).length,
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // -------------------------------------------------------------------------
  // Req 9.5 — contiguous, gap-free, overlap-free, exact cover
  // -------------------------------------------------------------------------
  it('sub-ranges are contiguous, gap-free, overlap-free and cover exactly the region (Req 9.5)', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const result = segmentGenerativeEdit(input);
        if (!result.ok) return;

        const { subRanges } = result;
        expect(subRanges.length).toBeGreaterThanOrEqual(1);

        // Each sub-range is itself well-formed.
        for (const sr of subRanges) {
          expect(isValidTimeRange(sr)).toBe(true);
        }

        // First starts at region start; last ends at region end.
        expect(subRanges[0].startMs).toBe(input.affectedRegion.startMs);
        expect(subRanges[subRanges.length - 1].endMs).toBe(input.affectedRegion.endMs);

        // Contiguous & gap-free & overlap-free: each start equals prior end.
        for (let i = 1; i < subRanges.length; i++) {
          expect(subRanges[i].startMs).toBe(subRanges[i - 1].endMs);
        }

        // Total covered duration equals the region length.
        const covered = subRanges.reduce((sum, sr) => sum + (sr.endMs - sr.startMs), 0);
        expect(covered).toBe(input.affectedRegion.endMs - input.affectedRegion.startMs);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // -------------------------------------------------------------------------
  // Req 9.2 & 9.5 — every sub-range within the capability bound
  // -------------------------------------------------------------------------
  it('every emitted sub-range duration ≤ caps.editableInputSeconds.max (Req 9.2, 9.5)', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const result = segmentGenerativeEdit(input);
        if (!result.ok) return;
        const maxDurationMs = input.caps.editableInputSeconds.max * 1000;
        for (const sr of result.subRanges) {
          expect(sr.endMs - sr.startMs).toBeLessThanOrEqual(maxDurationMs);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // -------------------------------------------------------------------------
  // Req 9.3 & 9.4 — internal cuts only at legal scene boundaries
  // -------------------------------------------------------------------------
  it('every internal cut lies on a scene boundary and never inside a subject/utterance (Req 9.3, 9.4)', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const result = segmentGenerativeEdit(input);
        if (!result.ok) return;

        const boundarySet = new Set(input.sceneBoundariesMs);
        const protectedIntervals = [
          ...(input.trackedSubjects ?? []),
          ...(input.utterances ?? []),
        ];

        // Internal cut points are the boundaries between consecutive sub-ranges.
        for (let i = 1; i < result.subRanges.length; i++) {
          const cut = result.subRanges[i].startMs;
          // Req 9.3: cut is a detected scene boundary.
          expect(boundarySet.has(cut)).toBe(true);
          // Req 9.3: strictly interior to the region.
          expect(cut).toBeGreaterThan(input.affectedRegion.startMs);
          expect(cut).toBeLessThan(input.affectedRegion.endMs);
          // Req 9.4: not strictly inside any tracked subject or utterance.
          for (const iv of protectedIntervals) {
            expect(isStrictlyInside(cut, iv)).toBe(false);
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // -------------------------------------------------------------------------
  // Req 9.6 — over-capability with no legal cut → REROUTE, never oversized
  // -------------------------------------------------------------------------
  it('when the region fits the bound, a single sub-range equal to the region is emitted', () => {
    fc.assert(
      fc.property(regionArb, capsArb, (region, caps) => {
        const maxDurationMs = caps.editableInputSeconds.max * 1000;
        // Constrain to the fits-in-one-segment case.
        fc.pre(region.endMs - region.startMs <= maxDurationMs);
        const result = segmentGenerativeEdit({
          affectedRegion: region,
          caps,
          sceneBoundariesMs: [],
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.subRanges).toEqual([region]);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('over-capability region with no legal cut → REROUTE_REQUIRED, nothing emitted (Req 9.6)', () => {
    fc.assert(
      fc.property(regionArb, capsArb, (region, caps) => {
        const maxDurationMs = caps.editableInputSeconds.max * 1000;
        // Force the over-capability case with NO scene boundaries at all.
        fc.pre(region.endMs - region.startMs > maxDurationMs);
        const result = segmentGenerativeEdit({
          affectedRegion: region,
          caps,
          sceneBoundariesMs: [],
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.reason).toBe('REROUTE_REQUIRED');
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('an over-capability region whose only boundaries are all protected → REROUTE (Req 9.4, 9.6)', () => {
    fc.assert(
      fc.property(regionArb, capsArb, (region, caps) => {
        const maxDurationMs = caps.editableInputSeconds.max * 1000;
        fc.pre(region.endMs - region.startMs > maxDurationMs);
        // Place a boundary at the exact midpoint, but cover it with a subject so
        // it becomes an illegal cut — no other boundaries exist.
        const mid = region.startMs + Math.floor((region.endMs - region.startMs) / 2);
        fc.pre(mid > region.startMs && mid < region.endMs);
        const result = segmentGenerativeEdit({
          affectedRegion: region,
          caps,
          sceneBoundariesMs: [mid],
          trackedSubjects: [{ startMs: mid - 1, endMs: mid + 1 }],
        });
        // The only candidate cut is forbidden → cannot split → reroute.
        // (A single mid cut may also be insufficient for very long regions.)
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe('REROUTE_REQUIRED');
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // -------------------------------------------------------------------------
  // Global no-oversized-emission invariant across ALL outcomes
  // -------------------------------------------------------------------------
  it('never emits an oversized sub-range under any input (Req 9.6)', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const result = segmentGenerativeEdit(input);
        const maxDurationMs = input.caps.editableInputSeconds.max * 1000;
        if (result.ok) {
          for (const sr of result.subRanges) {
            expect(sr.endMs - sr.startMs).toBeLessThanOrEqual(maxDurationMs);
          }
        }
        // On failure, nothing is emitted at all — enforced by the type (no
        // subRanges field), so there is nothing oversized to send.
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // -------------------------------------------------------------------------
  // Malformed inputs → INVALID_INPUT (no emission)
  // -------------------------------------------------------------------------
  it('malformed region or capability bound → INVALID_INPUT', () => {
    fc.assert(
      fc.property(
        anyRangeArb,
        fc.oneof(
          fc.constant<SegmentationCapabilityBounds>({ editableInputSeconds: { min: 0, max: 0 } }),
          fc.constant<SegmentationCapabilityBounds>({ editableInputSeconds: { min: 5, max: 1 } }),
        ),
        (region, badCaps) => {
          const validRegion = isValidTimeRange(region);
          const goodCaps: SegmentationCapabilityBounds = {
            editableInputSeconds: { min: 0, max: 10 },
          };
          // A malformed region with good caps → INVALID_INPUT.
          if (!validRegion) {
            const r = segmentGenerativeEdit({
              affectedRegion: region,
              caps: goodCaps,
              sceneBoundariesMs: [],
            });
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.reason).toBe('INVALID_INPUT');
          }
          // A good region with malformed caps → INVALID_INPUT.
          const r2 = segmentGenerativeEdit({
            affectedRegion: { startMs: 0, endMs: 1000 },
            caps: badCaps,
            sceneBoundariesMs: [],
          });
          expect(r2.ok).toBe(false);
          if (!r2.ok) expect(r2.reason).toBe('INVALID_INPUT');
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

// ===========================================================================
// Supporting unit / helper properties for the exported primitives
// ===========================================================================

describe('Segmentation primitives (Req 9.1, 9.3, 9.4)', () => {
  it('rangesOverlap is symmetric and false for touching/malformed ranges', () => {
    fc.assert(
      fc.property(anyRangeArb, anyRangeArb, (a, b) => {
        expect(rangesOverlap(a, b)).toBe(rangesOverlap(b, a));
        if (!isValidTimeRange(a) || !isValidTimeRange(b)) {
          expect(rangesOverlap(a, b)).toBe(false);
        }
      }),
      { numRuns: NUM_RUNS },
    );
    // Touching at an endpoint does not overlap.
    expect(rangesOverlap({ startMs: 0, endMs: 100 }, { startMs: 100, endMs: 200 })).toBe(false);
    // Clear overlap.
    expect(rangesOverlap({ startMs: 0, endMs: 100 }, { startMs: 50, endMs: 200 })).toBe(true);
  });

  it('extractOverlappingRanges buckets every candidate by overlap (Req 9.1)', () => {
    fc.assert(
      fc.property(fc.array(anyRangeArb, { maxLength: 10 }), regionArb, (candidates, region) => {
        const { extracted, excluded } = extractOverlappingRanges(candidates, region);
        expect(extracted.length + excluded.length).toBe(candidates.length);
        for (const r of extracted) expect(rangesOverlap(r, region)).toBe(true);
        for (const r of excluded) expect(rangesOverlap(r, region)).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('isCutForbidden is true iff the point is strictly inside a protected interval (Req 9.4)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100, max: 10_000 }),
        fc.array(anyRangeArb, { maxLength: 6 }),
        (point, intervals) => {
          const expected = intervals.some((iv) => isStrictlyInside(point, iv));
          expect(isCutForbidden(point, intervals)).toBe(expected);
        },
      ),
      { numRuns: NUM_RUNS },
    );
    // Boundary point is NOT inside.
    expect(isCutForbidden(100, [{ startMs: 100, endMs: 200 }])).toBe(false);
    expect(isCutForbidden(150, [{ startMs: 100, endMs: 200 }])).toBe(true);
  });

  it('legalCutPoints returns strictly-interior, unforbidden, de-duplicated ascending boundaries (Req 9.3, 9.4)', () => {
    fc.assert(
      fc.property(
        regionArb,
        fc.array(fc.integer({ min: -1_000, max: 90_000 }), { maxLength: 20 }),
        fc.array(anyRangeArb, { maxLength: 5 }),
        (region, boundaries, protectedIntervals) => {
          const pts = legalCutPoints(region, boundaries, protectedIntervals);
          // Ascending, unique.
          for (let i = 1; i < pts.length; i++) {
            expect(pts[i]).toBeGreaterThan(pts[i - 1]);
          }
          for (const p of pts) {
            // Strictly interior (Req 9.3).
            expect(p).toBeGreaterThan(region.startMs);
            expect(p).toBeLessThan(region.endMs);
            // Was a supplied boundary.
            expect(boundaries.includes(p)).toBe(true);
            // Not forbidden (Req 9.4).
            expect(isCutForbidden(p, protectedIntervals)).toBe(false);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('partitionRegion returns a bounded gap-free cover or null (Req 9.2, 9.5, 9.6)', () => {
    fc.assert(
      fc.property(
        regionArb,
        fc.integer({ min: 1, max: 30_000 }),
        (region, maxDurationMs) => {
          // Dense legal cut points every maxDurationMs/2 so a partition exists.
          const step = Math.max(1, Math.floor(maxDurationMs / 2));
          const cutPoints: number[] = [];
          for (let t = region.startMs + step; t < region.endMs; t += step) {
            cutPoints.push(t);
          }
          const parts = partitionRegion(region, maxDurationMs, cutPoints);
          if (parts === null) return; // reroute case is acceptable
          // Bounded.
          for (const p of parts) {
            expect(p.endMs - p.startMs).toBeLessThanOrEqual(maxDurationMs);
          }
          // Gap-free exact cover.
          expect(parts[0].startMs).toBe(region.startMs);
          expect(parts[parts.length - 1].endMs).toBe(region.endMs);
          for (let i = 1; i < parts.length; i++) {
            expect(parts[i].startMs).toBe(parts[i - 1].endMs);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
