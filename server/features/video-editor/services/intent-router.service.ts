/**
 * Intent_Router — structured extraction service (task 6.4, Req 2.1).
 *
 * This is the LLM-bearing shell that completes the two-stage `Intent_Router`
 * described in design §"Intent_Router". The two stages are:
 *
 *   Stage 1 — Capability gate (PURE, DB/LLM-free): the existing
 *     `classifyIntent` (`server/routes/veegpt-intent.logic.ts`) decides whether
 *     the turn is a video-editing turn. `video_edit` is gated by the hybrid
 *     contract — an explicitly forced `video_editor` surface OR an attached video
 *     paired with a video keyword — never a keyword alone (Req 2.1). If the gate
 *     does not select `video_edit`, THIS service performs NO LLM call and returns
 *     a `not_video_edit` outcome, so a non-video turn never spends a token here.
 *
 *   Stage 2 — Structured extraction (LLM, via `AIServiceManager`): a single
 *     server-side model call produces one or more RAW candidate extractions as
 *     JSON. Token usage is captured automatically by wrapping the call in
 *     `collectAIUsage('video.generation', ctx, …)` — the AsyncLocalStorage
 *     collector installed there records every nested provider call so the
 *     accompanying planning/extraction tokens are metered (design §Research).
 *
 * The raw candidates are then run through the PURE `extractVideoIntent`
 * (`intent-extraction.logic.ts`), which owns every correctness rule:
 *   • highest-confidence candidate selection (Req 2.2),
 *   • explicit unspecified sentinels — never inferred (Req 2.3),
 *   • the `requiresGenerativeAI` / `requiresDeterministicEditing` biconditionals
 *     (Req 2.4, 2.5) recomputed from the requested changes,
 *   • below-threshold confidence → clarification, no state change (Req 2.6),
 *   • extracted media/OCR/caption text treated as inert data (Req 2.7).
 *
 * This service adds ONLY the IO the pure core cannot own: prompting the model,
 * parsing/validating its JSON into `VideoIntentCandidate[]`, capturing token
 * usage, and enforcing the ≤5 s classification budget (Req 2.1) via an
 * abort-on-timeout signal. It performs NO intent arithmetic of its own.
 */

import { logger as defaultLogger } from '../../../config/logger';
import { AIServiceManager } from '../../../services/AIServiceManager';
import type { UserAIPreferences } from '../../../services/AIServiceManager';
import {
  collectAIUsage,
  type AIUsageSample,
} from '../../../services/aiUsageTracker';
import {
  classifyIntent,
  type ClassifyIntentInput,
  VIDEO_EDITOR_FORCED_TOOL,
} from '../../../routes/veegpt-intent.logic';
import type { Msg } from '../../../routes/veegpt-memory.logic';
import {
  extractVideoIntent,
  buildFallbackVideoIntent,
  asInertText,
  isVideoIntentAction,
  type VideoIntent,
  type VideoIntentCandidate,
  type VideoIntentExtractionResult,
  type ProtectedElement,
} from './intent-extraction.logic';
import { CONFIDENCE_THRESHOLD } from '../config/video-editor.config';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum wall-clock budget for a single classification (Req 2.1: within 5 s).
 * The LLM call is aborted when this elapses; a timeout yields a clarification
 * outcome rather than a fabricated intent (No-Mock, Req 23). This is a control
 * timeout, not a tunable preset — preset/threshold values live in
 * `video-editor.config.ts`, the confidence threshold among them.
 */
export const INTENT_CLASSIFICATION_TIMEOUT_MS = 5_000;

