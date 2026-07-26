/**
 * Authorized Brands Routes
 *
 * Provides endpoints for managing the Meta-authorized brand records
 * (AuthorizedBrand) associated with the authenticated user.
 *
 * Routes:
 *   GET    /                   — list all AuthorizedBrand records (ordered by authorizedAt desc)
 *   DELETE /:pageId            — remove an INACTIVE brand (reject if status is IMPORTED)
 *   POST   /:pageId/import     — import brand into a new workspace via WorkspaceService
 *
 * Satisfies Requirements: 3.5, 3.7, 5.1, 5.2, 5.3, 8.3, 8.5
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/require-auth';
import { workspaceService, WorkspaceError } from '../services/WorkspaceService';
import { AuthorizedBrandModel } from '../models/AuthorizedBrand/AuthorizedBrandModel';

const router = Router();

// ─── Error Mapping Helper ──────────────────────────────────────────────────────

/**
 * handleWorkspaceError — maps WorkspaceError codes to HTTP status codes and
 * returns a consistent error response shape.
 *
 * Error code → HTTP status mapping (mirrors the design document error table):
 *   WORKSPACE_LIMIT_REACHED        → 403
 *   WORKSPACE_NAME_CONFLICT        → 409
 *   SOCIAL_ACCOUNT_ALREADY_IMPORTED→ 409
 *   TOKEN_EXPIRED                  → 422
 *   BRAND_NOT_FOUND                → 404
 *   NOT_FOUND_OR_UNAUTHORIZED      → 403
 *   CANNOT_DELETE_LAST_WORKSPACE   → 422
 *   USER_NOT_FOUND                 → 400
 *   (any other WorkspaceError)     → 500
 */
function handleWorkspaceError(err: WorkspaceError, res: Response): Response {
  const codeToStatus: Record<string, number> = {
    WORKSPACE_LIMIT_REACHED: 403,
    WORKSPACE_NAME_CONFLICT: 409,
    SOCIAL_ACCOUNT_ALREADY_IMPORTED: 409,
    TOKEN_EXPIRED: 422,
    BRAND_NOT_FOUND: 404,
    NOT_FOUND_OR_UNAUTHORIZED: 403,
    CANNOT_DELETE_LAST_WORKSPACE: 422,
    USER_NOT_FOUND: 400,
  };

  const status = codeToStatus[err.code] ?? 500;
  return res.status(status).json({
    success: false,
    error: { code: err.code, message: err.message },
  });
}

// ─── GET / ────────────────────────────────────────────────────────────────────

/**
 * GET /api/authorized-brands
 *
 * Return all AuthorizedBrand records for the authenticated user,
 * ordered by authorizedAt descending.
 *
 * Satisfies Requirements: 8.3, 8.5
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId: string = (req as any).user?.firebaseUid ?? (req as any).userId;

    const brands = await AuthorizedBrandModel.find({ userId })
      .sort({ authorizedAt: -1 })
      .lean();

    return res.status(200).json({ success: true, data: brands });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Unexpected error retrieving authorized brands.' },
    });
  }
});

// ─── DELETE /:pageId ───────────────────────────────────────────────────────────

/**
 * DELETE /api/authorized-brands/:pageId
 *
 * Delete an INACTIVE AuthorizedBrand record.
 * - Returns 404 if the brand is not found.
 * - Returns 409 if the brand's status is 'IMPORTED' (cannot be removed).
 * - Returns 200 { success: true } on successful deletion.
 *
 * Satisfies Requirements: 3.7, 5.3
 */
router.delete('/:pageId', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId: string = (req as any).user?.firebaseUid ?? (req as any).userId;
    const { pageId } = req.params;

    const brand = await AuthorizedBrandModel.findOne({ userId, pageId });

    if (!brand) {
      return res.status(404).json({
        success: false,
        error: { code: 'BRAND_NOT_FOUND', message: 'Authorized brand not found.' },
      });
    }

    if (brand.status === 'IMPORTED') {
      return res.status(409).json({
        success: false,
        error: {
          code: 'BRAND_ALREADY_IMPORTED',
          message: 'Cannot remove an already-imported brand.',
        },
      });
    }

    await AuthorizedBrandModel.deleteOne({ _id: brand._id });

    return res.status(200).json({ success: true });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Unexpected error deleting authorized brand.' },
    });
  }
});

// ─── POST /:pageId/import ─────────────────────────────────────────────────────

/**
 * POST /api/authorized-brands/:pageId/import
 *
 * Import the authorized brand into a new workspace by calling
 * workspaceService.importAuthorizedBrand. Maps WorkspaceError codes to the
 * correct HTTP status codes via handleWorkspaceError.
 *
 * Returns { success: true, data: workspace } on success.
 *
 * Satisfies Requirements: 3.5, 5.1, 5.2, 5.3
 */
router.post('/:pageId/import', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId: string = (req as any).user?.firebaseUid ?? (req as any).userId;
    const { pageId } = req.params;
    // Optional: import into an existing workspace instead of creating a new one
    const workspaceId: string | undefined = req.body?.workspaceId || undefined;

    const workspace = await workspaceService.importAuthorizedBrand({ userId, pageId, workspaceId });

    return res.status(200).json({ success: true, data: workspace });
  } catch (err: any) {
    if (err instanceof WorkspaceError || err?.name === 'WorkspaceError') {
      return handleWorkspaceError(err as WorkspaceError, res);
    }
    // Log the actual error so we can diagnose it
    console.error('[authorized-brands/import] Unexpected error:', {
      message: err?.message,
      name: err?.name,
      code: err?.code,
      stack: err?.stack?.split('\n').slice(0, 5).join('\n'),
    });
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: err?.message ?? 'Unexpected error importing authorized brand.' },
    });
  }
});

export default router;
