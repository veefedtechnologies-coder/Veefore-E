import { IStorage } from './storage';
import Logger from './utils/logger';
import { InstagramApiService } from './services/instagramApi';
import { contentRepository } from './repositories/ContentRepository';

export class InstagramDirectSync {
  constructor(private storage: IStorage) { }

  async updateAccountWithRealData(workspaceId: string, providedAccessToken?: string): Promise<void> {
    try {
      Logger.info('InstagramDirectSync', '🚀 Starting direct update for workspace:', { workspaceId });

      // Get connected Instagram accounts for this workspace (with tokens for internal use)
      const accounts = await this.storage.getSocialAccountsWithTokensInternal(workspaceId);
      Logger.info('InstagramDirectSync', `Found ${accounts.length} total active social accounts for workspace`);

      const instagramAccount = accounts.find(acc => acc.platform === 'instagram');

      if (!instagramAccount) {
        Logger.info('InstagramDirectSync', 'No Instagram account found for workspace - skipping sync');
        return;
      }

      let token = providedAccessToken || (instagramAccount as any).accessToken;

      if (!token) {
        Logger.info('InstagramDirectSync', 'Instagram account exists but no access token could be retrieved/decrypted - skipping sync');
        return;
      }

      // Additional safety check - verify account has required fields
      if (!instagramAccount.id || !instagramAccount.username) {
        Logger.info('InstagramDirectSync', 'Instagram account missing required fields (id or username) - skipping sync');
        return;
      }

      Logger.info('InstagramDirectSync', `Using access token for account: ${instagramAccount.username}`);

      // Fetch real Instagram profile data using the correct access token
      const profileData = await this.fetchProfileData(token, workspaceId);
      Logger.info('InstagramDirectSync', 'Fetched profile data from Instagram API', {
        username: profileData.username,
        followers: profileData.followersCount,
        hasRealEngagement: !!profileData.realEngagement
      });

      // Calculate realistic engagement metrics
      const engagementMetrics = this.calculateEngagementMetrics(profileData);
      Logger.info('InstagramDirectSync', 'Calculated engagement metrics', engagementMetrics);

      // P2-FIX: LIFETIME REACH RESTORATION
      // Check DB for aggregated reach from all posts to prevent overwriting lifetime total with 28-day snapshot
      let finalReach = engagementMetrics.totalReach || 0;
      try {
        const dbMetrics = await contentRepository.getAggregatedMetrics(workspaceId);
        if (dbMetrics.totalReach > finalReach) {
          Logger.info('InstagramDirectSync', `Restoring Lifetime Reach: ${dbMetrics.totalReach} > ${finalReach} (Snapshot)`);
          finalReach = dbMetrics.totalReach;
        }
      } catch (dbError: any) {
        Logger.error('InstagramDirectSync', 'Failed to aggregate DB metrics for reach check', { error: dbError.message });
      }

      // ✅ ENHANCED DEBUG: Log the exact data being sent to update
      const updatePayload = {
        ...profileData,
        ...engagementMetrics,
        totalReach: finalReach, // Use validated lifetime reach
        lastSyncAt: new Date(),
        updatedAt: new Date()
      };

      // Update account using MongoDB direct operation
      await this.updateAccountDirect(workspaceId, { ...updatePayload, tokenStatus: 'valid' });

      // ✅ NEW: Also record to Analytics collection for immediate mobile visibility (P1-5 FIX)
      try {
        const { analyticsService } = await import('./services/AnalyticsService');
        await analyticsService.recordMetrics({
          workspaceId,
          platform: 'instagram',
          followers: profileData.followersCount,
          likes: profileData.realEngagement.totalLikes,
          comments: profileData.realEngagement.totalComments,
          shares: profileData.realEngagement.totalShares,
          reach: profileData.realEngagement.totalReach,
          reachDay: profileData.realEngagement.reachDay,
          reachWeek: profileData.realEngagement.reachWeek,
          reachDays28: profileData.realEngagement.reachDays28,
          engagement: engagementMetrics.avgEngagement,
          audienceCity: profileData.audienceCity,
          audienceCountry: profileData.audienceCountry,
          audienceGenderAge: profileData.audienceGenderAge,
          audienceActiveTime: profileData.audienceActiveTime
        });
        Logger.info('InstagramDirectSync', '✅ Recorded metrics to Analytics collection');
      } catch (analyticsError: any) {
        Logger.error('InstagramDirectSync', 'Failed to record analytics', { error: analyticsError.message });
      }

      // 3. Sync media items to ContentModel for historical tracking (P1 FIX: Ensure manual sync updates posts)
      if (profileData.recentMedia && profileData.recentMedia.length > 0) {
        await this.syncMediaItems(workspaceId, profileData.recentMedia);
      }

      Logger.info('InstagramDirectSync', 'Successfully updated account with real data');

    } catch (error: any) {
      Logger.error('InstagramDirectSync', 'Error updating account', { error: error.message });
    }
  }

