/**
 * Baseline_Benchmark capture tests (spec: veegpt-context-optimization, Task 3.5;
 * Req 2.1, 25.1, 25.2).
 *
 * These tests protect the persisted, version-controlled `baseline-benchmark.json`
 * reference:
 *   - it exists and is well-formed (Req 2.1);
 *   - it was captured against the LEGACY path with the Optimization_Flag OFF
 *     (Req 2.1, 25.2) — capture refuses to run when the flag is ON;
 *   - regenerating it deterministically reproduces the persisted content
 *     (excluding the volatile `capturedAt` timestamp), so the reference stays
 *     trustworthy and cannot silently drift;
 *   - it covers all 15 categories with the mean of the seven required metrics
 *     (Req 2.2/2.3).
 *
 * If this test fails after an intentional change to the request set or scoring,
 * regenerate the artifact:
 *     npx tsx tests/veegpt-baseline/capture-baseline.ts
 */

import { existsSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

import {
  BASELINE_ARTIFACT_PATH,
  BASELINE_RUNNER_NAME,
  BENCHMARK_CATEGORIES,
  MIN_REQUESTS_PER_CATEGORY,
  MIN_RUNS_PER_REQUEST,
  captureBaseline,
  deterministicPart,
  readBaselineArtifact,
  type RunMetrics,
} from './index';

describe('Baseline_Benchmark artifact (Req 2.1, 25.1, 25.2)', () => {
  it('persists a version-controlled artifact on disk', () => {
    expect(existsSync(BASELINE_ARTIFACT_PATH), `${BASELINE_ARTIFACT_PATH} must exist`).toBe(true);
  });

  it('regenerating deterministically reproduces the persisted reference', async () => {
    const persisted = readBaselineArtifact();
    const fresh = await captureBaseline();
    // Everything except the wall-clock capturedAt must match byte-for-byte.
    expect(deterministicPart(fresh)).toEqual(deterministicPart(persisted));
  });

  it('records the legacy runner and >= 3 runs per request', () => {
    const report = readBaselineArtifact();
    expect(report.runner).toBe(BASELINE_RUNNER_NAME);
    expect(report.runsPerRequest).toBeGreaterThanOrEqual(MIN_RUNS_PER_REQUEST);
    expect(report.capturedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
    for (const result of report.results) {
      expect(result.runs.length).toBeGreaterThanOrEqual(MIN_RUNS_PER_REQUEST);
    }
  });

  it('covers all 15 categories with >= 3 requests each (Req 2.2)', () => {
    const report = readBaselineArtifact();
    expect(BENCHMARK_CATEGORIES).toHaveLength(15);
    for (const category of BENCHMARK_CATEGORIES) {
      expect(
        report.categoryCounts[category],
        `category "${category}" needs >= ${MIN_REQUESTS_PER_CATEGORY} requests`,
      ).toBeGreaterThanOrEqual(MIN_REQUESTS_PER_CATEGORY);
    }
  });

  it('records the mean of all seven metrics per request (Req 2.3)', () => {
    const report = readBaselineArtifact();
    const metricKeys: (keyof RunMetrics)[] = [
      'inputTokens',
      'outputTokens',
      'latencyMs',
      'toolCallAccuracyPct',
      'answerQualityScore',
      'memoryRetentionPct',
      'contextRetentionPct',
    ];
    for (const result of report.results) {
      for (const key of metricKeys) {
        expect(result.mean[key], `${result.requestId}.${key}`).toBeTypeOf('number');
        expect(Number.isFinite(result.mean[key]), `${result.requestId}.${key} finite`).toBe(true);
      }
    }
    // Headline reference numbers are populated.
    expect(report.overallMean.inputTokens).toBeGreaterThan(0);
    expect(report.overallMean.outputTokens).toBeGreaterThan(0);
    expect(report.overallMean.latencyMs).toBeGreaterThan(0);
  });
});
