import {
  User, Workspace, SocialAccount, Content, Analytics, AutomationRule,
  Suggestion, CreditTransaction, Referral, Subscription, Payment, Addon,
  WorkspaceMember, TeamInvitation, ContentRecommendation, UserContentHistory,
  Admin, AdminSession, Notification, Popup, AppSetting, AuditLog, FeedbackMessage,
  CreativeBrief, ContentRepurpose, CompetitorAnalysis,
  WaitlistUser
} from "../domain/types";
import { randomInt } from "crypto";
import { tokenEncryption, EncryptedToken } from '../security/token-encryption';

export function decryptStoredToken(encryptedToken: any): string | null {
  if (!encryptedToken) {
    return null;
  }

  try {
    let tokenData: EncryptedToken;

    if (typeof encryptedToken === 'string') {
      try {
        tokenData = JSON.parse(encryptedToken);
      } catch (parseError) {
        // P2-FIX: If not JSON, it might be plain text
        return encryptedToken;
      }
    } else if (typeof encryptedToken === 'object' && encryptedToken !== null) {
      tokenData = encryptedToken;
    } else {
      return null;
    }

    // P2-FIX: Robust validation of EncryptedToken fields
    if (!tokenData || typeof tokenData !== 'object') return null;

    const { encryptedData, iv, salt, tag } = tokenData;

    if (typeof encryptedData !== 'string' || typeof iv !== 'string' || typeof salt !== 'string' || typeof tag !== 'string') {
      console.warn('⚠️ [P2-FIX] decryptStoredToken received malformed metadata:', {
        hasData: !!encryptedData,
        hasIv: !!iv,
        hasSalt: !!salt,
        hasTag: !!tag
      });

      // Legacy fallback: if it looks like plain text but was passed as object
      if (typeof encryptedData === 'string' && !iv) {
        return encryptedData;
      }
      return null;
    }

    const decryptedToken = tokenEncryption.decryptToken(tokenData);

    if (!decryptedToken || decryptedToken.trim().length === 0) {
      return null;
    }

    return decryptedToken;
  } catch (error: any) {
    console.error('🚨 [P2-FIX] Token decryption in converter failed:', error.message);
    return null;
  }
}

export function encryptAndStoreToken(plainToken: string | null): EncryptedToken | null {
  if (!plainToken || typeof plainToken !== 'string') {
    return null;
  }

  try {
    return tokenEncryption.encryptToken(plainToken);
  } catch (error) {
    throw new Error('Token encryption failed');
  }
}

export function getAccessTokenFromAccount(account: any): string | null {
  if (account.encryptedAccessToken) {
    try {
      const decryptedToken = decryptStoredToken(account.encryptedAccessToken);
      if (decryptedToken) {
        return decryptedToken;
      }
      // P4-FIX: If encryption exists but failed to decrypt, 
      // DO NOT fall back to plain accessToken as it's likely stale/expired.
      console.warn('⚠️ [SECURITY] Token decryption failed for account with encrypted data. Skipping stale fallback.');
      return null;
    } catch (error: any) {
      console.error('⚠️ [SECURITY] Error in getAccessTokenFromAccount:', error.message);
      return null;
    }
  }

  if (account.accessToken) {
    return account.accessToken;
  }

  return null;
}

export function getRefreshTokenFromAccount(account: any): string | null {
  if (account.encryptedRefreshToken) {
    const decryptedToken = decryptStoredToken(account.encryptedRefreshToken);
    if (decryptedToken) {
      return decryptedToken;
    }
  }

  if (account.refreshToken) {
    return account.refreshToken;
  }

  return null;
}

export function generateReferralCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(randomInt(chars.length));
  }
  return result;
}

