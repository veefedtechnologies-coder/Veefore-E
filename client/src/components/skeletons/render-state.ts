/**
 * Pure loading-state resolution and conditional-rendering logic for the
 * pixel-perfect skeleton loading system.
 *
 * This module contains no React rendering — only the pure, well-typed logic
 * that page/component skeletons use to decide what to render. Keeping it
 * isolated makes the conditional-rendering-parity behavior (the key concern,
 * e.g. the Dashboard "Optimal Posting Time" widget) testable as pure logic.
 *
 * See design.md → "Loading state model" and "Conditional rendering model".
 */

/**
 * The resolved UI state for a react-query-backed component.
 *
 * - `loading`   → render the matching skeleton
 * - `populated` → render the real component
 * - `empty`     → render the component's empty state
 * - `error`     → render the component's error state
 */
export type RenderState = 'loading' | 'populated' | 'empty' | 'error';

/**
 * The subset of react-query flags needed to resolve the render state.
 */
export interface QueryFlags {
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  data: unknown;
}

/**
 * Resolve the UI render state from query flags and an emptiness predicate.
 *
 * Logic (per design "Loading state model", in order):
 *  1. `isError`                  → `error`     (R9.5)
 *  2. `isLoading`                → `loading`   (initial fetch, no data yet)
 *  3. `data === undefined`       → `loading`   (R9.4: not yet resolved)
 *  4. `isEmpty(data)`            → `loading` while still fetching (avoid
 *                                  flashing empty, the BestTimeWidget pattern),
 *                                  otherwise `empty`
 *  5. otherwise                  → `populated`
 *
 * The skeleton is shown only while the request is in flight or unresolved and
 * hands off to the real component on resolve. A populated placeholder is never
 * returned after the request resolves or fails (R9.3, R9.4, R9.5).
 *
 * Pure: no side effects, deterministic for a given input.
 */
export function resolveRenderState(
  q: QueryFlags,
  isEmpty: (d: unknown) => boolean,
): RenderState {
  if (q.isError) return 'error'; // R9.5
  if (q.isLoading) return 'loading'; // initial fetch, no data yet
  if (q.data === undefined) return 'loading'; // R9.4: not resolved
  if (isEmpty(q.data)) {
    return q.isFetching ? 'loading' : 'empty'; // avoid flashing empty (BestTimeWidget pattern)
  }
  return 'populated';
}

/**
 * What is known about a conditional section at loading time.
 *
 * - `known-absent`  → condition known false before the section would render
 * - `known-present` → condition known true
 * - `unknown`       → not yet resolved during loading
 *
 * See design "Conditional rendering model" (Requirement 9 — key concern).
 */
export type ConditionalKnowledge =
  | { kind: 'known-absent' }
  | { kind: 'known-present' }
  | { kind: 'unknown' };

/**
 * What a skeleton should do with a conditional section, derived from its
 * `ConditionalKnowledge`.
 *
 * - `omit`              → render nothing and reserve no width/height/grid
 *                         cell/flex slot for the section (R9.1)
 * - `render-populated`  → render only the populated-variant placeholder; never
 *                         the empty variant, never both (R9.2)
 */
export type ConditionalSectionRender = 'omit' | 'render-populated';

/**
 * Map a section's conditional knowledge to whether and how its placeholder
 * renders during loading.
 *
 * Rules (per design "Conditional rendering model"):
 *  - `known-absent`  → `omit` (no reserved space, R9.1)
 *  - `unknown`       → `render-populated` (populated variant only, R9.2 — the
 *                      canonical Dashboard "Optimal Posting Time" widget case)
 *  - `known-present` → `render-populated`
 *
 * Pure: no side effects, deterministic for a given input.
 */
export function resolveConditionalSection(
  knowledge: ConditionalKnowledge,
): ConditionalSectionRender {
  return knowledge.kind === 'known-absent' ? 'omit' : 'render-populated';
}

/**
 * Convenience predicate: should this conditional section render a placeholder
 * at all? `false` only for `known-absent` (omitted entirely, R9.1).
 */
export function shouldRenderSection(knowledge: ConditionalKnowledge): boolean {
  return resolveConditionalSection(knowledge) === 'render-populated';
}

/** Default lower bound for clamped list/grid placeholder counts. */
const DEFAULT_MIN_LIST_COUNT = 3;
/** Default upper bound for clamped list/grid placeholder counts. */
const DEFAULT_MAX_LIST_COUNT = 10;

/** Options for {@link clampListCount}. */
export interface ClampListCountOptions {
  /** Fallback count used when `count` is null/undefined. */
  default: number;
  /** Lower bound (inclusive). Defaults to 3. */
  min?: number;
  /** Upper bound (inclusive). Defaults to 10. */
  max?: number;
}

/**
 * Clamp a variable list/grid placeholder count into a bounded range so
 * skeletons never imply the exact final count and bad inputs are handled
 * (R9.8).
 *
 * Returns `clamp(count ?? default, min, max)` with `min` defaulting to 3 and
 * `max` defaulting to 10. Handles `undefined`/`null`, zero, negative, and very
 * large counts.
 *
 * Pure: no side effects, deterministic for a given input.
 */
export function clampListCount(
  count: number | null | undefined,
  opts: ClampListCountOptions,
): number {
  const min = opts.min ?? DEFAULT_MIN_LIST_COUNT;
  const max = opts.max ?? DEFAULT_MAX_LIST_COUNT;
  const value = count ?? opts.default;
  return Math.min(Math.max(value, min), max);
}
