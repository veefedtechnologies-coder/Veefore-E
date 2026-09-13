/**
 * Pure (DB-free, LLM-free) selective tool exposure for VeeGPT (Req 11).
 *
 * This is the tool-selection half of the optimized context path. Given the
 * user's tier, the classified intents, and (optionally) an explicitly forced
 * tool, it computes exactly the set of tool definitions to expose to the model.
 *
 * Design contract (see design.md §"Tool Context Optimization"):
 *   1. TIER FILTER FIRST (Req 11.4) — `filterToolsByTier` is applied to the
 *      available tools BEFORE anything else, so a tool above the user's tier is
 *      never exposed, exactly as the legacy path does.
 *   2. INTENT-MAPPED UNION (Req 11.1 / 11.3) — expose exactly the union of the
 *      tier-permitted tools mapped to every identified intent. For compound /
 *      multi-intent turns this is the union across all intents. No tool outside
 *      that mapped set is exposed.
 *   3. NO TOKEN-DRIVEN DROPPING (Req 11.5) — there is deliberately NO token /
 *      budget parameter. A tool that is intent-selected AND tier-permitted is
 *      never dropped to save tokens, even if retaining it would exceed a budget
 *      or cause the request to fail. Correctness wins over tokens.
 *   4. FORCED TOOL ALWAYS (Req 11.6) — an explicitly forced, tier-permitted tool
 *      is always included even when no intent selected it.
 *   5. FAIL OPEN (Req 11.7 / 19.6) — if the active model does not support
 *      selective exposure, or intent is ambiguous / empty, fall back to the full
 *      tier-permitted set (current behavior) rather than under-exposing.
 *
 * The `Capability → tool` mapping is derived directly from the intent
 * classifier's `FORCED_TOOL_CAPABILITY` table, so the two can never drift apart.
 *
 * The function is deterministic and pure so it can be unit- and property-tested
 * in isolation without a DB or a model call.
 */

import type { ChatTool } from '../services/AIServiceManager';
import type { VeeGPTTier } from '../config/veegpt-tiers';
import { filterToolsByTier } from '../config/veegpt-tiers';
import { ALL_CAPABILITIES, FORCED_TOOL_CAPABILITY, type Capability } from './veegpt-intent.logic';
import {
  VEEGPT_CHAT_TOOLS,
  VEEGPT_INSIGHT_TOOLS,
  VEEGPT_MEMORY_TOOLS_ALL,
  VEEGPT_DATA_TOOLS,
  VEEGPT_ACCOUNT_TOOLS,
  VEEGPT_EDIT_TOOLS,
  VEEGPT_VIDEO_TOOLS,
} from './veegpt-tools';

/**
 * The master registry of every VeeGPT tool, in a stable, deterministic order.
 * Selection results are always emitted in this order so output is reproducible.
 * (`SCHEDULE_POST_TOOL` lives in `VEEGPT_CHAT_TOOLS`.)
 */
export const ALL_VEEGPT_TOOLS: readonly ChatTool[] = [
  ...VEEGPT_CHAT_TOOLS, // schedule_post
  ...VEEGPT_INSIGHT_TOOLS, // generate_caption/hashtags, analytics insight, best time, research_trends, search_web, deep_research
  ...VEEGPT_MEMORY_TOOLS_ALL, // remember/update/forget
  ...VEEGPT_DATA_TOOLS, // get_workspace_data
  ...VEEGPT_ACCOUNT_TOOLS, // get_account_details
  ...VEEGPT_EDIT_TOOLS, // reschedule/cancel/update_caption/delete/duplicate
  ...VEEGPT_VIDEO_TOOLS, // video_editor (AI Video Editor capability)
] as const;

/** Stable index of each tool name in `ALL_VEEGPT_TOOLS` (for deterministic ordering). */
const TOOL_ORDER: ReadonlyMap<string, number> = new Map(
  ALL_VEEGPT_TOOLS.map((t, i) => [t.function?.name ?? `__unnamed_${i}`, i] as const),
);

/**
 * Capability → tool definitions, derived from the intent classifier's
 * `FORCED_TOOL_CAPABILITY` table so the mapping is guaranteed consistent with
 * how intents are classified. `'chat'` intentionally maps to no tools (pure
 * conversation needs no capability tool).
 */
