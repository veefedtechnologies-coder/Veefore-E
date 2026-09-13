/**
 * Tests for the source-ingestion router endpoint `POST /projects/:id/sources`
 * (task 7.3 HTTP seam, Req 3.2–3.11, 19.1, 19.2).
 *
 * Framework: vitest + supertest.
 *
 * This endpoint is the missing HTTP path that lets a `Video_Source` with
 * `durationMs > 0` be created, which the conversational `/converse` gate
 * requires. These exercise its wiring:
 *
 *  - a valid multipart upload validates + stores + probes and returns 201 with a
 *    populated `durationMs` (Req 3.2, 3.7);
 *  - a rejected upload (bad signature / size) surfaces as a 400
 *    `SOURCE_INGESTION_REJECTED` and stores nothing (Req 3.3, 3.4);
 *  - a probe failure surfaces as a 503 `SOURCE_PROBE_FAILED` — never a fabricated
 *    success (No-Mock, Req 3.8, 23.1);
 *  - a request with neither a file nor a storageKey/sourceUrl is a 400
 *    `SOURCE_UPLOAD_REQUIRED`;
 *  - a non-owner is rejected with 403 and no ingestion runs (Req 19.1, 19.2).
 *
 * Auth + workspace middleware are stubbed so identity is header-driven
 * (server-derived, Req 19.5); the Media_Ingestion_Service and the project store
 * are injected stubs, so the test runs with no DB, FFmpeg, or Redis.
 */

import { describe, it, expect, vi } from 'vitest';
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import request from 'supertest';

// Stub auth: identity comes from a test header (Req 19.5).
vi.mock('../server/middleware/require-auth', () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    const userId = req.header('x-test-user');
    if (userId) (req as Request & { user?: unknown }).user = { id: userId };
    next();
  },
}));

// Stub workspace access: workspace from a test header.
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
  type VideoProjectStore,
  type VideoProjectRecord,
} from '../server/features/video-editor/api/project.routes';

// ---------------------------------------------------------------------------
// Fixtures & helpers
// ---------------------------------------------------------------------------

const OWNER = { user: 'owner-user', ws: 'owner-ws' };

