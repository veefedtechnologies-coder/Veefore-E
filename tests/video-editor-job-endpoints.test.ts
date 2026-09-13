/**
 * Unit + integration tests for the Video_Edit_Job status/cancel/progress-stream
 * endpoints (task 20.2, Req 18.4, 18.5, 23.2, 23.6).
 *
 * Framework: vitest + supertest.
 *
 * Covers (design.md "Job_System", Req 18.4/18.5, 23.2/23.6, 19.1/19.2/19.5):
 *  - GET  /jobs/:jobId            — stage-derived status/progress, never a stored
 *                                   or interpolated value; terminal jobs report
 *                                   their frozen stage-derived value (100 only for
 *                                   COMPLETED).
 *  - GET  /jobs/:jobId/stream     — NDJSON progress stream that emits stage-derived
 *                                   progress events and closes on a terminal state.
 *  - POST /jobs/:jobId/cancel     — delegates to `JobSystemService.cancelJob`;
 *                                   already-terminal jobs are a no-op.
 *  - Ownership is enforced on every route from the job's server-side
 *    workspaceId/userId: a non-owner is denied 403 with NO job data and cancelJob
 *    is never invoked (Req 19.1, 19.2, 19.5); an unknown job is 404.
 *
 * The auth + workspace middleware are stubbed so identity is driven by headers;
 * the job store (`getJobStatus`) and the Job_System (`getJobSystem`) are injected
 * in-memory (no DB, Redis, or provider), exercising the router's real ownership,
 * progress-derivation, and delegation logic.
 */

import { describe, it, expect, vi } from 'vitest';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

// Stub auth: set req.user.id from a test header (server-derived identity, Req 19.5).
vi.mock('../server/middleware/require-auth', () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    const userId = req.header('x-test-user');
    if (userId) (req as Request & { user?: unknown }).user = { id: userId };
    next();
  },
}));

// Stub workspace access: set req.workspaceId from a test header.
vi.mock('../server/middleware/workspace-validation', () => ({
  validateWorkspaceAccess:
    () => (req: Request, _res: Response, next: NextFunction) => {
      const workspaceId = req.header('x-test-workspace');
      if (workspaceId) (req as Request & { workspaceId?: unknown }).workspaceId = workspaceId;
      next();
    },
}));

import {
  createVideoEditorProjectRouter,
  type VideoEditorRouterDeps,
  type JobStatusRecord,
} from '../server/features/video-editor/api/project.routes';
import type { CancelResult } from '../server/features/video-editor/services/job-system.service';
import type { JobState } from '../server/features/video-editor/services/job-state.logic';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OWNER = { userId: 'user-1', workspaceId: 'ws-1' };
const JOB_ID = 've-generation-proj-1-v1-op-1';

function job(overrides: Partial<JobStatusRecord> = {}): JobStatusRecord {
  return {
    jobId: JOB_ID,
    projectId: 'proj-1',
    workspaceId: OWNER.workspaceId,
    userId: OWNER.userId,
    state: 'ANALYZING' as JobState,
    attempt: 1,
    timeoutSec: 3600,
    completedStages: ['PREPARING', 'UPLOADING'],
    inputArtifactIds: ['art-in-1'],
    outputArtifactIds: [],
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:05Z'),
    ...overrides,
  };
}

function makeApp(deps: VideoEditorRouterDeps): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/video-editor', createVideoEditorProjectRouter(deps));
  return app;
}

function asOwner(req: request.Test): request.Test {
  return req.set('x-test-user', OWNER.userId).set('x-test-workspace', OWNER.workspaceId);
}

/** A JobSystem stub exposing only `cancelJob` (the surface the cancel route uses). */
function makeJobSystem(result: CancelResult) {
  const cancelJob = vi.fn(async () => result);
  const getJobSystem = async () => ({ cancelJob }) as never;
  return { getJobSystem, cancelJob };
}

