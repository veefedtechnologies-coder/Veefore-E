import { Worker, Job } from 'bullmq';
import { getSharedRedisConnection } from '../lib/redis';
import {
  VIDEO_QUEUE_NAMES,
  type VideoJobData,
  type VideoJobType,
} from '../queues/videoEditorQueues';

/**
 * Veefore AI Video Editor — lazily-initialised BullMQ workers (Task 4.3).
 *
 * These mirror the `aiWorker` / `researchWorker` convention: each worker is a
 * module-level singleton created on first use via a `getWorker()` function, and
 * returns `null` when Redis is unavailable so the whole feature degrades
 * gracefully instead of crashing.
 *
 * The `video-analysis` worker runs the real analysis pipeline (Task 8.5) via
 * `processVideoAnalysisJob`, the `video-generation` worker runs the real
 * Generative_Editor pipeline (Task 17.8) via `runGenerativeEditJob`, the
 * `video-render` / `video-qc` workers run the real Render_Engine +
 * Quality_Controller pipeline (Task 14.5) via `runRenderJob` / `runQcJob`, and
 * the `video-cleanup` worker runs the real temp-file cleanup (Task 21.3) via
 * `runTempFileCleanupJob`, removing a job's temporary working files with bounded
 * retries (Req 20.5–20.7). Per the No-Mock rule every processor performs real
 * work and surfaces the true outcome rather than fabricating success.
 */

let analysisWorker: Worker<VideoJobData> | null = null;
let generationWorker: Worker<VideoJobData> | null = null;
let renderWorker: Worker<VideoJobData> | null = null;
let qcWorker: Worker<VideoJobData> | null = null;
let cleanupWorker: Worker<VideoJobData> | null = null;

/**
 * Real `video-generation` processor (Task 17.8, Req 18.1). Runs the
 * Generative_Editor pipeline asynchronously for the enqueued job: it reads the
 * serialized generative-edit context from the job's `payload` and delegates to
 * `runGenerativeEditJob`, which reconstructs the request, drives the job state
 * machine, and settles the job. The heavy dependency graph (FFmpeg, storage,
 * metering, Mongoose) is imported lazily on first job so the worker module stays
 * cheap to load.
 */
function generativeEditProcessor() {
  return async (job: Job<VideoJobData>): Promise<unknown> => {
    const { runGenerativeEditJob, createGenerativeEditWorkerDeps } = await import(
      '../features/video-editor/services/generative-edit-worker'
    );
    const deps = await createGenerativeEditWorkerDeps();
    return runGenerativeEditJob(job.data?.payload, deps);
  };
}

function attachLifecycleLogging(worker: Worker<VideoJobData>, queueName: string): void {
  worker.on('failed', (job, err) => {
    console.error(`[VideoEditor:${queueName}] Job failed:`, job?.id, err?.message);
  });
}

export function getVideoAnalysisWorker(): Worker<VideoJobData> | null {
  if (analysisWorker) return analysisWorker;
  const connection = getSharedRedisConnection();
  if (!connection) {
    console.warn('⚠️ Redis unavailable, video-analysis worker cannot be initialized');
    return null;
  }
  console.log('🎬 Lazy-initializing video-analysis worker on first use...');
  analysisWorker = new Worker<VideoJobData>(
    VIDEO_QUEUE_NAMES.analysis,
    // Real analysis pipeline (task 8.5). The processor is imported dynamically so
    // the heavy analysis service (FFmpeg/provider transport) is only loaded when
    // the queue actually runs a job, keeping module init light.
    async (job) => {
      const { processVideoAnalysisJob } = await import(
        '../features/video-editor/services/video-analysis.worker'
      );
      return processVideoAnalysisJob(job);
    },
    { connection, concurrency: 2 },
  );
  attachLifecycleLogging(analysisWorker, VIDEO_QUEUE_NAMES.analysis);
  return analysisWorker;
}

