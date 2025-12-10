import { Router } from 'express';
import { contentController } from '../../controllers';
import { requireAuth } from '../../middleware/require-auth';
import { validateRequest } from '../../middleware/validation';
import { auditMiddleware } from '../../middleware/audit-middleware';
import { AuditActions } from '../../utils/audit-logger';
import { z } from 'zod';

const router = Router();

const ContentIdParams = z.object({
  contentId: z.string().min(1),
});

const WorkspaceIdParams = z.object({
  workspaceId: z.string().min(1),
});

const WorkspaceAndContentParams = z.object({
  workspaceId: z.string().min(1),
  contentId: z.string().min(1),
});

const PaginationQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

router.get('/workspace/:workspaceId/drafts', 
  requireAuth,
  validateRequest({ params: WorkspaceIdParams, query: PaginationQuery }),
  contentController.getDrafts
);

router.get('/workspace/:workspaceId/scheduled', 
  requireAuth,
  validateRequest({ params: WorkspaceIdParams }),
  contentController.getScheduled
);

router.get('/workspace/:workspaceId', 
  requireAuth,
  validateRequest({ params: WorkspaceIdParams, query: PaginationQuery }),
  contentController.getByWorkspace
);

router.post('/workspace/:workspaceId', 
  requireAuth,
  validateRequest({ params: WorkspaceIdParams }),
  auditMiddleware(AuditActions.CONTENT.CREATE, { resource: 'content' }),
  contentController.createContent
);

router.get('/:contentId', 
  requireAuth,
  validateRequest({ params: ContentIdParams }),
  contentController.getContent
);

router.put('/:contentId', 
  requireAuth,
  validateRequest({ params: ContentIdParams }),
  auditMiddleware(AuditActions.CONTENT.UPDATE, { resource: 'content' }),
  contentController.updateContent
);

router.post('/:contentId/schedule', 
  requireAuth,
  validateRequest({ params: ContentIdParams }),
  auditMiddleware(AuditActions.CONTENT.SCHEDULE, { resource: 'content' }),
  contentController.scheduleContent
);

router.put('/:contentId/reschedule', 
  requireAuth,
  validateRequest({ params: ContentIdParams }),
  auditMiddleware(AuditActions.CONTENT.RESCHEDULE, { resource: 'content' }),
  contentController.rescheduleContent
);

router.post('/:contentId/cancel-schedule', 
  requireAuth,
  validateRequest({ params: ContentIdParams }),
  auditMiddleware('content.cancel_schedule', { resource: 'content' }),
  contentController.cancelSchedule
);

router.post('/:contentId/archive', 
  requireAuth,
  validateRequest({ params: ContentIdParams }),
  auditMiddleware('content.archive', { resource: 'content' }),
  contentController.archiveContent
);

router.delete('/:contentId', 
  requireAuth,
  validateRequest({ params: ContentIdParams }),
  auditMiddleware(AuditActions.CONTENT.DELETE, { resource: 'content' }),
  contentController.deleteContent
);

export default router;
