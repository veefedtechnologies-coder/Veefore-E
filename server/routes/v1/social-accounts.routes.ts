import { Router } from 'express';
import { socialAccountController } from '../../controllers';
import { requireAuth } from '../../middleware/require-auth';
import { validateRequest } from '../../middleware/validation';
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
  async (req: any, res) => {
    try {
      const workspaceId = req.query.workspaceId as string;
      if (!workspaceId) {
        return res.status(400).json({ error: 'workspaceId is required' });
      }
      req.params = { workspaceId };
      return socialAccountController.getByWorkspace(req, res);
    } catch (error: any) {
      console.error('[SOCIAL ACCOUNTS] Error:', error);
      return res.status(500).json({ error: error.message || 'Internal server error' });
    }
  }
);

router.get('/workspace/:workspaceId', 
  requireAuth,
  validateRequest({ params: WorkspaceIdParams }),
  socialAccountController.getByWorkspace
);

router.get('/:accountId', 
  requireAuth,
  validateRequest({ params: AccountIdParams }),
  socialAccountController.getAccount
);

router.post('/workspace/:workspaceId', 
  requireAuth,
  validateRequest({ params: WorkspaceIdParams }),
  socialAccountController.connectAccount
);

router.delete('/:accountId', 
  requireAuth,
  validateRequest({ params: AccountIdParams }),
  socialAccountController.disconnectAccount
);

router.put('/:accountId/tokens', 
  requireAuth,
  validateRequest({ params: AccountIdParams }),
  socialAccountController.updateTokens
);

router.put('/:accountId/metrics', 
  requireAuth,
  validateRequest({ params: AccountIdParams }),
  socialAccountController.updateMetrics
);

export default router;
