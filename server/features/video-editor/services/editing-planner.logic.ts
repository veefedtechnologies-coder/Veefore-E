/**
 * Editing_Planner — pure (DB-free, LLM-free) planning core.
 *
 * This is the deterministic half of the Editing_Planner (design §"Editing_Planner"):
 * the LLM-backed `editing-planner.service.ts` (task 9.3) handles goal/style
 * reasoning, while THIS module performs the structural transformation from a
 * `VideoIntent` + `VideoAnalysis` into a well-formed, never-null `EditingPlan`
 * using only pure functions, so the behaviour can be exercised by property tests
 * (`editing-planner.logic.test.ts`, task 9.2).
 *
 * Contract (Req 5.1–5.6, 13.2–13.5, 16.9–16.10):
 *   • Req 5.1 — the plan carries a project goal, a target specification, and an
 *     ordered list of typed operations, each with an explicit, strictly-ordered
 *     `sequenceIndex`.
 *   • Req 5.2 — the plan is NEVER null/absent; an unfulfillable intent yields a
 *     plan whose operation list is empty or contains only error-status operations.
 *   • Req 5.3 — every operation is classified as exactly one of
 *     {deterministic, generative, analysis, render}.
 *   • Req 5.4 — every operation range satisfies `startMs ≥ 0`, `endMs > startMs`,
 *     and both values fall within the source duration from the analysis.
 *   • Req 5.5 — an operation whose range overlaps a specified Protected_Element
 *     carries an explicit preservation constraint identifying that element.
 *   • Req 5.6 — an operation no engine can perform is marked `unavailable` with a
 *     limitation and is never marked executable.
 *   • Req 13.2/13.3 — applying a known Platform_Preset stamps aspect ratio,
 *     recommended/maximum duration, and export profile onto the plan; an unknown
 *     platform is rejected and leaves the plan unchanged.
 *   • Req 13.4/13.5 — applying a defined workspace brand profile stamps brand
 *     styling onto the plan; a request to use brand style with NO profile is
 *     rejected and leaves the plan unchanged.
 *   • Req 16.9/16.10 — a request for 1–5 variants fans out into that many
 *     independent plans; a request for more than 5 is rejected with a
 *     limit-exceeded error and creates no variant.
 *
 * Platform_Preset definitions and the variant ceiling are read from the
 * single-source video-editor config (`video-editor.config.ts`) — never hardcoded
 * here (Req 13.1).
 */

import {
  getPlatformPreset,
  MAX_VARIANTS_PER_REQUEST,
  type PlatformPreset,
} from '../config/video-editor.config';
import {
  classifyRequestedChange,
  type ChangeExecutionClass,
  type ProtectedElement,
  type VideoIntent,
  type VideoIntentAction,
} from './intent-extraction.logic';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The execution engine an operation is classified for (Req 5.3). Exactly one. */
export type OperationType =
  'deterministic' | 'generative' | 'analysis' | 'render';

/** Whether an operation can be executed, is unavailable, or is in error (Req 5.6). */
export type OperationStatus = 'executable' | 'unavailable' | 'error';

/**
 * A timeline range in milliseconds. Well-formed iff `startMs ≥ 0`,
 * `endMs > startMs`, and both fall within the source duration (Req 5.4).
 */
export interface TimelineRangeMs {
  startMs: number;
  endMs: number;
}

/** A single typed operation within an editing plan (design §"Editing_Planner"). */
export interface PlanOperation {
  /** Explicit, strictly-increasing execution order (Req 5.1). */
  sequenceIndex: number;
  /** Exactly one execution type (Req 5.3). */
  type: OperationType;
  /** Operation kind, e.g. 'trim', 'remove_silence', 'caption', 'generative_edit'. */
  kind: string;
  /** Affected timeline range, required for every operation (Req 5.4). */
  range: TimelineRangeMs;
  /** Protected elements whose region overlaps this op's range (Req 5.5). */
  preservationConstraints: ProtectedElement[];
  /** Execution status; 'unavailable'/'error' operations are never executable. */
  status: OperationStatus;
  /** Set when the operation is unavailable/error, describing the unmet capability (Req 5.6). */
  limitation?: string;
  /** Free-form operation parameters for the executing engine. */
  params: Record<string, unknown>;
}

/** The plan's target specification (Req 5.1); filled/overridden by preset application. */
export interface PlanTarget {
  platform: string | null;
  aspectRatio: string | null;
  /** Maximum output duration in ms (from preset when applied), else null. */
  maxDurationMs: number | null;
  /** Recommended output duration in ms (from preset when applied), else null. */
  recommendedDurationMs: number | null;
  /** Export profile id; empty string until a Platform_Preset is applied. */
  exportProfile: string;
}

/** Brand styling stamped onto a plan when a workspace brand profile is applied. */
export interface AppliedBrand {
  primaryColorHex: string | null;
  secondaryColorHex: string | null;
  fontFamily: string | null;
  captionStyle: string | null;
}

/**
 * The structured editing plan (design §"Editing_Planner"). Never null (Req 5.2);
 * `operations` is ordered and may be empty or error-only for an unfulfillable
 * intent.
 */
export interface EditingPlan {
  projectGoal: string;
  target: PlanTarget;
  operations: PlanOperation[];
  /** Applied workspace brand styling, when brand application succeeded; else null. */
  brand: AppliedBrand | null;
}

/**
 * A workspace brand profile. `applyBrandProfile` treats `null`/`undefined` as
 * "no brand profile defined" and rejects the request (Req 13.5).
 */
export interface BrandProfile {
  primaryColorHex?: string | null;
  secondaryColorHex?: string | null;
  fontFamily?: string | null;
  captionStyle?: string | null;
}

/** Where a Protected_Element appears in the source (from analysis, Req 5.5). */
export interface ProtectedElementRegion {
  element: ProtectedElement;
  /**
   * The timeline range the element occupies. When omitted, the element is
   * treated as spanning the ENTIRE source (conservative: always preserved).
   */
  range?: TimelineRangeMs;
}

