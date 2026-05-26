// VeeFore Subscription Configuration
// Complete plan definitions with feature access and pricing

export const SUBSCRIPTION_PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    yearlyPrice: 0,
    credits: 20,
    description: 'Perfect for getting started',
    features: {
      // Basic features (always allowed)
      'dashboard': { allowed: true },
      'content-scheduler': { allowed: true, limit: 5 },
      'analytics': { allowed: true, limit: 'basic' },
      'workspace': { allowed: true, limit: 1 },
      'social-accounts': { allowed: true, limit: 1 },
      
      // Locked features (require upgrade)
      'creative-brief': { allowed: false, upgrade: 'starter' },
      'content-repurpose': { allowed: false, upgrade: 'starter' },
      'competitor-analysis': { allowed: false, upgrade: 'pro' },
      'trend-calendar': { allowed: false, upgrade: 'starter' },
      'ab-testing': { allowed: false, upgrade: 'pro' },
      'roi-calculator': { allowed: false, upgrade: 'pro' },
      'user-persona': { allowed: false, upgrade: 'starter' },
      'affiliate-program': { allowed: false, upgrade: 'business' },
      'social-listening': { allowed: false, upgrade: 'pro' },
      'content-protection': { allowed: false, upgrade: 'business' },
      'legal-assistant': { allowed: false, upgrade: 'business' },
      'emotion-analysis': { allowed: false, upgrade: 'pro' },
      'thumbnails-pro': { allowed: false, upgrade: 'pro' },
      'dm-automation': { allowed: false, upgrade: 'starter' },
      'advanced-analytics': { allowed: false, upgrade: 'pro' }
    },
    limits: {
      workspaces: 1,
      socialAccounts: 1,
      scheduledPosts: 5,
      teamMembers: 0,
      automationRules: 0,
      monthlyCredits: 20
    }
  },
  
  starter: {
    id: 'starter',
    name: 'Starter',
    price: 699,
    yearlyPrice: 4800, // 20% off
    credits: 300,
    description: 'Ideal for solo creators',
    features: {
      // Basic features
      'dashboard': { allowed: true },
      'content-scheduler': { allowed: true, limit: 50 },
      'analytics': { allowed: true, limit: 'advanced' },
      'workspace': { allowed: true, limit: 1 },
      'social-accounts': { allowed: true, limit: 2 },
      
      // Newly unlocked features
      'creative-brief': { allowed: true, limit: 10 },
      'content-repurpose': { allowed: true, limit: 15 },
      'trend-calendar': { allowed: true, limit: 20 },
      'user-persona': { allowed: true, limit: 5 },
      'dm-automation': { allowed: true, limit: 3 },
      
      // Still locked features
      'competitor-analysis': { allowed: false, upgrade: 'pro' },
      'ab-testing': { allowed: false, upgrade: 'pro' },
      'roi-calculator': { allowed: false, upgrade: 'pro' },
      'affiliate-program': { allowed: false, upgrade: 'business' },
      'social-listening': { allowed: false, upgrade: 'pro' },
      'content-protection': { allowed: false, upgrade: 'business' },
      'legal-assistant': { allowed: false, upgrade: 'business' },
      'emotion-analysis': { allowed: false, upgrade: 'pro' },
      'thumbnails-pro': { allowed: false, upgrade: 'pro' },
      'advanced-analytics': { allowed: false, upgrade: 'pro' }
    },
    limits: {
      workspaces: 1,
      socialAccounts: 2,
      scheduledPosts: 50,
      teamMembers: 0,
      automationRules: 3,
      monthlyCredits: 300
    }
  },
  
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 1499,
    yearlyPrice: 9999, // 25% off
    credits: 1100,
    description: 'Perfect for growing brands',
    features: {
      // Basic features
      'dashboard': { allowed: true },
      'content-scheduler': { allowed: true, limit: 200 },
      'analytics': { allowed: true, limit: 'pro' },
      'workspace': { allowed: true, limit: 2 },
      'social-accounts': { allowed: true, limit: 1 },
      
      // Starter features
      'creative-brief': { allowed: true, limit: 50 },
      'content-repurpose': { allowed: true, limit: 100 },
      'trend-calendar': { allowed: true, limit: 100 },
      'user-persona': { allowed: true, limit: 25 },
      'dm-automation': { allowed: true, limit: 10 },
      
      // Newly unlocked Pro features
      'competitor-analysis': { allowed: true, limit: 20 },
      'ab-testing': { allowed: true, limit: 15 },
      'roi-calculator': { allowed: true, limit: 30 },
      'social-listening': { allowed: true, limit: 25 },
      'emotion-analysis': { allowed: true, limit: 40 },
      'thumbnails-pro': { allowed: true, limit: 50 },
      'advanced-analytics': { allowed: true },
      
      // Still locked features
      'affiliate-program': { allowed: false, upgrade: 'business' },
      'content-protection': { allowed: false, upgrade: 'business' },
      'legal-assistant': { allowed: false, upgrade: 'business' }
    },
    limits: {
      workspaces: 2,
      socialAccounts: 1,
      scheduledPosts: 200,
      teamMembers: 2,
      automationRules: 10,
      monthlyCredits: 1100
    }
  },
  
  business: {
    id: 'business',
    name: 'Business',
    price: 2199,
    yearlyPrice: 16800, // 30% off
    credits: 2000,
    description: 'Built for teams and agencies',
    features: {
      // All features unlocked
      'dashboard': { allowed: true },
      'content-scheduler': { allowed: true, limit: 500 },
      'analytics': { allowed: true, limit: 'business' },
      'workspace': { allowed: true, limit: 8 },
      'social-accounts': { allowed: true, limit: 4 },
      'creative-brief': { allowed: true, limit: 200 },
      'content-repurpose': { allowed: true, limit: 300 },
      'trend-calendar': { allowed: true, limit: 300 },
      'user-persona': { allowed: true, limit: 100 },
      'dm-automation': { allowed: true, limit: 25 },
      'competitor-analysis': { allowed: true, limit: 100 },
      'ab-testing': { allowed: true, limit: 50 },
      'roi-calculator': { allowed: true, limit: 150 },
      'social-listening': { allowed: true, limit: 100 },
      'emotion-analysis': { allowed: true, limit: 200 },
      'thumbnails-pro': { allowed: true, limit: 200 },
      'advanced-analytics': { allowed: true },
      'affiliate-program': { allowed: true, limit: 20 },
      'content-protection': { allowed: true, limit: 50 },
      'legal-assistant': { allowed: true, limit: 30 }
    },
    limits: {
      workspaces: 8,
      socialAccounts: 4,
      scheduledPosts: 500,
      teamMembers: 3,
      automationRules: 25,
      monthlyCredits: 2000
    }
  }
};

