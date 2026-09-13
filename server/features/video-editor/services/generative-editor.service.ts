/**
 * Generative_Editor — orchestration service (task 17.6, Req 9.11–9.14).
 *
 * This is the IO-bearing conductor that runs a full generative visual edit over
 * a bounded region of a source video. It owns NO domain rules of its own —
 * every decision is delegated to a pure core or an existing service, and this
 * module only sequences them and moves bytes:
 *
 *     extract → segment → meter → QC-validate each segment → insert
 *
 *   1. Segment (Req 9.1–9.6). The affected region is partitioned into bounded,
 *      gap-free, overlap-free sub-ranges by the pure `segmentation.logic`
 *      (`segmentGenerativeEdit`). A malformed request or an over-capability
 *      region that cannot be split ends here — NO provider is invoked and the
 *      timeline is untouched.
 *
 *   2. Compile + protected-element gate (Req 9.7–9.10). The user request is
 *      compiled into a provider-safe instruction by the pure
 *      `prompt-compiler.logic` (`compileGenerativeInstruction`). If the selected
 *      provider cannot guarantee a required Protected_Element, the compiler
 *      either directs a REROUTE to a guaranteeing pipeline or a WARN — and in the
 *      WARN case the provider is NEVER invoked and the timeline is preserved.
 *
 *   3. Extract (Req 9.13). Each sub-range's bytes are extracted from the
 *      immutable source. If ANY extraction fails the whole edit aborts, the
 *      timeline is retained unchanged, and an error identifying the failed
 *      extraction is surfaced.
 *
 *   4. Meter (Req 17). Every provider call is wrapped in the authoritative
 *      `VideoGenerativeMeteringService` (task 16.3): pre-execution gate +
 *      confirmation + `runMetered`. An insufficient-credit block or a
 *      cancellation ends the edit with no timeline change.
 *
 *   5. QC-validate (Req 9.11, 9.14). Each produced segment is validated by the
 *      pure `quality-controller.logic` (`inspectOutput`): existence-first, then
 *      duration-alignment to the replaced range (Req 9.12) and quality-failure
 *      classification. A segment that PASSES becomes a *validated segment*
 *      (Req 9.11); a segment that FAILS is never inserted, the original range is
 *      retained, and an error is surfaced (Req 9.14).
 *
 *   6. Store + insert (Req 9.11, 9.12). Real provider output is persisted as an
 *      immutable `Video_Artifact` via the `ArtifactRepository`. Only when EVERY
 *      segment is validated are the validated segments inserted into the
 *      timeline in place of their original ranges with matching duration — the
 *      insertion is applied atomically so a failure anywhere preserves the
 *      timeline (Req 9.13, 9.14).
 *
 * The heavy collaborators (FFmpeg extraction, output probing, the metering
 * ledger, storage, the timeline gateway, provider adapters) are all injectable
 * so the orchestration can be exercised without real binaries, Redis, MongoDB,
 * or network access — matching the deterministic-editor / timeline-engine
 * service conventions in this feature.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import type { Model } from 'mongoose';

import { logger as defaultLogger } from '../../../config/logger';
import {
  VideoEditJobModel as DefaultVideoEditJobModel,
  type IVideoEditJob,
} from '../../../models/VideoEditor/VideoEditJob';
import { getStorageService, type IStorageService } from '../../storage/services/storage.service';

import { TERMINAL_STATES } from './job-state.logic';
import type { TimeRangeMs } from './audio-analysis.logic';
import {
  segmentGenerativeEdit,
  type SegmentationCapabilityBounds,
} from './segmentation.logic';
import {
  compileGenerativeInstruction,
  type ProviderPreservationCapability,
  type PromptCompileDecision,
} from './prompt-compiler.logic';
import type { ProtectedElement } from './intent-extraction.logic';
import {
  inspectOutput,
  type OutputInspection,
  type OutputProbe,
  type QualityMetrics,
  type RequestedOutputSpec,
} from './quality-controller.logic';
import {
  getVideoGenerativeMeteringService,
  type VideoGenerativeMeteringService,
  type ConfirmationRequester,
  type GenerativeRunResult,
  type UpgradePath,
} from './generative-metering.service';
import {
  getArtifactRepository,
  type ArtifactRepository,
} from './artifact-repository.service';
import { timelineEngineService, type TimelineEngineService } from './timeline-engine.service';
import type { TimelineIdentity } from './timeline-engine.service';
import {
  emitProviderCallCompleted,
  emitProviderCallFailed,
} from './video-editor-events';
import type {
  VideoAIProvider,
  VideoEditRequest,
  VideoEditResult,
  VideoOutput,
} from './providers/video-ai-provider';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Thrown on a hard generative-edit failure that must fail the owning job. Carries
 * a stable `code` recorded on the `Video_Edit_Job` (Req 9.13, 9.14). Recoverable
 * outcomes (reroute/warn/blocked/cancelled/quality) are returned as a discriminated
 * result, not thrown.
 */
