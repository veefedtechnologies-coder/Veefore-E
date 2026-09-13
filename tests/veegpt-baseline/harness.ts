/**
 * The Baseline_Benchmark harness (spec: veegpt-context-optimization, Req 2.3).
 *
 * Runs a version-controlled request set through a pluggable `RequestRunner`,
 * executes each request at least `runsPerRequest` (≥3) times, and records the
 * mean of the seven required metrics per request:
 *   input tokens, output tokens, latency (ms), tool-call accuracy %,
 *   answer-quality rubric (0–100), memory retention %, context retention %.
 *
 * The harness is runner-agnostic: this task drives it with a deterministic mock
 * provider (no live API keys); task 3.5 will pass a runner backed by the legacy
 * `buildPrompt` path to capture the actual Baseline_Benchmark.
 */

import {
  BENCHMARK_CATEGORIES,
  MIN_REQUESTS_PER_CATEGORY,
  MIN_RUNS_PER_REQUEST,
  type BenchmarkCategory,
  type BenchmarkReport,
  type BenchmarkRequest,
  type RequestBenchmarkResult,
  type RequestRunner,
  type RunMetrics,
} from './types';
import { scoreResponse } from './scoring';

export interface HarnessOptions {
  /** How many times to execute each request. Must be ≥ 3 (Req 2.3). */
  runsPerRequest?: number;
}

/** Result of validating a request set against the Req 2.2 category coverage. */
export interface RequestSetValidation {
  valid: boolean;
  categoryCounts: Record<BenchmarkCategory, number>;
  /** Categories with fewer than the required minimum requests. */
  missingCategories: BenchmarkCategory[];
  /** Requests whose id is duplicated. */
  duplicateIds: string[];
}

/**
 * Validate that a request set satisfies Req 2.2: ≥3 distinct requests for each
 * of the 15 categories, with no duplicate ids.
 */
export function validateRequestSet(requests: BenchmarkRequest[]): RequestSetValidation {
  const categoryCounts = Object.fromEntries(
    BENCHMARK_CATEGORIES.map((c) => [c, 0]),
  ) as Record<BenchmarkCategory, number>;

  const seenIds = new Set<string>();
  const duplicateIds: string[] = [];

  for (const req of requests) {
    if (seenIds.has(req.id)) duplicateIds.push(req.id);
    seenIds.add(req.id);
    if (req.category in categoryCounts) {
      categoryCounts[req.category] += 1;
    }
  }

  const missingCategories = BENCHMARK_CATEGORIES.filter(
    (c) => categoryCounts[c] < MIN_REQUESTS_PER_CATEGORY,
  );

  return {
    valid: missingCategories.length === 0 && duplicateIds.length === 0,
    categoryCounts,
    missingCategories,
    duplicateIds,
  };
}

/** Arithmetic mean of a metric across runs (0 for an empty set). */
function meanOf(runs: RunMetrics[], key: keyof RunMetrics): number {
  if (runs.length === 0) return 0;
  const sum = runs.reduce((acc, r) => acc + r[key], 0);
  const avg = sum / runs.length;
  return Math.round(avg * 100) / 100;
}

/** Compute the per-metric mean across a list of run metrics. */
export function meanMetrics(runs: RunMetrics[]): RunMetrics {
  return {
    inputTokens: meanOf(runs, 'inputTokens'),
    outputTokens: meanOf(runs, 'outputTokens'),
    latencyMs: meanOf(runs, 'latencyMs'),
    toolCallAccuracyPct: meanOf(runs, 'toolCallAccuracyPct'),
    answerQualityScore: meanOf(runs, 'answerQualityScore'),
    memoryRetentionPct: meanOf(runs, 'memoryRetentionPct'),
    contextRetentionPct: meanOf(runs, 'contextRetentionPct'),
  };
}

/**
 * Run the full benchmark. Executes every request `runsPerRequest` times through
 * the runner, scores each execution, and returns a report with per-request means
 * and an overall mean across all requests.
 *
 * Throws if the request set fails Req 2.2 validation or `runsPerRequest` < 3, so
 * an invalid baseline can never be silently captured.
 */
export async function runBenchmark(
  requests: BenchmarkRequest[],
  runner: RequestRunner,
  options: HarnessOptions = {},
): Promise<BenchmarkReport> {
  const runsPerRequest = options.runsPerRequest ?? MIN_RUNS_PER_REQUEST;
  if (runsPerRequest < MIN_RUNS_PER_REQUEST) {
    throw new Error(
      `runsPerRequest must be >= ${MIN_RUNS_PER_REQUEST} (Req 2.3), got ${runsPerRequest}`,
    );
  }

  const validation = validateRequestSet(requests);
  if (!validation.valid) {
    const problems: string[] = [];
    if (validation.missingCategories.length > 0) {
      problems.push(`under-covered categories: ${validation.missingCategories.join(', ')}`);
    }
    if (validation.duplicateIds.length > 0) {
      problems.push(`duplicate ids: ${validation.duplicateIds.join(', ')}`);
    }
    throw new Error(`Invalid Baseline_Benchmark request set (Req 2.2): ${problems.join('; ')}`);
  }

  const results: RequestBenchmarkResult[] = [];

  for (const request of requests) {
    const runs: RunMetrics[] = [];
    for (let i = 0; i < runsPerRequest; i++) {
      const response = await runner.run(request, i);
      runs.push(scoreResponse(request, response));
    }
    results.push({
      requestId: request.id,
      category: request.category,
      runner: runner.name,
      runs,
      mean: meanMetrics(runs),
    });
  }

  return {
    capturedAt: new Date().toISOString(),
    runner: runner.name,
    runsPerRequest,
    totalRequests: requests.length,
    categoryCounts: validation.categoryCounts,
    results,
    overallMean: meanMetrics(results.map((r) => r.mean)),
  };
}
