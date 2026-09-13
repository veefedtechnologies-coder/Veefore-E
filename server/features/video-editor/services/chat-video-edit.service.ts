/**
 * Chat-driven Video Editor turn driver (VeeGPT `video_editor` tool → server-side).
 *
 * This is the server-authoritative bridge that lets the NORMAL VeeGPT chat
 * composer drive a multi-turn video edit WITHOUT a separate editor chat surface.
 * Each time the model calls the `video_editor` tool for an already-ingested
 * project/source, the chat route invokes {@link runChatVideoEditTurn}, which runs
 * the SAME pipeline the `/converse` route runs — Intent_Router → new Version →
 * Editing_Planner — and then EXECUTES the edit server-side, streaming
 * stage-derived progress back into the chat via `onProgress`.
 *
 * It deliberately reuses the existing collaborators (no duplicated intent/plan
 * logic):
 *   - {@link getIntentRouterService} for classification (with the forced
 *     video-editor deterministic fallback, so a clear instruction always yields
 *     executable operations rather than a dead-end clarification),
 *   - {@link getEditingPlannerService} for the structured plan,
 *   - {@link versionManagerService} for the new immutable version per refinement,
 *   - {@link deterministicEditorService} to render a deterministic edit
 *     (trim/reframe/speed/fades/audio-normalize/re-encode) IN-PROCESS with the
 *     bundled `ffmpeg-static` + `ffprobe-static` binaries — no queue/Redis needed
 *     for the deterministic path, so it works end-to-end locally.
 *
 * Contract (matches the multi-turn design):
 *   - `clarification`  — the turn needs more input; the caller surfaces the
 *     reason as a normal assistant chat message. The user answers in the MAIN
 *     composer, which re-invokes the tool (multi-turn).
 *   - `rendered`       — a deterministic edit produced exactly one immutable
 *     artifact; the caller shows a playable/downloadable result card.
 *   - `needs_async`    — the edit requires the async generative/analysis pipeline
 *     (object/background removal, caption burn-in, silence removal, generation);
 *     surfaced honestly, never fabricated (No-Mock, Req 23).
 *   - `no_op` / `error` — nothing executable was derived, or a real failure.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';

import '../../../config/ffmpeg-paths';
import { logger as defaultLogger } from '../../../config/logger';
import { VideoSourceModel } from '../../../models/VideoEditor';
import {
  getIntentRouterService,
  type IntentRouterService,
} from './intent-router.service';
import {
  getEditingPlannerService,
  type EditingPlannerService,
} from './editing-planner.service';
import {
  versionManagerService,
  type VersionManagerService,
} from './version-manager.service';
import {
  deterministicEditorService,
  type DeterministicEditorService,
} from './deterministic-editor.service';
import type { DeterministicOperation, FilterLook } from './deterministic-editor.service';
import {
  audioEnvelopeService,
  type AudioEnvelopeService,
} from './audio-envelope.service';
import { computeAutoCutSegments, DEFAULT_MIN_SEGMENT_MS } from './auto-cut.logic';
import {
  computeHighlightSegments,
  DEFAULT_HIGHLIGHT_MIN_SEGMENT_MS,
  DEFAULT_HIGHLIGHT_TARGET_MS,
  type HighlightSpeechSpan,
} from './highlight-selection.logic';
import {
  captionRendererService,
  type CaptionRendererService,
} from './caption-renderer.service';
import {
  transcriptionService,
  TranscriptionError,
  type TranscriptionService,
} from './transcription.service';
import type { CaptionSegment } from './caption-layout.logic';
import {
  extractProvidedCaptionText,
  buildProvidedCaptionSegments,
} from './provided-caption.logic';
import {
  getArtifactRepository,
  type ArtifactRepository,
} from './artifact-repository.service';
import {
  getGenerativeVideoService,
  isGenerativeVideoConfigured,
  type GenerativeVideoService,
  type GenerativeVideoResult,
} from './generative-video.service';
import {
  getEditLocalizationService,
  type EditLocalizationService,
} from './edit-localization.service';
import { getGenerativeDailyBudget } from './generative-daily-budget';
import { VideoEditorTrace } from './video-editor-debug';
import type { LocalizationWindow } from './localization-window.logic';
import { parseEditRange } from './edit-range.logic';
import { DETERMINISTIC_ENGINE_ID } from './artifact-provenance.logic';
import { getStorageService, type IStorageService } from '../../storage/services/storage.service';
import { mongoVideoProjectStore, type VideoProjectStore } from '../api/project.routes';
import type { PlanOperation } from './editing-planner.logic';
import type { VideoIntent } from './intent-extraction.logic';
import {
  isReelPolishRequest,
  buildReelPolishIntent,
} from './intent-extraction.logic';
import {
  EXPORT_PROFILES,
  getPlatformPreset,
  getExportProfileForPreset,
} from '../config/video-editor.config';

const COMPONENT = 'videoEditor.ChatEditDriver';

/** A streamed progress phase (stage-derived, never timer-interpolated, Req 18.4). */
export type ChatEditPhase =
  | 'classifying'
  | 'versioning'
  | 'planning'
  | 'transcribing'
  | 'rendering'
  | 'complete'
  | 'clarification'
  | 'error';

/** One progress update streamed to the chat as a `videoEditorProgress` event. */
export interface ChatEditProgress {
  phase: ChatEditPhase;
  /** Short human-readable status line. */
  status: string;
  /** Integer percentage derived from completed stages (0..100). */
  percent: number;
  /**
   * The plan step summaries, emitted once planning completes.
   *
   * `limitation` is present only for a step the planner could NOT make
   * executable (`status: 'unavailable'`). It carries the planner's own reason so
   * the chat card can name honestly what was not done instead of silently
   * dropping the step or, worse, ticking it off as complete.
   */
  plan?: Array<{
    kind: string;
    type: string;
    status: string;
    label: string;
    limitation?: string;
  }>;
  /**
   * Index into the SAME `plan` array of the step currently being worked on.
   *
   * ONE SOURCE OF TRUTH for "where are we": the chat card derives BOTH its
   * checklist current-row highlight AND the narrative "Step N of M" counter it
   * overlays on the preview from this index, so the two surfaces cannot disagree
   * by construction. It is set immediately before an operation starts, carried
   * unchanged through that operation's re-emits (tick / honest-skip), advanced by
   * the next operation, and cleared on completion (nothing is being worked on).
   *
   * Absent means "no operation is executing yet" (preparing/classifying/
   * versioning/planning) or "the turn is over".
   */
  activeStepIndex?: number;
}

/**
 * One entry of the streamed plan checklist.
 *
 * `status` starts as the planner's own status (`executable` / `unavailable` /
 * `error`) and is flipped to `done` by the driver at the exact moment that
 * operation genuinely finishes and produced output. It is deliberately a plain
 * `string` (not the planner's status union) precisely so the executor can add the
 * `done` transition the client ticks on.
 */
type ChatEditPlanStep = NonNullable<ChatEditProgress['plan']>[number];

/** The resolved analyzed source the turn edits against. */
interface EditableSource {
  sourceId: string;
  storageKey: string;
  fileName: string;
  durationMs: number;
}

/** Input to {@link runChatVideoEditTurn}. */
export interface RunChatVideoEditInput {
  projectId: string;
  workspaceId: string;
  userId: string;
  /** The user's edit instruction (the current chat message / tool arg). */
  message: string;
  /** The source the turn should edit; when omitted, the newest analyzed source is reused. */
  sourceId?: string | null;
  /** Workspace AI model preference; forwarded to the intent/plan LLM calls. */
  aiModel?: string;
  /**
   * The workspace's OWN Google AI Studio key, forwarded to the GENERATIVE video
   * calls (Omni edits / Veo generation) exactly as the image capability does.
   *
   * Why this matters: Google enforces its generative-video quota
   * (`generate_requests_per_model_per_day`) per API KEY, not per end user. With
   * only the shared server key, one heavy workspace exhausts the whole app's
   * daily pool and every other tenant is refused. Forwarding the workspace key
   * gives that workspace its own quota. Optional — when absent the service falls
   * back to the shared env key exactly as before.
   */
  apiKey?: string;
  /** Streams stage-derived progress into the chat. */
  onProgress?: (progress: ChatEditProgress) => void;
}

/** The outcome of a chat-driven edit turn. */
export type ChatVideoEditResult =
  | {
      outcome: 'rendered';
      versionId: string;
      artifactId: string;
      kind: string;
      durationMs: number;
      summary: string;
    }
  | { outcome: 'clarification'; message: string }
  | { outcome: 'needs_async'; kind: string; message: string }
  | { outcome: 'no_op'; message: string }
  | { outcome: 'error'; message: string };

/** Injectable collaborators (defaulted for production, overridable in tests). */
export interface ChatVideoEditDeps {
  store?: VideoProjectStore;
  intentRouter?: Pick<IntentRouterService, 'classify'>;
  planner?: Pick<EditingPlannerService, 'plan'>;
  versionManager?: Pick<VersionManagerService, 'createVersion'>;
  deterministicEditor?: Pick<DeterministicEditorService, 'execute' | 'executeAssembly'>;
  /** Real audio energy-envelope extraction for auto-cut (No-Mock, Req 23). */
  audioEnvelope?: Pick<AudioEnvelopeService, 'extractEnvelope'>;
  /** Real speech-to-text for caption burn-in (No-Mock, Req 23). */
  transcriber?: Pick<TranscriptionService, 'transcribeSource'>;
  /** Deterministic caption burn-in (reused; never reimplemented). */
  captionRenderer?: Pick<CaptionRendererService, 'renderCaptions'>;
  /** Storage backend (reads source bytes for the caption burn-in). */
  storage?: IStorageService;
  /** Artifact repository (persists the single caption-render artifact). */
  artifactRepository?: Pick<ArtifactRepository, 'createArtifact'>;
  /**
   * GENERATIVE video capability (Track 3, Google): Omni Flash edits of the
   * current artifact + Veo generation. Defaults to the shared singleton. When
   * absent/un-configured, generative ops degrade honestly (No-Mock, Req 23).
   */
  generativeVideo?: Pick<GenerativeVideoService, 'editVideo' | 'generateVideo'>;
  /**
   * Cheap LOCALIZATION pre-pass (Track 3): turns a GLOBAL edit-type generative
   * request (no explicit user range) into ≤N clean time windows so only the
   * detected regions pass through Omni. Defaults to the shared singleton. On any
   * uncertainty it honestly degrades to the whole-clip fallback (No-Mock, Req 23).
   */
  editLocalizer?: Pick<EditLocalizationService, 'localize'>;
  /**
   * Per-WORKSPACE DAILY BUDGET for generative (Google Omni/Veo) provider calls.
   * The server shares ONE Google key and Google meters its daily generate-request
   * quota PER KEY, so this secondary guardrail stops a single workspace burning
   * the shared pool. Defaults to the shared singleton and is DISABLED unless
   * `VIDEO_EDITOR_GENERATIVE_DAILY_LIMIT_PER_WORKSPACE` is set. It fails OPEN, so
   * a Redis outage never blocks an edit.
   *
   * ACCOUNTING NOTE: one consume happens per requested generative OPERATION (per
   * `gop`), which is what the user asked for and what they see in chat. A
   * localized-windows splice fans a single operation out into N inner Omni calls;
   * those are deliberately NOT counted individually so the user-visible budget
   * stays predictable (N is an internal optimization the user never chose).
   */
  generativeBudget?: {
    tryConsume: (workspaceId: string) => Promise<{
      allowed: boolean;
      limit: number;
      used: number;
      resetsInMs: number;
    }>;
  };
  /** Resolve the source to edit (newest analyzed source by default). */
  getSourceForEdit?: (projectId: string, sourceId?: string | null) => Promise<EditableSource | null>;
  /**
   * Resolve ALL usable analyzed sources for the project (oldest → newest), used
   * by the multi-clip assembly pre-step. Defaults to {@link defaultGetAllSourcesForEdit}.
   */
  getAllSourcesForEdit?: (projectId: string) => Promise<EditableSource[]>;
  logger?: Pick<typeof defaultLogger, 'info' | 'warn' | 'error' | 'debug'>;
  generateTimelineId?: () => string;
  generateJobId?: () => string;
}

// ---------------------------------------------------------------------------
// Default IO
// ---------------------------------------------------------------------------

/** Newest analyzed source (`durationMs > 0`) for the project, or a named one. */
async function defaultGetSourceForEdit(
  projectId: string,
  sourceId?: string | null,
): Promise<EditableSource | null> {
  const query = sourceId ? { projectId, sourceId } : { projectId };
  const source = await VideoSourceModel.findOne(query).sort({ createdAt: -1 }).lean();
  if (!source) return null;
  const s = source as Record<string, unknown>;
  const storageKey = typeof s.storageKey === 'string' ? s.storageKey : '';
  const resolvedId = typeof s.sourceId === 'string' ? s.sourceId : '';
  const durationMs = typeof s.durationMs === 'number' ? s.durationMs : 0;
  if (!storageKey || !resolvedId || durationMs <= 0) return null;
  const container = typeof s.container === 'string' ? s.container : 'mp4';
  return { sourceId: resolvedId, storageKey, fileName: `${resolvedId}.${container}`, durationMs };
}

/**
 * ALL usable analyzed sources for the project, oldest → newest (`createdAt` ASC),
 * for multi-clip assembly. Only rows with a valid `storageKey` and `durationMs > 0`
 * are kept, so an unusable/half-ingested source can never enter the stitch. The
 * ASC order makes the assembled timeline follow upload order (the intuitive
 * "stitch them in the order I added them"). Sources may have been ingested over
 * one OR multiple chat turns — this resolves them regardless.
 */
