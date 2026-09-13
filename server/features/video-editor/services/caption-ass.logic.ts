/**
 * Caption_Renderer — pure ASS (Advanced SubStation Alpha) document builder for
 * PROFESSIONAL ANIMATED word-level captions (CapCut / Opus / Hormozi style).
 *
 * The legacy caption path (`caption-layout.logic.ts` + the `drawtext` command in
 * `caption-renderer.service.ts`) burns STATIC, per-cue text onto the frame. This
 * module produces the *animated* upgrade: a complete, libass-renderable ASS
 * subtitle document with big bold outlined text, a word-by-word ACTIVE-WORD
 * highlight (colour swap + subtle pop scale), and safe-area placement — all as a
 * PURE, TOTAL function of its inputs (no IO, never throws). The IO shell
 * (`caption-renderer.service.ts`) writes the returned string to a temp `.ass`
 * file and burns it with ffmpeg's `subtitles=` (libass) filter.
 *
 * ── How the active-word highlight is achieved (deterministic, libass-reliable) ──
 * Karaoke `\k` tags CAN colour the active word, but their behaviour across libass
 * builds (fill direction, secondary-colour handling) is fiddly and hard to make
 * byte-deterministic. Instead we emit, PER WORD TIME-SLICE, a *separate*
 * `Dialogue` event that renders the WHOLE phrase but wraps ONLY the currently
 * spoken word in inline override tags (`{\c&H..&\fscx112\fscy112}word{\r}`) while
 * every other word stays at the base style. The event's start/end are derived
 * exactly from the word ms-timings (a word's slice runs from its start to the
 * next word's start, so coverage is gap-free within the phrase). This gives a
 * rock-solid, reliably-rendered active-word colour + pop on any libass build, and
 * is trivially unit-testable because the tags are literal text in the document.
 *
 * ── Presets ──
 *   - `bold_pop`      (default): heavy bold sans, white text, thick black outline
 *                     + soft shadow, lime active-word highlight, ALL CAPS, placed
 *                     in the bottom third — the classic Hormozi/Opus look.
 *   - `clean_minimal`: medium-weight white text, subtle thin outline, NO highlight
 *                     colour — just a gentle pop scale on the active word.
 *   - `karaoke_box`   : bold text on an opaque box (BorderStyle 3), word-by-word
 *                     cyan fill highlight, ALL CAPS.
 *
 * Fonts: presets reference a widely-available bold sans by NAME (`Arial`) via the
 * ASS `Fontname` field — no bundled font file is required (libass/fontconfig
 * resolves a bold sans on every target). Nothing here reads the filesystem.
 *
 * Everything is a pure function of `(segments, preset, dimensions)`:
 *   - safe-area margins scale from the dimensions (e.g. 1080×1920 → ~7.5% font
 *     height, ~16% bottom margin);
 *   - word grouping into short on-screen phrases (≤5 words / ≤2.0s / within the
 *     safe width) uses only the word ms-timings and the derived char budget;
 *   - malformed cues are clamped/skipped, never thrown on.
 */

import { isUsableWord, parseHexColor, type CaptionSegment, type CaptionWord } from './caption-layout.logic';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Output frame dimensions the ASS document is laid out against. */
export interface AssDimensions {
  width: number;
  height: number;
}

/** Vertical anchor of the caption block within the frame. */
export type AssPlacement = 'top' | 'center' | 'bottom';

/**
 * A complete animated-caption style preset. Every visual choice is data here so
 * `buildCaptionAss` stays a pure function: colours are `#RRGGBB`, sizes are
 * fractions of the frame HEIGHT (resolution-independent), and margins are
 * fractions of the frame dimensions (safe-area placement).
 */
