import { Router } from 'express';
import { schedulerController } from '../../controllers';
import { requireAuth } from '../../middleware/require-auth';
import { validateRequest } from '../../middleware/validation';
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
  validateRequest({ body: CreateScheduledContentSchema }),
  schedulerController.createScheduledContent
);

router.get('/list', 
  requireAuth,
  validateRequest({ query: ListScheduledQuery }),
  schedulerController.listScheduledContent
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
