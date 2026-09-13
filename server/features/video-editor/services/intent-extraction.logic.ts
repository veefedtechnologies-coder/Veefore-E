/**
 * Pure (DB-free, LLM-free) video-intent extraction core for the Intent_Router.
 *
 * This is the deterministic half of the two-stage Intent_Router (design
 * §"Intent_Router"): the LLM-backed `intent-router.service.ts` (task 6.4)
 * produces one or more raw candidate extractions; THIS module turns them into a
 * final, well-formed `VideoIntent` — or a clarification request — using only
 * pure functions so the behaviour can be exercised by property tests
 * (`intent-extraction.logic.test.ts`, task 6.3).
 *
 * Contract (Req 2.2–2.7):
 *   • Req 2.2 — when several candidate intents match, the highest-confidence
 *     candidate is selected (`selectHighestConfidenceCandidate`).
 *   • Req 2.3 — every field the message does not specify carries the explicit
 *     unspecified sentinel (`null` for scalars, `[]` for lists); no field is ever
 *     populated with an inferred value (`normalizeVideoIntent`).
 *   • Req 2.4 — `requiresGenerativeAI` is true IF AND ONLY IF at least one
 *     requested change is classified as requiring generative visual synthesis.
 *   • Req 2.5 — `requiresDeterministicEditing` is true IF AND ONLY IF at least
 *     one requested change is classified as deterministic-performable.
 *   • Req 2.6 — when the maximum candidate confidence is not strictly above the
 *     configured threshold (default 0.70), the result is a clarification request
 *     that enqueues nothing and changes no project state.
 *   • Req 2.7 — text extracted from video content, captions, or OCR is INERT
 *     DATA: it is carried through a branded `InertText` type and is never read to
 *     drive classification/control flow, so a command-shaped fragment inside it
 *     can never be executed as an instruction.
 *
 * The confidence threshold is read from the single-source video-editor config
 * (`video-editor.config.ts`) — it is never hardcoded here.
 */

import { CONFIDENCE_THRESHOLD } from '../config/video-editor.config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The closed set of video-editing actions the Intent_Router can classify. */
export type VideoIntentAction =
  | 'VIDEO_EDIT'
  | 'VIDEO_ANALYZE'
  | 'VIDEO_REPURPOSE'
  | 'VIDEO_SHORTEN'
  | 'VIDEO_GENERATE'
  | 'VIDEO_CAPTION'
  | 'VIDEO_AUDIO_ENHANCE'
  | 'VIDEO_REMOVE_OBJECT'
  | 'VIDEO_REPLACE_BACKGROUND'
  | 'VIDEO_ADD_BROLL'
  | 'VIDEO_CREATE_AD'
  | 'VIDEO_CREATE_REEL'
  | 'VIDEO_CREATE_SHORT'
  | 'VIDEO_CREATE_STORY'
  | 'VIDEO_RESIZE'
  | 'VIDEO_EXPORT'
  | 'VIDEO_EDIT_CONTINUE'
  | 'VIDEO_EDIT_UNDO'
  | 'VIDEO_EDIT_REDO'
  | 'VIDEO_COMPARE'
  | 'VIDEO_QC';

/**
 * A user-specified constraint that MUST be preserved during editing
 * (requirements glossary: Protected_Element).
 */
export type ProtectedElement =
  | 'face'
  | 'voice'
  | 'product'
  | 'logo'
  | 'text'
  | 'background'
  | 'camera_movement'
  | 'colors'
  | 'original_audio';

/**
 * The closed set of valid {@link VideoIntentAction} values, as a runtime array.
 * The LLM stage (`intent-router.service.ts`, task 6.4) uses this to validate and
 * reject any hallucinated action string before a raw candidate is trusted, so
 * only in-set actions ever reach {@link normalizeVideoIntent}.
 */