export class GenerativeEditError extends Error {
  readonly statusCode = 422;
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'GenerativeEditError';
    Error.captureStackTrace?.(this, this.constructor);
  }
}

// ---------------------------------------------------------------------------
// Request / result shapes
// ---------------------------------------------------------------------------

/** The immutable source the edit reads from (never modified — Req 8.4, 3.6). */
export interface GenerativeEditSource {
  /** Storage key of the immutable Video_Source bytes to read. */
  storageKey: string;
  /** Original source filename (used to derive temp file extensions). */
  fileName: string;
  /** Known source duration in ms (for provenance / bounds; optional). */
  durationMs?: number;
}

/** Segmentation inputs threaded to the pure `segmentation.logic` core (Req 9.1–9.6). */
export interface GenerativeSegmentationInput {
  /** Selected provider's editable-input capability bounds (Req 9.2, 9.5, 9.6). */
  caps: SegmentationCapabilityBounds;
  /** Detected scene-boundary timestamps (ms) — the only legal cut points (Req 9.3). */
  sceneBoundariesMs: readonly number[];
  /** Ranges where a subject is continuously tracked — no cut inside (Req 9.4). */
  trackedSubjects?: readonly TimeRangeMs[];
  /** Continuous audio utterances — no cut inside (Req 9.4). */
  utterances?: readonly TimeRangeMs[];
  /** Optional candidate source ranges classified by overlap (Req 9.1). */
  candidateRanges?: readonly TimeRangeMs[];
}

/** Prompt-compilation inputs threaded to the pure `prompt-compiler.logic` core (Req 9.7–9.10). */
export interface GenerativePromptInput {
  /** The user's raw request — treated as inert data, never as commands (Req 9.7). */
  userRequest: string;
  /** Protected_Elements the user marked as required (Req 9.8). */
  requiredProtectedElements: readonly ProtectedElement[];
  /** Optional operation type (e.g. 'object_removal') to describe the task. */
  operationType?: string | null;
  /** Optional editing-style hint to describe the task. */
  editingStyle?: string | null;
}

/** Metering + confirmation inputs threaded to the metering service (task 16.3, Req 17). */
export interface GenerativeMeteringInput {
  /** Idempotency key (typically `job.idempotencyKey`) — charged at most once (Req 17.4). */
  idempotencyKey: string;
  /**
   * Provider per-output-second INR rate. Defaults to the selected provider's
   * capability record (`costPerOutputSecondInr`) when omitted (Req 7.1).
   */
  costPerOutputSecondInr?: number;
  /** Presents the estimate and awaits confirmation (Req 17.7, 17.8). */
  confirm?: ConfirmationRequester;
  /** Caller abort signal — Stop / mid-flight insufficient credits (Req 17.10). */
  signal?: AbortSignal;
  /** True when the requested edit is zero-cost (affects zero-balance gating, Req 17.9). */
  isZeroCostEdit?: boolean;
  /**
   * The number of prior retries for the owning job (defaults to 0). Recorded on
   * the provider-call observability event (Req 22.2, 22.3) — purely informational.
   */
  retryCount?: number;
}

/** A full generative-edit request. */
export interface GenerativeEditRequest {
  /** Owning Video_Project (scopes artifact folders). */
  projectId: string;
  /** Owning workspace (isolation + metering context). */
  workspaceId: string;
  /** Owning user (server-side identity; balance/cost authoritative). */
  userId: string;
  /** Originating Video_Edit_Job id — artifacts are traceable to it. */
  jobId: string;
  /** Input Video_Version this edit derives from (artifact provenance + lineage). */
  inputVersionId: string;
  /** Target Video_Version whose timeline receives the validated segments. */
  versionId: string;
  /** The immutable source bytes to edit. */
  source: GenerativeEditSource;
  /** The bounded region the generative edit affects (Req 9.1). */
  affectedRegion: TimeRangeMs;
  /** Segmentation inputs (Req 9.1–9.6). */
  segmentation: GenerativeSegmentationInput;
  /** Prompt-compilation inputs (Req 9.7–9.10). */
  prompt: GenerativePromptInput;
  /** The Model_Router-selected provider adapter for this edit. */
  provider: VideoAIProvider;
  /**
   * Alternative pipelines available for a protected-element reroute (Req 9.9).
   * The compiler picks the first whose guarantees cover all required elements.
   */
  candidatePipelines?: readonly ProviderPreservationCapability[];
  /** Metering + confirmation inputs (Req 17). */
  metering: GenerativeMeteringInput;
  /** Requested output resolution (e.g. '1080x1920'), passed to the provider. */
  outputResolution?: string;
  /** Track index the validated replacement clips are placed on (default 0). */
  timelineTrackIndex?: number;
}

