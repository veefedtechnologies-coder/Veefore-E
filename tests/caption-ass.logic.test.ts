/**
 * Unit tests for the PURE animated-caption ASS document builder
 * (`caption-ass.logic.ts`).
 *
 * Framework: vitest.
 *
 * These tests are pure (no IO): they assert the generated ASS document has the
 * required sections and correct values — `[Script Info]` / `[V4+ Styles]` /
 * `[Events]`, `PlayResX`/`PlayResY` from the dimensions, phrase grouping (a
 * 6-word segment → multiple phrases), active-word override tags, centisecond
 * timing conversion, and the styled no-word-timing fallback.
 */

import { describe, it, expect } from 'vitest';
import {
  buildCaptionAss,
  buildCaptionPhrases,
  buildPhraseDialogues,
  groupWordsIntoPhrases,
  charBudget,
  msToAssTime,
  toAssColor,
  escapeAssText,
  getAssPreset,
  listAssPresetKeys,
  ASS_PRESETS,
  DEFAULT_ASS_PRESET_KEY,
  type AssDimensions,
} from '../server/features/video-editor/services/caption-ass.logic';
import type { CaptionSegment, CaptionWord } from '../server/features/video-editor/services/caption-layout.logic';

const DIMS: AssDimensions = { width: 1080, height: 1920 };

/** Build N sequential 1-word-per-400ms words for a phrase. */
function words(texts: string[], startMs = 0, stepMs = 400): CaptionWord[] {
  return texts.map((text, i) => ({
    startMs: startMs + i * stepMs,
    endMs: startMs + i * stepMs + stepMs,
    text,
  }));
}

// ---------------------------------------------------------------------------
// Timing / colour / escaping primitives
// ---------------------------------------------------------------------------

describe('msToAssTime — centisecond conversion', () => {
  it('formats whole ms into h:mm:ss.cs (centiseconds)', () => {
    expect(msToAssTime(0)).toBe('0:00:00.00');
    expect(msToAssTime(1230)).toBe('0:00:01.23');
    expect(msToAssTime(61_500)).toBe('0:01:01.50');
    expect(msToAssTime(3_661_120)).toBe('1:01:01.12');
  });

  it('rounds to the nearest centisecond and clamps negatives to zero', () => {
    expect(msToAssTime(1234)).toBe('0:00:01.23');
    expect(msToAssTime(1236)).toBe('0:00:01.24');
    expect(msToAssTime(-500)).toBe('0:00:00.00');
    expect(msToAssTime(Number.NaN)).toBe('0:00:00.00');
  });
});

describe('toAssColor — #RRGGBB → &HAABBGGRR&', () => {
  it('reorders RGB to BGR with an alpha byte', () => {
    expect(toAssColor('#FFFFFF')).toBe('&H00FFFFFF&');
    expect(toAssColor('#000000')).toBe('&H00000000&');
    // Pure red #FF0000 → blue=00 green=00 red=FF.
    expect(toAssColor('#FF0000')).toBe('&H000000FF&');
    // Lime highlight #E1FF00 → B=00 G=FF R=E1.
    expect(toAssColor('#E1FF00')).toBe('&H0000FFE1&');
  });

  it('honours a non-zero alpha and falls back to white for bad input', () => {
    expect(toAssColor('#000000', 0x30)).toBe('&H30000000&');
    expect(toAssColor('not-a-color')).toBe('&H00FFFFFF&');
  });
});

describe('escapeAssText', () => {
  it('neutralises braces and backslashes and converts newlines to \\N', () => {
    expect(escapeAssText('a{b}c')).toBe('a(b)c');
    expect(escapeAssText('a\\b')).toBe('a/b');
    expect(escapeAssText('line1\nline2')).toBe('line1\\Nline2');
  });
});

// ---------------------------------------------------------------------------
// Preset registry
// ---------------------------------------------------------------------------

describe('preset registry', () => {
  it('exposes bold_pop (default), clean_minimal, karaoke_box', () => {
    expect(listAssPresetKeys()).toEqual(expect.arrayContaining(['bold_pop', 'clean_minimal', 'karaoke_box']));
    expect(DEFAULT_ASS_PRESET_KEY).toBe('bold_pop');
  });

  it('resolves unknown/empty keys to the default preset', () => {
    expect(getAssPreset('nope').key).toBe('bold_pop');
    expect(getAssPreset(undefined).key).toBe('bold_pop');
    expect(getAssPreset('karaoke_box').key).toBe('karaoke_box');
  });

  it('bold_pop has a highlight colour; clean_minimal has none (scale-only)', () => {
    expect(ASS_PRESETS.bold_pop.highlightColorHex).toBeTruthy();
    expect(ASS_PRESETS.clean_minimal.highlightColorHex).toBeNull();
    expect(ASS_PRESETS.clean_minimal.activeScalePct).toBeGreaterThan(100);
  });
});

