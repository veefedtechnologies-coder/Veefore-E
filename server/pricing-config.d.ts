export declare const SUBSCRIPTION_PLANS: {
    free: {
        id: string;
        name: string;
        description: string;
        price: number;
        currency: string;
        interval: string;
        credits: number;
        features: string[];
    };
    starter: {
        id: string;
        name: string;
        description: string;
        price: number;
        yearlyPrice: number;
        currency: string;
        interval: string;
        credits: number;
        popular: boolean;
        features: string[];
    };
    pro: {
        id: string;
        name: string;
        description: string;
        price: number;
        yearlyPrice: number;
        currency: string;
        interval: string;
        credits: number;
        features: string[];
    };
    business: {
        id: string;
        name: string;
        description: string;
        price: number;
        yearlyPrice: number;
        currency: string;
        interval: string;
        credits: number;
        features: string[];
    };
};
export declare const CREDIT_PACKAGES: ({
    id: string;
    name: string;
    baseCredits: number;
    bonusCredits: number;
    totalCredits: number;
    price: number;
    description: string;
    popular?: never;
} | {
    id: string;
    name: string;
    baseCredits: number;
    bonusCredits: number;
    totalCredits: number;
    price: number;
    description: string;
    popular: boolean;
})[];
export declare const ADDONS: {};
export declare const CREDIT_COSTS: {
    'ai-caption': number;
    'ai-text-post': number;
    'caption-optimization': number;
    'hashtag-generation': number;
    ai_suggestions: number;
    'story-template': number;
    'reels-script': number;
    'ai-image': number;
    'ai-visual': number;
    'thumbnail-creation': number;
    'ai-carousel': number;
    'ai-video': number;
    'video-generation': number;
    'ai-reel': number;
    'viral-remix': number;
    ai_account_analysis: number;
    'trend-intelligence': number;
    'viral-predictor': number;
    'affiliate-discovery': number;
    'affiliate-engine': number;
    'social-listening': number;
    'content-theft-detection': number;
    'emotion-analysis': number;
    'roi-calculator': number;
    'trend-forecast': number;
    'dm-auto-responder': number;
    'weekly-strategy': number;
    'brand-voice-training': number;
    'custom-gpt-task': number;
    'content-analysis': number;
    'engagement-prediction': number;
    'competitor-analysis': number;
};
export declare const REFERRAL_REWARDS: {
    inviteFriend: number;
    submitFeedback: number;
};
export declare function getPlanByName(planName: string): {
    id: string;
    name: string;
    description: string;
    price: number;
    currency: string;
    interval: string;
    credits: number;
    features: string[];
} | {
    id: string;
    name: string;
    description: string;
    price: number;
    yearlyPrice: number;
    currency: string;
    interval: string;
    credits: number;
    popular: boolean;
    features: string[];
} | {
    id: string;
    name: string;
    description: string;
    price: number;
    yearlyPrice: number;
    currency: string;
    interval: string;
    credits: number;
    features: string[];
} | {
    id: string;
    name: string;
    description: string;
    price: number;
    yearlyPrice: number;
    currency: string;
    interval: string;
    credits: number;
    features: string[];
};
export declare function getCreditPackageById(packageId: string): {
    id: string;
    name: string;
    baseCredits: number;
    bonusCredits: number;
    totalCredits: number;
    price: number;
    description: string;
    popular?: never;
} | {
    id: string;
    name: string;
    baseCredits: number;
    bonusCredits: number;
    totalCredits: number;
    price: number;
    description: string;
    popular: boolean;
} | undefined;
export declare function getAddonById(addonId: string): never;
export declare function calculateCreditPackageTotal(packageId: string): {
    baseCredits: number;
    bonusCredits: number;
    totalCredits: number;
    price: number;
} | null;
export declare function checkUserAddonAccess(storage: any, userId: number | string, featureType: string): Promise<{
    hasAccess: boolean;
    addonType?: string;
    reason?: string;
}>;
