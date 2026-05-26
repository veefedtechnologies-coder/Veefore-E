import mongoose from "mongoose";
import { ObjectId } from "mongodb";
import { IStorage } from "./storage";
import {
  User, Workspace, SocialAccount, Content, Analytics, AutomationRule,
  Suggestion, CreditTransaction, Referral, Subscription, Payment, Addon,
  WorkspaceMember, TeamInvitation, ContentRecommendation, UserContentHistory,
  Admin, AdminSession, Notification, Popup, AppSetting, AuditLog, FeedbackMessage,
  CreativeBrief, ContentRepurpose, CompetitorAnalysis,
  DmConversation, InsertDmConversation, DmMessage, InsertDmMessage,
  ConversationContext, InsertConversationContext,
  ThumbnailProject, InsertThumbnailProject,
  ThumbnailStrategy, InsertThumbnailStrategy,
  ThumbnailVariant, InsertThumbnailVariant,
  CanvasEditorSession, InsertCanvasEditorSession,
  ThumbnailExport, InsertThumbnailExport,
  ChatConversation, InsertChatConversation, ChatMessage, InsertChatMessage,
  InsertUser, InsertWorkspace, InsertSocialAccount, InsertContent,
  InsertAutomationRule, InsertAnalytics, InsertSuggestion,
  InsertCreditTransaction, InsertReferral, InsertSubscription, InsertPayment, InsertAddon,
  InsertWorkspaceMember, InsertTeamInvitation, InsertContentRecommendation, InsertUserContentHistory,
  InsertAdmin, InsertAdminSession, InsertNotification, InsertPopup, InsertAppSetting, InsertAuditLog, InsertFeedbackMessage,
  InsertCreativeBrief, InsertContentRepurpose, InsertCompetitorAnalysis,
  WaitlistUser, InsertWaitlistUser
} from "./domain/types";
import {
  convertUser,
  convertWorkspace,
  convertAnalytics,
  convertContent,
  convertSocialAccount,
  convertCreditTransaction,
  convertSubscription,
  convertPayment,
  convertSuggestion,
  convertAddon,
  convertWorkspaceMember,
  convertTeamInvitation,
  convertContentRecommendation,
  convertUserContentHistory,
  convertDmConversation,
  convertDmMessage,
  convertAdmin,
  convertAdminSession,
  convertNotification,
  convertPopup,
  convertAppSetting,
  convertAuditLog,
  convertFeedbackMessage,
  convertCreativeBrief,
  convertConversationContext,
  convertContentRepurpose,
  convertCompetitorAnalysis,
  convertWaitlistUser,
  generateReferralCode,
  convertChatConversation,
  convertChatMessage,
  convertSocialAccountWithDecryptedTokens
} from './storage/converters';

import { connectionManager } from './infrastructure/mongodb-connection';

import { userRepository } from './repositories/UserRepository';
import { workspaceRepository } from './repositories/WorkspaceRepository';
import { socialAccountRepository } from './repositories/SocialAccountRepository';
import { contentRepository } from './repositories/ContentRepository';
import { analyticsRepository } from './repositories/AnalyticsRepository';
import {
  creditTransactionRepository,
  paymentRepository,
  subscriptionRepository,
  addonRepository,
} from './repositories/BillingRepository';
import {
  automationRuleRepository,
  dmConversationRepository,
  dmMessageRepository,
  conversationContextRepository,
} from './repositories/AutomationRepository';
import { workspaceMemberRepository } from './repositories/WorkspaceMemberRepository';
import { teamInvitationRepository } from './repositories/TeamInvitationRepository';
import { suggestionRepository } from './repositories/SuggestionRepository';
import { contentRecommendationRepository } from './repositories/ContentRecommendationRepository';
import { userContentHistoryRepository } from './repositories/UserContentHistoryRepository';
import {
  adminRepository,
  adminSessionRepository,
  notificationRepository,
  popupRepository,
  appSettingRepository,
  auditLogRepository,
  feedbackMessageRepository,
} from './repositories/AdminRepository';
import {
  creativeBriefRepository,
  contentRepurposeRepository,
  competitorAnalysisRepository,
  featureUsageRepository,
} from './repositories/AIRepository';
import {
  chatConversationRepository,
  chatMessageRepository,
} from './repositories/ChatRepository';
import { waitlistUserRepository } from './repositories/WaitlistUserRepository';
import {
  thumbnailProjectRepository,
  thumbnailStrategyRepository,
  thumbnailVariantRepository,
  canvasEditorSessionRepository,
  thumbnailExportRepository,
} from './repositories/ThumbnailRepository';
import { SUBSCRIPTION_PLANS, CREDIT_PACKAGES, ADDONS } from './pricing-config';

export class MongoStorage implements IStorage {
  getConnectionMetrics() {
    return connectionManager.getConnectionMetrics();
  }

  async connect(): Promise<void> {
    return connectionManager.connect();
  }

  // User operations - delegating to userRepository
  async getUser(id: string): Promise<User | undefined> {
    await connectionManager.ensureConnected();
    const user = await userRepository.findById(id);
    return user ? convertUser(user) : undefined;
  }

  async getUserByFirebaseUid(firebaseUid: string): Promise<User | undefined> {
    await connectionManager.ensureConnected();
    const user = await userRepository.findByFirebaseUid(firebaseUid);
    return user ? convertUser(user) : undefined;
  }

  async getUserByFirebaseId(firebaseId: string): Promise<User | undefined> {
    await connectionManager.ensureConnected();
    const user = await userRepository.findByFirebaseUid(firebaseId);
    return user ? convertUser(user) : undefined;
  }

  async updateUserLastLogin(firebaseId: string): Promise<void> {
    await connectionManager.ensureConnected();
    const user = await userRepository.findByFirebaseUid(firebaseId);
    if (user) {
      await userRepository.updateById((user as any)._id.toString(), { lastLoginAt: new Date() });
    }
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    await connectionManager.ensureConnected();
    const user = await userRepository.findByEmail(email);
    return user ? convertUser(user) : undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    await connectionManager.ensureConnected();
    const user = await userRepository.findByUsername(username);
    return user ? convertUser(user) : undefined;
  }

  async getUserByReferralCode(referralCode: string): Promise<User | undefined> {
    await connectionManager.ensureConnected();
    const user = await userRepository.findByReferralCode(referralCode);
    return user ? convertUser(user) : undefined;
  }

  async createUser(userData: InsertUser): Promise<User> {
    await connectionManager.ensureConnected();
    const savedUser = await userRepository.createWithDefaultWorkspace(userData as any);
    return convertUser(savedUser);
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    await connectionManager.ensureConnected();
    const updated = await userRepository.updateById(id, updates);
    if (!updated) throw new Error("User not found");
    return convertUser(updated);
  }

  async updateUserCredits(id: string, credits: number): Promise<User> {
    return this.updateUser(id, { credits });
  }

  async getUserCredits(userId: string): Promise<number> {
    const user = await this.getUser(userId);
    return user ? user.credits : 0;
  }

  async updateUserStripeInfo(id: string, stripeCustomerId: string, stripeSubscriptionId?: string): Promise<User> {
    return this.updateUser(id, { stripeCustomerId, stripeSubscriptionId });
  }

  async hasClaimedWelcomeBonus(userId: string): Promise<boolean> {
    await connectionManager.ensureConnected();
    const user = await userRepository.findById(userId);
    return user ? !!(user as any).hasClaimedWelcomeBonus : false;
  }

  async claimWelcomeBonus(userId: string): Promise<void> {
    await connectionManager.ensureConnected();
    await userRepository.updateById(userId, {
      hasClaimedWelcomeBonus: true,
      welcomeBonusClaimedAt: new Date()
    } as any);
  }

  // Workspace operations - delegating to workspaceRepository
  async getWorkspace(id: string): Promise<Workspace | undefined> {
    await connectionManager.ensureConnected();
    if (!ObjectId.isValid(id)) {
      return undefined;
    }
    const workspace = await workspaceRepository.findById(id);
    return workspace ? convertWorkspace(workspace) : undefined;
  }

