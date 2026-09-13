/**
 * Property tests for the Job_System state machine & progress pure core (task 4.2).
 *
 * Framework: vitest + fast-check, >=100 runs per property.
 *
 * Properties under test (design.md):
 *  - Property 43: Job state is single-valued with terminal absorbing states
 *      Validates: Requirements 18.2
 *  - Property 8: Progress is stage-derived, monotonic, and never prematurely complete
 *      Validates: Requirements 3.11, 18.4, 23.2, 23.6
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  canTransition,
  transition,
  isTerminalState,
  allowedTransitions,
  computeJobProgress,
  progressFromStages,
  clampMonotonicProgress,
  INDETERMINATE_PROGRESS,
  JOB_STATES,
  TERMINAL_STATES,
  type JobState,
  type ProgressReport,
} from '../server/features/video-editor/services/job-state.logic';

const RUNS = 200;

// ---------------------------------------------------------------------------
// Smart generators constrained to the job-state / progress input space
// ---------------------------------------------------------------------------

/** Any one of the twelve defined job states. */
const anyState: fc.Arbitrary<JobState> = fc.constantFrom(...JOB_STATES);

/** A terminal (absorbing) state. */
const terminalState: fc.Arbitrary<JobState> = fc.constantFrom(...TERMINAL_STATES);

/** A non-terminal state. */
const nonTerminalState: fc.Arbitrary<JobState> = fc.constantFrom(
  ...JOB_STATES.filter((s) => !isTerminalState(s)),
);

/** A determinate progress report with an integer percent in [0,100]. */
const determinateReport: fc.Arbitrary<ProgressReport> = fc
  .integer({ min: 0, max: 100 })
  .map((percent) => ({ determinate: true as const, percent }));

/** Any progress report — determinate or the single indeterminate value. */
const anyReport: fc.Arbitrary<ProgressReport> = fc.oneof(
  determinateReport,
  fc.constant(INDETERMINATE_PROGRESS),
);

// ---------------------------------------------------------------------------
// Property 43: Job state is single-valued with terminal absorbing states
// Validates: Requirements 18.2
// ---------------------------------------------------------------------------

