/**
 * After_Benchmark capture + comparison (spec: veegpt-context-optimization,
 * Task 11.4; Req 2.4, 2.5, 2.6).
 *
 * Re-runs the IDENTICAL version-controlled benchmark request set with the
 * `Optimization_Flag` ON — i.e. through the real optimized composer path
 * (`classifyIntent → selectModules → selectTools → compose`) via
 * `createAfterRunner()` — using the same run count and the same seven metrics as
 * the baseline (Req 2.4). It then compares the After_Benchmark against the
 * persisted `baseline-benchmark.json` reference and classifies the outcome
 * (Req 2.5):
 *
 *   SUCCESS  ⟺  mean input tokens drop ≥ 10%
 *              AND no behavioral metric regresses
 *              AND mean latency is not worse by more than 10%.
 *   FAILED   ⟺  otherwise — in which case the BASELINE is retained as the
 *              reference (Req 2.6) and the optimization is not release-eligible.
 *
 * Behavioral metrics compared (higher is better): tool-call accuracy, answer
 * quality, memory retention, context retention. Input tokens and latency are
 * lower-is-better. The comparison is emitted as two artifacts: a machine-readable
 * `after-benchmark.json` and a human-readable `after-benchmark.md` summary.
 */

import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { BASELINE_REQUEST_SET } from './request-set';
import { createAfterRunner, runComposerPath, AFTER_RUNNER_NAME } from './after-provider';
import { runBenchmark } from './harness';
import { readBaselineArtifact } from './capture-baseline';
import {
  MIN_RUNS_PER_REQUEST,
  type BenchmarkReport,
  type RunMetrics,
} from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Absolute path of the machine-readable After_Benchmark comparison artifact. */
export const AFTER_ARTIFACT_PATH = resolve(__dirname, 'after-benchmark.json');
/** Absolute path of the human-readable After_Benchmark markdown summary. */
export const AFTER_MARKDOWN_PATH = resolve(__dirname, 'after-benchmark.md');

/** The success gate: mean input tokens must drop by at least this percent. */
export const INPUT_TOKEN_REDUCTION_TARGET_PCT = 10;
/** The latency guard: mean latency may not be worse by more than this percent. */
export const LATENCY_REGRESSION_LIMIT_PCT = 10;

/** Behavioral metrics where a DECREASE vs baseline is a regression. */
export const BEHAVIORAL_METRICS: readonly (keyof RunMetrics)[] = [
  'toolCallAccuracyPct',
  'answerQualityScore',
  'memoryRetentionPct',
  'contextRetentionPct',
];

/** Tolerance for floating-point metric comparison (treat |Δ| < ε as equal). */
const EPSILON = 0.01;

// ---------------------------------------------------------------------------
// Comparison types
// ---------------------------------------------------------------------------

/** A single behavioral metric that regressed (after < baseline). */
export interface BehavioralRegression {
  metric: keyof RunMetrics;
  baseline: number;
  after: number;
  /** Per-request regressions (empty when only the overall mean regressed). */
  requests: Array<{ requestId: string; baseline: number; after: number }>;
}

export interface BenchmarkComparison {
  /** Mean input tokens (lower is better). */
  baselineInputTokens: number;
  afterInputTokens: number;
  /** Positive = tokens went DOWN (a reduction). */
  inputTokenReductionPct: number;
  /** Mean latency (lower is better). */
  baselineLatencyMs: number;
  afterLatencyMs: number;
  /** Positive = latency got WORSE (went up). */
  latencyDeltaPct: number;
  /** Behavioral metrics that regressed vs baseline (empty ⇒ none). */
  behavioralRegressions: BehavioralRegression[];
  /** True when mean input tokens dropped ≥ target. */
  tokenTargetMet: boolean;
  /** True when latency is not worse by more than the limit. */
  latencyWithinLimit: boolean;
  /** The overall classification. */
  classification: 'success' | 'failed';
  /** The reference retained going forward ('after' only on success). */
  retainedReference: 'baseline' | 'after';
  /** Plain-language reasons for the classification. */
  reasons: string[];
}

