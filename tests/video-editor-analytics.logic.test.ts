import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  computeVideoJobRates,
  type VideoJobCounts,
} from '../server/features/video-editor/services/video-analytics.service';

// ===========================================================================
// Task 22.2 — Admin AI-usage analytics for video: the pure rate arithmetic
// (server/features/video-editor/services/video-analytics.service.ts).
//
// Req 22.5 defines three rates precisely:
//   - success rate    = completed / all terminated jobs (COMPLETED+FAILED+CANCELLED)
//   - retry rate      = jobs that needed ≥1 retry / all jobs
//   - QC-failure rate  = jobs that failed QC / all jobs that reached QC
//
// The DB aggregation is exercised by the integration tests (task 22.3); here we
// pin the pure math down with worked examples and universal invariants.
// ===========================================================================

const NUM_RUNS = 300;

const counts = (over: Partial<VideoJobCounts> = {}): VideoJobCounts => ({
  total: 0,
  completed: 0,
  failed: 0,
  cancelled: 0,
  retried: 0,
  reachedQc: 0,
  qcFailed: 0,
  ...over,
});

describe('computeVideoJobRates — worked examples (Req 22.5)', () => {
  it('success rate is completed over all terminated jobs', () => {
    // 6 completed, 2 failed, 2 cancelled ⇒ 6 / 10 = 0.6
    const rates = computeVideoJobRates(
      counts({ total: 10, completed: 6, failed: 2, cancelled: 2 }),
    );
    expect(rates.successRate).toBe(0.6);
  });

  it('retry rate is retried jobs over all jobs', () => {
    // 3 of 12 jobs needed a retry ⇒ 0.25
    const rates = computeVideoJobRates(counts({ total: 12, retried: 3 }));
    expect(rates.retryRate).toBe(0.25);
  });

  it('QC-failure rate is QC failures over jobs that reached QC', () => {
    // 1 QC failure out of 4 jobs that reached QC ⇒ 0.25
    const rates = computeVideoJobRates(counts({ reachedQc: 4, qcFailed: 1 }));
    expect(rates.qcFailureRate).toBe(0.25);
  });

  it('rounds each rate to three decimal places', () => {
    // 1/3 ⇒ 0.333
    const rates = computeVideoJobRates(
      counts({ total: 3, completed: 1, failed: 2, retried: 1, reachedQc: 3, qcFailed: 1 }),
    );
    expect(rates.successRate).toBe(0.333);
    expect(rates.retryRate).toBe(0.333);
    expect(rates.qcFailureRate).toBe(0.333);
  });

  it('undefined rates (zero denominator) are 0, never NaN', () => {
    const rates = computeVideoJobRates(counts());
    expect(rates.successRate).toBe(0);
    expect(rates.retryRate).toBe(0);
    expect(rates.qcFailureRate).toBe(0);
  });

  it('an all-success window reports a 1.0 success rate', () => {
    const rates = computeVideoJobRates(
      counts({ total: 5, completed: 5, retried: 0, reachedQc: 5, qcFailed: 0 }),
    );
    expect(rates.successRate).toBe(1);
    expect(rates.retryRate).toBe(0);
    expect(rates.qcFailureRate).toBe(0);
  });
});

describe('computeVideoJobRates — invariants', () => {
  it('every rate is a finite fraction in [0,1]', () => {
    fc.assert(
      fc.property(
        fc.record({
          total: fc.nat({ max: 1000 }),
          completed: fc.nat({ max: 1000 }),
          failed: fc.nat({ max: 1000 }),
          cancelled: fc.nat({ max: 1000 }),
          retried: fc.nat({ max: 1000 }),
          reachedQc: fc.nat({ max: 1000 }),
          qcFailed: fc.nat({ max: 1000 }),
        }),
        (raw) => {
          // Constrain to realistic sub-counts so the rates are meaningful.
          const reachedQc = raw.reachedQc;
          const c: VideoJobCounts = {
            total: raw.total,
            completed: raw.completed,
            failed: raw.failed,
            cancelled: raw.cancelled,
            retried: Math.min(raw.retried, raw.total),
            reachedQc,
            qcFailed: Math.min(raw.qcFailed, reachedQc),
          };
          const rates = computeVideoJobRates(c);
          for (const r of [rates.successRate, rates.retryRate, rates.qcFailureRate]) {
            expect(Number.isFinite(r)).toBe(true);
            expect(r).toBeGreaterThanOrEqual(0);
            expect(r).toBeLessThanOrEqual(1);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('success rate matches completed / terminated for well-formed counts', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 500 }),
        fc.nat({ max: 500 }),
        fc.nat({ max: 500 }),
        (completed, failed, cancelled) => {
          const terminated = completed + failed + cancelled;
          const rates = computeVideoJobRates(
            counts({ total: terminated, completed, failed, cancelled }),
          );
          const expected =
            terminated === 0 ? 0 : Math.round((completed / terminated) * 1000) / 1000;
          expect(rates.successRate).toBe(expected);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