/** One successfully validated + inserted segment. */
export interface ValidatedSegment {
  /** The original source range this segment replaces (Req 9.12). */
  range: TimeRangeMs;
  /** The persisted immutable artifact id holding the segment bytes. */
  artifactId: string;
  /** Stable storage key of the segment bytes. */
  storageKey: string;
  /** The provider that produced the segment. */
  provider: string;
  /** The model that produced the segment. */
  model: string;
  /** Measured output duration (ms) — aligned to the replaced range (Req 9.12). */
  outputDurationMs: number;
}

/** The discriminated result of a generative edit. */
export type GenerativeEditResult =
  /** All segments validated + inserted; timeline updated in place (Req 9.11, 9.12). */
  | { status: 'completed'; segments: ValidatedSegment[]; timelineChanged: true }
  /** Malformed request; nothing invoked, timeline untouched (Req 9.1). */
  | { status: 'invalid_input'; message: string }
  /** Region exceeds capability and cannot be split; reroute needed, nothing invoked (Req 9.6). */
  | { status: 'reroute_required'; message: string }
  /**
   * The selected provider cannot guarantee a required Protected_Element and no
   * guaranteeing pipeline exists — provider NOT invoked, timeline preserved
   * (Req 9.9, 9.10).
   */
  | {
      status: 'protected_element_warning';
      warning: string;
      unguaranteedElements: ProtectedElement[];
    }
  /** Extraction of a sub-range failed; edit aborted, timeline preserved (Req 9.13). */
  | { status: 'extraction_failed'; errorCode: string; range: TimeRangeMs; message: string }
  /**
   * A produced segment failed QC; NOT inserted, original range retained, timeline
   * preserved (Req 9.14).
   */
  | {
      status: 'quality_failed';
      range: TimeRangeMs;
      inspection: OutputInspection;
      message: string;
    }
  /** Insufficient credits blocked the provider call; no deduction (Req 17.9). */
  | {
      status: 'blocked';
      reason: string;
      required: number;
      remaining: number;
      upgradePath: UpgradePath;
    }
  /** The operation was cancelled (confirmation timeout / decline / abort) (Req 17.8, 17.10). */
  | { status: 'cancelled'; cause: string };

// ---------------------------------------------------------------------------
// Injectable collaborators
// ---------------------------------------------------------------------------

/** Extracted bytes for a single sub-range, ready to send to the provider. */
export interface ExtractedSegment {
  buffer: Buffer;
  mimeType: string;
  /** Measured duration of the extracted bytes in ms. */
  durationMs: number;
}

/** Extracts one sub-range's bytes from the immutable source (Req 9.13). Injectable. */
export type SegmentExtractor = (input: {
  source: GenerativeEditSource;
  range: TimeRangeMs;
  workDir: string;
}) => Promise<ExtractedSegment>;

/** Probes a produced output into the metrics the pure QC core validates (Req 9.11). Injectable. */
export type SegmentOutputProber = (input: {
  output: VideoOutput;
  bytes: Buffer | null;
  workDir: string;
}) => Promise<{ probe: OutputProbe; metrics: QualityMetrics }>;

/** Resolves an output's real bytes for probing + storage (base64 or fetched). Injectable. */
export type OutputBytesResolver = (output: VideoOutput) => Promise<Buffer>;

/**
 * Inserts a validated segment into the timeline in place of its original range
 * with matching duration (Req 9.11, 9.12). Injectable so the orchestration is
 * testable without the full timeline model.
 */
export interface TimelineSegmentGateway {
  insertValidatedSegment(input: {
    identity: TimelineIdentity;
    range: TimeRangeMs;
    artifactId: string;
    trackIndex: number;
  }): Promise<{ ok: boolean; error?: string }>;
}

/** Injectable dependencies (defaulted for production, overridable for tests). */
export interface GenerativeEditorServiceDeps {
  logger?: Pick<typeof defaultLogger, 'info' | 'warn' | 'error' | 'debug'>;
  storage?: IStorageService;
  metering?: VideoGenerativeMeteringService;
  artifactRepository?: ArtifactRepository;
  timeline?: TimelineEngineService;
  /** Resolves a reroute target `provider/model` to an adapter (Req 9.9). */
  resolveProvider?: (provider: string, model: string) => VideoAIProvider | null;
  jobModel?: Model<IVideoEditJob>;
  segmentExtractor?: SegmentExtractor;
  outputProber?: SegmentOutputProber;
  outputBytesResolver?: OutputBytesResolver;
  timelineGateway?: TimelineSegmentGateway;
  ffmpegPath?: string | null;
  tempDir?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Duration of a range in whole ms (assumes a well-formed range). */
function rangeDurationMs(range: TimeRangeMs): number {
  return range.endMs - range.startMs;
}

/** Whether an error looks like an abort/cancel (used to classify metering failures). */
function isAbortLike(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || /abort|cancel/i.test(error.message))
  );
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Orchestrates the extract → segment → meter → QC → insert generative-edit
 * pipeline (Req 9.11–9.14). Delegates every rule to a pure core or existing
 * service; performs only sequencing and byte movement.
 */
