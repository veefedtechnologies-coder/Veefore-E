/**
 * `video-analysis` queue processor (task 8.5).
 *
 * The Job_System enqueues a `video-analysis` job when the analyze endpoint is
 * hit (Req 18.1, 21.4); the lazily-initialised `videoAnalysisWorker` (see
 * `server/workers/videoEditorWorkers.ts`) delegates each job to this processor.
 * It is a thin shell over {@link VideoAnalysisService.analyze}: the analysis
 * service owns the full pipeline (deterministic scene detection before AI
 * enrichment, completion gating, immutable-artifact persistence, idempotent
 * reuse, and stage-derived progress bookkeeping on the `Video_Edit_Job`).
 *
 * The processor is exported as a plain function taking injectable dependencies
 * so it can be unit-tested without Redis or BullMQ. Per the No-Mock rule it
 * never fabricates a result: it runs the real analysis and surfaces its outcome,
 * throwing on a missing source id or a hard analysis failure so BullMQ's bounded
 * retry policy applies (Req 18.7).
 */

import type { Job } from 'bullmq';

import { logger as defaultLogger } from '../../../config/logger';
import type { VideoJobData } from '../../../queues/videoEditorQueues';
import {
  getVideoAnalysisService,
  type AnalyzeResult,
  type VideoAnalysisService,
} from './video-analysis.service';

const COMPONENT = 'videoEditor.VideoAnalysisWorker';

/** Injectable dependencies (production defaults, overridable for tests). */
export interface VideoAnalysisWorkerDeps {
  service?: Pick<VideoAnalysisService, 'analyze'>;
  logger?: Pick<typeof defaultLogger, 'info' | 'warn' | 'error'>;
}

/** The result reported back to BullMQ for an analysis job. */
export interface VideoAnalysisJobResult {
  sourceId: string;
  /** The persisted analysis artifactId when completed (Req 4.8); null otherwise. */
  artifactId: string | null;
  /** True only when every analysis stage completed (Req 4.7). */
  completed: boolean;
  /** True when an existing completed analysis was reused (Req 4.9). */
  reused: boolean;
}

/**
 * Resolve the `Video_Source` id an analysis job targets. The analyze endpoint
 * carries it in `payload.sourceId`; the deterministic job id also encodes it in
 * the `versionId` segment, so that is used as a fallback. Returns null when no
 * source id can be determined.
 */
export function resolveAnalysisSourceId(data: VideoJobData): string | null {
  const payloadSourceId = (data?.payload as { sourceId?: unknown } | undefined)?.sourceId;
  if (typeof payloadSourceId === 'string' && payloadSourceId.trim().length > 0) {
    return payloadSourceId.trim();
  }
  if (typeof data?.versionId === 'string' && data.versionId.trim().length > 0) {
    return data.versionId.trim();
  }
  return null;
}

/**
 * Process a single `video-analysis` job by running the real analysis pipeline
 * for its source. Delegates all correctness (ordering, completion, reuse,
 * failure handling, progress) to {@link VideoAnalysisService.analyze}.
 */
export async function processVideoAnalysisJob(
  job: Pick<Job<VideoJobData>, 'id' | 'data'>,
  deps: VideoAnalysisWorkerDeps = {},
): Promise<VideoAnalysisJobResult> {
  const log = deps.logger ?? defaultLogger;
  const service = deps.service ?? getVideoAnalysisService();

  const sourceId = resolveAnalysisSourceId(job.data);
  if (!sourceId) {
    // No source to analyze — fail loudly rather than fabricate a result.
    throw new Error(`[VideoEditor] video-analysis job ${job.id} is missing a source id`);
  }

  log.info('Video analysis job started', {
    component: COMPONENT,
    jobId: job.id,
    projectId: job.data?.projectId,
    sourceId,
  });

  const result: AnalyzeResult = await service.analyze(sourceId);

  log.info('Video analysis job finished', {
    component: COMPONENT,
    jobId: job.id,
    sourceId,
    completed: result.analysis.completed,
    reused: result.reused,
    artifactId: result.artifactId,
  });

  return {
    sourceId,
    artifactId: result.artifactId,
    completed: result.analysis.completed,
    reused: result.reused,
  };
}