export interface AssStylePreset {
  /** Stable preset key (e.g. `bold_pop`). */
  key: string;
  /** Human label. */
  label: string;
  /** ASS `Fontname` — a widely-available family name (no bundled file needed). */
  fontName: string;
  /** Whether the base style is bold. */
  bold: boolean;
  /** Base font size as a fraction (0..1) of frame HEIGHT. */
  fontSizeFrac: number;
  /** Base text colour (`#RRGGBB`). */
  primaryColorHex: string;
  /** Outline colour, or box colour when `borderStyle` is 3 (`#RRGGBB`). */
  outlineColorHex: string;
  /** Shadow / back colour (`#RRGGBB`). */
  shadowColorHex: string;
  /** Active-word highlight colour (`#RRGGBB`), or null for no colour swap. */
  highlightColorHex: string | null;
  /** Outline / box-border width as a fraction of the font size. */
  outlineFrac: number;
  /** Shadow depth as a fraction of the font size. */
  shadowFrac: number;
  /** Active-word scale percentage (100 = no pop; 112 = subtle pop). */
  activeScalePct: number;
  /** ASS BorderStyle: 1 = outline + drop shadow, 3 = opaque box. */
  borderStyle: 1 | 3;
  /** Uppercase all caption text. */
  allCaps: boolean;
  /** Vertical anchor within the frame. */
  placement: AssPlacement;
  /** Vertical safe-area margin as a fraction of frame HEIGHT. */
  marginVFrac: number;
  /** Left/right safe-area margin as a fraction of frame WIDTH. */
  marginHFrac: number;
}

// ---------------------------------------------------------------------------
// Preset registry
// ---------------------------------------------------------------------------

/** The default animated-caption preset key. */
export const DEFAULT_ASS_PRESET_KEY = 'bold_pop';

/**
 * Built-in animated-caption presets. `bold_pop` is the default CapCut/Hormozi
 * look; `clean_minimal` is understated; `karaoke_box` renders on an opaque box
 * with a word-by-word fill highlight.
 */
export const ASS_PRESETS: Readonly<Record<string, AssStylePreset>> = {
  bold_pop: {
    key: 'bold_pop',
    label: 'Bold Pop',
    fontName: 'Arial',
    bold: true,
    fontSizeFrac: 0.075,
    primaryColorHex: '#FFFFFF',
    outlineColorHex: '#000000',
    shadowColorHex: '#000000',
    highlightColorHex: '#E1FF00',
    outlineFrac: 0.08,
    shadowFrac: 0.03,
    activeScalePct: 112,
    borderStyle: 1,
    allCaps: true,
    placement: 'bottom',
    marginVFrac: 0.16,
    marginHFrac: 0.06,
  },
  clean_minimal: {
    key: 'clean_minimal',
    label: 'Clean Minimal',
    fontName: 'Arial',
    bold: false,
    fontSizeFrac: 0.06,
    primaryColorHex: '#FFFFFF',
    outlineColorHex: '#000000',
    shadowColorHex: '#000000',
    highlightColorHex: null,
    outlineFrac: 0.03,
    shadowFrac: 0.0,
    activeScalePct: 108,
    borderStyle: 1,
    allCaps: false,
    placement: 'bottom',
    marginVFrac: 0.12,
    marginHFrac: 0.08,
  },
  karaoke_box: {
    key: 'karaoke_box',
    label: 'Karaoke Box',
    fontName: 'Arial',
    bold: true,
    fontSizeFrac: 0.068,
    primaryColorHex: '#FFFFFF',
    outlineColorHex: '#000000',
    shadowColorHex: '#000000',
    highlightColorHex: '#00E5FF',
    outlineFrac: 0.05,
    shadowFrac: 0.0,
    activeScalePct: 104,
    borderStyle: 3,
    allCaps: true,
    placement: 'bottom',
    marginVFrac: 0.15,
    marginHFrac: 0.06,
  },
};

/**
 * Resolve an animated-caption preset by key, falling back to the default
 * (`bold_pop`) for an unknown/empty key. Total — never throws.
 */
export function getAssPreset(key: string | null | undefined): AssStylePreset {
  if (typeof key === 'string' && Object.prototype.hasOwnProperty.call(ASS_PRESETS, key)) {
    return ASS_PRESETS[key];
  }
  return ASS_PRESETS[DEFAULT_ASS_PRESET_KEY];
}

/** All configured animated-caption preset keys. */
export function listAssPresetKeys(): string[] {
  return Object.keys(ASS_PRESETS);
}

// ---------------------------------------------------------------------------
// Grouping heuristics (word ms-timings → short on-screen phrases)
// ---------------------------------------------------------------------------

/** Maximum words shown together in one phrase. */
const MAX_WORDS_PER_PHRASE = 5;
/** Maximum on-screen duration of one phrase (ms). */
const MAX_PHRASE_MS = 2_000;
/** Approx glyph width as a fraction of the font size (bold sans, upper-case). */
const APPROX_CHAR_WIDTH_OF_FONT = 0.58;
/** A floor for the per-line character budget so grouping never degenerates. */
const MIN_CHAR_BUDGET = 8;