  /**
   * Sync recent media to our ContentModel for historical tracking
   */
  private async syncMediaItems(workspaceId: string, mediaItems: any[]): Promise<void> {
    if (!mediaItems || mediaItems.length === 0) return;

    try {
      Logger.info('InstagramDirectSync', `📥 Syncing ${mediaItems.length} posts to ContentModel...`);

      const ops = mediaItems.map((media: any) => ({
        updateOne: {
          filter: { 'contentData.externalId': media.id },
          update: {
            $set: {
              workspaceId: workspaceId,
              platform: 'instagram',
              type: media.media_type === 'VIDEO' ? 'video' : 'image',
              title: media.caption ? media.caption.substring(0, 50) + (media.caption.length > 50 ? '...' : '') : 'Instagram Post',
              description: media.caption || '',
              contentData: {
                externalId: media.id,
                mediaUrl: media.media_url,
                permalink: media.permalink,
                thumbnailUrl: media.thumbnail_url || media.media_url,
                mediaType: media.media_type
              },
              status: 'published',
              publishedAt: new Date(media.timestamp),
              metrics: {
                likes: media.like_count || 0,
                comments: media.comments_count || 0,
                shares: media.insights?.shares || 0,
                saves: media.insights?.saves || 0,
                reach: media.insights?.reach || 0,
                impressions: media.insights?.impressions || 0
              },
              updatedAt: new Date()
            },
            $setOnInsert: {
              createdAt: new Date(),
              creditsUsed: 0
            }
          },
          upsert: true
        }
      }));

      if (ops.length > 0) {
        // Use the contentRepository's model directly or import ContentModel if necessary. 
        // Since contentRepository imports ContentModel, we can import ContentModel at top of file.
        const { ContentModel } = await import('./models/Content/Content');
        await ContentModel.bulkWrite(ops);
        Logger.info('InstagramDirectSync', `✅ Synced ${ops.length} posts to ContentModel`);
      }
    } catch (error: any) {
      Logger.error('InstagramDirectSync', 'Failed to sync ContentModel', { error: error.message });
    }
  }

  private async fetchProfileData(accessToken: string, workspaceId: string): Promise<any> {
    try {
      console.log('[INSTAGRAM DIRECT] === STARTING NEW REFACTORED FETCH ===');

      // Get the stored account ID from the account record
      const accounts = await this.storage.getSocialAccountsWithTokensInternal(workspaceId);
      const instagramAccount = accounts.find(acc => acc.platform === 'instagram');
      const accountId = instagramAccount?.accountId;

      // Use the centralized InstagramApiService
      const data = await InstagramApiService.getComprehensiveMetrics(
        accessToken,
        accountId
      );

      console.log('[INSTAGRAM DIRECT] Real Instagram Business profile via Service:', data.account);

      return {
        accountId: data.account.id,
        username: data.account.username,
        followersCount: data.account.followers_count || 0,
        mediaCount: data.account.media_count || 0,
        accountType: data.account.account_type || 'PERSONAL',
        realEngagement: {
          totalLikes: data.aggregated.totalLikes,
          totalComments: data.aggregated.totalComments,
          postsAnalyzed: data.recentMedia.length,
          totalShares: data.aggregated.totalShares,
          totalSaves: data.aggregated.totalSaves,
          totalReach: data.aggregated.totalReach,
          reachDay: data.insights.reach_day || 0,
          reachWeek: data.insights.reach_week || 0,
          reachDays28: data.insights.reach_days_28 || 0,
          totalImpressions: data.insights.impressions || 0
        },
        audienceCity: data.demographics?.audienceCity,
        audienceCountry: data.demographics?.audienceCountry,
        audienceGenderAge: data.demographics?.audienceGenderAge,
        audienceActiveTime: data.demographics?.audienceActiveTime,
        recentMedia: data.recentMedia // Pass media for syncing
      };
    } catch (error: any) {
      console.error('[INSTAGRAM DIRECT] Refactored fetch failed:', error.message);
      throw error;
    }
  }


