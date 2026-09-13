import { describe, it, expect } from 'vitest';
import {
  planHistoryCompaction,
  extractStateCandidates,
  historyWindowTokens,
  messageTokens,
} from '../server/routes/veegpt-history-compaction.logic';
import type { Msg } from '../server/routes/veegpt-memory.logic';

/**
 * Unit tests for the bounded conversation-history compaction planner
 * (spec: veegpt-context-optimization, task 7.3; Req 7.1–7.6, 19.3).
 *
 * The exhaustive property-based checks (Property 7 — history tokens bounded
 * independent of turn count; Property 8 — the current user message is always
 * retained) live in tasks 7.5/7.6. These are example-based smoke tests.
 */

/** Build a window of N messages with the given per-message content. */
function window(n: number, content = 'hello there this is a message'): Msg[] {
  return Array.from({ length: n }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `${content} #${i}`,
  }));
}

describe('planHistoryCompaction', () => {
  it('keeps the full window unchanged when within budget', () => {
    const win = window(5);
    const plan = planHistoryCompaction({
      recentWindow: win,
      historyTokenBudget: 100000,
    });
    expect(plan.compactionOccurred).toBe(false);
    expect(plan.failedOpen).toBe(false);
    expect(plan.history).toEqual(win);
    expect(plan.toCompact).toEqual([]);
    expect(plan.historyTokens).toBe(historyWindowTokens(win));
  });

  it('bounds history tokens to the budget by compacting the oldest messages', () => {
    const win = window(200);
    const budget = 200;
    const plan = planHistoryCompaction({
      recentWindow: win,
      historyTokenBudget: budget,
    });
    expect(plan.compactionOccurred).toBe(true);
    expect(plan.historyTokens).toBeLessThanOrEqual(budget);
    // Retained window is a suffix of the original; overflow is the prefix.
    expect(plan.toCompact.concat(plan.history)).toEqual(win);
    // Newest message is always retained.
    expect(plan.history[plan.history.length - 1]).toEqual(win[win.length - 1]);
  });

  it('is bounded independent of turn count (more turns → same bound)', () => {
    const budget = 300;
    const small = planHistoryCompaction({ recentWindow: window(50), historyTokenBudget: budget });
    const large = planHistoryCompaction({ recentWindow: window(5000), historyTokenBudget: budget });
    expect(small.historyTokens).toBeLessThanOrEqual(budget);
    expect(large.historyTokens).toBeLessThanOrEqual(budget);
  });

  it('records durable state candidates from the compacted messages before removal', () => {
    const win: Msg[] = [
      { role: 'user', content: 'Our campaign objective is to grow followers by 20%.' },
      { role: 'user', content: 'The target audience is fitness beginners.' },
      { role: 'user', content: 'Do not use emojis, keep captions under 100 characters.' },
      ...window(200),
    ];
    const plan = planHistoryCompaction({ recentWindow: win, historyTokenBudget: 200 });
    expect(plan.compactionOccurred).toBe(true);
    const categories = plan.stateCandidates.map((c) => c.category);
    expect(categories).toContain('objective');
    expect(categories).toContain('entities');
    expect(categories).toContain('constraints');
  });

  it('fails open on summarization failure: retains the full window, compacts nothing', () => {
    const win = window(500);
    const plan = planHistoryCompaction({
      recentWindow: win,
      historyTokenBudget: 100,
      summarizationAvailable: false,
    });
    expect(plan.failedOpen).toBe(true);
    expect(plan.compactionOccurred).toBe(false);
    expect(plan.history).toEqual(win);
    expect(plan.toCompact).toEqual([]);
  });

  it('handles a brand-new conversation with no history', () => {
    const plan = planHistoryCompaction({ recentWindow: [], historyTokenBudget: 100 });
    expect(plan.history).toEqual([]);
    expect(plan.compactionOccurred).toBe(false);
    expect(plan.historyTokens).toBe(0);
  });

  it('fully compacts a single message larger than the whole budget', () => {
    const huge: Msg = { role: 'user', content: 'x'.repeat(10000) };
    const win: Msg[] = [huge, { role: 'assistant', content: 'ok' }];
    const plan = planHistoryCompaction({ recentWindow: win, historyTokenBudget: 5 });
    expect(plan.compactionOccurred).toBe(true);
    // The oversized oldest message is compacted; a small recent message can stay.
    expect(plan.toCompact).toContain(huge);
  });

  it('treats a non-positive budget as unbounded (no compaction)', () => {
    const win = window(100);
    const plan = planHistoryCompaction({ recentWindow: win, historyTokenBudget: 0 });
    expect(plan.compactionOccurred).toBe(false);
    expect(plan.history).toEqual(win);
  });
});

describe('extractStateCandidates', () => {
  it('returns empty for empty input', () => {
    expect(extractStateCandidates([])).toEqual([]);
  });

  it('tags user messages as user-sourced and assistant tool output as tool-sourced', () => {
    const msgs: Msg[] = [
      { role: 'user', content: 'I prefer a professional tone.' },
      { role: 'assistant', content: 'Your engagement rate is 4.2% and reach was 10,000.' },
    ];
    const candidates = extractStateCandidates(msgs);
    const facts = candidates.find((c) => c.category === 'facts');
    expect(facts?.source).toBe('user');
    const toolDerived = candidates.find((c) => c.category === 'toolDerivedState');
    expect(toolDerived?.source).toBe('tool');
  });
});

describe('token helpers', () => {
  it('messageTokens and historyWindowTokens are non-negative', () => {
    const m: Msg = { role: 'user', content: 'hi' };
    expect(messageTokens(m)).toBeGreaterThanOrEqual(0);
    expect(historyWindowTokens([m])).toBeGreaterThanOrEqual(0);
  });
});
