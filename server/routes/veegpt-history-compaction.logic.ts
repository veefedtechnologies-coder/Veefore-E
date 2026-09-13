/**
 * Pure (DB-free, AI-free) conversation-history compaction planner
 * (spec: veegpt-context-optimization, Req 7, 19.3).
 *
 * Phase 5 of the context-optimization refactor. This module owns the DECISION
 * of how to keep the input tokens attributable to conversation history bounded
 * to a configured maximum that does NOT grow with the number of turns (Req 7.1),
 * by representing history as a **recent-N window + rolling summary +
 * Conversation_State** (Req 7.2). It performs no DB reads/writes and no AI calls
 * — the route executes the AI summarization and persists the state — so it can
 * be unit- and property-tested in isolation, matching the existing
 * `veegpt-*.logic.ts` convention.
 *
 * The rules this planner enforces:
 *  - **Bounded history (Req 7.1/7.4):** when the recent window's token cost would
 *    exceed `historyTokenBudget`, the OLDEST overflow is scheduled for compaction
 *    into the summary/state so the retained verbatim window fits the budget. The
 *    bound is on tokens, not turn count, so history does not grow linearly.
 *  - **Record before removing (Req 7.3/7.4):** for every message scheduled to
 *    leave the window, durable information (brand, objective, audience,
 *    constraints, selected strategy, tool-derived output, decisions, preferences,
 *    pending actions) is extracted into structured `Conversation_State`
 *    candidates BEFORE the message is removed, so nothing that can affect future
 *    responses is lost.
 *  - **Fail open, never drop the current turn (Req 7.6/19.3):** when
 *    summarization is unavailable/failed, the planner compacts NOTHING and
 *    retains the full recent window (including a brand-new conversation with no
 *    history). The current user message is owned by the composer and is always
 *    retained regardless of this plan.
 *
 * The produced `StateCandidate[]` is fed to `mergeConversationState`
 * (veegpt-conversation-state.logic.ts) which enforces the Req 8 category/label
 * rules; this planner only proposes candidates and never persists them.
 */

import { estimateTokens } from '../services/aiUsageTracker';
import { renderTranscript, type Msg } from './veegpt-memory.logic';
import type { StateCandidate, StateSource } from './veegpt-conversation-state.logic';

// ---------------------------------------------------------------------------
// Token accounting for the history window
// ---------------------------------------------------------------------------

/**
 * Token cost of a single history message, measured on its RENDERED transcript
 * line (`User: …` / `VeeGPT: …`) so the estimate matches how the recent window
 * actually contributes to the composed request (see `renderTranscript`).
 */
export function messageTokens(msg: Msg): number {
  return estimateTokens(renderTranscript([msg]));
}

/**
 * Token cost of a list of history messages, measured on the rendered transcript
 * block — the same rendering the composer/`buildPrompt` uses for recent history.
 */
export function historyWindowTokens(messages: Msg[]): number {
  if (!Array.isArray(messages) || messages.length === 0) return 0;
  return estimateTokens(renderTranscript(messages));
}

// ---------------------------------------------------------------------------
// Durable-information extraction (Req 7.3) — deterministic, keyword-driven
// ---------------------------------------------------------------------------

/**
 * Deterministic matchers that map a message to one or more durable
 * `Conversation_State` categories (Req 7.3). These are intentionally broad: the
 * goal is to RECORD anything that can affect future responses before a message
 * leaves the window. `mergeConversationState` applies the strict Req 8 category
 * and single-label rules downstream, so over-matching here is safe (duplicates
 * are deduped, uncategorizable instruction-like text is excluded and its raw
 * message is retained in the summary).
 *
 * Order is irrelevant — every matching category produces a candidate.
 */