export const CAPABILITY_TOOLS: Readonly<Record<Capability, readonly ChatTool[]>> = (() => {
  const map = {} as Record<Capability, ChatTool[]>;
  for (const cap of ALL_CAPABILITIES) map[cap] = [];
  for (const tool of ALL_VEEGPT_TOOLS) {
    const name = tool.function?.name;
    if (!name) continue;
    const cap = FORCED_TOOL_CAPABILITY[name];
    if (cap) map[cap].push(tool);
  }
  return map;
})();

export interface SelectToolsInput {
  /** The user's resolved VeeGPT tier (basic / full / advanced). */
  tier: VeeGPTTier;
  /** The capability intents identified for this request (from the Intent_Router). */
  intents: Capability[];
  /**
   * When true, intent could not be uniquely determined — fail OPEN to the full
   * tier-permitted set rather than under-exposing (Req 11.7 / correctness > tokens).
   */
  ambiguous?: boolean;
  /**
   * A tool the user explicitly forced from the composer. It is always exposed
   * when tier-permitted, even if no intent selected it (Req 11.6).
   */
  forcedTool?: string | null;
  /**
   * Whether the active provider/model supports selective tool exposure. When
   * false, fall back to the full tier-permitted set (Req 11.1 / 11.7). Defaults
   * to true.
   */
  selectiveToolsSupported?: boolean;
  /**
   * The base set of tools available for this request BEFORE tier/intent
   * filtering (e.g. upstream may already have gated data/account tools behind a
   * connected workspace/account). Defaults to the full registry.
   */
  availableTools?: readonly ChatTool[];
}

export interface SelectToolsResult {
  /** The exact set of tool definitions to expose, in stable registry order. */
  tools: ChatTool[];
  /** True when the safe full-tier-set fallback was applied (Req 11.7 / 19.6). */
  usedFallback: boolean;
}

/** Sort a tool list into the canonical registry order for deterministic output. */
function orderTools(tools: ChatTool[]): ChatTool[] {
  return [...tools].sort((a, b) => {
    const ai = TOOL_ORDER.get(a.function?.name ?? '') ?? Number.MAX_SAFE_INTEGER;
    const bi = TOOL_ORDER.get(b.function?.name ?? '') ?? Number.MAX_SAFE_INTEGER;
    return ai - bi;
  });
}

/**
 * Select the tools to expose for a request.
 *
 * Never throws: any internal error falls back to the full tier-permitted set,
 * the safe capability-preserving behavior (Req 11.7 / correctness > tokens).
 */
export function selectTools(input: SelectToolsInput): SelectToolsResult {
  const base = input?.availableTools ?? ALL_VEEGPT_TOOLS;

  // (1) TIER FILTER FIRST (Req 11.4): a tool above the user's tier can never be
  //     exposed, regardless of intent.
  const tierPermitted = filterToolsByTier([...base], input.tier);

  try {
    const selectiveSupported = input?.selectiveToolsSupported !== false;
    const intents = Array.isArray(input?.intents) ? input.intents : [];

    // (5) FAIL OPEN (Req 11.7): if the model can't do selective exposure, or the
    //     intent is ambiguous / empty, expose the full tier-permitted set.
    if (!selectiveSupported || input?.ambiguous || intents.length === 0) {
      return { tools: orderTools(tierPermitted), usedFallback: true };
    }

    const permittedNames = new Set(
      tierPermitted.map((t) => t.function?.name).filter((n): n is string => Boolean(n)),
    );

    // (2) INTENT-MAPPED UNION (Req 11.1 / 11.3): union of tier-permitted tools
    //     mapped to every identified intent; nothing outside that set.
    const selected = new Map<string, ChatTool>();
    for (const intent of intents) {
      const capTools = CAPABILITY_TOOLS[intent] ?? [];
      for (const tool of capTools) {
        const name = tool.function?.name;
        if (name && permittedNames.has(name)) selected.set(name, tool);
      }
    }

    // (4) FORCED TOOL ALWAYS (Req 11.6): include an explicitly forced,
    //     tier-permitted tool even if no intent selected it.
    if (input?.forcedTool && permittedNames.has(input.forcedTool)) {
      const forced = tierPermitted.find((t) => t.function?.name === input.forcedTool);
      if (forced) selected.set(input.forcedTool, forced);
    }

    // (3) NO TOKEN-DRIVEN DROPPING (Req 11.5): there is no budget check here —
    //     every intent-selected, tier-permitted tool is kept.
    return { tools: orderTools([...selected.values()]), usedFallback: false };
  } catch {
    // Any failure fails open to the full tier-permitted set (Req 11.7 / 19.6).
    return { tools: orderTools(tierPermitted), usedFallback: true };
  }
}