// ---------------------------------------------------------------------------
// Grouping (word ms-timings → short phrases)
// ---------------------------------------------------------------------------

describe('groupWordsIntoPhrases', () => {
  it('splits by the max-words-per-phrase cap (≤5 words)', () => {
    const ws = words(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 0, 300);
    const groups = groupWordsIntoPhrases(ws, 1000);
    // 7 words, cap 5 → [5,2].
    expect(groups.length).toBe(2);
    expect(groups[0].length).toBe(5);
    expect(groups[1].length).toBe(2);
  });

  it('splits when the phrase would exceed ~2s of screen time', () => {
    // 5 words each 600ms apart → phrase 0..2400ms exceeds the 2000ms cap.
    const ws = words(['one', 'two', 'three', 'four', 'five'], 0, 600);
    const groups = groupWordsIntoPhrases(ws, 1000);
    expect(groups.length).toBeGreaterThan(1);
  });

  it('splits when the char budget is exceeded', () => {
    const ws = words(['alpha', 'bravo', 'charlie', 'delta'], 0, 200);
    // Tiny budget forces one word per phrase.
    const groups = groupWordsIntoPhrases(ws, 5);
    expect(groups.length).toBe(4);
  });
});

describe('charBudget', () => {
  it('produces a positive budget; a wider frame (relative to font height) fits more chars', () => {
    // Landscape: lots of width, shorter font (font scales with height) → bigger budget.
    const landscape = charBudget(getAssPreset('bold_pop'), { width: 1920, height: 1080 });
    // Portrait: less width, taller font → smaller budget.
    const portrait = charBudget(getAssPreset('bold_pop'), { width: 1080, height: 1920 });
    expect(landscape).toBeGreaterThan(0);
    expect(portrait).toBeGreaterThan(0);
    expect(landscape).toBeGreaterThan(portrait);
  });
});

// ---------------------------------------------------------------------------
// Phrase resolution + fallback
// ---------------------------------------------------------------------------

