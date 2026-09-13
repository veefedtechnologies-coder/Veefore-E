/**
 * Media_Ingestion_Service — the IO shell over the pure
 * `media-ingestion-validation.logic` core that validates, stores, probes, and
 * prepares uploaded source media (task 7.3, Req 3.5–3.11, 20.4).
 *
 * Responsibilities (each mapped to an acceptance criterion):
 *   - validateAndAccept (Req 3.2, 3.3, 3.4, 3.5, 3.6):
 *       Validate the ACTUAL byte signature and size via `validateMediaIngestion`
 *       BEFORE any persistence. On rejection NOTHING is stored — no `Video_Source`
 *       record and no file bytes (Req 3.3, 3.4). On acceptance the original bytes
 *       are stored IMMUTABLY under `video-editor/{projectId}/original/` via the
 *       ArtifactRepository (which never overwrites, Req 3.6, 20.4) and a
 *       `Video_Source` record is created.
 *   - createResumableUpload (Req 3.10):
 *       For files larger than the configured 100 MB threshold, return a resumable
 *       object-storage upload ticket rather than routing the full binary through
 *       the application server.
 *   - probeAndPrepare (Req 3.7, 3.8, 3.9, 3.11):
 *       Reuse `VideoStorageService` FFprobe metadata extraction + thumbnail
 *       generation, and add a low-resolution proxy and a waveform as immutable
 *       Video_Artifacts. Persist duration/dimensions/fps/codec/container onto the
 *       `Video_Source`. Report stage-derived, monotonic, never-premature progress
 *       (Req 3.11) via the pure `job-state.logic` helpers. FFprobe failure marks
 *       ingestion FAILED and RETAINS the stored bytes unchanged (Req 3.8).
 *
 * The accept/reject decision, size boundaries, and the resumable threshold all
 * come from the pure core and the single-source config (`INGESTION_LIMITS`); this
 * module never hardcodes a limit. All FFmpeg/FFprobe work is delegated to an
 * injectable `MediaProcessor` (defaulting to `VideoStorageService` + fluent-ffmpeg)
 * so the orchestration is testable without a real encoder (task 7.4).
 */

import { randomUUID } from 'crypto';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
// Configure fluent-ffmpeg's ffmpeg/ffprobe binary paths (side effect) so probe +
// proxy/waveform generation work without a system ffmpeg/ffprobe install.
import '../../../config/ffmpeg-paths';
import ffmpeg from 'fluent-ffmpeg';

import { logger as defaultLogger } from '../../../config/logger';
import {
  VideoSourceModel as DefaultVideoSourceModel,
  type IVideoSource,
} from '../../../models/VideoEditor/VideoSource';
import {
  VideoEditJobModel as DefaultVideoEditJobModel,
  type IVideoEditJob,
} from '../../../models/VideoEditor/VideoEditJob';
import type { Model } from 'mongoose';
import {
  getStorageService,
  type IStorageService,
} from '../../storage/services/storage.service';
import {
  videoStorageService as defaultVideoStorageService,
  type IVideoStorageService,
  type VideoMetadata,
} from '../../storage/services/video-storage.service';

import { INGESTION_LIMITS } from '../config/video-editor.config';
import {
  validateMediaIngestion,
  SIGNATURE_HEADER_BYTES,
  type IngestionRejectionReason,
  type SupportedContainer,
} from './media-ingestion-validation.logic';
import {
  computeJobProgress,
  clampMonotonicProgress,
  transition,
  type JobState,
  type ProgressReport,
} from './job-state.logic';
import {
  getArtifactRepository,
  ArtifactRepository,
  type CreateArtifactResult,
} from './artifact-repository.service';
import type { ArtifactProvenance } from './artifact-provenance.logic';
import {
  guardedMediaFetch,
  type GuardedFetchOptions,
} from './guarded-media-fetch.service';
import { emitLifecycleEvent } from './video-editor-events';

const writeFileAsync = promisify(fs.writeFile);
const unlinkAsync = promisify(fs.unlink);
const readFileAsync = promisify(fs.readFile);

// ---------------------------------------------------------------------------
// Ingestion stages (drive stage-derived progress, Req 3.11)
// ---------------------------------------------------------------------------

/**
 * The ordered ingestion+preparation stages. Progress is derived SOLELY from how
 * many of these have completed (Req 3.11) and is reported as 100 / complete only
 * once every stage has finished — never before.
 */
export const INGESTION_STAGES = [
  'store_original',
  'probe_metadata',
  'generate_proxy',
  'generate_thumbnails',
  'generate_waveform',
] as const;

/** One of the ordered ingestion stages. */
export type IngestionStage = (typeof INGESTION_STAGES)[number];

