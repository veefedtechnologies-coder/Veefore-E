import mongoose from 'mongoose';
import { BaseRepository, PaginationOptions } from './BaseRepository';
import { WaitlistUser, IWaitlistUser } from '../models/User/WaitlistUser';
import { User as UserModel } from '../models/User/User';
import { WorkspaceModel } from '../models/Workspace/Workspace';
import { logger } from '../config/logger';
import { DatabaseError } from '../errors';
import { User, Workspace } from '@shared/schema';
import {
  convertUser,
  convertWorkspace,
  convertWaitlistUser,
  generateReferralCode
} from '../storage/converters';

export class WaitlistUserRepository extends BaseRepository<IWaitlistUser> {
  constructor() {
    super(WaitlistUser, 'WaitlistUser');
  }

  async createWithDefaults(data: Partial<IWaitlistUser>): Promise<IWaitlistUser> {
    return this.create({
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  async countAll(): Promise<number> {
    return this.count({});
  }

  async countSince(date: Date): Promise<number> {
    return this.count({ createdAt: { $gte: date } });
  }

  async getStats(): Promise<{ totalReferrals: number; avgReferrals: number }> {
    const startTime = Date.now();
    try {
      const result = await this.model.aggregate([
        {
          $group: {
            _id: null,
            totalReferrals: { $sum: '$referralCount' },
            avgReferrals: { $avg: '$referralCount' }
          }
        }
      ]).exec();
      
      logger.db.query('getStats', this.entityName, Date.now() - startTime);
      return {
        totalReferrals: result[0]?.totalReferrals || 0,
        avgReferrals: result[0]?.avgReferrals || 0
      };
    } catch (error) {
      logger.db.error('getStats', error, { entityName: this.entityName });
      throw new DatabaseError('Failed to get waitlist stats', error as Error);
    }
  }

  async getStatusBreakdown(): Promise<Record<string, number>> {
    const startTime = Date.now();
    try {
      const result = await this.model.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]).exec();
      
      const breakdown: Record<string, number> = {};
      result.forEach((item: { _id: string; count: number }) => {
        breakdown[item._id] = item.count;
      });
      
      logger.db.query('getStatusBreakdown', this.entityName, Date.now() - startTime);
      return breakdown;
    } catch (error) {
      logger.db.error('getStatusBreakdown', error, { entityName: this.entityName });
      throw new DatabaseError('Failed to get waitlist status breakdown', error as Error);
    }
  }

  async findByEmail(email: string): Promise<IWaitlistUser | null> {
    return this.findOne({ email: email.toLowerCase() });
  }

  async findByReferralCode(referralCode: string): Promise<IWaitlistUser | null> {
    return this.findOne({ referralCode });
  }

  async findByReferredBy(referredBy: string, options?: PaginationOptions) {
    return this.findMany({ referredBy }, options);
  }

  async findByStatus(status: string, options?: PaginationOptions) {
    return this.findMany({ status }, options);
  }

  async incrementReferralCount(userId: string): Promise<IWaitlistUser | null> {
    return this.updateById(userId, { $inc: { referralCount: 1 }, updatedAt: new Date() });
  }

  async updateCredits(userId: string, credits: number): Promise<IWaitlistUser | null> {
    return this.updateById(userId, { credits, updatedAt: new Date() });
  }

  async markFeedbackSubmitted(userId: string): Promise<IWaitlistUser | null> {
    return this.updateById(userId, { feedbackSubmitted: true, updatedAt: new Date() });
  }

  async promoteToUser(id: string): Promise<{
    user: User;
    workspace: Workspace;
    discountCode: string;
    trialDays: number;
  }> {
    const startTime = Date.now();
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const waitlistUserDoc = await this.model.findById(id);
      if (!waitlistUserDoc) {
        throw new Error('Waitlist user not found');
      }
      const waitlistUser = convertWaitlistUser(waitlistUserDoc);

      const discountCode = `EARLY50_${Date.now().toString(36).toUpperCase()}`;
      const discountExpiry = new Date();
      discountExpiry.setDate(discountExpiry.getDate() + 30);

      const trialDays = Math.min(14 + waitlistUser.referralCount, 30);
      const trialExpiry = new Date();
      trialExpiry.setDate(trialExpiry.getDate() + trialDays);

      const referralCode = generateReferralCode();
      const newUserDoc = new UserModel({
        email: waitlistUser.email,
        username: waitlistUser.name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now(),
        displayName: waitlistUser.name,
        credits: 100 + (waitlistUser.referralCount * 20),
        plan: 'Free',
        referredBy: waitlistUser.referredBy,
        isEmailVerified: true,
        status: 'early_access',
        trialExpiresAt: trialExpiry,
        discountCode,
        discountExpiresAt: discountExpiry,
        hasUsedWaitlistBonus: false,
        referralCode,
        isOnboarded: false,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      const savedUser = await newUserDoc.save({ session });
      const user = convertUser(savedUser);

      const workspaceName = `${waitlistUser.name}'s Workspace`;
      const newWorkspaceDoc = new WorkspaceModel({
        name: workspaceName,
        description: 'Early access workspace',
        userId: user.id,
        theme: 'space',
        isDefault: true,
        credits: 50,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      const savedWorkspace = await newWorkspaceDoc.save({ session });
      const workspace = convertWorkspace(savedWorkspace);

      await this.model.updateOne(
        { _id: id },
        { status: 'early_access', updatedAt: new Date() },
        { session }
      );

      await session.commitTransaction();
      session.endSession();

      logger.db.query('promoteToUser', this.entityName, Date.now() - startTime, { id });

      return {
        user,
        workspace,
        discountCode,
        trialDays
      };
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      logger.db.error('promoteToUser', error, { entityName: this.entityName, id });
      throw error;
    }
  }
}

export const waitlistUserRepository = new WaitlistUserRepository();
