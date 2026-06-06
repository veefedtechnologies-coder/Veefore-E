import { Router } from 'express';
import { userController } from '../../controllers';
import { requireAuth } from '../../middleware/require-auth';
import { apiRateLimiter } from '../../middleware/rate-limiting-working';
import { validateRequest } from '../../middleware/validation';
import { z } from 'zod';

const router = Router();

const UpdateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  username: z.string().min(3).max(30).optional(),
  avatar: z.string().url().optional(),
  niche: z.string().max(100).optional(),
  targetAudience: z.string().max(200).optional(),
  contentStyle: z.string().max(100).optional(),
  postingFrequency: z.string().max(50).optional(),
  businessType: z.string().max(100).optional(),
  experienceLevel: z.string().max(50).optional(),
  primaryObjective: z.string().max(200).optional(),
  preferences: z.record(z.any()).optional(),
}).passthrough();

const UpdateOnboardingSchema = z.object({
  step: z.number().min(1).max(10).optional(),
  planSelected: z.string().optional(),
  socialAccountsConnected: z.array(z.any()).optional(),
  userProfile: z.object({
    goals: z.array(z.any()).optional(),
    niche: z.string().max(100).optional(),
    targetAudience: z.string().max(200).optional(),
    contentStyle: z.string().max(100).optional(),
    postingFrequency: z.string().max(50).optional(),
    businessType: z.string().max(100).optional(),
    experienceLevel: z.string().max(50).optional(),
    primaryObjective: z.string().max(200).optional(),
  }).optional(),
}).passthrough();

const UpdateOnboardingStepSchema = z.object({
  step: z.number().int().min(0).max(10),
});

const AddCreditsSchema = z.object({
  amount: z.number().int().positive(),
  reason: z.string().max(200).optional(),
});

const UpdateCreditsSchema = z.object({
  credits: z.number().int().min(0),
});

router.use(requireAuth);
router.use(apiRateLimiter);

router.get('/', userController.getCurrentUser);

router.patch('/',
  validateRequest({ body: UpdateProfileSchema }),
  userController.updateProfile
);

router.get('/onboarding-status', userController.getOnboardingStatus);

router.post('/onboarding',
  validateRequest({ body: UpdateOnboardingSchema }),
  userController.updateOnboarding
);

router.post('/complete-onboarding', userController.completeOnboardingFull);

router.patch('/onboarding-step',
  validateRequest({ body: UpdateOnboardingStepSchema }),
  userController.updateOnboardingStep
);

router.get('/credits', userController.getCredits);

router.post('/credits',
  validateRequest({ body: AddCreditsSchema }),
  userController.addCredits
);

router.patch('/credits',
  validateRequest({ body: UpdateCreditsSchema }),
  userController.updateCredits
);


// Goals Routes
import { goalsController } from '../../controllers';

router.get('/goals',
  validateRequest({ query: z.object({ workspaceId: z.string().min(1) }) }),
  goalsController.getGoals
);

router.post('/goals',
  validateRequest({
    body: z.object({
      workspaceId: z.string().min(1),
      type: z.enum(['followers', 'engagement', 'revenue', 'posts', 'custom']),
      title: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
      target: z.number().positive(),
      deadline: z.coerce.date().optional(),
    })
  }),
  goalsController.createGoal
);

router.patch('/goals/:goalId',
  validateRequest({
    params: z.object({ goalId: z.string().min(1) }),
    body: z.object({
      current: z.number().min(0).optional(),
      status: z.enum(['active', 'completed', 'cancelled', 'overdue']).optional(),
      target: z.number().positive().optional(),
      deadline: z.coerce.date().optional(),
    })
  }),
  goalsController.updateGoal
);

router.delete('/goals/:goalId',
  validateRequest({ params: z.object({ goalId: z.string().min(1) }) }),
  goalsController.deleteGoal
);

export default router;
