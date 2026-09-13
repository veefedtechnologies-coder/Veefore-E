/**
 * Unit + integration tests for the deterministic path of the edits endpoint
 * (task 11.5).
 *
 * Framework: vitest + supertest.
 *
 * Covers (design.md "Deterministic_Editor" + "Timeline_Engine", Req 8.1, 8.3,
 * 8.6, 10.1, 10.2, 21.4, 19.1/19.2):
 *  - POST /projects/:id/edits routes a deterministic op through the Model_Router,
 *    EXECUTES it via the Deterministic_Editor (no provider call), marks the job
 *    COMPLETED with its single artifact, and records the artifact on the version
 *    timeline via the Timeline_Engine (Req 8.1, 8.3, 10.1).
 *  - A deterministic failure surfaces an explicit 422 with the editor's error
 *    code and performs NO timeline update (Req 8.6).
 *  - An unknown deterministic kind is rejected up-front without executing (Req 23).
 *  - Ownership is enforced: a non-owner is denied 403 with no data (Req 19.1/19.2).
 *
 * The auth + workspace middleware are stubbed so identity is driven by headers;
 * the project store and every collaborator (router, editor, timeline, jobs) are
 * injected in-memory (no DB, no Redis, no FFmpeg), exercising the router's real
 * orchestration logic.
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
  type VideoProjectRecord,
  type VideoProjectStore,
} from '../server/features/video-editor/api/project.routes';
import { DeterministicEditError } from '../server/features/video-editor/services/deterministic-editor.service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OWNER = { userId: 'user-1', workspaceId: 'ws-1' };
const OTHER = { userId: 'user-2', workspaceId: 'ws-2' };
const PROJECT_ID = 'proj-1';
const VERSION_ID = 'ver-1';
const ARTIFACT_ID = 'art-det-1';

function ownedProject(): VideoProjectRecord {
  return {
    projectId: PROJECT_ID,
    userId: OWNER.userId,
    workspaceId: OWNER.workspaceId,
    name: 'Test project',
    activeVersionId: VERSION_ID,
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

/** A produced deterministic artifact stand-in (the router passes it through). */
function producedArtifact() {
  return {
    artifact: { artifactId: ARTIFACT_ID } as any,
    storageKey: 'renders/art-det-1.mp4',
    command: {} as any,
  };
}

