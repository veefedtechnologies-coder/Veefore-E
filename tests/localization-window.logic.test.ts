/**
 * Property-based tests for the PURE Window_Resolver
 * (`localization-window.logic.ts`) — the deterministic core of the
 * generative-edit localization pre-pass.
 *
 * These tests validate the 10 correctness properties defined in the
 * `generative-edit-localization` design/requirements documents against
 * `resolveLocalizationWindows`. The resolver is pure, total, and deterministic,
 * so every property is exercised over a large randomized input space (min 100
 * iterations each) using fast-check, following the existing repo convention of
 * `import * as fc from 'fast-check'` + `describe('Feature: <spec>, Property N: ...')`.
 *
 * The input generators deliberately mix "wild" candidates (negative / NaN /
 * Infinity / out-of-order / over-duration bounds and missing/invalid confidence)
 * with "nice" candidates (ordered, in-bounds, high-confidence) so that both the
 * whole-clip fallback and the `kind: 'windows'` branches are frequently reached.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  resolveLocalizationWindows,
  DEFAULT_MAX_WINDOWS,
  MIN_WINDOW_MS,
  MERGE_GAP_MS,
  WHOLE_CLIP_EPS_MS,
  type CandidateRange,
  type LocalizationWindow,
  type WindowResolution,
} from '../server/features/video-editor/services/localization-window.logic';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Minimum randomized iterations per property (spec requires >= 100). */
const RUNS = 200;

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** A "wild" millisecond value: negatives, NaN, ±Infinity, over-duration, fractional. */
const wildMs = fc.oneof(
  fc.integer({ min: -10_000, max: 70_000 }),
  fc.double({ min: -10_000, max: 70_000, noNaN: true }),
  fc.constant(0),
  fc.constant(Number.NaN),
  fc.constant(Number.POSITIVE_INFINITY),
  fc.constant(Number.NEGATIVE_INFINITY),
);

/** A "wild" confidence: valid, out-of-[0,1], NaN, or missing. */
const wildConfidence = fc.oneof(
  fc.double({ min: 0, max: 1, noNaN: true }),
  fc.double({ min: -1, max: 2, noNaN: true }),
  fc.constant(Number.NaN),
  fc.constant(undefined),
);

/** A wild candidate (may be malformed in every field). */
const wildCandidate: fc.Arbitrary<CandidateRange> = fc.record({
  startMs: wildMs,
  endMs: wildMs,
  confidence: wildConfidence,
});

/** A "nice" candidate: ordered, in-bounds, positive length, high confidence. */
const niceCandidate: fc.Arbitrary<CandidateRange> = fc
  .tuple(
    fc.integer({ min: 0, max: 59_000 }),
    fc.integer({ min: 200, max: 8_000 }),
    fc.double({ min: 0.3, max: 1, noNaN: true }),
  )
  .map(([start, len, confidence]) => ({ startMs: start, endMs: start + len, confidence }));

/** Mixed candidate array — reaches both fallback and windows branches. */
const candidatesArb = fc.array(fc.oneof(wildCandidate, niceCandidate), { maxLength: 10 });

/** A well-formed positive duration (produces window results frequently). */
const niceDuration = fc.integer({ min: 1_000, max: 60_000 });

