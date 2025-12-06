import mongoose from "mongoose";
import { ObjectId } from "mongodb";
import { IStorage } from "./storage";
import {
  User, Workspace, SocialAccount, Content, Analytics, AutomationRule,
  Suggestion, CreditTransaction, Referral, Subscription, Payment, Addon,
  WorkspaceMember, TeamInvitation, ContentRecommendation, UserContentHistory,
  Admin, AdminSession, Notification, Popup, AppSetting, AuditLog, FeedbackMessage,
  CreativeBrief, ContentRepurpose, CompetitorAnalysis,
  InsertUser, InsertWorkspace, InsertSocialAccount, InsertContent,
  InsertAutomationRule, InsertAnalytics, InsertSuggestion,
  InsertCreditTransaction, InsertReferral, InsertSubscription, InsertPayment, InsertAddon,
  InsertWorkspaceMember, InsertTeamInvitation, InsertContentRecommendation, InsertUserContentHistory,
  InsertAdmin, InsertAdminSession, InsertNotification, InsertPopup, InsertAppSetting, InsertAuditLog, InsertFeedbackMessage,
  InsertCreativeBrief, InsertContentRepurpose, InsertCompetitorAnalysis,
  WaitlistUser, InsertWaitlistUser
} from "@shared/schema";
import { tokenEncryption, EncryptedToken } from './security/token-encryption';
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
  generateReferralCode,
  encryptAndStoreToken,
  getAccessTokenFromAccount,
  getRefreshTokenFromAccount
} from './storage/converters';

// Import models from server/models/ instead of defining inline
import { User as UserModel } from './models/User/User';
import { WaitlistUser as WaitlistUserModel } from './models/User/WaitlistUser';
import { WorkspaceModel } from './models/Workspace/Workspace';
import { WorkspaceMemberModel } from './models/Workspace/WorkspaceMember';
import { TeamInvitationModel } from './models/Workspace/TeamInvitation';
import { SocialAccountModel } from './models/Social/SocialAccount';
import { ContentModel } from './models/Content/Content';
import { ContentRecommendationModel } from './models/Content/ContentRecommendation';
import { UserContentHistoryModel } from './models/Content/UserContentHistory';
import { AnalyticsModel } from './models/Analytics/Analytics';
import { SuggestionModel } from './models/Analytics/Suggestion';
import { AutomationRuleModel } from './models/Automation/AutomationRule';
import { DmConversationModel } from './models/Automation/DmConversation';
import { DmMessageModel } from './models/Automation/DmMessage';
import { ConversationContextModel } from './models/Automation/ConversationContext';
import { DmTemplateModel } from './models/Automation/DmTemplate';
import { CreditTransactionModel } from './models/Billing/CreditTransaction';
import { ReferralModel } from './models/Billing/Referral';
import { SubscriptionModel } from './models/Billing/Subscription';
import { PaymentModel } from './models/Billing/Payment';
import { AddonModel } from './models/Billing/Addon';
import { AdminModel } from './models/Admin/Admin';
import { AdminSessionModel } from './models/Admin/AdminSession';
import { NotificationModel } from './models/Admin/Notification';
import { PopupModel } from './models/Admin/Popup';
import { AppSettingModel } from './models/Admin/AppSetting';
import { AuditLogModel } from './models/Admin/AuditLog';
import { FeedbackMessageModel } from './models/Admin/FeedbackMessage';
import { CreativeBriefModel } from './models/AI/CreativeBrief';
import { ContentRepurposeModel } from './models/AI/ContentRepurpose';
import { CompetitorAnalysisModel } from './models/AI/CompetitorAnalysis';
import { FeatureUsageModel } from './models/AI/FeatureUsage';
import { ChatConversation as ChatConversationModel } from './models/Chat/ChatConversation';
import { ChatMessage as ChatMessageModel } from './models/Chat/ChatMessage';

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
import { SUBSCRIPTION_PLANS, CREDIT_PACKAGES, ADDONS } from './pricing-config';

export class MongoStorage implements IStorage {
  private isConnected = false;

