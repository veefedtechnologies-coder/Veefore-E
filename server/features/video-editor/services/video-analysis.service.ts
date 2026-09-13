/**
 * Video_Analysis_Service — the IO shell that produces the structured
 * `VideoAnalysis` record for a `Video_Source` (task 8.3, Req 4.1–4.11).
 *
 * The service orchestrates a strict pipeline whose correctness rules live in the
 * pure `audio-analysis.logic` core (silence classification, well-formedness) and
 * the single-source `video-editor.config` (silence thresholds). It never
 * hardcodes a threshold and never fabricates a result (No-Mock, Req 23):
 *
 *   1. Reuse (Req 4.9). Triggering analysis for a source that already has a
 *      COMPLETED `VideoAnalysis` artifact returns the existing artifact and makes
 *      NO new AI enrichment call.
 *   2. Metadata (Req 4.1). Probe (reusing `VideoStorageService` FFprobe via the
 *      injected processor) to fill duration (s), fps, dimensions, aspect ratio.
 *   3. Deterministic scene detection (Req 4.2). The FFmpeg scene detector runs
 *      BEFORE any AI semantic enrichment — always, unconditionally.
 *   4. Audio features (Req 4.5). A loudness curve is measured, silence segments
 *      are classified by the pure `classifySilence` core (configurable −40 dB /
 *      0.5 s), and speech segments are the in-bounds complement.
 *   5. AI semantic enrichment (Req 4.3, 4.4, 4.6). Transcript + decision-support
 *      scores (hook candidates, important moments) come from the provider transport
 *      analyze path. No detectable speech ⇒ empty transcript with its stage marked
 *      completed (Req 4.4).
 *   6. Completion (Req 4.7, 4.8). Only when EVERY required field is populated and
 *      well-formed is the record marked completed and persisted as an immutable
 *      `analysis` Video_Artifact.
 *   7. Enrichment unavailable (Req 4.10). If semantic enrichment is unavailable,
 *      the deterministic scene results are RETAINED, the enrichment stage is left
 *      incomplete, the record is NOT marked completed, and NO reusable artifact is
 *      persisted.
 *   8. Failure (Req 4.11). Any hard analysis failure records an error code, sets
 *      status = failed, does NOT mark completed, and persists NO reusable partial
 *      artifact.
 *
 * All FFmpeg/AI work is delegated to injectable dependencies so the orchestration
 * is testable without a real encoder or provider (task 8.4).
 */

import { randomUUID } from 'crypto';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import ffmpeg from 'fluent-ffmpeg';

import { logger as defaultLogger } from '../../../config/logger';
import type { Model } from 'mongoose';
import {
  VideoSourceModel as DefaultVideoSourceModel,
  type IVideoSource,
} from '../../../models/VideoEditor/VideoSource';
import {
  VideoEditJobModel as DefaultVideoEditJobModel,
  type IVideoEditJob,
} from '../../../models/VideoEditor/VideoEditJob';
import {
  getStorageService,
  type IStorageService,
} from '../../storage/services/storage.service';
import {
  videoStorageService as defaultVideoStorageService,
  type IVideoStorageService,
  type VideoMetadata,
} from '../../storage/services/video-storage.service';
import { collectAIUsage, type AIUsageSample } from '../../../services/aiUsageTracker';

import { SILENCE_THRESHOLDS } from '../config/video-editor.config';
import {
  classifySilence,
  isWellFormedAnalysisTiming,
  type LoudnessFrame,
  type TimeRangeMs,
  type TranscriptSegment,
  type ScoredMoment,
} from './audio-analysis.logic';
import {
  getArtifactRepository,
  ArtifactRepository,
} from './artifact-repository.service';
import type { ArtifactProvenance } from './artifact-provenance.logic';
import {
  createGeminiVideoTransport,
} from './providers/gemini-video-transport';
import type {
  VideoProviderTransport,
  TransportRequest,
} from './providers/video-ai-provider';
import { VideoProviderCallError } from './providers/video-ai-provider';
import { emitLifecycleEvent } from './video-editor-events';

const writeFileAsync = promisify(fs.writeFile);
const unlinkAsync = promisify(fs.unlink);

// ---------------------------------------------------------------------------
// Analysis stages (drive stage-derived progress, Req 4.7)
// ---------------------------------------------------------------------------

/**
 * The ordered analysis stages. Scene detection precedes enrichment (Req 4.2) and
 * the record is only completed once every stage has finished (Req 4.7). Progress
 * is derived SOLELY from how many of these have completed.
 */
export const ANALYSIS_STAGES = [
  'probe_metadata',
  'scene_detection',
  'audio_features',
  'transcript',
  'semantic_enrichment',
] as const;

/** One of the ordered analysis stages. */
export type AnalysisStage = (typeof ANALYSIS_STAGES)[number];

/** Total analysis stages — the denominator for stage-derived progress. */
export const TOTAL_ANALYSIS_STAGES = ANALYSIS_STAGES.length;

// ---------------------------------------------------------------------------
// Analysis record shape (Req 4.1, 4.3, 4.5, 4.6, 4.7)
// ---------------------------------------------------------------------------

/** A detected scene as a half-open range on the source timeline (Req 4.2). */
export interface SceneBoundary {
  startMs: number;
  endMs: number;
}

