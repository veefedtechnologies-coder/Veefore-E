import { Router } from 'express';
import { schedulerController } from '../../controllers';
import { requireAuth } from '../../middleware/require-auth';
import { validateWorkspaceAccess } from '../../middleware/workspace-validation';
import { validateRequest } from '../../middleware/validation';
import { scheduleWithQuotaGuards } from '../../middleware/apply-route-guards';
import { requireWorkspaceAccessible } from '../../middleware/entitlement.middleware';
import { z } from 'zod';

const router = Router();

const ContentIdParams = z.object({
  id: z.string().min(1),
});

const CreateScheduledContentSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(5000),
  platform: z.string().min(1).max(50),
  scheduledAt: z.union([z.string(), z.coerce.date()]),
  workspaceId: z.string().min(1),
  mediaUrl: z.string().url().optional().nullable(),
  hashtags: z.array(z.string()).optional(),
  mentions: z.array(z.string()).optional(),
});

const ListScheduledQuery = z.object({
  workspaceId: z.string().min(1),
  status: z.string().optional(),
});

router.post('/create',
  requireAuth,
  requireWorkspaceAccessible(),
  ...scheduleWithQuotaGuards,
  validateRequest({ body: CreateScheduledContentSchema }),
  schedulerController.createScheduledContent
);

router.get('/list',
  requireAuth,
  requireWorkspaceAccessible(),
  validateRequest({ query: ListScheduledQuery }),
  schedulerController.listScheduledContent
);

// TENANT ISOLATION (Req 13): `/create` and `/list` perform their own inline
// membership checks in SchedulerController, but `/upcoming` did not — it passed the
// query workspaceId straight to `getUpcomingScheduled`, exposing another tenant's
// scheduled posts. requireWorkspaceAccessible() is a plan-limit guard, not a
// membership check, so it did not cover this.
router.get('/upcoming',
  requireAuth,
  validateWorkspaceAccess({ source: 'query' }),
  requireWorkspaceAccessible(),
  validateRequest({ query: z.object({ workspaceId: z.string().min(1) }) }),
  schedulerController.getUpcoming
);

router.post('/add-samples',
  requireAuth,
  schedulerController.addSampleScheduledPosts
);

router.delete('/delete/:id',
  requireAuth,
  validateRequest({ params: ContentIdParams }),
  schedulerController.deleteScheduledContent
);

export default router;
