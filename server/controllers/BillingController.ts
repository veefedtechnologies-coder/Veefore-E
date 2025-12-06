import { Response } from 'express';
import { z } from 'zod';
import { BaseController, TypedRequest } from './BaseController';
import { aiCreditService } from '../services';
import {
  creditTransactionRepository,
  paymentRepository,
  subscriptionRepository,
} from '../repositories';
import { ValidationError, NotFoundError } from '../errors';

const UserIdParams = z.object({
  userId: z.string().min(1),
});

const PaginationQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const DateRangeQuery = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const PurchaseCreditsSchema = z.object({
  amount: z.number().int().positive().min(100).max(100000),
  paymentMethod: z.enum(['razorpay', 'stripe', 'paypal']).default('razorpay'),
  currency: z.enum(['INR', 'USD', 'EUR']).default('INR'),
  couponCode: z.string().optional(),
});

const UpdateSubscriptionSchema = z.object({
  plan: z.enum(['Free', 'Starter', 'Pro', 'Business', 'Enterprise']),
  billingCycle: z.enum(['monthly', 'yearly']).default('monthly'),
  autoRenew: z.boolean().default(true),
});

const CancelSubscriptionSchema = z.object({
  reason: z.string().max(500).optional(),
  feedback: z.string().max(1000).optional(),
  cancelImmediately: z.boolean().default(false),
});

const ProcessPaymentSchema = z.object({
  amount: z.number().positive(),
  currency: z.enum(['INR', 'USD', 'EUR']).default('INR'),
  purpose: z.enum(['subscription', 'credits', 'addon', 'other']),
  paymentMethod: z.enum(['razorpay', 'stripe', 'paypal']),
  metadata: z.record(z.any()).optional(),
});

const VerifyPaymentSchema = z.object({
  orderId: z.string().min(1),
  paymentId: z.string().min(1),
  signature: z.string().min(1),
});

export class BillingController extends BaseController {
  getCredits = this.wrapAsync(async (
    req: TypedRequest,
    res: Response
  ) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new ValidationError('User not authenticated');
    }