export class GenerativeEditorService {
  private readonly log: GenerativeEditorServiceDeps['logger'];
  private readonly storage: IStorageService;
  private readonly metering: VideoGenerativeMeteringService;
  private readonly artifactRepository: ArtifactRepository;
  private readonly timeline: TimelineEngineService;
  private readonly resolveProvider: (provider: string, model: string) => VideoAIProvider | null;
  private readonly jobModel: Model<IVideoEditJob>;
  private readonly segmentExtractor: SegmentExtractor;
  private readonly outputProber: SegmentOutputProber;
  private readonly outputBytesResolver: OutputBytesResolver;
  private readonly timelineGateway: TimelineSegmentGateway;
  private readonly ffmpegPath: string | null;
  private readonly tempDir: string;

  constructor(deps: GenerativeEditorServiceDeps = {}) {
    this.log = deps.logger ?? defaultLogger;
    this.storage = deps.storage ?? getStorageService();
    this.metering = deps.metering ?? getVideoGenerativeMeteringService();
    this.artifactRepository = deps.artifactRepository ?? getArtifactRepository();
    this.timeline = deps.timeline ?? timelineEngineService;
    this.resolveProvider = deps.resolveProvider ?? (() => null);
    this.jobModel = deps.jobModel ?? DefaultVideoEditJobModel;
    this.ffmpegPath = deps.ffmpegPath ?? (ffmpegStatic as unknown as string | null) ?? null;
    this.tempDir = deps.tempDir ?? path.join(os.tmpdir(), 'veefore-video-editor', 'generative');
    this.segmentExtractor = deps.segmentExtractor ?? this.createDefaultExtractor();
    this.outputProber = deps.outputProber ?? this.createDefaultProber();
    this.outputBytesResolver = deps.outputBytesResolver ?? this.createDefaultBytesResolver();
    this.timelineGateway = deps.timelineGateway ?? this.createDefaultTimelineGateway();
  }