/** The subset of Protected_Element values the LLM may return (glossary). */
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

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Input to {@link IntentRouterService.classify}. */
export interface ClassifyVideoIntentInput {
  /** The current user message text. */
  message: string;
  /** Prior conversation messages, oldest→newest (excluding the current). */
  priorMessages?: Msg[];
  /** Whether the current message has any attachment (image/video/pdf). */
  hasMedia?: boolean;
  /** Whether the current message has an attached VIDEO specifically. */
  hasVideo?: boolean;
  /** A tool the user explicitly forced from the composer, if any. */
  forcedTool?: string;
  /** The social account the user selected in the composer, if any. */
  selectedAccountId?: string | null;
  /**
   * Identifiers of input video assets already attached to the turn. Passed to
   * the LLM as context and used as the default `inputAssets` when the message
   * itself names none.
   */
  inputAssets?: string[];
  /**
   * Text extracted from the media itself (video frames/OCR/captions). Treated as
   * INERT DATA (Req 2.7): it is NEVER sent to the model or read to drive
   * classification — it only flows through the pure core as inert context.
   */
  extractedMediaText?: string;
  /** Owning user (usage tagging / metering context). */
  userId?: string;
  /** Active workspace (usage tagging / metering context). */
  workspaceId?: string;
  /** Workspace AI model preference; forwarded to `AIServiceManager`. */
  aiModel?: string;
  /** Confidence threshold override (defaults to the single-source config value). */
  confidenceThreshold?: number;
  /** External abort signal; combined with the internal ≤5 s timeout. */
  signal?: AbortSignal;
}

/**
 * Outcome of {@link IntentRouterService.classify}:
 *  - `not_video_edit`: the capability gate did not select a video-editing turn,
 *    so no LLM call was made and no intent was produced.
 *  - `classified`: a well-formed {@link VideoIntent} was produced.
 *  - `clarification`: confidence was not above threshold, extraction produced no
 *    usable candidate, or the call timed out — nothing was enqueued or changed.
 */
export type VideoIntentRouteResult =
  | { status: 'not_video_edit'; gateIntents: string[] }
  | {
      status: 'classified';
      intent: VideoIntent;
      /** Token usage captured for the extraction call (Req 2.1 metering). */
      usage: AIUsageSample[];
    }
  | {
      status: 'clarification';
      reason: string;
      maxConfidence: number;
      stateChanged: false;
      /** Token usage captured (may be empty when no call was made). */
      usage: AIUsageSample[];
    };

/** Injectable dependencies (defaulted for production, overridable for tests). */
export interface IntentRouterServiceDeps {
  /** Provides `generateText`; defaults to the shared `AIServiceManager`. */
  aiService?: Pick<AIServiceManager, 'generateText'>;
  logger?: Pick<typeof defaultLogger, 'info' | 'warn' | 'error' | 'debug'>;
  /** Classification budget in ms; defaults to {@link INTENT_CLASSIFICATION_TIMEOUT_MS}. */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Intent_Router service: runs the pure capability gate, then (only for a
 * video-editing turn) an LLM structured-extraction call whose candidates are
 * finalized by the pure `extractVideoIntent`. Returns a `VideoIntent`, a
 * clarification request, or a non-video-edit outcome (Req 2.1–2.7).
 */
export class IntentRouterService {
  private readonly ai: Pick<AIServiceManager, 'generateText'>;
  private readonly log: IntentRouterServiceDeps['logger'];
  private readonly timeoutMs: number;

  constructor(deps: IntentRouterServiceDeps = {}) {
    this.ai = deps.aiService ?? AIServiceManager.getInstance();
    this.log = deps.logger ?? defaultLogger;
    this.timeoutMs = deps.timeoutMs ?? INTENT_CLASSIFICATION_TIMEOUT_MS;
  }

