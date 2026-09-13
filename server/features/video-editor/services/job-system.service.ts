/**
 * Job_System service — the IO-bearing orchestration shell over the pure
 * `job-state.logic` core, the BullMQ video queues, the VideoEditJob model, and
 * the authoritative credit ledger (task 4.4, Req 18.3, 18.5, 18.6, 18.7, 18.8,
 * 18.9).
 *
 * A `Video_Edit_Job` is an asynchronous unit of work executed on a BullMQ
 * worker. This service owns the job's lifecycle metadata and the side-effecting
 * transitions the pure core cannot own:
 *
 *   1. Creation (Req 18.3). Every job is assigned a UNIQUE idempotency key, an
 *      attempt number starting at 1, a configurable timeout clamped to
 *      ≤ 3600 s (from the single-source config), and input/output artifact
 *      references. Creation registers a per-job `AbortController` so any stage
 *      or provider call can be cancelled, and enqueues the work asynchronously
 *      so the initiating request never blocks (Req 18.1).
 *
 *   2. State + progress (Req 18.2, 18.4). All transitions go through the pure
 *      `transition()` (single-valued, terminal-absorbing); progress is recomputed
 *      SOLELY from the count of actually-completed stages via `computeJobProgress`
 *      and is never prematurely 100.
 *
 *   3. Cancellation within 5 s (Req 18.5, 18.6). Cancelling aborts the job's
 *      `AbortController` (stopping subsequent stages and signalling any provider
 *      that honours `AbortSignal`), marks the job CANCELLED, removes the job's
 *      temporary files, and reconciles reserved credits through the ledger. If a
 *      cleanup action fails the job is STILL marked CANCELLED and the failed
 *      cleanup is retried in the background on the `video-cleanup` queue (up to
 *      3 additional attempts with exponential backoff, Req 18.6).
 *
 *   4. Timeout + attempts exhaustion (Req 18.8, 18.9). A job past its timeout,
 *      or one that has used its configured maximum of 3 attempts without
 *      completing, is marked FAILED with a specific error code and its reserved
 *      credits are released.
 *
 *   5. Idempotent retries (Req 18.7). A retry reuses the SAME deterministic job
 *      id and idempotency key, so BullMQ de-duplicates it and the metering
 *      ledger charges at most once — no duplicate side effects, artifacts, or
 *      charges. Retries are bounded to the configured maximum (3).
 *
 * Persistence and queue access are behind small injectable interfaces so the
 * orchestration can be unit-tested without Redis, MongoDB, or a provider — the
 * production factory wires the real VideoEditJob model, queue manager, and
 * `aiCreditMeteringService`.
 */

import { randomUUID } from 'crypto';

import { logger as defaultLogger } from '../../../config/logger';
import { VIDEO_EDITOR_CONFIG } from '../config/video-editor.config';
import {
  PIPELINE_STAGES,
  computeJobProgress,
  isJobState,
  isPipelineStage,
  isTerminalState,
  transition,
  type JobState,
  type PipelineStage,
} from './job-state.logic';
import {
  VideoEditorQueueManager,
  videoEditorJobId,
  type VideoJobData,
  type VideoJobType,
} from '../../../queues/videoEditorQueues';
import { emitLifecycleEvent, type VideoLifecycleEvent } from './video-editor-events';

// ---------------------------------------------------------------------------
// Error codes (Req 18.8, 18.9)
// ---------------------------------------------------------------------------

/** Recorded on a job that exceeded its configured timeout (Req 18.8). */
export const JOB_ERROR_TIMEOUT = 'JOB_TIMEOUT';
/** Recorded on a job that used all configured attempts without completing (Req 18.9). */
export const JOB_ERROR_ATTEMPTS_EXHAUSTED = 'JOB_ATTEMPTS_EXHAUSTED';

// ---------------------------------------------------------------------------
// Persisted job record (a structural subset of IVideoEditJob)
// ---------------------------------------------------------------------------

