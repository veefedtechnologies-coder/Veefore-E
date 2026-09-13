import { describe, it, expect } from 'vitest';
import {
  classifyIntent,
  ALL_CAPABILITIES,
  type Capability,
  type ClassifyIntentInput,
} from '../server/routes/veegpt-intent.logic';
import type { Msg } from '../server/routes/veegpt-memory.logic';

/** Convenience builder so each test only specifies what it cares about. */
function input(overrides: Partial<ClassifyIntentInput> = {}): ClassifyIntentInput {
  return {
    message: '',
    priorMessages: [],
    hasMedia: false,
    ...overrides,
  };
}

const user = (content: string): Msg => ({ role: 'user', content });
const assistant = (content: string): Msg => ({ role: 'assistant', content });

describe('classifyIntent — trivial + baseline behavior', () => {
  it('treats a bare greeting as pure chat (no capability tools)', () => {
    const res = classifyIntent(input({ message: 'hello' }));
    expect(res.intents).toEqual(['chat']);
    expect(res.ambiguous).toBe(false);
    expect(res.usedFallback).toBe(false);
  });

  it('always includes chat as a base capability', () => {
    const res = classifyIntent(input({ message: 'write me a caption' }));
    expect(res.intents).toContain('chat');
  });

  it('returns capabilities in canonical ALL_CAPABILITIES order', () => {
    // "write a caption and schedule the post" → content_generation + posting + chat
    const res = classifyIntent(input({ message: 'write a caption and schedule the post' }));
    const orderIndex = (c: Capability) => ALL_CAPABILITIES.indexOf(c);
    const indices = res.intents.map(orderIndex);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });
});

describe('classifyIntent — ambiguous requests', () => {
  it('flags a non-trivial message with no task signal as ambiguous', () => {
    const res = classifyIntent(input({ message: 'hmm not really sure' }));
    expect(res.intents).toEqual(['chat']);
    expect(res.ambiguous).toBe(true);
    expect(res.usedFallback).toBe(false);
  });

  it('flags an empty message as ambiguous chat (never fallback)', () => {
    const res = classifyIntent(input({ message: '' }));
    expect(res.intents).toEqual(['chat']);
    expect(res.ambiguous).toBe(true);
    expect(res.usedFallback).toBe(false);
  });
});

describe('classifyIntent — multi-intent requests', () => {
  it('detects both content generation and posting in one turn', () => {
    const res = classifyIntent(input({ message: 'write a caption and schedule the post' }));
    expect(res.intents).toEqual(expect.arrayContaining(['content_generation', 'posting', 'chat']));
    expect(res.ambiguous).toBe(false);
  });

  it('detects a memory write alongside a task', () => {
    const res = classifyIntent(input({ message: 'remember my brand is blue and draft a caption' }));
    expect(res.intents).toEqual(expect.arrayContaining(['memory_write', 'content_generation']));
    expect(res.ambiguous).toBe(false);
  });
});

describe('classifyIntent — compound tasks', () => {
  it('resolves a three-capability compound request into the union of intents', () => {
    const res = classifyIntent(
      input({ message: 'research trending topics, write captions, and schedule them' }),
    );
    expect(res.intents).toEqual(
      expect.arrayContaining(['research', 'content_generation', 'posting']),
    );
    expect(res.ambiguous).toBe(false);
  });
});

describe('classifyIntent — follow-up / references to prior messages', () => {
  it('inherits intent from the most recent user turn for a short continuation', () => {
    const res = classifyIntent(
      input({
        message: 'what about last month',
        priorMessages: [user('show me my analytics'), assistant('Here are your analytics...')],
      }),
    );
    expect(res.intents).toContain('analytics');
    expect(res.ambiguous).toBe(false);
  });

  it('inherits intent from a bare confirmation ("yes, go ahead")', () => {
    const res = classifyIntent(
      input({
        message: 'yes, go ahead',
        priorMessages: [user('can you schedule this post for tomorrow?')],
      }),
    );
    expect(res.intents).toContain('posting');
    expect(res.ambiguous).toBe(false);
  });

  it('marks an unresolvable follow-up as ambiguous rather than guessing', () => {
    const res = classifyIntent(
      input({
        message: 'yes, go ahead',
        priorMessages: [user('tell me a joke')],
      }),
    );
    expect(res.intents).toEqual(['chat']);
    expect(res.ambiguous).toBe(true);
    expect(res.usedFallback).toBe(false);
  });
});

describe('classifyIntent — indirect tool requirements (structural signals)', () => {
  it('maps an explicitly forced tool to its capability without any keyword', () => {
    const res = classifyIntent(input({ message: 'go', forcedTool: 'get_analytics_insight' }));
    expect(res.intents).toContain('analytics');
    expect(res.ambiguous).toBe(false);
  });

  it('infers a posting intent from attached media alone', () => {
    const res = classifyIntent(input({ message: 'here you go', hasMedia: true }));
    expect(res.intents).toContain('posting');
    expect(res.ambiguous).toBe(false);
  });

  it('adds account_data when an account is selected on a data-oriented turn', () => {
    const withAccount = classifyIntent(
      input({ message: 'show me my performance', selectedAccountId: 'acc-123' }),
    );
    expect(withAccount.intents).toEqual(expect.arrayContaining(['analytics', 'account_data']));

    // Without a selected account the account_data intent is not inferred.
    const withoutAccount = classifyIntent(input({ message: 'show me my performance' }));
    expect(withoutAccount.intents).toContain('analytics');
    expect(withoutAccount.intents).not.toContain('account_data');
  });
});

describe('classifyIntent — error / empty fallback path (Req 6.6)', () => {
  it('fails open to the full capability set when classification throws', () => {
    // A getter that throws forces the internal try/catch into its fallback branch.
    const throwing = {
      get message(): string {
        throw new Error('boom');
      },
      priorMessages: [],
      hasMedia: false,
    } as unknown as ClassifyIntentInput;

    const res = classifyIntent(throwing);
    expect(res.intents).toEqual([...ALL_CAPABILITIES]);
    expect(res.ambiguous).toBe(true);
    expect(res.usedFallback).toBe(true);
  });

  it('tolerates a null/malformed input without throwing', () => {
    const res = classifyIntent(null as unknown as ClassifyIntentInput);
    // null?.message ?? '' → empty message → ambiguous chat (not the throw path).
    expect(res.intents.length).toBeGreaterThan(0);
    expect(res.intents).toContain('chat');
  });
});
