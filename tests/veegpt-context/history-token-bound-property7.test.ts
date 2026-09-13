import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  planHistoryCompaction,
  historyWindowTokens,
} from '../../server/routes/veegpt-history-compaction.logic';
import type { Msg } from '../../server/routes/veegpt-memory.logic';

// Feature: veegpt-context-optimization, Property 7: Conversation-history tokens are bounded independent of turn count
// Validates: Requirements 7.1, 7.4
//
// Req 7.1 requires the input tokens attributable to conversation history to be
// bounded to a configured maximum that does NOT increase as the number of turns
// grows. Req 7.4 requires that, on overflow, the oldest messages are compacted
// so the retained recent window fits that bound.
//
// The planner enforces this by keeping the largest NEWEST suffix of the recent
// window whose BLOCK-rendered transcript token cost is at most
// `historyTokenBudget`. That block render (`historyWindowTokens`) is exactly how
// the recent window contributes to the composed prompt, so it — not a
// per-message token SUM, which over-counts per-line rounding — is the metric the
// bound must hold on. The invariant proved here is therefore the enforced,
// always-true bound: `historyWindowTokens(retained) ≤ budget`, regardless of how
// many older turns preceded it (fail-open / unbounded cases excepted, which are
// covered by their own conditions below).

/** Block-rendered token cost of a retained window — the enforced bound. */
function retainedTokenSum(history: Msg[]): number {
  return historyWindowTokens(history);
}

/**
 * An arbitrary conversation message. Content spans empty strings, short tokens,
 * unicode, and long paragraphs so fast-check probes the token-accounting edges
 * (including rounding-heavy inputs) rather than only realistic prose.
 */
const msgArb: fc.Arbitrary<Msg> = fc.record({
  role: fc.constantFrom('user', 'assistant'),
  content: fc.oneof(
    fc.string(),
    fc.string({ minLength: 0, maxLength: 4 }),
    fc.lorem({ maxCount: 40 }),
    fc.constant(''),
  ),
});

/** A recent window in chronological order; sizes from empty to long chats. */
const windowArb = fc.array(msgArb, { minLength: 0, maxLength: 300 });

/** A positive history token budget (bounding is active). */
const budgetArb = fc.integer({ min: 1, max: 4000 });

describe('Property 7: conversation-history tokens are bounded independent of turn count (R7.1, R7.4)', () => {
  it('bounds the retained history token sum to the budget for any window and positive budget', () => {
    fc.assert(
      fc.property(windowArb, budgetArb, (recentWindow, historyTokenBudget) => {
        const plan = planHistoryCompaction({ recentWindow, historyTokenBudget });

        // Req 7.4: after compaction the retained window fits the configured bound.
        expect(retainedTokenSum(plan.history)).toBeLessThanOrEqual(historyTokenBudget);

        // The retained window is always a contiguous NEWEST suffix; the compacted
        // overflow is the oldest prefix, and together they reconstruct the input.
        expect(plan.toCompact.concat(plan.history)).toEqual(recentWindow);
      }),
      { numRuns: 200 },
    );
  });

  it('keeps the bound independent of turn count: adding older turns never grows the retained sum past the budget', () => {
    fc.assert(
      fc.property(
        windowArb,
        // Extra OLDER turns prepended to the same conversation tail.
        fc.array(msgArb, { minLength: 0, maxLength: 500 }),
        budgetArb,
        (tail, olderTurns, historyTokenBudget) => {
          const shortConversation = tail;
          const longConversation = olderTurns.concat(tail);

          const shortPlan = planHistoryCompaction({
            recentWindow: shortConversation,
            historyTokenBudget,
          });
          const longPlan = planHistoryCompaction({
            recentWindow: longConversation,
            historyTokenBudget,
          });

          // Both are bounded by the SAME configured ceiling regardless of how many
          // turns the conversation has — the bound does not grow with turn count.
          expect(retainedTokenSum(shortPlan.history)).toBeLessThanOrEqual(historyTokenBudget);
          expect(retainedTokenSum(longPlan.history)).toBeLessThanOrEqual(historyTokenBudget);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('triggers compaction exactly when the full window exceeds the budget, and never otherwise', () => {
    fc.assert(
      fc.property(windowArb, budgetArb, (recentWindow, historyTokenBudget) => {
        const plan = planHistoryCompaction({ recentWindow, historyTokenBudget });
        const fullSum = retainedTokenSum(recentWindow);

        if (fullSum <= historyTokenBudget) {
          // Within budget: the entire window is retained unchanged (Req 7.4 no-op).
          expect(plan.compactionOccurred).toBe(false);
          expect(plan.history).toEqual(recentWindow);
        } else {
          // Over budget: the oldest overflow is compacted so the bound holds.
          expect(plan.compactionOccurred).toBe(true);
          expect(retainedTokenSum(plan.history)).toBeLessThanOrEqual(historyTokenBudget);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('treats a non-positive budget as unbounded so history is never dropped by the bound', () => {
    fc.assert(
      fc.property(
        windowArb,
        fc.integer({ min: -1000, max: 0 }),
        (recentWindow, historyTokenBudget) => {
          const plan = planHistoryCompaction({ recentWindow, historyTokenBudget });
          expect(plan.compactionOccurred).toBe(false);
          expect(plan.history).toEqual(recentWindow);
        },
      ),
      { numRuns: 100 },
    );
  });
});