/** Audio features computed for a source (Req 4.5). */
export interface AudioFeatures {
  /** Ordered loudness curve in dB (Req 4.5). */
  loudnessCurve: LoudnessFrame[];
  /** Silence segments classified by the pure core (Req 4.5). */
  silenceSegments: TimeRangeMs[];
  /** Speech segments — the in-bounds complement of silence (Req 4.5). */
  speechSegments: TimeRangeMs[];
}

/** Per-stage completion flags for a `VideoAnalysis` record. */
export interface AnalysisStageStatus {
  probeMetadata: boolean;
  sceneDetection: boolean;
  audioFeatures: boolean;
  /** Transcript stage — completed even when the transcript is empty (Req 4.4). */
  transcript: boolean;
  /** Semantic enrichment — incomplete when enrichment is unavailable (Req 4.10). */
  semanticEnrichment: boolean;
}

/** The overall status of an analysis attempt. */
export type AnalysisStatus = 'completed' | 'partial' | 'failed';

/**
 * A structured `VideoAnalysis` record (Req 4.1). Persisted as an immutable
 * `analysis` Video_Artifact only when `completed` is true (Req 4.7, 4.8).
 */
export interface VideoAnalysis {
  sourceId: string;
  projectId: string;
  /** Duration in seconds (Req 4.1). */
  durationSeconds: number;
  /** Frame rate in frames per second (Req 4.1). */
  fps: number;
  /** Frame width in pixels (Req 4.1). */
  width: number;
  /** Frame height in pixels (Req 4.1). */
  height: number;
  /** Aspect ratio as a reduced width:height ratio, e.g. '16:9' (Req 4.1). */
  aspectRatio: string;
  /** Deterministic scene detection results (Req 4.2). */
  scenes: SceneBoundary[];
  /** Transcript segments (empty when no speech, Req 4.3, 4.4). */
  transcript: TranscriptSegment[];
  /** Audio features (silence/speech/loudness, Req 4.5). */
  audioFeatures: AudioFeatures;
  /** Hook candidates with start/end/confidence 0..1 (Req 4.6). */
  hookCandidates: ScoredMoment[];
  /** Important moments with start/end/confidence 0..1 (Req 4.6). */
  importantMoments: ScoredMoment[];
  /** Per-stage completion flags. */
  stages: AnalysisStageStatus;
  /** True only when every required field is populated (Req 4.7). */
  completed: boolean;
  /** Overall status of the attempt. */
  status: AnalysisStatus;
  /** Error code recorded on failure (Req 4.11); absent otherwise. */
  errorCode?: string;
  /** Provider that produced semantic enrichment, when available. */
  enrichmentProvider?: string;
  /** Model that produced semantic enrichment, when available. */
  enrichmentModel?: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Thrown when a `Video_Source` cannot be found for analysis. Signals a hard
 * failure (Req 4.11) rather than an enrichment-unavailable partial.
 */
export class AnalysisSourceNotFoundError extends Error {
  readonly code = 'ANALYSIS_SOURCE_NOT_FOUND';
  readonly statusCode = 404;
  constructor(sourceId: string) {
    super(`Video_Source ${sourceId} not found for analysis`);
    this.name = 'AnalysisSourceNotFoundError';
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/**
 * Thrown when a deterministic analysis step (probe / scene detection / audio
 * features) fails. Marks the analysis failed with an error code and persists no
 * reusable partial artifact (Req 4.11).
 */
export class AnalysisFailedError extends Error {
  readonly statusCode = 422;
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'AnalysisFailedError';
    this.code = code;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/**
 * Thrown by a `SemanticEnricher` when semantic enrichment is UNAVAILABLE (e.g.
 * the AI provider is not configured or is unreachable). This is NOT an analysis
 * failure: the deterministic results are retained, enrichment is marked
 * incomplete, and the record is not completed (Req 4.10).
 */
export class EnrichmentUnavailableError extends Error {
  readonly code = 'ENRICHMENT_UNAVAILABLE';
  constructor(message: string) {
    super(message);
    this.name = 'EnrichmentUnavailableError';
    Error.captureStackTrace?.(this, this.constructor);
  }
}

// ---------------------------------------------------------------------------
// Injectable collaborators
// ---------------------------------------------------------------------------

/**
 * The deterministic media operations analysis depends on. Extracted behind an
 * interface so the pipeline is testable without a real encoder (task 8.4). The
 * default implementation reuses `VideoStorageService` (FFprobe) and adds FFmpeg
 * scene detection + a loudness curve.
 */
export interface AnalysisProcessor {
  /** Probe duration/dimensions/fps/codec/container via FFprobe (Req 4.1). */
  probe(buffer: Buffer): Promise<VideoMetadata>;
  /** Detect scene boundaries deterministically (Req 4.2). */
  detectScenes(buffer: Buffer, durationMs: number): Promise<SceneBoundary[]>;
  /** Measure a loudness curve (dB) over the source timeline (Req 4.5). */
  extractLoudnessCurve(buffer: Buffer, durationMs: number): Promise<LoudnessFrame[]>;
}

/** The semantic enrichment produced by an AI provider (Req 4.3, 4.6). */
export interface EnrichmentResult {
  provider: string;
  model: string;
  /** Transcript segments in ms (empty when no detectable speech, Req 4.4). */
  transcript: TranscriptSegment[];
  /** Hook candidates with normalized confidence (Req 4.6). */
  hookCandidates: ScoredMoment[];
  /** Important moments with normalized confidence (Req 4.6). */
  importantMoments: ScoredMoment[];
}

/** Context for enrichment (source + metering identity). */
export interface EnrichmentContext {
  source: IVideoSource;
  buffer: Buffer;
  durationMs: number;
  scenes: SceneBoundary[];
  signal?: AbortSignal;
}

/**
 * Produces semantic enrichment from an AI provider (Req 4.3, 4.6). Implementations
 * MUST throw {@link EnrichmentUnavailableError} when enrichment cannot be produced
 * because the provider is unavailable (Req 4.10) — they must never fabricate a
 * transcript or scores (No-Mock, Req 23).
 */
export interface SemanticEnricher {
  enrich(ctx: EnrichmentContext): Promise<EnrichmentResult>;
}

/** Injectable dependencies (defaulted for production, overridable for tests). */
export interface VideoAnalysisServiceDeps {
  storage?: IStorageService;
  videoStorage?: IVideoStorageService;
  artifactRepository?: ArtifactRepository;
  processor?: AnalysisProcessor;
  enricher?: SemanticEnricher;
  sourceModel?: Model<IVideoSource>;
  jobModel?: Model<IVideoEditJob>;
  logger?: Pick<typeof defaultLogger, 'info' | 'warn' | 'error' | 'debug'>;
}

/** The result of an analysis run. */
export interface AnalyzeResult {
  analysis: VideoAnalysis;
  /** The persisted analysis artifactId when completed (Req 4.8); null otherwise. */
  artifactId: string | null;
  /** True when an existing completed artifact was reused (Req 4.9). */
  reused: boolean;
}

// ---------------------------------------------------------------------------
// Aspect-ratio helper (Req 4.1)
// ---------------------------------------------------------------------------

/** Greatest common divisor (Euclid), used to reduce an aspect ratio. */
function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    [x, y] = [y, x % y];
  }
  return x || 1;
}

/**
 * Express dimensions as a reduced `width:height` aspect ratio (Req 4.1), e.g.
 * 1920×1080 → '16:9'. Falls back to '0:0' for non-positive dimensions.
 */
export function computeAspectRatio(width: number, height: number): string {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return '0:0';
  }
  const divisor = gcd(width, height);
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

// ---------------------------------------------------------------------------
// Speech-segment derivation (Req 4.5)
// ---------------------------------------------------------------------------

/**
 * Compute speech segments as the in-bounds complement of the silence segments
 * over `[0, durationMs]` (Req 4.5). Silence ranges are normalized (sorted,
 * clamped, merged) so the complement is gap-free and non-overlapping. Pure.
 */
export function deriveSpeechSegments(
  silence: readonly TimeRangeMs[],
  durationMs: number,
): TimeRangeMs[] {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return [];

  // Clamp + keep valid ranges, then sort and merge overlaps/adjacencies.
  const clamped = silence
    .filter((r) => Number.isFinite(r.startMs) && Number.isFinite(r.endMs) && r.endMs > r.startMs)
    .map((r) => ({ startMs: Math.max(0, r.startMs), endMs: Math.min(durationMs, r.endMs) }))
    .filter((r) => r.endMs > r.startMs)
    .sort((a, b) => a.startMs - b.startMs);

  const merged: TimeRangeMs[] = [];
  for (const r of clamped) {
    const last = merged[merged.length - 1];
    if (last && r.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, r.endMs);
    } else {
      merged.push({ ...r });
    }
  }

