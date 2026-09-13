/**
 * `video-cleanup` queue processor (task 21.3, Req 20.5, 20.6, 20.7).
 *
 * A `Video_Edit_Job`'s heavy stages (ingestion, deterministic editing, render,
 * QC, generative editing) run FFmpeg over per-job TEMPORARY working files in an
 * OS temp directory. Those files must be removed within 60 seconds of the job
 * reaching a terminal state (succeeded / failed, Req 20.5) or exceeding its
 * timeout (Req 20.6). The happy path removes them inline in each service's
 * `finally` block; when that inline removal FAILS, the failure is deferred to
 * this `video-cleanup` queue so removal is retried up to 3 additional times with
 * exponential backoff (Req 20.7). If every attempt fails, this processor records
 * an error naming the paths that could not be removed (Req 20.7).
 *
 * The BullMQ queue is configured with `attempts: 1 + VIDEO_CLEANUP_MAX_RETRIES`
 * (`videoEditorQueues.ts`), so throwing on a failed removal drives the bounded
 * retry policy. Removal is IDEMPOTENT: `fs.rm(..., { force: true })` silently
 * ignores paths that are already gone, so a retry that runs after a partial
 * success (or after the inline cleanup eventually succeeded) is safe and never
 * fabricates a failure.
 *
 * Per the No-Mock rule the processor performs real filesystem removal and
 * surfaces the true outcome — it never reports fake success.
 */

import fs from 'fs';

import type { Job } from 'bullmq';

import { logger as defaultLogger } from '../../../config/logger';
import type { VideoJobData } from '../../../queues/videoEditorQueues';
import {
  VIDEO_CLEANUP_MAX_RETRIES,
  VideoEditorQueueManager,
} from '../../../queues/videoEditorQueues';

const COMPONENT = 'videoEditor.CleanupWorker';

/** Error code recorded when a job's temp files cannot be removed (Req 20.7). */
export const TEMP_CLEANUP_FAILED = 'VIDEO_TEMP_CLEANUP_FAILED';

/**
 * The `video-cleanup` job payload. `tempFilePaths` are absolute paths to the
 * per-job temporary files/directories to remove; `reason` is a short label for
 * observability (e.g. `'cancel-cleanup'`, `'render-cleanup'`).
 */
export interface TempFileCleanupPayload {
  tempFilePaths: string[];
  reason?: string;
}

/** One path that could not be removed, with the failure message. */
export interface TempCleanupFailure {
  path: string;
  error: string;
}

/** The outcome of a single removal pass over the requested paths. */
export interface TempCleanupResult {
  /** Paths that were removed (or were already absent). */
  removed: string[];
  /** Paths that could not be removed on this pass. */
  failed: TempCleanupFailure[];
}

/** Injectable dependencies for the cleanup processor (production defaults). */
export interface TempFileCleanupDeps {
  logger?: Pick<typeof defaultLogger, 'info' | 'warn' | 'error'>;
  /**
   * Remove a single path recursively. Injectable for tests; the default uses
   * `fs.promises.rm(path, { recursive: true, force: true })`, which is
   * idempotent (no error when the path is already gone).
   */
  removePath?: (path: string) => Promise<void>;
}

/** Default recursive, idempotent removal of a single path. */
async function defaultRemovePath(target: string): Promise<void> {
  await fs.promises.rm(target, { recursive: true, force: true });
}

/** Identity + paths for a deferred temp-file cleanup enqueued on failure. */
export interface EnqueueTempCleanupInput {
  projectId: string;
  versionId: string;
  opId: string;
  workspaceId: string;
  userId: string;
  tempFilePaths: string[];
  /** Short label for observability (e.g. `'render-cleanup'`). */
  reason?: string;
}

/**
 * Enqueue a deferred temp-file cleanup on the `video-cleanup` queue so a failed
 * inline removal is retried up to `VIDEO_CLEANUP_MAX_RETRIES` times with backoff
 * (Req 20.7). Returns the BullMQ job id, or `null` when the queue is unavailable
 * (Redis absent) so callers can degrade gracefully. Enqueuing is best-effort and
 * never throws — a scheduling failure is reported to the caller as `null`.
 */
export async function enqueueTempFileCleanup(
  input: EnqueueTempCleanupInput,
): Promise<string | null> {
  if (input.tempFilePaths.length === 0) return null;
  try {
    return await VideoEditorQueueManager.enqueue('cleanup', {
      projectId: input.projectId,
      versionId: input.versionId,
      opId: input.opId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      payload: {
        tempFilePaths: input.tempFilePaths,
        reason: input.reason ?? 'deferred-cleanup',
      },
    });
  } catch {
    return null;
  }
}

/**
 * Narrow a job's payload to a {@link TempFileCleanupPayload}, throwing when it
 * is malformed so BullMQ's bounded retry policy applies (Req 18.7). An empty
 * `tempFilePaths` array is valid (a no-op cleanup).
 */
