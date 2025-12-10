import { Router, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/require-auth';
import { validateRequest } from '../../middleware/validation';
import { getAuditLogsForUser, getAuditLogsForWorkspace } from '../../utils/audit-logger';
import { AuthenticatedRequest } from '../../types/express';
import { storage } from '../../mongodb-storage';
import { AuditLogModel } from '../../models/Admin/AuditLog';

const router = Router();

const PaginationQuery = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  actions: z.string().optional()
});

const WorkspaceIdParams = z.object({
  workspaceId: z.string().min(1)
});

router.get('/my-activity',
  requireAuth,
  validateRequest({ query: PaginationQuery }),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user.id;
      const { page, limit, startDate, endDate, actions } = req.query as any;
      
      const offset = (page - 1) * limit;
      
      const countQuery: any = { actorId: userId };
      if (startDate || endDate) {
        countQuery.createdAt = {};
        if (startDate) countQuery.createdAt.$gte = new Date(startDate);
        if (endDate) countQuery.createdAt.$lte = new Date(endDate);
      }
      if (actions) countQuery.action = { $in: actions.split(',') };
      
      const [logs, totalCount] = await Promise.all([
        getAuditLogsForUser(userId, {
          limit,
          offset,
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
          actions: actions ? actions.split(',') : undefined
        }),
        AuditLogModel.countDocuments(countQuery)
      ]);
      
      res.json({
        success: true,
        data: logs,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit)
        }
      });
    } catch (error: any) {
      console.error('[ACTIVITY] Error fetching user activity:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch activity logs' });
    }
  }
);

router.get('/workspace/:workspaceId/activity',
  requireAuth,
  validateRequest({ params: WorkspaceIdParams, query: PaginationQuery }),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { workspaceId } = req.params;
      const { page, limit, startDate, endDate, actions } = req.query as any;
      const userId = req.user.id;
      
      const workspace = await storage.getWorkspace(workspaceId);
      if (!workspace) {
        return res.status(404).json({ error: 'Workspace not found' });
      }
      
      const members = await storage.getWorkspaceMembers(workspaceId);
      const member = members.find(m => m.userId === userId);
      
      if (workspace.userId !== userId && (!member || !['Owner', 'Admin'].includes(member.role))) {
        return res.status(403).json({ error: 'Access denied. Owner or Admin role required.' });
      }
      
      const offset = (page - 1) * limit;
      
      const countQuery: any = { workspaceId };
      if (startDate || endDate) {
        countQuery.createdAt = {};
        if (startDate) countQuery.createdAt.$gte = new Date(startDate);
        if (endDate) countQuery.createdAt.$lte = new Date(endDate);
      }
      if (actions) countQuery.action = { $in: actions.split(',') };
      
      const [logs, totalCount] = await Promise.all([
        getAuditLogsForWorkspace(workspaceId, {
          limit,
          offset,
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
          actions: actions ? actions.split(',') : undefined
        }),
        AuditLogModel.countDocuments(countQuery)
      ]);
      
      res.json({
        success: true,
        data: logs,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit)
        }
      });
    } catch (error: any) {
      console.error('[ACTIVITY] Error fetching workspace activity:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch workspace activity logs' });
    }
  }
);

export default router;