/**
 * The job fields the orchestration reads/writes. Kept as a plain shape (not the
 * Mongoose Document) so the store can be faked in tests and the service never
 * depends on Mongoose internals.
 */
export interface JobRecord {
  jobId: string;
  projectId: string;
  workspaceId: string;
  userId: string;
  idempotencyKey: string;
  state: JobState;
  attempt: number;
  timeoutSec: number;
  progress: number;
  completedStages: string[];
  inputArtifactIds: string[];
  outputArtifactIds: string[];
  errorCode?: string;
  creditIdempotencyKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** The subset of fields a store must accept when creating a job. */
export interface JobCreateData {
  jobId: string;
  projectId: string;
  workspaceId: string;
  userId: string;
  idempotencyKey: string;
  state: JobState;
  attempt: number;
  timeoutSec: number;
  progress: number;
  completedStages: string[];
  inputArtifactIds: string[];
  outputArtifactIds: string[];
  creditIdempotencyKey?: string;
}

/** Fields the orchestration may patch on an existing job. */
export interface JobPatch {
  state?: JobState;
  attempt?: number;
  progress?: number;
  completedStages?: string[];
  outputArtifactIds?: string[];
  errorCode?: string;
}

/**
 * The persistence port. The production implementation wraps the VideoEditJob
 * Mongoose model; tests supply an in-memory fake.
 */
export interface JobStore {
  create(data: JobCreateData): Promise<JobRecord>;
  findByJobId(jobId: string): Promise<JobRecord | null>;
  update(jobId: string, patch: JobPatch): Promise<JobRecord | null>;
}

/** The minimal credit-ledger surface needed to release a reservation (Req 18.5, 18.8, 18.9). */
export interface JobCreditReleaser {
  /** Release the full reservation for an idempotency key (no net deduction). */
  refundSettlement(idempotencyKey: string): Promise<void>;
}

/** Removes a job's temporary working files; may reject on failure (Req 18.5). */
export type TempFileRemover = (paths: readonly string[]) => Promise<void>;

/** Enqueues a job onto a video queue; returns the job id or null when unavailable. */
export type JobEnqueuer = (
  type: VideoJobType,
  data: Omit<VideoJobData, 'type'>,
) => Promise<string | null>;

/** Injectable dependencies (production defaults, overridable for tests). */
export interface JobSystemDeps {
  store: JobStore;
  creditReleaser?: JobCreditReleaser;
  enqueue?: JobEnqueuer;
  /** Schedules a background cleanup retry on the `video-cleanup` queue (Req 18.6). */
  scheduleCleanup?: JobEnqueuer;
  removeTempFiles?: TempFileRemover;
  logger?: Pick<typeof defaultLogger, 'info' | 'warn' | 'error' | 'debug'>;
  /** Injectable clock for deterministic timeout tests (defaults to Date.now). */
  now?: () => number;
}

// ---------------------------------------------------------------------------
// Public inputs / outputs
// ---------------------------------------------------------------------------

/** Identity of the work item a job operates on (drives the deterministic id). */
export interface JobIdentity {
  projectId: string;
  versionId: string;
  opId: string;
}

/** Inputs to create a new job (Req 18.3). */
export interface CreateJobInput extends JobIdentity {
  type: VideoJobType;
  workspaceId: string;
  userId: string;
  /**
   * The idempotency key for this unit of work. Reused across retries so the
   * operation is charged/executed at most once (Req 18.7). Generated when
   * omitted.
   */
  idempotencyKey?: string;
  /** Link to the credit reservation this job's provider work is metered under. */
  creditIdempotencyKey?: string;
  /** Configurable job timeout in seconds; clamped to ≤ maxTimeoutSec (Req 18.3). */
  timeoutSec?: number;
  inputArtifactIds?: string[];
  outputArtifactIds?: string[];
  /** When false, the job is created but not enqueued (caller enqueues later). */
  enqueue?: boolean;
  /**
   * Optional serializable context forwarded onto the enqueued BullMQ job's
   * `data.payload` so the worker can reconstruct the unit of work (e.g. the
   * generative-edit context, task 17.8). Small metadata only — never bytes.
   */
  payload?: unknown;
}

/** A transition that was rejected by the state machine (prior state unchanged). */
export class JobTransitionError extends Error {
  readonly code = 'JOB_INVALID_TRANSITION';
  constructor(message: string) {
    super(message);
    this.name = 'JobTransitionError';
  }
}

/** Thrown when an operation targets a job id that does not exist. */
export class JobNotFoundError extends Error {
  readonly code = 'JOB_NOT_FOUND';
  constructor(jobId: string) {
    super(`Video edit job not found: ${jobId}`);
    this.name = 'JobNotFoundError';
  }
}

/** The result of a cancellation request (Req 18.5, 18.6). */
export interface CancelResult {
  jobId: string;
  /** The job's state after the request (CANCELLED, or a terminal state if already done). */
  state: JobState;
  /** True iff this call transitioned the job to CANCELLED (false if already terminal). */
  cancelled: boolean;
  /** True iff temp-file removal succeeded inline (false ⇒ retried in background). */
  tempFilesRemoved: boolean;
  /** True iff a background cleanup retry was scheduled (Req 18.6). */
  cleanupRetryScheduled: boolean;
  /** True iff reserved credits were released (Req 18.5). */
  creditsReleased: boolean;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/** The total number of pipeline stages progress is measured against (Req 18.4). */
const TOTAL_PIPELINE_STAGES = PIPELINE_STAGES.length;

/**
 * Orchestrates the lifecycle of a `Video_Edit_Job` (task 4.4). Pure decisions
 * (state transitions, progress) are delegated to `job-state.logic`; this class
 * performs only the IO the pure core cannot: persistence, enqueue, abort
 * signalling, temp-file cleanup, and credit release.
 */
export class JobSystemService {
  private readonly store: JobStore;
  private readonly creditReleaser?: JobCreditReleaser;
  private readonly enqueueFn: JobEnqueuer;
  private readonly scheduleCleanupFn: JobEnqueuer;
  private readonly removeTempFiles?: TempFileRemover;
  private readonly log: NonNullable<JobSystemDeps['logger']>;
  private readonly now: () => number;

