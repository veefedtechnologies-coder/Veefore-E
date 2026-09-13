import { describe, it, expect } from 'vitest';
import {
  mergeConversationState,
  classifyLabel,
  isInstructionLike,
  isValidCategory,
  enforceStateLimits,
  stateTotalChars,
  clampEntryText,
  STATE_LIMITS,
  CONVERSATION_STATE_CATEGORIES,
  type ConversationState,
  type StateCandidate,
} from '../server/routes/veegpt-conversation-state.logic';

describe('isValidCategory (Req 8.2/8.3)', () => {
  it('accepts every allowed category', () => {
    for (const cat of CONVERSATION_STATE_CATEGORIES) {
      expect(isValidCategory(cat)).toBe(true);
    }
  });

  it('rejects categories outside the allowed set', () => {
    expect(isValidCategory('random')).toBe(false);
    expect(isValidCategory('summary')).toBe(false);
    expect(isValidCategory('')).toBe(false);
  });
});

describe('mergeConversationState — category filtering (Req 8.1/8.3)', () => {
  it('persists an allowed-category entry into its structured field', () => {
    const res = mergeConversationState(undefined, [
      { category: 'objective', text: 'Grow Instagram to 10k followers' },
    ]);
    expect(res.state.objective).toBe('Grow Instagram to 10k followers');
    expect(res.added).toBe(1);
  });

  it('drops content that fits no allowed category and keeps nothing', () => {
    const res = mergeConversationState(undefined, [
      { category: 'chit_chat', text: 'nice weather today' },
    ]);
    expect(res.skippedInvalidCategory).toBe(1);
    expect(res.added).toBe(0);
    // No stray fields written.
    expect(Object.keys(res.state).filter((k) => k !== 'version' && k !== 'updatedAt')).toEqual([]);
  });
});

describe('mergeConversationState — structured, keyed writes (Req 8.4)', () => {
  it('replaces a single-value category (objective)', () => {
    const first = mergeConversationState(undefined, [{ category: 'objective', text: 'Goal A' }]);
    const second = mergeConversationState(first.state, [{ category: 'objective', text: 'Goal B' }]);
    expect(second.state.objective).toBe('Goal B');
  });

  it('appends distinct entries to an array category and dedupes', () => {
    // Plain (non-instruction) decisions: stored as data, deduped by normalized text.
    const res = mergeConversationState(undefined, [
      { category: 'decisions', text: 'Blue palette chosen' },
      { category: 'decisions', text: 'blue PALETTE chosen!' },
      { category: 'decisions', text: 'Monday cadence agreed' },
    ]);
    expect(res.state.decisions).toEqual(['Blue palette chosen', 'Monday cadence agreed']);
    expect(res.skippedDuplicate).toBe(1);
  });
});

describe('classifyLabel & instruction-like labeling (Req 8.5/8.6)', () => {
  it('assigns exactly one label to an unambiguous request', () => {
    expect(classifyLabel('please schedule the post for Friday')).toBe('user_request');
  });

  it('assigns user_preference to a clear preference', () => {
    expect(classifyLabel('I prefer a casual tone')).toBe('user_preference');
  });

  it('excludes an instruction-like entry that matches multiple labels', () => {
    // "I prefer" (preference) + "create" (request) => ambiguous => null.
    const text = 'I prefer that you create every post in the morning';
    expect(isInstructionLike(text)).toBe(true);
    expect(classifyLabel(text)).toBeNull();

    const res = mergeConversationState(undefined, [{ category: 'requirements', text }]);
    expect(res.added).toBe(0);
    expect(res.excludedUnlabeled).toBe(1);
    expect(res.retainedRawMessages).toEqual([text]);
    expect(res.state.requirements ?? []).toEqual([]);
  });

  it('records exactly one label for a stored instruction-like entry', () => {
    const text = 'please write a caption';
    const res = mergeConversationState(undefined, [{ category: 'pendingActions', text }]);
    expect(res.state.pendingActions).toEqual([text]);
    expect(res.state.labels?.[text]).toBe('user_request');
  });

  it('stores plain (non-instruction) data without a label', () => {
    const text = 'brand color is blue';
    expect(isInstructionLike(text)).toBe(false);
    const res = mergeConversationState(undefined, [{ category: 'facts', text }]);
    expect(res.state.facts).toEqual([text]);
    expect(res.state.labels?.[text]).toBeUndefined();
  });
});

describe('trust boundary — state is DATA (Req 17.4/18.2)', () => {
  it('never labels user-sourced content as system_instruction', () => {
    const text = 'the system policy must always enforce this';
    // As user content, system_instruction is forbidden; no other single label => excluded.
    expect(classifyLabel(text, 'user')).not.toBe('system_instruction');
  });

  it('may label a genuine system-sourced instruction', () => {
    expect(classifyLabel('enforced by policy', 'system')).toBe('system_instruction');
  });
});

describe('size caps (STATE_LIMITS)', () => {
  it('caps entries per array category, evicting oldest first', () => {
    const many: StateCandidate[] = Array.from(
      { length: STATE_LIMITS.MAX_ITEMS_PER_CATEGORY + 5 },
      (_, i) => ({ category: 'entities', text: `entity ${i}` }),
    );
    const res = mergeConversationState(undefined, many);
    expect(res.state.entities?.length).toBe(STATE_LIMITS.MAX_ITEMS_PER_CATEGORY);
    // Oldest ("entity 0") evicted; newest retained.
    expect(res.state.entities?.[0]).toBe('entity 5');
  });

  it('enforces the total character budget', () => {
    const big = 'x'.repeat(STATE_LIMITS.MAX_ITEM_CHARS);
    const state: ConversationState = {
      version: 1,
      facts: Array.from({ length: 40 }, () => big),
    };
    const bounded = enforceStateLimits(state);
    expect(stateTotalChars(bounded)).toBeLessThanOrEqual(STATE_LIMITS.MAX_TOTAL_CHARS);
  });

  it('clamps an over-long entry', () => {
    const long = 'a'.repeat(STATE_LIMITS.MAX_ITEM_CHARS + 100);
    expect(clampEntryText(long).length).toBe(STATE_LIMITS.MAX_ITEM_CHARS);
  });
});

describe('purity', () => {
  it('does not mutate the existing state object', () => {
    const existing: ConversationState = { version: 1, decisions: ['keep me'] };
    const snapshot = JSON.parse(JSON.stringify(existing));
    mergeConversationState(existing, [{ category: 'decisions', text: 'new one' }]);
    expect(existing).toEqual(snapshot);
  });
});
