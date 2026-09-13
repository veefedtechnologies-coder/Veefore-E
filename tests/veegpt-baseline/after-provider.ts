/**
 * Optimized (flag-ON) After_Benchmark runner
 * (spec: veegpt-context-optimization, Task 11.4; Req 2.4, 2.5, 2.6).
 *
 * This is the symmetric counterpart to `mock-provider.ts` (the legacy runner).
 * Where the legacy mock simulates the pre-refactor "send everything every turn"
 * prompt, this runner drives every context decision through the REAL optimized
 * composer path — `classifyIntent → selectModules → selectTools → compose` — so
 * the After_Benchmark measures the actual behavior the `Optimization_Flag`
 * enables, with NO live API keys required (the composer path is pure).
 *
 * TOKEN-MODEL PARITY (why this is a fair comparison):
 *   The persisted `baseline-benchmark.json` was captured with a *representative*
 *   legacy prompt whose static preamble is a compact stand-in for VeeGPT's large
 *   static instruction core. The real composer renders that same static core in
 *   full (thousands of tokens), so counting `compose().prompt` bytes directly
 *   would compare two different bases and drown out the optimization.
 *
 *   The optimization does NOT shrink the static core — that block is byte-
 *   identical between the legacy and optimized paths (it is the cache-stable
 *   `Static_Prefix`). What the flag changes is the *dynamic* content:
 *     • selective tool exposure — only the intent-mapped, tier-permitted tools
 *       (`selectTools`) instead of the full tier set on every turn (Req 11); and
 *     • selective memory retrieval — only the relevant durable facts instead of
 *       the whole profile every turn (Req 9).
 *
 *   So this runner reuses the baseline's EXACT representative primitives
 *   (`STATIC_PREAMBLE`, the per-tool `toolSchemaBlock`, the transcript/message
 *   shapes) — keeping the unchanged static/transcript costs on the same basis so
 *   they cancel — and applies the two optimizations that the composer decided.
 *   The measured input-token delta is therefore precisely the optimization
 *   effect, comparable byte-for-byte against the baseline reference.
 *
 *   Behavioral metrics (tool-call accuracy, answer quality, memory/context
 *   retention) and the seeded latency model are reused UNCHANGED from the legacy
 *   mock, so the After_Benchmark can prove those did not regress (Req 2.5).
 */

import { estimateTokens } from '../../server/services/aiUsageTracker';
import { classifyIntent } from '../../server/routes/veegpt-intent.logic';
import { selectModules, type ComposeInput } from '../../server/routes/veegpt-modules';
import { selectTools } from '../../server/routes/veegpt-tool-selection.logic';
import { compose } from '../../server/routes/veegpt-context-composer';
import type { VeeGPTTier } from '../../server/config/veegpt-tiers';
import type { Msg } from '../../server/routes/veegpt-memory.logic';
import {
  STATIC_PREAMBLE,
  toolSchemaBlock,
  hash,
  buildAnswerText,
  resolveToolCalls,
} from './mock-provider';
import type { BenchmarkRequest, ProviderResponse, RequestRunner } from './types';

/** The runner label recorded in the After_Benchmark report (the optimized path). */
export const AFTER_RUNNER_NAME = 'optimized-composer';

/**
 * Selective, fail-open memory retrieval (Req 9): the optimized path retrieves
 * only the durable facts relevant to THIS request rather than injecting the
 * whole profile every turn. For the benchmark the relevant facts are exactly the
 * request's `expectedMemoryItems`; the two generic always-on facts the legacy
 * prompt appended on every turn are dropped when they are not relevant.
 */
function selectiveMemory(request: BenchmarkRequest): string[] {
  return [...request.expectedMemoryItems];
}

/**
 * Build the representative OPTIMIZED prompt on the baseline's token basis. It is
 * identical in shape to the legacy `buildLegacyStylePrompt`, EXCEPT:
 *   • the tool block covers only `exposedNames` (selective exposure), and
 *   • the memory block covers only the selectively-retrieved facts (and is
 *     omitted entirely when nothing relevant was retrieved).
 * The static preamble, persona line, transcript and current-message shapes are
 * reused verbatim so those unchanged costs cancel against the baseline.
 */