  async connect() {
    // Don't reconnect if already connected and healthy
    if (this.isConnected && mongoose.connection.readyState === 1) {
      return;
    }
    
    // Don't interrupt existing connection attempts
    if (mongoose.connection.readyState === 2) {
      // Wait for connection in progress
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('MongoDB connection timeout'));
        }, 10000);
        
        mongoose.connection.once('connected', () => {
          clearTimeout(timeout);
          this.isConnected = true;
          resolve(undefined);
        });
        mongoose.connection.once('error', (error) => {
          clearTimeout(timeout);
          this.isConnected = false;
          reject(error);
        });
      });
    }
    
    try {
      // Only disconnect if connection is in bad state
      if (mongoose.connection.readyState === 3) { // Disconnected
        await mongoose.disconnect();
      }
      
      // Use environment variable or fallback to default local MongoDB
      const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://localhost:27017/veefore';
      console.log('[MONGODB] Attempting to connect to:', mongoUri);
      
      await mongoose.connect(mongoUri, {
        dbName: 'veeforedb',
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        maxPoolSize: 10,
        bufferCommands: false,
        maxIdleTimeMS: 30000,
        retryWrites: true
      });
      
      this.isConnected = true;
      console.log(`✅ Connected to MongoDB - ${mongoose.connection.db?.databaseName} database`);
    } catch (error) {
      console.error('❌ MongoDB connection error:', error);
      this.isConnected = false;
      // Don't throw the error - allow the server to continue with limited functionality
      console.log('⚠️  Server will continue with limited functionality');
    }
  }

  // User operations - delegating to userRepository
  async getUser(id: number | string): Promise<User | undefined> {
    await this.connect();
    const user = await userRepository.findById(id.toString());
    return user ? convertUser(user) : undefined;
  }

  async getUserByFirebaseUid(firebaseUid: string): Promise<User | undefined> {
    await this.connect();
    const user = await userRepository.findByFirebaseUid(firebaseUid);
    return user ? convertUser(user) : undefined;
  }

  async getUserByFirebaseId(firebaseId: string): Promise<User | undefined> {
    await this.connect();
    const user = await userRepository.findByFirebaseUid(firebaseId);
    return user ? convertUser(user) : undefined;
  }

  async updateUserLastLogin(firebaseId: string): Promise<void> {
    await this.connect();
    const user = await userRepository.findByFirebaseUid(firebaseId);
    if (user) {
      await userRepository.updateById(user._id.toString(), { lastLoginAt: new Date(), updatedAt: new Date() });
    }
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    await this.connect();
    const user = await userRepository.findByEmail(email);
    return user ? convertUser(user) : undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    await this.connect();
    const user = await userRepository.findByUsername(username);
    return user ? convertUser(user) : undefined;
  }

  async getUserByReferralCode(referralCode: string): Promise<User | undefined> {
    await this.connect();
    const user = await userRepository.findByReferralCode(referralCode);
    return user ? convertUser(user) : undefined;
  }

  async createUser(userData: InsertUser): Promise<User> {
    await this.connect();
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const referralCode = generateReferralCode();
      const user = new UserModel({
        ...userData,
        referralCode,
        isOnboarded: false,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      const savedUser = await user.save({ session });
      const convertedUser = convertUser(savedUser);
      const existingWorkspaces = await WorkspaceModel.find({ userId: convertedUser.id }).session(session);
      if (existingWorkspaces.length === 0) {
        const name = userData.displayName ? `${userData.displayName}'s Workspace` : 'My VeeFore Workspace';
        const defaultWorkspace = new WorkspaceModel({
          name,
          description: 'Default workspace for social media management',
          userId: convertedUser.id,
          theme: 'space',
          isDefault: true,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        await defaultWorkspace.save({ session });
      }
      await session.commitTransaction();
      session.endSession();
      return convertUser(savedUser);
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw new Error('Workspace creation failed during signup');
    }
  }

  async updateUser(id: number | string, updates: Partial<User>): Promise<User> {
    await this.connect();
    const user = await userRepository.updateById(id.toString(), { ...updates, updatedAt: new Date() });
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
    await this.connect();
    
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
    await this.connect();
    const workspaces = await workspaceRepository.findByUserId(userId.toString());
    return workspaces.map(ws => convertWorkspace(ws));
  }

  async getDefaultWorkspace(userId: number | string): Promise<Workspace | undefined> {
    await this.connect();
    
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
    await this.connect();
    const workspace = await workspaceRepository.create({
      ...workspaceData,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    return convertWorkspace(workspace);
  }

  async updateWorkspace(id: number | string, updates: Partial<Workspace>): Promise<Workspace> {
    await this.connect();
    const workspace = await workspaceRepository.updateById(id.toString(), { ...updates, updatedAt: new Date() });
    if (!workspace) throw new Error('Workspace not found');
    return convertWorkspace(workspace);
  }

  async updateWorkspaceCredits(id: number | string, credits: number): Promise<void> {
    await this.connect();
    
    const result = await workspaceRepository.updateById(id.toString(), { credits, updatedAt: new Date() });
    
    if (!result) {
      throw new Error('Workspace not found for credit update');
    }
  }

  async deleteWorkspace(id: number | string): Promise<void> {
    await this.connect();
    const ws = await workspaceRepository.findById(id.toString());
    if (!ws) throw new Error('Workspace not found');
    if (ws.isDefault === true) {
      throw new Error('Default workspace cannot be deleted');
    }
    await workspaceRepository.deleteById(id.toString());
  }

  async setDefaultWorkspace(userId: number | string, workspaceId: number | string): Promise<void> {
    await this.connect();
    
    // First, unset all default workspaces for this user using the model directly
    await WorkspaceModel.updateMany(
      { userId: userId.toString() },
      { isDefault: false }
    );
    
    // Then set the specified workspace as default
    await workspaceRepository.updateById(workspaceId.toString(), { isDefault: true });
  }



  // Social account operations - delegating to socialAccountRepository
  async getSocialAccount(id: number | string): Promise<SocialAccount | undefined> {
    await this.connect();
    const account = await socialAccountRepository.findById(id.toString());
    return account ? convertSocialAccount(account) : undefined;
  }

  async getSocialAccountByWorkspaceAndPlatform(workspaceId: number, platform: string): Promise<SocialAccount | undefined> {
    await this.connect();
    const account = await socialAccountRepository.findByWorkspaceAndPlatform(workspaceId.toString(), platform as any);
    return account ? convertSocialAccount(account) : undefined;
  }

  async getSocialAccountsByWorkspace(workspaceId: any): Promise<SocialAccount[]> {
    await this.connect();
    
    const workspaceIdStr = workspaceId.toString();
    const workspaceIdFirst6 = workspaceIdStr.substring(0, 6);
    
    // Tolerant lookup: Query by multiple workspace ID variations to handle legacy/truncated IDs
    const accounts = await SocialAccountModel.find({
      $or: [
        { workspaceId: workspaceIdStr },
        { workspaceId: workspaceId },
        { workspaceId: workspaceIdFirst6 },
        { workspaceId: parseInt(workspaceIdFirst6) }
      ]
    });
    
    // Auto-fix workspace IDs that are truncated
    for (const account of accounts) {
      const accountWorkspaceId = account.workspaceId?.toString() || '';
      const expectedWorkspaceId = workspaceIdStr;
      
      if (accountWorkspaceId !== expectedWorkspaceId &&
          (accountWorkspaceId === workspaceIdFirst6 ||
           accountWorkspaceId === parseInt(workspaceIdFirst6).toString())) {
        await SocialAccountModel.updateOne(
          { _id: account._id },
          { workspaceId: expectedWorkspaceId, updatedAt: new Date() }
        );
        account.workspaceId = expectedWorkspaceId;
      }
    }
    
    return accounts.map(account => convertSocialAccount(account));
  }

  /**
   * INTERNAL USE ONLY: Get social accounts with decrypted tokens
   * This method exposes actual tokens and should ONLY be used by internal services
   * like auto-sync, NOT for API responses to clients
   */
  async getSocialAccountsWithTokensInternal(workspaceId: string): Promise<any[]> {
    await this.connect();
    
    const accounts = await SocialAccountModel.find({
      workspaceId: workspaceId.toString(),
      isActive: true
    });
    
    return accounts.map(account => ({
      id: account._id.toString(),
      workspaceId: account.workspaceId,
      platform: account.platform,
      username: account.username,
      accountId: account.accountId,
      // Decrypt tokens for internal use
      accessToken: getAccessTokenFromAccount(account),
      refreshToken: getRefreshTokenFromAccount(account),
      expiresAt: account.expiresAt,
      isActive: account.isActive,
      followersCount: account.followersCount,
      mediaCount: account.mediaCount,
      profilePictureUrl: account.profilePictureUrl,
      lastSyncAt: account.lastSyncAt
    }));
  }

  async getAllSocialAccounts(): Promise<SocialAccount[]> {
    await this.connect();
    const accounts = await socialAccountRepository.findAll({ isActive: true });
    return accounts.map(account => convertSocialAccount(account));
  }



  async getSocialAccountByPlatform(workspaceId: number | string, platform: string): Promise<SocialAccount | undefined> {
    await this.connect();
    const account = await socialAccountRepository.findByWorkspaceAndPlatform(workspaceId.toString(), platform as any);
    return account ? convertSocialAccount(account) : undefined;
  }

  async getSocialAccountByPageId(pageId: string): Promise<SocialAccount | undefined> {
    await this.connect();
    
    try {
      // First try to find by pageId field
      let account = await SocialAccountModel.findOne({ 
        pageId: pageId,
        platform: 'instagram',
        isActive: true 
      });
      
      // If not found, try to find by accountId field (Instagram stores ID here)
      if (!account) {
        account = await SocialAccountModel.findOne({ 
          accountId: pageId,
          platform: 'instagram',
          isActive: true 
        });
      }
      
      return account ? convertSocialAccount(account) : undefined;
    } catch (error) {
      return undefined;
    }
  }

  async getSocialConnections(userId: number | string): Promise<SocialAccount[]> {
    await this.connect();
    // Get all workspaces for this user
    const userWorkspaces = await this.getWorkspacesByUserId(userId);
    const workspaceIds = userWorkspaces.map(w => w.id);
    
    // Get all social accounts for these workspaces
    const accounts = await SocialAccountModel.find({ 
      workspaceId: { $in: workspaceIds } 
    });
    
    return accounts.map(account => convertSocialAccount(account));
  }

  async createSocialAccount(account: InsertSocialAccount): Promise<SocialAccount> {
    await this.connect();
    
    // SECURITY: Encrypt tokens before storing in database
    const socialAccountData: any = {
      ...account,
      isActive: true,
      totalShares: 0,
      totalSaves: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Remove any id or _id fields that might have been passed in
    delete socialAccountData.id;
    delete socialAccountData._id;

    // Encrypt access token if provided
    if (account.accessToken) {
      socialAccountData.encryptedAccessToken = encryptAndStoreToken(account.accessToken);
      delete socialAccountData.accessToken;
    }

    // Encrypt refresh token if provided  
    if (account.refreshToken) {
      socialAccountData.encryptedRefreshToken = encryptAndStoreToken(account.refreshToken);
      delete socialAccountData.refreshToken;
    }

    const newAccount = await socialAccountRepository.create(socialAccountData);
    return convertSocialAccount(newAccount);
  }

  async updateSocialAccount(id: number | string, updates: Partial<SocialAccount>): Promise<SocialAccount> {
    await this.connect();
    
    // SECURITY: Prepare encrypted updates for tokens
    const encryptedUpdates: any = { ...updates, updatedAt: new Date() };

    // Encrypt access token if being updated
    if (updates.accessToken) {
      encryptedUpdates.encryptedAccessToken = encryptAndStoreToken(updates.accessToken);
      delete encryptedUpdates.accessToken;
    }

    // Encrypt refresh token if being updated
    if (updates.refreshToken) {
      encryptedUpdates.encryptedRefreshToken = encryptAndStoreToken(updates.refreshToken);
      delete encryptedUpdates.refreshToken;
    }
    
    const updatedAccount = await socialAccountRepository.updateById(id.toString(), encryptedUpdates);
    
    if (!updatedAccount) {
      throw new Error('Social account not found');
    }
    
    return convertSocialAccount(updatedAccount);
  }

  async deleteSocialAccount(id: number | string): Promise<void> {
    await this.connect();
    
    const deleted = await socialAccountRepository.deleteById(id.toString());
    
    if (!deleted) {
      throw new Error(`Social account with id ${id} not found`);
    }
  }

  // Content operations - delegating to contentRepository
  async getContent(id: number): Promise<Content | undefined> {
    await this.connect();
    const content = await contentRepository.findById(id.toString());
    return content ? convertContent(content) : undefined;
  }

  async getContentByWorkspace(workspaceId: number, limit?: number): Promise<Content[]> {
    await this.connect();
    const contents = await contentRepository.findByWorkspaceId(
      workspaceId.toString(),
      limit ? { limit, sortBy: 'createdAt', sortOrder: 'desc' } : { sortBy: 'createdAt', sortOrder: 'desc' }
    );
    return contents.map(content => convertContent(content));
  }

  async getScheduledContent(workspaceId?: number): Promise<Content[]> {
    await this.connect();
    const contents = await contentRepository.findScheduledContent(workspaceId?.toString());
    return contents.map(content => convertContent(content));
  }

  async createContent(content: InsertContent): Promise<Content> {
    await this.connect();
    
    const contentData = {
      workspaceId: content.workspaceId.toString(),
      type: content.type,
      title: content.title,
      description: content.description,
      contentData: content.contentData || {},
      platform: content.platform,
      status: content.status || (content.scheduledAt ? 'scheduled' : 'ready'),
      scheduledAt: content.scheduledAt,
      creditsUsed: content.creditsUsed || 0,
      prompt: content.prompt,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const saved = await contentRepository.create(contentData);
    
    return convertContent(saved);
  }

  async updateContent(id: number, updates: Partial<Content>): Promise<Content> {
    await this.connect();
    const content = await contentRepository.updateById(id.toString(), { ...updates, updatedAt: new Date() });
    if (!content) throw new Error('Content not found');
    return convertContent(content);
  }

  async createPost(postData: any): Promise<any> {
    await this.connect();
    
    const post = {
      workspaceId: postData.workspaceId.toString(),
      content: postData.content,
      media: postData.media || [],
      hashtags: postData.hashtags || '',
      firstComment: postData.firstComment || '',
      location: postData.location || '',
      accounts: postData.accounts || [],
      status: postData.status || 'draft',
      publishedAt: postData.publishedAt || null,
      createdAt: postData.createdAt || new Date(),
      updatedAt: new Date()
    };

    const postDoc = new ContentModel(post);
    const saved = await postDoc.save();
    
    return {
      id: saved._id.toString(),
      ...post
    };
  }

  async deleteContent(id: number | string): Promise<void> {
    await this.connect();
    
    const deleted = await contentRepository.deleteById(id.toString());
    
    if (!deleted) {
      throw new Error(`Content with id ${id} not found`);
    }
  }

  // Analytics operations - delegating to analyticsRepository
  async getAnalytics(workspaceId: number | string, platform?: string, days?: number): Promise<Analytics[]> {
    await this.connect();
    
    const workspaceIdStr = workspaceId.toString();
    
    let analyticsData;
    if (platform) {
      const result = await analyticsRepository.findByWorkspaceAndPlatform(workspaceIdStr, platform);
      analyticsData = result;
    } else {
      const result = await analyticsRepository.findByWorkspaceId(workspaceIdStr);
      analyticsData = result;
    }
    
    if (days && analyticsData.length > 0) {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - days);
      analyticsData = analyticsData.filter(doc => doc.date >= daysAgo);
    }
    
    return analyticsData.map(doc => convertAnalytics(doc));
  }

  async createAnalytics(analytics: InsertAnalytics): Promise<Analytics> {
    await this.connect();
    const analyticsDoc = await analyticsRepository.create({
      ...analytics,
      createdAt: new Date()
    });
    return convertAnalytics(analyticsDoc);
  }

  async getLatestAnalytics(workspaceId: number, platform: string): Promise<Analytics | undefined> {
    await this.connect();
    const analytics = await analyticsRepository.findLatestByPlatform(workspaceId.toString(), platform);
    return analytics ? convertAnalytics(analytics) : undefined;
  }

  async getAutomationRules(workspaceId: number | string): Promise<AutomationRule[]> {
    await this.connect();
    try {
      const result = await automationRuleRepository.findByWorkspaceId(workspaceId.toString(), { limit: 10000 });
      const rules = result.data;
      
      return rules.map(rule => {
        const trigger = rule.trigger || {};
        const action = rule.action || {};
        
        let displayResponses = [];
        let displayDmResponses = [];
        let targetMediaIds = [];
        
        if (rule.responses) {
          if (typeof rule.responses === 'object' && rule.responses.responses) {
            displayResponses = rule.responses.responses || [];
            displayDmResponses = rule.responses.dmResponses || [];
          } else if (Array.isArray(rule.responses)) {
            displayResponses = rule.responses;
          }
        }
        
        if (rule.targetMediaIds) {
          targetMediaIds = rule.targetMediaIds || [];
        }
        
        return {
          id: rule._id.toString(),
          name: rule.name || '',
          workspaceId: typeof workspaceId === 'string' ? workspaceId : parseInt(rule.workspaceId),
          description: rule.description || null,
          isActive: rule.isActive !== false,
          type: rule.type || trigger.type || action.type || 'dm',
          postInteraction: rule.postInteraction,
          trigger: trigger,
          triggers: rule.triggers || trigger,
          action: action,
          keywords: rule.keywords || [],
          responses: displayResponses,
          dmResponses: displayDmResponses,
          targetMediaIds: targetMediaIds,
          lastRun: rule.lastRun ? new Date(rule.lastRun) : null,
          nextRun: rule.nextRun ? new Date(rule.nextRun) : null,
          createdAt: rule.createdAt ? new Date(rule.createdAt) : new Date(),
          updatedAt: rule.updatedAt ? new Date(rule.updatedAt) : new Date()
        };
      });
    } catch (error: any) {
      return [];
    }
  }

  async getActiveAutomationRules(): Promise<AutomationRule[]> {
    await this.connect();
    try {
      const result = await automationRuleRepository.findActiveRules({ limit: 10000 });
      const rules = result.data;
      
      return rules.map(rule => ({
        id: rule._id.toString(),
        name: rule.name || '',
        workspaceId: parseInt(rule.workspaceId),
        description: rule.description || null,
        isActive: rule.isActive !== false,
        trigger: rule.trigger || {},
        action: rule.action || {},
        lastRun: rule.lastRun ? new Date(rule.lastRun) : null,
        nextRun: rule.nextRun ? new Date(rule.nextRun) : null,
        createdAt: rule.createdAt ? new Date(rule.createdAt) : new Date(),
        updatedAt: rule.updatedAt ? new Date(rule.updatedAt) : new Date()
      }));
    } catch (error: any) {
      return [];
    }
  }

  async getAutomationRulesByType(type: string): Promise<AutomationRule[]> {
    await this.connect();
    try {
      const result = await automationRuleRepository.findByType(type, { limit: 10000 });
      const rules = result.data.filter(rule => rule.isActive !== false);
      
      return rules.map(rule => {
        const trigger = rule.trigger || {};
        const action = rule.action || {};
        
        return {
          id: rule._id.toString(),
          name: rule.name || '',
          workspaceId: rule.workspaceId,
          description: rule.description || null,
          isActive: rule.isActive !== false,
          type: trigger.type || action.type || rule.type || type,
          trigger: trigger,
          action: action,
          lastRun: rule.lastRun ? new Date(rule.lastRun) : null,
          nextRun: rule.nextRun ? new Date(rule.nextRun) : null,
          createdAt: rule.createdAt ? new Date(rule.createdAt) : new Date(),
          updatedAt: rule.updatedAt ? new Date(rule.updatedAt) : new Date()
        };
      });
    } catch (error: any) {
      return [];
    }
  }

  async createAutomationRule(rule: InsertAutomationRule): Promise<AutomationRule> {
    await this.connect();
    try {
      const automationRuleData = {
        name: rule.name || 'Instagram Auto-Reply',
        workspaceId: rule.workspaceId.toString(),
        description: rule.description || null,
        isActive: rule.isActive !== false,
        type: rule.type || 'comment_dm',
        trigger: rule.trigger || {},
        action: rule.action || {},
        keywords: rule.keywords || [],
        responses: rule.responses || {},
        targetMediaIds: rule.targetMediaIds || [],
        lastRun: null,
        nextRun: rule.nextRun || null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const savedRule = await automationRuleRepository.create(automationRuleData);
      
      return {
        id: savedRule._id.toString(),
        name: savedRule.name,
        workspaceId: parseInt(savedRule.workspaceId),
        description: savedRule.description,
        isActive: savedRule.isActive,
        type: savedRule.type,
        trigger: savedRule.trigger,
        action: savedRule.action,
        keywords: savedRule.keywords,
        responses: savedRule.responses,
        targetMediaIds: savedRule.targetMediaIds,
        lastRun: savedRule.lastRun,
        nextRun: savedRule.nextRun,
        createdAt: savedRule.createdAt,
        updatedAt: savedRule.updatedAt
      };
    } catch (error: any) {
      throw new Error(`Failed to create automation rule: ${error.message}`);
    }
  }

  async updateAutomationRule(id: string, updates: Partial<AutomationRule>): Promise<AutomationRule> {
    await this.connect();
    try {
      const updateData: any = {
        ...updates,
        updatedAt: new Date()
      };
      
      delete updateData.id;
      delete updateData.createdAt;
      
      const result = await automationRuleRepository.updateById(id, updateData);
      
      if (!result) {
        throw new Error('Automation rule not found');
      }
      
      return {
        id: result._id.toString(),
        name: result.name,
        workspaceId: parseInt(result.workspaceId),
        description: result.description || null,
        isActive: result.isActive !== false,
        trigger: result.trigger || {},
        action: result.action || {},
        lastRun: result.lastRun ? new Date(result.lastRun) : null,
        nextRun: result.nextRun ? new Date(result.nextRun) : null,
        createdAt: result.createdAt ? new Date(result.createdAt) : new Date(),
        updatedAt: result.updatedAt ? new Date(result.updatedAt) : new Date()
      };
    } catch (error: any) {
      throw new Error(`Failed to update automation rule: ${error.message}`);
    }
  }

  async deleteAutomationRule(id: string): Promise<void> {
    await this.connect();
    try {
      const deleted = await automationRuleRepository.deleteById(id);
      
      if (!deleted) {
        throw new Error('Automation rule not found');
      }
    } catch (error: any) {
      throw new Error(`Failed to delete automation rule: ${error.message}`);
    }
  }

  // Conversation Management Methods





  async clearWorkspaceConversations(workspaceId: string): Promise<void> {
    await this.connect();
    
    const ConversationModel = mongoose.models.DmConversation;
    const MessageModel = mongoose.models.DmMessage;
    const ContextModel = mongoose.models.ConversationContext;
    
    if (ConversationModel) {
      // Get conversation IDs to clean up related data
      const conversations = await ConversationModel.find({ workspaceId });
      const conversationIds = conversations.map(c => c._id.toString());
      
      // Delete messages and context for these conversations
      if (MessageModel) {
        await MessageModel.deleteMany({ conversationId: { $in: conversationIds } });
      }
      if (ContextModel) {
        await ContextModel.deleteMany({ conversationId: { $in: conversationIds } });
      }
      
      // Delete conversations
      await ConversationModel.deleteMany({ workspaceId });
    }
  }

  async getSuggestions(workspaceId: number, type?: string): Promise<Suggestion[]> {
    await this.connect();
    
    const suggestions = await suggestionRepository.findByWorkspaceId(workspaceId.toString());
    
    const filtered = type ? suggestions.filter(s => s.type === type) : suggestions;
    
    return filtered.map(doc => convertSuggestion(doc));
  }

  async getValidSuggestions(workspaceId: number): Promise<Suggestion[]> {
    await this.connect();
    
    const suggestions = await suggestionRepository.findUnusedByWorkspace(workspaceId.toString());
    
    const now = new Date();
    const validSuggestions = suggestions.filter(s => 
      !s.validUntil || new Date(s.validUntil) > now
    );
    
    return validSuggestions.map(doc => convertSuggestion(doc));
  }

  async createSuggestion(suggestion: InsertSuggestion): Promise<Suggestion> {
    await this.connect();
    
    const saved = await suggestionRepository.create({
      workspaceId: suggestion.workspaceId.toString(),
      type: suggestion.type,
      data: suggestion.data,
      confidence: suggestion.confidence,
      isUsed: false,
      validUntil: suggestion.validUntil,
      createdAt: new Date()
    });
    
    return convertSuggestion(saved);
  }

  async markSuggestionUsed(id: number): Promise<Suggestion> {
    await this.connect();
    
    const updated = await suggestionRepository.markAsUsed(id.toString());
    
    if (!updated) {
      throw new Error('Suggestion not found');
    }
    
    return convertSuggestion(updated);
  }

  async clearSuggestionsByWorkspace(workspaceId: string | number): Promise<void> {
    await this.connect();
    
    await suggestionRepository.deleteMany({ workspaceId: workspaceId.toString() });
  }

  async getCreditTransactions(userId: number, limit = 50): Promise<CreditTransaction[]> {
    await this.connect();
    
    try {
      const transactions = await creditTransactionRepository.getRecentTransactions(userId.toString(), limit);
      return transactions.map(transaction => convertCreditTransaction(transaction));
    } catch (error) {
      return [];
    }
  }

  async createCreditTransaction(transaction: InsertCreditTransaction): Promise<CreditTransaction> {
    await this.connect();
    const created = await creditTransactionRepository.create({
      ...transaction,
      createdAt: new Date()
    });
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
    await this.connect();
    const subscription = await subscriptionRepository.findByUserId(userId.toString());
    return subscription ? convertSubscription(subscription) : undefined;
  }

  async createSubscription(insertSubscription: InsertSubscription): Promise<Subscription> {
    await this.connect();
    const subscription = await subscriptionRepository.create(insertSubscription);
    return convertSubscription(subscription);
  }

  async updateSubscriptionStatus(userId: number, status: string, canceledAt?: Date): Promise<Subscription> {
    await this.connect();
    const subscription = await subscriptionRepository.updateOne(
      { userId: userId.toString() },
      { status, canceledAt, updatedAt: new Date() }
    );
    if (!subscription) throw new Error('Subscription not found');
    return convertSubscription(subscription);
  }

  async getActiveSubscription(userId: number): Promise<Subscription | undefined> {
    await this.connect();
    const subscription = await subscriptionRepository.findActiveByUserId(userId.toString());
    return subscription ? convertSubscription(subscription) : undefined;
  }

  // Payment operations - delegating to paymentRepository
  async createPayment(insertPayment: InsertPayment): Promise<Payment> {
    await this.connect();
    const payment = await paymentRepository.create(insertPayment);
    return convertPayment(payment);
  }

  async getPaymentsByUser(userId: number): Promise<Payment[]> {
    await this.connect();
    const result = await paymentRepository.findByUserId(userId.toString());
    return result.data.map(payment => convertPayment(payment));
  }

  // Addon operations - delegating to addonRepository
  async getUserAddons(userId: number | string): Promise<Addon[]> {
    await this.connect();
    
    const result = await addonRepository.findByUserId(userId.toString());
    const addons = result.data;
    
    // Filter for active addons after retrieval
    const activeAddons = addons.filter(addon => addon.isActive !== false);
    
    return activeAddons.map(addon => convertAddon(addon));
  }

  async getActiveAddonsByUser(userId: number | string): Promise<Addon[]> {
    await this.connect();
    
    const userIdStr = userId.toString();
    const addons = await addonRepository.findActiveByUserId(userIdStr);
    
    return addons.map(addon => convertAddon(addon));
  }

  async createAddon(insertAddon: InsertAddon): Promise<Addon> {
    await this.connect();
    
    const addonData = {
      ...insertAddon,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const addon = new AddonModel(addonData);
    
    const savedAddon = await addon.save();
    return convertAddon(savedAddon);
  }

  async getSuggestionsByWorkspace(workspaceId: string | number): Promise<Suggestion[]> {
    await this.connect();
    const suggestions = await suggestionRepository.findByWorkspaceId(
      workspaceId.toString(),
      { sortBy: 'createdAt', sortOrder: 'desc' }
    );
    return suggestions.map(doc => convertSuggestion(doc));
  }

  async getAnalyticsByWorkspace(workspaceId: string | number): Promise<Analytics[]> {
    await this.connect();
    const analytics = await AnalyticsModel.find({ workspaceId: workspaceId.toString() })
      .sort({ date: -1 });
    return analytics.map(convertAnalytics);
  }

  // Team management operations
  async getWorkspaceByInviteCode(inviteCode: string): Promise<Workspace | undefined> {
    await this.connect();
    const workspace = await WorkspaceModel.findOne({ inviteCode });
    return workspace ? convertWorkspace(workspace) : undefined;
  }

  async getWorkspaceMember(workspaceId: number | string, userId: number | string): Promise<WorkspaceMember | undefined> {
    await this.connect();
    const member = await workspaceMemberRepository.findByWorkspaceAndUser(
      workspaceId.toString(),
      userId.toString()
    );
    return member ? convertWorkspaceMember(member) : undefined;
  }

  async getWorkspaceMembers(workspaceId: number | string): Promise<(WorkspaceMember & { user: User })[]> {
    await this.connect();
    
    try {
      const members = await workspaceMemberRepository.findByWorkspaceId(workspaceId.toString());
      
      const result = [];
      for (const member of members) {
        const user = await this.getUser(member.userId);
        if (user) {
          result.push({
            ...convertWorkspaceMember(member),
            user
          });
        }
      }
      
      // If no members found, add the workspace owner as a member (simplified approach)
      if (result.length === 0) {
        const workspace = await this.getWorkspace(workspaceId);
        if (workspace) {
          const owner = await this.getUser(workspace.userId);
          if (owner) {
            const ownerMember: WorkspaceMember & { user: User } = {
              id: 1,
              userId: workspace.userId,
              workspaceId: parseInt(workspaceId.toString()),
              role: 'Owner',
              status: 'active',
              permissions: null,
              invitedBy: null,
              joinedAt: workspace.createdAt,
              createdAt: workspace.createdAt,
              updatedAt: workspace.updatedAt,
              user: owner
            };
            result.push(ownerMember);
          }
        }
      }
      
      return result;
    } catch (error) {
      // Return just the owner as fallback
      const workspace = await this.getWorkspace(workspaceId);
      if (workspace) {
        const owner = await this.getUser(workspace.userId);
        if (owner) {
          const ownerMember: WorkspaceMember & { user: User } = {
            id: 1,
            userId: typeof workspace.userId === 'string' ? parseInt(workspace.userId) : workspace.userId,
            workspaceId: typeof workspaceId === 'string' ? parseInt(workspaceId) : workspaceId,
            role: 'Owner',
            status: 'active',
            permissions: null,
            invitedBy: null,
            joinedAt: workspace.createdAt,
            createdAt: workspace.createdAt,
            updatedAt: workspace.updatedAt,
            user: owner
          };
          return [ownerMember];
        }
      }
      return [];
    }
  }

  async addWorkspaceMember(member: InsertWorkspaceMember): Promise<WorkspaceMember> {
    await this.connect();
    
    const memberData = {
      ...member,
      id: Date.now(),
      status: 'active',
      joinedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const newMember = await workspaceMemberRepository.create(memberData);
    return convertWorkspaceMember(newMember);
  }

  async updateWorkspaceMember(workspaceId: number | string, userId: number | string, updates: Partial<WorkspaceMember>): Promise<WorkspaceMember> {
    await this.connect();
    
    const member = await workspaceMemberRepository.findByWorkspaceAndUser(
      workspaceId.toString(),
      userId.toString()
    );
    
    if (!member) {
      throw new Error(`Workspace member not found`);
    }
    
    const updatedMember = await workspaceMemberRepository.updateById(
      member._id.toString(),
      { ...updates, updatedAt: new Date() }
    );
    
    if (!updatedMember) {
      throw new Error(`Workspace member not found`);
    }
    
    return convertWorkspaceMember(updatedMember);
  }

  async removeWorkspaceMember(workspaceId: number | string, userId: number | string): Promise<void> {
    await this.connect();
    const member = await workspaceMemberRepository.findByWorkspaceAndUser(
      workspaceId.toString(),
      userId.toString()
    );
    if (member) {
      await workspaceMemberRepository.deleteById(member._id.toString());
    }
  }

  async createTeamInvitation(invitation: InsertTeamInvitation): Promise<TeamInvitation> {
    await this.connect();
    
    const invitationData = {
      ...invitation,
      id: Date.now(),
      status: 'pending',
      createdAt: new Date()
    };

    const newInvitation = await teamInvitationRepository.create(invitationData);
    return convertTeamInvitation(newInvitation);
  }

  async getWorkspaceInvitations(workspaceId: number): Promise<TeamInvitation[]> {
    await this.connect();
    
    const invitations = await teamInvitationRepository.findPendingByWorkspace(
      workspaceId.toString(),
      { sortBy: 'createdAt', sortOrder: 'desc' }
    );
    
    return invitations.map(doc => convertTeamInvitation(doc));
  }

  async getTeamInvitation(id: number): Promise<TeamInvitation | undefined> {
    await this.connect();
    const invitation = await teamInvitationRepository.findOne({ id });
    return invitation ? convertTeamInvitation(invitation) : undefined;
  }

  async getTeamInvitationByToken(token: string): Promise<TeamInvitation | undefined> {
    await this.connect();
    const invitation = await teamInvitationRepository.findByToken(token);
    return invitation ? convertTeamInvitation(invitation) : undefined;
  }

  async getTeamInvitations(workspaceId: number | string, status?: string): Promise<TeamInvitation[]> {
    await this.connect();
    
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
    await this.connect();
    
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
    await this.connect();
    const recommendation = await contentRecommendationRepository.findById(id.toString());
    return recommendation ? convertContentRecommendation(recommendation) : undefined;
  }

  async getContentRecommendations(workspaceId: number, type?: string, limit?: number): Promise<ContentRecommendation[]> {
    await this.connect();
    
    const options: any = { sortBy: 'createdAt', sortOrder: 'desc' };
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
    await this.connect();
    const saved = await contentRecommendationRepository.create({
      ...insertRecommendation,
      workspaceId: insertRecommendation.workspaceId.toString(),
      createdAt: new Date(),
      updatedAt: new Date()
    });
    return convertContentRecommendation(saved);
  }

  async updateContentRecommendation(id: number, updates: Partial<ContentRecommendation>): Promise<ContentRecommendation> {
    await this.connect();
    const updated = await contentRecommendationRepository.updateById(
      id.toString(),
      { ...updates, updatedAt: new Date() }
    );
    if (!updated) {
      throw new Error(`Content recommendation ${id} not found`);
    }
    return convertContentRecommendation(updated);
  }

  async deleteContentRecommendation(id: number): Promise<void> {
    await this.connect();
    const deleted = await contentRecommendationRepository.deleteById(id.toString());
    if (!deleted) {
      throw new Error(`Content recommendation ${id} not found`);
    }
  }

  async getUserContentHistory(userId: number, workspaceId: number): Promise<UserContentHistory[]> {
    await this.connect();
    const history = await userContentHistoryRepository.findMany(
      { userId: userId.toString(), workspaceId: workspaceId.toString() },
      { sortBy: 'createdAt', sortOrder: 'desc' }
    );
    return history.map(h => convertUserContentHistory(h));
  }

  async createUserContentHistory(insertHistory: InsertUserContentHistory): Promise<UserContentHistory> {
    await this.connect();
    const saved = await userContentHistoryRepository.create({
      ...insertHistory,
      userId: insertHistory.userId.toString(),
      workspaceId: insertHistory.workspaceId.toString(),
      createdAt: new Date()
    });
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

  async updateUserSubscription(userId: number | string, planId: string): Promise<User> {
    await this.connect();
    
    let user;
    try {
      // Try by MongoDB _id first (ObjectId format)
      user = await UserModel.findById(userId);
    } catch (objectIdError) {
      // If ObjectId fails, try by the 'id' field
      const userIdStr = userId.toString();
      user = await UserModel.findOne({ id: userIdStr });
    }
    
    if (!user) {
      throw new Error(`User with id ${userId} not found`);
    }
    
    // Get plan credits from pricing config
    const { SUBSCRIPTION_PLANS } = await import('./pricing-config');
    const plan = SUBSCRIPTION_PLANS[planId];
    
    if (!plan) {
      throw new Error(`Invalid plan ID: ${planId}`);
    }
    
    // Update the user's subscription plan AND ADD the monthly credits (additive)
    const updatedUser = await UserModel.findByIdAndUpdate(
      user._id,
      { 
        plan: planId, 
        $inc: { credits: plan.credits },  // Add to existing credits instead of replacing
        updatedAt: new Date() 
      },
      { new: true }
    );
    
    if (!updatedUser) {
      throw new Error(`Failed to update user subscription for id ${userId}`);
    }
    
    return convertUser(updatedUser);
  }

  async addCreditsToUser(userId: number | string, credits: number): Promise<User> {
    await this.connect();
    
    let user;
    try {
      // Try by MongoDB _id first (ObjectId format)
      user = await UserModel.findById(userId);
    } catch (objectIdError) {
      // If ObjectId fails, try by the 'id' field
      const userIdStr = userId.toString();
      user = await UserModel.findOne({ id: userIdStr });
    }
    
    if (!user) {
      throw new Error(`User with id ${userId} not found`);
    }
    
    const currentCredits = user.credits || 0;
    const newCredits = currentCredits + credits;
    
    let updatedUser;
    try {
      // Try updating by MongoDB _id first
      updatedUser = await UserModel.findByIdAndUpdate(
        user._id,
        { credits: newCredits, updatedAt: new Date() },
        { new: true }
      );
    } catch (error) {
      // Fallback to updating by id field
      updatedUser = await UserModel.findOneAndUpdate(
        { id: user.id },
        { credits: newCredits, updatedAt: new Date() },
        { new: true }
      );
    }
    
    if (!updatedUser) {
      throw new Error(`Failed to update credits for user ${userId}`);
    }
    
    return convertUser(updatedUser);
  }

  // DM Conversation Memory Methods - delegating to dmConversationRepository and dmMessageRepository
  async getDmConversation(workspaceId: string, platform: string, participantId: string): Promise<any> {
    await this.connect();
    const conversation = await dmConversationRepository.findByWorkspaceAndParticipant(workspaceId, participantId);
    return conversation ? convertDmConversation(conversation) : null;
  }

  async createDmConversation(data: any): Promise<any> {
    await this.connect();
    const conversation = await dmConversationRepository.create(data);
    return convertDmConversation(conversation);
  }

  async createDmMessage(data: any): Promise<any> {
    await this.connect();
    const message = await dmMessageRepository.create(data);
    return convertDmMessage(message);
  }

  async updateConversationLastMessage(conversationId: string | number): Promise<void> {
    await this.connect();
    await dmConversationRepository.incrementMessageCount(conversationId.toString());
  }

  async getDmMessages(conversationId: number | string, limit: number = 10): Promise<any[]> {
    await this.connect();
    
    // Try multiple message models and collections
    const messageModels = ['DmMessage', 'Message', 'InstagramMessage', 'ConversationMessage'];
    let allMessages: any[] = [];
    
    for (const modelName of messageModels) {
      try {
        const Model = mongoose.models[modelName];
        if (Model) {
          const messages = await Model.find({
            $or: [
              { conversationId: conversationId },
              { conversationId: conversationId.toString() },
              { conversation: conversationId },
              { conversation: conversationId.toString() }
            ]
          }).sort({ createdAt: -1 });
          
          allMessages.push(...messages);
        }
      } catch (error) {
        // Continue to next model
      }
    }
    
    // Also search generic message collections
    try {
      const db = mongoose.connection.db;
      const collections = await db.listCollections().toArray();
      
      for (const collection of collections) {
        if (collection.name.toLowerCase().includes('message') || 
            collection.name.toLowerCase().includes('dm')) {
          try {
            const docs = await db.collection(collection.name).find({
              $or: [
                { conversationId: conversationId },
                { conversationId: conversationId.toString() },
                { conversation: conversationId },
                { conversation: conversationId.toString() }
              ]
            }).limit(20).toArray();
            
            if (docs.length > 0) {
              allMessages.push(...docs.map(doc => ({
                ...doc,
                _id: doc._id,
                collectionSource: collection.name
              })));
            }
          } catch (err) {
            // Continue to next collection
          }
        }
      }
    } catch (error) {
      // Continue without additional collections
    }
    
    // Sort by creation date and limit
    const sortedMessages = allMessages
      .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())
      .slice(0, limit);
    
    return sortedMessages.map(msg => ({
      id: msg._id.toString(),
      conversationId: msg.conversationId || msg.conversation,
      messageId: msg.messageId || msg.id,
      sender: msg.sender || msg.from || 'user',
      content: msg.content || msg.message || msg.text,
      messageType: msg.messageType || msg.type || 'text',
      sentiment: msg.sentiment || 'neutral',
      topics: msg.topics || [],
      aiResponse: msg.aiResponse,
      automationRuleId: msg.automationRuleId,
      createdAt: msg.createdAt,
      collectionSource: msg.collectionSource
    }));
  }

  async getConversationContext(conversationId: number): Promise<any[]> {
    await this.connect();
    
    const context = await ConversationContextModel.find({
      conversationId,
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } }
      ]
    }).sort({ extractedAt: -1 });
    
    return context.map(ctx => ({
      id: ctx._id.toString(),
      conversationId: ctx.conversationId,
      contextType: ctx.contextType,
      contextValue: ctx.contextValue,
      confidence: ctx.confidence,
      extractedAt: ctx.extractedAt,
      expiresAt: ctx.expiresAt
    }));
  }

  async createConversationContext(data: any): Promise<any> {
    await this.connect();
    
    const context = new ConversationContextModel(data);
    const saved = await context.save();
    
    return {
      id: saved._id.toString(),
      conversationId: saved.conversationId,
      contextType: saved.contextType,
      contextValue: saved.contextValue,
      confidence: saved.confidence,
      extractedAt: saved.extractedAt,
      expiresAt: saved.expiresAt
    };
  }

  async cleanupExpiredContext(cutoffDate: Date): Promise<void> {
    await this.connect();
    
    await ConversationContextModel.deleteMany({
      expiresAt: { $lt: cutoffDate }
    });
  }

  async cleanupOldMessages(cutoffDate: Date): Promise<void> {
    await this.connect();
    
    await DmMessageModel.deleteMany({
      createdAt: { $lt: cutoffDate }
    });
  }

  async getConversationStats(workspaceId: string): Promise<{
    totalConversations: number;
    activeConversations: number;
    totalMessages: number;
    averageResponseTime: number;
  }> {
    await this.connect();
    
    const totalConversations = await DmConversationModel.countDocuments({ workspaceId });
    const activeConversations = await DmConversationModel.countDocuments({ 
      workspaceId, 
      isActive: true,
      lastMessageAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    });
    const totalMessages = await DmMessageModel.countDocuments({
      conversationId: { $in: await DmConversationModel.find({ workspaceId }).distinct('_id') }
    });
    
    return {
      totalConversations,
      activeConversations,
      totalMessages,
      averageResponseTime: 0 // Placeholder for now
    };
  }

  // Add missing method for getDmConversations
  async getDmConversations(workspaceId: string, limit: number = 50): Promise<any[]> {
    await this.connect();
    
    // Access all DM conversation models to find authentic data
    const models = ['DmConversation', 'Conversation', 'InstagramConversation'];
    let allConversations: any[] = [];
    
    for (const modelName of models) {
      try {
        const Model = mongoose.models[modelName];
        if (Model) {
          const conversations = await Model.find({ 
            $or: [
              { workspaceId: workspaceId },
              { workspaceId: workspaceId.toString() }
            ]
          }).sort({ createdAt: -1 });
          
          allConversations.push(...conversations);
        }
      } catch (error) {
        // Continue to next model
      }
    }
    
    // Also check generic collections that might contain authentic Instagram DMs
    try {
      const db = mongoose.connection.db;
      const collections = await db.listCollections().toArray();
      
      for (const collection of collections) {
        if (collection.name.toLowerCase().includes('conversation') || 
            collection.name.toLowerCase().includes('message')) {
          try {
            const docs = await db.collection(collection.name).find({
              $or: [
                { workspaceId: workspaceId },
                { workspaceId: workspaceId.toString() }
              ]
            }).limit(10).toArray();
            
            if (docs.length > 0) {
              allConversations.push(...docs.map(doc => ({
                ...doc,
                _id: doc._id,
                collectionSource: collection.name
              })));
            }
          } catch (err) {
            // Continue to next collection
          }
        }
      }
    } catch (error) {
      // Continue without additional collections
    }
    
    // Sort and limit results
    const sortedConversations = allConversations
      .sort((a, b) => new Date(b.createdAt || b.lastActive || 0).getTime() - new Date(a.createdAt || a.lastActive || 0).getTime())
      .slice(0, limit);
    
    return sortedConversations.map(conv => ({
      id: conv._id.toString(),
      workspaceId: conv.workspaceId,
      platform: conv.platform || 'instagram',
      participantId: conv.participant?.id || conv.participantId || 'unknown_user',
      participantUsername: conv.participant?.username || conv.participantUsername || 'Instagram User',
      lastMessageAt: conv.lastActive || conv.lastMessageAt || conv.createdAt,
      messageCount: conv.messageCount || 1,
      isActive: conv.isActive !== false,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt || conv.lastActive,
      collectionSource: conv.collectionSource
    }));
  }

  // Add method for getAutomationRulesByTrigger
  async getAutomationRulesByTrigger(triggerType: string): Promise<any[]> {
    await this.connect();
    
    const rules = await AutomationRuleModel.find({
      'trigger.type': triggerType,
      isActive: true
    });
    
    return rules.map(rule => ({
      id: rule._id.toString(),
      name: rule.name,
      workspaceId: rule.workspaceId,
      description: rule.description,
      isActive: rule.isActive,
      trigger: rule.trigger,
      action: rule.action,
      lastRun: rule.lastRun,
      nextRun: rule.nextRun,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt
    }));
  }

  // Admin operations - delegating to adminRepository
  async getAdmin(id: number): Promise<Admin | undefined> {
    await this.connect();
    try {
      const admin = await adminRepository.findById(id.toString());
      return admin ? convertAdmin(admin) : undefined;
    } catch (error) {
      return undefined;
    }
  }

  async getAdminByEmail(email: string): Promise<Admin | undefined> {
    await this.connect();
    const admin = await adminRepository.findByEmail(email);
    return admin ? convertAdmin(admin) : undefined;
  }

  async getAdminByUsername(username: string): Promise<Admin | undefined> {
    await this.connect();
    const admin = await adminRepository.findByUsername(username);
    return admin ? convertAdmin(admin) : undefined;
  }

  async getAllAdmins(): Promise<Admin[]> {
    await this.connect();
    const admins = await adminRepository.findActiveAdmins();
    return admins.map(admin => convertAdmin(admin));
  }

  async createAdmin(admin: InsertAdmin): Promise<Admin> {
    await this.connect();
    const savedAdmin = await adminRepository.create({
      email: admin.email,
      username: admin.username,
      password: admin.password,
      role: admin.role || 'admin',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    return convertAdmin(savedAdmin);
  }

  async updateAdmin(id: number, updates: Partial<Admin>): Promise<Admin> {
    await this.connect();
    const admin = await adminRepository.updateById(id.toString(), { ...updates, updatedAt: new Date() });
    if (!admin) throw new Error('Admin not found');
    return convertAdmin(admin);
  }

  async deleteAdmin(id: number): Promise<void> {
    await this.connect();
    await adminRepository.deactivateAdmin(id.toString());
  }

  async getAdminUsers(options: {
    page: number;
    limit: number;
    search?: string;
    filter?: string;
  }): Promise<any> {
    await this.connect();
    
    const { page, limit, search, filter } = options;
    const skip = (page - 1) * limit;
    
    // Build query
    let query: any = {};
    
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { displayName: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (filter && filter !== 'all') {
      switch (filter) {
        case 'active':
          query.lastLogin = { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
          break;
        case 'premium':
          query.plan = { $ne: null, $ne: 'free' };
          break;
        case 'free':
          query.$or = [{ plan: 'free' }, { plan: null }];
          break;
      }
    }
    
    const [users, total] = await Promise.all([
      UserModel.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      UserModel.countDocuments(query)
    ]);
    
    const formattedUsers = users.map(user => ({
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      plan: user.plan || 'free',
      credits: user.credits || 0,
      lastLogin: user.lastLogin,
      status: user.isActive !== false ? 'active' : 'inactive',
      createdAt: user.createdAt,
      totalWorkspaces: 0 // Will be calculated separately if needed
    }));
    
    return {
      users: formattedUsers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }





  // Admin session operations - delegating to adminSessionRepository
  async createAdminSession(session: any): Promise<any> {
    await this.connect();
    const savedSession = await adminSessionRepository.create({
      adminId: session.adminId,
      token: session.token,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      expiresAt: session.expiresAt,
      createdAt: new Date()
    });
    return convertAdminSession(savedSession);
  }

  async getAdminSession(token: string): Promise<any | undefined> {
    await this.connect();
    const session = await adminSessionRepository.findByToken(token);
    if (!session || new Date(session.expiresAt) <= new Date()) {
      return undefined;
    }
    return convertAdminSession(session);
  }

  async deleteAdminSession(token: string): Promise<void> {
    await this.connect();
    const session = await adminSessionRepository.findByToken(token);
    if (session) {
      await adminSessionRepository.deleteById(session._id.toString());
    }
  }

  async cleanupExpiredSessions(): Promise<void> {
    await this.connect();
    await adminSessionRepository.deleteExpiredSessions();
  }

  // Notification operations - delegating to notificationRepository
  async createNotification(notification: any): Promise<any> {
    await this.connect();
    
    const notificationData = {
      userId: notification.userId || null,
      title: notification.title,
      message: notification.message,
      type: notification.type || 'info',
      targetUsers: Array.isArray(notification.targetUsers) ? notification.targetUsers : [notification.targetUsers || 'all'],
      scheduledFor: notification.scheduledFor || null,
      sentAt: notification.scheduledFor ? null : new Date(),
      isRead: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const savedNotification = await notificationRepository.create(notificationData);
    return convertNotification(savedNotification);
  }

  async getUserNotifications(userId: string): Promise<any[]> {
    await this.connect();
    
    const notifications = await notificationRepository.findActiveNotifications({ limit: 50 });
    return notifications.map(notification => convertNotification(notification));
  }

  async markNotificationAsRead(notificationId: string, userId: string): Promise<void> {
    await this.connect();
    await notificationRepository.markAsRead(notificationId);
  }

  async getNotifications(userId?: number): Promise<any[]> {
    await this.connect();
    const notifications = userId 
      ? await notificationRepository.findByUserId(userId)
      : await notificationRepository.findAll({});
    return notifications.map(notif => convertNotification(notif));
  }

  async updateNotification(id: number, updates: Partial<any>): Promise<any> {
    await this.connect();
    const notification = await notificationRepository.updateById(id.toString(), { ...updates, updatedAt: new Date() });
    if (!notification) throw new Error('Notification not found');
    return convertNotification(notification);
  }

  async deleteNotification(id: number): Promise<void> {
    await this.connect();
    await notificationRepository.deleteById(id.toString());
  }

  async markNotificationRead(id: number): Promise<void> {
    await this.connect();
    await notificationRepository.markAsRead(id.toString());
  }

  // Popup operations - delegating to popupRepository
  async createPopup(popup: any): Promise<any> {
    await this.connect();
    const savedPopup = await popupRepository.create({
      ...popup,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    return convertPopup(savedPopup);
  }

  async getActivePopups(): Promise<any[]> {
    await this.connect();
    const popups = await popupRepository.findActivePopups();
    return popups.map(popup => convertPopup(popup));
  }

  async getPopup(id: number): Promise<any | undefined> {
    await this.connect();
    const popup = await popupRepository.findById(id.toString());
    return popup ? convertPopup(popup) : undefined;
  }

  async updatePopup(id: number, updates: Partial<any>): Promise<any> {
    await this.connect();
    const popup = await popupRepository.updateById(id.toString(), { ...updates, updatedAt: new Date() });
    if (!popup) throw new Error('Popup not found');
    return convertPopup(popup);
  }

  async deletePopup(id: number): Promise<void> {
    await this.connect();
    await popupRepository.deleteById(id.toString());
  }

  // App settings operations - delegating to appSettingRepository
  async createAppSetting(setting: any): Promise<any> {
    await this.connect();
    const savedSetting = await appSettingRepository.create({
      ...setting,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    return convertAppSetting(savedSetting);
  }

  async getAppSetting(key: string): Promise<any | undefined> {
    await this.connect();
    const setting = await appSettingRepository.findByKey(key);
    return setting ? convertAppSetting(setting) : undefined;
  }

  async getAllAppSettings(): Promise<any[]> {
    await this.connect();
    const settings = await appSettingRepository.findAll({});
    return settings.map(setting => convertAppSetting(setting));
  }

  async getPublicAppSettings(): Promise<any[]> {
    await this.connect();
    const settings = await appSettingRepository.findPublicSettings();
    return settings.map(setting => convertAppSetting(setting));
  }

  async updateAppSetting(key: string, value: string, updatedBy?: number): Promise<any> {
    await this.connect();
    const setting = await appSettingRepository.upsertSetting(key, value, { updatedBy });
    return convertAppSetting(setting);
  }

  async deleteAppSetting(key: string): Promise<void> {
    await this.connect();
    const setting = await appSettingRepository.findByKey(key);
    if (setting) {
      await appSettingRepository.deleteById(setting._id.toString());
    }
  }

  // Audit log operations - delegating to auditLogRepository
  async createAuditLog(log: any): Promise<any> {
    await this.connect();
    
    const enrichedLog = { ...log, createdAt: new Date() };
    if (!enrichedLog.actorType) {
      enrichedLog.actorType = enrichedLog.adminId ? 'admin' : 'system';
    }
    if (!enrichedLog.actorId) {
      enrichedLog.actorId = enrichedLog.adminId ? String(enrichedLog.adminId) : 'system';
    }
    
    const savedLog = await auditLogRepository.create(enrichedLog);
    return convertAuditLog(savedLog);
  }

  async getAuditLogs(limit?: number, adminId?: number): Promise<any[]> {
    await this.connect();
    const logs = adminId 
      ? await auditLogRepository.findByActorId(String(adminId), { limit: limit || 100 })
      : await auditLogRepository.getRecentAuditLogs(limit || 100);
    return logs.map(log => convertAuditLog(log));
  }

  // Feedback operations - delegating to feedbackMessageRepository
  async createFeedbackMessage(feedback: any): Promise<any> {
    await this.connect();
    const savedFeedback = await feedbackMessageRepository.create({
      ...feedback,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    return convertFeedbackMessage(savedFeedback);
  }

  async getFeedbackMessages(status?: string): Promise<any[]> {
    await this.connect();
    const messages = status 
      ? await feedbackMessageRepository.findByStatus(status)
      : await feedbackMessageRepository.findAll({});
    return messages.map(msg => convertFeedbackMessage(msg));
  }

  async updateFeedbackMessage(id: number, updates: Partial<any>): Promise<any> {
    await this.connect();
    const message = await feedbackMessageRepository.updateById(id.toString(), { ...updates, updatedAt: new Date() });
    if (!message) throw new Error('Feedback message not found');
    return convertFeedbackMessage(message);
  }

  async deleteFeedbackMessage(id: number): Promise<void> {
    await this.connect();
    await feedbackMessageRepository.deleteById(id.toString());
  }

  // Missing automation log methods
  async getAutomationLogs(limit?: number): Promise<any[]> {
    await this.connect();
    // Return empty array for now as automation logs schema not defined
    return [];
  }

  async createAutomationLog(log: any): Promise<any> {
    await this.connect();
    // Return the log object for now as automation logs schema not defined
    return { id: Date.now(), ...log, createdAt: new Date() };
  }

  // Get all users method for cleanup operations
  async getAllUsers(): Promise<any[]> {
    await this.connect();
    const users = await UserModel.find({}).lean();
    return users.map(user => convertUser(user));
  }

  // Admin stats method
  async getAdminStats(): Promise<any> {
    await this.connect();
    
    const [userCount, workspaceCount, contentCount] = await Promise.all([
      UserModel.countDocuments({}),
      WorkspaceModel.countDocuments({}),
      ContentModel.countDocuments({})
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
    await this.connect();
    await UserModel.updateOne(
      { email },
      { 
        emailVerificationCode: code,
        emailVerificationExpiry: expiry,
        updatedAt: new Date()
      }
    );
  }

  async verifyEmailCode(email: string, code: string): Promise<boolean> {
    await this.connect();
    const user = await UserModel.findOne({
      email,
      emailVerificationCode: code,
      emailVerificationExpiry: { $gt: new Date() }
    });

    if (user) {
      // Mark email as verified and clear verification data
      await UserModel.updateOne(
        { email },
        {
          isEmailVerified: true,
          emailVerificationCode: null,
          emailVerificationExpiry: null,
          updatedAt: new Date()
        }
      );
      return true;
    }
    return false;
  }

  async clearEmailVerificationCode(email: string): Promise<void> {
    await this.connect();
    await UserModel.updateOne(
      { email },
      {
        emailVerificationCode: null,
        emailVerificationExpiry: null,
        updatedAt: new Date()
      }
    );
  }

  // Create unverified user for email verification flow
  async createUnverifiedUser(data: { 
    email: string; 
    firstName: string; 
    emailVerificationCode: string; 
    emailVerificationExpiry: Date; 
    isEmailVerified: boolean 
  }): Promise<User> {
    await this.connect();
    
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
      referralCode: generateReferralCode(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const user = new UserModel(userData);
    const savedUser = await user.save();
    return convertUser(savedUser);
  }

  // Email verification helper methods
  async updateUserEmailVerification(id: number | string, token: string, expires: Date): Promise<User> {
    await this.connect();
    
    const user = await UserModel.findByIdAndUpdate(
      id,
      {
        emailVerificationCode: token,
        emailVerificationExpiry: expires,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!user) {
      throw new Error('User not found');
    }

    return convertUser(user);
  }

  // YouTube workspace data update method
  async updateYouTubeWorkspaceData(updates: any): Promise<any> {
    await this.connect();
    
    const result = await SocialAccountModel.updateMany(
      { platform: 'youtube' },
      {
        $set: {
          workspaceId: updates.workspaceId,
          subscriberCount: updates.subscriberCount,
          videoCount: updates.videoCount,
          viewCount: updates.viewCount,
          lastSync: updates.lastSync,
          updatedAt: updates.updatedAt
        }
      }
    );

    return result;
  }

  async verifyUserEmail(id: number | string, data: { password?: string; firstName?: string; lastName?: string; firebaseUid?: string }): Promise<User> {
    await this.connect();
    
    const updateData: any = {
      isEmailVerified: true,
      emailVerificationCode: null,
      emailVerificationExpiry: null,
      updatedAt: new Date()
    };

    if (data.firstName) updateData.displayName = data.firstName;
    if (data.password) updateData.passwordHash = data.password; // Should be hashed before calling this
    if (data.firebaseUid) updateData.firebaseUid = data.firebaseUid;

    const user = await UserModel.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );

    if (!user) {
      throw new Error('User not found');
    }

    return convertUser(user);
  }

  // THUMBNAIL GENERATION SYSTEM METHODS

  // Thumbnail Projects
  async createThumbnailProject(data: any): Promise<any> {
    await this.connect();
    const result = await mongoose.connection.db!.collection('thumbnail_projects').insertOne({
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    return {
      id: result.insertedId.toString(),
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  async getThumbnailProject(projectId: number): Promise<any> {
    await this.connect();
    const project = await mongoose.connection.db!.collection('thumbnail_projects')
      .findOne({ _id: new ObjectId(projectId.toString()) });
    
    if (!project) return null;
    
    return {
      id: project._id.toString(),
      ...project
    };
  }

  async updateThumbnailProject(projectId: number, updates: any): Promise<void> {
    await this.connect();
    await mongoose.connection.db!.collection('thumbnail_projects')
      .updateOne(
        { _id: new ObjectId(projectId.toString()) },
        { $set: { ...updates, updatedAt: new Date() } }
      );
  }

  async getThumbnailProjects(workspaceId: number): Promise<any[]> {
    await this.connect();
    const projects = await mongoose.connection.db!.collection('thumbnail_projects')
      .find({ workspaceId })
      .sort({ createdAt: -1 })
      .toArray();
    
    return projects.map(project => ({
      id: project._id.toString(),
      ...project
    }));
  }

  // Thumbnail Strategies
  async createThumbnailStrategy(data: any): Promise<any> {
    await this.connect();
    const result = await mongoose.connection.db!.collection('thumbnail_strategies').insertOne({
      ...data,
      createdAt: new Date()
    });
    
    return {
      id: result.insertedId.toString(),
      ...data,
      createdAt: new Date()
    };
  }

  async getThumbnailStrategy(projectId: number): Promise<any> {
    await this.connect();
    const strategy = await mongoose.connection.db!.collection('thumbnail_strategies')
      .findOne({ projectId: projectId.toString() });
    
    if (!strategy) return null;
    
    return {
      id: strategy._id.toString(),
      ...strategy
    };
  }

  // Thumbnail Variants
  async createThumbnailVariant(data: any): Promise<any> {
    await this.connect();
    const result = await mongoose.connection.db!.collection('thumbnail_variants').insertOne({
      ...data,
      createdAt: new Date()
    });
    
    return {
      id: result.insertedId.toString(),
      ...data,
      createdAt: new Date()
    };
  }

  async getThumbnailVariant(variantId: number): Promise<any> {
    await this.connect();
    const variant = await mongoose.connection.db!.collection('thumbnail_variants')
      .findOne({ _id: new ObjectId(variantId.toString()) });
    
    if (!variant) return null;
    
    return {
      id: variant._id.toString(),
      ...variant
    };
  }

  async getThumbnailVariants(projectId: number): Promise<any[]> {
    await this.connect();
    const variants = await mongoose.connection.db!.collection('thumbnail_variants')
      .find({ projectId: projectId.toString() })
      .sort({ variantNumber: 1 })
      .toArray();
    
    return variants.map(variant => ({
      id: variant._id.toString(),
      ...variant
    }));
  }

  // Canvas Editor Sessions
  async createCanvasEditorSession(data: any): Promise<any> {
    await this.connect();
    const result = await mongoose.connection.db!.collection('canvas_editor_sessions').insertOne({
      ...data,
      createdAt: new Date(),
      lastSaved: new Date()
    });
    
    return {
      id: result.insertedId.toString(),
      ...data,
      createdAt: new Date(),
      lastSaved: new Date()
    };
  }

  async getCanvasEditorSession(sessionId: number): Promise<any> {
    await this.connect();
    const session = await mongoose.connection.db!.collection('canvas_editor_sessions')
      .findOne({ _id: new ObjectId(sessionId.toString()) });
    
    if (!session) return null;
    
    return {
      id: session._id.toString(),
      ...session
    };
  }

  async updateCanvasEditorSession(sessionId: number, updates: any): Promise<void> {
    await this.connect();
    await mongoose.connection.db!.collection('canvas_editor_sessions')
      .updateOne(
        { _id: new ObjectId(sessionId.toString()) },
        { $set: { ...updates, lastSaved: new Date() } }
      );
  }

  // Thumbnail Exports
  async createThumbnailExport(data: any): Promise<any> {
    await this.connect();
    const result = await mongoose.connection.db!.collection('thumbnail_exports').insertOne({
      ...data,
      createdAt: new Date(),
      downloadCount: 0
    });
    
    return {
      id: result.insertedId.toString(),
      ...data,
      createdAt: new Date(),
      downloadCount: 0
    };
  }

  async getThumbnailExports(sessionId: number): Promise<any[]> {
    await this.connect();
    const exports = await mongoose.connection.db!.collection('thumbnail_exports')
      .find({ sessionId: sessionId.toString() })
      .sort({ createdAt: -1 })
      .toArray();
    
    return exports.map(exp => ({
      id: exp._id.toString(),
      ...exp
    }));
  }

  async incrementExportDownload(exportId: number): Promise<void> {
    await this.connect();
    await mongoose.connection.db!.collection('thumbnail_exports')
      .updateOne(
        { _id: new ObjectId(exportId.toString()) },
        { $inc: { downloadCount: 1 } }
      );
  }

  // AI Features CRUD operations
  
  // Creative Brief operations
  async createCreativeBrief(brief: InsertCreativeBrief): Promise<CreativeBrief> {
    await this.connect();
    const newBrief = new CreativeBriefModel(brief);
    const saved = await newBrief.save();
    return convertCreativeBrief(saved);
  }

  async getCreativeBrief(id: number): Promise<CreativeBrief | undefined> {
    await this.connect();
    const brief = await CreativeBriefModel.findById(id.toString());
    return brief ? convertCreativeBrief(brief) : undefined;
  }

  async getCreativeBriefsByWorkspace(workspaceId: number): Promise<CreativeBrief[]> {
    await this.connect();
    const briefs = await CreativeBriefModel.find({ workspaceId: workspaceId.toString() }).sort({ createdAt: -1 });
    return briefs.map(brief => convertCreativeBrief(brief));
  }

  async updateCreativeBrief(id: number, updates: Partial<CreativeBrief>): Promise<CreativeBrief> {
    await this.connect();
    const updated = await CreativeBriefModel.findByIdAndUpdate(
      id.toString(),
      { ...updates, updatedAt: new Date() },
      { new: true }
    );
    if (!updated) throw new Error('Creative brief not found');
    return convertCreativeBrief(updated);
  }

  async deleteCreativeBrief(id: number): Promise<void> {
    await this.connect();
    await CreativeBriefModel.findByIdAndDelete(id.toString());
  }

  // Content Repurpose operations
  async createContentRepurpose(repurpose: InsertContentRepurpose): Promise<ContentRepurpose> {
    await this.connect();
    const newRepurpose = new ContentRepurposeModel(repurpose);
    const saved = await newRepurpose.save();
    return convertContentRepurpose(saved);
  }

  async getContentRepurpose(id: number): Promise<ContentRepurpose | undefined> {
    await this.connect();
    const repurpose = await ContentRepurposeModel.findById(id.toString());
    return repurpose ? convertContentRepurpose(repurpose) : undefined;
  }

  async getContentRepurposesByWorkspace(workspaceId: number): Promise<ContentRepurpose[]> {
    await this.connect();
    const repurposes = await ContentRepurposeModel.find({ workspaceId: workspaceId.toString() }).sort({ createdAt: -1 });
    return repurposes.map(repurpose => convertContentRepurpose(repurpose));
  }

  async updateContentRepurpose(id: number, updates: Partial<ContentRepurpose>): Promise<ContentRepurpose> {
    await this.connect();
    const updated = await ContentRepurposeModel.findByIdAndUpdate(
      id.toString(),
      { ...updates, updatedAt: new Date() },
      { new: true }
    );
    if (!updated) throw new Error('Content repurpose not found');
    return convertContentRepurpose(updated);
  }

  async deleteContentRepurpose(id: number): Promise<void> {
    await this.connect();
    await ContentRepurposeModel.findByIdAndDelete(id.toString());
  }

  // Competitor Analysis operations
  async createCompetitorAnalysis(analysis: InsertCompetitorAnalysis): Promise<CompetitorAnalysis> {
    await this.connect();
    const newAnalysis = new CompetitorAnalysisModel(analysis);
    const saved = await newAnalysis.save();
    return convertCompetitorAnalysis(saved);
  }

  async getCompetitorAnalysis(id: number): Promise<CompetitorAnalysis | undefined> {
    await this.connect();
    const analysis = await CompetitorAnalysisModel.findById(id.toString());
    return analysis ? convertCompetitorAnalysis(analysis) : undefined;
  }

  async getCompetitorAnalysesByWorkspace(workspaceId: number): Promise<CompetitorAnalysis[]> {
    await this.connect();
    const analyses = await CompetitorAnalysisModel.find({ workspaceId: workspaceId.toString() }).sort({ createdAt: -1 });
    return analyses.map(analysis => convertCompetitorAnalysis(analysis));
  }

  async updateCompetitorAnalysis(id: number, updates: Partial<CompetitorAnalysis>): Promise<CompetitorAnalysis> {
    await this.connect();
    const updated = await CompetitorAnalysisModel.findByIdAndUpdate(
      id.toString(),
      { ...updates, updatedAt: new Date() },
      { new: true }
    );
    if (!updated) throw new Error('Competitor analysis not found');
    return convertCompetitorAnalysis(updated);
  }

  async deleteCompetitorAnalysis(id: number): Promise<void> {
    await this.connect();
    await CompetitorAnalysisModel.findByIdAndDelete(id.toString());
  }

  // Feature usage tracking methods
  async getFeatureUsage(userId: number | string): Promise<any[]> {
    await this.connect();
    try {
      const docs = await FeatureUsageModel.find({ userId }).sort({ createdAt: -1 });
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
    } catch (error) {
      return [];
    }
  }

  async trackFeatureUsage(userId: number | string, featureId: string, usage: any): Promise<void> {
    await this.connect();
    try {
      await FeatureUsageModel.findOneAndUpdate(
        { userId, featureId },
        {
          $inc: { usageCount: 1 },
          $set: { 
            lastUsed: new Date(),
            metadata: usage,
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );
    } catch (error) {
      // Silently fail - feature usage tracking is non-critical
    }
  }

  // Waitlist Management Methods - delegating to waitlistUserRepository
  async createWaitlistUser(insertWaitlistUser: InsertWaitlistUser): Promise<WaitlistUser> {
    await this.connect();
    
    const referralCode = generateReferralCode();
    
    let referredByUserId = null;
    if (insertWaitlistUser.referredBy) {
      const referrer = await waitlistUserRepository.findByReferralCode(insertWaitlistUser.referredBy);
      if (referrer) {
        referredByUserId = referrer._id;
        await waitlistUserRepository.incrementReferralCount(referrer._id.toString());
      }
    }
    
    const savedUser = await waitlistUserRepository.create({
      ...insertWaitlistUser,
      referralCode,
      referredBy: referredByUserId,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    return convertWaitlistUser(savedUser);
  }

  async getWaitlistUser(id: number | string): Promise<WaitlistUser | undefined> {
    await this.connect();
    const user = await waitlistUserRepository.findById(id.toString());
    return user ? convertWaitlistUser(user) : undefined;
  }

  async getWaitlistUserByEmail(email: string): Promise<WaitlistUser | undefined> {
    await this.connect();
    const user = await waitlistUserRepository.findByEmail(email);
    return user ? convertWaitlistUser(user) : undefined;
  }

  async getWaitlistUserByReferralCode(referralCode: string): Promise<WaitlistUser | undefined> {
    await this.connect();
    const user = await waitlistUserRepository.findByReferralCode(referralCode);
    return user ? convertWaitlistUser(user) : undefined;
  }

  async updateWaitlistUser(id: number | string, updates: Partial<WaitlistUser>): Promise<WaitlistUser> {
    await this.connect();
    const user = await waitlistUserRepository.updateById(id.toString(), { ...updates, updatedAt: new Date() });
    if (!user) throw new Error('Waitlist user not found');
    return convertWaitlistUser(user);
  }

  async getAllWaitlistUsers(): Promise<WaitlistUser[]> {
    await this.connect();
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
    await this.connect();
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [total, todayCount, pipeline] = await Promise.all([
      WaitlistUserModel.countDocuments(),
      WaitlistUserModel.countDocuments({ createdAt: { $gte: today } }),
      WaitlistUserModel.aggregate([
        {
          $group: {
            _id: null,
            totalReferrals: { $sum: '$referralCount' },
            avgReferrals: { $avg: '$referralCount' }
          }
        }
      ])
    ]);
    
    const statusBreakdown = await WaitlistUserModel.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const statusMap = statusBreakdown.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {} as { [key: string]: number });
    
    return {
      totalUsers: total,
      todaySignups: todayCount,
      totalReferrals: pipeline[0]?.totalReferrals || 0,
      averageReferrals: pipeline[0]?.avgReferrals || 0,
      statusBreakdown: statusMap
    };
  }

  async promoteWaitlistUser(id: number | string): Promise<{ 
    user: User; 
    workspace: Workspace; 
    discountCode: string;
    trialDays: number;
  }> {
    await this.connect();
    
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // Get waitlist user (read operation, session not strictly needed)
      const waitlistUserDoc = await WaitlistUserModel.findById(id.toString());
      if (!waitlistUserDoc) {
        throw new Error('Waitlist user not found');
      }
      const waitlistUser = convertWaitlistUser(waitlistUserDoc);
      
      // Generate discount code (50% off first month)
      const discountCode = `EARLY50_${Date.now().toString(36).toUpperCase()}`;
      const discountExpiry = new Date();
      discountExpiry.setDate(discountExpiry.getDate() + 30); // 30 days to use discount
      
      // Calculate trial period (14 days + 1 day per referral, max 30 days)
      const trialDays = Math.min(14 + waitlistUser.referralCount, 30);
      const trialExpiry = new Date();
      trialExpiry.setDate(trialExpiry.getDate() + trialDays);
      
      // Create regular user account with session
      const referralCode = generateReferralCode();
      const newUserDoc = new UserModel({
        email: waitlistUser.email,
        username: waitlistUser.name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now(),
        displayName: waitlistUser.name,
        credits: 100 + (waitlistUser.referralCount * 20), // 100 base + 20 per referral
        plan: 'Free',
        referredBy: waitlistUser.referredBy,
        isEmailVerified: true,
        status: 'early_access',
        trialExpiresAt: trialExpiry,
        discountCode,
        discountExpiresAt: discountExpiry,
        hasUsedWaitlistBonus: false,
        referralCode,
        isOnboarded: false,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      const savedUser = await newUserDoc.save({ session });
      const user = convertUser(savedUser);
      
      // Create default workspace with session
      const workspaceName = `${waitlistUser.name}'s Workspace`;
      const newWorkspaceDoc = new WorkspaceModel({
        name: workspaceName,
        description: 'Early access workspace',
        userId: user.id,
        theme: 'space',
        isDefault: true,
        credits: 50, // Additional workspace credits
        createdAt: new Date(),
        updatedAt: new Date()
      });
      const savedWorkspace = await newWorkspaceDoc.save({ session });
      const workspace = convertWorkspace(savedWorkspace);
      
      // Update waitlist user status with session
      await WaitlistUserModel.updateOne(
        { _id: id.toString() },
        { status: 'early_access', updatedAt: new Date() },
        { session }
      );
      
      await session.commitTransaction();
      session.endSession();
      
      return {
        user,
        workspace,
        discountCode,
        trialDays
      };
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }

  // Database reset methods for fresh starts
  async clearAllUsers(): Promise<number> {
    await this.connect();
    const result = await UserModel.deleteMany({});
    return result.deletedCount || 0;
  }

  async clearAllWaitlistUsers(): Promise<number> {
    await this.connect();
    return await waitlistUserRepository.deleteMany({});
  }

  async deleteWaitlistUser(id: number | string): Promise<void> {
    await this.connect();
    const deleted = await waitlistUserRepository.deleteById(id.toString());
    if (!deleted) {
      throw new Error('Waitlist user not found');
    }
  }

  async clearAllWorkspaces(): Promise<number> {
    await this.connect();
    const result = await WorkspaceModel.deleteMany({});
    return result.deletedCount || 0;
  }

  async clearAllSocialAccounts(): Promise<number> {
    await this.connect();
    const result = await SocialAccountModel.deleteMany({});
    return result.deletedCount || 0;
  }

  async clearAllContent(): Promise<number> {
    await this.connect();
    const result = await ContentModel.deleteMany({});
    return result.deletedCount || 0;
  }

  // VeeGPT Chat Methods - delegating to chatConversationRepository and chatMessageRepository
  async getChatConversations(userId: string, workspaceId?: string): Promise<ChatConversation[]> {
    await this.connect();
    
    // Validate ObjectId format for userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return [];
    }
    // Validate ObjectId format for workspaceId if provided
    if (workspaceId && !mongoose.Types.ObjectId.isValid(workspaceId)) {
      return [];
    }
    
    const conversations = workspaceId
      ? await chatConversationRepository.findByUserAndWorkspace(userId, workspaceId)
      : await chatConversationRepository.findByUserId(userId);
    return conversations.map(doc => ({
      id: doc.id,
      userId: doc.userId,
      workspaceId: doc.workspaceId,
      title: doc.title,
      messageCount: doc.messageCount,
      lastMessageAt: doc.lastMessageAt,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    }));
  }

  async createChatConversation(conversation: InsertChatConversation): Promise<ChatConversation> {
    await this.connect();
    
    // Validate ObjectId format for userId
    if (!mongoose.Types.ObjectId.isValid(conversation.userId)) {
      throw new Error('Invalid userId format');
    }
    // Validate ObjectId format for workspaceId if provided
    if (conversation.workspaceId && !mongoose.Types.ObjectId.isValid(conversation.workspaceId)) {
      throw new Error('Invalid workspaceId format');
    }
    
    const numericId = Date.now() % 1000000000 + Math.floor(Math.random() * 1000);
    
    const saved = await chatConversationRepository.create({
      ...conversation,
      id: numericId,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    return {
      id: saved.id,
      userId: saved.userId,
      workspaceId: saved.workspaceId,
      title: saved.title,
      messageCount: saved.messageCount,
      lastMessageAt: saved.lastMessageAt,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt
    };
  }

  async getChatMessages(conversationId: number): Promise<ChatMessage[]> {
    await this.connect();
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
    await this.connect();
    
    const numericId = Date.now() % 1000000000 + Math.floor(Math.random() * 1000);
    
    const saved = await chatMessageRepository.create({
      ...message,
      id: numericId,
      createdAt: new Date()
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
    await this.connect();
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
    await this.connect();
    
    // Validate ObjectId format if id is a string
    if (typeof id === 'string' && !mongoose.Types.ObjectId.isValid(id)) {
      throw new Error('Invalid conversation id format');
    }
    
    const updated = await chatConversationRepository.updateById(id.toString(), { ...updates, updatedAt: new Date() });
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
    await this.connect();
    
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

// Export models for direct access
export { UserModel, WorkspaceModel, SocialAccountModel };