  async getWorkspacesByUserId(userId: string): Promise<Workspace[]> {
    await connectionManager.ensureConnected();
    const query = mongoose.Types.ObjectId.isValid(userId)
      ? { $or: [{ userId: userId }, { userId: new mongoose.Types.ObjectId(userId) }] }
      : { userId: userId };
    const result = await workspaceMemberRepository.findMany(query as any);
    const memberships = result.data || [];
    console.log(`[DEBUG] getWorkspacesByUserId: Found ${memberships.length} memberships for user ${userId}`);

    const memberWorkspaceIds = memberships.map((m: any) => m.workspaceId.toString());

    // ALSO fetch workspaces owned by the user directly (fallback/implicit membership)
    let ownedWorkspaces: any[] = [];
    try {
      const ownedResult = await workspaceRepository.findMany(query as any); // Use same query as it checks both string/ObjectId
      ownedWorkspaces = ownedResult.data || [];
      console.log(`[DEBUG] getWorkspacesByUserId: Found ${ownedWorkspaces.length} owned workspaces directly`);
    } catch (err) {
      console.error(`[DEBUG] Failed to fetch owned workspaces:`, err);
    }

    const ownedWorkspaceIds = ownedWorkspaces.map((w: any) => w._id.toString());

    // Combine IDs
    const allWorkspaceIds = [...new Set([...memberWorkspaceIds, ...ownedWorkspaceIds])];
    console.log(`[DEBUG] getWorkspacesByUserId: Combined WorkspaceIDs: ${allWorkspaceIds.join(', ')}`);

    // Manual findByIds implementation since repo lacks it - Optimized with Promise.allSettled
    const workspacePromises = allWorkspaceIds.map(async (id: string) => {
      if (!ObjectId.isValid(id)) return null;
      try {
        return await workspaceRepository.findById(id);
      } catch (err) {
        console.error(`Failed to fetch workspace ${id} for user ${userId}:`, err);
        return null;
      }
    });

    const results = await Promise.all(workspacePromises);
    const workspaces = results.filter((w: any) => w !== null);

    console.log(`[DEBUG] getWorkspacesByUserId: Resolved ${workspaces.length} valid workspaces`);

    return workspaces.map(convertWorkspace);
  }

  async getDefaultWorkspace(userId: string): Promise<Workspace | undefined> {
    await connectionManager.ensureConnected();

    // Try to find default workspace first
    let workspace = await workspaceRepository.findDefaultByUserId(userId);

    // If no default workspace, get the first workspace for this user
    if (!workspace) {
      const workspaces = await workspaceRepository.findByUserId(userId);
      workspace = workspaces.length > 0 ? workspaces[0] : null;
    }

    return workspace ? convertWorkspace(workspace) : undefined;
  }

  async createWorkspace(workspace: InsertWorkspace): Promise<Workspace> {
    await connectionManager.ensureConnected();
    const newWorkspace = await workspaceRepository.createWithDefaults(workspace);
    return convertWorkspace(newWorkspace);
  }

  async updateWorkspace(id: string, updates: Partial<Workspace>): Promise<Workspace> {
    await connectionManager.ensureConnected();
    const updated = await workspaceRepository.updateById(id, updates);
    if (!updated) throw new Error("Workspace not found");
    return convertWorkspace(updated);
  }

  async updateWorkspaceCredits(id: string, credits: number): Promise<void> {
    await connectionManager.ensureConnected();
    const result = await workspaceRepository.updateById(id, { credits });
    if (!result) {
      throw new Error('Workspace not found for credit update');
    }
  }

  async deleteWorkspace(id: string): Promise<void> {
    await connectionManager.ensureConnected();
    const ws = await workspaceRepository.findById(id);
    if (!ws) throw new Error('Workspace not found');
    if (ws.isDefault === true) {
      throw new Error('Default workspace cannot be deleted');
    }
    await workspaceRepository.deleteById(id);
  }

  async setDefaultWorkspace(userId: string, workspaceId: string): Promise<void> {
    await connectionManager.ensureConnected();
    await workspaceRepository.unsetDefaultForUser(userId);
    await workspaceRepository.updateById(workspaceId, { isDefault: true });
  }



  // Social account operations - delegating to socialAccountRepository
  async getSocialAccount(id: string): Promise<SocialAccount | undefined> {
    await connectionManager.ensureConnected();
    const account = await socialAccountRepository.findById(id);
    return account ? convertSocialAccount(account) : undefined;
  }

  async getSocialAccountByWorkspaceAndPlatform(workspaceId: string, platform: string): Promise<SocialAccount | undefined> {
    await connectionManager.ensureConnected();
    const account = await socialAccountRepository.findByWorkspaceAndPlatform(workspaceId, platform as any);
    return account ? convertSocialAccount(account) : undefined;
  }

  async getSocialAccountsByWorkspace(workspaceId: string): Promise<SocialAccount[]> {
    await connectionManager.ensureConnected();
    const accounts = await socialAccountRepository.findByWorkspaceWithTolerantLookup(workspaceId);
    return accounts.map(convertSocialAccount);
  }

  /**
   * INTERNAL USE ONLY: Get social accounts with decrypted tokens
   * This method exposes actual tokens and should ONLY be used by internal services
   * like auto-sync, NOT for API responses to clients
   */
  async getSocialAccountsWithTokensInternal(workspaceId: string): Promise<SocialAccount[]> {
    await connectionManager.ensureConnected();
    const accounts = await socialAccountRepository.findByWorkspaceId(workspaceId);
    return accounts.map(convertSocialAccountWithDecryptedTokens);
  }

  async getAllSocialAccounts(): Promise<SocialAccount[]> {
    await connectionManager.ensureConnected();
    const accounts = await socialAccountRepository.findAll();
    return accounts.map(convertSocialAccount);
  }

  async getSocialAccountByPlatform(workspaceId: string, platform: string): Promise<SocialAccount | undefined> {
    await connectionManager.ensureConnected();
    const account = await socialAccountRepository.findByWorkspaceAndPlatform(workspaceId, platform as any);
    return account ? convertSocialAccount(account) : undefined;
  }

  async getSocialAccountByPageId(pageId: string): Promise<SocialAccount | undefined> {
    await connectionManager.ensureConnected();
    const account = await socialAccountRepository.findByPageIdOrAccountId(pageId);
    return account ? convertSocialAccount(account) : undefined;
  }

  async getSocialConnections(userId: string): Promise<SocialAccount[]> {
    await connectionManager.ensureConnected();
    const userWorkspaces = await this.getWorkspacesByUserId(userId);
    const workspaceIds = userWorkspaces.map(w => w.id);
    const accounts = await socialAccountRepository.findByWorkspaceIds(workspaceIds);
    return accounts.map(convertSocialAccount);
  }

  async createSocialAccount(account: InsertSocialAccount): Promise<SocialAccount> {
    await connectionManager.ensureConnected();
    const newAccount = await socialAccountRepository.createWithEncryptedTokens(account as any);
    return convertSocialAccount(newAccount);
  }

  async updateSocialAccount(id: string, updates: Partial<SocialAccount>): Promise<SocialAccount> {
    await connectionManager.ensureConnected();
    const updatedAccount = await socialAccountRepository.updateWithEncryptedTokens(id, updates as any);
    return convertSocialAccount(updatedAccount);
  }

  async deleteSocialAccount(id: string): Promise<void> {
    await connectionManager.ensureConnected();
    const deleted = await socialAccountRepository.deleteById(id);
    if (!deleted) {
      throw new Error(`Social account with id ${id} not found`);
    }
  }

  async updateYouTubePlatformData(workspaceId: string, data: any): Promise<void> {
    await connectionManager.ensureConnected();
    const accounts = await socialAccountRepository.findByWorkspaceId(workspaceId);
    const youtubeAccount = accounts.find((acc: any) => acc.platform === 'youtube');
    if (youtubeAccount) {
      await socialAccountRepository.updateById((youtubeAccount as any)._id.toString(), {
        ...data,
        updatedAt: new Date()
      });
    }
  }

  // Content operations - delegating to contentRepository
  async getContent(id: string): Promise<Content | undefined> {
    await connectionManager.ensureConnected();
    const content = await contentRepository.findById(id);
    return content ? convertContent(content) : undefined;
  }

  async getContentByWorkspace(workspaceId: string, limit?: number): Promise<Content[]> {
    await connectionManager.ensureConnected();
    const result = await contentRepository.findByWorkspaceId(workspaceId, { limit });
    const items = Array.isArray(result) ? result : (result as any).items || (result as any).data || [];
    return items.map(convertContent);
  }

  async getScheduledContent(workspaceId?: string): Promise<Content[]> {
    await connectionManager.ensureConnected();
    const contents = await contentRepository.findScheduledContent(workspaceId);
    return contents.map(convertContent);
  }

  async createContent(content: InsertContent): Promise<Content> {
    await connectionManager.ensureConnected();
    const saved = await contentRepository.createWithDefaults(content);
    return convertContent(saved);
  }

