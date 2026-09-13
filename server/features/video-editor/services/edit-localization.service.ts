/**
 * Edit_Localization_Service — the cheap localization pre-pass for edit-type
 * generative operations (`object_removal`, `background_replace`,
 * `generative_edit`) requested WITHOUT an explicit time range (the "global
 * branch" in `chat-video-edit.service.ts`).
 *
 * The service composes three collaborators:
 *   1. Frame_Sampler   — samples low-res JPEG frames from the current artifact
 *                        using the EXISTING FFmpeg runner pattern (task 5.2).
 *   2. Vision_Localizer — sends the frames + instruction to a cheap Gemini vision
 *                        model (`localizerModelId()`) via the reused
 *                        `GenerativeVideoClient` structural interface (task 5.3).
 *   3. Window_Resolver  — the PURE `resolveLocalizationWindows` logic that merges,
 *                        clamps, sorts, and caps candidate ranges into ≤N clean,
 *                        non-overlapping windows (already implemented).
 *
 * No-Mock discipline (Req 23): this service NEVER throws to the caller and NEVER
 * fabricates a window. Every failure point (sampler error, vision error,
 * empty/low-confidence/invalid response, zero windows, whole-clip promotion)
 * resolves to `{ kind: 'whole-clip' }` — the current whole-clip behavior.
 *
 * This file (task 5.1) SCAFFOLDS the types, injectable dependencies, and
 * env-with-default config resolution. The Frame_Sampler (5.2) and the
 * Vision_Localizer + full `localize` orchestration (5.3) are filled in by later
 * tasks; their structure/stubs are in place here.
 *
 * ESM static imports only (Req 8.1); string-first logger only (Req 8.2). The
 * FFmpeg runner and the vision client are injectable (mirroring
 * `RenderEngineServiceDeps` / `GenerativeVideoDeps`) so unit tests run with zero
 * network and zero FFmpeg.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
// Configure ffmpeg-static's binary path (side effect) so the default frame
// sampler can spawn FFmpeg without a system install — reuse, no new logic.
import '../../../config/ffmpeg-paths';
import ffmpegStatic from 'ffmpeg-static';
import { GoogleGenAI } from '@google/genai';

import { logger as defaultLogger } from '../../../config/logger';
import { getStorageService, type IStorageService } from '../../storage/services/storage.service';
import {
  localizerModelId,
  generativeVideoApiKey,
  type GenerativeVideoClient,
  type GenerativeVideoClientFactory,
} from './generative-video.service';
import {
  resolveLocalizationWindows,
  DEFAULT_MAX_WINDOWS,
  DEFAULT_MIN_CONFIDENCE,
  type CandidateRange,
  type WindowResolution,
} from './localization-window.logic';

const COMPONENT = 'videoEditor.EditLocalizationService';

// ---------------------------------------------------------------------------
// Config defaults (env-overridable; see the config resolution below)
// ---------------------------------------------------------------------------

/** Default frame sampling rate (frames per second). Env: `LOCALIZER_SAMPLE_FPS`. */
const DEFAULT_SAMPLE_FPS = 1;
/** Default downscale target height (px). Env: `LOCALIZER_FRAME_HEIGHT`. */
const DEFAULT_FRAME_HEIGHT = 360;

// ---------------------------------------------------------------------------
// Injectable collaborators + public contracts
// ---------------------------------------------------------------------------

/**
 * Runs a built FFmpeg argument vector to completion. Injectable for testing
 * (mirrors `RenderFfmpegRunner`) so unit tests never spawn FFmpeg.
 */
export type FrameSampleRunner = (args: string[]) => Promise<void>;

/** Env-overridable sampling/resolution knobs (all have safe defaults). */
export interface LocalizationConfig {
  /** Sampling rate (frames per second). Default 1. Env: `LOCALIZER_SAMPLE_FPS`. */
  sampleFps: number;
  /** Downscale target height in px. Default 360. Env: `LOCALIZER_FRAME_HEIGHT`. */
  frameHeight: number;
  /** Max windows. Default 3. Env: `LOCALIZER_MAX_WINDOWS`. */
  maxWindows: number;
  /** Confidence floor. Default 0.3. Env: `LOCALIZER_MIN_CONFIDENCE`. */
  minConfidence: number;
}

/**
 * Injectable dependencies (defaulted for production, overridable in tests).
 * Mirrors `GenerativeVideoDeps` / `RenderEngineServiceDeps`.
 */