  const speech: TimeRangeMs[] = [];
  let cursor = 0;
  for (const s of merged) {
    if (s.startMs > cursor) speech.push({ startMs: cursor, endMs: s.startMs });
    cursor = Math.max(cursor, s.endMs);
  }
  if (cursor < durationMs) speech.push({ startMs: cursor, endMs: durationMs });
  return speech;
}

// ---------------------------------------------------------------------------
// Default FFmpeg analysis processor
// ---------------------------------------------------------------------------

/** Null output device for `-f null` runs, cross-platform. */
const NULL_DEVICE = process.platform === 'win32' ? 'NUL' : '/dev/null';

/**
 * Production `AnalysisProcessor`. Reuses `VideoStorageService.extractMetadata`
 * (FFprobe) for metadata and runs FFmpeg for deterministic scene detection
 * (`select='gt(scene,…)',showinfo`) and a loudness curve (`ebur128`).
 */
class FfmpegAnalysisProcessor implements AnalysisProcessor {
  constructor(
    private readonly videoStorage: IVideoStorageService,
    private readonly sceneThreshold = 0.4,
  ) {}

  async probe(buffer: Buffer): Promise<VideoMetadata> {
    return this.videoStorage.extractMetadata(buffer);
  }

  async detectScenes(buffer: Buffer, durationMs: number): Promise<SceneBoundary[]> {
    const stderr = await this.runNull(buffer, (command) =>
      command.videoFilter(`select='gt(scene,${this.sceneThreshold})',showinfo`),
    );
    // showinfo prints one line per selected (scene-change) frame with pts_time.
    const cutTimesMs: number[] = [];
    const re = /pts_time:([0-9]+(?:\.[0-9]+)?)/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(stderr)) !== null) {
      const seconds = Number.parseFloat(match[1]);
      if (Number.isFinite(seconds)) cutTimesMs.push(Math.round(seconds * 1000));
    }
    return this.buildSceneBoundaries(cutTimesMs, durationMs);
  }

  /** Turn sorted scene-cut timestamps into contiguous scene boundaries. */
  private buildSceneBoundaries(cutTimesMs: number[], durationMs: number): SceneBoundary[] {
    if (!Number.isFinite(durationMs) || durationMs <= 0) return [];
    const cuts = Array.from(new Set(cutTimesMs.filter((t) => t > 0 && t < durationMs))).sort(
      (a, b) => a - b,
    );
    const boundaries: SceneBoundary[] = [];
    let start = 0;
    for (const cut of cuts) {
      if (cut > start) {
        boundaries.push({ startMs: start, endMs: cut });
        start = cut;
      }
    }
    if (durationMs > start) boundaries.push({ startMs: start, endMs: durationMs });
    return boundaries;
  }

  async extractLoudnessCurve(buffer: Buffer, durationMs: number): Promise<LoudnessFrame[]> {
    let stderr: string;
    try {
      stderr = await this.runNull(buffer, (command) =>
        command.audioFilters('ebur128=metadata=1'),
      );
    } catch {
      // A source with no audio track (or an ebur128 failure) yields an empty
      // loudness curve rather than failing the whole analysis; downstream
      // silence/speech classification handles an empty curve cleanly (Req 4.5).
      return [];
    }
    return this.parseLoudnessCurve(stderr, durationMs);
  }

  /** Parse ebur128 momentary-loudness samples into an ordered loudness curve. */
  private parseLoudnessCurve(stderr: string, durationMs: number): LoudnessFrame[] {
    const samples: { tMs: number; loudnessDb: number }[] = [];
    // ebur128 lines look like: "t: 0.1  ...  M: -20.5 ..."
    const re = /t:\s*([0-9]+(?:\.[0-9]+)?).*?M:\s*(-?[0-9]+(?:\.[0-9]+)?|-inf)/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(stderr)) !== null) {
      const tMs = Math.round(Number.parseFloat(match[1]) * 1000);
      const raw = match[2];
      const loudnessDb = raw === '-inf' ? -120 : Number.parseFloat(raw);
      if (Number.isFinite(tMs) && Number.isFinite(loudnessDb)) {
        samples.push({ tMs, loudnessDb });
      }
    }
    samples.sort((a, b) => a.tMs - b.tMs);

    const frames: LoudnessFrame[] = [];
    for (let i = 0; i < samples.length; i++) {
      const startMs = samples[i].tMs;
      const endMs =
        i + 1 < samples.length ? samples[i + 1].tMs : Math.max(startMs + 100, durationMs || startMs + 100);
      if (endMs > startMs) {
        frames.push({ startMs, endMs, loudnessDb: samples[i].loudnessDb });
      }
    }
    return frames;
  }

  /**
   * Write `buffer` to a temp input, run the built FFmpeg command against a null
   * output, and resolve with the accumulated stderr (where filters print info).
   */
  private runNull(
    buffer: Buffer,
    build: (command: ffmpeg.FfmpegCommand) => ffmpeg.FfmpegCommand,
  ): Promise<string> {
    const tempDir = path.join(process.cwd(), 'uploads', 'temp');
    const inputPath = path.join(tempDir, `${randomUUID()}.tmp`);
    return (async () => {
      await ensureDir(tempDir);
      await writeFileAsync(inputPath, buffer);
      const lines: string[] = [];
      try {
        await new Promise<void>((resolve, reject) => {
          build(ffmpeg(inputPath))
            .format('null')
            .output(NULL_DEVICE)
            .on('stderr', (line: string) => lines.push(line))
            .on('end', () => resolve())
            .on('error', (err: Error) => reject(err))
            .run();
        });
        return lines.join('\n');
      } finally {
        await safeUnlink(inputPath);
      }
    })();
  }
}