  async updateContent(id: string, updates: Partial<Content>): Promise<Content> {
    await connectionManager.ensureConnected();
    const updated = await contentRepository.updateById(id, updates);
    if (!updated) throw new Error("Content not found");
    return convertContent(updated);
  }

  async deleteContent(id: string): Promise<void> {
    await connectionManager.ensureConnected();
    const deleted = await contentRepository.deleteById(id);
    if (!deleted) throw new Error(`Content with id ${id} not found`);
  }

  async createPost(postData: any): Promise<any> {
    await connectionManager.ensureConnected();
    const saved = await contentRepository.createPostWithDefaults(postData);
    return {
      ...convertContent(saved),
      content: (saved as any).content,
      media: (saved as any).media || [],
      hashtags: (saved as any).hashtags || '',
      firstComment: (saved as any).firstComment || '',
      location: (saved as any).location || '',
      accounts: (saved as any).accounts || [],
      status: (saved as any).status || 'draft',
      publishedAt: (saved as any).publishedAt,
    };
  }

  // Analytics operations - delegating to analyticsRepository
  async getAnalytics(workspaceId: string, platform?: string, days?: number): Promise<Analytics[]> {
    await connectionManager.ensureConnected();
    const analyticsData = await analyticsRepository.findByWorkspaceWithDaysFilter(workspaceId, platform, days);
    return analyticsData.map(convertAnalytics);
  }

  async createAnalytics(analytics: InsertAnalytics): Promise<Analytics> {
    await connectionManager.ensureConnected();
    const analyticsDoc = await analyticsRepository.createWithDefaults(analytics);
    return convertAnalytics(analyticsDoc);
  }

  async updateAnalytics(id: string, updates: Partial<Analytics>): Promise<Analytics> {
    await connectionManager.ensureConnected();
    const updated = await analyticsRepository.updateById(id, updates);
    if (!updated) throw new Error(`Analytics record with id ${id} not found`);
    return convertAnalytics(updated);
  }

  async getLatestAnalytics(workspaceId: string, platform: string): Promise<Analytics | undefined> {
    await connectionManager.ensureConnected();
    const analytics = await analyticsRepository.findLatestByPlatform(workspaceId, platform);
    return analytics ? convertAnalytics(analytics) : undefined;
  }

  // Automation rules
  async getAutomationRule(id: string): Promise<AutomationRule | undefined> {
    await connectionManager.ensureConnected();
    const rule = await automationRuleRepository.findById(id);
    return rule ? automationRuleRepository.formatAutomationRule(rule) as any : undefined;
  }

  async getAutomationRules(workspaceId: string): Promise<AutomationRule[]> {
    await connectionManager.ensureConnected();
    const rules = await automationRuleRepository.findByWorkspaceIdFormatted(workspaceId);
    return rules as any;
  }

  async getActiveAutomationRules(): Promise<AutomationRule[]> {
    await connectionManager.ensureConnected();
    const rules = await automationRuleRepository.findActiveRulesFormatted();
    return rules as any;
  }

  async getAutomationRulesByType(type: string): Promise<AutomationRule[]> {
    await connectionManager.ensureConnected();
    const rules = await automationRuleRepository.findByTypeFormatted(type);
    return rules as any;
  }

  async createAutomationRule(rule: InsertAutomationRule): Promise<AutomationRule> {
    await connectionManager.ensureConnected();
    return automationRuleRepository.createWithDefaults(rule) as any;
  }

  async updateAutomationRule(id: string, updates: Partial<AutomationRule>): Promise<AutomationRule> {
    await connectionManager.ensureConnected();
    return automationRuleRepository.updateWithCleanup(id, updates) as any;
  }

  async deleteAutomationRule(id: string): Promise<void> {
    await connectionManager.ensureConnected();
    const deleted = await automationRuleRepository.deleteById(id);
    if (!deleted) throw new Error('Automation rule not found');
  }

  // Conversation Management Methods



  async clearWorkspaceConversations(workspaceId: string): Promise<void> {
    await connectionManager.ensureConnected();
    await dmConversationRepository.clearWorkspaceData(workspaceId);
  }

  async getSuggestions(workspaceId: string, type?: string): Promise<Suggestion[]> {
    await connectionManager.ensureConnected();

    const suggestionsRaw = await suggestionRepository.findByWorkspaceId(workspaceId);
    const suggestions = Array.isArray(suggestionsRaw) ? suggestionsRaw : (suggestionsRaw as any).items || (suggestionsRaw as any).data || [];

    const filtered = type ? suggestions.filter((s: any) => s.type === type) : suggestions;

    return filtered.map((doc: any) => convertSuggestion(doc));
  }

  async getValidSuggestions(workspaceId: string): Promise<Suggestion[]> {
    await connectionManager.ensureConnected();
    const suggestions = await suggestionRepository.findValidByWorkspace(workspaceId);
    return suggestions.map(doc => convertSuggestion(doc));
  }

  async createSuggestion(suggestion: InsertSuggestion): Promise<Suggestion> {
    await connectionManager.ensureConnected();
    const saved = await suggestionRepository.createWithDefaults(suggestion);
    return convertSuggestion(saved);
  }

  async markSuggestionUsed(id: string): Promise<Suggestion> {
    await connectionManager.ensureConnected();

    const updated = await suggestionRepository.markAsUsed(id);

    if (!updated) {
      throw new Error('Suggestion not found');
    }

    return convertSuggestion(updated);
  }

  async clearSuggestionsByWorkspace(workspaceId: string): Promise<void> {
    await connectionManager.ensureConnected();

    await suggestionRepository.deleteMany({ workspaceId });
  }

  async getCreditTransactions(userId: string, limit = 50): Promise<CreditTransaction[]> {
    await connectionManager.ensureConnected();

    try {
      const transactions = await creditTransactionRepository.getRecentTransactions(userId, limit);
      return transactions.map(transaction => convertCreditTransaction(transaction));
    } catch (error) {
      return [];
    }
  }

  async createCreditTransaction(transaction: InsertCreditTransaction): Promise<CreditTransaction> {
    await connectionManager.ensureConnected();
    const created = await creditTransactionRepository.createWithDefaults(transaction);
    return convertCreditTransaction(created);
  }

  async getReferrals(referrerId: string): Promise<Referral[]> {
    return [];
  }

  async getReferralStats(userId: string): Promise<{ totalReferrals: number; activePaid: number; totalEarned: number }> {
    return { totalReferrals: 0, activePaid: 0, totalEarned: 0 };
  }

  async createReferral(referral: InsertReferral): Promise<Referral> {
    throw new Error('Not implemented');
  }

  async confirmReferral(id: string): Promise<Referral> {
    throw new Error('Not implemented');
  }

  async getLeaderboard(limit?: number): Promise<Array<User & { referralCount: number }>> {
    return [];
  }

  // Subscription operations - delegating to subscriptionRepository
  async getSubscription(userId: string): Promise<Subscription | undefined> {
    await connectionManager.ensureConnected();
    const subscription = await subscriptionRepository.findByUserId(userId);
    return subscription ? convertSubscription(subscription) : undefined;
  }

  async createSubscription(insertSubscription: InsertSubscription): Promise<Subscription> {
    await connectionManager.ensureConnected();
    const subscription = await subscriptionRepository.create(insertSubscription);
    return convertSubscription(subscription);
  }

  async updateSubscriptionStatus(userId: string, status: string, canceledAt?: Date): Promise<Subscription> {
    await connectionManager.ensureConnected();
    const subscription = await subscriptionRepository.updateOne(
      { userId },
      { status, canceledAt }
    );
    if (!subscription) throw new Error('Subscription not found');
    return convertSubscription(subscription);
  }

  async getActiveSubscription(userId: string): Promise<Subscription | undefined> {
    await connectionManager.ensureConnected();
    const subscription = await subscriptionRepository.findActiveByUserId(userId);
    return subscription ? convertSubscription(subscription) : undefined;
  }

  // Payment operations - delegating to paymentRepository
  async createPayment(insertPayment: InsertPayment): Promise<Payment> {
    await connectionManager.ensureConnected();
    const payment = await paymentRepository.create(insertPayment);
    return convertPayment(payment);
  }

  async getPaymentsByUser(userId: string): Promise<Payment[]> {
    await connectionManager.ensureConnected();
    const result = await paymentRepository.findByUserId(userId);
    return result.data.map(payment => convertPayment(payment));
  }

  // Addon operations - delegating to addonRepository
  async getUserAddons(userId: string): Promise<Addon[]> {
    await connectionManager.ensureConnected();
    const addons = await addonRepository.findActiveByUserId(userId);
    return addons.map(addon => convertAddon(addon));
  }

