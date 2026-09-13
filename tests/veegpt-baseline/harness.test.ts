/**
 * Tests for the Baseline_Benchmark harness + request set
 * (spec: veegpt-context-optimization, Req 2.1, 2.2, 2.3).
 *
 * Verifies:
 *  - the version-controlled request set covers all 15 categories with ≥3
 *    distinct requests each and no duplicate ids (Req 2.2);
 *  - the harness runs each request ≥3× against a deterministic mock provider
 *    (no live API keys) and records the mean of the seven required metrics
 *    (Req 2.3);
 *  - the scoring functions behave as specified.
 */

import { describe, it, expect } from 'vitest';
import {
  BASELINE_REQUEST_SET,
  BENCHMARK_CATEGORIES,
  MIN_REQUESTS_PER_CATEGORY,
  MIN_RUNS_PER_REQUEST,
  createMockRunner,
  meanMetrics,
  runBenchmark,
  scoreResponse,
  scoreRetention,
  scoreToolCallAccuracy,
  validateRequestSet,
  type RunMetrics,
} from './index';

describe('Baseline request set — category coverage (Req 2.2)', () => {
  const validation = validateRequestSet(BASELINE_REQUEST_SET);

  it('is valid overall (all categories covered, no duplicate ids)', () => {
    expect(validation.missingCategories, 'under-covered categories').toEqual([]);
    expect(validation.duplicateIds, 'duplicate ids').toEqual([]);
    expect(validation.valid).toBe(true);
  });

  it('has >= 3 distinct requests for each of the 15 categories', () => {
    expect(BENCHMARK_CATEGORIES).toHaveLength(15);
    for (const category of BENCHMARK_CATEGORIES) {
      expect(
        validation.categoryCounts[category],
        `category "${category}" needs >= ${MIN_REQUESTS_PER_CATEGORY} requests`,
      ).toBeGreaterThanOrEqual(MIN_REQUESTS_PER_CATEGORY);
    }
  });

  it('every request has a unique id and a known category', () => {
    const ids = new Set<string>();
    for (const req of BASELINE_REQUEST_SET) {
      expect(ids.has(req.id), `duplicate id ${req.id}`).toBe(false);
      ids.add(req.id);
      expect(BENCHMARK_CATEGORIES).toContain(req.category);
    }
  });
});

describe('validateRequestSet — detects gaps', () => {
  it('flags a missing category', () => {
    const subset = BASELINE_REQUEST_SET.filter((r) => r.category !== 'analytics');
    const v = validateRequestSet(subset);
    expect(v.valid).toBe(false);
    expect(v.missingCategories).toContain('analytics');
  });

  it('flags duplicate ids', () => {
    const dup = [...BASELINE_REQUEST_SET, { ...BASELINE_REQUEST_SET[0] }];
    const v = validateRequestSet(dup);
    expect(v.valid).toBe(false);
    expect(v.duplicateIds).toContain(BASELINE_REQUEST_SET[0].id);
  });
});

describe('scoring functions (Req 2.3)', () => {
  it('tool-call accuracy is 100 when nothing expected and nothing called', () => {
    expect(scoreToolCallAccuracy([], [])).toBe(100);
  });

  it('tool-call accuracy is a Jaccard overlap percentage', () => {
    // expected {a,b}, actual {a} → intersection 1 / union 2 = 50%
    expect(scoreToolCallAccuracy(['a', 'b'], ['a'])).toBe(50);
    // exact match → 100
    expect(scoreToolCallAccuracy(['a', 'b'], ['b', 'a'])).toBe(100);
    // unexpected extra tool is penalized
    expect(scoreToolCallAccuracy(['a'], ['a', 'b'])).toBe(50);
  });

  it('retention is 100 when nothing is expected', () => {
    expect(scoreRetention('any text', [])).toBe(100);
  });

  it('retention counts case-insensitive substring hits', () => {
    expect(scoreRetention('The Coffee Shop is great', ['coffee shop'])).toBe(100);
    expect(scoreRetention('nothing relevant', ['coffee shop', 'teal'])).toBe(0);
    expect(scoreRetention('teal branding only', ['teal', 'motivational'])).toBe(50);
  });
});

