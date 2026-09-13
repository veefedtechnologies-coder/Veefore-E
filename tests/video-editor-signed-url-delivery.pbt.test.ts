/**
 * Property-based test for the Video_Artifact signed-URL router (task 5.4).
 *
 * Framework: vitest + fast-check + supertest (matching the repo test stack and
 * the existing `tests/video-editor-artifact-routes.test.ts` example tests).
 *
 * Property 46: Artifacts are served only via short-lived signed URLs.
 *   "For any granted artifact access, delivery uses a signed URL whose validity
 *    does not exceed 3600 seconds and never a permanent public storage path."
 *
 * **Validates: Requirements 19.3**
 *
 * Strategy — for ANY owned artifact (arbitrary artifactId / storageKey /
 * mimeType / owner identity) and ANY requested TTL (including values well above
 * the ceiling, non-positive, fractional, and non-finite), a granted request:
 *   - returns HTTP 200 with a signed, time-limited URL (bears an expiry +
 *     signature marker, i.e. NOT a bare permanent public path),
 *   - reports `expiresInSeconds` in the half-open range (0, 3600],
 *   - asks the storage backend for a TTL that never exceeds 3600 s,
 *   - never surfaces the raw storage key outside the signed URL itself
 *     (no `storageKey` field, no permanent public path leak).
 *
 * The auth + workspace middleware are stubbed so identity is driven by headers;
 * the artifact store and signing backend are injected in-memory (no DB, no real
 * S3), exercising the router's real ownership + TTL-clamping logic.
 */

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

// Stub auth: derive req.user.id from a test header (server-derived identity, Req 19.5).
vi.mock('../server/middleware/require-auth', () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    const userId = req.header('x-test-user');
    if (userId) (req as Request & { user?: unknown }).user = { id: userId };
    next();
  },
}));

// Stub workspace access: derive req.workspaceId from a test header.
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
// Test doubles (in-memory store + fake signing backend — not mocks-to-pass)
// ---------------------------------------------------------------------------

/** Single-record in-memory store keyed by the record's artifactId. */
function makeStore(record: ArtifactAccessRecord): ArtifactAccessStore {
  return {
    async findById(artifactId) {
      return artifactId === record.artifactId ? record : null;
    },
  };
}

/**
 * A fake signing backend that (a) records the TTL it was asked for and (b)
 * returns a URL that is explicitly a *signed, time-limited* link — it carries
 * an expiry query param and a signature, so a permanent public path would be
 * distinguishable from it.
 */