export interface EditLocalizationDeps {
  logger?: Pick<typeof defaultLogger, 'info' | 'warn' | 'error' | 'debug'>;
  /** Storage backend for reading the current artifact bytes. */
  storage?: IStorageService;
  /** Vision client factory — reuses the generative-video client (Req 8.4). */
  clientFactory?: GenerativeVideoClientFactory;
  /** FFmpeg runner; defaults to spawning `ffmpeg-static` (same shape as RenderEngine). */
  frameRunner?: FrameSampleRunner;
  /** Path to the FFmpeg binary (defaults to `ffmpeg-static`). */
  ffmpegPath?: string | null;
  /** Base directory for temporary sampling scratch files (defaults to OS temp). */
  tempDir?: string;
  /** Partial config override (each field falls back to its env/default value). */
  config?: Partial<LocalizationConfig>;
}

/** Input to {@link EditLocalizationService.localize}. */
export interface LocalizeInput {
  projectId: string;
  workspaceId: string;
  userId: string;
  /** Storage key of the CURRENT chained artifact to localize against. */
  sourceStorageKey: string;
  sourceFileName: string;
  /** The edit instruction, e.g. "remove the person in the background". */
  instruction: string;
  /** Effective source duration (ms) — the same value the wiring already computes. */
  sourceDurationMs: number;
  /** The user's own Google key, if set (else the env key). */
  apiKey?: string;
  /** Streams honest progress into the chat. */
  onProgress?: (status: string) => void;
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Config resolution (env-with-default; overridable via deps.config)
// ---------------------------------------------------------------------------

/** Parse a strictly-positive finite number, else fall back (for fps). */
function readPositiveNumber(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Parse a positive integer `>= 1`, else fall back (for heights / window caps). */
function readPositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && Number.isInteger(n) && n >= 1 ? n : fallback;
}

/** Parse any finite number, else fall back (for the confidence floor). */
function readFiniteNumber(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Resolve the effective {@link LocalizationConfig} from environment variables
 * (with defaults), then apply any injected partial override. Invalid/empty env
 * values fall back to their defaults:
 *   - `LOCALIZER_SAMPLE_FPS`     → `sampleFps`     (default 1;   invalid/≤0 → default)
 *   - `LOCALIZER_FRAME_HEIGHT`   → `frameHeight`   (default 360; invalid    → default)
 *   - `LOCALIZER_MAX_WINDOWS`    → `maxWindows`    (default 3;   invalid/<1 → default)
 *   - `LOCALIZER_MIN_CONFIDENCE` → `minConfidence` (default 0.3; invalid    → default)
 * The cheap vision model id is resolved separately via `localizerModelId()`
 * (env: `GEMINI_LOCALIZER_MODEL`).
 */
export function resolveLocalizationConfig(override?: Partial<LocalizationConfig>): LocalizationConfig {
  const base: LocalizationConfig = {
    sampleFps: readPositiveNumber(process.env.LOCALIZER_SAMPLE_FPS, DEFAULT_SAMPLE_FPS),
    frameHeight: readPositiveInt(process.env.LOCALIZER_FRAME_HEIGHT, DEFAULT_FRAME_HEIGHT),
    maxWindows: readPositiveInt(process.env.LOCALIZER_MAX_WINDOWS, DEFAULT_MAX_WINDOWS),
    minConfidence: readFiniteNumber(process.env.LOCALIZER_MIN_CONFIDENCE, DEFAULT_MIN_CONFIDENCE),
  };
  if (!override) return base;
  return {
    sampleFps: override.sampleFps ?? base.sampleFps,
    frameHeight: override.frameHeight ?? base.frameHeight,
    maxWindows: override.maxWindows ?? base.maxWindows,
    minConfidence: override.minConfidence ?? base.minConfidence,
  };
}

// ---------------------------------------------------------------------------
// Pure response helpers (mirrors generative-video.service.ts extractText and
// video-analysis.service.ts extractFirstJsonObject — copied locally, no new IO)
// ---------------------------------------------------------------------------

/**
 * Concatenate every TEXT part of a `generateContent` response into a single
 * string. Structural (mirrors `extractText` in `generative-video.service.ts`) so
 * no `@google/genai` response type import is required. Empty string if none.
 */
function extractResponseText(response: unknown): string {
  const parts = (response as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> })
    ?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  let text = '';
  for (const part of parts) {
    const t = part?.text;
    if (typeof t === 'string') text += t;
  }
  return text;
}

/**
 * Extract the FIRST balanced `{…}` JSON object substring from arbitrary text.
 * PURE — copied verbatim from the proven `extractFirstJsonObject` idiom in
 * `video-analysis.service.ts` (no new IO). Returns `null` when no balanced
 * object is present.
 */
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

// ---------------------------------------------------------------------------
// Default vision client factory (mirrors generative-video.service.ts)
// ---------------------------------------------------------------------------

/** Default factory — reuses the generative-video key resolution (user key → env). */
const defaultClientFactory: GenerativeVideoClientFactory = (apiKey?: string): GenerativeVideoClient => {
  const key = apiKey || generativeVideoApiKey();
  return new GoogleGenAI({ apiKey: key }) as unknown as GenerativeVideoClient;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * The edit-localization capability. Construct with defaults in production, or
 * with injected fakes (`storage`, `frameRunner`, `clientFactory`) in unit tests.
 * `localize` NEVER throws and NEVER fabricates a window — every failure resolves
 * to the whole-clip fallback signal (No-Mock, Req 23).
 */
export class EditLocalizationService {
  private readonly log: Pick<typeof defaultLogger, 'info' | 'warn' | 'error' | 'debug'>;
  private readonly storage: IStorageService;
  private readonly clientFactory: GenerativeVideoClientFactory;
  private readonly frameRunner: FrameSampleRunner;
  private readonly ffmpegPath: string | null;
  private readonly tempRoot: string;
  private readonly configOverride: Partial<LocalizationConfig> | undefined;

  constructor(deps: EditLocalizationDeps = {}) {
    this.log = deps.logger ?? defaultLogger;
    this.storage = deps.storage ?? getStorageService();
    this.clientFactory = deps.clientFactory ?? defaultClientFactory;
    this.ffmpegPath = deps.ffmpegPath ?? (ffmpegStatic as unknown as string | null) ?? null;
    this.frameRunner = deps.frameRunner ?? this.createDefaultRunner();
    this.tempRoot = deps.tempDir ?? path.join(os.tmpdir(), 'veefore-edit-localization');
    this.configOverride = deps.config;
  }

  /**
   * Localize a global edit into ≤maxWindows windows, or the whole-clip fallback.
   * Composes Frame_Sampler → Vision_Localizer → Window_Resolver and returns the
   * resolver's result directly. NEVER throws: every failure (sampler error,
   * vision error, empty/low-confidence/invalid response, zero windows, or
   * whole-clip promotion) resolves to `{ kind: 'whole-clip' }` with an honest
   * streamed note — a window is never fabricated (No-Mock, Req 23).
   */
  async localize(input: LocalizeInput): Promise<WindowResolution> {
    const config = this.resolveConfig();
    try {
      input.onProgress?.('Looking for where the edit applies\u2026');
      const frames = await this.sampleFrames(input, config);
      if (frames.length === 0) {
        // No frames sampled → honest whole-clip fallback (Req 6, 23). The
        // sampler already streamed its own note before returning empty.
        return { kind: 'whole-clip' };
      }
      const candidates = await this.detectRanges(frames, input, config);
      const resolution = resolveLocalizationWindows(candidates, input.sourceDurationMs, {
        maxWindows: config.maxWindows,
        minConfidence: config.minConfidence,
      });
      if (resolution.kind === 'whole-clip') {
        // Empty/low-confidence/invalid/zero-window/whole-clip-promotion — honest
        // degrade to the current whole-clip behavior (Req 6.1–6.4, 5.7).
        input.onProgress?.("Couldn't pin down a specific range — editing the whole clip.");
      } else {
        input.onProgress?.(
          `Found ${resolution.windows.length} region(s) to edit.`,
        );
      }
      return resolution;
    } catch (err) {
      this.log.warn?.('Edit localization failed; falling back to whole clip', {
        component: COMPONENT,
        projectId: input.projectId,
        error: String((err as Error)?.message || err),
      });
      return { kind: 'whole-clip' };
    }
  }

  /** Resolve the effective config from env + the injected partial override. */
  private resolveConfig(): LocalizationConfig {
    return resolveLocalizationConfig(this.configOverride);
  }

  /**
   * Frame_Sampler (task 5.2). Downloads the current artifact bytes via
   * `this.storage.downloadFile` (same as `editVideo`), writes them to a temp
   * input file, runs `this.frameRunner` with the deterministic FFmpeg arg
   * vector:
   *
   *   -i <inputPath>
   *   -vf fps=<sampleFps>,scale=-2:<frameHeight>
   *   -q:v 4
   *   -f image2
   *   <workDir>/frame-%04d.jpg
   *
   * then reads the produced JPEGs into base64. On ANY error (download, write,
   * FFmpeg non-zero exit) OR zero frames produced, it logs a string-first warn,
   * streams an honest progress note via `input.onProgress` (if available), and
   * returns `[]` — which makes `localize` honestly degrade to the whole-clip
   * fallback (No-Mock, Req 6/23). All work happens inside a try/finally that
   * cleans up the temp dir (mirroring `editVideo`).
   */
  private async sampleFrames(input: LocalizeInput, config: LocalizationConfig): Promise<string[]> {
    const workId = randomUUID();
    const workDir = path.join(this.tempRoot, workId);
    const inExt = path.extname(input.sourceFileName) || '.mp4';
    const inputPath = path.join(workDir, `input${inExt}`);

    try {
      await fs.promises.mkdir(workDir, { recursive: true });

      // 1) Read the immutable source bytes into a temp input file (same as editVideo).
      const dl = await this.storage.downloadFile(input.sourceStorageKey);
      await fs.promises.writeFile(inputPath, dl.buffer);

      // 2) Build the deterministic FFmpeg arg vector and run it via the injected
      //    runner (which spawns ffmpeg-static in production — reused shape).
      const framePattern = path.join(workDir, 'frame-%04d.jpg');
      const args = [
        '-i', inputPath,
        '-vf', `fps=${config.sampleFps},scale=-2:${config.frameHeight}`,
        '-q:v', '4',
        '-f', 'image2',
        framePattern,
      ];
      await this.frameRunner(args);

      // 3) Read the produced JPEGs (frame-0001.jpg, …) into base64, in order.
      const entries = await fs.promises.readdir(workDir);
      const frameFiles = entries
        .filter((name) => /^frame-\d+\.jpg$/.test(name))
        .sort();
      if (frameFiles.length === 0) {
        this.log.warn?.('Localizer sampled zero frames; falling back to whole clip', {
          component: COMPONENT,
          projectId: input.projectId,
          sourceStorageKey: input.sourceStorageKey,
        });
        input.onProgress?.("Couldn't sample frames — editing the whole clip.");
        return [];
      }

      const frames: string[] = [];
      for (const name of frameFiles) {
        const buffer = await fs.promises.readFile(path.join(workDir, name));
        frames.push(buffer.toString('base64'));
      }
      return frames;
    } catch (err) {
      this.log.warn?.('Localizer frame sampling failed; falling back to whole clip', {
        component: COMPONENT,
        projectId: input.projectId,
        sourceStorageKey: input.sourceStorageKey,
        error: String((err as Error)?.message || err),
      });
      input.onProgress?.("Couldn't sample frames — editing the whole clip.");
      return [];
    } finally {
      await fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => {
        this.log.warn?.('Failed to clean up localizer frame-sampling temp dir', {
          component: COMPONENT,
          workDir,
        });
      });
    }
  }

  /**
   * Vision_Localizer (task 5.3). Builds the JSON-only vision prompt (frame count,
   * fps, per-frame timestamp mapping, instruction, duration, and the exact
   * `{ "ranges": [...] }` output schema), calls
   * `this.clientFactory(apiKey).models.generateContent({ model: localizerModelId(),
   * contents: [...] })` with one `inlineData` JPEG part per sampled frame plus the
   * text prompt (reusing the `GenerativeVideoClient` structural interface, Req 8.4),
   * then parses the returned `{ ranges: [...] }` object into `CandidateRange[]`.
   *
   * Honest-degrade (No-Mock, Req 6/23): on ANY thrown error, an empty/text-only
   * response, a response missing the `ranges` array, or malformed JSON, it logs a
   * string-first warn, streams an honest note, and returns `[]` — which makes the
   * Window_Resolver yield `{ kind: 'whole-clip' }`. A range is never fabricated.
   */
  private async detectRanges(
    frames: string[],
    input: LocalizeInput,
    config: LocalizationConfig,
  ): Promise<CandidateRange[]> {
    const model = localizerModelId();
    const durationMs = Math.max(0, Math.round(input.sourceDurationMs));
    const prompt = this.buildVisionPrompt(frames.length, config.sampleFps, durationMs, input.instruction);

    let response: unknown;
    try {
      const client = this.clientFactory(input.apiKey);
      // One inlineData JPEG part per sampled frame + the JSON-only text prompt.
      const parts = [
        ...frames.map((data) => ({ inlineData: { data, mimeType: 'image/jpeg' } })),
        { text: prompt },
      ];
      response = await client.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
      } as Parameters<GenerativeVideoClient['models']['generateContent']>[0]);
    } catch (err) {
      this.log.warn?.('Localizer vision call failed; falling back to whole clip', {
        component: COMPONENT,
        projectId: input.projectId,
        model,
        error: String((err as Error)?.message || err),
      });
      input.onProgress?.("Couldn't detect where the edit applies — editing the whole clip.");
      return [];
    }