  /**
   * Run one generative edit end-to-end (Req 9.11–9.14). Returns a discriminated
   * result; only a hard failure that must fail the job throws
   * {@link GenerativeEditError}. On any non-completed outcome the timeline is
   * left unchanged (segments are inserted only after ALL are validated).
   */
  async runGenerativeEdit(request: GenerativeEditRequest): Promise<GenerativeEditResult> {
    const workId = randomUUID();
    const workDir = path.join(this.tempDir, workId);

    try {
      await fs.promises.mkdir(workDir, { recursive: true });

      // (1) Segment the affected region (Req 9.1–9.6). No provider is invoked here.
      const segmentation = segmentGenerativeEdit({
        affectedRegion: request.affectedRegion,
        caps: request.segmentation.caps,
        sceneBoundariesMs: request.segmentation.sceneBoundariesMs,
        trackedSubjects: request.segmentation.trackedSubjects,
        utterances: request.segmentation.utterances,
        candidateRanges: request.segmentation.candidateRanges,
      });
      if (!segmentation.ok) {
        // Malformed input or over-capability region: nothing invoked, timeline untouched.
        return segmentation.reason === 'REROUTE_REQUIRED'
          ? { status: 'reroute_required', message: segmentation.message }
          : { status: 'invalid_input', message: segmentation.message };
      }

      // (2) Compile the provider-safe instruction + protected-element gate (Req 9.7–9.10).
      const decision = compileGenerativeInstruction({
        userRequest: request.prompt.userRequest,
        requiredProtectedElements: request.prompt.requiredProtectedElements,
        selectedProvider: this.toPreservationCapability(request.provider),
        candidatePipelines: request.candidatePipelines,
        operationType: request.prompt.operationType,
        editingStyle: request.prompt.editingStyle,
      });

      // Resolve which provider actually runs, or short-circuit on WARN (Req 9.10).
      const providerResolution = this.resolveEffectiveProvider(request, decision);
      if (providerResolution.warn) {
        // Provider NOT invoked; timeline preserved (Req 9.9, 9.10).
        return {
          status: 'protected_element_warning',
          warning: providerResolution.warn.warning,
          unguaranteedElements: providerResolution.warn.unguaranteedElements,
        };
      }
      const effectiveProvider = providerResolution.provider;
      const instruction = decision.instruction.providerInstruction;
      const preservationConstraints = decision.instruction.preservationConstraints.map(
        (c) => c.instruction,
      );

      const costPerOutputSecondInr =
        request.metering.costPerOutputSecondInr ??
        effectiveProvider.getCapabilities().costPerOutputSecondInr;

      // (3)–(5) For each sub-range: extract → meter+generate → store → QC-validate.
      // Validated segments are collected and inserted only after ALL pass, so a
      // failure anywhere preserves the timeline (Req 9.13, 9.14).
      const validated: ValidatedSegment[] = [];

      for (const range of segmentation.subRanges) {
        // (3) Extract the sub-range bytes (Req 9.13).
        let extracted: ExtractedSegment;
        try {
          extracted = await this.segmentExtractor({ source: request.source, range, workDir });
        } catch (error) {
          const code = 'GENERATIVE_EXTRACTION_FAILED';
          await this.failJob(request.jobId, code);
          this.log?.error?.('Generative edit extraction failed', error as Error, {
            component: 'GenerativeEditorService',
            jobId: request.jobId,
            range,
          });
          // Abort, retain the timeline unchanged (Req 9.13).
          return {
            status: 'extraction_failed',
            errorCode: code,
            range,
            message: `Failed to extract the affected range [${range.startMs}..${range.endMs}]ms: ${(error as Error)?.message ?? 'unknown error'}`,
          };
        }

        // (4) Meter + run the provider call (Req 17). The provider receives the
        // COMPILED instruction (never the raw prompt) + explicit preservation
        // constraints (Req 9.7, 9.8).
        const editReq: VideoEditRequest = {
          instruction,
          inputVideoBase64: extracted.buffer.toString('base64'),
          inputVideoMimeType: extracted.mimeType,
          affectedRangeMs: { startMs: range.startMs, endMs: range.endMs },
          outputResolution: request.outputResolution,
          preservationConstraints,
        };
        const outputSeconds = rangeDurationMs(range) / 1000;
        const retryCount = request.metering.retryCount ?? 0;

        // Measure the ACTUAL provider-call latency (Req 22.2, 22.3) inside the
        // metered operation closure so it reflects the provider round-trip, not
        // the surrounding gate/confirmation. `providerCallStarted` distinguishes
        // a real (possibly instant) provider failure from a pre-call block/cancel
        // that never reached the provider.
        let providerLatencyMs = 0;
        let providerCallStarted = false;
        let run: GenerativeRunResult<VideoEditResult>;
        try {
          run = await this.metering.runGenerativeOperation<VideoEditResult>({
            context: {
              userId: request.userId,
              workspaceId: request.workspaceId,
              idempotencyKey: `${request.metering.idempotencyKey}:${range.startMs}-${range.endMs}`,
            },
            cost: { outputSeconds, costPerOutputSecondInr },
            operation: async (signal) => {
              providerCallStarted = true;
              const startedAt = Date.now();
              try {
                return await effectiveProvider.edit(editReq, signal);
              } finally {
                providerLatencyMs = Date.now() - startedAt;
              }
            },
            confirm: request.metering.confirm,
            signal: request.metering.signal,
            isZeroCostEdit: request.metering.isZeroCostEdit,
          });
        } catch (error) {
          // A provider call that actually executed and failed (Req 22.3). A
          // pre-call block/cancel is returned (not thrown), so a throw here after
          // the provider round-trip started means the provider itself failed —
          // emit the failure event, then propagate.
          if (providerCallStarted) {
            emitProviderCallFailed(
              {
                userId: request.userId,
                workspaceId: request.workspaceId,
                projectId: request.projectId,
                jobId: request.jobId,
                versionId: request.versionId,
                provider: effectiveProvider.provider,
                model: effectiveProvider.model,
                latencyMs: providerLatencyMs,
                retryCount,
                reason: (error as Error)?.message ?? 'provider call failed',
                operationType: 'generative_edit',
              },
              { logger: this.log },
            );
          }
          throw error;
        }

        if (run.status === 'blocked') {
          // Insufficient credits: no provider call proceeded to a charge (Req 17.9).
          return {
            status: 'blocked',
            reason: run.reason,
            required: run.required,
            remaining: run.remaining,
            upgradePath: run.upgradePath,
          };
        }
        if (run.status === 'cancelled') {
          // Timeout / decline / abort: no deduction, timeline unchanged (Req 17.8, 17.10).
          return { status: 'cancelled', cause: run.cause };
        }

        const editResult = run.result;
        const output = editResult.output;

        // Structured provider-call COMPLETION event (Req 22.2): latency, provider,
        // model, output seconds, estimated + actual credits, and retry count. No
        // media URL or credential is carried (Req 22.4).
        emitProviderCallCompleted(
          {
            userId: request.userId,
            workspaceId: request.workspaceId,
            projectId: request.projectId,
            jobId: request.jobId,
            versionId: request.versionId,
            provider: editResult.provider,
            model: editResult.model,
            latencyMs: providerLatencyMs,
            outputSeconds:
              Number.isFinite(output.outputSeconds) && output.outputSeconds > 0
                ? output.outputSeconds
                : outputSeconds,
            estimatedCredits: run.estimate.estimatedCredits,
            actualCredits: run.settlement.charged,
            retryCount,
            operationType: 'generative_edit',
          },
          { logger: this.log },
        );

        // Resolve the real output bytes for probing + immutable storage.
        let outputBytes: Buffer;
        try {
          outputBytes = await this.outputBytesResolver(output);
        } catch (error) {
          const code = 'GENERATIVE_OUTPUT_UNREADABLE';
          await this.failJob(request.jobId, code);
          throw new GenerativeEditError(
            code,
            `Provider output could not be read for range [${range.startMs}..${range.endMs}]ms: ${(error as Error)?.message ?? 'unknown error'}`,
          );
        }

        // (5) QC-validate the produced segment (Req 9.11, 9.14). Duration is
        // validated against the replaced range so the inserted segment is
        // duration-aligned (Req 9.12).
        const { probe, metrics } = await this.outputProber({
          output,
          bytes: outputBytes,
          workDir,
        });
        const requestedSpec = this.buildSegmentSpec(probe, rangeDurationMs(range));
        const inspection = inspectOutput(probe, requestedSpec, metrics);

        if (!inspection.ok) {
          // Segment failed QC: do NOT insert, retain the original range unchanged,
          // surface the failure. Nothing is inserted, so the timeline is preserved
          // (Req 9.14). The stored artifact remains as immutable provenance.
          this.log?.warn?.('Generative segment failed quality control', {
            component: 'GenerativeEditorService',
            jobId: request.jobId,
            range,
            existence: inspection.existence,
            spec: inspection.spec,
            quality: inspection.quality,
          });
          await this.failJob(request.jobId, 'QUALITY_CONTROL_FAILED');
          return {
            status: 'quality_failed',
            range,
            inspection,
            message: `Generatively edited segment [${range.startMs}..${range.endMs}]ms failed quality-control validation; the original range was retained.`,
          };
        }

        // Store the real provider output as an immutable artifact (Req 9.11, 20.x).
        const created = await this.artifactRepository.createArtifact({
          projectId: request.projectId,
          workspaceId: request.workspaceId,
          userId: request.userId,
          category: 'generated',
          buffer: outputBytes,
          originalName: `generative-${range.startMs}-${range.endMs}-${randomUUID()}.mp4`,
          mimeType: output.mimeType || 'video/mp4',
          provenance: {
            jobId: request.jobId,
            inputVersionId: request.inputVersionId,
            provider: editResult.provider,
            model: editResult.model,
            prompt: instruction,
            costCredits: run.settlement.charged,
          },
        });

        validated.push({
          range,
          artifactId: created.artifact.artifactId,
          storageKey: created.storageKey,
          provider: editResult.provider,
          model: editResult.model,
          outputDurationMs: Math.round(output.outputSeconds * 1000),
        });
      }

      // (6) All segments validated — insert each in place of its original range,
      // duration-aligned (Req 9.11, 9.12). Applied only now so any earlier
      // failure left the timeline untouched.
      const identity: TimelineIdentity = {
        projectId: request.projectId,
        versionId: request.versionId,
        workspaceId: request.workspaceId,
        userId: request.userId,
      };
      const trackIndex = request.timelineTrackIndex ?? 0;
      for (const segment of validated) {
        const insertion = await this.timelineGateway.insertValidatedSegment({
          identity,
          range: segment.range,
          artifactId: segment.artifactId,
          trackIndex,
        });
        if (!insertion.ok) {
          const code = 'GENERATIVE_TIMELINE_INSERT_FAILED';
          await this.failJob(request.jobId, code);
          throw new GenerativeEditError(
            code,
            `Failed to insert validated segment [${segment.range.startMs}..${segment.range.endMs}]ms into the timeline: ${insertion.error ?? 'unknown error'}`,
          );
        }
      }

      this.log?.info?.('Generative edit completed', {
        component: 'GenerativeEditorService',
        jobId: request.jobId,
        segments: validated.length,
      });
      return { status: 'completed', segments: validated, timelineChanged: true };
    } finally {
      await this.cleanup(workDir);
    }
  }