export const CREDIT_PACKAGES = [
  {
    id: 'credits-50',
    name: '50 Credits',
    credits: 50,
    bonusCredits: 0,
    totalCredits: 50,
    price: 9,
    description: 'Perfect for light usage',
    popular: false
  },
  {
    id: 'credits-100',
    name: '100 Credits',
    credits: 100,
    bonusCredits: 10,
    totalCredits: 110,
    price: 19,
    description: 'Great for regular users',
    popular: true
  },
  {
    id: 'credits-250',
    name: '250 Credits',
    credits: 250,
    bonusCredits: 50,
    totalCredits: 300,
    price: 39,
    description: 'Best value for power users',
    popular: false
  },
  {
    id: 'credits-500',
    name: '500 Credits',
    credits: 500,
    bonusCredits: 150,
    totalCredits: 650,
    price: 79,
    description: 'Maximum value pack',
    popular: false
  }
];

export const CREDIT_COSTS = {
  'creative-brief': 3,
  'content-repurpose': 4,
  'competitor-analysis': 6,
  'trend-calendar': 2,
  'ab-testing': 4,
  'roi-calculator': 3,
  'user-persona': 5,
  'affiliate-program': 2,
  'social-listening': 4,
  'content-protection': 7,
  'legal-assistant': 6,
  'emotion-analysis': 5,
  'thumbnails-pro': 8,
  'dm-automation': 1,
  'advanced-analytics': 3
};

export const ADDONS = {
  'extra-workspace': {
    id: 'extra-workspace',
    name: 'Extra Workspace',
    type: 'workspace',
    price: 19,
    description: 'Add an additional workspace to your account',
    benefits: ['Separate team management', 'Isolated content', 'Individual analytics']
  },
  'priority-support': {
    id: 'priority-support',
    name: 'Priority Support',
    type: 'support',
    price: 29,
    description: '24/7 priority customer support',
    benefits: ['24/7 support', 'Priority response', 'Dedicated account manager']
  },
  'white-label': {
    id: 'white-label',
    name: 'White Label',
    type: 'branding',
    price: 99,
    description: 'Remove VeeFore branding and add your own',
    benefits: ['Custom branding', 'Your logo', 'Custom domain']
  },
  'api-access': {
    id: 'api-access',
    name: 'API Access',
    type: 'technical',
    price: 49,
    description: 'Full API access for custom integrations',
    benefits: ['REST API access', 'Webhook support', 'Custom integrations']
  },
  'advanced-ai': {
    id: 'advanced-ai',
    name: 'Advanced AI Models',
    type: 'ai',
    price: 39,
    description: 'Access to GPT-4 and premium AI models',
    benefits: ['GPT-4 access', 'Better AI quality', 'Faster processing']
  }
};

// Feature validation functions
export function validateFeatureAccess(planId: string, featureId: string): {
  allowed: boolean;
  limit?: number | string;
  upgrade?: string;
} {
  const plan = SUBSCRIPTION_PLANS[planId as keyof typeof SUBSCRIPTION_PLANS];
  if (!plan) {
    return { allowed: false, upgrade: 'starter' };
  }

  const feature = plan.features[featureId];
  if (!feature) {
    return { allowed: false, upgrade: 'starter' };
  }

  return {
    allowed: feature.allowed,
    limit: feature.limit,
    upgrade: feature.upgrade
  };
}

export function calculateYearlySavings(planId: string): number {
  const plan = SUBSCRIPTION_PLANS[planId as keyof typeof SUBSCRIPTION_PLANS];
  if (!plan) return 0;
  
  const monthlyYearly = plan.price * 12;
  const yearlyPrice = plan.yearlyPrice;
  return monthlyYearly - yearlyPrice;
}

export function getPlanById(planId: string) {
  return SUBSCRIPTION_PLANS[planId as keyof typeof SUBSCRIPTION_PLANS];
}

export function getCreditPackageById(packageId: string) {
  return CREDIT_PACKAGES.find(pkg => pkg.id === packageId);
}

export function getAddonById(addonId: string) {
  return ADDONS[addonId as keyof typeof ADDONS];
}

export function hasEnoughCredits(userCredits: number, featureId: string): boolean {
  const required = CREDIT_COSTS[featureId as keyof typeof CREDIT_COSTS] || 0;
  return userCredits >= required;
}

export function calculateCreditDeduction(featureId: string, quantity: number = 1): number {
  const baseCost = CREDIT_COSTS[featureId as keyof typeof CREDIT_COSTS] || 0;
  return baseCost * quantity;
}