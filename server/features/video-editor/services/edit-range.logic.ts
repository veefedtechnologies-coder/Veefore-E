/**
 * Edit_Range_Logic — a PURE, TOTAL, DETERMINISTIC parser that decides whether a
 * chat edit instruction targets a specific TIME RANGE of the clip (a "segment"
 * edit) or the WHOLE clip (a "global" edit).
 *
 * This is the front-door for SEGMENT-SCOPED generative editing: when the user
 * says "remove the guy from 0:05 to 0:10" we should cut ONLY that segment, send
 * just that segment to the generative model, and splice it back into the
 * original timeline — so cost/latency scale with the edited portion and the rest
 * of the clip stays visually original. When the instruction is genuinely global
 * ("restyle the whole video", "make it look like a painting") we keep the honest
 * whole-clip behavior.
 *
 * Design rules:
 *   - PURE: no IO, no clock, no randomness — same inputs always yield the same
 *     {@link EditScope}. This makes it trivially unit-testable and safe to call
 *     inside the chat driver.
 *   - TOTAL: every input returns a defined result. When nothing usable parses we
 *     default to `{ mode: 'global' }` — we NEVER guess a random range (a wrong
 *     guess would edit the wrong part of the video).
 *   - SAFE CLAMPING: every parsed range is clamped to `[0, sourceDurationMs]`,
 *     with a minimum window so a degenerate/point range still produces a
 *     non-empty, trimmable segment. A range that ends up covering ~the whole clip
 *     is promoted to `global` (there is nothing to splice around).
 */

/** A concrete, clamped time range within the source clip (milliseconds). */
export interface EditRange {
  startMs: number;
  endMs: number;
}

/**
 * The resolved scope of an edit instruction. `segment` carries the target
 * {@link EditRange}; `global` means the edit applies to the whole clip and has
 * no range.
 */
export interface EditScope {
  mode: 'segment' | 'global';
  range?: EditRange;
}

/** Minimum trimmable window (ms) — a point/degenerate range expands to this. */
const MIN_WINDOW_MS = 500;

/** Half-width of the window a single point ("at 0:07") expands to (± this). */
const POINT_HALF_WINDOW_MS = 1_500;

/**
 * Tolerance (ms) for the "covers ~the whole clip" check. When a parsed range
 * starts at ~0 AND ends at ~the clip duration, there is nothing to splice around
 * it, so we treat it as a global edit.
 */
const WHOLE_CLIP_EPS_MS = 300;

/**
 * Words/phrases that imply the WHOLE clip regardless of any incidental number in
 * the message. These only matter when no explicit range parses — an explicit
 * range always wins (see {@link parseEditRange}).
 */
const GLOBAL_WORDS_RE =
  /\b(whole|entire|throughout|everywhere|all\s+the\s+way|start\s+to\s+finish|the\s+whole\s+thing|full\s+(?:video|clip|length))\b/i;

/**
 * A time-token fragment usable inside composite range regexes. Matches either an
 * `M:SS` timestamp (e.g. `0:05`, `1:30`) or a number with an OPTIONAL unit
 * (`5`, `5s`, `5 seconds`, `2 minutes`). Kept as a raw source string so it can be
 * embedded into larger patterns; {@link parseTimeToken} interprets a captured
 * match into milliseconds.
 */
const TIME_FRAG =
  String.raw`\d+(?::\d{1,2})?(?:\.\d+)?\s*(?:seconds?|secs?|s|minutes?|mins?|m)?`;

/** Clamp `value` into the inclusive `[min, max]` interval. */
function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Parse a single time token into milliseconds, or `null` when it is not a
 * recognisable time. Understands `M:SS`, and a number with an optional unit
 * (`seconds`/`secs`/`s`, `minutes`/`mins`/`m`); a bare number defaults to
 * seconds. Pure and total.
 */
export function parseTimeToken(token: string): number | null {
  const t = token.trim().toLowerCase();
  if (!t) return null;

  // M:SS (minutes:seconds).
  const colon = /^(\d+):(\d{1,2})$/.exec(t);
  if (colon) {
    const minutes = Number(colon[1]);
    const seconds = Number(colon[2]);
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
    return Math.round((minutes * 60 + seconds) * 1000);
  }

  // Number with an optional unit (defaults to seconds).
  const num = /^(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m)?$/.exec(t);
  if (num) {
    const value = Number(num[1]);
    if (!Number.isFinite(value)) return null;
    const unit = num[2] ?? '';
    // Any unit starting with "m" is minutes (m/min/mins/minute/minutes); every
    // other unit (and no unit) is seconds.
    const isMinutes = /^m/.test(unit);
    return Math.round(value * (isMinutes ? 60_000 : 1_000));
  }

  return null;
}

/**
 * Ensure a `[start, end)` range is clamped to `[0, dur]` and spans at least
 * {@link MIN_WINDOW_MS}. When the window is too small it is expanded forward
 * (then backward if it would overflow the clip end). Pure and total.
 */