/** A grouped on-screen phrase: either word-level (with timings) or whole-text. */
export interface CaptionPhrase {
  startMs: number;
  endMs: number;
  /** The phrase words WHEN word-level timing drives it; empty for a fallback. */
  words: CaptionWord[];
  /** The full phrase text (used for the styled fallback Dialogue). */
  text: string;
  /** True when this phrase carries usable word timing (animated active word). */
  wordLevel: boolean;
}

/** Is a finite number? */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Clamp `value` into `[lo, hi]`. */
function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * The per-line character budget derived from the frame width, safe-area margins,
 * and the preset font size — so a phrase never overflows the safe width. Pure.
 */
export function charBudget(preset: AssStylePreset, dimensions: AssDimensions): number {
  const width = Math.max(1, Math.round(dimensions.width));
  const height = Math.max(1, Math.round(dimensions.height));
  const availWidthPx = width * Math.max(0.1, 1 - preset.marginHFrac * 2);
  const fontPx = Math.max(1, preset.fontSizeFrac * height);
  const charPx = fontPx * APPROX_CHAR_WIDTH_OF_FONT;
  return Math.max(MIN_CHAR_BUDGET, Math.floor(availWidthPx / Math.max(1, charPx)));
}

/**
 * Group a segment's usable words into short on-screen phrases (≤5 words, ≤2.0s,
 * within the char budget). A new phrase starts when adding the next word would
 * exceed any limit. Pure and total — assumes `words` are already usable.
 */
export function groupWordsIntoPhrases(
  words: readonly CaptionWord[],
  maxChars: number,
): CaptionWord[][] {
  const phrases: CaptionWord[][] = [];
  let current: CaptionWord[] = [];
  let currentChars = 0;

  for (const word of words) {
    const w = word.text.length;
    const projectedChars = current.length === 0 ? w : currentChars + 1 + w;
    const phraseStart = current.length > 0 ? current[0].startMs : word.startMs;
    const projectedDuration = word.endMs - phraseStart;

    const overWords = current.length >= MAX_WORDS_PER_PHRASE;
    const overChars = current.length > 0 && projectedChars > maxChars;
    const overDuration = current.length > 0 && projectedDuration > MAX_PHRASE_MS;

    if (current.length > 0 && (overWords || overChars || overDuration)) {
      phrases.push(current);
      current = [];
      currentChars = 0;
    }

    if (current.length === 0) {
      current = [word];
      currentChars = w;
    } else {
      current.push(word);
      currentChars = currentChars + 1 + w;
    }
  }
  if (current.length > 0) phrases.push(current);

  return phrases;
}

/**
 * Resolve caption phrases from segments (Req 11.1, 11.2). A segment with usable
 * word timing yields one or more word-level phrases (grouped for the screen); a
 * segment lacking word timing yields a single whole-segment fallback phrase so it
 * is still displayed (styled), never dropped. Pure and total.
 */
export function buildCaptionPhrases(
  segments: readonly CaptionSegment[],
  preset: AssStylePreset,
  dimensions: AssDimensions,
): CaptionPhrase[] {
  const phrases: CaptionPhrase[] = [];
  if (!Array.isArray(segments)) return phrases;

  const maxChars = charBudget(preset, dimensions);

  for (const segment of segments) {
    if (!segment) continue;

    const words = Array.isArray(segment.words) ? segment.words.filter(isUsableWord) : [];
    const hasWordTiming = words.length > 0 && words.length === (segment.words?.length ?? 0);

    if (hasWordTiming) {
      for (const group of groupWordsIntoPhrases(words, maxChars)) {
        if (group.length === 0) continue;
        phrases.push({
          startMs: group[0].startMs,
          endMs: group[group.length - 1].endMs,
          words: group,
          text: group.map((w) => w.text).join(' '),
          wordLevel: true,
        });
      }
      continue;
    }

    // Fallback: no usable word timing → one styled whole-segment phrase.
    const validRange =
      isFiniteNumber(segment.startMs) &&
      isFiniteNumber(segment.endMs) &&
      segment.startMs >= 0 &&
      segment.endMs > segment.startMs;
    const text = typeof segment.text === 'string' ? segment.text.trim() : '';
    if (validRange && text.length > 0) {
      phrases.push({
        startMs: segment.startMs,
        endMs: segment.endMs,
        words: [],
        text,
        wordLevel: false,
      });
    }
  }

  return phrases;
}

// ---------------------------------------------------------------------------
// ASS primitives (colour, time, text escaping)
// ---------------------------------------------------------------------------