  async getActiveAddonsByUser(userId: string): Promise<Addon[]> {
    await connectionManager.ensureConnected();

    const addons = await addonRepository.findActiveByUserId(userId);

    return addons.map(addon => convertAddon(addon));
  }

  async createAddon(insertAddon: InsertAddon): Promise<Addon> {
    await connectionManager.ensureConnected();
    const savedAddon = await addonRepository.createWithDefaults(insertAddon);
    return convertAddon(savedAddon);
  }

  async getSuggestionsByWorkspace(workspaceId: string): Promise<Suggestion[]> {
    await connectionManager.ensureConnected();
    const result = await suggestionRepository.findByWorkspaceId(
      workspaceId,
      { sortBy: 'createdAt', sortOrder: 'desc' }
    );
    const suggestions = Array.isArray(result) ? result : (result as any).items || (result as any).data || [];
    return suggestions.map((doc: any) => convertSuggestion(doc));
  }

  async getAnalyticsByWorkspace(workspaceId: string): Promise<Analytics[]> {
    await connectionManager.ensureConnected();
    const result = await analyticsRepository.findByWorkspaceId(workspaceId);
    const analytics = Array.isArray(result) ? result : (result as any).items || (result as any).data || [];
    return analytics.map(convertAnalytics);
  }

  // Team management operations
  async getWorkspaceByInviteCode(inviteCode: string): Promise<Workspace | undefined> {
    await connectionManager.ensureConnected();
    const workspace = await workspaceRepository.findByInviteCode(inviteCode);
    return workspace ? convertWorkspace(workspace) : undefined;
  }

  async getWorkspaceMember(workspaceId: string, userId: string): Promise<WorkspaceMember | undefined> {
    await connectionManager.ensureConnected();
    const member = await workspaceMemberRepository.findByWorkspaceAndUser(
      workspaceId,
      userId
    );
    return member ? convertWorkspaceMember(member) : undefined;
  }

  async getWorkspaceMembers(workspaceId: string): Promise<(WorkspaceMember & { user: User })[]> {
    await connectionManager.ensureConnected();
    const membersWithUsers = await workspaceMemberRepository.getMembersWithOwnerFallback(workspaceId);

    if (membersWithUsers.length > 0) {
      return membersWithUsers.map(({ member, user }) => ({
        ...convertWorkspaceMember(member),
        user: convertUser(user!)
      }));
    }

    const fallback = await workspaceMemberRepository.getOwnerAsFallbackMember(workspaceId);
    return fallback ? [{ ...fallback, user: convertUser(fallback.user) } as any as WorkspaceMember & { user: User }] : [];
  }

  async addWorkspaceMember(member: InsertWorkspaceMember): Promise<WorkspaceMember> {
    await connectionManager.ensureConnected();
    const newMember = await workspaceMemberRepository.createWithDefaults(member as any);
    return convertWorkspaceMember(newMember);
  }

  async updateWorkspaceMember(workspaceId: string, userId: string, updates: Partial<WorkspaceMember>): Promise<WorkspaceMember> {
    await connectionManager.ensureConnected();
    const updatedMember = await workspaceMemberRepository.updateByWorkspaceAndUser(workspaceId, userId, updates as any);
    if (!updatedMember) throw new Error(`Workspace member not found`);
    return convertWorkspaceMember(updatedMember);
  }

  async removeWorkspaceMember(workspaceId: string, userId: string): Promise<void> {
    await connectionManager.ensureConnected();
    const member = await workspaceMemberRepository.findByWorkspaceAndUser(
      workspaceId,
      userId
    );
    if (member) {
      await workspaceMemberRepository.deleteById((member as any)._id.toString());
    }
  }

  async createTeamInvitation(invitation: InsertTeamInvitation): Promise<TeamInvitation> {
    await connectionManager.ensureConnected();
    const newInvitation = await teamInvitationRepository.createWithDefaults(invitation as any);
    return convertTeamInvitation(newInvitation);
  }

  async getWorkspaceInvitations(workspaceId: string): Promise<TeamInvitation[]> {
    await connectionManager.ensureConnected();
    const result = await teamInvitationRepository.findPendingByWorkspace(
      workspaceId,
      { sortBy: 'createdAt', sortOrder: 'desc' }
    );
    const invitations = Array.isArray(result) ? result : (result as any).items || (result as any).data || [];
    return invitations.map((doc: any) => convertTeamInvitation(doc));
  }

  async getTeamInvitation(id: string): Promise<TeamInvitation | undefined> {
    await connectionManager.ensureConnected();
    const invitation = await teamInvitationRepository.findById(id);
    return invitation ? convertTeamInvitation(invitation) : undefined;
  }

  async getTeamInvitationByToken(token: string): Promise<TeamInvitation | undefined> {
    await connectionManager.ensureConnected();
    const invitation = await teamInvitationRepository.findByToken(token);
    return invitation ? convertTeamInvitation(invitation) : undefined;
  }

  async getTeamInvitations(workspaceId: string, status?: string): Promise<TeamInvitation[]> {
    await connectionManager.ensureConnected();
    const options = { sortBy: 'createdAt' as const, sortOrder: 'desc' as const };
    let invitations;
    if (status) {
      invitations = await teamInvitationRepository.findMany(
        { workspaceId, status },
        options
      );
    } else {
      invitations = await teamInvitationRepository.findByWorkspaceId(
        workspaceId,
        options
      );
    }
    const items = Array.isArray(invitations) ? invitations : (invitations as any).items || (invitations as any).data || [];
    return items.map(convertTeamInvitation);
  }

  async updateTeamInvitation(id: string, updates: Partial<TeamInvitation>): Promise<TeamInvitation> {
    await connectionManager.ensureConnected();
    const updatedInvitation = await teamInvitationRepository.updateById(id, updates);
    if (!updatedInvitation) {
      throw new Error(`Team invitation with id ${id} not found`);
    }
    return convertTeamInvitation(updatedInvitation);
  }

  // Content recommendation operations
  async getContentRecommendation(id: string): Promise<ContentRecommendation | undefined> {
    await connectionManager.ensureConnected();
    const recommendation = await contentRecommendationRepository.findById(id);
    return recommendation ? convertContentRecommendation(recommendation) : undefined;
  }

  async getContentRecommendations(workspaceId: string, type?: string, limit?: number): Promise<ContentRecommendation[]> {
    await connectionManager.ensureConnected();
    const options: { sortBy: 'createdAt'; sortOrder: 'desc'; limit?: number } = { sortBy: 'createdAt', sortOrder: 'desc' };
    if (limit) options.limit = limit;

    let recommendations;
    if (type) {
      recommendations = await contentRecommendationRepository.findMany(
        { workspaceId, isActive: true, type },
        options
      );
    } else {
      recommendations = await contentRecommendationRepository.findActiveByWorkspace(
        workspaceId,
        options
      );
    }
    const items = Array.isArray(recommendations) ? recommendations : (recommendations as any).items || (recommendations as any).data || [];
    return items.map((rec: any) => convertContentRecommendation(rec));
  }

  async createContentRecommendation(insertRecommendation: InsertContentRecommendation): Promise<ContentRecommendation> {
    await connectionManager.ensureConnected();
    const saved = await contentRecommendationRepository.createWithDefaults(insertRecommendation);
    return convertContentRecommendation(saved);
  }

  async updateContentRecommendation(id: string, updates: Partial<ContentRecommendation>): Promise<ContentRecommendation> {
    await connectionManager.ensureConnected();
    const updated = await contentRecommendationRepository.updateById(id, updates);
    if (!updated) throw new Error(`Content recommendation ${id} not found`);
    return convertContentRecommendation(updated);
  }

  async deleteContentRecommendation(id: string): Promise<void> {
    await connectionManager.ensureConnected();
    const deleted = await contentRecommendationRepository.deleteById(id);
    if (!deleted) throw new Error(`Content recommendation ${id} not found`);
  }

  async getUserContentHistory(userId: string, workspaceId: string): Promise<UserContentHistory[]> {
    await connectionManager.ensureConnected();
    const result = await userContentHistoryRepository.findMany(
      { userId, workspaceId },
      { sortBy: 'createdAt', sortOrder: 'desc' }
    );
    const history = Array.isArray(result) ? result : (result as any).items || (result as any).data || [];
    return history.map((h: any) => convertUserContentHistory(h));
  }