export function convertUser(mongoUser: any): User {
  return {
    id: mongoUser._id.toString(),
    firebaseUid: mongoUser.firebaseUid,
    email: mongoUser.email,
    username: mongoUser.username,
    displayName: mongoUser.displayName || null,
    avatar: mongoUser.avatar || null,
    credits: mongoUser.credits ?? 0,
    plan: mongoUser.plan || 'Free',
    stripeCustomerId: mongoUser.stripeCustomerId || null,
    stripeSubscriptionId: mongoUser.stripeSubscriptionId || null,
    referralCode: mongoUser.referralCode || null,
    totalReferrals: mongoUser.totalReferrals || 0,
    totalEarned: mongoUser.totalEarned || 0,
    referredBy: mongoUser.referredBy || null,
    preferences: mongoUser.preferences || {},
    isOnboarded: mongoUser.isOnboarded === true,
    isEmailVerified: mongoUser.isEmailVerified || false,
    emailVerificationCode: mongoUser.emailVerificationCode || null,
    emailVerificationExpiry: mongoUser.emailVerificationExpiry || null,
    workspaceId: mongoUser.workspaceId || null,
    planStatus: mongoUser.planStatus || 'active',
    status: mongoUser.status || 'waitlisted',
    hasUsedWaitlistBonus: mongoUser.hasUsedWaitlistBonus || false,
    hasClaimedWelcomeBonus: mongoUser.hasClaimedWelcomeBonus || false,
    welcomeBonusClaimedAt: mongoUser.welcomeBonusClaimedAt || null,
    onboardingStep: mongoUser.onboardingStep || 1,
    onboardingData: mongoUser.onboardingData || {},
    niche: mongoUser.niche || null,
    instagramToken: mongoUser.instagramToken || null,
    instagramRefreshToken: mongoUser.instagramRefreshToken || null,
    instagramTokenExpiry: mongoUser.instagramTokenExpiry || null,
    instagramAccountId: mongoUser.instagramAccountId || null,
    instagramUsername: mongoUser.instagramUsername || null,
    tokenStatus: mongoUser.tokenStatus || 'active',
    dailyLoginStreak: mongoUser.dailyLoginStreak || 0,
    lastLoginAt: mongoUser.lastLoginAt || null,
    feedbackSubmittedAt: mongoUser.feedbackSubmittedAt || null,
    lastApiCallTimestamp: mongoUser.lastApiCallTimestamp || null,
    rateLimitResetAt: mongoUser.rateLimitResetAt || null,
    apiCallCount: mongoUser.apiCallCount || 0,
    // planStatus handled above
    // hasUsedWaitlistBonus handled above
    goals: mongoUser.goals || [],
    socialPlatforms: mongoUser.socialPlatforms || [],
    createdAt: mongoUser.createdAt,
    updatedAt: mongoUser.updatedAt
  };
}

export function convertWorkspace(mongoWorkspace: any): Workspace {
  return {
    id: mongoWorkspace._id.toString(),
    userId: mongoWorkspace.userId,
    name: mongoWorkspace.name,
    description: mongoWorkspace.description || null,
    avatar: mongoWorkspace.avatar || null,
    credits: mongoWorkspace.credits || 0,
    theme: mongoWorkspace.theme || 'space',
    aiPersonality: mongoWorkspace.aiPersonality || 'professional',
    isDefault: mongoWorkspace.isDefault || false,
    maxTeamMembers: mongoWorkspace.maxTeamMembers || 1,
    inviteCode: mongoWorkspace.inviteCode || null,
    aiConfiguration: mongoWorkspace.aiConfiguration || undefined,
    createdAt: mongoWorkspace.createdAt,
    updatedAt: mongoWorkspace.updatedAt
  };
}

export function convertAnalytics(mongoAnalytics: any): Analytics {
  const metrics = mongoAnalytics.metrics || {};
  return {
    id: mongoAnalytics._id.toString(),
    workspaceId: mongoAnalytics.workspaceId,
    platform: mongoAnalytics.platform,
    date: mongoAnalytics.date,
    metrics: metrics,
    views: mongoAnalytics.views ?? 0,
    likes: mongoAnalytics.likes ?? 0,
    comments: mongoAnalytics.comments ?? 0,
    shares: mongoAnalytics.shares ?? 0,
    followers: mongoAnalytics.followers ?? 0,
    engagement: mongoAnalytics.engagement ?? 0,
    reach: mongoAnalytics.reach ?? 0,
    createdAt: mongoAnalytics.createdAt || new Date()
  };
}