    const credits = await aiCreditService.constructor.prototype.constructor.getUserCredits(userId);
    this.sendSuccess(res, credits);
  });

  getCreditHistory = this.wrapAsync(async (
    req: TypedRequest<{}, {}, { page?: string; limit?: string; startDate?: string; endDate?: string }>,
    res: Response
  ) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new ValidationError('User not authenticated');
    }

    const { page, limit } = PaginationQuery.parse(req.query);
    const result = await creditTransactionRepository.findByUserId(userId, { page, limit });
    
    this.sendPaginated(res, result.data, {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    });
  });

  getCreditUsageStats = this.wrapAsync(async (
    req: TypedRequest<{}, {}, { startDate?: string; endDate?: string; operationType?: string }>,
    res: Response
  ) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new ValidationError('User not authenticated');
    }

    const options: any = {};
    if (req.query.startDate) options.startDate = new Date(req.query.startDate);
    if (req.query.endDate) options.endDate = new Date(req.query.endDate);
    if (req.query.operationType) options.operationType = req.query.operationType;

    const stats = await aiCreditService.constructor.prototype.constructor.getUsageStats(userId, options);
    this.sendSuccess(res, stats);
  });

  purchaseCredits = this.wrapAsync(async (
    req: TypedRequest<{}, z.infer<typeof PurchaseCreditsSchema>>,
    res: Response
  ) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new ValidationError('User not authenticated');
    }

    const input = PurchaseCreditsSchema.parse(req.body);

    const creditPackages: Record<number, number> = {
      100: 99,
      500: 449,
      1000: 799,
      5000: 3499,
      10000: 5999,
      50000: 24999,
      100000: 44999,
    };

    let price = creditPackages[input.amount];
    if (!price) {
      price = Math.ceil(input.amount * 0.5);
    }

    const payment = await paymentRepository.create({
      userId,
      amount: price,
      currency: input.currency,
      purpose: 'credits',
      status: 'pending',
      paymentMethod: input.paymentMethod,
      metadata: {
        creditsAmount: input.amount,
        couponCode: input.couponCode,
      },
    });

    this.sendCreated(res, {
      paymentId: payment.id || payment._id,
      amount: price,
      currency: input.currency,
      credits: input.amount,
      status: 'pending',
    }, 'Payment initiated');
  });

  getSubscription = this.wrapAsync(async (
    req: TypedRequest,
    res: Response
  ) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new ValidationError('User not authenticated');
    }

    const subscription = await subscriptionRepository.findActiveByUserId(userId);
    if (!subscription) {
      this.sendSuccess(res, {
        plan: 'Free',
        status: 'active',
        features: ['Basic content generation', '100 monthly credits'],
      });
      return;
    }

    this.sendSuccess(res, subscription);
  });

  updateSubscription = this.wrapAsync(async (
    req: TypedRequest<{}, z.infer<typeof UpdateSubscriptionSchema>>,
    res: Response
  ) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new ValidationError('User not authenticated');
    }

    const input = UpdateSubscriptionSchema.parse(req.body);

    const planPricing: Record<string, { monthly: number; yearly: number }> = {
      Starter: { monthly: 499, yearly: 4990 },
      Pro: { monthly: 999, yearly: 9990 },
      Business: { monthly: 2999, yearly: 29990 },
      Enterprise: { monthly: 9999, yearly: 99990 },
    };

    if (input.plan === 'Free') {
      const existingSub = await subscriptionRepository.findActiveByUserId(userId);
      if (existingSub) {
        await subscriptionRepository.cancelSubscription(userId);
      }
      this.sendSuccess(res, { message: 'Downgraded to Free plan', plan: 'Free' });
      return;
    }

    const price = planPricing[input.plan]?.[input.billingCycle];
    if (!price) {
      throw new ValidationError('Invalid plan or billing cycle');
    }

    const payment = await paymentRepository.create({
      userId,
      amount: price,
      currency: 'INR',
      purpose: 'subscription',
      status: 'pending',
      metadata: {
        plan: input.plan,
        billingCycle: input.billingCycle,
        autoRenew: input.autoRenew,
      },
    });

    this.sendCreated(res, {
      paymentId: payment.id || payment._id,
      plan: input.plan,
      billingCycle: input.billingCycle,
      amount: price,
      currency: 'INR',
      status: 'pending',
    }, 'Subscription update initiated');
  });

  cancelSubscription = this.wrapAsync(async (
    req: TypedRequest<{}, z.infer<typeof CancelSubscriptionSchema>>,
    res: Response
  ) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new ValidationError('User not authenticated');
    }

    const input = CancelSubscriptionSchema.parse(req.body);

    const subscription = await subscriptionRepository.findActiveByUserId(userId);
    if (!subscription) {
      throw new NotFoundError('No active subscription found');
    }

    const canceledSub = await subscriptionRepository.cancelSubscription(userId);

    this.sendSuccess(res, {
      message: input.cancelImmediately 
        ? 'Subscription cancelled immediately' 
        : 'Subscription will be cancelled at the end of the billing period',
      canceledAt: canceledSub?.canceledAt,
      effectiveDate: input.cancelImmediately ? new Date() : subscription.currentPeriodEnd,
    }, 200, 'Subscription cancelled');
  });

  processPayment = this.wrapAsync(async (
    req: TypedRequest<{}, z.infer<typeof ProcessPaymentSchema>>,
    res: Response
  ) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new ValidationError('User not authenticated');
    }

    const input = ProcessPaymentSchema.parse(req.body);

    const payment = await paymentRepository.create({
      userId,
      amount: input.amount,
      currency: input.currency,
      purpose: input.purpose,
      status: 'pending',
      paymentMethod: input.paymentMethod,
      metadata: input.metadata,
    });

    this.sendCreated(res, {
      paymentId: payment.id || payment._id,
      orderId: payment.razorpayOrderId,
      amount: input.amount,
      currency: input.currency,
      status: 'pending',
    }, 'Payment order created');
  });

  verifyPayment = this.wrapAsync(async (
    req: TypedRequest<{}, z.infer<typeof VerifyPaymentSchema>>,
    res: Response
  ) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new ValidationError('User not authenticated');
    }

    const input = VerifyPaymentSchema.parse(req.body);

    const payment = await paymentRepository.findByRazorpayOrderId(input.orderId);
    if (!payment) {
      throw new NotFoundError('Payment not found');
    }

    if (payment.userId !== userId) {
      throw new ValidationError('Payment does not belong to this user');
    }

    const updatedPayment = await paymentRepository.updateById(
      (payment.id || payment._id).toString(),
      {
        razorpayPaymentId: input.paymentId,
        status: 'completed',
        completedAt: new Date(),
        updatedAt: new Date(),
      }
    );

    if (payment.purpose === 'credits' && payment.metadata?.creditsAmount) {
      await aiCreditService.constructor.prototype.constructor.addCredits(
        userId,
        payment.metadata.creditsAmount,
        'purchase',
        { paymentId: input.paymentId }
      );
    }

    this.sendSuccess(res, {
      status: 'completed',
      paymentId: input.paymentId,
    }, 200, 'Payment verified successfully');
  });

  getPaymentHistory = this.wrapAsync(async (
    req: TypedRequest<{}, {}, { page?: string; limit?: string; status?: string }>,
    res: Response
  ) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new ValidationError('User not authenticated');
    }

    const { page, limit } = PaginationQuery.parse(req.query);
    const result = await paymentRepository.findByUserId(userId, { page, limit });

    this.sendPaginated(res, result.data, {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    });
  });

  getPaymentById = this.wrapAsync(async (
    req: TypedRequest<{ paymentId: string }>,
    res: Response
  ) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new ValidationError('User not authenticated');
    }

    const { paymentId } = req.params;
    const payment = await paymentRepository.findById(paymentId);

    if (!payment) {
      throw new NotFoundError('Payment not found');
    }

    if (payment.userId !== userId) {
      throw new ValidationError('Payment does not belong to this user');
    }

    this.sendSuccess(res, payment);
  });
}

export const billingController = new BillingController();