async function defaultGetAllSourcesForEdit(projectId: string): Promise<EditableSource[]> {
  const rows = await VideoSourceModel.find({ projectId }).sort({ createdAt: 1 }).lean();
  const out: EditableSource[] = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const s = row as Record<string, unknown>;
    const storageKey = typeof s.storageKey === 'string' ? s.storageKey : '';
    const resolvedId = typeof s.sourceId === 'string' ? s.sourceId : '';
    const durationMs = typeof s.durationMs === 'number' ? s.durationMs : 0;
    if (!storageKey || !resolvedId || durationMs <= 0) continue;
    const container = typeof s.container === 'string' ? s.container : 'mp4';
    out.push({ sourceId: resolvedId, storageKey, fileName: `${resolvedId}.${container}`, durationMs });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Plan-operation → deterministic-operation mapping
// ---------------------------------------------------------------------------

/** Canonical output dimensions for an aspect ratio (reuses config profiles). */
function dimensionsForAspect(aspectRatio: string): { width: number; height: number } | null {
  switch (aspectRatio) {
    case '9:16':
      return { width: EXPORT_PROFILES.vertical_1080p.width, height: EXPORT_PROFILES.vertical_1080p.height };
    case '16:9':
      return { width: EXPORT_PROFILES.landscape_1080p.width, height: EXPORT_PROFILES.landscape_1080p.height };
    case '1:1':
      return { width: EXPORT_PROFILES.square_1080p.width, height: EXPORT_PROFILES.square_1080p.height };
    case '4:5':
      return { width: 1080, height: 1350 };
    default: {
      const m = /^(\d+):(\d+)$/.exec(aspectRatio);
      if (!m) return null;
      const w = Number(m[1]);
      const h = Number(m[2]);
      if (!w || !h) return null;
      // Normalise to a 1080-wide (portrait/square) or 1080-tall (landscape) box.
      if (h >= w) return { width: 1080, height: Math.round((1080 * h) / w) };
      return { width: Math.round((1080 * w) / h), height: 1080 };
    }
  }
}

/** Parse an explicit speed factor from the instruction, or a sensible default. */
function speedFactorFrom(message: string): number {
  const text = message.toLowerCase();
  const explicit = /(\d+(?:\.\d+)?)\s*x\b/.exec(text);
  if (explicit) {
    const f = Number(explicit[1]);
    if (Number.isFinite(f) && f > 0) return f;
  }
  if (/\b(double|twice)\b/.test(text)) return 2;
  if (/\b(half|halve)\b/.test(text)) return 0.5;
  if (/\b(slow\s*mo|slowmo|slow\s*down|slower)\b/.test(text)) return 0.5;
  if (/\b(speed\s*up|faster|fast\s*forward|timelapse|time-?lapse)\b/.test(text)) return 2;
  return 1.5;
}

/**
 * Pick the named colour/look grade from the instruction text. Recognises the
 * common look words; defaults to `cinematic` when only a generic "filter",
 * "colour grade", or "premium look" was requested — matching the deterministic
 * engine's default premium look.
 */
function filterLookFrom(message: string): FilterLook {
  const t = (typeof message === 'string' ? message : '').toLowerCase();
  if (/\b(black\s*and\s*white|b\s*&\s*w|b\/w|gr[ae]yscale|monochrome|mono|noir)\b/.test(t)) {
    return 'bw';
  }
  if (/\b(vintage|retro|old\s*film|nostalgic?|faded)\b/.test(t)) return 'vintage';
  if (/\b(vivid|vibrant|punchy|saturated|pop)\b/.test(t)) return 'vivid';
  if (/\b(warm|golden|sunny|orange\s*tone)\b/.test(t)) return 'warm';
  if (/\b(cool|cold|blue\s*tone|teal)\b/.test(t)) return 'cool';
  // "cinematic", "film look", generic "filter"/"colour grade"/"premium look".
  return 'cinematic';
}

/** The result of mapping a plan operation onto a deterministic operation. */
type MappedOperation =
  | { ok: true; operation: DeterministicOperation }
  | { ok: false; reason: string };

/**
 * Map an executable deterministic {@link PlanOperation} to a concrete
 * {@link DeterministicOperation} with fully-specified params. Kinds that need the
 * async analysis/render pipeline (caption burn-in, silence removal that depends
 * on analysis segments) or params the plan cannot supply are returned as `ok:false`.
 */
function mapPlanOperation(
  op: PlanOperation,
  intent: VideoIntent,
  message: string,
  sourceDurationMs: number,
): MappedOperation {
  switch (op.kind) {
    case 'trim':
    case 'cut': {
      // Honour the planner's computed range; guard against a full-length no-op.
      const startMs = Math.max(0, op.range.startMs);
      const endMs = Math.min(op.range.endMs, sourceDurationMs);
      if (!(endMs > startMs)) return { ok: false, reason: 'no valid trim range' };
      return { ok: true, operation: { kind: 'trim', params: { startMs, endMs } } };
    }
    case 'aspect':
    case 'resize': {
      const aspectRatio = intent.targetAspectRatio ?? '9:16';
      if (!/^\d+:\d+$/.test(aspectRatio)) return { ok: false, reason: 'no target aspect ratio' };
      const dims = dimensionsForAspect(aspectRatio);
      if (!dims) return { ok: false, reason: `unsupported aspect ratio ${aspectRatio}` };
      return {
        ok: true,
        operation: {
          kind: 'aspect',
          params: { aspectRatio, width: dims.width, height: dims.height, mode: 'pad' },
        },
      };
    }
    case 'speed': {
      const factor = speedFactorFrom(message);
      return { ok: true, operation: { kind: 'speed', params: { factor } } };
    }
    case 'fades': {
      return {
        ok: true,
        operation: {
          kind: 'fades',
          params: { fadeInMs: 500, fadeOutMs: 500, totalDurationMs: sourceDurationMs },
        },
      };
    }
    case 'audio_process':
      return { ok: true, operation: { kind: 'audio_normalize', params: {} } };
    case 'filter':
    case 'color_grade': {
      const look = filterLookFrom(message);
      return { ok: true, operation: { kind: 'filter', params: { look } } };
    }
    case 'caption':
      return {
        ok: false,
        reason:
          'caption burn-in needs a speech-to-text transcription pass (word/segment timings) before the deterministic burn-in can run',
      };
    case 'remove_silence':
      return { ok: false, reason: 'silence removal needs an audio analysis pass' };
    case 'auto_cut':
      // Auto-cut needs a pre-pass (audio energy-envelope extraction + pure
      // segmentation) that mapPlanOperation cannot do synchronously, so it is
      // handled as a dedicated IO step in the driver (like caption burn-in),
      // never mapped here.
      return { ok: false, reason: 'auto-cut needs an audio energy-envelope analysis pass' };
    case 'highlight':
      // Highlight selection ("editorial brain") needs a deferred analysis pass
      // (audio energy-envelope extraction + speech transcription + pure
      // scoring), so — like auto_cut and caption burn-in — it is handled as a
      // dedicated IO step in the driver, never mapped here.
      return { ok: false, reason: 'highlight selection needs an audio + speech analysis pass' };
    default:
      return { ok: false, reason: `no in-process deterministic engine for "${op.kind}"` };
  }
}

/**
 * Whether the instruction asks for a dynamic "punch-in" auto-cut (a subtle
 * centred zoom per montage). Recognises "punch in", "zoom", and "dynamic".
 * Defaults to off, so a plain "cut to the beat" produces a clean concat montage.
 */
function autoCutWantsPunchIn(message: string): boolean {
  const t = (typeof message === 'string' ? message : '').toLowerCase();
  return /\b(punch\s*-?\s*in|zoom(?:\s*in)?|dynamic)\b/.test(t);
}

/** Spelled-out small numbers the duration parser understands ("one minute"). */
const SPELLED_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  ninety: 90,
};

/**
 * Resolve the target highlight duration in milliseconds. Prefers an explicit
 * `intent.targetDurationMs`, else parses the message (e.g. "30 seconds", "cut to
 * 15s", "one minute", "make it a 45 second reel"), else falls back to
 * {@link DEFAULT_HIGHLIGHT_TARGET_MS}. Always clamped to `(0, sourceDurationMs]`
 * so it can never exceed the clip. Pure and deterministic.
 */
function highlightTargetMsFrom(
  message: string,
  intent: VideoIntent,
  sourceDurationMs: number,
): number {
  const clampToSource = (ms: number): number =>
    Math.max(1, Math.min(ms, isFinitePositive(sourceDurationMs) ? sourceDurationMs : ms));

  if (isFinitePositive(intent.targetDurationMs)) {
    return clampToSource(intent.targetDurationMs as number);
  }

  const t = (typeof message === 'string' ? message : '').toLowerCase();

  // Numeric "<n> second(s)/sec/s" or "<n> minute(s)/min".
  const numMatch = /(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m)\b/.exec(t);
  if (numMatch) {
    const value = Number(numMatch[1]);
    if (Number.isFinite(value) && value > 0) {
      const isMinutes = /^m/.test(numMatch[2]);
      return clampToSource(Math.round(value * (isMinutes ? 60000 : 1000)));
    }
  }

  // Spelled-out "<word> second(s)/minute(s)".
  const wordMatch = /\b(one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty|fifty|sixty|ninety)\s+(seconds?|secs?|minutes?|mins?)\b/.exec(
    t,
  );
  if (wordMatch) {
    const value = SPELLED_NUMBERS[wordMatch[1]];
    if (value) {
      const isMinutes = /^min/.test(wordMatch[2]);
      return clampToSource(Math.round(value * (isMinutes ? 60000 : 1000)));
    }
  }

  return clampToSource(DEFAULT_HIGHLIGHT_TARGET_MS);
}

/** Local finite-positive check (mirrors the pure logic guards). */
function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

// ---------------------------------------------------------------------------
// CHEAP viability pre-checks (run BEFORE any expensive analysis pass)
// ---------------------------------------------------------------------------

/**
 * Tolerance (ms) when comparing a highlight target against the source duration.
 * A target within this much of the whole clip cannot produce a meaningfully
 * shorter cut, so it counts as "covers the whole clip".
 */
const HIGHLIGHT_TARGET_EPSILON_MS = 250;

/**
 * Floor below which highlight SELECTION cannot say anything: a clip must be able
 * to hold at least two minimum-length kept segments for "keep the best moments"
 * to differ from "keep the whole clip".
 */
const MIN_HIGHLIGHT_SOURCE_MS = DEFAULT_HIGHLIGHT_MIN_SEGMENT_MS * 2;

/**
 * Why the highlight pass cannot change anything, decided from DURATIONS ALONE —
 * or `null` when the pass is worth running.
 *
 * WHY THIS EXISTS: the highlight step used to extract the full audio energy
 * envelope AND run a complete speech transcription (~148s on a 10.5-second clip
 * in one recorded trace) before `computeHighlightSegments` returned the honest
 * whole-clip result and the step was skipped. Both facts that made the skip
 * inevitable — the resolved target already covering the clip, and the clip being
 * too short to hold two kept segments — are known from the durations, so they are
 * checked FIRST and cost nothing.
 *
 * Mirrors the pure logic's own degrade conditions (`computeHighlightSegments`
 * clamps the target to the source duration and returns the whole clip when
 * `durationMs <= target`), so this never skips a pass that would have produced a
 * real cut. PURE and TOTAL.
 */
function highlightPreSkipReason(
  sourceDurationMs: number,
  targetDurationMs: number,
): 'target_covers_whole_clip' | 'source_too_short' | null {
  if (!isFinitePositive(sourceDurationMs)) return 'source_too_short';
  if (sourceDurationMs < MIN_HIGHLIGHT_SOURCE_MS) return 'source_too_short';
  if (
    isFinitePositive(targetDurationMs) &&
    targetDurationMs >= sourceDurationMs - HIGHLIGHT_TARGET_EPSILON_MS
  ) {
    return 'target_covers_whole_clip';
  }
  return null;
}

/**
 * Whether the clip is too short for auto-cut to place ANY interior cut, decided
 * from the duration alone. `computeAutoCutSegments` returns the honest whole clip
 * when `durationMs < minSegmentMs * 2` (a boundary must leave a full minimum
 * segment of runway on both sides), so extracting an envelope first is pure
 * waste. PURE and TOTAL.
 */
