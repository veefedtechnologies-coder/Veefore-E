import { BaseRepository, PaginationOptions } from './BaseRepository';
import {
  CreditTransactionModel,
  ICreditTransaction,
  PaymentModel,
  IPayment,
  SubscriptionModel,
  ISubscription,
  AddonModel,
  IAddon,
  ReferralModel,
  IReferral,
} from '../models/Billing';
import { logger } from '../config/logger';
import { DatabaseError } from '../errors';

export class CreditTransactionRepository extends BaseRepository<ICreditTransaction> {
  constructor() {
    super(CreditTransactionModel, 'CreditTransaction');
  }

  async findByUserId(userId: string, options?: PaginationOptions) {
    return this.findMany({ userId }, options);
  }

  async findByWorkspaceId(workspaceId: string, options?: PaginationOptions) {
    return this.findMany({ workspaceId }, options);
  }

  async findByType(type: string, options?: PaginationOptions) {
    return this.findMany({ type }, options);
  }

  async findByUserIdAndType(userId: string, type: string, options?: PaginationOptions) {
    return this.findMany({ userId, type }, options);
  }

  async getRecentTransactions(userId: string, limit: number = 10): Promise<ICreditTransaction[]> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .find({ userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .exec();
      logger.db.query('getRecentTransactions', this.entityName, Date.now() - startTime, { userId, count: result.length });
      return result;
    } catch (error) {
      logger.db.error('getRecentTransactions', error, { entityName: this.entityName, userId });
      throw new DatabaseError('Failed to get recent transactions', error as Error);
    }
  }

  async getTotalCreditsUsed(userId: string): Promise<number> {
    const startTime = Date.now();
    try {
      const result = await this.model.aggregate([
        { $match: { userId, amount: { $lt: 0 } } },
        { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } }
      ]).exec();
      logger.db.query('getTotalCreditsUsed', this.entityName, Date.now() - startTime, { userId });
      return result[0]?.total || 0;
    } catch (error) {
      logger.db.error('getTotalCreditsUsed', error, { entityName: this.entityName, userId });
      throw new DatabaseError('Failed to get total credits used', error as Error);
    }
  }

  async createWithDefaults(data: Partial<ICreditTransaction>): Promise<ICreditTransaction> {
    return this.create({
      ...data,
      createdAt: new Date()
    });
  }
}

export class PaymentRepository extends BaseRepository<IPayment> {
  constructor() {
    super(PaymentModel, 'Payment');
  }

  async findByUserId(userId: string, options?: PaginationOptions) {
    return this.findMany({ userId }, options);
  }

  async findByStatus(status: string, options?: PaginationOptions) {
    return this.findMany({ status }, options);
  }

  async findByRazorpayOrderId(razorpayOrderId: string): Promise<IPayment | null> {
    return this.findOne({ razorpayOrderId });
  }

  async findByRazorpayPaymentId(razorpayPaymentId: string): Promise<IPayment | null> {
    return this.findOne({ razorpayPaymentId });
  }

  async findByPurpose(purpose: string, options?: PaginationOptions) {
    return this.findMany({ purpose }, options);
  }

  async findPendingPayments(options?: PaginationOptions) {
    return this.findMany({ status: 'pending' }, options);
  }

  async findCompletedPayments(userId: string, options?: PaginationOptions) {
    return this.findMany({ userId, status: 'completed' }, options);
  }