  async createUserContentHistory(insertHistory: InsertUserContentHistory): Promise<UserContentHistory> {
    await connectionManager.ensureConnected();
    const saved = await userContentHistoryRepository.createWithDefaults(insertHistory);
    return convertUserContentHistory(saved);
  }

  // Pricing and plan operations - delegating to pricing-config module
  async getPricingData(): Promise<any> {
    return {
      plans: SUBSCRIPTION_PLANS,
      creditPackages: CREDIT_PACKAGES,
      addons: ADDONS
    };
  }

  async updateUserSubscription(userId: string, planId: string): Promise<User> {
    await connectionManager.ensureConnected();
    const plan = SUBSCRIPTION_PLANS[planId as keyof typeof SUBSCRIPTION_PLANS];
    if (!plan) throw new Error(`Invalid plan ID: ${planId}`);

    const updatedUser = await userRepository.updateSubscription(userId, planId, plan.credits);
    if (!updatedUser) throw new Error(`User with id ${userId} not found or failed to update subscription`);
    return convertUser(updatedUser);
  }

  async addCreditsToUser(userId: string, credits: number): Promise<User> {
    await connectionManager.ensureConnected();
    const updatedUser = await userRepository.addCreditsAtomic(userId, credits);
    if (!updatedUser) throw new Error(`User with id ${userId} not found or failed to update credits`);
    return convertUser(updatedUser);
  }

  // DM Conversation Memory Methods - delegating to dmConversationRepository and dmMessageRepository
  async getDmConversation(workspaceId: string, platform: string, participantId: string): Promise<DmConversation | null> {
    await connectionManager.ensureConnected();
    const conversation = await dmConversationRepository.findByWorkspaceAndParticipant(workspaceId, participantId);
    return conversation ? convertDmConversation(conversation) : null;
  }

  async createDmConversation(data: InsertDmConversation): Promise<DmConversation> {
    await connectionManager.ensureConnected();
    const conversation = await dmConversationRepository.create(data);
    return convertDmConversation(conversation);
  }

  async createDmMessage(data: InsertDmMessage): Promise<DmMessage> {
    await connectionManager.ensureConnected();
    const message = await dmMessageRepository.create(data as any);
    return convertDmMessage(message);
  }

  async updateConversationLastMessage(conversationId: string): Promise<void> {
    await connectionManager.ensureConnected();
    await dmConversationRepository.incrementMessageCount(conversationId);
  }

  async getDmMessages(conversationId: string, limit: number = 10): Promise<DmMessage[]> {
    await connectionManager.ensureConnected();
    const messages = await dmMessageRepository.findMessagesForConversation(conversationId, limit);
    return messages.map((m: any) => convertDmMessage(m));
  }

  async getConversationContext(conversationId: string): Promise<ConversationContext[]> {
    await connectionManager.ensureConnected();
    const contexts = await conversationContextRepository.findActiveContexts(conversationId);
    return contexts.map(convertConversationContext);
  }

  async createConversationContext(data: any): Promise<any> {
    await connectionManager.ensureConnected();
    const saved = await conversationContextRepository.create(data);
    return convertConversationContext(saved);
  }

  async cleanupExpiredContext(cutoffDate: Date): Promise<void> {
    await connectionManager.ensureConnected();
    await conversationContextRepository.deleteMany({
      expiresAt: { $lt: cutoffDate }
    });
  }

  async cleanupOldMessages(cutoffDate: Date): Promise<void> {
    await connectionManager.ensureConnected();
    await dmMessageRepository.cleanupOldMessages(cutoffDate);
  }

  async getConversationStats(workspaceId: string): Promise<{
    totalConversations: number;
    activeConversations: number;
    totalMessages: number;
    averageResponseTime: number;
  }> {
    await connectionManager.ensureConnected();
    return dmConversationRepository.getStats(workspaceId);
  }

  async getDmConversations(workspaceId: string, limit: number = 50): Promise<DmConversation[]> {
    await connectionManager.ensureConnected();
    return dmConversationRepository.findByWorkspaceFormatted(workspaceId, limit);
  }

  async getAutomationRulesByTrigger(triggerType: string): Promise<AutomationRule[]> {
    await connectionManager.ensureConnected();
    const rules = await automationRuleRepository.findByGlobalTriggerTypeFormatted(triggerType);
    return rules as any;
  }

  // Admin operations - delegating to adminRepository
  async getAdmin(id: string): Promise<Admin | undefined> {
    await connectionManager.ensureConnected();
    try {
      const admin = await adminRepository.findById(id);
      return admin ? convertAdmin(admin) : undefined;
    } catch (error) {
      return undefined;
    }
  }

  async getAdminByEmail(email: string): Promise<Admin | undefined> {
    await connectionManager.ensureConnected();
    const admin = await adminRepository.findByEmail(email);
    return admin ? convertAdmin(admin) : undefined;
  }

  async getAdminByUsername(username: string): Promise<Admin | undefined> {
    await connectionManager.ensureConnected();
    const admin = await adminRepository.findByUsername(username);
    return admin ? convertAdmin(admin) : undefined;
  }

  async getAllAdmins(): Promise<Admin[]> {
    await connectionManager.ensureConnected();
    const admins = await adminRepository.findActiveAdmins();
    return admins.map(admin => convertAdmin(admin));
  }

  async createAdmin(admin: InsertAdmin): Promise<Admin> {
    await connectionManager.ensureConnected();
    const savedAdmin = await adminRepository.createWithDefaults({
      email: admin.email,
      username: admin.username,
      password: admin.password,
      role: admin.role as any,
    });
    return convertAdmin(savedAdmin);
  }

  async updateAdmin(id: string, updates: Partial<Admin>): Promise<Admin> {
    await connectionManager.ensureConnected();
    const updatedAdmin = await adminRepository.updateById(id, updates);
    if (!updatedAdmin) throw new Error(`Admin with id ${id} not found`);
    return convertAdmin(updatedAdmin);
  }

  async deleteAdmin(id: string): Promise<void> {
    await connectionManager.ensureConnected();
    await adminRepository.deleteById(id);
  }

  async getAdminUsers(page: number = 1, limit: number = 10, search?: string): Promise<{ admins: Admin[]; total: number }> {
    await connectionManager.ensureConnected();

    const result = await adminRepository.findWithPaginationAndFilters({ page, limit, search });

    const items = (result as any).admins || (result as any).users || (result as any).items || (result as any).data || [];
    return {
      admins: items.map((admin: any) => convertAdmin(admin)),
      total: result.total
    };
  }

  async getAdminContent(page: number = 1, limit: number = 10, search?: string): Promise<{ content: Content[]; total: number }> {
    await connectionManager.ensureConnected();
    const result = await contentRepository.findWithPagination({ page, limit }, search ? { title: { $regex: search, $options: 'i' } } : {});
    const items = Array.isArray(result) ? result : (result as any).items || (result as any).data || [];
    const total = (result as any).total || items.length;

    return {
      content: items.map((doc: any) => convertContent(doc)),
      total
    };
  }





  // Admin session operations - delegating to adminSessionRepository
  async createAdminSession(session: InsertAdminSession): Promise<AdminSession> {
    await connectionManager.ensureConnected();
    const savedSession = await adminSessionRepository.createWithDefaults({
      adminId: session.adminId,
      token: session.token,
      expiresAt: session.expiresAt,
      ipAddress: (session as any).ipAddress,
      userAgent: (session as any).userAgent
    } as any);
    return convertAdminSession(savedSession);
  }


  async getAdminSession(token: string): Promise<AdminSession | undefined> {
    await connectionManager.ensureConnected();
    const session = await adminSessionRepository.findByToken(token);
    if (!session || new Date(session.expiresAt) <= new Date()) {
      return undefined;
    }
    return convertAdminSession(session);
  }

  async deleteAdminSession(token: string): Promise<void> {
    await connectionManager.ensureConnected();
    const session = await adminSessionRepository.findByToken(token);
    if (session) {
      await adminSessionRepository.deleteById(session._id.toString());
    }
  }

  async cleanupExpiredSessions(): Promise<void> {
    await connectionManager.ensureConnected();
    await adminSessionRepository.deleteExpiredSessions();
  }

  // Notification operations - delegating to notificationRepository
  async createNotification(notification: InsertNotification): Promise<Notification> {
    await connectionManager.ensureConnected();

    const notificationData = {
      userId: notification.userId || null,
      title: notification.title,
      message: notification.message,
      type: notification.type || 'info',
      targetUsers: (notification as any).targetUsers || ['all'],
      scheduledFor: (notification as any).scheduledFor || null,
      sentAt: (notification as any).scheduledFor ? null : new Date(),
      isRead: false
    };

    const savedNotification = await notificationRepository.createWithDefaults(notificationData as any);
    return convertNotification(savedNotification);
  }

