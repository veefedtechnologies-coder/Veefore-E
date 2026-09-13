/**
 * Deterministic scoring functions for the Baseline_Benchmark
 * (spec: veegpt-context-optimization, Req 2.3).
 *
 * These grade a `ProviderResponse` against a `BenchmarkRequest`'s ground truth.
 * They are pure and deterministic so the same response always yields the same
 * scores, which is what makes a captured baseline reproducible and comparable to
 * a later After_Benchmark (Req 2.4/2.5).
 *
 * Every percentage uses the "vacuously true" convention: when nothing is
 * expected AND nothing was produced, the score is 100 (perfect); when nothing is
 * expected but something WAS produced (e.g. an unexpected tool call), the score
 * is penalized.
 */

import type { BenchmarkRequest, ProviderResponse, RunMetrics } from './types';

/** Case-insensitive containment against the response text. */
function mentions(text: string, needle: string): boolean {
  return text.toLowerCase().includes(needle.toLowerCase());
}

/** Clamp to [0, 100] and round to a stable integer-ish value. */
function pct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const clamped = Math.max(0, Math.min(100, n));
  return Math.round(clamped * 100) / 100;
}

/**
 * Tool-call accuracy: the Jaccard overlap between expected and actual tool sets,
 * as a percentage. This rewards calling the right tools and penalizes both
 * missing an expected tool and calling an unexpected one.
 *
 * Empty expected + empty actual → 100 (correctly called nothing).
 */
export function scoreToolCallAccuracy(expected: string[], actual: string[]): number {
  const exp = new Set(expected);
  const act = new Set(actual);
  if (exp.size === 0 && act.size === 0) return 100;

  let intersection = 0;
  for (const t of exp) if (act.has(t)) intersection++;
  const union = new Set([...exp, ...act]).size;
  return pct((intersection / union) * 100);
}

/**
 * Retention: percentage of expected items whose text appears in the response.
 * Empty expected → 100 (nothing to retain).
 */
export function scoreRetention(text: string, expectedItems: string[]): number {
  if (expectedItems.length === 0) return 100;
  let hit = 0;
  for (const item of expectedItems) if (mentions(text, item)) hit++;
  return pct((hit / expectedItems.length) * 100);
}

/**
 * Final-answer quality rubric (0–100). A deterministic composite of five
 * signals, each weighted, so a well-formed answer that honors tools/memory/
 * context scores high and an empty or off-target answer scores low:
 *
 *   - non-empty answer        (20)
 *   - adequate length         (15)  — a real answer, not a stub
 *   - correct tool usage      (25)  — scaled by tool-call accuracy
 *   - memory recalled         (20)  — scaled by memory retention
 *   - context retained        (20)  — scaled by context retention
 */
export function scoreAnswerQuality(
  request: BenchmarkRequest,
  response: ProviderResponse,
  toolAccuracy: number,
  memoryRetention: number,
  contextRetention: number,
): number {
  const text = response.text ?? '';
  const nonEmpty = text.trim().length > 0 ? 20 : 0;
  const adequateLength = text.trim().length >= 20 ? 15 : text.trim().length > 0 ? 7 : 0;
  const toolComponent = (toolAccuracy / 100) * 25;
  const memoryComponent = (memoryRetention / 100) * 20;
  const contextComponent = (contextRetention / 100) * 20;
  return pct(nonEmpty + adequateLength + toolComponent + memoryComponent + contextComponent);
}

/** Grade a single provider response into the seven Req 2.3 metrics. */
export function scoreResponse(
  request: BenchmarkRequest,
  response: ProviderResponse,
): RunMetrics {
  const toolCallAccuracyPct = scoreToolCallAccuracy(request.expectedTools, response.toolCalls);
  const memoryRetentionPct = scoreRetention(response.text, request.expectedMemoryItems);
  const contextRetentionPct = scoreRetention(response.text, request.expectedContextItems);
  const answerQualityScore = scoreAnswerQuality(
    request,
    response,
    toolCallAccuracyPct,
    memoryRetentionPct,
    contextRetentionPct,
  );

  return {
    inputTokens: Math.max(0, Math.round(response.inputTokens)),
    outputTokens: Math.max(0, Math.round(response.outputTokens)),
    latencyMs: Math.max(0, Math.round(response.latencyMs)),
    toolCallAccuracyPct,
    answerQualityScore,
    memoryRetentionPct,
    contextRetentionPct,
  };
}
