/**
 * Video_Artifact signed-URL router — mounted at `/api/video-editor` (task 5.3).
 *
 * Exposes `GET /api/video-editor/artifacts/:artifactId/signed-url`, the ONLY
 * way artifact bytes are delivered to a client. Every route is guarded by
 * `requireAuth` then `validateWorkspaceAccess` (workspace membership) plus a
 * per-artifact ownership check:
 *
 *   - The artifact must belong to the requester's active workspace AND user;
 *     a non-owner is rejected with HTTP 403 and NO artifact data or storage
 *     path (Req 19.1, 19.2).
 *   - An unknown artifact yields the conventional 404 and leaks nothing
 *     (Req 21.3-style not-found behaviour).
 *
 * On success the endpoint returns a short-lived `StorageService.getSignedUrl`
 * link whose validity NEVER exceeds `SIGNED_URL_MAX_TTL_SECONDS` (3600 s,
 * single-sourced from the video-editor config) and NEVER exposes a permanent
 * public storage path (Req 19.3). Expiry/invalidity of the issued link is
 * enforced by the Storage_Service's signed-URL mechanism itself: an expired or
 * tampered signature is rejected by the storage backend and returns no content
 * (Req 19.4).
 *
 * The router is a factory so the artifact store and storage backend can be
 * injected in tests (mirroring `createVideoEditorProjectRouter`). The defaults
 * use the `ArtifactRepository` and the shared `StorageService`.
 */

import { Router, type Request, type Response } from 'express';

import { requireAuth } from '../../../middleware/require-auth';
import { validateWorkspaceAccess } from '../../../middleware/workspace-validation';
import { logger } from '../../../config/logger';
import { SIGNED_URL_MAX_TTL_SECONDS } from '../config/video-editor.config';
import { getArtifactRepository } from '../services/artifact-repository.service';
import type { IStorageService, SignedUrlResult } from '../../storage/services/storage.service';
import { getStorageService } from '../../storage/services/storage.service';
import { ok, fail } from './error-envelope';

const COMPONENT = 'videoEditor.ArtifactRouter';

// ── Records & store abstraction ─────────────────────────────────────────────

/**
 * The subset of a `Video_Artifact` the signed-URL endpoint needs. Deliberately
 * excludes provenance and any cross-tenant data — only ownership fields and the
 * storage key (used server-side only, never returned to the client).
 */
export interface ArtifactAccessRecord {
  artifactId: string;
  workspaceId: string;
  userId: string;
  storageKey: string;
  mimeType: string;
}

/**
 * Persistence port for artifact lookup. Injectable so the signed-URL delivery
 * property test (task 5.4) can drive an in-memory store without a database.
 */
export interface ArtifactAccessStore {
  /** Look up by artifactId regardless of owner (ownership is enforced by the router). */
  findById(artifactId: string): Promise<ArtifactAccessRecord | null>;
}

/** Default store reading `VideoArtifact` documents via the ArtifactRepository. */
export const mongoArtifactAccessStore: ArtifactAccessStore = {
  async findById(artifactId) {
    const doc = await getArtifactRepository().getArtifact(artifactId);
    if (!doc) return null;
    return {
      artifactId: String(doc.artifactId),
      workspaceId: String(doc.workspaceId),
      userId: String(doc.userId),
      storageKey: String(doc.storageKey),
      mimeType: String(doc.mimeType),
    };
  },
};

// ── Envelope helpers ────────────────────────────────────────────────────────
// `ok` / `fail` are the shared Video Editor envelope helpers (task 21.1)
// imported above; the response shape + secret redaction are single-sourced.

interface RequestContext {
  userId: string;
  workspaceId: string;
}

/**
 * Read the server-derived identity + active workspace the auth and workspace
 * middleware attached. Never trusts client-provided values (Req 19.5).
 */
function resolveContext(req: Request): RequestContext | null {
  const userId = (req as Request & { user?: { id?: unknown } }).user?.id;
  const workspaceId = (req as Request & { workspaceId?: unknown }).workspaceId;
  if (!userId || !workspaceId) return null;
  return { userId: String(userId), workspaceId: String(workspaceId) };
}

// ── Router factory ──────────────────────────────────────────────────────────

