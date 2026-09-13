/**
 * `video-render` and `video-qc` queue processors (task 14.5, Req 15.1, 14.1–14.7,
 * 18.1).
 *
 * The Job_System enqueues a `video-render` job to render a version's
 * authoritative timeline, and a `video-qc` job to run the deeper frame/audio
 * quality gate on the rendered artifact. The lazily-initialised
 * `videoRenderWorker` / `videoQcWorker` (see `server/workers/videoEditorWorkers.ts`)
 * delegate each job to the processors here.
 *
 * These are thin shells over the Render_Engine and Quality_Controller
 * coordinators (`processRenderJob` / `processQcJob` in
 * `quality-controller.service.ts`): the render coordinator renders + validates +
 * settles the render job, and the QC coordinator inspects the rendered output and
 * drives the bounded repair loop, reverting to the prior valid version on
 * exhaustion and NEVER marking a corrupted output as successful (Req 14.7).
 *
 * Per the No-Mock rule the processors never fabricate a result: they run the real
 * render/QC and surface the outcome, throwing on a malformed payload so BullMQ's
 * bounded retry policy applies (Req 18.7).
 */

import type { Job } from 'bullmq';

import { logger as defaultLogger } from '../../../config/logger';
import type { VideoJobData } from '../../../queues/videoEditorQueues';
import {
  processRenderJob,
  processQcJob,
  type RenderJobPayload,
  type QcJobPayload,
} from './quality-controller.service';
import type { RenderResult } from './render-engine.service';
import type { RunRepairLoopResult } from './quality-controller.service';

const RENDER_COMPONENT = 'videoEditor.RenderWorker';
const QC_COMPONENT = 'videoEditor.QcWorker';

/** Injectable dependencies for the render processor (production defaults). */
export interface RenderWorkerDeps {
  logger?: Pick<typeof defaultLogger, 'info' | 'warn' | 'error'>;
}

/** Injectable dependencies for the QC processor (production defaults). */
export interface QcWorkerDeps {
  logger?: Pick<typeof defaultLogger, 'info' | 'warn' | 'error'>;
}

/** Narrow a job's payload to a {@link RenderJobPayload}, throwing when malformed. */
export function toRenderPayload(data: VideoJobData): RenderJobPayload {
  const payload = data?.payload as Partial<RenderJobPayload> | undefined;
  if (
    !payload ||
    typeof payload.inputVersionId !== 'string' ||
    typeof payload.exportProfileId !== 'string' ||
    !payload.timeline ||
    !Array.isArray((payload.timeline as { elements?: unknown }).elements)
  ) {
    throw new Error('[VideoEditor] video-render job payload is missing inputVersionId/exportProfileId/timeline');
  }
  return payload as RenderJobPayload;
}

/** Narrow a job's payload to a {@link QcJobPayload}, throwing when malformed. */
export function toQcPayload(data: VideoJobData): QcJobPayload {
  const payload = data?.payload as Partial<QcJobPayload> | undefined;
  if (
    !payload ||
    typeof payload.artifactId !== 'string' ||
    typeof payload.exportProfileId !== 'string' ||
    typeof payload.expectedDurationMs !== 'number'
  ) {
    throw new Error('[VideoEditor] video-qc job payload is missing artifactId/exportProfileId/expectedDurationMs');
  }
  return payload as QcJobPayload;
}

/**
 * Process a single `video-render` job (Req 15.1, 18.1). Reconstructs the render
 * request from the job identity + payload and delegates to the Render_Engine
 * coordinator, which renders + render-validates + settles the render job.
 */
export async function runRenderJob(
  job: Pick<Job<VideoJobData>, 'id' | 'data'>,
  deps: RenderWorkerDeps = {},
): Promise<RenderResult> {
  const log = deps.logger ?? defaultLogger;
  const data = job.data;
  const payload = toRenderPayload(data);
  const jobId = (job.id as string) ?? '';

  log.info('Video render job started', {
    component: RENDER_COMPONENT,
    jobId,
    projectId: data?.projectId,
    versionId: data?.versionId,
    exportProfileId: payload.exportProfileId,
  });

  const result = await processRenderJob({
    jobId,
    projectId: data.projectId,
    workspaceId: data.workspaceId,
    userId: data.userId,
    versionId: data.versionId,
    payload,
  });

  log.info('Video render job finished', {
    component: RENDER_COMPONENT,
    jobId,
    ok: result.ok,
    jobState: result.jobState,
  });
  return result;
}

/**
 * Process a single `video-qc` job (Req 14.1–14.7, 18.1). Inspects the rendered
 * artifact and drives the bounded repair loop via the Quality_Controller
 * coordinator, which reverts to the prior valid version on exhaustion and never
 * marks a corrupted output as successful.
 */
export async function runQcJob(
  job: Pick<Job<VideoJobData>, 'id' | 'data'>,
  deps: QcWorkerDeps = {},
): Promise<RunRepairLoopResult> {
  const log = deps.logger ?? defaultLogger;
  const data = job.data;
  const payload = toQcPayload(data);
  const jobId = (job.id as string) ?? '';

  log.info('Video QC job started', {
    component: QC_COMPONENT,
    jobId,
    projectId: data?.projectId,
    versionId: data?.versionId,
    artifactId: payload.artifactId,
  });

  const result = await processQcJob({
    jobId,
    projectId: data.projectId,
    workspaceId: data.workspaceId,
    userId: data.userId,
    versionId: data.versionId,
    payload,
  });

  log.info('Video QC job finished', {
    component: QC_COMPONENT,
    jobId,
    status: result.status,
    repairAttemptsUsed: result.repairAttemptsUsed,
  });
  return result;
}
