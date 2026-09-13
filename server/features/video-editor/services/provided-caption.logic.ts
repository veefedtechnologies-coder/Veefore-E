/**
 * Provided-caption pure logic (DB-free, IO-free, FFmpeg-free).
 *
 * When a user asks for captions AND supplies the exact words they want on
 * screen (e.g. `add animated captions using Option A text "Build the future you
 * want."`), the honest, correct behaviour is to burn THAT text across the whole
 * clip rather than run speech-to-text. Whisper only transcribes whatever speech
 * happens to be present, so on a mostly-silent clip it emits one short cue —
 * which is exactly the "captions only cover 1-2 seconds / don't transcribe
 * properly" bug this module fixes. The user already told us the words; we should
 * use them.
 *
 * This module owns two pure, total decisions so they can be unit/property tested
 * without a database, an encoder, or a network:
 *
 *   1. {@link extractProvidedCaptionText} — recover the literal phrase the user
 *      typed (inside straight/smart quotes, or after an explicit `text:` /
 *      `caption:` / `saying` / `that says` marker). Conservative by design:
 *      returns `null` unless there is a CLEAR quoted/explicit phrase, so callers
 *      fall back to transcription for ordinary "add captions" requests.
 *
 *   2. {@link buildProvidedCaptionSegments} — turn that phrase into
 *      {@link CaptionSegment}[] that span the ENTIRE clip duration, split into
 *      short readable cues and distributed evenly across `[0, durationMs]`, so the
 *      captions cover the whole video instead of a single 1-2s cue.
 *
 * Both functions are total: they never throw and never perform IO. On any
 * unusable input they degrade to `null` / `[]` so the caller can honestly fall
 * back to the existing transcription path (No-Mock, Req 23).
 */

import type { CaptionSegment } from './caption-layout.logic';

/** Max words per generated cue when distributing a provided phrase (readable chunks). */
export const PROVIDED_CAPTION_MAX_WORDS_PER_CUE = 5;

/**
 * Extract an explicit caption phrase the user supplied in their message, or
 * `null` when none is clearly present.
 *
 * Precedence (first match wins):
 *   1. A paired-quote span — straight double `"…"`, smart double `“…”`, or smart
 *      single `‘…’`. Straight single quotes `'…'` are ONLY treated as delimiters
 *      when the message contains exactly two of them (so ordinary apostrophes in
 *      "don't"/"you're" are never mistaken for a caption boundary).
 *   2. An explicit marker — `text:` / `text=` / `caption:` / `captions:` /
 *      `that says` / `saying` — followed by trailing text, with any wrapping
 *      quotes stripped.
 *
 * Total and pure: never throws; returns a trimmed non-empty phrase or `null`.
 */
