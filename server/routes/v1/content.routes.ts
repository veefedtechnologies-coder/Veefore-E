import { Router } from 'express';
import { contentController } from '../../controllers';
import { requireAuth } from '../../middleware/require-auth';
import { validateRequest } from '../../middleware/validation';
import { auditMiddleware } from '../../middleware/audit-middleware';
import { AuditActions } from '../../utils/audit-logger';
import { schedulingGuards, scheduleWithQuotaGuards, bulkSchedulingGuards } from '../../middleware/apply-route-guards';
import { requireDraftPosts, requireFeature } from '../../middleware/entitlement.middleware';
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
  workspaceId: z.string().optional(),
});

router.get('/debug-counts', contentController.debugCounts);

router.get('/workspace/:workspaceId/drafts',
  requireAuth,
  // Drafts are a Creator+ feature. Free users cannot list drafts at all.
  requireFeature('draftPosts'),
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
  // Saving a post as a draft (status: 'draft') is a Creator+ feature. Publish /
  // schedule flows are untouched (they don't send status: 'draft').
  requireDraftPosts(),
  validateRequest({ params: WorkspaceIdParams }),
  auditMiddleware(AuditActions.CONTENT.CREATE, { resource: 'content' }),
  contentController.createContent
);

// Bulk scheduling — Creator plan and above. Schedules multiple existing content
// items in one request. Gated by the bulkScheduling feature + monthly quota.
router.post('/bulk-schedule',
  requireAuth,
  ...bulkSchedulingGuards,
  auditMiddleware(AuditActions.CONTENT.SCHEDULE, { resource: 'content' }),
  contentController.bulkScheduleContent
);

router.get('/top-performing',
  requireAuth,
  validateRequest({ query: PaginationQuery.partial(), params: z.object({}).catchall(z.any()) }),
  contentController.getTopPerforming
);

router.get('/:contentId',
  requireAuth,
  validateRequest({ params: ContentIdParams }),
  contentController.getContent
);

router.get('/:contentId/analytics',
  validateRequest({ params: ContentIdParams }),
  contentController.getAnalytics
);

router.post('/:contentId/sync-id',
  requireAuth,
  validateRequest({ params: ContentIdParams }),
  auditMiddleware(AuditActions.CONTENT.UPDATE, { resource: 'content' }),
  contentController.syncInstagramId
);

router.put('/:contentId',
  requireAuth,
  validateRequest({ params: ContentIdParams }),
  auditMiddleware(AuditActions.CONTENT.UPDATE, { resource: 'content' }),
  contentController.updateContent
);

router.post('/:contentId/schedule',
  requireAuth,
  ...scheduleWithQuotaGuards,
  validateRequest({ params: ContentIdParams }),
  auditMiddleware(AuditActions.CONTENT.SCHEDULE, { resource: 'content' }),
  contentController.scheduleContent
);

router.post('/:contentId/publish',
  requireAuth,
  validateRequest({ params: ContentIdParams }),
  auditMiddleware(AuditActions.CONTENT.CREATE, { resource: 'content' }),
  contentController.publishNow
);

router.put('/:contentId/reschedule',
  requireAuth,
  ...schedulingGuards,
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