describe('Property 43: Job state is single-valued with terminal absorbing states', () => {
  it('permits no transition out of any terminal state (COMPLETED/FAILED/CANCELLED are absorbing)', () => {
    fc.assert(
      fc.property(terminalState, anyState, (from, to) => {
        // No target is ever reachable from a terminal state.
        expect(canTransition(from, to)).toBe(false);
        // transition() rejects and reports the state as terminal, leaving it unchanged.
        const result = transition(from, to);
        expect(result.ok).toBe(false);
        // The reachable set from a terminal state is empty.
        expect(allowedTransitions(from)).toEqual([]);
      }),
      { numRuns: RUNS },
    );
  });

  it('yields exactly one well-defined state on any accepted transition, and never a self-loop', () => {
    fc.assert(
      fc.property(anyState, anyState, (from, to) => {
        const allowed = canTransition(from, to);
        const result = transition(from, to);
        // canTransition and transition never disagree.
        expect(result.ok).toBe(allowed);

        if (result.ok) {
          // The resulting state is a single value drawn from the defined set...
          expect(JOB_STATES).toContain(result.state);
          // ...and is exactly the requested target.
          expect(result.state).toBe(to);
          // A state is never a transition to itself (single-valued, no no-op churn).
          expect(from).not.toBe(to);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('every state reachable in one step is a member of the defined state set and honours absorption', () => {
    fc.assert(
      fc.property(anyState, (from) => {
        const reachable = allowedTransitions(from);
        // allowedTransitions is exactly the set for which canTransition holds.
        for (const to of JOB_STATES) {
          expect(reachable.includes(to)).toBe(canTransition(from, to));
        }
        // Every reachable target is a defined state, and never `from` itself.
        for (const to of reachable) {
          expect(JOB_STATES).toContain(to);
          expect(to).not.toBe(from);
        }
        // Terminal states remain absorbing regardless of the origin.
        expect(isTerminalState(from) ? reachable.length === 0 : true).toBe(true);
      }),
      { numRuns: RUNS },
    );
  });

  it('a non-terminal state can always fail or be cancelled, keeping terminal states reachable once', () => {
    fc.assert(
      fc.property(nonTerminalState, (from) => {
        // Any non-terminal state may terminate via FAILED or CANCELLED.
        if (from !== 'FAILED') expect(canTransition(from, 'FAILED')).toBe(true);
        if (from !== 'CANCELLED') expect(canTransition(from, 'CANCELLED')).toBe(true);

        // Once terminated, the state is absorbing (no second transition).
        const failed = transition(from, 'FAILED');
        if (failed.ok) {
          expect(isTerminalState(failed.state)).toBe(true);
          expect(allowedTransitions(failed.state)).toEqual([]);
        }
      }),
      { numRuns: RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 8: Progress is stage-derived, monotonic, and never prematurely complete
// Validates: Requirements 3.11, 18.4, 23.2, 23.6
// ---------------------------------------------------------------------------

describe('Property 8: Progress is stage-derived, monotonic, and never prematurely complete', () => {
  it('progressFromStages is an integer in [0,100] and reaches 100 only when all stages complete', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 0, max: 2000 }),
        (total, completed) => {
          const report = progressFromStages(completed, total);
          // With a valid positive total and non-negative completed count, the
          // result is always determinate.
          expect(report.determinate).toBe(true);
          if (!report.determinate) return;

          // Integer in the closed range [0,100].
          expect(Number.isInteger(report.percent)).toBe(true);
          expect(report.percent).toBeGreaterThanOrEqual(0);
          expect(report.percent).toBeLessThanOrEqual(100);

          // 100 iff every stage completed (completed count clamped to total).
          const allDone = completed >= total;
          expect(report.percent === 100).toBe(allDone);
          // Any partial completion is never prematurely reported as complete.
          if (!allDone) expect(report.percent).toBeLessThan(100);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('progress is stage-derived and monotonically non-decreasing as completed stages grow', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 0, max: 500 }),
        (total, a, b) => {
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          const rLo = progressFromStages(lo, total);
          const rHi = progressFromStages(hi, total);
          expect(rLo.determinate && rHi.determinate).toBe(true);
          if (!rLo.determinate || !rHi.determinate) return;
          // More completed stages never lowers reported progress (monotonic).
          expect(rHi.percent).toBeGreaterThanOrEqual(rLo.percent);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('reports indeterminate whenever the completion state is unknown (invalid stage counts)', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // non-positive or non-integer total
          fc.integer({ min: -100, max: 0 }),
          fc.double({ min: 0.1, max: 10, noNaN: true }).filter((n) => !Number.isInteger(n)),
        ),
        fc.integer({ min: 0, max: 100 }),
        (badTotal, completed) => {
          expect(progressFromStages(completed, badTotal)).toBe(INDETERMINATE_PROGRESS);
        },
      ),
      { numRuns: RUNS },
    );

    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        // negative or non-integer completed count
        fc.oneof(
          fc.integer({ min: -100, max: -1 }),
          fc.double({ min: 0.1, max: 10, noNaN: true }).filter((n) => !Number.isInteger(n)),
        ),
        (total, badCompleted) => {
          expect(progressFromStages(badCompleted, total)).toBe(INDETERMINATE_PROGRESS);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('computeJobProgress never reports 100/complete unless the job state is COMPLETED', () => {
    fc.assert(
      fc.property(
        anyState,
        fc.integer({ min: 0, max: 2000 }),
        fc.integer({ min: 1, max: 1000 }),
        (state, completedStages, totalStages) => {
          const report = computeJobProgress({ state, completedStages, totalStages });
          if (!report.determinate) return;

          if (state === 'COMPLETED') {
            // COMPLETED is the sole state permitted to report a completed value.
            expect(report.percent).toBe(100);
          } else {
            // Any non-COMPLETED state is never prematurely reported as complete.
            expect(report.percent).toBeLessThanOrEqual(99);
          }
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('COMPLETED always reports 100; unknown stage counts stay indeterminate for non-COMPLETED states', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (completedStages, totalStages) => {
        // COMPLETED reports 100 regardless of stage counts.
        const done = computeJobProgress({ state: 'COMPLETED', completedStages, totalStages });
        expect(done).toEqual({ determinate: true, percent: 100 });
      }),
      { numRuns: RUNS },
    );

    fc.assert(
      fc.property(
        nonTerminalState,
        // an invalid total makes the completion state unknown
        fc.integer({ min: -50, max: 0 }),
        fc.integer({ min: 0, max: 100 }),
        (state, badTotal, completedStages) => {
          const report = computeJobProgress({ state, completedStages, totalStages: badTotal });
          expect(report).toBe(INDETERMINATE_PROGRESS);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('clampMonotonicProgress keeps successive determinate reports non-decreasing', () => {
    fc.assert(
      fc.property(anyReport, anyReport, (previous, current) => {
        const clamped = clampMonotonicProgress(previous, current);
        if (previous.determinate && current.determinate) {
          expect(clamped.determinate).toBe(true);
          if (clamped.determinate) {
            // Never drops below the previously reported value (monotonic).
            expect(clamped.percent).toBe(Math.max(previous.percent, current.percent));
            expect(clamped.percent).toBeGreaterThanOrEqual(previous.percent);
          }
        } else {
          // An unknown report on either side is passed through unchanged.
          expect(clamped).toBe(current);
        }
      }),
      { numRuns: RUNS },
    );
  });
});
