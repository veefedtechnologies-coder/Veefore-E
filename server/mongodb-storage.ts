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
} from "@shared/schema";
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
  convertContentRepurpose,
  convertCompetitorAnalysis,
  convertWaitlistUser,
  generateReferralCode
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
  async getUser(id: number | string): Promise<User | undefined> {
    await connectionManager.ensureConnected();
    const user = await userRepository.findById(id.toString());
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
      await userRepository.updateById(user._id.toString(), { lastLoginAt: new Date() });
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
    const savedUser = await userRepository.createWithDefaultWorkspace(userData);
    return convertUser(savedUser);
  }

  async updateUser(id: number | string, updates: Partial<User>): Promise<User> {
    await connectionManager.ensureConnected();
    const user = await userRepository.updateById(id.toString(), updates);
    if (!user) {
      throw new Error('User not found');
    }
    return convertUser(user);
  }

  async updateUserCredits(id: number | string, credits: number): Promise<User> {
    return this.updateUser(id, { credits });
  }

  async getUserCredits(userId: number | string): Promise<number> {
    const user = await this.getUser(userId);
    return user ? user.credits : 0;
  }

  async updateUserStripeInfo(id: number | string, stripeCustomerId: string, stripeSubscriptionId?: string): Promise<User> {
    return this.updateUser(id, { stripeCustomerId, stripeSubscriptionId });
  }

  // Workspace operations - delegating to workspaceRepository
  async getWorkspace(id: number | string): Promise<Workspace | undefined> {
    await connectionManager.ensureConnected();
    
    // Handle invalid IDs
    if (!id || id === 'undefined' || id === 'null') {
      return undefined;
    }
    
    try {
      const idString = id.toString();
      
      // Only accept valid 24-character ObjectIds
      if (idString.length !== 24) {
        return undefined;
      }
      
      const workspace = await workspaceRepository.findById(idString);
      return workspace ? convertWorkspace(workspace) : undefined;
      
    } catch (objectIdError) {
      return undefined;
    }
  }

  async getWorkspacesByUserId(userId: number | string): Promise<Workspace[]> {
    await connectionManager.ensureConnected();
    const workspaces = await workspaceRepository.findByUserId(userId.toString());
    return workspaces.map(ws => convertWorkspace(ws));
  }

  async getDefaultWorkspace(userId: number | string): Promise<Workspace | undefined> {
    await connectionManager.ensureConnected();
    
    // Try to find default workspace first
    let workspace = await workspaceRepository.findDefaultByUserId(userId.toString());
    
    // If no default workspace, get the first workspace for this user
    if (!workspace) {
      const workspaces = await workspaceRepository.findByUserId(userId.toString());
      workspace = workspaces.length > 0 ? workspaces[0] : null;
    }
    
    return workspace ? convertWorkspace(workspace) : undefined;
  }

  async createWorkspace(workspaceData: InsertWorkspace): Promise<Workspace> {
    await connectionManager.ensureConnected();
    const workspace = await workspaceRepository.createWithDefaults(workspaceData);
    return convertWorkspace(workspace);
  }

  async updateWorkspace(id: number | string, updates: Partial<Workspace>): Promise<Workspace> {
    await connectionManager.ensureConnected();
    const workspace = await workspaceRepository.updateById(id.toString(), updates);
    if (!workspace) throw new Error('Workspace not found');
    return convertWorkspace(workspace);
  }

  async updateWorkspaceCredits(id: number | string, credits: number): Promise<void> {
    await connectionManager.ensureConnected();
    
    const result = await workspaceRepository.updateById(id.toString(), { credits });
    
    if (!result) {
      throw new Error('Workspace not found for credit update');
    }
  }

  async deleteWorkspace(id: number | string): Promise<void> {
    await connectionManager.ensureConnected();
    const ws = await workspaceRepository.findById(id.toString());
    if (!ws) throw new Error('Workspace not found');
    if (ws.isDefault === true) {
      throw new Error('Default workspace cannot be deleted');
    }
    await workspaceRepository.deleteById(id.toString());
  }

  async setDefaultWorkspace(userId: number | string, workspaceId: number | string): Promise<void> {
    await connectionManager.ensureConnected();
    await workspaceRepository.unsetDefaultForUser(userId.toString());
    await workspaceRepository.updateById(workspaceId.toString(), { isDefault: true });
  }



  // Social account operations - delegating to socialAccountRepository
  async getSocialAccount(id: number | string): Promise<SocialAccount | undefined> {
    await connectionManager.ensureConnected();
    const account = await socialAccountRepository.findById(id.toString());
    return account ? convertSocialAccount(account) : undefined;
  }

  async getSocialAccountByWorkspaceAndPlatform(workspaceId: number, platform: string): Promise<SocialAccount | undefined> {
    await connectionManager.ensureConnected();
    const account = await socialAccountRepository.findByWorkspaceAndPlatform(workspaceId.toString(), platform as any);
    return account ? convertSocialAccount(account) : undefined;
  }

  async getSocialAccountsByWorkspace(workspaceId: string | number): Promise<SocialAccount[]> {
    await connectionManager.ensureConnected();
    const accounts = await socialAccountRepository.findByWorkspaceWithTolerantLookup(workspaceId.toString());
    return accounts.map(account => convertSocialAccount(account));
  }

  /**
   * INTERNAL USE ONLY: Get social accounts with decrypted tokens
   * This method exposes actual tokens and should ONLY be used by internal services
   * like auto-sync, NOT for API responses to clients
   */
  async getSocialAccountsWithTokensInternal(workspaceId: string): Promise<SocialAccount[]> {
    await connectionManager.ensureConnected();
    return socialAccountRepository.findActiveWithDecryptedTokens(workspaceId);
  }

  async getAllSocialAccounts(): Promise<SocialAccount[]> {
    await connectionManager.ensureConnected();
    const accounts = await socialAccountRepository.findAll({ isActive: true });
    return accounts.map(account => convertSocialAccount(account));
  }



  async getSocialAccountByPlatform(workspaceId: number | string, platform: string): Promise<SocialAccount | undefined> {
    await connectionManager.ensureConnected();
    const account = await socialAccountRepository.findByWorkspaceAndPlatform(workspaceId.toString(), platform as any);
    return account ? convertSocialAccount(account) : undefined;
  }

  async getSocialAccountByPageId(pageId: string): Promise<SocialAccount | undefined> {
    await connectionManager.ensureConnected();
    const account = await socialAccountRepository.findByPageIdOrAccountId(pageId);
    return account ? convertSocialAccount(account) : undefined;
  }

  async getSocialConnections(userId: number | string): Promise<SocialAccount[]> {
    await connectionManager.ensureConnected();
    const userWorkspaces = await this.getWorkspacesByUserId(userId);
    const workspaceIds = userWorkspaces.map(w => w.id.toString());
    const accounts = await socialAccountRepository.findByWorkspaceIds(workspaceIds);
    return accounts.map(account => convertSocialAccount(account));
  }

  async createSocialAccount(account: InsertSocialAccount): Promise<SocialAccount> {
    await connectionManager.ensureConnected();
    const newAccount = await socialAccountRepository.createWithEncryptedTokens(account);
    return convertSocialAccount(newAccount);
  }

  async updateSocialAccount(id: number | string, updates: Partial<SocialAccount>): Promise<SocialAccount> {
    await connectionManager.ensureConnected();
    const updatedAccount = await socialAccountRepository.updateWithEncryptedTokens(id.toString(), updates);
    return convertSocialAccount(updatedAccount);
  }

  async deleteSocialAccount(id: number | string): Promise<void> {
    await connectionManager.ensureConnected();
    
    const deleted = await socialAccountRepository.deleteById(id.toString());
    
    if (!deleted) {
      throw new Error(`Social account with id ${id} not found`);
    }
  }

  // Content operations - delegating to contentRepository
  async getContent(id: number): Promise<Content | undefined> {
    await connectionManager.ensureConnected();
    const content = await contentRepository.findById(id.toString());
    return content ? convertContent(content) : undefined;
  }

  async getContentByWorkspace(workspaceId: number, limit?: number): Promise<Content[]> {
    await connectionManager.ensureConnected();
    const contents = await contentRepository.findByWorkspaceId(
      workspaceId.toString(),
      limit ? { limit, sortBy: 'createdAt', sortOrder: 'desc' } : { sortBy: 'createdAt', sortOrder: 'desc' }
    );
    return contents.map(content => convertContent(content));
  }

  async getScheduledContent(workspaceId?: number): Promise<Content[]> {
    await connectionManager.ensureConnected();
    const contents = await contentRepository.findScheduledContent(workspaceId?.toString());
    return contents.map(content => convertContent(content));
  }

  async createContent(content: InsertContent): Promise<Content> {
    await connectionManager.ensureConnected();
    const saved = await contentRepository.createWithDefaults(content);
    return convertContent(saved);
  }

  async updateContent(id: number, updates: Partial<Content>): Promise<Content> {
    await connectionManager.ensureConnected();
    const content = await contentRepository.updateById(id.toString(), updates);
    if (!content) throw new Error('Content not found');
    return convertContent(content);
  }

  async createPost(postData: InsertContent & { content?: string; media?: string[]; hashtags?: string; firstComment?: string; location?: string; accounts?: string[] }): Promise<Content & { content?: string; media?: string[]; hashtags?: string; firstComment?: string; location?: string; accounts?: string[] }> {
    await connectionManager.ensureConnected();
    const saved = await contentRepository.createPostWithDefaults(postData);
    return {
      id: saved._id.toString(),
      workspaceId: saved.workspaceId,
      content: (saved as any).content,
      media: (saved as any).media || [],
      hashtags: (saved as any).hashtags || '',
      firstComment: (saved as any).firstComment || '',
      location: (saved as any).location || '',
      accounts: (saved as any).accounts || [],
      status: saved.status,
      publishedAt: (saved as any).publishedAt,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt
    };
  }

  async deleteContent(id: number | string): Promise<void> {
    await connectionManager.ensureConnected();
    
    const deleted = await contentRepository.deleteById(id.toString());
    
    if (!deleted) {
      throw new Error(`Content with id ${id} not found`);
    }
  }

  // Analytics operations - delegating to analyticsRepository
  async getAnalytics(workspaceId: number | string, platform?: string, days?: number): Promise<Analytics[]> {
    await connectionManager.ensureConnected();
    const analyticsData = await analyticsRepository.findByWorkspaceWithDaysFilter(workspaceId.toString(), platform, days);
    return analyticsData.map(doc => convertAnalytics(doc));
  }

  async createAnalytics(analytics: InsertAnalytics): Promise<Analytics> {
    await connectionManager.ensureConnected();
    const analyticsDoc = await analyticsRepository.createWithDefaults(analytics);
    return convertAnalytics(analyticsDoc);
  }

  async getLatestAnalytics(workspaceId: number, platform: string): Promise<Analytics | undefined> {
    await connectionManager.ensureConnected();
    const analytics = await analyticsRepository.findLatestByPlatform(workspaceId.toString(), platform);
    return analytics ? convertAnalytics(analytics) : undefined;
  }

  async getAutomationRules(workspaceId: number | string): Promise<AutomationRule[]> {
    await connectionManager.ensureConnected();
    return automationRuleRepository.findByWorkspaceIdFormatted(workspaceId.toString());
  }

  async getActiveAutomationRules(): Promise<AutomationRule[]> {
    await connectionManager.ensureConnected();
    return automationRuleRepository.findActiveRulesFormatted();
  }

  async getAutomationRulesByType(type: string): Promise<AutomationRule[]> {
    await connectionManager.ensureConnected();
    return automationRuleRepository.findByTypeFormatted(type);
  }

  async createAutomationRule(rule: InsertAutomationRule): Promise<AutomationRule> {
    await connectionManager.ensureConnected();
    return automationRuleRepository.createWithDefaults(rule);
  }

  async updateAutomationRule(id: string, updates: Partial<AutomationRule>): Promise<AutomationRule> {
    await connectionManager.ensureConnected();
    return automationRuleRepository.updateWithCleanup(id, updates);
  }

  async deleteAutomationRule(id: string): Promise<void> {
    await connectionManager.ensureConnected();
    try {
      const deleted = await automationRuleRepository.deleteById(id);
      
      if (!deleted) {
        throw new Error('Automation rule not found');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to delete automation rule: ${errorMessage}`);
    }
  }

  // Conversation Management Methods





  async clearWorkspaceConversations(workspaceId: string): Promise<void> {
    await connectionManager.ensureConnected();
    await dmConversationRepository.clearWorkspaceData(workspaceId);
  }

  async getSuggestions(workspaceId: number, type?: string): Promise<Suggestion[]> {
    await connectionManager.ensureConnected();
    
    const suggestions = await suggestionRepository.findByWorkspaceId(workspaceId.toString());
    
    const filtered = type ? suggestions.filter(s => s.type === type) : suggestions;
    
    return filtered.map(doc => convertSuggestion(doc));
  }

  async getValidSuggestions(workspaceId: number): Promise<Suggestion[]> {
    await connectionManager.ensureConnected();
    const suggestions = await suggestionRepository.findValidByWorkspace(workspaceId.toString());
    return suggestions.map(doc => convertSuggestion(doc));
  }

  async createSuggestion(suggestion: InsertSuggestion): Promise<Suggestion> {
    await connectionManager.ensureConnected();
    const saved = await suggestionRepository.createWithDefaults(suggestion);
    return convertSuggestion(saved);
  }

  async markSuggestionUsed(id: number): Promise<Suggestion> {
    await connectionManager.ensureConnected();
    
    const updated = await suggestionRepository.markAsUsed(id.toString());
    
    if (!updated) {
      throw new Error('Suggestion not found');
    }
    
    return convertSuggestion(updated);
  }

  async clearSuggestionsByWorkspace(workspaceId: string | number): Promise<void> {
    await connectionManager.ensureConnected();
    
    await suggestionRepository.deleteMany({ workspaceId: workspaceId.toString() });
  }

  async getCreditTransactions(userId: number, limit = 50): Promise<CreditTransaction[]> {
    await connectionManager.ensureConnected();
    
    try {
      const transactions = await creditTransactionRepository.getRecentTransactions(userId.toString(), limit);
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

  async getReferrals(referrerId: number): Promise<Referral[]> {
    return [];
  }

  async getReferralStats(userId: number): Promise<{ totalReferrals: number; activePaid: number; totalEarned: number }> {
    return { totalReferrals: 0, activePaid: 0, totalEarned: 0 };
  }

  async createReferral(referral: InsertReferral): Promise<Referral> {
    throw new Error('Not implemented');
  }

  async confirmReferral(id: number): Promise<Referral> {
    throw new Error('Not implemented');
  }

  async getLeaderboard(limit?: number): Promise<Array<User & { referralCount: number }>> {
    return [];
  }

  // Subscription operations - delegating to subscriptionRepository
  async getSubscription(userId: number): Promise<Subscription | undefined> {
    await connectionManager.ensureConnected();
    const subscription = await subscriptionRepository.findByUserId(userId.toString());
    return subscription ? convertSubscription(subscription) : undefined;
  }

  async createSubscription(insertSubscription: InsertSubscription): Promise<Subscription> {
    await connectionManager.ensureConnected();
    const subscription = await subscriptionRepository.create(insertSubscription);
    return convertSubscription(subscription);
  }

  async updateSubscriptionStatus(userId: number, status: string, canceledAt?: Date): Promise<Subscription> {
    await connectionManager.ensureConnected();
    const subscription = await subscriptionRepository.updateOne(
      { userId: userId.toString() },
      { status, canceledAt }
    );
    if (!subscription) throw new Error('Subscription not found');
    return convertSubscription(subscription);
  }

  async getActiveSubscription(userId: number): Promise<Subscription | undefined> {
    await connectionManager.ensureConnected();
    const subscription = await subscriptionRepository.findActiveByUserId(userId.toString());
    return subscription ? convertSubscription(subscription) : undefined;
  }

  // Payment operations - delegating to paymentRepository
  async createPayment(insertPayment: InsertPayment): Promise<Payment> {
    await connectionManager.ensureConnected();
    const payment = await paymentRepository.create(insertPayment);
    return convertPayment(payment);
  }

  async getPaymentsByUser(userId: number): Promise<Payment[]> {
    await connectionManager.ensureConnected();
    const result = await paymentRepository.findByUserId(userId.toString());
    return result.data.map(payment => convertPayment(payment));
  }

  // Addon operations - delegating to addonRepository
  async getUserAddons(userId: number | string): Promise<Addon[]> {
    await connectionManager.ensureConnected();
    const addons = await addonRepository.findActiveByUserId(userId.toString());
    return addons.map(addon => convertAddon(addon));
  }

  async getActiveAddonsByUser(userId: number | string): Promise<Addon[]> {
    await connectionManager.ensureConnected();
    
    const userIdStr = userId.toString();
    const addons = await addonRepository.findActiveByUserId(userIdStr);
    
    return addons.map(addon => convertAddon(addon));
  }

  async createAddon(insertAddon: InsertAddon): Promise<Addon> {
    await connectionManager.ensureConnected();
    const savedAddon = await addonRepository.createWithDefaults(insertAddon);
    return convertAddon(savedAddon);
  }

  async getSuggestionsByWorkspace(workspaceId: string | number): Promise<Suggestion[]> {
    await connectionManager.ensureConnected();
    const suggestions = await suggestionRepository.findByWorkspaceId(
      workspaceId.toString(),
      { sortBy: 'createdAt', sortOrder: 'desc' }
    );
    return suggestions.map(doc => convertSuggestion(doc));
  }

  async getAnalyticsByWorkspace(workspaceId: string | number): Promise<Analytics[]> {
    await connectionManager.ensureConnected();
    const analytics = await analyticsRepository.findByWorkspaceId(workspaceId.toString());
    return analytics.map(convertAnalytics);
  }

  // Team management operations
  async getWorkspaceByInviteCode(inviteCode: string): Promise<Workspace | undefined> {
    await connectionManager.ensureConnected();
    const workspace = await workspaceRepository.findByInviteCode(inviteCode);
    return workspace ? convertWorkspace(workspace) : undefined;
  }

  async getWorkspaceMember(workspaceId: number | string, userId: number | string): Promise<WorkspaceMember | undefined> {
    await connectionManager.ensureConnected();
    const member = await workspaceMemberRepository.findByWorkspaceAndUser(
      workspaceId.toString(),
      userId.toString()
    );
    return member ? convertWorkspaceMember(member) : undefined;
  }

  async getWorkspaceMembers(workspaceId: number | string): Promise<(WorkspaceMember & { user: User })[]> {
    await connectionManager.ensureConnected();
    
    const membersWithUsers = await workspaceMemberRepository.getMembersWithOwnerFallback(workspaceId.toString());
    
    if (membersWithUsers.length > 0) {
      return membersWithUsers.map(({ member, user }) => ({
        ...convertWorkspaceMember(member),
        user: convertUser(user!)
      }));
    }
    
    const fallback = await workspaceMemberRepository.getOwnerAsFallbackMember(workspaceId.toString());
    return fallback ? [{ ...fallback, user: convertUser(fallback.user) } as WorkspaceMember & { user: User }] : [];
  }

  async addWorkspaceMember(member: InsertWorkspaceMember): Promise<WorkspaceMember> {
    await connectionManager.ensureConnected();
    const newMember = await workspaceMemberRepository.createWithDefaults(member);
    return convertWorkspaceMember(newMember);
  }

  async updateWorkspaceMember(workspaceId: number | string, userId: number | string, updates: Partial<WorkspaceMember>): Promise<WorkspaceMember> {
    await connectionManager.ensureConnected();
    const updatedMember = await workspaceMemberRepository.updateByWorkspaceAndUser(workspaceId.toString(), userId.toString(), updates);
    if (!updatedMember) throw new Error(`Workspace member not found`);
    return convertWorkspaceMember(updatedMember);
  }

  async removeWorkspaceMember(workspaceId: number | string, userId: number | string): Promise<void> {
    await connectionManager.ensureConnected();
    const member = await workspaceMemberRepository.findByWorkspaceAndUser(
      workspaceId.toString(),
      userId.toString()
    );
    if (member) {
      await workspaceMemberRepository.deleteById(member._id.toString());
    }
  }

  async createTeamInvitation(invitation: InsertTeamInvitation): Promise<TeamInvitation> {
    await connectionManager.ensureConnected();
    const newInvitation = await teamInvitationRepository.createWithDefaults(invitation);
    return convertTeamInvitation(newInvitation);
  }

  async getWorkspaceInvitations(workspaceId: number): Promise<TeamInvitation[]> {
    await connectionManager.ensureConnected();
    
    const invitations = await teamInvitationRepository.findPendingByWorkspace(
      workspaceId.toString(),
      { sortBy: 'createdAt', sortOrder: 'desc' }
    );
    
    return invitations.map(doc => convertTeamInvitation(doc));
  }

  async getTeamInvitation(id: number): Promise<TeamInvitation | undefined> {
    await connectionManager.ensureConnected();
    const invitation = await teamInvitationRepository.findOne({ id });
    return invitation ? convertTeamInvitation(invitation) : undefined;
  }

  async getTeamInvitationByToken(token: string): Promise<TeamInvitation | undefined> {
    await connectionManager.ensureConnected();
    const invitation = await teamInvitationRepository.findByToken(token);
    return invitation ? convertTeamInvitation(invitation) : undefined;
  }

  async getTeamInvitations(workspaceId: number | string, status?: string): Promise<TeamInvitation[]> {
    await connectionManager.ensureConnected();
    
    const options = { sortBy: 'createdAt' as const, sortOrder: 'desc' as const };
    let invitations;
    
    if (status) {
      invitations = await teamInvitationRepository.findMany(
        { workspaceId: workspaceId.toString(), status },
        options
      );
    } else {
      invitations = await teamInvitationRepository.findByWorkspaceId(
        workspaceId.toString(),
        options
      );
    }
    
    return invitations.map(convertTeamInvitation);
  }

  async updateTeamInvitation(id: number, updates: Partial<TeamInvitation>): Promise<TeamInvitation> {
    await connectionManager.ensureConnected();
    
    const invitation = await teamInvitationRepository.findOne({ id });
    
    if (!invitation) {
      throw new Error(`Team invitation with id ${id} not found`);
    }
    
    const updatedInvitation = await teamInvitationRepository.updateById(
      invitation._id.toString(),
      updates
    );
    
    if (!updatedInvitation) {
      throw new Error(`Team invitation with id ${id} not found`);
    }
    
    return convertTeamInvitation(updatedInvitation);
  }

  // Content recommendation operations
  async getContentRecommendation(id: number): Promise<ContentRecommendation | undefined> {
    await connectionManager.ensureConnected();
    const recommendation = await contentRecommendationRepository.findById(id.toString());
    return recommendation ? convertContentRecommendation(recommendation) : undefined;
  }

  async getContentRecommendations(workspaceId: number, type?: string, limit?: number): Promise<ContentRecommendation[]> {
    await connectionManager.ensureConnected();
    
    const options: { sortBy: 'createdAt'; sortOrder: 'desc'; limit?: number } = { sortBy: 'createdAt', sortOrder: 'desc' };
    if (limit) {
      options.limit = limit;
    }
    
    let recommendations;
    if (type) {
      recommendations = await contentRecommendationRepository.findMany(
        { workspaceId: workspaceId.toString(), isActive: true, type },
        options
      );
    } else {
      recommendations = await contentRecommendationRepository.findActiveByWorkspace(
        workspaceId.toString(),
        options
      );
    }
    
    return recommendations.map(rec => convertContentRecommendation(rec));
  }

  async createContentRecommendation(insertRecommendation: InsertContentRecommendation): Promise<ContentRecommendation> {
    await connectionManager.ensureConnected();
    const saved = await contentRecommendationRepository.createWithDefaults(insertRecommendation);
    return convertContentRecommendation(saved);
  }

  async updateContentRecommendation(id: number, updates: Partial<ContentRecommendation>): Promise<ContentRecommendation> {
    await connectionManager.ensureConnected();
    const updated = await contentRecommendationRepository.updateById(
      id.toString(),
      updates
    );
    if (!updated) {
      throw new Error(`Content recommendation ${id} not found`);
    }
    return convertContentRecommendation(updated);
  }

  async deleteContentRecommendation(id: number): Promise<void> {
    await connectionManager.ensureConnected();
    const deleted = await contentRecommendationRepository.deleteById(id.toString());
    if (!deleted) {
      throw new Error(`Content recommendation ${id} not found`);
    }
  }

  async getUserContentHistory(userId: number, workspaceId: number): Promise<UserContentHistory[]> {
    await connectionManager.ensureConnected();
    const history = await userContentHistoryRepository.findMany(
      { userId: userId.toString(), workspaceId: workspaceId.toString() },
      { sortBy: 'createdAt', sortOrder: 'desc' }
    );
    return history.map(h => convertUserContentHistory(h));
  }

  async createUserContentHistory(insertHistory: InsertUserContentHistory): Promise<UserContentHistory> {
    await connectionManager.ensureConnected();
    const saved = await userContentHistoryRepository.createWithDefaults(insertHistory);
    return convertUserContentHistory(saved);
  }

  // Pricing and plan operations - delegating to pricing-config module
  async getPricingData(): Promise<{ plans: typeof SUBSCRIPTION_PLANS; creditPackages: typeof CREDIT_PACKAGES; addons: typeof ADDONS }> {
    return {
      plans: SUBSCRIPTION_PLANS,
      creditPackages: CREDIT_PACKAGES,
      addons: ADDONS
    };
  }

  async updateUserSubscription(userId: number | string, planId: string): Promise<User> {
    await connectionManager.ensureConnected();
    
    // Get plan credits from pricing config
    const plan = SUBSCRIPTION_PLANS[planId];
    
    if (!plan) {
      throw new Error(`Invalid plan ID: ${planId}`);
    }
    
    // Use repository method that handles both _id and id field lookups
    const updatedUser = await userRepository.updateSubscription(userId.toString(), planId, plan.credits);
    
    if (!updatedUser) {
      throw new Error(`User with id ${userId} not found or failed to update subscription`);
    }
    
    return convertUser(updatedUser);
  }

  async addCreditsToUser(userId: number | string, credits: number): Promise<User> {
    await connectionManager.ensureConnected();
    
    // Use repository method that handles both _id and id field lookups atomically
    const updatedUser = await userRepository.addCreditsAtomic(userId.toString(), credits);
    
    if (!updatedUser) {
      throw new Error(`User with id ${userId} not found or failed to update credits`);
    }
    
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
    const message = await dmMessageRepository.create(data);
    return convertDmMessage(message);
  }

  async updateConversationLastMessage(conversationId: string | number): Promise<void> {
    await connectionManager.ensureConnected();
    await dmConversationRepository.incrementMessageCount(conversationId.toString());
  }

  async getDmMessages(conversationId: number | string, limit: number = 10): Promise<DmMessage[]> {
    await connectionManager.ensureConnected();
    return dmMessageRepository.findMessagesForConversation(conversationId, limit);
  }

  async getConversationContext(conversationId: number): Promise<ConversationContext[]> {
    await connectionManager.ensureConnected();
    
    const contexts = await conversationContextRepository.findActiveContexts(conversationId.toString());
    
    return contexts.map(ctx => ({
      id: parseInt(ctx._id.toString().slice(-8), 16),
      conversationId: ctx.conversationId,
      contextType: ctx.contextType,
      contextValue: ctx.contextValue,
      confidence: ctx.confidence ?? 0,
      source: ctx.source ?? 'ai',
      expiresAt: ctx.expiresAt ?? null,
      createdAt: ctx.createdAt,
      updatedAt: ctx.updatedAt
    }));
  }

  async createConversationContext(data: InsertConversationContext): Promise<ConversationContext> {
    await connectionManager.ensureConnected();
    
    const saved = await conversationContextRepository.create(data);
    
    return {
      id: parseInt(saved._id.toString().slice(-8), 16),
      conversationId: saved.conversationId,
      contextType: saved.contextType,
      contextValue: saved.contextValue,
      confidence: saved.confidence ?? 0,
      source: saved.source ?? 'ai',
      expiresAt: saved.expiresAt ?? null,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt
    };
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
    return automationRuleRepository.findByGlobalTriggerTypeFormatted(triggerType);
  }

  // Admin operations - delegating to adminRepository
  async getAdmin(id: number): Promise<Admin | undefined> {
    await connectionManager.ensureConnected();
    try {
      const admin = await adminRepository.findById(id.toString());
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
      role: admin.role || 'admin',
      isActive: true
    });
    return convertAdmin(savedAdmin);
  }

  async updateAdmin(id: number, updates: Partial<Admin>): Promise<Admin> {
    await connectionManager.ensureConnected();
    const admin = await adminRepository.updateById(id.toString(), updates);
    if (!admin) throw new Error('Admin not found');
    return convertAdmin(admin);
  }

  async deleteAdmin(id: number): Promise<void> {
    await connectionManager.ensureConnected();
    await adminRepository.deactivateAdmin(id.toString());
  }

  async getAdminUsers(options: {
    page: number;
    limit: number;
    search?: string;
    role?: 'admin' | 'superadmin';
    status?: 'active' | 'inactive';
  }): Promise<{ admins: Admin[]; pagination: { page: number; limit: number; total: number; pages: number } }> {
    await connectionManager.ensureConnected();
    
    const result = await adminRepository.findWithPaginationAndFilters(options);
    
    return {
      admins: result.admins.map(admin => convertAdmin(admin)),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        pages: result.totalPages
      }
    };
  }





  // Admin session operations - delegating to adminSessionRepository
  async createAdminSession(session: InsertAdminSession): Promise<AdminSession> {
    await connectionManager.ensureConnected();
    const savedSession = await adminSessionRepository.createWithDefaults({
      adminId: session.adminId,
      token: session.token,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      expiresAt: session.expiresAt
    });
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
      targetUsers: Array.isArray(notification.targetUsers) ? notification.targetUsers : [notification.targetUsers || 'all'],
      scheduledFor: notification.scheduledFor || null,
      sentAt: notification.scheduledFor ? null : new Date(),
      isRead: false
    };
    
    const savedNotification = await notificationRepository.createWithDefaults(notificationData);
    return convertNotification(savedNotification);
  }

  async getUserNotifications(userId: string): Promise<Notification[]> {
    await connectionManager.ensureConnected();
    
    const notifications = await notificationRepository.findActiveNotifications({ limit: 50 });
    return notifications.map(notification => convertNotification(notification));
  }

  async markNotificationAsRead(notificationId: string, userId: string): Promise<void> {
    await connectionManager.ensureConnected();
    await notificationRepository.markAsRead(notificationId);
  }

  async getNotifications(userId?: number): Promise<Notification[]> {
    await connectionManager.ensureConnected();
    const notifications = userId 
      ? await notificationRepository.findByUserId(userId)
      : await notificationRepository.findAll({});
    return notifications.map(notif => convertNotification(notif));
  }

  async updateNotification(id: number, updates: Partial<Notification>): Promise<Notification> {
    await connectionManager.ensureConnected();
    const notification = await notificationRepository.updateById(id.toString(), updates);
    if (!notification) throw new Error('Notification not found');
    return convertNotification(notification);
  }

  async deleteNotification(id: number): Promise<void> {
    await connectionManager.ensureConnected();
    await notificationRepository.deleteById(id.toString());
  }

  async markNotificationRead(id: number): Promise<void> {
    await connectionManager.ensureConnected();
    await notificationRepository.markAsRead(id.toString());
  }

  // Popup operations - delegating to popupRepository
  async createPopup(popup: InsertPopup): Promise<Popup> {
    await connectionManager.ensureConnected();
    const savedPopup = await popupRepository.createWithDefaults(popup);
    return convertPopup(savedPopup);
  }

  async getActivePopups(): Promise<Popup[]> {
    await connectionManager.ensureConnected();
    const popups = await popupRepository.findActivePopups();
    return popups.map(popup => convertPopup(popup));
  }

  async getPopup(id: number): Promise<Popup | undefined> {
    await connectionManager.ensureConnected();
    const popup = await popupRepository.findById(id.toString());
    return popup ? convertPopup(popup) : undefined;
  }

  async updatePopup(id: number, updates: Partial<Popup>): Promise<Popup> {
    await connectionManager.ensureConnected();
    const popup = await popupRepository.updateById(id.toString(), updates);
    if (!popup) throw new Error('Popup not found');
    return convertPopup(popup);
  }

  async deletePopup(id: number): Promise<void> {
    await connectionManager.ensureConnected();
    await popupRepository.deleteById(id.toString());
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
    const settings = await appSettingRepository.findAll({});
    return settings.map(setting => convertAppSetting(setting));
  }

  async getPublicAppSettings(): Promise<AppSetting[]> {
    await connectionManager.ensureConnected();
    const settings = await appSettingRepository.findPublicSettings();
    return settings.map(setting => convertAppSetting(setting));
  }

  async updateAppSetting(key: string, value: string, updatedBy?: number): Promise<AppSetting> {
    await connectionManager.ensureConnected();
    const setting = await appSettingRepository.upsertSetting(key, value, { updatedBy });
    return convertAppSetting(setting);
  }

  async deleteAppSetting(key: string): Promise<void> {
    await connectionManager.ensureConnected();
    const setting = await appSettingRepository.findByKey(key);
    if (setting) {
      await appSettingRepository.deleteById(setting._id.toString());
    }
  }

  // Audit log operations - delegating to auditLogRepository
  async createAuditLog(log: InsertAuditLog & { actorType?: string; actorId?: string }): Promise<AuditLog> {
    await connectionManager.ensureConnected();
    
    const enrichedLog = { ...log };
    if (!enrichedLog.actorType) {
      enrichedLog.actorType = enrichedLog.adminId ? 'admin' : 'system';
    }
    if (!enrichedLog.actorId) {
      enrichedLog.actorId = enrichedLog.adminId ? String(enrichedLog.adminId) : 'system';
    }
    
    const savedLog = await auditLogRepository.createWithDefaults(enrichedLog);
    return convertAuditLog(savedLog);
  }

  async getAuditLogs(limit?: number, adminId?: number): Promise<AuditLog[]> {
    await connectionManager.ensureConnected();
    const logs = adminId 
      ? await auditLogRepository.findByActorId(String(adminId), { limit: limit || 100 })
      : await auditLogRepository.getRecentAuditLogs(limit || 100);
    return logs.map(log => convertAuditLog(log));
  }

  // Feedback operations - delegating to feedbackMessageRepository
  async createFeedbackMessage(feedback: InsertFeedbackMessage): Promise<FeedbackMessage> {
    await connectionManager.ensureConnected();
    const savedFeedback = await feedbackMessageRepository.createWithDefaults(feedback);
    return convertFeedbackMessage(savedFeedback);
  }

  async getFeedbackMessages(status?: string): Promise<FeedbackMessage[]> {
    await connectionManager.ensureConnected();
    const messages = status 
      ? await feedbackMessageRepository.findByStatus(status)
      : await feedbackMessageRepository.findAll({});
    return messages.map(msg => convertFeedbackMessage(msg));
  }

  async updateFeedbackMessage(id: number, updates: Partial<FeedbackMessage>): Promise<FeedbackMessage> {
    await connectionManager.ensureConnected();
    const message = await feedbackMessageRepository.updateById(id.toString(), updates);
    if (!message) throw new Error('Feedback message not found');
    return convertFeedbackMessage(message);
  }

  async deleteFeedbackMessage(id: number): Promise<void> {
    await connectionManager.ensureConnected();
    await feedbackMessageRepository.deleteById(id.toString());
  }

  // Missing automation log methods
  async getAutomationLogs(limit?: number): Promise<AutomationRule[]> {
    await connectionManager.ensureConnected();
    // Return empty array for now as automation logs schema not defined
    return [];
  }

  async createAutomationLog(log: InsertAutomationRule): Promise<AutomationRule> {
    await connectionManager.ensureConnected();
    // Return the log object for now as automation logs schema not defined
    return { id: Date.now(), workspaceId: log.workspaceId, name: log.name, ...log, createdAt: new Date() } as AutomationRule;
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
      firebaseUid: 'email_' + Date.now() + '_' + Math.random().toString(36).substring(7), // Temporary UID for manual signup
      isEmailVerified: data.isEmailVerified,
      emailVerificationCode: data.emailVerificationCode,
      emailVerificationExpiry: data.emailVerificationExpiry,
      isOnboarded: false,
      credits: 10, // Initial credits for new users
      referralCode: generateReferralCode()
    };

    const savedUser = await userRepository.createWithDefaults(userData);
    return convertUser(savedUser);
  }

  // Email verification helper methods
  async updateUserEmailVerification(id: number | string, token: string, expires: Date): Promise<User> {
    await connectionManager.ensureConnected();
    
    const user = await userRepository.updateEmailVerificationData(id.toString(), token, expires);

    if (!user) {
      throw new Error('User not found');
    }

    return convertUser(user);
  }

  async updateYouTubeWorkspaceData(updates: Partial<SocialAccount>): Promise<SocialAccount | null> {
    await connectionManager.ensureConnected();
    return socialAccountRepository.updateYouTubePlatformData(updates);
  }

  async verifyUserEmail(id: number | string, data: { password?: string; firstName?: string; lastName?: string; firebaseUid?: string }): Promise<User> {
    await connectionManager.ensureConnected();
    
    const additionalData: { displayName?: string; passwordHash?: string; firebaseUid?: string } = {};
    if (data.firstName) additionalData.displayName = data.firstName;
    if (data.password) additionalData.passwordHash = data.password; // Should be hashed before calling this
    if (data.firebaseUid) additionalData.firebaseUid = data.firebaseUid;

    const user = await userRepository.markEmailVerified(id.toString(), additionalData);

    if (!user) {
      throw new Error('User not found');
    }

    return convertUser(user);
  }

  // THUMBNAIL GENERATION SYSTEM METHODS

  // Thumbnail Projects - delegating to thumbnailProjectRepository
  async createThumbnailProject(data: InsertThumbnailProject): Promise<ThumbnailProject> {
    await connectionManager.ensureConnected();
    const project = await thumbnailProjectRepository.createWithDefaults(data);
    return thumbnailProjectRepository.convertToOutput(project);
  }

  async getThumbnailProject(projectId: number): Promise<ThumbnailProject | null> {
    await connectionManager.ensureConnected();
    const project = await thumbnailProjectRepository.findById(projectId.toString());
    if (!project) return null;
    return thumbnailProjectRepository.convertToOutput(project);
  }

  async updateThumbnailProject(projectId: number, updates: Partial<ThumbnailProject>): Promise<void> {
    await connectionManager.ensureConnected();
    await thumbnailProjectRepository.updateById(projectId.toString(), updates);
  }

  async getThumbnailProjects(workspaceId: number): Promise<ThumbnailProject[]> {
    await connectionManager.ensureConnected();
    const result = await thumbnailProjectRepository.findByWorkspaceId(workspaceId.toString());
    return result.data.map(project => thumbnailProjectRepository.convertToOutput(project));
  }

  // Thumbnail Strategies - delegating to thumbnailStrategyRepository
  async createThumbnailStrategy(data: InsertThumbnailStrategy): Promise<ThumbnailStrategy> {
    await connectionManager.ensureConnected();
    const strategy = await thumbnailStrategyRepository.createWithDefaults(data);
    return thumbnailStrategyRepository.convertToOutput(strategy);
  }

  async getThumbnailStrategy(projectId: number): Promise<ThumbnailStrategy | null> {
    await connectionManager.ensureConnected();
    const strategy = await thumbnailStrategyRepository.findByProjectId(projectId.toString());
    if (!strategy) return null;
    return thumbnailStrategyRepository.convertToOutput(strategy);
  }

  // Thumbnail Variants - delegating to thumbnailVariantRepository
  async createThumbnailVariant(data: InsertThumbnailVariant): Promise<ThumbnailVariant> {
    await connectionManager.ensureConnected();
    const variant = await thumbnailVariantRepository.createWithDefaults(data);
    return thumbnailVariantRepository.convertToOutput(variant);
  }

  async getThumbnailVariant(variantId: number): Promise<ThumbnailVariant | null> {
    await connectionManager.ensureConnected();
    const variant = await thumbnailVariantRepository.findById(variantId.toString());
    if (!variant) return null;
    return thumbnailVariantRepository.convertToOutput(variant);
  }

  async getThumbnailVariants(projectId: number): Promise<ThumbnailVariant[]> {
    await connectionManager.ensureConnected();
    const variants = await thumbnailVariantRepository.findByProjectId(projectId.toString());
    return variants.map(variant => thumbnailVariantRepository.convertToOutput(variant));
  }

  // Canvas Editor Sessions - delegating to canvasEditorSessionRepository
  async createCanvasEditorSession(data: InsertCanvasEditorSession): Promise<CanvasEditorSession> {
    await connectionManager.ensureConnected();
    const session = await canvasEditorSessionRepository.createWithDefaults(data);
    return canvasEditorSessionRepository.convertToOutput(session);
  }

  async getCanvasEditorSession(sessionId: number): Promise<CanvasEditorSession | null> {
    await connectionManager.ensureConnected();
    const session = await canvasEditorSessionRepository.findById(sessionId.toString());
    if (!session) return null;
    return canvasEditorSessionRepository.convertToOutput(session);
  }

  async updateCanvasEditorSession(sessionId: number, updates: Partial<CanvasEditorSession>): Promise<void> {
    await connectionManager.ensureConnected();
    await canvasEditorSessionRepository.updateById(sessionId.toString(), { ...updates, lastSaved: new Date() });
  }

  // Thumbnail Exports - delegating to thumbnailExportRepository
  async createThumbnailExport(data: InsertThumbnailExport): Promise<ThumbnailExport> {
    await connectionManager.ensureConnected();
    const exportDoc = await thumbnailExportRepository.createWithDefaults(data);
    return thumbnailExportRepository.convertToOutput(exportDoc);
  }

  async getThumbnailExports(sessionId: number): Promise<ThumbnailExport[]> {
    await connectionManager.ensureConnected();
    const exports = await thumbnailExportRepository.findBySessionId(sessionId.toString());
    return exports.map(exp => thumbnailExportRepository.convertToOutput(exp));
  }

  async incrementExportDownload(exportId: number): Promise<void> {
    await connectionManager.ensureConnected();
    await thumbnailExportRepository.incrementDownloadCount(exportId.toString());
  }

  // AI Features CRUD operations
  
  // Creative Brief operations - delegating to creativeBriefRepository
  async createCreativeBrief(brief: InsertCreativeBrief): Promise<CreativeBrief> {
    await connectionManager.ensureConnected();
    const saved = await creativeBriefRepository.create(brief);
    return convertCreativeBrief(saved);
  }

  async getCreativeBrief(id: number): Promise<CreativeBrief | undefined> {
    await connectionManager.ensureConnected();
    const brief = await creativeBriefRepository.findById(id.toString());
    return brief ? convertCreativeBrief(brief) : undefined;
  }

  async getCreativeBriefsByWorkspace(workspaceId: number): Promise<CreativeBrief[]> {
    await connectionManager.ensureConnected();
    const result = await creativeBriefRepository.findByWorkspaceId(workspaceId.toString(), { sortBy: 'createdAt', sortOrder: 'desc' });
    const briefs = result.data || [];
    return briefs.map(brief => convertCreativeBrief(brief));
  }

  async updateCreativeBrief(id: number, updates: Partial<CreativeBrief>): Promise<CreativeBrief> {
    await connectionManager.ensureConnected();
    const updated = await creativeBriefRepository.updateById(id.toString(), updates);
    if (!updated) throw new Error('Creative brief not found');
    return convertCreativeBrief(updated);
  }

  async deleteCreativeBrief(id: number): Promise<void> {
    await connectionManager.ensureConnected();
    await creativeBriefRepository.deleteById(id.toString());
  }

  // Content Repurpose operations - delegating to contentRepurposeRepository
  async createContentRepurpose(repurpose: InsertContentRepurpose): Promise<ContentRepurpose> {
    await connectionManager.ensureConnected();
    const saved = await contentRepurposeRepository.create(repurpose);
    return convertContentRepurpose(saved);
  }

  async getContentRepurpose(id: number): Promise<ContentRepurpose | undefined> {
    await connectionManager.ensureConnected();
    const repurpose = await contentRepurposeRepository.findById(id.toString());
    return repurpose ? convertContentRepurpose(repurpose) : undefined;
  }

  async getContentRepurposesByWorkspace(workspaceId: number): Promise<ContentRepurpose[]> {
    await connectionManager.ensureConnected();
    const result = await contentRepurposeRepository.findByWorkspaceId(workspaceId.toString(), { sortBy: 'createdAt', sortOrder: 'desc' });
    const repurposes = result.data || [];
    return repurposes.map(repurpose => convertContentRepurpose(repurpose));
  }

  async updateContentRepurpose(id: number, updates: Partial<ContentRepurpose>): Promise<ContentRepurpose> {
    await connectionManager.ensureConnected();
    const updated = await contentRepurposeRepository.updateById(id.toString(), updates);
    if (!updated) throw new Error('Content repurpose not found');
    return convertContentRepurpose(updated);
  }

  async deleteContentRepurpose(id: number): Promise<void> {
    await connectionManager.ensureConnected();
    await contentRepurposeRepository.deleteById(id.toString());
  }

  // Competitor Analysis operations - delegating to competitorAnalysisRepository
  async createCompetitorAnalysis(analysis: InsertCompetitorAnalysis): Promise<CompetitorAnalysis> {
    await connectionManager.ensureConnected();
    const saved = await competitorAnalysisRepository.create(analysis);
    return convertCompetitorAnalysis(saved);
  }

  async getCompetitorAnalysis(id: number): Promise<CompetitorAnalysis | undefined> {
    await connectionManager.ensureConnected();
    const analysis = await competitorAnalysisRepository.findById(id.toString());
    return analysis ? convertCompetitorAnalysis(analysis) : undefined;
  }

  async getCompetitorAnalysesByWorkspace(workspaceId: number): Promise<CompetitorAnalysis[]> {
    await connectionManager.ensureConnected();
    const result = await competitorAnalysisRepository.findByWorkspaceId(workspaceId.toString(), { sortBy: 'createdAt', sortOrder: 'desc' });
    const analyses = result.data || [];
    return analyses.map(analysis => convertCompetitorAnalysis(analysis));
  }

  async updateCompetitorAnalysis(id: number, updates: Partial<CompetitorAnalysis>): Promise<CompetitorAnalysis> {
    await connectionManager.ensureConnected();
    const updated = await competitorAnalysisRepository.updateById(id.toString(), updates);
    if (!updated) throw new Error('Competitor analysis not found');
    return convertCompetitorAnalysis(updated);
  }

  async deleteCompetitorAnalysis(id: number): Promise<void> {
    await connectionManager.ensureConnected();
    await competitorAnalysisRepository.deleteById(id.toString());
  }

  // Feature usage tracking methods
  async getFeatureUsage(userId: number | string): Promise<Array<{
    id: string;
    userId: string;
    featureId: string;
    usageCount: number;
    lastUsed: Date;
    metadata: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
  }>> {
    await connectionManager.ensureConnected();
    try {
      const result = await featureUsageRepository.findByUserId(userId.toString());
      const docs = result.data || [];
      return docs.map(doc => ({
        id: doc._id.toString(),
        userId: doc.userId,
        featureId: doc.featureId,
        usageCount: doc.usageCount,
        lastUsed: doc.lastUsed,
        metadata: doc.metadata,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt
      }));
    } catch (error: unknown) {
      return [];
    }
  }

  async trackFeatureUsage(userId: number | string, featureId: string, usage: Record<string, unknown> | null): Promise<void> {
    await connectionManager.ensureConnected();
    try {
      const updated = await featureUsageRepository.incrementUsage(userId.toString(), featureId);
      if (updated && usage) {
        await featureUsageRepository.updateById(updated._id.toString(), { metadata: usage });
      }
    } catch (error: unknown) {
      // Silently fail - feature usage tracking is non-critical
    }
  }

  // Waitlist Management Methods - delegating to waitlistUserRepository
  async createWaitlistUser(insertWaitlistUser: InsertWaitlistUser): Promise<WaitlistUser> {
    await connectionManager.ensureConnected();
    
    const referralCode = generateReferralCode();
    
    let referredByUserId = null;
    if (insertWaitlistUser.referredBy) {
      const referrer = await waitlistUserRepository.findByReferralCode(insertWaitlistUser.referredBy);
      if (referrer) {
        referredByUserId = referrer._id;
        await waitlistUserRepository.incrementReferralCount(referrer._id.toString());
      }
    }
    
    const savedUser = await waitlistUserRepository.createWithDefaults({
      ...insertWaitlistUser,
      referralCode,
      referredBy: referredByUserId
    });
    
    return convertWaitlistUser(savedUser);
  }

  async getWaitlistUser(id: number | string): Promise<WaitlistUser | undefined> {
    await connectionManager.ensureConnected();
    const user = await waitlistUserRepository.findById(id.toString());
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

  async updateWaitlistUser(id: number | string, updates: Partial<WaitlistUser>): Promise<WaitlistUser> {
    await connectionManager.ensureConnected();
    const user = await waitlistUserRepository.updateById(id.toString(), updates);
    if (!user) throw new Error('Waitlist user not found');
    return convertWaitlistUser(user);
  }

  async getAllWaitlistUsers(): Promise<WaitlistUser[]> {
    await connectionManager.ensureConnected();
    const users = await waitlistUserRepository.findAll({});
    return users.map(user => convertWaitlistUser(user));
  }

  async getWaitlistStats(): Promise<{ 
    totalUsers: number; 
    todaySignups: number; 
    totalReferrals: number; 
    averageReferrals: number;
    statusBreakdown: { [key: string]: number };
  }> {
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

  async promoteWaitlistUser(id: number | string): Promise<{ 
    user: User; 
    workspace: Workspace; 
    discountCode: string;
    trialDays: number;
  }> {
    await connectionManager.ensureConnected();
    return waitlistUserRepository.promoteToUser(id.toString());
  }

  // Database reset methods for fresh starts
  async clearAllUsers(): Promise<number> {
    await connectionManager.ensureConnected();
    return await userRepository.deleteMany({});
  }

  async clearAllWaitlistUsers(): Promise<number> {
    await connectionManager.ensureConnected();
    return await waitlistUserRepository.deleteMany({});
  }

  async deleteWaitlistUser(id: number | string): Promise<void> {
    await connectionManager.ensureConnected();
    const deleted = await waitlistUserRepository.deleteById(id.toString());
    if (!deleted) {
      throw new Error('Waitlist user not found');
    }
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
    return chatConversationRepository.findByUserSorted(userId, workspaceId);
  }

  async createChatConversation(conversation: InsertChatConversation): Promise<ChatConversation> {
    await connectionManager.ensureConnected();
    return chatConversationRepository.createWithDefaults({
      userId: conversation.userId.toString(),
      workspaceId: conversation.workspaceId.toString(),
      title: conversation.title
    });
  }

  async getChatMessages(conversationId: number): Promise<ChatMessage[]> {
    await connectionManager.ensureConnected();
    const messages = await chatMessageRepository.findByConversationId(conversationId);
    return messages.map(doc => ({
      id: doc.id,
      conversationId: doc.conversationId,
      role: doc.role,
      content: doc.content,
      tokensUsed: doc.tokensUsed,
      createdAt: doc.createdAt
    }));
  }

  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    await connectionManager.ensureConnected();
    
    const numericId = Date.now() % 1000000000 + Math.floor(Math.random() * 1000);
    
    const saved = await chatMessageRepository.createWithDefaults({
      ...message,
      id: numericId
    });
    return {
      id: saved.id,
      conversationId: saved.conversationId,
      role: saved.role,
      content: saved.content,
      tokensUsed: saved.tokensUsed,
      createdAt: saved.createdAt
    };
  }

  async updateChatMessage(id: number, updates: Partial<ChatMessage>): Promise<ChatMessage> {
    await connectionManager.ensureConnected();
    const updated = await chatMessageRepository.updateById(id.toString(), updates);
    if (!updated) throw new Error('Message not found');
    return {
      id: updated.id,
      conversationId: updated.conversationId,
      role: updated.role,
      content: updated.content,
      tokensUsed: updated.tokensUsed,
      createdAt: updated.createdAt
    };
  }

  async updateChatConversation(id: string | number, updates: Partial<ChatConversation>): Promise<ChatConversation> {
    await connectionManager.ensureConnected();
    
    // Validate ObjectId format if id is a string
    if (typeof id === 'string' && !mongoose.Types.ObjectId.isValid(id)) {
      throw new Error('Invalid conversation id format');
    }
    
    const updated = await chatConversationRepository.updateById(id.toString(), updates);
    if (!updated) throw new Error('Conversation not found');
    return {
      id: updated.id,
      userId: updated.userId,
      workspaceId: updated.workspaceId,
      title: updated.title,
      messageCount: updated.messageCount,
      lastMessageAt: updated.lastMessageAt,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt
    };
  }

  async deleteChatConversation(id: string | number): Promise<void> {
    await connectionManager.ensureConnected();
    
    // Validate ObjectId format if id is a string
    if (typeof id === 'string' && !mongoose.Types.ObjectId.isValid(id)) {
      throw new Error('Invalid conversation id format');
    }
    
    await chatMessageRepository.deleteMessagesByConversationId(Number(id));
    await chatConversationRepository.deleteById(id.toString());
  }
}

// Export singleton instance
export const storage = new MongoStorage();
