import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  classifySilence,
  isSilentFrame,
  isValidTimeRange,
  isInBounds,
  isNormalizedConfidence,
  isWellFormedTranscriptSegment,
  findMalformedTranscriptSegments,
  isWellFormedScoredMoment,
  findMalformedScoredMoments,
  isWellFormedAnalysisTiming,
  type LoudnessFrame,
  type TimeRangeMs,
  type TranscriptSegment,
  type ScoredMoment,
} from '../server/features/video-editor/services/audio-analysis.logic';
import {
  SILENCE_THRESHOLDS,
  type SilenceThresholds,
} from '../server/features/video-editor/config/video-editor.config';

// ===========================================================================
// Task 8.2 — Property tests for the pure Video_Analysis_Service core
// (server/features/video-editor/services/audio-analysis.logic.ts).
//
//   Property 11: Silence classification matches its definition
//                Validates: Requirements 4.5
//   Property 10: Analysis scores and transcript segments are well-formed and
//                in-bounds
//                Validates: Requirements 4.3, 4.6
//
// Every property runs ≥100 fast-check iterations. The generators are shaped to
// the input space (contiguous loudness curves, valid/invalid ranges) so the
// checks are meaningful rather than vacuous.
// ===========================================================================

const NUM_RUNS = 300;

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** A finite dB loudness value spanning below and above typical thresholds. */
const loudnessDbArb = fc.integer({ min: -120, max: 20 });

/**
 * A contiguous loudness curve: a sequence of abutting frames starting at a
 * non-negative offset, each frame `[t, t+len)` with the next frame starting
 * exactly where the previous ended. This is the real shape a loudness analyzer
 * emits (gap-free frames) and makes "continuous" runs meaningful.
 */
const contiguousCurveArb = fc
  .record({
    start: fc.integer({ min: 0, max: 5_000 }),
    frames: fc.array(
      fc.record({
        len: fc.integer({ min: 1, max: 400 }),
        loudnessDb: loudnessDbArb,
      }),
      { minLength: 0, maxLength: 40 },
    ),
  })
  .map(({ start, frames }) => {
    const out: LoudnessFrame[] = [];
    let t = start;
    for (const f of frames) {
      out.push({ startMs: t, endMs: t + f.len, loudnessDb: f.loudnessDb });
      t += f.len;
    }
    return out;
  });

/** Silence thresholds spanning realistic and edge values. */
const thresholdsArb: fc.Arbitrary<SilenceThresholds> = fc.record({
  thresholdDb: fc.integer({ min: -80, max: 0 }),
  minDurationMs: fc.integer({ min: 0, max: 2_000 }),
});

/** An arbitrary (possibly malformed) time range. */
const anyRangeArb: fc.Arbitrary<TimeRangeMs> = fc.record({
  startMs: fc.integer({ min: -1_000, max: 10_000 }),
  endMs: fc.integer({ min: -1_000, max: 10_000 }),
});

// ---------------------------------------------------------------------------
// Reference implementation of the silence definition (Req 4.5), independent of
// the run-merging classifier, used as an oracle for membership.
// ---------------------------------------------------------------------------

/**
 * Whether a timestamp `ms` lies inside some returned silence range. Silence
 * ranges are half-open [start, end).
 */
function inSomeSilence(ms: number, silences: readonly TimeRangeMs[]): boolean {
  return silences.some((s) => ms >= s.startMs && ms < s.endMs);
}

// ===========================================================================
// Property 11: Silence classification matches its definition
// Validates: Requirements 4.5
//
// Definition (Req 4.5): a time range is silence iff loudness stays strictly
// below the configured threshold continuously for at least the configured
// minimum duration.
// ===========================================================================

