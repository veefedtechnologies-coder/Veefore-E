import { Router, Request, Response, NextFunction } from 'express';
import { socialAccountController } from '../../controllers';
import { requireAuth } from '../../middleware/require-auth';
import { validateRequest } from '../../middleware/validation';
import { validateWorkspaceAccess, requireWorkspaceMember } from '../../middleware/workspace-validation';
import { auditMiddleware } from '../../middleware/audit-middleware';
import { AuditActions } from '../../utils/audit-logger';
import { syncRateLimiter } from '../../middleware/rate-limiting-working';
import { z } from 'zod';

const router = Router();

const AccountIdParams = z.object({
  accountId: z.string().min(1),
});

const WorkspaceIdParams = z.object({
  workspaceId: z.string().min(1),
});

router.get('/',
  requireAuth,
  validateWorkspaceAccess({ source: 'query' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const workspaceId = req.query.workspaceId as string;
      if (!workspaceId || workspaceId === 'undefined' || workspaceId === 'null') {
        console.warn('[SOCIAL ACCOUNTS] Invalid workspaceId received:', workspaceId);
        return res.status(400).json({ error: 'Valid workspaceId is required' });
      }
      req.params = { workspaceId };
      return socialAccountController.getByWorkspace(req, res, next);
    } catch (error: any) {
      console.error('[SOCIAL ACCOUNTS] Error:', error);
      return res.status(500).json({ error: error.message || 'Internal server error' });
    }
  }
);

router.get('/workspace/:workspaceId',
  requireAuth,
  validateWorkspaceAccess({ source: 'params' }),
  validateRequest({ params: WorkspaceIdParams }),
  socialAccountController.getByWorkspace
);

router.get('/:accountId',
  requireAuth,
  validateRequest({ params: AccountIdParams }),
  requireWorkspaceMember('accountId'),
  socialAccountController.getAccount
);

router.post('/workspace/:workspaceId',
  requireAuth,
  validateWorkspaceAccess({ source: 'params' }),
  validateRequest({ params: WorkspaceIdParams }),
  auditMiddleware(AuditActions.SOCIAL_ACCOUNT.CONNECT, { resource: 'social_account' }),
  socialAccountController.connectAccount
);

router.delete('/:accountId',
  requireAuth,
  validateRequest({ params: AccountIdParams }),
  requireWorkspaceMember('accountId'),
  auditMiddleware(AuditActions.SOCIAL_ACCOUNT.DISCONNECT, { resource: 'social_account' }),
  socialAccountController.disconnectAccount
);

router.put('/:accountId/tokens',
  requireAuth,
  validateRequest({ params: AccountIdParams }),
  requireWorkspaceMember('accountId'),
  auditMiddleware(AuditActions.SOCIAL_ACCOUNT.REFRESH, { resource: 'social_account' }),
  socialAccountController.updateTokens
);

router.put('/:accountId/metrics',
  requireAuth,
  syncRateLimiter,
  validateRequest({ params: AccountIdParams }),
  requireWorkspaceMember('accountId'),
  socialAccountController.updateMetrics
);

// Add POST support for mobile app compatibility (P1-5 FIX)
router.post('/:accountId/metrics',
  requireAuth,
  syncRateLimiter,
  validateRequest({ params: AccountIdParams }),
  requireWorkspaceMember('accountId'),
  socialAccountController.updateMetrics
);

export default router;