/** The analysis inputs the pure planner consumes. */
export interface PlannerAnalysis {
  /** Source duration in milliseconds; must be a positive finite number to plan. */
  sourceDurationMs: number;
  /** Detected scene boundaries in ms (from deterministic scene detection). */
  sceneBoundariesMs?: number[];
  /** Where each specified Protected_Element appears (Req 5.5). */
  protectedRegions?: ProtectedElementRegion[];
}

/** Input to {@link buildEditingPlan}. */
export interface BuildEditingPlanInput {
  intent: VideoIntent;
  analysis: PlannerAnalysis;
  /**
   * Whether to append a final `render` operation when ≥1 executable editing
   * operation exists. Defaults to `true`.
   */
  includeRenderOperation?: boolean;
}

/** Structured rejection error codes surfaced by preset/brand/variant helpers. */
export type PlannerErrorCode =
  | 'UNSUPPORTED_PLATFORM'
  | 'BRAND_PROFILE_UNAVAILABLE'
  | 'VARIANT_LIMIT_EXCEEDED'
  | 'INVALID_VARIANT_COUNT';

/** A structured planner rejection. */
export interface PlannerError {
  code: PlannerErrorCode;
  message: string;
}

/** Result of applying a Platform_Preset to a plan (Req 13.2, 13.3). */
export type ApplyPresetResult =
  | { ok: true; plan: EditingPlan }
  | { ok: false; error: PlannerError; plan: EditingPlan };

/** Result of applying a brand profile to a plan (Req 13.4, 13.5). */
export type ApplyBrandResult =
  | { ok: true; plan: EditingPlan }
  | { ok: false; error: PlannerError; plan: EditingPlan };

/** Result of a variant fan-out (Req 16.9, 16.10). */
export type PlanVariantsResult =
  { ok: true; plans: EditingPlan[] } | { ok: false; error: PlannerError };

// ---------------------------------------------------------------------------
// Range helpers
// ---------------------------------------------------------------------------

/** Whether two half-open ranges overlap (`a.start < b.end && b.start < a.end`). */
export function rangesOverlap(a: TimelineRangeMs, b: TimelineRangeMs): boolean {
  return a.startMs < b.endMs && b.startMs < a.endMs;
}

/**
 * Whether a range is well-formed against a source duration (Req 5.4):
 * `startMs ≥ 0`, `endMs > startMs`, and both within `[0, sourceDurationMs]`.
 */
export function isValidRange(
  range: TimelineRangeMs,
  sourceDurationMs: number
): boolean {
  if (
    !range ||
    typeof range.startMs !== 'number' ||
    typeof range.endMs !== 'number'
  )
    return false;
  if (!Number.isFinite(range.startMs) || !Number.isFinite(range.endMs))
    return false;
  return (
    range.startMs >= 0 &&
    range.endMs > range.startMs &&
    range.endMs <= sourceDurationMs &&
    range.startMs <= sourceDurationMs
  );
}

