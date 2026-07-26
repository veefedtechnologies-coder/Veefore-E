import { AIUsageLogModel } from '../models/AI/AIUsageLog';
import { logUserAction, AuditActions, AuditResources } from '../utils/audit-logger';
import { getRedisClient } from '../lib/redis';
import SubscriptionRepository from '../features/subscription/db/repositories/SubscriptionRepository';
import { AICreditsRepository } from '../features/subscription/db/repositories/AICreditsRepository';
import { getEntitlementService } from '../features/subscription/services/EntitlementService';
import { PLAN_CONFIG } from '../config/plan-config';

function canonicalCredits() {
  const redis = getRedisClient();
  return getEntitlementService(redis, new SubscriptionRepository());
}

export type AIOperationType = 
  | 'content_generation' 
  | 'image_generation' 
  | 'video_generation' 
  | 'analysis' 
  | 'chat' 
  | 'trend_analysis' 
  | 'competitor_analysis' 
  | 'repurpose' 
  | 'other';

export type AIProvider = 'openai' | 'anthropic' | 'google' | 'replicate' | 'elevenlabs' | 'other';

export interface CreditCost {
  baseCredits: number;
  perTokenCredits?: number;
  description: string;
}

const CREDIT_COSTS: Record<AIOperationType, CreditCost> = {
  content_generation: {
    baseCredits: 5,
    perTokenCredits: 0.001,
    description: 'AI content generation (captions, posts, articles)'
  },
  image_generation: {
    baseCredits: 10,
    description: 'AI image generation (thumbnails, graphics)'
  },
  video_generation: {
    baseCredits: 50,
    description: 'AI video generation'
  },
  analysis: {
    baseCredits: 3,
    perTokenCredits: 0.0005,
    description: 'AI analysis (sentiment, engagement prediction)'
  },
  chat: {
    baseCredits: 0,
    description: 'Plain VeeGPT chat is free; caption/hashtag tools meter separately'
  },
  trend_analysis: {
    baseCredits: 5,
    description: 'Trend and viral content analysis'
  },
  competitor_analysis: {
    baseCredits: 8,
    description: 'Competitor analysis and insights'
  },
  repurpose: {
    baseCredits: 4,
    description: 'Content repurposing across platforms'
  },
  other: {
    baseCredits: 2,
    description: 'Other AI operations'
  }
};

export class AICreditService {
  static calculateCost(
    operationType: AIOperationType,
    options?: {
      estimatedTokens?: number;
      imageCount?: number;
      videoDuration?: number;
    }
  ): number {
    const costConfig = CREDIT_COSTS[operationType];
    let totalCredits = costConfig.baseCredits;

    if (costConfig.perTokenCredits && options?.estimatedTokens) {
      totalCredits += Math.ceil(options.estimatedTokens * costConfig.perTokenCredits);
    }

    if (operationType === 'image_generation' && options?.imageCount) {
      totalCredits = costConfig.baseCredits * options.imageCount;
    }

    if (operationType === 'video_generation' && options?.videoDuration) {
      totalCredits = Math.ceil(costConfig.baseCredits * (options.videoDuration / 10));
    }

    if (operationType === 'chat') return 0;
    return Math.max(0.01, Math.ceil(totalCredits * 100) / 100);
  }

  static async checkCredits(userId: string, requiredCredits: number): Promise<{
    hasCredits: boolean;
    currentCredits: number;
    requiredCredits: number;
    shortfall: number;
  }> {
    const currentCredits = await canonicalCredits().remainingCredits(userId);
    const hasCredits = currentCredits === Infinity || currentCredits >= requiredCredits;
    return {
      hasCredits,
      currentCredits,
      requiredCredits,
      shortfall: hasCredits ? 0 : requiredCredits - currentCredits
    };
  }