  private calculateEngagementMetrics(profileData: any): any {
    const followers = profileData.followersCount || 0;
    const mediaCount = profileData.mediaCount || 0;
    const realEngagement = profileData.realEngagement || { totalLikes: 0, totalComments: 0, postsAnalyzed: 0 };

    const totalLikes = realEngagement.totalLikes || 0;
    const totalComments = realEngagement.totalComments || 0;
    const postsAnalyzed = realEngagement.postsAnalyzed || mediaCount;

    const avgLikes = postsAnalyzed > 0 ? Math.floor(totalLikes / postsAnalyzed) : 0;
    const avgComments = postsAnalyzed > 0 ? Math.floor(totalComments / postsAnalyzed) : 0;

    // Engagement rate calculation
    const totalEngagement = totalLikes + totalComments + (realEngagement.totalShares || 0);
    const avgEngagement = followers > 0 ? Number(((totalEngagement / followers) / (postsAnalyzed || 1) * 100).toFixed(2)) : 0;

    return {
      totalLikes,
      totalComments,
      totalShares: realEngagement.totalShares || 0,
      totalSaves: realEngagement.totalSaves || 0,
      avgComments,
      avgEngagement,
      postsAnalyzed,
      totalReach: realEngagement.totalReach || 0,
      reachDay: realEngagement.reachDay || 0,
      reachWeek: realEngagement.reachWeek || 0,
      reachDays28: realEngagement.reachDays28 || 0
    };
  }

  private async updateAccountDirect(workspaceId: string, updateData: any): Promise<void> {
    try {
      const accounts = await this.storage.getSocialAccountsWithTokensInternal(workspaceId);
      const instagramAccount = accounts.find(acc => acc.platform === 'instagram');

      if (instagramAccount) {
        const updateFields = {
          followersCount: updateData.followersCount || 0,
          mediaCount: updateData.mediaCount || 0,
          totalLikes: updateData.totalLikes || 0,
          totalComments: updateData.totalComments || 0,
          totalShares: updateData.totalShares || 0,
          totalSaves: updateData.totalSaves || 0,
          avgLikes: updateData.avgLikes || 0,
          avgComments: updateData.avgComments || 0,
          avgEngagement: updateData.avgEngagement || 0,
          totalReach: updateData.totalReach || 0,
          profilePictureUrl: updateData.profilePictureUrl || null,
          lastSyncAt: updateData.lastSyncAt,
          updatedAt: updateData.updatedAt,
          accountType: updateData.accountType,
          isBusinessAccount: updateData.accountType === 'BUSINESS' || updateData.accountType === 'CREATOR',
          audienceCity: updateData.audienceCity || {},
          audienceCountry: updateData.audienceCountry || {},
          audienceGenderAge: updateData.audienceGenderAge || {},
          audienceActiveTime: updateData.audienceActiveTime || {}
        };

        console.log('[INSTAGRAM DIRECT] 🔍 Final update fields being written to DB:', updateFields);
        await this.storage.updateSocialAccount(instagramAccount.id, updateFields);
        console.log('[INSTAGRAM DIRECT] ✅ Updated account via storage.updateSocialAccount');
      } else {
        console.log('[INSTAGRAM DIRECT] No Instagram account found for workspace');
      }
    } catch (error) {
      console.error('[INSTAGRAM DIRECT] Error in direct update:', error);
      throw error;
    }
  }
}