    // Extract the response text and the first balanced JSON object from it.
    const text = extractResponseText(response);
    const json = extractFirstJsonObject(text);
    if (!json) {
      this.log.warn?.('Localizer vision response contained no JSON; falling back to whole clip', {
        component: COMPONENT,
        projectId: input.projectId,
        model,
      });
      input.onProgress?.("Couldn't detect where the edit applies — editing the whole clip.");
      return [];
    }

    // Parse the `{ ranges: [...] }` schema into CandidateRange[]. Any malformed /
    // missing-`ranges` shape degrades honestly to `[]` (⇒ whole-clip).
    try {
      const parsed = JSON.parse(json) as { ranges?: unknown };
      const rawRanges = parsed?.ranges;
      if (!Array.isArray(rawRanges)) {
        input.onProgress?.("Couldn't detect where the edit applies — editing the whole clip.");
        return [];
      }
      const candidates: CandidateRange[] = rawRanges.map((r) => {
        const range = r as { startMs?: unknown; endMs?: unknown; confidence?: unknown };
        return {
          startMs: Number(range?.startMs),
          endMs: Number(range?.endMs),
          confidence: range?.confidence === undefined ? undefined : Number(range.confidence),
        };
      });
      return candidates;
    } catch (err) {
      this.log.warn?.('Localizer vision response was not valid JSON; falling back to whole clip', {
        component: COMPONENT,
        projectId: input.projectId,
        model,
        error: String((err as Error)?.message || err),
      });
      input.onProgress?.("Couldn't detect where the edit applies — editing the whole clip.");
      return [];
    }
  }

  /**
   * Build the JSON-only vision prompt (mirrors the JSON-only enrichment prompt in
   * `video-analysis.service.ts`). Communicates the frame count, sampling fps, the
   * per-frame → timestamp mapping, the edit instruction, the source duration, and
   * the exact `{ "ranges": [...] }` output schema the model must return.
   */
  private buildVisionPrompt(
    frameCount: number,
    sampleFps: number,
    durationMs: number,
    instruction: string,
  ): string {
    return [
      `You are given ${frameCount} frames sampled at ${sampleFps} fps from a video that is ${durationMs} ms long.`,
      `Frame i (0-based) corresponds to timestamp round(i * 1000 / ${sampleFps}) ms.`,
      `The user wants this edit applied: "${instruction}".`,
      'Identify the time ranges where this edit visually applies.',
      'Respond with ONLY a JSON object of the exact shape:',
      '{',
      '  "ranges": [ { "startMs": <int>, "endMs": <int>, "confidence": <number 0..1> } ]',
      '}',
      `Every startMs/endMs must fall within [0, ${durationMs}] with startMs < endMs.`,
      `If the edit applies to the whole video, return a single range covering [0, ${durationMs}].`,
      'If you cannot confidently locate it, return { "ranges": [] }.',
      'Do not include any prose, explanation, or markdown fences — JSON only.',
    ].join('\n');
  }

  /** Default FFmpeg runner: spawn the binary with the built arg vector (reused shape). */
  private createDefaultRunner(): FrameSampleRunner {
    const ffmpegPath = this.ffmpegPath ?? 'ffmpeg';
    const log = this.log;
    return (args: string[]) =>
      new Promise<void>((resolve, reject) => {
        const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
        let stderr = '';
        proc.stderr?.on('data', (chunk) => {
          stderr += chunk.toString();
        });
        proc.on('error', (err) => reject(err));
        proc.on('close', (code) => {
          if (code === 0) return resolve();
          log?.error?.('Localizer frame-sampling FFmpeg exited non-zero', undefined, {
            component: COMPONENT,
            code,
            stderr: stderr.slice(-1000),
          });
          reject(new Error(`ffmpeg exited with code ${code}`));
        });
      });
  }
}

// ---------------------------------------------------------------------------
// Singleton accessor (mirrors getGenerativeVideoService / renderEngineService)
// ---------------------------------------------------------------------------

let editLocalizationServiceInstance: EditLocalizationService | null = null;

/** Get or lazily create the shared {@link EditLocalizationService} instance. */
export function getEditLocalizationService(): EditLocalizationService {
  if (!editLocalizationServiceInstance) {
    editLocalizationServiceInstance = new EditLocalizationService();
  }
  return editLocalizationServiceInstance;
}
