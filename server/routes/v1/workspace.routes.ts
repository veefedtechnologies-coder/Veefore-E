import { Router } from 'express';
import { workspaceController } from '../../controllers';
import { requireAuth } from '../../middleware/require-auth';
import { apiRateLimiter } from '../../middleware/rate-limiting-working';
import { validateRequest } from '../../middleware/validation';
import { auditMiddleware } from '../../middleware/audit-middleware';
import { AuditActions } from '../../utils/audit-logger';
import { z } from 'zod';

const router = Router();

const WorkspaceIdParams = z.object({
  workspaceId: z.string().min(1),
});

const InvitationIdParams = z.object({
  workspaceId: z.string().min(1),
  invitationId: z.string().min(1),
});

const CreateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  theme: z.string().max(50).optional(),
  aiPersonality: z.string().max(50).optional(),
});

const UpdateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  avatar: z.string().url().optional(),
  theme: z.string().max(50).optional(),
  aiPersonality: z.string().max(50).optional(),
});

const SetDefaultSchema = z.object({
  workspaceId: z.string().min(1),
});

const InviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.string().min(1).default('Viewer'),
});

router.use(requireAuth);
router.use(apiRateLimiter);

router.get('/', workspaceController.getUserWorkspaces);

router.get('/:workspaceId', 
  validateRequest({ params: WorkspaceIdParams }), 
  workspaceController.getWorkspace
);

router.post('/', 
  validateRequest({ body: CreateWorkspaceSchema }), 
  auditMiddleware(AuditActions.WORKSPACE.CREATE, { resource: 'workspace' }),
  workspaceController.createWorkspace
);

router.put('/:workspaceId', 
  validateRequest({ params: WorkspaceIdParams, body: UpdateWorkspaceSchema }), 
  auditMiddleware(AuditActions.WORKSPACE.UPDATE, { resource: 'workspace' }),
  workspaceController.updateWorkspace
);

router.delete('/:workspaceId', 
  validateRequest({ params: WorkspaceIdParams }), 
  auditMiddleware(AuditActions.WORKSPACE.DELETE, { resource: 'workspace' }),
  workspaceController.deleteWorkspace
);

router.put('/:workspaceId/default', 
  validateRequest({ params: WorkspaceIdParams, body: SetDefaultSchema }), 
  workspaceController.setDefault
);

router.post('/:workspaceId/invite-code', 
  validateRequest({ params: WorkspaceIdParams }), 
  workspaceController.generateInviteCode
);

router.get('/:workspaceId/stats', 
  validateRequest({ params: WorkspaceIdParams }), 
  workspaceController.getStats
);

router.post('/enforce-default', workspaceController.enforceDefault);

router.get('/:workspaceId/members', 
  validateRequest({ params: WorkspaceIdParams }), 
  workspaceController.getMembers
);

router.get('/:workspaceId/invitations', 
  validateRequest({ params: WorkspaceIdParams }), 
  workspaceController.getInvitations
);

router.post('/:workspaceId/invite', 
  validateRequest({ params: WorkspaceIdParams, body: InviteMemberSchema }), 
  auditMiddleware(AuditActions.WORKSPACE.INVITE_MEMBER, { resource: 'workspace' }),
  workspaceController.inviteMember
);

router.delete('/:workspaceId/invitations/:invitationId', 
  validateRequest({ params: InvitationIdParams }), 
  auditMiddleware('workspace.remove_invitation', { resource: 'workspace' }),
  workspaceController.deleteInvitation
);

export default router;