  async getUserNotifications(userId: string): Promise<Notification[]> {
    await connectionManager.ensureConnected();

    const result = await notificationRepository.findActiveNotifications({ limit: 50 });
    const notifications = Array.isArray(result) ? result : (result as any).items || (result as any).data || [];
    return notifications.map((notification: any) => convertNotification(notification));
  }

  async markNotificationAsRead(notificationId: string, userId: string): Promise<void> {
    await connectionManager.ensureConnected();
    await notificationRepository.markAsRead(notificationId);
  }

  async getNotifications(userId?: string): Promise<Notification[]> {
    await connectionManager.ensureConnected();
    let result;
    if (userId) {
      result = await notificationRepository.findByUserId(userId);
    } else {
      result = await notificationRepository.findAll({});
    }
    const notifications = Array.isArray(result) ? result : (result as any).items || (result as any).data || [];
    return notifications.map((notif: any) => convertNotification(notif));
  }

  async updateNotification(id: string, updates: Partial<Notification>): Promise<Notification> {
    await connectionManager.ensureConnected();
    const notification = await notificationRepository.updateById(id, updates);
    if (!notification) throw new Error('Notification not found');
    return convertNotification(notification);
  }







  async deleteNotification(id: string): Promise<void> {
    await connectionManager.ensureConnected();
    await notificationRepository.deleteById(id);
  }

  async markNotificationRead(id: string): Promise<void> {
    await connectionManager.ensureConnected();
    await notificationRepository.markAsRead(id);
  }

  // Popup operations - delegating to popupRepository
  async createPopup(popup: InsertPopup): Promise<Popup> {
    await connectionManager.ensureConnected();
    const savedPopup = await popupRepository.createWithDefaults(popup as any);
    return convertPopup(savedPopup);
  }

  async getActivePopups(): Promise<Popup[]> {
    await connectionManager.ensureConnected();
    const result = await popupRepository.findActivePopups();
    const popups = Array.isArray(result) ? result : (result as any).items || (result as any).data || [];
    return popups.map((popup: any) => convertPopup(popup));
  }

  async getPopup(id: string): Promise<Popup | undefined> {
    await connectionManager.ensureConnected();
    const popup = await popupRepository.findById(id);
    return popup ? convertPopup(popup) : undefined;
  }

  async updatePopup(id: string, updates: Partial<Popup>): Promise<Popup> {
    await connectionManager.ensureConnected();
    const popup = await popupRepository.updateById(id, updates);
    if (!popup) throw new Error('Popup not found');
    return convertPopup(popup);
  }

  async deletePopup(id: string): Promise<void> {
    await connectionManager.ensureConnected();
    await popupRepository.deleteById(id);
  }

  // App settings operations - delegating to appSettingRepository
  async createAppSetting(setting: InsertAppSetting): Promise<AppSetting> {
    await connectionManager.ensureConnected();
    const savedSetting = await appSettingRepository.createWithDefaults(setting);
    return convertAppSetting(savedSetting);
  }

  async getAppSetting(key: string): Promise<AppSetting | undefined> {
    await connectionManager.ensureConnected();
    const setting = await appSettingRepository.findByKey(key);
    return setting ? convertAppSetting(setting) : undefined;
  }

  async getAllAppSettings(): Promise<AppSetting[]> {
    await connectionManager.ensureConnected();
    const result = await appSettingRepository.findAll({});
    const settings = Array.isArray(result) ? result : (result as any).items;
    return settings.map((setting: any) => convertAppSetting(setting));
  }

  async getPublicAppSettings(): Promise<AppSetting[]> {
    await connectionManager.ensureConnected();
    const result = await appSettingRepository.findPublicSettings();
    const settings = Array.isArray(result) ? result : (result as any).items;
    return settings.map((setting: any) => convertAppSetting(setting));
  }

  async updateAppSetting(key: string, value: string, updatedBy?: string): Promise<AppSetting> {
    await connectionManager.ensureConnected();
    const setting = await appSettingRepository.upsertSetting(key, value, { updatedBy });
    return convertAppSetting(setting);
  }

  async deleteAppSetting(key: string): Promise<void> {
    await connectionManager.ensureConnected();
    const setting = await appSettingRepository.findByKey(key);
    if (setting) {
      await appSettingRepository.deleteById((setting as any)._id.toString());
    }
  }