/**
 * Convert an `#RRGGBB` colour to ASS `&HAABBGGRR&` (alpha, blue, green, red).
 * Unparseable colours fall back to opaque white so the document stays valid.
 */
export function toAssColor(hex: string, alpha = 0): string {
  const rgb = parseHexColor(hex) ?? [255, 255, 255];
  const [r, g, b] = rgb;
  const a = clamp(Math.round(alpha), 0, 255);
  const hh = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
  return `&H${hh(a)}${hh(b)}${hh(g)}${hh(r)}&`;
}

/**
 * Convert whole milliseconds to the ASS timestamp `H:MM:SS.CC` (centiseconds).
 * Negative/non-finite inputs clamp to zero so the function is total.
 */
export function msToAssTime(ms: number): string {
  const safe = isFiniteNumber(ms) && ms > 0 ? ms : 0;
  const totalCs = Math.round(safe / 10);
  const cs = totalCs % 100;
  const totalS = Math.floor(totalCs / 100);
  const s = totalS % 60;
  const totalM = Math.floor(totalS / 60);
  const m = totalM % 60;
  const h = Math.floor(totalM / 60);
  const p2 = (n: number) => n.toString().padStart(2, '0');
  return `${h}:${p2(m)}:${p2(s)}.${p2(cs)}`;
}

/**
 * Escape a caption token for the ASS `Dialogue` text field. Braces (`{`/`}`)
 * delimit override blocks, so literal braces are neutralised to parentheses; a
 * stray backslash is neutralised to a slash (backslash starts `\N`/`\h` runs);
 * real newlines become the ASS hard line break `\N`. Deterministic and total.
 */
export function escapeAssText(text: string): string {
  return (typeof text === 'string' ? text : '')
    .replace(/\\/g, '/')
    .replace(/\{/g, '(')
    .replace(/\}/g, ')')
    .replace(/\r?\n/g, '\\N');
}

/** Apply the preset's all-caps option, then escape for ASS. */
function renderToken(text: string, preset: AssStylePreset): string {
  const cased = preset.allCaps ? text.toUpperCase() : text;
  return escapeAssText(cased);
}

/** The inline override tags that emphasise the active word for a preset. */
function activeWordTags(preset: AssStylePreset): string {
  const parts: string[] = [];
  if (preset.highlightColorHex) parts.push(`\\c${toAssColor(preset.highlightColorHex)}`);
  if (preset.activeScalePct && preset.activeScalePct !== 100) {
    const s = Math.round(preset.activeScalePct);
    parts.push(`\\fscx${s}\\fscy${s}`);
  }
  return parts.join('');
}

// ---------------------------------------------------------------------------
// Document sections
// ---------------------------------------------------------------------------

/** Build the `[Script Info]` section, sized to the output frame. */
function buildScriptInfo(dimensions: AssDimensions): string {
  const width = Math.max(1, Math.round(dimensions.width));
  const height = Math.max(1, Math.round(dimensions.height));
  return [
    '[Script Info]',
    '; Generated by Veefore Video Editor — animated captions (libass)',
    'ScriptType: v4.00+',
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: TV.709',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
  ].join('\n');
}

/** The `[V4+ Styles]` `Format:` field order (fixed). */
const STYLE_FORMAT =
  'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, ' +
  'BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, ' +
  'BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding';

/** ASS numpad alignment for a vertical placement (centre column). */
function alignmentFor(placement: AssPlacement): number {
  switch (placement) {
    case 'top':
      return 8;
    case 'center':
      return 5;
    case 'bottom':
    default:
      return 2;
  }
}

/** Build the `[V4+ Styles]` section with the single caption style. */
function buildStyles(preset: AssStylePreset, dimensions: AssDimensions): string {
  const width = Math.max(1, Math.round(dimensions.width));
  const height = Math.max(1, Math.round(dimensions.height));

  const fontSize = Math.max(1, Math.round(preset.fontSizeFrac * height));
  const outline = Math.max(0, Math.round(preset.outlineFrac * fontSize));
  const shadow = Math.max(0, Math.round(preset.shadowFrac * fontSize));
  const marginH = Math.max(0, Math.round(preset.marginHFrac * width));
  const marginV = Math.max(0, Math.round(preset.marginVFrac * height));
  const bold = preset.bold ? -1 : 0;
  const alignment = alignmentFor(preset.placement);

  // BorderStyle 3 draws an opaque box using the OutlineColour; give it a partial
  // alpha so text stays readable without fully masking the video.
  const outlineColour =
    preset.borderStyle === 3 ? toAssColor(preset.outlineColorHex, 0x30) : toAssColor(preset.outlineColorHex);

  const style =
    `Style: ${preset.key},${preset.fontName},${fontSize},` +
    `${toAssColor(preset.primaryColorHex)},${toAssColor(preset.primaryColorHex)},` +
    `${outlineColour},${toAssColor(preset.shadowColorHex)},` +
    `${bold},0,0,0,100,100,0,0,` +
    `${preset.borderStyle},${outline},${shadow},${alignment},${marginH},${marginH},${marginV},1`;

  return ['[V4+ Styles]', STYLE_FORMAT, style].join('\n');
}