  /**
   * Classify a message into a structured {@link VideoIntent} within ≤5 s (Req 2.1).
   */
  async classify(
    input: ClassifyVideoIntentInput
  ): Promise<VideoIntentRouteResult> {
    const threshold =
      typeof input.confidenceThreshold === 'number' &&
      Number.isFinite(input.confidenceThreshold)
        ? input.confidenceThreshold
        : CONFIDENCE_THRESHOLD;

    // Stage 1 — pure capability gate. `video_edit` only when the hybrid gate
    // selects it (forced surface, or attached video + video keyword — never a
    // keyword alone). No LLM call otherwise.
    const gate = this.runGate(input);
    if (!gate.intents.includes('video_edit')) {
      return { status: 'not_video_edit', gateIntents: gate.intents };
    }

    // Stage 2 — LLM structured extraction, metered via collectAIUsage, bounded
    // by the ≤5 s classification budget.
    // A FORCED video-editor turn (the composer opened the editor) or an
    // attached-video edit request must be robust: if the LLM extraction stage
    // yields nothing usable — or fails/times out, or no provider is configured —
    // a clear instruction still routes to real, executable operations via the
    // pure deterministic fallback rather than dead-ending in a clarification.
    const forcedVideoEdit =
      input.forcedTool === VIDEO_EDITOR_FORCED_TOOL || input.hasVideo === true;

    let candidates: VideoIntentCandidate[] = [];
    let usage: AIUsageSample[] = [];
    try {
      const extracted = await this.extractCandidates(input);
      candidates = extracted.candidates;
      usage = extracted.usage;
    } catch (error) {
      // A failed/timed-out extraction never fabricates an intent — but on a
      // forced/attached-video turn we first try the deterministic fallback so a
      // clear instruction is not lost to a transient/unconfigured provider.
      this.log?.warn?.('Video intent extraction failed', {
        component: 'IntentRouterService',
        workspaceId: input.workspaceId,
        error: (error as Error)?.message,
      });
      const fallback = forcedVideoEdit
        ? buildFallbackVideoIntent(input.message ?? '')
        : null;
      if (fallback) {
        this.log?.info?.(
          'Using deterministic fallback intent after extraction failure',
          {
            component: 'IntentRouterService',
            workspaceId: input.workspaceId,
            requestedChanges: fallback.requestedChanges.length,
          }
        );
        return { status: 'classified', intent: fallback, usage };
      }
      return {
        status: 'clarification',
        reason:
          'Video editing intent could not be extracted within the time budget.',
        maxConfidence: 0,
        stateChanged: false,
        usage,
      };
    }

    // Finalize through the PURE core — it owns selection, sentinels, the
    // biconditional flags, the threshold decision, and inert-text handling.
    const result: VideoIntentExtractionResult = extractVideoIntent({
      candidates,
      confidenceThreshold: threshold,
      extractedMediaText:
        typeof input.extractedMediaText === 'string'
          ? asInertText(input.extractedMediaText)
          : undefined,
    });

    if (result.status === 'classified') {
      return { status: 'classified', intent: result.intent, usage };
    }

    // Below-threshold / no usable candidate: on a forced/attached-video turn,
    // fall back to a deterministic intent derived purely from the message so a
    // clear edit instruction still executes (No-Mock: only real operations).
    if (forcedVideoEdit) {
      const fallback = buildFallbackVideoIntent(input.message ?? '');
      if (fallback) {
        this.log?.info?.(
          'Using deterministic fallback intent for forced video-editor turn',
          {
            component: 'IntentRouterService',
            workspaceId: input.workspaceId,
            requestedChanges: fallback.requestedChanges.length,
            maxConfidence: result.maxConfidence,
          }
        );
        return { status: 'classified', intent: fallback, usage };
      }
    }

    return {
      status: 'clarification',
      reason: result.reason,
      maxConfidence: result.maxConfidence,
      stateChanged: false,
      usage,
    };
  }

  // -------------------------------------------------------------------------
  // Stage 1 — capability gate
  // -------------------------------------------------------------------------

  /** Run the pure capability gate with the video-edit hybrid inputs wired in. */
  private runGate(input: ClassifyVideoIntentInput) {
    const gateInput: ClassifyIntentInput = {
      message: input.message ?? '',
      priorMessages: Array.isArray(input.priorMessages)
        ? input.priorMessages
        : [],
      hasMedia: Boolean(input.hasMedia) || Boolean(input.hasVideo),
      hasVideo: Boolean(input.hasVideo),
      forcedTool: input.forcedTool,
      selectedAccountId: input.selectedAccountId ?? null,
    };
    return classifyIntent(gateInput);
  }

  // -------------------------------------------------------------------------
  // Stage 2 — LLM structured extraction
  // -------------------------------------------------------------------------

