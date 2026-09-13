/**
 * Unit + integration tests for the Video_Artifact signed-URL router (task 5.3).
 *
 * Framework: vitest + supertest.
 *
 * Covers (design.md "Storage / Signed_URL", Req 19.1–19.4, 21.1):
 *  - An owner receives a short-lived Signed_URL whose validity never exceeds
 *    3600 s, and the response NEVER exposes the raw storage key / permanent
 *    public path (Req 19.3).
 *  - A requester from another workspace, or another user in the same workspace,
 *    is denied with HTTP 403 and NO artifact data or storage path (Req 19.1, 19.2).
 *  - An unknown artifact yields 404 and leaks nothing (Req 21.3-style).
 *  - A requested TTL above the 3600 s ceiling is clamped (Req 19.3).
 *
 * The auth + workspace middleware are stubbed so the test drives identity via
 * headers; the artifact store and storage backend are injected in-memory (no DB,
 * no real S3), exercising the router's real ownership and TTL logic.
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
  createVideoEditorArtifactRouter,
  type ArtifactAccessRecord,
  type ArtifactAccessStore,
} from '../server/features/video-editor/api/artifact.routes';
import { SIGNED_URL_MAX_TTL_SECONDS } from '../server/features/video-editor/config/video-editor.config';
import type { SignedUrlResult, SignedUrlOptions } from '../server/features/storage/services/storage.service';

// ---------------------------------------------------------------------------
// Test doubles (in-memory store + fake signing backend, not mocks-to-pass)
// ---------------------------------------------------------------------------

const OWNER = { userId: 'user-1', workspaceId: 'ws-1' };
const ARTIFACT: ArtifactAccessRecord = {
  artifactId: 'art-123',
  workspaceId: OWNER.workspaceId,
  userId: OWNER.userId,
  storageKey: 'video-editor/proj-1/renders/secret-key-abc.mp4',
  mimeType: 'video/mp4',
};

function makeStore(record: ArtifactAccessRecord | null = ARTIFACT): ArtifactAccessStore {
  return {
    async findById(artifactId) {
      return record && record.artifactId === artifactId ? record : null;
    },
  };
}

/** A fake signing backend that records the TTL it was asked for. */
function makeStorage() {
  const calls: { key: string; options?: SignedUrlOptions }[] = [];
  const storage = {
    async getSignedUrl(key: string, options?: SignedUrlOptions): Promise<SignedUrlResult> {
      // Mirror the real StorageService cap at 24h; the router should have already
      // clamped to <= 3600 s before calling.
      const expiresIn = Math.min(options?.expiresIn ?? 3600, 86400);
      calls.push({ key, options });
      return {
        url: `https://signed.example.com/${encodeURIComponent(key)}?X-Expires=${expiresIn}&sig=deadbeef`,
        expiresAt: new Date(Date.now() + expiresIn * 1000),
        key,
      };
    },
  };
  return { storage, calls };
}

function makeApp(deps: Parameters<typeof createVideoEditorArtifactRouter>[0]): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/video-editor', createVideoEditorArtifactRouter(deps));
  return app;
}

function asOwner(req: request.Test): request.Test {
  return req.set('x-test-user', OWNER.userId).set('x-test-workspace', OWNER.workspaceId);
}

describe('Video_Artifact signed-URL router (task 5.3)', () => {
  let calls: ReturnType<typeof makeStorage>['calls'];
  let app: Express;

  beforeEach(() => {
    const s = makeStorage();
    calls = s.calls;
    app = makeApp({ store: makeStore(), storage: s.storage });
  });

  it('issues a short-lived Signed_URL for an owned artifact and hides the storage key (Req 19.3)', async () => {
    const res = await asOwner(request(app).get('/api/video-editor/artifacts/art-123/signed-url'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.artifactId).toBe('art-123');
    expect(typeof res.body.data.url).toBe('string');
    expect(res.body.data.expiresInSeconds).toBeLessThanOrEqual(SIGNED_URL_MAX_TTL_SECONDS);
    expect(res.body.data.expiresInSeconds).toBeGreaterThan(0);
    expect(typeof res.body.data.expiresAt).toBe('string');

    // The raw storage key / permanent public path is NEVER returned (Req 19.3).
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain(ARTIFACT.storageKey);
    expect(res.body.data.storageKey).toBeUndefined();

    // The backend was asked for a TTL within the ceiling.
    expect(calls).toHaveLength(1);
    expect(calls[0].options?.expiresIn).toBeLessThanOrEqual(SIGNED_URL_MAX_TTL_SECONDS);
  });

  it('clamps a requested TTL above the 3600 s ceiling (Req 19.3)', async () => {
    const s = makeStorage();
    const clampedApp = makeApp({ store: makeStore(), storage: s.storage, signedUrlTtlSeconds: 999_999 });

    const res = await asOwner(request(clampedApp).get('/api/video-editor/artifacts/art-123/signed-url'));

    expect(res.status).toBe(200);
    expect(res.body.data.expiresInSeconds).toBe(SIGNED_URL_MAX_TTL_SECONDS);
    expect(s.calls[0].options?.expiresIn).toBe(SIGNED_URL_MAX_TTL_SECONDS);
  });

  it('denies a requester from another workspace with 403 and no data (Req 19.1, 19.2)', async () => {
    const res = await request(app)
      .get('/api/video-editor/artifacts/art-123/signed-url')
      .set('x-test-user', OWNER.userId)
      .set('x-test-workspace', 'ws-OTHER');

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('ARTIFACT_ACCESS_DENIED');
    expect(res.body.data).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain(ARTIFACT.storageKey);
    // No signing occurred for a denied request.
    expect(calls).toHaveLength(0);
  });

  it('denies another user in the same workspace with 403 and no data (Req 19.1, 19.2)', async () => {
    const res = await request(app)
      .get('/api/video-editor/artifacts/art-123/signed-url')
      .set('x-test-user', 'user-OTHER')
      .set('x-test-workspace', OWNER.workspaceId);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ARTIFACT_ACCESS_DENIED');
    expect(calls).toHaveLength(0);
  });

  it('returns 404 for an unknown artifact and leaks nothing', async () => {
    const res = await asOwner(request(app).get('/api/video-editor/artifacts/does-not-exist/signed-url'));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ARTIFACT_NOT_FOUND');
    expect(calls).toHaveLength(0);
  });

  it('rejects an unauthenticated request with 401', async () => {
    // No identity headers → the stubbed middleware leaves req.user/workspaceId unset.
    const res = await request(app).get('/api/video-editor/artifacts/art-123/signed-url');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(calls).toHaveLength(0);
  });
});
