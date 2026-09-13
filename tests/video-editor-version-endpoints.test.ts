/**
 * Unit + integration tests for the Video_Version endpoints (task 19.4).
 *
 * Framework: vitest + supertest.
 *
 * Covers (design.md "Version_Manager", Req 16.1–16.8, 21.5, 19.1/19.2, 21.6):
 *  - GET  /projects/:id/versions           — list versions + active pointer (Req 21.5).
 *  - POST /projects/:id/versions           — create a version/refinement (Req 16.1–16.6).
 *  - POST /projects/:id/versions/:vid/restore — restore an existing version (Req 16.7, 16.8).
 *  - Ownership is enforced on every route: a non-owner is denied 403 with no data,
 *    and the Version_Manager is never invoked (Req 19.1, 19.2).
 *  - Missing/invalid input is rejected without mutating state (Req 21.6).
 *  - Version_Manager error codes map to the conventional envelope (Req 21.5, 21.7):
 *      missing parent → 400, missing restore target → 404, immutable/duplicate → 409,
 *      unknown project → 404, persistence failure → 500.
 *
 * The auth + workspace middleware are stubbed so identity is driven by headers;
 * the project store and the Version_Manager are injected in-memory (no DB),
 * exercising the router's real ownership + delegation logic.
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
import type { VersionManagerService } from '../server/features/video-editor/services/version-manager.service';
import {
  VERSION_ERROR_PROJECT_NOT_FOUND,
  VERSION_ERROR_PERSISTENCE,
} from '../server/features/video-editor/services/version-manager.service';
import {
  VERSION_ERROR_MISSING_PARENT,
  VERSION_ERROR_MISSING_RESTORE_TARGET,
  VERSION_ERROR_IMMUTABLE,
  type VersionRecord,
} from '../server/features/video-editor/services/version-manager.logic';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OWNER = { userId: 'user-1', workspaceId: 'ws-1' };
const PROJECT_ID = 'proj-1';

function ownedProject(): VideoProjectRecord {
  return {
    projectId: PROJECT_ID,
    userId: OWNER.userId,
    workspaceId: OWNER.workspaceId,
    name: 'Test project',
    activeVersionId: 'v1',
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

function version(id: string, parentVersionId: string | null): VersionRecord {
  return { versionId: id, parentVersionId, timelineId: `tl-${id}`, createdAt: Date.now() };
}

type VersionManagerStub = Pick<
  VersionManagerService,
  'listVersions' | 'createVersion' | 'restoreVersion'
>;

function makeApp(deps: VideoEditorRouterDeps): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/video-editor', createVideoEditorProjectRouter(deps));
  return app;
}

function asOwner(req: request.Test): request.Test {
  return req.set('x-test-user', OWNER.userId).set('x-test-workspace', OWNER.workspaceId);
}

/** Base deps: the owner's project plus a Version_Manager stub. */
function baseDeps(versionManager: VersionManagerStub): VideoEditorRouterDeps {
  return { store: makeStore(ownedProject()), versionManager };
}

// ---------------------------------------------------------------------------
// GET /projects/:id/versions
// ---------------------------------------------------------------------------