  static async deductCredits(
    userId: string,
    operationType: AIOperationType,
    options?: {
      creditsToDeduct?: number;
      estimatedTokens?: number;
      imageCount?: number;
      videoDuration?: number;
      workspaceId?: string;
      aiProvider?: AIProvider;
      model?: string;
      endpoint?: string;
    }
  ): Promise<{
    success: boolean;
    creditsBefore: number;
    creditsAfter: number;
    creditsDeducted: number;
    error?: string;
  }> {
    const creditsToDeduct = options?.creditsToDeduct ?? this.calculateCost(operationType, options);
    const service = canonicalCredits();
    const creditsBefore = await service.remainingCredits(userId);

    if (!Number.isFinite(creditsToDeduct) || creditsToDeduct < 0) {
      return {
        success: false,
        creditsBefore,
        creditsAfter: creditsBefore,
        creditsDeducted: 0,
        error: 'Credit deduction amount must be a non-negative finite number'
      };
    }

    // Compatibility for old chat routes: plain VeeGPT chat is free.
    if (creditsToDeduct === 0 || creditsBefore === Infinity) {
      return { success: true, creditsBefore, creditsAfter: creditsBefore, creditsDeducted: 0 };
    }

    const result = await service.deductCredits(userId, creditsToDeduct);
    const creditsAfter = result.remaining;

    await this.logUsage({
      userId,
      workspaceId: options?.workspaceId,
      operationType,
      aiProvider: options?.aiProvider || 'openai',
      aiModel: options?.model,
      creditsUsed: result.success ? creditsToDeduct : 0,
      creditsBefore,
      creditsAfter,
      success: result.success,
      errorMessage: result.success ? undefined : 'Insufficient credits',
      requestMetadata: { endpoint: options?.endpoint }
    });

    if (!result.success) {
      return {
        success: false,
        creditsBefore,
        creditsAfter,
        creditsDeducted: 0,
        error: `Insufficient credits. Required: ${creditsToDeduct}, Available: ${creditsBefore}`
      };
    }

    try {
      await Promise.all([
        service.invalidateCache(userId),
        getRedisClient().del(`sub:me:${userId}`),
      ]);
    } catch (cacheError) {
      console.error('Failed to invalidate credit cache after deduction:', cacheError);
    }

    try {
      await logUserAction(userId, AuditActions.AI.GENERATE_CONTENT, {
        operationType,
        creditsDeducted: creditsToDeduct,
        creditsBefore,
        creditsAfter,
        provider: options?.aiProvider
      }, {
        workspaceId: options?.workspaceId,
        resource: AuditResources.AI_CREDITS
      });
    } catch (auditError) {
      // The canonical balance mutation already committed. Audit availability
      // must never convert a successful debit into an HTTP failure.
      console.error('Failed to audit AI credit deduction:', auditError);
    }

    return { success: true, creditsBefore, creditsAfter, creditsDeducted: creditsToDeduct };
  }

  static async addCredits(
    userId: string,
    creditsToAdd: number,
    reason: 'purchase' | 'subscription' | 'bonus' | 'referral' | 'refund' | 'admin',
    metadata?: Record<string, any>
  ): Promise<{
    success: boolean;
    creditsBefore: number;
    creditsAfter: number;
    creditsAdded: number;
    error?: string;
  }> {
    const service = canonicalCredits();
    await service.ensureCreditAccount(userId);
    const creditsBefore = await service.remainingCredits(userId);
    if (!Number.isFinite(creditsToAdd) || creditsToAdd <= 0) {
      return {
        success: false,
        creditsBefore,
        creditsAfter: creditsBefore,
        creditsAdded: 0,
        error: 'Credit addition amount must be a positive finite number'
      };
    }
    const updated = await new AICreditsRepository().addPurchasedCredits(userId, creditsToAdd);
    if (!updated) {
      return { success: false, creditsBefore, creditsAfter: creditsBefore, creditsAdded: 0, error: 'Credit account unavailable' };
    }
    const creditsAfter = updated.remainingCredits;
    try {
      await Promise.all([
        service.invalidateCache(userId),
        getRedisClient().del(`sub:me:${userId}`),
      ]);
    } catch (cacheError) {
      console.error('Failed to invalidate credit cache after addition:', cacheError);
    }

    try {
      await logUserAction(userId, AuditActions.BILLING.CREDIT_PURCHASE, {
        reason,
        creditsAdded: creditsToAdd,
        creditsBefore,
        creditsAfter,
        ...metadata
      }, { resource: AuditResources.AI_CREDITS });
    } catch (auditError) {
      console.error('Failed to audit AI credit addition:', auditError);
    }

    return { success: true, creditsBefore, creditsAfter, creditsAdded: creditsToAdd };
  }

