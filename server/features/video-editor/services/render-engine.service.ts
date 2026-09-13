/**
 * Render_Engine — FFmpeg + FFprobe rendering service (task 14.4,
 * Req 15.1, 15.6, 15.7, 21.4).
 *
 * The Render_Engine turns the authoritative `Timeline_Engine` model into a real,
 * validated video file. It is the terminal step of the deterministic pipeline
 * (Acceptance Test A) and the final render of the generative pipeline
 * (Acceptance Test B). Its contract is:
 *
 *   1. Render to a real encoded file (Req 15.1). The timeline model — the SOLE
 *      authoritative source for the render (Req 10.4) — is turned into a
 *      deterministic FFmpeg argument vector by the pure
 *      `timeline-engine.logic#buildRenderCommand`, targeting the selected export
 *      profile (MP4 / H.264 / AAC by default, or any configured profile). Every
 *      encoder setting comes from the single-source config profile (Req 13.1); no
 *      codec/dimension/bitrate is hardcoded here.
 *
 *   2. Sound render validation (Req 15.2–15.5). The rendered file is probed with
 *      FFprobe and the measured metrics are fed into the pure, total
 *      `quality-controller.logic#validateRender` predicate. This module NEVER
 *      re-implements the validation rules — it only measures and delegates.
 *
 *   3. All checks pass → job COMPLETED (Req 15.6). When `validateRender` returns
 *      `valid: true`, the output is stored as exactly one immutable `renders`
 *      `Video_Artifact` (deterministic provenance: engine id `ffmpeg`, cost 0,
 *      linked to the originating job + input version) and the `Video_Edit_Job` is
 *      marked COMPLETED.
 *
 *   4. Any check fails → job FAILED, input retained, output not exposed (Req 15.7).
 *      When `validateRender` returns `valid: false` (or FFmpeg itself fails), the
 *      job is marked FAILED with an error code that identifies the failed check,
 *      the immutable input version is left untouched, and NO `renders` artifact is
 *      created — a corrupted/invalid output is never exposed as a successful
 *      render (also Req 23.3).
 *
 * The bounded repair loop, the alternative-strategy selection, and the async
 * `video-render`/`video-qc` worker wiring are the Quality_Controller service's
 * responsibility (task 14.5); this module is the single-shot render + validate +
 * settle primitive those layers drive.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
// Configure fluent-ffmpeg's ffmpeg/ffprobe binary paths (side effect) so render
// output validation (ffprobe) works without a system ffprobe install.
import '../../../config/ffmpeg-paths';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import type { Model } from 'mongoose';

import { logger as defaultLogger } from '../../../config/logger';
import {
  VideoEditJobModel as DefaultVideoEditJobModel,
  type IVideoEditJob,
} from '../../../models/VideoEditor/VideoEditJob';
import { VideoSourceModel } from '../../../models/VideoEditor/VideoSource';
import { VideoArtifactModel } from '../../../models/VideoEditor/VideoArtifact';
import { getStorageService, type IStorageService } from '../../storage/services/storage.service';
import { getExportProfile, type ExportProfile } from '../config/video-editor.config';
import { enqueueTempFileCleanup } from './temp-file-cleanup.worker';
import { TERMINAL_STATES } from './job-state.logic';
import {
  buildRenderCommand,
  renderCommandToString,
  type TimelineModel,
  type TimelineElement,
  type RenderEncoderProfile,
} from './timeline-engine.logic';
import {
  validateRender,
  type OutputProbe,
  type RenderValidationResult,
  type RenderValidationCode,
} from './quality-controller.logic';
import { DETERMINISTIC_ENGINE_ID, type ArtifactCategory } from './artifact-provenance.logic';
import { emitLifecycleEvent } from './video-editor-events';
import {
  getArtifactRepository,
  type ArtifactRepository,
  type CreateArtifactResult,
} from './artifact-repository.service';

// ---------------------------------------------------------------------------
// Errors (Req 15.7)
// ---------------------------------------------------------------------------

/**
 * Thrown on a non-validation render failure (unknown profile, unresolvable
 * asset, FFmpeg process error). Carries a stable `code` recorded on the
 * Video_Edit_Job (Req 15.7). Validation failures are NOT thrown — they are
 * returned as an `ok: false` {@link RenderResult} so the caller (Quality_Controller
 * repair loop) can act on the specific failed checks.
 */