function ensureWindow(startRaw: number, endRaw: number, dur: number): EditRange {
  let start = clamp(Math.min(startRaw, endRaw), 0, dur);
  let end = clamp(Math.max(startRaw, endRaw), 0, dur);
  if (end - start >= MIN_WINDOW_MS) return { startMs: start, endMs: end };
  // Too small — expand forward to the min window, then backward if needed.
  end = Math.min(dur, start + MIN_WINDOW_MS);
  if (end - start < MIN_WINDOW_MS) {
    start = Math.max(0, end - MIN_WINDOW_MS);
  }
  return { startMs: start, endMs: end };
}

/** Whether a clamped range covers ~the entire clip (nothing to splice around). */
function coversWholeClip(range: EditRange, dur: number): boolean {
  return range.startMs <= WHOLE_CLIP_EPS_MS && range.endMs >= dur - WHOLE_CLIP_EPS_MS;
}

/**
 * Try to extract a RAW `[start, end]` (pre-clamp) range from the message. Returns
 * `null` when no range pattern matches. The patterns are tried in specificity
 * order: two-sided ranges first, then single-sided ("first/last/after/before"),
 * then a single point ("at ..."). Pure.
 */
function extractRawRange(
  message: string,
  dur: number,
): { startMs: number; endMs: number } | null {
  const text = message;

  // "between A and B"
  const between = new RegExp(
    `between\\s+(${TIME_FRAG})\\s+and\\s+(${TIME_FRAG})`,
    'i',
  ).exec(text);
  if (between) {
    const a = parseTimeToken(between[1]);
    const b = parseTimeToken(between[2]);
    if (a !== null && b !== null) return { startMs: a, endMs: b };
  }

  // "from A to B", "A to B", "A - B", "A until/till/through B"
  const range = new RegExp(
    `(?:from\\s+)?(${TIME_FRAG})\\s*(?:to|until|till|through|thru|[-\u2013\u2014])\\s*(${TIME_FRAG})`,
    'i',
  ).exec(text);
  if (range) {
    const a = parseTimeToken(range[1]);
    const b = parseTimeToken(range[2]);
    if (a !== null && b !== null && b > a) return { startMs: a, endMs: b };
  }

  // "the first N seconds" → 0..N
  const first = new RegExp(`(?:the\\s+)?first\\s+(${TIME_FRAG})`, 'i').exec(text);
  if (first) {
    const n = parseTimeToken(first[1]);
    if (n !== null && n > 0) return { startMs: 0, endMs: n };
  }

  // "the last N seconds" → dur-N..dur
  const last = new RegExp(`(?:the\\s+)?last\\s+(${TIME_FRAG})`, 'i').exec(text);
  if (last) {
    const n = parseTimeToken(last[1]);
    if (n !== null && n > 0) return { startMs: Math.max(0, dur - n), endMs: dur };
  }

  // "after A" → A..dur
  const after = new RegExp(`after\\s+(${TIME_FRAG})`, 'i').exec(text);
  if (after) {
    const a = parseTimeToken(after[1]);
    if (a !== null) return { startMs: a, endMs: dur };
  }

  // "before A" → 0..A
  const before = new RegExp(`before\\s+(${TIME_FRAG})`, 'i').exec(text);
  if (before) {
    const a = parseTimeToken(before[1]);
    if (a !== null) return { startMs: 0, endMs: a };
  }

  // "at A" / "around A" / "near A" / "@ A" / "at the A mark" → a small window
  // centred on the point (± POINT_HALF_WINDOW_MS).
  const at = new RegExp(
    `(?:at|around|near|@)\\s+(?:the\\s+)?(${TIME_FRAG})`,
    'i',
  ).exec(text);
  if (at) {
    const a = parseTimeToken(at[1]);
    if (a !== null) {
      return { startMs: a - POINT_HALF_WINDOW_MS, endMs: a + POINT_HALF_WINDOW_MS };
    }
  }

  return null;
}

/**
 * Decide whether `message` targets a specific time range of the clip (a segment
 * edit) or the whole clip (a global edit). Pure/total/deterministic.
 *
 * An explicit range ALWAYS wins over global-indicator words (a concrete range is
 * the strongest signal of intent). When no range parses, the result is `global`
 * — whether because of an explicit whole-clip word or simply because nothing
 * usable was found (the safe default: never guess a range).
 */
export function parseEditRange(message: string, sourceDurationMs: number): EditScope {
  const dur =
    Number.isFinite(sourceDurationMs) && sourceDurationMs > 0 ? sourceDurationMs : 0;

  // A non-positive duration means we have no timeline to scope against.
  if (dur <= 0) return { mode: 'global' };

  const text = typeof message === 'string' ? message : '';

  const raw = extractRawRange(text, dur);
  if (raw) {
    const range = ensureWindow(raw.startMs, raw.endMs, dur);
    // A range that spans ~the whole clip is a global edit (nothing to splice).
    if (coversWholeClip(range, dur)) return { mode: 'global' };
    if (range.endMs > range.startMs) return { mode: 'segment', range };
  }

  // No usable range → global (explicit whole-clip word or the safe default).
  // GLOBAL_WORDS_RE is not strictly required to reach this branch, but testing
  // it keeps the intent explicit and documents that "whole/entire/throughout/…"
  // resolve to a global edit.
  if (GLOBAL_WORDS_RE.test(text)) return { mode: 'global' };
  return { mode: 'global' };
}
