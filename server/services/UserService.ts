import { BaseService } from './BaseService';
import { userRepository, workspaceRepository } from '../repositories';
import { IUser } from '../models/User';
import { NotFoundError, ValidationError, ConflictError } from '../errors';

interface CreateUserInput {
  email: string;
  username: string;
  firebaseUid?: string;
  displayName?: string;
  avatar?: string;
  referredBy?: string;
}

interface UpdateProfileInput {
  displayName?: string;
  avatar?: string;
  niche?: string;
  targetAudience?: string;
  contentStyle?: string;
  postingFrequency?: string;
  businessType?: string;
  experienceLevel?: string;
  primaryObjective?: string;
}

export class UserService extends BaseService {
  constructor() {
    super('UserService');
  }

  async getUserById(userId: string): Promise<IUser> {
    return this.withErrorHandling('getUserById', async () => {
      const user = await userRepository.findById(userId);
      if (!user) {
        throw new NotFoundError('User', userId);
      }
      return user;
    });
  }

  async getUserByEmail(email: string): Promise<IUser | null> {
    return this.withErrorHandling('getUserByEmail', async () => {
      return userRepository.findByEmail(email);
    });
  }

  async getUserByFirebaseUid(firebaseUid: string): Promise<IUser | null> {
    return this.withErrorHandling('getUserByFirebaseUid', async () => {
      return userRepository.findByFirebaseUid(firebaseUid);
    });
  }

  async createUser(input: CreateUserInput): Promise<IUser> {
    return this.withErrorHandling('createUser', async () => {
      const existingByEmail = await userRepository.findByEmail(input.email);
      if (existingByEmail) {
        throw new ConflictError('User with this email already exists');
      }

      const existingByUsername = await userRepository.findByUsername(input.username);
      if (existingByUsername) {
        throw new ConflictError('Username is already taken');
      }

      const referralCode = this.generateReferralCode();
      const user = await userRepository.create({
        ...input,
        email: input.email.toLowerCase(),
        username: input.username.toLowerCase(),
        referralCode,
        credits: 100,
        plan: 'Free',
        status: 'active'
      });

      const userId = (user._id as any).toString();
      
      if (input.referredBy) {
        await this.processReferral(input.referredBy, userId);
      }

      const workspace = await workspaceRepository.createDefaultWorkspace(
        userId,
        `${input.username}'s Workspace`
      );

      await userRepository.updateById(userId, {
        workspaceId: (workspace._id as any).toString()
      });

      this.log('createUser', 'User created successfully', { userId });
      return user;
    });
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<IUser> {
    return this.withErrorHandling('updateProfile', async () => {
      const user = await userRepository.updateByIdOrFail(userId, {
        ...input,
        updatedAt: new Date()
      });
      this.log('updateProfile', 'Profile updated', { userId });
      return user;
    });
  }

  async completeOnboarding(
    userId: string,
    data: {
      niche?: string;
      targetAudience?: string;
      goals?: any[];
      socialPlatforms?: any[];
    }
  ): Promise<IUser> {
    return this.withErrorHandling('completeOnboarding', async () => {
      const user = await userRepository.updateByIdOrFail(userId, {
        ...data,
        isOnboarded: true,
        onboardingCompletedAt: new Date(),
        updatedAt: new Date()
      });
      this.log('completeOnboarding', 'Onboarding completed', { userId });
      return user;
    });
  }

  async updateOnboardingStep(userId: string, step: number): Promise<IUser> {
    return this.withErrorHandling('updateOnboardingStep', async () => {
      const user = await userRepository.updateByIdOrFail(userId, {
        onboardingStep: step,
        updatedAt: new Date()
      });
      return user;
    });
  }

  async addCredits(userId: string, amount: number, reason?: string): Promise<IUser> {
    return this.withErrorHandling('addCredits', async () => {
      if (amount <= 0) {
        throw new ValidationError('Credit amount must be positive');
      }
      const user = await userRepository.updateCredits(userId, amount);
      if (!user) {
        throw new NotFoundError('User', userId);
      }
      this.log('addCredits', 'Credits added', { userId, amount, reason });
      return user;
    });
  }

  async deductCredits(userId: string, amount: number, reason?: string): Promise<IUser> {
    return this.withErrorHandling('deductCredits', async () => {
      if (amount <= 0) {
        throw new ValidationError('Credit amount must be positive');
      }
      const user = await userRepository.deductCredits(userId, amount);
      if (!user) {
        const existingUser = await userRepository.findById(userId);
        if (!existingUser) {
          throw new NotFoundError('User', userId);
        }
        throw new ValidationError('Insufficient credits');
      }
      this.log('deductCredits', 'Credits deducted', { userId, amount, reason });
      return user;
    });
  }

  async hasEnoughCredits(userId: string, amount: number): Promise<boolean> {
    return this.withErrorHandling('hasEnoughCredits', async () => {
      const user = await this.getUserById(userId);
      return user.credits >= amount;
    });
  }

  async recordLogin(userId: string): Promise<IUser> {
    return this.withErrorHandling('recordLogin', async () => {
      const user = await userRepository.updateLoginStreak(userId);
      if (!user) {
        throw new NotFoundError('User', userId);
      }
      return user;
    });
  }

  async updatePlan(userId: string, plan: string, stripeIds?: {
    customerId?: string;
    subscriptionId?: string;
  }): Promise<IUser> {
    return this.withErrorHandling('updatePlan', async () => {
      const updateData: any = {
        plan,
        updatedAt: new Date()
      };
      if (stripeIds?.customerId) {
        updateData.stripeCustomerId = stripeIds.customerId;
      }
      if (stripeIds?.subscriptionId) {
        updateData.stripeSubscriptionId = stripeIds.subscriptionId;
      }
      const user = await userRepository.updateByIdOrFail(userId, updateData);
      this.log('updatePlan', 'Plan updated', { userId, plan });
      return user;
    });
  }

  async searchUsers(query: string, page: number = 1, limit: number = 20) {
    return this.withErrorHandling('searchUsers', async () => {
      return userRepository.searchUsers(query, { page, limit });
    });
  }

  async getUserStats(): Promise<{ totalUsers: number; byPlan: Record<string, number> }> {
    return this.withErrorHandling('getUserStats', async () => {
      const [totalUsers, byPlan] = await Promise.all([
        userRepository.count(),
        userRepository.countByPlan()
      ]);
      return { totalUsers, byPlan };
    });
  }

  private async processReferral(referralCode: string, newUserId: string): Promise<void> {
    const referrer = await userRepository.findByReferralCode(referralCode);
    if (referrer) {
      const referrerId = (referrer._id as any).toString();
      await Promise.all([
        userRepository.incrementReferrals(referrerId),
        userRepository.updateCredits(referrerId, 50)
      ]);
      this.log('processReferral', 'Referral processed', {
        referrerId,
        newUserId,
        creditsAwarded: 50
      });
    }
  }

  private generateReferralCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}

export const userService = new UserService();