/** Whether a value is a positive, finite source duration the planner can use. */
function isPlannableDuration(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

// ---------------------------------------------------------------------------
// Work-item derivation (intent → concrete operations)
// ---------------------------------------------------------------------------

interface WorkItem {
  kind: string;
  type: OperationType;
  status: OperationStatus;
  limitation?: string;
  /** Source text (a requested change or a synthesised action label) for params. */
  source: string;
}

/**
 * Default work item derived from the intent's action when the message lists no
 * explicit requested changes. Actions with no concrete deterministic/generative
 * operation (e.g. VIDEO_EDIT with nothing specified) return `null`, yielding an
 * empty plan (still well-formed, Req 5.2).
 */
function workItemForAction(action: VideoIntentAction): WorkItem | null {
  switch (action) {
    case 'VIDEO_SHORTEN':
      return {
        kind: 'trim',
        type: 'deterministic',
        status: 'executable',
        source: action,
      };
    case 'VIDEO_RESIZE':
      return {
        kind: 'resize',
        type: 'deterministic',
        status: 'executable',
        source: action,
      };
    case 'VIDEO_CAPTION':
      return {
        kind: 'caption',
        type: 'deterministic',
        status: 'executable',
        source: action,
      };
    case 'VIDEO_AUDIO_ENHANCE':
      return {
        kind: 'audio_process',
        type: 'deterministic',
        status: 'executable',
        source: action,
      };
    case 'VIDEO_REMOVE_OBJECT':
      return {
        kind: 'object_removal',
        type: 'generative',
        status: 'executable',
        source: action,
      };
    case 'VIDEO_REPLACE_BACKGROUND':
      return {
        kind: 'background_replace',
        type: 'generative',
        status: 'executable',
        source: action,
      };
    case 'VIDEO_ADD_BROLL':
      return {
        kind: 'generate_broll',
        type: 'generative',
        status: 'executable',
        source: action,
      };
    case 'VIDEO_GENERATE':
      return {
        kind: 'generate',
        type: 'generative',
        status: 'executable',
        source: action,
      };
    case 'VIDEO_ANALYZE':
    case 'VIDEO_QC':
      return {
        kind: 'analysis',
        type: 'analysis',
        status: 'executable',
        source: action,
      };
    case 'VIDEO_EXPORT':
      return {
        kind: 'render',
        type: 'render',
        status: 'executable',
        source: action,
      };
    default:
      // VIDEO_EDIT, VIDEO_REPURPOSE, VIDEO_CREATE_*, VIDEO_COMPARE,
      // VIDEO_EDIT_CONTINUE/UNDO/REDO carry no concrete op without changes.
      return null;
  }
}

// ---------------------------------------------------------------------------
// "highlights" — word-sense disambiguation (colour grading vs best-moments)
// ---------------------------------------------------------------------------

/**
 * The word "highlight(s)" carries TWO unrelated senses in video work:
 *
 *   • COLOUR GRADING — the bright end of the tonal range ("slightly crushed
 *     highlights", "recover the blown highlights", "highlight rolloff"). This is
 *     a colour/look request and belongs to the deterministic `filter` engine op.
 *   • EDITORIAL SELECTION — the best moments of a clip ("make a 30s highlight
 *     reel", "cut it down to the best parts"). This is the `highlight` op, an
 *     expensive analysis pass that re-times the timeline.
 *
 * Confusing the two is not a cosmetic mistake: a pure colour-grade instruction
 * used to be planned as a best-moments selection, which then ran an audio
 * energy-envelope extraction plus a full speech transcription before concluding
 * it had nothing to do. Every helper below is PURE, TOTAL and case-insensitive.
 */

/** Normalise a change for word-sense matching (never throws, accepts anything). */
function normalizeChangeText(change: unknown): string {
  return typeof change === 'string'
    ? change.toLowerCase().replace(/\s+/g, ' ').trim()
    : '';
}

/**
 * Collocations in which "highlight(s)" unambiguously names the BRIGHT END OF THE
 * TONAL RANGE: a grading adjective/verb attached to the noun ("crushed/blown/
 * clipped/recovered/soft/specular/warm highlights"), a grading noun attached to
 * it ("highlight rolloff/detail/compression/clipping"), or the canonical
 * shadows↔highlights pairing ("lifted shadows and slightly crushed highlights").
 */
const GRADING_HIGHLIGHT_COLLOCATION_RE = new RegExp(
  [
    // A grading adjective/verb attached to the noun, allowing a determiner or
    // intensifier in between ("recover the highlights", "crush those highlights").
    '\\b(?:crush(?:ed|ing|es)?|blow(?:n|ing)(?:[-\\s]?out)?|clip(?:ped|ping|s)?|recover(?:ed|ing|s)?|roll(?:ed)?[-\\s]?off|rolling[-\\s]?off|soft(?:en(?:ed|ing|s)?)?|bright(?:er)?|hot|bloom(?:ing)?|specular|lift(?:ed|ing|s)?|protect(?:ed|ing|s)?|preserv(?:e|ed|ing|es)|retain(?:ed|ing|s)?|compress(?:ed|ing|ion|es)?|tame[d]?|taming|warm(?:er)?|cool(?:er)?)'
      + '(?:\\s+(?:the|its|their|those|these|any|some|all|slightly|very|a\\s+bit|out|down|back))*'
      + '\\s+highlights?\\b',
    '\\bhighlights?\\s*(?:roll[-\\s]?off|rolloff|detail|compression|clipping|recovery|region|range|bias|tint|tone)\\b',
    '\\bshadows?\\b[^.?!]{0,60}\\bhighlights?\\b',
    '\\bhighlights?\\b[^.?!]{0,60}\\bshadows?\\b',
  ].join('|'),
  'i'
);

/**
 * General colour/grading vocabulary. Used as a GENERIC context guard: when a
 * sentence is otherwise about colour, a bare "highlights" in it is the tonal
 * sense even if it is not part of one of the collocations above.
 */
const GRADING_CONTEXT_RE =
  /\b(?:colou?r\s*grad(?:e|ed|ing)|colou?r\s*correct\w*|grade|graded|grading|cinematic|contrast|shadows?|midtones?|blacks|whites|exposure|saturat\w*|vibrance|luma|luminance|tonal|tone\s*curve|curves?|lut|white\s*balance|skin\s*tones?|teal|orange|film\s*(?:look|stock|emulation)|gamma|hue)\b/i;

/**
 * Editorial SELECTION language that does not depend on the noun "highlights" at
 * all ("highlight reel", "best parts/bits/moments", "good parts", "cut it down
 * to the best", "pick/find the best", "summarise the video", "30 second reel").
 */
const HIGHLIGHT_SELECTION_LANGUAGE_RE =
  /\b(?:highlight\s*reel|best\s*(?:parts?|bits?|moments?|clips?|shots?|takes?)|(?:the\s+)?good\s*parts?|cut\s*(?:it\s*)?down\s*to\s*the\s*best|(?:pick|find|choose|select)\s+(?:out\s+)?(?:me\s+)?the\s+best|summar(?:ize|ise)\s*(?:the\s*)?video|\d+\s*(?:s|secs?|seconds?|mins?|minutes?)\s*(?:highlight|reel))\b/i;

/** "highlights" used as the OBJECT of a selection verb ("keep the highlights"). */
const HIGHLIGHTS_AS_SELECTION_OBJECT_RE =
  /\b(?:keep|pick|choose|select|find|grab|extract|pull|show|make|create|build|generate|give|get|want|need|cut|trim|shorten|edit|turn\s+it\s+into)\b[^.?!]{0,30}?\bhighlights?\b/i;

/** "only/just the highlights" / "highlights only" — selection without a verb. */
const HIGHLIGHTS_ONLY_RE =
  /\b(?:only|just)\s+(?:the\s+)?highlights?\b|\bhighlights?\s+only\b/i;

/**
 * A change that is nothing BUT the bare noun ("highlights", "the highlights").
 * A standalone bare noun request is an editorial ask; the grading sense always
 * arrives inside a longer sentence about colour.
 */
const BARE_HIGHLIGHT_NOUN_RE = /^(?:the\s+|some\s+|a\s+|an\s+)?highlights?$/i;

/**
 * Whether "highlight(s)" in `change` is the COLOUR-GRADING sense (bright end of
 * the tonal range) rather than an editorial best-moments selection.
 *
 * Returns `false` when the text does not mention highlights at all (nothing to
 * disambiguate) and when the sentence carries explicit selection language (a
 * genuine "make a highlight reel and grade it" request keeps both senses).
 * PURE and TOTAL.
 */
export function isGradingHighlightSense(change: string): boolean {
  const t = normalizeChangeText(change);
  if (!/\bhighlights?\b/.test(t)) return false;
  if (HIGHLIGHT_SELECTION_LANGUAGE_RE.test(t)) return false;
  if (GRADING_HIGHLIGHT_COLLOCATION_RE.test(t)) return true;
  // Generic grading-context guard: colour vocabulary elsewhere in the sentence.
  return GRADING_CONTEXT_RE.test(t);
}

/**
 * Whether `change` asks for an editorial HIGHLIGHT SELECTION (keep the best
 * moments). Requires editorial intent — explicit selection/reel language, or
 * "highlights" used as the object of a selection verb, or a standalone bare
 * "highlights" noun — so a sentence about COLOUR can never produce a
 * highlight-selection operation. PURE and TOTAL.
 */
export function isHighlightSelectionRequest(change: string): boolean {
  const t = normalizeChangeText(change);
  if (t.length === 0) return false;
  // Reel/best-parts language is editorial regardless of the noun "highlights".
  if (HIGHLIGHT_SELECTION_LANGUAGE_RE.test(t)) return true;
  if (!/\bhighlights?\b/.test(t)) return false;
  // Colour-grading sense of the noun → never a selection.
  if (isGradingHighlightSense(t)) return false;
  return (
    BARE_HIGHLIGHT_NOUN_RE.test(t) ||
    HIGHLIGHTS_ONLY_RE.test(t) ||
    HIGHLIGHTS_AS_SELECTION_OBJECT_RE.test(t)
  );
}

/**
 * Map a specific requested-change phrase to a concrete deterministic kind.
 *
 * Exported so the highlight/auto-cut/trim disambiguation ordering can be
 * exercised directly by unit tests. Pure and deterministic.
 */
export function deterministicKindFor(change: string): string {
  const t = change.toLowerCase();
  if (
    /\b(silence|dead\s*air|pause|gap)\b/.test(t) &&
    /\b(remove|cut|trim)\b/.test(t)
  ) {
    return 'remove_silence';
  }
  // Highlight / best-parts SELECTION — checked BEFORE auto_cut and trim because
  // "cut it down to the best parts" contains "cut" and "highlight reel" could hit
  // other branches. This "editorial brain" pass keeps the strongest moments and
  // renders the tightened cut via the existing auto_cut engine op.
  //
  // It requires EDITORIAL INTENT, not merely the noun: the colour-grading sense
  // of "highlights" (the bright end of the tonal range, e.g. "slightly crushed
  // highlights") is excluded by `isHighlightSelectionRequest` and falls through
  // to the `filter` branch below, where it belongs.
  if (isHighlightSelectionRequest(t)) {
    return 'highlight';
  }
  // Auto-cut / beat-synced montage — checked BEFORE the trim branch because
  // "auto cut" / "cut to the beat" also contain the word "cut" (Increment 2).
  if (
    /\b(auto\s*-?\s*cut|montage|beat\s*-?\s*sync(?:ed|ing)?|cut\s*to\s*the\s*beat|sync\s*(?:the\s*)?cuts?\s*to\s*(?:the\s*)?(?:beat|music|audio)|tighten(?:\s*up)?\s*(?:the\s*)?pac(?:e|ing))\b/.test(
      t
    )
  ) {
    return 'auto_cut';
  }
  // Colour/look grade → the deterministic `filter` engine op (eq/curves/colorbalance/hue).
  // `isGradingHighlightSense` routes the TONAL sense of "highlights" here
  // ("slightly crushed highlights", "recover the blown highlights", "highlight
  // rolloff") — that is a colour instruction, never a best-moments selection.
  if (
    isGradingHighlightSense(t) ||
    /\b(filters?|colou?r\s*grad(?:e|ed|ing)|colou?r\s*correct(?:ion|ed)?|cinematic|vintage|retro|black\s*and\s*white|b\s*&\s*w|b\/w|gr[ae]yscale|monochrome|noir|film\s*look|premium\s*look|vivid|teal\s*and\s*orange|warm\s*(?:tone|look|filter|grade)|cool\s*(?:tone|look|filter|grade))\b/.test(
      t
    )
  ) {
    return 'filter';
  }
  if (/\b(trim|cut|shorten|split|snip|clip)\b/.test(t)) return 'trim';
  if (/\b(crop)\b/.test(t)) return 'crop';
  if (
    /\b(aspect|9:16|16:9|1:1|4:5|vertical|horizontal|square|letterbox|pillarbox|pad)\b/.test(
      t
    )
  ) {
    return 'aspect';
  }
  if (/\b(resize|scale)\b/.test(t)) return 'resize';
  // Plurals matter here: `\bcaption\b` does NOT match "captions", so a plain
  // "add captions" used to fall through to `deterministic_edit` (no engine).
  if (/\b(captions?|subtitles?|lower\s+thirds?|burn)\b/.test(t)) return 'caption';
  if (
    /\b(speed|slowmo|slow-?mo|timelapse|time-?lapse|fast\s+forward)\b/.test(t)
  )
    return 'speed';
  if (/\b(fade|crossfade|dissolve|transition|wipe)\b/.test(t)) return 'fades';
  if (
    /\b(volume|louder|quieter|normalize|normalise|loudness|mute|denoise|noise|audio)\b/.test(
      t
    )
  ) {
    return 'audio_process';
  }
  if (
    /\b(concat|concatenate|merge|join|stitch|combine|assemble)\b|\bput\s+(?:these|them|the\s+clips?|the\s+videos?|it)\s+together\b/.test(
      t
    )
  ) {
    return 'concat';
  }
  if (/\b(rotate|flip|mirror|reverse)\b/.test(t)) return 'rotate';
  if (
    /\b(encode|re-?encode|transcode|export|render|compress|bitrate)\b/.test(t)
  )
    return 'encode';
  return 'deterministic_edit';
}

/** Map a specific requested-change phrase to a concrete generative kind. */
function generativeKindFor(change: string): string {
  const t = change.toLowerCase();
  if (
    /\b(background|backdrop|scene|scenery|environment|setting|sky)\b/.test(t)
  ) {
    return 'background_replace';
  }
  if (/\b(remove|erase|delete|get\s+rid\s+of|take\s+out)\b/.test(t))
    return 'object_removal';
  if (/\b(b-?roll)\b/.test(t)) return 'generate_broll';
  if (/\b(generate|create|synthes)/.test(t)) return 'generate';
  return 'generative_edit';
}

/** Turn one requested change into a work item, classifying its execution engine. */
function workItemForChange(change: string): WorkItem {
  const execClass: ChangeExecutionClass = classifyRequestedChange(change);
  if (execClass === 'deterministic') {
    return {
      kind: deterministicKindFor(change),
      type: 'deterministic',
      status: 'executable',
      source: change,
    };
  }
  if (execClass === 'generative') {
    return {
      kind: generativeKindFor(change),
      type: 'generative',
      status: 'executable',
      source: change,
    };
  }
  // Unknown: no engine can perform it — unavailable with a limitation (Req 5.6).
  return {
    kind: 'unsupported',
    type: 'generative',
    status: 'unavailable',
    limitation: `No available engine can perform the requested change: "${change}"`,
    source: change,
  };
}

// ---------------------------------------------------------------------------
// Preservation-constraint recognition (a requested "change" that changes nothing)
// ---------------------------------------------------------------------------

/**
 * Leading politeness / connective filler stripped before the anchored
 * preservation patterns are applied ("please preserve …", "also keep … intact").
 */
const LEADING_FILLER_RE =
  /^(?:[\s\-–—*•.,;:]+|please|kindly|also|and|but|just|make\s+sure\s+to|be\s+sure\s+to|try\s+to|i\s+want\s+you\s+to|i\s+need\s+you\s+to|you\s+(?:should|must)|(?:can|could)\s+you|we\s+(?:should|must)|remember\s+to|important:?|note:?)\s*/;

/** Verbs that, at the head of a change, describe preservation rather than an edit. */
const PRESERVE_VERB_RE =
  /^(?:preserve|preserves|preserving|maintain|maintains|maintaining|retain|retains|retaining|protect|protects|protecting|safeguard|safeguards|safeguarding)\b/;

/** "keep …" is only preservation when its object/qualifier says so (see below). */
const KEEP_VERB_RE = /^keep(?:s|ing)?\b/;

/** "leave the logo as is / unchanged / intact / in place / alone". */
const LEAVE_AS_IS_RE =
  /^leav(?:e|es|ing)\b[\s\S]{0,80}?\b(?:as\s+is|as-is|as\s+they\s+are|as\s+it\s+is|unchanged|unaltered|untouched|intact|alone|in\s+place|the\s+same)\b/;

/** "don't / do not / never change|alter|remove|touch|crop|distort …". */
const NEGATED_CHANGE_RE =
  /^(?:do\s*not|do\s*n['’]?t|don['’]?t|dont|does\s*not|never|no\s+need\s+to)\s+(?:\w+\s+){0,3}?(?:change|changing|alter|altering|modify|modifying|adjust|adjusting|remove|removing|delete|deleting|strip|stripping|touch|touching|crop|cropping|distort|distorting|edit|editing|cut|cutting|move|moving|replace|replacing|resize|resizing|rescale|obscure|obscuring|cover|covering|blur|blurring|mute|muting|overwrite|overwriting|lose|losing|drop|dropping|hide|hiding|censor|censoring|shrink|shrinking|stretch|stretching|recolor|recolour)\b/;

/** "avoid changing … / without changing … / refrain from altering …". */
const AVOID_CHANGE_RE =
  /^(?:avoid|without|refrain\s+from|no)\s+(?:\w+\s+){0,3}?(?:change|changes|changing|alter|altering|alteration|alterations|modify|modifying|modification|modifications|adjust|adjusting|remove|removing|removal|delete|deleting|deletion|touch|touching|crop|cropping|distort|distorting|distortion|edit|editing|edits|cut|cutting|cuts|move|moving|replace|replacing|resize|resizing|blur|blurring|mute|muting|cover|covering|obscure|obscuring|hide|hiding|recolor|recolour|recoloring|recolouring)\b/;

/** "ensure / make sure … remains|stays|is preserved|unchanged|legible|visible". */
const ENSURE_REMAINS_RE =
  /^(?:ensure|ensures|ensuring|make\s+sure|makes\s+sure|making\s+sure|be\s+sure|guarantee|guarantees|verify|confirm|check)\b[\s\S]{0,120}?\b(?:remain|remains|stay|stays|is\s+preserved|are\s+preserved|is\s+kept|are\s+kept|is\s+retained|are\s+retained|unchanged|unaltered|untouched|intact|in\s+place|legible|readable|visible|audible|the\s+same)\b/;

/**
 * Qualifiers/objects that mark a phrase as describing something that must NOT
 * change. These are what make a "keep …" phrase a preservation constraint.
 */
const PRESERVATION_QUALIFIER_RE =
  /\b(?:in\s+place|intact|unchanged|unaltered|untouched|undisturbed|as\s+is|as-is|as\s+they\s+are|as\s+it\s+is|legible|readable|visible|audible|the\s+same|identical|consistent|recognizable|recognisable|where\s+(?:it|they)\s+(?:is|are)|on\s+screen|on-screen)\b/;

/**
 * Quantity / selection markers that mean the phrase is a genuine EDIT (a trim or
 * a highlight selection), e.g. "keep only the first 10 seconds",
 * "keep it under 30 seconds", "keep only the highlights". A phrase carrying one
 * of these is never swallowed as a preservation constraint unless it also states
 * an explicit preservation qualifier.
 */
const SELECTION_MARKER_RE =
  /\b(?:only|just|first|last|final|initial|opening|closing|under|below|over|above|within|less\s+than|shorter|at\s+most|at\s+least|max|maximum|min|minimum|top\s+\d+|best|highlights?|highlight\s*reel|good\s+parts?|the\s+part\s+where|the\s+bit\s+where|the\s+section\s+where|the\s+moment|the\s+beginning|the\s+end|the\s+middle|between|\d+\s*(?:s|sec|secs|second|seconds|m|min|mins|minute|minutes|ms|milliseconds|frames?)\b)/;

/**
 * Whether a requested-change string merely describes what must NOT change —
 * i.e. a preservation CONSTRAINT rather than an executable edit.
 *
 * PURE and TOTAL: no IO, no clock, never throws, accepts any input (non-string,
 * empty, whitespace → `false`), case-insensitive.
 *
 * Recognises `preserve/maintain/retain/protect …`, `leave … as is/unchanged/intact`,
 * `don't|do not|never change|alter|remove|touch|crop|distort …`,
 * `avoid|without changing …`, `ensure … remains/stays …`, and
 * `keep … in place/intact/unchanged/legible/visible/as is/the same`.
 *
 * A BARE `keep` prefix is deliberately NOT sufficient: real edits such as
 * "keep only the first 10 seconds", "keep the last 5 seconds",
 * "keep it under 30 seconds", "keep only the highlights" and
 * "keep just the part where he talks" must still become work items.
 */
export function isPreservationConstraint(change: string): boolean {
  if (typeof change !== 'string') return false;
  const normalized = change.toLowerCase().replace(/\s+/g, ' ').trim();
  if (normalized.length === 0) return false;

  // Strip leading politeness/connective filler (repeatedly, e.g. "please also ").
  let text = normalized;
  for (let i = 0; i < 4; i++) {
    const stripped = text.replace(LEADING_FILLER_RE, '');
    if (stripped === text) break;
    text = stripped;
  }
  if (text.length === 0) return false;

  const hasQualifier = PRESERVATION_QUALIFIER_RE.test(text);
  const hasSelection = SELECTION_MARKER_RE.test(text);

  // "keep …" — preservation ONLY with a preservation qualifier and no
  // quantity/selection marker (which would make it a trim/highlight edit).
  if (KEEP_VERB_RE.test(text)) {
    return hasQualifier && !hasSelection;
  }

  // Explicit preservation verbs and negated-change phrasings. A selection marker
  // without any preservation qualifier ("retain only the first 10 seconds")
  // keeps the phrase as a genuine edit.
  const isPreserveVerb =
    PRESERVE_VERB_RE.test(text) ||
    LEAVE_AS_IS_RE.test(text) ||
    NEGATED_CHANGE_RE.test(text) ||
    AVOID_CHANGE_RE.test(text) ||
    ENSURE_REMAINS_RE.test(text);
  if (!isPreserveVerb) return false;
  if (hasSelection && !hasQualifier) return false;
  return true;
}

/**
 * Map a preservation-constraint string onto the Protected_Element members it
 * clearly names, so a filtered constraint still reaches the engine through
 * `PlanOperation.preservationConstraints` (Req 5.5).
 *
 * Only maps text that unambiguously names an existing member of the constrained
 * `ProtectedElement` union — anything else maps to nothing (it constrains
 * nothing an engine can act on). PURE and TOTAL.
 */
export function protectedElementsFromConstraint(
  change: string
): ProtectedElement[] {
  if (typeof change !== 'string') return [];
  const t = change.toLowerCase();
  const out: ProtectedElement[] = [];
  const push = (element: ProtectedElement) => {
    if (!out.includes(element)) out.push(element);
  };

  if (
    /\b(?:original\s+audio|audio\s+track|audio|soundtrack|sound\s+track|music)\b/.test(
      t
    )
  ) {
    push('original_audio');
  }
  if (
    /\b(?:voice|voices|voice-?over|vocals?|speech|narration|dialogue|dialog)\b/.test(
      t
    )
  ) {
    push('voice');
  }
  if (
    /\b(?:logo|logos|branding|brand\s+mark|brandmark|watermark|wordmark)\b/.test(
      t
    )
  ) {
    push('logo');
  }
  if (/\b(?:colors?|colours?|colour\s*scheme|color\s*scheme|palette)\b/.test(t))
    push('colors');
  if (
    /\b(?:on-?screen\s+text|text|texts|captions?|subtitles?|typography|lower\s+third)\b/.test(
      t
    )
  ) {
    push('text');
  }
  if (/\b(?:face|faces|facial)\b/.test(t)) push('face');
  if (/\b(?:product|products|packaging)\b/.test(t)) push('product');
  if (/\b(?:background|backdrop)\b/.test(t)) push('background');
  if (
    /\b(?:camera\s+(?:movement|motion|move|pan|tilt|zoom)|camera\s*work)\b/.test(
      t
    )
  ) {
    push('camera_movement');
  }

  return out;
}

/** Outcome of deriving work from an intent: items plus implied preservation. */
interface DerivedWork {
  items: WorkItem[];
  /** Protected elements implied by the filtered-out preservation constraints. */
  impliedProtectedElements: ProtectedElement[];
}

/**
 * Derive the ordered list of work items from the intent (changes → actions).
 *
 * Requested changes that are PRESERVATION CONSTRAINTS ("preserve the original
 * audio track…", "keep on-screen text legible") are filtered out BEFORE mapping,
 * so they never become `unsupported`/`unavailable` work items — nothing needs to
 * be executed to leave something unchanged. Where such a constraint names a
 * Protected_Element, it is folded into the operations' preservation constraints
 * instead (Req 5.5).
 *
 * Non-empty-plan guard: if filtering removes EVERY change (the user's message was
 * entirely preservation language), fall back to the action-derived work item so a
 * preservation-only message does not silently produce an empty plan.
 */
function deriveWorkItems(intent: VideoIntent): DerivedWork {
  const changes = Array.isArray(intent.requestedChanges)
    ? intent.requestedChanges
    : [];
  const nonEmpty = changes.filter(
    c => typeof c === 'string' && c.trim().length > 0
  );

  const preservationTexts = nonEmpty.filter(c => isPreservationConstraint(c));
  const impliedProtectedElements: ProtectedElement[] = [];
  for (const text of preservationTexts) {
    for (const element of protectedElementsFromConstraint(text)) {
      if (!impliedProtectedElements.includes(element))
        impliedProtectedElements.push(element);
    }
  }

  const executableChanges = nonEmpty.filter(c => !isPreservationConstraint(c));
  if (executableChanges.length > 0) {
    return {
      items: executableChanges.map(c => workItemForChange(c)),
      impliedProtectedElements,
    };
  }

  // Either there were no changes at all, or every change was preservation-only:
  // both fall back to the action-derived work item (never an empty plan when the
  // action itself implies work).
  const actionItem = workItemForAction(intent.action);
  return { items: actionItem ? [actionItem] : [], impliedProtectedElements };
}

// ---------------------------------------------------------------------------
// Range + preservation-constraint computation
// ---------------------------------------------------------------------------

/**
 * Compute the affected range for a work item. Shortening/trim operations honour
 * an explicit `targetDurationMs` (bounded to the source); everything else spans
 * the whole source. Always returns a range well-formed against `sourceDurationMs`.
 */
function computeRange(
  item: WorkItem,
  intent: VideoIntent,
  sourceDurationMs: number
): TimelineRangeMs {
  // A trim work item, or one derived from the VIDEO_SHORTEN action, is a
  // shortening operation that honours an explicit target duration. (The
  // action-derived work item carries `source === intent.action`, so the
  // `item.kind === 'trim'` branch already covers VIDEO_SHORTEN's trim item;
  // the explicit action check keeps the intent readable.)
  const isShorten = item.kind === 'trim' || intent.action === 'VIDEO_SHORTEN';

  if (isShorten && isPlannableDuration(intent.targetDurationMs)) {
    const endMs = Math.min(intent.targetDurationMs as number, sourceDurationMs);
    if (endMs > 0) return { startMs: 0, endMs };
  }
  return { startMs: 0, endMs: sourceDurationMs };
}

/**
 * All ranges a Protected_Element occupies. When the analysis provides no region
 * for an element, it is treated as spanning the whole source (conservative:
 * every operation overlaps it, so preservation is always attached, Req 5.5).
 */
function regionsForElement(
  element: ProtectedElement,
  analysis: PlannerAnalysis,
  sourceDurationMs: number
): TimelineRangeMs[] {
  const regions = Array.isArray(analysis.protectedRegions)
    ? analysis.protectedRegions
    : [];
  const matching = regions.filter(r => r && r.element === element);
  if (matching.length === 0) {
    return [{ startMs: 0, endMs: sourceDurationMs }];
  }
  return matching.map(r =>
    r.range && isValidRange(r.range, sourceDurationMs)
      ? r.range
      : { startMs: 0, endMs: sourceDurationMs }
  );
}

/**
 * Protected elements whose region overlaps `range`, in the canonical element
 * order the intent declares them (deduplicated). Attached to each operation per
 * Req 5.5.
 */
function preservationConstraintsFor(
  range: TimelineRangeMs,
  intent: VideoIntent,
  analysis: PlannerAnalysis,
  sourceDurationMs: number
): ProtectedElement[] {
  const declared = Array.isArray(intent.protectedElements)
    ? intent.protectedElements
    : [];
  const out: ProtectedElement[] = [];
  const seen = new Set<ProtectedElement>();
  for (const element of declared) {
    if (seen.has(element)) continue;
    const regions = regionsForElement(element, analysis, sourceDurationMs);
    if (regions.some(region => rangesOverlap(range, region))) {
      out.push(element);
      seen.add(element);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Plan construction (Req 5.1–5.6)
// ---------------------------------------------------------------------------

/** Build the plan's initial target from the intent (before any preset application). */
function initialTarget(intent: VideoIntent): PlanTarget {
  return {
    platform: intent.targetPlatform,
    aspectRatio: intent.targetAspectRatio,
    maxDurationMs: null,
    recommendedDurationMs: null,
    exportProfile: '',
  };
}

/** A concise, human-readable goal derived from the intent (no LLM). */
function deriveProjectGoal(intent: VideoIntent): string {
  const changes = Array.isArray(intent.requestedChanges)
    ? intent.requestedChanges.filter(
        c => typeof c === 'string' && c.trim().length > 0
      )
    : [];
  if (changes.length > 0) {
    return `${intent.action}: ${changes.join('; ')}`;
  }
  return intent.action;
}

/**
 * Build a well-formed, never-null `EditingPlan` from a `VideoIntent` and
 * `VideoAnalysis` (Req 5.1–5.6).
 *
 * An unfulfillable intent — an invalid source duration, or no derivable
 * operation — yields a plan with an empty operation list (Req 5.2). Every
 * emitted operation has a strictly-ordered sequence index (Req 5.1), exactly one
 * type (Req 5.3), a range well-formed against the source duration (Req 5.4),
 * preservation constraints where its range overlaps a Protected_Element
 * (Req 5.5), and an `unavailable` status with a limitation when no engine can
 * perform it (Req 5.6).
 */
export function buildEditingPlan(input: BuildEditingPlanInput): EditingPlan {
  const intent = input.intent;
  const analysis = input.analysis;
  const target = initialTarget(intent);
  const projectGoal = deriveProjectGoal(intent);

  // Unfulfillable: no valid source duration to anchor ranges against (Req 5.2).
  if (!analysis || !isPlannableDuration(analysis.sourceDurationMs)) {
    return { projectGoal, target, operations: [], brand: null };
  }
  const sourceDurationMs = analysis.sourceDurationMs;

  const derived = deriveWorkItems(intent);
  const workItems = derived.items;

  // Preservation constraints filtered out of the work list must not vanish from
  // the plan's understanding: fold the Protected_Elements they name into the
  // elements used to compute each operation's preservation constraints (Req 5.5).
  const constraintIntent: VideoIntent =
    derived.impliedProtectedElements.length > 0
      ? {
          ...intent,
          protectedElements: Array.from(
            new Set<ProtectedElement>([
              ...(Array.isArray(intent.protectedElements)
                ? intent.protectedElements
                : []),
              ...derived.impliedProtectedElements,
            ])
          ),
        }
      : intent;

  const operations: PlanOperation[] = [];

  workItems.forEach(item => {
    const range = computeRange(item, intent, sourceDurationMs);
    // Defensive: guarantee a well-formed range even if computation degenerated.
    const safeRange: TimelineRangeMs = isValidRange(range, sourceDurationMs)
      ? range
      : { startMs: 0, endMs: sourceDurationMs };

    const operation: PlanOperation = {
      sequenceIndex: operations.length,
      type: item.type,
      kind: item.kind,
      range: safeRange,
      preservationConstraints: preservationConstraintsFor(
        safeRange,
        constraintIntent,
        analysis,
        sourceDurationMs
      ),
      status: item.status,
      params: { source: item.source },
    };
    if (item.limitation) operation.limitation = item.limitation;
    operations.push(operation);
  });

  // Append a final render operation when there is executable editing work and
  // rendering is enabled (default). The render op spans the whole timeline.
  const includeRender = input.includeRenderOperation !== false;
  const hasExecutableEdit = operations.some(
    op =>
      op.status === 'executable' &&
      op.type !== 'render' &&
      op.type !== 'analysis'
  );
  if (includeRender && hasExecutableEdit) {
    operations.push({
      sequenceIndex: operations.length,
      type: 'render',
      kind: 'render',
      range: { startMs: 0, endMs: sourceDurationMs },
      preservationConstraints: preservationConstraintsFor(
        { startMs: 0, endMs: sourceDurationMs },
        constraintIntent,
        analysis,
        sourceDurationMs
      ),
      status: 'executable',
      params: { source: 'final_render' },
    });
  }

  return { projectGoal, target, operations, brand: null };
}

// ---------------------------------------------------------------------------
// Platform_Preset application (Req 13.2, 13.3)
// ---------------------------------------------------------------------------

/**
 * Apply a Platform_Preset (by key) to a plan, reading the preset from the
 * single-source config (Req 13.1).
 *
 * On a KNOWN platform: returns a NEW plan whose target carries the preset's
 * aspect ratio, recommended/maximum duration, and export profile (Req 13.2).
 * On an UNKNOWN platform: returns `{ ok: false }` with an `UNSUPPORTED_PLATFORM`
 * error and the ORIGINAL plan unchanged (Req 13.3). The input plan is never
 * mutated.
 */
export function applyPlatformPreset(
  plan: EditingPlan,
  platformKey: string
): ApplyPresetResult {
  const preset: PlatformPreset | undefined =
    typeof platformKey === 'string'
      ? getPlatformPreset(platformKey)
      : undefined;

  if (!preset) {
    return {
      ok: false,
      error: {
        code: 'UNSUPPORTED_PLATFORM',
        message: `No Platform_Preset exists for platform '${String(platformKey)}'`,
      },
      plan,
    };
  }

  const updated: EditingPlan = {
    ...plan,
    target: {
      ...plan.target,
      platform: preset.key,
      aspectRatio: preset.aspectRatio,
      maxDurationMs: preset.maxDurationMs,
      recommendedDurationMs: preset.recommendedDurationMs,
      exportProfile: preset.exportProfileId,
    },
    operations: plan.operations.map(op => ({ ...op })),
  };
  return { ok: true, plan: updated };
}

// ---------------------------------------------------------------------------
// Brand profile application (Req 13.4, 13.5)
// ---------------------------------------------------------------------------

function nullableString(v: string | null | undefined): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

/**
 * Apply a workspace brand profile to a plan (call only when the user requested
 * brand styling).
 *
 * With a DEFINED profile: returns a NEW plan carrying the applied brand styling
 * (Req 13.4). With NO profile (`null`/`undefined`): returns `{ ok: false }` with
 * a `BRAND_PROFILE_UNAVAILABLE` error and the ORIGINAL plan unchanged (Req 13.5).
 * The input plan is never mutated.
 */
export function applyBrandProfile(
  plan: EditingPlan,
  brandProfile: BrandProfile | null | undefined
): ApplyBrandResult {
  if (!brandProfile) {
    return {
      ok: false,
      error: {
        code: 'BRAND_PROFILE_UNAVAILABLE',
        message: 'No workspace brand profile is available to apply',
      },
      plan,
    };
  }

  const applied: AppliedBrand = {
    primaryColorHex: nullableString(brandProfile.primaryColorHex),
    secondaryColorHex: nullableString(brandProfile.secondaryColorHex),
    fontFamily: nullableString(brandProfile.fontFamily),
    captionStyle: nullableString(brandProfile.captionStyle),
  };

  const updated: EditingPlan = {
    ...plan,
    brand: applied,
    operations: plan.operations.map(op => ({ ...op })),
  };
  return { ok: true, plan: updated };
}

// ---------------------------------------------------------------------------
// Variant fan-out (Req 16.9, 16.10)
// ---------------------------------------------------------------------------

/**
 * Fan out a base plan input into `count` INDEPENDENT editing plans (Req 16.9).
 *
 * Accepts 1..`MAX_VARIANTS_PER_REQUEST` (5, from the single-source config) and
 * returns that many freshly-built, structurally-independent plans. A request for
 * more than the ceiling is rejected with a `VARIANT_LIMIT_EXCEEDED` error and
 * creates no plan (Req 16.10). A non-integer or `< 1` count is rejected as an
 * invalid count.
 */
export function planVariants(
  input: BuildEditingPlanInput,
  count: number
): PlanVariantsResult {
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) {
    return {
      ok: false,
      error: {
        code: 'INVALID_VARIANT_COUNT',
        message: `Variant count must be an integer between 1 and ${MAX_VARIANTS_PER_REQUEST}`,
      },
    };
  }
  if (count > MAX_VARIANTS_PER_REQUEST) {
    return {
      ok: false,
      error: {
        code: 'VARIANT_LIMIT_EXCEEDED',
        message: `Requested ${count} variants exceeds the maximum of ${MAX_VARIANTS_PER_REQUEST}`,
      },
    };
  }

  const plans: EditingPlan[] = [];
  for (let i = 0; i < count; i++) {
    // Each plan is built independently, producing a distinct object graph.
    plans.push(buildEditingPlan(input));
  }
  return { ok: true, plans };
}