describe('GET /projects/:id/versions (task 19.4)', () => {
  it('lists versions and the active pointer for an owned project (Req 21.5)', async () => {
    const versions = [version('v1', null), version('v2', 'v1')];
    const listVersions = vi.fn(async () => ({ ok: true as const, versions, activeVersionId: 'v2' }));
    const app = makeApp(baseDeps({ listVersions } as VersionManagerStub));

    const res = await asOwner(request(app).get(`/api/video-editor/projects/${PROJECT_ID}/versions`));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.projectId).toBe(PROJECT_ID);
    expect(res.body.data.versions).toHaveLength(2);
    expect(res.body.data.versions[1].versionId).toBe('v2');
    expect(res.body.data.activeVersionId).toBe('v2');
    expect(listVersions).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      workspaceId: OWNER.workspaceId,
      userId: OWNER.userId,
    });
  });

  it('denies a non-owner with 403 and never calls the Version_Manager (Req 19.1, 19.2)', async () => {
    const listVersions = vi.fn(async () => ({ ok: true as const, versions: [], activeVersionId: null }));
    const app = makeApp(baseDeps({ listVersions } as VersionManagerStub));

    const res = await request(app)
      .get(`/api/video-editor/projects/${PROJECT_ID}/versions`)
      .set('x-test-user', OWNER.userId)
      .set('x-test-workspace', 'ws-OTHER');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PROJECT_ACCESS_DENIED');
    expect(res.body.data).toBeUndefined();
    expect(listVersions).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated request with 401', async () => {
    const listVersions = vi.fn(async () => ({ ok: true as const, versions: [], activeVersionId: null }));
    const app = makeApp(baseDeps({ listVersions } as VersionManagerStub));

    const res = await request(app).get(`/api/video-editor/projects/${PROJECT_ID}/versions`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(listVersions).not.toHaveBeenCalled();
  });

  it('maps an unknown project error to 404', async () => {
    const listVersions = vi.fn(async () => ({ ok: false as const, error: VERSION_ERROR_PROJECT_NOT_FOUND }));
    const app = makeApp(baseDeps({ listVersions } as VersionManagerStub));

    const res = await asOwner(request(app).get(`/api/video-editor/projects/${PROJECT_ID}/versions`));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PROJECT_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// POST /projects/:id/versions
// ---------------------------------------------------------------------------

describe('POST /projects/:id/versions (task 19.4)', () => {
  it('creates a version derived from the active version when no parent is given (Req 16.2)', async () => {
    const created = version('v3', 'v2');
    const createVersion = vi.fn(async () => ({ ok: true as const, version: created }));
    const app = makeApp(baseDeps({ createVersion } as VersionManagerStub));

    const res = await asOwner(
      request(app).post(`/api/video-editor/projects/${PROJECT_ID}/versions`),
    ).send({ timelineId: 'tl-v3' });

    expect(res.status).toBe(201);
    expect(res.body.data.version.versionId).toBe('v3');
    expect(res.body.data.activeVersionId).toBe('v3');
    expect(createVersion).toHaveBeenCalledWith(
      { projectId: PROJECT_ID, workspaceId: OWNER.workspaceId, userId: OWNER.userId },
      { timelineId: 'tl-v3', parentVersionId: null },
    );
  });

  it('creates a version derived from an explicit parent + label (Req 16.1, 16.6)', async () => {
    const created = version('v3', 'v1');
    const createVersion = vi.fn(async () => ({ ok: true as const, version: created }));
    const app = makeApp(baseDeps({ createVersion } as VersionManagerStub));

    const res = await asOwner(
      request(app).post(`/api/video-editor/projects/${PROJECT_ID}/versions`),
    ).send({ timelineId: 'tl-v3', parentVersionId: 'v1', label: 'Punchier hook' });

    expect(res.status).toBe(201);
    expect(createVersion).toHaveBeenCalledWith(
      { projectId: PROJECT_ID, workspaceId: OWNER.workspaceId, userId: OWNER.userId },
      { timelineId: 'tl-v3', parentVersionId: 'v1', label: 'Punchier hook' },
    );
  });

  it('rejects a missing timelineId with 400 and never calls the Version_Manager (Req 21.6)', async () => {
    const createVersion = vi.fn(async () => ({ ok: true as const, version: version('v3', 'v2') }));
    const app = makeApp(baseDeps({ createVersion } as VersionManagerStub));

    const res = await asOwner(
      request(app).post(`/api/video-editor/projects/${PROJECT_ID}/versions`),
    ).send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toContain('timelineId');
    expect(createVersion).not.toHaveBeenCalled();
  });

  it('rejects a named parent that does not exist with 400, no version created (Req 16.3)', async () => {
    const createVersion = vi.fn(async () => ({ ok: false as const, error: VERSION_ERROR_MISSING_PARENT }));
    const app = makeApp(baseDeps({ createVersion } as VersionManagerStub));

    const res = await asOwner(
      request(app).post(`/api/video-editor/projects/${PROJECT_ID}/versions`),
    ).send({ timelineId: 'tl-v3', parentVersionId: 'ghost' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(VERSION_ERROR_MISSING_PARENT);
  });

  it('maps a duplicate/immutable version error to 409 (Req 16.5)', async () => {
    const createVersion = vi.fn(async () => ({ ok: false as const, error: VERSION_ERROR_IMMUTABLE }));
    const app = makeApp(baseDeps({ createVersion } as VersionManagerStub));

    const res = await asOwner(
      request(app).post(`/api/video-editor/projects/${PROJECT_ID}/versions`),
    ).send({ timelineId: 'tl-v3' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe(VERSION_ERROR_IMMUTABLE);
  });

  it('maps a persistence failure to 500', async () => {
    const createVersion = vi.fn(async () => ({ ok: false as const, error: VERSION_ERROR_PERSISTENCE }));
    const app = makeApp(baseDeps({ createVersion } as VersionManagerStub));

    const res = await asOwner(
      request(app).post(`/api/video-editor/projects/${PROJECT_ID}/versions`),
    ).send({ timelineId: 'tl-v3' });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('VIDEO_PROJECT_ERROR');
  });

  it('denies a non-owner with 403 and never calls the Version_Manager (Req 19.1, 19.2)', async () => {
    const createVersion = vi.fn(async () => ({ ok: true as const, version: version('v3', 'v2') }));
    const app = makeApp(baseDeps({ createVersion } as VersionManagerStub));

    const res = await request(app)
      .post(`/api/video-editor/projects/${PROJECT_ID}/versions`)
      .set('x-test-user', OWNER.userId)
      .set('x-test-workspace', 'ws-OTHER')
      .send({ timelineId: 'tl-v3' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PROJECT_ACCESS_DENIED');
    expect(createVersion).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /projects/:id/versions/:versionId/restore
// ---------------------------------------------------------------------------

describe('POST /projects/:id/versions/:versionId/restore (task 19.4)', () => {
  it('restores an existing version as active (Req 16.7)', async () => {
    const restoreVersion = vi.fn(async () => ({ ok: true as const, activeVersionId: 'v1' }));
    const app = makeApp(baseDeps({ restoreVersion } as VersionManagerStub));

    const res = await asOwner(
      request(app).post(`/api/video-editor/projects/${PROJECT_ID}/versions/v1/restore`),
    );

    expect(res.status).toBe(200);
    expect(res.body.data.activeVersionId).toBe('v1');
    expect(restoreVersion).toHaveBeenCalledWith(
      { projectId: PROJECT_ID, workspaceId: OWNER.workspaceId, userId: OWNER.userId },
      'v1',
    );
  });

  it('rejects restoring a version that does not exist with 404, active preserved (Req 16.8)', async () => {
    const restoreVersion = vi.fn(async () => ({
      ok: false as const,
      error: VERSION_ERROR_MISSING_RESTORE_TARGET,
    }));
    const app = makeApp(baseDeps({ restoreVersion } as VersionManagerStub));

    const res = await asOwner(
      request(app).post(`/api/video-editor/projects/${PROJECT_ID}/versions/ghost/restore`),
    );

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(VERSION_ERROR_MISSING_RESTORE_TARGET);
  });

  it('denies a non-owner with 403 and never calls the Version_Manager (Req 19.1, 19.2)', async () => {
    const restoreVersion = vi.fn(async () => ({ ok: true as const, activeVersionId: 'v1' }));
    const app = makeApp(baseDeps({ restoreVersion } as VersionManagerStub));

    const res = await request(app)
      .post(`/api/video-editor/projects/${PROJECT_ID}/versions/v1/restore`)
      .set('x-test-user', OWNER.userId)
      .set('x-test-workspace', 'ws-OTHER');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PROJECT_ACCESS_DENIED');
    expect(restoreVersion).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated request with 401', async () => {
    const restoreVersion = vi.fn(async () => ({ ok: true as const, activeVersionId: 'v1' }));
    const app = makeApp(baseDeps({ restoreVersion } as VersionManagerStub));

    const res = await request(app).post(
      `/api/video-editor/projects/${PROJECT_ID}/versions/v1/restore`,
    );

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(restoreVersion).not.toHaveBeenCalled();
  });
});
