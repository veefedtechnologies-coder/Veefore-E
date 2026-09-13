/**
 * Deterministic mock provider for the Baseline_Benchmark harness
 * (spec: veegpt-context-optimization, Req 2.3).
 *
 * This runner lets the harness execute end-to-end WITHOUT live API keys. It is
 * fully deterministic: given the same request and run index it produces the same
 * response, so a captured baseline is reproducible. Latency is derived from a
 * seeded hash of (id + runIndex) so it varies slightly across runs — which makes
 * the "mean across runs" (Req 2.3) a meaningful, non-degenerate number while
 * staying reproducible.
 *
 * The mock also *simulates the legacy "send everything every turn" prompt* when
 * estimating input tokens, so the token figures the harness records are
 * representative of the pre-refactor baseline rather than an artificial minimum.
 *
 * NOTE: this is intentionally NOT wired to the real chat route. Task 3.5 will
 * provide a runner backed by the legacy `buildPrompt` path to capture the actual
 * Baseline_Benchmark; this mock proves the harness and request set are correct.
 */

import { estimateTokens } from '../../server/services/aiUsageTracker';
import type { BenchmarkRequest, ProviderResponse, RequestRunner } from './types';

/**
 * A large static instruction block standing in for the legacy `buildPrompt`
 * static behavior + safety + rich-output spec that is sent on EVERY turn. Its
 * size is representative (not the real text) so baseline input-token counts
 * reflect the "everything every turn" cost the refactor targets.
 */
export const STATIC_PREAMBLE = [
  'You are VeeGPT, an expert AI assistant for social-media creators inside Veefore.',
  'Follow all platform safety and policy rules at all times. Never fabricate analytics.',
  'When emitting a chart or visualization, use the fenced ```viz block spec exactly as defined.',
  'Respect the user subscription tier and only offer capabilities available to that tier.',
  'Preserve brand voice, tone, formatting, and rich-output contracts on every response.',
  'You have access to workspace data, scheduling, analytics, research, and memory tools.',
  'Always ground factual claims about the account in real tool results, never assumptions.',
].join(' ');

/**
 * The source lines the representative tool-schema blob is built from. Every VeeGPT
 * tool name appears exactly once across these lines. Exported so the optimized
 * (flag-ON) After_Benchmark runner can build a tool block on the IDENTICAL token
 * basis, scoped to only the tools it exposes — which is what makes the
 * before/after input-token comparison apples-to-apples (Req 2.4/2.5).
 */
export const TOOL_SCHEMA_LINES: readonly string[] = [
  'schedule_post generate_caption generate_hashtags get_analytics_insight get_best_posting_time',
  'research_trends search_web deep_research remember_fact update_memory forget_memory',
  'get_workspace_data get_account_details reschedule_post cancel_scheduled_post',
  'update_post_caption delete_post duplicate_post',
];

/** Every tool name the representative schema blob knows about. */
export const ALL_TOOL_SCHEMA_NAMES: readonly string[] = TOOL_SCHEMA_LINES.join(
  ' ',
).split(' ');

/**
 * Build a representative tool-schema blob covering ONLY the given tool names, on
 * the exact token basis the baseline uses. Each tool carries a JSON schema +
 * description, modeled here by repeating the (filtered) name lines 6× so the
 * per-tool cost is representative rather than a single token.
 *
 * INVARIANT: `toolSchemaBlock(ALL_TOOL_SCHEMA_NAMES)` is byte-identical to the
 * legacy "full tier set every turn" blob, so refactoring the baseline mock to
 * use this helper does NOT change any captured baseline number.
 */
export function toolSchemaBlock(exposedNames: readonly string[]): string {
  const set = new Set(exposedNames);
  const scoped = TOOL_SCHEMA_LINES.map((line) =>
    line
      .split(' ')
      .filter((name) => set.has(name))
      .join(' '),
  )
    .filter((line) => line.length > 0)
    .join(' ');
  return scoped.repeat(6);
}

/** A representative tool-schema blob — legacy exposes the full tier set every turn. */
const FULL_TOOL_SCHEMAS = toolSchemaBlock(ALL_TOOL_SCHEMA_NAMES);