// ---------------------------------------------------------------------------
// GET /jobs/:jobId — stage-derived status/progress (Req 18.4, 23.2)
// ---------------------------------------------------------------------------

describe('GET /jobs/:jobId (task 20.2)', () => {
  it('returns a job status with progress DERIVED from completed stages (Req 18.4)', async () => {
    // 2 of 7 pipeline stages complete → floor(2/7*100) = 28.
    const getJobStatus = vi.fn(async () => job({ completedStages: ['PREPARING', 'UPLOADING'] }));
    const app = makeApp({ getJobStatus });

    const res = await asOwner(request(app).get(`/api/video-editor/jobs/${JOB_ID}`));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.jobId).toBe(JOB_ID);
    expect(res.body.data.state).toBe('ANALYZING');
    expect(res.body.data.terminal).toBe(false);
    expect(res.body.data.determinate).toBe(true);
    expect(res.body.data.progress).toBe(28);
    expect(res.body.data.completedStages).toEqual(['PREPARING', 'UPLOADING']);
    expect(res.body.data.totalStages).toBe(7);
  });

  it('never reports 100% while the job is not COMPLETED, even with all stages counted (Req 23.2)', async () => {
    const allSeven = ['PREPARING', 'UPLOADING', 'ANALYZING', 'PLANNING', 'EDITING', 'RENDERING', 'QUALITY_CHECK'];
    const getJobStatus = vi.fn(async () => job({ state: 'QUALITY_CHECK', completedStages: allSeven }));
    const app = makeApp({ getJobStatus });

    const res = await asOwner(request(app).get(`/api/video-editor/jobs/${JOB_ID}`));

    expect(res.status).toBe(200);
    expect(res.body.data.progress).toBe(99);
    expect(res.body.data.terminal).toBe(false);
  });

  it('reports 100% ONLY for a COMPLETED job (Req 18.4)', async () => {
    const getJobStatus = vi.fn(async () => job({ state: 'COMPLETED', completedStages: ['PREPARING', 'UPLOADING'], outputArtifactIds: ['art-out-1'] }));
    const app = makeApp({ getJobStatus });

    const res = await asOwner(request(app).get(`/api/video-editor/jobs/${JOB_ID}`));

    expect(res.status).toBe(200);
    expect(res.body.data.progress).toBe(100);
    expect(res.body.data.terminal).toBe(true);
    expect(res.body.data.outputArtifactIds).toEqual(['art-out-1']);
  });

  it('reports a FAILED job frozen at its stage-derived value with its error code', async () => {
    const getJobStatus = vi.fn(async () => job({ state: 'FAILED', completedStages: ['PREPARING'], errorCode: 'JOB_TIMEOUT' }));
    const app = makeApp({ getJobStatus });

    const res = await asOwner(request(app).get(`/api/video-editor/jobs/${JOB_ID}`));

    expect(res.status).toBe(200);
    // 1 of 7 stages → floor(1/7*100) = 14, frozen at termination.
    expect(res.body.data.progress).toBe(14);
    expect(res.body.data.terminal).toBe(true);
    expect(res.body.data.errorCode).toBe('JOB_TIMEOUT');
  });

  it('returns 404 for an unknown job', async () => {
    const getJobStatus = vi.fn(async () => null);
    const app = makeApp({ getJobStatus });

    const res = await asOwner(request(app).get(`/api/video-editor/jobs/ghost`));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('JOB_NOT_FOUND');
  });

  it('denies a non-owner with 403 and NO job data (Req 19.1, 19.2)', async () => {
    const getJobStatus = vi.fn(async () => job());
    const app = makeApp({ getJobStatus });

    const res = await request(app)
      .get(`/api/video-editor/jobs/${JOB_ID}`)
      .set('x-test-user', OWNER.userId)
      .set('x-test-workspace', 'ws-OTHER');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('JOB_ACCESS_DENIED');
    expect(res.body.data).toBeUndefined();
  });

  it('rejects an unauthenticated request with 401', async () => {
    const getJobStatus = vi.fn(async () => job());
    const app = makeApp({ getJobStatus });

    const res = await request(app).get(`/api/video-editor/jobs/${JOB_ID}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(getJobStatus).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET /jobs/:jobId/stream — stage-derived NDJSON progress stream (Req 18.4, 23.2)
// ---------------------------------------------------------------------------

/** Parse an NDJSON response body into an array of JSON events. */
function parseNdjson(text: string): Array<Record<string, unknown>> {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

describe('GET /jobs/:jobId/stream (task 20.2)', () => {
  it('streams stage-derived progress events and closes on a terminal state (Req 18.4)', async () => {
    // A progressing sequence: ANALYZING(2) → EDITING(4) → COMPLETED.
    const sequence: JobStatusRecord[] = [
      job({ state: 'ANALYZING', completedStages: ['PREPARING', 'UPLOADING'] }),
      job({ state: 'EDITING', completedStages: ['PREPARING', 'UPLOADING', 'ANALYZING', 'PLANNING'] }),
      job({ state: 'COMPLETED', completedStages: ['PREPARING', 'UPLOADING', 'ANALYZING', 'PLANNING', 'EDITING', 'RENDERING', 'QUALITY_CHECK'], outputArtifactIds: ['art-out-1'] }),
    ];
    let i = 0;
    const getJobStatus = vi.fn(async () => sequence[Math.min(i++, sequence.length - 1)]);
    const app = makeApp({ getJobStatus, streamPollIntervalMs: 0, sleep: async () => {} });

    const res = await asOwner(request(app).get(`/api/video-editor/jobs/${JOB_ID}/stream`));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/x-ndjson');
    const events = parseNdjson(res.text);
    expect(events.length).toBe(3);
    expect(events[0]).toMatchObject({ type: 'progress', state: 'ANALYZING', progress: 28, determinate: true });
    expect(events[1]).toMatchObject({ type: 'progress', state: 'EDITING', progress: 57 });
    expect(events[2]).toMatchObject({ type: 'complete', state: 'COMPLETED', terminal: true, progress: 100 });
  });

  it('emits a single terminal event when the job is already terminal', async () => {
    const getJobStatus = vi.fn(async () => job({ state: 'CANCELLED', completedStages: ['PREPARING'] }));
    const app = makeApp({ getJobStatus, streamPollIntervalMs: 0, sleep: async () => {} });

    const res = await asOwner(request(app).get(`/api/video-editor/jobs/${JOB_ID}/stream`));

    expect(res.status).toBe(200);
    const events = parseNdjson(res.text);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'complete', state: 'CANCELLED', terminal: true, progress: 14 });
    // Only the initial read is needed for an already-terminal job.
    expect(getJobStatus).toHaveBeenCalledTimes(1);
  });

  it('denies a non-owner with 403 before opening the stream (Req 19.1, 19.2)', async () => {
    const getJobStatus = vi.fn(async () => job());
    const app = makeApp({ getJobStatus });

    const res = await request(app)
      .get(`/api/video-editor/jobs/${JOB_ID}/stream`)
      .set('x-test-user', OWNER.userId)
      .set('x-test-workspace', 'ws-OTHER');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('JOB_ACCESS_DENIED');
  });

  it('returns 404 for an unknown job before opening the stream', async () => {
    const getJobStatus = vi.fn(async () => null);
    const app = makeApp({ getJobStatus });

    const res = await asOwner(request(app).get(`/api/video-editor/jobs/ghost/stream`));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('JOB_NOT_FOUND');
  });

  it('rejects an unauthenticated request with 401', async () => {
    const getJobStatus = vi.fn(async () => job());
    const app = makeApp({ getJobStatus });

    const res = await request(app).get(`/api/video-editor/jobs/${JOB_ID}/stream`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(getJobStatus).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /jobs/:jobId/cancel — delegate to JobSystemService.cancelJob (Req 18.5)
// ---------------------------------------------------------------------------

describe('POST /jobs/:jobId/cancel (task 20.2)', () => {
  it('cancels an owned non-terminal job, delegating to cancelJob (Req 18.5)', async () => {
    const getJobStatus = vi.fn(async () => job({ state: 'EDITING' }));
    const { getJobSystem, cancelJob } = makeJobSystem({
      jobId: JOB_ID,
      state: 'CANCELLED',
      cancelled: true,
      tempFilesRemoved: true,
      cleanupRetryScheduled: false,
      creditsReleased: true,
    });
    const app = makeApp({ getJobStatus, getJobSystem });

    const res = await asOwner(request(app).post(`/api/video-editor/jobs/${JOB_ID}/cancel`));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      jobId: JOB_ID,
      state: 'CANCELLED',
      cancelled: true,
      tempFilesRemoved: true,
      creditsReleased: true,
    });
    expect(cancelJob).toHaveBeenCalledWith(JOB_ID);
  });

  it('is a no-op reporting the existing state for an already-terminal job', async () => {
    const getJobStatus = vi.fn(async () => job({ state: 'COMPLETED' }));
    const { getJobSystem, cancelJob } = makeJobSystem({
      jobId: JOB_ID,
      state: 'COMPLETED',
      cancelled: false,
      tempFilesRemoved: false,
      cleanupRetryScheduled: false,
      creditsReleased: false,
    });
    const app = makeApp({ getJobStatus, getJobSystem });

    const res = await asOwner(request(app).post(`/api/video-editor/jobs/${JOB_ID}/cancel`));

    expect(res.status).toBe(200);
    expect(res.body.data.cancelled).toBe(false);
    expect(res.body.data.state).toBe('COMPLETED');
    expect(cancelJob).toHaveBeenCalledWith(JOB_ID);
  });

  it('returns 404 for an unknown job and never calls cancelJob', async () => {
    const getJobStatus = vi.fn(async () => null);
    const { getJobSystem, cancelJob } = makeJobSystem({
      jobId: JOB_ID,
      state: 'CANCELLED',
      cancelled: true,
      tempFilesRemoved: true,
      cleanupRetryScheduled: false,
      creditsReleased: true,
    });
    const app = makeApp({ getJobStatus, getJobSystem });

    const res = await asOwner(request(app).post(`/api/video-editor/jobs/ghost/cancel`));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('JOB_NOT_FOUND');
    expect(cancelJob).not.toHaveBeenCalled();
  });

  it('denies a non-owner with 403 and never calls cancelJob (Req 19.1, 19.2)', async () => {
    const getJobStatus = vi.fn(async () => job());
    const { getJobSystem, cancelJob } = makeJobSystem({
      jobId: JOB_ID,
      state: 'CANCELLED',
      cancelled: true,
      tempFilesRemoved: true,
      cleanupRetryScheduled: false,
      creditsReleased: true,
    });
    const app = makeApp({ getJobStatus, getJobSystem });

    const res = await request(app)
      .post(`/api/video-editor/jobs/${JOB_ID}/cancel`)
      .set('x-test-user', OWNER.userId)
      .set('x-test-workspace', 'ws-OTHER');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('JOB_ACCESS_DENIED');
    expect(cancelJob).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated request with 401', async () => {
    const getJobStatus = vi.fn(async () => job());
    const { getJobSystem, cancelJob } = makeJobSystem({
      jobId: JOB_ID,
      state: 'CANCELLED',
      cancelled: true,
      tempFilesRemoved: true,
      cleanupRetryScheduled: false,
      creditsReleased: true,
    });
    const app = makeApp({ getJobStatus, getJobSystem });

    const res = await request(app).post(`/api/video-editor/jobs/${JOB_ID}/cancel`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(getJobStatus).not.toHaveBeenCalled();
    expect(cancelJob).not.toHaveBeenCalled();
  });
});
