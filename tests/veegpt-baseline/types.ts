/**
 * Baseline_Benchmark types (spec: veegpt-context-optimization, Req 2).
 *
 * These types describe the *version-controlled request set* and the metrics the
 * harness records for each request. They are deliberately provider-agnostic: the
 * harness runs any `RequestRunner`, so the same request set + scoring can be
 * driven by a deterministic mock provider (this task) OR wired to the legacy
 * `buildPrompt` path when the Baseline_Benchmark is captured (task 3.5).
 *
 * Metrics recorded per Req 2.3 (mean across ≥3 runs):
 *   - input tokens, output tokens, latency (ms)
 *   - tool-call accuracy (% of expected tool calls made)
 *   - final-answer quality (rubric score 0–100)
 *   - memory retention (% of expected memory items recalled)
 *   - context retention (% of expected context items retained)
 */

/** The 15 required Baseline_Benchmark categories (Req 2.2). */
export type BenchmarkCategory =
  | 'simple-chat'
  | 'follow-up'
  | 'content-creation'
  | 'analytics'
  | 'social-listening'
  | 'scheduling'
  | 'automation'
  | 'multi-tool'
  | 'memory-dependent'
  | 'long-conversation'
  | 'ambiguous'
  | 'persona-dependent'
  | 'tool-failure'
  | 'provider-fallback'
  | 'complex-reasoning';

/** All categories, in a stable order — the harness validates ≥3 requests each. */
export const BENCHMARK_CATEGORIES: readonly BenchmarkCategory[] = [
  'simple-chat',
  'follow-up',
  'content-creation',
  'analytics',
  'social-listening',
  'scheduling',
  'automation',
  'multi-tool',
  'memory-dependent',
  'long-conversation',
  'ambiguous',
  'persona-dependent',
  'tool-failure',
  'provider-fallback',
  'complex-reasoning',
] as const;

/** Minimum number of distinct requests required per category (Req 2.2). */
export const MIN_REQUESTS_PER_CATEGORY = 3;

/** Minimum number of runs each request must be executed (Req 2.3). */
export const MIN_RUNS_PER_REQUEST = 3;

export type BenchmarkTier = 'basic' | 'full' | 'advanced';

export interface BenchmarkMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * One version-controlled benchmark request. The `expected*` fields are the
 * ground truth the scoring functions grade a provider response against.
 */
export interface BenchmarkRequest {
  /** Stable, unique id (used as the seed for deterministic runs). */
  id: string;
  category: BenchmarkCategory;
  /** Human-readable purpose of the request. */
  description: string;
  /** Conversation turns BEFORE the current message (empty for new chats). */
  priorMessages: BenchmarkMessage[];
  /** The current user message under test. */
  message: string;
  /** Selected expert persona/agent id, when the request depends on one. */
  persona?: string;
  /** Subscription tier that gates tools/personas. Defaults to 'advanced'. */
  tier?: BenchmarkTier;
  /** A tool explicitly forced from the composer, if any. */
  forcedTool?: string;
  /** When true, the run simulates the selected tool failing. */
  simulateToolFailure?: boolean;
  /** When true, the run simulates a provider fallback occurring. */
  simulateProviderFallback?: boolean;
  /** Tool names the correct response is expected to call (tool-call accuracy). */
  expectedTools: string[];
  /** Durable memory items the answer is expected to recall (memory retention). */
  expectedMemoryItems: string[];
  /** Earlier-context items the answer is expected to retain (context retention). */
  expectedContextItems: string[];
}

/** The response a `RequestRunner` produces for one execution of a request. */
export interface ProviderResponse {
  /** The final answer text streamed to the user. */
  text: string;
  /** Names of the tools the provider actually invoked. */
  toolCalls: string[];
  /** Input (prompt) tokens the provider received. */
  inputTokens: number;
  /** Output (completion) tokens the provider produced. */
  outputTokens: number;
  /** Observed latency for this execution, in milliseconds. */
  latencyMs: number;
  /** Whether a provider fallback occurred during this execution. */
  providerFellBack?: boolean;
}

/**
 * A pluggable execution backend. The mock provider implements this
 * deterministically so the harness runs with no live API keys; task 3.5 will
 * provide a runner backed by the legacy `buildPrompt` path.
 */
export interface RequestRunner {
  /** A label recorded in the report (e.g. "mock-deterministic", "legacy"). */
  readonly name: string;
  run(request: BenchmarkRequest, runIndex: number): Promise<ProviderResponse> | ProviderResponse;
}

/** The seven metrics recorded per Req 2.3 for a single execution. */
export interface RunMetrics {
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  toolCallAccuracyPct: number;
  answerQualityScore: number;
  memoryRetentionPct: number;
  contextRetentionPct: number;
}

/** Per-request aggregate: every run plus the mean across runs (Req 2.3). */
export interface RequestBenchmarkResult {
  requestId: string;
  category: BenchmarkCategory;
  runner: string;
  runs: RunMetrics[];
  mean: RunMetrics;
}

/** The full Baseline_Benchmark report the harness produces. */
export interface BenchmarkReport {
  capturedAt: string;
  runner: string;
  runsPerRequest: number;
  totalRequests: number;
  categoryCounts: Record<BenchmarkCategory, number>;
  results: RequestBenchmarkResult[];
  /** Mean of each metric across every request (the headline numbers). */
  overallMean: RunMetrics;
}