  /**
   * Run the single structured-extraction model call, capturing token usage and
   * enforcing the ≤5 s budget. Returns validated candidates (possibly empty).
   */
  private async extractCandidates(
    input: ClassifyVideoIntentInput
  ): Promise<{ candidates: VideoIntentCandidate[]; usage: AIUsageSample[] }> {
    const prompt = buildExtractionPrompt(input);
    const preferences: UserAIPreferences = {
      aiModel: input.aiModel,
      // Deterministic, non-creative extraction: keep temperature low.
      creativityLevel: 0,
    };

    // Combine the caller's signal with an internal timeout so classification is
    // bounded to ≤5 s (Req 2.1). Aborting the provider call frees the request.
    const { signal, cancel } = withTimeout(input.signal, this.timeoutMs);

    // Wrap in collectAIUsage so any nested provider call is tagged as
    // `video.generation` and its tokens are collected for metering.
    try {
      const { result: raw, usage } = await collectAIUsage(
        'video.generation',
        { userId: input.userId, workspaceId: input.workspaceId },
        () => this.ai.generateText(prompt, preferences, signal)
      );
      const candidates = parseCandidates(raw);
      return { candidates, usage };
    } finally {
      cancel();
    }
  }
}

/** Lazily-instantiated shared Intent_Router service instance. */
let sharedRouter: IntentRouterService | null = null;

/** Get the process-wide Intent_Router service. */
export function getIntentRouterService(): IntentRouterService {
  if (!sharedRouter) {
    sharedRouter = new IntentRouterService();
  }
  return sharedRouter;
}

// ---------------------------------------------------------------------------
// Prompt construction (video message only — extracted media text stays inert)
// ---------------------------------------------------------------------------

/**
 * Build the structured-extraction prompt. Only the USER MESSAGE and structural
 * context (attached asset ids, forced surface) are included — text extracted
 * from the media is deliberately NOT sent, keeping it inert (Req 2.7). The model
 * is instructed to emit ONLY JSON with a `candidates` array and to use `null`
 * for anything the message does not state (the pure core enforces this too).
 */
export function buildExtractionPrompt(input: ClassifyVideoIntentInput): string {
  const assets = Array.isArray(input.inputAssets)
    ? input.inputAssets.filter(Boolean)
    : [];
  const forcedSurface = input.forcedTool === VIDEO_EDITOR_FORCED_TOOL;

  return [
    "You are the Intent_Router for a video editor. Classify the user's video-editing",
    'request into one or more structured candidate intents. Respond with ONLY a JSON',
    'object of the exact shape:',
    '{"candidates":[{',
    '  "action": <one of: VIDEO_EDIT, VIDEO_ANALYZE, VIDEO_REPURPOSE, VIDEO_SHORTEN,',
    '    VIDEO_GENERATE, VIDEO_CAPTION, VIDEO_AUDIO_ENHANCE, VIDEO_REMOVE_OBJECT,',
    '    VIDEO_REPLACE_BACKGROUND, VIDEO_ADD_BROLL, VIDEO_CREATE_AD, VIDEO_CREATE_REEL,',
    '    VIDEO_CREATE_SHORT, VIDEO_CREATE_STORY, VIDEO_RESIZE, VIDEO_EXPORT,',
    '    VIDEO_EDIT_CONTINUE, VIDEO_EDIT_UNDO, VIDEO_EDIT_REDO, VIDEO_COMPARE, VIDEO_QC>,',
    '  "confidence": <number 0..1>,',
    '  "inputAssets": <string[] or null>,',
    '  "targetPlatform": <string or null>,',
    '  "targetAspectRatio": <string like "9:16" or null>,',
    '  "targetDurationMs": <integer milliseconds or null>,',
    '  "editingStyle": <string or null>,',
    '  "requestedChanges": <string[] of the concrete changes requested, or null>,',
    '  "protectedElements": <subset of [face, voice, product, logo, text, background,',
    '    camera_movement, colors, original_audio] or null>,',
    '  "brandRequirements": <string or null>,',
    '  "audioRequirements": <string or null>,',
    '  "captionRequirements": <string or null>,',
    '  "outputRequirements": <string or null>,',
    '  "qualityRequirements": <string or null>',
    '}]}',
    '',
    'Rules:',
    '- Emit one candidate per plausible interpretation; set confidence honestly.',
    '- Use null for ANY field the message does not explicitly state. Never infer or',
    '  guess a value. Never invent an action outside the list above.',
    '- "requestedChanges" must list each concrete edit the user asked for, verbatim',
    '  where possible, so downstream routing can classify each change.',
    '- "requestedChanges" must contain ONLY changes that TRANSFORM the video. Anything',
    "  phrased as preserve / keep / maintain / retain / leave as is / don't change",
    '  belongs in "protectedElements" instead — or must be omitted entirely when it',
    '  does not fit that enum. Example: for "make it 9:16 but preserve the original',
    '  audio and my logo", WRONG is requestedChanges:["make it 9:16","preserve the',
    '  original audio and my logo"]; RIGHT is requestedChanges:["make it 9:16"] with',
    '  protectedElements:["original_audio","logo"].',
    '- Do not include any prose, explanation, or markdown fences — JSON only.',
    '',
    forcedSurface
      ? 'Context: the user explicitly opened the Video Editor surface.'
      : '',
    assets.length > 0
      ? `Context: attached video asset ids: ${JSON.stringify(assets)}.`
      : '',
    input.hasVideo ? 'Context: a video is attached to this turn.' : '',
    '',
    'User message:',
    JSON.stringify(String(input.message ?? '')),
  ]
    .filter(line => line !== '')
    .join('\n');
}

// ---------------------------------------------------------------------------
// JSON parsing / validation of the raw LLM output
// ---------------------------------------------------------------------------

/**
 * Parse the model's raw text into validated {@link VideoIntentCandidate}s.
 * Tolerates code fences / surrounding prose by extracting the first JSON object.
 * Any candidate with an out-of-set action or a non-finite confidence is dropped;
 * an unparseable response yields an empty list (→ clarification downstream).
 */
export function parseCandidates(raw: string): VideoIntentCandidate[] {
  const json = extractFirstJsonObject(raw);
  if (!json) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }

