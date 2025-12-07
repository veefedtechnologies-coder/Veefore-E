import { Response } from 'express';
import { z } from 'zod';
import { BaseController, TypedRequest } from './BaseController';
import { userService } from '../services';
import { storage } from '../mongodb-storage';

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

const CompleteOnboardingFullSchema = z.object({
  preferences: z.record(z.unknown()).optional(),
}).passthrough();

const UpdateCreditsSchema = z.object({
  credits: z.number().int().min(0),
});

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

async function createDefaultWorkspaceIfNeeded(userId: string, userPlan: string = 'free'): Promise<void> {
  try {
    const existingWorkspaces = await storage.getWorkspacesByUserId(userId);

    if (existingWorkspaces.length === 0) {
      console.log(`[DEFAULT WORKSPACE] Creating default workspace for user ${userId} with plan ${userPlan}`);

      const defaultWorkspace = await storage.createWorkspace({
        userId: userId,
        name: 'My Workspace',
        description: 'Your default workspace for managing social media content',
        isDefault: true,
        plan: userPlan,
        credits: userPlan === 'free' ? 10 : 100,
        members: [{
          userId: userId,
          role: 'owner',
          joinedAt: new Date()
        }],
        settings: {
          autoSync: true,
          notifications: true,
          timezone: 'UTC'
        },
        addons: []
      });

      console.log(`[DEFAULT WORKSPACE] ✅ Created default workspace ${defaultWorkspace.id} for user ${userId}`);
    } else {
      console.log(`[DEFAULT WORKSPACE] User ${userId} already has ${existingWorkspaces.length} workspace(s) - skipping creation`);
    }
  } catch (error) {
    console.error(`[DEFAULT WORKSPACE] Error creating default workspace for user ${userId}:`, error);
  }
}

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

  getOnboardingStatus = this.wrapAsync(async (
    req: TypedRequest,
    res: Response
  ) => {
    const userId = req.user!.id;
    const user = await storage.getUser(userId);
    this.sendSuccess(res, {
      onboardingStep: user.onboardingStep || 1,
      isOnboarded: user.isOnboarded || false,
      isEmailVerified: user.isEmailVerified || false,
      onboardingData: user.onboardingData || null,
      plan: user.plan || 'free'
    });
  });

  updateOnboarding = this.wrapAsync(async (
    req: TypedRequest<{}, z.infer<typeof UpdateOnboardingSchema>>,
    res: Response
  ) => {
    const userId = req.user!.id;
    const onboardingData = UpdateOnboardingSchema.parse(req.body);

    console.log(`[ONBOARDING] Updating onboarding data for user ${userId}:`, onboardingData);

    const updateData: any = {
      onboardingStep: onboardingData.step || 1,
      onboardingData: onboardingData
    };

    if (onboardingData.userProfile) {
      const profile = onboardingData.userProfile;
      updateData.goals = profile.goals;
      updateData.niche = profile.niche;
      updateData.targetAudience = profile.targetAudience;
      updateData.contentStyle = profile.contentStyle;
      updateData.postingFrequency = profile.postingFrequency;
      updateData.socialPlatforms = onboardingData.socialAccountsConnected;
      updateData.businessType = profile.businessType;
      updateData.experienceLevel = profile.experienceLevel;
      updateData.primaryObjective = profile.primaryObjective;
    }

    if (onboardingData.planSelected) {
      updateData.plan = onboardingData.planSelected.toLowerCase();
    }

    const updatedUser = await storage.updateUser(userId, updateData);

    if (onboardingData.planSelected) {
      const selectedPlan = onboardingData.planSelected.toLowerCase();
      await createDefaultWorkspaceIfNeeded(userId, selectedPlan);
    }

    console.log(`[ONBOARDING] Updated onboarding data for user ${userId}`);
    this.sendSuccess(res, { success: true, user: updatedUser });
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

  completeOnboardingFull = this.wrapAsync(async (
    req: TypedRequest<{}, z.infer<typeof CompleteOnboardingFullSchema>>,
    res: Response
  ) => {
    const { preferences } = CompleteOnboardingFullSchema.parse(req.body);
    const firebaseUid = req.user!.firebaseUid;
    const currentUserId = req.user!.id;

    console.log(`[ONBOARDING] ⏳ Starting onboarding completion for user ${currentUserId} (uid: ${firebaseUid})`);

    try {
      // Step 1: Find or create user with longer timeout (10s)
      let dbUser = await withTimeout(storage.getUserByFirebaseUid(firebaseUid!), 10000).catch((err) => {
        console.log(`[ONBOARDING] getUserByFirebaseUid failed: ${err.message}`);
        return undefined as any;
      });
      
      if (!dbUser) {
        console.log(`[ONBOARDING] User not found by Firebase UID, trying by ID: ${currentUserId}`);
        dbUser = await withTimeout(storage.getUser(currentUserId), 10000).catch((err) => {
          console.log(`[ONBOARDING] getUser failed: ${err.message}`);
          return undefined as any;
        });
      }
      
      if (!dbUser) {
        console.log(`[ONBOARDING] User not found, creating new user for Firebase UID: ${firebaseUid}`);
        const email = req.user!.email || `user_${firebaseUid}@example.com`;
        dbUser = await withTimeout(storage.createUser({
          firebaseUid: firebaseUid!,
          email,
          username: email.split('@')[0],
          displayName: (req.user as any).displayName || null,
          avatar: (req.user as any).avatar || null,
          referredBy: null
        }), 15000);
        console.log(`[ONBOARDING] ✅ Created new user: ${dbUser.id}`);
      }

      // Step 2: Update user with onboarding data (longer timeout - 15s)
      console.log(`[ONBOARDING] Updating user ${dbUser.id} with isOnboarded=true`);
      const updateData = {
        isOnboarded: true,
        onboardingCompletedAt: new Date(),
        preferences: preferences || {}
      };

      const updatedUser = await withTimeout(storage.updateUser(dbUser.id, updateData), 15000);
      console.log(`[ONBOARDING] ✅ User updated successfully, isOnboarded: ${updatedUser.isOnboarded}`);

      // Step 3: Create default workspace (don't await to speed up response)
      const userPlan = updatedUser.plan || 'free';
      createDefaultWorkspaceIfNeeded(updatedUser.id, userPlan).catch((err) => {
        console.error(`[ONBOARDING] Background workspace creation error:`, err);
      });

      console.log(`[ONBOARDING] ✅ Completed onboarding for user ${updatedUser.id}`);
      this.sendSuccess(res, { success: true, message: 'Onboarding completed successfully', user: updatedUser });
    } catch (error: any) {
      console.error(`[ONBOARDING] ❌ Critical error during onboarding completion:`, error);
      throw error; // Let the wrapAsync error handler deal with it
    }
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

  updateCredits = this.wrapAsync(async (
    req: TypedRequest<{}, z.infer<typeof UpdateCreditsSchema>>,
    res: Response
  ) => {
    const { credits } = UpdateCreditsSchema.parse(req.body);
    const userId = req.user!.id;

    console.log(`[CREDITS] Updating user ${userId} to ${credits} credits`);

    const updatedUser = await storage.updateUserCredits(userId, credits);

    console.log(`[CREDITS] Successfully updated user ${userId} to ${credits} credits`);
    this.sendSuccess(res, { success: true, credits, user: updatedUser });
  });
}

export const userController = new UserController();
