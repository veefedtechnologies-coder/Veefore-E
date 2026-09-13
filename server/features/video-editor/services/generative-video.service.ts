/**
 * Generative_Video_Service — Track 3 GENERATIVE video edits, powered by GOOGLE
 * (Gemini Omni Flash for editing existing clips + Veo for generation/extension)
 * via the installed `@google/genai` SDK.
 *
 * This service runs INLINE (no Redis worker): the chat driver calls it as a
 * deferred step, polling the long-running Veo operation and streaming progress
 * back into the chat. It mirrors the existing Google client construction in
 * `server/services/gemini-image.service.ts` (user's own Google AI Studio key →
 * env `GEMINI_IMAGE_API_KEY`/`GOOGLE_GENAI_API_KEY`) and reuses the deterministic
 * editor's artifact/storage patterns (download source bytes from storage, persist
 * exactly ONE output artifact through the ArtifactRepository with full provenance).
 *
 * No-Mock discipline (Req 23) — CRITICAL: this service NEVER fabricates a video.
 * A real artifact is surfaced ONLY when Google actually returns video bytes
 * (inline base64 or a downloadable file/uri). When Google returns no video (model
 * not available to the key, safety-filtered via `raiMediaFilteredCount` /
 * `raiMediaFilteredReasons`, empty parts, an operation error, or a poll timeout),
 * the service returns an HONEST outcome (`needs_async` / `error` / `clarification`)
 * explaining what happened — no placeholder bytes are ever written.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';

import { GoogleGenAI } from '@google/genai';
import type {
  GenerateVideosParameters,
  GenerateVideosOperation,
  GenerateContentParameters,
  GenerateContentResponse,
  UploadFileParameters,
  DownloadFileParameters,
  File as GenaiFile,
  Part,
} from '@google/genai';

import { logger as defaultLogger } from '../../../config/logger';
import { getStorageService, type IStorageService } from '../../storage/services/storage.service';
import {
  getArtifactRepository,
  type ArtifactRepository,
} from './artifact-repository.service';

const COMPONENT = 'videoEditor.GenerativeVideoService';

// ---------------------------------------------------------------------------
// Env / model configuration (mirrors gemini-image.service.ts key resolution)
// ---------------------------------------------------------------------------

/**
 * The Google key used to construct the video client, mirroring the image
 * capability: reuse the shared Google AI Studio key. Prefers the same env keys
 * the image service prefers so ONE key powers image + video, then the generic
 * `GOOGLE_GENAI_API_KEY`.
 */
export function generativeVideoApiKey(): string {
  return (
    process.env.GEMINI_IMAGE_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY ||
    ''
  );
}

/** Default Veo model id for generation/extension (env-overridable). */
export function veoModelId(): string {
  return process.env.GEMINI_VEO_MODEL || 'veo-3.1-generate-preview';
}

/** Default Gemini Omni Flash model id for editing existing clips (env-overridable). */
export function omniVideoModelId(): string {
  return process.env.GEMINI_OMNI_VIDEO_MODEL || 'gemini-omni-flash-preview';
}

/** Default cheap Gemini vision model id for edit localization (env-overridable). */
export function localizerModelId(): string {
  return process.env.GEMINI_LOCALIZER_MODEL || 'gemini-2.5-flash';
}

/** Whether the generative video capability is configured (a Google key exists). */
export function isGenerativeVideoConfigured(): boolean {
  return !!generativeVideoApiKey();
}

// ---------------------------------------------------------------------------
// Minimal structural client interface (so the service is unit-testable)
// ---------------------------------------------------------------------------

/**
 * The subset of the `@google/genai` client the service uses. Kept structural so
 * unit tests inject a fake without any real network access (No real network in
 * tests). The real client (`GoogleGenAI`) satisfies this shape.
 */
export interface GenerativeVideoClient {
  models: {
    generateVideos(params: GenerateVideosParameters): Promise<GenerateVideosOperation>;
    generateContent(params: GenerateContentParameters): Promise<GenerateContentResponse>;
  };
  operations: {
    getVideosOperation(params: { operation: GenerateVideosOperation }): Promise<GenerateVideosOperation>;
  };
  files: {
    upload(params: UploadFileParameters): Promise<GenaiFile>;
    get(params: { name: string }): Promise<GenaiFile>;
    download(params: DownloadFileParameters): Promise<void>;
  };
}

/** Factory that builds a client from an (optional) per-user key, else the env key. */
export type GenerativeVideoClientFactory = (apiKey?: string) => GenerativeVideoClient;

/** Default factory — mirrors gemini-image.service.ts (user key → env key). */
const defaultClientFactory: GenerativeVideoClientFactory = (apiKey?: string) => {
  const key = apiKey || generativeVideoApiKey();
  // Constructed the same way the image capability constructs its client.
  return new GoogleGenAI({ apiKey: key }) as unknown as GenerativeVideoClient;
};

// ---------------------------------------------------------------------------
// Progress + result contracts
// ---------------------------------------------------------------------------

/** A generative-video progress phase, streamed to the chat driver. */
export type GenerativeVideoPhase =
  | 'uploading'
  | 'rendering'
  | 'downloading'
  | 'complete'
  | 'error';

/** Progress callback signature (phase, human status, integer percent 0..100). */
export type GenerativeVideoProgress = (
  phase: GenerativeVideoPhase,
  status: string,
  percent: number,
) => void;