/** A "wild" duration: valid, zero, negative, NaN, or Infinity. */
const wildDuration = fc.oneof(
  niceDuration,
  fc.constant(0),
  fc.constant(-100),
  fc.constant(Number.NaN),
  fc.constant(Number.POSITIVE_INFINITY),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract windows from a resolution, or `null` for the whole-clip signal. */
function windowsOf(res: WindowResolution): LocalizationWindow[] | null {
  return res.kind === 'windows' ? res.windows : null;
}

/** Do intervals `[aStart,aEnd]` and `[bStart,bEnd]` overlap (inclusive)? */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

// ---------------------------------------------------------------------------
// Property 1: Clamping
// ---------------------------------------------------------------------------

describe('Feature: generative-edit-localization, Property 1: Clamping', () => {
  it('every returned window w satisfies 0 <= w.startMs < w.endMs <= sourceDurationMs', () => {
    fc.assert(
      fc.property(candidatesArb, niceDuration, (candidates, durationMs) => {
        const res = resolveLocalizationWindows(candidates, durationMs);
        const windows = windowsOf(res);
        if (!windows) return; // whole-clip fallback — nothing to clamp-check
        for (const w of windows) {
          expect(w.startMs).toBeGreaterThanOrEqual(0);
          expect(w.startMs).toBeLessThan(w.endMs);
          expect(w.endMs).toBeLessThanOrEqual(durationMs);
        }
      }),
      { numRuns: RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: Minimum window
// ---------------------------------------------------------------------------

describe('Feature: generative-edit-localization, Property 2: Minimum window', () => {
  it('every returned segment window meets the minimum length, or the result is whole-clip', () => {
    fc.assert(
      fc.property(candidatesArb, niceDuration, (candidates, durationMs) => {
        const res = resolveLocalizationWindows(candidates, durationMs);
        const windows = windowsOf(res);
        if (!windows) return; // whole-clip fallback is an allowed outcome
        // The resolver clamps the effective minimum to the clip duration.
        const effectiveMin = Math.min(MIN_WINDOW_MS, durationMs);
        for (const w of windows) {
          expect(w.endMs - w.startMs).toBeGreaterThanOrEqual(effectiveMin);
        }
      }),
      { numRuns: RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: Max windows cap
// ---------------------------------------------------------------------------

describe('Feature: generative-edit-localization, Property 3: Max windows cap', () => {
  it('for any maxWindows >= 1, a windows result never exceeds that cap', () => {
    fc.assert(
      fc.property(
        candidatesArb,
        niceDuration,
        fc.integer({ min: 1, max: 6 }),
        (candidates, durationMs, maxWindows) => {
          const res = resolveLocalizationWindows(candidates, durationMs, { maxWindows });
          const windows = windowsOf(res);
          if (!windows) return;
          expect(windows.length).toBeLessThanOrEqual(maxWindows);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('with default options a windows result never exceeds DEFAULT_MAX_WINDOWS (3)', () => {
    fc.assert(
      fc.property(candidatesArb, niceDuration, (candidates, durationMs) => {
        const res = resolveLocalizationWindows(candidates, durationMs);
        const windows = windowsOf(res);
        if (!windows) return;
        expect(windows.length).toBeLessThanOrEqual(DEFAULT_MAX_WINDOWS);
      }),
      { numRuns: RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: Sorted ascending
// ---------------------------------------------------------------------------

describe('Feature: generative-edit-localization, Property 4: Sorted ascending', () => {
  it('for consecutive windows a then b, a.startMs < b.startMs', () => {
    fc.assert(
      fc.property(candidatesArb, niceDuration, (candidates, durationMs) => {
        const res = resolveLocalizationWindows(candidates, durationMs);
        const windows = windowsOf(res);
        if (!windows) return;
        for (let i = 1; i < windows.length; i += 1) {
          expect(windows[i - 1].startMs).toBeLessThan(windows[i].startMs);
        }
      }),
      { numRuns: RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5: Non-overlapping
// ---------------------------------------------------------------------------

describe('Feature: generative-edit-localization, Property 5: Non-overlapping', () => {
  it('for consecutive windows a then b, a.endMs <= b.startMs', () => {
    fc.assert(
      fc.property(candidatesArb, niceDuration, (candidates, durationMs) => {
        const res = resolveLocalizationWindows(candidates, durationMs);
        const windows = windowsOf(res);
        if (!windows) return;
        for (let i = 1; i < windows.length; i += 1) {
          expect(windows[i - 1].endMs).toBeLessThanOrEqual(windows[i].startMs);
        }
      }),
      { numRuns: RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6: Merge idempotence
// ---------------------------------------------------------------------------

describe('Feature: generative-edit-localization, Property 6: Merge idempotence', () => {
  it("feeding the resolver's own windows back in yields the same windows", () => {
    fc.assert(
      fc.property(candidatesArb, niceDuration, (candidates, durationMs) => {
        const first = resolveLocalizationWindows(candidates, durationMs);
        const windows = windowsOf(first);
        if (!windows) return; // only meaningful when segments were produced
        // Feed the produced windows back in as fully-confident candidates.
        const fedBack: CandidateRange[] = windows.map((w) => ({
          startMs: w.startMs,
          endMs: w.endMs,
          confidence: 1,
        }));
        const second = resolveLocalizationWindows(fedBack, durationMs);
        expect(second).toEqual(first);
      }),
      { numRuns: RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7: Whole-clip promotion
// ---------------------------------------------------------------------------

describe('Feature: generative-edit-localization, Property 7: Whole-clip promotion', () => {
  it('candidates whose merged windows cover [0, duration] within the epsilon yield whole-clip', () => {
    fc.assert(
      fc.property(
        // Keep duration comfortably larger than 2*eps so a near-full cover is valid.
        fc.integer({ min: 2_000, max: 60_000 }),
        fc.integer({ min: 0, max: WHOLE_CLIP_EPS_MS }),
        fc.integer({ min: 0, max: WHOLE_CLIP_EPS_MS }),
        (durationMs, startPad, endPad) => {
          // A single candidate that starts within eps of 0 and ends within eps of duration.
          const candidate: CandidateRange = {
            startMs: startPad,
            endMs: durationMs - endPad,
            confidence: 0.9,
          };
          const res = resolveLocalizationWindows([candidate], durationMs);
          expect(res.kind).toBe('whole-clip');
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('multiple contiguous candidates covering the clip also promote to whole-clip', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3_000, max: 60_000 }),
        fc.integer({ min: 2, max: 4 }),
        (durationMs, pieces) => {
          // Partition [0, duration] into `pieces` contiguous candidate ranges (gap 0).
          const step = Math.floor(durationMs / pieces);
          const candidates: CandidateRange[] = [];
          for (let i = 0; i < pieces; i += 1) {
            const startMs = i * step;
            const endMs = i === pieces - 1 ? durationMs : (i + 1) * step;
            candidates.push({ startMs, endMs, confidence: 0.8 });
          }
          const res = resolveLocalizationWindows(candidates, durationMs);
          expect(res.kind).toBe('whole-clip');
        },
      ),
      { numRuns: RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 8: Never-empty-when-segment
// ---------------------------------------------------------------------------

describe('Feature: generative-edit-localization, Property 8: Never-empty-when-segment', () => {
  it('a windows result has >= 1 non-empty window; otherwise the result is whole-clip', () => {
    fc.assert(
      fc.property(candidatesArb, wildDuration, (candidates, durationMs) => {
        const res = resolveLocalizationWindows(candidates, durationMs);
        expect(res.kind === 'windows' || res.kind === 'whole-clip').toBe(true);
        if (res.kind === 'windows') {
          expect(res.windows.length).toBeGreaterThanOrEqual(1);
          for (const w of res.windows) {
            expect(w.endMs).toBeGreaterThan(w.startMs);
          }
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('empty / all-low-confidence / invalid inputs always yield whole-clip', () => {
    fc.assert(
      fc.property(niceDuration, (durationMs) => {
        // Empty candidate set.
        expect(resolveLocalizationWindows([], durationMs).kind).toBe('whole-clip');
        // All below the default confidence floor (0.3).
        const lowConf: CandidateRange[] = [
          { startMs: 0, endMs: 1_000, confidence: 0.1 },
          { startMs: 2_000, endMs: 3_000, confidence: 0.2 },
        ];
        expect(resolveLocalizationWindows(lowConf, durationMs).kind).toBe('whole-clip');
        // Invalid / non-finite bounds.
        const invalid: CandidateRange[] = [
          { startMs: Number.NaN, endMs: 1_000, confidence: 0.9 },
          { startMs: 500, endMs: Number.NaN, confidence: 0.9 },
        ];
        expect(resolveLocalizationWindows(invalid, durationMs).kind).toBe('whole-clip');
      }),
      { numRuns: RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 9: No fabrication (No-Mock)
// ---------------------------------------------------------------------------

describe('Feature: generative-edit-localization, Property 9: No fabrication', () => {
  it("every returned window traces to (a clamp/merge of) a supplied candidate", () => {
    fc.assert(
      fc.property(candidatesArb, niceDuration, (candidates, durationMs) => {
        const res = resolveLocalizationWindows(candidates, durationMs);
        const windows = windowsOf(res);
        if (!windows) return;
        // Build the set of clamped candidate intervals, expanded by the minimum
        // window length on each side to bound ensureWindow expansion + merge-gap
        // bridging. Every returned window must overlap at least one of these.
        const clampedCandidates = candidates
          .filter(
            (c) =>
              Number.isFinite(c.startMs) &&
              Number.isFinite(c.endMs),
          )
          .map((c) => {
            const lo = Math.max(0, Math.min(Math.min(c.startMs, c.endMs), durationMs));
            const hi = Math.max(0, Math.min(Math.max(c.startMs, c.endMs), durationMs));
            return { lo: lo - MIN_WINDOW_MS - MERGE_GAP_MS, hi: hi + MIN_WINDOW_MS + MERGE_GAP_MS };
          });
        for (const w of windows) {
          const traceable = clampedCandidates.some((c) =>
            overlaps(w.startMs, w.endMs, c.lo, c.hi),
          );
          expect(traceable).toBe(true);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('empty / null / undefined input always yields whole-clip, never a window', () => {
    fc.assert(
      fc.property(niceDuration, (durationMs) => {
        expect(resolveLocalizationWindows([], durationMs).kind).toBe('whole-clip');
        expect(resolveLocalizationWindows(null, durationMs).kind).toBe('whole-clip');
        expect(resolveLocalizationWindows(undefined, durationMs).kind).toBe('whole-clip');
      }),
      { numRuns: RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 10: Determinism and totality
// ---------------------------------------------------------------------------

describe('Feature: generative-edit-localization, Property 10: Determinism and totality', () => {
  it('never throws and returns a defined result for any input (empty/negative/NaN/over-duration)', () => {
    fc.assert(
      fc.property(
        fc.oneof(candidatesArb, fc.constant(null), fc.constant(undefined)),
        wildDuration,
        (candidates, durationMs) => {
          let res: WindowResolution | undefined;
          expect(() => {
            res = resolveLocalizationWindows(
              candidates as CandidateRange[] | null | undefined,
              durationMs,
            );
          }).not.toThrow();
          expect(res).toBeDefined();
          expect(res!.kind === 'windows' || res!.kind === 'whole-clip').toBe(true);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('identical inputs always produce identical outputs (determinism)', () => {
    fc.assert(
      fc.property(
        fc.oneof(candidatesArb, fc.constant(null), fc.constant(undefined)),
        wildDuration,
        fc.record({
          maxWindows: fc.integer({ min: 1, max: 6 }),
          minConfidence: fc.double({ min: 0, max: 1, noNaN: true }),
        }),
        (candidates, durationMs, options) => {
          const input = candidates as CandidateRange[] | null | undefined;
          const a = resolveLocalizationWindows(input, durationMs, options);
          const b = resolveLocalizationWindows(input, durationMs, options);
          expect(a).toEqual(b);
        },
      ),
      { numRuns: RUNS },
    );
  });
});