  const rawCandidates = (parsed as { candidates?: unknown })?.candidates;
  if (!Array.isArray(rawCandidates)) return [];

  const out: VideoIntentCandidate[] = [];
  for (const entry of rawCandidates) {
    const candidate = sanitizeCandidate(entry);
    if (candidate) out.push(candidate);
  }
  return out;
}

/** Validate one raw entry into a `VideoIntentCandidate`, or `null` if invalid. */
function sanitizeCandidate(entry: unknown): VideoIntentCandidate | null {
  if (!entry || typeof entry !== 'object') return null;
  const e = entry as Record<string, unknown>;

  if (!isVideoIntentAction(e.action)) return null;
  const confidence =
    typeof e.confidence === 'number' && Number.isFinite(e.confidence)
      ? e.confidence
      : null;
  if (confidence === null) return null;

  return {
    action: e.action,
    confidence,
    inputAssets: toStringArrayOrNull(e.inputAssets),
    targetPlatform: toStringOrNull(e.targetPlatform),
    targetAspectRatio: toStringOrNull(e.targetAspectRatio),
    targetDurationMs: toNumberOrNull(e.targetDurationMs),
    editingStyle: toStringOrNull(e.editingStyle),
    requestedChanges: toStringArrayOrNull(e.requestedChanges),
    protectedElements: toProtectedElementsOrNull(e.protectedElements),
    brandRequirements: toStringOrNull(e.brandRequirements),
    audioRequirements: toStringOrNull(e.audioRequirements),
    captionRequirements: toStringOrNull(e.captionRequirements),
    outputRequirements: toStringOrNull(e.outputRequirements),
    qualityRequirements: toStringOrNull(e.qualityRequirements),
  };
}

/** Extract the first balanced `{…}` JSON object substring from arbitrary text. */
function extractFirstJsonObject(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const start = raw.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toStringArrayOrNull(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out = value.filter(
    (v): v is string => typeof v === 'string' && v.trim().length > 0
  );
  return out;
}

function toProtectedElementsOrNull(value: unknown): ProtectedElement[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((v): v is ProtectedElement =>
    PROTECTED_ELEMENTS.includes(v as ProtectedElement)
  );
}

// ---------------------------------------------------------------------------
// Timeout helper (Req 2.1: classify within 5 s)
// ---------------------------------------------------------------------------

/**
 * Build an `AbortSignal` that fires when either the caller's `parent` signal
 * aborts or `ms` elapses, plus a `cancel` to clear the timer. The provider call
 * receives the combined signal so it is aborted at the ≤5 s budget.
 */
function withTimeout(
  parent: AbortSignal | undefined,
  ms: number
): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const onParentAbort = () => controller.abort((parent as any)?.reason);
  if (parent) {
    if (parent.aborted) controller.abort((parent as any).reason);
    else parent.addEventListener('abort', onParentAbort, { once: true });
  }
  const timer = setTimeout(
    () => controller.abort(new Error('intent-classification-timeout')),
    ms
  );
  const cancel = () => {
    clearTimeout(timer);
    parent?.removeEventListener('abort', onParentAbort);
  };
  return { signal: controller.signal, cancel };
}
