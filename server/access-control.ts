import { SUBSCRIPTION_PLANS } from './pricing-config';

export interface PlanLimits {
  workspaces: number;
  socialAccountsPerPlatform: number;
  monthlyCredits: number;
  features: string[];
  schedulingDays: number;
  analyticsAccess: boolean;
  chromeExtension: 'none' | 'basic' | 'full';
  watermarkFree: boolean;
  calendarView: 'basic' | 'advanced';
  brandVoiceTrainer: boolean;
  abTesting: boolean;
  priorityPublishing: boolean;
  viralContentAdapter: boolean;
  trendExplorer: boolean;
  apiAccess: boolean;
  whiteLabel: boolean;
  customIntegrations: boolean;
  prioritySupport: boolean;
  accountManager: boolean;
}

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: {
    workspaces: 1,
    socialAccountsPerPlatform: 1,
    monthlyCredits: 20,
    features: [
      "1 Workspace",
      "1 Social Account", 
      "Basic Scheduling",
      "Basic Analytics",
      "Chrome Extension (Basic)",
      "VeeFore Watermarks",
      "7-day Calendar View"
    ],
    schedulingDays: 7,
    analyticsAccess: true,
    chromeExtension: 'basic',
    watermarkFree: false,
    calendarView: 'basic',
    brandVoiceTrainer: false,
    abTesting: false,
    priorityPublishing: false,
    viralContentAdapter: false,
    trendExplorer: false,
    apiAccess: false,
    whiteLabel: false,
    customIntegrations: false,
    prioritySupport: false,
    accountManager: false
  },
  starter: {
    workspaces: 1,
    socialAccountsPerPlatform: 2,
    monthlyCredits: 300,
    features: [
      "1 Workspace",
      "2 Social Accounts", 
      "Advanced Scheduling",
      "Full Analytics",
      "Chrome Extension (Full)",
      "No Watermarks",
      "30-day Calendar View"
    ],
    schedulingDays: 30,
    analyticsAccess: true,
    chromeExtension: 'full',
    watermarkFree: true,
    calendarView: 'advanced',
    brandVoiceTrainer: true,
    abTesting: false,
    priorityPublishing: true,
    viralContentAdapter: true,
    trendExplorer: true,
    apiAccess: false,
    whiteLabel: false,
    customIntegrations: false,
    prioritySupport: false,
    accountManager: false
  },
  pro: {
    workspaces: 2,
    socialAccountsPerPlatform: 1,
    monthlyCredits: 1100,
    features: [
      "2 Workspaces",
      "1 Social Account", 
      "Advanced Scheduling",
      "Full Analytics",
      "Chrome Extension (Full)",
      "No Watermarks",
      "30-day Calendar View",
      "Brand Voice Trainer",
      "A/B Testing",
      "Priority Publishing",
      "Viral Content Adapter",
      "Trend Explorer",
      "2 Team Members"
    ],
    schedulingDays: 30,
    analyticsAccess: true,
    chromeExtension: 'full',
    watermarkFree: true,
    calendarView: 'advanced',
    brandVoiceTrainer: true,
    abTesting: true,
    priorityPublishing: true,
    viralContentAdapter: true,
    trendExplorer: true,
    apiAccess: false,
    whiteLabel: false,
    customIntegrations: false,
    prioritySupport: false,
    accountManager: false
  },
  business: {
    workspaces: 8,
    socialAccountsPerPlatform: 4,
    monthlyCredits: 2000,
    features: [
      "8 Workspaces",
      "4 Social Accounts", 
      "Advanced Scheduling",
      "Full Analytics",
      "Chrome Extension (Full)",
      "No Watermarks",
      "30-day Calendar View",
      "Brand Voice Trainer",
      "A/B Testing",
      "Priority Publishing",
      "Viral Content Adapter",
      "Trend Explorer",
      "API Access",
      "White Label",
      "Custom Integrations",
      "Priority Support",
      "Account Manager",
      "3 Team Members"
    ],
    schedulingDays: 30,
    analyticsAccess: true,
    chromeExtension: 'full',
    watermarkFree: true,
    calendarView: 'advanced',
    brandVoiceTrainer: true,
    abTesting: true,
    priorityPublishing: true,
    viralContentAdapter: true,
    trendExplorer: true,
    apiAccess: true,
    whiteLabel: true,
    customIntegrations: true,
    prioritySupport: true,
    accountManager: true
  },
  creator: {
    workspaces: 3,
    socialAccountsPerPlatform: 3,
    monthlyCredits: 200,
    features: [
      "3 Workspaces",
      "3 Social Accounts per Platform",
      "Advanced Scheduling",
      "Full Analytics",
      "Chrome Extension (Full)",
      "No Watermarks",
      "30-day Calendar View",
      "Brand Voice Trainer",
      "A/B Testing",
      "Priority Publishing",
      "Viral Content Adapter",
      "Trend Explorer"
    ],
    schedulingDays: 30,
    analyticsAccess: true,
    chromeExtension: 'full',
    watermarkFree: true,
    calendarView: 'advanced',
    brandVoiceTrainer: true,
    abTesting: true,
    priorityPublishing: true,
    viralContentAdapter: true,
    trendExplorer: true,
    apiAccess: false,
    whiteLabel: false,
    customIntegrations: false,
    prioritySupport: false,
    accountManager: false
  },
  pro: {
    workspaces: 10,
    socialAccountsPerPlatform: 10,
    monthlyCredits: 500,
    features: [
      "10 Workspaces",
      "10 Social Accounts per Platform",
      "Advanced Scheduling",
      "Advanced Analytics & Reporting",
      "Chrome Extension (Full)",
      "No Watermarks",
      "Unlimited Calendar View",
      "Brand Voice Trainer",
      "A/B Testing",
      "Priority Publishing",
      "Viral Content Adapter",
      "Trend Explorer",
      "API Access",
      "White-label Options",
      "Custom Integrations"
    ],
    schedulingDays: 365,
    analyticsAccess: true,
    chromeExtension: 'full',
    watermarkFree: true,
    calendarView: 'advanced',
    brandVoiceTrainer: true,
    abTesting: true,
    priorityPublishing: true,
    viralContentAdapter: true,
    trendExplorer: true,
    apiAccess: true,
    whiteLabel: true,
    customIntegrations: true,
    prioritySupport: true,
    accountManager: false
  },
  enterprise: {
    workspaces: 999,
    socialAccountsPerPlatform: 999,
    monthlyCredits: 2000,
    features: [
      "Unlimited Workspaces",
      "Unlimited Social Accounts",
      "Advanced Scheduling",
      "Enterprise Analytics & Reporting",
      "Chrome Extension (Full)",
      "No Watermarks",
      "Unlimited Calendar View",
      "Brand Voice Trainer",
      "A/B Testing",
      "Priority Publishing",
      "Viral Content Adapter",
      "Trend Explorer",
      "Full API Access",
      "Complete White-label",
      "Custom Integrations",
      "Priority Support",
      "Dedicated Account Manager"
    ],
    schedulingDays: 365,
    analyticsAccess: true,
    chromeExtension: 'full',
    watermarkFree: true,
    calendarView: 'advanced',
    brandVoiceTrainer: true,
    abTesting: true,
    priorityPublishing: true,
    viralContentAdapter: true,
    trendExplorer: true,
    apiAccess: true,
    whiteLabel: true,
    customIntegrations: true,
    prioritySupport: true,
    accountManager: true
  }
};

