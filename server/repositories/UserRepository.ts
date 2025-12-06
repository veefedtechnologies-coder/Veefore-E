import { FilterQuery } from 'mongoose';
import { BaseRepository, PaginationOptions } from './BaseRepository';
import { User, IUser } from '../models/User';
import { logger } from '../config/logger';
import { DatabaseError } from '../errors';

export class UserRepository extends BaseRepository<IUser> {
  constructor() {
    super(User, 'User');
  }

  async findByEmail(email: string): Promise<IUser | null> {
    return this.findOne({ email: email.toLowerCase() });
  }

  async findByFirebaseUid(firebaseUid: string): Promise<IUser | null> {
    return this.findOne({ firebaseUid });
  }

  async findByUsername(username: string): Promise<IUser | null> {
    return this.findOne({ username: username.toLowerCase() });
  }

  async findByReferralCode(referralCode: string): Promise<IUser | null> {
    return this.findOne({ referralCode });
  }

  async findByStripeCustomerId(stripeCustomerId: string): Promise<IUser | null> {
    return this.findOne({ stripeCustomerId });
  }

  async findByWorkspaceId(workspaceId: string): Promise<IUser[]> {
    return this.findAll({ workspaceId });
  }

  async findActiveTrialUsers(): Promise<IUser[]> {
    return this.findAll({
      status: 'trial',
      trialExpiresAt: { $gt: new Date() }
    });
  }

  async findExpiredTrialUsers(): Promise<IUser[]> {
    return this.findAll({
      status: 'trial',
      trialExpiresAt: { $lte: new Date() }
    });
  }

  async findByPlan(plan: string, options?: PaginationOptions) {
    return this.findMany({ plan }, options);
  }

  async updateCredits(userId: string, creditDelta: number): Promise<IUser | null> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .findByIdAndUpdate(
          userId,
          { $inc: { credits: creditDelta }, $set: { updatedAt: new Date() } },
          { new: true, runValidators: true }
        )
        .exec();
      logger.db.query('updateCredits', this.entityName, Date.now() - startTime, { userId, creditDelta });
      return result;
    } catch (error) {
      logger.db.error('updateCredits', error, { entityName: this.entityName, userId });
      throw new DatabaseError('Failed to update user credits', error as Error);
    }
  }

  async deductCredits(userId: string, amount: number): Promise<IUser | null> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .findOneAndUpdate(
          { _id: userId, credits: { $gte: amount } },
          { $inc: { credits: -amount }, $set: { updatedAt: new Date() } },
          { new: true, runValidators: true }
        )
        .exec();
      logger.db.query('deductCredits', this.entityName, Date.now() - startTime, { userId, amount });
      return result;
    } catch (error) {
      logger.db.error('deductCredits', error, { entityName: this.entityName, userId });
      throw new DatabaseError('Failed to deduct user credits', error as Error);
    }
  }

  async updateLoginStreak(userId: string): Promise<IUser | null> {
    const startTime = Date.now();
    try {
      const user = await this.findById(userId);
      if (!user) return null;

      const now = new Date();
      const lastLogin = user.lastLoginAt;
      let newStreak = 1;

      if (lastLogin) {
        const hoursSinceLastLogin = (now.getTime() - lastLogin.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastLogin < 48 && hoursSinceLastLogin >= 24) {
          newStreak = user.dailyLoginStreak + 1;
        } else if (hoursSinceLastLogin < 24) {
          newStreak = user.dailyLoginStreak;
        }
      }

      const result = await this.model
        .findByIdAndUpdate(
          userId,
          {
            $set: {
              dailyLoginStreak: newStreak,
              lastLoginAt: now,
              updatedAt: now
            }
          },
          { new: true }
        )
        .exec();

      logger.db.query('updateLoginStreak', this.entityName, Date.now() - startTime, { userId, newStreak });
      return result;
    } catch (error) {
      logger.db.error('updateLoginStreak', error, { entityName: this.entityName, userId });
      throw new DatabaseError('Failed to update login streak', error as Error);
    }
  }

  async incrementReferrals(userId: string): Promise<IUser | null> {
    return this.updateById(userId, { $inc: { totalReferrals: 1 } });
  }

  async updateOnboardingProgress(
    userId: string,
    step: number,
    data?: Record<string, any>
  ): Promise<IUser | null> {
    const updateData: any = {
      onboardingStep: step,
      updatedAt: new Date()
    };
    if (data) {
      updateData.$set = { ...updateData.$set, onboardingData: data };
    }
    return this.updateById(userId, updateData);
  }

  async markOnboardingComplete(userId: string): Promise<IUser | null> {
    return this.updateById(userId, {
      isOnboarded: true,
      onboardingCompletedAt: new Date(),
      updatedAt: new Date()
    });
  }

  async searchUsers(query: string, options?: PaginationOptions) {
    const searchRegex = new RegExp(query, 'i');
    return this.findMany(
      {
        $or: [
          { email: searchRegex },
          { username: searchRegex },
          { displayName: searchRegex }
        ]
      },
      options
    );
  }

  async countByPlan(): Promise<Record<string, number>> {
    const startTime = Date.now();
    try {
      const result = await this.model.aggregate([
        { $group: { _id: '$plan', count: { $sum: 1 } } }
      ]).exec();
      
      const counts: Record<string, number> = {};
      result.forEach((item: { _id: string; count: number }) => {
        counts[item._id] = item.count;
      });
      
      logger.db.query('countByPlan', this.entityName, Date.now() - startTime);
      return counts;
    } catch (error) {
      logger.db.error('countByPlan', error, { entityName: this.entityName });
      throw new DatabaseError('Failed to count users by plan', error as Error);
    }
  }
}

export const userRepository = new UserRepository();
