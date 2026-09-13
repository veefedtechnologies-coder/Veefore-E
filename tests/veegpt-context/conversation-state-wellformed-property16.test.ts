import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  mergeConversationState,
  classifyLabel,
  isInstructionLike,
  isValidCategory,
  stateTotalChars,
  CONVERSATION_STATE_CATEGORIES,
  SINGLE_VALUE_CATEGORIES,
  ARRAY_CATEGORIES,
  STATE_LIMITS,
  type StateCandidate,
  type StateSource,
  type ConversationState,
} from '../../server/routes/veegpt-conversation-state.logic';
import type { ConversationStateLabel } from '../../server/models/Chat/ChatConversation';

// Feature: veegpt-context-optimization, Property 16: Conversation_State is well-formed
// Validates: Requirements 8.1, 8.3, 8.5, 8.6
//
// For any candidate conversational item, only items belonging to the allowed
// categories are persisted into Conversation_State, and every instruction-like
// entry is assigned exactly one label or is excluded (with the raw message
// retained as the source).
//
// This property exercises the pure `mergeConversationState` logic (no DB, no
// network — matching the veegpt-*.logic convention) and asserts the following
// universal invariants over the merged state:
//   1. Only enumerated categories are ever persisted (Req 8.1/8.3); junk
//      categories are dropped and counted, never materialized as state keys.
//   2. Every instruction-like STORED entry carries exactly one valid label
//      (Req 8.5); no stored instruction-like entry is left unlabeled.
//   3. Instruction-like entries that cannot be assigned exactly one label are
//      EXCLUDED, and their raw message is retained as the source (Req 8.6).
//   4. USER-sourced content is never labeled `system_instruction` (trust
//      boundary — Req 17.4/18.2 backing 8.5).
//   5. Size caps are respected (bounded state).

const ALL_LABELS: readonly ConversationStateLabel[] = [
  'user_preference',
  'user_request',
  'factual_state',
  'application_state',
  'system_instruction',
];

/** The only own-keys the merged state object may ever expose. */
const ALLOWED_STATE_KEYS = new Set<string>([
  ...CONVERSATION_STATE_CATEGORIES,
  'version',
  'labels',
  'summarizedMessageCount',
  'updatedAt',
]);

/**
 * A corpus of realistic conversational phrases spanning every label class plus
 * plain (non-instruction-like) data and a deliberately ambiguous multi-label
 * phrase. Mixing these with arbitrary noise lets the property meaningfully
 * exercise labeling, exclusion, and the trust boundary rather than only the
 * (mostly unlabeled) arbitrary-string path.
 */
const PHRASES = [
  // instruction-like → user_preference (single label)
  'I prefer punchy captions',
  "I'd rather post in the morning",
  // instruction-like → user_request (single label)
  'please create a launch post',
  'can you write a caption for this',
  'generate three content ideas',
  // instruction-like + system matcher → system_instruction when non-user sourced
  'you must follow the system policy',
  'this must be enforced by policy',
  // plain data (NOT instruction-like) → stored without a label
  'our brand color is blue',
  'we sell fitness gear',
  'the reel is currently selected',
  // ambiguous: matches >1 label → excluded with raw retained
  'I prefer that you please create it',
  'please always prefer using the system policy',
];

const sourceArb: fc.Arbitrary<StateSource> = fc.constantFrom(
  'user',
  'tool',
  'app',
  'system'
);

/** Text: a corpus phrase, arbitrary noise, or a phrase + noise combination. */
const textArb: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(...PHRASES),
  fc.string({ maxLength: 300 }),
  fc
    .tuple(fc.constantFrom(...PHRASES), fc.string({ maxLength: 200 }))
    .map(([p, s]) => `${p} ${s}`),
  // occasional long text to drive per-entry clamping and total-char eviction
  fc.string({ minLength: 300, maxLength: 900 })
);

/** Category: valid enumerated category OR junk that must be rejected. */
const categoryArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 4, arbitrary: fc.constantFrom(...CONVERSATION_STATE_CATEGORIES) },
  {
    weight: 1,
    arbitrary: fc
      .constantFrom('summary', 'notes', 'misc', 'random', '', 'Objective', 'FACTS')
      .filter((c) => !isValidCategory(c)),
  },
  { weight: 1, arbitrary: fc.string({ maxLength: 12 }).filter((c) => !isValidCategory(c)) }
);