  /** Per-job abort controllers so a cancellation can stop stages/providers (Req 18.5). */
  private readonly abortControllers = new Map<string, AbortController>();

  constructor(deps: JobSystemDeps) {
    this.store = deps.store;
    this.creditReleaser = deps.creditReleaser;
    this.enqueueFn =
      deps.enqueue ?? ((type, data) => VideoEditorQueueManager.enqueue(type, data));
    this.scheduleCleanupFn =
      deps.scheduleCleanup ?? ((_type, data) => VideoEditorQueueManager.enqueue('cleanup', data));
    this.removeTempFiles = deps.removeTempFiles;
    this.log = deps.logger ?? defaultLogger;
    this.now = deps.now ?? Date.now;
  }

  // -------------------------------------------------------------------------
  // Creation (Req 18.3)
  // -------------------------------------------------------------------------

  /**
   * Create a new job with a unique idempotency key, attempt = 1, a timeout
   * clamped to ≤ maxTimeoutSec, and input/output artifact references (Req 18.3),
   * register its `AbortController`, and (unless `enqueue === false`) enqueue it
   * asynchronously so the initiating request is never blocked (Req 18.1).
   */
  async createJob(input: CreateJobInput): Promise<JobRecord> {
    const jobId = videoEditorJobId(input.type, {
      projectId: input.projectId,
      versionId: input.versionId,
      opId: input.opId,
    });
    const idempotencyKey = input.idempotencyKey ?? randomUUID();
    const timeoutSec = this.clampTimeout(input.timeoutSec);

    const record = await this.store.create({
      jobId,
      projectId: input.projectId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      idempotencyKey,
      state: 'QUEUED',
      attempt: 1,
      timeoutSec,
      progress: 0,
      completedStages: [],
      inputArtifactIds: input.inputArtifactIds ?? [],
      outputArtifactIds: input.outputArtifactIds ?? [],
      creditIdempotencyKey: input.creditIdempotencyKey,
    });

    // Register an abort controller so stages/providers can be cancelled (Req 18.5).
    this.abortControllers.set(jobId, new AbortController());

    if (input.enqueue !== false) {
      await this.enqueueFn(input.type, {
        projectId: input.projectId,
        versionId: input.versionId,
        opId: input.opId,
        workspaceId: input.workspaceId,
        userId: input.userId,
        idempotencyKey,
        ...(input.payload !== undefined ? { payload: input.payload } : {}),
      });
    }

    this.log.info?.('[VideoEditor][JobSystem] Created job', {
      jobId,
      projectId: input.projectId,
      type: input.type,
      timeoutSec,
    });
    return record;
  }