async function ensureDir(dir: string): Promise<void> {
  if (!fs.existsSync(dir)) {
    await fs.promises.mkdir(dir, { recursive: true });
  }
}

async function safeUnlink(filePath: string): Promise<void> {
  try {
    await unlinkAsync(filePath);
  } catch {
    /* best-effort temp cleanup */
  }
}

// ---------------------------------------------------------------------------
// Default transport-backed semantic enricher (task 17.5 analyze path)
// ---------------------------------------------------------------------------

/** Provider/model used for the default Gemini-backed semantic enrichment. */
const DEFAULT_ENRICHMENT_PROVIDER = 'gemini';
const DEFAULT_ENRICHMENT_MODEL = 'gemini-video';

/**
 * Default `SemanticEnricher` that reuses the provider transport analyze path
 * (task 17.5). It sends the source bytes plus a JSON-only instruction to the
 * transport's `analyzeVideo`, wrapping the call in `collectAIUsage` so tokens are
 * metered as `video.generation`. Any transport failure (including a missing
 * provider key) is surfaced as {@link EnrichmentUnavailableError} so the service
 * retains deterministic results without marking the analysis completed (Req 4.10).
 */
export class TransportSemanticEnricher implements SemanticEnricher {
  private readonly transport: VideoProviderTransport;
  private readonly provider: string;
  private readonly model: string;

  constructor(opts: { transport?: VideoProviderTransport; provider?: string; model?: string } = {}) {
    this.transport = opts.transport ?? createGeminiVideoTransport();
    this.provider = opts.provider ?? DEFAULT_ENRICHMENT_PROVIDER;
    this.model = opts.model ?? DEFAULT_ENRICHMENT_MODEL;
  }

