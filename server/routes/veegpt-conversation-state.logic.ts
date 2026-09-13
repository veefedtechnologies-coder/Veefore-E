/**
 * Pure (DB-free) logic for durable Conversation_State (Req 7/8/21).
 *
 * Conversation_State is the structured, durable memory of a single conversation
 * (objective, decisions, constraints, entities, …) persisted as an OPTIONAL
 * sub-document on the existing ChatConversation. This module owns the RULES for
 * what may be written into it and how instruction-like entries are labeled — it
 * performs NO database or AI calls, so it can be unit- and property-tested in
 * isolation, matching the existing `veegpt-*.logic.ts` convention.
 *
 * Guarantees enforced here:
 *  - Only the enumerated categories are persisted (Req 8.1, 8.2); content that
 *    fits no category is dropped and the raw message stays the source (Req 8.3).
 *  - Additions/updates are recorded in structured form keyed by category
 *    (Req 8.4).
 *  - Every instruction-like entry is assigned EXACTLY ONE label, or it is
 *    excluded and its raw message retained (Req 8.5, 8.6).
 *  - State is always DATA. User-sourced content is never labeled
 *    `system_instruction`, so a summarized user message can never become a
 *    persistent trusted/authoritative instruction (Req 17.4, 18.2). Labels are
 *    metadata for downstream typing only and never grant runtime authority over
 *    safety/core behavior.
 */

import { MEMORY_LIMITS } from '../models/Chat/UserMemory';
import type { IConversationState, ConversationStateLabel } from '../models/Chat/ChatConversation';

export type { ConversationStateLabel };

/**
 * The working (plain-object) shape of Conversation_State, independent of the
 * Mongoose document. Mirrors the optional fields on `ChatConversation`.
 */
export type ConversationState = Pick<
  IConversationState,
  | 'version'
  | 'objective'
  | 'currentTask'
  | 'requirements'
  | 'decisions'
  | 'constraints'
  | 'entities'
  | 'selectedOptions'
  | 'pendingActions'
  | 'facts'
  | 'toolDerivedState'
  | 'labels'
  | 'summarizedMessageCount'
  | 'updatedAt'
>;

/**
 * Categories that hold a SINGLE current value (Req 8.2). A new candidate for one
 * of these REPLACES the previous value instead of accumulating.
 */
export const SINGLE_VALUE_CATEGORIES = ['objective', 'currentTask'] as const;

/**
 * Categories that hold an append-only LIST of distinct entries (Req 8.2).
 */
export const ARRAY_CATEGORIES = [
  'requirements',
  'decisions',
  'constraints',
  'entities',
  'selectedOptions',
  'pendingActions',
  'facts',
  'toolDerivedState',
] as const;

/** The complete set of allowed Conversation_State categories (Req 8.2). */
export const CONVERSATION_STATE_CATEGORIES = [
  ...SINGLE_VALUE_CATEGORIES,
  ...ARRAY_CATEGORIES,
] as const;

export type SingleValueCategory = (typeof SINGLE_VALUE_CATEGORIES)[number];
export type ArrayCategory = (typeof ARRAY_CATEGORIES)[number];
export type ConversationStateCategory = (typeof CONVERSATION_STATE_CATEGORIES)[number];

/**
 * Size caps mirroring `MEMORY_LIMITS` so Conversation_State cannot balloon the
 * conversation document (design: "bounded in size by category caps mirroring
 * MEMORY_LIMITS").
 */
export const STATE_LIMITS = {
  /** Max entries retained per array category (oldest evicted first). */
  MAX_ITEMS_PER_CATEGORY: MEMORY_LIMITS.MAX_ITEMS,
  /** Defensive per-entry character cap. */
  MAX_ITEM_CHARS: MEMORY_LIMITS.MAX_ITEM_CHARS,
  /** Total character budget across all categories. */
  MAX_TOTAL_CHARS: MEMORY_LIMITS.MAX_CHARS,
};