/**
 * The outcome of a generative video operation. `rendered` is the ONLY outcome
 * that carries a real artifact — every other outcome is an honest degrade with a
 * user-facing message and NO artifact created (No-Mock, Req 23).
 */
export type GenerativeVideoResult =
  | {
      outcome: 'rendered';
      artifactId: string;
      storageKey: string;
      mimeType: string;
      provider: string;
      model: string;
    }
  | { outcome: 'needs_async'; kind: string; message: string; detail?: string }
  | { outcome: 'clarification'; message: string; detail?: string }
  | { outcome: 'error'; message: string; detail?: string };

/** Input to {@link GenerativeVideoService.editVideo} (Omni Flash edit of a clip). */
export interface EditVideoInput {
  projectId: string;
  workspaceId: string;
  userId: string;
  jobId: string;
  inputVersionId: string;
  /** Storage key of the source clip to edit (the current chained artifact). */
  sourceStorageKey: string;
  /** Source file name (used to derive extension + mime). */
  sourceFileName: string;
  /** The edit instruction, e.g. "remove the person in the background". */
  instruction: string;
  /** Plan kind used for provenance/labelling (e.g. `object_removal`). */
  kind?: string;
  /** The user's own Google AI Studio key, if set (else the env key is used). */
  apiKey?: string;
  /** Streams progress into the chat. */
  onProgress?: GenerativeVideoProgress;
  signal?: AbortSignal;
}

/** A pre-resolved first-frame image for image-to-video generation. */
export interface FirstFrameImage {
  /** base64-encoded image bytes. */
  base64: string;
  mimeType: string;
}

