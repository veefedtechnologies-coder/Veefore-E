/**
 * Workspace Routes
 *
 * All workspace lifecycle endpoints: list, create, get, rename, delete,
 * plus the plan-limits helper and the active-workspace read/write pair.
 *
 * All routes require the `requireAuth` middleware.
 * Routes with a `:id` segment additionally require `validateWorkspaceAccess`
 * to confirm the requesting user is a member of the target workspace.
 *
 * Satisfies Requirements: 2.6, 6.7, 9.1, 9.2, 9.3
 */

import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/require-auth';
import { validateWorkspaceFromParams } from '../middleware/workspace-validation';
import { workspaceService, WorkspaceError } from '../services/WorkspaceService';

// Convenience alias: validates that the calling user is a member of the workspace
// referenced by the `:id` URL segment.  Mirrors the design doc's call for
// `validateWorkspaceAccess` on /:id routes.
const validateWorkspaceAccess = validateWorkspaceFromParams('id');

const router = Router();

// ─── Error Helper ────────────────────────────────────────────────────────────

/**
 * Map a WorkspaceError code to the appropriate HTTP status code and return a
 * structured JSON error response.  Handles all domain error codes defined in
 * WorkspaceService so individual route handlers stay concise.
 */
function handleWorkspaceError(err: unknown, res: Response): Response {
  if (err instanceof WorkspaceError) {
    const statusMap: Record<string, number> = {
      WORKSPACE_LIMIT_REACHED:          403,
      WORKSPACE_NAME_CONFLICT:          409,
      SOCIAL_ACCOUNT_ALREADY_IMPORTED:  409,
      TOKEN_EXPIRED:                    422,
      BRAND_NOT_FOUND:                  404,
      NOT_FOUND_OR_UNAUTHORIZED:        403,
      CANNOT_DELETE_LAST_WORKSPACE:     422,
      USER_NOT_FOUND:                   400,
      WORKSPACE_ACCESS_DENIED:          403,
    };

    const status = statusMap[err.code] ?? 500;
    return res.status(status).json({
      success: false,
      error: { code: err.code, message: err.message },
    });
  }

  console.error('[workspace.routes] Unexpected error:', err);
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
}

/**
 * Resolve the Firebase UID for the authenticated user from the request object.
 * WorkspaceService methods expect a Firebase UID as their `userId` argument.
 */
function resolveUserId(req: Request): string {
  return (req.user as any)?.firebaseUid || (req.user as any)?.id || '';
}

// ─── GET / — List all workspaces ─────────────────────────────────────────────
/**
 * Returns all non-deleted workspaces owned by the authenticated user.
 * Satisfies Requirement 7.3
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    const workspaces = await workspaceService.getUserWorkspaces(userId);

    // PLAN ENFORCEMENT: annotate each workspace with `locked: true` when it is
    // beyond the user's current plan limit. Data is NEVER deleted on downgrade.
    // Uses the SHARED helper (which internally resolves the Mongo user id from
    // the firebaseUid `resolveUserId` returns) so the locked flags match the
    // /api/workspaces list and the SSR bootstrap exactly.
    const { computeWorkspaceLockState } = await import('../lib/workspace-lock');
    const lockState = await computeWorkspaceLockState(userId, workspaces as any[]);

    return res.json({
      success: true,
      data: lockState.annotated,
      requiresWorkspaceSelection: lockState.requiresSelection,
    });
  } catch (err) {
    return handleWorkspaceError(err, res);
  }
});

// ─── POST / — Create workspace ───────────────────────────────────────────────
/**
 * Creates a new workspace for the authenticated user, enforcing plan limits.
 * Returns 201 on success with the created workspace document.
 * Satisfies Requirements 1.1, 2.1, 2.2, 2.7
 */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { name, plan } = req.body as { name?: string; plan?: string };

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'name is required and must be a non-empty string' },
      });
    }

    const userId = resolveUserId(req);
    const workspace = await workspaceService.createWorkspace({
      ownerId: userId,
      name: name.trim(),
      plan: (plan as any) || 'FREE',
    });

    return res.status(201).json({ success: true, data: workspace });
  } catch (err) {
    return handleWorkspaceError(err, res);
  }
});