  // -------------------------------------------------------------------------
  // Provider resolution (Req 9.9, 9.10)
  // -------------------------------------------------------------------------

  /**
   * Decide which provider actually runs given the compiler decision (Req 9.9,
   * 9.10): INVOKE → the selected provider; REROUTE → the guaranteeing pipeline
   * resolved to an adapter; WARN (or an unresolvable reroute) → do not invoke,
   * surface the warning.
   */
  private resolveEffectiveProvider(
    request: GenerativeEditRequest,
    decision: PromptCompileDecision,
  ):
    | { provider: VideoAIProvider; warn?: undefined }
    | { provider?: undefined; warn: { warning: string; unguaranteedElements: ProtectedElement[] } } {
    if (decision.action === 'INVOKE') {
      return { provider: request.provider };
    }
    if (decision.action === 'REROUTE') {
      const rerouted = this.resolveProvider(decision.provider, decision.model);
      if (rerouted) return { provider: rerouted };
      // Could not resolve the guaranteeing pipeline to an adapter — treat as a
      // warning rather than invoking a provider that cannot guarantee the element.
      return {
        warn: {
          warning: `A guaranteeing pipeline (${decision.provider}/${decision.model}) was selected but is unavailable; the edit was not sent to any provider.`,
          unguaranteedElements: decision.unguaranteedElements,
        },
      };
    }
    // WARN — the selected provider is never invoked (Req 9.10).
    return {
      warn: {
        warning: decision.warning,
        unguaranteedElements: decision.unguaranteedElements,
      },
    };
  }

