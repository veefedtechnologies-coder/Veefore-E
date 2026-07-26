/**
 * Pure (DB-free) logic for the cross-chat User Memory layer: merging newly
 * extracted facts into the existing item list under hard storage caps, and
 * computing the usage stats shown in Settings. Kept separate so it can be
 * unit-tested without a database or AI calls.
 */

import { MEMORY_LIMITS, type IUserMemoryItem } from '../models/Chat/UserMemory';

export type MemoryItem = Pick<IUserMemoryItem, 'id' | 'text'> & { createdAt?: Date };

/** Normalize text for dedupe comparison (case/space/punctuation-insensitive). */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Known SINGLE-VALUE topics: attributes a user has exactly one current value
 * for. When a new fact matches the SAME topic as an existing fact, we REPLACE
 * the old one instead of storing a near-duplicate (e.g. "posting schedule is
 * Sunday" then "posting schedule is Sunday and Monday"). Deliberately
 * conservative — only well-defined, obviously-single-value attributes are here,
 * so distinct facts are never wrongly merged.
 */
const SINGLE_VALUE_TOPICS: Array<{ topic: string; test: RegExp }> = [
  { topic: 'posting-schedule', test: /\b(posting schedule|posts? (only )?(on|in|every)|post schedule|publishing schedule|posting day|posting time|posts? at)\b/i },
  { topic: 'brand-color', test: /\bbrand colou?r\b/i },
  { topic: 'niche', test: /\bniche\b/i },
  { topic: 'target-audience', test: /\b(target audience|audience is)\b/i },
  { topic: 'primary-goal', test: /\b(primary (goal|objective)|main goal|biggest goal)\b/i },
  { topic: 'brand-name', test: /\b(brand name|business name|company name|brand is called|page is called)\b/i },
  { topic: 'posting-frequency', test: /\b(posting frequency|posts? (\d+|once|twice|thrice) (times? )?(a|per) (day|week|month))\b/i },
  { topic: 'content-tone', test: /\b(content tone|brand voice|tone of voice|writing tone)\b/i },
];

/**
 * Detect the single-value topic of a fact, or null if it isn't a known
 * single-value attribute (in which case it's treated as an ordinary fact and
 * only exact near-duplicates are de-duped).
 */
export function detectTopic(text: string): string | null {
  for (const { topic, test } of SINGLE_VALUE_TOPICS) {
    if (test.test(text)) return topic;
  }
  return null;
}

/** Clamp a single item's text to the per-item limit. */
export function clampItemText(text: string): string {
  const t = text.trim();
  return t.length > MEMORY_LIMITS.MAX_ITEM_CHARS ? t.slice(0, MEMORY_LIMITS.MAX_ITEM_CHARS).trim() : t;
}

export interface MergeResult {
  items: MemoryItem[];
  added: number;
  skippedDuplicate: number;
  evicted: number;
  /** How many existing facts were replaced because an incoming fact superseded
   * them on a known single-value topic (e.g. posting schedule changed). */
  replaced: number;
}

/**
 * Merge newly extracted facts into the existing items, enforcing caps:
 *  - skip blanks and near-duplicates (by normalized text)
 *  - REPLACE an existing fact when an incoming fact covers the SAME known
 *    single-value topic (e.g. posting schedule, brand color) — keeps one fact
 *    per topic instead of accumulating near-duplicates
 *  - clamp each item to MAX_ITEM_CHARS
 *  - keep newest items when exceeding MAX_ITEMS or MAX_CHARS (evict oldest)
 *
 * `makeId` lets the caller inject id generation (deterministic in tests).
 */
export function mergeMemoryItems(
  existing: MemoryItem[],
  incoming: string[],
  makeId: () => string,
): MergeResult {
  const items = existing.map((it) => ({ ...it }));
  const seen = new Set(items.map((it) => normalize(it.text)));
  let added = 0;
  let skippedDuplicate = 0;
  let replaced = 0;

  for (const raw of incoming) {
    const text = clampItemText(raw || '');
    if (!text) continue;
    const key = normalize(text);
    if (!key || seen.has(key)) {
      skippedDuplicate += 1;
      continue;
    }

    // Single-value topic? Replace the existing fact on that topic in place.
    const topic = detectTopic(text);
    if (topic) {
      const idx = items.findIndex((it) => detectTopic(it.text) === topic);
      if (idx !== -1) {
        seen.delete(normalize(items[idx].text));
        items[idx] = { ...items[idx], text, createdAt: new Date() };
        seen.add(key);
        replaced += 1;
        continue;
      }
    }

    seen.add(key);
    items.push({ id: makeId(), text, createdAt: new Date() });
    added += 1;
  }

  // Enforce caps by evicting the OLDEST items (front of the array) first.
  let evicted = 0;
  while (items.length > MEMORY_LIMITS.MAX_ITEMS) {
    items.shift();
    evicted += 1;
  }
  while (items.length > 1 && totalChars(items) > MEMORY_LIMITS.MAX_CHARS) {
    items.shift();
    evicted += 1;
  }

  return { items, added, skippedDuplicate, evicted, replaced };
}

/** Sum of characters across all item texts. */
export function totalChars(items: MemoryItem[]): number {
  return items.reduce((sum, it) => sum + it.text.length, 0);
}

/**
 * True when the stored facts have hit a hard cap (item count or character
 * budget). At this point NEW facts can't be saved without evicting older ones —
 * callers use this to REFUSE new saves and tell the user their memory is full,
 * rather than silently dropping older memories.
 */
export function isMemoryFull(items: MemoryItem[]): boolean {
  return (
    items.length >= MEMORY_LIMITS.MAX_ITEMS ||
    totalChars(items) >= MEMORY_LIMITS.MAX_CHARS
  );
}

/**
 * Collapse items that have the same normalized text down to a single copy
 * (keeping the FIRST occurrence). Used after an in-place update, since editing
 * one fact's text can make it identical to another existing fact. Returns the
 * deduped list and how many duplicates were removed.
 */
export function dedupeMemoryItems(items: MemoryItem[]): { items: MemoryItem[]; removed: number } {
  const seen = new Set<string>();
  const out: MemoryItem[] = [];
  let removed = 0;
  for (const it of items) {
    const key = normalize(it.text);
    if (key && seen.has(key)) {
      removed += 1;
      continue;
    }
    if (key) seen.add(key);
    out.push(it);
  }
  return { items: out, removed };
}

export interface MemoryUsage {
  itemCount: number;
  maxItems: number;
  usedChars: number;
  maxChars: number;
  /** 0–100, based on the more-constraining of the two caps (chars vs items). */
  usedPercent: number;
  remainingPercent: number;
}

/** Compute usage stats for the Settings storage bar. `extraChars` accounts for
 * other data stored in the same memory document (e.g. the workspace/account
 * context snapshot), so the bar reflects everything VeeGPT stores. */
export function computeUsage(items: MemoryItem[], extraChars = 0): MemoryUsage {
  const usedChars = totalChars(items) + Math.max(0, extraChars);
  const itemCount = items.length;
  const charPct = MEMORY_LIMITS.MAX_CHARS > 0 ? (usedChars / MEMORY_LIMITS.MAX_CHARS) * 100 : 0;
  const itemPct = MEMORY_LIMITS.MAX_ITEMS > 0 ? (itemCount / MEMORY_LIMITS.MAX_ITEMS) * 100 : 0;
  const usedPercent = Math.min(100, Math.round(Math.max(charPct, itemPct)));
  return {
    itemCount,
    maxItems: MEMORY_LIMITS.MAX_ITEMS,
    usedChars,
    maxChars: MEMORY_LIMITS.MAX_CHARS,
    usedPercent,
    remainingPercent: 100 - usedPercent,
  };
}

export { MEMORY_LIMITS };

/**
 * Detect when the user is (directly or indirectly) asking VeeGPT to remember
 * something. When true, the route runs memory extraction IMMEDIATELY instead of
 * waiting for the periodic throttle, so "remember my brand is X" is saved right
 * away. Kept here (pure) so it can be unit-tested.
 */
export function hasSaveIntent(text: string): boolean {
  const t = (text || '').toLowerCase();
  return /\b(remember|save|note (this|that|it|down)|keep in mind|don'?t forget|make a note|memorri?ze|memorize|store (this|that|it)|for future reference|keep track of|take note)\b/.test(t);
}

/**
 * Deterministically extract the fact the user asked to remember, WITHOUT an LLM
 * call, so an explicit "remember X" is saved reliably even when AI quota is
 * exhausted. Strips the save-request wording and rewrites first-person to a
 * neutral third-person-ish statement. Returns null if nothing meaningful is left.
 *
 * Examples:
 *   "remember that I post only on weekends" → "Posts only on weekends"
 *   "save my brand color is blue"           → "Brand color is blue"
 *   "we only post in weekend remember that"  → "Only post in weekend"
 */
export function extractSaveIntentFact(text: string): string | null {
  let t = (text || '').trim();
  if (!t) return null;

  // Remove trailing/leading save-request phrases.
  const savePhrase =
    /(please\s+)?(remember|save|note( this| that| it| down)?|keep in mind|don'?t forget|make a note|memorize|store( this| that| it)?|for future reference|keep track of|take note)(\s+(that|this|of|to))?/gi;

  // Strip a leading save phrase ("remember that ...").
  t = t.replace(new RegExp('^\\s*' + savePhrase.source, 'i'), '').trim();
  // Strip a trailing save phrase ("... remember that").
  t = t.replace(new RegExp(savePhrase.source + '\\s*[.!]?\\s*$', 'i'), '').trim();
  // Drop leftover leading conjunctions/punctuation.
  t = t.replace(/^[\s,:;-]+/, '').replace(/[\s,:;-]+$/, '').trim();

  if (t.length < 2) return null;

  // Keep the user's own wording (don't mangle it); just capitalize the first
  // letter so it reads as a clean statement, e.g.:
  //   "remember I post reels every Friday" → "I post reels every Friday"
  //   "save my brand color is blue"        → "My brand color is blue"
  const fact = t.charAt(0).toUpperCase() + t.slice(1);
  return clampItemText(fact);
}