/** The source of a candidate entry — the trust boundary (Req 17.1/17.4). */
export type StateSource = 'user' | 'tool' | 'app' | 'system';

/**
 * A single candidate to merge into Conversation_State. `category` is the
 * proposed category; `instructionLike` may be provided explicitly, otherwise it
 * is auto-detected. `source` defaults to `'user'` (the least-trusted layer).
 */
export interface StateCandidate {
  category: string;
  text: string;
  instructionLike?: boolean;
  source?: StateSource;
}

export function isValidCategory(category: string): category is ConversationStateCategory {
  return (CONVERSATION_STATE_CATEGORIES as readonly string[]).includes(category);
}

/** Normalize text for dedupe comparison (case/space/punctuation-insensitive). */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Clamp a single entry's text to the per-entry limit. */
export function clampEntryText(text: string): string {
  const t = (text || '').trim();
  return t.length > STATE_LIMITS.MAX_ITEM_CHARS
    ? t.slice(0, STATE_LIMITS.MAX_ITEM_CHARS).trim()
    : t;
}

/**
 * True when a statement is "instruction-like" — i.e. it expresses a preference,
 * request, or directive rather than a plain fact/entity. Only instruction-like
 * entries require a label (Req 8.5); plain data (e.g. "brand color is blue") is
 * stored without one.
 */
export function isInstructionLike(text: string): boolean {
  return /\b(please|prefer(red|ably)?|i (want|need|would like|'?d like|'?d rather)|can you|could you|would you|always|never|must|should|shall|make sure|be sure to|remember to|generate|create|write|build|draft|schedule|use|avoid|don'?t|do not|stop|start using)\b/i.test(
    text || '',
  );
}

/**
 * Per-label matchers used to classify an instruction-like statement into EXACTLY
 * ONE label (Req 8.5). Kept deliberately specific so ordinary instruction-like
 * statements land on a single label; ambiguous statements match zero or multiple
 * labels and are therefore EXCLUDED (Req 8.6) rather than mislabeled.
 *
 * `userAllowed: false` marks labels a USER-sourced statement may never receive.
 * `system_instruction` is user-forbidden so a summarized user message can never
 * become a trusted/authoritative instruction (Req 17.4, 18.2).
 */