  async enrich(ctx: EnrichmentContext): Promise<EnrichmentResult> {
    if (typeof this.transport.analyzeVideo !== 'function') {
      throw new EnrichmentUnavailableError(
        'Configured provider transport does not support analysis',
      );
    }

    const req: TransportRequest = {
      provider: this.provider,
      model: this.model,
      instruction: buildEnrichmentInstruction(ctx.durationMs),
      outputSeconds: Math.max(1, Math.round(ctx.durationMs / 1000)),
      inputBase64: ctx.buffer.toString('base64'),
      inputMimeType: ctx.source.mimeType,
    };

    try {
      const { result } = await collectAIUsage(
        'video.generation',
        { userId: ctx.source.userId, workspaceId: ctx.source.workspaceId },
        () => this.transport.analyzeVideo!(req, ctx.signal),
      );
      const parsed = parseEnrichmentJson(result.analysis, ctx.durationMs);
      return {
        provider: result.provider || this.provider,
        model: result.model || this.model,
        ...parsed,
      };
    } catch (err) {
      // A missing key / unreachable provider / unusable response is treated as
      // enrichment UNAVAILABLE, not an analysis failure (Req 4.10).
      const message =
        err instanceof VideoProviderCallError
          ? err.message
          : `Semantic enrichment unavailable: ${(err as Error)?.message ?? String(err)}`;
      throw new EnrichmentUnavailableError(message);
    }
  }
}

/** Build the JSON-only enrichment instruction sent to the analyze transport. */
export function buildEnrichmentInstruction(durationMs: number): string {
  return [
    'Analyze the attached video and respond with ONLY a JSON object of the exact shape:',
    '{',
    '  "transcript": [{"startMs": <int>, "endMs": <int>, "text": <string>}],',
    '  "hookCandidates": [{"startMs": <int>, "endMs": <int>, "confidence": <number 0..1>}],',
    '  "importantMoments": [{"startMs": <int>, "endMs": <int>, "confidence": <number 0..1>}]',
    '}',
    `The video is ${Math.round(durationMs)} ms long; every startMs/endMs must fall within [0, ${Math.round(durationMs)}] with startMs < endMs.`,
    'If there is no detectable speech, return an empty "transcript" array.',
    'Do not include any prose, explanation, or markdown fences — JSON only.',
  ].join('\n');
}