  /** Clamp a requested timeout into (0, maxTimeoutSec], defaulting when unset/invalid (Req 18.3). */
  private clampTimeout(requested?: number): number {
    const { defaultTimeoutSec, maxTimeoutSec } = VIDEO_EDITOR_CONFIG.job;
    if (requested === undefined || !Number.isFinite(requested) || requested <= 0) {
      return Math.min(defaultTimeoutSec, maxTimeoutSec);
    }
    return Math.min(Math.floor(requested), maxTimeoutSec);
  }

  // -------------------------------------------------------------------------
  // Abort-signal access (Req 18.5)
  // -------------------------------------------------------------------------

  /**
   * The `AbortSignal` a worker/provider call should honour for this job. A stage
   * that respects this signal stops promptly when the job is cancelled (Req 18.5).
   * Returns `undefined` when the job is unknown to this process (e.g. running on
   * another worker), in which case cancellation is enforced via the persisted
   * CANCELLED state which stages check between steps.
   */
  getAbortSignal(jobId: string): AbortSignal | undefined {
    return this.abortControllers.get(jobId)?.signal;
  }

  // -------------------------------------------------------------------------
  // State + progress (Req 18.2, 18.4)
  // -------------------------------------------------------------------------

  /** Load a job or throw `JobNotFoundError`. */
  async getJob(jobId: string): Promise<JobRecord> {
    const job = await this.store.findByJobId(jobId);
    if (!job) throw new JobNotFoundError(jobId);
    return job;
  }

  /**
   * Apply a single state transition through the pure, single-valued,
   * terminal-absorbing machine (Req 18.2). Rejects an illegal transition with
   * `JobTransitionError`, leaving the prior state unchanged. Recomputes
   * stage-derived progress for the new state (Req 18.4).
   */
  async transitionTo(jobId: string, to: JobState, errorCode?: string): Promise<JobRecord> {
    const job = await this.getJob(jobId);
    const result = transition(job.state, to);
    if (!result.ok) {
      throw new JobTransitionError(result.error);
    }

    const progress = this.progressFor(result.state, job.completedStages.length);
    const patch: JobPatch = { state: result.state, progress };
    if (errorCode !== undefined) patch.errorCode = errorCode;

    const updated = await this.store.update(jobId, patch);
    if (!updated) throw new JobNotFoundError(jobId);

    // Structured lifecycle event: job started (Req 22.1) — the first move out of
    // QUEUED into a non-terminal working stage marks the start of execution.
    if (job.state === 'QUEUED' && result.state !== 'QUEUED' && !isTerminalState(result.state)) {
      this.emitJobLifecycle('job_started', updated);
    }
    return updated;
  }

