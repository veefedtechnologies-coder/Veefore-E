import {
  User, Workspace, SocialAccount, Content, Analytics, AutomationRule,
  Suggestion, CreditTransaction, Referral, Subscription, Payment, Addon,
  WorkspaceMember, TeamInvitation, ContentRecommendation, UserContentHistory,
  Admin, AdminSession, Notification, Popup, AppSetting, AuditLog, FeedbackMessage,
  CreativeBrief, ContentRepurpose, CompetitorAnalysis,
  WaitlistUser
} from "@shared/schema";
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
        console.warn('🚨 P2-FIX: Failed to parse JSON token data, invalid format');
        return null;
      }
    } else if (typeof encryptedToken === 'object') {
      tokenData = encryptedToken;
    } else {
      console.warn('🚨 P2-FIX: Invalid encrypted token format, expected string or object');
      return null;
    }
    
    if (!tokenData.encryptedData || !tokenData.iv || !tokenData.salt || !tokenData.tag) {
      console.warn('🚨 P2-FIX: Incomplete encrypted token data, missing required fields:', {
        hasEncryptedData: !!tokenData.encryptedData,
        hasIV: !!tokenData.iv,
        hasSalt: !!tokenData.salt,
        hasTag: !!tokenData.tag
      });
      return null;
    }
    
    const decryptedToken = tokenEncryption.decryptToken(tokenData);
    
    if (!decryptedToken || decryptedToken.trim().length === 0) {
      console.warn('🚨 P2-FIX: Decryption returned empty token');
      return null;
    }
    
    return decryptedToken;
  } catch (error: any) {
    console.warn('🚨 P2-FIX: Token decryption failed:', {
      error: error.message,
      tokenType: typeof encryptedToken,
      tokenLength: typeof encryptedToken === 'string' ? encryptedToken.length : 'N/A',
      hasBasicStructure: !!(encryptedToken && typeof encryptedToken === 'object')
    });
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
    console.error('🚨 SECURITY: Failed to encrypt token:', error);
    throw new Error('Token encryption failed');
  }
}

export function getAccessTokenFromAccount(account: any): string | null {
  console.log(`[TOKEN DEBUG] Checking access token for account: ${account.username}`);
  console.log(`[TOKEN DEBUG] Has encryptedAccessToken: ${!!account.encryptedAccessToken}`);
  console.log(`[TOKEN DEBUG] Has plain accessToken: ${!!account.accessToken}`);
  
  if (account.encryptedAccessToken) {
    console.log(`[TOKEN DEBUG] Attempting to decrypt encrypted token for ${account.username}`);
    try {
      const decryptedToken = decryptStoredToken(account.encryptedAccessToken);
      if (decryptedToken) {
        console.log(`[TOKEN DEBUG] ✅ Successfully decrypted token for ${account.username}`);
        return decryptedToken;
      }
      console.warn(`[TOKEN DEBUG] ❌ Decryption returned null for ${account.username}`);
    } catch (error: any) {
      console.error(`[TOKEN DEBUG] ❌ Decryption failed for ${account.username}:`, error.message);
    }
    console.warn(`🚨 P2-FIX: Failed to decrypt access token for account ${account.username}, falling back to plain text`);
  }
  
  if (account.accessToken) {
    console.log('📊 SECURITY: Found legacy plain text token, should migrate to encrypted storage');
    return account.accessToken;
  }
  
  console.log(`[TOKEN DEBUG] ❌ No valid access token found for ${account.username}`);
  return null;
}

export function getRefreshTokenFromAccount(account: any): string | null {
  if (account.encryptedRefreshToken) {
    const decryptedToken = decryptStoredToken(account.encryptedRefreshToken);
    if (decryptedToken) {
      return decryptedToken;
    }
    console.warn(`🚨 P2-FIX: Failed to decrypt refresh token for account ${account.username}, falling back to plain text`);
  }
  
  if (account.refreshToken) {
    console.log('📊 SECURITY: Found legacy plain text refresh token, should migrate to encrypted storage');
    return account.refreshToken;
  }
  
  return null;
}