/** Input to {@link GenerativeVideoService.generateVideo} (Veo text/image → video). */
export interface GenerateVideoInput {
  projectId: string;
  workspaceId: string;
  userId: string;
  jobId: string;
  inputVersionId: string;
  /** The generation prompt (text-to-video / guidance). */
  prompt: string;
  /** Optional first-frame image for image-to-video. */
  firstFrame?: FirstFrameImage;
  /** Target aspect ratio, e.g. `9:16` (Veo supports 16:9 and 9:16). */
  aspectRatio?: string;
  /** Requested clip duration in seconds. */
  durationSeconds?: number;
  /** Whether to generate audio along with the video. */
  generateAudio?: boolean;
  /** Plan kind used for provenance/labelling (e.g. `generate`, `generate_broll`). */
  kind?: string;
  apiKey?: string;
  onProgress?: GenerativeVideoProgress;
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_MAX_WAIT_MS = 300_000; // ~5 min inline budget
const DEFAULT_POLL_INTERVAL_MS = 8_000;

/** Default sleep — overridable in tests so polling loops resolve instantly. */
function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Extract the FIRST returned video part from a generateContent response, if any. */
function extractInlineVideoPart(
  response: GenerateContentResponse | undefined,
): { data: string; mimeType: string } | null {
  const parts = (response as unknown as { candidates?: Array<{ content?: { parts?: Part[] } }> })
    ?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  for (const part of parts) {
    const inline = (part as { inlineData?: { data?: string; mimeType?: string } }).inlineData;
    const mimeType = inline?.mimeType;
    const data = inline?.data;
    if (data && mimeType && mimeType.toLowerCase().startsWith('video/')) {
      return { data, mimeType };
    }
  }
  return null;
}

/** Extract the FIRST returned fileData video part from a response, if any. */
function extractFileDataVideoPart(
  response: GenerateContentResponse | undefined,
): { fileUri: string; mimeType: string } | null {
  const parts = (response as unknown as { candidates?: Array<{ content?: { parts?: Part[] } }> })
    ?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  for (const part of parts) {
    const fileData = (part as { fileData?: { fileUri?: string; mimeType?: string } }).fileData;
    const fileUri = fileData?.fileUri;
    const mimeType = fileData?.mimeType;
    if (fileUri && mimeType && mimeType.toLowerCase().startsWith('video/')) {
      return { fileUri, mimeType };
    }
  }
  return null;
}

/** Whether any TEXT part was returned (used to explain an honest degrade). */
function extractText(response: GenerateContentResponse | undefined): string {
  const parts = (response as unknown as { candidates?: Array<{ content?: { parts?: Part[] } }> })
    ?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  let text = '';
  for (const part of parts) {
    const t = (part as { text?: string }).text;
    if (typeof t === 'string') text += t;
  }
  return text;
}

/**
 * Human-readable "retry in …" window parsed out of a provider quota error.
 *
 * Google's 429 bodies carry e.g. `Please retry in 17h24m15.314736557s.` — we
 * surface just the coarse part ("about 17 hours") so the user knows whether this
 * is a minutes-long blip or a next-day reset. Returns '' when absent/unparsable.
 */
export function formatProviderRetryAfter(message: string): string {
  const m = /retry in\s+(?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i.exec(message || '');
  if (!m) return '';
  const hours = Number(m[1] || 0);
  const minutes = Number(m[2] || 0);
  const seconds = Math.round(Number(m[3] || 0));
  if (hours > 0) {
    // Round to the nearest hour; ≥30 remaining minutes counts as another hour.
    const h = hours + (minutes >= 30 ? 1 : 0);
    return `${h} hour${h === 1 ? '' : 's'}`;
  }
  if (minutes > 0) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  if (seconds > 0) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  return '';
}

/** Mime → file extension for the temp/download path (defaults to .mp4). */
function extForMime(mimeType: string | undefined): string {
  const m = (mimeType || '').toLowerCase();
  if (m.includes('webm')) return '.webm';
  if (m.includes('quicktime') || m.includes('mov')) return '.mov';
  return '.mp4';
}

// ---------------------------------------------------------------------------
// Interactions API (video editing) — types + response parsing
// ---------------------------------------------------------------------------

/** Normalized outcome of one Interactions API edit call. */
interface InteractionEditResult {
  /** Terminal (or 'timeout') interaction status. */
  status: string;
  /** The edited video bytes, ONLY when the model actually returned video. */
  video?: { buffer: Buffer; mimeType: string };
  /** Any text the model returned instead of video (used to explain a degrade). */
  text?: string;
  /** Provider diagnostic detail for the debug trace (never shown to users). */
  detail?: string;
}

/** Parse JSON without throwing (returns undefined on malformed input). */
function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Walk an Interactions response for the FIRST returned video content block.
 * The SDK-style convenience field `output_video` is checked first, then every
 * step's `content[]` (model_output steps carry the generated media). Inline
 * base64 `data` is required — a bare `uri` without bytes is treated as "no
 * usable video" so we never fabricate an artifact.
 */
function extractInteractionVideo(
  interaction: any,
): { buffer: Buffer; mimeType: string } | null {
  const fromBlock = (b: any): { buffer: Buffer; mimeType: string } | null => {
    if (!b || typeof b !== 'object') return null;
    const type = String(b.type || '').toLowerCase();
    const mime = String(b.mime_type || b.mimeType || '').toLowerCase();
    const data = b.data;
    const isVideo = type === 'video' || mime.startsWith('video/');
    if (isVideo && typeof data === 'string' && data.length > 0) {
      const buffer = Buffer.from(data, 'base64');
      if (buffer.length > 0) {
        return { buffer, mimeType: mime.startsWith('video/') ? mime : 'video/mp4' };
      }
    }
    return null;
  };

  const direct = fromBlock(interaction?.output_video);
  if (direct) return direct;

  const steps = Array.isArray(interaction?.steps) ? interaction.steps : [];
  for (const step of steps) {
    const content = Array.isArray(step?.content) ? step.content : [];
    for (const block of content) {
      const v = fromBlock(block);
      if (v) return v;
    }
  }
  return null;
}

/**
 * Walk an Interactions response for the FIRST returned video URI (delivery=uri).
 * For outputs larger than ~4MB Google returns a Google-hosted file URI instead
 * of inline base64 (see the Omni docs "Retrieving videos with an URI"). The URI
 * looks like `https://generativelanguage.googleapis.com/v1beta/files/<id>:download?alt=media`.
 */
function extractInteractionVideoUri(
  interaction: any,
): { uri: string; mimeType: string } | null {
  const fromBlock = (b: any): { uri: string; mimeType: string } | null => {
    if (!b || typeof b !== 'object') return null;
    const type = String(b.type || '').toLowerCase();
    const mime = String(b.mime_type || b.mimeType || '').toLowerCase();
    const uri = typeof b.uri === 'string' ? b.uri : '';
    const isVideo = type === 'video' || mime.startsWith('video/');
    if (isVideo && uri && /\/files\//.test(uri)) {
      return { uri, mimeType: mime.startsWith('video/') ? mime : 'video/mp4' };
    }
    return null;
  };

  const direct = fromBlock(interaction?.output_video);
  if (direct) return direct;

  const steps = Array.isArray(interaction?.steps) ? interaction.steps : [];
  for (const step of steps) {
    const content = Array.isArray(step?.content) ? step.content : [];
    for (const block of content) {
      const v = fromBlock(block);
      if (v) return v;
    }
  }
  return null;
}

/** Concatenate any text the interaction returned (used to explain a degrade). */
function extractInteractionText(interaction: any): string {
  if (typeof interaction?.output_text === 'string' && interaction.output_text) {
    return interaction.output_text;
  }
  const steps = Array.isArray(interaction?.steps) ? interaction.steps : [];
  let text = '';
  for (const step of steps) {
    const content = Array.isArray(step?.content) ? step.content : [];
    for (const block of content) {
      if (block && block.type === 'text' && typeof block.text === 'string') {
        text += block.text;
      }
    }
  }
  return text;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/** Injectable collaborators (defaulted for production, overridable in tests). */
export interface GenerativeVideoDeps {
  clientFactory?: GenerativeVideoClientFactory;
  logger?: Pick<typeof defaultLogger, 'info' | 'warn' | 'error' | 'debug'>;
  storage?: IStorageService;
  artifactRepository?: Pick<ArtifactRepository, 'createArtifact'>;
  /** Sleep used between operation polls (overridden in tests to resolve fast). */
  sleep?: (ms: number) => Promise<void>;
  /** Max total wait for a long-running Veo operation (ms). */
  maxWaitMs?: number;
  /** Interval between operation polls (ms). */
  pollIntervalMs?: number;
  /** Temp directory root for source/output scratch files. */
  tempDir?: string;
  /** HTTP transport for the Interactions API (tests inject a fake — no real network). */
  interactionsFetch?: typeof fetch;
}

/**
 * The generative video capability. Construct with defaults in production, or with
 * a mocked client factory + fast `sleep` in unit tests. All temp files are
 * cleaned up in `finally`; provider errors are mapped to honest messages and
 * never thrown raw to the user.
 */
export class GenerativeVideoService {
  private readonly clientFactory: GenerativeVideoClientFactory;
  private readonly log: Pick<typeof defaultLogger, 'info' | 'warn' | 'error' | 'debug'>;
  private readonly storage: IStorageService;
  private readonly artifactRepository: Pick<ArtifactRepository, 'createArtifact'>;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxWaitMs: number;
  private readonly pollIntervalMs: number;
  private readonly tempRoot: string;
  /** HTTP transport for the Interactions API (injectable so tests use no real network). */
  private readonly httpFetch: typeof fetch;

  constructor(deps: GenerativeVideoDeps = {}) {
    this.clientFactory = deps.clientFactory ?? defaultClientFactory;
    this.log = deps.logger ?? defaultLogger;
    this.storage = deps.storage ?? getStorageService();
    this.artifactRepository = deps.artifactRepository ?? getArtifactRepository();
    this.sleep = deps.sleep ?? defaultSleep;
    this.maxWaitMs = deps.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
    this.pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.tempRoot = deps.tempDir ?? path.join(os.tmpdir(), 'veefore-generative-video');
    this.httpFetch = deps.interactionsFetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  }

  // -------------------------------------------------------------------------
  // Omni Flash — edit an existing clip
  // -------------------------------------------------------------------------

  /**
   * Edit an existing source clip with Gemini Omni Flash. Downloads the source
   * bytes, uploads them via the Files API (polling until ACTIVE), calls
   * `generateContent` with the file + instruction, and — ONLY when the model
   * returns real video bytes (inline base64 or a downloadable fileData) —
   * persists exactly ONE artifact with `provider='gemini-omni-flash'` provenance.
   * Any no-video / safety / error / timeout path degrades honestly.
   */
  async editVideo(input: EditVideoInput): Promise<GenerativeVideoResult> {
    if (!isGenerativeVideoConfigured() && !input.apiKey) {
      return {
        outcome: 'needs_async',
        kind: input.kind ?? 'generative_edit',
        message:
          'Generative video editing is not configured on this workspace yet. Add your Google AI Studio key in Settings → AI Configuration.',
      };
    }

    const model = omniVideoModelId();
    const workId = randomUUID();
    const workDir = path.join(this.tempRoot, workId);
    const inExt = path.extname(input.sourceFileName) || '.mp4';
    const inputPath = path.join(workDir, `input${inExt}`);
    const downloadPath = path.join(workDir, 'edited.mp4');

    try {
      await fs.promises.mkdir(workDir, { recursive: true });
      const ai = this.clientFactory(input.apiKey);

      // 1) Read the immutable source bytes into a temp input file.
      input.onProgress?.('uploading', 'Preparing the clip for AI editing\u2026', 20);
      const dl = await this.storage.downloadFile(input.sourceStorageKey);
      await fs.promises.writeFile(inputPath, dl.buffer);
      const mimeType = dl.contentType && dl.contentType.startsWith('video/') ? dl.contentType : 'video/mp4';

      // 2) Upload the source via the Files API for robustness (large clips).
      const uploaded = await ai.files.upload({ file: inputPath, config: { mimeType } });
      const fileName = uploaded?.name;
      let fileUri = uploaded?.uri;

      // 3) Poll files.get until the uploaded file is ACTIVE (PROCESSING → ACTIVE).
      if (fileName) {
        const active = await this.waitForActiveFile(ai, fileName);
        if (active === 'FAILED') {
          return {
            outcome: 'error',
            message:
              'Google could not process the source clip for AI editing. Your credits were not charged.',
          };
        }
        if (active === 'TIMEOUT') {
          return {
            outcome: 'needs_async',
            kind: input.kind ?? 'generative_edit',
            message:
              'The clip is taking longer than expected to prepare for AI editing. I\u2019ll pick this up on the background pipeline.',
          };
        }
        // Refresh the uri from the active file if we didn't get one on upload.
        if (!fileUri) {
          const got = await ai.files.get({ name: fileName }).catch(() => null);
          fileUri = got?.uri ?? fileUri;
        }
      }

      if (!fileUri) {
        return {
          outcome: 'error',
          message: 'The clip could not be prepared for AI editing. Your credits were not charged.',
        };
      }

      // 4) Ask the edit model to perform the edit via the INTERACTIONS API.
      //    Omni/edit models are served ONLY through POST /v1beta/interactions
      //    (generateContent returns 400 "This model only supports Interactions
      //    API"). We pass the uploaded file URI as a video input and request the
      //    `edit` video task with inline delivery so the result comes back as
      //    base64 bytes we can persist directly.
      input.onProgress?.('rendering', 'Generating the edit with Google\u2026', 55);
      let edit: InteractionEditResult;
      try {
        edit = await this.runInteractionEdit({
          apiKey: input.apiKey,
          model,
          fileUri,
          mimeType,
          instruction: input.instruction,
          onProgress: input.onProgress,
          signal: input.signal,
        });
      } catch (err) {
        return this.mapProviderError(err, input.kind ?? 'generative_edit');
      }

      // 5) A REAL returned video → persist exactly one artifact.
      if (edit.video) {
        return await this.persistArtifact({
          buffer: edit.video.buffer,
          mimeType: edit.video.mimeType,
          provider: 'gemini-omni-flash',
          model,
          prompt: input.instruction,
          input,
          onProgress: input.onProgress,
        });
      }

      // 6) No video came back — degrade honestly (No-Mock, Req 23). Never fabricate.
      this.log.warn?.('Interactions edit returned no video', {
        component: COMPONENT,
        projectId: input.projectId,
        kind: input.kind,
        status: edit.status,
        hasText: (edit.text?.length ?? 0) > 0,
      });
      return {
        outcome: 'needs_async',
        kind: input.kind ?? 'generative_edit',
        detail: edit.detail,
        message:
          'The AI edit model did not return an edited video this time' +
          (edit.text ? ` (it replied with text instead).` : '.') +
          ' Your credits were not charged \u2014 I\u2019ll retry this on the background pipeline.',
      };
    } catch (err) {
      return this.mapProviderError(err, input.kind ?? 'generative_edit');
    } finally {
      await fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => {
        this.log.warn?.('Failed to clean up generative edit temp dir', {
          component: COMPONENT,
          workDir,
        });
      });
    }
  }

  // -------------------------------------------------------------------------
  // Veo — generate a new clip (text-to-video / image-to-video)
  // -------------------------------------------------------------------------

  /**
   * Generate a new clip with Veo. Starts the long-running operation, polls it to
   * completion (bounded by `maxWaitMs`), and — ONLY when Google returns real
   * video bytes — downloads them and persists exactly ONE artifact with
   * `provider='veo'` provenance. Safety filtering (`raiMediaFilteredCount`),
   * operation errors, empty responses, and poll timeouts all degrade honestly.
   */
  async generateVideo(input: GenerateVideoInput): Promise<GenerativeVideoResult> {
    if (!isGenerativeVideoConfigured() && !input.apiKey) {
      return {
        outcome: 'needs_async',
        kind: input.kind ?? 'generate',
        message:
          'Video generation is not configured on this workspace yet. Add your Google AI Studio key in Settings → AI Configuration.',
      };
    }

    const model = veoModelId();
    const workId = randomUUID();
    const workDir = path.join(this.tempRoot, workId);

    try {
      await fs.promises.mkdir(workDir, { recursive: true });
      const ai = this.clientFactory(input.apiKey);

      // 1) Build the generation request from the intent.
      const params: GenerateVideosParameters = {
        model,
        prompt: input.prompt,
        config: {
          numberOfVideos: 1,
          ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {}),
          ...(typeof input.durationSeconds === 'number' ? { durationSeconds: input.durationSeconds } : {}),
          ...(typeof input.generateAudio === 'boolean' ? { generateAudio: input.generateAudio } : {}),
        },
      };
      if (input.firstFrame?.base64 && input.firstFrame.mimeType) {
        params.image = { imageBytes: input.firstFrame.base64, mimeType: input.firstFrame.mimeType };
      }

      input.onProgress?.('rendering', 'Generating with Google\u2026', 30);

      // 2) Start the long-running operation.
      let op: GenerateVideosOperation;
      try {
        op = await ai.models.generateVideos(params);
      } catch (err) {
        return this.mapProviderError(err, input.kind ?? 'generate');
      }

      // 3) Poll to completion, bounded by maxWaitMs.
      const startedAt = Date.now();
      let polls = 0;
      while (!op.done) {
        if (Date.now() - startedAt >= this.maxWaitMs) {
          this.log.warn?.('Veo generation timed out while polling', {
            component: COMPONENT,
            projectId: input.projectId,
            kind: input.kind,
            polls,
          });
          return {
            outcome: 'needs_async',
            kind: input.kind ?? 'generate',
            message:
              'The video generation is taking longer than the inline budget allows. Your credits were not charged \u2014 I\u2019ll pick it up on the background pipeline.',
          };
        }
        await this.sleep(this.pollIntervalMs);
        polls += 1;
        input.onProgress?.('rendering', 'Generating with Google\u2026', Math.min(80, 30 + polls * 5));
        try {
          op = await ai.operations.getVideosOperation({ operation: op });
        } catch (err) {
          return this.mapProviderError(err, input.kind ?? 'generate');
        }
      }

      // 4) Operation failed → honest error (never fabricate).
      if (op.error) {
        const message = typeof op.error?.message === 'string' ? String(op.error.message) : '';
        this.log.warn?.('Veo generation operation returned an error', {
          component: COMPONENT,
          projectId: input.projectId,
          kind: input.kind,
          error: message,
        });
        return {
          outcome: 'error',
          message:
            'The video generation failed on Google\u2019s side. Your credits were not charged.' +
            (/safety|policy|blocked/i.test(message) ? ' The prompt may have been blocked by the safety filter.' : ''),
        };
      }

      // 5) Safety filtering → honest degrade (No-Mock, Req 23).
      const filteredCount = op.response?.raiMediaFilteredCount ?? 0;
      if (filteredCount > 0) {
        const reasons = Array.isArray(op.response?.raiMediaFilteredReasons)
          ? op.response!.raiMediaFilteredReasons!.join('; ')
          : '';
        this.log.warn?.('Veo generation was safety-filtered', {
          component: COMPONENT,
          projectId: input.projectId,
          kind: input.kind,
          filteredCount,
          reasons,
        });
        return {
          outcome: 'clarification',
          message:
            'That generation request was blocked by the content safety filter' +
            (reasons ? ` (${reasons}).` : '.') +
            ' Try rephrasing the prompt. Your credits were not charged.',
        };
      }

      // 6) Locate the returned video.
      const video = op.response?.generatedVideos?.[0]?.video;
      if (!video) {
        this.log.warn?.('Veo generation completed with no video output', {
          component: COMPONENT,
          projectId: input.projectId,
          kind: input.kind,
        });
        return {
          outcome: 'needs_async',
          kind: input.kind ?? 'generate',
          message:
            'The generation completed but returned no video this time. Your credits were not charged \u2014 I\u2019ll retry this on the background pipeline.',
        };
      }

      // 7) Resolve real bytes: inline base64 preferred, else download from uri.
      input.onProgress?.('downloading', 'Downloading the generated video\u2026', 88);
      const mimeType = video.mimeType && video.mimeType.startsWith('video/') ? video.mimeType : 'video/mp4';
      let buffer: Buffer | null = null;
      if (video.videoBytes) {
        buffer = Buffer.from(video.videoBytes, 'base64');
      } else if (video.uri) {
        const downloadPath = path.join(workDir, `generated${extForMime(mimeType)}`);
        // Prefer the SDK's own download so file-endpoint auth is handled for us.
        await ai.files.download({ file: video, downloadPath });
        buffer = await fs.promises.readFile(downloadPath).catch(() => null);
      }

      if (!buffer || buffer.length === 0) {
        return {
          outcome: 'needs_async',
          kind: input.kind ?? 'generate',
          message:
            'The generated video could not be downloaded this time. Your credits were not charged \u2014 I\u2019ll retry this on the background pipeline.',
        };
      }

      // 8) Persist exactly ONE artifact with Veo provenance.
      return await this.persistArtifact({
        buffer,
        mimeType,
        provider: 'veo',
        model,
        prompt: input.prompt,
        input,
        onProgress: input.onProgress,
      });
    } catch (err) {
      return this.mapProviderError(err, input.kind ?? 'generate');
    } finally {
      await fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => {
        this.log.warn?.('Failed to clean up generative generate temp dir', {
          component: COMPONENT,
          workDir,
        });
      });
    }
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /**
   * Poll `files.get` until the uploaded file is ACTIVE (or FAILED / times out).
   * Returns the terminal state string, or `'TIMEOUT'` when the budget elapses.
   */
  /**
   * Call the Gemini Interactions API to edit an existing clip.
   *
   * The Omni/edit models are served ONLY through `POST /v1beta/interactions`
   * (calling `generateContent` returns 400 "This model only supports
   * Interactions API"). We send the uploaded file URI as a `video` input with
   * `generation_config.video_config.task = "edit"`, and request inline video
   * delivery so the edited bytes come back as base64. Long edits return
   * `in_progress`/`queued`; we poll `GET /v1beta/interactions/{id}` until the
   * interaction is terminal or the inline wait budget elapses.
   *
   * Auth mirrors the SDK: the same key is sent via the `x-goog-api-key` header
   * (this is what the working image path uses), so a per-user key or the env key
   * both work unchanged. Network only — never fabricates a result.
   */
  private async runInteractionEdit(args: {
    apiKey?: string;
    model: string;
    fileUri: string;
    mimeType: string;
    instruction: string;
    onProgress?: GenerativeVideoProgress;
    signal?: AbortSignal;
  }): Promise<InteractionEditResult> {
    const key = args.apiKey || generativeVideoApiKey();
    const base = (process.env.GEMINI_INTERACTIONS_BASE_URL
      || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
    const headers = {
      'Content-Type': 'application/json',
      'x-goog-api-key': key,
    };

    const body = {
      model: args.model,
      // Match Google's documented "Edit your own videos" example exactly: the
      // uploaded clip is a `document` input (its Files API URI), followed by the
      // instruction text. We deliberately do NOT set video_config.task='edit' —
      // the model infers the edit from the presence of a source clip + prompt.
      // (Setting task='edit' triggers a stricter path that rejects `document`
      // and, with a `video` block, returns provider 500s.)
      input: [
        { type: 'document', uri: args.fileUri, mime_type: args.mimeType },
        { type: 'text', text: args.instruction },
      ],
      // URI delivery: for outputs >4MB Google returns a hosted file URI instead
      // of inline base64 (inline would hit payload-size limits). We download the
      // bytes from that URI after the interaction completes. Small outputs may
      // still arrive inline — both are handled below.
      response_format: { type: 'video', delivery: 'uri' },
    };

    // Create the interaction, retrying transient 5xx responses (Google's Omni
    // edit backend is in preview and intermittently returns 500 "Internal error
    // encountered"). 4xx are NOT retried — they fail identically every time.
    const MAX_CREATE_ATTEMPTS = 3;
    let createRes!: Awaited<ReturnType<typeof this.httpFetch>>;
    let createText = '';
    for (let attempt = 1; attempt <= MAX_CREATE_ATTEMPTS; attempt++) {
      createRes = await this.httpFetch(`${base}/interactions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: args.signal,
      });
      createText = await createRes.text();
      if (createRes.ok) break;
      const retriable = createRes.status >= 500 && attempt < MAX_CREATE_ATTEMPTS;
      if (!retriable) {
        // Surface the provider's JSON so the debug trace records the real reason.
        throw new Error(`Interactions API ${createRes.status}: ${createText.slice(0, 800)}`);
      }
      this.log.warn?.('Interactions create returned 5xx — retrying', {
        component: COMPONENT,
        status: createRes.status,
        attempt,
      });
      await this.sleep(this.pollIntervalMs * attempt);
    }
    let interaction = safeJsonParse(createText);
    let id: string | undefined = interaction?.id;
    let status: string = interaction?.status ?? 'in_progress';

    // Poll while the edit is still running (video edits are not instant).
    const startedAt = Date.now();
    const TERMINAL = new Set([
      'completed', 'failed', 'cancelled', 'incomplete', 'budget_exceeded',
    ]);
    while (!TERMINAL.has(status)) {
      if (Date.now() - startedAt >= this.maxWaitMs) {
        return { status: 'timeout', detail: `last status: ${status}` };
      }
      if (!id) break;
      await this.sleep(this.pollIntervalMs);
      args.onProgress?.('rendering', 'Generating the edit with Google\u2026', 70);
      const getRes = await this.httpFetch(`${base}/interactions/${encodeURIComponent(id)}`, {
        method: 'GET',
        headers,
        signal: args.signal,
      });
      const getText = await getRes.text();
      if (!getRes.ok) {
        throw new Error(`Interactions poll ${getRes.status}: ${getText.slice(0, 800)}`);
      }
      interaction = safeJsonParse(getText);
      status = interaction?.status ?? status;
    }

    if (status !== 'completed' && status !== 'incomplete') {
      const errs = Array.isArray(interaction?.errors) ? interaction.errors : [];
      const detail = errs.length ? JSON.stringify(errs).slice(0, 800) : `status: ${status}`;
      return { status, detail };
    }

    // Walk the returned steps for a video content block. Inline base64 is
    // handled directly; a hosted URI (delivery=uri, used for >4MB outputs) is
    // polled to ACTIVE and downloaded. Either way we only ever return REAL bytes.
    const inlineVideo = extractInteractionVideo(interaction);
    if (inlineVideo) {
      args.onProgress?.('downloading', 'Downloading the edited video\u2026', 90);
      return { status, video: inlineVideo };
    }

    const videoUri = extractInteractionVideoUri(interaction);
    if (videoUri) {
      args.onProgress?.('downloading', 'Downloading the edited video\u2026', 90);
      try {
        const buffer = await this.downloadInteractionVideo({
          base,
          headers,
          videoUri: videoUri.uri,
          signal: args.signal,
        });
        if (buffer && buffer.length > 0) {
          return { status, video: { buffer, mimeType: videoUri.mimeType } };
        }
      } catch (err) {
        // Downloading the finished video failed — degrade honestly (no artifact).
        return {
          status,
          detail: `download failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 800),
        };
      }
    }

    return { status, text: extractInteractionText(interaction) };
  }