export function convertContent(mongoContent: any): Content {
  return {
    id: mongoContent._id.toString(),
    workspaceId: mongoContent.workspaceId,
    type: mongoContent.type,
    title: mongoContent.title,
    description: mongoContent.description || null,
    contentData: mongoContent.contentData || null,
    platform: mongoContent.platform || null,
    status: mongoContent.status || 'draft',
    scheduledAt: mongoContent.scheduledAt || null,
    publishedAt: mongoContent.publishedAt || null,
    creditsUsed: mongoContent.creditsUsed || null,
    prompt: mongoContent.prompt || null,
    createdAt: mongoContent.createdAt,
    updatedAt: mongoContent.updatedAt
  };
}

export function convertSocialAccount(mongoAccount: any): SocialAccount {
  const hasToken = getAccessTokenFromAccount(mongoAccount) !== null;
  const hasEncryptedField = !!mongoAccount.encryptedAccessToken;
  const isExpired = mongoAccount.expiresAt ? (new Date(mongoAccount.expiresAt).getTime() < Date.now()) : false;
  const normalizedTokenStatus = ((): string => {
    if (isExpired) return 'expired';
    if (hasToken) return 'valid';
    if (hasEncryptedField && !hasToken) return 'invalid';
    return 'missing';
  })();

  return {
    id: mongoAccount._id.toString(),
    workspaceId: mongoAccount.workspaceId,
    platform: mongoAccount.platform,
    username: mongoAccount.username,
    accountId: mongoAccount.accountId || null,
    pageId: mongoAccount.pageId || null,
    // hasAccessToken: hasToken, // Not in SocialAccount interface
    // hasRefreshToken: getRefreshTokenFromAccount(mongoAccount) !== null, // Not in SocialAccount interface
    tokenStatus: mongoAccount.tokenStatus ?? normalizedTokenStatus,
    expiresAt: mongoAccount.expiresAt || null,
    isActive: mongoAccount.isActive !== false,
    followersCount: mongoAccount.followersCount ?? 0,
    followingCount: mongoAccount.followingCount ?? null,
    mediaCount: mongoAccount.mediaCount ?? null,
    biography: mongoAccount.biography ?? null,
    website: mongoAccount.website ?? null,
    profilePictureUrl: mongoAccount.profilePictureUrl ?? null,
    accountType: mongoAccount.accountType ?? null,
    isBusinessAccount: mongoAccount.isBusinessAccount ?? null,
    isVerified: mongoAccount.isVerified ?? null,
    avgLikes: mongoAccount.avgLikes ?? null,
    avgComments: mongoAccount.avgComments ?? null,
    avgReach: mongoAccount.avgReach ?? null,
    engagementRate: mongoAccount.engagementRate ?? null,
    totalLikes: mongoAccount.totalLikes ?? 0,
    totalComments: mongoAccount.totalComments ?? 0,
    totalReach: mongoAccount.totalReach ?? 0,
    avgEngagement: mongoAccount.avgEngagement ?? null,
    totalShares: mongoAccount.totalShares ?? 0,
    totalSaves: mongoAccount.totalSaves ?? 0,
    lastSyncAt: mongoAccount.lastSyncAt ?? null,
    createdAt: mongoAccount.createdAt || new Date(),
    updatedAt: mongoAccount.updatedAt || new Date()
  };
}

export function convertCreditTransaction(doc: any): CreditTransaction {
  return {
    id: doc._id?.toString() || doc.id,
    userId: doc.userId,
    type: doc.type,
    amount: doc.amount,
    description: doc.description || null,
    workspaceId: doc.workspaceId || null,
    referenceId: doc.referenceId || null,
    createdAt: doc.createdAt || new Date()
  };
}

export function convertSubscription(doc: any): Subscription {
  return {
    id: doc._id?.toString() || doc.id,
    userId: doc.userId,
    plan: doc.plan,
    status: doc.status,
    priceId: doc.priceId || null,
    subscriptionId: doc.subscriptionId || null,
    currentPeriodStart: doc.currentPeriodStart || null,
    currentPeriodEnd: doc.currentPeriodEnd || null,
    // trialEnd: doc.trialEnd || null, // Not in Subscription interface
    monthlyCredits: doc.monthlyCredits || null,
    extraCredits: doc.extraCredits || null,
    autoRenew: doc.autoRenew || null,
    canceledAt: doc.canceledAt || null,
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null
  };
}