  /**
   * Record that a pipeline stage actually completed and advance the job's state
   * to that stage. Progress is derived SOLELY from the count of completed stages
   * (Req 18.4). Completing the same stage twice is idempotent (the stage is not
   * double-counted), keeping progress monotonic.
   */
  async recordStageComplete(jobId: string, stage: PipelineStage): Promise<JobRecord> {
    if (!isPipelineStage(stage)) {
      throw new JobTransitionError(`Not a pipeline stage: ${String(stage)}`);
    }
    const job = await this.getJob(jobId);
    if (isTerminalState(job.state)) {
      throw new JobTransitionError(
        `Job ${jobId} is in terminal state ${job.state}; cannot record stage ${stage}`,
      );
    }

    const completedStages = job.completedStages.includes(stage)
      ? job.completedStages
      : [...job.completedStages, stage];

    // Advance state to the stage when the machine permits it; otherwise keep the
    // current state (progress still reflects the newly-completed stage).
    const canAdvance = transition(job.state, stage).ok;
    const nextState = canAdvance ? stage : job.state;
    const progress = this.progressFor(nextState, completedStages.length);

    const updated = await this.store.update(jobId, {
      state: nextState,
      completedStages,
      progress,
    });
    if (!updated) throw new JobNotFoundError(jobId);
    return updated;
  }

  /** Stage-derived integer progress for a state, or the job's current value if indeterminate. */
  private progressFor(state: JobState, completedStages: number): number {
    const report = computeJobProgress({
      state,
      completedStages,
      totalStages: TOTAL_PIPELINE_STAGES,
    });
    return report.determinate ? report.percent : 0;
  }

  // -------------------------------------------------------------------------
  // Completion / failure (Req 18.8, 18.9)
  // -------------------------------------------------------------------------

  /** Mark a job COMPLETED with its output artifacts recorded. */
  async completeJob(jobId: string, outputArtifactIds: string[] = []): Promise<JobRecord> {
    const job = await this.getJob(jobId);
    const result = transition(job.state, 'COMPLETED');
    if (!result.ok) throw new JobTransitionError(result.error);

    const updated = await this.store.update(jobId, {
      state: 'COMPLETED',
      progress: 100,
      outputArtifactIds:
        outputArtifactIds.length > 0 ? outputArtifactIds : job.outputArtifactIds,
    });
    if (!updated) throw new JobNotFoundError(jobId);
    this.disposeAbortController(jobId);
    // Structured lifecycle event: job completed (Req 22.1).
    this.emitJobLifecycle('job_completed', updated);
    return updated;
  }

  /**
   * Mark a job FAILED with an error code and release any reserved credits
   * (Req 18.8, 18.9). Idempotent: a job already FAILED for the same reason is
   * returned unchanged.
   */
  async failJob(jobId: string, errorCode: string): Promise<JobRecord> {
    const job = await this.getJob(jobId);
    if (job.state === 'FAILED') return job;

    const result = transition(job.state, 'FAILED');
    if (!result.ok) throw new JobTransitionError(result.error);

    const updated = await this.store.update(jobId, { state: 'FAILED', errorCode });
    if (!updated) throw new JobNotFoundError(jobId);

    await this.releaseCredits(job);
    this.disposeAbortController(jobId);
    // Structured lifecycle event: job failed (Req 22.1). The error code is a
    // stable, non-sensitive identifier.
    this.emitJobLifecycle('job_failed', updated, { errorCode });
    return updated;
  }

  /**
   * Fail a job that exceeded its configured timeout, recording a timeout error
   * and releasing reserved credits (Req 18.8). No-op when the job has already
   * reached a terminal state or has not yet exceeded its timeout.
   */
  async enforceTimeout(jobId: string): Promise<JobRecord> {
    const job = await this.getJob(jobId);
    if (isTerminalState(job.state)) return job;
    if (!this.hasTimedOut(job)) return job;

    this.abortJob(jobId); // stop the in-flight stage/provider (Req 18.5 plumbing)
    return this.failJob(jobId, JOB_ERROR_TIMEOUT);
  }

  /** Whether a job's elapsed time has exceeded its configured timeout (Req 18.8). */
  private hasTimedOut(job: JobRecord): boolean {
    const startedMs = job.createdAt instanceof Date ? job.createdAt.getTime() : this.now();
    return this.now() - startedMs > job.timeoutSec * 1000;
  }

