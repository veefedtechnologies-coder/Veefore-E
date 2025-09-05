import mongoose from 'mongoose';
import { MainAppUserSchema } from '../models/MainAppUser';

// Service to track and update real-time analytics based on actual user behavior
export class RealTimeAnalyticsService {
  private static instance: RealTimeAnalyticsService;
  private connection: any;

  private constructor() {}

  public static getInstance(): RealTimeAnalyticsService {
    if (!RealTimeAnalyticsService.instance) {
      RealTimeAnalyticsService.instance = new RealTimeAnalyticsService();
    }
    return RealTimeAnalyticsService.instance;
  }

  // Connect to the main app database
  private async connectToMainApp() {
    if (this.connection) return this.connection;
    
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
    
    this.connection = await mongoose.createConnection(MONGODB_URI, {
      dbName: 'veeforedb'
    });
    
    return this.connection;
  }

  // Update analytics based on real user behavior
  public async updateRealTimeAnalytics(userId: string, action: string, data: any = {}) {
    try {
      const connection = await this.connectToMainApp();
      const User = connection.model('User', MainAppUserSchema, 'users');
      
      const user = await User.findById(userId);
      if (!user) return;

      let updateFields: any = {};

      switch (action) {
        case 'ai_usage':
          // Track real AI usage
          updateFields = {
            'aiUsage.totalCreditsUsed': (user.aiUsage?.totalCreditsUsed || 0) + (data.creditsUsed || 0),
            'aiUsage.lastUsed': new Date(),
            'credits': (user.credits || 0) - (data.creditsUsed || 0)
          };
          
          // Update specific AI usage categories
          if (data.type) {
            updateFields[`aiUsage.${data.type}.count`] = (user.aiUsage?.[data.type]?.count || 0) + 1;
            updateFields[`aiUsage.${data.type}.creditsUsed`] = (user.aiUsage?.[data.type]?.creditsUsed || 0) + (data.creditsUsed || 0);
          }
          break;

        case 'content_created':
          // Track real content creation
          updateFields = {
            'contentStats.totalCreated': (user.contentStats?.totalCreated || 0) + 1,
            'contentStats.lastCreated': new Date()
          };
          
          if (data.type) {
            updateFields[`contentStats.${data.type}.count`] = (user.contentStats?.[data.type]?.count || 0) + 1;
            if (data.aiGenerated) {
              updateFields[`contentStats.${data.type}.aiGenerated`] = (user.contentStats?.[data.type]?.aiGenerated || 0) + 1;
            }
          }
          break;

        case 'social_engagement':
          // Track real social engagement
          updateFields = {
            'totalLikes': (user.totalLikes || 0) + (data.likes || 0),
            'totalComments': (user.totalComments || 0) + (data.comments || 0)
          };
          break;

        case 'login':
          // Track real login activity
          updateFields = {
            'loginCount': (user.loginCount || 0) + 1,
            'lastLogin': new Date(),
            'lastActiveAt': new Date(),
            'dailyLoginStreak': this.calculateLoginStreak(user.dailyLoginStreak || 0, user.lastLogin)
          };
          break;

        case 'plan_upgrade':
          // Track real revenue
          updateFields = {
            'plan': data.newPlan,
            'planUpgradedAt': new Date(),
            'revenueStats.totalSpent': (user.revenueStats?.totalSpent || 0) + (data.amount || 0),
            'revenueStats.subscriptionRevenue': (user.revenueStats?.subscriptionRevenue || 0) + (data.amount || 0),
            'revenueStats.lastPayment': new Date()
          };
          break;

        case 'social_connection':
          // Track real social connections
          if (data.platform) {
            const socialPlatforms = user.socialPlatforms || [];
            const existingPlatform = socialPlatforms.find((p: any) => p.name === data.platform);
            
            if (existingPlatform) {
              existingPlatform.followers = data.followers || existingPlatform.followers;
              existingPlatform.verified = data.verified || existingPlatform.verified;
              existingPlatform.connected = true;
              existingPlatform.connectedAt = new Date();
            } else {
              socialPlatforms.push({
                name: data.platform,
                handle: data.handle,
                followers: data.followers || 0,
                verified: data.verified || false,
                connected: true,
                connectedAt: new Date()
              });
            }
            
            updateFields.socialPlatforms = socialPlatforms;
          }
          break;
      }

      // Update the user with real-time data
      if (Object.keys(updateFields).length > 0) {
        await User.updateOne({ _id: userId }, { $set: updateFields });
        console.log(`✅ Updated real-time analytics for user ${userId}: ${action}`);
      }

    } catch (error) {
      console.error('❌ Error updating real-time analytics:', error);
    }
  }

  // Calculate login streak based on real login patterns
  private calculateLoginStreak(currentStreak: number, lastLogin: Date): number {
    if (!lastLogin) return 1;
    
    const now = new Date();
    const lastLoginDate = new Date(lastLogin);
    const daysDiff = Math.floor((now.getTime() - lastLoginDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDiff === 1) {
      return currentStreak + 1; // Consecutive day
    } else if (daysDiff === 0) {
      return currentStreak; // Same day
    } else {
      return 1; // Reset streak
    }
  }

  // Get real-time analytics for a user
  public async getRealTimeAnalytics(userId: string) {
    try {
      const connection = await this.connectToMainApp();
      const User = connection.model('User', MainAppUserSchema, 'users');
      
      const user = await User.findById(userId).lean();
      if (!user) return null;

      // Calculate real analytics based on actual data
      const realSocialFollowers = user.socialPlatforms?.reduce((sum: number, platform: any) => sum + (platform.followers || 0), 0) || 0;
      const realTotalPosts = user.totalPosts || 0;
      const realTotalLikes = user.totalLikes || 0;
      const realTotalComments = user.totalComments || 0;
      const realLoginCount = user.loginCount || 0;
      const realCredits = user.credits || 0;
      const realCreditsUsed = user.aiUsage?.totalCreditsUsed || 0;
      
      // Calculate real engagement rate
      const realEngagementRate = realTotalPosts > 0 ? ((realTotalLikes + realTotalComments) / realTotalPosts) : 0;
      
      // Calculate real activity level
      const daysSinceCreated = Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      const realActivityLevel = realLoginCount > 0 ? (realLoginCount / daysSinceCreated) : 0;

      return {
        socialAnalytics: {
          totalConnections: user.socialPlatforms?.length || 0,
          totalFollowers: realSocialFollowers,
          averageEngagement: parseFloat(realEngagementRate.toFixed(2)),
          platforms: user.socialPlatforms || []
        },
        aiAnalytics: {
          totalCreditsUsed: realCreditsUsed,
          totalCreditsAvailable: realCredits,
          creditsRemaining: realCredits - realCreditsUsed,
          lastUsed: user.aiUsage?.lastUsed
        },
        contentAnalytics: {
          totalCreated: realTotalPosts,
          totalLikes: realTotalLikes,
          totalComments: realTotalComments,
          engagementRate: parseFloat(realEngagementRate.toFixed(2))
        },
        activityAnalytics: {
          totalSessions: realLoginCount,
          dailyLoginStreak: user.dailyLoginStreak || 0,
          lastActiveAt: user.lastActiveAt || user.lastLoginAt,
          activityLevel: parseFloat(realActivityLevel.toFixed(2))
        }
      };

    } catch (error) {
      console.error('❌ Error getting real-time analytics:', error);
      return null;
    }
  }
}

export default RealTimeAnalyticsService;