export function convertPayment(doc: any): Payment {
  return {
    id: doc._id?.toString() || doc.id,
    userId: doc.userId,
    amount: doc.amount,
    currency: doc.currency || null,
    status: doc.status || null,
    razorpayOrderId: doc.razorpayOrderId,
    razorpayPaymentId: doc.razorpayPaymentId || null,
    razorpaySignature: doc.razorpaySignature || null,
    purpose: doc.purpose,
    metadata: doc.metadata || null,
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null
  };
}

export function convertSuggestion(doc: any): Suggestion {
  return {
    id: doc._id?.toString() || doc.id,
    workspaceId: doc.workspaceId.toString(),
    type: doc.type,
    data: doc.data || null,
    confidence: doc.confidence || null,
    isUsed: doc.isUsed || false,
    validUntil: doc.validUntil || null,
    createdAt: doc.createdAt || null
  };
}

export function convertAddon(doc: any): Addon {
  return {
    id: doc._id?.toString() || doc.id,
    userId: doc.userId,
    type: doc.type,
    name: doc.name,
    price: doc.price,
    isActive: doc.isActive || null,
    expiresAt: doc.expiresAt || null,
    metadata: doc.metadata || null,
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null
  };
}

export function convertWorkspaceMember(doc: any): WorkspaceMember {
  return {
    id: doc._id?.toString() || doc.id || "",
    userId: doc.userId?.toString() || "",
    workspaceId: doc.workspaceId?.toString() || "",
    role: doc.role || "Viewer",
    status: doc.status || "active",
    permissions: doc.permissions || {},
    invitedBy: doc.invitedBy ? doc.invitedBy.toString() : undefined,
    joinedAt: doc.joinedAt || new Date(),
    createdAt: doc.createdAt || new Date(),
    updatedAt: doc.updatedAt || new Date()
  };
}

export function convertTeamInvitation(doc: any): TeamInvitation {
  return {
    id: doc._id?.toString() || doc.id,
    workspaceId: doc.workspaceId.toString(),
    email: doc.email,
    role: doc.role,
    status: doc.status || null,
    token: doc.token,
    expiresAt: doc.expiresAt,
    invitedBy: doc.invitedBy,
    permissions: doc.permissions || null,
    acceptedAt: doc.acceptedAt || null,
    createdAt: doc.createdAt || null
  };
}

export function convertContentRecommendation(doc: any): ContentRecommendation {
  return {
    id: doc._id?.toString() || doc.id,
    workspaceId: doc.workspaceId.toString(),
    type: doc.type,
    title: doc.title,
    description: doc.description || null,
    duration: doc.duration || null,
    category: doc.category,
    country: doc.country,
    tags: doc.tags || [],
    engagement: doc.engagement || { expectedViews: 0, expectedLikes: 0, expectedShares: 0 },
    thumbnailUrl: doc.thumbnailUrl || null,
    mediaUrl: doc.mediaUrl || null,
    sourceUrl: doc.sourceUrl || null,
    isActive: doc.isActive !== false,
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null
  };
}

export function convertUserContentHistory(doc: any): UserContentHistory {
  return {
    id: doc._id?.toString() || doc.id,
    userId: doc.userId.toString(),
    workspaceId: doc.workspaceId.toString(),
    action: doc.action,
    recommendationId: doc.recommendationId || null,
    metadata: doc.metadata || {},
    createdAt: doc.createdAt || null
  };
}

