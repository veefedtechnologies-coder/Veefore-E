import type {
  User, Workspace, WorkspaceMember, TeamInvitation, SocialAccount, Content,
  Analytics, AutomationRule, CreditTransaction, Subscription, Payment,
  AuditLog, Notification,
  InsertUser, InsertWorkspace, InsertWorkspaceMember, InsertTeamInvitation,
  InsertSocialAccount, InsertContent, InsertAutomationRule, InsertAnalytics,
  InsertCreditTransaction, InsertSubscription, InsertPayment, InsertAuditLog, InsertNotification
} from "./domain/types";

import type {
  Suggestion, Referral, Addon, ContentRecommendation, UserContentHistory,
  Admin, AdminSession, Popup, AppSetting, FeedbackMessage,
  CreativeBrief, ContentRepurpose, CompetitorAnalysis,
  ChatConversation, ChatMessage,
  InsertSuggestion, InsertReferral, InsertAddon,
  InsertContentRecommendation, InsertUserContentHistory,
  InsertAdmin, InsertPopup, InsertAppSetting, InsertFeedbackMessage,
  InsertCreativeBrief, InsertContentRepurpose, InsertCompetitorAnalysis,
  InsertChatConversation, InsertChatMessage,
  DmConversation, DmMessage, InsertDmConversation, InsertDmMessage,
  WaitlistUser, InsertWaitlistUser
} from "./domain/types";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByFirebaseUid(firebaseUid: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByReferralCode(referralCode: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User>;
  updateUserCredits(id: string, credits: number): Promise<User>;
  getUserCredits(userId: string): Promise<number>;
  updateUserStripeInfo(id: string, stripeCustomerId: string, stripeSubscriptionId?: string): Promise<User>;

  // Email verification operations
  createUnverifiedUser(data: { email: string; firstName: string; emailVerificationCode: string; emailVerificationExpiry: Date; isEmailVerified: boolean }): Promise<User>;
  updateUserEmailVerification(id: string, token: string, expires: Date): Promise<User>;
  verifyUserEmail(id: string, data: { password?: string; firstName?: string; lastName?: string }): Promise<User>;
  hasClaimedWelcomeBonus(userId: string): Promise<boolean>;
  claimWelcomeBonus(userId: string): Promise<void>;

  // Workspace operations
  getWorkspace(id: string): Promise<Workspace | undefined>;
  getWorkspacesByUserId(userId: string): Promise<Workspace[]>;
  getDefaultWorkspace(userId: string): Promise<Workspace | undefined>;
  getWorkspaceByInviteCode(inviteCode: string): Promise<Workspace | undefined>;
  createWorkspace(workspace: InsertWorkspace): Promise<Workspace>;
  updateWorkspace(id: string, updates: Partial<Workspace>): Promise<Workspace>;
  updateWorkspaceCredits(id: string, credits: number): Promise<void>;
  deleteWorkspace(id: string): Promise<void>;
  setDefaultWorkspace(userId: string, workspaceId: string): Promise<void>;

  // Team management operations
  getWorkspaceMember(workspaceId: string, userId: string): Promise<WorkspaceMember | undefined>;
  getWorkspaceMembers(workspaceId: string): Promise<(WorkspaceMember & { user: User })[]>;
  addWorkspaceMember(member: InsertWorkspaceMember): Promise<WorkspaceMember>;
  updateWorkspaceMember(workspaceId: string, userId: string, updates: Partial<WorkspaceMember>): Promise<WorkspaceMember>;
  removeWorkspaceMember(workspaceId: string, userId: string): Promise<void>;

  // Team invitation operations
  createTeamInvitation(invitation: InsertTeamInvitation): Promise<TeamInvitation>;
  getTeamInvitation(id: string): Promise<TeamInvitation | undefined>;
  getTeamInvitationByToken(token: string): Promise<TeamInvitation | undefined>;
  getTeamInvitations(workspaceId: string, status?: string): Promise<TeamInvitation[]>;
  getWorkspaceInvitations(workspaceId: string): Promise<TeamInvitation[]>;
  updateTeamInvitation(id: string, updates: Partial<TeamInvitation>): Promise<TeamInvitation>;

  // Social account operations
  getSocialAccount(id: string): Promise<SocialAccount | undefined>;
  getSocialAccountsByWorkspace(workspaceId: string): Promise<SocialAccount[]>;
  getSocialAccountsWithTokensInternal(workspaceId: string): Promise<SocialAccount[]>;
  getAllSocialAccounts(): Promise<SocialAccount[]>;
  getSocialAccountByPlatform(workspaceId: string, platform: string): Promise<SocialAccount | undefined>;
  getSocialAccountByPageId(pageId: string): Promise<SocialAccount | undefined>;
  getSocialConnections(userId: string): Promise<SocialAccount[]>;
  createSocialAccount(account: InsertSocialAccount): Promise<SocialAccount>;
  updateSocialAccount(id: string, updates: Partial<SocialAccount>): Promise<SocialAccount>;
  deleteSocialAccount(id: string): Promise<void>;

  // Content operations
  getContent(id: string): Promise<Content | undefined>;
  getContentByWorkspace(workspaceId: string, limit?: number): Promise<Content[]>;
  getScheduledContent(workspaceId?: string): Promise<Content[]>;
  createContent(content: InsertContent): Promise<Content>;
  updateContent(id: string, updates: Partial<Content>): Promise<Content>;
  deleteContent(id: string): Promise<void>;
  createPost(postData: any): Promise<any>;

  // Analytics operations
  getAnalytics(workspaceId: string, platform?: string, days?: number): Promise<Analytics[]>;
  createAnalytics(analytics: InsertAnalytics): Promise<Analytics>;
  getLatestAnalytics(workspaceId: string, platform: string): Promise<Analytics | undefined>;
  updateAnalytics(id: string, updates: Partial<Analytics>): Promise<Analytics>;

  // Automation rules
  getAutomationRule(id: string): Promise<AutomationRule | undefined>;
  getAutomationRules(workspaceId: string): Promise<AutomationRule[]>;
  getActiveAutomationRules(): Promise<AutomationRule[]>;
  getAutomationRulesByType(type: string): Promise<AutomationRule[]>;
  createAutomationRule(rule: InsertAutomationRule): Promise<AutomationRule>;
  updateAutomationRule(id: string, updates: Partial<AutomationRule>): Promise<AutomationRule>;
  deleteAutomationRule(id: string): Promise<void>;

  // Automation logs
  getAutomationLogs(workspaceId: string, options?: { limit?: number; type?: string }): Promise<any[]>;
  createAutomationLog(log: any): Promise<any>;

  // Social accounts
  getAllSocialAccounts(): Promise<SocialAccount[]>;

  // Suggestions
  getSuggestions(workspaceId: string, type?: string): Promise<Suggestion[]>;
  getSuggestionsByWorkspace(workspaceId: string): Promise<Suggestion[]>;
  getValidSuggestions(workspaceId: string): Promise<Suggestion[]>;
  createSuggestion(suggestion: InsertSuggestion): Promise<Suggestion>;
  markSuggestionUsed(id: string): Promise<Suggestion>;
  clearSuggestionsByWorkspace(workspaceId: string): Promise<void>;

  // Analytics by workspace
  getAnalyticsByWorkspace(workspaceId: string): Promise<Analytics[]>;

  // Credit transactions
  getCreditTransactions(userId: string, limit?: number): Promise<CreditTransaction[]>;
  createCreditTransaction(transaction: InsertCreditTransaction): Promise<CreditTransaction>;

  // Referrals
  getReferrals(referrerId: string): Promise<Referral[]>;
  getReferralStats(userId: string): Promise<{ totalReferrals: number; activePaid: number; totalEarned: number }>;
  createReferral(referral: InsertReferral): Promise<Referral>;
  confirmReferral(id: string): Promise<Referral>;
  getLeaderboard(limit?: number): Promise<Array<User & { referralCount: number }>>;

  // Subscription operations
  getSubscription(userId: string): Promise<Subscription | undefined>;
  createSubscription(subscription: InsertSubscription): Promise<Subscription>;
  updateSubscriptionStatus(userId: string, status: string, canceledAt?: Date): Promise<Subscription>;

  // Payment operations
  createPayment(payment: InsertPayment): Promise<Payment>;
  getPaymentsByUser(userId: string): Promise<Payment[]>;

  // Addon operations
  getUserAddons(userId: string): Promise<Addon[]>;
  getActiveAddonsByUser(userId: string): Promise<Addon[]>;
  createAddon(addon: InsertAddon): Promise<Addon>;

  // Feature usage tracking
  getFeatureUsage(userId: string): Promise<any[]>;
  trackFeatureUsage(userId: string, featureId: string, usage: any): Promise<void>;

  // Content recommendation operations
  getContentRecommendation(id: string): Promise<ContentRecommendation | undefined>;
  getContentRecommendations(workspaceId: string, type?: string, limit?: number): Promise<ContentRecommendation[]>;
  createContentRecommendation(recommendation: InsertContentRecommendation): Promise<ContentRecommendation>;
  updateContentRecommendation(id: string, updates: Partial<ContentRecommendation>): Promise<ContentRecommendation>;

  // User content history operations
  getUserContentHistory(userId: string, workspaceId: string): Promise<UserContentHistory[]>;
  createUserContentHistory(history: InsertUserContentHistory): Promise<UserContentHistory>;

  // Pricing and plan operations
  getPricingData(): Promise<any>;
  updateUserSubscription(userId: string, planId: string): Promise<User>;
  addCreditsToUser(userId: string, credits: number): Promise<User>;

  // Conversation management operations
  createDmConversation(conversation: InsertDmConversation): Promise<DmConversation>;
  createDmMessage(message: InsertDmMessage): Promise<DmMessage>;
  createConversationContext(context: any): Promise<any>;
  clearWorkspaceConversations(workspaceId: string): Promise<void>;
  getDmConversations(workspaceId: string, limit?: number): Promise<DmConversation[]>;
  getDmMessages(conversationId: string, limit?: number): Promise<DmMessage[]>;

  // VeeGPT Chat operations
  getChatConversations(userId: string, workspaceId?: string): Promise<ChatConversation[]>;
  getChatConversation(id: string): Promise<ChatConversation | undefined>;
  createChatConversation(conversation: InsertChatConversation): Promise<ChatConversation>;
  updateChatConversation(id: string, updates: Partial<ChatConversation>): Promise<ChatConversation>;
  deleteChatConversation(id: string): Promise<void>;
  getChatMessages(conversationId: string): Promise<ChatMessage[]>;
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  updateChatMessage(id: string, updates: Partial<ChatMessage>): Promise<ChatMessage>;
  getChatMessage(id: string): Promise<ChatMessage | undefined>;

  // YouTube workspace data operations
  updateYouTubePlatformData(accountId: string, updates: any): Promise<any>;

  // Admin operations
  getAdmin(id: string): Promise<Admin | undefined>;
  getAdminByEmail(email: string): Promise<Admin | undefined>;
  getAdminByUsername(username: string): Promise<Admin | undefined>;
  getAllAdmins(): Promise<Admin[]>;
  createAdmin(admin: InsertAdmin): Promise<Admin>;
  updateAdmin(id: string, updates: Partial<Admin>): Promise<Admin>;
  deleteAdmin(id: string): Promise<void>;

  // Admin session operations
  createAdminSession(session: Partial<AdminSession>): Promise<AdminSession>;
  getAdminSession(token: string): Promise<AdminSession | undefined>;
  deleteAdminSession(token: string): Promise<void>;
  cleanupExpiredSessions(): Promise<void>;

  // Notification operations
  createNotification(notification: InsertNotification): Promise<Notification>;
  getNotifications(userId?: string): Promise<Notification[]>;
  getUserNotifications(userId: string): Promise<any[]>;
  markNotificationAsRead(notificationId: string, userId: string): Promise<void>;
  updateNotification(id: string, updates: Partial<Notification>): Promise<Notification>;
  deleteNotification(id: string): Promise<void>;
  markNotificationRead(id: string): Promise<void>;

  // Popup operations
  createPopup(popup: InsertPopup): Promise<Popup>;
  getActivePopups(): Promise<Popup[]>;
  getPopup(id: string): Promise<Popup | undefined>;
  updatePopup(id: string, updates: Partial<Popup>): Promise<Popup>;
  deletePopup(id: string): Promise<void>;

  // App settings operations
  createAppSetting(setting: InsertAppSetting): Promise<AppSetting>;
  getAppSetting(key: string): Promise<AppSetting | undefined>;
  getAllAppSettings(): Promise<AppSetting[]>;
  getPublicAppSettings(): Promise<AppSetting[]>;
  updateAppSetting(key: string, value: string, updatedBy?: string): Promise<AppSetting>;
  deleteAppSetting(key: string): Promise<void>;

  // Audit log operations
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(limit?: number, adminId?: string): Promise<AuditLog[]>;

  // Feedback operations
  createFeedbackMessage(feedback: InsertFeedbackMessage): Promise<FeedbackMessage>;
  getFeedbackMessages(status?: string): Promise<FeedbackMessage[]>;
  updateFeedbackMessage(id: string, updates: Partial<FeedbackMessage>): Promise<FeedbackMessage>;
  deleteFeedbackMessage(id: string): Promise<void>;

  // Admin-specific operations
  getAdminUsers(page?: number, limit?: number, search?: string): Promise<{ admins: Admin[], total: number }>;
  getAdminContent(page?: number, limit?: number, filters?: any): Promise<{ content: Content[], total: number }>;
  getAdminNotifications(page?: number, limit?: number): Promise<{ notifications: Notification[], total: number }>;

  // Admin analytics
  getAdminStats(): Promise<{
    totalUsers: number;
    totalWorkspaces: number;
    totalContent: number;
    totalCreditsUsed: number;
    revenueThisMonth: number;
    activeUsers: number;
  }>;

  // Thumbnail generation operations
  createThumbnailProject(project: any): Promise<any>;
  getThumbnailProject(id: string): Promise<any>;
  updateThumbnailProject(id: string, updates: any): Promise<any>;
  createThumbnailStrategy(strategy: any): Promise<any>;
  createThumbnailVariant(variant: any): Promise<any>;
  getThumbnailVariants(projectId: string): Promise<any[]>;
  createCanvasSession(session: any): Promise<any>;
  updateCanvasSession(id: string, updates: any): Promise<any>;
  createThumbnailExport(exportData: any): Promise<any>;
  incrementExportDownload(exportId: string): Promise<void>;

  // Creative Brief operations
  createCreativeBrief(brief: InsertCreativeBrief): Promise<CreativeBrief>;
  getCreativeBrief(id: string): Promise<CreativeBrief | undefined>;
  getCreativeBriefsByWorkspace(workspaceId: string): Promise<CreativeBrief[]>;
  updateCreativeBrief(id: string, updates: Partial<CreativeBrief>): Promise<CreativeBrief>;
  deleteCreativeBrief(id: string): Promise<void>;

  // Content Repurpose operations
  createContentRepurpose(repurpose: InsertContentRepurpose): Promise<ContentRepurpose>;
  getContentRepurpose(id: string): Promise<ContentRepurpose | undefined>;
  getContentRepurposesByWorkspace(workspaceId: string): Promise<ContentRepurpose[]>;
  updateContentRepurpose(id: string, updates: Partial<ContentRepurpose>): Promise<ContentRepurpose>;
  deleteContentRepurpose(id: string): Promise<void>;

  // Competitor Analysis operations
  createCompetitorAnalysis(analysis: InsertCompetitorAnalysis): Promise<CompetitorAnalysis>;
  getCompetitorAnalysis(id: string): Promise<CompetitorAnalysis | undefined>;
  getCompetitorAnalysesByWorkspace(workspaceId: string): Promise<CompetitorAnalysis[]>;
  updateCompetitorAnalysis(id: string, updates: Partial<CompetitorAnalysis>): Promise<CompetitorAnalysis>;
  deleteCompetitorAnalysis(id: string): Promise<void>;

  // Waitlist operations (MongoDB only)
  createWaitlistUser?(insertWaitlistUser: any): Promise<any>;
  getWaitlistUser?(id: string): Promise<any>;
  getWaitlistUserByEmail?(email: string): Promise<any>;
  updateWaitlistUser?(id: string, updates: any): Promise<any>;
  deleteWaitlistUser?(id: string): Promise<void>;
  getAllWaitlistUsers?(): Promise<any[]>;
  getWaitlistStats?(): Promise<any>;
  clearAllWaitlistUsers?(): Promise<number>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private workspaces: Map<string, Workspace> = new Map();
  private workspaceMembers: Map<string, WorkspaceMember> = new Map(); // key: `${workspaceId}-${userId}`
  private teamInvitations: Map<string, TeamInvitation> = new Map();
  private socialAccounts: Map<string, SocialAccount> = new Map();
  private content: Map<string, Content> = new Map();
  private analytics: Map<string, Analytics> = new Map();
  private automationRules: Map<string, AutomationRule> = new Map();
  private suggestions: Map<string, Suggestion> = new Map();
  private creditTransactions: Map<string, CreditTransaction> = new Map();
  private referrals: Map<string, Referral> = new Map();
  private subscriptions: Map<string, Subscription> = new Map();
  private payments: Map<string, Payment> = new Map();
  private addons: Map<string, Addon> = new Map();
  private contentRecommendations: Map<string, ContentRecommendation> = new Map();
  private userContentHistory: Map<string, UserContentHistory> = new Map();
  private chatConversations: Map<string, ChatConversation> = new Map();
  private chatMessages: Map<string, ChatMessage> = new Map();
  private admins: Map<string, Admin> = new Map();
  private adminSessions: Map<string, AdminSession> = new Map();
  private notifications: Map<string, Notification> = new Map();
  private popups: Map<string, Popup> = new Map();
  private appSettings: Map<string, AppSetting> = new Map();
  private auditLogs: Map<string, AuditLog> = new Map();
  private feedbackMessages: Map<string, FeedbackMessage> = new Map();


  private currentUserId: number = 1;
  private currentWorkspaceId: number = 1;
  private currentWorkspaceMemberId: number = 1;
  private currentTeamInvitationId: number = 1;
  private currentSocialAccountId: number = 1;
  private currentContentId: number = 1;
  private currentAnalyticsId: number = 1;
  private currentAutomationRuleId: number = 1;
  private currentSuggestionId: number = 1;
  private currentCreditTransactionId: number = 1;
  private currentReferralId: number = 1;
  private currentSubscriptionId: number = 1;
  private currentPaymentId: number = 1;
  private currentAddonId: number = 1;
  private currentContentRecommendationId: number = 1;
  private currentUserContentHistoryId: number = 1;
  private currentChatConversationId: number = 1;
  private currentChatMessageId: number = 1;
  private currentAdminId: number = 1;
  private currentNotificationId: number = 1;
  private currentPopupId: number = 1;
  private currentAuditLogId: number = 1;
  private currentFeedbackMessageId: number = 1;



  // User operations
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByFirebaseUid(firebaseUid: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.firebaseUid === firebaseUid);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.email === email);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.username === username);
  }

  async getUserByReferralCode(referralCode: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.referralCode === referralCode);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = (this.currentUserId++).toString();
    const user: User = {
      ...insertUser,
      id,
      credits: insertUser.credits || 0,
      plan: insertUser.plan || "free",
      stripeCustomerId: undefined,
      stripeSubscriptionId: undefined,
      referralCode: insertUser.referralCode || `ref_${id}_${Date.now()}`,
      totalReferrals: 0,
      totalEarned: 0,
      preferences: insertUser.preferences || {},
      isOnboarded: false,
      isEmailVerified: false,
      onboardingStep: 0,
      onboardingData: {},
      goals: [],
      status: insertUser.status || "active",
      dailyLoginStreak: 0,
      apiCallCount: 0,
      tokenStatus: 'active',
      planStatus: 'active',
      hasUsedWaitlistBonus: false,
      hasClaimedWelcomeBonus: false,
      socialPlatforms: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.users.set(id, user);
    return user;
  }


  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const user = this.users.get(id);
    if (!user) throw new Error("User not found");

    const updatedUser = { ...user, ...updates, updatedAt: new Date() };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async updateUserCredits(id: string, credits: number): Promise<User> {
    return this.updateUser(id, { credits });
  }

  async getUserCredits(userId: string): Promise<number> {
    const user = await this.getUser(userId);
    return user?.credits || 0;
  }

  async updateUserStripeInfo(id: string, stripeCustomerId: string, stripeSubscriptionId?: string): Promise<User> {
    return this.updateUser(id, { stripeCustomerId, stripeSubscriptionId });
  }

  async hasClaimedWelcomeBonus(userId: string): Promise<boolean> {
    return false;
  }

  async claimWelcomeBonus(userId: string): Promise<void> {
    // No-op for mem storage
  }

  // Email verification operations
  async createUnverifiedUser(data: { email: string; firstName: string; emailVerificationCode: string; emailVerificationExpiry: Date; isEmailVerified: boolean }): Promise<User> {
    const id = (this.currentUserId++).toString();
    const user: User = {
      id,
      email: data.email,
      emailVerificationExpiry: data.emailVerificationExpiry,
      tokenStatus: 'active',
      credits: 0,
      plan: 'free',
      isOnboarded: false,
      isEmailVerified: data.isEmailVerified,

      // Missing required properties
      username: data.email.split('@')[0],
      stripeCustomerId: undefined,
      stripeSubscriptionId: undefined,
      referralCode: `ref_${id}_${Date.now()}`,
      totalReferrals: 0,
      totalEarned: 0,
      preferences: {},
      onboardingStep: 0,
      onboardingData: {},
      goals: [],
      status: 'active',
      dailyLoginStreak: 0,
      apiCallCount: 0,
      planStatus: 'active',
      hasUsedWaitlistBonus: false,
      hasClaimedWelcomeBonus: false,
      socialPlatforms: [],

      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.users.set(id, user);
    return user;
  }


  async updateUserEmailVerification(id: string, token: string, expires: Date): Promise<User> {
    const user = this.users.get(id);
    if (!user) throw new Error("User not found");
    const updated = { ...user, emailVerificationCode: token, emailVerificationExpiry: expires };
    this.users.set(id, updated);
    return updated;
  }

  async verifyUserEmail(id: string, data: any): Promise<User> {
    const user = this.users.get(id);
    if (!user) throw new Error("User not found");
    const updated = { ...user, isEmailVerified: true, ...data };
    this.users.set(id, updated);
    return updated;
  }



  // Workspace operations
  async getWorkspace(id: string): Promise<Workspace | undefined> {
    return this.workspaces.get(id);
  }

  async getWorkspacesByUserId(userId: string): Promise<Workspace[]> {
    return Array.from(this.workspaces.values()).filter(workspace => workspace.userId === userId);
  }

  async getDefaultWorkspace(userId: string): Promise<Workspace | undefined> {
    return Array.from(this.workspaces.values()).find(
      workspace => workspace.userId === userId && workspace.isDefault
    );
  }

  async createWorkspace(insertWorkspace: InsertWorkspace): Promise<Workspace> {
    const id = (this.currentWorkspaceId++).toString();
    const workspace: Workspace = {
      ...insertWorkspace,
      id,
      name: insertWorkspace.name,
      description: insertWorkspace.description || undefined,
      avatar: insertWorkspace.avatar || undefined,
      theme: insertWorkspace.theme || "default",
      aiPersonality: insertWorkspace.aiPersonality || "Helpful Assistant",
      credits: insertWorkspace.credits || 0,
      maxTeamMembers: insertWorkspace.maxTeamMembers || 5,
      isDefault: insertWorkspace.isDefault || false,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.workspaces.set(id, workspace);
    return workspace;
  }


  async updateWorkspace(id: string, updates: Partial<Workspace>): Promise<Workspace> {
    const workspace = this.workspaces.get(id);
    if (!workspace) throw new Error("Workspace not found");

    const updatedWorkspace = { ...workspace, ...updates, updatedAt: new Date() };
    this.workspaces.set(id, updatedWorkspace);
    return updatedWorkspace;
  }

  async updateWorkspaceCredits(id: string, credits: number): Promise<void> {
    const workspace = this.workspaces.get(id);
    if (!workspace) throw new Error("Workspace not found");

    const updatedWorkspace = { ...workspace, credits, updatedAt: new Date() };
    this.workspaces.set(id, updatedWorkspace);
  }

  async deleteWorkspace(id: string): Promise<void> {
    this.workspaces.delete(id);
  }

  async setDefaultWorkspace(userId: string, workspaceId: string): Promise<void> {
    // First, unset all default workspaces for this user
    for (const workspace of this.workspaces.values()) {
      if (workspace.userId === userId && workspace.isDefault) {
        workspace.isDefault = false;
        workspace.updatedAt = new Date();
      }
    }

    // Then set the specified workspace as default
    const targetWorkspace = this.workspaces.get(workspaceId);
    if (targetWorkspace && targetWorkspace.userId === userId) {
      targetWorkspace.isDefault = true;
      targetWorkspace.updatedAt = new Date();
    }
  }

  async getWorkspaceByInviteCode(inviteCode: string): Promise<Workspace | undefined> {
    return Array.from(this.workspaces.values()).find(workspace => workspace.inviteCode === inviteCode);
  }


  // Team management operations
  async getWorkspaceMember(workspaceId: string, userId: string): Promise<WorkspaceMember | undefined> {
    return this.workspaceMembers.get(`${workspaceId}-${userId}`);
  }

  async getWorkspaceMembers(workspaceId: string): Promise<(WorkspaceMember & { user: User })[]> {
    const members: (WorkspaceMember & { user: User })[] = [];

    for (const member of this.workspaceMembers.values()) {
      if (member.workspaceId === workspaceId) {
        const user = this.users.get(member.userId);
        if (user) {
          members.push({ ...member, user });
        }
      }
    }

    return members;
  }

  async addWorkspaceMember(insertMember: InsertWorkspaceMember): Promise<WorkspaceMember> {
    const id = (this.currentWorkspaceMemberId++).toString();
    const member: WorkspaceMember = {
      ...insertMember,
      id,
      status: insertMember.status || 'active',
      permissions: insertMember.permissions || {},
      joinedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };


    this.workspaceMembers.set(`${member.workspaceId}-${member.userId}`, member);
    return member;
  }

  async updateWorkspaceMember(workspaceId: string, userId: string, updates: Partial<WorkspaceMember>): Promise<WorkspaceMember> {
    const member = this.workspaceMembers.get(`${workspaceId}-${userId}`);
    if (!member) throw new Error("Workspace member not found");

    const updatedMember = { ...member, ...updates };
    this.workspaceMembers.set(`${workspaceId}-${userId}`, updatedMember);
    return updatedMember;
  }

  async removeWorkspaceMember(workspaceId: string, userId: string): Promise<void> {
    this.workspaceMembers.delete(`${workspaceId}-${userId}`);
  }


  // Team invitation operations
  async createTeamInvitation(insertInvitation: InsertTeamInvitation): Promise<TeamInvitation> {
    const id = (this.currentTeamInvitationId++).toString();
    const invitation: TeamInvitation = {
      ...insertInvitation,
      id,
      status: insertInvitation.status || 'pending',
      permissions: insertInvitation.permissions || {},
      createdAt: new Date()
    };


    this.teamInvitations.set(id, invitation);
    return invitation;
  }

  async getTeamInvitation(id: string): Promise<TeamInvitation | undefined> {
    return this.teamInvitations.get(id);
  }

  async getTeamInvitationByToken(token: string): Promise<TeamInvitation | undefined> {
    return Array.from(this.teamInvitations.values()).find(invitation => invitation.token === token);
  }

  async getTeamInvitations(workspaceId: string, status?: string): Promise<TeamInvitation[]> {
    return Array.from(this.teamInvitations.values()).filter(invitation =>
      invitation.workspaceId === workspaceId && (!status || invitation.status === status)
    );
  }

  async getWorkspaceInvitations(workspaceId: string): Promise<TeamInvitation[]> {
    return this.getTeamInvitations(workspaceId, 'pending');
  }

  async updateTeamInvitation(id: string, updates: Partial<TeamInvitation>): Promise<TeamInvitation> {
    const invitation = this.teamInvitations.get(id);
    if (!invitation) throw new Error("Team invitation not found");

    const updatedInvitation = { ...invitation, ...updates, updatedAt: new Date() };
    this.teamInvitations.set(id, updatedInvitation);
    return updatedInvitation;
  }


  // Social account operations
  async getSocialAccount(id: string): Promise<SocialAccount | undefined> {
    return this.socialAccounts.get(id);
  }

  async getSocialAccountsByWorkspace(workspaceId: string): Promise<SocialAccount[]> {
    return Array.from(this.socialAccounts.values()).filter(account => account.workspaceId === workspaceId);
  }

  async getAllSocialAccounts(): Promise<SocialAccount[]> {
    return Array.from(this.socialAccounts.values());
  }

  async getSocialAccountByPlatform(workspaceId: string, platform: string): Promise<SocialAccount | undefined> {
    return Array.from(this.socialAccounts.values()).find(
      account => account.workspaceId === workspaceId && account.platform === platform
    );
  }

  async getSocialAccountByPageId(pageId: string): Promise<SocialAccount | undefined> {
    return Array.from(this.socialAccounts.values()).find(
      account => account.pageId === pageId
    );
  }

  async getSocialConnections(userId: string): Promise<SocialAccount[]> {
    const userWorkspaces = await this.getWorkspacesByUserId(userId);
    const workspaceIds = userWorkspaces.map(w => w.id);
    return Array.from(this.socialAccounts.values()).filter(
      account => workspaceIds.includes(account.workspaceId)
    );
  }

  async getSocialAccountsWithTokensInternal(workspaceId: string): Promise<SocialAccount[]> {
    return this.getSocialAccountsByWorkspace(workspaceId);
  }

  async createSocialAccount(insertAccount: InsertSocialAccount): Promise<SocialAccount> {
    const id = (this.currentSocialAccountId++).toString();
    const account: SocialAccount = {
      ...insertAccount,
      id,
      refreshToken: insertAccount.refreshToken || undefined,
      expiresAt: insertAccount.expiresAt || undefined,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.socialAccounts.set(id, account);
    return account;
  }

  async updateSocialAccount(id: string, updates: Partial<SocialAccount>): Promise<SocialAccount> {
    const account = this.socialAccounts.get(id);
    if (!account) throw new Error("Social account not found");

    const updatedAccount = { ...account, ...updates, updatedAt: new Date() };
    this.socialAccounts.set(id, updatedAccount);
    return updatedAccount;
  }

  async deleteSocialAccount(id: string): Promise<void> {
    this.socialAccounts.delete(id);
  }


  // Content operations
  async getContent(id: string): Promise<Content | undefined> {
    return this.content.get(id);
  }

  async getContentByWorkspace(workspaceId: string, limit = 50): Promise<Content[]> {
    const workspaceContent = Array.from(this.content.values())
      .filter(content => content.workspaceId === workspaceId)
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));

    return workspaceContent.slice(0, limit);
  }

  async getScheduledContent(workspaceId?: string): Promise<Content[]> {
    const allContent = Array.from(this.content.values()).filter(
      content => content.status === "scheduled" && content.scheduledAt
    );

    // If workspaceId is provided, filter by workspace
    const filteredContent = workspaceId
      ? allContent.filter(content => content.workspaceId === workspaceId)
      : allContent;

    return filteredContent.sort((a, b) => (a.scheduledAt!.getTime() - b.scheduledAt!.getTime()));
  }

  async createContent(insertContent: InsertContent): Promise<Content> {
    const id = (this.currentContentId++).toString();
    const content: Content = {
      ...insertContent,
      id,
      description: insertContent.description || undefined,
      contentData: insertContent.contentData || {},
      prompt: insertContent.prompt || undefined,
      platform: insertContent.platform || undefined,
      status: "draft",
      creditsUsed: insertContent.creditsUsed || 0,
      scheduledAt: insertContent.scheduledAt || undefined,
      publishedAt: undefined,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.content.set(id, content);
    return content;
  }

  async updateContent(id: string, updates: Partial<Content>): Promise<Content> {
    const content = this.content.get(id);
    if (!content) throw new Error("Content not found");

    const updatedContent = { ...content, ...updates, updatedAt: new Date() };
    this.content.set(id, updatedContent);
    return updatedContent;
  }

  async deleteContent(id: string): Promise<void> {
    this.content.delete(id);
  }

  async createPost(postData: any): Promise<any> {
    // Mock post creation
    return { ...postData, id: Date.now().toString(), status: 'success' };
  }


  // Analytics operations
  async getAnalytics(workspaceId: string, platform?: string, days = 30): Promise<Analytics[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return Array.from(this.analytics.values()).filter(analytics =>
      analytics.workspaceId === workspaceId &&
      (!platform || analytics.platform === platform) &&
      analytics.date >= cutoff
    ).sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  async createAnalytics(insertAnalytics: InsertAnalytics): Promise<Analytics> {
    const id = (this.currentAnalyticsId++).toString();
    const analytics: Analytics = {
      ...insertAnalytics,
      id,
      metrics: insertAnalytics.metrics || {},
      views: insertAnalytics.views || 0,
      likes: insertAnalytics.likes || 0,
      comments: insertAnalytics.comments || 0,
      shares: insertAnalytics.shares || 0,
      followers: insertAnalytics.followers || 0,
      engagement: insertAnalytics.engagement || 0,
      reach: insertAnalytics.reach || 0,
      createdAt: new Date()
    };
    this.analytics.set(id, analytics);
    return analytics;
  }

  async updateAnalytics(id: string, updates: Partial<Analytics>): Promise<Analytics> {
    const analytics = this.analytics.get(id);
    if (!analytics) throw new Error("Analytics record not found");

    const updated = { ...analytics, ...updates };
    this.analytics.set(id, updated);
    return updated;
  }



  async getLatestAnalytics(workspaceId: string, platform: string): Promise<Analytics | undefined> {
    const workspaceAnalytics = Array.from(this.analytics.values())
      .filter(analytics => analytics.workspaceId === workspaceId && analytics.platform === platform)
      .sort((a, b) => b.date.getTime() - a.date.getTime());

    return workspaceAnalytics[0];
  }


  // Automation rules
  async getAutomationRules(workspaceId: string): Promise<AutomationRule[]> {
    return Array.from(this.automationRules.values()).filter(rule =>
      rule.workspaceId === workspaceId
    );
  }

  async getActiveAutomationRules(): Promise<AutomationRule[]> {
    return Array.from(this.automationRules.values()).filter(rule => rule.isActive);
  }

  async getAutomationRulesByType(type: string): Promise<AutomationRule[]> {
    return Array.from(this.automationRules.values()).filter(rule =>
      rule.isActive &&
      (rule.trigger?.type === type || rule.action?.type === type)
    );
  }

  async createAutomationRule(insertRule: InsertAutomationRule): Promise<AutomationRule> {
    const id = (this.currentAutomationRuleId++).toString();
    const rule: AutomationRule = {
      ...insertRule,
      id,
      description: insertRule.description || undefined,
      trigger: insertRule.trigger || {},
      triggers: insertRule.triggers || {},
      action: insertRule.action || {},
      isActive: insertRule.isActive !== undefined ? insertRule.isActive : true,
      lastRun: undefined,
      nextRun: undefined,

      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.automationRules.set(id, rule);
    return rule;
  }



  async updateAutomationRule(id: string, updates: Partial<AutomationRule>): Promise<AutomationRule> {
    const rule = this.automationRules.get(id);
    if (!rule) throw new Error("Automation rule not found");

    const updatedRule = { ...rule, ...updates, updatedAt: new Date() };
    this.automationRules.set(id, updatedRule);
    return updatedRule;
  }

  async getAutomationRule(id: string): Promise<AutomationRule | undefined> {
    return this.automationRules.get(id);
  }


  async deleteAutomationRule(id: string): Promise<void> {
    this.automationRules.delete(id);
  }


  async getAutomationRulesByWorkspace(workspaceId: string): Promise<AutomationRule[]> {
    return Array.from(this.automationRules.values())
      .filter(rule => rule.workspaceId === workspaceId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }


  async getAutomationLogs(workspaceId: string | number, options?: { limit?: number; type?: string }): Promise<any[]> {
    // For now, return empty array - logs would be stored separately in a real implementation
    return [];
  }

  async createAutomationLog(log: any): Promise<any> {
    // For now, just return the log - in a real implementation, this would store to database
    return { ...log, id: Date.now().toString(), createdAt: new Date() };
  }


  // Suggestions
  async getSuggestions(workspaceId: string, type?: string): Promise<Suggestion[]> {
    return Array.from(this.suggestions.values()).filter(suggestion =>
      suggestion.workspaceId === workspaceId &&
      (!type || suggestion.type === type)
    ).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getValidSuggestions(workspaceId: string): Promise<Suggestion[]> {
    const now = new Date();
    return Array.from(this.suggestions.values()).filter(suggestion =>
      suggestion.workspaceId === workspaceId &&
      !suggestion.isUsed &&
      (!suggestion.validUntil || suggestion.validUntil > now)
    );
  }

  async createSuggestion(insertSuggestion: InsertSuggestion): Promise<Suggestion> {
    const id = (this.currentSuggestionId++).toString();
    const suggestion: Suggestion = {
      ...insertSuggestion,
      id,
      data: insertSuggestion.data || {},
      confidence: insertSuggestion.confidence || 0,
      isUsed: false,
      validUntil: undefined,
      createdAt: new Date()
    };

    this.suggestions.set(id, suggestion);
    return suggestion;
  }

  async markSuggestionUsed(id: string): Promise<Suggestion> {
    const suggestion = this.suggestions.get(id);
    if (!suggestion) throw new Error("Suggestion not found");

    const updatedSuggestion = { ...suggestion, isUsed: true };
    this.suggestions.set(id, updatedSuggestion);
    return updatedSuggestion;
  }

  async getSuggestionsByWorkspace(workspaceId: string): Promise<Suggestion[]> {
    return Array.from(this.suggestions.values())
      .filter(suggestion => suggestion.workspaceId === workspaceId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async clearSuggestionsByWorkspace(workspaceId: string): Promise<void> {
    const suggestionIds = Array.from(this.suggestions.entries())
      .filter(([id, suggestion]) => suggestion.workspaceId === workspaceId)
      .map(([id]) => id);

    for (const id of suggestionIds) {
      this.suggestions.delete(id);
    }
  }


  async getAnalyticsByWorkspace(workspaceId: string): Promise<Analytics[]> {
    return Array.from(this.analytics.values())
      .filter(analytics => analytics.workspaceId === workspaceId)
      .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
  }


  // Credit transactions
  async getCreditTransactions(userId: string, limit = 50): Promise<CreditTransaction[]> {
    return Array.from(this.creditTransactions.values())
      .filter(transaction => transaction.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async createCreditTransaction(insertTransaction: InsertCreditTransaction): Promise<CreditTransaction> {
    const id = (this.currentCreditTransactionId++).toString();
    const transaction: CreditTransaction = {
      ...insertTransaction,
      id,
      workspaceId: insertTransaction.workspaceId || undefined,
      description: insertTransaction.description || "",
      referenceId: insertTransaction.referenceId || undefined,
      createdAt: new Date()
    };
    this.creditTransactions.set(id, transaction);
    return transaction;
  }


  // Referrals
  async getReferrals(referrerId: string): Promise<Referral[]> {
    return Array.from(this.referrals.values()).filter(referral => referral.referrerId === referrerId);
  }

  async getReferralStats(userId: string): Promise<{ totalReferrals: number; activePaid: number; totalEarned: number }> {
    const userReferrals = await this.getReferrals(userId);
    const totalReferrals = userReferrals.length;

    // Count paid subscribers (users with non-free plans)
    const activePaid = userReferrals.filter(referral => {
      const referredUser = this.users.get(referral.referredId);
      return referredUser && referredUser.plan !== "free";
    }).length;

    const totalEarned = userReferrals.reduce((sum, referral) => sum + referral.rewardAmount, 0);

    return { totalReferrals, activePaid, totalEarned };
  }


  async createReferral(insertReferral: InsertReferral): Promise<Referral> {
    const id = (this.currentReferralId++).toString();
    const referral: Referral = {
      ...insertReferral,
      id,
      status: "pending",
      rewardAmount: insertReferral.rewardAmount || 0,
      createdAt: new Date()
    };

    this.referrals.set(id, referral);
    return referral;
  }

  async confirmReferral(id: string): Promise<Referral> {
    const referral = this.referrals.get(id);
    if (!referral) throw new Error("Referral not found");

    const updatedReferral = {
      ...referral,
      status: "confirmed" as const,
      confirmedAt: new Date()
    };
    this.referrals.set(id, updatedReferral);
    return updatedReferral;
  }


  async getLeaderboard(limit = 10): Promise<Array<User & { referralCount: number }>> {
    const userReferralCounts = new Map<string, number>();

    // Count referrals for each user
    Array.from(this.referrals.values()).forEach(referral => {
      if (referral.status === "confirmed") {
        const count = userReferralCounts.get(referral.referrerId) || 0;
        userReferralCounts.set(referral.referrerId, count + 1);
      }
    });

    // Get users with their referral counts
    const usersWithCounts = Array.from(this.users.values()).map(user => ({
      ...user,
      referralCount: userReferralCounts.get(user.id) || 0
    }));

    // Sort by referral count and return top users
    return usersWithCounts
      .sort((a, b) => b.referralCount - a.referralCount)
      .slice(0, limit);
  }


  // Subscription operations
  async getSubscription(userId: string): Promise<Subscription | undefined> {
    return Array.from(this.subscriptions.values()).find(subscription => subscription.userId === userId);
  }

  async createSubscription(insertSubscription: InsertSubscription): Promise<Subscription> {
    const id = (this.currentSubscriptionId++).toString();
    const subscription: Subscription = {
      ...insertSubscription,
      id,
      monthlyCredits: insertSubscription.monthlyCredits || 0,
      extraCredits: insertSubscription.extraCredits || 0,
      autoRenew: insertSubscription.autoRenew !== undefined ? insertSubscription.autoRenew : true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.subscriptions.set(id, subscription);
    return subscription;
  }


  async updateSubscriptionStatus(userId: string, status: string, canceledAt?: Date): Promise<Subscription> {
    const subscription = Array.from(this.subscriptions.values()).find(sub => sub.userId === userId);
    if (!subscription) throw new Error("Subscription not found");

    const updatedSubscription = {
      ...subscription,
      status,
      canceledAt,
      updatedAt: new Date()
    };
    this.subscriptions.set(subscription.id, updatedSubscription);
    return updatedSubscription;
  }


  // Payment operations
  async createPayment(insertPayment: InsertPayment): Promise<Payment> {
    const id = (this.currentPaymentId++).toString();
    const payment: Payment = {
      ...insertPayment,
      id,
      currency: insertPayment.currency || "INR",
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.payments.set(id, payment);
    return payment;
  }

  async getPaymentsByUser(userId: string): Promise<Payment[]> {
    return Array.from(this.payments.values()).filter(payment => payment.userId === userId);
  }


  // Addon operations
  async getUserAddons(userId: string): Promise<Addon[]> {
    return Array.from(this.addons.values()).filter(addon => addon.userId === userId && addon.isActive);
  }

  async getActiveAddonsByUser(userId: string): Promise<Addon[]> {
    const now = new Date();
    return Array.from(this.addons.values()).filter(addon =>
      addon.userId === userId &&
      addon.isActive &&
      (!addon.expiresAt || addon.expiresAt > now)
    );
  }


  async createAddon(insertAddon: InsertAddon): Promise<Addon> {
    const id = (this.currentAddonId++).toString();
    const addon: Addon = {
      ...insertAddon,
      id,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.addons.set(id, addon);
    return addon;
  }


  // Content recommendation operations
  async getContentRecommendation(id: string): Promise<ContentRecommendation | undefined> {
    return this.contentRecommendations.get(id);
  }

  async getContentRecommendations(workspaceId: string, type?: string, limit?: number): Promise<ContentRecommendation[]> {
    let recommendations = Array.from(this.contentRecommendations.values())
      .filter(rec => rec.workspaceId === workspaceId && rec.isActive);


    if (type) {
      recommendations = recommendations.filter(rec => rec.type === type);
    }

    // Sort by creation date (newest first)
    recommendations.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());

    if (limit) {
      recommendations = recommendations.slice(0, limit);
    }

    return recommendations;
  }

  async createContentRecommendation(insertRecommendation: InsertContentRecommendation): Promise<ContentRecommendation> {
    const id = (this.currentContentRecommendationId++).toString();
    const recommendation: ContentRecommendation = {
      ...insertRecommendation,
      id,
      description: undefined,
      duration: undefined,
      tags: [],
      engagement: {},
      thumbnailUrl: undefined,
      mediaUrl: undefined,
      sourceUrl: undefined,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.contentRecommendations.set(id, recommendation);
    return recommendation;
  }

  async updateContentRecommendation(id: string, updates: Partial<ContentRecommendation>): Promise<ContentRecommendation> {
    const existing = this.contentRecommendations.get(id);
    if (!existing) {
      throw new Error(`Content recommendation ${id} not found`);
    }

    const updated: ContentRecommendation = {
      ...existing,
      ...updates,
      updatedAt: new Date()
    };
    this.contentRecommendations.set(id, updated);
    return updated;
  }


  // User content history operations
  async getUserContentHistory(userId: string, workspaceId: string): Promise<UserContentHistory[]> {
    return Array.from(this.userContentHistory.values())
      .filter(history => history.userId === userId && history.workspaceId === workspaceId)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }


  async createUserContentHistory(insertHistory: InsertUserContentHistory): Promise<UserContentHistory> {
    const id = (this.currentUserContentHistoryId++).toString();
    const history: UserContentHistory = {
      ...insertHistory,
      id,
      metadata: {},
      createdAt: new Date()
    };
    this.userContentHistory.set(id, history);
    return history;
  }



  // Pricing and plan operations
  async getPricingData(): Promise<any> {
    return {
      plans: {
        free: {
          id: "free",
          name: "Cosmic Explorer",
          description: "Perfect for getting started in the social universe",
          price: "Free",
          credits: 0,
          features: [
            "Up to 2 social accounts",
            "Basic analytics dashboard",
            "50 AI-generated posts per month",
            "Community support",
            "Basic scheduling"
          ]
        },
        pro: {
          id: "pro",
          name: "Stellar Navigator",
          description: "Advanced features for growing brands",
          price: 999,
          credits: 500,
          features: [
            "Up to 10 social accounts",
            "Advanced analytics & insights",
            "500 AI-generated posts per month",
            "Priority support",
            "Advanced scheduling",
            "Custom AI personality",
            "Hashtag optimization"
          ],
          popular: true
        },
        enterprise: {
          id: "enterprise",
          name: "Galactic Commander",
          description: "Ultimate power for large teams",
          price: 2999,
          credits: 2000,
          features: [
            "Unlimited social accounts",
            "Enterprise analytics suite",
            "2000 AI-generated posts per month",
            "24/7 dedicated support",
            "Advanced team collaboration",
            "Custom integrations",
            "White-label options"
          ]
        }
      },
      creditPackages: [
        {
          id: "credits_100",
          name: "Starter Pack",
          totalCredits: 100,
          price: 199,
          savings: "20% off"
        },
        {
          id: "credits_500",
          name: "Power Pack",
          totalCredits: 500,
          price: 799,
          savings: "30% off"
        },
        {
          id: "credits_1000",
          name: "Mega Pack",
          totalCredits: 1000,
          price: 1399,
          savings: "40% off"
        }
      ],
      addons: {
        extra_workspace: {
          id: "extra_workspace",
          name: "Additional Brand Workspace",
          price: 49,
          type: "workspace",
          interval: "monthly",
          benefit: "Add 1 extra brand workspace for team collaboration"
        },
        extra_social_account: {
          id: "extra_social_account",
          name: "Extra Social Account",
          price: 49,
          type: "social_connection",
          interval: "monthly",
          benefit: "Connect 1 additional social media account"
        },
        boosted_ai_content: {
          id: "boosted_ai_content",
          name: "Boosted AI Content Generation",
          price: 99,
          type: "ai_boost",
          interval: "monthly",
          benefit: "Generate 500 extra AI-powered posts per month"
        }
      }
    };
  }

  async updateUserSubscription(userId: string, planId: string): Promise<User> {
    return this.updateUser(userId, { plan: planId });
  }

  async addCreditsToUser(userId: string, credits: number): Promise<User> {
    const user = this.users.get(userId);
    if (!user) throw new Error("User not found");

    const newCredits = (user.credits || 0) + credits;
    return this.updateUser(userId, { credits: newCredits });
  }



  // Admin operations (simplified in-memory implementation)
  async getAdmin(id: string): Promise<Admin | undefined> {
    return this.admins.get(id);
  }

  async getAdminByEmail(email: string): Promise<Admin | undefined> {
    return Array.from(this.admins.values()).find(admin => admin.email === email);
  }

  async getAdminByUsername(username: string): Promise<Admin | undefined> {
    return Array.from(this.admins.values()).find(admin => admin.username === username);
  }

  async getAllAdmins(): Promise<Admin[]> {
    return Array.from(this.admins.values());
  }

  async createAdmin(insertAdmin: InsertAdmin): Promise<Admin> {
    const id = (this.currentAdminId++).toString();
    const admin: Admin = {
      ...insertAdmin,
      id,
      role: insertAdmin.role || "admin",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.admins.set(id, admin);
    return admin;
  }


  async updateAdmin(id: string, updates: Partial<Admin>): Promise<Admin> {
    const admin = this.admins.get(id);
    if (!admin) throw new Error("Admin not found");

    const updatedAdmin = { ...admin, ...updates, updatedAt: new Date() };
    this.admins.set(id, updatedAdmin);
    return updatedAdmin;
  }

  async deleteAdmin(id: string): Promise<void> {
    this.admins.delete(id);
  }


  async getAdminStats(): Promise<{
    totalUsers: number;
    totalWorkspaces: number;
    totalContent: number;
    totalCreditsUsed: number;
    revenueThisMonth: number;
    activeUsers: number;
  }> {
    return {
      totalUsers: this.users.size,
      totalWorkspaces: this.workspaces.size,
      totalContent: this.content.size,
      totalCreditsUsed: 0,
      revenueThisMonth: 0,
      activeUsers: this.users.size
    };
  }


  async createAdminSession(session: Partial<AdminSession>): Promise<AdminSession> {
    // This is a stub - real implementation uses MongoDB
    throw new Error("Admin operations require MongoDB");
  }

  async getAdminSession(token: string): Promise<AdminSession | undefined> {
    // This is a stub - real implementation uses MongoDB
    return undefined;
  }

  async deleteAdminSession(token: string): Promise<void> {
    // This is a stub - real implementation uses MongoDB
  }

  async cleanupExpiredSessions(): Promise<void> {
    // This is a stub - real implementation uses MongoDB
  }

  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const id = (this.currentNotificationId++).toString();
    const notification: Notification = {
      ...insertNotification,
      id,
      isRead: false,
      createdAt: new Date()
    };
    this.notifications.set(id, notification);
    return notification;
  }

  async getNotifications(userId?: string): Promise<Notification[]> {
    return Array.from(this.notifications.values()).filter(notification =>
      !userId || notification.userId === userId
    ).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async updateNotification(id: string, updates: Partial<Notification>): Promise<Notification> {
    const notification = this.notifications.get(id);
    if (!notification) throw new Error("Notification not found");

    const updatedNotification = { ...notification, ...updates };
    this.notifications.set(id, updatedNotification);
    return updatedNotification;
  }

  async deleteNotification(id: string): Promise<void> {
    this.notifications.delete(id);
  }

  async markNotificationRead(id: string): Promise<void> {
    const notification = this.notifications.get(id);
    if (notification) {
      notification.isRead = true;
      notification.readAt = new Date();
      this.notifications.set(id, notification);
    }
  }

  async getUserNotifications(userId: string): Promise<any[]> {
    return Array.from(this.notifications.values()).filter(notification =>
      notification.userId === userId
    ).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async markNotificationAsRead(notificationId: string, userId: string): Promise<void> {
    const notification = this.notifications.get(notificationId);
    if (notification && notification.userId === userId) {
      notification.isRead = true;
      notification.readAt = new Date();
      this.notifications.set(notificationId, notification);
    }
  }



  async createPopup(insertPopup: InsertPopup): Promise<Popup> {
    const id = (this.currentPopupId++).toString();
    const popup: Popup = {
      ...insertPopup,
      id,
      priority: insertPopup.priority || 0,
      isActive: insertPopup.isActive !== undefined ? insertPopup.isActive : true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.popups.set(id, popup);
    return popup;
  }

  async getActivePopups(): Promise<Popup[]> {
    return Array.from(this.popups.values()).filter(popup => popup.isActive);
  }

  async getPopup(id: string): Promise<Popup | undefined> {
    return this.popups.get(id);
  }

  async updatePopup(id: string, updates: Partial<Popup>): Promise<Popup> {
    const popup = this.popups.get(id);
    if (!popup) throw new Error("Popup not found");

    const updatedPopup = { ...popup, ...updates, updatedAt: new Date() };
    this.popups.set(id, updatedPopup);
    return updatedPopup;
  }

  async deletePopup(id: string): Promise<void> {
    this.popups.delete(id);
  }


  async createAppSetting(setting: InsertAppSetting): Promise<AppSetting> {
    // This is a stub - real implementation uses MongoDB
    throw new Error("Admin operations require MongoDB");
  }

  async getAppSetting(key: string): Promise<AppSetting | undefined> {
    // This is a stub - real implementation uses MongoDB
    return undefined;
  }

  async getAllAppSettings(): Promise<AppSetting[]> {
    // This is a stub - real implementation uses MongoDB
    return [];
  }

  async getPublicAppSettings(): Promise<AppSetting[]> {
    // This is a stub - real implementation uses MongoDB
    return [];
  }

  async updateAppSetting(key: string, value: string, updatedBy?: string): Promise<AppSetting> {
    const setting = Array.from(this.appSettings.values()).find(s => s.key === key);
    if (!setting) throw new Error("App setting not found");

    const updatedSetting = { ...setting, value, updatedBy, updatedAt: new Date() };
    this.appSettings.set(setting.id, updatedSetting);
    return updatedSetting;
  }


  async deleteAppSetting(key: string): Promise<void> {
    // This is a stub - real implementation uses MongoDB
  }

  async createAuditLog(insertLog: InsertAuditLog): Promise<AuditLog> {
    const id = (this.currentAuditLogId++).toString();
    const log: AuditLog = {
      ...insertLog,
      id,
      createdAt: new Date()
    };
    this.auditLogs.set(id, log);
    return log;
  }

  async getAuditLogs(limit = 50, adminId?: string): Promise<AuditLog[]> {
    return Array.from(this.auditLogs.values()).filter(log =>
      !adminId || log.actorId === adminId
    ).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }


  async createFeedbackMessage(insertFeedback: InsertFeedbackMessage): Promise<FeedbackMessage> {
    const id = (this.currentFeedbackMessageId++).toString();
    const feedback: FeedbackMessage = {
      ...insertFeedback,
      id,
      status: "new",
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.feedbackMessages.set(id, feedback);
    return feedback;
  }

  async getFeedbackMessages(status?: string): Promise<FeedbackMessage[]> {
    return Array.from(this.feedbackMessages.values()).filter(feedback =>
      !status || feedback.status === status
    ).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async updateFeedbackMessage(id: string, updates: Partial<FeedbackMessage>): Promise<FeedbackMessage> {
    const feedback = this.feedbackMessages.get(id);
    if (!feedback) throw new Error("Feedback message not found");

    const updatedFeedback = { ...feedback, ...updates, updatedAt: new Date() };
    this.feedbackMessages.set(id, updatedFeedback);
    return updatedFeedback;
  }

  async deleteFeedbackMessage(id: string): Promise<void> {
    this.feedbackMessages.delete(id);
  }


  async getAdminStats(): Promise<{
    totalUsers: number;
    totalWorkspaces: number;
    totalContent: number;
    totalCreditsUsed: number;
    revenueThisMonth: number;
    activeUsers: number;
  }> {
    // This is a stub - real implementation uses MongoDB
    return {
      totalUsers: this.users.size,
      totalWorkspaces: this.workspaces.size,
      totalContent: this.content.size,
      totalCreditsUsed: 0,
      revenueThisMonth: 0,
      activeUsers: 0
    };
  }

  // Missing admin methods for interface compatibility
  async getAdminUsers(page: number = 1, limit: number = 10, search?: string): Promise<{ admins: Admin[], total: number }> {
    const allAdmins = Array.from(this.admins.values());
    let filteredAdmins = allAdmins;

    if (search) {
      filteredAdmins = allAdmins.filter(admin =>
        admin.username.toLowerCase().includes(search.toLowerCase()) ||
        admin.email.toLowerCase().includes(search.toLowerCase())
      );
    }

    const startIndex = (page - 1) * limit;
    const paginatedAdmins = filteredAdmins.slice(startIndex, startIndex + limit);

    return {
      admins: paginatedAdmins,
      total: filteredAdmins.length
    };
  }

  async getAdminContent(page: number = 1, limit: number = 10, filters?: any): Promise<{ content: Content[], total: number }> {
    const allContent = Array.from(this.content.values());
    let filteredContent = allContent;

    if (filters?.platform) {
      filteredContent = filteredContent.filter(item => item.platform === filters.platform);
    }
    if (filters?.status) {
      filteredContent = filteredContent.filter(item => item.status === filters.status);
    }
    if (filters?.type) {
      filteredContent = filteredContent.filter(item => item.type === filters.type);
    }

    const startIndex = (page - 1) * limit;
    const paginatedContent = filteredContent.slice(startIndex, startIndex + limit);

    return {
      content: paginatedContent,
      total: filteredContent.length
    };
  }

  async getAdminNotifications(page: number = 1, limit: number = 10): Promise<{ notifications: Notification[], total: number }> {
    const allNotifications = Array.from(this.notifications.values());
    const startIndex = (page - 1) * limit;
    const paginatedNotifications = allNotifications.slice(startIndex, startIndex + limit);

    return {
      notifications: paginatedNotifications,
      total: allNotifications.length
    };
  }

  async getFeatureUsage(userId: string): Promise<any[]> {
    return [];
  }

  async trackFeatureUsage(userId: string, featureId: string, usage: any): Promise<void> {
    // No-op for memory storage
  }

  async createDmConversation(conversation: any): Promise<any> {
    return conversation;
  }

  async createDmMessage(message: any): Promise<any> {
    return message;
  }

  async createConversationContext(context: any): Promise<any> {
    return context;
  }

  async clearWorkspaceConversations(workspaceId: string): Promise<void> {
    // No-op for memory storage
  }

  async getDmConversations(workspaceId: string, limit: number = 50): Promise<any[]> {
    return [];
  }

  async getDmMessages(conversationId: string | number, limit: number = 50): Promise<any[]> {
    return [];
  }

  async incrementExportDownload(exportId: string): Promise<void> {
    // No-op for memory storage
  }

  // VeeGPT Chat operations
  async getChatConversations(userId: string, workspaceId: string): Promise<ChatConversation[]> {
    return Array.from(this.chatConversations.values())
      .filter(conversation => conversation.userId === userId && conversation.workspaceId === workspaceId)
      .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  }


  async getChatConversation(id: string): Promise<ChatConversation | undefined> {
    return this.chatConversations.get(id);
  }


  async createChatConversation(conversation: InsertChatConversation): Promise<ChatConversation> {
    const id = (this.currentChatConversationId++).toString();
    const newConversation: ChatConversation = {
      ...conversation,
      id,
      lastMessageAt: conversation.lastMessageAt || new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.chatConversations.set(id, newConversation);
    return newConversation;
  }




  async updateChatConversation(id: string, updates: Partial<ChatConversation>): Promise<ChatConversation> {
    const conversation = this.chatConversations.get(id);
    if (!conversation) {
      throw new Error(`Conversation with id ${id} not found`);
    }
    const updatedConversation = {
      ...conversation,
      ...updates,
      updatedAt: new Date()
    };
    this.chatConversations.set(id, updatedConversation);
    return updatedConversation;
  }

  async deleteChatConversation(id: string): Promise<void> {
    this.chatConversations.delete(id);
    // Also delete all messages in this conversation
    const messagesToDelete = Array.from(this.chatMessages.entries())
      .filter(([_, message]) => message.conversationId === id)
      .map(([messageId, _]) => messageId);

    messagesToDelete.forEach(messageId => {
      this.chatMessages.delete(messageId);
    });
  }

  async getChatMessages(conversationId: string): Promise<ChatMessage[]> {
    return Array.from(this.chatMessages.values())
      .filter(message => message.conversationId === conversationId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const id = (this.currentChatMessageId++).toString();
    const newMessage: ChatMessage = {
      ...message,
      id,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.chatMessages.set(id, newMessage);
    return newMessage;
  }

  async updateChatMessage(id: string, updates: Partial<ChatMessage>): Promise<ChatMessage> {
    const message = this.chatMessages.get(id);
    if (!message) throw new Error('Message not found');

    const updatedMessage = {
      ...message,
      ...updates,
      updatedAt: new Date()
    };
    this.chatMessages.set(id, updatedMessage);
    return updatedMessage;
  }

  async getChatMessage(id: string): Promise<ChatMessage | undefined> {
    return this.chatMessages.get(id);
  }

  // Creative Brief operations
  async createCreativeBrief(insertBrief: InsertCreativeBrief): Promise<CreativeBrief> {
    const id = (Math.random() * 1000000).toString();
    const brief: CreativeBrief = {
      ...insertBrief,
      id,
      status: "draft",
      creditsUsed: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    return brief;
  }

  async getCreativeBrief(id: string): Promise<CreativeBrief | undefined> {
    return undefined;
  }

  async getCreativeBriefsByWorkspace(workspaceId: string): Promise<CreativeBrief[]> {
    return [];
  }

  async updateCreativeBrief(id: string, updates: Partial<CreativeBrief>): Promise<CreativeBrief> {
    throw new Error("Not implemented");
  }

  async deleteCreativeBrief(id: string): Promise<void> { }

  // Content Repurpose operations
  async createContentRepurpose(insertRepurpose: InsertContentRepurpose): Promise<ContentRepurpose> {
    const id = (Math.random() * 1000000).toString();
    const repurpose: ContentRepurpose = {
      ...insertRepurpose,
      id,
      isApproved: false,
      creditsUsed: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    return repurpose;
  }

  async getContentRepurpose(id: string): Promise<ContentRepurpose | undefined> {
    return undefined;
  }

  async getContentRepurposesByWorkspace(workspaceId: string): Promise<ContentRepurpose[]> {
    return [];
  }

  async updateContentRepurpose(id: string, updates: Partial<ContentRepurpose>): Promise<ContentRepurpose> {
    throw new Error("Not implemented");
  }

  async deleteContentRepurpose(id: string): Promise<void> { }

  // Competitor Analysis operations
  async createCompetitorAnalysis(insertAnalysis: InsertCompetitorAnalysis): Promise<CompetitorAnalysis> {
    const id = (Math.random() * 1000000).toString();
    const analysis: CompetitorAnalysis = {
      ...insertAnalysis,
      id,
      creditsUsed: 0,
      scrapedData: {},
      analysisResults: {},
      createdAt: new Date(),
      updatedAt: new Date()
    };
    return analysis;
  }

  async getCompetitorAnalysis(id: string): Promise<CompetitorAnalysis | undefined> {
    return undefined;
  }

  async getCompetitorAnalysesByWorkspace(workspaceId: string): Promise<CompetitorAnalysis[]> {
    return [];
  }

  async updateCompetitorAnalysis(id: string, updates: Partial<CompetitorAnalysis>): Promise<CompetitorAnalysis> {
    throw new Error("Not implemented");
  }

  async deleteCompetitorAnalysis(id: string): Promise<void> { }

  // Platform synchronization
  async updateYouTubePlatformData(accountId: string, data: any): Promise<void> { }

  async createThumbnailProject(project: any): Promise<any> {
    const id = Date.now().toString();
    const newProject = { ...project, id, createdAt: new Date(), status: 'processing', stage: 1 };
    return newProject;
  }

  async getThumbnailProject(id: string): Promise<any> {
    return {
      id,
      status: 'completed',
      stage: 5,
      createdAt: new Date()
    };
  }

  async updateThumbnailProject(id: string, updates: any): Promise<any> {
    return { id, ...updates };
  }

  async getThumbnailVariants(projectId: string): Promise<any[]> {
    return [
      {
        id: 1,
        variantNumber: 1,
        layoutType: "Face Left - Text Right",
        previewUrl: "/api/placeholder/1280x720",
        predictedCtr: 8.5,
        layoutClassification: "High Impact"
      },
      {
        id: 2,
        variantNumber: 2,
        layoutType: "Bold Title Top",
        previewUrl: "/api/placeholder/1280x720",
        predictedCtr: 7.2,
        layoutClassification: "Attention Grabbing"
      }
    ];
  }

  async createCanvasSession(session: any): Promise<any> {
    return { ...session, id: Date.now() };
  }

  async updateCanvasSession(id: string, updates: any): Promise<any> {
    return { id, ...updates };
  }

  // Thumbnail generation operations
  async createThumbnailStrategy(strategy: any): Promise<any> {
    return { ...strategy, id: Date.now().toString() };
  }

  async createThumbnailVariant(variant: any): Promise<any> {
    return { ...variant, id: Date.now().toString() };
  }

  async createThumbnailExport(exportData: any): Promise<any> {
    return { ...exportData, id: Date.now().toString(), exportUrl: '/api/placeholder/export.png' };
  }

}


import { MongoStorage } from './mongodb-storage';

// Use MongoDB Atlas if connection string is available, otherwise fallback to memory storage
export const storage = (process.env.MONGODB_URI || process.env.DATABASE_URL) ? new MongoStorage() : new MemStorage();