/** Round to 2 decimals for stable reporting. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Percent reduction of `after` vs `baseline` (positive = went down). */
function reductionPct(baseline: number, after: number): number {
  if (!(baseline > 0)) return 0;
  return round2(((baseline - after) / baseline) * 100);
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

/**
 * Compare an After_Benchmark report against the baseline reference and classify
 * the outcome per Req 2.5. Pure: reads only its two arguments.
 */
export function compareToBaseline(
  after: BenchmarkReport,
  baseline: BenchmarkReport,
): BenchmarkComparison {
  const baselineInputTokens = baseline.overallMean.inputTokens;
  const afterInputTokens = after.overallMean.inputTokens;
  const inputTokenReductionPct = reductionPct(baselineInputTokens, afterInputTokens);

  const baselineLatencyMs = baseline.overallMean.latencyMs;
  const afterLatencyMs = after.overallMean.latencyMs;
  // latencyDeltaPct positive ⇒ latency got worse (went up).
  const latencyDeltaPct = round2(
    baselineLatencyMs > 0
      ? ((afterLatencyMs - baselineLatencyMs) / baselineLatencyMs) * 100
      : 0,
  );

  // Index baseline per-request means for per-request regression detection.
  const baselineById = new Map(baseline.results.map((r) => [r.requestId, r.mean]));

  const behavioralRegressions: BehavioralRegression[] = [];
  for (const metric of BEHAVIORAL_METRICS) {
    const b = baseline.overallMean[metric];
    const a = after.overallMean[metric];

    const requests: BehavioralRegression['requests'] = [];
    for (const result of after.results) {
      const bm = baselineById.get(result.requestId);
      if (!bm) continue;
      if (result.mean[metric] < bm[metric] - EPSILON) {
        requests.push({
          requestId: result.requestId,
          baseline: bm[metric],
          after: result.mean[metric],
        });
      }
    }

    // A regression is either an overall-mean drop or ANY per-request drop.
    if (a < b - EPSILON || requests.length > 0) {
      behavioralRegressions.push({ metric, baseline: b, after: a, requests });
    }
  }

  const tokenTargetMet = inputTokenReductionPct >= INPUT_TOKEN_REDUCTION_TARGET_PCT;
  const latencyWithinLimit = latencyDeltaPct <= LATENCY_REGRESSION_LIMIT_PCT;
  const noBehavioralRegression = behavioralRegressions.length === 0;

  const classification: 'success' | 'failed' =
    tokenTargetMet && latencyWithinLimit && noBehavioralRegression ? 'success' : 'failed';

  const reasons: string[] = [];
  reasons.push(
    tokenTargetMet
      ? `Mean input tokens dropped ${inputTokenReductionPct}% (≥ ${INPUT_TOKEN_REDUCTION_TARGET_PCT}% target).`
      : `Mean input-token reduction ${inputTokenReductionPct}% is below the ${INPUT_TOKEN_REDUCTION_TARGET_PCT}% target.`,
  );
  reasons.push(
    latencyWithinLimit
      ? `Mean latency change ${latencyDeltaPct}% is within the +${LATENCY_REGRESSION_LIMIT_PCT}% limit.`
      : `Mean latency worsened ${latencyDeltaPct}% (> +${LATENCY_REGRESSION_LIMIT_PCT}% limit).`,
  );
  reasons.push(
    noBehavioralRegression
      ? 'No behavioral metric regressed (tool-call accuracy, answer quality, memory & context retention all held).'
      : `Behavioral regression detected: ${behavioralRegressions.map((r) => r.metric).join(', ')}.`,
  );

  return {
    baselineInputTokens,
    afterInputTokens,
    inputTokenReductionPct,
    baselineLatencyMs,
    afterLatencyMs,
    latencyDeltaPct,
    behavioralRegressions,
    tokenTargetMet,
    latencyWithinLimit,
    classification,
    retainedReference: classification === 'success' ? 'after' : 'baseline',
    reasons,
  };
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

/**
 * Capture the After_Benchmark: run the identical request set through the
 * optimized composer runner with the same run count as the baseline (Req 2.4).
 */
export async function captureAfterBenchmark(): Promise<BenchmarkReport> {
  return runBenchmark(BASELINE_REQUEST_SET, createAfterRunner(), {
    runsPerRequest: MIN_RUNS_PER_REQUEST,
  });
}

/** The full comparison payload persisted to `after-benchmark.json`. */
export interface AfterBenchmarkArtifact {
  capturedAt: string;
  runner: string;
  target: {
    inputTokenReductionPct: number;
    latencyRegressionLimitPct: number;
  };
  comparison: BenchmarkComparison;
  /** Per-request input-token reductions (for the savings breakdown). */
  perRequest: Array<{
    requestId: string;
    category: string;
    baselineInputTokens: number;
    afterInputTokens: number;
    reductionPct: number;
    exposedTools: string[];
    intents: string[];
    ambiguous: boolean;
  }>;
  after: BenchmarkReport;
}

/** Build the full comparison artifact (pure aside from reading the baseline). */
export async function buildAfterBenchmarkArtifact(): Promise<AfterBenchmarkArtifact> {
  const baseline = readBaselineArtifact();
  const after = await captureAfterBenchmark();
  const comparison = compareToBaseline(after, baseline);

  const baselineById = new Map(baseline.results.map((r) => [r.requestId, r.mean]));
  const perRequest = after.results.map((result) => {
    const b = baselineById.get(result.requestId);
    const baseTok = b ? b.inputTokens : 0;
    const composition = runComposerPath(
      BASELINE_REQUEST_SET.find((r) => r.id === result.requestId)!,
    );
    return {
      requestId: result.requestId,
      category: result.category,
      baselineInputTokens: baseTok,
      afterInputTokens: result.mean.inputTokens,
      reductionPct: reductionPct(baseTok, result.mean.inputTokens),
      exposedTools: composition.exposedTools,
      intents: composition.intents,
      ambiguous: composition.ambiguous,
    };
  });

  return {
    capturedAt: new Date().toISOString(),
    runner: AFTER_RUNNER_NAME,
    target: {
      inputTokenReductionPct: INPUT_TOKEN_REDUCTION_TARGET_PCT,
      latencyRegressionLimitPct: LATENCY_REGRESSION_LIMIT_PCT,
    },
    comparison,
    perRequest,
    after,
  };
}

/** Render the human-readable markdown summary of the comparison. */
export function renderAfterBenchmarkMarkdown(artifact: AfterBenchmarkArtifact): string {
  const c = artifact.comparison;
  const lines: string[] = [];

  lines.push('# VeeGPT Context Optimization — After_Benchmark');
  lines.push('');
  lines.push(`_Captured: ${artifact.capturedAt}_`);
  lines.push('');
  lines.push(
    `**Classification: ${c.classification.toUpperCase()}** ` +
      `(reference retained: \`${c.retainedReference}\`)`,
  );
  lines.push('');
  lines.push('## Headline metrics (mean across all requests)');
  lines.push('');
  lines.push('| Metric | Baseline (flag OFF) | After (flag ON) | Change |');
  lines.push('|---|---:|---:|---:|');
  lines.push(
    `| Input tokens | ${c.baselineInputTokens} | ${c.afterInputTokens} | ` +
      `−${c.inputTokenReductionPct}% |`,
  );
  lines.push(
    `| Latency (ms) | ${c.baselineLatencyMs} | ${c.afterLatencyMs} | ` +
      `${c.latencyDeltaPct >= 0 ? '+' : ''}${c.latencyDeltaPct}% |`,
  );
  for (const metric of BEHAVIORAL_METRICS) {
    const regressed = c.behavioralRegressions.find((r) => r.metric === metric);
    const afterVal = artifact.after.overallMean[metric];
    const change = regressed ? `${round2(afterVal - regressed.baseline)}` : 'no regression';
    lines.push(`| ${metric} | ${regressed ? regressed.baseline : afterVal} | ${afterVal} | ${change} |`);
  }
  lines.push('');
  lines.push('## Gate');
  lines.push('');
  lines.push(
    `- Input-token reduction ≥ ${artifact.target.inputTokenReductionPct}%: ` +
      `**${c.tokenTargetMet ? 'PASS' : 'FAIL'}** (${c.inputTokenReductionPct}%)`,
  );
  lines.push(
    `- Latency not worse by > ${artifact.target.latencyRegressionLimitPct}%: ` +
      `**${c.latencyWithinLimit ? 'PASS' : 'FAIL'}** (${c.latencyDeltaPct}%)`,
  );
  lines.push(
    `- No behavioral regression: **${c.behavioralRegressions.length === 0 ? 'PASS' : 'FAIL'}**` +
      (c.behavioralRegressions.length
        ? ` (${c.behavioralRegressions.map((r) => r.metric).join(', ')})`
        : ''),
  );
  lines.push('');
  for (const reason of c.reasons) lines.push(`- ${reason}`);
  lines.push('');
  lines.push('## Per-request input-token savings');
  lines.push('');
  lines.push('| Request | Category | Baseline | After | Reduction | Tools exposed | Ambiguous |');
  lines.push('|---|---|---:|---:|---:|---:|:---:|');
  for (const r of artifact.perRequest) {
    lines.push(
      `| ${r.requestId} | ${r.category} | ${r.baselineInputTokens} | ${r.afterInputTokens} | ` +
        `−${r.reductionPct}% | ${r.exposedTools.length} | ${r.ambiguous ? 'yes' : 'no'} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

/** Read the persisted After_Benchmark artifact. */
export function readAfterBenchmarkArtifact(): AfterBenchmarkArtifact {
  const raw = readFileSync(AFTER_ARTIFACT_PATH, 'utf8');
  return JSON.parse(raw) as AfterBenchmarkArtifact;
}

/**
 * Capture, compare, and persist both After_Benchmark artifacts. Returns the
 * artifact that was written.
 */
export async function writeAfterBenchmarkArtifacts(): Promise<AfterBenchmarkArtifact> {
  const artifact = await buildAfterBenchmarkArtifact();
  writeFileSync(AFTER_ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  writeFileSync(AFTER_MARKDOWN_PATH, `${renderAfterBenchmarkMarkdown(artifact)}\n`, 'utf8');
  return artifact;
}

// When executed directly (`tsx tests/veegpt-baseline/after-benchmark.ts`),
// regenerate the After_Benchmark artifacts and print the headline result.
if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  writeAfterBenchmarkArtifacts()
    .then((artifact) => {
      const c = artifact.comparison;
      // eslint-disable-next-line no-console
      console.log(
        `After_Benchmark (flag ON) → ${AFTER_ARTIFACT_PATH}\n` +
          `  classification=${c.classification} retainedReference=${c.retainedReference}\n` +
          `  mean input tokens: ${c.baselineInputTokens} → ${c.afterInputTokens} ` +
          `(−${c.inputTokenReductionPct}%, target ${INPUT_TOKEN_REDUCTION_TARGET_PCT}%)\n` +
          `  mean latency: ${c.baselineLatencyMs} → ${c.afterLatencyMs} (${c.latencyDeltaPct}%)\n` +
          `  behavioral regressions: ${c.behavioralRegressions.length}`,
      );
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to capture After_Benchmark:', err);
      process.exit(1);
    });
}