/** A successful timeline-accept result carrying a one-element model. */
function timelineAccepted() {
  return {
    ok: true as const,
    timelineId: 'vt-1',
    model: { sequences: [{ tracks: 1 }], elements: [{}] } as any,
    exposureMs: 2,
    persisted: true,
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

/**
 * Base deps for the deterministic path: owner's project with a source, a
 * Model_Router that always routes deterministic, and injected editor + timeline
 * + job collaborators so no DB/FFmpeg is touched.
 */
function baseDeps(overrides: Partial<VideoEditorRouterDeps> = {}): VideoEditorRouterDeps {
  return {
    store: makeStore(ownedProject()),
    generateOperationId: () => 'op-1',
    createEditOperation: async () => {},
    getSourceForEdit: async () => ({
      sourceId: 'src-1',
      storageKey: 'sources/src-1.mp4',
      fileName: 'src-1.mp4',
      durationMs: 30000,
    }),
    modelRouter: {
      route: async () => ({
        decision: { engine: 'deterministic', reason: "kind is deterministic-performable" },
      }),
    } as any,
    deterministicEditor: { execute: async () => producedArtifact() } as any,
    timelineEngine: { acceptOperation: async () => timelineAccepted() } as any,
    createDeterministicEditJob: async () => ({ jobId: 've-deterministic-proj-1-ver-1-op-1' }),
    completeDeterministicEditJob: async () => {},
    ...overrides,
  };
}

const trimBody = {
  operation: { type: 'deterministic', kind: 'trim', range: { startMs: 0, endMs: 15000 } },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /projects/:id/edits — deterministic path (task 11.5)', () => {
  it('executes the deterministic op, completes the job, and updates the timeline (Req 8.1, 8.3, 10.1)', async () => {
    const execute = vi.fn(async () => producedArtifact());
    const acceptOperation = vi.fn(async () => timelineAccepted());
    const completeJob = vi.fn(async () => {});
    const app = makeApp(
      baseDeps({
        deterministicEditor: { execute } as any,
        timelineEngine: { acceptOperation } as any,
        completeDeterministicEditJob: completeJob,
      }),
    );

    const res = await asOwner(request(app).post(`/api/video-editor/projects/${PROJECT_ID}/edits`)).send(
      trimBody,
    );

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.engine).toBe('deterministic');
    expect(res.body.data.status).toBe('completed');
    expect(res.body.data.artifactId).toBe(ARTIFACT_ID);
    expect(res.body.data.jobId).toBe('ve-deterministic-proj-1-ver-1-op-1');
    expect(res.body.data.timeline.timelineId).toBe('vt-1');
    expect(res.body.data.timeline.elementCount).toBe(1);

    // The editor executed with the immutable source + a typed trim operation.
    expect(execute).toHaveBeenCalledTimes(1);
    const editReq = execute.mock.calls[0][0];
    expect(editReq.operation).toEqual({ kind: 'trim', params: { startMs: 0, endMs: 15000 } });
    expect(editReq.sourceStorageKey).toBe('sources/src-1.mp4');
    expect(editReq.jobId).toBe('ve-deterministic-proj-1-ver-1-op-1');

    // The job was marked completed with its single artifact (Req 8.3).
    expect(completeJob).toHaveBeenCalledWith('ve-deterministic-proj-1-ver-1-op-1', ARTIFACT_ID);

    // A clip referencing the produced artifact was added to the version timeline.
    expect(acceptOperation).toHaveBeenCalledTimes(1);
    const [identity, op] = acceptOperation.mock.calls[0];
    expect(identity).toMatchObject({ projectId: PROJECT_ID, versionId: VERSION_ID });
    expect(op.type).toBe('addElement');
    expect(op.element).toMatchObject({
      kind: 'clip',
      trackIndex: 0,
      timelineStartMs: 0,
      timelineEndMs: 15000,
      sourceAssetId: ARTIFACT_ID,
      sourceInMs: 0,
      sourceOutMs: 15000,
    });
  });

  it('surfaces a 422 with the editor error code and does NOT update the timeline on failure (Req 8.6)', async () => {
    const acceptOperation = vi.fn(async () => timelineAccepted());
    const completeJob = vi.fn(async () => {});
    const app = makeApp(
      baseDeps({
        deterministicEditor: {
          execute: async () => {
            throw new DeterministicEditError('DETERMINISTIC_INVALID_PARAM', 'bad crop');
          },
        } as any,
        timelineEngine: { acceptOperation } as any,
        completeDeterministicEditJob: completeJob,
      }),
    );

    const res = await asOwner(request(app).post(`/api/video-editor/projects/${PROJECT_ID}/edits`)).send(
      trimBody,
    );

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('DETERMINISTIC_INVALID_PARAM');
    expect(res.body.error.message).toBe('bad crop');
    expect(completeJob).not.toHaveBeenCalled();
    expect(acceptOperation).not.toHaveBeenCalled();
  });

  it('rejects an unknown deterministic kind up-front without executing (Req 23)', async () => {
    const execute = vi.fn(async () => producedArtifact());
    const app = makeApp(baseDeps({ deterministicEditor: { execute } as any }));

    const res = await asOwner(request(app).post(`/api/video-editor/projects/${PROJECT_ID}/edits`)).send({
      operation: { type: 'deterministic', kind: 'levitate', range: { startMs: 0, endMs: 15000 } },
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toMatch(/not a deterministic operation/);
    expect(execute).not.toHaveBeenCalled();
  });

  it('surfaces a 422 when the timeline rejects the placement (Req 10.3)', async () => {
    const app = makeApp(
      baseDeps({
        timelineEngine: {
          acceptOperation: async () => ({ ok: false as const, error: 'trackIndex 5 out of range' }),
        } as any,
      }),
    );

    const res = await asOwner(request(app).post(`/api/video-editor/projects/${PROJECT_ID}/edits`)).send({
      operation: { type: 'deterministic', kind: 'trim', range: { startMs: 0, endMs: 15000 } },
      timelineTrackIndex: 5,
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('EDIT_TIMELINE_REJECTED');
    expect(res.body.error.message).toMatch(/out of range/);
  });

  it('denies a non-owner with 403 and performs no work (Req 19.1, 19.2)', async () => {
    const execute = vi.fn(async () => producedArtifact());
    const app = makeApp(baseDeps({ deterministicEditor: { execute } as any }));

    const res = await request(app)
      .post(`/api/video-editor/projects/${PROJECT_ID}/edits`)
      .set('x-test-user', OTHER.userId)
      .set('x-test-workspace', OTHER.workspaceId)
      .send(trimBody);

    expect(res.status).toBe(403);
    expect(execute).not.toHaveBeenCalled();
  });
});
