/**
 * Unit + integration tests for the Video_Analysis endpoints and the
 * `video-analysis` queue processor (task 8.5).
 *
 * Framework: vitest + supertest.
 *
 * Covers (design.md "Video_Analysis_Service", Req 4.9, 18.1, 18.4, 21.4, 19.1/19.2):
 *  - POST /projects/:id/analyze enqueues an analysis job asynchronously and
 *    reports a QUEUED, stage-derived-progress state (Req 18.1, 18.4).
 *  - A source with a completed analysis is reused without re-enqueuing (Req 4.9).
 *  - GET /projects/:id/analysis returns the completed record, or the in-progress
 *    job's state/progress, or 404 when no analysis was started (Req 21.4).
 *  - Ownership is enforced: a non-owner is denied 403 with no data (Req 19.1/19.2).
 *  - Missing/invalid source input is rejected without side effects (Req 21.6).
 *  - The queue processor delegates to the real analysis service and never
 *    fabricates a result (No-Mock, Req 23).
 *
 * The auth + workspace middleware are stubbed so identity is driven by headers;
 * the project store and analysis collaborators are injected in-memory (no DB, no
 * Redis), exercising the router's real ownership and orchestration logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  type VideoProjectRecord,
  type VideoProjectStore,
} from '../server/features/video-editor/api/project.routes';
import {
  processVideoAnalysisJob,
  resolveAnalysisSourceId,
} from '../server/features/video-editor/services/video-analysis.worker';
import type { VideoJobData } from '../server/queues/videoEditorQueues';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OWNER = { userId: 'user-1', workspaceId: 'ws-1' };
const PROJECT_ID = 'proj-1';
const SOURCE_ID = 'src-1';
const ANALYSIS_JOB_ID = `ve-analysis-${PROJECT_ID}-${SOURCE_ID}`;

function ownedProject(): VideoProjectRecord {
  return {
    projectId: PROJECT_ID,
    userId: OWNER.userId,
    workspaceId: OWNER.workspaceId,
    name: 'Test project',
    retentionPolicyAllowsSourceDeletion: false,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeStore(project: VideoProjectRecord | null): VideoProjectStore {
  return {
    async create() {
      throw new Error('unused in these tests');
    },
    async findById(projectId) {
      return project && project.projectId === projectId ? project : null;
    },
    async listByOwner() {
      return project ? [project] : [];
    },
    async update() {
      return null;
    },
    async softDelete() {
      return null;
    },
  };
}

/** A minimal completed VideoAnalysis stand-in (the router passes it through). */
function completedAnalysis() {
  return {
    sourceId: SOURCE_ID,
    projectId: PROJECT_ID,
    durationSeconds: 30,
    fps: 30,
    width: 1920,
    height: 1080,
    aspectRatio: '16:9',
    scenes: [{ startMs: 0, endMs: 30000 }],
    transcript: [],
    audioFeatures: { loudnessCurve: [], silenceSegments: [], speechSegments: [] },
    hookCandidates: [],
    importantMoments: [],
    stages: {
      probeMetadata: true,
      sceneDetection: true,
      audioFeatures: true,
      transcript: true,
      semanticEnrichment: true,
    },
    completed: true,
    status: 'completed' as const,
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

/** Base injectable deps: owner's project, a source exists, no analysis yet. */
function baseDeps(overrides: Partial<VideoEditorRouterDeps> = {}): VideoEditorRouterDeps {
  return {
    store: makeStore(ownedProject()),
    analysisService: { getCompletedAnalysis: async () => null },
    enqueueAnalysis: async () => 'queue-job-1',
    getLatestSourceId: async () => SOURCE_ID,
    sourceExistsInProject: async (_pid, sid) => sid === SOURCE_ID,
    getAnalysisJobStatus: async () => null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// POST /projects/:id/analyze
// ---------------------------------------------------------------------------

describe('POST /projects/:id/analyze (task 8.5)', () => {
  it('enqueues analysis asynchronously and reports a QUEUED stage-derived state (Req 18.1, 18.4)', async () => {
    const enqueueAnalysis = vi.fn(async () => 'queue-job-1');
    const app = makeApp(baseDeps({ enqueueAnalysis }));

    const res = await asOwner(request(app).post(`/api/video-editor/projects/${PROJECT_ID}/analyze`)).send({});

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('queued');
    expect(res.body.data.state).toBe('QUEUED');
    expect(res.body.data.progress).toBe(0);
    expect(res.body.data.sourceId).toBe(SOURCE_ID);
    expect(res.body.data.jobId).toBe(ANALYSIS_JOB_ID);
    expect(res.body.data.queueJobId).toBe('queue-job-1');
    expect(enqueueAnalysis).toHaveBeenCalledTimes(1);
    expect(enqueueAnalysis).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      sourceId: SOURCE_ID,
      workspaceId: OWNER.workspaceId,
      userId: OWNER.userId,
    });
  });

  it('reuses a completed analysis without re-enqueuing (Req 4.9)', async () => {
    const enqueueAnalysis = vi.fn(async () => 'queue-job-1');
    const app = makeApp(
      baseDeps({
        enqueueAnalysis,
        analysisService: {
          getCompletedAnalysis: async () => ({ analysis: completedAnalysis() as any, artifactId: 'art-9' }),
        },
      }),
    );

    const res = await asOwner(request(app).post(`/api/video-editor/projects/${PROJECT_ID}/analyze`)).send({});

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('completed');
    expect(res.body.data.reused).toBe(true);
    expect(res.body.data.artifactId).toBe('art-9');
    expect(enqueueAnalysis).not.toHaveBeenCalled();
  });

  it('returns 404 when the project has no source media (Req 21.6)', async () => {
    const app = makeApp(baseDeps({ getLatestSourceId: async () => null }));

    const res = await asOwner(request(app).post(`/api/video-editor/projects/${PROJECT_ID}/analyze`)).send({});

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NO_SOURCE');
  });

  it('rejects an explicit sourceId that does not belong to the project (Req 21.6)', async () => {
    const enqueueAnalysis = vi.fn(async () => 'queue-job-1');
    const app = makeApp(baseDeps({ enqueueAnalysis }));

    const res = await asOwner(
      request(app).post(`/api/video-editor/projects/${PROJECT_ID}/analyze`),
    ).send({ sourceId: 'not-in-project' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SOURCE_NOT_FOUND');
    expect(enqueueAnalysis).not.toHaveBeenCalled();
  });

  it('returns 503 when the analysis queue is unavailable (No-Mock, Req 23.1)', async () => {
    const app = makeApp(baseDeps({ enqueueAnalysis: async () => null }));

    const res = await asOwner(request(app).post(`/api/video-editor/projects/${PROJECT_ID}/analyze`)).send({});

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('ANALYSIS_QUEUE_UNAVAILABLE');
  });

  it('denies a non-owner with 403 and no data (Req 19.1, 19.2)', async () => {
    const enqueueAnalysis = vi.fn(async () => 'queue-job-1');
    const app = makeApp(baseDeps({ enqueueAnalysis }));

    const res = await request(app)
      .post(`/api/video-editor/projects/${PROJECT_ID}/analyze`)
      .set('x-test-user', OWNER.userId)
      .set('x-test-workspace', 'ws-OTHER')
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PROJECT_ACCESS_DENIED');
    expect(res.body.data).toBeUndefined();
    expect(enqueueAnalysis).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated request with 401', async () => {
    const app = makeApp(baseDeps());

    const res = await request(app).post(`/api/video-editor/projects/${PROJECT_ID}/analyze`).send({});

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});

// ---------------------------------------------------------------------------
// GET /projects/:id/analysis
// ---------------------------------------------------------------------------

describe('GET /projects/:id/analysis (task 8.5)', () => {
  it('returns the completed analysis record when ready (Req 4.9, 21.4)', async () => {
    const app = makeApp(
      baseDeps({
        analysisService: {
          getCompletedAnalysis: async () => ({ analysis: completedAnalysis() as any, artifactId: 'art-9' }),
        },
      }),
    );

    const res = await asOwner(request(app).get(`/api/video-editor/projects/${PROJECT_ID}/analysis`));

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('completed');
    expect(res.body.data.progress).toBe(100);
    expect(res.body.data.artifactId).toBe('art-9');
    expect(res.body.data.analysis.completed).toBe(true);
    expect(res.body.data.jobId).toBe(ANALYSIS_JOB_ID);
  });

  it('returns the in-progress job stage-derived state/progress (Req 18.4)', async () => {
    const app = makeApp(
      baseDeps({
        getAnalysisJobStatus: async (jobId) => {
          expect(jobId).toBe(ANALYSIS_JOB_ID);
          return { state: 'ANALYZING', progress: 60 };
        },
      }),
    );

    const res = await asOwner(request(app).get(`/api/video-editor/projects/${PROJECT_ID}/analysis`));

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('processing');
    expect(res.body.data.state).toBe('ANALYZING');
    expect(res.body.data.progress).toBe(60);
  });

  it('surfaces a failed analysis job with its error code (Req 4.11)', async () => {
    const app = makeApp(
      baseDeps({
        getAnalysisJobStatus: async () => ({ state: 'FAILED', progress: 40, errorCode: 'SCENE_DETECTION_FAILED' }),
      }),
    );

    const res = await asOwner(request(app).get(`/api/video-editor/projects/${PROJECT_ID}/analysis`));

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('failed');
    expect(res.body.data.errorCode).toBe('SCENE_DETECTION_FAILED');
  });

  it('returns 404 when no analysis has been started', async () => {
    const app = makeApp(baseDeps());

    const res = await asOwner(request(app).get(`/api/video-editor/projects/${PROJECT_ID}/analysis`));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ANALYSIS_NOT_FOUND');
  });

  it('denies a non-owner with 403 and no analysis data (Req 19.1, 19.2)', async () => {
    const app = makeApp(
      baseDeps({
        analysisService: {
          getCompletedAnalysis: async () => ({ analysis: completedAnalysis() as any, artifactId: 'art-9' }),
        },
      }),
    );

    const res = await request(app)
      .get(`/api/video-editor/projects/${PROJECT_ID}/analysis`)
      .set('x-test-user', OWNER.userId)
      .set('x-test-workspace', 'ws-OTHER');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PROJECT_ACCESS_DENIED');
    expect(res.body.data).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// video-analysis queue processor
// ---------------------------------------------------------------------------

describe('processVideoAnalysisJob (task 8.5)', () => {
  const jobData = (overrides: Partial<VideoJobData> = {}): VideoJobData => ({
    type: 'analysis',
    projectId: PROJECT_ID,
    versionId: SOURCE_ID,
    opId: 'analyze',
    workspaceId: OWNER.workspaceId,
    userId: OWNER.userId,
    ...overrides,
  });

  it('resolves the source id from the payload, then the version segment, else null', () => {
    expect(resolveAnalysisSourceId(jobData({ payload: { sourceId: 'src-explicit' } }))).toBe('src-explicit');
    expect(resolveAnalysisSourceId(jobData())).toBe(SOURCE_ID);
    expect(resolveAnalysisSourceId(jobData({ versionId: '' }))).toBeNull();
  });

  it('delegates to the real analysis service and maps its outcome (No-Mock, Req 23)', async () => {
    const analyze = vi.fn(async (sourceId: string) => {
      expect(sourceId).toBe(SOURCE_ID);
      return { analysis: completedAnalysis() as any, artifactId: 'art-9', reused: false };
    });

    const result = await processVideoAnalysisJob(
      { id: 've-analysis-proj-1-src-1-analyze', data: jobData({ payload: { sourceId: SOURCE_ID } }) },
      { service: { analyze } },
    );

    expect(analyze).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ sourceId: SOURCE_ID, artifactId: 'art-9', completed: true, reused: false });
  });

  it('throws when the job has no resolvable source id (fails loudly, No-Mock)', async () => {
    const analyze = vi.fn();
    await expect(
      processVideoAnalysisJob({ id: 've-analysis-x', data: jobData({ versionId: '', payload: {} }) }, {
        service: { analyze: analyze as any },
      }),
    ).rejects.toThrow(/missing a source id/);
    expect(analyze).not.toHaveBeenCalled();
  });
});
