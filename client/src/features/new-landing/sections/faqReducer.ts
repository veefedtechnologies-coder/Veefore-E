/**
 * FAQ accordion reducer (pure, DOM-free).
 *
 * Backs the FaqSection accordion behaviour: at most one item is open at a
 * time. Opening a closed item collapses any other open item; re-activating
 * the currently open item collapses it.
 *
 * Design: Correctness Property 13 ("At most one FAQ item is open").
 * Requirements: 15.2.
 */

/** The index of the currently open FAQ item, or `null` when none is open. */
export type FaqState = number | null;

/**
 * Compute the next open-item state given the index of the activated item.
 *
 * - If the activated item is already the open one, it collapses (returns `null`).
 * - Otherwise the activated item becomes the sole open item (returns its index),
 *   implicitly closing any previously open item.
 *
 * This guarantees at most one item is ever open.
 *
 * @param state - The currently open index, or `null` if none is open.
 * @param activatedIndex - The index of the FAQ item the user activated.
 * @returns The next open index, or `null` if no item should be open.
 */
export function faqReducer(state: FaqState, activatedIndex: number): FaqState {
  return activatedIndex === state ? null : activatedIndex;
}