  /**
   * Download an edited video that the Interactions API delivered as a hosted
   * file URI (delivery=uri, for outputs >4MB). The URI is a Google Files
   * resource of the form
   * `https://.../v1beta/files/<id>:download?alt=media`. We poll the file's
   * metadata (`GET /v1beta/files/<id>`) until it is ACTIVE, then fetch the
   * download URI's bytes. Auth reuses the same `x-goog-api-key` header. Network
   * only — returns null if no usable bytes are produced (never fabricates).
   */
  private async downloadInteractionVideo(args: {
    base: string;
    headers: Record<string, string>;
    videoUri: string;
    signal?: AbortSignal;
  }): Promise<Buffer | null> {
    // Derive the files/<id> resource name from the download URI.
    const match = args.videoUri.match(/\/files\/([^/:?]+)/);
    const fileId = match?.[1];

    // Poll the file to ACTIVE before downloading (bounded by maxWaitMs).
    if (fileId) {
      const startedAt = Date.now();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const metaRes = await this.httpFetch(`${args.base}/files/${encodeURIComponent(fileId)}`, {
          method: 'GET',
          headers: args.headers,
          signal: args.signal,
        });
        const metaText = await metaRes.text();
        if (metaRes.ok) {
          const state = String(safeJsonParse(metaText)?.state || '').toUpperCase();
          if (state === 'ACTIVE') break;
          if (state === 'FAILED') return null;
        }
        if (Date.now() - startedAt >= this.maxWaitMs) return null;
        await this.sleep(this.pollIntervalMs);
      }
    }

