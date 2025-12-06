import { Response } from 'express';
import { z } from 'zod';
import { BaseController, TypedRequest } from './BaseController';
import { userService } from '../services';

const UpdateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  avatar: z.string().url().optional(),
  niche: z.string().max(100).optional(),
  targetAudience: z.string().max(200).optional(),
  contentStyle: z.string().max(100).optional(),
  postingFrequency: z.string().max(50).optional(),
  businessType: z.string().max(100).optional(),
  experienceLevel: z.string().max(50).optional(),
  primaryObjective: z.string().max(200).optional(),
});

const CompleteOnboardingSchema = z.object({
  niche: z.string().max(100).optional(),
  targetAudience: z.string().max(200).optional(),
  goals: z.array(z.any()).optional(),
  socialPlatforms: z.array(z.any()).optional(),
});

const UpdateOnboardingStepSchema = z.object({
  step: z.number().int().min(0).max(10),
});

const AddCreditsSchema = z.object({
  amount: z.number().int().positive(),
  reason: z.string().max(200).optional(),
});

export class UserController extends BaseController {
  getCurrentUser = this.wrapAsync(async (
    req: TypedRequest,
    res: Response
  ) => {
    const userId = req.user!.id;
    const user = await userService.getUserById(userId);
    this.sendSuccess(res, user);
  });

  updateProfile = this.wrapAsync(async (
    req: TypedRequest<{}, z.infer<typeof UpdateProfileSchema>>,
    res: Response
  ) => {
    const userId = req.user!.id;
    const input = UpdateProfileSchema.parse(req.body);
    const user = await userService.updateProfile(userId, input);
    this.sendSuccess(res, user);
  });

  completeOnboarding = this.wrapAsync(async (
    req: TypedRequest<{}, z.infer<typeof CompleteOnboardingSchema>>,
    res: Response
  ) => {
    const userId = req.user!.id;
    const input = CompleteOnboardingSchema.parse(req.body);
    const user = await userService.completeOnboarding(userId, input);
    this.sendSuccess(res, user, 200, 'Onboarding completed successfully');
  });

  updateOnboardingStep = this.wrapAsync(async (
    req: TypedRequest<{}, z.infer<typeof UpdateOnboardingStepSchema>>,
    res: Response
  ) => {
    const userId = req.user!.id;
    const { step } = UpdateOnboardingStepSchema.parse(req.body);
    const user = await userService.updateOnboardingStep(userId, step);
    this.sendSuccess(res, user);
  });

  getCredits = this.wrapAsync(async (
    req: TypedRequest,
    res: Response
  ) => {
    const userId = req.user!.id;
    const user = await userService.getUserById(userId);
    this.sendSuccess(res, { credits: user.credits });
  });

  addCredits = this.wrapAsync(async (
    req: TypedRequest<{}, z.infer<typeof AddCreditsSchema>>,
    res: Response
  ) => {
    const userId = req.user!.id;
    const { amount, reason } = AddCreditsSchema.parse(req.body);
    const user = await userService.addCredits(userId, amount, reason);
    this.sendSuccess(res, { credits: user.credits }, 200, 'Credits added successfully');
  });
}

export const userController = new UserController();