export const VIDEO_INTENT_ACTIONS: readonly VideoIntentAction[] = [
  'VIDEO_EDIT',
  'VIDEO_ANALYZE',
  'VIDEO_REPURPOSE',
  'VIDEO_SHORTEN',
  'VIDEO_GENERATE',
  'VIDEO_CAPTION',
  'VIDEO_AUDIO_ENHANCE',
  'VIDEO_REMOVE_OBJECT',
  'VIDEO_REPLACE_BACKGROUND',
  'VIDEO_ADD_BROLL',
  'VIDEO_CREATE_AD',
  'VIDEO_CREATE_REEL',
  'VIDEO_CREATE_SHORT',
  'VIDEO_CREATE_STORY',
  'VIDEO_RESIZE',
  'VIDEO_EXPORT',
  'VIDEO_EDIT_CONTINUE',
  'VIDEO_EDIT_UNDO',
  'VIDEO_EDIT_REDO',
  'VIDEO_COMPARE',
  'VIDEO_QC',
] as const;

/** Type guard: whether `value` is one of the closed {@link VideoIntentAction} set. */
export function isVideoIntentAction(value: unknown): value is VideoIntentAction {
  return typeof value === 'string' && (VIDEO_INTENT_ACTIONS as readonly string[]).includes(value);
}

/** The explicit "unspecified" sentinel for scalar intent fields (Req 2.3). */
export const UNSPECIFIED = null;

/** How a single requested change is executed — drives the biconditional flags. */
export type ChangeExecutionClass = 'generative' | 'deterministic' | 'unknown';

/**
 * The structured video-editing intent (design §"Intent_Router"). Every scalar
 * field is `T | null`, with `null` meaning "the message did not specify this"
 * (Req 2.3); list fields default to `[]`.
 */
export interface VideoIntent {
  action: VideoIntentAction;
  inputAssets: string[];
  targetPlatform: string | null;
  targetAspectRatio: string | null;
  targetDurationMs: number | null;
  editingStyle: string | null;
  requestedChanges: string[];
  protectedElements: ProtectedElement[];
  brandRequirements: string | null;
  audioRequirements: string | null;
  captionRequirements: string | null;
  outputRequirements: string | null;
  qualityRequirements: string | null;
  /** Classification confidence on a 0..1 scale. */
  confidence: number;
  /** True iff ≥1 requested change requires generative visual synthesis (Req 2.4). */
  requiresGenerativeAI: boolean;
  /** True iff ≥1 requested change is deterministic-performable (Req 2.5). */
  requiresDeterministicEditing: boolean;
}

/**
 * A raw candidate extraction, as produced by the LLM stage. All content fields
 * are optional; anything absent (or explicitly `null`/`undefined`) is normalised
 * to the unspecified sentinel and never inferred (Req 2.3). `confidence` and
 * `action` are the only required fields.
 */
export interface VideoIntentCandidate {
  action: VideoIntentAction;
  /** Classification confidence on a 0..1 scale. */
  confidence: number;
  inputAssets?: string[] | null;
  targetPlatform?: string | null;
  targetAspectRatio?: string | null;
  targetDurationMs?: number | null;
  editingStyle?: string | null;
  requestedChanges?: string[] | null;
  protectedElements?: ProtectedElement[] | null;
  brandRequirements?: string | null;
  audioRequirements?: string | null;
  captionRequirements?: string | null;
  outputRequirements?: string | null;
  qualityRequirements?: string | null;
}

/**
 * Branded wrapper marking text as INERT DATA that originated from analysing
 * media (video frames/OCR/captions). It deliberately carries no methods and its
 * payload is never read by the extraction logic, so a command-shaped fragment it
 * contains can never influence control flow (Req 2.7).
 */
export interface InertText {
  readonly __inert: true;
  /** The raw text — for storage/display only, NEVER for classification. */
  readonly value: string;
}

/** Input to {@link extractVideoIntent}. */
export interface ExtractVideoIntentInput {
  /** Candidate extractions from the LLM stage (at least one to classify). */
  candidates: VideoIntentCandidate[];
  /**
   * Confidence threshold on a 0..1 scale. Defaults to the single-source
   * `CONFIDENCE_THRESHOLD` (0.70) — callers should not override in production.
   */
  confidenceThreshold?: number;
  /**
   * Text extracted from the media itself (video/OCR/captions). Purely inert
   * data (Req 2.7): it is accepted for completeness but never read to drive the
   * result, so replacing it with a placeholder yields an identical result.
   */
  extractedMediaText?: InertText;
}

