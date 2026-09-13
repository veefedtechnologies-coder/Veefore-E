/**
 * After_Benchmark comparison tests (spec: veegpt-context-optimization,
 * Task 11.4; Req 2.4, 2.5, 2.6).
 *
 * These tests re-run the identical benchmark request set with the
 * `Optimization_Flag` ON (the real optimized composer path, via
 * `createAfterRunner`) using the same run count and metrics as the baseline
 * (Req 2.4), then verify the comparison + classification logic against the
 * persisted `baseline-benchmark.json` reference:
 *   - success is classified ONLY when mean input tokens drop ≥ 10% AND no
 *     behavioral metric regresses AND latency is not worse by > 10% (Req 2.5);
 *   - on failure the BASELINE is retained as the reference (Req 2.6).
 *
 * The optimized runner is deterministic (no API keys), so the After_Benchmark is
 * reproducible and the classification is stable.
 */

import { describe, it, expect } from 'vitest';

import {
  BEHAVIORAL_METRICS,
  INPUT_TOKEN_REDUCTION_TARGET_PCT,
  LATENCY_REGRESSION_LIMIT_PCT,
  captureAfterBenchmark,
  compareToBaseline,
} from './after-benchmark';
import { readBaselineArtifact } from './capture-baseline';
import { createAfterRunner, runComposerPath } from './after-provider';
import { runBenchmark } from './harness';
import { BASELINE_REQUEST_SET } from './request-set';
import { MIN_RUNS_PER_REQUEST, type BenchmarkReport } from './types';

describe('After_Benchmark — optimized composer path (Req 2.4)', () => {
  it('runs the identical request set with the same run count and metrics', async () => {
    const after = await captureAfterBenchmark();
    expect(after.runner).toBe('optimized-composer');
    expect(after.runsPerRequest).toBe(MIN_RUNS_PER_REQUEST);
    expect(after.totalRequests).toBe(BASELINE_REQUEST_SET.length);
    expect(after.results).toHaveLength(BASELINE_REQUEST_SET.length);
    for (const result of after.results) {
      expect(result.runs.length).toBeGreaterThanOrEqual(MIN_RUNS_PER_REQUEST);
    }
  });

  it('is deterministic: identical inputs yield identical metrics', async () => {
    const a = await captureAfterBenchmark();
    const b = await captureAfterBenchmark();
    const strip = (r: BenchmarkReport) =>
      r.results.map((x) => ({ id: x.requestId, mean: x.mean }));
    expect(strip(a)).toEqual(strip(b));
  });

  it('exercises the real composer path without API keys', () => {
    // Clear-intent request → selective tool exposure (a small subset).
    const contentReq = BASELINE_REQUEST_SET.find((r) => r.id === 'content-creation-1')!;
    const contentComp = runComposerPath(contentReq);
    expect(contentComp.exposedTools).toContain('generate_caption');
    expect(contentComp.exposedTools.length).toBeLessThan(18);
    expect(contentComp.ambiguous).toBe(false);

    // Ambiguous request → fails open to the full tier tool set.
    const ambiguousReq = BASELINE_REQUEST_SET.find((r) => r.id === 'ambiguous-2')!;
    const ambiguousComp = runComposerPath(ambiguousReq);
    expect(ambiguousComp.ambiguous).toBe(true);
    // Full tier tool set (grew as capability tools were added:
    // generate_document, then generate_image + edit_image, then
    // show_media_options — the visual image picker for scheduling).
    expect(ambiguousComp.exposedTools.length).toBe(22);
  });
});

describe('After_Benchmark comparison + classification (Req 2.5, 2.6)', () => {
  it('achieves ≥ 10% mean input-token reduction with no behavioral/latency regression', async () => {
    const baseline = readBaselineArtifact();
    const after = await captureAfterBenchmark();
    const comparison = compareToBaseline(after, baseline);

    // The headline success gate (Req 2.5).
    expect(comparison.inputTokenReductionPct).toBeGreaterThanOrEqual(
      INPUT_TOKEN_REDUCTION_TARGET_PCT,
    );
    expect(comparison.latencyDeltaPct).toBeLessThanOrEqual(LATENCY_REGRESSION_LIMIT_PCT);
    expect(comparison.behavioralRegressions).toEqual([]);

    expect(comparison.tokenTargetMet).toBe(true);
    expect(comparison.latencyWithinLimit).toBe(true);
    expect(comparison.classification).toBe('success');
    expect(comparison.retainedReference).toBe('after');
  });

  it('preserves every behavioral metric at baseline level (no regression)', async () => {
    const baseline = readBaselineArtifact();
    const after = await captureAfterBenchmark();
    for (const metric of BEHAVIORAL_METRICS) {
      expect(
        after.overallMean[metric],
        `${metric} must not regress below baseline`,
      ).toBeGreaterThanOrEqual(baseline.overallMean[metric] - 0.01);
    }
  });

  it('classifies FAILED and retains the baseline when the token target is missed', () => {
    // A synthetic After report that only trims input tokens by ~2% (below 10%)
    // must be classified failed, and the baseline retained as the reference.
    const baseline = readBaselineArtifact();
    const barelyBetter: BenchmarkReport = {
      ...baseline,
      runner: 'optimized-composer',
      overallMean: {
        ...baseline.overallMean,
        inputTokens: baseline.overallMean.inputTokens * 0.98,
      },
    };
    const comparison = compareToBaseline(barelyBetter, baseline);
    expect(comparison.tokenTargetMet).toBe(false);
    expect(comparison.classification).toBe('failed');
    expect(comparison.retainedReference).toBe('baseline');
  });

  it('classifies FAILED when a behavioral metric regresses even if tokens drop', () => {
    const baseline = readBaselineArtifact();
    const regressed: BenchmarkReport = {
      ...baseline,
      runner: 'optimized-composer',
      overallMean: {
        ...baseline.overallMean,
        inputTokens: baseline.overallMean.inputTokens * 0.5, // huge token win
        toolCallAccuracyPct: baseline.overallMean.toolCallAccuracyPct - 5, // but a regression
      },
    };
    const comparison = compareToBaseline(regressed, baseline);
    expect(comparison.tokenTargetMet).toBe(true);
    expect(comparison.behavioralRegressions.map((r) => r.metric)).toContain(
      'toolCallAccuracyPct',
    );
    expect(comparison.classification).toBe('failed');
    expect(comparison.retainedReference).toBe('baseline');
  });

  it('classifies FAILED when latency worsens by more than 10%', () => {
    const baseline = readBaselineArtifact();
    const slower: BenchmarkReport = {
      ...baseline,
      runner: 'optimized-composer',
      overallMean: {
        ...baseline.overallMean,
        inputTokens: baseline.overallMean.inputTokens * 0.5,
        latencyMs: baseline.overallMean.latencyMs * 1.2, // 20% slower
      },
    };
    const comparison = compareToBaseline(slower, baseline);
    expect(comparison.latencyWithinLimit).toBe(false);
    expect(comparison.classification).toBe('failed');
  });
});