  static async getUsageStats(
    userId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      operationType?: AIOperationType;
    }
  ): Promise<{
    totalCreditsUsed: number;
    operationBreakdown: Record<string, number>;
    successRate: number;
    totalOperations: number;
  }> {
    const query: any = { userId };

    if (options?.startDate || options?.endDate) {
      query.createdAt = {};
      if (options?.startDate) query.createdAt.$gte = options.startDate;
      if (options?.endDate) query.createdAt.$lte = options.endDate;
    }

    if (options?.operationType) {
      query.operationType = options.operationType;
    }

    const logs = await AIUsageLogModel.find(query).lean();

    const totalCreditsUsed = logs.reduce((sum, log) => sum + (log.creditsUsed || 0), 0);
    const successfulOps = logs.filter(log => log.success).length;
    const successRate = logs.length > 0 ? (successfulOps / logs.length) * 100 : 0;

    const operationBreakdown: Record<string, number> = {};
    logs.forEach(log => {
      if (!operationBreakdown[log.operationType]) {
        operationBreakdown[log.operationType] = 0;
      }
      operationBreakdown[log.operationType] += log.creditsUsed || 0;
    });

    return {
      totalCreditsUsed,
      operationBreakdown,
      successRate: Math.round(successRate * 100) / 100,
      totalOperations: logs.length
    };
  }

  static async getUserCredits(userId: string): Promise<{
    credits: number;
    plan: string;
    monthlyAllowance: number;
  }> {
    const service = canonicalCredits();
    const plan = await service.getPlan(userId);
    const credits = await service.remainingCredits(userId);
    return {
      credits,
      plan,
      monthlyAllowance: PLAN_CONFIG[plan].limits.aiCreditsPerMonth
    };
  }

  static async resetMonthlyCredits(userId: string): Promise<{
    success: boolean;
    newCredits: number;
  }> {
    const service = canonicalCredits();
    const plan = await service.getPlan(userId);
    if (plan === 'enterprise') return { success: true, newCredits: Infinity };
    const allocation = PLAN_CONFIG[plan].limits.aiCreditsPerMonth;
    const nextResetAt = new Date();
    nextResetAt.setUTCMonth(nextResetAt.getUTCMonth() + 1);
    const updated = await new AICreditsRepository().resetMonthly(userId, allocation, nextResetAt)
      ?? await new AICreditsRepository().ensureForUser(userId, allocation, nextResetAt);
    try {
      await Promise.all([
        service.invalidateCache(userId),
        getRedisClient().del(`sub:me:${userId}`),
      ]);
    } catch (cacheError) {
      console.error('Failed to invalidate credit cache after monthly reset:', cacheError);
    }

    try {
      await logUserAction(userId, 'credits.monthly_reset', {
        plan,
        newCredits: updated.remainingCredits
      }, { resource: AuditResources.AI_CREDITS });
    } catch (auditError) {
      console.error('Failed to audit monthly AI credit reset:', auditError);
    }

    return { success: true, newCredits: updated.remainingCredits };
  }

  private static async logUsage(data: {
    userId: string;
    workspaceId?: string;
    operationType: AIOperationType;
    aiProvider: AIProvider;
    aiModel?: string;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    creditsUsed: number;
    creditsBefore: number;
    creditsAfter: number;
    success: boolean;
    errorMessage?: string;
    responseTimeMs?: number;
    requestMetadata?: {
      promptLength?: number;
      responseLength?: number;
      imageSize?: string;
      videoDuration?: number;
      endpoint?: string;
    };
  }): Promise<IAIUsageLog | null> {
    try {
      return await AIUsageLogModel.create(data);
    } catch (error) {
      console.error('Failed to log AI usage:', error);
      return null;
    }
  }

  static getCreditCosts(): Record<AIOperationType, CreditCost> {
    return { ...CREDIT_COSTS };
  }

  static getPlanCredits(): Record<string, number> {
    return Object.fromEntries(
      Object.values(PLAN_CONFIG).map((plan) => [plan.name, plan.limits.aiCreditsPerMonth])
    );
  }
}

export const aiCreditService = new AICreditService();