export function toTempFileCleanupPayload(data: VideoJobData): TempFileCleanupPayload {
  const payload = data?.payload as Partial<TempFileCleanupPayload> | undefined;
  if (!payload || !Array.isArray(payload.tempFilePaths)) {
    throw new Error(
      '[VideoEditor] video-cleanup job payload is missing tempFilePaths (string[])',
    );
  }
  const tempFilePaths = payload.tempFilePaths.filter(
    (p): p is string => typeof p === 'string' && p.length > 0,
  );
  return {
    tempFilePaths,
    ...(typeof payload.reason === 'string' ? { reason: payload.reason } : {}),
  };
}

/**
 * Remove every requested path, collecting per-path failures rather than
 * short-circuiting — a single stubborn path must not prevent the others from
 * being cleaned. Removal is idempotent, so an already-removed path counts as
 * removed.
 */
export async function removeTempPaths(
  paths: readonly string[],
  deps: TempFileCleanupDeps = {},
): Promise<TempCleanupResult> {
  const remove = deps.removePath ?? defaultRemovePath;
  const removed: string[] = [];
  const failed: TempCleanupFailure[] = [];

  await Promise.all(
    paths.map(async (p) => {
      try {
        await remove(p);
        removed.push(p);
      } catch (error) {
        failed.push({ path: p, error: error instanceof Error ? error.message : String(error) });
      }
    }),
  );

  return { removed, failed };
}

/**
 * Process a single `video-cleanup` job (Req 20.5, 20.6, 20.7). Removes the job's
 * temporary working files and:
 *
 *   - resolves cleanly when every path is removed (or was already gone);
 *   - throws when some paths remain AND retries are still available, so BullMQ
 *     re-runs the job with exponential backoff (bounded to
 *     `VIDEO_CLEANUP_MAX_RETRIES` additional attempts);
 *   - on the FINAL attempt, records an error naming the paths that could not be
 *     removed (Req 20.7) and throws so the job is marked failed with that error.
 */
export async function runTempFileCleanupJob(
  job: Pick<Job<VideoJobData>, 'id' | 'data' | 'attemptsMade' | 'opts'>,
  deps: TempFileCleanupDeps = {},
): Promise<TempCleanupResult> {
  const log = deps.logger ?? defaultLogger;
  const jobId = (job.id as string) ?? '';
  const payload = toTempFileCleanupPayload(job.data);

  if (payload.tempFilePaths.length === 0) {
    log.info('Video temp-file cleanup: nothing to remove', {
      component: COMPONENT,
      jobId,
      reason: payload.reason,
    });
    return { removed: [], failed: [] };
  }

  const result = await removeTempPaths(payload.tempFilePaths, deps);

  if (result.failed.length === 0) {
    log.info('Video temp-file cleanup succeeded', {
      component: COMPONENT,
      jobId,
      reason: payload.reason,
      removedCount: result.removed.length,
    });
    return result;
  }

  // Some paths remain. Determine whether another retry is available: BullMQ
  // increments `attemptsMade` as attempts complete, and the queue caps total
  // attempts at `1 + VIDEO_CLEANUP_MAX_RETRIES` (Req 20.7).
  const maxAttempts = job.opts?.attempts ?? 1 + VIDEO_CLEANUP_MAX_RETRIES;
  const attemptsMade = typeof job.attemptsMade === 'number' ? job.attemptsMade : 0;
  const isFinalAttempt = attemptsMade + 1 >= maxAttempts;
  const failedPaths = result.failed.map((f) => f.path);

  if (isFinalAttempt) {
    // All attempts exhausted → record a persistent error naming the paths that
    // could not be removed (Req 20.7). Throwing marks the BullMQ job failed with
    // this recorded reason; the immutable source/artifacts are untouched.
    log.error('Video temp-file cleanup failed after all attempts', undefined, {
      component: COMPONENT,
      jobId,
      errorCode: TEMP_CLEANUP_FAILED,
      reason: payload.reason,
      failedPaths,
      failures: result.failed,
    });
    throw new Error(
      `[VideoEditor] ${TEMP_CLEANUP_FAILED}: could not remove temp files after ` +
        `${maxAttempts} attempts: ${failedPaths.join(', ')}`,
    );
  }

  // Retries remain → throw so BullMQ re-runs with backoff (Req 20.7).
  log.warn('Video temp-file cleanup incomplete; will retry', {
    component: COMPONENT,
    jobId,
    reason: payload.reason,
    attempt: attemptsMade + 1,
    maxAttempts,
    failedPaths,
  });
  throw new Error(
    `[VideoEditor] video-cleanup incomplete (attempt ${attemptsMade + 1}/${maxAttempts}); ` +
      `remaining: ${failedPaths.join(', ')}`,
  );
}