// ─── GET /limits — Plan workspace limits ─────────────────────────────────────
/**
 * Returns the user's current workspace count, plan limit, and remaining
 * capacity so the frontend can disable "Add Workspace" controls without a
 * separate limit check.
 * Satisfies Requirement 2.6
 */
router.get('/limits', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    const limits = await workspaceService.getWorkspaceLimits(userId);
    return res.json({ success: true, data: limits });
  } catch (err) {
    return handleWorkspaceError(err, res);
  }
});

// ─── GET /active — Get active workspace ──────────────────────────────────────
/**
 * Returns the user's currently active workspace with an added `socialAccountCount`
 * field for use by the dashboard shell, sidebar, and WorkspaceSwitcher.
 * Satisfies Requirements 6.5, 6.7
 */
router.get('/active', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    const workspace = await workspaceService.getActiveWorkspace(userId);

    if (!workspace) {
      return res.status(404).json({
        success: false,
        error: { code: 'NO_ACTIVE_WORKSPACE', message: 'No active workspace found' },
      });
    }

    // Count social accounts belonging to this workspace (lazy import to avoid circular deps)
    const { SocialAccountModel } = await import('../models/Social/SocialAccount');
    const socialAccountCount = await SocialAccountModel.countDocuments({
      workspaceId: (workspace as any)._id ?? (workspace as any).id,
      connectionStatus: 'ACTIVE',
    });

    const data = {
      ...(workspace as any).toObject?.() ?? workspace,
      socialAccountCount,
    };

    return res.json({ success: true, data });
  } catch (err) {
    return handleWorkspaceError(err, res);
  }
});

// ─── POST /preferred-active — Save user's preferred accessible workspace IDs ──
/**
 * Persists the user's chosen set of workspaces they want to keep accessible
 * when their plan limits them to fewer than they own.  The locking logic in
 * GET / uses this list (instead of always defaulting to oldest-first) so users
 * can choose WHICH workspace(s) to keep active after a downgrade.
 *
 * Expects `{ workspaceIds: string[] }` — must not exceed the user's plan limit.
 */
router.post('/preferred-active', requireAuth, async (req: Request, res: Response) => {
  try {
    const { workspaceIds } = req.body as { workspaceIds?: string[] };
    if (!Array.isArray(workspaceIds) || workspaceIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'workspaceIds must be a non-empty array' },
      });
    }

    const userId = resolveUserId(req);

    // Validate against plan limit
    const { getEntitlementService } = await import('../features/subscription/services/EntitlementService');
    const { getRedisClient } = await import('../lib/redis');
    const SubscriptionRepository = (await import('../features/subscription/db/repositories/SubscriptionRepository')).default;
    const entitlementService = getEntitlementService(getRedisClient(), new SubscriptionRepository());

    // Resolve mongo user id for entitlement (entitlement keys by mongo _id)
    const { User } = await import('../models/User/User');
    const userDoc = await User.findOne({
      $or: [{ firebaseUid: userId }, { _id: userId }],
    }).select('_id').lean();
    const mongoUserId = userDoc ? String((userDoc as any)._id) : userId;

    const maxWorkspaces = await entitlementService.getLimit(mongoUserId, 'maxWorkspaces');
    if (maxWorkspaces !== Infinity && workspaceIds.length > maxWorkspaces) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'EXCEEDS_PLAN_LIMIT',
          message: `Your plan allows ${maxWorkspaces} workspace${maxWorkspaces === 1 ? '' : 's'}. You selected ${workspaceIds.length}.`,
        },
      });
    }

    // Verify each workspace belongs to this user (security check)
    const workspaces = await workspaceService.getUserWorkspaces(userId);
    const ownedIds = new Set(workspaces.map((w: any) => String(w._id ?? w.id)));
    const allOwned = workspaceIds.every((id) => ownedIds.has(String(id)));
    if (!allOwned) {
      return res.status(403).json({
        success: false,
        error: { code: 'WORKSPACE_ACCESS_DENIED', message: 'One or more workspace IDs do not belong to you.' },
      });
    }

    // Persist the preference — use firebaseUid or _id to match the user doc
    await User.updateOne(
      { $or: [{ firebaseUid: userId }, { _id: userId }] },
      { $set: { preferredWorkspaceIds: workspaceIds } },
    );

    // Also switch active workspace to the first preferred one
    const firstId = workspaceIds[0];
    if (firstId) {
      try { await workspaceService.switchWorkspace(userId, firstId); } catch { /* non-fatal */ }
    }

    return res.json({ success: true, data: { preferredWorkspaceIds: workspaceIds } });
  } catch (err) {
    return handleWorkspaceError(err, res);
  }
});

