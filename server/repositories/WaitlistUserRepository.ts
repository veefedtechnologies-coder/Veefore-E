import { BaseRepository, PaginationOptions } from './BaseRepository';
import { WaitlistUser, IWaitlistUser } from '../models/User/WaitlistUser';
import { logger } from '../config/logger';
import { DatabaseError } from '../errors';

export class WaitlistUserRepository extends BaseRepository<IWaitlistUser> {
  constructor() {
    super(WaitlistUser, 'WaitlistUser');
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
}

export const waitlistUserRepository = new WaitlistUserRepository();