export class RenderEngineError extends Error {
  readonly statusCode = 422;
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'RenderEngineError';
    Error.captureStackTrace?.(this, this.constructor);
  }
}

// ---------------------------------------------------------------------------
// Request / result shapes
// ---------------------------------------------------------------------------

/** How an element `sourceAssetId` resolves to immutable bytes in storage. */
export interface ResolvedAsset {
  /** Storage key holding the immutable source/artifact bytes. */
  storageKey: string;
  /** Original filename (used to derive the temp input file extension). */
  fileName: string;
}

/** Resolves a timeline element's `sourceAssetId` to its storage location. */
export type AssetResolver = (assetId: string) => Promise<ResolvedAsset | null>;

/** A single render request against one version's authoritative timeline. */
export interface RenderRequest {
  /** Owning Video_Project (scopes the output artifact folder). */
  projectId: string;
  /** Owning workspace (persisted on the artifact for isolation). */
  workspaceId: string;
  /** Owning user (persisted on the artifact for isolation). */
  userId: string;
  /** Originating Video_Edit_Job id — marked COMPLETED/FAILED by this render. */
  jobId: string;
  /**
   * The input Video_Version being rendered. It is retained UNCHANGED on failure
   * (Req 15.7) and recorded as the artifact's input-version provenance.
   */
  inputVersionId: string;
  /** The authoritative timeline model to render (Req 10.4, 15.1). */
  timeline: TimelineModel;
  /** Export profile id resolved from `video-editor.config.ts` (Req 13.1, 15.1). */
  exportProfileId: string;
  /**
   * Whether an audio stream must be present in the render (Req 15.5). Defaults to
   * `true` when the timeline contains an `audioClip` element, else `false`, so a
   * silent-video timeline is not spuriously failed for a missing audio stream.
   */
  audioExpected?: boolean;
  /** Output artifact category (default `'renders'`). */
  outputCategory?: ArtifactCategory;
  /** Output MIME type (default derived from the profile container). */
  outputMimeType?: string;
}

/** The measured/derived context of a render-validation decision. */
export interface RenderValidationOutcome {
  /** The pure predicate result (Req 15.2–15.7). */
  validation: RenderValidationResult;
  /** The FFprobe-measured output metrics. */
  probe: OutputProbe;
  /** The timeline's expected duration in ms (Req 15.4). */
  expectedDurationMs: number;
  /** Whether an audio stream was required (Req 15.5). */
  audioExpected: boolean;
  /** The export profile id the render targeted. */
  profileId: string;
}

/**
 * The result of a single render. On success the job is COMPLETED and exactly one
 * immutable `renders` artifact exists (Req 15.6). On failure the job is FAILED,
 * the input version is retained, and NO successful render artifact is exposed
 * (Req 15.7).
 */
export type RenderResult =
  | {
      ok: true;
      jobState: 'COMPLETED';
      /** The single immutable render artifact (Req 15.6). */
      artifact: CreateArtifactResult['artifact'];
      /** The storage key holding the render bytes. */
      storageKey: string;
      /** The storage URL for the stored render. */
      url: string;
      /** The deterministic FFmpeg command that produced the render. */
      command: string;
      /** The validation outcome (all checks passed). */
      outcome: RenderValidationOutcome;
    }
  | {
      ok: false;
      jobState: 'FAILED';
      /** Error code identifying the failed check / failure cause (Req 15.7). */
      errorCode: string;
      /** The specific render-validation checks that failed (empty on a process error). */
      failedChecks: RenderValidationCode[];
      /** The deterministic FFmpeg command (absent when the failure preceded build). */
      command?: string;
      /** The validation outcome, when a file was produced and probed. */
      outcome?: RenderValidationOutcome;
    };

