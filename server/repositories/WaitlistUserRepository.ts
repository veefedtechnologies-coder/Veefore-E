import { BaseRepository, PaginationOptions } from './BaseRepository';
import { WaitlistUser, IWaitlistUser } from '../models/User/WaitlistUser';

export class WaitlistUserRepository extends BaseRepository<IWaitlistUser> {
  constructor() {
    super(WaitlistUser, 'WaitlistUser');
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