export class AccessControl {
  static getPlanLimits(plan: string): PlanLimits {
    return PLAN_LIMITS[plan?.toLowerCase()] || PLAN_LIMITS.free;
  }

  static canCreateWorkspace(userPlan: string, currentWorkspaceCount: number): { allowed: boolean; reason?: string } {
    const limits = this.getPlanLimits(userPlan);
    
    if (currentWorkspaceCount >= limits.workspaces) {
      return {
        allowed: false,
        reason: `Your ${userPlan} plan allows up to ${limits.workspaces} workspace${limits.workspaces === 1 ? '' : 's'}. Upgrade to create more.`
      };
    }
    
    return { allowed: true };
  }

  static canConnectSocialAccount(userPlan: string, platform: string, currentAccountCount: number): { allowed: boolean; reason?: string } {
    const limits = this.getPlanLimits(userPlan);
    
    if (currentAccountCount >= limits.socialAccountsPerPlatform) {
      return {
        allowed: false,
        reason: `Your ${userPlan} plan allows up to ${limits.socialAccountsPerPlatform} ${platform} account${limits.socialAccountsPerPlatform === 1 ? '' : 's'}. Upgrade to connect more.`
      };
    }
    
    return { allowed: true };
  }

  static canUseCredits(userPlan: string, userCredits: number, requiredCredits: number): { allowed: boolean; reason?: string } {
    if (userCredits < requiredCredits) {
      return {
        allowed: false,
        reason: `Insufficient credits. You need ${requiredCredits} credits but have ${userCredits}. Purchase more credits or upgrade your plan.`
      };
    }
    
    return { allowed: true };
  }