/** Result of {@link extractVideoIntent}: a classified intent or a clarification. */
export type VideoIntentExtractionResult =
  | { status: 'classified'; intent: VideoIntent }
  | {
      /** Confidence was not strictly above the threshold (Req 2.6). */
      status: 'clarification';
      reason: string;
      /** The maximum confidence observed across candidates. */
      maxConfidence: number;
      /** Always false — a clarification request never mutates project state. */
      stateChanged: false;
    };

// ---------------------------------------------------------------------------
// Requested-change classification (fuels the biconditional flags)
// ---------------------------------------------------------------------------

/**
 * Requested changes that require GENERATIVE visual synthesis — pixels FFmpeg
 * cannot produce (object/person removal, background replacement, generated
 * b-roll, inpainting/outpainting, relighting, style transfer, face/scene
 * synthesis). Matching any of these makes `requiresGenerativeAI` true (Req 2.4).
 */
const GENERATIVE_CHANGE_PATTERNS: readonly RegExp[] = [
  /\b(remove|erase|delete|get\s+rid\s+of|take\s+out)\b.*\b(person|people|object|man|woman|human|background\s+person|photobomber|bystander)\b/i,
  /\b(replace|change|swap|generate|create|add)\b.*\b(background|backdrop|scene|scenery|environment|setting|sky|b-?roll)\b/i,
  /\b(inpaint|outpaint|in-?paint|out-?paint|uncrop|extend\s+the\s+(frame|scene|shot))\b/i,
  /\b(relight|re-?light|restyle|re-?style|style\s+transfer|repaint|re-?imagine|reimagine)\b/i,
  /\b(face\s*swap|deepfake|face\s+replacement|synthes(is|ize|ise)|hallucinate|generative\s+fill)\b/i,
  /\b(generate|create|synthesize|synthesise|imagine)\b.*\b(video|footage|clip|scene|shot|b-?roll)\b/i,
];

/**
 * Requested changes DETERMINISTIC media processing performs exactly (trim/cut,
 * crop/resize/aspect, captions/subtitles, speed, fades/transitions, audio level
 * work, silence removal, concat/merge, rotate/flip, encode/export). Matching any
 * of these makes `requiresDeterministicEditing` true (Req 2.5).
 */
