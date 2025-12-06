import { Router } from 'express';
import { workspaceController } from '../../controllers';

const router = Router();

router.get('/', workspaceController.getUserWorkspaces);
router.get('/:workspaceId', workspaceController.getWorkspace);
router.post('/', workspaceController.createWorkspace);
router.put('/:workspaceId', workspaceController.updateWorkspace);
router.delete('/:workspaceId', workspaceController.deleteWorkspace);
router.put('/:workspaceId/default', workspaceController.setDefault);
router.post('/:workspaceId/invite-code', workspaceController.generateInviteCode);
router.get('/:workspaceId/stats', workspaceController.getStats);

export default router;
