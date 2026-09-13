import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  retrieveUserMemory,
  renderMemoryProfile,
  type MemoryItem,
  type MemoryRetrievalInput,
} from '../../server/routes/veegpt-memory-retrieval.logic';

// Feature: veegpt-context-optimization, Property 9: Memory relevance fails open toward completeness
// Validates: Requirements 9.7
//
// For ANY memory store, when the relevance of memory items cannot be determined
// — because the request is a broad recall of the user's own profile, carries no
// usable relevance signal, exceeds the configured time budget (timeout), or the
// relevance computation throws — `retrieveUserMemory` includes ALL memory items
// in the composed request rather than excluding any (fail open toward
// completeness: correctness wins over token savings).
//
// In each "cannot determine relevance" scenario we assert:
//   • `includedAll === true`,
//   • the returned `items` are EXACTLY the full stored store (same items, same
//     order — nothing excluded),
//   • the rendered `profile` equals `renderMemoryProfile(allItems)`.

/**
 * An arbitrary stored User_Memory store: 1..30 items, each with a unique id and
 * a non-trivial text. Text is drawn from an alphanumeric alphabet so it may or
 * may not carry a relevance signal — Property 9 must hold for either.
 */
const memoryStoreArb: fc.Arbitrary<MemoryItem[]> = fc
  .array(
    fc.record({
      id: fc.uuid(),
      text: fc.string({ minLength: 1, maxLength: 60 }),
    }),
    { minLength: 1, maxLength: 30 }
  )
  // Ensure unique ids so equality-by-reference / order checks are unambiguous.
  .map((items) =>
    items.map((it, i) => ({ id: `${it.id}-${i}`, text: it.text }))
  );

/** Assert the result included the WHOLE store, unchanged and in order. */
function expectIncludedAll(
  result: ReturnType<typeof retrieveUserMemory>,
  store: MemoryItem[]
): void {
  expect(result.includedAll).toBe(true);
  // Every stored fact is present, in the original stored order (nothing dropped).
  expect(result.items).toEqual(store);
  // The prompt-ready profile reflects the full store byte-for-byte.
  expect(result.profile).toBe(renderMemoryProfile(store));
}

describe('veegpt-memory-retrieval · Property 9 — memory relevance fails open toward completeness', () => {
  it('broad recall of the user’s own profile includes ALL memory (Req 9.7)', () => {
    // A broad recall relates to every stored fact, so relevance cannot be
    // narrowed — retrieval must include everything.
    const broadRecallArb = fc.constantFrom(
      'what do you know about me',
      'what do you remember about me',
      'tell me about my account',
      'tell me about my profile',
      'remind me what you know',
      'my details',
      'my profile',
      'who am i',
      'everything you know about me'
    );

    fc.assert(
      fc.property(memoryStoreArb, broadRecallArb, (store, message) => {
        const result = retrieveUserMemory({
          items: store,
          currentMessage: message,
        });
        expectIncludedAll(result, store);
        // Not a failure/timeout — this is the "cannot narrow" broad path.
        expect(result.failedOpen).toBe(false);
        expect(result.timedOut).toBe(false);
        expect(result.errored).toBe(false);
      }),
      { numRuns: 200 }
    );
  });

  it('a request carrying no usable relevance signal includes ALL memory (Req 9.7)', () => {
    // Messages with no topic and no significant tokens (empty / pure stopwords /
    // sub-3-char noise) give retrieval nothing to match on, so it fails open.
    // Each of these has no single-value topic and no significant tokens
    // (empty / whitespace / pure stopwords / sub-3-char noise / punctuation),
    // so relevance cannot be determined and retrieval must fail open.
    const noSignalArb = fc.constantFrom(
      '',
      '   ',
      'hi',
      'ok',
      'the and for',
      'you are',
      '?!.,',
      'a an of'
    );

    fc.assert(
      fc.property(memoryStoreArb, noSignalArb, (store, message) => {
        const result = retrieveUserMemory({
          items: store,
          currentMessage: message,
          priorMessages: [],
        });
        expectIncludedAll(result, store);
      }),
      { numRuns: 200 }
    );
  });

  it('a timeout before relevance is determined includes ALL memory (Req 9.7)', () => {
    // The request DOES carry a signal, so retrieval enters the scan loop; an
    // injected clock jumps past the budget on the first iteration, forcing the
    // timeout/fail-open path deterministically without real time.
    const budgetArb = fc.integer({ min: 1, max: 1000 });

    fc.assert(
      fc.property(memoryStoreArb, budgetArb, (store, budgetMs) => {
        let calls = 0;
        // First call = scan start (0); every later call is well past the budget.
        const now = () => (calls++ === 0 ? 0 : budgetMs + 1_000_000);

        const input: MemoryRetrievalInput = {
          items: store,
          currentMessage: 'instagram analytics engagement report metrics',
          budgetMs,
          now,
        };
        const result = retrieveUserMemory(input);

        expectIncludedAll(result, store);
        expect(result.failedOpen).toBe(true);
        expect(result.timedOut).toBe(true);
      }),
      { numRuns: 200 }
    );
  });

  it('an error during relevance selection includes ALL memory (Req 9.7)', () => {
    // Any thrown error in the relevance computation must fail open. We inject a
    // clock that throws when the scan tries to read the start time.
    fc.assert(
      fc.property(memoryStoreArb, (store) => {
        const now = () => {
          throw new Error('clock failure');
        };
        const result = retrieveUserMemory({
          items: store,
          currentMessage: 'instagram analytics engagement report metrics',
          now,
        });

        expectIncludedAll(result, store);
        expect(result.failedOpen).toBe(true);
        expect(result.errored).toBe(true);
      }),
      { numRuns: 200 }
    );
  });
});
