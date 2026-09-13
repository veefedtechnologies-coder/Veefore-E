/**
 * Pure (DB-free, AI-free) selective, fail-open User_Memory retrieval
 * (spec: veegpt-context-optimization, Req 9).
 *
 * Phase 5 of the context-optimization refactor: the memory layer. Today the
 * WHOLE cross-chat User_Memory store is rendered into every long-term prompt
 * (`getUserMemoryProfile` in `veegpt-chat.routes.ts`). This module decides which
 * memory to inject for a given request WITHOUT changing how memory is saved,
 * merged, deduped, capped, or updated — it only selects what is READ into the
 * composed request, so it can be unit- and property-tested in isolation,
 * matching the existing `veegpt-*.logic.ts` convention.
 *
 * The rules this module enforces:
 *  - **Four independently addressable scopes (Req 9.1):** long-term
 *    `User_Memory`, `Conversation_Memory` (rolling summary), the short-term
 *    recent window, and retrieved knowledge (tool results) are modeled as four
 *    scopes, each of which can be included or excluded from a composed request
 *    independently of the others (`resolveScopes`). This module OWNS the
 *    selective retrieval for the User_Memory scope; the other scopes are
 *    surfaced here as addressable flags and retrieved by their own owners
 *    (history compaction, the composer, and the tool loop respectively).
 *  - **Selective retrieval (Req 9.2/9.3):** only the memory items relevant to
 *    the current request are retrieved via a DETERMINISTIC filter (single-value
 *    topic via `detectTopic`, plus keyword/token overlap and recency). When the
 *    current request does not relate to a stored fact, that fact is excluded —
 *    the complete store is never blindly injected.
 *  - **Preserved memory behaviors (Req 9.4):** `mergeMemoryItems`, single-value
 *    topic replacement, `dedupeMemoryItems`, storage caps, `isMemoryFull`, and
 *    the acknowledgement/contradiction/update rules are UNCHANGED — this module
 *    re-exports them so callers keep using the one authoritative implementation,
 *    and it never mutates or re-implements any of them.
 *  - **Fail open toward completeness (Req 9.5/9.7):** if relevance cannot be
 *    determined within the configured time budget, or the relevance computation
 *    fails, retrieval returns ALL memory rather than excluding it (correctness
 *    wins over token savings). On timeout/failure the caller proceeds with
 *    whatever memory is available and keeps serving the request.
 *  - **Current message is never this module's to drop (Req 9.6):** the user's
 *    current message is owned and always retained by the composer, regardless of
 *    memory-retrieval status (success/failure/timeout). This module only selects
 *    memory and never touches the current turn.
 */

import {
  detectTopic,
  type MemoryItem,
} from './veegpt-user-memory.logic';
import { getContextConfig } from '../config/veegpt-context.config';
import type { Msg } from './veegpt-memory.logic';

// ---------------------------------------------------------------------------
// Preserved memory behaviors (Req 9.4) — re-exported UNCHANGED
// ---------------------------------------------------------------------------

/**
 * The existing memory behaviors are re-exported verbatim so every caller reads
 * them from ONE source and it is explicit that selective retrieval changes
 * NOTHING about how memory is saved/merged/deduped/capped/updated (Req 9.4).
 * The Regression_Suite verifies these produce outputs equivalent to the
 * pre-refactor implementation for identical inputs.
 */
export {
  mergeMemoryItems,
  dedupeMemoryItems,
  isMemoryFull,
  detectTopic,
  clampItemText,
  computeUsage,
  hasSaveIntent,
  extractSaveIntentFact,
  MEMORY_LIMITS,
} from './veegpt-user-memory.logic';
export type { MemoryItem } from './veegpt-user-memory.logic';

// ---------------------------------------------------------------------------
// Memory scopes (Req 9.1) — four independently addressable scopes
// ---------------------------------------------------------------------------

/**
 * The four independently addressable memory scopes (Req 9.1). Each can be
 * included in or excluded from a composed request independently of the others.
 *  - `userMemory`         — long-term cross-chat durable facts (this module).
 *  - `conversationMemory` — the per-conversation rolling summary.
 *  - `shortTerm`          — the recent verbatim message window.
 *  - `retrievedKnowledge` — tool-derived results re-entering the request.
 */