/** Total ingestion stages — the denominator for stage-derived progress (Req 3.11). */
export const TOTAL_INGESTION_STAGES = INGESTION_STAGES.length;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Thrown when an upload fails validation (unsupported actual format or
 * out-of-range size). When this is thrown NOTHING has been stored — no
 * `Video_Source` and no bytes (Req 3.3, 3.4).
 */
export class MediaIngestionRejectedError extends Error {
  readonly code: 'UNSUPPORTED_FORMAT' | 'FILE_TOO_LARGE' | 'EMPTY_FILE';
  readonly statusCode: number;
  readonly reason: IngestionRejectionReason;

  constructor(reason: IngestionRejectionReason, message: string) {
    super(message);
    this.name = 'MediaIngestionRejectedError';
    this.reason = reason;
    // Map the pure-core reason to a stable API error code + HTTP status.
    if (reason === 'MAX_SIZE_EXCEEDED') {
      this.code = 'FILE_TOO_LARGE';
      this.statusCode = 413; // Payload Too Large
    } else if (reason === 'EMPTY_FILE') {
      this.code = 'EMPTY_FILE';
      this.statusCode = 400;
    } else {
      this.code = 'UNSUPPORTED_FORMAT';
      this.statusCode = 415; // Unsupported Media Type
    }
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/**
 * Thrown when FFprobe cannot extract metadata from a stored `Video_Source`
 * (Req 3.8). The stored bytes are RETAINED unchanged; ingestion is marked failed.
 */
export class MetadataExtractionError extends Error {
  readonly code = 'METADATA_EXTRACTION_FAILED';
  readonly statusCode = 422;
  readonly sourceId: string;

  constructor(sourceId: string, message: string) {
    super(message);
    this.name = 'MetadataExtractionError';
    this.sourceId = sourceId;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

// ---------------------------------------------------------------------------
// Input / output shapes
// ---------------------------------------------------------------------------

/** An in-app upload presented for validation + storage (≤ resumable threshold). */
export interface UploadDescriptor {
  projectId: string;
  workspaceId: string;
  userId: string;
  /** The uploaded file bytes. */
  buffer: Buffer;
  /** Original filename (used to derive stored file extensions). */
  originalName: string;
  /** Declared MIME/container from the client — informational; the actual signature decides (Req 3.2). */
  declaredMimeType?: string | null;
}

/**
 * A remote/external source asset to ingest by URL (Req 3, 19.6, 19.7). The URL
 * is fetched ONLY through the SSRF guard (allowlist + non-internal IP), and the
 * downloaded bytes then flow through the same validate-then-store path as an
 * in-app upload — nothing is stored if the bytes fail signature/size validation.
 */
export interface RemoteUploadDescriptor {
  projectId: string;
  workspaceId: string;
  userId: string;
  /** The external/provider-supplied media URL to fetch (SSRF-guarded). */
  url: string;
  /** Optional filename override; derived from the URL path when omitted. */
  originalName?: string;
  /** Declared MIME/container hint — informational; the actual signature decides. */
  declaredMimeType?: string | null;
}

/** A large (>100 MB) upload routed to resumable object-storage upload (Req 3.10). */
export interface LargeUploadDescriptor {
  projectId: string;
  workspaceId: string;
  userId: string;
  originalName: string;
  sizeBytes: number;
  declaredMimeType?: string | null;
}

/** A ticket describing where/how a large file must be uploaded directly (Req 3.10). */
export interface ResumableUploadTicket {
  /** Correlates the upload with the eventual probe/prepare step. */
  uploadId: string;
  /** Pre-assigned source id the completed upload becomes. */
  sourceId: string;
  /** Deterministic, project-scoped storage key the bytes must land at (original/ folder). */
  storageKey: string;
  /** The storage folder (`video-editor/{projectId}/original`). */
  folder: string;
  /** The upload method — always resumable/direct object-storage for this path. */
  method: 'resumable';
  /** The maximum size in bytes the upload may reach (single-source config). */
  maxBytes: number;
}

/** The result of accepting + storing an original source (before prepare). */
export interface AcceptResult {
  source: IVideoSource;
  /** The immutable original-bytes artifact. */
  originalArtifact: CreateArtifactResult;
  /** The ingestion job tracking preparation progress. */
  job: IVideoEditJob;
}

/**
 * A prepared derived artifact reference. Each preview artifact is OPTIONAL: the
 * proxy/thumbnail/waveform are best-effort previews, and a slow or failed FFmpeg
 * step for any of them must NOT block editing — only the probe-derived
 * `durationMs` is strictly required (No-hang: preview stages degrade honestly).
 */
export interface PreparedArtifacts {
  proxy?: CreateArtifactResult;
  thumbnails?: CreateArtifactResult;
  waveform?: CreateArtifactResult;
}

/** The result of probing + preparing a stored source (Req 3.7, 3.9). */
export interface IngestionResult {
  source: IVideoSource;
  metadata: VideoMetadata;
  artifacts: PreparedArtifacts;
  job: IVideoEditJob;
  progress: ProgressReport;
}

/**
 * FFmpeg/FFprobe operations the service depends on. Extracted behind an interface
 * so the orchestration is testable without a real encoder (task 7.4). The default
 * implementation reuses `VideoStorageService` (FFprobe + thumbnails) and adds
 * proxy + waveform via fluent-ffmpeg.
 */
export interface MediaProcessor {
  /** Extract duration/dimensions/fps/codec/container via FFprobe (Req 3.7). */
  probe(buffer: Buffer): Promise<VideoMetadata>;
  /** Produce a low-resolution proxy video (Req 3.9). */
  generateProxy(buffer: Buffer, originalName: string): Promise<Buffer>;
  /** Produce a representative thumbnail image (Req 3.9). */
  generateThumbnail(buffer: Buffer, originalName: string): Promise<Buffer>;
  /** Produce waveform image data from the audio track (Req 3.9). */
  generateWaveform(buffer: Buffer, originalName: string): Promise<Buffer>;
}

/** Injectable dependencies (defaulted for production, overridable for tests). */
export interface MediaIngestionServiceDeps {
  storage?: IStorageService;
  videoStorage?: IVideoStorageService;
  artifactRepository?: ArtifactRepository;
  mediaProcessor?: MediaProcessor;
  sourceModel?: Model<IVideoSource>;
  jobModel?: Model<IVideoEditJob>;
  logger?: Pick<typeof defaultLogger, 'info' | 'warn' | 'error' | 'debug'>;
  /** Progress observer invoked after each ingestion stage completes (Req 3.11). */
  onProgress?: (report: ProgressReport, completedStages: IngestionStage[]) => void;
}

// ---------------------------------------------------------------------------
// Threshold helper (Req 3.10)
// ---------------------------------------------------------------------------

/**
 * Does an upload of `sizeBytes` require resumable object-storage upload rather
 * than routing the full binary through the app server (Req 3.10)? Reads the
 * threshold from the single-source config; never hardcodes it.
 */
export function requiresResumableUpload(sizeBytes: number): boolean {
  return (
    typeof sizeBytes === 'number' &&
    Number.isFinite(sizeBytes) &&
    sizeBytes > INGESTION_LIMITS.resumableThresholdBytes
  );
}

// ---------------------------------------------------------------------------
// Default MediaProcessor (VideoStorageService FFprobe/thumbnails + fluent-ffmpeg)
// ---------------------------------------------------------------------------

/**
 * Hard ceiling (ms) for any single preview-generation FFmpeg run (proxy /
 * thumbnail / waveform). On timeout the subprocess is SIGKILLed and the stage
 * degrades honestly (the preview is skipped) rather than hanging the request.
 * Env-overridable via `INGEST_PREVIEW_TIMEOUT_MS`; default 90s.
 */
const PREVIEW_FFMPEG_TIMEOUT_MS = (() => {
  const raw = Number(process.env.INGEST_PREVIEW_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 90_000;
})();

/**
 * Production `MediaProcessor`. Reuses `VideoStorageService.extractMetadata`
 * (FFprobe) and adds proxy + thumbnail + waveform generation via fluent-ffmpeg,
 * writing to temp files exactly as `VideoStorageService` does and cleaning them up.
 */
class FfmpegMediaProcessor implements MediaProcessor {
  constructor(private readonly videoStorage: IVideoStorageService) {}

  async probe(buffer: Buffer): Promise<VideoMetadata> {
    return this.videoStorage.extractMetadata(buffer);
  }

  async generateProxy(buffer: Buffer, _originalName: string): Promise<Buffer> {
    return this.runToFile(buffer, '.mp4', (command, outputPath) =>
      command
        // Low-resolution proxy: scale to 360p height, keep aspect (even width),
        // fast preset, AAC audio — a genuinely smaller, seekable preview.
        .videoFilters('scale=-2:360')
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions(['-preset', 'veryfast', '-movflags', '+faststart'])
        .output(outputPath),
    );
  }

  async generateThumbnail(buffer: Buffer, _originalName: string): Promise<Buffer> {
    return this.runScreenshot(buffer, '00:00:01');
  }

  async generateWaveform(buffer: Buffer, _originalName: string): Promise<Buffer> {
    return this.runToFile(buffer, '.png', (command, outputPath) =>
      command
        // Real waveform image rendered from the audio track.
        .complexFilter(['showwavespic=s=1000x200:colors=#4f46e5'])
        .frames(1)
        .output(outputPath),
    );
  }

  /** Write `buffer` to a temp input, run `build(command,out)`, return the output bytes. */
  private async runToFile(
    buffer: Buffer,
    outputExt: string,
    build: (command: ffmpeg.FfmpegCommand, outputPath: string) => ffmpeg.FfmpegCommand,
  ): Promise<Buffer> {
    const { inputPath, outputPath, tempDir } = this.tempPaths(outputExt);
    await ensureDir(tempDir);
    await writeFileAsync(inputPath, buffer);
    try {
      await new Promise<void>((resolve, reject) => {
        const command = build(ffmpeg(inputPath), outputPath);
        // Hard timeout with SIGKILL so a stuck/very-slow encode (e.g. a large
        // HEVC .mov) can NEVER hang the request forever.
        const timer = setTimeout(() => {
          try {
            command.kill('SIGKILL');
          } catch {
            /* best-effort */
          }
          reject(new Error(`FFmpeg timed out after ${PREVIEW_FFMPEG_TIMEOUT_MS}ms`));
        }, PREVIEW_FFMPEG_TIMEOUT_MS);
        command
          .on('end', () => {
            clearTimeout(timer);
            resolve();
          })
          .on('error', (err: Error) => {
            clearTimeout(timer);
            reject(err);
          })
          .run();
      });
      return await readFileAsync(outputPath);
    } finally {
      await safeUnlink(inputPath);
      await safeUnlink(outputPath);
    }
  }

  /** Capture a single JPEG screenshot at `timestamp` and return its bytes. */
  private async runScreenshot(buffer: Buffer, timestamp: string): Promise<Buffer> {
    const { inputPath, outputPath, tempDir } = this.tempPaths('.jpg');
    await ensureDir(tempDir);
    await writeFileAsync(inputPath, buffer);
    try {
      await new Promise<void>((resolve, reject) => {
        const command = ffmpeg(inputPath);
        const timer = setTimeout(() => {
          try {
            command.kill('SIGKILL');
          } catch {
            /* best-effort */
          }
          reject(new Error(`FFmpeg (screenshot) timed out after ${PREVIEW_FFMPEG_TIMEOUT_MS}ms`));
        }, PREVIEW_FFMPEG_TIMEOUT_MS);
        command
          .screenshots({
            timestamps: [timestamp],
            filename: path.basename(outputPath),
            folder: path.dirname(outputPath),
            size: '640x360',
          })
          .on('end', () => {
            clearTimeout(timer);
            resolve();
          })
          .on('error', (err: Error) => {
            clearTimeout(timer);
            reject(err);
          });
      });
      return await readFileAsync(outputPath);
    } finally {
      await safeUnlink(inputPath);
      await safeUnlink(outputPath);
    }
  }

  private tempPaths(outputExt: string): { inputPath: string; outputPath: string; tempDir: string } {
    const tempDir = path.join(process.cwd(), 'uploads', 'temp');
    return {
      tempDir,
      inputPath: path.join(tempDir, `${randomUUID()}.tmp`),
      outputPath: path.join(tempDir, `${randomUUID()}${outputExt}`),
    };
  }
}

/** Derive a stored filename from a URL path, falling back to a generic name. */
function deriveNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const base = path.basename(parsed.pathname);
    if (base && base !== '/' && base.length > 0) return base;
  } catch {
    /* fall through to default */
  }
  return 'remote-source';
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
// Service
// ---------------------------------------------------------------------------

/**
 * Media_Ingestion_Service. Validates + stores original media immutably, then
 * probes and prepares derived artifacts with stage-derived monotonic progress.
 * All accept/reject rules come from the pure `media-ingestion-validation.logic`
 * core; all storage/immutability guarantees come from the ArtifactRepository.
 */
export class MediaIngestionService {
  private readonly storage: IStorageService;
  private readonly artifacts: ArtifactRepository;
  private readonly processor: MediaProcessor;
  private readonly sourceModel: Model<IVideoSource>;
  private readonly jobModel: Model<IVideoEditJob>;
  private readonly log: MediaIngestionServiceDeps['logger'];
  private readonly onProgress?: MediaIngestionServiceDeps['onProgress'];

  constructor(deps: MediaIngestionServiceDeps = {}) {
    this.storage = deps.storage ?? getStorageService();
    this.artifacts = deps.artifactRepository ?? getArtifactRepository();
    const videoStorage = deps.videoStorage ?? defaultVideoStorageService;
    this.processor = deps.mediaProcessor ?? new FfmpegMediaProcessor(videoStorage);
    this.sourceModel = deps.sourceModel ?? DefaultVideoSourceModel;
    this.jobModel = deps.jobModel ?? DefaultVideoEditJobModel;
    this.log = deps.logger ?? defaultLogger;
    this.onProgress = deps.onProgress;
  }

  // -------------------------------------------------------------------------
  // validateAndAccept (Req 3.2–3.6)
  // -------------------------------------------------------------------------

  /**
   * Validate and, only if valid, store the original bytes immutably and create a
   * `Video_Source` (Req 3.5, 3.6). Signature + size validation runs FIRST via the
   * pure core (Req 3.2); on rejection this throws `MediaIngestionRejectedError`
   * and NOTHING is persisted — no bytes, no `Video_Source` (Req 3.3, 3.4).
   *
   * The `Video_Source` is created with the validated container and size; its
   * probe-derived fields (duration/dimensions/fps/codec) are populated later by
   * {@link probeAndPrepare} (Req 3.7). An ingestion job is created to track
   * stage-derived progress (Req 3.11), with the store-original stage marked
   * complete.
   */
  async validateAndAccept(input: UploadDescriptor): Promise<AcceptResult> {
    const buffer = input.buffer;
    const sizeBytes = buffer?.length ?? 0;

    // 1. Validate ACTUAL signature + size BEFORE any persistence (Req 3.2).
    const header = buffer.subarray(0, Math.min(SIGNATURE_HEADER_BYTES, buffer.length));
    const validation = validateMediaIngestion({
      header: new Uint8Array(header),
      sizeBytes,
      declaredMimeType: input.declaredMimeType ?? null,
    });

    if (!validation.accepted) {
      // Rejected — store NOTHING (Req 3.3, 3.4). No Video_Source, no bytes.
      this.log?.warn?.(
        '[VideoEditor][MediaIngestion] Rejected upload before storing',
        { projectId: input.projectId, reason: validation.reason, sizeBytes },
      );
      throw new MediaIngestionRejectedError(validation.reason, validation.message);
    }

    const container: SupportedContainer = validation.container;
    const sourceId = randomUUID();
    const jobId = `ve-ingest-${input.projectId}-${sourceId}`;
    const mimeType = input.declaredMimeType?.trim() || `video/${container === 'mov' ? 'quicktime' : container}`;

    // 2. Store the original bytes IMMUTABLY under original/ (Req 3.5, 3.6, 20.4).
    //    The ArtifactRepository never overwrites and records full provenance.
    const originalArtifact = await this.artifacts.createArtifact({
      projectId: input.projectId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      category: 'original',
      buffer,
      originalName: input.originalName,
      mimeType,
      deterministic: true,
      provenance: this.ingestionProvenance(jobId, sourceId, 'original'),
    });

    // 3. Create the Video_Source record (probe fields filled in by prepare, Req 3.7).
    const source = await this.sourceModel.create({
      sourceId,
      projectId: input.projectId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      storageKey: originalArtifact.storageKey,
      container,
      mimeType,
      sizeBytes,
      durationMs: 0,
      width: 0,
      height: 0,
      fps: 0,
      codec: 'pending',
      immutable: true,
    });

    // 4. Create the ingestion job; the store-original stage is now complete.
    const completed: IngestionStage[] = ['store_original'];
    const progress = this.reportProgress('PREPARING', completed);
    const job = await this.jobModel.create({
      jobId,
      projectId: input.projectId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      idempotencyKey: jobId,
      state: 'QUEUED',
      attempt: 1,
      progress: progress.determinate ? progress.percent : 0,
      completedStages: completed,
      inputArtifactIds: [originalArtifact.artifact.artifactId],
      outputArtifactIds: [originalArtifact.artifact.artifactId],
    });

    this.log?.info?.(
      '[VideoEditor][MediaIngestion] Accepted and stored original source immutably',
      { sourceId, jobId, projectId: input.projectId, container, sizeBytes },
    );

    // Structured lifecycle event: source ingested (Req 22.1). No secret/URL is
    // carried — only ids and non-sensitive descriptors — and the emit never
    // aborts ingestion (Req 22.4, 22.6).
    emitLifecycleEvent('source_ingested', {
      userId: input.userId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      jobId,
      sourceId,
      details: { container, sizeBytes },
    });

    return { source, originalArtifact, job };
  }

  // -------------------------------------------------------------------------
  // ingestFromRemoteUrl (external/provider media fetch — Req 19.6, 19.7)
  // -------------------------------------------------------------------------

  /**
   * Ingest a source asset from an external or provider-supplied URL. The fetch
   * is routed through the SSRF guard ({@link guardedMediaFetch}): the URL is
   * fetched ONLY if its host is on the configured allowlist and resolves to no
   * private/loopback/link-local/internal address (Req 19.6, 19.7). A blocked URL
   * throws before any outbound request is issued and NOTHING is stored.
   *
   * Once fetched, the bytes flow through the exact same {@link validateAndAccept}
   * path as an in-app upload, so remote media is subject to the identical
   * signature/size validation and immutable storage guarantees (Req 3.2–3.6).
   */
  async ingestFromRemoteUrl(
    input: RemoteUploadDescriptor,
    fetchOptions: GuardedFetchOptions = {},
  ): Promise<AcceptResult> {
    // SSRF-guarded fetch (Req 19.6, 19.7). Throws SsrfBlockedError with no
    // outbound request when the destination is off-allowlist or internal.
    const fetched = await guardedMediaFetch(input.url, {
      logger: this.log,
      maxBytes: INGESTION_LIMITS.maxSizeBytes,
      ...fetchOptions,
    });

    const originalName = input.originalName?.trim() || deriveNameFromUrl(input.url);

    // Reuse the standard validate-then-store path — remote bytes get the same
    // signature/size validation and immutable storage as an in-app upload.
    return this.validateAndAccept({
      projectId: input.projectId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      buffer: fetched.buffer,
      originalName,
      declaredMimeType: input.declaredMimeType ?? fetched.contentType ?? null,
    });
  }

  // -------------------------------------------------------------------------
  // createResumableUpload (Req 3.10)
  // -------------------------------------------------------------------------

  /**
   * For files above the configured 100 MB threshold, return a resumable
   * object-storage upload ticket rather than routing the full binary through the
   * app server (Req 3.10). Size + declared-format sanity is checked here; the
   * actual bytes never pass through this process on this path.
   */
  async createResumableUpload(input: LargeUploadDescriptor): Promise<ResumableUploadTicket> {
    if (!requiresResumableUpload(input.sizeBytes)) {
      throw new MediaIngestionRejectedError(
        'UNSUPPORTED_FORMAT',
        `Resumable upload is only for files larger than ${INGESTION_LIMITS.resumableThresholdBytes} bytes; use validateAndAccept.`,
      );
    }
    if (input.sizeBytes > INGESTION_LIMITS.maxSizeBytes) {
      throw new MediaIngestionRejectedError(
        'MAX_SIZE_EXCEEDED',
        `Upload rejected: file size exceeds the maximum of ${INGESTION_LIMITS.maxSizeBytes} bytes.`,
      );
    }

    const sourceId = randomUUID();
    const uploadId = randomUUID();
    const folder = `video-editor/${input.projectId}/original`;
    const storageKey = `${folder}/${sourceId}-${uploadId}`;

    this.log?.info?.(
      '[VideoEditor][MediaIngestion] Issued resumable upload ticket (bytes bypass app server)',
      { sourceId, uploadId, projectId: input.projectId, sizeBytes: input.sizeBytes },
    );

    return {
      uploadId,
      sourceId,
      storageKey,
      folder,
      method: 'resumable',
      maxBytes: INGESTION_LIMITS.maxSizeBytes,
    };
  }

  // -------------------------------------------------------------------------
  // probeAndPrepare (Req 3.7, 3.8, 3.9, 3.11)
  // -------------------------------------------------------------------------

  /**
   * Probe the stored original with FFprobe and prepare derived artifacts —
   * proxy, thumbnails, and waveform (Req 3.7, 3.9). Progress is stage-derived and
   * monotonic and is never reported as 100/complete before every stage finishes
   * (Req 3.11). FFprobe failure marks the job FAILED, sets a
   * `METADATA_EXTRACTION_FAILED` error code, and RETAINS the stored bytes and
   * `Video_Source` unchanged (Req 3.8) — no derived artifacts are produced.
   */
  async probeAndPrepare(sourceId: string): Promise<IngestionResult> {
    const source = await this.sourceModel.findOne({ sourceId }).exec();
    if (!source) {
      throw new MetadataExtractionError(sourceId, `Video_Source ${sourceId} not found`);
    }

    const jobId = `ve-ingest-${source.projectId}-${sourceId}`;
    const job = await this.jobModel.findOne({ jobId }).exec();
    if (!job) {
      throw new MetadataExtractionError(sourceId, `Ingestion job ${jobId} not found`);
    }

    // The store-original stage already completed in validateAndAccept.
    const completed: IngestionStage[] = ['store_original'];
    await this.moveJobState(job, 'PREPARING', completed);

    // Fetch the immutable original bytes from storage (never modified).
    const original = await this.storage.downloadFile(source.storageKey);
    const buffer = original.buffer;

    // --- Stage: probe metadata (Req 3.7). FFprobe failure → fail, retain bytes (Req 3.8).
    let metadata: VideoMetadata;
    try {
      metadata = await this.processor.probe(buffer);
    } catch (error) {
      this.log?.error?.(
        '[VideoEditor][MediaIngestion] FFprobe failed; marking ingestion failed and retaining bytes',
        error,
        { sourceId, jobId },
      );
      await this.failJob(job, 'METADATA_EXTRACTION_FAILED');
      // Bytes + Video_Source retained unchanged (Req 3.8) — we do not touch them.
      throw new MetadataExtractionError(
        sourceId,
        'Metadata extraction failed: the stored media could not be probed by FFprobe.',
      );
    }

    // Persist probe-derived metadata onto the immutable source record (Req 3.7).
    // NOTE: this updates only the metadata document, never the stored bytes.
    source.durationMs = Math.round((metadata.duration ?? 0) * 1000);
    source.width = metadata.width ?? 0;
    source.height = metadata.height ?? 0;
    source.fps = metadata.fps ?? 0;
    source.codec = metadata.codec || 'unknown';
    if (metadata.format) source.container = normalizeContainer(metadata.format, source.container);
    await source.save();
    completed.push('probe_metadata');
    await this.persistProgress(job, 'PREPARING', completed);

    const provenanceFor = (category: string): Partial<ArtifactProvenance> =>
      this.ingestionProvenance(jobId, sourceId, category);

    // The proxy / thumbnail / waveform are BEST-EFFORT PREVIEW artifacts. The
    // only thing strictly required to edit is the probe-derived duration above.
    // Each preview stage runs under a hard FFmpeg timeout and is NON-FATAL: a
    // slow/failed stage (e.g. a large HEVC .mov that would otherwise hang) is
    // logged and skipped so the turn can proceed to the edit (No-hang).

    // --- Stage: proxy (Req 3.9) — best-effort.
    let proxy: CreateArtifactResult | undefined;
    try {
      const proxyBuffer = await this.processor.generateProxy(buffer, source.storageKey);
      proxy = await this.artifacts.createArtifact({
        projectId: source.projectId,
        workspaceId: source.workspaceId,
        userId: source.userId,
        category: 'proxy',
        buffer: proxyBuffer,
        originalName: `${sourceId}-proxy.mp4`,
        mimeType: 'video/mp4',
        deterministic: true,
        provenance: provenanceFor('proxy'),
      });
      completed.push('generate_proxy');
    } catch (error) {
      this.log?.warn?.(
        '[VideoEditor][MediaIngestion] Proxy generation failed/timed out; skipping (non-fatal)',
        { sourceId, jobId, error: String((error as Error)?.message || error) },
      );
    }
    await this.persistProgress(job, 'PREPARING', completed);

    // --- Stage: thumbnails (Req 3.9) — best-effort.
    let thumbnails: CreateArtifactResult | undefined;
    try {
      const thumbBuffer = await this.processor.generateThumbnail(buffer, source.storageKey);
      thumbnails = await this.artifacts.createArtifact({
        projectId: source.projectId,
        workspaceId: source.workspaceId,
        userId: source.userId,
        category: 'thumbnails',
        buffer: thumbBuffer,
        originalName: `${sourceId}-thumb.jpg`,
        mimeType: 'image/jpeg',
        deterministic: true,
        provenance: provenanceFor('thumbnails'),
      });
      completed.push('generate_thumbnails');
    } catch (error) {
      this.log?.warn?.(
        '[VideoEditor][MediaIngestion] Thumbnail generation failed/timed out; skipping (non-fatal)',
        { sourceId, jobId, error: String((error as Error)?.message || error) },
      );
    }
    await this.persistProgress(job, 'PREPARING', completed);

    // --- Stage: waveform (Req 3.9). Stored under the audio category — best-effort.
    let waveform: CreateArtifactResult | undefined;
    try {
      const waveformBuffer = await this.processor.generateWaveform(buffer, source.storageKey);
      waveform = await this.artifacts.createArtifact({
        projectId: source.projectId,
        workspaceId: source.workspaceId,
        userId: source.userId,
        category: 'audio',
        buffer: waveformBuffer,
        originalName: `${sourceId}-waveform.png`,
        mimeType: 'image/png',
        deterministic: true,
        provenance: provenanceFor('waveform'),
      });
      completed.push('generate_waveform');
    } catch (error) {
      this.log?.warn?.(
        '[VideoEditor][MediaIngestion] Waveform generation failed/timed out; skipping (non-fatal)',
        { sourceId, jobId, error: String((error as Error)?.message || error) },
      );
    }

    // All ingestion stages complete → the job may transition to COMPLETED, and
    // only now may progress reach 100 (Req 3.11). Skipped preview artifacts are
    // simply absent from the output list (they are non-fatal previews).
    const outputArtifactIds = [
      ...job.outputArtifactIds,
      ...(proxy ? [proxy.artifact.artifactId] : []),
      ...(thumbnails ? [thumbnails.artifact.artifactId] : []),
      ...(waveform ? [waveform.artifact.artifactId] : []),
    ];
    await this.completeJob(job, completed, outputArtifactIds);

    const progress = this.reportProgress('COMPLETED', completed);
    this.log?.info?.(
      '[VideoEditor][MediaIngestion] Ingestion + preparation completed',
      { sourceId, jobId, projectId: source.projectId, stages: completed.length },
    );

    return {
      source,
      metadata,
      artifacts: { proxy, thumbnails, waveform },
      job,
      progress,
    };
  }

  // -------------------------------------------------------------------------
  // Progress + job-state helpers (Req 3.11, 18.2, 18.4)
  // -------------------------------------------------------------------------

  /**
   * Compute the stage-derived, monotonic progress for the given job state and
   * completed stages, notifying any observer (Req 3.11). Delegates entirely to
   * the pure `job-state.logic` helpers so progress is never 100/complete while
   * the job is not COMPLETED.
   */
  private reportProgress(state: JobState, completed: IngestionStage[]): ProgressReport {
    const report = computeJobProgress({
      state,
      completedStages: completed.length,
      totalStages: TOTAL_INGESTION_STAGES,
    });
    this.onProgress?.(report, [...completed]);
    return report;
  }

  /** Persist the current stage-derived progress onto the job (monotonic, Req 3.11). */
  private async persistProgress(
    job: IVideoEditJob,
    state: JobState,
    completed: IngestionStage[],
  ): Promise<void> {
    const previous: ProgressReport = { determinate: true, percent: job.progress ?? 0 };
    const next = this.reportProgress(state, completed);
    const monotonic = clampMonotonicProgress(previous, next);
    if (monotonic.determinate) job.progress = monotonic.percent;
    job.completedStages = [...completed];
    await job.save();
  }

  /** Transition the job to `to` (via the pure state machine) and persist progress. */
  private async moveJobState(
    job: IVideoEditJob,
    to: JobState,
    completed: IngestionStage[],
  ): Promise<void> {
    const result = transition(job.state, to);
    if (result.ok) {
      job.state = result.state;
    }
    // If the transition is a no-op (already in `to`), keep the current state.
    await this.persistProgress(job, job.state, completed);
  }

  /** Mark the job FAILED with an error code, leaving bytes untouched (Req 3.8). */
  private async failJob(job: IVideoEditJob, errorCode: string): Promise<void> {
    const result = transition(job.state, 'FAILED');
    if (result.ok) job.state = result.state;
    job.errorCode = errorCode;
    await job.save();
  }

  /** Mark the job COMPLETED (progress 100) after every stage finished (Req 3.11). */
  private async completeJob(
    job: IVideoEditJob,
    completed: IngestionStage[],
    outputArtifactIds: string[],
  ): Promise<void> {
    const result = transition(job.state, 'COMPLETED');
    if (result.ok) job.state = result.state;
    const progress = computeJobProgress({
      state: job.state,
      completedStages: completed.length,
      totalStages: TOTAL_INGESTION_STAGES,
    });
    if (progress.determinate) job.progress = progress.percent;
    job.completedStages = [...completed];
    job.outputArtifactIds = outputArtifactIds;
    await job.save();
  }

  /**
   * Build complete provenance for an ingestion-produced artifact. Ingestion is a
   * deterministic pipeline with no prior version, so `inputVersionId` references
   * the source itself and `provider`/`model` are filled with the deterministic
   * engine id by the repository (`deterministic: true`). Cost is zero.
   */
  private ingestionProvenance(
    jobId: string,
    sourceId: string,
    category: string,
  ): Partial<ArtifactProvenance> {
    return {
      jobId,
      inputVersionId: `ingest:${sourceId}`,
      prompt: `ingest:${category}`,
      costCredits: 0,
    };
  }
}

/**
 * Normalize an FFprobe `format_name` (which may be a comma-separated list such as
 * `mov,mp4,m4a,3gp,3g2,mj2`) down to one of the supported container labels,
 * falling back to the already-validated container when no supported member is
 * present.
 */
function normalizeContainer(formatName: string, fallback: string): string {
  const names = formatName
    .toLowerCase()
    .split(',')
    .map((n) => n.trim());
  const supported = INGESTION_LIMITS.acceptedContainers;
  for (const name of names) {
    if ((supported as readonly string[]).includes(name)) return name;
    if (name === 'matroska' && (supported as readonly string[]).includes('webm')) return 'webm';
    if (name.includes('mp4') && (supported as readonly string[]).includes('mp4')) return 'mp4';
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Singleton accessor (mirrors the other feature-service factories)
// ---------------------------------------------------------------------------

let mediaIngestionServiceInstance: MediaIngestionService | null = null;

/** Get or lazily create the shared `MediaIngestionService` instance. */
export function getMediaIngestionService(): MediaIngestionService {
  if (!mediaIngestionServiceInstance) {
    mediaIngestionServiceInstance = new MediaIngestionService();
  }
  return mediaIngestionServiceInstance;
}