// ---------------------------------------------------------------------------
// Injectable dependencies
// ---------------------------------------------------------------------------

/** Runs a built FFmpeg argument vector to completion. Injectable for testing. */
export type RenderFfmpegRunner = (args: string[]) => Promise<void>;

/** Probes a rendered file into an {@link OutputProbe}. Injectable for testing. */
export type OutputProber = (outputPath: string) => Promise<OutputProbe>;

/** Injectable dependencies (defaulted for production, overridable for tests). */
export interface RenderEngineServiceDeps {
  logger?: Pick<typeof defaultLogger, 'info' | 'warn' | 'error' | 'debug'>;
  /** Storage backend for reading input bytes + storing the render artifact. */
  storage?: IStorageService;
  /** Artifact repository (persists the single immutable render artifact). */
  artifactRepository?: ArtifactRepository;
  /** Video_Edit_Job model (marked COMPLETED/FAILED, Req 15.6, 15.7). */
  jobModel?: Model<IVideoEditJob>;
  /** Resolves an element `sourceAssetId` to its storage location. */
  assetResolver?: AssetResolver;
  /** FFmpeg runner; defaults to spawning `ffmpeg-static` with the arg vector. */
  runner?: RenderFfmpegRunner;
  /** FFprobe-backed prober; defaults to a `fluent-ffmpeg` ffprobe pass. */
  prober?: OutputProber;
  /** Path to the FFmpeg binary (defaults to `ffmpeg-static`). */
  ffmpegPath?: string | null;
  /** Path to the FFprobe binary (defaults to the fluent-ffmpeg default). */
  ffprobePath?: string | null;
  /** Base directory for temporary working files (defaults to the OS temp dir). */
  tempDir?: string;
  /**
   * Schedule a deferred temp-file cleanup on the `video-cleanup` queue when
   * inline removal fails, so removal is retried up to 3 times with an error
   * recorded if all fail (Req 20.7). Injectable for tests; the default enqueues
   * via `VideoEditorQueueManager`. Returns the enqueued job id or `null`.
   */
  scheduleCleanupRetry?: (input: RenderCleanupRetryInput) => Promise<string | null>;
}

/** Identity + paths for a deferred render temp-file cleanup (Req 20.7). */
export interface RenderCleanupRetryInput {
  projectId: string;
  versionId: string;
  opId: string;
  workspaceId: string;
  userId: string;
  tempFilePaths: string[];
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * The timeline's expected duration in ms (Req 15.4): the maximum timeline end of
 * any element, or 0 for an empty timeline. Pure and total.
 */
export function deriveExpectedDurationMs(model: TimelineModel): number {
  let maxEnd = 0;
  for (const el of model.elements ?? []) {
    if (typeof el.timelineEndMs === 'number' && Number.isFinite(el.timelineEndMs)) {
      if (el.timelineEndMs > maxEnd) maxEnd = el.timelineEndMs;
    }
  }
  return maxEnd;
}

/** Whether the timeline implies an audio stream is expected (Req 15.5). */
export function timelineExpectsAudio(model: TimelineModel): boolean {
  return (model.elements ?? []).some((el) => el.kind === 'audioClip');
}

/** Map an `ExportProfile` to the fixed-encoder profile the command builder consumes. */
export function toEncoderProfile(profile: ExportProfile): RenderEncoderProfile {
  return {
    container: profile.container,
    videoCodec: profile.videoCodec,
    audioCodec: profile.audioCodec,
    width: profile.width,
    height: profile.height,
    fps: profile.fps,
    videoBitrateKbps: profile.videoBitrateKbps,
    audioBitrateKbps: profile.audioBitrateKbps,
  };
}

/** Normalize an FFprobe `format_name` list to a single canonical container token. */
export function normalizeContainer(formatName: string | undefined): string {
  if (typeof formatName !== 'string' || formatName.length === 0) return '';
  const tokens = formatName.split(',').map((t) => t.trim());
  // Our configured profiles are mp4/webm/mov; prefer the canonical token when the
  // muxer reports a family (e.g. FFprobe reports "mov,mp4,m4a,3gp,3g2,mj2" for mp4).
  if (tokens.includes('mp4')) return 'mp4';
  if (tokens.includes('webm')) return 'webm';
  if (tokens.includes('mov')) return 'mov';
  return tokens[0] ?? '';
}

/** Normalize an FFprobe video codec name to the profile's codec token. */
export function normalizeVideoCodec(codecName: string | undefined): string {
  if (typeof codecName !== 'string') return '';
  if (codecName === 'hevc') return 'h265';
  return codecName;
}

/** Parse an FFprobe frame-rate string ("30/1", "30000/1001") to fps. */
export function parseFrameRate(rate: string | undefined): number {
  if (typeof rate !== 'string' || rate.length === 0) return 0;
  const parts = rate.split('/');
  if (parts.length === 2) {
    const num = Number(parts[0]);
    const den = Number(parts[1]);
    if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) return num / den;
    return 0;
  }
  const single = Number(rate);
  return Number.isFinite(single) ? single : 0;
}