/** Deterministic 32-bit string hash (FNV-1a) for seeded pseudo-latency. */
export function hash(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Build the representative legacy-style prompt the provider would receive. */
function buildLegacyStylePrompt(request: BenchmarkRequest): string {
  const parts: string[] = [STATIC_PREAMBLE];

  if (request.persona) {
    parts.push(
      `ACTIVE EXPERT MODE: ${request.persona}. Apply the ${request.persona} persona directives with precedence over general behavior.`,
    );
  }

  // Legacy injects the whole memory profile every turn.
  const memoryProfile = [
    ...request.expectedMemoryItems,
    'user primarily posts on Instagram',
    'user prefers concise answers',
  ];
  parts.push(`USER MEMORY:\n${memoryProfile.map((m) => `- ${m}`).join('\n')}`);

  // Legacy injects the full verbatim transcript up to the window cap.
  if (request.priorMessages.length > 0) {
    parts.push(
      `--- Conversation ---\n${request.priorMessages
        .map((m) => `${m.role === 'user' ? 'User' : 'VeeGPT'}: ${m.content}`)
        .join('\n')}`,
    );
  }

  // Legacy exposes all tier-permitted tool schemas every turn.
  parts.push(`TOOLS:\n${FULL_TOOL_SCHEMAS}`);

  parts.push(`User: ${request.message}`);
  parts.push('VeeGPT:');
  return parts.join('\n\n');
}

/**
 * Produce the deterministic answer text. It references the expected memory and
 * context items (so retention scores are meaningful) and acknowledges tool
 * failure / provider fallback where the request simulates them.
 */
export function buildAnswerText(request: BenchmarkRequest): string {
  const lines: string[] = [];

  if (request.simulateProviderFallback) {
    lines.push('(Handled via fallback provider.)');
  }
  if (request.simulateToolFailure) {
    lines.push(
      'I ran into a problem completing that action and could not finish it. You can try again in a moment.',
    );
  }

  // A short on-topic answer body.
  lines.push(`Here is my response to: "${request.message}".`);

  // Recall memory + retained context so those metrics reflect real behavior.
  for (const item of request.expectedMemoryItems) {
    lines.push(`Noting your saved detail: ${item}.`);
  }
  for (const item of request.expectedContextItems) {
    lines.push(`Building on our earlier point about ${item}.`);
  }

  if (request.expectedTools.length > 0 && !request.simulateToolFailure) {
    lines.push(`I used ${request.expectedTools.join(', ')} to complete this.`);
  }

  return lines.join(' ');
}

/**
 * Determine which tools the mock "calls". By default it calls exactly the
 * expected tools (a healthy baseline). On simulated tool failure it still
 * attempts the tool (the call is made, then fails), preserving tool-call
 * accuracy while the text reflects graceful degradation.
 */
export function resolveToolCalls(request: BenchmarkRequest): string[] {
  const calls = [...request.expectedTools];
  if (request.forcedTool && !calls.includes(request.forcedTool)) {
    calls.push(request.forcedTool);
  }
  return calls;
}

/**
 * Create a deterministic mock runner. `baseLatencyMs` and `jitterMs` shape the
 * seeded pseudo-latency so runs differ but remain reproducible.
 */
export function createMockRunner(
  opts: { baseLatencyMs?: number; jitterMs?: number } = {},
): RequestRunner {
  const baseLatencyMs = opts.baseLatencyMs ?? 400;
  const jitterMs = opts.jitterMs ?? 250;

  return {
    name: 'mock-deterministic',
    run(request: BenchmarkRequest, runIndex: number): ProviderResponse {
      const prompt = buildLegacyStylePrompt(request);
      const text = buildAnswerText(request);
      const toolCalls = resolveToolCalls(request);

      // Seeded, reproducible latency that varies per run.
      const seed = hash(`${request.id}#${runIndex}`);
      const latencyMs = baseLatencyMs + (seed % (jitterMs + 1));

      return {
        text,
        toolCalls,
        inputTokens: estimateTokens(prompt),
        outputTokens: estimateTokens(text),
        latencyMs,
        providerFellBack: Boolean(request.simulateProviderFallback),
      };
    },
  };
}
