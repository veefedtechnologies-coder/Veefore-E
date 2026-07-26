import { describe, it, expect } from 'vitest';
import {
  selectShallowWindow,
  planLongTermWindow,
  renderTranscript,
  LONG_TERM_VERBATIM,
  SHORT_TERM_VERBATIM,
  SUMMARY_BATCH,
  type Msg,
} from '../server/routes/veegpt-memory.logic';

/** Build N messages alternating user/assistant, content "m0".."m(N-1)". */
function makeMessages(n: number): Msg[] {
  return Array.from({ length: n }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `m${i}`,
  }));
}

describe('selectShallowWindow', () => {
  it('off → returns only the most recent (current) message', () => {
    const msgs = makeMessages(10);
    const out = selectShallowWindow('off', msgs);
    expect(out).toHaveLength(1);
    expect(out[0].content).toBe('m9');
  });

  it('off with a single message → returns that message', () => {
    const msgs = makeMessages(1);
    expect(selectShallowWindow('off', msgs)).toEqual([{ role: 'user', content: 'm0' }]);
  });

  it('off with no messages → empty', () => {
    expect(selectShallowWindow('off', [])).toEqual([]);
  });

  it('short-term → returns the last SHORT_TERM_VERBATIM messages in order', () => {
    const msgs = makeMessages(20);
    const out = selectShallowWindow('short-term', msgs);
    expect(out).toHaveLength(SHORT_TERM_VERBATIM);
    expect(out[0].content).toBe(`m${20 - SHORT_TERM_VERBATIM}`);
    expect(out[out.length - 1].content).toBe('m19');
  });

  it('short-term with fewer than the window → returns all, oldest→newest', () => {
    const msgs = makeMessages(3);
    const out = selectShallowWindow('short-term', msgs);
    expect(out.map((m) => m.content)).toEqual(['m0', 'm1', 'm2']);
  });

  it('undefined mode falls back to the short-term window (not stateless)', () => {
    const msgs = makeMessages(20);
    const out = selectShallowWindow(undefined, msgs);
    expect(out).toHaveLength(SHORT_TERM_VERBATIM);
  });
});

describe('planLongTermWindow', () => {
  it('short conversation (≤ verbatim+batch) → no summarization, all unsummarized sent', () => {
    const msgs = makeMessages(LONG_TERM_VERBATIM + SUMMARY_BATCH); // exactly at threshold, not over
    const plan = planLongTermWindow(msgs, 0);
    expect(plan.needsSummarization).toBe(false);
    expect(plan.toSummarize).toEqual([]);
    expect(plan.history).toHaveLength(LONG_TERM_VERBATIM + SUMMARY_BATCH);
    expect(plan.newSummarizedCount).toBe(0);
  });

  it('just over threshold → folds the oldest overflow, keeps exactly verbatim window', () => {
    const total = LONG_TERM_VERBATIM + SUMMARY_BATCH + 1;
    const msgs = makeMessages(total);
    const plan = planLongTermWindow(msgs, 0);
    expect(plan.needsSummarization).toBe(true);
    // overflow = unsummarized - verbatim
    const expectedOverflow = total - LONG_TERM_VERBATIM;
    expect(plan.toSummarize).toHaveLength(expectedOverflow);
    expect(plan.history).toHaveLength(LONG_TERM_VERBATIM);
    expect(plan.newSummarizedCount).toBe(expectedOverflow);
    // The folded messages are the oldest; the kept ones are the newest.
    expect(plan.toSummarize[0].content).toBe('m0');
    expect(plan.history[plan.history.length - 1].content).toBe(`m${total - 1}`);
  });

  it('no overlap between summarized batch and verbatim history (no data loss / no dupes)', () => {
    const total = 100;
    const msgs = makeMessages(total);
    const plan = planLongTermWindow(msgs, 0);
    const foldedContents = new Set(plan.toSummarize.map((m) => m.content));
    const historyContents = new Set(plan.history.map((m) => m.content));
    // disjoint
    for (const c of historyContents) expect(foldedContents.has(c)).toBe(false);
    // together they cover every message exactly once
    expect(foldedContents.size + historyContents.size).toBe(total);
  });

  it('respects an existing summarizedCount (only processes unsummarized tail)', () => {
    const total = 100;
    const msgs = makeMessages(total);
    const already = 30; // first 30 already in the summary
    const plan = planLongTermWindow(msgs, already);
    const unsummarized = total - already; // 70
    const expectedOverflow = unsummarized - LONG_TERM_VERBATIM; // 30
    expect(plan.needsSummarization).toBe(true);
    expect(plan.toSummarize).toHaveLength(expectedOverflow);
    expect(plan.history).toHaveLength(LONG_TERM_VERBATIM);
    expect(plan.newSummarizedCount).toBe(already + expectedOverflow);
    // First folded message is the first unsummarized one (m30), never re-folds m0..m29.
    expect(plan.toSummarize[0].content).toBe('m30');
  });

  it('idempotent once stabilized: re-running after folding does nothing more', () => {
    const total = 100;
    const msgs = makeMessages(total);
    const plan1 = planLongTermWindow(msgs, 0);
    // Apply plan1, then re-run with the advanced count and SAME messages.
    const plan2 = planLongTermWindow(msgs, plan1.newSummarizedCount);
    expect(plan2.needsSummarization).toBe(false);
    expect(plan2.toSummarize).toEqual([]);
    expect(plan2.history).toHaveLength(total - plan1.newSummarizedCount);
  });

  it('clamps a corrupt summarizedCount larger than message count', () => {
    const msgs = makeMessages(10);
    const plan = planLongTermWindow(msgs, 999);
    expect(plan.needsSummarization).toBe(false);
    expect(plan.history).toEqual([]);
    expect(plan.newSummarizedCount).toBe(10);
  });

  it('handles a negative summarizedCount safely', () => {
    const msgs = makeMessages(5);
    const plan = planLongTermWindow(msgs, -5);
    expect(plan.history).toHaveLength(5);
    expect(plan.newSummarizedCount).toBe(0);
  });

  it('empty conversation → empty plan', () => {
    const plan = planLongTermWindow([], 0);
    expect(plan.history).toEqual([]);
    expect(plan.toSummarize).toEqual([]);
    expect(plan.needsSummarization).toBe(false);
  });

  it('growing conversation summarizes in repeated batches as it crosses thresholds', () => {
    // Simulate a conversation that keeps growing; each time we cross the
    // threshold we fold a batch and the verbatim window stays bounded.
    let summarized = 0;
    for (let total = 1; total <= 300; total++) {
      const msgs = makeMessages(total);
      const plan = planLongTermWindow(msgs, summarized);
      // History never exceeds verbatim + batch (bounded prompt guarantee).
      expect(plan.history.length).toBeLessThanOrEqual(LONG_TERM_VERBATIM + SUMMARY_BATCH);
      if (plan.needsSummarization) summarized = plan.newSummarizedCount;
    }
    // After processing 300 messages, most are folded and history stays bounded.
    const finalPlan = planLongTermWindow(makeMessages(300), summarized);
    expect(finalPlan.history.length).toBeLessThanOrEqual(LONG_TERM_VERBATIM + SUMMARY_BATCH);
  });
});

describe('renderTranscript', () => {
  it('labels assistant as VeeGPT and everything else as User', () => {
    const out = renderTranscript([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ]);
    expect(out).toBe('User: hi\nVeeGPT: hello');
  });

  it('empty → empty string', () => {
    expect(renderTranscript([])).toBe('');
  });
});
