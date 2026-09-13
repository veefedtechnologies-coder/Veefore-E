import { describe, it, expect } from 'vitest';
import { reduceToolResult } from '../server/routes/veegpt-tool-result.logic';

// A small deterministic estimator (1 token per char) makes the token math
// easy to reason about in tests, independent of the shared heuristic.
const perChar = (s: string) => s.length;

function makePosts(n: number): Array<Record<string, unknown>> {
  return Array.from({ length: n }, (_, i) => ({
    id: `post_${i}`,
    title: `Title ${i}`,
    status: 'scheduled',
    caption: `Caption body number ${i} with some descriptive text.`,
    hashtags: ['a', 'b', 'c'],
    mediaUrls: [`https://cdn.example.com/${i}.jpg`],
    // duplicated/irrelevant metadata that should be projected away
    internalDebug: { trace: 'x'.repeat(50), fetchedAt: '2024-01-01T00:00:00Z' },
  }));
}

describe('reduceToolResult — payload within budget (Req 12.1)', () => {
  it('returns the payload unchanged when already within maxTokens', () => {
    const payload = makePosts(2);
    const r = reduceToolResult(payload, ['id', 'status'], 100000, {
      estimate: perChar,
    });
    expect(r.reduced).toBe(false);
    expect(r.payload).toEqual(payload);
    expect(r.retainedAboveMax).toBe(false);
  });

  it('still surfaces follow-up identifiers even when nothing is reduced', () => {
    const payload = makePosts(3);
    const r = reduceToolResult(payload, ['id'], 100000, {
      followUpIdentifierKeys: ['id'],
      estimate: perChar,
    });
    expect(r.identifiers).toEqual(['post_0', 'post_1', 'post_2']);
  });
});

describe('reduceToolResult — field projection (Req 12.1)', () => {
  it('projects records down to required + protected fields', () => {
    const payload = makePosts(5);
    const r = reduceToolResult(payload, ['title', 'status'], 200, {
      followUpIdentifierKeys: ['id'],
      estimate: perChar,
    });
    expect(r.reduced).toBe(true);
    for (const rec of r.payload as Array<Record<string, unknown>>) {
      // Only protected keys survive.
      expect(Object.keys(rec).sort()).toEqual(['id', 'status', 'title']);
      expect(rec).not.toHaveProperty('internalDebug');
      expect(rec).not.toHaveProperty('caption');
    }
  });
});

describe('reduceToolResult — pagination retains identifiers (Req 12.1/12.2)', () => {
  it('paginates trailing records but retains all follow-up identifiers', () => {
    const payload = makePosts(20);
    const r = reduceToolResult(payload, ['title'], 120, {
      followUpIdentifierKeys: ['id'],
      estimate: perChar,
    });
    expect(r.omittedRecordCount).toBeGreaterThan(0);
    expect((r.payload as unknown[]).length).toBeLessThan(20);
    // Every original follow-up id is still recoverable (Req 12.2).
    const expectedIds = payload.map((p) => p.id as string);
    expect(r.identifiers).toEqual(expectedIds);
  });

  it('never paginates below a single record', () => {
    const payload = makePosts(10);
    const r = reduceToolResult(payload, ['id', 'title', 'caption'], 1, {
      followUpIdentifierKeys: ['id'],
      estimate: perChar,
    });
    expect((r.payload as unknown[]).length).toBe(1);
    expect(r.retainedAboveMax).toBe(true); // still over budget → kept (Req 12.4)
  });
});

describe('reduceToolResult — relevance filtering (Req 12.1)', () => {
  it('drops records the caller marks irrelevant', () => {
    const payload = makePosts(10);
    const r = reduceToolResult(payload, ['id', 'title'], 300, {
      followUpIdentifierKeys: ['id'],
      isRelevant: (rec) => (rec as any).id === 'post_0' || (rec as any).id === 'post_1',
      estimate: perChar,
    });
    const ids = (r.payload as Array<Record<string, unknown>>).map((x) => x.id);
    expect(ids.every((id) => id === 'post_0' || id === 'post_1')).toBe(true);
  });
});

describe('reduceToolResult — never drops required info (Req 12.3/12.4)', () => {
  it('retains reasoning- and execution-required fields even above maxTokens', () => {
    const payload = makePosts(3);
    const r = reduceToolResult(payload, [], 1, {
      followUpIdentifierKeys: ['id'],
      reasoningRequiredKeys: ['status'],
      executionRequiredKeys: ['title'],
      estimate: perChar,
    });
    expect(r.retainedAboveMax).toBe(true);
    for (const rec of r.payload as Array<Record<string, unknown>>) {
      // Equally essential reasoning + execution keys both survive (Req 12.4).
      expect(rec).toHaveProperty('id');
      expect(rec).toHaveProperty('status');
      expect(rec).toHaveProperty('title');
    }
  });

  it('does not erase records when no required fields are known', () => {
    const payload = makePosts(3);
    const r = reduceToolResult(payload, [], 1, { estimate: perChar });
    // No protected keys → projection is skipped so nothing is erased.
    for (const rec of r.payload as Array<Record<string, unknown>>) {
      expect(Object.keys(rec).length).toBeGreaterThan(0);
    }
  });
});

describe('reduceToolResult — single object payload (Req 12.1/12.4)', () => {
  it('projects an over-budget object to required fields', () => {
    const payload = {
      id: 'acct_1',
      followers: 1234,
      bio: 'x'.repeat(500),
      internal: { trace: 'y'.repeat(500) },
    };
    const r = reduceToolResult(payload, ['followers'], 50, {
      followUpIdentifierKeys: ['id'],
      estimate: perChar,
    });
    expect(r.reduced).toBe(true);
    expect(r.payload).toHaveProperty('id');
    expect(r.payload).toHaveProperty('followers');
    expect(r.payload).not.toHaveProperty('bio');
    expect(r.identifiers).toEqual(['acct_1']);
  });
});

describe('reduceToolResult — opaque string payload (Req 12.4)', () => {
  it('retains an oversized opaque string whole', () => {
    const text = 'Reasoning-required analytics: 1234 followers, 56 posts. '.repeat(20);
    const r = reduceToolResult(text, [], 50, { estimate: perChar });
    expect(r.payload).toBe(text);
    expect(r.reduced).toBe(false);
    expect(r.retainedAboveMax).toBe(true);
  });

  it('leaves a small string untouched', () => {
    const r = reduceToolResult('short', [], 100, { estimate: perChar });
    expect(r.payload).toBe('short');
    expect(r.retainedAboveMax).toBe(false);
  });
});

describe('reduceToolResult — fail-safe (correctness wins)', () => {
  it('returns the original payload on estimator error', () => {
    const payload = makePosts(2);
    const boom = () => {
      throw new Error('estimator blew up');
    };
    const r = reduceToolResult(payload, ['id'], 10, { estimate: boom });
    expect(r.payload).toBe(payload);
    expect(r.reduced).toBe(false);
  });
});
