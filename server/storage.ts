import type { 
  User, Workspace, WorkspaceMember, TeamInvitation, SocialAccount, Content,
  Analytics, AutomationRule, Suggestion,
  CreditTransaction, Referral, Subscription, 
  Payment, Addon, ContentRecommendation, UserContentHistory,
  Admin, AdminSession, Notification, Popup, AppSetting, AuditLog, FeedbackMessage,
  CreativeBrief, ContentRepurpose, CompetitorAnalysis,
  ChatConversation, ChatMessage,
  InsertUser, InsertWorkspace, InsertWorkspaceMember, InsertTeamInvitation,
  InsertSocialAccount, InsertContent, InsertAutomationRule, InsertAnalytics,
  InsertSuggestion, InsertCreditTransaction, InsertReferral,
  InsertSubscription, InsertPayment, InsertAddon,
  InsertContentRecommendation, InsertUserContentHistory,
  InsertAdmin, InsertNotification, InsertPopup, InsertAppSetting, InsertAuditLog, InsertFeedbackMessage,
  InsertCreativeBrief, InsertContentRepurpose, InsertCompetitorAnalysis,
  InsertChatConversation, InsertChatMessage
} from "@shared/schema";

export interface IStorage {
  // User operations
  getUser(id: number | string): Promise<User | undefined>;
  getUserByFirebaseUid(firebaseUid: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByReferralCode(referralCode: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number | string, updates: Partial<User>): Promise<User>;
  updateUserCredits(id: number | string, credits: number): Promise<User>;
  getUserCredits(userId: number | string): Promise<number>;
  updateUserStripeInfo(id: number | string, stripeCustomerId: string, stripeSubscriptionId?: string): Promise<User>;
  
  // Email verification operations
  createUnverifiedUser(data: { email: string; firstName: string; emailVerificationCode: string; emailVerificationExpiry: Date; isEmailVerified: boolean }): Promise<User>;
  updateUserEmailVerification(id: number | string, token: string, expires: Date): Promise<User>;
  verifyUserEmail(id: number | string, data: { password?: string; firstName?: string; lastName?: string }): Promise<User>;

  // Workspace operations
  getWorkspace(id: number | string): Promise<Workspace | undefined>;
  getWorkspacesByUserId(userId: number | string): Promise<Workspace[]>;
  getDefaultWorkspace(userId: number | string): Promise<Workspace | undefined>;
  getWorkspaceByInviteCode(inviteCode: string): Promise<Workspace | undefined>;
  createWorkspace(workspace: InsertWorkspace): Promise<Workspace>;
  updateWorkspace(id: number | string, updates: Partial<Workspace>): Promise<Workspace>;
  updateWorkspaceCredits(id: number | string, credits: number): Promise<void>;
  deleteWorkspace(id: number | string): Promise<void>;
  setDefaultWorkspace(userId: number | string, workspaceId: number | string): Promise<void>;

  // Team management operations
  getWorkspaceMember(workspaceId: number, userId: number): Promise<WorkspaceMember | undefined>;
  getWorkspaceMembers(workspaceId: number): Promise<(WorkspaceMember & { user: User })[]>;
  addWorkspaceMember(member: InsertWorkspaceMember): Promise<WorkspaceMember>;
  updateWorkspaceMember(workspaceId: number, userId: number, updates: Partial<WorkspaceMember>): Promise<WorkspaceMember>;
  removeWorkspaceMember(workspaceId: number, userId: number): Promise<void>;
  
  // Team invitation operations
  createTeamInvitation(invitation: InsertTeamInvitation): Promise<TeamInvitation>;
  getTeamInvitation(id: number): Promise<TeamInvitation | undefined>;
  getTeamInvitationByToken(token: string): Promise<TeamInvitation | undefined>;
  getTeamInvitations(workspaceId: number, status?: string): Promise<TeamInvitation[]>;
  getWorkspaceInvitations(workspaceId: number): Promise<TeamInvitation[]>;
  updateTeamInvitation(id: number, updates: Partial<TeamInvitation>): Promise<TeamInvitation>;

  // Social account operations
  getSocialAccount(id: number | string): Promise<SocialAccount | undefined>;
  getSocialAccountsByWorkspace(workspaceId: number | string): Promise<SocialAccount[]>;
  getAllSocialAccounts(): Promise<SocialAccount[]>;
  getSocialAccountByPlatform(workspaceId: number | string, platform: string): Promise<SocialAccount | undefined>;
  getSocialAccountByPageId(pageId: string): Promise<SocialAccount | undefined>;
  getSocialConnections(userId: number): Promise<SocialAccount[]>;
  createSocialAccount(account: InsertSocialAccount): Promise<SocialAccount>;
  updateSocialAccount(id: number | string, updates: Partial<SocialAccount>): Promise<SocialAccount>;
  deleteSocialAccount(id: number): Promise<void>;

  // Content operations
  getContent(id: number): Promise<Content | undefined>;
  getContentByWorkspace(workspaceId: number | string, limit?: number): Promise<Content[]>;
  getScheduledContent(workspaceId?: number | string): Promise<Content[]>;
  createContent(content: InsertContent): Promise<Content>;
  updateContent(id: number, updates: Partial<Content>): Promise<Content>;
  deleteContent(id: number): Promise<void>;
  createPost(postData: any): Promise<any>;

  // Analytics operations
  getAnalytics(workspaceId: number, platform?: string, days?: number): Promise<Analytics[]>;
  createAnalytics(analytics: InsertAnalytics): Promise<Analytics>;
  getLatestAnalytics(workspaceId: number, platform: string): Promise<Analytics | undefined>;

  // Automation rules
  getAutomationRule(id: string): Promise<AutomationRule | undefined>;
  getAutomationRules(workspaceId: number | string): Promise<AutomationRule[]>;
  getActiveAutomationRules(): Promise<AutomationRule[]>;
  getAutomationRulesByType(type: string): Promise<AutomationRule[]>;
  createAutomationRule(rule: InsertAutomationRule): Promise<AutomationRule>;
  updateAutomationRule(id: string, updates: Partial<AutomationRule>): Promise<AutomationRule>;
  deleteAutomationRule(id: string): Promise<void>;
  
  // Automation logs
  getAutomationLogs(workspaceId: string | number, options?: { limit?: number; type?: string }): Promise<any[]>;
  createAutomationLog(log: any): Promise<any>;
  
  // Social accounts
  getAllSocialAccounts(): Promise<SocialAccount[]>;

  // Suggestions
  getSuggestions(workspaceId: number, type?: string): Promise<Suggestion[]>;
  getSuggestionsByWorkspace(workspaceId: string | number): Promise<Suggestion[]>;
  getValidSuggestions(workspaceId: number): Promise<Suggestion[]>;
  createSuggestion(suggestion: InsertSuggestion): Promise<Suggestion>;
  markSuggestionUsed(id: number): Promise<Suggestion>;
  clearSuggestionsByWorkspace(workspaceId: string | number): Promise<void>;
  
  // Analytics by workspace
  getAnalyticsByWorkspace(workspaceId: string | number): Promise<Analytics[]>;

  // Credit transactions
  getCreditTransactions(userId: number, limit?: number): Promise<CreditTransaction[]>;
  createCreditTransaction(transaction: InsertCreditTransaction): Promise<CreditTransaction>;

  // Referrals
  getReferrals(referrerId: number): Promise<Referral[]>;
  getReferralStats(userId: number): Promise<{ totalReferrals: number; activePaid: number; totalEarned: number }>;
  createReferral(referral: InsertReferral): Promise<Referral>;
  confirmReferral(id: number): Promise<Referral>;
  getLeaderboard(limit?: number): Promise<Array<User & { referralCount: number }>>;

  // Subscription operations
  getSubscription(userId: number): Promise<Subscription | undefined>;
  createSubscription(subscription: InsertSubscription): Promise<Subscription>;
  updateSubscriptionStatus(userId: number, status: string, canceledAt?: Date): Promise<Subscription>;

  // Payment operations
  createPayment(payment: InsertPayment): Promise<Payment>;
  getPaymentsByUser(userId: number): Promise<Payment[]>;

  // Addon operations
  getUserAddons(userId: number | string): Promise<Addon[]>;
  getActiveAddonsByUser(userId: number): Promise<Addon[]>;
  createAddon(addon: InsertAddon): Promise<Addon>;

  // Feature usage tracking
  getFeatureUsage(userId: number | string): Promise<any[]>;
  trackFeatureUsage(userId: number | string, featureId: string, usage: any): Promise<void>;

  // Content recommendation operations
  getContentRecommendation(id: number): Promise<ContentRecommendation | undefined>;
  getContentRecommendations(workspaceId: number, type?: string, limit?: number): Promise<ContentRecommendation[]>;
  createContentRecommendation(recommendation: InsertContentRecommendation): Promise<ContentRecommendation>;
  updateContentRecommendation(id: number, updates: Partial<ContentRecommendation>): Promise<ContentRecommendation>;

  // User content history operations
  getUserContentHistory(userId: number, workspaceId: number): Promise<UserContentHistory[]>;
  createUserContentHistory(history: InsertUserContentHistory): Promise<UserContentHistory>;

  // Pricing and plan operations
  getPricingData(): Promise<any>;
  updateUserSubscription(userId: number | string, planId: string): Promise<User>;
  addCreditsToUser(userId: number | string, credits: number): Promise<User>;

  // Conversation management operations
  createDmConversation(conversation: any): Promise<any>;
  createDmMessage(message: any): Promise<any>;
  createConversationContext(context: any): Promise<any>;
  clearWorkspaceConversations(workspaceId: string): Promise<void>;
  getDmConversations(workspaceId: string, limit?: number): Promise<any[]>;
  getDmMessages(conversationId: number | string, limit?: number): Promise<any[]>;

  // VeeGPT Chat operations
  getChatConversations(userId: string, workspaceId?: string): Promise<ChatConversation[]>;
  getChatConversation(id: number): Promise<ChatConversation | undefined>;
  createChatConversation(conversation: InsertChatConversation): Promise<ChatConversation>;
  updateChatConversation(id: number, updates: Partial<ChatConversation>): Promise<ChatConversation>;
  deleteChatConversation(id: number): Promise<void>;
  getChatMessages(conversationId: number): Promise<ChatMessage[]>;
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  updateChatMessage(id: number, updates: Partial<ChatMessage>): Promise<ChatMessage>;
  getChatMessage(id: number): Promise<ChatMessage | undefined>;

  // YouTube workspace data operations
  updateYouTubeWorkspaceData(updates: any): Promise<any>;

  // Admin operations
  getAdmin(id: number): Promise<Admin | undefined>;
  getAdminByEmail(email: string): Promise<Admin | undefined>;
  getAdminByUsername(username: string): Promise<Admin | undefined>;
  getAllAdmins(): Promise<Admin[]>;
  createAdmin(admin: InsertAdmin): Promise<Admin>;
  updateAdmin(id: number, updates: Partial<Admin>): Promise<Admin>;
  deleteAdmin(id: number): Promise<void>;

  // Admin session operations
  createAdminSession(session: Partial<AdminSession>): Promise<AdminSession>;
  getAdminSession(token: string): Promise<AdminSession | undefined>;
  deleteAdminSession(token: string): Promise<void>;
  cleanupExpiredSessions(): Promise<void>;

  // Notification operations
  createNotification(notification: InsertNotification): Promise<Notification>;
  getNotifications(userId?: number): Promise<Notification[]>;
  getUserNotifications(userId: string): Promise<any[]>;
  markNotificationAsRead(notificationId: string, userId: string): Promise<void>;
  updateNotification(id: number, updates: Partial<Notification>): Promise<Notification>;
  deleteNotification(id: number): Promise<void>;
  markNotificationRead(id: number): Promise<void>;

  // Popup operations
  createPopup(popup: InsertPopup): Promise<Popup>;
  getActivePopups(): Promise<Popup[]>;
  getPopup(id: number): Promise<Popup | undefined>;
  updatePopup(id: number, updates: Partial<Popup>): Promise<Popup>;
  deletePopup(id: number): Promise<void>;

  // App settings operations
  createAppSetting(setting: InsertAppSetting): Promise<AppSetting>;
  getAppSetting(key: string): Promise<AppSetting | undefined>;
  getAllAppSettings(): Promise<AppSetting[]>;
  getPublicAppSettings(): Promise<AppSetting[]>;
  updateAppSetting(key: string, value: string, updatedBy?: number): Promise<AppSetting>;
  deleteAppSetting(key: string): Promise<void>;

  // Audit log operations
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(limit?: number, adminId?: number): Promise<AuditLog[]>;

  // Feedback operations
  createFeedbackMessage(feedback: InsertFeedbackMessage): Promise<FeedbackMessage>;
  getFeedbackMessages(status?: string): Promise<FeedbackMessage[]>;
  updateFeedbackMessage(id: number, updates: Partial<FeedbackMessage>): Promise<FeedbackMessage>;
  deleteFeedbackMessage(id: number): Promise<void>;

  // Admin-specific operations
  getAdminUsers(page?: number, limit?: number, search?: string): Promise<{ users: User[], total: number }>;
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
  getThumbnailProject(id: number): Promise<any>;
  updateThumbnailProject(id: number, updates: any): Promise<any>;
  createThumbnailStrategy(strategy: any): Promise<any>;
  createThumbnailVariant(variant: any): Promise<any>;
  getThumbnailVariants(projectId: number): Promise<any[]>;
  createCanvasSession(session: any): Promise<any>;
  updateCanvasSession(id: number, updates: any): Promise<any>;
  createThumbnailExport(exportData: any): Promise<any>;
  incrementExportDownload(exportId: number): Promise<void>;

  // Creative Brief operations
  createCreativeBrief(brief: InsertCreativeBrief): Promise<CreativeBrief>;
  getCreativeBrief(id: number): Promise<CreativeBrief | undefined>;
  getCreativeBriefsByWorkspace(workspaceId: number): Promise<CreativeBrief[]>;
  updateCreativeBrief(id: number, updates: Partial<CreativeBrief>): Promise<CreativeBrief>;
  deleteCreativeBrief(id: number): Promise<void>;

  // Content Repurpose operations
  createContentRepurpose(repurpose: InsertContentRepurpose): Promise<ContentRepurpose>;
  getContentRepurpose(id: number): Promise<ContentRepurpose | undefined>;
  getContentRepurposesByWorkspace(workspaceId: number): Promise<ContentRepurpose[]>;
  updateContentRepurpose(id: number, updates: Partial<ContentRepurpose>): Promise<ContentRepurpose>;
  deleteContentRepurpose(id: number): Promise<void>;

  // Competitor Analysis operations
  createCompetitorAnalysis(analysis: InsertCompetitorAnalysis): Promise<CompetitorAnalysis>;
  getCompetitorAnalysis(id: number): Promise<CompetitorAnalysis | undefined>;
  getCompetitorAnalysesByWorkspace(workspaceId: number): Promise<CompetitorAnalysis[]>;
  updateCompetitorAnalysis(id: number, updates: Partial<CompetitorAnalysis>): Promise<CompetitorAnalysis>;
  deleteCompetitorAnalysis(id: number): Promise<void>;

  // Waitlist operations (MongoDB only)
  createWaitlistUser?(insertWaitlistUser: any): Promise<any>;
  getWaitlistUser?(id: number | string): Promise<any>;
  getWaitlistUserByEmail?(email: string): Promise<any>;
  updateWaitlistUser?(id: number | string, updates: any): Promise<any>;
  deleteWaitlistUser?(id: number | string): Promise<void>;
  getAllWaitlistUsers?(): Promise<any[]>;
  getWaitlistStats?(): Promise<any>;
  clearAllWaitlistUsers?(): Promise<number>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User> = new Map();
  private workspaces: Map<number, Workspace> = new Map();
  private workspaceMembers: Map<string, WorkspaceMember> = new Map(); // key: `${workspaceId}-${userId}`
  private teamInvitations: Map<number, TeamInvitation> = new Map();
  private socialAccounts: Map<number, SocialAccount> = new Map();
  private content: Map<number, Content> = new Map();
  private analytics: Map<number, Analytics> = new Map();
  private automationRules: Map<number, AutomationRule> = new Map();
  private suggestions: Map<number, Suggestion> = new Map();
  private creditTransactions: Map<number, CreditTransaction> = new Map();
  private referrals: Map<number, Referral> = new Map();
  private subscriptions: Map<number, Subscription> = new Map();
  private payments: Map<number, Payment> = new Map();
  private addons: Map<number, Addon> = new Map();
  private contentRecommendations: Map<number, ContentRecommendation> = new Map();
  private userContentHistory: Map<number, UserContentHistory> = new Map();
  private chatConversations: Map<number, ChatConversation> = new Map();
  private chatMessages: Map<number, ChatMessage> = new Map();
  
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

  // User operations
  async getUser(id: number): Promise<User | undefined> {
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
    const id = this.currentUserId++;
    const user: User = {
      ...insertUser,
      id,
      credits: 0,
      plan: "free",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      referralCode: `ref_${id}_${Date.now()}`,
      totalReferrals: 0,
      totalEarned: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: number | string, updates: Partial<User>): Promise<User> {
    const numId = typeof id === 'string' ? parseInt(id) : id;
    const user = this.users.get(numId);
    if (!user) throw new Error("User not found");
    
    const updatedUser = { ...user, ...updates, updatedAt: new Date() };
    this.users.set(numId, updatedUser);
    return updatedUser;
  }

  async updateUserCredits(id: number, credits: number): Promise<User> {
    return this.updateUser(id, { credits });
  }

  async updateUserStripeInfo(id: number, stripeCustomerId: string, stripeSubscriptionId?: string): Promise<User> {
    return this.updateUser(id, { stripeCustomerId, stripeSubscriptionId });
  }

  // Workspace operations
  async getWorkspace(id: number): Promise<Workspace | undefined> {
    return this.workspaces.get(id);
  }

  async getWorkspacesByUserId(userId: number): Promise<Workspace[]> {
    return Array.from(this.workspaces.values()).filter(workspace => workspace.userId === userId);
  }

  async getDefaultWorkspace(userId: number): Promise<Workspace | undefined> {
    return Array.from(this.workspaces.values()).find(
      workspace => workspace.userId === userId && workspace.isDefault
    );
  }

  async createWorkspace(insertWorkspace: InsertWorkspace): Promise<Workspace> {
    const id = this.currentWorkspaceId++;
    const workspace: Workspace = {
      ...insertWorkspace,
      id,
      description: insertWorkspace.description || null,
      avatar: insertWorkspace.avatar || null,
      theme: insertWorkspace.theme || "default",
      aiPersonality: insertWorkspace.aiPersonality || null,
      credits: 0,
      isDefault: insertWorkspace.isDefault || false,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.workspaces.set(id, workspace);
    return workspace;
  }

  async updateWorkspace(id: number, updates: Partial<Workspace>): Promise<Workspace> {
    const workspace = this.workspaces.get(id);
    if (!workspace) throw new Error("Workspace not found");
    
    const updatedWorkspace = { ...workspace, ...updates, updatedAt: new Date() };
    this.workspaces.set(id, updatedWorkspace);
    return updatedWorkspace;
  }

  async updateWorkspaceCredits(id: number | string, credits: number): Promise<void> {
    const numericId = typeof id === 'string' ? parseInt(id) : id;
    const workspace = this.workspaces.get(numericId);
    if (!workspace) throw new Error("Workspace not found");
    
    const updatedWorkspace = { ...workspace, credits, updatedAt: new Date() };
    this.workspaces.set(numericId, updatedWorkspace);
  }

  async deleteWorkspace(id: number): Promise<void> {
    this.workspaces.delete(id);
  }

  async setDefaultWorkspace(userId: number | string, workspaceId: number | string): Promise<void> {
    const userIdNum = typeof userId === 'string' ? parseInt(userId) : userId;
    const workspaceIdNum = typeof workspaceId === 'string' ? parseInt(workspaceId) : workspaceId;
    
    // First, unset all default workspaces for this user
    for (const workspace of this.workspaces.values()) {
      if (workspace.userId === userIdNum && workspace.isDefault) {
        workspace.isDefault = false;
        workspace.updatedAt = new Date();
      }
    }
    
    // Then set the specified workspace as default
    const targetWorkspace = this.workspaces.get(workspaceIdNum);
    if (targetWorkspace && targetWorkspace.userId === userIdNum) {
      targetWorkspace.isDefault = true;
      targetWorkspace.updatedAt = new Date();
    }
  }

  async getWorkspaceByInviteCode(inviteCode: string): Promise<Workspace | undefined> {
    return Array.from(this.workspaces.values()).find(workspace => workspace.inviteCode === inviteCode);
  }

  // Team management operations
  async getWorkspaceMember(workspaceId: number, userId: number): Promise<WorkspaceMember | undefined> {
    return this.workspaceMembers.get(`${workspaceId}-${userId}`);
  }

  async getWorkspaceMembers(workspaceId: number): Promise<(WorkspaceMember & { user: User })[]> {
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
    const id = this.currentWorkspaceMemberId++;
    const member: WorkspaceMember = {
      ...insertMember,
      id,
      invitedAt: new Date(),
      joinedAt: new Date()
    };
    
    this.workspaceMembers.set(`${member.workspaceId}-${member.userId}`, member);
    return member;
  }

  async updateWorkspaceMember(workspaceId: number, userId: number, updates: Partial<WorkspaceMember>): Promise<WorkspaceMember> {
    const member = this.workspaceMembers.get(`${workspaceId}-${userId}`);
    if (!member) throw new Error("Workspace member not found");
    
    const updatedMember = { ...member, ...updates };
    this.workspaceMembers.set(`${workspaceId}-${userId}`, updatedMember);
    return updatedMember;
  }

  async removeWorkspaceMember(workspaceId: number, userId: number): Promise<void> {
    this.workspaceMembers.delete(`${workspaceId}-${userId}`);
  }

  // Team invitation operations
  async createTeamInvitation(insertInvitation: InsertTeamInvitation): Promise<TeamInvitation> {
    const id = this.currentTeamInvitationId++;
    const invitation: TeamInvitation = {
      ...insertInvitation,
      id,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    this.teamInvitations.set(id, invitation);
    return invitation;
  }

  async getTeamInvitation(id: number): Promise<TeamInvitation | undefined> {
    return this.teamInvitations.get(id);
  }

  async getTeamInvitationByToken(token: string): Promise<TeamInvitation | undefined> {
    return Array.from(this.teamInvitations.values()).find(invitation => invitation.token === token);
  }

  async getTeamInvitations(workspaceId: number, status?: string): Promise<TeamInvitation[]> {
    return Array.from(this.teamInvitations.values()).filter(invitation => 
      invitation.workspaceId === workspaceId && (!status || invitation.status === status)
    );
  }

  async getWorkspaceInvitations(workspaceId: number): Promise<TeamInvitation[]> {
    return this.getTeamInvitations(workspaceId, 'pending');
  }

  async updateTeamInvitation(id: number, updates: Partial<TeamInvitation>): Promise<TeamInvitation> {
    const invitation = this.teamInvitations.get(id);
    if (!invitation) throw new Error("Team invitation not found");
    
    const updatedInvitation = { ...invitation, ...updates, updatedAt: new Date() };
    this.teamInvitations.set(id, updatedInvitation);
    return updatedInvitation;
  }

  // Social account operations
  async getSocialAccount(id: number): Promise<SocialAccount | undefined> {
    return this.socialAccounts.get(id);
  }

  async getSocialAccountsByWorkspace(workspaceId: number): Promise<SocialAccount[]> {
    return Array.from(this.socialAccounts.values()).filter(account => account.workspaceId === workspaceId);
  }

  async getAllSocialAccounts(): Promise<SocialAccount[]> {
    return Array.from(this.socialAccounts.values());
  }



  async getSocialAccountByPlatform(workspaceId: number | string, platform: string): Promise<SocialAccount | undefined> {
    return Array.from(this.socialAccounts.values()).find(
      account => account.workspaceId.toString() === workspaceId.toString() && account.platform === platform
    );
  }

  async getSocialConnections(userId: number): Promise<SocialAccount[]> {
    const userWorkspaces = await this.getWorkspacesByUserId(userId);
    const workspaceIds = userWorkspaces.map(w => w.id);
    return Array.from(this.socialAccounts.values()).filter(
      account => workspaceIds.includes(account.workspaceId)
    );
  }

  async createSocialAccount(insertAccount: InsertSocialAccount): Promise<SocialAccount> {
    const id = this.currentSocialAccountId++;
    const account: SocialAccount = {
      ...insertAccount,
      id,
      refreshToken: insertAccount.refreshToken || null,
      expiresAt: insertAccount.expiresAt || null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.socialAccounts.set(id, account);
    return account;
  }

  async updateSocialAccount(id: number | string, updates: Partial<SocialAccount>): Promise<SocialAccount> {
    const numId = typeof id === 'string' ? parseInt(id) : id;
    const account = this.socialAccounts.get(numId);
    if (!account) throw new Error("Social account not found");
    
    const updatedAccount = { ...account, ...updates, updatedAt: new Date() };
    this.socialAccounts.set(numId, updatedAccount);
    return updatedAccount;
  }

  async deleteSocialAccount(id: number): Promise<void> {
    this.socialAccounts.delete(id);
  }

  // Content operations
  async getContent(id: number): Promise<Content | undefined> {
    return this.content.get(id);
  }

  async getContentByWorkspace(workspaceId: number | string, limit = 50): Promise<Content[]> {
    const workspaceContent = Array.from(this.content.values())
      .filter(content => content.workspaceId.toString() === workspaceId.toString())
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
    
    return workspaceContent.slice(0, limit);
  }

  async getScheduledContent(workspaceId?: number | string): Promise<Content[]> {
    const allContent = Array.from(this.content.values()).filter(
      content => content.status === "scheduled" && content.scheduledAt
    );
    
    // If workspaceId is provided, filter by workspace
    const filteredContent = workspaceId 
      ? allContent.filter(content => content.workspaceId.toString() === workspaceId.toString())
      : allContent;
    
    return filteredContent.sort((a, b) => (a.scheduledAt!.getTime() - b.scheduledAt!.getTime()));
  }

  async createContent(insertContent: InsertContent): Promise<Content> {
    const id = this.currentContentId++;
    const content: Content = {
      ...insertContent,
      id,
      description: insertContent.description || null,
      contentData: insertContent.contentData || null,
      prompt: insertContent.prompt || null,
      platform: insertContent.platform || null,
      status: "draft",
      creditsUsed: insertContent.creditsUsed || 0,
      scheduledAt: insertContent.scheduledAt || null,
      publishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.content.set(id, content);
    return content;
  }

  async updateContent(id: number, updates: Partial<Content>): Promise<Content> {
    const content = this.content.get(id);
    if (!content) throw new Error("Content not found");
    
    const updatedContent = { ...content, ...updates, updatedAt: new Date() };
    this.content.set(id, updatedContent);
    return updatedContent;
  }

  async deleteContent(id: number): Promise<void> {
    this.content.delete(id);
  }

  // Analytics operations
  async getAnalytics(workspaceId: number, platform?: string, days = 30): Promise<Analytics[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    
    return Array.from(this.analytics.values()).filter(analytics => 
      analytics.workspaceId === workspaceId &&
      (!platform || analytics.platform === platform) &&
      analytics.date >= cutoff
    ).sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  async createAnalytics(insertAnalytics: InsertAnalytics): Promise<Analytics> {
    const id = this.currentAnalyticsId++;
    const analytics: Analytics = {
      ...insertAnalytics,
      id,
      contentId: insertAnalytics.contentId || null,
      postId: insertAnalytics.postId || null,
      metrics: insertAnalytics.metrics || null,
      date: insertAnalytics.date || new Date(),
      createdAt: new Date()
    };
    this.analytics.set(id, analytics);
    return analytics;
  }

  async getLatestAnalytics(workspaceId: number, platform: string): Promise<Analytics | undefined> {
    const workspaceAnalytics = Array.from(this.analytics.values())
      .filter(analytics => analytics.workspaceId === workspaceId && analytics.platform === platform)
      .sort((a, b) => b.date.getTime() - a.date.getTime());
    
    return workspaceAnalytics[0];
  }

  // Automation rules
  async getAutomationRules(workspaceId: number | string): Promise<AutomationRule[]> {
    return Array.from(this.automationRules.values()).filter(rule => 
      rule.workspaceId.toString() === workspaceId.toString()
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
    const id = this.currentAutomationRuleId++;
    const rule: AutomationRule = {
      ...insertRule,
      id,
      description: insertRule.description || null,
      trigger: insertRule.trigger || null,
      action: insertRule.action || null,
      isActive: insertRule.isActive !== undefined ? insertRule.isActive : true,
      lastRun: null,
      nextRun: insertRule.nextRun || null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.automationRules.set(id, rule);
    return rule;
  }

  async updateAutomationRule(id: string, updates: Partial<AutomationRule>): Promise<AutomationRule> {
    const numericId = parseInt(id);
    const rule = this.automationRules.get(numericId);
    if (!rule) throw new Error("Automation rule not found");
    
    const updatedRule = { ...rule, ...updates, updatedAt: new Date() };
    this.automationRules.set(numericId, updatedRule);
    return updatedRule;
  }

  async deleteAutomationRule(id: string): Promise<void> {
    const numericId = parseInt(id);
    this.automationRules.delete(numericId);
  }

  async getAutomationRulesByWorkspace(workspaceId: string | number): Promise<AutomationRule[]> {
    const wsId = typeof workspaceId === 'string' ? parseInt(workspaceId) : workspaceId;
    return Array.from(this.automationRules.values())
      .filter(rule => rule.workspaceId === wsId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getAutomationLogs(workspaceId: string | number, options?: { limit?: number; type?: string }): Promise<any[]> {
    // For now, return empty array - logs would be stored separately in a real implementation
    return [];
  }

  async createAutomationLog(log: any): Promise<any> {
    // For now, just return the log - in a real implementation, this would store to database
    return { ...log, id: Date.now(), createdAt: new Date() };
  }

  async getAllSocialAccounts(): Promise<SocialAccount[]> {
    return Array.from(this.socialAccounts.values());
  }

  // Suggestions
  async getSuggestions(workspaceId: number, type?: string): Promise<Suggestion[]> {
    return Array.from(this.suggestions.values()).filter(suggestion => 
      suggestion.workspaceId === workspaceId &&
      (!type || suggestion.type === type)
    ).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getValidSuggestions(workspaceId: number): Promise<Suggestion[]> {
    const now = new Date();
    return Array.from(this.suggestions.values()).filter(suggestion => 
      suggestion.workspaceId === workspaceId &&
      !suggestion.isUsed &&
      (!suggestion.validUntil || suggestion.validUntil > now)
    );
  }

  async createSuggestion(insertSuggestion: InsertSuggestion): Promise<Suggestion> {
    const id = this.currentSuggestionId++;
    const suggestion: Suggestion = {
      ...insertSuggestion,
      id,
      data: insertSuggestion.data || null,
      confidence: insertSuggestion.confidence || 0,
      isUsed: false,
      validUntil: insertSuggestion.validUntil || null,
      createdAt: new Date()
    };
    this.suggestions.set(id, suggestion);
    return suggestion;
  }

  async markSuggestionUsed(id: number): Promise<Suggestion> {
    const suggestion = this.suggestions.get(id);
    if (!suggestion) throw new Error("Suggestion not found");
    
    const updatedSuggestion = { ...suggestion, isUsed: true };
    this.suggestions.set(id, updatedSuggestion);
    return updatedSuggestion;
  }

  async getSuggestionsByWorkspace(workspaceId: string | number): Promise<Suggestion[]> {
    const wsId = typeof workspaceId === 'string' ? parseInt(workspaceId) : workspaceId;
    return Array.from(this.suggestions.values())
      .filter(suggestion => suggestion.workspaceId === wsId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async clearSuggestionsByWorkspace(workspaceId: string | number): Promise<void> {
    const wsId = typeof workspaceId === 'string' ? parseInt(workspaceId) : workspaceId;
    const suggestionIds = Array.from(this.suggestions.entries())
      .filter(([id, suggestion]) => suggestion.workspaceId === wsId)
      .map(([id]) => id);
    
    for (const id of suggestionIds) {
      this.suggestions.delete(id);
    }
  }

  async getAnalyticsByWorkspace(workspaceId: string | number): Promise<Analytics[]> {
    const wsId = typeof workspaceId === 'string' ? parseInt(workspaceId) : workspaceId;
    return Array.from(this.analytics.values())
      .filter(analytics => analytics.workspaceId === wsId)
      .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
  }

  // Credit transactions
  async getCreditTransactions(userId: number, limit = 50): Promise<CreditTransaction[]> {
    return Array.from(this.creditTransactions.values())
      .filter(transaction => transaction.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async createCreditTransaction(insertTransaction: InsertCreditTransaction): Promise<CreditTransaction> {
    const id = this.currentCreditTransactionId++;
    const transaction: CreditTransaction = {
      ...insertTransaction,
      id,
      workspaceId: insertTransaction.workspaceId || null,
      description: insertTransaction.description || null,
      referenceId: insertTransaction.referenceId || null,
      createdAt: new Date()
    };
    this.creditTransactions.set(id, transaction);
    return transaction;
  }

  // Referrals
  async getReferrals(referrerId: number): Promise<Referral[]> {
    return Array.from(this.referrals.values()).filter(referral => referral.referrerId === referrerId);
  }

  async getReferralStats(userId: number): Promise<{ totalReferrals: number; activePaid: number; totalEarned: number }> {
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
    const id = this.currentReferralId++;
    const referral: Referral = {
      ...insertReferral,
      id,
      status: "pending",
      rewardAmount: insertReferral.rewardAmount || 0,
      createdAt: new Date(),
      confirmedAt: null
    };
    this.referrals.set(id, referral);
    return referral;
  }

  async confirmReferral(id: number): Promise<Referral> {
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
    const userReferralCounts = new Map<number, number>();
    
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
  async getSubscription(userId: number): Promise<Subscription | undefined> {
    return Array.from(this.subscriptions.values()).find(subscription => subscription.userId === userId);
  }

  async createSubscription(insertSubscription: InsertSubscription): Promise<Subscription> {
    const id = this.currentSubscriptionId++;
    const subscription: Subscription = {
      ...insertSubscription,
      id,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.subscriptions.set(id, subscription);
    return subscription;
  }

  async updateSubscriptionStatus(userId: number, status: string, canceledAt?: Date): Promise<Subscription> {
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
    const id = this.currentPaymentId++;
    const payment: Payment = {
      ...insertPayment,
      id,
      createdAt: new Date()
    };
    this.payments.set(id, payment);
    return payment;
  }

  async getPaymentsByUser(userId: number): Promise<Payment[]> {
    return Array.from(this.payments.values()).filter(payment => payment.userId === userId);
  }

  // Addon operations
  async getUserAddons(userId: number): Promise<Addon[]> {
    return Array.from(this.addons.values()).filter(addon => addon.userId === userId && addon.isActive);
  }

  async getActiveAddonsByUser(userId: number): Promise<Addon[]> {
    const now = new Date();
    return Array.from(this.addons.values()).filter(addon => 
      addon.userId === userId && 
      addon.isActive && 
      (addon.expiresAt === null || addon.expiresAt > now)
    );
  }

  async createAddon(insertAddon: InsertAddon): Promise<Addon> {
    const id = this.currentAddonId++;
    const addon: Addon = {
      ...insertAddon,
      id,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.addons.set(id, addon);
    return addon;
  }

  // Content recommendation operations
  async getContentRecommendation(id: number): Promise<ContentRecommendation | undefined> {
    return this.contentRecommendations.get(id);
  }

  async getContentRecommendations(workspaceId: number, type?: string, limit?: number): Promise<ContentRecommendation[]> {
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
    const id = this.currentContentRecommendationId++;
    const recommendation: ContentRecommendation = {
      ...insertRecommendation,
      id,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.contentRecommendations.set(id, recommendation);
    return recommendation;
  }

  async updateContentRecommendation(id: number, updates: Partial<ContentRecommendation>): Promise<ContentRecommendation> {
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
  async getUserContentHistory(userId: number, workspaceId: number): Promise<UserContentHistory[]> {
    return Array.from(this.userContentHistory.values())
      .filter(history => history.userId === userId && history.workspaceId === workspaceId)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async createUserContentHistory(insertHistory: InsertUserContentHistory): Promise<UserContentHistory> {
    const id = this.currentUserContentHistoryId++;
    const history: UserContentHistory = {
      ...insertHistory,
      id,
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

  async updateUserSubscription(userId: number | string, planId: string): Promise<User> {
    const numId = typeof userId === 'string' ? parseInt(userId) : userId;
    return this.updateUser(numId, { plan: planId });
  }

  async addCreditsToUser(userId: number | string, credits: number): Promise<User> {
    const numId = typeof userId === 'string' ? parseInt(userId) : userId;
    const user = this.users.get(numId);
    if (!user) throw new Error("User not found");
    
    const newCredits = (user.credits || 0) + credits;
    return this.updateUser(numId, { credits: newCredits });
  }

  // Conversation management methods (stub implementation - MongoDB is used for real data)
  async createDmConversation(conversation: any): Promise<any> {
    // This is a stub - real implementation uses MongoDB
    return conversation;
  }

  async createDmMessage(message: any): Promise<any> {
    // This is a stub - real implementation uses MongoDB
    return message;
  }

  async createConversationContext(context: any): Promise<any> {
    // This is a stub - real implementation uses MongoDB
    return context;
  }

  async clearWorkspaceConversations(workspaceId: string): Promise<void> {
    // This is a stub - real implementation uses MongoDB
    console.log(`[MEM STORAGE] Stub: Clear conversations for workspace ${workspaceId}`);
  }

  async getDmConversations(workspaceId: string, limit: number = 50): Promise<any[]> {
    // This is a stub - real implementation uses MongoDB
    console.log(`[MEM STORAGE] Stub: Get DM conversations for workspace ${workspaceId}`);
    return [];
  }

  async getDmMessages(conversationId: number | string, limit: number = 10): Promise<any[]> {
    // This is a stub - real implementation uses MongoDB
    console.log(`[MEM STORAGE] Stub: Get DM messages for conversation ${conversationId}`);
    return [];
  }

  // Admin operations (stub implementations - MongoDB is used for real admin data)
  async getAdmin(id: number): Promise<Admin | undefined> {
    // This is a stub - real implementation uses MongoDB
    return undefined;
  }

  async getAdminByEmail(email: string): Promise<Admin | undefined> {
    // This is a stub - real implementation uses MongoDB
    return undefined;
  }

  async getAdminByUsername(username: string): Promise<Admin | undefined> {
    // This is a stub - real implementation uses MongoDB
    return undefined;
  }

  async getAllAdmins(): Promise<Admin[]> {
    // This is a stub - real implementation uses MongoDB
    return [];
  }

  async createAdmin(admin: InsertAdmin): Promise<Admin> {
    // This is a stub - real implementation uses MongoDB
    throw new Error("Admin operations require MongoDB");
  }

  async updateAdmin(id: number, updates: Partial<Admin>): Promise<Admin> {
    // This is a stub - real implementation uses MongoDB
    throw new Error("Admin operations require MongoDB");
  }

  async deleteAdmin(id: number): Promise<void> {
    // This is a stub - real implementation uses MongoDB
    throw new Error("Admin operations require MongoDB");
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

  async createNotification(notification: InsertNotification): Promise<Notification> {
    // This is a stub - real implementation uses MongoDB
    throw new Error("Admin operations require MongoDB");
  }

  async getNotifications(userId?: number): Promise<Notification[]> {
    // This is a stub - real implementation uses MongoDB
    return [];
  }

  async updateNotification(id: number, updates: Partial<Notification>): Promise<Notification> {
    // This is a stub - real implementation uses MongoDB
    throw new Error("Admin operations require MongoDB");
  }

  async deleteNotification(id: number): Promise<void> {
    // This is a stub - real implementation uses MongoDB
  }

  async markNotificationRead(id: number): Promise<void> {
    // This is a stub - real implementation uses MongoDB
  }

  async createPopup(popup: InsertPopup): Promise<Popup> {
    // This is a stub - real implementation uses MongoDB
    throw new Error("Admin operations require MongoDB");
  }

  async getActivePopups(): Promise<Popup[]> {
    // This is a stub - real implementation uses MongoDB
    return [];
  }

  async getPopup(id: number): Promise<Popup | undefined> {
    // This is a stub - real implementation uses MongoDB
    return undefined;
  }

  async updatePopup(id: number, updates: Partial<Popup>): Promise<Popup> {
    // This is a stub - real implementation uses MongoDB
    throw new Error("Admin operations require MongoDB");
  }

  async deletePopup(id: number): Promise<void> {
    // This is a stub - real implementation uses MongoDB
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

  async updateAppSetting(key: string, value: string, updatedBy?: number): Promise<AppSetting> {
    // This is a stub - real implementation uses MongoDB
    throw new Error("Admin operations require MongoDB");
  }

  async deleteAppSetting(key: string): Promise<void> {
    // This is a stub - real implementation uses MongoDB
  }

  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    // This is a stub - real implementation uses MongoDB
    throw new Error("Admin operations require MongoDB");
  }

  async getAuditLogs(limit?: number, adminId?: number): Promise<AuditLog[]> {
    // This is a stub - real implementation uses MongoDB
    return [];
  }

  async createFeedbackMessage(feedback: InsertFeedbackMessage): Promise<FeedbackMessage> {
    // This is a stub - real implementation uses MongoDB
    throw new Error("Admin operations require MongoDB");
  }

  async getFeedbackMessages(status?: string): Promise<FeedbackMessage[]> {
    // This is a stub - real implementation uses MongoDB
    return [];
  }

  async updateFeedbackMessage(id: number, updates: Partial<FeedbackMessage>): Promise<FeedbackMessage> {
    // This is a stub - real implementation uses MongoDB
    throw new Error("Admin operations require MongoDB");
  }

  async deleteFeedbackMessage(id: number): Promise<void> {
    // This is a stub - real implementation uses MongoDB
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
  async getAdminUsers(page: number = 1, limit: number = 10, search?: string): Promise<{ users: User[], total: number }> {
    const allUsers = Array.from(this.users.values());
    let filteredUsers = allUsers;
    
    if (search) {
      filteredUsers = allUsers.filter(user => 
        user.username.toLowerCase().includes(search.toLowerCase()) ||
        user.email.toLowerCase().includes(search.toLowerCase()) ||
        (user.displayName && user.displayName.toLowerCase().includes(search.toLowerCase()))
      );
    }
    
    const startIndex = (page - 1) * limit;
    const paginatedUsers = filteredUsers.slice(startIndex, startIndex + limit);
    
    return {
      users: paginatedUsers,
      total: filteredUsers.length
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

  // Thumbnail generation operations (simplified implementations for demo)
  async createThumbnailProject(project: any): Promise<any> {
    const id = Date.now();
    const newProject = { ...project, id, createdAt: new Date(), status: 'processing', stage: 1 };
    // In memory storage - just return the project
    return newProject;
  }

  async getThumbnailProject(id: number): Promise<any> {
    // Simulate completed project
    return {
      id,
      status: 'completed',
      stage: 5,
      createdAt: new Date()
    };
  }

  async updateThumbnailProject(id: number, updates: any): Promise<any> {
    return { id, ...updates };
  }

  async createThumbnailStrategy(strategy: any): Promise<any> {
    return { ...strategy, id: Date.now() };
  }

  async createThumbnailVariant(variant: any): Promise<any> {
    return { ...variant, id: Date.now() };
  }

  async getThumbnailVariants(projectId: number): Promise<any[]> {
    // Return mock variants for demo
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

  async updateCanvasSession(id: number, updates: any): Promise<any> {
    return { id, ...updates };
  }

  async createThumbnailExport(exportData: any): Promise<any> {
    return { ...exportData, id: Date.now(), exportUrl: '/api/placeholder/export.png' };
  }

  async incrementExportDownload(exportId: number): Promise<void> {
    // No-op for memory storage
  }

  // Feature usage tracking methods
  async getFeatureUsage(userId: number | string): Promise<any[]> {
    return [];
  }

  async trackFeatureUsage(userId: number | string, featureId: string, usage: any): Promise<void> {
    // No-op for memory storage
  }

  // VeeGPT Chat operations
  async getChatConversations(userId: number, workspaceId: number): Promise<ChatConversation[]> {
    return Array.from(this.chatConversations.values())
      .filter(conversation => conversation.userId === userId && conversation.workspaceId === workspaceId)
      .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  }

  async getChatConversation(id: number): Promise<ChatConversation | undefined> {
    return this.chatConversations.get(id);
  }

  async createChatConversation(conversation: InsertChatConversation): Promise<ChatConversation> {
    const id = this.currentChatConversationId++;
    const newConversation: ChatConversation = {
      ...conversation,
      id,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.chatConversations.set(id, newConversation);
    return newConversation;
  }

  async updateChatConversation(id: number, updates: Partial<ChatConversation>): Promise<ChatConversation> {
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

  async deleteChatConversation(id: number): Promise<void> {
    this.chatConversations.delete(id);
    // Also delete all messages in this conversation
    const messagesToDelete = Array.from(this.chatMessages.entries())
      .filter(([_, message]) => message.conversationId === id)
      .map(([messageId, _]) => messageId);
    
    messagesToDelete.forEach(messageId => {
      this.chatMessages.delete(messageId);
    });
  }

  async getChatMessages(conversationId: number): Promise<ChatMessage[]> {
    return Array.from(this.chatMessages.values())
      .filter(message => message.conversationId === conversationId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const id = this.currentChatMessageId++;
    const newMessage: ChatMessage = {
      ...message,
      id,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.chatMessages.set(id, newMessage);
    return newMessage;
  }

  async updateChatMessage(id: number, updates: Partial<ChatMessage>): Promise<ChatMessage> {
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

  async getChatMessage(id: number): Promise<ChatMessage | undefined> {
    return this.chatMessages.get(id);
  }
}

import { MongoStorage } from './mongodb-storage';

// Use MongoDB Atlas if connection string is available, otherwise fallback to memory storage
export const storage = (process.env.MONGODB_URI || process.env.DATABASE_URL) ? new MongoStorage() : new MemStorage();
