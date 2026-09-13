/**
 * Localization_Window_Logic — a PURE, TOTAL, DETERMINISTIC resolver that turns
 * the raw, possibly-malformed candidate ranges reported by the cheap vision
 * localizer into clean, clamped, non-overlapping WINDOWS for the segment-scoped
 * generative edit path (`trim → editVideo(Omni) → splice(executeAssembly)`).
 *
 * This module owns every localization DECISION that can be made without touching
 * FFmpeg, a database, an AI provider, or the network, so it is total and
 * property-testable. It mirrors the structure and JSDoc discipline of
 * `highlight-selection.logic.ts` and reuses the same clamp / {@link MIN_WINDOW_MS} /
 * whole-clip-epsilon idioms as `edit-range.logic.ts`.
 *
 * Given an array of {@link CandidateRange} (each with an optional model-reported
 * confidence) plus the source `durationMs`, it:
 *
 *   1. Rejects a non-finite / non-positive duration (nothing to scope against) →
 *      the Whole_Clip_Fallback signal, mirroring `parseEditRange`'s `dur <= 0`
 *      guard.
 *   2. Sanitizes each candidate: finite bounds, ordered `startMs < endMs`, a
 *      confidence at/above the floor (missing/invalid ⇒ 0), clamped to
 *      `[0, durationMs]`, and expanded to at least {@link MIN_WINDOW_MS} using the
 *      same forward-then-backward `ensureWindow` idiom as `edit-range.logic.ts`.
 *   3. Falls back to whole-clip when nothing survives sanitize (No-Mock, Req 23:
 *      never fabricate a window).
 *   4. Sorts by `startMs` and merges overlapping OR adjacent (`gap <= mergeGapMs`)
 *      windows into single windows (same merge loop shape as
 *      `computeHighlightSegments`).
 *   5. Promotes the result to the Whole_Clip_Fallback signal when the merged
 *      windows cover `[0, durationMs]` within `wholeClipEpsMs` (mirrors
 *      `coversWholeClip`).
 *   6. Caps to `maxWindows` by keeping the longest windows, then re-sorts
 *      chronologically (keeps the cap deterministic and preserves ordering /
 *      disjointness).
 *   7. Applies a final minimum-length filter; if nothing remains → whole-clip,
 *      else returns the ordered non-overlapping windows.
 *
 * Determinism: every export is pure and total — the same input always yields the
 * same output, there is no randomness, no `Date`/`now`, and it never throws. Every
 * returned window's bounds are DERIVED (clamp/merge) from the supplied candidates:
 * the resolver never invents a range from nothing.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A raw candidate range from the vision model (may be malformed/out-of-bounds). */
export interface CandidateRange {
  startMs: number;
  endMs: number;
  /** Model-reported detection confidence in [0,1]; missing/invalid ⇒ treated as 0. */
  confidence?: number;
}

/** A concrete, clamped localization window `[startMs, endMs)` (ms). */
export interface LocalizationWindow {
  startMs: number;
  endMs: number;
}

/** Tunable options for {@link resolveLocalizationWindows}. All optional. */
export interface WindowResolverOptions {
  /** Hard ceiling on returned windows. Default {@link DEFAULT_MAX_WINDOWS} (3). */
  maxWindows?: number;
  /** Minimum trimmable window length (ms). Default {@link MIN_WINDOW_MS} (500). */
  minWindowMs?: number;
  /** Gap (ms) at/under which two windows are considered adjacent and merged. Default {@link MERGE_GAP_MS}. */
  mergeGapMs?: number;
  /** Tolerance (ms) for the "covers ~the whole clip" promotion check. Default {@link WHOLE_CLIP_EPS_MS}. */
  wholeClipEpsMs?: number;
  /** Confidence floor; candidates strictly below are dropped. Default {@link DEFAULT_MIN_CONFIDENCE}. */
  minConfidence?: number;
}

/**
 * The resolver result. `kind: 'windows'` carries ≥1 clean segment windows to feed
 * into the segment-scoped path. `kind: 'whole-clip'` is the Whole_Clip_Fallback
 * signal — emitted for empty/invalid/all-low-confidence input, zero usable
 * windows, or whole-clip promotion. NEVER a fabricated window (No-Mock, Req 23).
 */