  // -------------------------------------------------------------------------
  // Idempotent retries (Req 18.7, 18.9)
  // -------------------------------------------------------------------------

  /**
   * Retry a job after a transient failure, idempotently and bounded to the
   * configured maximum of 3 attempts (Req 18.7, 18.9). The retry reuses the SAME
   * deterministic job id and idempotency key, so BullMQ de-duplicates it and the
   * ledger charges at most once — no duplicate side effects, artifacts, or
   * charges. When the maximum attempts are exhausted the job is marked FAILED
   * with an attempts-exhausted error and its reserved credits are released
   * (Req 18.9). A job already in a terminal COMPLETED/CANCELLED state is returned
   * unchanged.
   */
  async retryJob(jobId: string, type: VideoJobType): Promise<JobRecord> {
    const job = await this.getJob(jobId);

    // A job that already reached a terminal state is not retried (idempotent).
    if (isTerminalState(job.state)) return job;

    const maxAttempts = VIDEO_EDITOR_CONFIG.job.maxAttempts;
    if (job.attempt >= maxAttempts) {
      // Attempts exhausted → FAILED + release credits (Req 18.9). failJob
      // transitions the current non-terminal state to FAILED.
      return this.failJob(jobId, JOB_ERROR_ATTEMPTS_EXHAUSTED);
    }

    // Move through RETRYING → QUEUED, incrementing the attempt counter. The
    // pure machine permits RETRYING from any non-terminal state and QUEUED from
    // RETRYING, so the composite QUEUED update below is a legitimate re-queue.
    const toRetrying = transition(job.state, 'RETRYING');
    if (!toRetrying.ok) {
      throw new JobTransitionError(toRetrying.error);
    }
    const nextAttempt = job.attempt + 1;

    const updated = await this.store.update(jobId, {
      state: 'QUEUED',
      attempt: nextAttempt,
      progress: this.progressFor('QUEUED', job.completedStages.length),
    });
    if (!updated) throw new JobNotFoundError(jobId);

    // Re-register a fresh abort controller for the new attempt.
    this.abortControllers.set(jobId, new AbortController());

    // Re-enqueue with the SAME deterministic id + idempotency key (Req 18.7).
    await this.enqueueFn(type, {
      projectId: job.projectId,
      versionId: this.versionIdFromJobId(jobId),
      opId: this.opIdFromJobId(jobId),
      workspaceId: job.workspaceId,
      userId: job.userId,
      idempotencyKey: job.idempotencyKey,
    });

    this.log.info?.('[VideoEditor][JobSystem] Retrying job idempotently', {
      jobId,
      attempt: nextAttempt,
    });
    return updated;
  }

  // -------------------------------------------------------------------------
  // Cancellation within 5 s (Req 18.5, 18.6)
  // -------------------------------------------------------------------------

