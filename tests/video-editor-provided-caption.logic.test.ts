/**
 * Unit + property tests for the provided-caption pure core
 * (`server/features/video-editor/services/provided-caption.logic.ts`).
 *
 * These functions are pure and total (no IO, no DB, no ffmpeg, no network), so
 * they are exercised directly, with property-based checks (fast-check) for the
 * whole-video coverage / non-overlap / monotonic invariants.
 *
 * Framework: vitest + fast-check (matching the repo test stack).
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import {
  extractProvidedCaptionText,
  buildProvidedCaptionSegments,
  PROVIDED_CAPTION_MAX_WORDS_PER_CUE,
} from '../server/features/video-editor/services/provided-caption.logic';

describe('extractProvidedCaptionText', () => {
  it('returns null when there is no quoted/explicit phrase', () => {
    expect(extractProvidedCaptionText('add animated captions to this clip')).toBeNull();
    expect(extractProvidedCaptionText('please caption my video nicely')).toBeNull();
    expect(extractProvidedCaptionText('reframe to 9:16 and speed it up')).toBeNull();
  });

  it('returns null for empty / whitespace / non-string input', () => {
    expect(extractProvidedCaptionText('')).toBeNull();
    expect(extractProvidedCaptionText('   ')).toBeNull();
    // @ts-expect-error — total on bad input
    expect(extractProvidedCaptionText(null)).toBeNull();
    // @ts-expect-error — total on bad input
    expect(extractProvidedCaptionText(undefined)).toBeNull();
    // @ts-expect-error — total on bad input
    expect(extractProvidedCaptionText(42)).toBeNull();
  });

  it('extracts the confirmed real-world example (straight double quotes)', () => {
    expect(
      extractProvidedCaptionText('add animated captions using Option A text "Build the future you want."'),
    ).toBe('Build the future you want.');
  });

  it('extracts straight double quotes', () => {
    expect(extractProvidedCaptionText('caption it "Hello there friend"')).toBe('Hello there friend');
  });

  it('extracts smart double quotes', () => {
    expect(extractProvidedCaptionText('add captions \u201CStay hungry\u201D please')).toBe('Stay hungry');
  });

  it('extracts smart single quotes', () => {
    expect(extractProvidedCaptionText('put \u2018keep going\u2019 on screen')).toBe('keep going');
  });

  it('extracts straight single quotes only at word boundaries (not apostrophes)', () => {
    // Opening quote after whitespace, closing quote at end → a real quoted phrase.
    expect(extractProvidedCaptionText("caption 'do it now'")).toBe('do it now');
    // Apostrophes inside words ("don't", "you're") are not caption boundaries, and
    // no other signal → null (conservative fallback to transcription).
    expect(extractProvidedCaptionText("don't touch what you're doing")).toBeNull();
  });

  it('extracts after a text: / caption: marker', () => {
    expect(extractProvidedCaptionText('add captions, text: Build the future')).toBe('Build the future');
    expect(extractProvidedCaptionText('caption: Ship it today')).toBe('Ship it today');
    expect(extractProvidedCaptionText('captions = Make it count')).toBe('Make it count');
  });

  it('extracts after a "saying" / "that says" marker', () => {
    expect(extractProvidedCaptionText('add captions saying Build the future you want')).toBe(
      'Build the future you want',
    );
    expect(extractProvidedCaptionText('overlay text that says Never give up')).toBe('Never give up');
  });

  it('strips wrapping quotes around marker text and collapses whitespace', () => {
    expect(extractProvidedCaptionText('caption:   "  Hello   world  "')).toBe('Hello world');
  });

  it('prefers a quoted phrase over marker text', () => {
    expect(extractProvidedCaptionText('add captions saying "Only this part"')).toBe('Only this part');
  });

  it('never throws on arbitrary input (totality)', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const out = extractProvidedCaptionText(s);
        expect(out === null || (typeof out === 'string' && out.length > 0)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });
});

describe('buildProvidedCaptionSegments', () => {
  it('returns [] for empty/whitespace phrase or invalid duration', () => {
    expect(buildProvidedCaptionSegments('', 10_000)).toEqual([]);
    expect(buildProvidedCaptionSegments('   ', 10_000)).toEqual([]);
    expect(buildProvidedCaptionSegments('hello', 0)).toEqual([]);
    expect(buildProvidedCaptionSegments('hello', -5)).toEqual([]);
    expect(buildProvidedCaptionSegments('hello', Number.NaN)).toEqual([]);
    // @ts-expect-error — total on bad input
    expect(buildProvidedCaptionSegments(null, 10_000)).toEqual([]);
  });

  it('spans the whole clip for a single short phrase', () => {
    const segs = buildProvidedCaptionSegments('Build the future', 10_500);
    expect(segs.length).toBeGreaterThanOrEqual(1);
    expect(segs[0].startMs).toBe(0);
    expect(segs[segs.length - 1].endMs).toBe(10_500);
  });

  it('chunks a long phrase into multiple short cues that still cover the clip', () => {
    const phrase = 'one two three four five six seven eight nine ten eleven twelve';
    const segs = buildProvidedCaptionSegments(phrase, 12_000);
    // 12 words / 5 per cue → 3 cues.
    expect(segs.length).toBe(3);
    expect(segs[0].startMs).toBe(0);
    expect(segs[segs.length - 1].endMs).toBe(12_000);
    // Every cue is short.
    for (const s of segs) {
      expect(s.text.split(/\s+/).length).toBeLessThanOrEqual(PROVIDED_CAPTION_MAX_WORDS_PER_CUE);
    }
  });

  it('breaks cues at sentence punctuation', () => {
    const segs = buildProvidedCaptionSegments('Go now. Do it.', 8_000);
    expect(segs.map((s) => s.text)).toEqual(['Go now.', 'Do it.']);
    expect(segs[0].startMs).toBe(0);
    expect(segs[1].endMs).toBe(8_000);
  });

  it('loses no words across the cues', () => {
    const phrase = 'the quick brown fox jumps over the lazy dog again and again';
    const segs = buildProvidedCaptionSegments(phrase, 9_000);
    const rejoined = segs.map((s) => s.text).join(' ');
    expect(rejoined.split(/\s+/)).toEqual(phrase.split(/\s+/));
  });

  // ── PROPERTY: whole-video coverage, non-overlap, monotonic, forward ──────────
  it('PROPERTY: segments cover [0, durationMs], are contiguous, non-overlapping and strictly forward', () => {
    fc.assert(
      fc.property(
        fc
          .array(
            fc
              .string({ minLength: 1, maxLength: 12 })
              .map((w) => w.replace(/\s+/g, '') || 'x'),
            { minLength: 1, maxLength: 40 },
          )
          .map((words) => words.join(' ')),
        fc.integer({ min: 100, max: 600_000 }),
        (phrase, durationMs) => {
          const segs = buildProvidedCaptionSegments(phrase, durationMs);
          expect(segs.length).toBeGreaterThanOrEqual(1);
          // Full coverage.
          expect(segs[0].startMs).toBe(0);
          expect(segs[segs.length - 1].endMs).toBe(Math.round(durationMs));
          for (let i = 0; i < segs.length; i += 1) {
            // Strictly forward.
            expect(segs[i].endMs).toBeGreaterThan(segs[i].startMs);
            // Contiguous / non-overlapping.
            if (i > 0) expect(segs[i].startMs).toBe(segs[i - 1].endMs);
            // Non-empty cue text.
            expect(segs[i].text.length).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('PROPERTY: never creates a zero-length cue even when duration is tiny relative to word count', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 1, max: 30 }),
        (wordCount, durationMs) => {
          const phrase = Array.from({ length: wordCount }, (_, i) => `w${i}`).join(' ');
          const segs = buildProvidedCaptionSegments(phrase, durationMs);
          for (const s of segs) expect(s.endMs).toBeGreaterThan(s.startMs);
          if (segs.length > 0) {
            expect(segs[0].startMs).toBe(0);
            expect(segs[segs.length - 1].endMs).toBe(Math.round(durationMs));
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});