describe('buildCaptionPhrases', () => {
  it('groups a 6-word segment into multiple phrases (word-level)', () => {
    const segment: CaptionSegment = {
      startMs: 0,
      endMs: 2400,
      text: 'one two three four five six',
      words: words(['one', 'two', 'three', 'four', 'five', 'six'], 0, 400),
    };
    const phrases = buildCaptionPhrases([segment], getAssPreset('bold_pop'), DIMS);
    expect(phrases.length).toBeGreaterThan(1);
    expect(phrases.every((p) => p.wordLevel)).toBe(true);
  });

  it('falls back to a single styled whole-segment phrase without word timing', () => {
    const segment: CaptionSegment = { startMs: 1000, endMs: 3000, text: 'no words here' };
    const phrases = buildCaptionPhrases([segment], getAssPreset('bold_pop'), DIMS);
    expect(phrases.length).toBe(1);
    expect(phrases[0].wordLevel).toBe(false);
    expect(phrases[0].text).toBe('no words here');
  });

  it('skips malformed segments without throwing', () => {
    const bad = [
      null as any,
      { startMs: 5, endMs: 5, text: 'zero-length' } as CaptionSegment,
      { startMs: 0, endMs: 100, text: '' } as CaptionSegment,
    ];
    expect(() => buildCaptionPhrases(bad, getAssPreset('bold_pop'), DIMS)).not.toThrow();
    expect(buildCaptionPhrases(bad, getAssPreset('bold_pop'), DIMS)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Per-phrase Dialogue events + active-word tags
// ---------------------------------------------------------------------------

describe('buildPhraseDialogues — active-word highlight', () => {
  it('emits one Dialogue per word with the active word wrapped in override tags', () => {
    const phrase = {
      startMs: 0,
      endMs: 1200,
      words: words(['hello', 'brave', 'world'], 0, 400),
      text: 'hello brave world',
      wordLevel: true as const,
    };
    const lines = buildPhraseDialogues(phrase, getAssPreset('bold_pop'));
    expect(lines.length).toBe(3);

    // Each line is a full Dialogue with a colour + scale override on ONE word.
    for (const line of lines) {
      expect(line.startsWith('Dialogue: ')).toBe(true);
      expect(line).toContain('\\fscx112\\fscy112'); // pop scale on the active word
      expect(line).toContain('&H'); // highlight colour override present
      expect(line).toContain('{\\r}'); // reset back to base after the active word
    }

    // Word slices are keyed to the word start times (centiseconds).
    expect(lines[0]).toContain('0:00:00.00,0:00:00.40'); // slice 0 → next word start
    expect(lines[1]).toContain('0:00:00.40,0:00:00.80');
    expect(lines[2]).toContain('0:00:00.80,0:00:01.20'); // last slice → its own end

    // ALL CAPS applied by the bold_pop preset.
    expect(lines[0]).toContain('HELLO');
  });

  it('clean_minimal scales the active word but adds NO colour override', () => {
    const phrase = {
      startMs: 0,
      endMs: 800,
      words: words(['soft', 'pop'], 0, 400),
      text: 'soft pop',
      wordLevel: true as const,
    };
    const lines = buildPhraseDialogues(phrase, getAssPreset('clean_minimal'));
    expect(lines.length).toBe(2);
    // Gentle scale present, but no \c colour-change tag on the active word.
    expect(lines[0]).toContain('\\fscx108\\fscy108');
    expect(lines[0]).not.toContain('\\c&H');
  });

  it('a fallback (no-word) phrase emits a single styled Dialogue', () => {
    const phrase = {
      startMs: 500,
      endMs: 2500,
      words: [] as CaptionWord[],
      text: 'whole segment line',
      wordLevel: false as const,
    };
    const lines = buildPhraseDialogues(phrase, getAssPreset('bold_pop'));
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('0:00:00.50,0:00:02.50');
    expect(lines[0]).toContain('WHOLE SEGMENT LINE');
  });
});

// ---------------------------------------------------------------------------
// Full document
// ---------------------------------------------------------------------------

describe('buildCaptionAss — full document', () => {
  const segments: CaptionSegment[] = [
    {
      startMs: 0,
      endMs: 2400,
      text: 'one two three four five six',
      words: words(['one', 'two', 'three', 'four', 'five', 'six'], 0, 400),
    },
    { startMs: 3000, endMs: 4500, text: 'plain fallback segment' },
  ];

  it('contains the required ASS sections', () => {
    const doc = buildCaptionAss(segments, 'bold_pop', DIMS);
    expect(doc).toContain('[Script Info]');
    expect(doc).toContain('[V4+ Styles]');
    expect(doc).toContain('[Events]');
    expect(doc).toContain('Format:'); // both Style + Event format lines
    expect(doc).toContain('Style: bold_pop,');
  });

  it('sets PlayResX / PlayResY from the dimensions', () => {
    const doc = buildCaptionAss(segments, 'bold_pop', { width: 720, height: 1280 });
    expect(doc).toContain('PlayResX: 720');
    expect(doc).toContain('PlayResY: 1280');
  });

  it('emits multiple Dialogue events (word slices) + the fallback line', () => {
    const doc = buildCaptionAss(segments, 'bold_pop', DIMS);
    const dialogues = doc.match(/^Dialogue:/gm) ?? [];
    // 6 word slices + 1 fallback = 7 dialogue events.
    expect(dialogues.length).toBe(7);
    expect(doc).toContain('PLAIN FALLBACK SEGMENT');
  });

  it('includes active-word override tags in the events', () => {
    const doc = buildCaptionAss(segments, 'bold_pop', DIMS);
    expect(doc).toContain('\\fscx112\\fscy112');
    expect(doc).toContain('{\\r}');
  });

  it('is total: never throws on empty/garbage input and still emits a valid header', () => {
    expect(() => buildCaptionAss([], 'bold_pop', DIMS)).not.toThrow();
    const empty = buildCaptionAss([], 'bold_pop', DIMS);
    expect(empty).toContain('[Events]');
    // Bad dimensions default to 1080x1920.
    const doc = buildCaptionAss(segments, 'bold_pop', { width: 0, height: -1 } as AssDimensions);
    expect(doc).toContain('PlayResX: 1080');
    expect(doc).toContain('PlayResY: 1920');
  });

  it('karaoke_box uses an opaque box border style (BorderStyle 3)', () => {
    const doc = buildCaptionAss(segments, 'karaoke_box', DIMS);
    // Style line fields: ...,BorderStyle,Outline,Shadow,Alignment,... → find "3" borderstyle.
    const styleLine = (doc.split('\n').find((l) => l.startsWith('Style: karaoke_box')) ?? '');
    const fields = styleLine.replace('Style: ', '').split(',');
    // BorderStyle is the 16th field (index 15) per the fixed Format order.
    expect(fields[15]).toBe('3');
  });
});