  /**
   * Cancel a job (Req 18.5): abort its `AbortController` (stopping subsequent
   * stages and signalling any provider that honours the signal), mark it
   * CANCELLED, remove its temporary files, and reconcile reserved credits. If a
   * cleanup action fails, the job is STILL marked CANCELLED and the failed
   * cleanup is retried in the background on the `video-cleanup` queue (up to 3
   * additional attempts with exponential backoff, Req 18.6). The whole request
   * is designed to complete well within the 5 s deadline: the abort + state
   * change are synchronous, and cleanup/credit reconciliation are quick or
   * deferred.
   *
   * Cancelling a job that is already in a terminal state is a no-op that reports
   * the existing state.
   */
  async cancelJob(jobId: string, tempFilePaths: readonly string[] = []): Promise<CancelResult> {
    const job = await this.getJob(jobId);

    if (isTerminalState(job.state)) {
      return {
        jobId,
        state: job.state,
        cancelled: false,
        tempFilesRemoved: false,
        cleanupRetryScheduled: false,
        creditsReleased: false,
      };
    }

    // 1. Abort first so any in-flight stage/provider stops immediately (Req 18.5).
    this.abortJob(jobId);

    // 2. Mark CANCELLED — this is authoritative; cleanup failures never block it.
    const result = transition(job.state, 'CANCELLED');
    if (!result.ok) {
      // Should be impossible for a non-terminal state, but never leave the job
      // in an inconsistent state — surface the machine's decision.
      throw new JobTransitionError(result.error);
    }
    await this.store.update(jobId, { state: 'CANCELLED' });

    // 3. Remove temporary files; on failure still CANCELLED + schedule retry (Req 18.6).
    let tempFilesRemoved = false;
    let cleanupRetryScheduled = false;
    if (tempFilePaths.length > 0 && this.removeTempFiles) {
      try {
        await this.removeTempFiles(tempFilePaths);
        tempFilesRemoved = true;
      } catch (error) {
        this.log.warn?.(
          '[VideoEditor][JobSystem] Temp-file cleanup failed on cancel; scheduling background retry',
          { jobId, err: error instanceof Error ? error.message : String(error) },
        );
        cleanupRetryScheduled = await this.scheduleCleanupRetry(job, tempFilePaths);
      }
    }

    // 4. Reconcile reserved credits through the ledger (Req 18.5).
    const creditsReleased = await this.releaseCredits(job);

    // 5. Drop the abort controller now that the job is terminal.
    this.disposeAbortController(jobId);

    this.log.info?.('[VideoEditor][JobSystem] Cancelled job', {
      jobId,
      tempFilesRemoved,
      cleanupRetryScheduled,
      creditsReleased,
    });

    return {
      jobId,
      state: 'CANCELLED',
      cancelled: true,
      tempFilesRemoved,
      cleanupRetryScheduled,
      creditsReleased,
    };
  }