export function getVideoGenerationWorker(): Worker<VideoJobData> | null {
  if (generationWorker) return generationWorker;
  const connection = getSharedRedisConnection();
  if (!connection) {
    console.warn('⚠️ Redis unavailable, video-generation worker cannot be initialized');
    return null;
  }
  console.log('🎬 Lazy-initializing video-generation worker on first use...');
  generationWorker = new Worker<VideoJobData>(
    VIDEO_QUEUE_NAMES.generation,
    generativeEditProcessor(),
    { connection, concurrency: 1 },
  );
  attachLifecycleLogging(generationWorker, VIDEO_QUEUE_NAMES.generation);
  return generationWorker;
}

export function getVideoRenderWorker(): Worker<VideoJobData> | null {
  if (renderWorker) return renderWorker;
  const connection = getSharedRedisConnection();
  if (!connection) {
    console.warn('⚠️ Redis unavailable, video-render worker cannot be initialized');
    return null;
  }
  console.log('🎬 Lazy-initializing video-render worker on first use...');
  renderWorker = new Worker<VideoJobData>(
    VIDEO_QUEUE_NAMES.render,
    // Real render pipeline (task 14.5). Imported dynamically so the FFmpeg/storage
    // dependency graph only loads when the queue actually runs a job.
    async (job) => {
      const { runRenderJob } = await import(
        '../features/video-editor/services/render-qc.worker'
      );
      return runRenderJob(job);
    },
    { connection, concurrency: 1 },
  );
  attachLifecycleLogging(renderWorker, VIDEO_QUEUE_NAMES.render);
  return renderWorker;
}

export function getVideoQcWorker(): Worker<VideoJobData> | null {
  if (qcWorker) return qcWorker;
  const connection = getSharedRedisConnection();
  if (!connection) {
    console.warn('⚠️ Redis unavailable, video-qc worker cannot be initialized');
    return null;
  }
  console.log('🎬 Lazy-initializing video-qc worker on first use...');
  qcWorker = new Worker<VideoJobData>(
    VIDEO_QUEUE_NAMES.qc,
    // Real quality-control pipeline + bounded repair loop (task 14.5). Imported
    // dynamically so the FFmpeg/storage dependency graph only loads on first job.
    async (job) => {
      const { runQcJob } = await import(
        '../features/video-editor/services/render-qc.worker'
      );
      return runQcJob(job);
    },
    { connection, concurrency: 2 },
  );
  attachLifecycleLogging(qcWorker, VIDEO_QUEUE_NAMES.qc);
  return qcWorker;
}

export function getVideoCleanupWorker(): Worker<VideoJobData> | null {
  if (cleanupWorker) return cleanupWorker;
  const connection = getSharedRedisConnection();
  if (!connection) {
    console.warn('⚠️ Redis unavailable, video-cleanup worker cannot be initialized');
    return null;
  }
  console.log('🎬 Lazy-initializing video-cleanup worker on first use...');
  cleanupWorker = new Worker<VideoJobData>(
    VIDEO_QUEUE_NAMES.cleanup,
    // Real temp-file cleanup (task 21.3, Req 20.5–20.7). Imported dynamically so
    // the fs/logging dependency graph only loads when the queue runs a job.
    async (job) => {
      const { runTempFileCleanupJob } = await import(
        '../features/video-editor/services/temp-file-cleanup.worker'
      );
      return runTempFileCleanupJob(job);
    },
    { connection, concurrency: 2 },
  );
  attachLifecycleLogging(cleanupWorker, VIDEO_QUEUE_NAMES.cleanup);
  return cleanupWorker;
}

/** Resolve the lazy worker for a given logical job type. */
export function getVideoWorker(type: VideoJobType): Worker<VideoJobData> | null {
  switch (type) {
    case 'analysis':
      return getVideoAnalysisWorker();
    case 'generation':
      return getVideoGenerationWorker();
    case 'render':
      return getVideoRenderWorker();
    case 'qc':
      return getVideoQcWorker();
    case 'cleanup':
      return getVideoCleanupWorker();
    default:
      return null;
  }
}
