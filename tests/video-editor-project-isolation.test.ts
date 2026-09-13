/**
 * Property + example tests for the Video_Project CRUD router's isolation and
 * input-validation guarantees (task 5.2).
 *
 * Framework: vitest + fast-check + supertest.
 *
 * Implements the two named correctness properties from design.md:
 *
 *  - **Property 45: Non-owners are denied with no data leakage** — for any
 *    request referencing a `Video_Project` the authenticated user does not own
 *    (different user and/or different workspace), the request is rejected with
 *    HTTP 403 and no project or artifact data is returned; and list/read CRUD
 *    returns only projects owned by the requester's active workspace.
 *    **Validates: Requirements 19.1, 19.2, 21.2, 21.3**
 *
 *  - **Property 51: Invalid endpoint input is rejected without mutating state**
 *    — for any request to an input-accepting endpoint (POST /projects,
 *    PATCH /projects/:id) that omits a required field or supplies a value
 *    failing validation, the request is rejected with a 400 that names the
 *    failed constraint, and no `Video_Editor` record is created or mutated.
 *    **Validates: Requirements 21.6**
 *
 * The auth + workspace middleware are stubbed so identity is driven by headers
 * (server-derived identity, Req 19.5); the project store is an injected
 * in-memory implementation that records every mutation so the tests can assert
 * that rejected requests mutate nothing. No DB, no Redis.
 */

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
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
  type CreateProjectInput,
  type UpdateProjectPatch,
  type VideoEditorRouterDeps,
  type VideoProjectRecord,
  type VideoProjectStore,
} from '../server/features/video-editor/api/project.routes';

// ---------------------------------------------------------------------------
// In-memory store that records every mutation (so we can assert "no mutation").
// ---------------------------------------------------------------------------

interface MutationLog {
  creates: CreateProjectInput[];
  updates: Array<{ projectId: string; patch: UpdateProjectPatch }>;
  softDeletes: string[];
}

interface RecordingStore extends VideoProjectStore {
  readonly log: MutationLog;
  /** Deep snapshot of the current records, for before/after equality checks. */
  snapshot(): Record<string, VideoProjectRecord>;
}

function makeRecordingStore(seed: VideoProjectRecord[] = []): RecordingStore {
  const records = new Map<string, VideoProjectRecord>();
  for (const r of seed) records.set(r.projectId, { ...r });

  const log: MutationLog = { creates: [], updates: [], softDeletes: [] };

  return {
    log,
    snapshot() {
      const out: Record<string, VideoProjectRecord> = {};
      for (const [id, r] of records) out[id] = { ...r };
      return out;
    },
    async create(input) {
      log.creates.push(input);
      const now = new Date();
      const record: VideoProjectRecord = {
        projectId: input.projectId,
        userId: input.userId,
        workspaceId: input.workspaceId,
        name: input.name,
        targetPlatform: input.targetPlatform,
        retentionPolicyAllowsSourceDeletion: false,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };
      records.set(record.projectId, record);
      return { ...record };
    },
    async findById(projectId) {
      const r = records.get(projectId);
      return r ? { ...r } : null;
    },
    async listByOwner(workspaceId, userId) {
      return [...records.values()]
        .filter((r) => r.status === 'active' && r.workspaceId === workspaceId && r.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((r) => ({ ...r }));
    },
    async update(projectId, patch) {
      log.updates.push({ projectId, patch });
      const r = records.get(projectId);
      if (!r || r.status === 'deleted') return null;
      if (patch.name !== undefined) r.name = patch.name;
      if (patch.targetPlatform !== undefined) r.targetPlatform = patch.targetPlatform;
      if (patch.activeVersionId !== undefined) r.activeVersionId = patch.activeVersionId;
      r.updatedAt = new Date();
      return { ...r };
    },
    async softDelete(projectId) {
      log.softDeletes.push(projectId);
      const r = records.get(projectId);
      if (!r || r.status === 'deleted') return null;
      r.status = 'deleted';
      r.updatedAt = new Date();
      return { ...r };
    },
  };
}

let idCounter = 0;
function makeApp(store: VideoProjectStore, overrides: Partial<VideoEditorRouterDeps> = {}): Express {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/video-editor',
    createVideoEditorProjectRouter({
      store,
      generateProjectId: () => `vp-test-${idCounter++}`,
      ...overrides,
    }),
  );
  return app;
}

