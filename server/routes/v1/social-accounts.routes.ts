import { Router } from 'express';
import { socialAccountController } from '../../controllers';

const router = Router();

router.get('/:accountId', socialAccountController.getAccount);
router.get('/', socialAccountController.getByWorkspace);
router.post('/', socialAccountController.connectAccount);
router.delete('/:accountId', socialAccountController.disconnectAccount);
router.put('/:accountId/tokens', socialAccountController.updateTokens);
router.put('/:accountId/metrics', socialAccountController.updateMetrics);

export default router;
