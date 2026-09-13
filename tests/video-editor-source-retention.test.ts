/**
 * Property + example tests for the Video_Project DELETE router's source-
 * retention guarantee (task 21.4).
 *
 * Framework: vitest + fast-check + supertest.
 *
 * Implements the named correctness property from design.md:
 *
 *  - **Property 50: Source media survives project deletion unless retention
 *    policy permits removal** — for any project deletion, the original
 *    `Video_Source` is retained unless the project's configured retention-policy
 *    flag (`retentionPolicyAllowsSourceDeletion`) explicitly permits its
 *    deletion. When the flag is false (the default) the immutable source bytes +
 *    records survive the delete and the `deleteProjectSources` port is never
 *    invoked; only when the flag is true are the sources removed.
 *    **Validates: Requirements 20.8**
 *
 * The auth + workspace middleware are stubbed so identity is driven by headers
 * (server-derived identity, Req 19.5); the project store is an injected
 * in-memory implementation and `deleteProjectSources` is an injected in-memory
 * source store that records every call so the tests can assert whether — and how
 * many — sources were removed. No DB, no Redis, no StorageService.
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
// In-memory project store (mirrors the mongo store's soft-delete semantics).
// ---------------------------------------------------------------------------

interface RecordingStore extends VideoProjectStore {
  /** Deep snapshot of the current records, for before/after equality checks. */
  snapshot(): Record<string, VideoProjectRecord>;
}