function makeStorage() {
  const calls: { key: string; options?: SignedUrlOptions }[] = [];
  const storage = {
    async getSignedUrl(key: string, options?: SignedUrlOptions): Promise<SignedUrlResult> {
      // Mirror the real StorageService hard cap at 24h; the router should have
      // already clamped to <= 3600 s before ever calling us.
      const expiresIn = Math.min(options?.expiresIn ?? 3600, 86400);
      calls.push({ key, options });
      return {
        url: `https://signed.example.com/${encodeURIComponent(key)}?X-Expires=${expiresIn}&X-Signature=deadbeef`,
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

// ---------------------------------------------------------------------------
// Generators — constrain to the valid input space (owned artifact + any TTL)
// ---------------------------------------------------------------------------

/**
 * A realistic identity/id token (owner userId, workspaceId, artifactId). Uses a
 * URL-safe alphanumeric charset so the value survives HTTP-header transport
 * intact — arbitrary strings with leading/trailing whitespace or control chars
 * are normalized in transit (headers are trimmed), which would spuriously break
 * the record↔request identity match. Real ids are ObjectId-like tokens anyway.
 */
const idArb = fc
  .array(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split('')), {
    minLength: 1,
    maxLength: 24,
  })
  .map((chars) => chars.join(''));

/** An unguessable lowercase-hex token of 8–16 chars (version-safe generator). */
const hexTokenArb = fc
  .array(fc.constantFrom(...'0123456789abcdef'.split('')), { minLength: 8, maxLength: 16 })
  .map((chars) => chars.join(''));

/**
 * A storage key that always looks like a private, folder-scoped object path and
 * embeds an unguessable token, so a leak of the raw key is unambiguously
 * detectable in the response.
 */
const storageKeyArb = fc
  .tuple(idArb, idArb, hexTokenArb)
  .map(([proj, cat, token]) => `video-editor/${proj}/${cat}/${token}.mp4`);

const mimeArb = fc.constantFrom('video/mp4', 'video/webm', 'image/png', 'application/json');

/**
 * Requested TTL covering: well above the ceiling, exactly at it, within it,
 * non-positive, fractional, and non-finite (NaN/Infinity) — plus `undefined`
 * to exercise the config-default path.
 */
const ttlArb = fc.oneof(
  fc.integer({ min: 3600, max: 10_000_000 }), // above/at ceiling
  fc.integer({ min: 1, max: 3599 }), // within ceiling
  fc.integer({ min: -10_000, max: 0 }), // non-positive
  fc.double({ min: 0, max: 100_000, noNaN: false }), // fractional + possible NaN/Infinity
  fc.constant(undefined),
);

describe('Property 46: Artifacts are served only via short-lived signed URLs (task 5.4)', () => {
  it('delivers a signed, <=3600s URL and never a permanent public path — Validates Requirements 19.3', async () => {
    await fc.assert(
      fc.asyncProperty(
        idArb, // artifactId
        idArb, // userId (owner)
        idArb, // workspaceId (owner)
        storageKeyArb, // private storage key
        mimeArb, // mimeType
        ttlArb, // configured signed-URL TTL
        async (artifactId, userId, workspaceId, storageKey, mimeType, ttl) => {
          const record: ArtifactAccessRecord = { artifactId, workspaceId, userId, storageKey, mimeType };
          const { storage, calls } = makeStorage();
          const app = makeApp({ store: makeStore(record), storage, signedUrlTtlSeconds: ttl });

          const res = await request(app)
            .get(`/api/video-editor/artifacts/${encodeURIComponent(artifactId)}/signed-url`)
            .set('x-test-user', userId)
            .set('x-test-workspace', workspaceId);

          // Access is granted for the owner.
          expect(res.status).toBe(200);
          expect(res.body.success).toBe(true);

          // Delivery is a signed, time-limited URL — NOT a bare permanent path.
          const url: string = res.body.data.url;
          expect(typeof url).toBe('string');
          expect(url.startsWith('https://')).toBe(true);
          expect(url).toContain('X-Expires=');
          expect(url).toContain('X-Signature=');

          // Validity is within the (0, 3600] ceiling.
          const ttlOut: number = res.body.data.expiresInSeconds;
          expect(Number.isInteger(ttlOut)).toBe(true);
          expect(ttlOut).toBeGreaterThan(0);
          expect(ttlOut).toBeLessThanOrEqual(SIGNED_URL_MAX_TTL_SECONDS);

          // expiresAt is a real, near-future instant no further out than the ceiling.
          const expiresAtMs = Date.parse(res.body.data.expiresAt);
          expect(Number.isNaN(expiresAtMs)).toBe(false);
          const deltaMs = expiresAtMs - Date.now();
          expect(deltaMs).toBeGreaterThan(0);
          expect(deltaMs).toBeLessThanOrEqual((SIGNED_URL_MAX_TTL_SECONDS + 5) * 1000);

          // The backend was asked for a TTL inside the ceiling exactly once.
          expect(calls).toHaveLength(1);
          expect(calls[0].options?.expiresIn).toBeGreaterThanOrEqual(1);
          expect(calls[0].options?.expiresIn).toBeLessThanOrEqual(SIGNED_URL_MAX_TTL_SECONDS);

          // The raw storage key is never exposed as a field, and never leaks
          // anywhere in the response outside the signed URL itself.
          expect(res.body.data.storageKey).toBeUndefined();
          const { url: _omit, ...dataWithoutUrl } = res.body.data;
          const responseSansUrl = JSON.stringify({ ...res.body, data: dataWithoutUrl });
          expect(responseSansUrl).not.toContain(storageKey);
        },
      ),
      { numRuns: 200 },
    );
  });
});
