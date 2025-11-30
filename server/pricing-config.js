// Pricing configuration based on the monetization document
export const SUBSCRIPTION_PLANS = {
    free: {
        id: 'free',
        name: 'Free',
        description: 'For trial users, hobbyists',
        price: 0,
        currency: 'INR',
        interval: 'month',
        credits: 20,
        features: [
            '1 Social Account',
            '1 Workspace',
            '0 Team Members',
            'Creative Brief Generator',
            'AI Suggestions',
            'AI Image Generator (8/month)',
            'Low-res Image Studio',
            'Scheduler (2 days, 4 posts/month)',
            'Auto Comment Only'
        ]
    },
    starter: {
        id: 'starter',
        name: 'Starter Plan',
        description: 'For beginner creators',
        price: 699,
        yearlyPrice: 4800, // Save 20% (₹1200)
        currency: 'INR',
        interval: 'month',
        credits: 300,
        popular: true,
        features: [
            '2 Social Accounts per workspace',
            '1 Workspace',
            '0 Team Members',
            'All Free Plan features',
            'AI Image Generator (24/month)',
            'Video Shortener (15s)',
            'Content Repurposer',
            'Scheduler (12 posts/month)',
            'CTA/Hook/Title Generator',
            'Gamified',
            'Full Automation (Comment & DM)',
            'Trend Calendar'
        ]
    },
    pro: {
        id: 'pro',
        name: 'Pro Plan',
        description: 'For influencers & marketers',
        price: 1499,
        yearlyPrice: 9999, // Save 25% (₹2000)
        currency: 'INR',
        interval: 'month',
        credits: 1100,
        features: [
            '1 Social Account per workspace',
            '2 Workspaces',
            '2 Team Members',
            'Everything in Starter',
            'Short Video Generator (30s)',
            'Persona Builder',
            'Full Scheduler',
            'Content Studio (SD)',
            'YouTube SEO Tools',
            'Full Automation (Comment & DM)'
        ]
    },
    business: {
        id: 'business',
        name: 'Business Plan',
        description: 'For brands, teams',
        price: 2199,
        yearlyPrice: 16800, // Save 30% (₹7200)
        currency: 'INR',
        interval: 'month',
        credits: 2000,
        features: [
            '4 Social Accounts per workspace',
            'Unlimited Workspaces (up to 8)',
            '3 Team Members',
            'Everything in Pro',
            'Trend Calendar (Full access)',
            'Multi-day Campaign Scheduling'
        ]
    }
};
export const CREDIT_PACKAGES = [
    {
        id: 'credits-100',
        name: '100 Credits',
        baseCredits: 100,
        bonusCredits: 0,
        totalCredits: 100,
        price: 299,
        description: 'Perfect for trying out AI features'
    },
    {
        id: 'credits-500',
        name: '500 Credits',
        baseCredits: 500,
        bonusCredits: 0,
        totalCredits: 500,
        price: 999,
        description: 'Great for regular content creation'
    },
    {
        id: 'credits-1000',
        name: '1000 Credits',
        baseCredits: 1000,
        bonusCredits: 0,
        totalCredits: 1000,
        price: 1799,
        description: 'Best value for power users',
        popular: true
    },
    {
        id: 'credits-2500',
        name: '2500 Credits',
        baseCredits: 2500,
        bonusCredits: 0,
        totalCredits: 2500,
        price: 3499,
        description: 'For agencies and heavy users'
    },
    {
        id: 'credits-5000',
        name: '5000 Credits',
        baseCredits: 5000,
        bonusCredits: 0,
        totalCredits: 5000,
        price: 5999,
        description: 'Ultimate package for large agencies'
    }
];
export const ADDONS = {};
// AI Feature Credit Costs
export const CREDIT_COSTS = {
    // AI Text and Caption Generation - 1 credit
    'ai-caption': 1,
    'ai-text-post': 1,
    'caption-optimization': 1,
    'hashtag-generation': 1,
    'ai_suggestions': 1, // AI-powered content and growth suggestions
    'story-template': 1,
    'reels-script': 1, // AI script generation - 1 credit
    // AI Image Generation - 8 credits
    'ai-image': 8,
    'ai-visual': 8,
    'thumbnail-creation': 8,
    'ai-carousel': 8,
    // AI Video/Reel Generation - 15 credits
    'ai-video': 15,
    'video-generation': 15,
    'ai-reel': 15,
    'viral-remix': 15,
    // Advanced AI Analysis Features
    'ai_account_analysis': 5, // AI-powered account health analysis and growth suggestions
    'trend-intelligence': 6, // Trend analysis and viral potential scoring
    'viral-predictor': 5, // Content viral potential analysis
    'affiliate-discovery': 4, // Affiliate opportunity discovery engine
    'affiliate-engine': 4, // Alias for affiliate-discovery  
    'social-listening': 4, // Brand monitoring and sentiment analysis
    'content-theft-detection': 7, // Plagiarism and content theft detection
    'emotion-analysis': 5, // Psychological content analysis
    'roi-calculator': 3, // Campaign ROI analysis
    // Other features (unchanged)
    'trend-forecast': 4,
    'dm-auto-responder': 0.2,
    'weekly-strategy': 4,
    'brand-voice-training': 6,
    'custom-gpt-task': 2,
    'content-analysis': 2,
    'engagement-prediction': 3,
    'competitor-analysis': 4,
};
// Referral rewards
export const REFERRAL_REWARDS = {
    inviteFriend: 10, // credits
    submitFeedback: 3, // credits
};
export function getPlanByName(planName) {
    return SUBSCRIPTION_PLANS[planName];
}
export function getCreditPackageById(packageId) {
    return CREDIT_PACKAGES.find(pkg => pkg.id === packageId);
}
export function getAddonById(addonId) {
    return ADDONS[addonId];
}
export function calculateCreditPackageTotal(packageId) {
    const pkg = getCreditPackageById(packageId);
    if (!pkg)
        return null;
    return {
        baseCredits: pkg.baseCredits,
        bonusCredits: pkg.bonusCredits,
        totalCredits: pkg.totalCredits,
        price: pkg.price,
    };
}
// Comprehensive addon checking utility
export async function checkUserAddonAccess(storage, userId, featureType) {
    try {
        // Get user's purchased addons
        const userAddons = await storage.getUserAddons(userId);
        const activeAddons = userAddons.filter((addon) => addon.isActive);
        // Define feature-to-addon-type mapping
        const featureAddonMap = {
            'team-collaboration': ['team-member'],
            'advanced-analytics': ['analytics', 'advanced-analytics'],
            'white-label': ['branding', 'white-label-branding'],
            'extra-workspace': ['workspace', 'extra-workspace'],
            'extra-social-account': ['social-account', 'extra-social-account'],
            'ai-boost': ['ai-boost', 'viral-boost'],
            'affiliate-features': ['affiliate', 'affiliate-kit'],
            'ai-visual': ['ai-visual'],
            'social-crm': ['crm', 'social-crm']
        };
        const requiredAddonTypes = featureAddonMap[featureType] || [];
        // Check if user has any of the required addon types
        for (const addonType of requiredAddonTypes) {
            const hasAddon = activeAddons.some((addon) => addon.type === addonType);
            if (hasAddon) {
                return {
                    hasAccess: true,
                    addonType
                };
            }
        }
        return {
            hasAccess: false,
            reason: `This feature requires one of these addons: ${requiredAddonTypes.join(', ')}`
        };
    }
    catch (error) {
        console.error('[ADDON CHECK] Error checking addon access:', error);
        return {
            hasAccess: false,
            reason: 'Unable to verify addon access'
        };
    }
}