/** A zeroed probe for a missing/empty output (drives the existence-first check). */
function absentProbe(exists: boolean, sizeBytes: number): OutputProbe {
  return {
    exists,
    sizeBytes,
    hasVideoStream: false,
    container: '',
    videoCodec: '',
    audioCodec: null,
    audioStreamCount: 0,
    width: 0,
    height: 0,
    fps: 0,
    durationMs: 0,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Render_Engine service (Req 15.1, 15.6, 15.7). Renders the authoritative
 * timeline to a real file with FFmpeg, validates it with FFprobe via the pure
 * `validateRender` predicate, and settles the job: COMPLETED with one immutable
 * artifact on full success, or FAILED (input retained, no exposed output) on any
 * failed check.
 */
export class RenderEngineService {
  private readonly log: RenderEngineServiceDeps['logger'];
  private readonly storage: IStorageService;
  private readonly artifactRepository: ArtifactRepository;
  private readonly jobModel: Model<IVideoEditJob>;
  private readonly assetResolver: AssetResolver;
  private readonly runner: RenderFfmpegRunner;
  private readonly prober: OutputProber;
  private readonly ffmpegPath: string | null;
  private readonly ffprobePath: string | null;
  private readonly tempDir: string;
  private readonly scheduleCleanupRetry: (input: RenderCleanupRetryInput) => Promise<string | null>;

  constructor(deps: RenderEngineServiceDeps = {}) {
    this.log = deps.logger ?? defaultLogger;
    this.storage = deps.storage ?? getStorageService();
    this.artifactRepository = deps.artifactRepository ?? getArtifactRepository();
    this.jobModel = deps.jobModel ?? DefaultVideoEditJobModel;
    this.ffmpegPath = deps.ffmpegPath ?? (ffmpegStatic as unknown as string | null) ?? null;
    this.ffprobePath = deps.ffprobePath ?? null;
    this.tempDir = deps.tempDir ?? path.join(os.tmpdir(), 'veefore-video-editor');
    this.assetResolver = deps.assetResolver ?? this.createDefaultAssetResolver();
    this.runner = deps.runner ?? this.createDefaultRunner();
    this.prober = deps.prober ?? this.createDefaultProber();
    this.scheduleCleanupRetry =
      deps.scheduleCleanupRetry ?? ((input) => enqueueTempFileCleanup({ ...input, reason: 'render-cleanup' }));
  }

  /**
   * Render one version's timeline to a validated file and settle the job
   * (Req 15.1, 15.6, 15.7).
   *
   *   1. Resolve the export profile from the single-source config (Req 13.1);
   *      unknown → FAILED with `RENDER_UNKNOWN_PROFILE`.
   *   2. Download each referenced asset's immutable bytes to a temp input file.
   *   3. Build the deterministic FFmpeg command from the timeline model + profile
   *      (Req 10.4) and run it.
   *   4. Probe the output with FFprobe and run the pure `validateRender` predicate
   *      (Req 15.2–15.5).
   *   5. All pass → store exactly one immutable `renders` artifact and mark the
   *      job COMPLETED (Req 15.6).
   *   6. Any fail (or a process error) → mark the job FAILED with an error code,
   *      retain the input version, and expose NO successful render (Req 15.7).
   *
   * Temporary files are always cleaned up.
   */
  async render(request: RenderRequest): Promise<RenderResult> {
    const profile = getExportProfile(request.exportProfileId);
    if (!profile) {
      const errorCode = 'RENDER_UNKNOWN_PROFILE';
      await this.failJob(request.jobId, errorCode);
      this.log?.error?.('Render failed: unknown export profile', undefined, {
        component: 'RenderEngineService',
        jobId: request.jobId,
        projectId: request.projectId,
        exportProfileId: request.exportProfileId,
      });
      return { ok: false, jobState: 'FAILED', errorCode, failedChecks: [] };
    }

    const expectedDurationMs = deriveExpectedDurationMs(request.timeline);
    const audioExpected = request.audioExpected ?? timelineExpectsAudio(request.timeline);

    const workId = randomUUID();
    const workDir = path.join(this.tempDir, workId);
    const outputPath = path.join(workDir, `render.${profile.container}`);
    let commandString: string | undefined;

    try {
      await fs.promises.mkdir(workDir, { recursive: true });

      // 1. Resolve every referenced asset to a local temp input file. The source
      //    bytes are read UNMODIFIED (never written back to their storage key).
      const resolvedModel = await this.materializeInputs(request.timeline, workDir);

      // 2. Build the deterministic render command from the model + profile.
      const command = buildRenderCommand(resolvedModel, toEncoderProfile(profile), outputPath);
      commandString = renderCommandToString(command);
      this.log?.info?.('Running render FFmpeg command', {
        component: 'RenderEngineService',
        jobId: request.jobId,
        projectId: request.projectId,
        inputCount: command.inputOrder.length,
        profileId: profile.id,
      });

      // 3. Execute FFmpeg. A process failure is a non-validation render failure.
      try {
        await this.runner(command.args);
      } catch (error) {
        const errorCode = 'RENDER_FFMPEG_FAILED';
        await this.failJob(request.jobId, errorCode);
        this.log?.error?.('Render FFmpeg process failed', error as Error, {
          component: 'RenderEngineService',
          jobId: request.jobId,
          projectId: request.projectId,
          errorCode,
        });
        return { ok: false, jobState: 'FAILED', errorCode, failedChecks: [], command: commandString };
      }

      // 4. Probe the output and run the pure, sound render-validation predicate.
      const probe = await this.probeSafely(outputPath);
      const validation = validateRender({ probe, profile, expectedDurationMs, audioExpected });
      const outcome: RenderValidationOutcome = {
        validation,
        probe,
        expectedDurationMs,
        audioExpected,
        profileId: profile.id,
      };

      // 6. Any failed check → FAILED, input retained, output NOT exposed (Req 15.7).
      if (!validation.valid) {
        const firstCode = validation.failedChecks[0] ?? 'UNKNOWN';
        const errorCode = `RENDER_VALIDATION_${firstCode}`;
        await this.failJob(request.jobId, errorCode);
        this.log?.warn?.('Render validation failed; job marked FAILED', {
          component: 'RenderEngineService',
          jobId: request.jobId,
          projectId: request.projectId,
          inputVersionId: request.inputVersionId,
          errorCode,
          failedChecks: validation.failedChecks,
        });
        return {
          ok: false,
          jobState: 'FAILED',
          errorCode,
          failedChecks: validation.failedChecks,
          command: commandString,
          outcome,
        };
      }

      // 5. All checks pass → store exactly one immutable render artifact and
      //    mark the job COMPLETED (Req 15.6).
      const outBuffer = await fs.promises.readFile(outputPath);
      const created = await this.artifactRepository.createArtifact({
        projectId: request.projectId,
        workspaceId: request.workspaceId,
        userId: request.userId,
        category: request.outputCategory ?? 'renders',
        buffer: outBuffer,
        originalName: `render-${workId}.${profile.container}`,
        mimeType: request.outputMimeType ?? containerMimeType(profile.container),
        deterministic: true,
        provenance: {
          jobId: request.jobId,
          inputVersionId: request.inputVersionId,
          provider: DETERMINISTIC_ENGINE_ID,
          model: DETERMINISTIC_ENGINE_ID,
          prompt: `render ${profile.id} (${profile.width}x${profile.height}@${profile.fps})`,
          costCredits: 0,
        },
      });

      await this.completeJob(request.jobId, created.artifact.artifactId);
      this.log?.info?.('Render completed and validated; job COMPLETED', {
        component: 'RenderEngineService',
        jobId: request.jobId,
        projectId: request.projectId,
        artifactId: created.artifact.artifactId,
        profileId: profile.id,
      });

      // Structured lifecycle event: render completion (Req 22.1). Only ids and
      // the (non-sensitive) profile/artifact identifiers are carried — never a
      // storage URL or signed link (Req 22.4).
      emitLifecycleEvent(
        'render_completed',
        {
          userId: request.userId,
          workspaceId: request.workspaceId,
          projectId: request.projectId,
          jobId: request.jobId,
          versionId: request.inputVersionId,
          details: { artifactId: created.artifact.artifactId, profileId: profile.id },
        },
        { logger: this.log },
      );

      return {
        ok: true,
        jobState: 'COMPLETED',
        artifact: created.artifact,
        storageKey: created.storageKey,
        url: created.url,
        command: commandString,
        outcome,
      };
    } catch (error) {
      // Any unexpected failure (asset resolution, IO) → FAILED, input retained,
      // no exposed output (Req 15.7).
      const errorCode = error instanceof RenderEngineError ? error.code : 'RENDER_FAILED';
      await this.failJob(request.jobId, errorCode);
      this.log?.error?.('Render failed', error as Error, {
        component: 'RenderEngineService',
        jobId: request.jobId,
        projectId: request.projectId,
        errorCode,
      });
      return { ok: false, jobState: 'FAILED', errorCode, failedChecks: [], command: commandString };
    } finally {
      await this.cleanup(workDir, {
        projectId: request.projectId,
        versionId: request.inputVersionId,
        opId: `render-clean-${workId}`,
        workspaceId: request.workspaceId,
        userId: request.userId,
      });
    }
  }

  /**
   * Download each sourced element's immutable bytes to a temp input file and
   * return a copy of the model with `sourceAssetId` rewritten to the local input
   * path, so the deterministic command builder emits real `-i <path>` inputs. The
   * same asset is downloaded once and reused across elements.
   */
  private async materializeInputs(model: TimelineModel, workDir: string): Promise<TimelineModel> {
    const localPathByAsset = new Map<string, string>();
    let index = 0;

    const elements: TimelineElement[] = [];
    for (const el of model.elements ?? []) {
      const next: TimelineElement = { ...el };
      if (el.sourceAssetId !== undefined) {
        let localPath = localPathByAsset.get(el.sourceAssetId);
        if (!localPath) {
          const resolved = await this.assetResolver(el.sourceAssetId);
          if (!resolved) {
            throw new RenderEngineError(
              'RENDER_ASSET_UNRESOLVED',
              `Could not resolve source asset "${el.sourceAssetId}" for render`,
            );
          }
          const ext = path.extname(resolved.fileName) || '.mp4';
          localPath = path.join(workDir, `input-${index++}${ext}`);
          const bytes = await this.storage.downloadFile(resolved.storageKey);
          await fs.promises.writeFile(localPath, bytes.buffer);
          localPathByAsset.set(el.sourceAssetId, localPath);
        }
        next.sourceAssetId = localPath;
      }
      elements.push(next);
    }

    return { sequences: model.sequences.map((s) => ({ tracks: s.tracks })), elements };
  }

  /** Probe an output file, returning an existence-first probe when it is absent/empty. */
  private async probeSafely(outputPath: string): Promise<OutputProbe> {
    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(outputPath);
    } catch {
      return absentProbe(false, 0);
    }
    if (!stat.isFile() || stat.size <= 0) {
      return absentProbe(true, Math.max(0, stat.size));
    }
    try {
      return await this.prober(outputPath);
    } catch (error) {
      this.log?.warn?.('FFprobe failed on rendered output; treating as unprobeable', {
        component: 'RenderEngineService',
        outputPath,
        error: (error as Error)?.message,
      });
      // A file that exists but cannot be probed cannot be validated as sound.
      return { ...absentProbe(true, stat.size) };
    }
  }

  /** Mark the job COMPLETED (Req 15.6), respecting terminal-state absorption. */
  private async completeJob(jobId: string, artifactId: string): Promise<void> {
    try {
      await this.jobModel
        .updateOne(
          { jobId, state: { $nin: [...TERMINAL_STATES] } },
          { $set: { state: 'COMPLETED', progress: 100 }, $addToSet: { outputArtifactIds: artifactId } },
        )
        .exec();
    } catch (error) {
      this.log?.warn?.('Failed to mark job COMPLETED after successful render', {
        component: 'RenderEngineService',
        jobId,
        error: (error as Error)?.message,
      });
    }
  }

  /**
   * Mark the job FAILED with an error code (Req 15.7), respecting terminal-state
   * absorption — a job already terminal is not overwritten. Best-effort so it
   * never masks the original failure.
   */
  private async failJob(jobId: string, errorCode: string): Promise<void> {
    try {
      await this.jobModel
        .updateOne(
          { jobId, state: { $nin: [...TERMINAL_STATES] } },
          { $set: { state: 'FAILED', errorCode } },
        )
        .exec();
    } catch (error) {
      this.log?.warn?.('Failed to mark job FAILED after render error', {
        component: 'RenderEngineService',
        jobId,
        error: (error as Error)?.message,
      });
    }
  }

  /**
   * Remove the temporary working directory within 60 s of the job settling
   * (Req 20.5, 20.6). Inline removal is the fast path; when it fails, the removal
   * is deferred to the `video-cleanup` queue so it is retried up to 3 times with
   * an error recorded if all fail (Req 20.7). A scheduling failure is logged and
   * never propagated — cleanup must not fail the render's terminal state.
   */
  private async cleanup(
    workDir: string,
    retry?: Omit<RenderCleanupRetryInput, 'tempFilePaths'>,
  ): Promise<void> {
    try {
      await fs.promises.rm(workDir, { recursive: true, force: true });
    } catch (error) {
      this.log?.warn?.('Failed to clean up render temp dir; scheduling retry', {
        component: 'RenderEngineService',
        workDir,
        error: (error as Error)?.message,
      });
      if (retry) {
        try {
          await this.scheduleCleanupRetry({ ...retry, tempFilePaths: [workDir] });
        } catch (scheduleError) {
          this.log?.warn?.('Failed to schedule render temp-dir cleanup retry', {
            component: 'RenderEngineService',
            workDir,
            error: (scheduleError as Error)?.message,
          });
        }
      }
    }
  }

  /**
   * Default asset resolver: look up the id as a `VideoSource` first, then as a
   * `VideoArtifact`, returning its immutable storage key. Ownership/isolation is
   * enforced by the API layer before a render is ever requested.
   */
  private createDefaultAssetResolver(): AssetResolver {
    return async (assetId: string): Promise<ResolvedAsset | null> => {
      const source = await VideoSourceModel.findOne({ sourceId: assetId }).lean().exec();
      if (source && (source as { storageKey?: string }).storageKey) {
        const s = source as { storageKey: string; container?: string };
        return { storageKey: s.storageKey, fileName: `${assetId}.${s.container ?? 'mp4'}` };
      }
      const artifact = await VideoArtifactModel.findOne({ artifactId: assetId }).lean().exec();
      if (artifact && (artifact as { storageKey?: string }).storageKey) {
        const a = artifact as { storageKey: string; mimeType?: string };
        return { storageKey: a.storageKey, fileName: `${assetId}${mimeToExt(a.mimeType)}` };
      }
      return null;
    };
  }

  /** Default runner: spawn the FFmpeg binary with the built argument vector. */
  private createDefaultRunner(): RenderFfmpegRunner {
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
          log?.error?.('Render FFmpeg exited non-zero', undefined, {
            component: 'RenderEngineService',
            code,
            stderr: stderr.slice(-1000),
          });
          reject(new Error(`ffmpeg exited with code ${code}`));
        });
      });
  }

  /** Default prober: run FFprobe via fluent-ffmpeg and map to an {@link OutputProbe}. */
  private createDefaultProber(): OutputProber {
    const ffprobePath = this.ffprobePath;
    return (outputPath: string) =>
      new Promise<OutputProbe>((resolve, reject) => {
        if (ffprobePath) ffmpeg.setFfprobePath(ffprobePath);
        ffmpeg.ffprobe(outputPath, async (err, data) => {
          if (err) return reject(err);
          try {
            const stat = await fs.promises.stat(outputPath);
            resolve(mapFfprobe(data, stat.size));
          } catch (statErr) {
            reject(statErr);
          }
        });
      });
  }
}

