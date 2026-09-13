import { Queue, QueueOptions, JobsOptions } from 'bullmq';
import { getSharedRedisConnection } from '../lib/redis';

/**
 * Veefore AI Video Editor — Job_System queues (Task 4.3).
 *
 * Five BullMQ queues back the asynchronous video pipeline. They follow the
 * exact conventions already used by `aiQueue.ts` / `researchQueue.ts`:
 *   - a single shared Redis connection via `getSharedRedisConnection()`
 *   - every export is `null` when Redis is absent (queues degrade gracefully)
 *   - workers are lazily initialised on first enqueue via a dynamic
 *     `getWorker()` import (never started at module load)
 *
 * `attempts` are tuned per cost (design §Job_System):
 *   - `video-generation` uses `attempts: 1` — paid provider calls (Gemini
 *     Omni / Veo), like `researchQueue`; the QC-driven repair loop decides
 *     retries deliberately rather than blindly re-billing.
 *   - `video-analysis` / `video-render` use bounded retries with exponential
 *     backoff (max 3 attempts, Req 18.7).
 *   - `video-qc` uses bounded retries with exponential backoff (validation is
 *     idempotent and safe to re-run).
 *   - `video-cleanup` removes temporary files with up to 3 backoff retries
 *     (Req 18.6, 20.7).
 *
 * Job ids are deterministic (`ve-{type}-{projectId}-{versionId}-{opId}`) so
 * BullMQ de-duplicates concurrent submissions and retries stay idempotent
 * (Req 18.7). Heavy processing logic is NOT attached here — the workers call
 * placeholder processors that are wired up in later tasks (8.5 / 14.5 / 17.8).
 *
 * Requirements: 18.1 (async, non-blocking), 18.6 (cleanup backoff retries),
 * 18.7 (deterministic ids → idempotent retries, max 3 attempts).
 */

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

/** Logical job type — the `{type}` segment of the deterministic job id. */
export type VideoJobType = 'analysis' | 'generation' | 'render' | 'qc' | 'cleanup';

/** Concrete BullMQ queue names (kebab-case, as per design diagram). */
export const VIDEO_QUEUE_NAMES = {
  analysis: 'video-analysis',
  generation: 'video-generation',
  render: 'video-render',
  qc: 'video-qc',
  cleanup: 'video-cleanup',
} as const satisfies Record<VideoJobType, string>;

/**
 * Maximum idempotent retry attempts for metered/render work (Req 18.7).
 * Retries reuse the same deterministic job id + idempotency key, so they never
 * duplicate side effects, artifacts, or credit charges.
 */
export const VIDEO_JOB_MAX_ATTEMPTS = 3;

/** Up to 3 backoff retries for temp-file cleanup (Req 18.6, 20.7). */
export const VIDEO_CLEANUP_MAX_RETRIES = 3;

/** Identity of the work item a job operates on — used to derive the job id. */
export interface VideoJobIdParts {
  projectId: string;
  versionId: string;
  opId: string;
}

/**
 * Shared job payload shape. Concrete workers narrow `payload` in later tasks;
 * the routing/enqueue layer only needs the identity + ownership fields here.
 */
export interface VideoJobData extends VideoJobIdParts {
  type: VideoJobType;
  workspaceId: string;
  userId: string;
  /** Mirrors the metering idempotency key (Req 18.3, 18.7). */
  idempotencyKey?: string;
  payload?: unknown;
}

// ---------------------------------------------------------------------------
// Deterministic job id (Req 18.7)
// ---------------------------------------------------------------------------

/**
 * Build the deterministic BullMQ job id: `ve-{type}-{projectId}-{versionId}-{opId}`.
 * Because the id is a pure function of the work identity, concurrent submissions
 * de-duplicate and re-deliveries reuse the same reservation instead of charging
 * or producing artifacts twice.
 */
export function videoEditorJobId(type: VideoJobType, parts: VideoJobIdParts): string {
  return `ve-${type}-${parts.projectId}-${parts.versionId}-${parts.opId}`;
}

// ---------------------------------------------------------------------------
// Queue construction (null-when-Redis-absent pattern)
// ---------------------------------------------------------------------------

const redisConnection = getSharedRedisConnection();