export const MEMORY_SCOPES = [
  'userMemory',
  'conversationMemory',
  'shortTerm',
  'retrievedKnowledge',
] as const;

export type MemoryScope = (typeof MEMORY_SCOPES)[number];

/** A full include/exclude decision for every scope (Req 9.1). */
export type ScopeSelection = Record<MemoryScope, boolean>;

/**
 * Resolve the per-scope include/exclude decision. Every scope defaults to
 * INCLUDED (the safe, capability-preserving default) and each can be toggled
 * independently via `overrides` — no scope's inclusion depends on another's
 * (Req 9.1). Returns a fresh, fully-populated record.
 */
export function resolveScopes(
  overrides: Partial<ScopeSelection> = {}
): ScopeSelection {
  const scopes = {} as ScopeSelection;
  for (const scope of MEMORY_SCOPES) {
    scopes[scope] = overrides[scope] ?? true;
  }
  return scopes;
}

// ---------------------------------------------------------------------------
// Deterministic relevance signals
// ---------------------------------------------------------------------------

/**
 * Common words carrying no relevance signal, excluded from token overlap so a
 * shared "the"/"is"/"my" never makes an unrelated fact look relevant. Kept
 * deliberately small — the goal is to drop noise, not to stem aggressively.
 */
const STOPWORDS = new Set<string>([
  'the', 'and', 'for', 'are', 'was', 'were', 'you', 'your', 'yours', 'our',
  'ours', 'their', 'his', 'her', 'its', 'this', 'that', 'these', 'those',
  'with', 'from', 'have', 'has', 'had', 'not', 'but', 'can', 'will', 'would',
  'should', 'could', 'about', 'what', 'when', 'where', 'which', 'who', 'whom',
  'how', 'why', 'into', 'onto', 'over', 'under', 'then', 'than', 'them', 'they',
  'she', 'him', 'get', 'got', 'let', 'lets', 'please', 'tell', 'give', 'want',
  'need', 'like', 'make', 'made', 'some', 'any', 'all', 'more', 'most', 'much',
  'many', 'very', 'just', 'also', 'been', 'being', 'does', 'did', 'doing',
  'here', 'there', 'now', 'yeah', 'yes', 'okay', 'thanks', 'thank',
]);

/**
 * Extract the significant (relevance-bearing) tokens from a piece of text:
 * lowercase alphanumeric words of length ≥ 3 that are not stopwords. Pure and
 * deterministic. Returns a Set for O(1) overlap checks.
 */
export function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  const words = (text || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  for (const word of words) {
    if (word.length >= 3 && !STOPWORDS.has(word)) tokens.add(word);
  }
  return tokens;
}

/**
 * True when the request is a BROAD recall of the user's own stored profile
 * (e.g. "what do you know about me", "tell me about my account", "remind me my
 * details"). Such a request relates to ALL stored facts, so relevance cannot be
 * narrowed and ALL memory is included (fail open toward completeness — Req 9.7).
 */
export function isBroadRecall(text: string): boolean {
  const t = (text || '').toLowerCase();
  return /\b(what do you (know|remember) about me|about my (account|profile|self|memor)|everything (you know|about me)|my (details|profile|info|information|memories|memory)|remind me (what|about)|tell me about (my|me)\b|who am i)\b/i.test(
    t
  );
}

/**
 * Decide whether a single stored fact is relevant to the request signals:
 *  - a single-value TOPIC match (both the request and the fact resolve to the
 *    SAME `detectTopic`, e.g. both about the posting schedule), OR
 *  - at least one significant token in common with the request.
 * Pure and deterministic — no I/O, no clock.
 */