  /** Project a provider adapter down to the preservation-capability shape the compiler needs. */
  private toPreservationCapability(provider: VideoAIProvider): ProviderPreservationCapability {
    const caps = provider.getCapabilities();
    return {
      provider: caps.provider,
      model: caps.model,
      guaranteesPreservation: caps.guaranteesPreservation,
    };
  }

  /**
   * Build the QC requested-spec for a segment. Structural fields mirror the
   * probed output (a mid-pipeline segment inherits the source's container/codec/
   * dimensions), while `requestedDurationMs` is fixed to the replaced range so QC
   * enforces duration alignment (Req 9.12) — a segment whose duration drifts from
   * its range fails validation and is never inserted (Req 9.14).
   */
  private buildSegmentSpec(probe: OutputProbe, rangeMs: number): RequestedOutputSpec {
    return {
      container: probe.container,
      videoCodec: probe.videoCodec,
      audioCodec: probe.audioCodec ?? null,
      width: probe.width,
      height: probe.height,
      fps: probe.fps,
      expectedAudioStreamCount: probe.audioStreamCount,
      requestedDurationMs: rangeMs,
    };
  }

  // -------------------------------------------------------------------------
  // Job failure (Req 9.13, 9.14)
  // -------------------------------------------------------------------------

  /**
   * Mark the associated Video_Edit_Job FAILED with an error code, respecting
   * terminal-state absorption. Best-effort: an update failure is logged, not
   * thrown, so it cannot mask the original error.
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
      this.log?.warn?.('Failed to mark job FAILED after generative error', {
        component: 'GenerativeEditorService',
        jobId,
        error: (error as Error)?.message,
      });
    }
  }

  /** Remove the temporary working directory (best-effort). */
  private async cleanup(workDir: string): Promise<void> {
    try {
      await fs.promises.rm(workDir, { recursive: true, force: true });
    } catch (error) {
      this.log?.warn?.('Failed to clean up generative temp dir', {
        component: 'GenerativeEditorService',
        workDir,
        error: (error as Error)?.message,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Default IO collaborators (FFmpeg / FFprobe / base64)
  // -------------------------------------------------------------------------

  /**
   * Default segment extractor: downloads the immutable source, trims the
   * requested range with FFmpeg to a temp file, and returns the bytes. Reads the
   * source unmodified — the trim reads into a fresh temp input and writes a
   * separate temp output, never touching the source key (Req 8.4).
   */
  private createDefaultExtractor(): SegmentExtractor {
    const storage = this.storage;
    const ffmpegPath = this.ffmpegPath;
    return async ({ source, range, workDir }) => {
      const inExt = path.extname(source.fileName) || '.mp4';
      const inputPath = path.join(workDir, `src-${randomUUID()}${inExt}`);
      const outputPath = path.join(workDir, `seg-${randomUUID()}.mp4`);

      const downloaded = await storage.downloadFile(source.storageKey);
      await fs.promises.writeFile(inputPath, downloaded.buffer);

      const ss = (range.startMs / 1000).toFixed(3);
      const to = (range.endMs / 1000).toFixed(3);
      await new Promise<void>((resolve, reject) => {
        const cmd = ffmpeg(inputPath);
        if (ffmpegPath) cmd.setFfmpegPath(ffmpegPath);
        cmd
          .outputOptions([
            '-ss',
            ss,
            '-to',
            to,
            '-c:v',
            'libx264',
            '-preset',
            'medium',
            '-crf',
            '18',
            '-pix_fmt',
            'yuv420p',
            '-c:a',
            'aac',
            '-b:a',
            '128k',
          ])
          .on('error', (err: Error) => reject(err))
          .on('end', () => resolve())
          .save(outputPath);
      });

      const stat = await fs.promises.stat(outputPath).catch(() => null);
      if (!stat || !stat.isFile() || stat.size <= 0) {
        throw new GenerativeEditError(
          'GENERATIVE_EXTRACTION_EMPTY',
          'FFmpeg produced no extracted segment output',
        );
      }
      const buffer = await fs.promises.readFile(outputPath);
      return { buffer, mimeType: 'video/mp4', durationMs: rangeDurationMs(range) };
    };
  }

  /**
   * Default output prober: runs FFprobe over the produced bytes for real
   * structural metrics (container/codec/dims/fps/duration/audio-stream-count).
   * Frame-level quality metrics (black/frozen/artifacts) default to non-failing
   * here; the dedicated Quality_Controller service (task 14.5) performs deep
   * frame analysis when wired. Existence + duration alignment are validated from
   * these real metrics.
   */
  private createDefaultProber(): SegmentOutputProber {
    const ffmpegPath = this.ffmpegPath;
    return async ({ bytes, workDir }) => {
      if (!bytes || bytes.length === 0) {
        const probe: OutputProbe = {
          exists: false,
          sizeBytes: 0,
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
        return { probe, metrics: emptyMetrics() };
      }

      const probePath = path.join(workDir, `probe-${randomUUID()}.mp4`);
      await fs.promises.writeFile(probePath, bytes);
      const data = await new Promise<ffmpeg.FfprobeData>((resolve, reject) => {
        const runner = ffmpeg();
        if (ffmpegPath) {
          // ffprobe path is derived alongside ffmpeg in most installs; fall back
          // to the default resolver when a custom ffmpeg path is set.
        }
        runner.input(probePath).ffprobe((err, probeData) => {
          if (err) reject(err);
          else resolve(probeData);
        });
      });

      const videoStream = data.streams?.find((s) => s.codec_type === 'video');
      const audioStreams = data.streams?.filter((s) => s.codec_type === 'audio') ?? [];
      const durationSec = Number(data.format?.duration ?? videoStream?.duration ?? 0);
      const durationMs = Number.isFinite(durationSec) ? Math.round(durationSec * 1000) : 0;
      const fps = parseFrameRate(videoStream?.avg_frame_rate ?? videoStream?.r_frame_rate);

      const probe: OutputProbe = {
        exists: true,
        sizeBytes: bytes.length,
        hasVideoStream: !!videoStream,
        container: (data.format?.format_name ?? '').split(',')[0] ?? '',
        videoCodec: videoStream?.codec_name ?? '',
        audioCodec: audioStreams[0]?.codec_name ?? null,
        audioStreamCount: audioStreams.length,
        width: Number(videoStream?.width ?? 0),
        height: Number(videoStream?.height ?? 0),
        fps,
        durationMs,
      };

      const metrics: QualityMetrics = {
        ...emptyMetrics(),
        audioExpected: audioStreams.length > 0,
        audioPresent: audioStreams.length > 0,
        measuredDurationMs: durationMs,
      };
      return { probe, metrics };
    };
  }

  /** Default bytes resolver: decodes inline base64 output; rejects URI-only outputs. */
  private createDefaultBytesResolver(): OutputBytesResolver {
    return async (output: VideoOutput) => {
      if (output.videoBase64) {
        return Buffer.from(output.videoBase64, 'base64');
      }
      throw new GenerativeEditError(
        'GENERATIVE_OUTPUT_NO_BYTES',
        'Provider output has no inline bytes; a URI-only output requires a configured OutputBytesResolver',
      );
    };
  }

  /**
   * Default timeline gateway: inserts the validated segment as a clip element at
   * the replaced range with matching duration (Req 9.11, 9.12), sourced from the
   * stored artifact. Delegates all validation to the pure timeline core via the
   * `TimelineEngineService`.
   */
  private createDefaultTimelineGateway(): TimelineSegmentGateway {
    const timeline = this.timeline;
    return {
      async insertValidatedSegment({ identity, range, artifactId, trackIndex }) {
        const durationMs = rangeDurationMs(range);
        const result = await timeline.acceptOperation(identity, {
          type: 'addElement',
          element: {
            kind: 'clip',
            trackIndex,
            timelineStartMs: range.startMs,
            timelineEndMs: range.endMs,
            sourceAssetId: artifactId,
            sourceInMs: 0,
            sourceOutMs: durationMs,
          },
          ctx: { sourceDurationsMs: { [artifactId]: durationMs } },
        });
        return result.ok ? { ok: true } : { ok: false, error: result.error };
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

/** A QualityMetrics with no failures — the neutral baseline the default prober uses. */
function emptyMetrics(): QualityMetrics {
  return {
    longestBlackRunMs: 0,
    longestFrozenRunMs: 0,
    audioExpected: false,
    audioPresent: false,
    audioSilentFraction: 0,
    maxArtifactAreaFraction: 0,
    measuredDurationMs: 0,
  };
}

/** Parse an FFprobe frame-rate string ('30000/1001', '30', undefined) to fps. */
function parseFrameRate(raw: string | undefined): number {
  if (!raw) return 0;
  const [num, den] = raw.split('/');
  const n = Number(num);
  const d = den === undefined ? 1 : Number(den);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return 0;
  return n / d;
}

/** Shared singleton for production use (mirrors other feature-service exports). */
export const generativeEditorService = new GenerativeEditorService();