/** Merge per-queue job options onto shared removeOnComplete/removeOnFail caps. */
function buildQueueOptions(jobOptions: JobsOptions): QueueOptions {
  return redisConnection
    ? {
        connection: redisConnection,
        defaultJobOptions: {
          removeOnComplete: 50,
          removeOnFail: 50,
          ...jobOptions,
        },
      }
    : ({} as any);
}

export const videoAnalysisQueue = redisConnection
  ? new Queue<VideoJobData>(
      VIDEO_QUEUE_NAMES.analysis,
      buildQueueOptions({
        attempts: VIDEO_JOB_MAX_ATTEMPTS,
        backoff: { type: 'exponential', delay: 5000 },
      }),
    )
  : null;

export const videoGenerationQueue = redisConnection
  ? new Queue<VideoJobData>(
      VIDEO_QUEUE_NAMES.generation,
      // Single attempt — paid provider calls; retries would multiply cost.
      // The QC-driven repair loop decides any re-generation deliberately.
      buildQueueOptions({ attempts: 1 }),
    )
  : null;

export const videoRenderQueue = redisConnection
  ? new Queue<VideoJobData>(
      VIDEO_QUEUE_NAMES.render,
      buildQueueOptions({
        attempts: VIDEO_JOB_MAX_ATTEMPTS,
        backoff: { type: 'exponential', delay: 5000 },
      }),
    )
  : null;

export const videoQcQueue = redisConnection
  ? new Queue<VideoJobData>(
      VIDEO_QUEUE_NAMES.qc,
      buildQueueOptions({
        attempts: VIDEO_JOB_MAX_ATTEMPTS,
        backoff: { type: 'exponential', delay: 3000 },
      }),
    )
  : null;

export const videoCleanupQueue = redisConnection
  ? new Queue<VideoJobData>(
      VIDEO_QUEUE_NAMES.cleanup,
      // 1 initial attempt + up to 3 backoff retries (Req 18.6, 20.7).
      buildQueueOptions({
        attempts: 1 + VIDEO_CLEANUP_MAX_RETRIES,
        backoff: { type: 'exponential', delay: 2000 },
      }),
    )
  : null;

/** Map a logical job type to its queue instance (or null when Redis absent). */
function queueForType(type: VideoJobType): Queue<VideoJobData> | null {
  switch (type) {
    case 'analysis':
      return videoAnalysisQueue;
    case 'generation':
      return videoGenerationQueue;
    case 'render':
      return videoRenderQueue;
    case 'qc':
      return videoQcQueue;
    case 'cleanup':
      return videoCleanupQueue;
    default:
      return null;
  }
}

/** True only when Redis is present AND the shared connection is ready. */
export function isVideoQueueAvailable(): boolean {
  return !!redisConnection && redisConnection.status === 'ready';
}

// ---------------------------------------------------------------------------
// Enqueue manager
// ---------------------------------------------------------------------------

export class VideoEditorQueueManager {
  /**
   * Enqueue a video pipeline job with a deterministic id (Req 18.1, 18.7).
   * Lazily boots the matching worker on first use (mirrors `aiQueue`).
   *
   * @returns the job id when enqueued, or `null` if Redis/worker is unavailable.
   */
  static async enqueue(
    type: VideoJobType,
    data: Omit<VideoJobData, 'type'>,
    extraJobOptions: JobsOptions = {},
  ): Promise<string | null> {
    const queue = queueForType(type);
    if (!queue || !isVideoQueueAvailable()) return null;

    // Trigger lazy worker initialisation on first job (dynamic import so the
    // worker module is never loaded when the queue is unused).
    try {
      const workers = await import('../workers/videoEditorWorkers');
      const worker = workers.getVideoWorker(type);
      if (!worker) {
        console.warn(`⚠️ [VideoEditorQueue] ${VIDEO_QUEUE_NAMES[type]} worker could not be initialized`);
        return null;
      }
    } catch (e) {
      console.warn(
        `[VideoEditorQueue] Failed to init ${VIDEO_QUEUE_NAMES[type]} worker:`,
        (e as Error).message,
      );
      return null;
    }

    const jobId = videoEditorJobId(type, data);
    const jobData: VideoJobData = { type, ...data };

    try {
      const job = await queue.add(type, jobData, { jobId, ...extraJobOptions });
      return job.id || jobId;
    } catch (error) {
      console.error(
        `🚨 [VideoEditorQueue] Failed to enqueue ${VIDEO_QUEUE_NAMES[type]} job ${jobId}:`,
        (error as Error).message,
      );
      return null;
    }
  }
}