  static canScheduleContent(userPlan: string, scheduledDate: Date): { allowed: boolean; reason?: string } {
    const limits = this.getPlanLimits(userPlan);
    const now = new Date();
    const maxDate = new Date(now.getTime() + (limits.schedulingDays * 24 * 60 * 60 * 1000));
    
    if (scheduledDate > maxDate) {
      return {
        allowed: false,
        reason: `Your ${userPlan} plan allows scheduling up to ${limits.schedulingDays} days in advance. Upgrade to schedule further ahead.`
      };
    }
    
    return { allowed: true };
  }

  static canAccessFeature(userPlan: string, feature: string): { allowed: boolean; reason?: string } {
    const limits = this.getPlanLimits(userPlan);
    
    const featureMap: Record<string, keyof PlanLimits> = {
      'analytics': 'analyticsAccess',
      'brand_voice_trainer': 'brandVoiceTrainer',
      'ab_testing': 'abTesting',
      'priority_publishing': 'priorityPublishing',
      'viral_content_adapter': 'viralContentAdapter',
      'trend_explorer': 'trendExplorer',
      'api_access': 'apiAccess',
      'white_label': 'whiteLabel',
      'custom_integrations': 'customIntegrations',
      'priority_support': 'prioritySupport',
      'account_manager': 'accountManager'
    };

    const limitKey = featureMap[feature];
    if (!limitKey) {
      return { allowed: true }; // Unknown feature, allow by default
    }

    const hasAccess = limits[limitKey];
    if (!hasAccess) {
      return {
        allowed: false,
        reason: `This feature is not available in your ${userPlan} plan. Upgrade to access it.`
      };
    }
    
    return { allowed: true };
  }

  static canRemoveWatermark(userPlan: string): { allowed: boolean; reason?: string } {
    const limits = this.getPlanLimits(userPlan);
    
    if (!limits.watermarkFree) {
      return {
        allowed: false,
        reason: `Watermark removal is not available in your ${userPlan} plan. Upgrade to remove watermarks.`
      };
    }
    
    return { allowed: true };
  }

  static getChromeExtensionLevel(userPlan: string): 'none' | 'basic' | 'full' {
    const limits = this.getPlanLimits(userPlan);
    return limits.chromeExtension;
  }

  static getCalendarViewType(userPlan: string): 'basic' | 'advanced' {
    const limits = this.getPlanLimits(userPlan);
    return limits.calendarView;
  }

  static getMonthlyCredits(userPlan: string): number {
    const limits = this.getPlanLimits(userPlan);
    return limits.monthlyCredits;
  }

  static generateUpgradeMessage(userPlan: string, targetFeature: string): string {
    const currentLimits = this.getPlanLimits(userPlan);
    
    // Find the lowest plan that includes the target feature
    const plans = ['creator', 'pro', 'enterprise'];
    for (const plan of plans) {
      if (plan === userPlan) continue;
      
      const planLimits = this.getPlanLimits(plan);
      const planConfig = SUBSCRIPTION_PLANS[plan];
      
      if (planConfig && this.planIncludesFeature(planLimits, targetFeature)) {
        return `Upgrade to ${planConfig.name} (₹${planConfig.price}/month) to unlock this feature and more.`;
      }
    }
    
    return `Upgrade your plan to access this feature.`;
  }

  private static planIncludesFeature(limits: PlanLimits, feature: string): boolean {
    switch (feature) {
      case 'analytics': return limits.analyticsAccess;
      case 'brand_voice_trainer': return limits.brandVoiceTrainer;
      case 'ab_testing': return limits.abTesting;
      case 'priority_publishing': return limits.priorityPublishing;
      case 'viral_content_adapter': return limits.viralContentAdapter;
      case 'trend_explorer': return limits.trendExplorer;
      case 'api_access': return limits.apiAccess;
      case 'white_label': return limits.whiteLabel;
      case 'custom_integrations': return limits.customIntegrations;
      case 'priority_support': return limits.prioritySupport;
      case 'account_manager': return limits.accountManager;
      case 'watermark_free': return limits.watermarkFree;
      default: return true;
    }
  }
}