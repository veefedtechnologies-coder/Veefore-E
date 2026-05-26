import { storage } from './storage';
import Razorpay from 'razorpay';
import crypto from 'crypto';

if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  throw new Error('Missing required Razorpay credentials: RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET');
}

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

export interface PlanLimits {
  monthlyCredits: number;
  maxWorkspaces: number;
  maxSocialAccounts: number;
  maxScheduledPosts: number;
  maxTeamMembers: number;
  features: {
    aiContentGeneration: boolean;
    advancedAnalytics: boolean;
    prioritySupport: boolean;
    customBranding: boolean;
    apiAccess: boolean;
    bulkOperations: boolean;
    videoGeneration: boolean;
    audioGeneration: boolean;
    instagramPublishing: boolean;
    facebookPublishing: boolean;
    twitterPublishing: boolean;
    linkedinPublishing: boolean;
    tiktokPublishing: boolean;
    youtubePublishing: boolean;
  };
}

// Plan pricing in INR (Razorpay amounts are in paise)
export const PLAN_PRICING = {
  creator: { amount: 99900, currency: 'INR' }, // ₹999/month
  pro: { amount: 249900, currency: 'INR' }, // ₹2499/month
  enterprise: { amount: 599900, currency: 'INR' }, // ₹5999/month
};

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: {
    monthlyCredits: 0,
    maxWorkspaces: 1,
    maxSocialAccounts: 1,
    maxScheduledPosts: 5,
    maxTeamMembers: 1,
    features: {
      aiContentGeneration: true,
      advancedAnalytics: false,
      prioritySupport: false,
      customBranding: false,
      apiAccess: false,
      bulkOperations: false,
      videoGeneration: false,
      audioGeneration: false,
      instagramPublishing: true,
      facebookPublishing: false,
      twitterPublishing: false,
      linkedinPublishing: false,
      tiktokPublishing: false,
      youtubePublishing: false,
    },
  },
  creator: {
    monthlyCredits: 200,
    maxWorkspaces: 3,
    maxSocialAccounts: 3,
    maxScheduledPosts: 50,
    maxTeamMembers: 2,
    features: {
      aiContentGeneration: true,
      advancedAnalytics: true,
      prioritySupport: false,
      customBranding: false,
      apiAccess: false,
      bulkOperations: true,
      videoGeneration: true,
      audioGeneration: false,
      instagramPublishing: true,
      facebookPublishing: true,
      twitterPublishing: true,
      linkedinPublishing: false,
      tiktokPublishing: false,
      youtubePublishing: false,
    },
  },
  pro: {
    monthlyCredits: 750,
    maxWorkspaces: 10,
    maxSocialAccounts: 10,
    maxScheduledPosts: 200,
    maxTeamMembers: 5,
    features: {
      aiContentGeneration: true,
      advancedAnalytics: true,
      prioritySupport: true,
      customBranding: true,
      apiAccess: true,
      bulkOperations: true,
      videoGeneration: true,
      audioGeneration: true,
      instagramPublishing: true,
      facebookPublishing: true,
      twitterPublishing: true,
      linkedinPublishing: true,
      tiktokPublishing: true,
      youtubePublishing: false,
    },
  },
  enterprise: {
    monthlyCredits: 2000,
    maxWorkspaces: -1, // unlimited
    maxSocialAccounts: -1, // unlimited
    maxScheduledPosts: -1, // unlimited
    maxTeamMembers: -1, // unlimited
    features: {
      aiContentGeneration: true,
      advancedAnalytics: true,
      prioritySupport: true,
      customBranding: true,
      apiAccess: true,
      bulkOperations: true,
      videoGeneration: true,
      audioGeneration: true,
      instagramPublishing: true,
      facebookPublishing: true,
      twitterPublishing: true,
      linkedinPublishing: true,
      tiktokPublishing: true,
      youtubePublishing: true,
    },
  },
};

export class SubscriptionService {
  static async getUserPlanLimits(userId: string): Promise<PlanLimits> {
    const user = await storage.getUser(parseInt(userId));
    if (!user) {
      throw new Error('User not found');
    }

    const plan = user.plan || 'free';
    return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  }

  static async checkFeatureAccess(userId: string, feature: keyof PlanLimits['features']): Promise<boolean> {
    const limits = await this.getUserPlanLimits(userId);
    return limits.features[feature];
  }

  static async checkCreditsAvailable(userId: string, requiredCredits: number): Promise<boolean> {
    const user = await storage.getUser(parseInt(userId));
    if (!user) return false;

    return (user.credits || 0) >= requiredCredits;
  }

  static async deductCredits(userId: string, credits: number): Promise<boolean> {
    const user = await storage.getUser(parseInt(userId));
    if (!user) return false;

    if ((user.credits || 0) < credits) {
      return false;
    }

    await storage.updateUserCredits(parseInt(userId), (user.credits || 0) - credits);
    return true;
  }

  static async checkWorkspaceLimit(userId: string): Promise<boolean> {
    const limits = await this.getUserPlanLimits(userId);
    if (limits.maxWorkspaces === -1) return true; // unlimited

    const workspaces = await storage.getWorkspacesByUserId(parseInt(userId));
    return workspaces.length < limits.maxWorkspaces;
  }

  static async checkSocialAccountLimit(userId: string, workspaceId: string): Promise<boolean> {
    const limits = await this.getUserPlanLimits(userId);
    if (limits.maxSocialAccounts === -1) return true; // unlimited

    const accounts = await storage.getSocialAccountsByWorkspace(workspaceId);
    return accounts.length < limits.maxSocialAccounts;
  }