function makeStore(seed: VideoProjectRecord[] = []): RecordingStore {
  const records = new Map<string, VideoProjectRecord>();
  for (const r of seed) records.set(r.projectId, { ...r });

  return {
    snapshot() {
      const out: Record<string, VideoProjectRecord> = {};
      for (const [id, r] of records) out[id] = { ...r };
      return out;
    },
    async create(input: CreateProjectInput) {
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
    async findById(projectId: string) {
      const r = records.get(projectId);
      return r ? { ...r } : null;
    },
    async listByOwner(workspaceId: string, userId: string) {
      return [...records.values()]
        .filter((r) => r.status === 'active' && r.workspaceId === workspaceId && r.userId === userId)
        .map((r) => ({ ...r }));
    },
    async update(projectId: string, patch: UpdateProjectPatch) {
      const r = records.get(projectId);
      if (!r || r.status === 'deleted') return null;
      if (patch.name !== undefined) r.name = patch.name;
      if (patch.targetPlatform !== undefined) r.targetPlatform = patch.targetPlatform;
      if (patch.activeVersionId !== undefined) r.activeVersionId = patch.activeVersionId;
      r.updatedAt = new Date();
      return { ...r };
    },
    async softDelete(projectId: string) {
      const r = records.get(projectId);
      if (!r || r.status === 'deleted') return null;
      r.status = 'deleted';
      r.updatedAt = new Date();
      return { ...r };
    },
  };
}

// ---------------------------------------------------------------------------
// In-memory Video_Source store, injected as `deleteProjectSources`. It records
// every invocation and removes the source records for the project (the default
// implementation removes the immutable source bytes from StorageService and the
// VideoSource records). We assert survival by inspecting `sources`.
// ---------------------------------------------------------------------------

interface SourceStore {
  /** projectId → immutable source ids currently persisted. */
  readonly sources: Map<string, string[]>;
  /** Ordered log of projectIds passed to `deleteProjectSources`. */
  readonly deleteCalls: string[];
  /** The injectable port the router calls ONLY when retention permits deletion. */
  deleteProjectSources(projectId: string): Promise<number>;
  /** Total surviving source records across all projects. */
  totalSources(): number;
}

function makeSourceStore(seed: Record<string, string[]> = {}): SourceStore {
  const sources = new Map<string, string[]>();
  for (const [projectId, ids] of Object.entries(seed)) sources.set(projectId, [...ids]);
  const deleteCalls: string[] = [];

  return {
    sources,
    deleteCalls,
    async deleteProjectSources(projectId: string) {
      deleteCalls.push(projectId);
      const existing = sources.get(projectId) ?? [];
      sources.delete(projectId);
      return existing.length;
    },
    totalSources() {
      let n = 0;
      for (const ids of sources.values()) n += ids.length;
      return n;
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

// Identifiers ride in HTTP headers (x-test-user / x-test-workspace), which trim
// surrounding whitespace; constrain generated ids to alphanumeric tokens so the
// header round-trip is lossless.
const ALPHANUM = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');
function idArb(prefix: string) {
  return fc
    .array(fc.constantFrom(...ALPHANUM), { minLength: 1, maxLength: 10 })
    .map((chars) => `${prefix}-${chars.join('')}`);
}

// ---------------------------------------------------------------------------
// Property 50: Source media survives project deletion unless retention policy
// permits removal.
// Validates: Requirements 20.8
// ---------------------------------------------------------------------------

describe('Property 50: source media survives project deletion unless retention policy permits removal (Req 20.8)', () => {
  const scenario = fc.record({
    ownerUser: idArb('u'),
    ownerWs: idArb('w'),
    allowSourceDeletion: fc.boolean(),
    // Number of immutable Video_Source records the project owns.
    sourceCount: fc.integer({ min: 0, max: 5 }),
  });

  it('retains the original Video_Source unless the retention-policy flag permits deletion', async () => {
    await fc.assert(
      fc.asyncProperty(scenario, async (cfg) => {
        const owned = project({
          projectId: 'proj-under-test',
          userId: cfg.ownerUser,
          workspaceId: cfg.ownerWs,
          retentionPolicyAllowsSourceDeletion: cfg.allowSourceDeletion,
        });
        const store = makeStore([owned]);

        const seededSourceIds = Array.from(
          { length: cfg.sourceCount },
          (_, i) => `src-${i}`,
        );
        const sourceStore = makeSourceStore({ [owned.projectId]: seededSourceIds });
        const app = makeApp(store, {
          deleteProjectSources: sourceStore.deleteProjectSources,
        });

        const res = await request(app)
          .delete(`/api/video-editor/projects/${owned.projectId}`)
          .set('x-test-user', cfg.ownerUser)
          .set('x-test-workspace', cfg.ownerWs);

        // The project itself is always soft-deleted for the owner.
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.projectId).toBe(owned.projectId);
        expect(res.body.data.status).toBe('deleted');

        const survivors = sourceStore.sources.get(owned.projectId) ?? [];

        if (cfg.allowSourceDeletion) {
          // Retention policy explicitly permits removal → sources are deleted.
          expect(sourceStore.deleteCalls).toEqual([owned.projectId]);
          expect(res.body.data.source.deleted).toBe(true);
          expect(res.body.data.source.sourcesDeleted).toBe(cfg.sourceCount);
          expect(survivors).toHaveLength(0);
          expect(sourceStore.totalSources()).toBe(0);
        } else {
          // Default policy → the immutable source MUST survive the deletion and
          // the deletion port is never invoked.
          expect(sourceStore.deleteCalls).toHaveLength(0);
          expect(res.body.data.source.deleted).toBe(false);
          expect(res.body.data.source.sourcesDeleted).toBe(0);
          expect(survivors).toEqual(seededSourceIds);
          expect(sourceStore.totalSources()).toBe(cfg.sourceCount);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('example: default project (retention disallows deletion) retains its source', async () => {
    const owned = project({ retentionPolicyAllowsSourceDeletion: false });
    const store = makeStore([owned]);
    const sourceStore = makeSourceStore({ [owned.projectId]: ['src-original'] });
    const app = makeApp(store, { deleteProjectSources: sourceStore.deleteProjectSources });

    const res = await request(app)
      .delete(`/api/video-editor/projects/${owned.projectId}`)
      .set('x-test-user', owned.userId)
      .set('x-test-workspace', owned.workspaceId);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('deleted');
    expect(res.body.data.source).toEqual({ deleted: false, sourcesDeleted: 0 });
    // The immutable source bytes + record survive.
    expect(sourceStore.deleteCalls).toHaveLength(0);
    expect(sourceStore.sources.get(owned.projectId)).toEqual(['src-original']);
  });

  it('example: project whose retention policy permits deletion removes its source', async () => {
    const owned = project({ retentionPolicyAllowsSourceDeletion: true });
    const store = makeStore([owned]);
    const sourceStore = makeSourceStore({ [owned.projectId]: ['src-a', 'src-b'] });
    const app = makeApp(store, { deleteProjectSources: sourceStore.deleteProjectSources });

    const res = await request(app)
      .delete(`/api/video-editor/projects/${owned.projectId}`)
      .set('x-test-user', owned.userId)
      .set('x-test-workspace', owned.workspaceId);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('deleted');
    expect(res.body.data.source).toEqual({ deleted: true, sourcesDeleted: 2 });
    expect(sourceStore.deleteCalls).toEqual([owned.projectId]);
    expect(sourceStore.sources.has(owned.projectId)).toBe(false);
  });

  it('example: a non-owner delete never removes another owner\'s source (Req 20.8 + isolation)', async () => {
    // Even with a permissive retention flag, a non-owner is denied before any
    // retention decision is made, so the source is never touched.
    const owned = project({
      projectId: 'proj-secret',
      userId: 'real-owner',
      workspaceId: 'owner-ws',
      retentionPolicyAllowsSourceDeletion: true,
    });
    const store = makeStore([owned]);
    const before = store.snapshot();
    const sourceStore = makeSourceStore({ [owned.projectId]: ['src-protected'] });
    const app = makeApp(store, { deleteProjectSources: sourceStore.deleteProjectSources });

    const res = await request(app)
      .delete(`/api/video-editor/projects/${owned.projectId}`)
      .set('x-test-user', 'attacker')
      .set('x-test-workspace', 'attacker-ws');

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    // Source untouched and project unchanged.
    expect(sourceStore.deleteCalls).toHaveLength(0);
    expect(sourceStore.sources.get(owned.projectId)).toEqual(['src-protected']);
    expect(store.snapshot()).toEqual(before);
  });
});