describe('harness run (Req 2.3) — deterministic mock provider, no API keys', () => {
  it('rejects runsPerRequest < 3', async () => {
    await expect(
      runBenchmark(BASELINE_REQUEST_SET, createMockRunner(), { runsPerRequest: 2 }),
    ).rejects.toThrow(/runsPerRequest must be >= 3/);
  });

  it('rejects an invalid request set', async () => {
    const subset = BASELINE_REQUEST_SET.filter((r) => r.category !== 'scheduling');
    await expect(runBenchmark(subset, createMockRunner())).rejects.toThrow(
      /Invalid Baseline_Benchmark request set/,
    );
  });

  it('runs each request >= 3 times and records all seven mean metrics', async () => {
    const report = await runBenchmark(BASELINE_REQUEST_SET, createMockRunner(), {
      runsPerRequest: MIN_RUNS_PER_REQUEST,
    });

    expect(report.runner).toBe('mock-deterministic');
    expect(report.runsPerRequest).toBe(MIN_RUNS_PER_REQUEST);
    expect(report.totalRequests).toBe(BASELINE_REQUEST_SET.length);
    expect(report.results).toHaveLength(BASELINE_REQUEST_SET.length);

    for (const result of report.results) {
      expect(result.runs).toHaveLength(MIN_RUNS_PER_REQUEST);
      const m = result.mean;
      // All seven metrics present and in-range.
      expect(m.inputTokens).toBeGreaterThan(0);
      expect(m.outputTokens).toBeGreaterThan(0);
      expect(m.latencyMs).toBeGreaterThan(0);
      for (const key of [
        'toolCallAccuracyPct',
        'answerQualityScore',
        'memoryRetentionPct',
        'contextRetentionPct',
      ] as (keyof RunMetrics)[]) {
        expect(m[key], `${result.requestId}.${key}`).toBeGreaterThanOrEqual(0);
        expect(m[key], `${result.requestId}.${key}`).toBeLessThanOrEqual(100);
      }
    }

    // Overall headline means are populated.
    expect(report.overallMean.inputTokens).toBeGreaterThan(0);
    expect(report.capturedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('is reproducible: identical input yields identical metrics', async () => {
    const a = await runBenchmark(BASELINE_REQUEST_SET, createMockRunner());
    const b = await runBenchmark(BASELINE_REQUEST_SET, createMockRunner());
    const strip = (r: Awaited<ReturnType<typeof runBenchmark>>) =>
      r.results.map((x) => ({ id: x.requestId, mean: x.mean }));
    expect(strip(a)).toEqual(strip(b));
  });

  it('legacy-style prompts make baseline input tokens substantial', async () => {
    const report = await runBenchmark(BASELINE_REQUEST_SET, createMockRunner());
    // The mock simulates "everything every turn", so per-request input tokens
    // should be well above a trivial floor — the waste the refactor targets.
    expect(report.overallMean.inputTokens).toBeGreaterThan(100);
  });

  it('mean of a single-value metric set equals that value', () => {
    const one: RunMetrics = {
      inputTokens: 10,
      outputTokens: 5,
      latencyMs: 100,
      toolCallAccuracyPct: 100,
      answerQualityScore: 80,
      memoryRetentionPct: 100,
      contextRetentionPct: 100,
    };
    expect(meanMetrics([one, one, one])).toEqual(one);
  });

  it('scores a tool-failure request with graceful-degradation text', async () => {
    const failReq = BASELINE_REQUEST_SET.find((r) => r.category === 'tool-failure')!;
    const runner = createMockRunner();
    const metrics = scoreResponse(failReq, runner.run(failReq, 0) as any);
    // Tool is still attempted (accuracy preserved) and an answer is produced.
    expect(metrics.toolCallAccuracyPct).toBe(100);
    expect(metrics.answerQualityScore).toBeGreaterThan(0);
  });
});