const DETERMINISTIC_CHANGE_PATTERNS: readonly RegExp[] = [
  /\b(trim|cut|clip|shorten|shorten\s+to|make\s+it\s+\d+\s*(s|sec|second|seconds|minute|minutes)|split|snip)\b/i,
  /\b(crop|resize|scale|aspect\s+ratio|9:16|16:9|1:1|4:5|vertical|horizontal|square|letterbox|pad|pillarbox)\b/i,
  /\b(caption|captions|subtitle|subtitles|burn\s+in|burn-in|lower\s+third)\b/i,
  // Colour/look grade — a deterministic FFmpeg filter chain (eq/curves/colorbalance/hue),
  // NOT generative synthesis. Recognises the named looks and generic "filter"/
  // "colour grade"/"premium look" requests (Task A: FILTER/COLOR-GRADE).
  /\b(filters?|colou?r\s*grad(?:e|ed|ing)|colou?r\s*correct(?:ion|ed)?|cinematic|vintage|retro|black\s*and\s*white|b\s*&\s*w|b\/w|gr[ae]yscale|monochrome|noir|film\s*look|premium\s*look|vivid|teal\s*and\s*orange|warm\s*(?:tone|look|filter|grade)|cool\s*(?:tone|look|filter|grade))\b/i,
  // Auto-cut / energy-beat-synced montage — a deterministic select/concat cut at
  // detected audio-energy onsets (Increment 2). Recognises "auto cut", "montage",
  // "cut to the beat", "beat sync", and "tighten the pacing". "cut"/"auto cut"
  // also match the trim pattern above (still deterministic); the planner's kind
  // mapping disambiguates auto-cut FIRST so these route to the montage op.
  /\b(auto\s*-?\s*cut|montage|beat\s*-?\s*sync(?:ed|ing)?|cut\s*to\s*the\s*beat|sync\s*(?:the\s*)?cuts?\s*to\s*(?:the\s*)?(?:beat|music|audio)|tighten(?:\s*up)?\s*(?:the\s*)?pac(?:e|ing))\b/i,
  // Highlight / best-parts selection — a deterministic "editorial brain" pass
  // that scores the timeline (audio energy + speech) and keeps the strongest
  // moments, then renders the tightened cut via the existing auto_cut op. It is
  // deterministic-performable. Recognises "highlight(s)", "highlight reel",
  // "best parts/bits/moments", "good parts", "cut it down to the best",
  // "make it a X second highlight/reel", "summarize the video", and "shorten to
  // the highlights". "cut it down to the best" also contains "cut" (still
  // deterministic); the planner's kind mapping disambiguates highlight FIRST so
  // these route to the highlight op.
  /\b(highlights?|highlight\s*reel|best\s*(?:parts?|bits?|moments?)|(?:the\s+)?good\s*parts?|cut\s*(?:it\s*)?down\s*to\s*the\s*best|\d+\s*(?:s|secs?|seconds?|mins?|minutes?)\s*(?:highlight|reel)|summar(?:ize|ise)\s*(?:the\s*)?video|shorten\s*to\s*(?:the\s*)?highlights?)\b/i,
  /\b(speed\s+up|slow\s+down|speed|slowmo|slow-?mo|timelapse|time-?lapse|fast\s+forward)\b/i,
  /\b(fade|fade\s+in|fade\s+out|crossfade|dissolve|transition|transitions|wipe)\b/i,
  /\b(volume|louder|quieter|normalize|normalise|loudness|mute|denoise|noise\s+reduction|audio\s+level)\b/i,
  /\b(remove|cut|trim)\b.*\b(silence|silences|dead\s*air|pauses?|gaps?)\b/i,
  // Multi-clip assembly / concat — a deterministic single-invocation concat of N
  // normalised inputs into ONE video. Recognises the concat family plus
  // "assemble", "combine the clips", "join the videos", "stitch my clips", and
  // "put these/them/the clips together".
  /\b(concat|concatenate|merge|join|stitch|combine|assemble)\b|\bput\s+(?:these|them|the\s+clips?|the\s+videos?|it)\s+together\b/i,
  /\b(rotate|flip|mirror|reverse)\b/i,
  /\b(encode|re-?encode|transcode|export|render|compress|bitrate)\b/i,
];

/**
 * Classify a single requested change as generative, deterministic, or unknown.
 *
 * If a change matches both families (e.g. a compound instruction), generative
 * takes precedence — it is the stronger routing requirement — but this only
 * affects THIS change's label; each family's biconditional is still driven by
 * whether ANY change matches that family (see the `computeRequires*` helpers).
 *
 * Pure and deterministic: the same string always yields the same class.
 */
export function classifyRequestedChange(change: string): ChangeExecutionClass {
  const text = typeof change === 'string' ? change : '';
  const isGenerative = GENERATIVE_CHANGE_PATTERNS.some((p) => p.test(text));
  if (isGenerative) return 'generative';
  const isDeterministic = DETERMINISTIC_CHANGE_PATTERNS.some((p) => p.test(text));
  if (isDeterministic) return 'deterministic';
  return 'unknown';
}

/**
 * `requiresGenerativeAI` biconditional (Req 2.4): true IF AND ONLY IF at least
 * one requested change requires generative visual synthesis.
 */
export function computeRequiresGenerativeAI(requestedChanges: readonly string[]): boolean {
  return requestedChanges.some((c) => GENERATIVE_CHANGE_PATTERNS.some((p) => p.test(c ?? '')));
}

/**
 * `requiresDeterministicEditing` biconditional (Req 2.5): true IF AND ONLY IF at
 * least one requested change is deterministic-performable.
 */
export function computeRequiresDeterministicEditing(requestedChanges: readonly string[]): boolean {
  return requestedChanges.some((c) => DETERMINISTIC_CHANGE_PATTERNS.some((p) => p.test(c ?? '')));
}

// ---------------------------------------------------------------------------
// Candidate selection (Req 2.2)
// ---------------------------------------------------------------------------

/**
 * Select the candidate with the maximum classification confidence (Req 2.2).
 * Ties are broken by the candidate's position (the first of equal-confidence
 * candidates wins), so selection is deterministic. Returns `null` for an empty
 * or invalid candidate list.
 */