export function extractProvidedCaptionText(message: unknown): string | null {
  if (typeof message !== 'string') return null;
  const text = message.trim();
  if (text.length === 0) return null;

  // 1) Paired quotes — most reliable signal of "these exact words".
  const doubleStraight = /"([^"]+)"/.exec(text);
  if (doubleStraight) {
    const phrase = cleanPhrase(doubleStraight[1]);
    if (phrase) return phrase;
  }
  const doubleSmart = /\u201C([^\u201D]+)\u201D/.exec(text);
  if (doubleSmart) {
    const phrase = cleanPhrase(doubleSmart[1]);
    if (phrase) return phrase;
  }
  const singleSmart = /\u2018([^\u2019]+)\u2019/.exec(text);
  if (singleSmart) {
    const phrase = cleanPhrase(singleSmart[1]);
    if (phrase) return phrase;
  }
  // Straight single quotes are ambiguous with apostrophes ("don't", "you're"),
  // so only treat them as a delimiter when the opening quote sits at a word
  // boundary (start/whitespace) and the closing quote is followed by
  // end/whitespace/punctuation — a shape apostrophes never have.
  const singleStraight = /(?:^|\s)'([^']+?)'(?=$|\s|[.,!?;:])/.exec(text);
  if (singleStraight) {
    const phrase = cleanPhrase(singleStraight[1]);
    if (phrase) return phrase;
  }

  // 2) Explicit markers — take the trailing text after the marker.
  const marker =
    /(?:\btext\s*[:=]\s*|\bcaptions?\s*[:=]\s*|\bthat\s+says\s+|\bsaying\s+)(.+)$/i.exec(text);
  if (marker) {
    // Strip a single layer of wrapping quotes if present.
    const raw = marker[1].trim().replace(/^["'\u201C\u2018]|["'\u201D\u2019]$/g, '');
    const phrase = cleanPhrase(raw);
    if (phrase) return phrase;
  }

  return null;
}

/**
 * Build {@link CaptionSegment}[] from a provided phrase that COVER THE WHOLE clip
 * `[0, durationMs]`, split into short readable cues distributed evenly.
 *
 * Guarantees (verified by property tests):
 *   - Full coverage: the first cue starts at `0` and the last cue ends at
 *     `round(durationMs)`.
 *   - Non-overlapping & contiguous: each cue's `endMs` equals the next cue's
 *     `startMs`.
 *   - Strictly forward: every cue has `endMs > startMs`.
 *   - No text is lost: concatenating the cues' text reproduces the normalised
 *     phrase word sequence.
 *
 * Total and pure: never throws; returns `[]` for an empty/whitespace phrase or a
 * non-positive/invalid duration so the caller can fall back honestly.
 */
export function buildProvidedCaptionSegments(
  phrase: unknown,
  durationMs: unknown,
): CaptionSegment[] {
  if (typeof phrase !== 'string') return [];
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) return [];

  const words = phrase.trim().split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [];

  const chunks = chunkWords(words, PROVIDED_CAPTION_MAX_WORDS_PER_CUE);

  // Never create more cues than whole milliseconds available, so each cue can
  // span at least 1ms (keeps every cue strictly forward even on tiny clips).
  const maxCues = Math.max(1, Math.floor(durationMs));
  const n = Math.min(chunks.length, maxCues);
  const cueTexts = n === chunks.length ? chunks : mergeChunks(chunks, n);

  // Even boundaries across [0, durationMs]; enforce strictly-increasing as a
  // defensive guard (does not fire while n <= floor(durationMs)).
  const bounds: number[] = [];
  for (let i = 0; i <= n; i += 1) bounds.push(Math.round((i * durationMs) / n));
  bounds[0] = 0;
  bounds[n] = Math.round(durationMs);
  for (let i = 1; i <= n; i += 1) {
    if (bounds[i] <= bounds[i - 1]) bounds[i] = bounds[i - 1] + 1;
  }

  const segments: CaptionSegment[] = [];
  for (let i = 0; i < n; i += 1) {
    segments.push({ startMs: bounds[i], endMs: bounds[i + 1], text: cueTexts[i] });
  }
  return segments;
}

// ---------------------------------------------------------------------------
// Internal helpers (pure)
// ---------------------------------------------------------------------------

/** Collapse whitespace and trim; return `null` when nothing usable remains. */
function cleanPhrase(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalised = value.replace(/\s+/g, ' ').trim();
  return normalised.length > 0 ? normalised : null;
}

/**
 * Group words into readable cues of up to `maxWords`, also breaking at
 * sentence-ending punctuation so a natural sentence tends to become its own cue.
 */
function chunkWords(words: string[], maxWords: number): string[] {
  const limit = Math.max(1, Math.floor(maxWords));
  const chunks: string[] = [];
  let current: string[] = [];
  for (const word of words) {
    current.push(word);
    const endsSentence = /[.!?]$/.test(word);
    if (current.length >= limit || endsSentence) {
      chunks.push(current.join(' '));
      current = [];
    }
  }
  if (current.length > 0) chunks.push(current.join(' '));
  return chunks;
}

/**
 * Merge `chunks` into exactly `n` groups (n < chunks.length), preserving order
 * and losing no text. Even bucketing guarantees every group is non-empty.
 */
function mergeChunks(chunks: string[], n: number): string[] {
  const groups: string[][] = Array.from({ length: n }, () => []);
  const total = chunks.length;
  chunks.forEach((chunk, i) => {
    const bucket = Math.min(n - 1, Math.floor((i * n) / total));
    groups[bucket].push(chunk);
  });
  return groups.map((group) => group.join(' '));
}