export function isItemRelevant(
  item: MemoryItem,
  requestTopic: string | null,
  requestTokens: Set<string>
): boolean {
  const text = item?.text ?? '';
  // Single-value topic match (e.g. "my posting schedule" ↔ a schedule fact).
  if (requestTopic) {
    const itemTopic = detectTopic(text);
    if (itemTopic && itemTopic === requestTopic) return true;
  }
  if (requestTokens.size === 0) return false;
  const itemTokens = tokenize(text);
  for (const token of itemTokens) {
    if (requestTokens.has(token)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Rendering — the prompt-ready User_Memory profile string
// ---------------------------------------------------------------------------

/**
 * Render selected memory items to the prompt-ready profile string, byte-for-byte
 * in the SAME format as the existing `getUserMemoryProfile` in
 * `veegpt-chat.routes.ts` (`- [id:<id>] <text>` per line). Each fact's id is
 * included so the model can UPDATE or FORGET a specific fact rather than adding
 * a duplicate/contradicting one (Req 9.4). Empty list → empty string, matching
 * the legacy "no memory yet" behavior.
 */
export function renderMemoryProfile(items: MemoryItem[]): string {
  if (!Array.isArray(items) || items.length === 0) return '';
  return items.map((it) => `- [id:${it.id}] ${it.text}`).join('\n');
}

// ---------------------------------------------------------------------------
// Selective, fail-open retrieval
// ---------------------------------------------------------------------------

export interface MemoryRetrievalInput {
  /** The full stored User_Memory items (oldest→newest, as stored). */
  items: MemoryItem[];
  /** The user's current message for this turn (drives relevance). */
  currentMessage: string;
  /**
   * Recent prior messages (oldest→newest), used to keep follow-up questions
   * relevant to the same facts as the message they reference (Req 6.2). Only the
   * most recent user turn is mined for extra signal so an old topic does not
   * keep an unrelated fact alive forever.
   */
  priorMessages?: Msg[];
  /**
   * Max User_Memory items scanned/injected in one request
   * (`memoryRetrievalLimit`). Defaults to the centralized config. Only the most
   * recent `limit` items are considered as candidates so work is bounded; with
   * the default (= `MEMORY_LIMITS.MAX_ITEMS`) no stored fact is ever excluded by
   * the bound in practice.
   */
  limit?: number;
  /**
   * Time budget for the relevance computation, in ms
   * (`memoryRetrievalBudgetMs`). If exceeded, retrieval FAILS OPEN and returns
   * ALL memory (Req 9.7). Defaults to the centralized config.
   */
  budgetMs?: number;
  /**
   * Injectable monotonic clock (ms), for deterministic budget testing. Defaults
   * to `Date.now`. Keeping this injectable lets the timeout/fail-open path be
   * unit- and property-tested without real time.
   */
  now?: () => number;
  /**
   * Per-scope include/exclude overrides (Req 9.1). When `userMemory` is
   * excluded, retrieval returns no items and an empty profile.
   */
  scopes?: Partial<ScopeSelection>;
}

export interface MemoryRetrievalResult {
  /** The selected memory items to inject, in original stored order. */
  items: MemoryItem[];
  /** The prompt-ready profile string for the selected items (`renderMemoryProfile`). */
  profile: string;
  /** The resolved per-scope include/exclude decision (Req 9.1). */
  scopes: ScopeSelection;
  /**
   * `true` when ALL memory was included because relevance could not be narrowed
   * — broad recall, no usable request signal, a timeout, or a failure (Req 9.7).
   */
  includedAll: boolean;
  /** `true` when retrieval failed open (timeout OR error) rather than filtering. */
  failedOpen: boolean;
  /** `true` when the time budget was exceeded before relevance was determined. */
  timedOut: boolean;
  /** `true` when the relevance computation threw and retrieval failed open. */
  errored: boolean;
  /** How many candidate items were considered (bounded by `limit`). */
  scanned: number;
  /** Total stored items provided as input. */
  totalCandidates: number;
}

/**
 * Retrieve only the User_Memory items relevant to the current request, failing
 * open toward completeness (Req 9.2/9.3/9.7).
 *
 * Algorithm (deterministic):
 *  1. If the `userMemory` scope is excluded (Req 9.1) or there are no stored
 *     items, return nothing.
 *  2. Consider the most recent `limit` items as candidates (bounds work without
 *     dropping stored facts in practice, since `limit` = `MEMORY_LIMITS.MAX_ITEMS`).
 *  3. If the request is a BROAD recall of the user's own profile, or carries no
 *     usable relevance signal (no topic and no significant tokens), relevance
 *     cannot be narrowed → include ALL memory (Req 9.7).
 *  4. Otherwise select the candidates whose single-value topic matches the
 *     request's, or that share at least one significant token with it — in
 *     original stored order (Req 9.2). Unrelated facts are excluded (Req 9.3).
 *  5. While scanning, if the time budget is exceeded, STOP and include ALL
 *     memory (Req 9.7). Any thrown error also fails open to ALL memory (Req 9.5).
 *
 * Pure aside from the injectable clock; never mutates its input.
 */
export function retrieveUserMemory(
  input: MemoryRetrievalInput
): MemoryRetrievalResult {
  const cfg = getContextConfig();
  const limit = input.limit ?? cfg.memoryRetrievalLimit;
  const budgetMs = input.budgetMs ?? cfg.memoryRetrievalBudgetMs;
  const now = input.now ?? Date.now;
  const scopes = resolveScopes(input.scopes);

  const allItems = Array.isArray(input.items) ? input.items : [];
  const totalCandidates = allItems.length;

  /** Build the "include everything" result (fail open / broad recall). */
  const includeAll = (flags: {
    failedOpen?: boolean;
    timedOut?: boolean;
    errored?: boolean;
    scanned?: number;
  }): MemoryRetrievalResult => ({
    items: allItems,
    profile: renderMemoryProfile(allItems),
    scopes,
    includedAll: true,
    failedOpen: Boolean(flags.failedOpen),
    timedOut: Boolean(flags.timedOut),
    errored: Boolean(flags.errored),
    scanned: flags.scanned ?? totalCandidates,
    totalCandidates,
  });

  // Req 9.1: the User_Memory scope can be excluded independently of the others.
  if (!scopes.userMemory) {
    return {
      items: [],
      profile: '',
      scopes,
      includedAll: false,
      failedOpen: false,
      timedOut: false,
      errored: false,
      scanned: 0,
      totalCandidates,
    };
  }

  // Nothing stored → nothing to retrieve (trivially complete).
  if (totalCandidates === 0) {
    return {
      items: [],
      profile: '',
      scopes,
      includedAll: true,
      failedOpen: false,
      timedOut: false,
      errored: false,
      scanned: 0,
      totalCandidates,
    };
  }

  try {
    // Consider the most recent `limit` items (bounds scan work — Req 9 config).
    const boundedLimit =
      Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : totalCandidates;
    const candidates =
      totalCandidates > boundedLimit
        ? allItems.slice(totalCandidates - boundedLimit)
        : allItems;

    // Req 9.7: a broad recall of the user's own profile relates to ALL facts —
    // relevance cannot be narrowed, so include everything (fail open).
    if (isBroadRecall(input.currentMessage)) {
      return includeAll({ scanned: candidates.length });
    }

    // Build the request relevance signals from the current message plus the
    // most recent prior USER turn (so a follow-up stays relevant — Req 6.2).
    const requestTopic = detectTopic(input.currentMessage || '');
    const requestTokens = tokenize(input.currentMessage || '');
    const priorUser = lastUserMessage(input.priorMessages);
    if (priorUser) for (const t of tokenize(priorUser)) requestTokens.add(t);

    // Req 9.7: no usable relevance signal at all (e.g. a bare greeting) → cannot
    // determine relevance, so include ALL memory rather than guessing.
    if (!requestTopic && requestTokens.size === 0) {
      return includeAll({ scanned: candidates.length });
    }

    const start = now();
    const selected: MemoryItem[] = [];
    let scanned = 0;
    for (const item of candidates) {
      // Req 9.7: relevance not determined within budget → include ALL memory.
      if (budgetMs > 0 && now() - start > budgetMs) {
        return includeAll({
          failedOpen: true,
          timedOut: true,
          scanned,
        });
      }
      scanned += 1;
      if (isItemRelevant(item, requestTopic, requestTokens)) {
        selected.push(item);
      }
    }

    // Selective result — only relevant facts, in original stored order
    // (Req 9.2). An empty selection means the request genuinely relates to no
    // stored fact, so those facts are excluded (Req 9.3).
    return {
      items: selected,
      profile: renderMemoryProfile(selected),
      scopes,
      includedAll: false,
      failedOpen: false,
      timedOut: false,
      errored: false,
      scanned,
      totalCandidates,
    };
  } catch {
    // Req 9.5: any failure in relevance selection fails open to ALL memory so
    // the request keeps being served with whatever memory is available.
    return includeAll({ failedOpen: true, errored: true });
  }
}

/** The text of the most recent USER message in a prior-message list, or ''. */
function lastUserMessage(messages?: Msg[]): string {
  if (!Array.isArray(messages)) return '';
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role !== 'assistant' && typeof m.content === 'string') {
      return m.content;
    }
  }
  return '';
}