  async getTotalPaymentsByUser(userId: string): Promise<number> {
    const startTime = Date.now();
    try {
      const result = await this.model.aggregate([
        { $match: { userId, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]).exec();
      logger.db.query('getTotalPaymentsByUser', this.entityName, Date.now() - startTime, { userId });
      return result[0]?.total || 0;
    } catch (error) {
      logger.db.error('getTotalPaymentsByUser', error, { entityName: this.entityName, userId });
      throw new DatabaseError('Failed to get total payments', error as Error);
    }
  }
}

export class SubscriptionRepository extends BaseRepository<ISubscription> {
  constructor() {
    super(SubscriptionModel, 'Subscription');
  }

  async findByUserId(userId: string): Promise<ISubscription | null> {
    return this.findOne({ userId });
  }

  async findActiveByUserId(userId: string): Promise<ISubscription | null> {
    return this.findOne({ userId, status: 'active' });
  }

  async findByStatus(status: string, options?: PaginationOptions) {
    return this.findMany({ status }, options);
  }

  async findByPlan(plan: string, options?: PaginationOptions) {
    return this.findMany({ plan }, options);
  }

  async findBySubscriptionId(subscriptionId: string): Promise<ISubscription | null> {
    return this.findOne({ subscriptionId });
  }

  async findExpiringSubscriptions(days: number = 7): Promise<ISubscription[]> {
    const startTime = Date.now();
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + days);
    try {
      const result = await this.model
        .find({
          status: 'active',
          currentPeriodEnd: { $lte: expiryDate, $gt: new Date() }
        })
        .exec();
      logger.db.query('findExpiringSubscriptions', this.entityName, Date.now() - startTime, { count: result.length });
      return result;
    } catch (error) {
      logger.db.error('findExpiringSubscriptions', error, { entityName: this.entityName });
      throw new DatabaseError('Failed to find expiring subscriptions', error as Error);
    }
  }

  async findCanceledSubscriptions(options?: PaginationOptions) {
    return this.findMany({ status: 'canceled' }, options);
  }

  async cancelSubscription(userId: string): Promise<ISubscription | null> {
    return this.updateOne(
      { userId, status: 'active' },
      { status: 'canceled', canceledAt: new Date(), autoRenew: false, updatedAt: new Date() }
    );
  }

  async countByPlan(): Promise<Record<string, number>> {
    const startTime = Date.now();
    try {
      const result = await this.model.aggregate([
        { $match: { status: 'active' } },
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
      throw new DatabaseError('Failed to count subscriptions by plan', error as Error);
    }
  }
}

export class AddonRepository extends BaseRepository<IAddon> {
  constructor() {
    super(AddonModel, 'Addon');
  }

  async findByUserId(userId: string, options?: PaginationOptions) {
    return this.findMany({ userId }, options);
  }

  async findActiveByUserId(userId: string): Promise<IAddon[]> {
    return this.findAll({ userId, isActive: true });
  }

  async findByType(type: string, options?: PaginationOptions) {
    return this.findMany({ type }, options);
  }

  async findActiveAddons(options?: PaginationOptions) {
    return this.findMany({ isActive: true }, options);
  }

  async findExpiredAddons(): Promise<IAddon[]> {
    return this.findAll({
      isActive: true,
      expiresAt: { $lte: new Date() }
    });
  }

  async deactivateExpiredAddons(): Promise<number> {
    return this.updateMany(
      { isActive: true, expiresAt: { $lte: new Date() } },
      { isActive: false, updatedAt: new Date() }
    );
  }

  async createWithDefaults(data: Partial<IAddon>): Promise<IAddon> {
    return this.create({
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }
}

export class ReferralRepository extends BaseRepository<IReferral> {
  constructor() {
    super(ReferralModel, 'Referral');
  }

  async findByReferrerId(referrerId: number, options?: PaginationOptions) {
    return this.findMany({ referrerId }, options);
  }

  async findByReferredUserId(referredUserId: number): Promise<IReferral | null> {
    return this.findOne({ referredUserId });
  }

  async findByReferralCode(referralCode: string): Promise<IReferral | null> {
    return this.findOne({ referralCode });
  }

  async findByStatus(status: string, options?: PaginationOptions) {
    return this.findMany({ status }, options);
  }

  async findPendingReferrals(referrerId: number): Promise<IReferral[]> {
    return this.findAll({ referrerId, status: 'pending' });
  }

  async findConfirmedReferrals(referrerId: number): Promise<IReferral[]> {
    return this.findAll({ referrerId, isConfirmed: true });
  }

  async confirmReferral(referredUserId: number): Promise<IReferral | null> {
    return this.updateOne(
      { referredUserId },
      { isConfirmed: true, status: 'confirmed', updatedAt: new Date() }
    );
  }

  async getTotalRewardsEarned(referrerId: number): Promise<number> {
    const startTime = Date.now();
    try {
      const result = await this.model.aggregate([
        { $match: { referrerId, isConfirmed: true } },
        { $group: { _id: null, total: { $sum: '$rewardAmount' } } }
      ]).exec();
      logger.db.query('getTotalRewardsEarned', this.entityName, Date.now() - startTime, { referrerId });
      return result[0]?.total || 0;
    } catch (error) {
      logger.db.error('getTotalRewardsEarned', error, { entityName: this.entityName, referrerId });
      throw new DatabaseError('Failed to get total rewards earned', error as Error);
    }
  }
}

export const creditTransactionRepository = new CreditTransactionRepository();
export const paymentRepository = new PaymentRepository();
export const subscriptionRepository = new SubscriptionRepository();
export const addonRepository = new AddonRepository();
export const referralRepository = new ReferralRepository();