export function convertDmConversation(doc: any): any {
  return {
    id: doc._id.toString(),
    workspaceId: doc.workspaceId,
    platform: doc.platform,
    participantId: doc.participantId,
    participantUsername: doc.participantUsername,
    lastMessageAt: doc.lastMessageAt,
    messageCount: doc.messageCount,
    isActive: doc.isActive,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

export function convertDmMessage(doc: any): any {
  return {
    id: doc._id.toString(),
    conversationId: doc.conversationId,
    messageId: doc.messageId,
    sender: doc.sender,
    content: doc.content,
    messageType: doc.messageType,
    sentiment: doc.sentiment,
    topics: doc.topics,
    aiResponse: doc.aiResponse,
    automationRuleId: doc.automationRuleId,
    createdAt: doc.createdAt
  };
}

export function convertAdmin(mongoAdmin: any): any {
  return {
    id: mongoAdmin._id.toString(),
    email: mongoAdmin.email,
    username: mongoAdmin.username,
    password: mongoAdmin.password,
    role: mongoAdmin.role,
    isActive: mongoAdmin.isActive,
    lastLogin: mongoAdmin.lastLogin,
    createdAt: mongoAdmin.createdAt,
    updatedAt: mongoAdmin.updatedAt
  };
}

export function convertAdminSession(mongoSession: any): any {
  return {
    id: mongoSession._id.toString(),
    adminId: mongoSession.adminId,
    token: mongoSession.token,
    ipAddress: mongoSession.ipAddress,
    userAgent: mongoSession.userAgent,
    expiresAt: mongoSession.expiresAt,
    createdAt: mongoSession.createdAt
  };
}

export function convertNotification(mongoNotification: any): any {
  return {
    id: mongoNotification._id.toString(),
    userId: mongoNotification.userId,
    title: mongoNotification.title,
    message: mongoNotification.message,
    type: mongoNotification.type,
    priority: mongoNotification.priority,
    isRead: mongoNotification.isRead,
    actionUrl: mongoNotification.actionUrl,
    data: mongoNotification.data,
    expiresAt: mongoNotification.expiresAt,
    createdAt: mongoNotification.createdAt,
    updatedAt: mongoNotification.updatedAt
  };
}

export function convertPopup(mongoPopup: any): any {
  return {
    id: mongoPopup._id.toString(),
    title: mongoPopup.title,
    content: mongoPopup.content,
    type: mongoPopup.type,
    priority: mongoPopup.priority,
    isActive: mongoPopup.isActive,
    targetUserType: mongoPopup.targetUserType,
    displayConditions: mongoPopup.displayConditions,
    actionButton: mongoPopup.actionButton,
    startDate: mongoPopup.startDate,
    endDate: mongoPopup.endDate,
    createdAt: mongoPopup.createdAt,
    updatedAt: mongoPopup.updatedAt
  };
}

export function convertAppSetting(mongoSetting: any): any {
  return {
    id: mongoSetting._id.toString(),
    key: mongoSetting.key,
    value: mongoSetting.value,
    description: mongoSetting.description,
    category: mongoSetting.category,
    isPublic: mongoSetting.isPublic,
    updatedBy: mongoSetting.updatedBy,
    createdAt: mongoSetting.createdAt,
    updatedAt: mongoSetting.updatedAt
  };
}

export function convertAuditLog(mongoLog: any): any {
  return {
    id: mongoLog._id.toString(),
    adminId: mongoLog.adminId,
    action: mongoLog.action,
    resource: mongoLog.resource,
    resourceId: mongoLog.resourceId,
    oldValues: mongoLog.oldValues,
    newValues: mongoLog.newValues,
    ipAddress: mongoLog.ipAddress,
    userAgent: mongoLog.userAgent,
    createdAt: mongoLog.createdAt
  };
}

export function convertFeedbackMessage(mongoMessage: any): any {
  return {
    id: mongoMessage._id.toString(),
    userId: mongoMessage.userId,
    name: mongoMessage.name,
    email: mongoMessage.email,
    subject: mongoMessage.subject,
    message: mongoMessage.message,
    type: mongoMessage.type,
    status: mongoMessage.status,
    adminResponse: mongoMessage.adminResponse,
    respondedBy: mongoMessage.respondedBy,
    respondedAt: mongoMessage.respondedAt,
    createdAt: mongoMessage.createdAt,
    updatedAt: mongoMessage.updatedAt
  };
}

export function convertCreativeBrief(doc: any): CreativeBrief {
  return {
    id: doc._id.toString(),
    workspaceId: doc.workspaceId.toString(),
    userId: doc.userId.toString(),
    title: doc.title,
    targetAudience: doc.targetAudience,
    platforms: doc.platforms,
    campaignGoals: doc.campaignGoals,
    tone: doc.tone,
    style: doc.style,
    industry: doc.industry,
    deadline: doc.deadline,
    budget: doc.budget,
    briefContent: doc.briefContent,
    keyMessages: doc.keyMessages,
    contentFormats: doc.contentFormats,
    hashtags: doc.hashtags,
    references: doc.references,
    status: doc.status,
    creditsUsed: doc.creditsUsed,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

export function convertContentRepurpose(doc: any): ContentRepurpose {
  return {
    id: doc._id.toString(),
    workspaceId: doc.workspaceId.toString(),
    userId: doc.userId.toString(),
    originalContentId: doc.originalContentId ? doc.originalContentId.toString() : null,
    sourceLanguage: doc.sourceLanguage,
    targetLanguage: doc.targetLanguage,
    sourceContent: doc.sourceContent,
    repurposedContent: doc.repurposedContent,
    contentType: doc.contentType,
    culturalAdaptations: doc.culturalAdaptations,
    toneAdjustments: doc.toneAdjustments,
    platform: doc.platform,
    qualityScore: doc.qualityScore,
    isApproved: doc.isApproved,
    creditsUsed: doc.creditsUsed,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

export function convertCompetitorAnalysis(doc: any): CompetitorAnalysis {
  return {
    id: doc._id.toString(),
    workspaceId: doc.workspaceId.toString(),
    userId: doc.userId.toString(),
    competitorUsername: doc.competitorUsername,
    platform: doc.platform,
    analysisType: doc.analysisType,
    scrapedData: doc.scrapedData,
    analysisResults: doc.analysisResults,
    topPerformingPosts: doc.topPerformingPosts,
    contentPatterns: doc.contentPatterns,
    hashtags: doc.hashtags,
    postingSchedule: doc.postingSchedule,
    engagementRate: doc.engagementRate,
    growthRate: doc.growthRate,
    recommendations: doc.recommendations,
    competitorScore: doc.competitorScore,
    lastScraped: doc.lastScraped,
    creditsUsed: doc.creditsUsed,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

export function convertWaitlistUser(mongoUser: any): WaitlistUser {
  return {
    id: mongoUser._id.toString(),
    name: mongoUser.name,
    email: mongoUser.email,
    referralCode: mongoUser.referralCode,
    referredBy: mongoUser.referredBy,
    referralCount: mongoUser.referralCount || 0,
    credits: mongoUser.credits || 0,
    status: mongoUser.status || 'waitlisted',
    discountCode: mongoUser.discountCode,
    discountExpiresAt: mongoUser.discountExpiresAt,
    dailyLogins: mongoUser.dailyLogins || 0,
    feedbackSubmitted: mongoUser.feedbackSubmitted || false,
    joinedAt: mongoUser.joinedAt || mongoUser.createdAt,
    createdAt: mongoUser.createdAt,
    updatedAt: mongoUser.updatedAt,
    metadata: mongoUser.metadata || {}
  };
}

export function convertChatConversation(doc: any): any {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    workspaceId: doc.workspaceId ? doc.workspaceId.toString() : undefined,
    title: doc.title,
    lastMessageAt: doc.lastMessageAt || doc.createdAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

export function convertChatMessage(doc: any): any {
  return {
    id: doc._id.toString(),
    conversationId: doc.conversationId.toString(),
    role: doc.role,
    content: doc.content,
    metadata: doc.metadata,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

export function convertConversationContext(doc: any): any {
  return {
    id: doc._id.toString(),
    conversationId: doc.conversationId,
    contextType: doc.contextType,
    key: doc.key,
    value: doc.value,
    confidence: doc.confidence,
    source: doc.source,
    expiresAt: doc.expiresAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

/**
 * INTERNAL USE ONLY: Convert social account including decrypted tokens
 * strictly for backend services (like auto-sync). never expose to client API.
 */
export function convertSocialAccountWithDecryptedTokens(mongoAccount: any): SocialAccount {
  const base = convertSocialAccount(mongoAccount);
  return {
    ...base,
    accessToken: getAccessTokenFromAccount(mongoAccount) || undefined,
    refreshToken: getRefreshTokenFromAccount(mongoAccount) || undefined,
  };
}
