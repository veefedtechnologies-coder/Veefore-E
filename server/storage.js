export class MemStorage {
    constructor() {
        this.users = new Map();
        this.workspaces = new Map();
        this.workspaceMembers = new Map(); // key: `${workspaceId}-${userId}`
        this.teamInvitations = new Map();
        this.socialAccounts = new Map();
        this.content = new Map();
        this.analytics = new Map();
        this.automationRules = new Map();
        this.suggestions = new Map();
        this.creditTransactions = new Map();
        this.referrals = new Map();
        this.subscriptions = new Map();
        this.payments = new Map();
        this.addons = new Map();
        this.contentRecommendations = new Map();
        this.userContentHistory = new Map();
        this.chatConversations = new Map();
        this.chatMessages = new Map();
        this.currentUserId = 1;
        this.currentWorkspaceId = 1;
        this.currentWorkspaceMemberId = 1;
        this.currentTeamInvitationId = 1;
        this.currentSocialAccountId = 1;
        this.currentContentId = 1;
        this.currentAnalyticsId = 1;
        this.currentAutomationRuleId = 1;
        this.currentSuggestionId = 1;
        this.currentCreditTransactionId = 1;
        this.currentReferralId = 1;
        this.currentSubscriptionId = 1;
        this.currentPaymentId = 1;
        this.currentAddonId = 1;
        this.currentContentRecommendationId = 1;
        this.currentUserContentHistoryId = 1;
        this.currentChatConversationId = 1;
        this.currentChatMessageId = 1;
    }
    // User operations
    async getUser(id) {
        return this.users.get(id);
    }
    async getUserByFirebaseUid(firebaseUid) {
        return Array.from(this.users.values()).find(user => user.firebaseUid === firebaseUid);
    }
    async getUserByEmail(email) {
        return Array.from(this.users.values()).find(user => user.email === email);
    }
    async getUserByUsername(username) {
        return Array.from(this.users.values()).find(user => user.username === username);
    }
    async getUserByReferralCode(referralCode) {
        return Array.from(this.users.values()).find(user => user.referralCode === referralCode);
    }
    async createUser(insertUser) {
        const id = this.currentUserId++;
        const user = {
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
    async updateUser(id, updates) {
        const numId = typeof id === 'string' ? parseInt(id) : id;
        const user = this.users.get(numId);
        if (!user)
            throw new Error("User not found");
        const updatedUser = { ...user, ...updates, updatedAt: new Date() };
        this.users.set(numId, updatedUser);
        return updatedUser;
    }
    async updateUserCredits(id, credits) {
        return this.updateUser(id, { credits });
    }
    async updateUserStripeInfo(id, stripeCustomerId, stripeSubscriptionId) {
        return this.updateUser(id, { stripeCustomerId, stripeSubscriptionId });
    }
    // Workspace operations
    async getWorkspace(id) {
        return this.workspaces.get(id);
    }
    async getWorkspacesByUserId(userId) {
        return Array.from(this.workspaces.values()).filter(workspace => workspace.userId === userId);
    }
    async getDefaultWorkspace(userId) {
        return Array.from(this.workspaces.values()).find(workspace => workspace.userId === userId && workspace.isDefault);
    }
    async createWorkspace(insertWorkspace) {
        const id = this.currentWorkspaceId++;
        const workspace = {
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
    async updateWorkspace(id, updates) {
        const workspace = this.workspaces.get(id);
        if (!workspace)
            throw new Error("Workspace not found");
        const updatedWorkspace = { ...workspace, ...updates, updatedAt: new Date() };
        this.workspaces.set(id, updatedWorkspace);
        return updatedWorkspace;
    }
    async updateWorkspaceCredits(id, credits) {
        const numericId = typeof id === 'string' ? parseInt(id) : id;
        const workspace = this.workspaces.get(numericId);
        if (!workspace)
            throw new Error("Workspace not found");
        const updatedWorkspace = { ...workspace, credits, updatedAt: new Date() };
        this.workspaces.set(numericId, updatedWorkspace);
    }
    async deleteWorkspace(id) {
        this.workspaces.delete(id);
    }
    async setDefaultWorkspace(userId, workspaceId) {
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
    async getWorkspaceByInviteCode(inviteCode) {
        return Array.from(this.workspaces.values()).find(workspace => workspace.inviteCode === inviteCode);
    }
    // Team management operations
    async getWorkspaceMember(workspaceId, userId) {
        return this.workspaceMembers.get(`${workspaceId}-${userId}`);
    }
    async getWorkspaceMembers(workspaceId) {
        const members = [];
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
    async addWorkspaceMember(insertMember) {
        const id = this.currentWorkspaceMemberId++;
        const member = {
            ...insertMember,
            id,
            invitedAt: new Date(),
            joinedAt: new Date()
        };
        this.workspaceMembers.set(`${member.workspaceId}-${member.userId}`, member);
        return member;
    }
    async updateWorkspaceMember(workspaceId, userId, updates) {
        const member = this.workspaceMembers.get(`${workspaceId}-${userId}`);
        if (!member)
            throw new Error("Workspace member not found");
        const updatedMember = { ...member, ...updates };
        this.workspaceMembers.set(`${workspaceId}-${userId}`, updatedMember);
        return updatedMember;
    }
    async removeWorkspaceMember(workspaceId, userId) {
        this.workspaceMembers.delete(`${workspaceId}-${userId}`);
    }
    // Team invitation operations
    async createTeamInvitation(insertInvitation) {
        const id = this.currentTeamInvitationId++;
        const invitation = {
            ...insertInvitation,
            id,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        this.teamInvitations.set(id, invitation);
        return invitation;
    }
    async getTeamInvitation(id) {
        return this.teamInvitations.get(id);
    }
    async getTeamInvitationByToken(token) {
        return Array.from(this.teamInvitations.values()).find(invitation => invitation.token === token);
    }
    async getTeamInvitations(workspaceId, status) {
        return Array.from(this.teamInvitations.values()).filter(invitation => invitation.workspaceId === workspaceId && (!status || invitation.status === status));
    }
    async getWorkspaceInvitations(workspaceId) {
        return this.getTeamInvitations(workspaceId, 'pending');
    }
    async updateTeamInvitation(id, updates) {
        const invitation = this.teamInvitations.get(id);
        if (!invitation)
            throw new Error("Team invitation not found");
        const updatedInvitation = { ...invitation, ...updates, updatedAt: new Date() };
        this.teamInvitations.set(id, updatedInvitation);
        return updatedInvitation;
    }
    // Social account operations
    async getSocialAccount(id) {
        return this.socialAccounts.get(id);
    }
    async getSocialAccountsByWorkspace(workspaceId) {
        return Array.from(this.socialAccounts.values()).filter(account => account.workspaceId === workspaceId);
    }
    async getAllSocialAccounts() {
        return Array.from(this.socialAccounts.values());
    }
    async getSocialAccountByPlatform(workspaceId, platform) {
        return Array.from(this.socialAccounts.values()).find(account => account.workspaceId.toString() === workspaceId.toString() && account.platform === platform);
    }
    async getSocialConnections(userId) {
        const userWorkspaces = await this.getWorkspacesByUserId(userId);
        const workspaceIds = userWorkspaces.map(w => w.id);
        return Array.from(this.socialAccounts.values()).filter(account => workspaceIds.includes(account.workspaceId));
    }
    async createSocialAccount(insertAccount) {
        const id = this.currentSocialAccountId++;
        const account = {
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
    async updateSocialAccount(id, updates) {
        const numId = typeof id === 'string' ? parseInt(id) : id;
        const account = this.socialAccounts.get(numId);
        if (!account)
            throw new Error("Social account not found");
        const updatedAccount = { ...account, ...updates, updatedAt: new Date() };
        this.socialAccounts.set(numId, updatedAccount);
        return updatedAccount;
    }
    async deleteSocialAccount(id) {
        this.socialAccounts.delete(id);
    }
    // Content operations
    async getContent(id) {
        return this.content.get(id);
    }
    async getContentByWorkspace(workspaceId, limit = 50) {
        const workspaceContent = Array.from(this.content.values())
            .filter(content => content.workspaceId.toString() === workspaceId.toString())
            .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
        return workspaceContent.slice(0, limit);
    }
    async getScheduledContent(workspaceId) {
        const allContent = Array.from(this.content.values()).filter(content => content.status === "scheduled" && content.scheduledAt);
        // If workspaceId is provided, filter by workspace
        const filteredContent = workspaceId
            ? allContent.filter(content => content.workspaceId.toString() === workspaceId.toString())
            : allContent;
        return filteredContent.sort((a, b) => (a.scheduledAt.getTime() - b.scheduledAt.getTime()));
    }
    async createContent(insertContent) {
        const id = this.currentContentId++;
        const content = {
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
    async updateContent(id, updates) {
        const content = this.content.get(id);
        if (!content)
            throw new Error("Content not found");
        const updatedContent = { ...content, ...updates, updatedAt: new Date() };
        this.content.set(id, updatedContent);
        return updatedContent;
    }
    async deleteContent(id) {
        this.content.delete(id);
    }
    // Analytics operations
    async getAnalytics(workspaceId, platform, days = 30) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        return Array.from(this.analytics.values()).filter(analytics => analytics.workspaceId === workspaceId &&
            (!platform || analytics.platform === platform) &&
            analytics.date >= cutoff).sort((a, b) => b.date.getTime() - a.date.getTime());
    }
    async createAnalytics(insertAnalytics) {
        const id = this.currentAnalyticsId++;
        const analytics = {
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
    async getLatestAnalytics(workspaceId, platform) {
        const workspaceAnalytics = Array.from(this.analytics.values())
            .filter(analytics => analytics.workspaceId === workspaceId && analytics.platform === platform)
            .sort((a, b) => b.date.getTime() - a.date.getTime());
        return workspaceAnalytics[0];
    }
    // Automation rules
    async getAutomationRules(workspaceId) {
        return Array.from(this.automationRules.values()).filter(rule => rule.workspaceId.toString() === workspaceId.toString());
    }
    async getActiveAutomationRules() {
        return Array.from(this.automationRules.values()).filter(rule => rule.isActive);
    }
    async getAutomationRulesByType(type) {
        return Array.from(this.automationRules.values()).filter(rule => rule.isActive &&
            (rule.trigger?.type === type || rule.action?.type === type));
    }
    async createAutomationRule(insertRule) {
        const id = this.currentAutomationRuleId++;
        const rule = {
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
    async updateAutomationRule(id, updates) {
        const numericId = parseInt(id);
        const rule = this.automationRules.get(numericId);
        if (!rule)
            throw new Error("Automation rule not found");
        const updatedRule = { ...rule, ...updates, updatedAt: new Date() };
        this.automationRules.set(numericId, updatedRule);
        return updatedRule;
    }
    async deleteAutomationRule(id) {
        const numericId = parseInt(id);
        this.automationRules.delete(numericId);
    }
    async getAutomationRulesByWorkspace(workspaceId) {
        const wsId = typeof workspaceId === 'string' ? parseInt(workspaceId) : workspaceId;
        return Array.from(this.automationRules.values())
            .filter(rule => rule.workspaceId === wsId)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    async getAutomationLogs(workspaceId, options) {
        // For now, return empty array - logs would be stored separately in a real implementation
        return [];
    }
    async createAutomationLog(log) {
        // For now, just return the log - in a real implementation, this would store to database
        return { ...log, id: Date.now(), createdAt: new Date() };
    }
    async getAllSocialAccounts() {
        return Array.from(this.socialAccounts.values());
    }
    // Suggestions
    async getSuggestions(workspaceId, type) {
        return Array.from(this.suggestions.values()).filter(suggestion => suggestion.workspaceId === workspaceId &&
            (!type || suggestion.type === type)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    async getValidSuggestions(workspaceId) {
        const now = new Date();
        return Array.from(this.suggestions.values()).filter(suggestion => suggestion.workspaceId === workspaceId &&
            !suggestion.isUsed &&
            (!suggestion.validUntil || suggestion.validUntil > now));
    }
    async createSuggestion(insertSuggestion) {
        const id = this.currentSuggestionId++;
        const suggestion = {
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
    async markSuggestionUsed(id) {
        const suggestion = this.suggestions.get(id);
        if (!suggestion)
            throw new Error("Suggestion not found");
        const updatedSuggestion = { ...suggestion, isUsed: true };
        this.suggestions.set(id, updatedSuggestion);
        return updatedSuggestion;
    }
    async getSuggestionsByWorkspace(workspaceId) {
        const wsId = typeof workspaceId === 'string' ? parseInt(workspaceId) : workspaceId;
        return Array.from(this.suggestions.values())
            .filter(suggestion => suggestion.workspaceId === wsId)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    async clearSuggestionsByWorkspace(workspaceId) {
        const wsId = typeof workspaceId === 'string' ? parseInt(workspaceId) : workspaceId;
        const suggestionIds = Array.from(this.suggestions.entries())
            .filter(([id, suggestion]) => suggestion.workspaceId === wsId)
            .map(([id]) => id);
        for (const id of suggestionIds) {
            this.suggestions.delete(id);
        }
    }
    async getAnalyticsByWorkspace(workspaceId) {
        const wsId = typeof workspaceId === 'string' ? parseInt(workspaceId) : workspaceId;
        return Array.from(this.analytics.values())
            .filter(analytics => analytics.workspaceId === wsId)
            .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
    }
    // Credit transactions
    async getCreditTransactions(userId, limit = 50) {
        return Array.from(this.creditTransactions.values())
            .filter(transaction => transaction.userId === userId)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(0, limit);
    }
    async createCreditTransaction(insertTransaction) {
        const id = this.currentCreditTransactionId++;
        const transaction = {
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
    async getReferrals(referrerId) {
        return Array.from(this.referrals.values()).filter(referral => referral.referrerId === referrerId);
    }
    async getReferralStats(userId) {
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
    async createReferral(insertReferral) {
        const id = this.currentReferralId++;
        const referral = {
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
    async confirmReferral(id) {
        const referral = this.referrals.get(id);
        if (!referral)
            throw new Error("Referral not found");
        const updatedReferral = {
            ...referral,
            status: "confirmed",
            confirmedAt: new Date()
        };
        this.referrals.set(id, updatedReferral);
        return updatedReferral;
    }
    async getLeaderboard(limit = 10) {
        const userReferralCounts = new Map();
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
    async getSubscription(userId) {
        return Array.from(this.subscriptions.values()).find(subscription => subscription.userId === userId);
    }
    async createSubscription(insertSubscription) {
        const id = this.currentSubscriptionId++;
        const subscription = {
            ...insertSubscription,
            id,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        this.subscriptions.set(id, subscription);
        return subscription;
    }
    async updateSubscriptionStatus(userId, status, canceledAt) {
        const subscription = Array.from(this.subscriptions.values()).find(sub => sub.userId === userId);
        if (!subscription)
            throw new Error("Subscription not found");
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
    async createPayment(insertPayment) {
        const id = this.currentPaymentId++;
        const payment = {
            ...insertPayment,
            id,
            createdAt: new Date()
        };
        this.payments.set(id, payment);
        return payment;
    }
    async getPaymentsByUser(userId) {
        return Array.from(this.payments.values()).filter(payment => payment.userId === userId);
    }
    // Addon operations
    async getUserAddons(userId) {
        return Array.from(this.addons.values()).filter(addon => addon.userId === userId && addon.isActive);
    }
    async getActiveAddonsByUser(userId) {
        const now = new Date();
        return Array.from(this.addons.values()).filter(addon => addon.userId === userId &&
            addon.isActive &&
            (addon.expiresAt === null || addon.expiresAt > now));
    }
    async createAddon(insertAddon) {
        const id = this.currentAddonId++;
        const addon = {
            ...insertAddon,
            id,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        this.addons.set(id, addon);
        return addon;
    }
    // Content recommendation operations
    async getContentRecommendation(id) {
        return this.contentRecommendations.get(id);
    }
    async getContentRecommendations(workspaceId, type, limit) {
        let recommendations = Array.from(this.contentRecommendations.values())
            .filter(rec => rec.workspaceId === workspaceId && rec.isActive);
        if (type) {
            recommendations = recommendations.filter(rec => rec.type === type);
        }
        // Sort by creation date (newest first)
        recommendations.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        if (limit) {
            recommendations = recommendations.slice(0, limit);
        }
        return recommendations;
    }
    async createContentRecommendation(insertRecommendation) {
        const id = this.currentContentRecommendationId++;
        const recommendation = {
            ...insertRecommendation,
            id,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        this.contentRecommendations.set(id, recommendation);
        return recommendation;
    }
    async updateContentRecommendation(id, updates) {
        const existing = this.contentRecommendations.get(id);
        if (!existing) {
            throw new Error(`Content recommendation ${id} not found`);
        }
        const updated = {
            ...existing,
            ...updates,
            updatedAt: new Date()
        };
        this.contentRecommendations.set(id, updated);
        return updated;
    }
    // User content history operations
    async getUserContentHistory(userId, workspaceId) {
        return Array.from(this.userContentHistory.values())
            .filter(history => history.userId === userId && history.workspaceId === workspaceId)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    async createUserContentHistory(insertHistory) {
        const id = this.currentUserContentHistoryId++;
        const history = {
            ...insertHistory,
            id,
            createdAt: new Date()
        };
        this.userContentHistory.set(id, history);
        return history;
    }
    // Pricing and plan operations
    async getPricingData() {
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
    async updateUserSubscription(userId, planId) {
        const numId = typeof userId === 'string' ? parseInt(userId) : userId;
        return this.updateUser(numId, { plan: planId });
    }
    async addCreditsToUser(userId, credits) {
        const numId = typeof userId === 'string' ? parseInt(userId) : userId;
        const user = this.users.get(numId);
        if (!user)
            throw new Error("User not found");
        const newCredits = (user.credits || 0) + credits;
        return this.updateUser(numId, { credits: newCredits });
    }
    // Conversation management methods (stub implementation - MongoDB is used for real data)
    async createDmConversation(conversation) {
        // This is a stub - real implementation uses MongoDB
        return conversation;
    }
    async createDmMessage(message) {
        // This is a stub - real implementation uses MongoDB
        return message;
    }
    async createConversationContext(context) {
        // This is a stub - real implementation uses MongoDB
        return context;
    }
    async clearWorkspaceConversations(workspaceId) {
        // This is a stub - real implementation uses MongoDB
        console.log(`[MEM STORAGE] Stub: Clear conversations for workspace ${workspaceId}`);
    }
    async getDmConversations(workspaceId, limit = 50) {
        // This is a stub - real implementation uses MongoDB
        console.log(`[MEM STORAGE] Stub: Get DM conversations for workspace ${workspaceId}`);
        return [];
    }
    async getDmMessages(conversationId, limit = 10) {
        // This is a stub - real implementation uses MongoDB
        console.log(`[MEM STORAGE] Stub: Get DM messages for conversation ${conversationId}`);
        return [];
    }
    // Admin operations (stub implementations - MongoDB is used for real admin data)
    async getAdmin(id) {
        // This is a stub - real implementation uses MongoDB
        return undefined;
    }
    async getAdminByEmail(email) {
        // This is a stub - real implementation uses MongoDB
        return undefined;
    }
    async getAdminByUsername(username) {
        // This is a stub - real implementation uses MongoDB
        return undefined;
    }
    async getAllAdmins() {
        // This is a stub - real implementation uses MongoDB
        return [];
    }
    async createAdmin(admin) {
        // This is a stub - real implementation uses MongoDB
        throw new Error("Admin operations require MongoDB");
    }
    async updateAdmin(id, updates) {
        // This is a stub - real implementation uses MongoDB
        throw new Error("Admin operations require MongoDB");
    }
    async deleteAdmin(id) {
        // This is a stub - real implementation uses MongoDB
        throw new Error("Admin operations require MongoDB");
    }
    async createAdminSession(session) {
        // This is a stub - real implementation uses MongoDB
        throw new Error("Admin operations require MongoDB");
    }
    async getAdminSession(token) {
        // This is a stub - real implementation uses MongoDB
        return undefined;
    }
    async deleteAdminSession(token) {
        // This is a stub - real implementation uses MongoDB
    }
    async cleanupExpiredSessions() {
        // This is a stub - real implementation uses MongoDB
    }
    async createNotification(notification) {
        // This is a stub - real implementation uses MongoDB
        throw new Error("Admin operations require MongoDB");
    }
    async getNotifications(userId) {
        // This is a stub - real implementation uses MongoDB
        return [];
    }
    async updateNotification(id, updates) {
        // This is a stub - real implementation uses MongoDB
        throw new Error("Admin operations require MongoDB");
    }
    async deleteNotification(id) {
        // This is a stub - real implementation uses MongoDB
    }
    async markNotificationRead(id) {
        // This is a stub - real implementation uses MongoDB
    }
    async createPopup(popup) {
        // This is a stub - real implementation uses MongoDB
        throw new Error("Admin operations require MongoDB");
    }
    async getActivePopups() {
        // This is a stub - real implementation uses MongoDB
        return [];
    }
    async getPopup(id) {
        // This is a stub - real implementation uses MongoDB
        return undefined;
    }
    async updatePopup(id, updates) {
        // This is a stub - real implementation uses MongoDB
        throw new Error("Admin operations require MongoDB");
    }
    async deletePopup(id) {
        // This is a stub - real implementation uses MongoDB
    }
    async createAppSetting(setting) {
        // This is a stub - real implementation uses MongoDB
        throw new Error("Admin operations require MongoDB");
    }
    async getAppSetting(key) {
        // This is a stub - real implementation uses MongoDB
        return undefined;
    }
    async getAllAppSettings() {
        // This is a stub - real implementation uses MongoDB
        return [];
    }
    async getPublicAppSettings() {
        // This is a stub - real implementation uses MongoDB
        return [];
    }
    async updateAppSetting(key, value, updatedBy) {
        // This is a stub - real implementation uses MongoDB
        throw new Error("Admin operations require MongoDB");
    }
    async deleteAppSetting(key) {
        // This is a stub - real implementation uses MongoDB
    }
    async createAuditLog(log) {
        // This is a stub - real implementation uses MongoDB
        throw new Error("Admin operations require MongoDB");
    }
    async getAuditLogs(limit, adminId) {
        // This is a stub - real implementation uses MongoDB
        return [];
    }
    async createFeedbackMessage(feedback) {
        // This is a stub - real implementation uses MongoDB
        throw new Error("Admin operations require MongoDB");
    }
    async getFeedbackMessages(status) {
        // This is a stub - real implementation uses MongoDB
        return [];
    }
    async updateFeedbackMessage(id, updates) {
        // This is a stub - real implementation uses MongoDB
        throw new Error("Admin operations require MongoDB");
    }
    async deleteFeedbackMessage(id) {
        // This is a stub - real implementation uses MongoDB
    }
    async getAdminStats() {
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
    async getAdminUsers(page = 1, limit = 10, search) {
        const allUsers = Array.from(this.users.values());
        let filteredUsers = allUsers;
        if (search) {
            filteredUsers = allUsers.filter(user => user.username.toLowerCase().includes(search.toLowerCase()) ||
                user.email.toLowerCase().includes(search.toLowerCase()) ||
                (user.displayName && user.displayName.toLowerCase().includes(search.toLowerCase())));
        }
        const startIndex = (page - 1) * limit;
        const paginatedUsers = filteredUsers.slice(startIndex, startIndex + limit);
        return {
            users: paginatedUsers,
            total: filteredUsers.length
        };
    }
    async getAdminContent(page = 1, limit = 10, filters) {
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
    async getAdminNotifications(page = 1, limit = 10) {
        const allNotifications = Array.from(this.notifications.values());
        const startIndex = (page - 1) * limit;
        const paginatedNotifications = allNotifications.slice(startIndex, startIndex + limit);
        return {
            notifications: paginatedNotifications,
            total: allNotifications.length
        };
    }
    // Thumbnail generation operations (simplified implementations for demo)
    async createThumbnailProject(project) {
        const id = Date.now();
        const newProject = { ...project, id, createdAt: new Date(), status: 'processing', stage: 1 };
        // In memory storage - just return the project
        return newProject;
    }
    async getThumbnailProject(id) {
        // Simulate completed project
        return {
            id,
            status: 'completed',
            stage: 5,
            createdAt: new Date()
        };
    }
    async updateThumbnailProject(id, updates) {
        return { id, ...updates };
    }
    async createThumbnailStrategy(strategy) {
        return { ...strategy, id: Date.now() };
    }
    async createThumbnailVariant(variant) {
        return { ...variant, id: Date.now() };
    }
    async getThumbnailVariants(projectId) {
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
    async createCanvasSession(session) {
        return { ...session, id: Date.now() };
    }
    async updateCanvasSession(id, updates) {
        return { id, ...updates };
    }
    async createThumbnailExport(exportData) {
        return { ...exportData, id: Date.now(), exportUrl: '/api/placeholder/export.png' };
    }
    async incrementExportDownload(exportId) {
        // No-op for memory storage
    }
    // Feature usage tracking methods
    async getFeatureUsage(userId) {
        return [];
    }
    async trackFeatureUsage(userId, featureId, usage) {
        // No-op for memory storage
    }
    // VeeGPT Chat operations
    async getChatConversations(userId, workspaceId) {
        return Array.from(this.chatConversations.values())
            .filter(conversation => conversation.userId === userId && conversation.workspaceId === workspaceId)
            .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
    }
    async getChatConversation(id) {
        return this.chatConversations.get(id);
    }
    async createChatConversation(conversation) {
        const id = this.currentChatConversationId++;
        const newConversation = {
            ...conversation,
            id,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        this.chatConversations.set(id, newConversation);
        return newConversation;
    }
    async updateChatConversation(id, updates) {
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
    async deleteChatConversation(id) {
        this.chatConversations.delete(id);
        // Also delete all messages in this conversation
        const messagesToDelete = Array.from(this.chatMessages.entries())
            .filter(([_, message]) => message.conversationId === id)
            .map(([messageId, _]) => messageId);
        messagesToDelete.forEach(messageId => {
            this.chatMessages.delete(messageId);
        });
    }
    async getChatMessages(conversationId) {
        return Array.from(this.chatMessages.values())
            .filter(message => message.conversationId === conversationId)
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }
    async createChatMessage(message) {
        const id = this.currentChatMessageId++;
        const newMessage = {
            ...message,
            id,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        this.chatMessages.set(id, newMessage);
        return newMessage;
    }
    async updateChatMessage(id, updates) {
        const message = this.chatMessages.get(id);
        if (!message)
            throw new Error('Message not found');
        const updatedMessage = {
            ...message,
            ...updates,
            updatedAt: new Date()
        };
        this.chatMessages.set(id, updatedMessage);
        return updatedMessage;
    }
    async getChatMessage(id) {
        return this.chatMessages.get(id);
    }
}
import { MongoStorage } from './mongodb-storage';
// Use MongoDB Atlas if connection string is available, otherwise fallback to memory storage
export const storage = (process.env.MONGODB_URI || process.env.DATABASE_URL) ? new MongoStorage() : new MemStorage();