const CATEGORY_MATCHERS: Array<{ category: string; test: RegExp }> = [
  {
    // Campaign objectives / goals (single-value category — latest wins).
    category: 'objective',
    test: /\b(goal|objective|aim(ing)?|campaign|mission|trying to|want to (grow|reach|launch|increase|build|drive|boost)|target(ing)? \d)/i,
  },
  {
    // Content constraints / limits / prohibitions.
    category: 'constraints',
    test: /\b(must not|mustn'?t|don'?t|do not|avoid|no more than|at most|within|limit(ed)? to|constraint|only use|keep it under|budget of|deadline|by (monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next week))\b/i,
  },
  {
    // Decisions reached in the conversation.
    category: 'decisions',
    test: /\b(decided|decision|let'?s go with|we'?ll (use|go)|i'?ll go with|chose|choosing|final(ized|ised)?|agreed|going with|confirmed)\b/i,
  },
  {
    // Selected strategy / chosen option.
    category: 'selectedOptions',
    test: /\b(strateg(y|ies)|approach|the plan is|plan is to|option \w+|selected|pick(ed)? (the|option)|prefer(red)? the|opt(ing)? for)\b/i,
  },
  {
    // Pending actions / follow-ups / to-dos.
    category: 'pendingActions',
    test: /\b(next step|to-?do|pending|still need|will (do|schedule|post|create|send|draft|publish)|remind me|follow[- ]up|action item|need to)\b/i,
  },
  {
    // Brand information, target audience, and other named entities.
    category: 'entities',
    test: /\b(brand|our company|target (audience|market|demographic)|audience is|niche|competitor|product line|handle is|@\w+)\b/i,
  },
  {
    // User preferences and durable facts referenced by a later turn.
    category: 'facts',
    test: /\b(prefer|prefers|preference|i (like|love|enjoy|favou?r)|favou?rite|usually|typically|my (name|brand|tone|style)|our (name|brand|tone|style))\b/i,
  },
];

/** Assistant messages that read like tool-derived output/data. */
const TOOL_DERIVED_TEST =
  /\b(analytics|metric|impressions|reach|engagement rate|followers?|results?|report|fetched|retrieved|scheduled for|posted|published|generated|top (posts?|performing)|\d+(\.\d+)?%)\b/i;

/**
 * The trust source of a message, used so `mergeConversationState` applies the
 * correct trust boundary: user messages are `user` (least trusted; can never be
 * labeled `system_instruction`), assistant messages are `app` state, and
 * assistant tool-derived output is `tool`.
 */
function sourceForRole(role: string): StateSource {
  return role === 'assistant' ? 'app' : 'user';
}

/**
 * Extract structured `Conversation_State` candidates from the messages that are
 * about to leave the recent window (Req 7.3). Deterministic and pure: it scans
 * each message against `CATEGORY_MATCHERS` (plus the assistant tool-derived
 * matcher) and emits one candidate per matched category, tagging the trust
 * source by role. It never persists — the caller merges via
 * `mergeConversationState`, which enforces the Req 8 rules.
 */
export function extractStateCandidates(messages: Msg[]): StateCandidate[] {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  const candidates: StateCandidate[] = [];

  for (const msg of messages) {
    const text = (msg?.content ?? '').trim();
    if (!text) continue;
    const role = msg?.role ?? 'user';
    const source = sourceForRole(role);

    for (const matcher of CATEGORY_MATCHERS) {
      if (matcher.test.test(text)) {
        candidates.push({ category: matcher.category, text, source });
      }
    }

    // Tool-derived output is recorded from assistant messages only, as `tool`.
    if (role === 'assistant' && TOOL_DERIVED_TEST.test(text)) {
      candidates.push({ category: 'toolDerivedState', text, source: 'tool' });
    }
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// The compaction plan
// ---------------------------------------------------------------------------

export interface HistoryCompactionInput {
  /**
   * The recent-message window in chronological (oldest→newest) order, as already
   * selected by `planLongTermWindow`/`selectShallowWindow`. This is the verbatim
   * history the composer would otherwise send in full.
   */
  recentWindow: Msg[];
  /**
   * The maximum input tokens attributable to conversation history
   * (`getContextConfig().historyTokenBudget`). Non-positive values disable
   * bounding (treated as unbounded) so a misconfiguration never drops history.
   */
  historyTokenBudget: number;
  /**
   * Whether conversation summarization is available for this turn. When `false`
   * (summarization failed/disabled), the planner fails open: it compacts nothing
   * and retains the full recent window (Req 7.6/19.3). Defaults to `true`.
   */
  summarizationAvailable?: boolean;
}

export interface HistoryCompactionPlan {
  /** The verbatim recent window to send, bounded to `historyTokenBudget`. */
  history: Msg[];
  /**
   * The oldest overflow messages scheduled to be folded into the summary/state
   * BEFORE they leave the window (empty when no compaction is needed).
   */
  toCompact: Msg[];
  /**
   * Durable `Conversation_State` candidates extracted from `toCompact` (Req 7.3),
   * to be merged via `mergeConversationState` BEFORE the messages are removed.
   */
  stateCandidates: StateCandidate[];
  /** True when at least one message was scheduled for compaction. */
  compactionOccurred: boolean;
  /**
   * True when the planner failed open (summarization unavailable) and retained
   * the full window instead of compacting (Req 7.6/19.3).
   */
  failedOpen: boolean;
  /** Token cost of the retained `history` window (for telemetry/bounds checks). */
  historyTokens: number;
}

/**
 * Plan the bounded compaction of a conversation's recent window.
 *
 * Guarantees (Req 7):
 *  - When summarization is available and the budget is positive, the retained
 *    `history` window's token cost is ≤ `historyTokenBudget` — a bound that does
 *    not grow with the number of turns (Req 7.1/7.4). The oldest overflow is
 *    moved to `toCompact`.
 *  - Every message in `toCompact` is mined into `stateCandidates` BEFORE removal
 *    so durable information is recorded, never silently dropped (Req 7.3/7.4).
 *  - When summarization is unavailable, NOTHING is compacted and the full recent
 *    window is retained, including a brand-new conversation with no history
 *    (Req 7.6/19.3).
 *
 * Pure and side-effect-free: reads only its input, returns a new plan, mutates
 * nothing. The current user message is NOT part of the window and is always
 * retained by the composer regardless of this plan.
 */
export function planHistoryCompaction(
  input: HistoryCompactionInput
): HistoryCompactionPlan {
  const window = Array.isArray(input.recentWindow) ? input.recentWindow : [];
  const summarizationAvailable = input.summarizationAvailable ?? true;
  const budget = input.historyTokenBudget;
  const boundingEnabled = Number.isFinite(budget) && budget > 0;

  // Fail open (Req 7.6/19.3): without a working summarizer, compacting would
  // lose information, so retain the entire recent window and compact nothing.
  if (!summarizationAvailable) {
    return {
      history: window,
      toCompact: [],
      stateCandidates: [],
      compactionOccurred: false,
      failedOpen: true,
      historyTokens: historyWindowTokens(window),
    };
  }

  const totalTokens = historyWindowTokens(window);

  // Within budget (or bounding disabled): send the full window unchanged.
  if (!boundingEnabled || totalTokens <= budget) {
    return {
      history: window,
      toCompact: [],
      stateCandidates: [],
      compactionOccurred: false,
      failedOpen: false,
      historyTokens: totalTokens,
    };
  }

  // Overflow: keep the largest NEWEST suffix whose BLOCK-rendered token cost
  // fits the budget, compacting the oldest messages. The bound is measured on
  // the rendered transcript block (`historyWindowTokens`) — the exact metric
  // used by the entry condition above and the way the recent window actually
  // contributes to the composed prompt — so the retained window's true prompt
  // cost is provably ≤ budget (a per-message token SUM would over-count the
  // per-line rounding and could leave the block over budget). Block-render
  // token cost is monotonic in the suffix length (adding an older message only
  // adds characters), so we can grow the suffix from the newest message and
  // stop as soon as it would exceed the budget. A single newest message whose
  // block render alone exceeds the budget results in an empty retained window
  // (it is fully compacted into the summary/state); the current turn, owned by
  // the composer, is unaffected.
  let keepFrom = window.length;
  for (let i = window.length - 1; i >= 0; i--) {
    if (historyWindowTokens(window.slice(i)) > budget) break;
    keepFrom = i;
  }

  const history = window.slice(keepFrom);
  const toCompact = window.slice(0, keepFrom);
  const stateCandidates = extractStateCandidates(toCompact);

  return {
    history,
    toCompact,
    stateCandidates,
    compactionOccurred: toCompact.length > 0,
    failedOpen: false,
    // Recompute from the retained window so callers get the true bounded cost.
    historyTokens: historyWindowTokens(history),
  };
}