export function generateReferralCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function convertUser(mongoUser: any): User {
  console.log(`[USER CONVERT] Raw MongoDB user isOnboarded:`, mongoUser.isOnboarded, `(type: ${typeof mongoUser.isOnboarded})`);
  const converted = {
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
    createdAt: mongoUser.createdAt,
    updatedAt: mongoUser.updatedAt
  };
  console.log(`[USER CONVERT] Converted user isOnboarded:`, converted.isOnboarded);
  console.log(`[CREDIT SECURITY] User ${converted.id} credits: ${converted.credits} (exact database value - no automatic allocation)`);
  return converted;
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
  console.log(`[CONVERT DEBUG] Converting social account: ${mongoAccount.username}`);
  console.log(`[CONVERT DEBUG] Raw mongoAccount pageId:`, mongoAccount.pageId);
  console.log(`[CONVERT DEBUG] Raw mongoAccount accountId:`, mongoAccount.accountId);
  console.log(`[CONVERT DEBUG] All available fields:`, Object.keys(mongoAccount.toObject ? mongoAccount.toObject() : mongoAccount));
  
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
    hasAccessToken: hasToken,
    hasRefreshToken: getRefreshTokenFromAccount(mongoAccount) !== null,
    tokenStatus: mongoAccount.tokenStatus ?? normalizedTokenStatus,
    expiresAt: mongoAccount.expiresAt || null,
    isActive: mongoAccount.isActive !== false,
    followersCount: mongoAccount.followersCount ?? 0,
    followingCount: mongoAccount.followingCount ?? null,
    mediaCount: mongoAccount.mediaCount ?? null,
    biography: mongoAccount.biography ?? null,
    website: mongoAccount.website ?? null,
    profilePictureUrl: mongoAccount.profilePictureUrl ?? null,
    subscriberCount: mongoAccount.subscriberCount ?? null,
    videoCount: mongoAccount.videoCount ?? null,
    viewCount: mongoAccount.viewCount ?? null,
    channelDescription: mongoAccount.channelDescription ?? null,
    channelThumbnail: mongoAccount.channelThumbnail ?? null,
    accountType: mongoAccount.accountType ?? null,
    isBusinessAccount: mongoAccount.isBusinessAccount ?? null,
    isVerified: mongoAccount.isVerified ?? null,
    avgLikes: mongoAccount.avgLikes ?? null,
    avgComments: mongoAccount.avgComments ?? null,
    avgReach: mongoAccount.avgReach ?? null,
    engagementRate: mongoAccount.engagementRate ?? null,
    totalLikes: mongoAccount.totalLikes ?? 0,
    totalComments: mongoAccount.totalComments ?? 0,
    totalShares: mongoAccount.totalShares ?? 0,
    totalSaves: mongoAccount.totalSaves ?? 0,
    postsAnalyzed: mongoAccount.postsAnalyzed ?? null,
    totalReach: mongoAccount.totalReach ?? null,
    avgEngagement: mongoAccount.avgEngagement ?? null,
    accountLevelReach: mongoAccount.accountLevelReach ?? null,
    postLevelReach: mongoAccount.postLevelReach ?? null,
    reachSource: mongoAccount.reachSource ?? null,
    reachByPeriod: mongoAccount.reachByPeriod ?? null,
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
    trialEnd: doc.trialEnd || null,
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
    workspaceId: parseInt(doc.workspaceId),
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
    id: parseInt(doc._id?.toString() || doc.id || "0"),
    userId: parseInt(doc.userId?.toString() || "0"),
    workspaceId: parseInt(doc.workspaceId?.toString() || "0"),
    role: doc.role || "Viewer",
    status: doc.status || "active",
    permissions: doc.permissions || {},
    invitedBy: doc.invitedBy ? parseInt(doc.invitedBy.toString()) : null,
    joinedAt: doc.joinedAt || new Date(),
    createdAt: doc.createdAt || new Date(),
    updatedAt: doc.updatedAt || new Date()
  };
}

export function convertTeamInvitation(doc: any): TeamInvitation {
  return {
    id: doc._id?.toString() || doc.id,
    workspaceId: parseInt(doc.workspaceId),
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
    workspaceId: parseInt(doc.workspaceId),
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
    userId: parseInt(doc.userId),
    workspaceId: parseInt(doc.workspaceId),
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
    id: parseInt(doc._id.toString()),
    workspaceId: parseInt(doc.workspaceId),
    userId: parseInt(doc.userId),
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
    id: parseInt(doc._id.toString()),
    workspaceId: parseInt(doc.workspaceId),
    userId: parseInt(doc.userId),
    originalContentId: doc.originalContentId ? parseInt(doc.originalContentId) : null,
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
    id: parseInt(doc._id.toString()),
    workspaceId: parseInt(doc.workspaceId),
    userId: parseInt(doc.userId),
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