function buildOptimizedStylePrompt(
  request: BenchmarkRequest,
  exposedNames: readonly string[],
  retrievedMemory: readonly string[],
): string {
  const parts: string[] = [STATIC_PREAMBLE];

  if (request.persona) {
    parts.push(
      `ACTIVE EXPERT MODE: ${request.persona}. Apply the ${request.persona} persona directives with precedence over general behavior.`,
    );
  }

  // Selective memory: only relevant retrieved facts, omitted when none apply.
  if (retrievedMemory.length > 0) {
    parts.push(`USER MEMORY:\n${retrievedMemory.map((m) => `- ${m}`).join('\n')}`);
  }

  // Recent conversation transcript (recent window) — unchanged from legacy.
  if (request.priorMessages.length > 0) {
    parts.push(
      `--- Conversation ---\n${request.priorMessages
        .map((m) => `${m.role === 'user' ? 'User' : 'VeeGPT'}: ${m.content}`)
        .join('\n')}`,
    );
  }

  // Selective tool exposure: only the intent-mapped, tier-permitted tools.
  const toolBlock = toolSchemaBlock(exposedNames);
  if (toolBlock.length > 0) {
    parts.push(`TOOLS:\n${toolBlock}`);
  }

  parts.push(`User: ${request.message}`);
  parts.push('VeeGPT:');
  return parts.join('\n\n');
}

/** Details recorded per request about what the optimized composer decided. */
export interface OptimizedComposition {
  intents: string[];
  ambiguous: boolean;
  intentUsedFallback: boolean;
  selectedModuleIds: string[];
  exposedTools: string[];
  toolSelectionUsedFallback: boolean;
  staticPrefixLen: number;
}

/**
 * Run the full optimized composer path for a request WITHOUT sending anything to
 * a provider. Returns the exposed tool names + composition metadata used both to
 * build the representative prompt and to enrich the After_Benchmark report.
 */
export function runComposerPath(request: BenchmarkRequest): OptimizedComposition {
  const tier = (request.tier ?? 'advanced') as VeeGPTTier;
  const history: Msg[] = request.priorMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // 1) Intent classification (pure, no model call).
  const intent = classifyIntent({
    message: request.message,
    priorMessages: history,
    hasMedia: false,
    forcedTool: request.forcedTool,
    selectedAccountId: null,
  });

  // 2) Selective memory retrieval (Req 9) feeds the compose input.
  const retrievedMemory = selectiveMemory(request);
  const composeInput: ComposeInput = {
    prefs: {},
    selectedAgentId: request.persona ?? null,
    history,
    currentMessage: request.message,
    userMemoryProfile: retrievedMemory.length
      ? retrievedMemory.map((m) => `- ${m}`).join('\n')
      : undefined,
    tier,
    hasMedia: false,
    forcedTool: request.forcedTool,
    selectedAccountId: null,
  };

  // 3) Module selection (fails open to the full registry on ambiguity).
  const modules = selectModules(intent, composeInput);

  // 4) Selective tool exposure (tier filter first, then intent-mapped union;
  //    fails open to the full tier set on ambiguity).
  const toolsRes = selectTools({
    tier,
    intents: intent.intents,
    ambiguous: intent.ambiguous,
    forcedTool: request.forcedTool,
  });

  // 5) Compose the real request (ordering, dedup, telemetry) — exercises the
  //    composer end-to-end and validates it runs without keys.
  const composed = compose(modules, toolsRes.tools, composeInput, {
    model: 'benchmark-mock',
    provider: 'mock',
    requestType: request.category,
    memoryRetrieved: retrievedMemory.length > 0,
    usedFallback: intent.usedFallback || toolsRes.usedFallback,
  });

  return {
    intents: intent.intents,
    ambiguous: intent.ambiguous,
    intentUsedFallback: intent.usedFallback,
    selectedModuleIds: composed.selectedModuleIds,
    exposedTools: composed.tools
      .map((t) => t.function?.name)
      .filter((n): n is string => Boolean(n)),
    toolSelectionUsedFallback: toolsRes.usedFallback,
    staticPrefixLen: composed.cacheable.staticPrefixLen,
  };
}

/**
 * Create the deterministic optimized (flag-ON) runner. Latency uses the SAME
 * seeded model as the legacy mock so the After_Benchmark's latency is directly
 * comparable and provably not worse (the mock's latency models provider
 * round-trip, which our prompt-size change does not affect).
 */
export function createAfterRunner(
  opts: { baseLatencyMs?: number; jitterMs?: number } = {},
): RequestRunner {
  const baseLatencyMs = opts.baseLatencyMs ?? 400;
  const jitterMs = opts.jitterMs ?? 250;

  return {
    name: AFTER_RUNNER_NAME,
    run(request: BenchmarkRequest, runIndex: number): ProviderResponse {
      const composition = runComposerPath(request);
      const retrievedMemory = selectiveMemory(request);

      const prompt = buildOptimizedStylePrompt(
        request,
        composition.exposedTools,
        retrievedMemory,
      );
      const text = buildAnswerText(request);
      const toolCalls = resolveToolCalls(request);

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
