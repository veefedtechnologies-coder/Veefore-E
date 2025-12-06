import { User, IUser } from '../models/User/User';
import { AIUsageLogModel, IAIUsageLog } from '../models/AI/AIUsageLog';
import { logUserAction, AuditActions, AuditResources } from '../utils/audit-logger';

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
    baseCredits: 1,
    perTokenCredits: 0.001,
    description: 'AI chat/copilot interactions'
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

const PLAN_MONTHLY_CREDITS: Record<string, number> = {
  'Free': 100,
  'Starter': 500,
  'Pro': 2000,
  'Business': 10000,
  'Enterprise': 50000
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

    return Math.max(1, Math.ceil(totalCredits));
  }

  static async checkCredits(userId: string, requiredCredits: number): Promise<{
    hasCredits: boolean;
    currentCredits: number;
    requiredCredits: number;
    shortfall: number;
  }> {
    const user = await User.findById(userId).select('credits').lean();
    
    if (!user) {
      return {
        hasCredits: false,
        currentCredits: 0,
        requiredCredits,
        shortfall: requiredCredits
      };
    }

    const currentCredits = user.credits || 0;
    const hasCredits = currentCredits >= requiredCredits;

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
    const creditsToDeduct = options?.creditsToDeduct || 
      this.calculateCost(operationType, options);

    const userCheck = await User.findById(userId).select('credits').lean();
    
    if (!userCheck) {
      return {
        success: false,
        creditsBefore: 0,
        creditsAfter: 0,
        creditsDeducted: 0,
        error: 'User not found'
      };
    }

    const creditsBefore = userCheck.credits || 0;

    const updatedUser = await User.findOneAndUpdate(
      { 
        _id: userId, 
        credits: { $gte: creditsToDeduct } 
      },
      { 
        $inc: { credits: -creditsToDeduct } 
      },
      { 
        new: true,
        select: 'credits'
      }
    );

    if (!updatedUser) {
      await this.logUsage({
        userId,
        workspaceId: options?.workspaceId,
        operationType,
        aiProvider: options?.aiProvider || 'openai',
        aiModel: options?.model,
        creditsUsed: 0,
        creditsBefore,
        creditsAfter: creditsBefore,
        success: false,
        errorMessage: 'Insufficient credits',
        requestMetadata: { endpoint: options?.endpoint }
      });

      return {
        success: false,
        creditsBefore,
        creditsAfter: creditsBefore,
        creditsDeducted: 0,
        error: `Insufficient credits. Required: ${creditsToDeduct}, Available: ${creditsBefore}`
      };
    }

    const creditsAfter = updatedUser.credits;

    await this.logUsage({
      userId,
      workspaceId: options?.workspaceId,
      operationType,
      aiProvider: options?.aiProvider || 'openai',
      aiModel: options?.model,
      creditsUsed: creditsToDeduct,
      creditsBefore,
      creditsAfter,
      success: true,
      requestMetadata: { endpoint: options?.endpoint }
    });

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

    return {
      success: true,
      creditsBefore,
      creditsAfter,
      creditsDeducted: creditsToDeduct
    };
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
    const user = await User.findById(userId).select('credits');
    
    if (!user) {
      return {
        success: false,
        creditsBefore: 0,
        creditsAfter: 0,
        creditsAdded: 0,
        error: 'User not found'
      };
    }

    const creditsBefore = user.credits || 0;
    user.credits = creditsBefore + creditsToAdd;
    await user.save();

    const creditsAfter = user.credits;

    await logUserAction(userId, AuditActions.BILLING.CREDIT_PURCHASE, {
      reason,
      creditsAdded: creditsToAdd,
      creditsBefore,
      creditsAfter,
      ...metadata
    }, {
      resource: AuditResources.AI_CREDITS
    });

    return {
      success: true,
      creditsBefore,
      creditsAfter,
      creditsAdded: creditsToAdd
    };
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
    const user = await User.findById(userId).select('credits plan').lean();
    
    if (!user) {
      return {
        credits: 0,
        plan: 'Free',
        monthlyAllowance: PLAN_MONTHLY_CREDITS['Free']
      };
    }

    const plan = user.plan || 'Free';
    const monthlyAllowance = PLAN_MONTHLY_CREDITS[plan] || PLAN_MONTHLY_CREDITS['Free'];

    return {
      credits: user.credits || 0,
      plan,
      monthlyAllowance
    };
  }

  static async resetMonthlyCredits(userId: string): Promise<{
    success: boolean;
    newCredits: number;
  }> {
    const user = await User.findById(userId).select('credits plan');
    
    if (!user) {
      return { success: false, newCredits: 0 };
    }

    const plan = user.plan || 'Free';
    const monthlyCredits = PLAN_MONTHLY_CREDITS[plan] || PLAN_MONTHLY_CREDITS['Free'];
    
    user.credits = monthlyCredits;
    await user.save();

    await logUserAction(userId, 'credits.monthly_reset', {
      plan,
      newCredits: monthlyCredits
    }, {
      resource: AuditResources.AI_CREDITS
    });

    return {
      success: true,
      newCredits: monthlyCredits
    };
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
    return { ...PLAN_MONTHLY_CREDITS };
  }
}

export const aiCreditService = new AICreditService();