  static async checkScheduledPostLimit(userId: string): Promise<boolean> {
    const limits = await this.getUserPlanLimits(userId);
    if (limits.maxScheduledPosts === -1) return true; // unlimited

    const scheduledPosts = await storage.getScheduledContent();
    const userPosts = scheduledPosts.filter(post => {
      // We need to check if this post belongs to user's workspace
      // This would require additional logic to link posts to users
      return true; // For now, allow all
    });

    return userPosts.length < limits.maxScheduledPosts;
  }

  static async createSubscription(userId: string, planId: string): Promise<{ orderId: string; amount: number; currency: string }> {
    const user = await storage.getUser(parseInt(userId));
    if (!user || !user.email) {
      throw new Error('User not found or no email');
    }

    if (!PLAN_PRICING[planId as keyof typeof PLAN_PRICING]) {
      throw new Error('Invalid plan ID');
    }

    const planPricing = PLAN_PRICING[planId as keyof typeof PLAN_PRICING];

    // Create Razorpay order
    const orderOptions = {
      amount: planPricing.amount, // amount in paise
      currency: planPricing.currency,
      receipt: `sub_${userId}_${planId}_${Date.now()}`,
      notes: {
        userId: userId,
        planId: planId,
        email: user.email,
      },
    };

    const order = await razorpay.orders.create(orderOptions);

    // Store order in database
    await storage.createPayment({
      userId: parseInt(userId),
      amount: planPricing.amount / 100, // convert to rupees for storage
      currency: planPricing.currency,
      razorpayOrderId: order.id,
      purpose: `Subscription - ${planId}`,
      status: 'created',
      metadata: {
        planId: planId,
        subscriptionType: 'monthly',
      },
    });

    return {
      orderId: order.id,
      amount: planPricing.amount,
      currency: planPricing.currency,
    };
  }

  static async verifyPayment(
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string
  ): Promise<boolean> {
    const body = razorpayOrderId + '|' + razorpayPaymentId;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(body.toString())
      .digest('hex');

    return expectedSignature === razorpaySignature;
  }

  static async handleSuccessfulPayment(
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string
  ): Promise<void> {
    // Verify payment signature
    const isValid = await this.verifyPayment(razorpayOrderId, razorpayPaymentId, razorpaySignature);
    if (!isValid) {
      throw new Error('Invalid payment signature');
    }

    // Get payment record
    const payment = await storage.getPaymentByOrderId(razorpayOrderId);
    if (!payment) {
      throw new Error('Payment record not found');
    }

    // Update payment status
    await storage.updatePaymentStatus(payment.id, {
      status: 'completed',
      razorpayPaymentId: razorpayPaymentId,
      razorpaySignature: razorpaySignature,
    });

    // Get plan from payment metadata
    const planId = (payment.metadata as any)?.planId;
    if (!planId) {
      throw new Error('Plan ID not found in payment metadata');
    }

    // Update user subscription
    const currentDate = new Date();
    const nextBillingDate = new Date();
    nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

    await storage.updateUserPlan(payment.userId, {
      plan: planId,
      subscriptionStatus: 'active',
      currentPeriodStart: currentDate,
      currentPeriodEnd: nextBillingDate,
      credits: 0,
    });
  }

  static async cancelSubscription(userId: string): Promise<void> {
    await storage.updateUserPlan(parseInt(userId), {
      plan: 'free',
      subscriptionStatus: 'canceled',
      currentPeriodEnd: new Date(),
      credits: 0,
    });
  }

  static async refreshCredits(userId: string): Promise<void> {
    // SECURITY: Automatic credit refresh completely disabled to prevent loopholes
    // All credits must be purchased through authenticated payment system
    console.log(`[SUBSCRIPTION SECURITY] Automatic credit refresh blocked for user ${userId} - purchase required`);
    return;
  }

  static async getUserSubscriptionStatus(userId: string): Promise<{
    plan: string;
    status: string;
    credits: number;
    limits: PlanLimits;
    nextBilling?: Date;
  }> {
    const user = await storage.getUser(parseInt(userId));
    if (!user) {
      throw new Error('User not found');
    }

    const plan = user.plan || 'free';
    const limits = PLAN_LIMITS[plan];

    return {
      plan: plan,
      status: user.subscriptionStatus || 'free',
      credits: user.credits || 0,
      limits: limits,
      nextBilling: user.currentPeriodEnd || undefined,
    };
  }

  // Credit management functions
  static async addCredits(userId: string, credits: number, source: string = 'purchase'): Promise<void> {
    const user = await storage.getUser(parseInt(userId));
    if (!user) throw new Error('User not found');

    const newCredits = (user.credits || 0) + credits;
    await storage.updateUserCredits(parseInt(userId), newCredits);

    // Log the credit transaction
    await storage.createCreditTransaction({
      userId: parseInt(userId),
      amount: credits,
      type: 'credit',
      source: source,
      description: `Added ${credits} credits from ${source}`,
    });
  }

  static async deductCreditsWithLog(userId: string, credits: number, source: string, description: string): Promise<boolean> {
    const user = await storage.getUser(parseInt(userId));
    if (!user) return false;

    if ((user.credits || 0) < credits) {
      return false;
    }

    const newCredits = (user.credits || 0) - credits;
    await storage.updateUserCredits(parseInt(userId), newCredits);

    // Log the credit transaction
    await storage.createCreditTransaction({
      userId: parseInt(userId),
      amount: -credits,
      type: 'debit',
      source: source,
      description: description,
    });

    return true;
  }
}