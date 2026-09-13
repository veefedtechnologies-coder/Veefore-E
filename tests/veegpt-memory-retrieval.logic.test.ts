import { describe, it, expect } from 'vitest';
import {
  retrieveUserMemory,
  renderMemoryProfile,
  resolveScopes,
  tokenize,
  isBroadRecall,
  isItemRelevant,
  MEMORY_SCOPES,
  detectTopic,
  type MemoryItem,
} from '../server/routes/veegpt-memory-retrieval.logic';

function items(texts: string[]): MemoryItem[] {
  return texts.map((t, i) => ({ id: `e${i}`, text: t }));
}

describe('resolveScopes', () => {
  it('defaults every scope to included and they are independently addressable', () => {
    const scopes = resolveScopes();
    for (const scope of MEMORY_SCOPES) expect(scopes[scope]).toBe(true);
  });

  it('honors independent per-scope overrides without affecting others', () => {
    const scopes = resolveScopes({ userMemory: false });
    expect(scopes.userMemory).toBe(false);
    expect(scopes.conversationMemory).toBe(true);
    expect(scopes.shortTerm).toBe(true);
    expect(scopes.retrievedKnowledge).toBe(true);
  });
});

describe('tokenize', () => {
  it('keeps significant words and drops stopwords and short tokens', () => {
    const t = tokenize('What is my brand color for the campaign?');
    expect(t.has('brand')).toBe(true);
    expect(t.has('color')).toBe(true);
    expect(t.has('campaign')).toBe(true);
    // stopwords / short tokens excluded
    expect(t.has('the')).toBe(false);
    expect(t.has('is')).toBe(false);
    expect(t.has('my')).toBe(false);
  });
});

describe('isBroadRecall', () => {
  it('detects broad profile-recall requests', () => {
    for (const m of [
      'what do you know about me',
      'tell me about my account',
      'remind me my details',
      'who am i',
    ]) {
      expect(isBroadRecall(m)).toBe(true);
    }
  });

  it('does not fire for narrow, topic-specific questions', () => {
    for (const m of [
      'what is my brand color',
      'give me 5 reel ideas',
      'when do I post',
    ]) {
      expect(isBroadRecall(m)).toBe(false);
    }
  });
});

describe('isItemRelevant', () => {
  it('matches on shared single-value topic', () => {
    const topic = detectTopic('what is my posting schedule');
    expect(topic).not.toBeNull();
    const item = { id: 'a', text: 'Posting schedule is Sunday and Monday' };
    expect(isItemRelevant(item, topic, tokenize('what is my posting schedule'))).toBe(true);
  });

  it('matches on shared significant token', () => {
    const req = tokenize('any tips for my fitness content');
    const item = { id: 'a', text: 'Niche is fitness' };
    expect(isItemRelevant(item, null, req)).toBe(true);
  });

  it('excludes an unrelated fact', () => {
    const req = tokenize('write a caption about coffee');
    const item = { id: 'a', text: 'Brand color is blue' };
    expect(isItemRelevant(item, null, req)).toBe(false);
  });
});

describe('renderMemoryProfile', () => {
  it('matches the legacy "- [id:<id>] <text>" format', () => {
    expect(renderMemoryProfile(items(['Name is Alice', 'Niche is fitness']))).toBe(
      '- [id:e0] Name is Alice\n- [id:e1] Niche is fitness',
    );
  });

  it('empty list → empty string', () => {
    expect(renderMemoryProfile([])).toBe('');
  });
});

describe('retrieveUserMemory — selective retrieval (Req 9.2/9.3)', () => {
  const store = items([
    'Name is Alice',
    'Niche is fitness',
    'Brand color is blue',
    'Posting schedule is Sunday and Monday',
  ]);

  it('retrieves only relevant items and excludes unrelated facts', () => {
    const res = retrieveUserMemory({ items: store, currentMessage: 'what is my brand color?' });
    expect(res.includedAll).toBe(false);
    expect(res.items.map((i) => i.text)).toEqual(['Brand color is blue']);
    expect(res.profile).toBe('- [id:e2] Brand color is blue');
  });

  it('excludes ALL when the request relates to no stored fact (Req 9.3)', () => {
    const res = retrieveUserMemory({ items: store, currentMessage: 'explain the instagram algorithm' });
    expect(res.includedAll).toBe(false);
    expect(res.items).toHaveLength(0);
    expect(res.profile).toBe('');
  });

  it('matches on a shared single-value topic', () => {
    const res = retrieveUserMemory({ items: store, currentMessage: 'what is my posting schedule?' });
    expect(res.items.map((i) => i.text)).toContain('Posting schedule is Sunday and Monday');
  });

  it('keeps follow-up questions relevant using the prior user message', () => {
    const res = retrieveUserMemory({
      items: store,
      currentMessage: 'and what about that?',
      priorMessages: [{ role: 'user', content: 'tell me about my niche' }],
    });
    expect(res.items.map((i) => i.text)).toContain('Niche is fitness');
  });

  it('preserves original stored order in the selected subset', () => {
    const res = retrieveUserMemory({
      items: store,
      currentMessage: 'remind me my niche and brand color',
    });
    expect(res.items.map((i) => i.text)).toEqual(['Niche is fitness', 'Brand color is blue']);
  });
});

describe('retrieveUserMemory — fail open toward completeness (Req 9.7)', () => {
  const store = items(['Name is Alice', 'Niche is fitness', 'Brand color is blue']);

  it('includes ALL memory for a broad recall request', () => {
    const res = retrieveUserMemory({ items: store, currentMessage: 'what do you know about me?' });
    expect(res.includedAll).toBe(true);
    expect(res.items).toHaveLength(3);
    expect(res.profile).toBe(renderMemoryProfile(store));
  });

  it('includes ALL memory when the request carries no usable signal', () => {
    const res = retrieveUserMemory({ items: store, currentMessage: 'hi' });
    expect(res.includedAll).toBe(true);
    expect(res.items).toHaveLength(3);
  });

  it('includes ALL memory (times out) when relevance cannot be determined in budget', () => {
    // Clock jumps past the budget on the first in-loop check → fail open.
    let calls = 0;
    const now = () => (calls++ === 0 ? 0 : 10_000);
    const res = retrieveUserMemory({
      items: store,
      currentMessage: 'what is my brand color?',
      budgetMs: 100,
      now,
    });
    expect(res.timedOut).toBe(true);
    expect(res.failedOpen).toBe(true);
    expect(res.includedAll).toBe(true);
    expect(res.items).toHaveLength(3);
  });
});

describe('retrieveUserMemory — scope independence & current message (Req 9.1/9.6)', () => {
  const store = items(['Name is Alice', 'Niche is fitness']);

  it('returns nothing when the userMemory scope is excluded', () => {
    const res = retrieveUserMemory({
      items: store,
      currentMessage: 'what is my niche?',
      scopes: { userMemory: false },
    });
    expect(res.items).toHaveLength(0);
    expect(res.profile).toBe('');
    expect(res.scopes.userMemory).toBe(false);
    expect(res.scopes.conversationMemory).toBe(true);
  });

  it('never mutates the input items array (current turn untouched here)', () => {
    const input = items(['Name is Alice']);
    const snapshot = input.map((i) => ({ ...i }));
    retrieveUserMemory({ items: input, currentMessage: 'what is my name?' });
    expect(input).toEqual(snapshot);
  });

  it('empty store returns an empty, complete result', () => {
    const res = retrieveUserMemory({ items: [], currentMessage: 'what is my niche?' });
    expect(res.items).toHaveLength(0);
    expect(res.totalCandidates).toBe(0);
  });
});
