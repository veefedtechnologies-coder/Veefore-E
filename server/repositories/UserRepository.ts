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

  async updateSubscription(userId: string, planId: string, planCredits: number): Promise<IUser | null> {
    const startTime = Date.now();
    try {
      let result = await this.model
        .findByIdAndUpdate(
          userId,
          { 
            plan: planId, 
            $inc: { credits: planCredits },
            updatedAt: new Date() 
          },
          { new: true, runValidators: true }
        )
        .exec();

      if (!result) {
        result = await this.model
          .findOneAndUpdate(
            { id: userId },
            { 
              plan: planId, 
              $inc: { credits: planCredits },
              updatedAt: new Date() 
            },
            { new: true, runValidators: true }
          )
          .exec();
      }

      logger.db.query('updateSubscription', this.entityName, Date.now() - startTime, { userId, planId, planCredits });
      return result;
    } catch (error) {
      logger.db.error('updateSubscription', error, { entityName: this.entityName, userId, planId });
      throw new DatabaseError('Failed to update user subscription', error as Error);
    }
  }

  async addCreditsAtomic(userId: string, credits: number): Promise<IUser | null> {
    const startTime = Date.now();
    try {
      let result = await this.model
        .findByIdAndUpdate(
          userId,
          { $inc: { credits }, $set: { updatedAt: new Date() } },
          { new: true, runValidators: true }
        )
        .exec();

      if (!result) {
        result = await this.model
          .findOneAndUpdate(
            { id: userId },
            { $inc: { credits }, $set: { updatedAt: new Date() } },
            { new: true, runValidators: true }
          )
          .exec();
      }

      logger.db.query('addCreditsAtomic', this.entityName, Date.now() - startTime, { userId, credits });
      return result;
    } catch (error) {
      logger.db.error('addCreditsAtomic', error, { entityName: this.entityName, userId });
      throw new DatabaseError('Failed to add credits to user', error as Error);
    }
  }

  async findWithPagination(
    query: FilterQuery<IUser>,
    options: { page: number; limit: number; sortBy?: string; sortOrder?: 'asc' | 'desc' }
  ): Promise<{ users: IUser[]; total: number }> {
    const startTime = Date.now();
    const { page, limit, sortBy = 'createdAt', sortOrder = 'desc' } = options;
    const skip = (page - 1) * limit;

    try {
      const [users, total] = await Promise.all([
        this.model
          .find(query)
          .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
          .skip(skip)
          .limit(limit)
          .lean()
          .exec(),
        this.model.countDocuments(query).exec(),
      ]);

      logger.db.query('findWithPagination', this.entityName, Date.now() - startTime, { page, limit, total });
      return { users: users as IUser[], total };
    } catch (error) {
      logger.db.error('findWithPagination', error, { entityName: this.entityName });
      throw new DatabaseError('Failed to find users with pagination', error as Error);
    }
  }

  async countAll(): Promise<number> {
    const startTime = Date.now();
    try {
      const result = await this.model.countDocuments({}).exec();
      logger.db.query('countAll', this.entityName, Date.now() - startTime);
      return result;
    } catch (error) {
      logger.db.error('countAll', error, { entityName: this.entityName });
      throw new DatabaseError('Failed to count all users', error as Error);
    }
  }

  async storeEmailVerificationCode(email: string, code: string, expiry: Date): Promise<boolean> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .updateOne(
          { email: email.toLowerCase() },
          { 
            emailVerificationCode: code,
            emailVerificationExpiry: expiry,
            updatedAt: new Date()
          }
        )
        .exec();
      logger.db.query('storeEmailVerificationCode', this.entityName, Date.now() - startTime, { email });
      return result.modifiedCount > 0;
    } catch (error) {
      logger.db.error('storeEmailVerificationCode', error, { entityName: this.entityName, email });
      throw new DatabaseError('Failed to store email verification code', error as Error);
    }
  }

  async verifyEmailCodeAndMarkVerified(email: string, code: string): Promise<boolean> {
    const startTime = Date.now();
    try {
      const user = await this.model.findOne({
        email: email.toLowerCase(),
        emailVerificationCode: code,
        emailVerificationExpiry: { $gt: new Date() }
      }).exec();

      if (user) {
        await this.model.updateOne(
          { email: email.toLowerCase() },
          {
            isEmailVerified: true,
            emailVerificationCode: null,
            emailVerificationExpiry: null,
            updatedAt: new Date()
          }
        ).exec();
        logger.db.query('verifyEmailCodeAndMarkVerified', this.entityName, Date.now() - startTime, { email, success: true });
        return true;
      }

      logger.db.query('verifyEmailCodeAndMarkVerified', this.entityName, Date.now() - startTime, { email, success: false });
      return false;
    } catch (error) {
      logger.db.error('verifyEmailCodeAndMarkVerified', error, { entityName: this.entityName, email });
      throw new DatabaseError('Failed to verify email code', error as Error);
    }
  }

  async clearEmailVerificationCode(email: string): Promise<boolean> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .updateOne(
          { email: email.toLowerCase() },
          {
            emailVerificationCode: null,
            emailVerificationExpiry: null,
            updatedAt: new Date()
          }
        )
        .exec();
      logger.db.query('clearEmailVerificationCode', this.entityName, Date.now() - startTime, { email });
      return result.modifiedCount > 0;
    } catch (error) {
      logger.db.error('clearEmailVerificationCode', error, { entityName: this.entityName, email });
      throw new DatabaseError('Failed to clear email verification code', error as Error);
    }
  }

  async updateEmailVerificationData(id: string, token: string, expires: Date): Promise<IUser | null> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .findByIdAndUpdate(
          id,
          {
            emailVerificationCode: token,
            emailVerificationExpiry: expires,
            updatedAt: new Date()
          },
          { new: true }
        )
        .exec();
      logger.db.query('updateEmailVerificationData', this.entityName, Date.now() - startTime, { id });
      return result;
    } catch (error) {
      logger.db.error('updateEmailVerificationData', error, { entityName: this.entityName, id });
      throw new DatabaseError('Failed to update email verification data', error as Error);
    }
  }

  async markEmailVerified(
    id: string, 
    additionalData?: { displayName?: string; passwordHash?: string; firebaseUid?: string }
  ): Promise<IUser | null> {
    const startTime = Date.now();
    try {
      const updateData: any = {
        isEmailVerified: true,
        emailVerificationCode: null,
        emailVerificationExpiry: null,
        updatedAt: new Date()
      };

      if (additionalData?.displayName) updateData.displayName = additionalData.displayName;
      if (additionalData?.passwordHash) updateData.passwordHash = additionalData.passwordHash;
      if (additionalData?.firebaseUid) updateData.firebaseUid = additionalData.firebaseUid;

      const result = await this.model
        .findByIdAndUpdate(id, updateData, { new: true })
        .exec();
      logger.db.query('markEmailVerified', this.entityName, Date.now() - startTime, { id });
      return result;
    } catch (error) {
      logger.db.error('markEmailVerified', error, { entityName: this.entityName, id });
      throw new DatabaseError('Failed to mark email as verified', error as Error);
    }
  }
}

export const userRepository = new UserRepository();