function project(overrides: Partial<VideoProjectRecord> = {}): VideoProjectRecord {
  const now = new Date();
  return {
    projectId: 'proj-1',
    userId: 'owner-user',
    workspaceId: 'owner-ws',
    name: 'Owned project',
    retentionPolicyAllowsSourceDeletion: false,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// A known-valid platform preset (see video-editor.config PLATFORM_PRESETS).
const VALID_PLATFORM = 'tiktok';

// Identifiers are carried in HTTP headers (x-test-user / x-test-workspace),
// which trim surrounding whitespace; constrain generated ids to realistic
// alphanumeric tokens so header round-tripping is lossless.
const ALPHANUM = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');
function idArb(prefix: string) {
  return fc
    .array(fc.constantFrom(...ALPHANUM), { minLength: 1, maxLength: 10 })
    .map((chars) => `${prefix}-${chars.join('')}`);
}

// ---------------------------------------------------------------------------
// Property 45: Non-owners are denied with no data leakage
// Validates: Requirements 19.1, 19.2, 21.2, 21.3
// ---------------------------------------------------------------------------

describe('Property 45: non-owners are denied with no data leakage (Req 19.1, 19.2, 21.2, 21.3)', () => {
  // Arbitrary that yields an owner identity and a DIFFERENT requester identity
  // (different user id, different workspace, or both).
  const identities = fc
    .record({
      ownerUser: idArb('u'),
      ownerWs: idArb('w'),
      diffUser: fc.boolean(),
      diffWs: fc.boolean(),
      suffix: fc.array(fc.constantFrom(...ALPHANUM), { minLength: 1, maxLength: 6 }).map((c) => c.join('')),
    })
    // Ensure the requester actually differs from the owner in at least one axis.
    .filter((r) => r.diffUser || r.diffWs)
    .map((r) => ({
      ownerUser: r.ownerUser,
      ownerWs: r.ownerWs,
      reqUser: r.diffUser ? `${r.ownerUser}-other-${r.suffix}` : r.ownerUser,
      reqWs: r.diffWs ? `${r.ownerWs}-other-${r.suffix}` : r.ownerWs,
    }));

  it('rejects GET/PATCH/DELETE on another owner\'s project with 403 and no data, mutating nothing', async () => {
    await fc.assert(
      fc.asyncProperty(identities, fc.constantFrom('get', 'patch', 'delete'), async (ids, verb) => {
        const owned = project({
          projectId: 'proj-secret',
          userId: ids.ownerUser,
          workspaceId: ids.ownerWs,
          name: 'secret name',
          targetPlatform: VALID_PLATFORM,
        });
        const store = makeRecordingStore([owned]);
        const app = makeApp(store);
        const before = store.snapshot();

        const base = `/api/video-editor/projects/${owned.projectId}`;
        let req: request.Test;
        if (verb === 'get') req = request(app).get(base);
        else if (verb === 'patch') req = request(app).patch(base).send({ name: 'hijacked' });
        else req = request(app).delete(base);

        const res = await req.set('x-test-user', ids.reqUser).set('x-test-workspace', ids.reqWs);

        // Rejected with 403 and the ownership-denied code.
        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('PROJECT_ACCESS_DENIED');
        // No project or artifact data leaks to the non-owner (Req 19.2).
        expect(res.body.data).toBeUndefined();
        const bodyText = JSON.stringify(res.body);
        expect(bodyText).not.toContain('secret name');
        expect(bodyText).not.toContain(ids.ownerUser);
        // Nothing was mutated (Req 21.3).
        expect(store.log.updates).toHaveLength(0);
        expect(store.log.softDeletes).toHaveLength(0);
        expect(store.snapshot()).toEqual(before);
      }),
      { numRuns: 100 },
    );
  });

  it('list returns only projects owned by the requester\'s active workspace (Req 21.2)', async () => {
    const ownershipArb = fc.record({
      reqUser: idArb('me'),
      reqWs: idArb('ws'),
      others: fc.array(
        fc.record({ user: idArb('other'), ws: idArb('otherws') }),
        { maxLength: 6 },
      ),
      ownedCount: fc.integer({ min: 0, max: 5 }),
    });

    await fc.assert(
      fc.asyncProperty(ownershipArb, async (cfg) => {
        const seed: VideoProjectRecord[] = [];
        let n = 0;
        for (let i = 0; i < cfg.ownedCount; i++) {
          seed.push(
            project({ projectId: `owned-${n++}`, userId: cfg.reqUser, workspaceId: cfg.reqWs }),
          );
        }
        // Foreign projects: force a different user/workspace so they must not leak.
        cfg.others.forEach((o, i) => {
          seed.push(
            project({
              projectId: `foreign-${i}`,
              userId: `${o.user}-x`,
              workspaceId: `${o.ws}-x`,
            }),
          );
        });

        const store = makeRecordingStore(seed);
        const app = makeApp(store);

        const res = await request(app)
          .get('/api/video-editor/projects')
          .set('x-test-user', cfg.reqUser)
          .set('x-test-workspace', cfg.reqWs);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        const returned = res.body.data as VideoProjectRecord[];
        // Exactly the requester-owned active projects, nothing foreign.
        expect(returned).toHaveLength(cfg.ownedCount);
        for (const r of returned) {
          expect(r.userId).toBe(cfg.reqUser);
          expect(r.workspaceId).toBe(cfg.reqWs);
          expect(r.projectId.startsWith('owned-')).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('example: an owner reads their own project (positive control)', async () => {
    const owned = project();
    const store = makeRecordingStore([owned]);
    const app = makeApp(store);

    const res = await request(app)
      .get(`/api/video-editor/projects/${owned.projectId}`)
      .set('x-test-user', owned.userId)
      .set('x-test-workspace', owned.workspaceId);

    expect(res.status).toBe(200);
    expect(res.body.data.projectId).toBe(owned.projectId);
  });

  it('example: an unknown/deleted project yields 404 and mutates nothing (Req 21.3)', async () => {
    const deleted = project({ projectId: 'gone', status: 'deleted' });
    const store = makeRecordingStore([deleted]);
    const app = makeApp(store);
    const before = store.snapshot();

    const missing = await request(app)
      .get('/api/video-editor/projects/does-not-exist')
      .set('x-test-user', deleted.userId)
      .set('x-test-workspace', deleted.workspaceId);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('PROJECT_NOT_FOUND');

    const del = await request(app)
      .delete(`/api/video-editor/projects/${deleted.projectId}`)
      .set('x-test-user', deleted.userId)
      .set('x-test-workspace', deleted.workspaceId);
    expect(del.status).toBe(404);

    expect(store.log.softDeletes).toHaveLength(0);
    expect(store.snapshot()).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// Property 51: Invalid endpoint input is rejected without mutating state
// Validates: Requirements 21.6
// ---------------------------------------------------------------------------

describe('Property 51: invalid endpoint input is rejected without mutating state (Req 21.6)', () => {
  // Bodies that must fail POST /projects validation (name required, non-empty,
  // <=200 chars; targetPlatform, if present, must be a known preset).
  const invalidCreateBody = fc.oneof(
    fc.constant<Record<string, unknown>>({}), // missing name
    fc.record({ name: fc.constant('') }), // empty name
    fc.record({ name: fc.constant('   ') }), // whitespace-only name (trimmed empty)
    fc.record({ name: fc.string({ minLength: 201, maxLength: 260 }).map((s) => `x${s}`) }), // too long
    fc.record({ name: fc.integer() }), // wrong type
    fc.record({
      name: fc.constant('ok'),
      targetPlatform: fc.string({ minLength: 1, maxLength: 12 }).map((s) => `bogus-${s}`),
    }), // unknown platform
  );

  it('POST /projects rejects invalid bodies with 400 (naming the constraint) and creates nothing', async () => {
    await fc.assert(
      fc.asyncProperty(invalidCreateBody, async (body) => {
        const store = makeRecordingStore();
        const app = makeApp(store);

        const res = await request(app)
          .post('/api/video-editor/projects')
          .set('x-test-user', 'u-1')
          .set('x-test-workspace', 'ws-1')
          .send(body as Record<string, unknown>);

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
        // The failed constraint is indicated (non-empty message).
        expect(typeof res.body.error.message).toBe('string');
        expect(res.body.error.message.length).toBeGreaterThan(0);
        // No record was created (Req 21.6).
        expect(store.log.creates).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });

  // Bodies that must fail PATCH /projects/:id validation.
  const invalidPatchBody = fc.oneof(
    fc.constant<Record<string, unknown>>({}), // empty patch — no updatable field
    fc.record({ name: fc.constant('') }), // empty name
    fc.record({ name: fc.constant('   ') }), // whitespace-only name
    fc.record({ name: fc.string({ minLength: 201, maxLength: 260 }).map((s) => `x${s}`) }), // too long
    fc.record({ targetPlatform: fc.string({ minLength: 1, maxLength: 12 }).map((s) => `bogus-${s}`) }), // unknown platform
    fc.record({ activeVersionId: fc.constant('') }), // empty activeVersionId
  );

  it('PATCH /projects/:id rejects invalid bodies with 400 and mutates nothing, even for an owned project', async () => {
    await fc.assert(
      fc.asyncProperty(invalidPatchBody, async (body) => {
        const owned = project({ name: 'original', targetPlatform: VALID_PLATFORM });
        const store = makeRecordingStore([owned]);
        const app = makeApp(store);
        const before = store.snapshot();

        const res = await request(app)
          .patch(`/api/video-editor/projects/${owned.projectId}`)
          .set('x-test-user', owned.userId)
          .set('x-test-workspace', owned.workspaceId)
          .send(body as Record<string, unknown>);

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
        expect(res.body.error.message.length).toBeGreaterThan(0);
        // Nothing mutated (Req 21.6).
        expect(store.log.updates).toHaveLength(0);
        expect(store.snapshot()).toEqual(before);
      }),
      { numRuns: 100 },
    );
  });

  it('example: a valid create/patch is accepted (positive control)', async () => {
    const store = makeRecordingStore();
    const app = makeApp(store);

    const created = await request(app)
      .post('/api/video-editor/projects')
      .set('x-test-user', 'u-1')
      .set('x-test-workspace', 'ws-1')
      .send({ name: 'My clip', targetPlatform: VALID_PLATFORM });

    expect(created.status).toBe(201);
    expect(created.body.data.name).toBe('My clip');
    expect(store.log.creates).toHaveLength(1);

    const projectId = created.body.data.projectId as string;
    const patched = await request(app)
      .patch(`/api/video-editor/projects/${projectId}`)
      .set('x-test-user', 'u-1')
      .set('x-test-workspace', 'ws-1')
      .send({ name: 'Renamed clip' });

    expect(patched.status).toBe(200);
    expect(patched.body.data.name).toBe('Renamed clip');
  });
});