/** Parse the analyze transport's JSON text into enrichment segments (times in ms). */
export function parseEnrichmentJson(
  raw: string,
  durationMs: number,
): Pick<EnrichmentResult, 'transcript' | 'hookCandidates' | 'importantMoments'> {
  const json = extractFirstJsonObject(raw);
  if (!json) {
    throw new EnrichmentUnavailableError('Enrichment response contained no JSON object');
  }
  let parsed: any;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new EnrichmentUnavailableError('Enrichment response was not valid JSON');
  }

  const clampMs = (v: unknown): number => {
    const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0;
    return Math.min(Math.max(n, 0), Math.round(durationMs));
  };

  const transcript: TranscriptSegment[] = Array.isArray(parsed.transcript)
    ? parsed.transcript
        .map((s: any) => ({ startMs: clampMs(s?.startMs), endMs: clampMs(s?.endMs), text: typeof s?.text === 'string' ? s.text : '' }))
        .filter((s: TranscriptSegment) => s.endMs > s.startMs)
    : [];

  const toMoments = (arr: unknown): ScoredMoment[] =>
    Array.isArray(arr)
      ? arr
          .map((m: any) => ({
            startMs: clampMs(m?.startMs),
            endMs: clampMs(m?.endMs),
            confidence: typeof m?.confidence === 'number' && Number.isFinite(m.confidence)
              ? Math.min(Math.max(m.confidence, 0), 1)
              : 0,
          }))
          .filter((m: ScoredMoment) => m.endMs > m.startMs)
      : [];

  return {
    transcript,
    hookCandidates: toMoments(parsed.hookCandidates),
    importantMoments: toMoments(parsed.importantMoments),
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

// ---------------------------------------------------------------------------
// Deterministic analysis job id (Req 4.9 reuse + 18.4 progress lookup)
// ---------------------------------------------------------------------------

/**
 * The deterministic `Video_Edit_Job` id used for a source's analysis bookkeeping.
 * Because it is a pure function of `(projectId, sourceId)`, the analyze endpoint
 * and the analysis-status read resolve the SAME job record, and a re-triggered
 * analysis reuses the existing job/artifact instead of duplicating work (Req 4.9).
 */
export function videoAnalysisJobId(projectId: string, sourceId: string): string {
  return `ve-analysis-${projectId}-${sourceId}`;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Video_Analysis_Service. Produces the structured `VideoAnalysis` record with
 * deterministic scene detection before AI enrichment, reuses a completed
 * analysis idempotently, and never marks an incomplete/failed analysis completed
 * or persists a reusable partial (Req 4.1–4.11).
 */
export class VideoAnalysisService {
  private readonly storage: IStorageService;
  private readonly artifacts: ArtifactRepository;
  private readonly processor: AnalysisProcessor;
  private readonly enricher: SemanticEnricher;
  private readonly sourceModel: Model<IVideoSource>;
  private readonly jobModel: Model<IVideoEditJob>;
  private readonly log: VideoAnalysisServiceDeps['logger'];

  constructor(deps: VideoAnalysisServiceDeps = {}) {
    this.storage = deps.storage ?? getStorageService();
    this.artifacts = deps.artifactRepository ?? getArtifactRepository();
    const videoStorage = deps.videoStorage ?? defaultVideoStorageService;
    this.processor = deps.processor ?? new FfmpegAnalysisProcessor(videoStorage);
    this.enricher = deps.enricher ?? new TransportSemanticEnricher();
    this.sourceModel = deps.sourceModel ?? DefaultVideoSourceModel;
    this.jobModel = deps.jobModel ?? DefaultVideoEditJobModel;
    this.log = deps.logger ?? defaultLogger;
  }

  /**
   * Analyze a `Video_Source`, producing (and, when complete, persisting) a
   * `VideoAnalysis` record. If a completed analysis artifact already exists for
   * the source it is reused with NO new AI call (Req 4.9).
   */
  async analyze(sourceId: string, signal?: AbortSignal): Promise<AnalyzeResult> {
    const source = await this.sourceModel.findOne({ sourceId }).exec();
    if (!source) throw new AnalysisSourceNotFoundError(sourceId);

    // 1. Reuse an existing completed analysis without re-analysis (Req 4.9).
    const existing = await this.findCompletedAnalysis(source.projectId, sourceId);
    if (existing) {
      this.log?.info?.(
        '[VideoEditor][VideoAnalysis] Reusing existing completed analysis artifact',
        { sourceId, projectId: source.projectId, artifactId: existing.artifactId },
      );
      return { analysis: existing.analysis, artifactId: existing.artifactId, reused: true };
    }

    const jobId = videoAnalysisJobId(source.projectId, sourceId);
    const completedStages: AnalysisStage[] = [];

    // Structured lifecycle event: analysis started (Req 22.1). Fired only for a
    // genuinely new analysis (the reuse short-circuit above returns first).
    emitLifecycleEvent('analysis_started', {
      userId: source.userId,
      workspaceId: source.workspaceId,
      projectId: source.projectId,
      jobId,
      sourceId,
    });

    try {
      // Fetch the immutable original bytes (never modified).
      const original = await this.storage.downloadFile(source.storageKey);
      const buffer = original.buffer;

      // 2. Metadata (Req 4.1).
      const metadata = await this.probeOrFail(buffer, sourceId);
      const durationMs = Math.round((metadata.duration ?? 0) * 1000);
      completedStages.push('probe_metadata');

      // 3. Deterministic scene detection BEFORE any AI enrichment (Req 4.2).
      const scenes = await this.detectScenesOrFail(buffer, durationMs, sourceId);
      completedStages.push('scene_detection');

      // 4. Audio features — loudness → silence (pure core) → speech (Req 4.5).
      const audioFeatures = await this.computeAudioFeaturesOrFail(buffer, durationMs, sourceId);
      completedStages.push('audio_features');

      // Assemble the deterministic base record (used for both the partial and
      // completed outcomes).
      const base: VideoAnalysis = {
        sourceId,
        projectId: source.projectId,
        durationSeconds: metadata.duration ?? 0,
        fps: metadata.fps ?? 0,
        width: metadata.width ?? 0,
        height: metadata.height ?? 0,
        aspectRatio: computeAspectRatio(metadata.width ?? 0, metadata.height ?? 0),
        scenes,
        transcript: [],
        audioFeatures,
        hookCandidates: [],
        importantMoments: [],
        stages: {
          probeMetadata: true,
          sceneDetection: true,
          audioFeatures: true,
          transcript: false,
          semanticEnrichment: false,
        },
        completed: false,
        status: 'partial',
      };

      // 5. AI semantic enrichment (Req 4.3, 4.4, 4.6). Unavailable → retain
      //    deterministic results, leave enrichment incomplete (Req 4.10).
      let enrichment: EnrichmentResult;
      try {
        enrichment = await this.enricher.enrich({
          source,
          buffer,
          durationMs,
          scenes,
          signal,
        });
      } catch (err) {
        if (err instanceof EnrichmentUnavailableError) {
          this.log?.warn?.(
            '[VideoEditor][VideoAnalysis] Semantic enrichment unavailable; retaining deterministic results (not completed)',
            { sourceId, jobId, reason: err.message },
          );
          await this.markJobEnrichmentUnavailable(source, jobId, completedStages);
          // Partial: NOT completed, NOT persisted as a reusable artifact (Req 4.10).
          return { analysis: base, artifactId: null, reused: false };
        }
        throw err; // any other error is a hard failure (Req 4.11)
      }

      // Transcript stage completes even when the transcript is empty (Req 4.4).
      base.transcript = enrichment.transcript;
      base.hookCandidates = enrichment.hookCandidates;
      base.importantMoments = enrichment.importantMoments;
      base.stages.transcript = true;
      base.stages.semanticEnrichment = true;
      base.enrichmentProvider = enrichment.provider;
      base.enrichmentModel = enrichment.model;
      completedStages.push('transcript', 'semantic_enrichment');

      // 6. Completion gate (Req 4.7): every field populated AND well-formed.
      const completed = this.isComplete(base, durationMs);
      if (!completed) {
        // Malformed enrichment is not a valid completion; treat as unavailable
        // partial (retain deterministic, do not persist a reusable artifact).
        this.log?.warn?.(
          '[VideoEditor][VideoAnalysis] Enrichment produced malformed timing; analysis not completed',
          { sourceId, jobId },
        );
        base.stages.transcript = false;
        base.stages.semanticEnrichment = false;
        await this.markJobEnrichmentUnavailable(source, jobId, ['probe_metadata', 'scene_detection', 'audio_features']);
        return { analysis: base, artifactId: null, reused: false };
      }

      base.completed = true;
      base.status = 'completed';

      // 7. Persist the completed analysis as an immutable artifact (Req 4.8).
      const artifactId = await this.persistCompletedAnalysis(source, jobId, base);
      await this.markJobCompleted(source, jobId, completedStages, artifactId);

      this.log?.info?.(
        '[VideoEditor][VideoAnalysis] Completed analysis and persisted artifact',
        { sourceId, jobId, projectId: source.projectId, artifactId },
      );

      // Structured lifecycle event: analysis completed (Req 22.1).
      emitLifecycleEvent('analysis_completed', {
        userId: source.userId,
        workspaceId: source.workspaceId,
        projectId: source.projectId,
        jobId,
        sourceId,
        details: { artifactId, durationSeconds: base.durationSeconds },
      });

      return { analysis: base, artifactId, reused: false };
    } catch (err) {
      // 8. Hard failure (Req 4.11): record error code, status failed, no
      //    reusable partial artifact.
      const code = err instanceof AnalysisFailedError ? err.code : 'ANALYSIS_FAILED';
      this.log?.error?.(
        '[VideoEditor][VideoAnalysis] Analysis failed; no reusable partial persisted',
        err,
        { sourceId, jobId, code },
      );
      await this.markJobFailed(source, jobId, completedStages, code);
      throw err instanceof AnalysisFailedError
        ? err
        : new AnalysisFailedError(code, `Analysis failed for source ${sourceId}: ${(err as Error)?.message ?? String(err)}`);
    }
  }

  // -------------------------------------------------------------------------
  // Reuse lookup (Req 4.9)
  // -------------------------------------------------------------------------

  /**
   * Read an existing COMPLETED analysis for a source without performing any new
   * analysis (Req 4.9). Returns the persisted record + its artifactId, or null
   * when the source is unknown or no completed analysis exists yet. Used by the
   * `GET .../analysis` endpoint and by the analyze endpoint's reuse short-circuit.
   */
  async getCompletedAnalysis(
    sourceId: string,
  ): Promise<{ analysis: VideoAnalysis; artifactId: string } | null> {
    const source = await this.sourceModel.findOne({ sourceId }).exec();
    if (!source) return null;
    return this.findCompletedAnalysis(source.projectId, sourceId);
  }

  /**
   * Find an existing COMPLETED analysis artifact for a source and load its
   * record. Returns null when none exists or none is completed (Req 4.9). The
   * analysis input is the source itself, recorded as `provenance.inputVersionId`.
   */
  private async findCompletedAnalysis(
    projectId: string,
    sourceId: string,
  ): Promise<{ analysis: VideoAnalysis; artifactId: string } | null> {
    const artifacts = await this.artifacts.listByCategory(projectId, 'analysis');
    for (const artifact of artifacts) {
      if (artifact.provenance?.inputVersionId !== sourceId) continue;
      try {
        const bytes = await this.storage.downloadFile(artifact.storageKey);
        const parsed = JSON.parse(bytes.buffer.toString('utf-8')) as VideoAnalysis;
        if (parsed?.completed === true && parsed?.status === 'completed') {
          return { analysis: parsed, artifactId: artifact.artifactId };
        }
      } catch (err) {
        this.log?.warn?.(
          '[VideoEditor][VideoAnalysis] Skipping unreadable analysis artifact during reuse lookup',
          { err, artifactId: artifact.artifactId, sourceId },
        );
      }
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Deterministic steps (each hard-fails per Req 4.11)
  // -------------------------------------------------------------------------

  private async probeOrFail(buffer: Buffer, sourceId: string): Promise<VideoMetadata> {
    try {
      return await this.processor.probe(buffer);
    } catch (err) {
      throw new AnalysisFailedError(
        'METADATA_EXTRACTION_FAILED',
        `Metadata extraction failed for source ${sourceId}: ${(err as Error)?.message ?? String(err)}`,
      );
    }
  }

  private async detectScenesOrFail(
    buffer: Buffer,
    durationMs: number,
    sourceId: string,
  ): Promise<SceneBoundary[]> {
    try {
      return await this.processor.detectScenes(buffer, durationMs);
    } catch (err) {
      throw new AnalysisFailedError(
        'SCENE_DETECTION_FAILED',
        `Scene detection failed for source ${sourceId}: ${(err as Error)?.message ?? String(err)}`,
      );
    }
  }

  private async computeAudioFeaturesOrFail(
    buffer: Buffer,
    durationMs: number,
    sourceId: string,
  ): Promise<AudioFeatures> {
    try {
      const loudnessCurve = await this.processor.extractLoudnessCurve(buffer, durationMs);
      // Silence classification is owned by the pure core, reading the
      // single-source thresholds (−40 dB / 0.5 s) — never hardcoded here.
      const silenceSegments = classifySilence(loudnessCurve, SILENCE_THRESHOLDS);
      const speechSegments = deriveSpeechSegments(silenceSegments, durationMs);
      return { loudnessCurve, silenceSegments, speechSegments };
    } catch (err) {
      throw new AnalysisFailedError(
        'AUDIO_ANALYSIS_FAILED',
        `Audio feature analysis failed for source ${sourceId}: ${(err as Error)?.message ?? String(err)}`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Completion predicate (Req 4.7)
  // -------------------------------------------------------------------------

  /**
   * A `VideoAnalysis` is complete iff every required field is populated and
   * well-formed (Req 4.7): positive metadata, at least one scene, audio features
   * present, and transcript + decision-support scores that pass the pure
   * well-formedness core.
   */
  private isComplete(a: VideoAnalysis, durationMs: number): boolean {
    const metadataOk =
      a.durationSeconds > 0 &&
      a.fps > 0 &&
      a.width > 0 &&
      a.height > 0 &&
      a.aspectRatio !== '0:0';
    const scenesOk = Array.isArray(a.scenes) && a.scenes.length > 0;
    const audioOk = !!a.audioFeatures && Array.isArray(a.audioFeatures.speechSegments);
    const timingOk = isWellFormedAnalysisTiming(
      {
        transcript: a.transcript,
        hookCandidates: a.hookCandidates,
        importantMoments: a.importantMoments,
      },
      durationMs,
    );
    return (
      metadataOk &&
      scenesOk &&
      audioOk &&
      a.stages.probeMetadata &&
      a.stages.sceneDetection &&
      a.stages.audioFeatures &&
      a.stages.transcript &&
      a.stages.semanticEnrichment &&
      timingOk
    );
  }

  // -------------------------------------------------------------------------
  // Persistence (Req 4.8)
  // -------------------------------------------------------------------------

  /** Persist a completed analysis as an immutable `analysis` artifact (Req 4.8). */
  private async persistCompletedAnalysis(
    source: IVideoSource,
    jobId: string,
    analysis: VideoAnalysis,
  ): Promise<string> {
    const buffer = Buffer.from(JSON.stringify(analysis), 'utf-8');
    const provenance: Partial<ArtifactProvenance> = {
      jobId,
      // The analysis input is the source itself; recorded so reuse lookup can
      // match a completed analysis back to its source (Req 4.9).
      inputVersionId: source.sourceId,
      provider: analysis.enrichmentProvider || DEFAULT_ENRICHMENT_PROVIDER,
      model: analysis.enrichmentModel || DEFAULT_ENRICHMENT_MODEL,
      prompt: `video-analysis:${source.sourceId}`,
      costCredits: 0,
    };
    const result = await this.artifacts.createArtifact({
      projectId: source.projectId,
      workspaceId: source.workspaceId,
      userId: source.userId,
      category: 'analysis',
      buffer,
      originalName: `${source.sourceId}-analysis.json`,
      mimeType: 'application/json',
      provenance,
    });
    return result.artifact.artifactId;
  }

  // -------------------------------------------------------------------------
  // Job bookkeeping (best-effort; analysis outcome is authoritative)
  // -------------------------------------------------------------------------

  private async loadOrCreateJob(
    source: IVideoSource,
    jobId: string,
  ): Promise<IVideoEditJob | null> {
    try {
      const existing = await this.jobModel.findOne({ jobId }).exec();
      if (existing) return existing;
      return await this.jobModel.create({
        jobId,
        projectId: source.projectId,
        workspaceId: source.workspaceId,
        userId: source.userId,
        idempotencyKey: jobId,
        state: 'ANALYZING',
        attempt: 1,
        progress: 0,
        completedStages: [],
        inputArtifactIds: [],
        outputArtifactIds: [],
      });
    } catch (err) {
      this.log?.warn?.('[VideoEditor][VideoAnalysis] Job bookkeeping unavailable', { err, jobId });
      return null;
    }
  }

  private async markJobEnrichmentUnavailable(
    source: IVideoSource,
    jobId: string,
    completedStages: AnalysisStage[],
  ): Promise<void> {
    const job = await this.loadOrCreateJob(source, jobId);
    if (!job) return;
    // Enrichment-unavailable is not a failure: the job stays in-progress with
    // deterministic stages recorded and progress below complete (Req 4.10).
    const progress = Math.floor((completedStages.length / TOTAL_ANALYSIS_STAGES) * 100);
    job.state = 'ANALYZING';
    job.completedStages = [...completedStages];
    job.progress = Math.min(progress, 99);
    job.errorCode = 'ENRICHMENT_UNAVAILABLE';
    await this.saveJob(job);
  }

  private async markJobCompleted(
    source: IVideoSource,
    jobId: string,
    completedStages: AnalysisStage[],
    artifactId: string,
  ): Promise<void> {
    const job = await this.loadOrCreateJob(source, jobId);
    if (!job) return;
    job.state = 'COMPLETED';
    job.completedStages = [...completedStages];
    job.progress = 100;
    job.errorCode = undefined;
    job.outputArtifactIds = Array.from(new Set([...(job.outputArtifactIds ?? []), artifactId]));
    await this.saveJob(job);
  }

  private async markJobFailed(
    source: IVideoSource,
    jobId: string,
    completedStages: AnalysisStage[],
    code: string,
  ): Promise<void> {
    const job = await this.loadOrCreateJob(source, jobId);
    if (!job) return;
    job.state = 'FAILED';
    job.completedStages = [...completedStages];
    job.errorCode = code;
    await this.saveJob(job);
  }

  private async saveJob(job: IVideoEditJob): Promise<void> {
    try {
      await job.save();
    } catch (err) {
      this.log?.warn?.(
        '[VideoEditor][VideoAnalysis] Failed to persist job bookkeeping (analysis outcome unaffected)',
        { err, jobId: job.jobId },
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton accessor
// ---------------------------------------------------------------------------

let videoAnalysisServiceInstance: VideoAnalysisService | null = null;

/** Get or lazily create the shared `VideoAnalysisService` instance. */
export function getVideoAnalysisService(): VideoAnalysisService {
  if (!videoAnalysisServiceInstance) {
    videoAnalysisServiceInstance = new VideoAnalysisService();
  }
  return videoAnalysisServiceInstance;
}