export type WindowResolution =
  | { kind: 'windows'; windows: LocalizationWindow[] }
  | { kind: 'whole-clip' };

// ---------------------------------------------------------------------------
// Resolver defaults (deterministic constants)
// ---------------------------------------------------------------------------

/** Default hard ceiling on the number of returned windows. */
export const DEFAULT_MAX_WINDOWS = 3;
/** Default minimum trimmable window length (ms) — a sub-min survivor expands to this. */
export const MIN_WINDOW_MS = 500;
/** Default gap (ms) at/under which two windows are merged as adjacent. */
export const MERGE_GAP_MS = 250;
/** Default tolerance (ms) for the "covers ~the whole clip" promotion check. */
export const WHOLE_CLIP_EPS_MS = 300;
/** Default confidence floor; candidates strictly below are dropped. */
export const DEFAULT_MIN_CONFIDENCE = 0.3;

// ---------------------------------------------------------------------------
// Numeric helpers (internal)
// ---------------------------------------------------------------------------

/** Is `value` a finite JS number (rejects NaN/±Infinity/non-number)? */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Is `value` a finite, strictly-positive number? */
function isPositive(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

/** Pick a positive numeric option, falling back to `fallback` when invalid. */
function positiveOr(value: number | undefined, fallback: number): number {
  return isPositive(value) ? (value as number) : fallback;
}

/** Pick a non-negative numeric option, falling back to `fallback` when invalid. */
function nonNegativeOr(value: number | undefined, fallback: number): number {
  return isFiniteNumber(value) && value >= 0 ? (value as number) : fallback;
}

/** Clamp `value` into the inclusive `[min, max]` interval. */
function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Ensure a `[start, end)` range is clamped to `[0, dur]` and spans at least
 * `minWindowMs`. When the window is too small it is expanded forward (then
 * backward if it would overflow the clip end). Pure and total — mirrors the
 * `ensureWindow` idiom in `edit-range.logic.ts`.
 */
function ensureWindow(
  startRaw: number,
  endRaw: number,
  dur: number,
  minWindowMs: number,
): LocalizationWindow {
  let start = clamp(Math.min(startRaw, endRaw), 0, dur);
  let end = clamp(Math.max(startRaw, endRaw), 0, dur);
  if (end - start >= minWindowMs) return { startMs: start, endMs: end };
  // Too small — expand forward to the min window, then backward if needed.
  end = Math.min(dur, start + minWindowMs);
  if (end - start < minWindowMs) {
    start = Math.max(0, end - minWindowMs);
  }
  return { startMs: start, endMs: end };
}

// ---------------------------------------------------------------------------
// Window resolution (pure)
// ---------------------------------------------------------------------------

/**
 * Resolve raw candidate ranges into clean windows or the whole-clip fallback
 * signal. PURE and total — never throws, never performs IO, no clock, no
 * randomness.
 *
 * Guarantees (for any input, including empty/out-of-order/negative/NaN/
 * over-duration candidates and any finite non-negative `sourceDurationMs`):
 *   - Every returned window `w`: `0 <= w.startMs < w.endMs <= sourceDurationMs`.
 *   - Every returned window: `w.endMs - w.startMs >= minWindowMs`.
 *   - `windows.length <= maxWindows` (default {@link DEFAULT_MAX_WINDOWS}).
 *   - Windows sorted strictly ascending by `startMs`, pairwise non-overlapping
 *     (`a.endMs <= b.startMs` for consecutive `a,b`).
 *   - Feeding the resolver's own windows back in yields the same windows
 *     (merge idempotence).
 *   - When merged windows cover `[0, sourceDurationMs]` within `wholeClipEpsMs`
 *     ⇒ `{ kind: 'whole-clip' }`.
 *   - When no valid window survives (empty/low-confidence/invalid/degenerate) ⇒
 *     `{ kind: 'whole-clip' }` — never a fabricated window (No-Mock, Req 23).
 *   - Deterministic: identical inputs always produce identical output.
 */
export function resolveLocalizationWindows(
  candidates: readonly CandidateRange[] | null | undefined,
  sourceDurationMs: number,
  options: WindowResolverOptions = {},
): WindowResolution {
  // 1. Non-finite / non-positive duration → nothing to scope against.
  if (!isPositive(sourceDurationMs)) return { kind: 'whole-clip' };
  const dur = sourceDurationMs;

  // Resolve options against deterministic defaults.
  const maxWindows =
    Number.isInteger(options.maxWindows) && (options.maxWindows as number) >= 1
      ? (options.maxWindows as number)
      : DEFAULT_MAX_WINDOWS;
  const minWindowMs = Math.min(positiveOr(options.minWindowMs, MIN_WINDOW_MS), dur);
  const mergeGapMs = nonNegativeOr(options.mergeGapMs, MERGE_GAP_MS);
  const wholeClipEpsMs = nonNegativeOr(options.wholeClipEpsMs, WHOLE_CLIP_EPS_MS);
  const minConfidence = nonNegativeOr(options.minConfidence, DEFAULT_MIN_CONFIDENCE);

  // 2. Sanitize each candidate: finite bounds, confidence floor, clamp, expand.
  const sanitized: LocalizationWindow[] = [];
  for (const cand of Array.isArray(candidates) ? candidates : []) {
    if (!cand) continue;
    if (!isFiniteNumber(cand.startMs) || !isFiniteNumber(cand.endMs)) continue;
    // Missing/invalid confidence ⇒ 0; drop anything below the floor.
    const confidence = isFiniteNumber(cand.confidence) ? cand.confidence : 0;
    if (confidence < minConfidence) continue;
    // Order the raw bounds, then clamp to the clip.
    const lo = clamp(Math.min(cand.startMs, cand.endMs), 0, dur);
    const hi = clamp(Math.max(cand.startMs, cand.endMs), 0, dur);
    if (hi <= lo) continue; // degenerate after clamp
    // Expand any sub-minWindowMs survivor to a trimmable window.
    sanitized.push(ensureWindow(lo, hi, dur, minWindowMs));
  }

  // 3. Nothing survived sanitize → honest whole clip (never fabricate).
  if (sanitized.length === 0) return { kind: 'whole-clip' };

  // 4. Sort by startMs and merge overlapping OR adjacent (gap <= mergeGapMs).
  const ordered = sanitized.slice().sort((a, b) => a.startMs - b.startMs);
  const merged: LocalizationWindow[] = [];
  for (const win of ordered) {
    const last = merged[merged.length - 1];
    if (last && win.startMs <= last.endMs + mergeGapMs) {
      last.endMs = Math.max(last.endMs, win.endMs);
    } else {
      merged.push({ startMs: win.startMs, endMs: win.endMs });
    }
  }

  // 5. Whole-clip promotion: merged windows cover [0, dur] within the epsilon.
  if (coversWholeClip(merged, dur, wholeClipEpsMs)) return { kind: 'whole-clip' };

  // 6. Cap to maxWindows by keeping the longest, then re-sort chronologically.
  //    Ties (equal length) break by earlier startMs so the cap is deterministic.
  const capped = merged
    .slice()
    .sort((a, b) => {
      const lenA = a.endMs - a.startMs;
      const lenB = b.endMs - b.startMs;
      if (lenB !== lenA) return lenB - lenA;
      return a.startMs - b.startMs;
    })
    .slice(0, maxWindows)
    .sort((a, b) => a.startMs - b.startMs);

  // 7. Final minimum-length filter; nothing left → whole clip.
  const windows = capped.filter((w) => w.endMs - w.startMs >= minWindowMs);
  if (windows.length === 0) return { kind: 'whole-clip' };

  return { kind: 'windows', windows };
}

/**
 * Whether the (sorted, merged) windows together cover `[0, dur]` within `eps`:
 * the first window starts at/near 0, the last ends at/near `dur`, and no interior
 * gap between consecutive windows exceeds `eps`. Pure and total — mirrors
 * `coversWholeClip` in `edit-range.logic.ts`.
 */
function coversWholeClip(
  windows: readonly LocalizationWindow[],
  dur: number,
  eps: number,
): boolean {
  if (windows.length === 0) return false;
  const first = windows[0];
  const last = windows[windows.length - 1];
  if (first.startMs > eps) return false;
  if (last.endMs < dur - eps) return false;
  for (let i = 1; i < windows.length; i += 1) {
    if (windows[i].startMs - windows[i - 1].endMs > eps) return false;
  }
  return true;
}
