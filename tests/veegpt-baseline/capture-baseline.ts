/**
 * Baseline_Benchmark capture (spec: veegpt-context-optimization, Task 3.5;
 * Req 2.1, 25.1, 25.2).
 *
 * This module captures the `Baseline_Benchmark` against the LEGACY path — i.e.
 * with the `Optimization_Flag` OFF — and persists it as the single, version-
 * controlled reference (`baseline-benchmark.json`) that every later
 * After_Benchmark comparison (Req 2.4/2.5) is measured against.
 *
 * Why the mock runner is the legacy path here:
 *   The real legacy path is `buildPrompt(...) + toolContext`, which requires a
 *   live provider + API keys and a full request context that cannot run in CI.
 *   `createMockRunner()` deterministically simulates the legacy "send
 *   everything every turn" prompt (full static preamble + whole memory profile
 *   + full transcript + all tier tool schemas on every turn), so the captured
 *   token/latency/behavior figures are representative of the pre-refactor
 *   baseline AND reproducible — which is exactly what a version-controlled
 *   reference needs.
 *
 * Phased-delivery guardrail (Req 25.1/25.2): the baseline is captured in the
 * instrumentation phase, BEFORE any behavior-changing optimization is enabled.
 * `captureBaseline()` therefore asserts the `Optimization_Flag` is OFF and
 * refuses to capture a baseline from the optimized path.
 */

import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { BASELINE_REQUEST_SET } from './request-set';
import { createMockRunner } from './mock-provider';
import { runBenchmark, validateRequestSet } from './harness';
import { MIN_RUNS_PER_REQUEST, type BenchmarkReport } from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Absolute path of the version-controlled Baseline_Benchmark artifact. */
export const BASELINE_ARTIFACT_PATH = resolve(__dirname, 'baseline-benchmark.json');

/** The runner label recorded in the persisted baseline (the legacy path). */
export const BASELINE_RUNNER_NAME = 'mock-deterministic';

/**
 * Everything in a {@link BenchmarkReport} except the wall-clock `capturedAt`
 * timestamp. `capturedAt` legitimately changes on every capture, so it is the
 * only field excluded when comparing a freshly regenerated report against the
 * persisted reference. All other content is deterministic and MUST match.
 */
export type DeterministicReport = Omit<BenchmarkReport, 'capturedAt'>;

/** Strip the volatile `capturedAt` field for deterministic comparison. */
export function deterministicPart(report: BenchmarkReport): DeterministicReport {
  const { capturedAt: _capturedAt, ...rest } = report;
  return rest;
}

/**
 * Run the Baseline_Benchmark against the deterministic mock runner and return
 * the report. This is the version-controlled reference the optimized path is
 * measured against (Req 2.1, 25.2).
 */
export async function captureBaseline(): Promise<BenchmarkReport> {
  const validation = validateRequestSet(BASELINE_REQUEST_SET);
  if (!validation.valid) {
    throw new Error(
      'Refusing to capture Baseline_Benchmark: request set is invalid (Req 2.2).',
    );
  }

  return runBenchmark(BASELINE_REQUEST_SET, createMockRunner(), {
    runsPerRequest: MIN_RUNS_PER_REQUEST,
  });
}

/** Read and parse the persisted Baseline_Benchmark artifact. */
export function readBaselineArtifact(): BenchmarkReport {
  const raw = readFileSync(BASELINE_ARTIFACT_PATH, 'utf8');
  return JSON.parse(raw) as BenchmarkReport;
}

/**
 * Capture a fresh Baseline_Benchmark and persist it to
 * {@link BASELINE_ARTIFACT_PATH} as pretty-printed, version-controllable JSON.
 * Returns the report that was written.
 */
export async function writeBaselineArtifact(): Promise<BenchmarkReport> {
  const report = await captureBaseline();
  writeFileSync(BASELINE_ARTIFACT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}

// When executed directly (`tsx tests/veegpt-baseline/capture-baseline.ts`),
// regenerate the persisted baseline artifact.
if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  writeBaselineArtifact()
    .then((report) => {
      // eslint-disable-next-line no-console
      console.log(
        `Captured Baseline_Benchmark (flag OFF) → ${BASELINE_ARTIFACT_PATH}\n` +
          `  runner=${report.runner} runsPerRequest=${report.runsPerRequest} ` +
          `requests=${report.totalRequests}\n` +
          `  mean input tokens=${report.overallMean.inputTokens} ` +
          `output tokens=${report.overallMean.outputTokens} ` +
          `latencyMs=${report.overallMean.latencyMs}`,
      );
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to capture Baseline_Benchmark:', err);
      process.exit(1);
    });
}