export function selectHighestConfidenceCandidate(
  candidates: readonly VideoIntentCandidate[],
): VideoIntentCandidate | null {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  let best: VideoIntentCandidate | null = null;
  for (const candidate of candidates) {
    if (!candidate) continue;
    const confidence = clampConfidence(candidate.confidence);
    if (best === null || confidence > clampConfidence(best.confidence)) {
      best = candidate;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Normalisation (Req 2.3, 2.4, 2.5)
// ---------------------------------------------------------------------------

/**
 * Build a well-formed `VideoIntent` from a candidate, applying the explicit
 * unspecified sentinel to every field the candidate does not provide (Req 2.3)
 * and computing the two execution flags as exact biconditionals over the
 * requested changes (Req 2.4, 2.5). No field is ever inferred from another.
 */
export function normalizeVideoIntent(candidate: VideoIntentCandidate): VideoIntent {
  const requestedChanges = normalizeStringList(candidate.requestedChanges);
  const protectedElements = normalizeProtectedElements(candidate.protectedElements);

  return {
    action: candidate.action,
    inputAssets: normalizeStringList(candidate.inputAssets),
    targetPlatform: normalizeScalar(candidate.targetPlatform),
    targetAspectRatio: normalizeScalar(candidate.targetAspectRatio),
    targetDurationMs: normalizeNumber(candidate.targetDurationMs),
    editingStyle: normalizeScalar(candidate.editingStyle),
    requestedChanges,
    protectedElements,
    brandRequirements: normalizeScalar(candidate.brandRequirements),
    audioRequirements: normalizeScalar(candidate.audioRequirements),
    captionRequirements: normalizeScalar(candidate.captionRequirements),
    outputRequirements: normalizeScalar(candidate.outputRequirements),
    qualityRequirements: normalizeScalar(candidate.qualityRequirements),
    confidence: clampConfidence(candidate.confidence),
    requiresGenerativeAI: computeRequiresGenerativeAI(requestedChanges),
    requiresDeterministicEditing: computeRequiresDeterministicEditing(requestedChanges),
  };
}

// ---------------------------------------------------------------------------
// Forced-turn deterministic fallback (robust forced `video_editor` turns)
// ---------------------------------------------------------------------------

/**
 * Aspect-ratio phrases the fallback recognises, mapped to a canonical `W:H`.
 * Used only to populate `targetAspectRatio` on a fallback intent so a reframe
 * clause routes to a concrete deterministic aspect operation downstream.
 */
const ASPECT_PHRASE_MAP: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b9\s*[:x]\s*16\b/i, '9:16'],
  [/\b16\s*[:x]\s*9\b/i, '16:9'],
  [/\b4\s*[:x]\s*5\b/i, '4:5'],
  [/\b1\s*[:x]\s*1\b/i, '1:1'],
  [/\b(vertical|portrait|reels?|shorts?|tiktok|story|stories)\b/i, '9:16'],
  [/\b(square)\b/i, '1:1'],
  [/\b(widescreen|landscape|horizontal)\b/i, '16:9'],
];

/**
 * Detect an explicitly-stated target aspect ratio from the message, or `null`
 * when none is stated. Never inferred beyond the explicit phrases above (Req 2.3).
 */
export function detectTargetAspectRatio(message: string): string | null {
  const text = typeof message === 'string' ? message : '';
  for (const [pattern, ratio] of ASPECT_PHRASE_MAP) {
    if (pattern.test(text)) return ratio;
  }
  return null;
}

/**
 * Build a deterministic fallback {@link VideoIntent} directly from the user's
 * message, WITHOUT any LLM call. Used only for a FORCED video-editor turn (or an
 * attached-video edit request) when the LLM extraction stage produced no usable
 * candidate — so a clear, executable edit instruction still yields real,
 * executable operations instead of a dead-end clarification.
 *
 * No-Mock (Req 23): this NEVER fabricates a rendered result and NEVER invents an
 * operation the message did not ask for. It only recognises edit clauses that the
 * SAME pure classifiers ({@link classifyRequestedChange}) already know how to
 * route (captions, filter/colour, reframe/aspect, trim, speed, fades, audio,
 * object/background removal, …). When the message contains no recognisable edit
 * clause it returns `null`, and the caller degrades to a genuine clarification.
 *
 * The message is split into clauses on natural connectors/punctuation; each
 * clause that a classifier recognises becomes a `requestedChange`. The resulting
 * intent's `requiresGenerativeAI`/`requiresDeterministicEditing` flags are the
 * exact biconditionals over those changes (Req 2.4, 2.5), so downstream routing
 * is unchanged from the LLM path.
 */
export function buildFallbackVideoIntent(message: string): VideoIntent | null {
  const text = typeof message === 'string' ? message.trim() : '';
  if (text.length === 0) return null;

  const clauses = text
    .split(/\b(?:and|then|also|plus|with|after\s+that)\b|[,.;\n]+/i)
    .map((c) => (typeof c === 'string' ? c.trim() : ''))
    .filter((c) => c.length > 0);

  const requestedChanges: string[] = [];
  const seen = new Set<string>();
  for (const clause of clauses) {
    if (classifyRequestedChange(clause) === 'unknown') continue;
    const key = clause.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    requestedChanges.push(clause);
  }

  // If clause-splitting found nothing usable but the whole message clearly
  // matches an edit family, treat the whole message as one requested change.
  if (requestedChanges.length === 0 && classifyRequestedChange(text) !== 'unknown') {
    requestedChanges.push(text);
  }

  if (requestedChanges.length === 0) return null;

  const candidate: VideoIntentCandidate = {
    action: 'VIDEO_EDIT',
    // Deterministically confident: the change phrases were matched by the same
    // pure classifiers that drive routing, so this is a real, executable intent.
    confidence: 1,
    requestedChanges,
    targetAspectRatio: detectTargetAspectRatio(text),
  };
  return normalizeVideoIntent(candidate);
}

// ---------------------------------------------------------------------------
// Reel-polish preset (Increment 3 "one-shot premium reel")
// ---------------------------------------------------------------------------

/**
 * Phrases that ask for a one-shot "premium reel" polish — a single instruction
 * ("make this a reel", "premium reel", "polish this into a reel", "make it pop
 * like a pro reel") that should expand into a curated, tasteful chain of
 * DETERMINISTIC edits rather than a single op. Deliberately narrow so a specific
 * instruction (e.g. "just add captions") is never swallowed by the preset.
 */
const REEL_POLISH_PATTERNS: readonly RegExp[] = [
  /\b(reel\s*polish|premium\s*reel|pro(?:fessional)?\s*reel|insta(?:gram)?\s*reel\s*(?:polish|edit)?)\b/i,
  /\b(make|turn|convert|edit|polish)\b[^.?!]*\b(?:into|to|as)?\b[^.?!]*\b(premium|professional|pro|viral|scroll[-\s]*stopping|instagram)?\b[^.?!]*\breel\b/i,
  /\b(make|turn|convert)\b[^.?!]*\b(this|it|my\s+video|the\s+video|clip)\b[^.?!]*\b(pop|viral|professional|premium|cinematic|scroll[-\s]*stopping)\b/i,
  // ── "Auto-edit everything" phrasings ──────────────────────────────────────
  // A bare "just make it good" style instruction that should trigger the SAME
  // curated premium-reel chain WITHOUT the user listing steps. Kept narrow so a
  // specific single-op ("just add captions", "reframe to 9:16", "normalize the
  // audio") is never swallowed: each pattern requires an explicit auto-edit
  // qualifier ("properly/professionally/for me"), a target platform ("for
  // instagram/tiktok/reels"), or an explicit "social/post-ready" phrase.
  /\b(?:auto[-\s]?edit|edit\s+(?:this|it|my\s+video|the\s+video|clip)?\s*(?:properly|professionally|for\s+me|nicely|well|good))\b/i,
  /\b(?:edit|make|optimi[sz]e|prepare|polish|clean\s*up)\b[^.?!]*\bfor\s+(?:instagram|insta|reels?|tiktok|shorts?|youtube|social)\b/i,
  /\b(?:make|get)\b[^.?!]*\b(?:social[-\s]?ready|post[-\s]?ready|ready\s+to\s+post|ready\s+for\s+(?:instagram|insta|tiktok|reels?|shorts?|social))\b/i,
];

/**
 * The curated, ordered requested-change phrases the reel-polish preset expands
 * into. Each phrase is written so the SAME pure classifiers
 * ({@link classifyRequestedChange}) already route it to a known DETERMINISTIC
 * engine op — colour grade (`filter`), reframe (`aspect`), audio normalize
 * (`audio_process`), fades, beat-synced montage (`auto_cut`), and animated
 * captions — so no new routing is introduced. The downstream driver runs the
 * pixel/timeline ops first, then the beat-cut, then burns captions LAST, which
 * is exactly the order a professional short-form edit wants. No-Mock (Req 23):
 * every step degrades honestly (a clip with no speech gets no captions; a clip
 * with no beats is not force-cut).
 */
export const REEL_POLISH_CHANGES: readonly string[] = [
  'apply a cinematic colour grade',
  'reframe to a vertical 9:16 crop',
  'normalize the audio levels',
  'add a smooth fade in and fade out',
  'cut to the beat',
  'burn in animated captions',
] as const;

/**
 * Whether the message is a one-shot reel-polish / "auto-edit everything" request
 * (Increment 3). This matches both the explicit reel phrasings ("premium reel",
 * "make this pop") AND bare auto-edit intents ("edit this properly for
 * Instagram", "auto edit this", "make it social-ready") — all of which expand
 * into the SAME curated deterministic chain. Pure and deterministic. The caller
 * expands a match into {@link REEL_POLISH_CHANGES} via {@link buildReelPolishIntent}.
 */
export function isReelPolishRequest(message: string): boolean {
  const text = typeof message === 'string' ? message : '';
  if (text.trim().length === 0) return false;
  return REEL_POLISH_PATTERNS.some((p) => p.test(text));
}

/**
 * Merge any pre-existing requested changes with the curated reel-polish preset
 * changes, de-duplicated by lowercased text and preserving the user's explicit
 * changes FIRST (so an explicit look/instruction wins the driver's later
 * de-duplication-by-kind, and any explicit look word in the message drives the
 * grade). Pure and total.
 */
export function expandReelPolishChanges(existing: readonly string[] | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (c: string) => {
    if (typeof c !== 'string') return;
    const trimmed = c.trim();
    if (trimmed.length === 0) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(trimmed);
  };
  if (Array.isArray(existing)) existing.forEach(push);
  REEL_POLISH_CHANGES.forEach(push);
  return out;
}

/**
 * Build a {@link VideoIntent} for a one-shot reel-polish request (Increment 3),
 * expanding the curated preset changes over any `base` intent the router already
 * classified. Reuses {@link normalizeVideoIntent} so the execution flags
 * (Req 2.4/2.5) are recomputed as exact biconditionals over the expanded change
 * list. Targets a vertical 9:16 reel unless the base/message already states an
 * aspect ratio. Never fabricates a result — it only assembles a real, executable
 * deterministic edit chain the engine can perform (No-Mock, Req 23).
 */
export function buildReelPolishIntent(message: string, base?: VideoIntent | null): VideoIntent {
  const requestedChanges = expandReelPolishChanges(base?.requestedChanges);
  const candidate: VideoIntentCandidate = {
    action: base?.action ?? 'VIDEO_CREATE_REEL',
    confidence: base ? Math.max(clampConfidence(base.confidence), 0.9) : 1,
    inputAssets: base?.inputAssets ?? [],
    targetPlatform: base?.targetPlatform ?? null,
    targetAspectRatio: base?.targetAspectRatio ?? detectTargetAspectRatio(message) ?? '9:16',
    targetDurationMs: base?.targetDurationMs ?? null,
    editingStyle: base?.editingStyle ?? 'premium reel',
    requestedChanges,
    protectedElements: base?.protectedElements ?? [],
    brandRequirements: base?.brandRequirements ?? null,
    audioRequirements: base?.audioRequirements ?? null,
    captionRequirements: base?.captionRequirements ?? null,
    outputRequirements: base?.outputRequirements ?? null,
    qualityRequirements: base?.qualityRequirements ?? null,
  };
  return normalizeVideoIntent(candidate);
}

// ---------------------------------------------------------------------------
// Inert-data handling (Req 2.7)
// ---------------------------------------------------------------------------

/**
 * Wrap text extracted from media (video frames/OCR/captions) as INERT DATA.
 * The returned value can be stored/displayed but is treated as data-only by the
 * extraction logic and is never executed as an instruction (Req 2.7).
 */
export function asInertText(raw: string): InertText {
  return { __inert: true, value: typeof raw === 'string' ? raw : String(raw ?? '') };
}

/**
 * Reveal the raw string inside an `InertText` — for persistence/rendering ONLY.
 * Callers MUST NOT route this value into any control-flow or command position.
 */
export function revealInertText(text: InertText): string {
  return text.value;
}

// ---------------------------------------------------------------------------
// Main extraction entry point (Req 2.2–2.7)
// ---------------------------------------------------------------------------

/**
 * Turn candidate extractions into a final `VideoIntent` or a clarification.
 *
 * 1. Selects the highest-confidence candidate (Req 2.2).
 * 2. If the maximum confidence is NOT strictly above the threshold (default 0.70
 *    from the single-source config), returns a clarification request that
 *    enqueues nothing and mutates no state (Req 2.6).
 * 3. Otherwise normalises the candidate into a `VideoIntent` with explicit
 *    unspecified sentinels (Req 2.3) and exact biconditional flags (Req 2.4/2.5).
 *
 * `extractedMediaText` is inert (Req 2.7): it is never read here, so the result
 * is identical whatever its content.
 */
export function extractVideoIntent(input: ExtractVideoIntentInput): VideoIntentExtractionResult {
  const threshold =
    typeof input.confidenceThreshold === 'number' && Number.isFinite(input.confidenceThreshold)
      ? input.confidenceThreshold
      : CONFIDENCE_THRESHOLD;

  const best = selectHighestConfidenceCandidate(input.candidates ?? []);
  const maxConfidence = best ? clampConfidence(best.confidence) : 0;

  // Req 2.6 — not STRICTLY above threshold → clarify, change nothing.
  if (best === null || !(maxConfidence > threshold)) {
    return {
      status: 'clarification',
      reason:
        best === null
          ? 'No video-editing intent could be classified from the message.'
          : `Highest intent confidence ${maxConfidence.toFixed(2)} is not above the required threshold ${threshold.toFixed(2)}.`,
      maxConfidence,
      stateChanged: false,
    };
  }

  return { status: 'classified', intent: normalizeVideoIntent(best) };
}

// ---------------------------------------------------------------------------
// Internal normalisation helpers
// ---------------------------------------------------------------------------

/** Clamp a possibly-invalid confidence into the 0..1 range (0 when not finite). */
function clampConfidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Normalise a scalar string field: a non-empty trimmed string is kept; anything
 * else (null/undefined/empty/whitespace) becomes the unspecified sentinel — never
 * an inferred value (Req 2.3).
 */
function normalizeScalar(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return UNSPECIFIED;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : UNSPECIFIED;
}

/** Normalise a numeric field: a finite number is kept, otherwise the sentinel. */
function normalizeNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : UNSPECIFIED;
}

/**
 * Normalise a string list: absent → `[]`; otherwise keep non-empty trimmed
 * entries in order (unspecified is the empty list, never an inferred entry).
 */
function normalizeStringList(value: readonly string[] | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (trimmed.length > 0) out.push(trimmed);
  }
  return out;
}

/** Valid Protected_Element values (glossary). Used to reject inferred noise. */
const PROTECTED_ELEMENTS: readonly ProtectedElement[] = [
  'face',
  'voice',
  'product',
  'logo',
  'text',
  'background',
  'camera_movement',
  'colors',
  'original_audio',
];

/** Normalise a protected-element list, dropping any unrecognised value. */
function normalizeProtectedElements(
  value: readonly ProtectedElement[] | null | undefined,
): ProtectedElement[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<ProtectedElement>();
  for (const entry of value) {
    if (PROTECTED_ELEMENTS.includes(entry)) seen.add(entry);
  }
  return PROTECTED_ELEMENTS.filter((el) => seen.has(el));
}