function autoCutSourceTooShort(sourceDurationMs: number): boolean {
  if (!isFinitePositive(sourceDurationMs)) return true;
  return sourceDurationMs < DEFAULT_MIN_SEGMENT_MS * 2;
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

/**
 * Humanise a raw internal operation kind as a LAST RESORT.
 *
 * `PlanOperation.kind` is a plain string (the planner derives it from free text),
 * so `operationLabel` can never be exhaustively typed. This keeps an unmapped
 * kind from leaking a snake_case internal identifier into the chat card:
 * `deterministic_edit` → `Deterministic edit`.
 */
function humaniseOperationKind(kind: string): string {
  const words = (kind || '').replace(/[_-]+/g, ' ').trim();
  if (!words) return 'Edit the video';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Human label for a plan operation (for the streamed plan summary + result). */
function operationLabel(op: PlanOperation): string {
  switch (op.kind) {
    case 'trim':
    case 'cut':
      return 'Trim the clip';
    case 'aspect':
      return 'Reframe the aspect ratio';
    case 'crop':
      return 'Crop the frame';
    case 'resize':
      return 'Resize the frame';
    case 'rotate':
      return 'Rotate the frame';
    case 'speed':
      return 'Adjust playback speed';
    case 'fades':
      return 'Add fades';
    case 'filter':
    case 'color_grade':
      return 'Apply a colour grade';
    case 'audio_process':
      return 'Enhance the audio';
    case 'caption':
      return 'Add captions';
    case 'remove_silence':
      return 'Remove silence';
    case 'auto_cut':
      return 'Auto-cut to the beat';
    case 'highlight':
      return 'Pick the best moments';
    case 'concat':
      return 'Stitch the clips together';
    case 'object_removal':
      return 'Remove the object (AI)';
    case 'background_replace':
      return 'Replace the background (AI)';
    case 'generate':
    case 'generate_broll':
      return 'Generate footage (AI)';
    case 'generative_edit':
      return 'AI edit';
    case 'analysis':
      return 'Analyse the video';
    case 'encode':
      return 'Re-encode the file';
    case 'deterministic_edit':
      return 'Edit the video';
    // The planner emits this when NO engine can perform the requested change
    // (`editing-planner.logic.ts` → status 'unavailable' + a `limitation`).
    // It must read as a human sentence, never as the raw `unsupported` token.
    case 'unsupported':
      return 'Not something we can do yet';
    case 'render':
      return 'Render the result';
    default:
      // NEVER return `op.kind` raw — see humaniseOperationKind.
      return humaniseOperationKind(op.kind);
  }
}

/**
 * Reorder the planner's operations into the ORDER THEY ACTUALLY EXECUTE.
 *
 * WHY THIS EXISTS: the streamed checklist AND the overlay "Step N of M" counter
 * are both derived from the `planSummary` array's order/index. The executor,
 * however, runs ops in a FIXED chain that differs from the planner's emitted
 * order: assembly (concat) → pixel/timeline ops → generative ops → highlight →
 * auto-cut → captions (captions ALWAYS last, on top of the final frames). When
 * the planner emitted, say, `caption` first, the counter jumped (the filter
 * showed "Step 2 of 2" then the caption dropped to "Step 1 of 2"), which the user
 * saw as "it starts at step 2". Building `planSummary` from THIS ordering makes
 * the counter increment monotonically 1→N in the order ops truly run.
 *
 * This changes ONLY the ORDER of the summary array (and its identity→index map),
 * never WHICH ops execute — the execution partition/logic below is untouched and
 * still reads from the original `operations` list.
 *
 * Honesty preserved: the result is a PERMUTATION of `operations` (same objects,
 * same length). Every op the checklist shows today still appears. Ops that never
 * run (render/analysis, planner-`unavailable` steps, and duplicate/redundant ops
 * the executor drops) are appended AFTER the executable chain, in planner order,
 * so they remain visible while keeping the counter monotonic for the ops that DO
 * run. Within each executable group planner order is preserved, matching how the
 * executor iterates (e.g. `mappedPixelOps` keeps planner order).
 */
function orderOperationsForExecution(operations: PlanOperation[]): PlanOperation[] {
  const isExecutableDeterministic = (op: PlanOperation): boolean =>
    op.status === 'executable' && op.type === 'deterministic';

  const concat = operations.filter((op) => isExecutableDeterministic(op) && op.kind === 'concat');
  const pixel = operations.filter(
    (op) =>
      isExecutableDeterministic(op) &&
      op.kind !== 'concat' &&
      op.kind !== 'caption' &&
      op.kind !== 'auto_cut' &&
      op.kind !== 'highlight',
  );
  const generative = operations.filter(
    (op) => op.status === 'executable' && op.type === 'generative',
  );
  const highlight = operations.filter(
    (op) => isExecutableDeterministic(op) && op.kind === 'highlight',
  );
  const autoCut = operations.filter(
    (op) => isExecutableDeterministic(op) && op.kind === 'auto_cut',
  );
  const caption = operations.filter(
    (op) => isExecutableDeterministic(op) && op.kind === 'caption',
  );

  const ordered = [...concat, ...pixel, ...generative, ...highlight, ...autoCut, ...caption];
  const seen = new Set<PlanOperation>(ordered);
  // Everything the executable chain did not claim (render/analysis, unavailable,
  // unknown types) trails in the planner's original order.
  const rest = operations.filter((op) => !seen.has(op));
  return [...ordered, ...rest];
}

/** Generative plan kinds that GENERATE a brand-new clip (vs. edit an existing one). */
function isGenerateKind(kind: string): boolean {
  return kind === 'generate' || kind === 'generate_broll';
}

/**
 * The instruction/prompt text for a generative op. The planner carries the
 * requested-change text on `op.params.source`; fall back to the raw chat message
 * so a real instruction is always sent to the provider.
 */
function generativeInstruction(op: PlanOperation, message: string): string {
  const src = (op.params as Record<string, unknown> | undefined)?.source;
  if (typeof src === 'string' && src.trim().length > 0) return src.trim();
  return message;
}

/**
 * Human, rounded-up phrasing for a reset window ("about 3 hours"), used by the
 * per-workspace generative daily-budget message. Mirrors the voice of
 * `formatProviderRetryAfter()` in `generative-video.service.ts`, which parses a
 * provider string; here we already have a millisecond duration, so the formatting
 * is done locally. Returns '' when the duration is unusable, so the caller can
 * omit the clause entirely rather than print something wrong.
 */
function formatResetWindow(resetsInMs: number): string {
  if (!Number.isFinite(resetsInMs) || resetsInMs <= 0) return '';
  const minutes = Math.ceil(resetsInMs / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

/** Format a millisecond offset as a compact `M:SS` timestamp for user labels. */
function formatTimestamp(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Caption burn-in (transcribe → deterministic caption render, IN-PROCESS)
// ---------------------------------------------------------------------------

/** Fallback preset keys per aspect ratio when no explicit platform is set. */
const CAPTION_PRESET_BY_ASPECT: Record<string, string> = {
  '16:9': 'youtube_landscape',
  '1:1': 'linkedin',
  '9:16': 'instagram_reel',
};

/**
 * Choose the Platform_Preset used for caption layout/placement. Prefers an
 * explicit, known platform (intent → project); otherwise maps the target aspect
 * ratio to a sensible short-form/landscape preset; finally defaults to a vertical
 * short-form preset. The preset drives safe-area placement, wrapping, and
 * caption behaviour in the pure layout core.
 */
function captionPresetKey(intent: VideoIntent, projectPlatform: string | null | undefined): string {
  const explicit = intent.targetPlatform ?? projectPlatform ?? null;
  if (explicit && getPlatformPreset(explicit)) return explicit;
  const aspect = intent.targetAspectRatio ?? '';
  if (CAPTION_PRESET_BY_ASPECT[aspect] && getPlatformPreset(CAPTION_PRESET_BY_ASPECT[aspect])) {
    return CAPTION_PRESET_BY_ASPECT[aspect];
  }
  return 'instagram_reel';
}

/**
 * Choose the ANIMATED caption STYLE preset from the user's instruction. Hints a
 * clean/minimal look → `clean_minimal`; a karaoke look → `karaoke_box`; anything
 * else (including explicit "bold"/"big captions") → the default `bold_pop`
 * (CapCut/Hormozi style).
 */
function captionAssPresetKey(message: string): string {
  const t = (typeof message === 'string' ? message : '').toLowerCase();
  if (/\b(karaoke)\b/.test(t)) return 'karaoke_box';
  if (/\b(minimal|clean|simple|subtle|understated)\b/.test(t)) return 'clean_minimal';
  // "bold", "big captions", "hormozi", "pop", "captions" → the default bold look.
  return 'bold_pop';
}

/** Output frame dimensions for a preset (from its export profile). */
function captionDimensions(presetKey: string): { width: number; height: number } {
  const profile = getExportProfileForPreset(presetKey);
  if (profile && profile.width > 0 && profile.height > 0) {
    return { width: profile.width, height: profile.height };
  }
  // Deterministic vertical fallback (matches the default preset's profile).
  return { width: EXPORT_PROFILES.vertical_1080p.width, height: EXPORT_PROFILES.vertical_1080p.height };
}

/** Collaborators + identity needed to burn captions and persist the artifact. */
interface CaptionRenderContext {
  captionRenderer: Pick<CaptionRendererService, 'renderCaptions'>;
  storage: IStorageService;
  artifactRepository: Pick<ArtifactRepository, 'createArtifact'>;
  log: NonNullable<ChatVideoEditDeps['logger']>;
  tempDir: string;
  source: EditableSource;
  segments: readonly CaptionSegment[];
  presetKey: string;
  /** Animated-caption style preset key (`bold_pop` default). */
  assPresetKey: string;
  dimensions: { width: number; height: number };
  projectId: string;
  workspaceId: string;
  userId: string;
  jobId: string;
  inputVersionId: string;
}

/**
 * Burn the transcribed captions into the source video IN-PROCESS with the reused
 * {@link CaptionRendererService}, then persist EXACTLY ONE traceable artifact —
 * mirroring the deterministic-editor artifact contract (deterministic provenance,
 * cost 0, linked to the job). Temp files are always cleaned up. Returns the
 * created artifact id.
 */
async function renderAndPersistCaptions(ctx: CaptionRenderContext): Promise<string> {
  const workId = randomUUID();
  const workDir = path.join(ctx.tempDir, workId);
  const inExt = path.extname(ctx.source.fileName) || '.mp4';
  const inputPath = path.join(workDir, `input${inExt}`);
  const outputPath = path.join(workDir, 'output.mp4');

  try {
    await fs.promises.mkdir(workDir, { recursive: true });

    // Read the immutable source bytes into a temp input file (never modified).
    const dl = await ctx.storage.downloadFile(ctx.source.storageKey);
    await fs.promises.writeFile(inputPath, dl.buffer);

    // PROFESSIONAL ANIMATED word-level caption burn-in (ASS + libass), reusing
    // the shared Caption_Renderer. `animated: true` selects the animated path;
    // the renderer transparently falls back to the static drawtext burn-in when
    // the bundled ffmpeg lacks libass (never silently dropping captions).
    await ctx.captionRenderer.renderCaptions({
      segments: ctx.segments,
      presetKey: ctx.presetKey,
      inputPath,
      outputPath,
      dimensions: ctx.dimensions,
      animated: true,
      assPresetKey: ctx.assPresetKey,
    });

    const stat = await fs.promises.stat(outputPath).catch(() => null);
    if (!stat || !stat.isFile() || stat.size <= 0) {
      throw new Error('Caption burn-in produced no output file');
    }
    const outBuffer = await fs.promises.readFile(outputPath);

    const created = await ctx.artifactRepository.createArtifact({
      projectId: ctx.projectId,
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      category: 'renders',
      buffer: outBuffer,
      originalName: `caption-${workId}.mp4`,
      mimeType: 'video/mp4',
      deterministic: true,
      provenance: {
        jobId: ctx.jobId,
        inputVersionId: ctx.inputVersionId,
        provider: DETERMINISTIC_ENGINE_ID,
        model: DETERMINISTIC_ENGINE_ID,
        prompt: `captions (${ctx.presetKey}, ${ctx.segments.length} cue(s))`,
        costCredits: 0,
      },
    });

    return created.artifact.artifactId;
  } finally {
    await fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => {
      ctx.log?.warn?.('Failed to clean up caption render temp dir', {
        component: COMPONENT,
        workDir,
      });
    });
  }
}

// ---------------------------------------------------------------------------
// Localized generative edit (localizer windows → segment-scoped splice)
// ---------------------------------------------------------------------------

/**
 * Collaborators + chained identity needed to run the localized generative edit.
 * Everything is passed in from the turn driver so this helper reuses the EXACT
 * same primitives the explicit-segment branch uses (`editor.execute` trim,
 * `generativeVideo.editVideo` Omni, `editor.executeAssembly` concat) — no new
 * render/trim/ingestion/splice logic is introduced (Req 7.4).
 */
interface LocalizedWindowsContext {
  editor: Pick<DeterministicEditorService, 'execute' | 'executeAssembly'>;
  generativeVideo: Pick<GenerativeVideoService, 'editVideo'>;
  projectId: string;
  workspaceId: string;
  userId: string;
  /** Job id used for the generative `editVideo` calls (provenance grouping). */
  jobId: string;
  /** Fresh job id per deterministic trim / assembly step. */
  generateJobId: () => string;
  inputVersionId: string;
  /** The CURRENT chained artifact the windows are scoped against. */
  currentStorageKey: string;
  currentFileName: string;
  /** Effective working duration (ms) of the current artifact. */
  effectiveDurationMs: number;
  /** The edit instruction sent to Omni for each window. */
  instruction: string;
  /** Plan kind (e.g. `object_removal`) used for provenance/labelling. */
  kind: string;
  /** Workspace's own Google key for the Omni calls (per-workspace quota). */
  apiKey?: string;
  /** Target aspect ratio, if any, for the splice concat dimensions. */
  targetAspectRatio: string | null | undefined;
  /** Streams generative-model progress into the chat. */
  onGenProgress: (phase: unknown, status: string) => void;
  /** Streams an honest one-line note into the chat. */
  onNote?: (status: string) => void;
  log: NonNullable<ChatVideoEditDeps['logger']>;
}

/**
 * Run the LOCALIZED generative edit: the resolver has already produced sorted,
 * non-overlapping, clamped windows (capped at ≤maxWindows). This walks them with
 * a `cursor` from 0, composing the original timeline as
 * `head + [edited window]* + gap tails + final tail` where:
 *   - head/gap/tail pieces are UNEDITED trims (`editor.execute({ kind: 'trim' })`),
 *   - each window piece is `trim → generativeVideo.editVideo(Omni, instruction)`.
 *
 * No-Mock (Req 6.5): if ANY window's `editVideo` does not return `rendered`, the
 * localized splice is abandoned and the whole current artifact is sent to Omni in
 * a single edit (an honest note is streamed) — a partial/fabricated splice is
 * never produced. When the piece list collapses to a single edited piece covering
 * the whole clip, that edited result is used directly (same short-circuit as the
 * explicit-segment branch). Otherwise the pieces are concatenated with the
 * EXISTING `editor.executeAssembly` and wrapped as a `rendered` result.
 *
 * Returns the `GenerativeVideoResult` for the chain plus the `appliedLabelOverride`
 * (`AI edit (localized: <k> window(s): <ranges>)`), or `null` label on fallback.
 */
async function runLocalizedWindows(
  windows: readonly LocalizationWindow[],
  ctx: LocalizedWindowsContext,
): Promise<{ result: GenerativeVideoResult; labelOverride: string | null }> {
  // Fall back honestly to the whole current artifact (single Omni edit).
  const wholeClipFallback = async (
    note: string,
  ): Promise<{ result: GenerativeVideoResult; labelOverride: string | null }> => {
    ctx.onNote?.(note);
    const result = await ctx.generativeVideo.editVideo({
      projectId: ctx.projectId,
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      jobId: ctx.jobId,
      inputVersionId: ctx.inputVersionId,
      sourceStorageKey: ctx.currentStorageKey,
      sourceFileName: ctx.currentFileName,
      instruction: ctx.instruction,
      kind: ctx.kind,
      apiKey: ctx.apiKey,
      onProgress: ctx.onGenProgress,
    });
    return { result, labelOverride: null };
  };

  // Defensive: the resolver guarantees ≥1 window, but never splice nothing.
  if (windows.length === 0) {
    return wholeClipFallback('Couldn\u2019t pin down a specific range \u2014 editing the whole clip.');
  }

  const pieces: Array<{ storageKey: string; fileName: string }> = [];
  const editedResults: Array<Extract<GenerativeVideoResult, { outcome: 'rendered' }>> = [];
  let cursor = 0;

  for (const w of windows) {
    // head / gap trim piece — the UNEDITED footage before this window.
    if (cursor < w.startMs) {
      const gap = await ctx.editor.execute({
        projectId: ctx.projectId,
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        jobId: ctx.generateJobId(),
        inputVersionId: ctx.inputVersionId,
        sourceStorageKey: ctx.currentStorageKey,
        sourceFileName: ctx.currentFileName,
        operation: { kind: 'trim', params: { startMs: cursor, endMs: w.startMs } },
      });
      pieces.push({ storageKey: gap.storageKey, fileName: `${gap.artifact.artifactId}.mp4` });
    }

    // edited window piece — trim just this window, then send it to Omni.
    const segment = await ctx.editor.execute({
      projectId: ctx.projectId,
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      jobId: ctx.generateJobId(),
      inputVersionId: ctx.inputVersionId,
      sourceStorageKey: ctx.currentStorageKey,
      sourceFileName: ctx.currentFileName,
      operation: { kind: 'trim', params: { startMs: w.startMs, endMs: w.endMs } },
    });
    const edited = await ctx.generativeVideo.editVideo({
      projectId: ctx.projectId,
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      jobId: ctx.jobId,
      inputVersionId: ctx.inputVersionId,
      sourceStorageKey: segment.storageKey,
      sourceFileName: `${segment.artifact.artifactId}.mp4`,
      instruction: ctx.instruction,
      kind: ctx.kind,
      apiKey: ctx.apiKey,
      onProgress: ctx.onGenProgress,
    });
    if (edited.outcome !== 'rendered') {
      // No-Mock (Req 6.5): a window edit returned no video — abandon the splice
      // and honestly edit the whole clip instead. Never splice a partial result.
      return wholeClipFallback(
        'Couldn\u2019t edit a detected region \u2014 editing the whole clip instead.',
      );
    }
    pieces.push({ storageKey: edited.storageKey, fileName: `${edited.artifactId}.mp4` });
    editedResults.push(edited);
    cursor = w.endMs;
  }

  // final tail piece — the UNEDITED footage after the last window.
  if (cursor < ctx.effectiveDurationMs) {
    const tail = await ctx.editor.execute({
      projectId: ctx.projectId,
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      jobId: ctx.generateJobId(),
      inputVersionId: ctx.inputVersionId,
      sourceStorageKey: ctx.currentStorageKey,
      sourceFileName: ctx.currentFileName,
      operation: { kind: 'trim', params: { startMs: cursor, endMs: ctx.effectiveDurationMs } },
    });
    pieces.push({ storageKey: tail.storageKey, fileName: `${tail.artifact.artifactId}.mp4` });
  }

  const rangeText = windows
    .map((w) => `${formatTimestamp(w.startMs)}\u2013${formatTimestamp(w.endMs)}`)
    .join(', ');
  const labelOverride = `AI edit (localized: ${windows.length} window(s): ${rangeText})`;

  // Single-piece short-circuit: one edited window covering the whole clip (no
  // head/gap/tail) — use the edited result directly, no assembly needed.
  if (pieces.length === 1) {
    return { result: editedResults[0], labelOverride };
  }

  // Splice: concatenate head + [edited window]* + tails with the EXISTING concat.
  const dims =
    (ctx.targetAspectRatio ? dimensionsForAspect(ctx.targetAspectRatio) : null) ?? {
      width: EXPORT_PROFILES.vertical_1080p.width,
      height: EXPORT_PROFILES.vertical_1080p.height,
    };
  const assembled = await ctx.editor.executeAssembly({
    projectId: ctx.projectId,
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    jobId: ctx.generateJobId(),
    inputVersionId: ctx.inputVersionId,
    sources: pieces,
    targetWidth: dims.width,
    targetHeight: dims.height,
    fps: EXPORT_PROFILES.vertical_1080p.fps,
  });
  const first = editedResults[0];
  return {
    result: {
      outcome: 'rendered',
      artifactId: assembled.artifact.artifactId,
      storageKey: assembled.storageKey,
      mimeType: first.mimeType,
      provider: first.provider,
      model: first.model,
    },
    labelOverride,
  };
}

/**
 * Run one chat-driven video-editing turn end-to-end. Reuses the converse
 * pipeline collaborators and executes a deterministic edit in-process.
 */
export async function runChatVideoEditTurn(
  input: RunChatVideoEditInput,
  deps: ChatVideoEditDeps = {},
): Promise<ChatVideoEditResult> {
  const log = deps.logger ?? defaultLogger;
  const store = deps.store ?? mongoVideoProjectStore;
  const intentRouter = deps.intentRouter ?? getIntentRouterService();
  const planner = deps.planner ?? getEditingPlannerService();
  const versionManager = deps.versionManager ?? versionManagerService;
  const editor = deps.deterministicEditor ?? deterministicEditorService;
  const audioEnvelope = deps.audioEnvelope ?? audioEnvelopeService;
  const transcriber = deps.transcriber ?? transcriptionService;
  const captionRenderer = deps.captionRenderer ?? captionRendererService;
  const storage = deps.storage ?? getStorageService();
  const artifactRepository = deps.artifactRepository ?? getArtifactRepository();
  const generativeVideo = deps.generativeVideo ?? getGenerativeVideoService();
  const editLocalizer = deps.editLocalizer ?? getEditLocalizationService();
  const generativeBudget = deps.generativeBudget ?? getGenerativeDailyBudget();
  const getSourceForEdit = deps.getSourceForEdit ?? defaultGetSourceForEdit;
  const getAllSourcesForEdit = deps.getAllSourcesForEdit ?? defaultGetAllSourcesForEdit;
  const generateTimelineId = deps.generateTimelineId ?? (() => `vt-${randomUUID()}`);
  const generateJobId = deps.generateJobId ?? (() => `chatedit-${randomUUID()}`);

  // Per-turn debug trace (JSONL to logs/video-editor-debug.jsonl). No-op unless
  // VIDEO_EDITOR_DEBUG is truthy; never throws, so it can't affect the edit.
  const trace = new VideoEditorTrace({
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    userId: input.userId,
    message: input.message,
    sourceId: input.sourceId ?? null,
  });

  const emit = (progress: ChatEditProgress) => {
    try {
      input.onProgress?.(progress);
    } catch {
      /* progress is best-effort */
    }
  };

  try {
    // ── Resolve the analyzed source (reused across turns; never re-ingested) ──
    const source = await getSourceForEdit(input.projectId, input.sourceId ?? null);
    if (!source) {
      trace.end('error', { reason: 'no_source' });
      return {
        outcome: 'error',
        message:
          'I could not find an analyzed video to edit in this project. Please re-attach the video.',
      };
    }
    trace.event('source', {
      resolvedSourceId: source.sourceId,
      durationMs: source.durationMs,
      storageKey: source.storageKey,
      fileName: source.fileName,
    });

    // ── Stage 1 — Intent_Router (forced video-editor turn) ───────────────────
    emit({ phase: 'classifying', status: 'Understanding your edit…', percent: 10 });
    const routeResult = await intentRouter.classify({
      message: input.message,
      hasVideo: true,
      forcedTool: 'video_editor',
      inputAssets: [source.sourceId],
      userId: input.userId,
      workspaceId: input.workspaceId,
      aiModel: input.aiModel,
    });

    // One-shot "premium reel" polish (Increment 3): a single instruction like
    // "make this a reel" / "premium reel" expands into a curated, tasteful chain
    // of DETERMINISTIC edits (grade → reframe 9:16 → normalize audio → fades →
    // beat-cut → animated captions). Detected purely from the message so it works
    // even when the LLM stage could not classify a concrete edit (in which case
    // it would otherwise dead-end in a clarification). Each step still degrades
    // honestly downstream (No-Mock, Req 23).
    const reelPolish = isReelPolishRequest(input.message);

    let intent: VideoIntent;
    if (routeResult.status === 'classified') {
      intent = reelPolish
        ? buildReelPolishIntent(input.message, routeResult.intent)
        : routeResult.intent;
    } else if (reelPolish) {
      // The router could not classify a concrete edit, but this is clearly a
      // reel-polish request — assemble the curated deterministic chain directly.
      intent = buildReelPolishIntent(input.message, null);
    } else if (routeResult.status === 'not_video_edit') {
      trace.end('clarification', { stage: 'intent', reason: 'not_video_edit' });
      return {
        outcome: 'clarification',
        message:
          'Tell me what edit you\u2019d like on the video \u2014 for example, reframe it to 9:16, trim the first few seconds, speed it up, or clean up the audio.',
      };
    } else {
      trace.end('clarification', { stage: 'intent', reason: routeResult.reason });
      return { outcome: 'clarification', message: clarificationMessage(routeResult.reason) };
    }

    trace.event('intent', {
      routeStatus: routeResult.status,
      reelPolish,
      action: intent.action,
      targetAspectRatio: intent.targetAspectRatio ?? null,
      targetDurationMs: intent.targetDurationMs ?? null,
      targetPlatform: intent.targetPlatform ?? null,
      requiresGenerativeAI: (intent as { requiresGenerativeAI?: boolean }).requiresGenerativeAI ?? null,
    });

    // ── Stage 2 — new immutable version for this refinement (Req 16.1/16.2) ──
    emit({ phase: 'versioning', status: 'Creating a new version…', percent: 25 });
    const project = await store.findById(input.projectId).catch(() => null);
    const parentVersionId = project?.activeVersionId ?? null;
    let versionId = `ver-${randomUUID()}`;
    let inputVersionId = parentVersionId ?? versionId;
    try {
      const versionResult = await versionManager.createVersion(
        { projectId: input.projectId, workspaceId: input.workspaceId, userId: input.userId },
        { parentVersionId, timelineId: generateTimelineId(), label: input.message.slice(0, 120) },
      );
      if (versionResult.ok) {
        versionId = versionResult.version.versionId;
        inputVersionId = versionResult.version.parentVersionId ?? versionId;
      }
    } catch (err) {
      log?.warn?.('Version creation failed; proceeding with a synthetic version id', {
        component: COMPONENT,
        projectId: input.projectId,
        error: (err as Error)?.message,
      });
    }

    // ── Stage 3 — Editing_Planner ────────────────────────────────────────────
    emit({ phase: 'planning', status: 'Planning the edit…', percent: 45 });
    const planResult = await planner.plan({
      intent,
      analysis: { sourceDurationMs: source.durationMs },
      platform: intent.targetPlatform ?? project?.targetPlatform ?? null,
      userId: input.userId,
      workspaceId: input.workspaceId,
      aiModel: input.aiModel,
    });

    const operations = planResult.plan.operations;
    /**
     * The plan operations reordered into the SAME order the executor runs them
     * (assembly → pixel/timeline → generative → highlight → auto-cut → captions),
     * so the checklist and the "Step N of M" overlay increment monotonically 1→N.
     * See {@link orderOperationsForExecution}. This reorders ONLY the summary/index
     * map — WHICH ops execute (and the execution partition below) is unchanged and
     * still reads the original `operations` list.
     */
    const orderedOperations = orderOperationsForExecution(operations);
    /**
     * The LIVE plan checklist for this turn.
     *
     * ONE array for the whole turn: same identity, same order, same length on
     * every emit (the client keys its checklist off that order). Only the
     * `status` field of an entry ever changes, and only forwards to `done`, and
     * only once the corresponding operation has genuinely produced output.
     */
    const planSummary: ChatEditPlanStep[] = orderedOperations.map((op) => ({
      kind: op.kind,
      type: op.type,
      status: op.status,
      label: operationLabel(op),
      // Carried through (when set) so the card can say WHY a step was skipped
      // rather than swallowing it. Omitted entirely for executable steps.
      ...(typeof op.limitation === 'string' && op.limitation.trim().length > 0
        ? { limitation: op.limitation.trim() }
        : {}),
    }));

    /**
     * Plan-operation → checklist-entry index.
     *
     * Keyed by object IDENTITY, which IS the index used to build `planSummary`
     * (every op the executor handles is a reference filtered out of `operations`).
     * `sequenceIndex` is the declared fallback. Label/kind matching is deliberately
     * NOT used: the planner can emit two ops with the same kind AND label (the
     * duplicate-grade / duplicate-reframe case the executor dedupes), so a
     * name-based match would tick a step that never ran.
     */
    const planStepIndexByOp = new Map<PlanOperation, number>();
    // Fallback lookup keyed by the planner's declared `sequenceIndex`, mapped to
    // the op's NEW index in the reordered `planSummary` (not the raw planner
    // position, which no longer matches after reordering).
    const planStepIndexBySeq = new Map<number, number>();
    orderedOperations.forEach((op, index) => {
      if (!planStepIndexByOp.has(op)) planStepIndexByOp.set(op, index);
      if (typeof op.sequenceIndex === 'number' && !planStepIndexBySeq.has(op.sequenceIndex)) {
        planStepIndexBySeq.set(op.sequenceIndex, index);
      }
    });
    /** The op's index into `planSummary`, or -1 when it cannot be resolved. */
    const planIndexFor = (op: PlanOperation | null | undefined): number => {
      if (!op) return -1;
      const byIdentity = planStepIndexByOp.get(op);
      if (typeof byIdentity === 'number') return byIdentity;
      const bySeq =
        typeof op.sequenceIndex === 'number' ? planStepIndexBySeq.get(op.sequenceIndex) : undefined;
      return typeof bySeq === 'number' ? bySeq : -1;
    };
    const planStepFor = (op: PlanOperation | null | undefined): ChatEditPlanStep | null => {
      const index = planIndexFor(op);
      return index >= 0 ? planSummary[index] ?? null : null;
    };
    emit({ phase: 'planning', status: 'Planned the edit.', percent: 55, plan: planSummary });
    trace.event('plan', {
      versionId,
      inputVersionId,
      operationCount: operations.length,
      operations: planSummary,
    });

    // Monotonic progress helper across the chain: planning finished at 55, the
    // chain occupies 58..92, and completion is emitted at 100 separately.
    let lastPercent = 55;
    // The phase/status of the most recent emit, so retiring a step can deliver
    // its tick by RE-EMITTING the current stage — never by inventing a new phase
    // and never by moving the bar.
    let lastPhase: ChatEditPhase = 'planning';
    let lastStatus = 'Planned the edit.';
    /**
     * The `planSummary` index of the step currently being worked on (see
     * {@link ChatEditProgress.activeStepIndex}). `null` until the first operation
     * starts; carried across an operation's re-emits; advanced by the next
     * operation; cleared on the terminal emit.
     */
    let activeStepIndex: number | null = null;
    /** Spread the active-step pointer onto an emit only when one is set. */
    const activeStepField = () =>
      activeStepIndex === null ? {} : { activeStepIndex };
    /**
     * Emit one execution step.
     *
     * Passing `op` sets the ACTIVE step pointer before the emit, so the client's
     * checklist highlight and its overlay "Step N of M" counter both move to that
     * operation at the exact moment it starts. Omitting `op` (inner
     * provider-progress notes) leaves the pointer where it is, which is correct:
     * those notes are sub-progress of the operation already in flight.
     */
    const emitStep = (
      phase: ChatEditPhase,
      status: string,
      percent: number,
      op?: PlanOperation | null,
    ) => {
      if (op) {
        const index = planIndexFor(op);
        if (index >= 0) activeStepIndex = index;
      }
      const clamped = Math.max(lastPercent, Math.min(92, Math.round(percent)));
      lastPercent = clamped;
      lastPhase = phase;
      lastStatus = status;
      emit({ phase, status, percent: clamped, plan: planSummary, ...activeStepField() });
    };

    /**
     * Retire a plan step: flip its checklist entry to `done` and push the new
     * state to the client immediately.
     *
     * HONESTY CONTRACT: call this ONLY after the operation actually completed and
     * produced an artifact. Never on entry to a step, never on a degraded /
     * needs_async / error outcome, never to make the card look finished.
     *
     * A step that degraded or was mutually redundant is left at its planner status
     * (`executable`) on purpose: the client renders that as an un-ticked pending
     * dot, and the turn already reports those skips in its summary text.
     *
     * A step that could NOT BE EXECUTED AT ALL (unmappable kind, or deduped away
     * before execution) is a different case and goes through
     * {@link markStepUnavailable} instead — leaving it `executable` made the
     * client's "first pending step" pick it as the CURRENT step forever while
     * execution had already moved on, which is exactly the dishonest state this
     * pair of helpers exists to prevent.
     *
     * The re-emit reuses the CURRENT phase/status/percent/active-step, so no new
     * phase name and no new percent value is introduced. It exists because the
     * last completed step of a turn (or a step followed by an early honest
     * return) would otherwise have no subsequent emit to carry its tick.
     */
    const markStepDone = (op: PlanOperation | null | undefined) => {
      const step = planStepFor(op);
      if (!step || step.status === 'done') return;
      step.status = 'done';
      emit({
        phase: lastPhase,
        status: lastStatus,
        percent: lastPercent,
        plan: planSummary,
        ...activeStepField(),
      });
    };

    /**
     * Report a plan step as NOT-RUNNABLE, with the executor's own reason.
     *
     * WHY THIS EXISTS: an operation the driver drops from execution (no in-process
     * engine for its kind, or a duplicate of a kind already queued) used to be
     * left at `executable`. The client's checklist picks the FIRST pending step as
     * the current one, so the dropped step sat there spinning as "in progress"
     * forever while the driver had already moved on to the next operation — the
     * overlay said one thing and the checklist another, and the step was never
     * ticked because it never ran.
     *
     * Flipping it to `unavailable` with the mapper's own `reason` moves it out of
     * the checklist and into the card's existing honest "Skipped — …" footnote,
     * which says something true and specific instead of pretending work is
     * happening. Nothing about WHICH operations execute changes here; only how the
     * un-executed ones are reported.
     *
     * Never applied to a step that already completed, and never to one already
     * reported unavailable by the planner (its own limitation text wins).
     */
    const markStepUnavailable = (op: PlanOperation | null | undefined, reason: string) => {
      const step = planStepFor(op);
      if (!step || step.status === 'done' || step.status === 'unavailable') return;
      step.status = 'unavailable';
      const trimmed = (reason || '').trim();
      if (trimmed) step.limitation = trimmed;
      emit({
        phase: lastPhase,
        status: lastStatus,
        percent: lastPercent,
        plan: planSummary,
        ...activeStepField(),
      });
    };

    // ── Stage 4 — execute a CHAINED deterministic edit IN-PROCESS ─────────────
    // Collect every executable deterministic op (render/analysis excluded), then
    // CHAIN them into ONE final video: each op runs on the previous op's output,
    // so "add a filter and captions" produces a single colour-graded + captioned
    // artifact rather than only one of the two. Pixel/timeline ops run FIRST and
    // caption burn-in runs LAST (captions must sit on top of the final look).
    const executableOps = operations.filter(
      (op) => op.status === 'executable' && op.type !== 'render' && op.type !== 'analysis',
    );
    if (executableOps.length === 0) {
      trace.end('no_op', { stage: 'plan', reason: 'no_executable_ops' });
      return {
        outcome: 'no_op',
        message:
          'I could not turn that into a concrete edit. Try a specific instruction like "reframe to 9:16", "trim to 10 seconds", "speed it up 2x", or "normalize the audio".',
      };
    }

    const deterministicCandidates = executableOps.filter((op) => op.type === 'deterministic');
    const generativeCandidates = executableOps.filter((op) => op.type === 'generative');

    // Split the deterministic ops: caption burn-in is deferred to LAST (it needs
    // a speech-to-text pass and must render on top of the graded frames); every
    // other deterministic op ("pixel/timeline": filter/color_grade, aspect/resize,
    // trim/cut, speed, fades, audio_process) runs first in the planner's order.
    const captionOp = deterministicCandidates.find((op) => op.kind === 'caption') ?? null;
    // Auto-cut is also deferred (it needs an audio energy-envelope pre-pass and
    // must re-time the timeline BEFORE captions are transcribed on the montage).
    const autoCutOp = deterministicCandidates.find((op) => op.kind === 'auto_cut') ?? null;
    // Highlight selection ("editorial brain") is deferred too — it needs an audio
    // energy-envelope + speech-transcription pre-pass, then renders the tightened
    // cut via the existing auto_cut engine op. It runs BEFORE captions (so
    // captions transcribe the final highlight). Highlight and auto_cut are
    // mutually redundant (both produce a tightened cut), so when BOTH are present
    // the highlight runs and the auto_cut is skipped.
    const highlightOp = deterministicCandidates.find((op) => op.kind === 'highlight') ?? null;
    // Multi-clip assembly ("concat") is a PRE-STEP that runs FIRST: it stitches
    // several attached clips into ONE video, then the rest of the deterministic
    // chain (grade/reframe/beat-cut/highlight/captions) runs on the assembled
    // result. It is therefore excluded from the pixel/timeline ops here.
    const concatOp = deterministicCandidates.find((op) => op.kind === 'concat') ?? null;
    const pixelOps = deterministicCandidates.filter(
      (op) =>
        op.kind !== 'caption' &&
        op.kind !== 'auto_cut' &&
        op.kind !== 'highlight' &&
        op.kind !== 'concat',
    );

    // ── Multi-clip assembly decision (PRE-STEP) ──────────────────────────────
    // When a "concat" op is planned, gather ALL usable analyzed sources for the
    // project (oldest → newest). No-Mock (Req 23): assembly needs 2+ clips — with
    // fewer, degrade HONESTLY (clarify when concat is the only executable op, else
    // skip the stitch and continue with the single newest source). The assembled
    // clip's working duration is the SUM of the stitched clip durations, which the
    // downstream fades/highlight/auto_cut ranges use.
    let runAssembly = false;
    let assemblySources: EditableSource[] = [];
    let assemblySkipNote: string | null = null;
    // The effective working duration for downstream ranges (updated after a
    // successful assembly to the SUM of the stitched clip durations).
    let effectiveDurationMs = source.durationMs;
    if (concatOp) {
      const allSources = await getAllSourcesForEdit(input.projectId).catch((err) => {
        log?.warn?.('Failed to gather sources for assembly; treating as none', {
          component: COMPONENT,
          projectId: input.projectId,
          error: (err as Error)?.message,
        });
        return [] as EditableSource[];
      });
      // Is concat the ONLY executable op (nothing else deterministic/generative)?
      const concatIsOnlyOp = executableOps.every((op) => op.kind === 'concat');
      if (allSources.length >= 2) {
        runAssembly = true;
        assemblySources = allSources;
        effectiveDurationMs = allSources.reduce((sum, s) => sum + Math.max(0, s.durationMs), 0);
      } else if (concatIsOnlyOp) {
        // Nothing else to do and we cannot stitch — ask for another clip.
        return {
          outcome: 'clarification',
          message:
            'Assembling clips needs at least 2 videos in this chat \u2014 attach another clip and ask again.',
        };
      } else {
        // Other ops exist — skip the stitch (non-fatal) and continue with the
        // single newest source, noting the honest skip.
        assemblySkipNote =
          'Stitching was skipped because there was only one clip to work with \u2014 attach another clip to combine them.';
        log?.info?.('Assembly skipped (non-fatal); fewer than 2 usable sources', {
          component: COMPONENT,
          projectId: input.projectId,
          sources: allSources.length,
        });
      }
    }

    // Map the pixel/timeline ops to concrete deterministic operations. Kinds that
    // still need the async pipeline (e.g. analysis-driven silence removal) map to
    // ok:false and are skipped here, remembering the first honest reason.
    //
    // DEDUPLICATE by the MAPPED deterministic operation KIND (`filter`, `aspect`,
    // `trim`, `speed`, `fades`, `audio_normalize`), keeping the FIRST occurrence
    // of each kind and otherwise preserving planner order. The planner sometimes
    // emits duplicate deterministic ops (e.g. two colour grades, two reframes);
    // chaining ALL of them would re-encode the video once per op, colour-grading
    // twice and reframing twice — compounding generational quality loss. Running
    // each kind at most once means "colour grade + reframe + captions" is three
    // ops (one filter, one aspect, one caption), not five.
    const mappedPixelOps: Array<{ op: PlanOperation; operation: DeterministicOperation }> = [];
    let firstUnsupportedReason: string | null = null;
    const seenKinds = new Set<DeterministicOperation['kind']>();
    for (const op of pixelOps) {
      const result = mapPlanOperation(op, intent, input.message, effectiveDurationMs);
      if (!result.ok) {
        if (!firstUnsupportedReason) firstUnsupportedReason = result.reason;
        // This op is DROPPED from execution. Report it honestly with the mapper's
        // own reason so the card names it in the "Skipped — …" footnote instead of
        // leaving it as the checklist's forever-current step.
        markStepUnavailable(op, result.reason);
        continue;
      }
      if (seenKinds.has(result.operation.kind)) {
        log?.debug?.('Skipping duplicate deterministic op kind in chained edit', {
          component: COMPONENT,
          kind: result.operation.kind,
          planKind: op.kind,
        });
        // Also dropped from execution (a step of this kind is already queued and
        // running it twice would re-encode and compound quality loss), so it gets
        // the same honest treatment rather than a permanently pending dot.
        markStepUnavailable(
          op,
          `this edit already applies ${result.operation.kind.replace(/_/g, ' ')} once, so the duplicate step was not run again`,
        );
        continue;
      }
      seenKinds.add(result.operation.kind);
      mappedPixelOps.push({ op, operation: result.operation });
    }

    // GENERATIVE (Track 3, Google): run generative ops INLINE when a Google key is
    // configured. Edit-type kinds (object_removal/background_replace/generative_edit)
    // edit the CURRENT chained artifact via Omni Flash; generate-type kinds
    // (generate/generate_broll) produce a NEW clip via Veo. When no Google key is
    // configured, generative ops keep the EXISTING honest needs_async behavior.
    const googleConfigured = isGenerativeVideoConfigured();
    const runGenerative = generativeCandidates.length > 0 && googleConfigured;

    // Nothing executable in-process (no assembly AND no mappable pixel op AND no
    // caption AND no auto-cut AND no highlight AND no runnable generative op).
    // Never fabricate a result — surface the honest async requirement.
    if (
      !runAssembly &&
      mappedPixelOps.length === 0 &&
      !captionOp &&
      !autoCutOp &&
      !highlightOp &&
      !runGenerative
    ) {
      const kind =
        generativeCandidates[0]?.kind ?? deterministicCandidates[0]?.kind ?? 'generative_edit';
      const reason =
        generativeCandidates.length > 0
          ? 'This edit needs AI generation, which runs as a background job with a credit estimate you confirm.'
          : firstUnsupportedReason ?? 'This edit runs on the background render pipeline.';
      trace.end('needs_async', {
        stage: 'plan',
        kind,
        googleConfigured,
        reason: generativeCandidates.length > 0 ? 'generative_not_configured' : firstUnsupportedReason,
      });
      return {
        outcome: 'needs_async',
        kind,
        message: `I planned this edit, but ${reason} I\u2019ll pick it up on the render pipeline once that\u2019s available.`,
      };
    }
    trace.event('exec.plan', {
      runAssembly,
      pixelOps: mappedPixelOps.map((m) => ({ planKind: m.op.kind, mapped: m.operation.kind })),
      hasCaption: !!captionOp,
      hasAutoCut: !!autoCutOp,
      hasHighlight: !!highlightOp,
      runGenerative,
      generativeKinds: generativeCandidates.map((g) => g.kind),
      effectiveDurationMs,
    });

    // Highlight and auto-cut are mutually redundant (both produce a tightened
    // cut). When BOTH are planned, run the highlight and skip the auto-cut.
    const runHighlight = highlightOp !== null;
    const runAutoCut = autoCutOp !== null && !runHighlight;

    // Work units drive the percentage: each pixel op is one unit; a highlight or
    // auto-cut pass (envelope [+ speech] + render) is one unit; a caption pass
    // (transcribe + burn-in) is one unit. Completing a unit advances the bar.
    const totalUnits =
      (runAssembly ? 1 : 0) +
      mappedPixelOps.length +
      (runHighlight ? 1 : 0) +
      (runAutoCut ? 1 : 0) +
      (runGenerative ? generativeCandidates.length : 0) +
      (captionOp ? 1 : 0);
    let completedUnits = 0;
    const unitPercent = () => 58 + Math.round((completedUnits / Math.max(totalUnits, 1)) * 34);

    // The chained source: starts at the immutable original, then advances to each
    // intermediate artifact's output key so op(N+1) reads op(N)'s render.
    let currentStorageKey = source.storageKey;
    let currentFileName = source.fileName;
    let finalArtifactId: string | null = null;
    let finalKind: string | null = null;
    const appliedLabels: string[] = [];
    let captionSkipNote: string | null = null;
    let autoCutSkipNote: string | null = null;
    let highlightSkipNote: string | null = null;
    let generativeSkipNote: string | null = null;

    // ── Multi-clip assembly PRE-STEP — stitch the clips FIRST ─────────────────
    // Runs BEFORE the rest of the chain so the grade/reframe/beat-cut/highlight/
    // caption steps all operate on the ONE assembled video. Target dims come from
    // the intent aspect (reusing dimensionsForAspect), else a vertical 1080p box.
    if (runAssembly) {
      emitStep('rendering', 'Stitching your clips together\u2026', unitPercent(), concatOp);
      const aspect = intent.targetAspectRatio;
      const dims =
        (aspect ? dimensionsForAspect(aspect) : null) ?? {
          width: EXPORT_PROFILES.vertical_1080p.width,
          height: EXPORT_PROFILES.vertical_1080p.height,
        };
      const jobId = generateJobId();
      const assembled = await editor.executeAssembly({
        projectId: input.projectId,
        workspaceId: input.workspaceId,
        userId: input.userId,
        jobId,
        inputVersionId,
        sources: assemblySources.map((s) => ({ storageKey: s.storageKey, fileName: s.fileName })),
        targetWidth: dims.width,
        targetHeight: dims.height,
        fps: EXPORT_PROFILES.vertical_1080p.fps,
      });
      // The assembled artifact becomes the input to the rest of the chain.
      currentStorageKey = assembled.storageKey;
      currentFileName = `${assembled.artifact.artifactId}.mp4`;
      finalArtifactId = assembled.artifact.artifactId;
      finalKind = 'assemble';
      appliedLabels.push(concatOp ? operationLabel(concatOp) : 'Stitch the clips together');
      trace.event('exec.assembly', {
        engine: 'deterministic',
        clipCount: assemblySources.length,
        width: dims.width,
        height: dims.height,
        artifactId: assembled.artifact.artifactId,
      });
      // The stitch really produced a video → tick the concat step.
      markStepDone(concatOp);
      completedUnits += 1;
    }

    // ── Chain the pixel/timeline ops (each output feeds the next input) ───────
    for (const { op, operation } of mappedPixelOps) {
      emitStep('rendering', `${operationLabel(op)}\u2026`, unitPercent(), op);
      const jobId = generateJobId();
      const rendered = await editor.execute({
        projectId: input.projectId,
        workspaceId: input.workspaceId,
        userId: input.userId,
        jobId,
        inputVersionId,
        sourceStorageKey: currentStorageKey,
        sourceFileName: currentFileName,
        operation,
      });
      // Advance the chain: the produced artifact's storage key is the next input.
      // The deterministic editor always writes an .mp4 output, so name it as such.
      currentStorageKey = rendered.storageKey;
      currentFileName = `${rendered.artifact.artifactId}.mp4`;
      finalArtifactId = rendered.artifact.artifactId;
      finalKind = op.kind;
      appliedLabels.push(operationLabel(op));
      trace.event('exec.pixel', {
        engine: 'deterministic',
        planKind: op.kind,
        mappedKind: operation.kind,
        artifactId: rendered.artifact.artifactId,
      });
      // This op rendered a real artifact → tick its step. Deduped duplicates and
      // ops that could not be mapped never reach here, so they stay un-ticked.
      markStepDone(op);
      completedUnits += 1;
    }

    // ── Highlight selection ("editorial brain") — analysis pre-pass then render ─
    // Runs AFTER the pixel/timeline ops (so it tightens the graded intermediate)
    // and BEFORE captions (so captions are transcribed from the final highlight).
    // It extracts the real audio energy envelope AND the real speech spans (via
    // the reused transcription service), scores the timeline with the pure
    // `computeHighlightSegments`, and renders the kept segments by REUSING the
    // engine's existing `auto_cut` op. No-Mock (Req 23): when the clip is already
    // short enough, or there is no usable signal, it degrades honestly — skipped
    // when another op already rendered, or a clarification/no_op when highlight is
    // the ONLY executable op.
    if (runHighlight && highlightOp) {
      emitStep('rendering', 'Finding the best moments\u2026', unitPercent(), highlightOp);

      // The resolved target duration is pure and cheap, so it is computed FIRST
      // and reused by both the viability pre-check and the selection below.
      const targetDurationMs = highlightTargetMsFrom(input.message, intent, effectiveDurationMs);

      // ── CHEAP VIABILITY PRE-CHECK — before ANY expensive analysis ───────────
      // The envelope extraction and the speech transcription below are the two
      // most expensive things this driver can do (minutes on a long clip). When
      // the durations alone prove the pass cannot change anything — the target
      // already covers the whole clip, or the clip is too short to hold two kept
      // segments — skip NOW, through the same honest skip path used when the
      // analysis runs and finds nothing. Neither collaborator is touched.
      const preSkipReason = highlightPreSkipReason(effectiveDurationMs, targetDurationMs);
      if (preSkipReason) {
        trace.event('exec.highlight', {
          engine: 'deterministic+analysis',
          usesGenerative: false,
          skippedBeforeAnalysis: true,
          skipReason: preSkipReason,
          hasEnergyEnvelope: false,
          speechSpanCount: 0,
          targetDurationMs,
          effectiveDurationMs,
          selectedSegments: 0,
        });
        log?.info?.('Highlight skipped before analysis (nothing it could change)', {
          component: COMPONENT,
          projectId: input.projectId,
          reason: preSkipReason,
          targetDurationMs,
          effectiveDurationMs,
          finalArtifactId,
        });
        if (finalArtifactId === null) {
          // Highlight was the ONLY executable op — be honest, don't fabricate.
          // Same wording the post-analysis skip uses for an already-short clip.
          markStepUnavailable(
            highlightOp,
            'the clip is already short enough that picking the best moments could not shorten it',
          );
          return {
            outcome: 'no_op',
            message:
              'This clip is already short enough that there\u2019s nothing to trim into a shorter highlight.',
          };
        }
        // A pixel op already rendered — keep it, note the honest skip. The step is
        // reported UNAVAILABLE (never left `executable`), so the card's "first
        // pending step is the current one" rule cannot leave it spinning forever.
        highlightSkipNote =
          'Highlight selection was skipped because the clip is already short or has no usable signal.';
        markStepUnavailable(
          highlightOp,
          'the clip is already short enough that picking the best moments could not shorten it',
        );
        completedUnits += 1;
      } else {
        // Real audio energy envelope (reuses the same service the auto-cut step
        // uses). Missing/failed extraction leaves envelope-only scoring off.
        const envelope = await audioEnvelope
          .extractEnvelope({
            storageKey: currentStorageKey,
            sourceId: source.sourceId,
            fileName: currentFileName,
          })
          .catch(() => null);

        // Real speech spans (reuses the SAME transcription service the caption
        // path uses). On failure/no-speech, pass [] spans so envelope-only
        // highlight still works — never fabricate speech.
        let speechSpans: HighlightSpeechSpan[] = [];
        try {
          const segs = await transcriber.transcribeSource({
            storageKey: currentStorageKey,
            sourceId: source.sourceId,
            fileName: currentFileName,
          });
          speechSpans = (Array.isArray(segs) ? segs : []).map((s) => ({
            startMs: s.startMs,
            endMs: s.endMs,
          }));
        } catch (err) {
          speechSpans = [];
          log?.info?.('Highlight speech transcription unavailable; using energy-only scoring', {
            component: COMPONENT,
            projectId: input.projectId,
            code: err instanceof TranscriptionError ? err.code : 'TRANSCRIPTION_FAILED',
          });
        }

        const { segments } = computeHighlightSegments(
          envelope,
          speechSpans,
          effectiveDurationMs,
          { targetDurationMs },
        );
        trace.event('exec.highlight', {
          engine: 'deterministic+analysis',
          usesGenerative: false,
          hasEnergyEnvelope: !!envelope && envelope.length > 0,
          speechSpanCount: speechSpans.length,
          targetDurationMs,
          selectedSegments: segments.length,
        });

        // A single (or zero) segment means the whole clip / nothing to trim —
        // never fabricate a highlight.
        if (segments.length <= 1) {
          if (finalArtifactId === null) {
            // Highlight was the ONLY executable op — be honest, don't fabricate.
            markStepUnavailable(
              highlightOp,
              'the clip is already short or has no usable signal to pick best moments from',
            );
            return {
              outcome: 'no_op',
              message:
                !envelope || envelope.length === 0
                  ? (speechSpans.length === 0
                      ? 'This clip has no usable audio or speech to pick highlights from, and it\u2019s already short. Add a video with spoken audio or music, or tell me exact timestamps to keep.'
                      : 'This clip is already short enough that there\u2019s nothing to trim into a shorter highlight.')
                  : 'This clip is already short enough that there\u2019s nothing to trim into a shorter highlight.',
            };
          }
          // A pixel op already rendered — keep it, note the honest skip. The step
          // is reported UNAVAILABLE rather than left `executable`, so the card
          // cannot show it as the forever-current step.
          highlightSkipNote =
            'Highlight selection was skipped because the clip is already short or has no usable signal.';
          markStepUnavailable(
            highlightOp,
            'the clip is already short or has no usable signal to pick best moments from',
          );
          log?.info?.('Highlight skipped (non-fatal); keeping the last rendered artifact', {
            component: COMPONENT,
            projectId: input.projectId,
            finalArtifactId,
          });
        } else {
          const punchInZoom = autoCutWantsPunchIn(input.message);
          emitStep('rendering', `${operationLabel(highlightOp)}\u2026`, unitPercent() + 6, highlightOp);
          const jobId = generateJobId();
          // Reuse the deterministic engine's existing auto_cut op to render the
          // selected highlight segments (no new render engine).
          const rendered = await editor.execute({
            projectId: input.projectId,
            workspaceId: input.workspaceId,
            userId: input.userId,
            jobId,
            inputVersionId,
            sourceStorageKey: currentStorageKey,
            sourceFileName: currentFileName,
            operation: { kind: 'auto_cut', params: { segments, punchInZoom } },
          });
          currentStorageKey = rendered.storageKey;
          currentFileName = `${rendered.artifact.artifactId}.mp4`;
          finalArtifactId = rendered.artifact.artifactId;
          finalKind = 'highlight';
          appliedLabels.push(operationLabel(highlightOp));
          // The tightened cut really rendered → tick the highlight step. The
          // `segments.length <= 1` branch above deliberately does NOT tick:
          // nothing was rendered there. When a highlight runs, a redundant
          // auto-cut step is never executed and so is never ticked either.
          markStepDone(highlightOp);
        }
        completedUnits += 1;
      }
    }

    // ── Auto-cut (energy/beat-synced montage) — envelope pre-pass then render ──
    // Runs AFTER the pixel/timeline ops (so it cuts the graded intermediate) and
    // BEFORE captions (so captions are transcribed from the final montage). It
    // extracts a real audio energy envelope, computes deterministic beat-synced
    // keep-segments with the pure logic, and renders them via the engine. No-Mock
    // (Req 23): if there is no audio or no distinct beats, it is skipped honestly
    // (or surfaces a clarification when auto-cut is the ONLY executable op).
    // Skipped entirely when a highlight pass already produced a tightened cut
    // (highlight and auto-cut are mutually redundant).
    if (runAutoCut && autoCutOp) {
      emitStep('rendering', 'Analysing audio for beats\u2026', unitPercent(), autoCutOp);

      // ── CHEAP VIABILITY PRE-CHECK — before the envelope extraction ─────────
      // Same waste as the highlight pass had: `computeAutoCutSegments` cannot
      // place a single boundary in a clip shorter than two minimum segments, so
      // decoding the audio to an energy envelope first buys nothing. Skip through
      // the SAME honest skip path, without touching the envelope service.
      if (autoCutSourceTooShort(effectiveDurationMs)) {
        trace.event('exec.autocut', {
          engine: 'deterministic+analysis',
          usesGenerative: false,
          skippedBeforeAnalysis: true,
          skipReason: 'source_too_short',
          hasEnergyEnvelope: false,
          segments: 0,
          hasCuts: false,
          effectiveDurationMs,
        });
        log?.info?.('Auto-cut skipped before analysis (clip too short to cut)', {
          component: COMPONENT,
          projectId: input.projectId,
          reason: 'source_too_short',
          effectiveDurationMs,
          finalArtifactId,
        });
        markStepUnavailable(
          autoCutOp,
          'the clip is too short to place a cut without dropping below the minimum shot length',
        );
        if (finalArtifactId === null) {
          // Auto-cut was the ONLY executable op — be honest, don't fabricate.
          return {
            outcome: 'clarification',
            message:
              'This clip is too short to cut into a montage. Send a longer clip, or tell me the exact timestamps you\u2019d like to cut on.',
          };
        }
        // A pixel op already rendered — keep it, note the honest skip.
        autoCutSkipNote = 'Auto-cut was skipped because this clip is too short to cut.';
        completedUnits += 1;
      } else {
        const envelope = await audioEnvelope
          .extractEnvelope({
            storageKey: currentStorageKey,
            sourceId: source.sourceId,
            fileName: currentFileName,
          })
          .catch(() => null);

        const segments =
          envelope && envelope.length > 0
            ? computeAutoCutSegments(envelope, effectiveDurationMs).segments
            : [];
        // Fewer than 2 segments means no real cut was derivable (a single
        // whole-clip segment or none) — never fabricate cut points.
        const hasCuts = segments.length >= 2;
        trace.event('exec.autocut', {
          engine: 'deterministic+analysis',
          usesGenerative: false,
          hasEnergyEnvelope: !!envelope && envelope.length > 0,
          segments: segments.length,
          hasCuts,
        });

        if (!envelope || envelope.length === 0 || !hasCuts) {
          if (finalArtifactId === null) {
            // Auto-cut was the ONLY executable op — be honest, don't fabricate.
            markStepUnavailable(
              autoCutOp,
              !envelope || envelope.length === 0
                ? 'this clip has no audio to sync cuts to'
                : 'no distinct beats were found in this clip\u2019s audio',
            );
            return {
              outcome: 'clarification',
              message:
                !envelope || envelope.length === 0
                  ? 'This clip has no audio to sync cuts to. Add a video with music or spoken audio, or tell me exact timestamps to cut on.'
                  : 'I couldn\u2019t find distinct beats to cut on in this clip\u2019s audio. Tell me the timestamps you\u2019d like to cut on, or try a clip with a clearer beat.',
            };
          }
          // A pixel op already rendered — keep it, note the honest skip. The step
          // is reported UNAVAILABLE rather than left `executable`.
          autoCutSkipNote =
            !envelope || envelope.length === 0
              ? 'Auto-cut was skipped because this clip has no audio to sync to.'
              : 'Auto-cut was skipped because I couldn\u2019t find distinct beats.';
          markStepUnavailable(
            autoCutOp,
            !envelope || envelope.length === 0
              ? 'this clip has no audio to sync cuts to'
              : 'no distinct beats were found in this clip\u2019s audio',
          );
          log?.info?.('Auto-cut skipped (non-fatal); keeping the last rendered artifact', {
            component: COMPONENT,
            projectId: input.projectId,
            reason: !envelope || envelope.length === 0 ? 'no_audio' : 'no_beats',
            finalArtifactId,
          });
        } else {
          const punchInZoom = autoCutWantsPunchIn(input.message);
          emitStep('rendering', `${operationLabel(autoCutOp)}\u2026`, unitPercent() + 6, autoCutOp);
          const jobId = generateJobId();
          const rendered = await editor.execute({
            projectId: input.projectId,
            workspaceId: input.workspaceId,
            userId: input.userId,
            jobId,
            inputVersionId,
            sourceStorageKey: currentStorageKey,
            sourceFileName: currentFileName,
            operation: { kind: 'auto_cut', params: { segments, punchInZoom } },
          });
          currentStorageKey = rendered.storageKey;
          currentFileName = `${rendered.artifact.artifactId}.mp4`;
          finalArtifactId = rendered.artifact.artifactId;
          finalKind = 'auto_cut';
          appliedLabels.push(operationLabel(autoCutOp));
          // The beat-synced montage really rendered → tick the auto-cut step. The
          // no-audio / no-beats branch above does not tick (nothing was rendered).
          markStepDone(autoCutOp);
        }
        completedUnits += 1;
      }
    }

    // ── GENERATIVE ops (Track 3, Google) — deferred, BEFORE captions ──────────
    // Edit-type kinds (object_removal/background_replace/generative_edit) edit the
    // CURRENT chained artifact via Omni Flash, so captions can still burn on top;
    // generate-type kinds (generate/generate_broll) produce a NEW clip via Veo that
    // becomes the current artifact. No-Mock (Req 23): a real artifact is advanced
    // ONLY when Google actually returned video bytes; every other provider outcome
    // degrades honestly. When a generative op is the ONLY executable op and it
    // degrades, the honest outcome is returned (never fabricated).
    if (runGenerative) {
      for (const gop of generativeCandidates) {
        // ── Per-WORKSPACE DAILY BUDGET (secondary guardrail) ────────────────
        // The server shares ONE Google key and Google meters its daily
        // generate-request quota PER KEY, so one heavy workspace can starve the
        // rest. Consume BEFORE emitting the "Generating…" step, before the jobId,
        // and therefore before any provider call or credit charge. Disabled by
        // default and fails OPEN, so it can only ever *stop* an over-budget
        // workspace — never break a normal turn.
        // Belt-and-braces fail-open: the service already swallows Redis errors,
        // but the dep is injectable, so a throwing implementation must not turn a
        // normal edit into an error outcome either.
        let budget: { allowed: boolean; limit: number; used: number; resetsInMs: number };
        try {
          budget = await generativeBudget.tryConsume(input.workspaceId);
        } catch (budgetError) {
          log?.warn?.('Generative daily budget check threw; failing open', {
            component: COMPONENT,
            projectId: input.projectId,
            workspaceId: input.workspaceId,
            kind: gop.kind,
            error: budgetError instanceof Error ? budgetError.message : String(budgetError),
          });
          budget = { allowed: true, limit: 0, used: 0, resetsInMs: 0 };
        }
        if (!budget.allowed) {
          const resetIn = formatResetWindow(budget.resetsInMs);
          const message =
            `This workspace has reached its daily limit of ${budget.limit} AI video `
            + 'generation'
            + (budget.limit === 1 ? '' : 's')
            + '. Your credits were not charged'
            + (resetIn ? ` \u2014 the limit resets in about ${resetIn}` : '')
            + '. Deterministic edits (trim, reframe, captions, filters) still work in the meantime.';
          log?.warn?.('Generative op blocked by the workspace daily budget', {
            component: COMPONENT,
            projectId: input.projectId,
            workspaceId: input.workspaceId,
            kind: gop.kind,
            limit: budget.limit,
            used: budget.used,
          });
          trace.end('needs_async', {
            stage: 'generative',
            kind: gop.kind,
            reason: 'workspace_daily_budget',
          });
          return { outcome: 'needs_async', kind: gop.kind, message };
        }

        emitStep('rendering', 'Generating with Google\u2026', unitPercent(), gop);
        const jobId = generateJobId();
        const onGenProgress = (_phase: unknown, status: string) =>
          emitStep('rendering', status, unitPercent() + 6);

        // A per-op label override so a segment-scoped edit can label the range it
        // touched (e.g. "AI edit (0:05\u20130:10)"); defaults to the plan label.
        let appliedLabelOverride: string | null = null;

        let genResult: GenerativeVideoResult;
        if (isGenerateKind(gop.kind)) {
          // Generate-type kinds (generate/generate_broll) produce a brand-new clip
          // via Veo — there is no source segment to scope, so this is unchanged.
          genResult = await generativeVideo.generateVideo({
            projectId: input.projectId,
            workspaceId: input.workspaceId,
            userId: input.userId,
            jobId,
            inputVersionId,
            prompt: generativeInstruction(gop, input.message),
            aspectRatio: intent.targetAspectRatio ?? undefined,
            durationSeconds: isFinitePositive(intent.targetDurationMs)
              ? Math.round((intent.targetDurationMs as number) / 1000)
              : undefined,
            kind: gop.kind,
            apiKey: input.apiKey,
            onProgress: onGenProgress,
          });
        } else {
          // Edit-type kinds (object_removal/background_replace/generative_edit).
          // SEGMENT-SCOPED editing: when the instruction targets a time range we
          // cut ONLY that segment, send just the segment to Omni Flash, and splice
          // the edited segment back into the original timeline. Whole-clip stays
          // the honest fallback for genuinely global edits.
          //
          // Honest cost/latency tradeoff (documented): the splice re-encodes the
          // head/tail ONCE via the assembly concat (uniform params are required
          // for a clean, glitch-free join), but ONLY the targeted segment passes
          // through the generative model — so cost/latency scale with the edited
          // portion while the rest of the clip stays visually original.
          const scope = parseEditRange(input.message, effectiveDurationMs);
          const instruction = generativeInstruction(gop, input.message);

          // Record HOW the edit was scoped so you can verify both paths work:
          //  - 'segment' → the user gave an explicit time range (localizer bypassed)
          //  - 'global'  → no explicit range; the localizer decides whole-clip vs windows
          trace.event('exec.scope', {
            source: 'parseEditRange',
            mode: scope.mode,
            range: scope.range ? { startMs: scope.range.startMs, endMs: scope.range.endMs } : null,
            effectiveDurationMs,
            localizerWillRun: scope.mode === 'global' || !scope.range,
          });

          if (scope.mode === 'global' || !scope.range) {
            // NEW: cheap LOCALIZATION pre-pass. We are already inside the
            // edit-type-generative + no-explicit-range branch, so this is the ONE
            // place localization runs (Req 1.1, 1.5). It samples low-res frames,
            // asks a cheap vision model where the edit applies, and resolves ≤N
            // clean windows — or honestly signals a whole-clip fallback. It NEVER
            // throws and NEVER fabricates a window (No-Mock, Req 23).
            const resolution = await editLocalizer.localize({
              projectId: input.projectId,
              workspaceId: input.workspaceId,
              userId: input.userId,
              sourceStorageKey: currentStorageKey,
              sourceFileName: currentFileName,
              instruction,
              sourceDurationMs: effectiveDurationMs,
              onProgress: (status) => emitStep('rendering', status, unitPercent()),
            });

            trace.event('exec.localize', {
              kind: resolution.kind,
              windows:
                resolution.kind === 'windows'
                  ? resolution.windows.map((w) => ({ startMs: w.startMs, endMs: w.endMs }))
                  : [],
            });

            if (resolution.kind === 'whole-clip') {
              // Whole_Clip_Fallback — the CURRENT behavior, byte-for-byte
              // unchanged: send the WHOLE current artifact to Omni.
              genResult = await generativeVideo.editVideo({
                projectId: input.projectId,
                workspaceId: input.workspaceId,
                userId: input.userId,
                jobId,
                inputVersionId,
                sourceStorageKey: currentStorageKey,
                sourceFileName: currentFileName,
                instruction,
                kind: gop.kind,
                apiKey: input.apiKey,
                onProgress: onGenProgress,
              });
            } else {
              // One or more localized windows → reuse the EXISTING segment-scoped
              // path (trim → editVideo(Omni) → splice) per window, then splice all
              // edited windows back into a SINGLE timeline (Req 7.1–7.3).
              emitStep('rendering', 'Editing the detected regions with Google\u2026', unitPercent());
              const localized = await runLocalizedWindows(resolution.windows, {
                editor,
                generativeVideo,
                projectId: input.projectId,
                workspaceId: input.workspaceId,
                userId: input.userId,
                jobId,
                generateJobId,
                inputVersionId,
                currentStorageKey,
                currentFileName,
                effectiveDurationMs,
                instruction,
                kind: gop.kind,
                apiKey: input.apiKey,
                targetAspectRatio: intent.targetAspectRatio,
                onGenProgress,
                onNote: (status) => emitStep('rendering', status, unitPercent()),
                log,
              });
              genResult = localized.result;
              appliedLabelOverride = localized.labelOverride;
            }
          } else {
            const { startMs, endMs } = scope.range;
            trace.event('exec.segment', {
              engine: 'gemini-omni-flash',
              usesGenerative: true,
              scope: 'explicit-range',
              startMs,
              endMs,
              segmentMs: endMs - startMs,
              coversWholeClip: startMs <= 0 && endMs >= effectiveDurationMs,
            });
            emitStep('rendering', 'Editing the selected part with Google\u2026', unitPercent());

            // 1) Cut JUST the targeted segment out of the current artifact (reuses
            //    the deterministic editor's trim op — no new ffmpeg).
            const segment = await editor.execute({
              projectId: input.projectId,
              workspaceId: input.workspaceId,
              userId: input.userId,
              jobId: generateJobId(),
              inputVersionId,
              sourceStorageKey: currentStorageKey,
              sourceFileName: currentFileName,
              operation: { kind: 'trim', params: { startMs, endMs } },
            });

            // 2) Send ONLY that segment to Omni Flash.
            const edited = await generativeVideo.editVideo({
              projectId: input.projectId,
              workspaceId: input.workspaceId,
              userId: input.userId,
              jobId,
              inputVersionId,
              sourceStorageKey: segment.storageKey,
              sourceFileName: `${segment.artifact.artifactId}.mp4`,
              instruction,
              kind: gop.kind,
              apiKey: input.apiKey,
              onProgress: onGenProgress,
            });

            if (edited.outcome !== 'rendered') {
              // No-Mock (Req 23): the segment edit returned no video — surface the
              // honest outcome and do NOT splice. The timeline stays the last good
              // artifact (or the honest degrade when this is the only op).
              genResult = edited;
            } else {
              // 3) Splice: [ head (0..startMs)?, editedSegment, tail (endMs..dur)? ].
              //    Head/tail are produced by REUSING the trim op; the concat is the
              //    existing executeAssembly (no new ffmpeg).
              const pieces: Array<{ storageKey: string; fileName: string }> = [];
              if (startMs > 0) {
                const head = await editor.execute({
                  projectId: input.projectId,
                  workspaceId: input.workspaceId,
                  userId: input.userId,
                  jobId: generateJobId(),
                  inputVersionId,
                  sourceStorageKey: currentStorageKey,
                  sourceFileName: currentFileName,
                  operation: { kind: 'trim', params: { startMs: 0, endMs: startMs } },
                });
                pieces.push({
                  storageKey: head.storageKey,
                  fileName: `${head.artifact.artifactId}.mp4`,
                });
              }
              pieces.push({
                storageKey: edited.storageKey,
                fileName: `${edited.artifactId}.mp4`,
              });
              if (endMs < effectiveDurationMs) {
                const tail = await editor.execute({
                  projectId: input.projectId,
                  workspaceId: input.workspaceId,
                  userId: input.userId,
                  jobId: generateJobId(),
                  inputVersionId,
                  sourceStorageKey: currentStorageKey,
                  sourceFileName: currentFileName,
                  operation: { kind: 'trim', params: { startMs: endMs, endMs: effectiveDurationMs } },
                });
                pieces.push({
                  storageKey: tail.storageKey,
                  fileName: `${tail.artifact.artifactId}.mp4`,
                });
              }

              if (pieces.length === 1) {
                // The edit covered the whole clip (no head, no tail) — use the
                // edited segment directly, no assembly needed.
                genResult = edited;
              } else {
                const spliceAspect = intent.targetAspectRatio;
                const dims =
                  (spliceAspect ? dimensionsForAspect(spliceAspect) : null) ?? {
                    width: EXPORT_PROFILES.vertical_1080p.width,
                    height: EXPORT_PROFILES.vertical_1080p.height,
                  };
                const assembled = await editor.executeAssembly({
                  projectId: input.projectId,
                  workspaceId: input.workspaceId,
                  userId: input.userId,
                  jobId: generateJobId(),
                  inputVersionId,
                  sources: pieces,
                  targetWidth: dims.width,
                  targetHeight: dims.height,
                  fps: EXPORT_PROFILES.vertical_1080p.fps,
                });
                genResult = {
                  outcome: 'rendered',
                  artifactId: assembled.artifact.artifactId,
                  storageKey: assembled.storageKey,
                  mimeType: edited.mimeType,
                  provider: edited.provider,
                  model: edited.model,
                };
              }
              trace.event('exec.segment.splice', {
                pieces: pieces.length,
                spliced: pieces.length > 1,
                hasHead: startMs > 0,
                hasTail: endMs < effectiveDurationMs,
              });
              appliedLabelOverride = `AI edit (${formatTimestamp(startMs)}\u2013${formatTimestamp(endMs)})`;
            }
          }
        }

        trace.event('exec.generative', {
          engine: isGenerateKind(gop.kind) ? 'veo' : 'gemini-omni-flash',
          usesGenerative: true,
          kind: gop.kind,
          outcome: genResult.outcome,
          label: appliedLabelOverride,
          artifactId: genResult.outcome === 'rendered' ? genResult.artifactId : null,
          // Capture the provider's actual reason on any non-rendered outcome so
          // the debug trace explains WHY the AI step failed (model error, no
          // video returned, timeout, not-configured, safety filter, etc.).
          providerMessage:
            genResult.outcome === 'rendered'
              ? null
              : (genResult as { message?: string }).message ?? null,
          // Raw provider error (truncated), for diagnosis only — not user-facing.
          providerDetail:
            genResult.outcome === 'rendered'
              ? null
              : (genResult as { detail?: string }).detail ?? null,
        });

        if (genResult.outcome === 'rendered') {
          // Advance the chain: the generated/edited artifact becomes the next input.
          currentStorageKey = genResult.storageKey;
          currentFileName = `${genResult.artifactId}.mp4`;
          finalArtifactId = genResult.artifactId;
          finalKind = gop.kind;
          appliedLabels.push(appliedLabelOverride ?? operationLabel(gop));
          // ONLY 'rendered' means the provider actually returned video bytes that
          // became an artifact → tick. Every other outcome (needs_async,
          // clarification, error) leaves this step un-ticked, whether it ends the
          // turn or degrades non-fatally below.
          markStepDone(gop);
        } else if (finalArtifactId === null) {
          // The generative op was the ONLY executable op and it degraded — return
          // the honest outcome (needs_async/error/clarification), never fabricate.
          log?.info?.('Generative-only turn degraded honestly (no artifact)', {
            component: COMPONENT,
            projectId: input.projectId,
            kind: gop.kind,
            outcome: genResult.outcome,
          });
          if (genResult.outcome === 'needs_async') {
            trace.end('needs_async', { stage: 'generative', kind: gop.kind });
            return { outcome: 'needs_async', kind: gop.kind, message: genResult.message };
          }
          if (genResult.outcome === 'clarification') {
            trace.end('clarification', { stage: 'generative', kind: gop.kind });
            return { outcome: 'clarification', message: genResult.message };
          }
          trace.end('error', { stage: 'generative', kind: gop.kind });
          return { outcome: 'error', message: genResult.message };
        } else {
          // A prior op already produced an artifact — keep it, note the honest skip.
          generativeSkipNote = genResult.message;
          log?.info?.('Generative op skipped (non-fatal); keeping the last rendered artifact', {
            component: COMPONENT,
            projectId: input.projectId,
            kind: gop.kind,
            outcome: genResult.outcome,
            finalArtifactId,
          });
        }
        completedUnits += 1;
      }
    }

    // ── Caption burn-in as the LAST step — BEST-EFFORT / NON-FATAL ────────────
    // Transcribe the CURRENT chained source (the graded intermediate if one was
    // produced, else the original) and burn captions onto it. No-Mock (Req 23):
    // we never fabricate captions. If transcription throws or finds no speech we
    // SKIP captions and keep the last rendered artifact (with an honest note) —
    // unless captions is the ONLY executable op, in which case we surface the
    // honest error (hard failure) or clarification (no speech).
    if (captionOp) {
      // PROVIDED-TEXT PATH (confirmed fix): when the user supplied the exact
      // words they want on screen (a quoted/explicit phrase in their message),
      // burn THAT text across the whole clip instead of running speech-to-text.
      // Whisper only transcribes whatever speech is present, so on a mostly-silent
      // clip it emits a single ~1-2s cue — the "captions cover 1-2 seconds / don't
      // transcribe properly" bug. The user already told us the words, so this is
      // the honest, correct behavior: no OpenAI cost and no dependence on speech.
      // See `extractProvidedCaptionText` / `buildProvidedCaptionSegments` (pure).
      const providedCaptionText = extractProvidedCaptionText(input.message);

      let segments: CaptionSegment[] | null = null;
      let transcriptionError: string | null = null;
      let captionSource: 'provided' | 'transcription' = 'transcription';

      if (providedCaptionText) {
        const provided = buildProvidedCaptionSegments(providedCaptionText, effectiveDurationMs);
        if (provided.length > 0) {
          captionSource = 'provided';
          segments = provided;
          // Skip Whisper entirely — go straight to the burn-in render below.
          emitStep('rendering', 'Adding your captions\u2026', unitPercent(), captionOp);
          log?.info?.('Using user-provided caption text (transcription skipped)', {
            component: COMPONENT,
            projectId: input.projectId,
            cueCount: provided.length,
            durationMs: effectiveDurationMs,
          });
        } else {
          // Degenerate phrase (empty after normalisation) — fall back honestly.
          log?.info?.('Provided caption phrase was unusable; falling back to transcription', {
            component: COMPONENT,
            projectId: input.projectId,
          });
        }
      }

      if (captionSource === 'transcription') {
        // No usable provided text → transcribe the CURRENT chained source
        // (unchanged behavior: Whisper → segments → burn-in, honest degrade).
        emitStep('transcribing', 'Transcribing audio\u2026', unitPercent(), captionOp);
        try {
          segments = await transcriber.transcribeSource({
            storageKey: currentStorageKey,
            sourceId: source.sourceId,
            fileName: currentFileName,
          });
        } catch (err) {
          transcriptionError =
            err instanceof TranscriptionError
              ? err.message
              : 'I could not transcribe the audio to caption this video. Your credits were not charged.';
          log?.warn?.('Caption transcription failed', {
            component: COMPONENT,
            projectId: input.projectId,
            code: err instanceof TranscriptionError ? err.code : 'TRANSCRIPTION_FAILED',
            captionOnly: finalArtifactId === null,
          });
        }
      }

      const hardFailure = transcriptionError !== null;
      const noSpeech = !hardFailure && (!segments || segments.length === 0);
      // DIAGNOSTICS ONLY (no behavior change): when captions came from speech
      // transcription, record the span the returned segments actually cover vs
      // the clip duration they SHOULD cover, so one real trace shows the
      // coverage gap directly (root-causing "captions only cover ~2s"). Computed
      // purely from the `segments` already in scope — no extra transcriber call.
      let transcriptionSpanDiagnostics: {
        effectiveDurationMs: number;
        mappedSpanMs: { minStartMs: number | null; maxEndMs: number | null };
        coverageRatio: number | null;
        segmentsWithWords: number;
      } | null = null;
      if (captionSource === 'transcription') {
        const cues = segments ?? [];
        let minStartMs: number | null = null;
        let maxEndMs: number | null = null;
        let segmentsWithWords = 0;
        for (const c of cues) {
          minStartMs = minStartMs === null ? c.startMs : Math.min(minStartMs, c.startMs);
          maxEndMs = maxEndMs === null ? c.endMs : Math.max(maxEndMs, c.endMs);
          if (Array.isArray(c.words) && c.words.length > 0) segmentsWithWords += 1;
        }
        const coverageRatio =
          minStartMs !== null && maxEndMs !== null && effectiveDurationMs > 0
            ? Math.round(((maxEndMs - minStartMs) / effectiveDurationMs) * 100) / 100
            : null;
        transcriptionSpanDiagnostics = {
          effectiveDurationMs,
          mappedSpanMs: { minStartMs, maxEndMs },
          coverageRatio,
          segmentsWithWords,
        };
      }
      trace.event('exec.captions', {
        engine: captionSource === 'provided' ? 'deterministic+provided' : 'deterministic+transcription',
        usesGenerative: false,
        // Whether the burned captions came from the user's supplied text or from
        // speech transcription, so future debugging can tell the paths apart.
        source: captionSource,
        hardFailure,
        noSpeech,
        cueCount: segments?.length ?? 0,
        ...(transcriptionSpanDiagnostics ?? {}),
      });

      if (hardFailure || noSpeech) {
        if (finalArtifactId === null) {
          // Captions were the ONLY executable op — be honest, don't fabricate.
          if (hardFailure) {
            trace.end('error', { stage: 'captions', reason: 'transcription_failed' });
            return { outcome: 'error', message: transcriptionError! };
          }
          trace.end('clarification', { stage: 'captions', reason: 'no_speech' });
          return {
            outcome: 'clarification',
            message:
              'I couldn\u2019t detect any speech to caption in this video. If it has spoken audio, make sure that track is included, or tell me the exact words you\u2019d like on screen (for example: add captions saying "your text here").',
          };
        }
        // A pixel op already rendered — skip captions, keep that artifact, note it.
        captionSkipNote = hardFailure
          ? 'Captions were skipped because transcription was unavailable.'
          : 'Captions were skipped because I couldn\u2019t detect clear speech.';
        log?.info?.('Captions skipped (non-fatal); keeping the last rendered artifact', {
          component: COMPONENT,
          projectId: input.projectId,
          reason: hardFailure ? 'transcription_failed' : 'no_speech',
          finalArtifactId,
        });
      } else {
        // Real speech → burn captions onto the CURRENT chained source.
        const presetKey = captionPresetKey(intent, project?.targetPlatform ?? null);
        const assPresetKey = captionAssPresetKey(input.message);
        const dimensions = captionDimensions(presetKey);
        emitStep('rendering', 'Rendering captions\u2026', unitPercent() + 6, captionOp);

        const captionJobId = generateJobId();
        const captionArtifactId = await renderAndPersistCaptions({
          captionRenderer,
          storage,
          artifactRepository,
          log: log ?? defaultLogger,
          tempDir: path.join(os.tmpdir(), 'veefore-video-editor-captions'),
          // The chained source: graded intermediate when present, else original.
          source: {
            sourceId: source.sourceId,
            storageKey: currentStorageKey,
            fileName: currentFileName,
            durationMs: effectiveDurationMs,
          },
          segments: segments!,
          presetKey,
          assPresetKey,
          dimensions,
          projectId: input.projectId,
          workspaceId: input.workspaceId,
          userId: input.userId,
          jobId: captionJobId,
          inputVersionId,
        });
        finalArtifactId = captionArtifactId;
        finalKind = 'caption';
        appliedLabels.push(operationLabel(captionOp));
        // Captions were really burned in and persisted → tick the caption step.
        // The hard-failure / no-speech branch above never ticks.
        markStepDone(captionOp);
      }
      completedUnits += 1;
    }

    // ── Outcome: ≥1 op produced a final artifact → rendered (final id/version) ─
    if (finalArtifactId) {
      // Nothing is being worked on any more, so the active-step pointer is
      // cleared: the card must not keep a "Step N of M" counter alive on a
      // finished turn.
      activeStepIndex = null;
      emit({ phase: 'complete', status: 'Done.', percent: 100, plan: planSummary });

      const appliedSummary =
        appliedLabels.length > 0 ? appliedLabels.join(', ') : 'Applied your edit';
      let summary = `${appliedSummary} \u2014 your edited video is ready below.`;
      if (assemblySkipNote) summary += ` ${assemblySkipNote}`;
      if (highlightSkipNote) summary += ` ${highlightSkipNote}`;
      if (autoCutSkipNote) summary += ` ${autoCutSkipNote}`;
      if (generativeSkipNote) summary += ` ${generativeSkipNote}`;
      if (captionSkipNote) summary += ` ${captionSkipNote}`;

      log?.info?.('Chat-driven chained edit rendered a final artifact', {
        component: COMPONENT,
        projectId: input.projectId,
        versionId,
        artifactId: finalArtifactId,
        kind: finalKind,
        steps: appliedLabels.length,
        captionSkipped: captionSkipNote !== null,
      });

      trace.end('rendered', {
        versionId,
        artifactId: finalArtifactId,
        finalKind: finalKind ?? 'edit',
        durationMs: effectiveDurationMs,
        appliedLabels,
        skips: {
          assembly: assemblySkipNote,
          highlight: highlightSkipNote,
          autoCut: autoCutSkipNote,
          generative: generativeSkipNote,
          caption: captionSkipNote,
        },
      });

      return {
        outcome: 'rendered',
        versionId,
        artifactId: finalArtifactId,
        kind: finalKind ?? 'edit',
        durationMs: effectiveDurationMs,
        summary,
      };
    }

    // Unreachable in practice (the no-executable case returns needs_async above,
    // and caption-only failures return error/clarification), but stay honest.
    trace.end('no_op', { stage: 'final', reason: 'no_final_artifact' });
    return {
      outcome: 'no_op',
      message:
        'I could not turn that into a concrete edit. Try a specific instruction like "reframe to 9:16", "add captions", "speed it up 2x", or "apply a cinematic look".',
    };
  } catch (err) {
    log?.error?.('Chat-driven video edit turn failed', err as Error, {
      component: COMPONENT,
      projectId: input.projectId,
      workspaceId: input.workspaceId,
    });
    trace.end('error', { stage: 'exception', error: String((err as Error)?.message || err) });
    return {
      outcome: 'error',
      message: 'The edit could not be completed this time. Your credits were not charged.',
    };
  }
}

/** Turn an intent-router clarification reason into a friendly chat question. */
function clarificationMessage(reason: string): string {
  const base =
    'I want to get this right \u2014 what edit would you like on the video? For example: reframe to 9:16, trim the first few seconds, speed it up 2x, add fades, or normalize the audio.';
  if (typeof reason === 'string' && reason.trim().length > 0) {
    return base;
  }
  return base;
}
