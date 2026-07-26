import { Router, Request, Response } from 'express';
import { workspaceController } from '../../controllers';
import { requireAuth } from '../../middleware/require-auth';
import { validateWorkspaceAccess } from '../../middleware/workspace-validation';
import { apiRateLimiter } from '../../middleware/rate-limiting-working';
import { validateRequest } from '../../middleware/validation';
import { auditMiddleware } from '../../middleware/audit-middleware';
import { AuditActions } from '../../utils/audit-logger';
import { teamInviteGuards } from '../../middleware/ai-route-guards';
import { z } from 'zod';

// ─── Error handler helper ─────────────────────────────────────────────────────
/**
 * Maps WorkspaceError codes to appropriate HTTP status codes and sends a
 * consistent `{ success, error: { code, message } }` response shape.
 * Requirements: 10.2, 10.3, 10.4
 */
function handleWorkspaceError(err: any, res: Response): Response {
  const code: string = err?.code ?? 'INTERNAL_ERROR';
  const message: string = err?.message ?? 'An unexpected error occurred.';
  const statusMap: Record<string, number> = {
    WORKSPACE_LIMIT_REACHED: 403,
    WORKSPACE_NAME_CONFLICT: 409,
    SOCIAL_ACCOUNT_ALREADY_IMPORTED: 409,
    TOKEN_EXPIRED: 422,
    BRAND_NOT_FOUND: 404,
    NOT_FOUND_OR_UNAUTHORIZED: 403,
    CANNOT_DELETE_LAST_WORKSPACE: 422,
    USER_NOT_FOUND: 400,
    WORKSPACE_ACCESS_DENIED: 403,
  };
  const status = statusMap[code] ?? 500;
  return res.status(status).json({ success: false, error: { code, message } });
}

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
  aiConfiguration: z.object({
    aiModel: z.string().optional(),
    creativityLevel: z.number().min(0).max(1).optional(),
    optimizationGoals: z.string().optional(),
    aiPersona: z.string().optional(),
    captionStyle: z.string().optional(),
    responseLength: z.string().optional(),
    multilingual: z.string().optional(),
    videoEngine: z.string().optional(),
    thumbnailStyle: z.string().optional(),
    autoHashtags: z.boolean().optional(),
    contentSafety: z.string().optional(),
    aiMemory: z.string().optional(),
    autoLearning: z.boolean().optional(),
    googleAiStudioKey: z.string().optional(),
    openAiKey: z.string().optional(),
  }).optional(),
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

// ─── Members sub-routes ───────────────────────────────────────────────────────

// GET /api/workspaces/:workspaceId/members — OWNER or ADMIN only
// Requirements: 10.2, 10.3
router.get('/:workspaceId/members',
  requireAuth,
  validateWorkspaceAccess({ source: 'params', paramName: 'workspaceId' }),
  async (req: any, res) => {
    try {
      const workspaceRole = req.workspaceRole;
      if (!workspaceRole || !['OWNER', 'ADMIN'].includes(workspaceRole)) {
        return res.status(403).json({ success: false, error: { code: 'INSUFFICIENT_ROLE', message: 'Only OWNER or ADMIN can view workspace members.' } });
      }
      const { WorkspaceMemberModel } = await import('../../models/Workspace/WorkspaceMemberModel');
      const members = await WorkspaceMemberModel.find({ workspaceId: req.params.workspaceId }).lean();
      return res.json({ success: true, data: members });
    } catch (err) {
      return handleWorkspaceError(err, res);
    }
  }
);

// POST /api/workspaces/:workspaceId/members — 501 stub (team feature not yet active)
// Requirements: 10.3
router.post('/:workspaceId/members',
  requireAuth,
  validateWorkspaceAccess({ source: 'params', paramName: 'workspaceId' }),
  (req: Request, res: Response) => {
    const body = req.body;
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'Request body must be a JSON object.' } });
    }
    return res.status(501).json({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Team member management is not yet active.' } });
  }
);

// DELETE /api/workspaces/:workspaceId/members/:memberId — 501 stub (team feature not yet active)
// Requirements: 10.4
router.delete('/:workspaceId/members/:memberId',
  requireAuth,
  validateWorkspaceAccess({ source: 'params', paramName: 'workspaceId' }),
  (req: Request, res: Response) => {
    if (!req.params.memberId) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'memberId is required.' } });
    }
    return res.status(501).json({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Team member management is not yet active.' } });
  }
);

router.get('/:workspaceId/invitations', 
  validateRequest({ params: WorkspaceIdParams }), 
  workspaceController.getInvitations
);

router.post('/:workspaceId/invite', 
  validateRequest({ params: WorkspaceIdParams, body: InviteMemberSchema }), 
  ...teamInviteGuards,
  auditMiddleware(AuditActions.WORKSPACE.INVITE_MEMBER, { resource: 'workspace' }),
  workspaceController.inviteMember
);

router.delete('/:workspaceId/invitations/:invitationId', 
  validateRequest({ params: InvitationIdParams }), 
  auditMiddleware('workspace.remove_invitation', { resource: 'workspace' }),
  workspaceController.deleteInvitation
);

export default router;