    // Fetch the raw bytes. The provided URI already includes `:download?alt=media`.
    const dlRes = await this.httpFetch(args.videoUri, {
      method: 'GET',
      headers: args.headers,
      signal: args.signal,
    });
    if (!dlRes.ok) {
      throw new Error(`file download ${dlRes.status}`);
    }
    const arrayBuf = await dlRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    return buffer.length > 0 ? buffer : null;
  }

  private async waitForActiveFile(
    ai: GenerativeVideoClient,
    name: string,
  ): Promise<'ACTIVE' | 'FAILED' | 'TIMEOUT'> {
    const startedAt = Date.now();
    // The first get may already be ACTIVE for small files.
    for (;;) {
      let file: GenaiFile | null = null;
      try {
        file = await ai.files.get({ name });
      } catch {
        file = null;
      }
      const state = (file?.state as string | undefined) ?? undefined;
      if (state === 'ACTIVE' || state === undefined) return 'ACTIVE';
      if (state === 'FAILED') return 'FAILED';
      if (Date.now() - startedAt >= this.maxWaitMs) return 'TIMEOUT';
      await this.sleep(this.pollIntervalMs);
    }
  }

  /**
   * Persist a returned video buffer as EXACTLY ONE immutable artifact under the
   * `generated` category, with complete generative provenance (Req 20.2). Mirrors
   * the deterministic editor's artifact contract but records the real provider.
   */
  private async persistArtifact(args: {
    buffer: Buffer;
    mimeType: string;
    provider: string;
    model: string;
    prompt: string;
    input: {
      projectId: string;
      workspaceId: string;
      userId: string;
      jobId: string;
      inputVersionId: string;
    };
    onProgress?: GenerativeVideoProgress;
  }): Promise<GenerativeVideoResult> {
    const created = await this.artifactRepository.createArtifact({
      projectId: args.input.projectId,
      workspaceId: args.input.workspaceId,
      userId: args.input.userId,
      category: 'generated',
      buffer: args.buffer,
      originalName: `${args.provider}-${randomUUID()}${extForMime(args.mimeType)}`,
      mimeType: args.mimeType,
      provenance: {
        jobId: args.input.jobId,
        inputVersionId: args.input.inputVersionId,
        provider: args.provider,
        model: args.model,
        prompt: args.prompt,
        // Real per-op cost is metered elsewhere; the artifact records 0 here so a
        // successful generative output stays provenance-complete without guessing.
        costCredits: 0,
      },
    });

    args.onProgress?.('complete', 'Done.', 100);
    this.log.info?.('Persisted generative video artifact', {
      component: COMPONENT,
      projectId: args.input.projectId,
      artifactId: created.artifact.artifactId,
      provider: args.provider,
      model: args.model,
    });

    return {
      outcome: 'rendered',
      artifactId: created.artifact.artifactId,
      storageKey: created.storageKey,
      mimeType: args.mimeType,
      provider: args.provider,
      model: args.model,
    };
  }

  /** Map a raw provider error to an HONEST user-facing outcome (never thrown raw). */
  private mapProviderError(err: unknown, kind: string): GenerativeVideoResult {
    const msg = String((err as Error)?.message || err || '');
    this.log.warn?.('Generative video provider call failed', {
      component: COMPONENT,
      kind,
      error: msg,
    });
    // Model not available to this key → honest needs_async (background pipeline).
    // `detail` carries the raw provider error for the debug trace ONLY — it is
    // never shown to the user (the user sees the friendly `message`).
    const detail = msg ? msg.slice(0, 500) : undefined;

    // ── Rate limit / quota / billing (HTTP 429) ──────────────────────────────
    // Checked BEFORE the "model unavailable" branch: a 429 is a TEMPORARY cap
    // (e.g. Omni's per-model per-day request limit) or an empty prepaid balance,
    // not a missing model. Reporting it as "not available on this account" sent
    // users hunting for a model/allowlist problem that didn't exist, so these get
    // their own actionable wording — including when the window resets.
    if (/\b429\b|too_many_requests|rate.?limit|quota exceeded|exceeded your current quota|prepayment credits/i.test(msg)) {
      const isBilling = /prepayment credits|depleted|billing details/i.test(msg)
        && !/quota exceeded for metric/i.test(msg);
      if (isBilling) {
        return {
          outcome: 'needs_async',
          kind,
          message:
            'The AI video provider reports no remaining credit on this account, so the AI step was skipped. Your credits were not charged \u2014 top up the provider balance and I\u2019ll run it.',
          detail,
        };
      }
      const retry = formatProviderRetryAfter(msg);
      return {
        outcome: 'needs_async',
        kind,
        message:
          'The AI video model\u2019s usage limit for this account has been reached'
          + (retry ? `, and it resets in about ${retry}` : '')
          + '. Your credits were not charged \u2014 I\u2019ll pick this up on the background pipeline.',
        detail,
      };
    }

    if (/not found|not available|no longer available|unsupported|invalid.*model|does not exist|404|permission/i.test(msg)) {
      return {
        outcome: 'needs_async',
        kind,
        message:
          'This AI video model isn\u2019t available on this account right now. Your credits were not charged \u2014 I\u2019ll pick it up on the background pipeline once it is.',
        detail,
      };
    }
    if (/safety|blocked|policy/i.test(msg)) {
      return {
        outcome: 'clarification',
        message: 'That request was blocked by the content safety filter. Try rephrasing it. Your credits were not charged.',
        detail,
      };
    }
    return {
      outcome: 'error',
      message: 'The AI video step could not be completed this time. Your credits were not charged.',
      detail,
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton accessor (mirrors the other video-editor service factories)
// ---------------------------------------------------------------------------

let generativeVideoServiceInstance: GenerativeVideoService | null = null;

/** Get or lazily create the shared {@link GenerativeVideoService} instance. */
export function getGenerativeVideoService(): GenerativeVideoService {
  if (!generativeVideoServiceInstance) {
    generativeVideoServiceInstance = new GenerativeVideoService();
  }
  return generativeVideoServiceInstance;
}