const LABEL_MATCHERS: Array<{
  label: ConversationStateLabel;
  test: RegExp;
  userAllowed: boolean;
}> = [
  {
    label: 'user_preference',
    test: /\b(i (prefer|like|love|enjoy|favou?r)|prefer(red|ably)?|my favou?rite|i'?d rather|i (usually|tend to|generally))\b/i,
    userAllowed: true,
  },
  {
    label: 'user_request',
    test: /\b(please|can you|could you|would you|i (want|need|would like|'?d like) (you )?to|generate|create|write|build|draft|schedule|make (me|a))\b/i,
    userAllowed: true,
  },
  {
    label: 'factual_state',
    test: /\b((my|our|the|their)\s+\w+\s+(is|are|was|were)|we\s+(are|have|sell|offer|target|operate|use)|there\s+(is|are))\b/i,
    userAllowed: true,
  },
  {
    label: 'application_state',
    test: /\b(selected|currently selected|active|current(ly)?|connected|linked|enabled|disabled|toggled|switched to|set to)\b/i,
    userAllowed: true,
  },
  {
    label: 'system_instruction',
    test: /\b(system|policy|guardrail|is required to|enforced?|by policy)\b/i,
    userAllowed: false,
  },
];

/**
 * Classify an instruction-like statement into EXACTLY ONE label, or return null
 * when it matches zero or more than one label — in which case the caller must
 * exclude it and keep the raw message (Req 8.5, 8.6).
 *
 * For USER-sourced content, labels flagged `userAllowed: false` (i.e.
 * `system_instruction`) are never considered, enforcing the trust boundary
 * (Req 17.4, 18.2).
 */
export function classifyLabel(
  text: string,
  source: StateSource = 'user',
): ConversationStateLabel | null {
  const matched = LABEL_MATCHERS.filter(
    (m) => (source === 'user' ? m.userAllowed : true) && m.test.test(text || ''),
  ).map((m) => m.label);
  const distinct = Array.from(new Set(matched));
  return distinct.length === 1 ? distinct[0] : null;
}

/** Total characters currently stored across every category. */
export function stateTotalChars(state: ConversationState): number {
  let total = 0;
  for (const cat of SINGLE_VALUE_CATEGORIES) {
    const v = state[cat];
    if (typeof v === 'string') total += v.length;
  }
  for (const cat of ARRAY_CATEGORIES) {
    const arr = state[cat];
    if (Array.isArray(arr)) total += arr.reduce((s, t) => s + t.length, 0);
  }
  return total;
}

export interface StateMergeResult {
  state: ConversationState;
  /** Entries newly written into a category (Req 8.1/8.4). */
  added: number;
  /** Entries dropped because their category is not allowed (Req 8.3). */
  skippedInvalidCategory: number;
  /** Near-duplicate entries skipped for an array category. */
  skippedDuplicate: number;
  /** Instruction-like entries excluded for want of exactly one label (Req 8.6). */
  excludedUnlabeled: number;
  /** Raw messages retained as the source of excluded instruction-like entries. */
  retainedRawMessages: string[];
}

function emptyState(base?: ConversationState): ConversationState {
  return {
    version: 1,
    ...(base ?? {}),
  } as ConversationState;
}

/**
 * Merge candidate items into Conversation_State, enforcing every Req 8 rule:
 *
 *  - Only allowed categories are persisted; anything else is dropped and its raw
 *    text left as the source (Req 8.2/8.3).
 *  - Single-value categories (objective, currentTask) are REPLACED; array
 *    categories append distinct, deduped entries keyed by category (Req 8.4).
 *  - Instruction-like entries get EXACTLY ONE label or are excluded with their
 *    raw message retained (Req 8.5/8.6).
 *  - User-sourced content is never labeled `system_instruction`, so it never
 *    becomes a trusted instruction (Req 17.4/18.2).
 *  - Size is bounded by `STATE_LIMITS` (oldest array entries evicted first).
 *
 * Pure: returns a NEW state object and never mutates `existing`.
 */
export function mergeConversationState(
  existing: ConversationState | undefined,
  candidates: StateCandidate[],
): StateMergeResult {
  // Deep-ish clone so we never mutate the caller's object.
  const state = emptyState(existing);
  for (const cat of ARRAY_CATEGORIES) {
    if (Array.isArray(state[cat])) (state as Record<string, unknown>)[cat] = [...(state[cat] as string[])];
  }
  const labels: Record<string, ConversationStateLabel> = { ...(state.labels ?? {}) };

  let added = 0;
  let skippedInvalidCategory = 0;
  let skippedDuplicate = 0;
  let excludedUnlabeled = 0;
  const retainedRawMessages: string[] = [];

  for (const candidate of candidates) {
    const rawText = candidate?.text ?? '';
    const text = clampEntryText(rawText);
    if (!text) continue;

    // Req 8.3: content that fits no allowed category is not persisted.
    if (!isValidCategory(candidate.category)) {
      skippedInvalidCategory += 1;
      continue;
    }
    const category = candidate.category;
    const source = candidate.source ?? 'user';

    // Req 8.5/8.6: instruction-like entries must carry exactly one label.
    const instructionLike = candidate.instructionLike ?? isInstructionLike(text);
    let label: ConversationStateLabel | null = null;
    if (instructionLike) {
      label = classifyLabel(text, source);
      if (label === null) {
        // Cannot assign exactly one label → exclude, keep the raw message.
        excludedUnlabeled += 1;
        retainedRawMessages.push(rawText);
        continue;
      }
    }

    if ((SINGLE_VALUE_CATEGORIES as readonly string[]).includes(category)) {
      // Single-value: replace previous value (Req 8.4). We do NOT eagerly delete
      // the previous value's label here: labels are keyed by entry TEXT and the
      // same text may still be stored under another category (e.g. objective and
      // currentTask both holding it). Deleting per-category would orphan a
      // still-stored instruction-like entry (violating Req 8.5). The label map is
      // reconciled once, authoritatively, against all currently-stored entries in
      // `enforceStateLimits` below.
      (state as Record<string, unknown>)[category] = text;
      added += 1;
    } else {
      // Array category: dedupe by normalized text, then append (Req 8.4).
      const arr = ((state as Record<string, unknown>)[category] as string[] | undefined) ?? [];
      const seen = new Set(arr.map(normalize));
      const key = normalize(text);
      if (key && seen.has(key)) {
        skippedDuplicate += 1;
        continue;
      }
      arr.push(text);
      (state as Record<string, unknown>)[category] = arr;
      added += 1;
    }

    if (label) labels[text] = label;
  }

  if (Object.keys(labels).length > 0) state.labels = labels;
  state.version = 1;
  state.updatedAt = new Date();

  const bounded = enforceStateLimits(state);
  return {
    state: bounded,
    added,
    skippedInvalidCategory,
    skippedDuplicate,
    excludedUnlabeled,
    retainedRawMessages,
  };
}

/**
 * Enforce `STATE_LIMITS`: cap each array category's length (evicting the OLDEST
 * entries first), then evict oldest array entries across categories until the
 * total character budget is met. Labels for evicted entries are dropped so the
 * `labels` map never references missing entries. Pure — returns a new object.
 */
export function enforceStateLimits(state: ConversationState): ConversationState {
  const next = emptyState(state);
  const labels: Record<string, ConversationStateLabel> = { ...(state.labels ?? {}) };

  for (const cat of ARRAY_CATEGORIES) {
    const arr = Array.isArray(state[cat]) ? [...(state[cat] as string[])] : undefined;
    if (!arr) {
      // Don't materialize keys for absent categories (keeps state minimal).
      if (state[cat] !== undefined) (next as Record<string, unknown>)[cat] = state[cat];
      continue;
    }
    while (arr.length > STATE_LIMITS.MAX_ITEMS_PER_CATEGORY) {
      arr.shift();
    }
    (next as Record<string, unknown>)[cat] = arr;
  }

  // Evict oldest array entries (in category order) until within total char cap.
  const evictOrder = [...ARRAY_CATEGORIES];
  let guard = 0;
  while (stateTotalChars(next) > STATE_LIMITS.MAX_TOTAL_CHARS && guard < 10000) {
    guard += 1;
    let evicted = false;
    for (const cat of evictOrder) {
      const arr = next[cat];
      if (Array.isArray(arr) && arr.length > 0) {
        arr.shift();
        evicted = true;
        break;
      }
    }
    if (!evicted) break; // only single-value fields remain; nothing left to trim
  }

  // Reconcile the labels map ONCE against the entries that are actually stored
  // in the final state. A label is retained iff its keyed text is still present
  // somewhere (any single-value field or array category); everything else is
  // pruned. This is the authoritative cleanup: it drops labels for evicted or
  // replaced entries, yet — unlike a per-category/per-eviction delete — never
  // orphans a label whose text is still stored under a different category, so
  // every instruction-like stored entry keeps exactly one label (Req 8.5) and no
  // label ever references a missing entry (Req 8.6).
  const storedTexts = new Set<string>();
  for (const cat of SINGLE_VALUE_CATEGORIES) {
    const v = next[cat];
    if (typeof v === 'string') storedTexts.add(v);
  }
  for (const cat of ARRAY_CATEGORIES) {
    const arr = next[cat];
    if (Array.isArray(arr)) for (const entry of arr) storedTexts.add(entry);
  }
  for (const key of Object.keys(labels)) {
    if (!storedTexts.has(key)) delete labels[key];
  }

  if (Object.keys(labels).length > 0) next.labels = labels;
  else delete next.labels;
  return next;
}

export { MEMORY_LIMITS };