const candidateArb: fc.Arbitrary<StateCandidate> = fc.record({
  category: categoryArb,
  text: textArb,
  source: sourceArb,
});

const candidatesArb: fc.Arbitrary<StateCandidate[]> = fc.array(candidateArb, {
  maxLength: 60,
});

/** Collect every stored entry (single-value + array) with its category. */
function storedEntries(state: ConversationState): string[] {
  const out: string[] = [];
  for (const cat of SINGLE_VALUE_CATEGORIES) {
    const v = state[cat];
    if (typeof v === 'string') out.push(v);
  }
  for (const cat of ARRAY_CATEGORIES) {
    const arr = state[cat];
    if (Array.isArray(arr)) out.push(...arr);
  }
  return out;
}

describe('veegpt-conversation-state · Property 16 — Conversation_State is well-formed', () => {
  it('persists only allowed categories, labels every instruction-like entry exactly once (or excludes it), and stays bounded', () => {
    fc.assert(
      fc.property(candidatesArb, (candidates) => {
        const res = mergeConversationState(undefined, candidates);
        const state = res.state;
        const entries = storedEntries(state);

        // ── (1) Only enumerated categories are persisted (Req 8.1/8.3) ──────
        // The state object exposes no unknown keys, and every candidate with an
        // invalid category was dropped (counted), never turned into a key.
        for (const key of Object.keys(state)) {
          expect(ALLOWED_STATE_KEYS.has(key)).toBe(true);
        }
        const invalidCount = candidates.filter(
          (c) => (c.text ?? '').trim() && !isValidCategory(c.category)
        ).length;
        expect(res.skippedInvalidCategory).toBe(invalidCount);

        // ── (5) Size caps respected (bounded state) ─────────────────────────
        for (const cat of ARRAY_CATEGORIES) {
          const arr = state[cat];
          if (Array.isArray(arr)) {
            expect(arr.length).toBeLessThanOrEqual(
              STATE_LIMITS.MAX_ITEMS_PER_CATEGORY
            );
          }
        }
        expect(stateTotalChars(state)).toBeLessThanOrEqual(
          STATE_LIMITS.MAX_TOTAL_CHARS
        );
        for (const entry of entries) {
          expect(entry.length).toBeLessThanOrEqual(STATE_LIMITS.MAX_ITEM_CHARS);
        }

        // ── labels map integrity ────────────────────────────────────────────
        const labels = state.labels ?? {};
        const entrySet = new Set(entries);
        for (const [entryText, label] of Object.entries(labels)) {
          // every label value is one of the five allowed labels …
          expect(ALL_LABELS.includes(label)).toBe(true);
          // … and never references an entry that isn't currently stored.
          expect(entrySet.has(entryText)).toBe(true);
        }

        // ── (2) Every instruction-like STORED entry carries exactly one label
        for (const entry of entries) {
          if (isInstructionLike(entry)) {
            const label = labels[entry];
            expect(label).toBeDefined();
            expect(ALL_LABELS.includes(label as ConversationStateLabel)).toBe(
              true
            );
          }
        }

        // ── (3) Exclusions retain the raw message as the source (Req 8.6) ───
        // Each excluded instruction-like entry contributes exactly one retained
        // raw message, so the source is never lost.
        expect(res.retainedRawMessages.length).toBe(res.excludedUnlabeled);
      }),
      { numRuns: 300 }
    );
  });

  it('never labels USER-sourced content as system_instruction (trust boundary)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ category: categoryArb, text: textArb }),
          { maxLength: 60 }
        ),
        (raw) => {
          // Force every candidate to the least-trusted (user) source.
          const candidates: StateCandidate[] = raw.map((c) => ({
            ...c,
            source: 'user' as const,
          }));
          const res = mergeConversationState(undefined, candidates);
          const labelValues = Object.values(res.state.labels ?? {});
          expect(labelValues).not.toContain('system_instruction');
        }
      ),
      { numRuns: 300 }
    );
  });

  it('classifyLabel never returns system_instruction for user-sourced text', () => {
    fc.assert(
      fc.property(textArb, (text) => {
        expect(classifyLabel(text, 'user')).not.toBe('system_instruction');
      }),
      { numRuns: 300 }
    );
  });
});