// ─── POST /active — Switch active workspace ──────────────────────────────────
/**
 * Switches the authenticated user's active workspace.
 * Expects `{ workspaceId }` in the request body.
 * Satisfies Requirements 6.1, 6.2
 */
router.post('/active', requireAuth, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.body as { workspaceId?: string };

    if (!workspaceId || typeof workspaceId !== 'string') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'workspaceId is required' },
      });
    }

    const userId = resolveUserId(req);
    await workspaceService.switchWorkspace(userId, workspaceId);

    return res.json({ success: true, data: { workspaceId } });
  } catch (err) {
    return handleWorkspaceError(err, res);
  }
});

// ─── GET /:id — Get single workspace ─────────────────────────────────────────
/**
 * Returns a single workspace by ID.  The user must be a member of the workspace.
 * `validateWorkspaceAccess` middleware pre-validates membership and attaches
 * `req.workspace`; the service call provides the authoritative Mongoose document.
 * Satisfies Requirements 6.4, 10.2
 */
router.get(
  '/:id',
  requireAuth,
  validateWorkspaceAccess,
  async (req: Request, res: Response) => {
    try {
      const userId = resolveUserId(req);
      const workspace = await workspaceService.getWorkspaceById(req.params.id, userId);

      if (!workspace) {
        return res.status(403).json({
          success: false,
          error: { code: 'NOT_FOUND_OR_UNAUTHORIZED', message: 'Workspace not found or access denied' },
        });
      }

      return res.json({ success: true, data: workspace });
    } catch (err) {
      return handleWorkspaceError(err, res);
    }
  },
);

// ─── PATCH /:id — Rename workspace ───────────────────────────────────────────
/**
 * Renames a workspace.  Expects `{ name }` in the request body.
 * Satisfies Requirements 9.1, 9.2
 */
router.patch(
  '/:id',
  requireAuth,
  validateWorkspaceAccess,
  async (req: Request, res: Response) => {
    try {
      const { name } = req.body as { name?: string };

      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'name is required and must be a non-empty string' },
        });
      }

      const userId = resolveUserId(req);
      const updated = await workspaceService.renameWorkspace(
        req.params.id,
        name.trim(),
        userId,
      );

      return res.json({ success: true, data: updated });
    } catch (err) {
      return handleWorkspaceError(err, res);
    }
  },
);

// ─── DELETE /:id — Soft-delete workspace ─────────────────────────────────────
/**
 * Soft-deletes a workspace.  Cascades to WorkspaceMember and SocialAccount
 * records (per Requirement 1.6) and redirects the user's active workspace.
 * Satisfies Requirement 9.3
 */
router.delete(
  '/:id',
  requireAuth,
  validateWorkspaceAccess,
  async (req: Request, res: Response) => {
    try {
      const userId = resolveUserId(req);
      await workspaceService.deleteWorkspace(req.params.id, userId);

      return res.json({ success: true, data: { deleted: true, workspaceId: req.params.id } });
    } catch (err) {
      return handleWorkspaceError(err, res);
    }
  },
);

export default router;