function projectRecord(overrides: Partial<VideoProjectRecord> = {}): VideoProjectRecord {
  const now = new Date();
  return {
    projectId: 'proj-1',
    userId: OWNER.user,
    workspaceId: OWNER.ws,
    name: 'My clip',
    activeVersionId: 'vv-active',
    retentionPolicyAllowsSourceDeletion: false,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeStore(project: VideoProjectRecord): VideoProjectStore {
  return {
    async create() {
      throw new Error('not used');
    },
    async findById(projectId) {
      return projectId === project.projectId ? { ...project } : null;
    },
    async listByOwner() {
      return [{ ...project }];
    },
    async update() {
      return { ...project };
    },
    async softDelete() {
      return { ...project };
    },
  };
}

/**
 * A structural stand-in for `MediaIngestionRejectedError` — carries the `name`
 * and `reason` the router detects (`isMediaIngestionRejected`) without importing
 * the heavy service module (which pulls FFmpeg + storage side effects).
 */
class FakeRejectedError extends Error {
  readonly reason = 'UNSUPPORTED_FORMAT';
  readonly code = 'UNSUPPORTED_FORMAT';
  readonly statusCode = 415;
  constructor(message: string) {
    super(message);
    this.name = 'MediaIngestionRejectedError';
  }
}

/** A prepared source with the probe-derived fields the response echoes. */
function preparedSource(overrides: Record<string, unknown> = {}) {
  return {
    source: {
      sourceId: 'src-1',
      storageKey: 'video-editor/proj-1/original/src-1',
      container: 'mp4',
      durationMs: 15000,
      width: 1920,
      height: 1080,
      fps: 30,
      ...overrides,
    },
  };
}

/** A fake Media_Ingestion_Service with injectable behaviour per test. */
function makeMediaIngestion(
  overrides: Partial<VideoEditorRouterDeps['mediaIngestion']> = {},
): NonNullable<VideoEditorRouterDeps['mediaIngestion']> {
  return {
    validateAndAccept: vi.fn(async () => ({ source: { sourceId: 'src-1' } })) as any,
    probeAndPrepare: vi.fn(async () => preparedSource()) as any,
    ingestFromRemoteUrl: vi.fn(async () => ({ source: { sourceId: 'src-1' } })) as any,
    ...overrides,
  } as NonNullable<VideoEditorRouterDeps['mediaIngestion']>;
}

/** Assemble a router+app with stubbed collaborators. */
function makeApp(overrides: Partial<VideoEditorRouterDeps> = {}): {
  app: Express;
  mediaIngestion: NonNullable<VideoEditorRouterDeps['mediaIngestion']>;
  enqueueAnalysis: ReturnType<typeof vi.fn>;
} {
  const project =
    (overrides as { __project?: VideoProjectRecord }).__project ?? projectRecord();
  delete (overrides as { __project?: VideoProjectRecord }).__project;

  const mediaIngestion = (overrides.mediaIngestion ?? makeMediaIngestion()) as NonNullable<
    VideoEditorRouterDeps['mediaIngestion']
  >;
  const enqueueAnalysis = vi.fn(async () => 'queue-analysis-1');

  const deps: VideoEditorRouterDeps = {
    store: makeStore(project),
    mediaIngestion,
    enqueueAnalysis,
    downloadStorageBytes: async () => ({ buffer: Buffer.from('stored-bytes'), contentType: 'video/mp4' }),
    ...overrides,
  };

  const app = express();
  app.use(express.json());
  app.use('/api/video-editor', createVideoEditorProjectRouter(deps));
  return { app, mediaIngestion, enqueueAnalysis };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /projects/:id/sources — source ingestion (task 7.3)', () => {
  it('(a) accepts a valid multipart upload → 201 with durationMs > 0', async () => {
    const { app, mediaIngestion, enqueueAnalysis } = makeApp();

    const res = await request(app)
      .post('/api/video-editor/projects/proj-1/sources')
      .set('x-test-user', OWNER.user)
      .set('x-test-workspace', OWNER.ws)
      .attach('file', Buffer.from('fake-mp4-bytes'), 'clip.mp4');

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.projectId).toBe('proj-1');
    expect(res.body.data.sourceId).toBe('src-1');
    expect(res.body.data.status).toBe('ready');
    expect(res.body.data.durationMs).toBe(15000);
    expect(res.body.data.durationMs).toBeGreaterThan(0);
    expect(res.body.data.width).toBe(1920);
    expect(res.body.data.analysisQueued).toBe(true);

    // Validate → probe → enqueue all ran, in that order.
    expect(mediaIngestion.validateAndAccept).toHaveBeenCalledTimes(1);
    expect(mediaIngestion.probeAndPrepare).toHaveBeenCalledWith('src-1');
    expect(enqueueAnalysis).toHaveBeenCalledTimes(1);
  });

  it('(a2) still returns 201 with analysisQueued=false when the queue is unavailable', async () => {
    const { app } = makeApp({ enqueueAnalysis: vi.fn(async () => null) });

    const res = await request(app)
      .post('/api/video-editor/projects/proj-1/sources')
      .set('x-test-user', OWNER.user)
      .set('x-test-workspace', OWNER.ws)
      .attach('file', Buffer.from('fake-mp4-bytes'), 'clip.mp4');

    expect(res.status).toBe(201);
    expect(res.body.data.analysisQueued).toBe(false);
    // The source is still editable.
    expect(res.body.data.durationMs).toBeGreaterThan(0);
  });

  it('(b) maps a rejected upload to 400 SOURCE_INGESTION_REJECTED and stores nothing', async () => {
    const mediaIngestion = makeMediaIngestion({
      validateAndAccept: vi.fn(async () => {
        throw new FakeRejectedError('Upload rejected: unsupported actual media format.');
      }) as any,
    });
    const { app } = makeApp({ mediaIngestion });

    const res = await request(app)
      .post('/api/video-editor/projects/proj-1/sources')
      .set('x-test-user', OWNER.user)
      .set('x-test-workspace', OWNER.ws)
      .attach('file', Buffer.from('not-a-video'), 'evil.txt');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('SOURCE_INGESTION_REJECTED');
    expect(res.body.error.message).toContain('unsupported actual media format');
    // Never probed after a rejection (nothing was stored).
    expect(mediaIngestion.probeAndPrepare).not.toHaveBeenCalled();
  });

  it('(c) maps a probe failure to 503 SOURCE_PROBE_FAILED (no fabricated success)', async () => {
    const mediaIngestion = makeMediaIngestion({
      probeAndPrepare: vi.fn(async () => {
        throw new Error('ffprobe binary not found');
      }) as any,
    });
    const { app } = makeApp({ mediaIngestion });

    const res = await request(app)
      .post('/api/video-editor/projects/proj-1/sources')
      .set('x-test-user', OWNER.user)
      .set('x-test-workspace', OWNER.ws)
      .attach('file', Buffer.from('fake-mp4-bytes'), 'clip.mp4');

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('SOURCE_PROBE_FAILED');
    // The bytes were accepted+stored, but no success is fabricated.
    expect(mediaIngestion.validateAndAccept).toHaveBeenCalledTimes(1);
  });

  it('(d) rejects a request with no file and no storageKey/sourceUrl → 400 SOURCE_UPLOAD_REQUIRED', async () => {
    const { app, mediaIngestion } = makeApp();

    const res = await request(app)
      .post('/api/video-editor/projects/proj-1/sources')
      .set('x-test-user', OWNER.user)
      .set('x-test-workspace', OWNER.ws)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('SOURCE_UPLOAD_REQUIRED');
    expect(mediaIngestion.validateAndAccept).not.toHaveBeenCalled();
    expect(mediaIngestion.ingestFromRemoteUrl).not.toHaveBeenCalled();
  });

  it('(e) rejects a non-owner with 403 and runs no ingestion (Req 19.1, 19.2)', async () => {
    const { app, mediaIngestion } = makeApp();

    const res = await request(app)
      .post('/api/video-editor/projects/proj-1/sources')
      .set('x-test-user', 'intruder')
      .set('x-test-workspace', 'intruder-ws')
      .attach('file', Buffer.from('fake-mp4-bytes'), 'clip.mp4');

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('PROJECT_ACCESS_DENIED');
    expect(mediaIngestion.validateAndAccept).not.toHaveBeenCalled();
  });

  it('ingests a source the user already uploaded via storageKey (VeeGPT hand-off)', async () => {
    const downloadStorageBytes = vi.fn(async () => ({
      buffer: Buffer.from('stored-bytes'),
      contentType: 'video/mp4',
    }));
    const { app, mediaIngestion } = makeApp({ downloadStorageBytes });

    const res = await request(app)
      .post('/api/video-editor/projects/proj-1/sources')
      .set('x-test-user', OWNER.user)
      .set('x-test-workspace', OWNER.ws)
      .send({ storageKey: 'chat-attachments/owner-ws/clip.mp4', fileName: 'clip.mp4' });

    expect(res.status).toBe(201);
    expect(res.body.data.sourceId).toBe('src-1');
    expect(downloadStorageBytes).toHaveBeenCalledWith('chat-attachments/owner-ws/clip.mp4');
    expect(mediaIngestion.validateAndAccept).toHaveBeenCalledTimes(1);
  });

  it('ingests a remote sourceUrl via the SSRF-guarded path', async () => {
    const { app, mediaIngestion } = makeApp();

    const res = await request(app)
      .post('/api/video-editor/projects/proj-1/sources')
      .set('x-test-user', OWNER.user)
      .set('x-test-workspace', OWNER.ws)
      .send({ sourceUrl: 'https://cdn.example.com/clip.mp4' });

    expect(res.status).toBe(201);
    expect(res.body.data.sourceId).toBe('src-1');
    expect(mediaIngestion.ingestFromRemoteUrl).toHaveBeenCalledTimes(1);
    expect(mediaIngestion.validateAndAccept).not.toHaveBeenCalled();
  });
});