describe('Property 11: Silence classification matches its definition (Req 4.5)', () => {
  it('every returned range is a maximal continuous below-threshold run ≥ minDuration', () => {
    fc.assert(
      fc.property(contiguousCurveArb, thresholdsArb, (frames, thresholds) => {
        const silences = classifySilence(frames, thresholds);
        for (const s of silences) {
          // Well-formed and long enough.
          expect(s.endMs).toBeGreaterThan(s.startMs);
          expect(s.endMs - s.startMs).toBeGreaterThanOrEqual(thresholds.minDurationMs);

          // Every frame overlapping the range is strictly below threshold.
          const covering = frames.filter(
            (f) => f.startMs < s.endMs && f.endMs > s.startMs,
          );
          for (const f of covering) {
            expect(f.loudnessDb).toBeLessThan(thresholds.thresholdDb);
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('returned silence ranges are ordered and non-overlapping', () => {
    fc.assert(
      fc.property(contiguousCurveArb, thresholdsArb, (frames, thresholds) => {
        const silences = classifySilence(frames, thresholds);
        for (let i = 1; i < silences.length; i++) {
          // Strictly increasing, disjoint (a loud frame or gap separates runs).
          expect(silences[i].startMs).toBeGreaterThanOrEqual(silences[i - 1].endMs);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('a loud frame (≥ threshold) is never inside any returned silence range', () => {
    fc.assert(
      fc.property(contiguousCurveArb, thresholdsArb, (frames, thresholds) => {
        const silences = classifySilence(frames, thresholds);
        for (const f of frames) {
          if (f.loudnessDb >= thresholds.thresholdDb) {
            // No part of a loud frame is classified as silence.
            const mid = Math.floor((f.startMs + f.endMs) / 2);
            expect(inSomeSilence(mid, silences)).toBe(false);
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('a continuous below-threshold run ≥ minDuration is classified as silence', () => {
    fc.assert(
      fc.property(
        fc.record({
          start: fc.integer({ min: 0, max: 3_000 }),
          quietLen: fc.integer({ min: 1, max: 3_000 }),
          quietDb: fc.integer({ min: -120, max: -1 }),
          thresholdDb: fc.integer({ min: 0, max: 0 }), // threshold 0 so any negative dB is below
        }),
        (cfg) => {
          const thresholds: SilenceThresholds = {
            thresholdDb: cfg.thresholdDb,
            minDurationMs: cfg.quietLen, // require exactly the run length
          };
          const frames: LoudnessFrame[] = [
            { startMs: cfg.start, endMs: cfg.start + cfg.quietLen, loudnessDb: cfg.quietDb },
          ];
          const silences = classifySilence(frames, thresholds);
          expect(silences).toHaveLength(1);
          expect(silences[0]).toEqual({ startMs: cfg.start, endMs: cfg.start + cfg.quietLen });
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('a below-threshold run shorter than minDuration is NOT classified as silence', () => {
    fc.assert(
      fc.property(
        fc.record({
          start: fc.integer({ min: 0, max: 3_000 }),
          quietLen: fc.integer({ min: 1, max: 999 }),
          quietDb: fc.integer({ min: -120, max: -50 }),
        }),
        (cfg) => {
          const thresholds: SilenceThresholds = {
            thresholdDb: -40,
            minDurationMs: cfg.quietLen + 1, // strictly longer than the run
          };
          const frames: LoudnessFrame[] = [
            { startMs: cfg.start, endMs: cfg.start + cfg.quietLen, loudnessDb: cfg.quietDb },
          ];
          expect(classifySilence(frames, thresholds)).toEqual([]);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('a time gap between below-threshold frames breaks continuity', () => {
    fc.assert(
      fc.property(
        fc.record({
          firstLen: fc.integer({ min: 100, max: 400 }),
          gap: fc.integer({ min: 1, max: 500 }),
          secondLen: fc.integer({ min: 100, max: 400 }),
        }),
        (cfg) => {
          const thresholds: SilenceThresholds = { thresholdDb: -40, minDurationMs: 500 };
          // Two quiet frames separated by a real time gap; individually < 500ms.
          const frames: LoudnessFrame[] = [
            { startMs: 0, endMs: cfg.firstLen, loudnessDb: -60 },
            {
              startMs: cfg.firstLen + cfg.gap,
              endMs: cfg.firstLen + cfg.gap + cfg.secondLen,
              loudnessDb: -60,
            },
          ];
          const silences = classifySilence(frames, thresholds);
          // Neither run alone reaches 500ms, and the gap prevents merging.
          for (const s of silences) {
            expect(s.endMs - s.startMs).toBeLessThanOrEqual(Math.max(cfg.firstLen, cfg.secondLen));
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('classification uses the single-source thresholds by default', () => {
    // Default threshold is -40 dB over 500 ms (from video-editor.config.ts).
    const frames: LoudnessFrame[] = [{ startMs: 0, endMs: 600, loudnessDb: -50 }];
    expect(classifySilence(frames)).toEqual([{ startMs: 0, endMs: 600 }]);
    expect(SILENCE_THRESHOLDS).toEqual({ thresholdDb: -40, minDurationMs: 500 });
  });

  it('isSilentFrame is strictly-below-threshold', () => {
    fc.assert(
      fc.property(loudnessDbArb, fc.integer({ min: -80, max: 0 }), (db, threshold) => {
        const frame: LoudnessFrame = { startMs: 0, endMs: 100, loudnessDb: db };
        expect(isSilentFrame(frame, threshold)).toBe(db < threshold);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// ===========================================================================
// Property 10: Analysis scores and transcript segments are well-formed and
// in-bounds
// Validates: Requirements 4.3, 4.6
//
// - Transcript segments (Req 4.3): startMs < endMs, non-null string text.
// - Scored moments (Req 4.6): startMs < endMs, in-bounds of source duration,
//   confidence ∈ [0.0, 1.0].
// ===========================================================================

describe('Property 10: Analysis scores and transcript segments are well-formed and in-bounds (Req 4.3, 4.6)', () => {
  it('isValidTimeRange holds iff startMs ≥ 0 and endMs > startMs (finite)', () => {
    fc.assert(
      fc.property(anyRangeArb, (range) => {
        const expected =
          Number.isFinite(range.startMs) &&
          Number.isFinite(range.endMs) &&
          range.startMs >= 0 &&
          range.endMs > range.startMs;
        expect(isValidTimeRange(range)).toBe(expected);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('isInBounds holds iff valid range fully within (0, sourceDuration]', () => {
    fc.assert(
      fc.property(anyRangeArb, fc.integer({ min: -100, max: 12_000 }), (range, duration) => {
        const expected =
          isValidTimeRange(range) && duration > 0 && range.endMs <= duration;
        expect(isInBounds(range, duration)).toBe(expected);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('isNormalizedConfidence holds iff value ∈ [0.0, 1.0]', () => {
    fc.assert(
      fc.property(fc.double({ min: -5, max: 5, noNaN: true }), (v) => {
        expect(isNormalizedConfidence(v)).toBe(v >= 0 && v <= 1);
      }),
      { numRuns: NUM_RUNS },
    );
    // Non-finite / non-number are rejected.
    expect(isNormalizedConfidence(Number.NaN)).toBe(false);
    expect(isNormalizedConfidence(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isNormalizedConfidence('0.5' as unknown)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Well-formed transcript segments (Req 4.3)
  // -------------------------------------------------------------------------

  const wellFormedSegmentArb: fc.Arbitrary<TranscriptSegment> = fc
    .record({
      startMs: fc.integer({ min: 0, max: 9_000 }),
      len: fc.integer({ min: 1, max: 1_000 }),
      text: fc.string(),
    })
    .map(({ startMs, len, text }) => ({ startMs, endMs: startMs + len, text }));

  it('a generated well-formed transcript segment is accepted', () => {
    fc.assert(
      fc.property(wellFormedSegmentArb, (seg) => {
        expect(isWellFormedTranscriptSegment(seg)).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('a transcript segment with endMs ≤ startMs is rejected', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 9_000 }),
        fc.integer({ min: -500, max: 0 }),
        fc.string(),
        (startMs, delta, text) => {
          const seg: TranscriptSegment = { startMs, endMs: startMs + delta, text };
          expect(isWellFormedTranscriptSegment(seg)).toBe(false);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('a transcript segment whose text is not a string is rejected', () => {
    fc.assert(
      fc.property(wellFormedSegmentArb, (seg) => {
        const bad = { ...seg, text: null as unknown as string };
        expect(isWellFormedTranscriptSegment(bad)).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('findMalformedTranscriptSegments returns exactly the bad indices', () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(wellFormedSegmentArb, anyRangeArb.map((r) => ({ ...r, text: 'x' })))),
        (segments) => {
          const bad = findMalformedTranscriptSegments(segments as TranscriptSegment[]);
          segments.forEach((seg, i) => {
            const wellFormed = isWellFormedTranscriptSegment(seg as TranscriptSegment);
            expect(bad.includes(i)).toBe(!wellFormed);
          });
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // -------------------------------------------------------------------------
  // Well-formed scored moments (Req 4.6)
  // -------------------------------------------------------------------------

  /** A scored moment guaranteed in-bounds of a chosen source duration. */
  const inBoundsMomentArb = fc
    .record({
      duration: fc.integer({ min: 2, max: 20_000 }),
      startFrac: fc.double({ min: 0, max: 0.98, noNaN: true }),
      lenFrac: fc.double({ min: 0.01, max: 1, noNaN: true }),
      confidence: fc.double({ min: 0, max: 1, noNaN: true }),
    })
    .map(({ duration, startFrac, lenFrac, confidence }) => {
      const startMs = Math.floor(startFrac * (duration - 1));
      const remaining = duration - startMs;
      const endMs = startMs + Math.max(1, Math.floor(lenFrac * remaining));
      return { moment: { startMs, endMs, confidence } as ScoredMoment, duration };
    });

  it('an in-bounds scored moment with confidence ∈ [0,1] is well-formed', () => {
    fc.assert(
      fc.property(inBoundsMomentArb, ({ moment, duration }) => {
        expect(isWellFormedScoredMoment(moment, duration)).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('a scored moment extending past the source duration is rejected', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000 }),
        fc.integer({ min: 1, max: 5_000 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (duration, overshoot, confidence) => {
          const moment: ScoredMoment = {
            startMs: 0,
            endMs: duration + overshoot,
            confidence,
          };
          expect(isWellFormedScoredMoment(moment, duration)).toBe(false);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('a scored moment with confidence outside [0,1] is rejected', () => {
    fc.assert(
      fc.property(
        inBoundsMomentArb,
        fc.oneof(
          fc.double({ min: -100, max: -0.0001, noNaN: true }),
          fc.double({ min: 1.0001, max: 100, noNaN: true }),
        ),
        ({ moment, duration }, badConfidence) => {
          const bad: ScoredMoment = { ...moment, confidence: badConfidence };
          expect(isWellFormedScoredMoment(bad, duration)).toBe(false);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('findMalformedScoredMoments returns exactly the bad indices', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000 }),
        fc.array(
          fc.record({
            startMs: fc.integer({ min: -500, max: 12_000 }),
            endMs: fc.integer({ min: -500, max: 12_000 }),
            confidence: fc.double({ min: -1, max: 2, noNaN: true }),
          }),
        ),
        (duration, moments) => {
          const bad = findMalformedScoredMoments(moments as ScoredMoment[], duration);
          moments.forEach((m, i) => {
            const ok = isWellFormedScoredMoment(m as ScoredMoment, duration);
            expect(bad.includes(i)).toBe(!ok);
          });
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // -------------------------------------------------------------------------
  // Aggregate analysis timing well-formedness (Req 4.3 + 4.6)
  // -------------------------------------------------------------------------

  it('aggregate timing is well-formed iff every segment and moment is well-formed', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 20_000 }),
        fc.array(inBoundsMomentArb.map((m) => m.moment), { maxLength: 6 }),
        fc.array(inBoundsMomentArb.map((m) => m.moment), { maxLength: 6 }),
        fc.array(wellFormedSegmentArb, { maxLength: 6 }),
        (duration, hooks, moments, transcript) => {
          // Constrain generated moments to this duration for the positive case.
          const clampMoment = (m: ScoredMoment): ScoredMoment => ({
            startMs: 0,
            endMs: Math.max(1, Math.min(m.endMs, duration)),
            confidence: m.confidence,
          });
          const timing = {
            transcript: transcript.filter((s) => s.endMs <= duration),
            hookCandidates: hooks.map(clampMoment),
            importantMoments: moments.map(clampMoment),
          };
          const expected =
            findMalformedTranscriptSegments(timing.transcript).length === 0 &&
            findMalformedScoredMoments(timing.hookCandidates, duration).length === 0 &&
            findMalformedScoredMoments(timing.importantMoments, duration).length === 0;
          expect(isWellFormedAnalysisTiming(timing, duration)).toBe(expected);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('one malformed moment makes the aggregate timing malformed', () => {
    const duration = 5_000;
    const timing = {
      transcript: [{ startMs: 0, endMs: 1_000, text: 'hi' }],
      hookCandidates: [{ startMs: 0, endMs: 1_000, confidence: 0.9 }],
      importantMoments: [{ startMs: 0, endMs: duration + 1, confidence: 0.5 }], // out of bounds
    };
    expect(isWellFormedAnalysisTiming(timing, duration)).toBe(false);
  });
});