// ---------------------------------------------------------------------------
// FFprobe mapping + small helpers
// ---------------------------------------------------------------------------

/** Map raw FFprobe data + measured size into the pure-core {@link OutputProbe}. */
export function mapFfprobe(data: ffmpeg.FfprobeData, sizeBytes: number): OutputProbe {
  const streams = data?.streams ?? [];
  const videoStream = streams.find((s) => s.codec_type === 'video');
  const audioStreams = streams.filter((s) => s.codec_type === 'audio');
  const format = data?.format ?? ({} as ffmpeg.FfprobeFormat);

  const durationSec =
    typeof format.duration === 'number'
      ? format.duration
      : Number(format.duration ?? videoStream?.duration ?? 0);

  return {
    exists: true,
    sizeBytes,
    hasVideoStream: !!videoStream,
    container: normalizeContainer(format.format_name),
    videoCodec: normalizeVideoCodec(videoStream?.codec_name),
    audioCodec: audioStreams[0]?.codec_name ?? null,
    audioStreamCount: audioStreams.length,
    width: typeof videoStream?.width === 'number' ? videoStream.width : 0,
    height: typeof videoStream?.height === 'number' ? videoStream.height : 0,
    fps: parseFrameRate(videoStream?.r_frame_rate),
    durationMs: Number.isFinite(durationSec) ? Math.round(durationSec * 1000) : 0,
  };
}

/** MIME type for a configured container. */
function containerMimeType(container: ExportProfile['container']): string {
  switch (container) {
    case 'webm':
      return 'video/webm';
    case 'mov':
      return 'video/quicktime';
    case 'mp4':
    default:
      return 'video/mp4';
  }
}

/** Derive a file extension from an artifact MIME type (best-effort). */
function mimeToExt(mimeType: string | undefined): string {
  switch (mimeType) {
    case 'video/webm':
      return '.webm';
    case 'video/quicktime':
      return '.mov';
    case 'video/mp4':
      return '.mp4';
    default:
      return '.mp4';
  }
}

/** Shared singleton for production use (mirrors other feature-service exports). */
export const renderEngineService = new RenderEngineService();