  // Audit log operations - delegating to auditLogRepository
  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    await connectionManager.ensureConnected();
    const savedLog = await auditLogRepository.createWithDefaults(log);
    return convertAuditLog(savedLog);
  }

  async updatePopup(type: string, updates: Partial<Popup>): Promise<Popup | undefined> {
    await connectionManager.ensureConnected();
    const popup = await popupRepository.findByType(type);
    if (popup) {
      await popupRepository.updateById((popup as any)._id.toString(), {
        ...updates,
        delay: updates.delay ? Number(updates.delay) : undefined
      } as any);
      const updated = await popupRepository.findById((popup as any)._id.toString());
      return updated ? convertPopup(updated) : undefined;
    }
    return undefined;
  }

  async getAuditLogs(limit?: number, adminId?: string): Promise<AuditLog[]> {
    await connectionManager.ensureConnected();
    let result;
    if (adminId) {
      result = await auditLogRepository.findByActorId(adminId, { limit: limit || 100 });
    } else {
      result = await auditLogRepository.getRecentAuditLogs(limit || 100);
    }
    const logs = Array.isArray(result) ? result : (result as any).items || (result as any).data;
    return logs.map((log: any) => convertAuditLog(log));
  }

  // Feedback operations - delegating to feedbackMessageRepository
  async createFeedbackMessage(feedback: InsertFeedbackMessage): Promise<FeedbackMessage> {
    await connectionManager.ensureConnected();
    const savedFeedback = await feedbackMessageRepository.createWithDefaults(feedback as any);
    return convertFeedbackMessage(savedFeedback);
  }

  async getFeedbackMessages(status?: string): Promise<FeedbackMessage[]> {
    await connectionManager.ensureConnected();
    let result;
    if (status) {
      result = await feedbackMessageRepository.findByStatus(status);
    } else {
      result = await feedbackMessageRepository.findAll({});
    }
    const messages = Array.isArray(result) ? result : (result as any).items || (result as any).data;
    return messages.map((msg: any) => convertFeedbackMessage(msg));
  }

  async updateFeedbackMessage(id: string, updates: Partial<FeedbackMessage>): Promise<FeedbackMessage> {
    await connectionManager.ensureConnected();
    const message = await feedbackMessageRepository.updateById(id, updates);
    if (!message) throw new Error('Feedback message not found');
    return convertFeedbackMessage(message);
  }

  async deleteFeedbackMessage(id: string): Promise<void> {
    await connectionManager.ensureConnected();
    await feedbackMessageRepository.deleteById(id);
  }

  // Automation log operations
  async getAutomationLogs(workspaceId: string, options?: { limit?: number; type?: string }): Promise<any[]> {
    await connectionManager.ensureConnected();
    // Return empty array for now as automation logs schema not defined or repository not ready
    return [];
  }

  async createAutomationLog(log: any): Promise<any> {
    await connectionManager.ensureConnected();
    // Return the log object for now
    return { id: Date.now().toString(), ...log, createdAt: new Date() };
  }

  // Get all users method for cleanup operations
  async getAllUsers(): Promise<User[]> {
    await connectionManager.ensureConnected();
    const users = await userRepository.findAll({});
    return users.map(user => convertUser(user));
  }

  // Admin stats method
  async getAdminStats(): Promise<{ totalUsers: number; totalWorkspaces: number; totalContent: number; totalCreditsUsed: number; revenueThisMonth: number; activeUsers: number }> {
    await connectionManager.ensureConnected();

    const [userCount, workspaceCount, contentCount] = await Promise.all([
      userRepository.countAll(),
      workspaceRepository.countAll(),
      contentRepository.countAll()
    ]);

    return {
      totalUsers: userCount,
      totalWorkspaces: workspaceCount,
      totalContent: contentCount,
      totalCreditsUsed: 0,
      revenueThisMonth: 0,
      activeUsers: userCount
    };
  }

  // Email verification methods
  async storeEmailVerificationCode(email: string, code: string, expiry: Date): Promise<void> {
    await connectionManager.ensureConnected();
    await userRepository.storeEmailVerificationCode(email, code, expiry);
  }

  async verifyEmailCode(email: string, code: string): Promise<boolean> {
    await connectionManager.ensureConnected();
    return userRepository.verifyEmailCodeAndMarkVerified(email, code);
  }

  async clearEmailVerificationCode(email: string): Promise<void> {
    await connectionManager.ensureConnected();
    await userRepository.clearEmailVerificationCode(email);
  }

  // Create unverified user for email verification flow
  async createUnverifiedUser(data: {
    email: string;
    firstName: string;
    emailVerificationCode: string;
    emailVerificationExpiry: Date;
    isEmailVerified: boolean
  }): Promise<User> {
    await connectionManager.ensureConnected();

    const userData = {
      email: data.email,
      displayName: data.firstName,
      username: data.email.split('@')[0] + '_' + Date.now(), // Generate unique username
      firebaseUid: 'email_' + Date.now() + '_' + Math.random().toString(36).substring(7) as string, // Temporary UID for manual signup
      isEmailVerified: data.isEmailVerified,
      emailVerificationCode: data.emailVerificationCode,
      emailVerificationExpiry: data.emailVerificationExpiry,
      isOnboarded: false,
      credits: 10, // Initial credits for new users
      referralCode: generateReferralCode()
    };

    const savedUser = await userRepository.createWithDefaults(userData as any);
    return convertUser(savedUser);
  }

  // Email verification helper methods
  async updateUserEmailVerification(id: string, token: string, expires: Date): Promise<User> {
    await connectionManager.ensureConnected();
    const user = await userRepository.updateEmailVerificationData(id, token, expires);
    if (!user) throw new Error('User not found');
    return convertUser(user);
  }

  async verifyUserEmail(id: string, data: { password?: string; firstName?: string; lastName?: string; firebaseUid?: string }): Promise<User> {
    await connectionManager.ensureConnected();

    const additionalData: { displayName?: string; passwordHash?: string; firebaseUid?: string } = {};
    if (data.firstName) additionalData.displayName = data.firstName;
    if (data.password) additionalData.passwordHash = data.password; // Should be hashed before calling this
    if (data.firebaseUid) additionalData.firebaseUid = data.firebaseUid;

    const user = await userRepository.markEmailVerified(id, additionalData);
    if (!user) throw new Error('User not found');

    return convertUser(user);
  }

  // Thumbnail Operations - delegating to thumbnailVariantRepository etc.
  async createThumbnailVariant(data: InsertThumbnailVariant): Promise<ThumbnailVariant> {
    await connectionManager.ensureConnected();
    const variant = await thumbnailVariantRepository.createWithDefaults(data as any);
    return thumbnailVariantRepository.convertToOutput(variant);
  }

  async getThumbnailVariant(variantId: string): Promise<ThumbnailVariant | null> {
    await connectionManager.ensureConnected();
    const variant = await thumbnailVariantRepository.findById(variantId);
    if (!variant) return null;
    return thumbnailVariantRepository.convertToOutput(variant);
  }

  async getThumbnailVariants(projectId: string): Promise<ThumbnailVariant[]> {
    await connectionManager.ensureConnected();
    const variants = await thumbnailVariantRepository.findByProjectId(projectId);
    return variants.map(variant => thumbnailVariantRepository.convertToOutput(variant));
  }

  // Canvas Editor Sessions - delegating to canvasEditorSessionRepository
  async createCanvasEditorSession(data: InsertCanvasEditorSession): Promise<CanvasEditorSession> {
    await connectionManager.ensureConnected();
    const session = await canvasEditorSessionRepository.createWithDefaults(data as any);
    return canvasEditorSessionRepository.convertToOutput(session);
  }

  async getCanvasEditorSession(sessionId: string): Promise<CanvasEditorSession | null> {
    await connectionManager.ensureConnected();
    const session = await canvasEditorSessionRepository.findById(sessionId);
    if (!session) return null;
    return canvasEditorSessionRepository.convertToOutput(session);
  }

  async updateCanvasEditorSession(sessionId: string, updates: Partial<CanvasEditorSession>): Promise<void> {
    await connectionManager.ensureConnected();
    await canvasEditorSessionRepository.updateById(sessionId, { ...updates, lastSaved: new Date() } as any);
  }

  // Thumbnail Exports - delegating to thumbnailExportRepository
  async createThumbnailExport(data: InsertThumbnailExport): Promise<ThumbnailExport> {
    await connectionManager.ensureConnected();
    const exportDoc = await thumbnailExportRepository.createWithDefaults(data as any);
    return thumbnailExportRepository.convertToOutput(exportDoc);
  }

  async getThumbnailExports(sessionId: string): Promise<ThumbnailExport[]> {
    await connectionManager.ensureConnected();
    const exports = await thumbnailExportRepository.findBySessionId(sessionId);
    return exports.map(exp => thumbnailExportRepository.convertToOutput(exp));
  }

  async incrementExportDownload(exportId: string): Promise<void> {
    await connectionManager.ensureConnected();
    await thumbnailExportRepository.incrementDownloadCount(exportId);
  }

  // AI Features Operations

  // Creative Brief
  async createCreativeBrief(brief: InsertCreativeBrief): Promise<CreativeBrief> {
    await connectionManager.ensureConnected();
    const result = await creativeBriefRepository.createWithDefaults(brief as any);
    return convertCreativeBrief(result);
  }

  async getCreativeBrief(id: string): Promise<CreativeBrief | undefined> {
    await connectionManager.ensureConnected();
    const result = await creativeBriefRepository.findById(id);
    return result ? convertCreativeBrief(result) : undefined;
  }

  async getCreativeBriefsByWorkspace(workspaceId: string): Promise<CreativeBrief[]> {
    await connectionManager.ensureConnected();
    const result = await creativeBriefRepository.findByWorkspaceId(workspaceId);
    const items = Array.isArray(result) ? result : (result as any).items || (result as any).data || [];
    return items.map((item: any) => convertCreativeBrief(item));
  }

  async updateCreativeBrief(id: string, updates: Partial<CreativeBrief>): Promise<CreativeBrief> {
    await connectionManager.ensureConnected();
    const result = await creativeBriefRepository.updateById(id, updates as any);
    if (!result) throw new Error('Creative brief not found');
    return convertCreativeBrief(result);
  }

  async deleteCreativeBrief(id: string): Promise<void> {
    await connectionManager.ensureConnected();
    await creativeBriefRepository.deleteById(id);
  }

  // Content Repurpose
  async createContentRepurpose(repurpose: InsertContentRepurpose): Promise<ContentRepurpose> {
    await connectionManager.ensureConnected();
    const result = await contentRepurposeRepository.createWithDefaults(repurpose as any);
    return convertContentRepurpose(result);
  }

  async getContentRepurpose(id: string): Promise<ContentRepurpose | undefined> {
    await connectionManager.ensureConnected();
    const result = await contentRepurposeRepository.findById(id);
    return result ? convertContentRepurpose(result) : undefined;
  }

  async getContentRepurposesByWorkspace(workspaceId: string): Promise<ContentRepurpose[]> {
    await connectionManager.ensureConnected();
    const result = await contentRepurposeRepository.findByWorkspaceId(workspaceId);
    const items = Array.isArray(result) ? result : (result as any).items || (result as any).data || [];
    return items.map((item: any) => convertContentRepurpose(item));
  }

  async updateContentRepurpose(id: string, updates: Partial<ContentRepurpose>): Promise<ContentRepurpose> {
    await connectionManager.ensureConnected();
    const result = await contentRepurposeRepository.updateById(id, updates as any);
    if (!result) throw new Error('Content repurpose not found');
    return convertContentRepurpose(result);
  }

  async deleteContentRepurpose(id: string): Promise<void> {
    await connectionManager.ensureConnected();
    await contentRepurposeRepository.deleteById(id);
  }

  // Competitor Analysis
  async createCompetitorAnalysis(analysis: InsertCompetitorAnalysis): Promise<CompetitorAnalysis> {
    await connectionManager.ensureConnected();
    const result = await competitorAnalysisRepository.createWithDefaults(analysis as any);
    return convertCompetitorAnalysis(result);
  }

  async getCompetitorAnalysis(id: string): Promise<CompetitorAnalysis | undefined> {
    await connectionManager.ensureConnected();
    const result = await competitorAnalysisRepository.findById(id);
    return result ? convertCompetitorAnalysis(result) : undefined;
  }

  async getCompetitorAnalysesByWorkspace(workspaceId: string): Promise<CompetitorAnalysis[]> {
    await connectionManager.ensureConnected();
    const result = await competitorAnalysisRepository.findByWorkspaceId(workspaceId);
    const items = Array.isArray(result) ? result : (result as any).items || (result as any).data || [];
    return items.map((item: any) => convertCompetitorAnalysis(item));
  }

  async updateCompetitorAnalysis(id: string, updates: Partial<CompetitorAnalysis>): Promise<CompetitorAnalysis> {
    await connectionManager.ensureConnected();
    const result = await competitorAnalysisRepository.updateById(id, updates as any);
    if (!result) throw new Error('Competitor analysis not found');
    return convertCompetitorAnalysis(result);
  }

  async deleteCompetitorAnalysis(id: string): Promise<void> {
    await connectionManager.ensureConnected();
    await competitorAnalysisRepository.deleteById(id);
  }

  // Feature usage tracking
  async trackFeatureUsage(userId: string, featureId: string, metadata?: any): Promise<void> {
    await connectionManager.ensureConnected();
    try {
      const updated = await featureUsageRepository.incrementUsage(userId, featureId);
      if (updated && metadata) {
        await featureUsageRepository.updateById((updated as any)._id.toString(), { metadata });
      }
    } catch (error) {
      // Non-critical
    }
  }

  async getFeatureUsage(userId: string): Promise<any[]> {
    await connectionManager.ensureConnected();
    try {
      const result = await featureUsageRepository.findByUserId(userId);
      const items = Array.isArray(result) ? result : (result as any).data || [];
      return items.map((doc: any) => ({
        id: doc._id.toString(),
        userId: doc.userId,
        featureId: doc.featureId,
        usageCount: doc.usageCount,
        lastUsed: doc.lastUsed,
        metadata: doc.metadata,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt
      }));
    } catch (error) {
      return [];
    }
  }

  // Waitlist Management
  async createWaitlistUser(data: InsertWaitlistUser): Promise<WaitlistUser> {
    await connectionManager.ensureConnected();

    const referralCode = generateReferralCode();
    let referredByUserId = null;

    if (data.referredBy) {
      const referrer = await waitlistUserRepository.findByReferralCode(data.referredBy);
      if (referrer) {
        referredByUserId = (referrer as any)._id;
        await waitlistUserRepository.incrementReferralCount((referrer as any)._id.toString());
      }
    }

    const savedUser = await waitlistUserRepository.createWithDefaults({
      ...data,
      referralCode,
      referredBy: referredByUserId
    } as any);

    return convertWaitlistUser(savedUser);
  }

  async getWaitlistUser(id: string): Promise<WaitlistUser | undefined> {
    await connectionManager.ensureConnected();
    const user = await waitlistUserRepository.findById(id);
    return user ? convertWaitlistUser(user) : undefined;
  }

  async getWaitlistUserByEmail(email: string): Promise<WaitlistUser | undefined> {
    await connectionManager.ensureConnected();
    const user = await waitlistUserRepository.findByEmail(email);
    return user ? convertWaitlistUser(user) : undefined;
  }

  async getWaitlistUserByReferralCode(referralCode: string): Promise<WaitlistUser | undefined> {
    await connectionManager.ensureConnected();
    const user = await waitlistUserRepository.findByReferralCode(referralCode);
    return user ? convertWaitlistUser(user) : undefined;
  }

  async updateWaitlistUser(id: string, updates: Partial<WaitlistUser>): Promise<WaitlistUser> {
    await connectionManager.ensureConnected();
    const user = await waitlistUserRepository.updateById(id, updates as any);
    if (!user) throw new Error('Waitlist user not found');
    return convertWaitlistUser(user);
  }

  async getAllWaitlistUsers(): Promise<WaitlistUser[]> {
    await connectionManager.ensureConnected();
    const result = await waitlistUserRepository.findAll({});
    const items = Array.isArray(result) ? result : (result as any).items || (result as any).data || [];
    return items.map((user: any) => convertWaitlistUser(user));
  }

  async getWaitlistStats(): Promise<any> {
    await connectionManager.ensureConnected();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [total, todayCount, stats, statusBreakdown] = await Promise.all([
      waitlistUserRepository.countAll(),
      waitlistUserRepository.countSince(today),
      waitlistUserRepository.getStats(),
      waitlistUserRepository.getStatusBreakdown()
    ]);

    return {
      totalUsers: total,
      todaySignups: todayCount,
      totalReferrals: stats.totalReferrals,
      averageReferrals: stats.avgReferrals,
      statusBreakdown
    };
  }

  async promoteWaitlistUser(id: string): Promise<{
    user: User;
    workspace: Workspace;
    discountCode: string;
    trialDays: number;
  }> {
    await connectionManager.ensureConnected();
    return waitlistUserRepository.promoteToUser(id) as any;
  }

  async deleteWaitlistUser(id: string): Promise<void> {
    await connectionManager.ensureConnected();
    const deleted = await waitlistUserRepository.deleteById(id);
    if (!deleted) {
      throw new Error('Waitlist user not found');
    }
  }

  // Database Reset Operations
  async clearAllUsers(): Promise<number> {
    await connectionManager.ensureConnected();
    return await userRepository.deleteMany({});
  }

  async clearAllWaitlistUsers(): Promise<number> {
    await connectionManager.ensureConnected();
    return await waitlistUserRepository.deleteMany({});
  }

  async clearAllWorkspaces(): Promise<number> {
    await connectionManager.ensureConnected();
    return await workspaceRepository.deleteMany({});
  }

  async clearAllSocialAccounts(): Promise<number> {
    await connectionManager.ensureConnected();
    return await socialAccountRepository.deleteMany({});
  }

  async clearAllContent(): Promise<number> {
    await connectionManager.ensureConnected();
    return await contentRepository.deleteMany({});
  }

  // VeeGPT Chat Methods - delegating to chatConversationRepository and chatMessageRepository
  async getChatConversations(userId: string, workspaceId?: string): Promise<ChatConversation[]> {
    await connectionManager.ensureConnected();
    const result = await chatConversationRepository.findByUserSorted(userId, workspaceId || undefined);
    const conversations = Array.isArray(result) ? result : (result as any).items || (result as any).data || [];
    return conversations.map((doc: any) => convertChatConversation(doc));
  }

  async getChatConversation(id: string): Promise<ChatConversation | undefined> {
    await connectionManager.ensureConnected();
    const conversation = await chatConversationRepository.findById(id);
    return conversation ? convertChatConversation(conversation) : undefined;
  }

  async createChatConversation(conversation: InsertChatConversation): Promise<ChatConversation> {
    await connectionManager.ensureConnected();
    const saved = await chatConversationRepository.createWithDefaults({
      userId: conversation.userId.toString(),
      workspaceId: conversation.workspaceId.toString(),
      title: conversation.title
    });
    return convertChatConversation(saved);
  }

  async getChatMessage(id: string): Promise<ChatMessage | undefined> {
    await connectionManager.ensureConnected();
    const message = await chatMessageRepository.findById(id);
    return message ? convertChatMessage(message) : undefined;
  }

  async getChatMessages(conversationId: string): Promise<ChatMessage[]> {
    await connectionManager.ensureConnected();
    const result = await chatMessageRepository.findByConversationId(conversationId as any);
    const messages = Array.isArray(result) ? result : (result as any).items || (result as any).data || [];
    return messages.map((doc: any) => convertChatMessage(doc));
  }

  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    await connectionManager.ensureConnected();

    const saved = await chatMessageRepository.createWithDefaults({
      ...message,
      conversationId: message.conversationId.toString() // Ensure conversationId is string
    } as any);
    return convertChatMessage(saved);
  }

  async updateChatMessage(id: string, updates: Partial<ChatMessage>): Promise<ChatMessage> {
    await connectionManager.ensureConnected();
    const updated = await chatMessageRepository.updateById(id, updates as any);
    if (!updated) throw new Error('Message not found');
    return convertChatMessage(updated);
  }

  async updateChatConversation(id: string, updates: Partial<ChatConversation>): Promise<ChatConversation> {
    await connectionManager.ensureConnected();
    const updated = await chatConversationRepository.updateById(id, updates as any);
    if (!updated) throw new Error('Conversation not found');
    return convertChatConversation(updated);
  }

  async deleteChatConversation(id: string): Promise<void> {
    await connectionManager.ensureConnected();

    // Delete associated messages first
    await chatMessageRepository.deleteMessagesByConversationId(id);
    // Then delete the conversation
    const deleted = await chatConversationRepository.deleteById(id);
    if (!deleted) {
      throw new Error('Conversation not found');
    }
  }
}

// Export singleton instance
export const storage = new MongoStorage();
