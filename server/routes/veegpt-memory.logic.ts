/**
 * Pure (DB-free) logic for VeeGPT conversation memory.
 *
 * These functions contain the windowing/overflow decisions and prompt assembly
 * so they can be unit-tested in isolation. The route file (veegpt-chat.routes.ts)
 * handles the DB reads/writes and AI calls, then delegates the decisions here.
 */

export type Msg = { role: string; content: string };
export type MemoryMode = 'off' | 'short-term' | 'long-term' | undefined;

export const LONG_TERM_VERBATIM = 20; // recent messages always kept word-for-word
export const SHORT_TERM_VERBATIM = 8; // window when aiMemory = short-term
export const SUMMARY_BATCH = 10; // summarize once this many messages overflow the window

/**
 * Decide which messages to send for a stateless ('off') or 'short-term' chat.
 * `allOrdered` is the full message list in chronological (oldest→newest) order.
 */
export function selectShallowWindow(mode: MemoryMode, allOrdered: Msg[]): Msg[] {
  if (mode === 'off') {
    // Stateless: only the most recent (current) message.
    return allOrdered.slice(-1);
  }
  // short-term (and any non-long-term fallback): last N turns.
  return allOrdered.slice(-SHORT_TERM_VERBATIM);
}

export interface LongTermPlan {
  /** Messages to send verbatim to the model. */
  history: Msg[];
  /** Oldest messages that should be folded into the rolling summary now (may be empty). */
  toSummarize: Msg[];
  /** New value for summarizedMessageCount after folding `toSummarize`. */
  newSummarizedCount: number;
  /** Whether a summarization step is required this turn. */
  needsSummarization: boolean;
}

/**
 * Plan the long-term window for a conversation.
 *
 * @param allOrdered          full message list, oldest→newest
 * @param summarizedCount     how many of the oldest messages are already folded
 *                            into the stored summary
 *
 * Invariant: messages [0, summarizedCount) live in the summary; the rest are
 * "unsummarized". When the unsummarized count exceeds the verbatim window by a
 * full batch, the oldest overflow is scheduled for summarization so the prompt
 * stays bounded while no information is lost.
 */
export function planLongTermWindow(allOrdered: Msg[], summarizedCount: number): LongTermPlan {
  const safeSummarized = Math.max(0, Math.min(summarizedCount, allOrdered.length));
  const unsummarized = allOrdered.slice(safeSummarized);

  if (unsummarized.length > LONG_TERM_VERBATIM + SUMMARY_BATCH) {
    const overflowCount = unsummarized.length - LONG_TERM_VERBATIM;
    const toSummarize = unsummarized.slice(0, overflowCount);
    const history = unsummarized.slice(overflowCount);
    return {
      history,
      toSummarize,
      newSummarizedCount: safeSummarized + overflowCount,
      needsSummarization: true,
    };
  }

  return {
    history: unsummarized,
    toSummarize: [],
    newSummarizedCount: safeSummarized,
    needsSummarization: false,
  };
}

/** Render a list of messages into a transcript line block. */
export function renderTranscript(history: Msg[]): string {
  return history.map((m) => `${m.role === 'assistant' ? 'VeeGPT' : 'User'}: ${m.content}`).join('\n');
}