export interface VideoEditorArtifactRouterDeps {
  /** Artifact lookup store. Injectable for tests; defaults to the Mongoose-backed store. */
  store?: ArtifactAccessStore;
  /**
   * Storage backend used to mint signed URLs. Injectable for tests; defaults to
   * the shared process-wide `StorageService`.
   */
  storage?: Pick<IStorageService, 'getSignedUrl'>;
  /**
   * Signed-URL validity in seconds. Clamped to `[1, SIGNED_URL_MAX_TTL_SECONDS]`
   * so an issued link never outlives the 3600 s ceiling (Req 19.3). Defaults to
   * the config ceiling.
   */
  signedUrlTtlSeconds?: number;
}

/**
 * Build the Video_Artifact signed-URL router. Dependencies are injectable for
 * testing; the defaults use the Mongoose-backed artifact store and the shared
 * `StorageService`.
 */
export function createVideoEditorArtifactRouter(
  deps: VideoEditorArtifactRouterDeps = {},
): Router {
  const router = Router();
  const store = deps.store ?? mongoArtifactAccessStore;
  const storage = deps.storage ?? getStorageService();

  // Clamp the requested TTL into (0, ceiling]; the Storage_Service also caps at
  // 24h, but we tighten to the 3600 s video-editor ceiling here (Req 19.3).
  const requestedTtl = deps.signedUrlTtlSeconds ?? SIGNED_URL_MAX_TTL_SECONDS;
  const ttlSeconds = Math.min(
    SIGNED_URL_MAX_TTL_SECONDS,
    Math.max(1, Math.floor(Number.isFinite(requestedTtl) ? requestedTtl : SIGNED_URL_MAX_TTL_SECONDS)),
  );

  // requireAuth → validateWorkspaceAccess is applied to every route so no
  // unauthenticated or cross-workspace request ever reaches a handler.
  router.use(requireAuth, validateWorkspaceAccess());

  // GET /artifacts/:artifactId/signed-url — issue a short-lived Signed_URL for an
  // owned artifact (Req 19.3, 19.4, 21.1). No permanent public path is ever
  // returned; the storage key is used server-side only.
  router.get('/artifacts/:artifactId/signed-url', async (req: Request, res: Response) => {
    const ctx = resolveContext(req);
    if (!ctx) return fail(res, 401, 'UNAUTHENTICATED', 'Authentication required');

    const artifactId = req.params.artifactId;
    if (!artifactId || artifactId.trim().length === 0) {
      return fail(res, 400, 'VALIDATION_ERROR', 'artifactId: a valid artifact id is required');
    }

    try {
      const artifact = await store.findById(artifactId);

      // Unknown artifact → 404, leaking nothing.
      if (!artifact) {
        return fail(res, 404, 'ARTIFACT_NOT_FOUND', 'Artifact not found');
      }

      // Cross-workspace or cross-user access → 403 with NO artifact data or
      // storage path (Req 19.1, 19.2).
      if (artifact.workspaceId !== ctx.workspaceId || artifact.userId !== ctx.userId) {
        logger.warn('Video artifact access denied', {
          component: COMPONENT,
          userId: ctx.userId,
          workspaceId: ctx.workspaceId,
          artifactId,
        });
        return fail(res, 403, 'ARTIFACT_ACCESS_DENIED', 'You do not have access to this artifact');
      }

      // Mint a short-lived Signed_URL (≤ 3600 s). The storage key never leaves
      // the server; only the signed link + its expiry are returned (Req 19.3).
      const signed: SignedUrlResult = await storage.getSignedUrl(artifact.storageKey, {
        expiresIn: ttlSeconds,
        responseContentType: artifact.mimeType,
      });

      logger.info('Video artifact signed URL issued', {
        component: COMPONENT,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        artifactId,
        expiresInSeconds: ttlSeconds,
      });

      return ok(res, {
        artifactId: artifact.artifactId,
        url: signed.url,
        expiresAt: signed.expiresAt.toISOString(),
        expiresInSeconds: ttlSeconds,
      });
    } catch (err) {
      logger.error('Video artifact signed-URL request failed', err as Error, {
        component: COMPONENT,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        artifactId,
      });
      return fail(
        res,
        500,
        'VIDEO_ARTIFACT_ERROR',
        'The artifact signed-URL request could not be completed',
      );
    }
  });

  return router;
}

/** Default router used when mounting in `server/routes.ts` (task 5.3). */
export const videoEditorArtifactRouter = createVideoEditorArtifactRouter();