  /** Schedule a background cleanup retry on the `video-cleanup` queue (Req 18.6). */
  private async scheduleCleanupRetry(
    job: JobRecord,
    tempFilePaths: readonly string[],
  ): Promise<boolean> {
    try {
      const scheduled = await this.scheduleCleanupFn('cleanup', {
        projectId: job.projectId,
        versionId: this.versionIdFromJobId(job.jobId),
        opId: this.opIdFromJobId(job.jobId),
        workspaceId: job.workspaceId,
        userId: job.userId,
        idempotencyKey: job.idempotencyKey,
        payload: { tempFilePaths: [...tempFilePaths], reason: 'cancel-cleanup' },
      });
      return scheduled !== null;
    } catch (error) {
      this.log.error?.(
        '[VideoEditor][JobSystem] Failed to schedule background cleanup retry',
        error,
        { jobId: job.jobId },
      );
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Credit release (Req 18.5, 18.8, 18.9)
  // -------------------------------------------------------------------------

  /**
   * Release any reserved credits for a job through the ledger (Req 18.5, 18.8,
   * 18.9). A job with no credit reservation, or when no releaser is configured,
   * is a no-op. A ledger failure is logged but never thrown — the metering
   * service marks the settlement refund-pending and recovers it on the next
   * balance read, so the job's terminal state is never blocked by a transient
   * ledger error.
   */
  private async releaseCredits(job: JobRecord): Promise<boolean> {
    if (!this.creditReleaser || !job.creditIdempotencyKey) return false;
    try {
      await this.creditReleaser.refundSettlement(job.creditIdempotencyKey);
      return true;
    } catch (error) {
      this.log.error?.(
        '[VideoEditor][JobSystem] Credit release failed; ledger will recover the pending refund',
        error,
        { jobId: job.jobId, creditIdempotencyKey: job.creditIdempotencyKey },
      );
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Abort-controller lifecycle
  // -------------------------------------------------------------------------

  /** Abort a job's in-flight work if this process holds its controller (Req 18.5). */
  private abortJob(jobId: string): void {
    const controller = this.abortControllers.get(jobId);
    if (controller && !controller.signal.aborted) {
      controller.abort();
    }
  }

  /** Drop a job's abort controller once it has reached a terminal state. */
  private disposeAbortController(jobId: string): void {
    this.abortControllers.delete(jobId);
  }

  // -------------------------------------------------------------------------
  // Structured lifecycle events (Req 22.1)
  // -------------------------------------------------------------------------

  /**
   * Emit a job lifecycle event (Req 22.1) carrying the job/project/workspace/user
   * identifiers. The emit is non-aborting (Req 22.6) and secret-free (Req 22.4);
   * the injected logger is forwarded so tests observe the same transport.
   */
  private emitJobLifecycle(
    event: VideoLifecycleEvent,
    job: JobRecord,
    details?: Record<string, unknown>,
  ): void {
    emitLifecycleEvent(
      event,
      {
        userId: job.userId,
        workspaceId: job.workspaceId,
        projectId: job.projectId,
        jobId: job.jobId,
        details,
      },
      { logger: this.log },
    );
  }

  // -------------------------------------------------------------------------
  // Deterministic-id helpers (mirror videoEditorJobId's `ve-{type}-{projectId}-{versionId}-{opId}`)
  // -------------------------------------------------------------------------

  /** Extract the versionId segment from a deterministic job id (2nd-from-last). */
  private versionIdFromJobId(jobId: string): string {
    const parts = jobId.split('-');
    return parts.length >= 2 ? parts[parts.length - 2] : '';
  }

  /** Extract the opId segment from a deterministic job id (last). */
  private opIdFromJobId(jobId: string): string {
    const parts = jobId.split('-');
    return parts.length >= 1 ? parts[parts.length - 1] : '';
  }
}

// ---------------------------------------------------------------------------
// Production factory — wires the real model, queue manager, and credit ledger
// ---------------------------------------------------------------------------

/**
 * Build a `JobStore` backed by the VideoEditJob Mongoose model. Imported lazily
 * inside the factory so the pure-testable service module never eagerly pulls in
 * Mongoose.
 */
async function createModelBackedStore(): Promise<JobStore> {
  const { VideoEditJobModel } = await import('../../../models/VideoEditor/VideoEditJob');

  const toRecord = (doc: any): JobRecord => ({
    jobId: doc.jobId,
    projectId: doc.projectId,
    workspaceId: doc.workspaceId,
    userId: doc.userId,
    idempotencyKey: doc.idempotencyKey,
    state: doc.state,
    attempt: doc.attempt,
    timeoutSec: doc.timeoutSec,
    progress: doc.progress,
    completedStages: [...(doc.completedStages ?? [])],
    inputArtifactIds: [...(doc.inputArtifactIds ?? [])],
    outputArtifactIds: [...(doc.outputArtifactIds ?? [])],
    errorCode: doc.errorCode,
    creditIdempotencyKey: doc.creditIdempotencyKey,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  });

  return {
    async create(data) {
      const doc = await VideoEditJobModel.create(data);
      return toRecord(doc);
    },
    async findByJobId(jobId) {
      const doc = await VideoEditJobModel.findOne({ jobId }).exec();
      return doc ? toRecord(doc) : null;
    },
    async update(jobId, patch) {
      const doc = await VideoEditJobModel.findOneAndUpdate(
        { jobId },
        { $set: patch },
        { new: true },
      ).exec();
      return doc ? toRecord(doc) : null;
    },
  };
}

let sharedService: JobSystemService | null = null;

/**
 * Get the process-wide Job_System service wired to the real VideoEditJob model,
 * the BullMQ video queues, and the authoritative credit ledger (task 4.4).
 */
export async function getJobSystemService(): Promise<JobSystemService> {
  if (sharedService) return sharedService;

  const store = await createModelBackedStore();
  const { aiCreditMeteringService } = await import(
    '../../../features/subscription/services/AICreditMeteringService'
  );

  sharedService = new JobSystemService({
    store,
    creditReleaser: {
      refundSettlement: (idempotencyKey: string) =>
        aiCreditMeteringService.refundSettlement(idempotencyKey),
    },
  });
  return sharedService;
}