/** The `[Events]` `Format:` field order (fixed). */
const EVENT_FORMAT =
  'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text';

/** One `Dialogue:` line. */
function dialogueLine(preset: AssStylePreset, startMs: number, endMs: number, text: string): string {
  const start = msToAssTime(startMs);
  const end = msToAssTime(Math.max(endMs, startMs + 10));
  return `Dialogue: 0,${start},${end},${preset.key},,0,0,0,,${text}`;
}

/**
 * Build the `Dialogue` events for one phrase. A word-level phrase emits one event
 * per word time-slice (the active word wrapped in override tags, the rest at
 * base); a fallback phrase emits a single styled event for the whole text. Pure.
 */
export function buildPhraseDialogues(phrase: CaptionPhrase, preset: AssStylePreset): string[] {
  if (!phrase.wordLevel || phrase.words.length === 0) {
    const text = renderToken(phrase.text, preset);
    if (text.length === 0) return [];
    return [dialogueLine(preset, phrase.startMs, phrase.endMs, text)];
  }

  const tags = activeWordTags(preset);
  const words = phrase.words;
  const lines: string[] = [];

  for (let i = 0; i < words.length; i += 1) {
    const active = words[i];
    // A word's slice runs to the next word's start (gap-free), or its own end.
    const sliceStart = active.startMs;
    const sliceEnd = i + 1 < words.length ? words[i + 1].startMs : active.endMs;

    const rendered = words
      .map((w, j) => {
        const token = renderToken(w.text, preset);
        return j === i ? `{${tags}}${token}{\\r}` : token;
      })
      .join(' ');

    lines.push(dialogueLine(preset, sliceStart, sliceEnd, rendered));
  }

  return lines;
}

/** Build the `[Events]` section from all phrases. */
function buildEvents(phrases: readonly CaptionPhrase[], preset: AssStylePreset): string {
  const dialogues: string[] = [];
  for (const phrase of phrases) {
    for (const line of buildPhraseDialogues(phrase, preset)) dialogues.push(line);
  }
  return ['[Events]', EVENT_FORMAT, ...dialogues].join('\n');
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Build a complete ASS subtitle document for animated word-level captions from
 * caption segments, a style preset, and the output dimensions.
 *
 * PURE and TOTAL: performs no IO and never throws. Malformed cues are
 * clamped/skipped. The returned string is a full `[Script Info]` + `[V4+ Styles]`
 * + `[Events]` document ready to be written to a `.ass` file and burned with
 * ffmpeg's libass `subtitles=` filter.
 *
 * @param segments   Caption segments with ms timings (word timings drive the
 *                   animated active-word highlight; segments without word timing
 *                   still render as a styled whole-segment cue).
 * @param preset     A style preset key (`bold_pop` | `clean_minimal` |
 *                   `karaoke_box`) or a full {@link AssStylePreset} object.
 * @param dimensions Output frame `{width, height}` driving font size, safe-area
 *                   margins, and the phrase char budget.
 */
export function buildCaptionAss(
  segments: readonly CaptionSegment[],
  preset: AssStylePreset | string | null | undefined,
  dimensions: AssDimensions,
): string {
  const resolved = typeof preset === 'object' && preset !== null ? preset : getAssPreset(preset ?? undefined);
  const dims: AssDimensions = {
    width: isFiniteNumber(dimensions?.width) && dimensions.width > 0 ? dimensions.width : 1080,
    height: isFiniteNumber(dimensions?.height) && dimensions.height > 0 ? dimensions.height : 1920,
  };

  const phrases = buildCaptionPhrases(segments, resolved, dims);

  return [buildScriptInfo(dims), '', buildStyles(resolved, dims), '', buildEvents(phrases, resolved), ''].join('\n');
}
