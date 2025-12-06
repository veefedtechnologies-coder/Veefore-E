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
