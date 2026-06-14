import { BaseService } from './BaseService';
import { contentRepository, ContentStatus } from '../repositories';
import { IContent } from '../models/Content';
import { ContentModel } from '../models/Content/Content';
import { NotFoundError, ValidationError } from '../errors';
import { socialAccountService } from './SocialAccountService';
import { openaiService } from './openai-service';
import { getAccessTokenFromAccount } from '../storage/converters';
import { SimpleInstagramPublisher } from '../simple-instagram-publisher';
import { getSchedulerService } from '../scheduler-service';
import { InstagramService } from '../features/instagram/services/instagram.service';

// Create singleton instance of InstagramService
const instagramService = new InstagramService();

interface CreateContentInput {
  workspaceId: string;
  type: string;
  title: string;
  description?: string;
  contentData?: Record<string, any>;
  platform?: string;
  prompt?: string;
  creditsUsed?: number;
}

interface UpdateContentInput {
  title?: string;
  description?: string;
  contentData?: Record<string, any>;
  platform?: string;
}

interface ScheduleContentInput {
  scheduledAt: Date;
  platform?: string;
}

export class ContentService extends BaseService {
  constructor() {
    super('ContentService');
  }

  async getContentById(contentId: string): Promise<IContent> {
    return this.withErrorHandling('getContentById', async () => {
      const content = await contentRepository.findById(contentId);
      if (!content) {
        throw new NotFoundError('Content', contentId);
      }
      return content;
    });
  }

  async getContentByWorkspace(
    workspaceId: string,
    page: number = 1,
    limit: number = 20,
    accountId?: string,
    excludeImported?: boolean
  ) {
    return this.withErrorHandling('getContentByWorkspace', async () => {
      return contentRepository.findByWorkspaceId(workspaceId, { page, limit }, accountId, excludeImported);
    });
  }

  async getContentByStatus(
    workspaceId: string,
    status: ContentStatus,
    page: number = 1,
    limit: number = 20
  ) {
    return this.withErrorHandling('getContentByStatus', async () => {
      return contentRepository.findByWorkspaceAndStatus(workspaceId, status, { page, limit });
    });
  }

  async getDrafts(workspaceId: string, page: number = 1, limit: number = 20) {
    return this.getContentByStatus(workspaceId, 'draft', page, limit);
  }

  async getScheduledContent(workspaceId: string): Promise<IContent[]> {
    return this.withErrorHandling('getScheduledContent', async () => {
      return contentRepository.findScheduledContent(workspaceId);
    });
  }

  async getUpcomingScheduled(workspaceId: string, limit: number = 10): Promise<IContent[]> {
    return this.withErrorHandling('getUpcomingScheduled', async () => {
      return contentRepository.findUpcomingScheduled(workspaceId, limit);
    });
  }

  async getTopPerforming(workspaceId: string, limit: number = 10): Promise<any[]> {
    return this.withErrorHandling('getTopPerforming', async () => {
      console.log(`[ContentService] getTopPerforming called for workspaceId: ${workspaceId}, limit: ${limit}`);
      // Find published posts
      const result = await contentRepository.findByWorkspaceAndStatus(
        workspaceId,
        'published',
        { page: 1, limit: 100 } // Fetch more to sort
      );

      console.log(`[ContentService] Found ${result.data.length} published posts`);


      // Sort by engagement (simple heuristic)
      const sorted = result.data.sort((a, b) => {
        const scoreA = (a.metrics?.engagement || 0) + (a.metrics?.likes || 0) + (a.metrics?.comments || 0);
        const scoreB = (b.metrics?.engagement || 0) + (b.metrics?.likes || 0) + (b.metrics?.comments || 0);
        return scoreB - scoreA;
      });

      return sorted.slice(0, limit).map(post => {
        // Safe conversion to object
        const postObj = typeof post.toObject === 'function' ? post.toObject() : post;
        const metrics = postObj.metrics || {};
        const contentData = postObj.contentData || {};

        return {
          ...postObj,
          id: postObj._id?.toString() || postObj.id,
          // Flatten media URLs for easier frontend access (Support both camelCase and snake_case)
          thumbnailUrl: contentData.thumbnailUrl || contentData.thumbnail_url || contentData.mediaUrl || contentData.media_url || 'https://via.placeholder.com/400',
          mediaUrl: contentData.mediaUrl || contentData.media_url || 'https://via.placeholder.com/400',
          // Ensure platform is available at top level
          platform: postObj.platform || contentData.platform || 'instagram',
          // Support both snake_case and camelCase for media_type
          type: postObj.type || contentData.media_type?.toLowerCase() || contentData.mediaType?.toLowerCase() || 'image',
          // Fallbacks for metrics
          metrics: {
            ...metrics,
            likes: metrics.likes || 0,
            comments: metrics.comments || 0,
            shares: metrics.shares || 0,
            views: metrics.views || metrics.reach || 0,
            engagement: metrics.engagement || 0
          },
          performanceScore: (metrics.engagement || 0) + (metrics.likes || 0) + (metrics.comments || 0),
          rankingReason: 'High Engagement'
        };
      });
    });
  }

  async getRecentlyPublished(workspaceId: string, limit: number = 10): Promise<IContent[]> {
    return this.withErrorHandling('getRecentlyPublished', async () => {
      return contentRepository.findRecentlyPublished(workspaceId, limit);
    });
  }

  async createContent(input: CreateContentInput): Promise<IContent> {
    return this.withErrorHandling('createContent', async () => {
      if (!input.title || input.title.trim().length === 0) {
        throw new ValidationError('Title is required');
      }

      const content = await contentRepository.create({
        workspaceId: input.workspaceId,
        type: input.type,
        title: input.title.trim(),
        description: input.description,
        contentData: input.contentData || {},
        platform: input.platform,
        prompt: input.prompt,
        status: 'draft',
        creditsUsed: input.creditsUsed || 0
      });

      this.log('createContent', 'Content created', {
        contentId: content._id,
        workspaceId: input.workspaceId,
        type: input.type
      });
      return content;
    });
  }

  async updateContent(contentId: string, input: UpdateContentInput): Promise<IContent> {
    return this.withErrorHandling('updateContent', async () => {
      const content = await this.getContentById(contentId);

      if (content.status === 'published') {
        throw new ValidationError('Cannot update published content');
      }

      const updated = await contentRepository.updateByIdOrFail(contentId, {
        ...input,
        updatedAt: new Date()
      });

      this.log('updateContent', 'Content updated', { contentId });
      return updated;
    });
  }

  async scheduleContent(contentId: string, input: ScheduleContentInput): Promise<IContent> {
    return this.withErrorHandling('scheduleContent', async () => {
      const content = await this.getContentById(contentId);

      if (content.status === 'published') {
        throw new ValidationError('Cannot schedule published content');
      }

      // Allow up to 5 minutes in the past to account for client-server clock skew
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      if (input.scheduledAt < fiveMinutesAgo) {
        throw new ValidationError('Scheduled time must be in the future');
      }

      const updated = await contentRepository.scheduleContent(
        contentId,
        input.scheduledAt,
        input.platform
      );

      if (!updated) {
        throw new NotFoundError('Content', contentId);
      }

      // INTEGRATE BULLMQ REDIS SCHEDULING
      const scheduler = getSchedulerService();
      if (scheduler) {
        try {
          const result = await scheduler.scheduleWithQueue({
            id: updated._id?.toString() || contentId,
            scheduledAt: input.scheduledAt,
            workspaceId: updated.workspaceId,
            platform: input.platform || updated.platform,
            title: updated.title
          });
          if (result.success) {
            this.log('scheduleContent', 'Content scheduled via BullMQ', {
              contentId,
              jobId: result.jobId
            });
          }
        } catch (queueError) {
          console.error('[SCHEDULER] Failed to schedule with queue, relying on fallback:', queueError);
        }
      }

      this.log('scheduleContent', 'Content scheduled', {
        contentId,
        scheduledAt: input.scheduledAt
      });
      return updated;
    });
  }

  async rescheduleContent(contentId: string, newScheduledAt: Date): Promise<IContent> {
    return this.withErrorHandling('rescheduleContent', async () => {
      const content = await this.getContentById(contentId);

      if (content.status !== 'scheduled') {
        throw new ValidationError('Only scheduled content can be rescheduled');
      }

      if (newScheduledAt <= new Date()) {
        throw new ValidationError('Scheduled time must be in the future');
      }

      const updated = await contentRepository.rescheduleContent(contentId, newScheduledAt);
      if (!updated) {
        throw new NotFoundError('Content', contentId);
      }

      this.log('rescheduleContent', 'Content rescheduled', {
        contentId,
        newScheduledAt
      });
      return updated;
    });
  }

  async cancelSchedule(contentId: string): Promise<IContent> {
    return this.withErrorHandling('cancelSchedule', async () => {
      const content = await this.getContentById(contentId);

      if (content.status !== 'scheduled') {
        throw new ValidationError('Only scheduled content can be unscheduled');
      }

      const updated = await contentRepository.updateByIdOrFail(contentId, {
        status: 'draft',
        scheduledAt: undefined,
        updatedAt: new Date()
      });

      this.log('cancelSchedule', 'Schedule cancelled', { contentId });
      return updated;
    });
  }

  async publishContentNow(contentId: string, baseUrl?: string): Promise<IContent> {
    return this.withErrorHandling('publishContentNow', async () => {
      const content = await this.getContentById(contentId);

      if (content.status === 'published') {
        throw new ValidationError('Content is already published');
      }

      // Get workspace's instagram account
      const instagramAccount = await socialAccountService.getAccountByPlatform(content.workspaceId.toString(), 'instagram');
      if (!instagramAccount) {
        throw new ValidationError('No Instagram account connected to this workspace');
      }

      const accessToken = getAccessTokenFromAccount(instagramAccount);
      if (!accessToken) {
        throw new ValidationError('Instagram account access token is invalid or expired');
      }

      // Handle media based on new structure or legacy structure
      let mediaUrls: string[] = [];
      const contentData = content.contentData || {};
      
      if (contentData.mediaUrls && Array.isArray(contentData.mediaUrls) && contentData.mediaUrls.length > 0) {
        mediaUrls = contentData.mediaUrls;
      } else if (contentData.mediaUrl) {
        mediaUrls = [contentData.mediaUrl];
      }

      if (mediaUrls.length === 0) {
        throw new ValidationError('No media available to publish');
      }

      // Build proper URLs
      const devDomain = process.env.REPLIT_DEV_DOMAIN && process.env.REPLIT_DEV_DOMAIN !== 'your-replit-dev-domain-here' ? process.env.REPLIT_DEV_DOMAIN : null;
      const finalBaseUrl = baseUrl || (devDomain ? `https://${devDomain}` : 'http://localhost:5000');
      
      const publisher = new SimpleInstagramPublisher();
      let caption = '';
      if (contentData?.text) {
        caption = contentData.text;
      } else {
        caption = content.description ? content.description : content.title;
      }
      caption = caption.trim();

      const mentions = contentData?.mentions || [];
      const hashtags = contentData?.hashtags || [];

      const isVideoType = content.type === 'video' || content.type === 'reel' || content.type === 'story' || 
                         mediaUrls.some((url: string) => url.match(/\.(mp4|mov|avi|mkv|webm|3gp|m4v)$/i));

      if (hashtags.length > 0 || (mentions.length > 0 && isVideoType)) {
        caption += '\n\n';
        if (mentions.length > 0 && isVideoType) {
          caption += mentions.map((m: string) => `@${m.replace(/^@+/, '')}`).join(' ') + ' ';
        }
        if (hashtags.length > 0) {
          caption += hashtags.map((h: string) => `#${h.replace(/^#+/, '')}`).join(' ');
        }
      }
      caption = caption.trim();

      const result = await publisher.publishPost({
        accountId: instagramAccount.accountId || (instagramAccount as any)._id?.toString(),
        accessToken: accessToken,
        content: caption,
        mentions: mentions,
        collaborators: contentData?.collaborators || [],
        mediaFiles: mediaUrls.map((url: string) => {
          let cleanUrl = url;
          if (url.startsWith('blob:')) {
            const filename = url.split('/').pop() || 'media';
            cleanUrl = `${finalBaseUrl}/uploads/${filename}`;
          } else if (url.startsWith('/')) {
            cleanUrl = `${finalBaseUrl}${url}`;
          } else if (url.includes('localhost') || url.includes('your-replit-dev-domain')) {
            try {
              const urlObj = new URL(url);
              cleanUrl = `${finalBaseUrl}${urlObj.pathname}${urlObj.search}`;
            } catch (e) {
              const filename = url.split('/').pop() || 'media';
              cleanUrl = `${finalBaseUrl}/uploads/${filename}`;
            }
          }
          return { url: cleanUrl, type: content.type === 'video' || url.match(/\.(mp4|mov)$/i) ? 'video' : 'photo' };
        }),
        postType: content.type
      });

      if (!result.success) {
        await contentRepository.updateByIdOrFail(contentId, {
          status: 'failed',
          error: result.error,
          updatedAt: new Date()
        });
        throw new Error(result.error || 'Failed to publish to Instagram');
      }

      // Success
      const updated = await contentRepository.updateByIdOrFail(contentId, {
        status: 'published',
        instagramPostId: result.postId,
        publishedAt: new Date(),
        updatedAt: new Date()
      });

      this.log('publishContentNow', 'Content published immediately', { contentId, postId: result.postId });
      return updated;
    });
  }

  async markPublished(contentId: string): Promise<IContent> {
    return this.withErrorHandling('markPublished', async () => {
      const updated = await contentRepository.markPublished(contentId);
      if (!updated) {
        throw new NotFoundError('Content', contentId);
      }
      this.log('markPublished', 'Content marked as published', { contentId });
      return updated;
    });
  }

  async markFailed(contentId: string): Promise<IContent> {
    return this.withErrorHandling('markFailed', async () => {
      const updated = await contentRepository.markFailed(contentId);
      if (!updated) {
        throw new NotFoundError('Content', contentId);
      }
      this.log('markFailed', 'Content marked as failed', { contentId });
      return updated;
    });
  }

  async syncMissingInstagramId(contentId: string, userId: string): Promise<IContent> {
    return this.withErrorHandling('syncMissingInstagramId', async () => {
      const content = await this.getContentById(contentId);
      
      if (content.instagramPostId || content.contentData?.externalId) {
        return content; // Already has ID
      }
      
      const instagramAccount = await socialAccountService.getAccountByPlatform(content.workspaceId.toString(), 'instagram');
      if (!instagramAccount) {
        throw new Error('No Instagram account connected to this workspace');
      }

      const token = getAccessTokenFromAccount(instagramAccount);
      if (!token) {
        throw new Error('Instagram account is disconnected');
      }

      // Fetch recent media from Instagram
      const accountId = instagramAccount.accountId || (instagramAccount as any)._id?.toString();
      
      // Using new InstagramService
      const mediaList = await instagramService.getUserMedia(token, 50, accountId);
      
      if (!mediaList || mediaList.length === 0) {
        throw new Error('Could not find any recent posts on Instagram');
      }

      // Try to find a match
      // First try matching by text/caption if available
      let matchedMedia = null;
      const contentText = content.contentData?.text?.trim() || content.title?.trim();
      
      if (contentText) {
        matchedMedia = mediaList.find(m => m.caption && m.caption.includes(contentText.substring(0, 50)));
      }
      
      // Fallback: match by timestamp within a 2-hour window
      if (!matchedMedia) {
        const targetTime = new Date(content.publishedAt || content.scheduledAt || content.createdAt).getTime();
        
        for (const media of mediaList) {
          const mediaTime = new Date(media.timestamp).getTime();
          const diffHours = Math.abs(mediaTime - targetTime) / (1000 * 60 * 60);
          
          if (diffHours < 2) {
            matchedMedia = media;
            break;
          }
        }
      }

      if (!matchedMedia) {
        throw new Error('Could not find a matching post on Instagram. It may not have been published, or the caption/time is too different.');
      }

      // We found a match! Save it to DB
      const updated = await contentRepository.updateByIdOrFail(contentId, {
        instagramPostId: matchedMedia.id,
        updatedAt: new Date()
      });
      
      this.log('syncMissingInstagramId', 'Successfully synced missing Instagram ID', { contentId, matchedId: matchedMedia.id });
      return updated;
    });
  }

  async archiveContent(contentId: string): Promise<IContent> {
    return this.withErrorHandling('archiveContent', async () => {
      const content = await this.getContentById(contentId);

      if (content.status === 'scheduled') {
        throw new ValidationError('Cannot archive scheduled content. Cancel the schedule first.');
      }

      const updated = await contentRepository.archiveContent(contentId);
      if (!updated) {
        throw new NotFoundError('Content', contentId);
      }

      this.log('archiveContent', 'Content archived', { contentId });
      return updated;
    });
  }

  async deleteContent(contentId: string): Promise<void> {
    return this.withErrorHandling('deleteContent', async () => {
      const content = await this.getContentById(contentId);

      if (content.status === 'scheduled') {
        throw new ValidationError('Cannot delete scheduled content. Cancel the schedule first.');
      }

      await contentRepository.deleteById(contentId);
      this.log('deleteContent', 'Content deleted', { contentId });
    });
  }

  async getContentDueForPublishing(): Promise<IContent[]> {
    return this.withErrorHandling('getContentDueForPublishing', async () => {
      return contentRepository.findDueForPublishing();
    });
  }

  async addCreditsUsed(contentId: string, credits: number): Promise<IContent> {
    return this.withErrorHandling('addCreditsUsed', async () => {
      const updated = await contentRepository.addCreditsUsed(contentId, credits);
      if (!updated) {
        throw new NotFoundError('Content', contentId);
      }
      return updated;
    });
  }

  async searchContent(workspaceId: string, query: string, page: number = 1, limit: number = 20) {
    return this.withErrorHandling('searchContent', async () => {
      return contentRepository.searchContent(workspaceId, query, { page, limit });
    });
  }

  async getContentStats(workspaceId: string): Promise<{
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    totalCreditsUsed: number;
  }> {
    return this.withErrorHandling('getContentStats', async () => {
      const [byStatus, byType, totalCreditsUsed] = await Promise.all([
        contentRepository.countByStatus(workspaceId),
        contentRepository.countByType(workspaceId),
        contentRepository.getTotalCreditsUsed(workspaceId)
      ]);

      return { byStatus, byType, totalCreditsUsed };
    });
  }

  async getContentAnalytics(contentId: string): Promise<any> {
    return this.withErrorHandling('getContentAnalytics', async () => {
      const content = await this.getContentById(contentId);
      
      // Get the workspace's Instagram account for demographics and token
      const instagramAccount = await socialAccountService.getAccountByPlatform(content.workspaceId.toString(), 'instagram');
      
      let demographics = null;
      let token = null;

      if (instagramAccount) {
        token = getAccessTokenFromAccount(instagramAccount);
        demographics = {
          audienceCity: (instagramAccount as any).audienceCity || {},
          audienceCountry: (instagramAccount as any).audienceCountry || {},
          audienceGenderAge: (instagramAccount as any).audienceGenderAge || {},
          audienceActiveTime: (instagramAccount as any).audienceActiveTime || {}
        };
      }

      const now = new Date().getTime();
      const lastSync = content.metrics?.lastSyncAt ? new Date(content.metrics.lastSyncAt).getTime() : 0;
      
      // 90 minutes cache
      const isStale = (now - lastSync) > 90 * 60 * 1000;

      let currentMetrics = content.metrics || {};
      
      const mediaId = content.instagramPostId || content.contentData?.externalId;

      if (content.status === 'published' && mediaId && token && isStale) {
        try {
          this.log('getContentAnalytics', 'Fetching fresh media insights from Instagram', { contentId, mediaId });
          
          let mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'STORY' = 'IMAGE';
          if (content.type === 'video' || content.type === 'reel') mediaType = 'VIDEO';
          else if (content.type === 'story') mediaType = 'STORY';
          else if (content.contentData?.mediaUrls && content.contentData.mediaUrls.length > 1) mediaType = 'CAROUSEL_ALBUM';

          const freshInsights = await instagramService.getMediaInsights(
            mediaId,
            token,
            mediaType
          );

          // Merge fresh insights
          const mergedMetrics: Record<string, any> = { ...currentMetrics };
          
          // Only overwrite if the fresh insight is a number
          for (const [key, value] of Object.entries(freshInsights)) {
            if (typeof value === 'number') {
              mergedMetrics[key] = value;
            }
          }
          
          mergedMetrics.lastSyncAt = new Date();
          currentMetrics = mergedMetrics;

          // Update in DB
          await contentRepository.updateByIdOrFail(contentId, {
            metrics: currentMetrics,
            updatedAt: new Date()
          });

        } catch (error) {
          this.log('getContentAnalytics', 'Error fetching fresh insights', { contentId, error: (error as Error).message });
          // If it fails, we just fall back to the existing metrics
        }
      }

      // Calculate Historical Benchmarks and Growth
      let historicalData: any[] = [];
      let benchmark: any = {};
      let aiInsight = null;

      try {
        // Fetch last 10 published posts of the same type
        const historicalPosts = await contentRepository.findHistoricalPosts(
          content.workspaceId.toString(),
          content.type,
          content._id.toString()
        );

        if (historicalPosts.length > 0) {
          // Calculate averages
          const sums = { reach: 0, likes: 0, comments: 0, plays: 0, replies: 0 };
          let counts = { reach: 0, likes: 0, comments: 0, plays: 0, replies: 0 };

          const rawHistorical = historicalPosts.map((p: any) => {
            const m = p.metrics || {};
            if (m.reach != null) { sums.reach += m.reach; counts.reach++; }
            if (m.likes != null) { sums.likes += m.likes; counts.likes++; }
            if (m.comments != null) { sums.comments += m.comments; counts.comments++; }
            if (m.plays != null) { sums.plays += m.plays; counts.plays++; }
            if (m.replies != null) { sums.replies += m.replies; counts.replies++; }

            return {
              date: new Date(p.publishedAt || p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              reach: m.reach || 0,
              likes: m.likes || 0,
              plays: m.plays || 0,
              replies: m.replies || 0,
              isCurrent: false
            };
          }).reverse(); // chronological for chart

          benchmark = {
            avgReach: counts.reach > 0 ? Math.round(sums.reach / counts.reach) : 0,
            avgLikes: counts.likes > 0 ? Math.round(sums.likes / counts.likes) : 0,
            avgComments: counts.comments > 0 ? Math.round(sums.comments / counts.comments) : 0,
            avgPlays: counts.plays > 0 ? Math.round(sums.plays / counts.plays) : 0,
            avgReplies: counts.replies > 0 ? Math.round(sums.replies / counts.replies) : 0,
          };

          // Calculate growth percentages
          const calcGrowth = (current: number, avg: number) => {
            if (!avg || avg === 0) return current > 0 ? 100 : 0;
            return Math.round(((current - avg) / avg) * 100);
          };

          benchmark.growthReach = calcGrowth(currentMetrics.reach || 0, benchmark.avgReach);
          benchmark.growthLikes = calcGrowth(currentMetrics.likes || 0, benchmark.avgLikes);
          benchmark.growthComments = calcGrowth(currentMetrics.comments || 0, benchmark.avgComments);
          benchmark.growthPlays = calcGrowth(currentMetrics.plays || 0, benchmark.avgPlays);
          benchmark.growthReplies = calcGrowth(currentMetrics.replies || 0, benchmark.avgReplies);

          historicalData = [...rawHistorical, {
            date: new Date(content.publishedAt || content.createdAt || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            reach: currentMetrics.reach || 0,
            likes: currentMetrics.likes || 0,
            plays: currentMetrics.plays || 0,
            replies: currentMetrics.replies || 0,
            isCurrent: true
          }];

          // Generate AI Insight
          const relevantCurrent: any = { reach: currentMetrics.reach, likes: currentMetrics.likes, comments: currentMetrics.comments };
          const relevantAvg: any = { reach: benchmark.avgReach, likes: benchmark.avgLikes, comments: benchmark.avgComments };
          if (content.type === 'story') {
             relevantCurrent.replies = currentMetrics.replies;
             relevantAvg.replies = benchmark.avgReplies;
          } else if (content.type === 'reel' || content.type === 'video') {
             relevantCurrent.plays = currentMetrics.plays;
             relevantAvg.plays = benchmark.avgPlays;
          }

          aiInsight = await openaiService.generateAnalyticsInsight(relevantCurrent, relevantAvg, content.type);
        } else {
          // No historical data, just current
          historicalData = [{
            date: new Date(content.publishedAt || content.createdAt || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            reach: currentMetrics.reach || 0,
            likes: currentMetrics.likes || 0,
            plays: currentMetrics.plays || 0,
            replies: currentMetrics.replies || 0,
            isCurrent: true
          }];
          aiInsight = "This is your first post of this type! As you publish more, we'll generate advanced growth insights and benchmarks here.";
        }
      } catch (err) {
        console.error('🚨 [getContentAnalytics] CRITICAL ERROR IN AI ALGORITHM:', err);
        this.log('getContentAnalytics', 'Error calculating historical benchmarks', { error: (err as Error).message });
      }

      return {
        content,
        metrics: currentMetrics,
        demographics,
        benchmark,
        historicalData,
        aiInsight
      };
    });
  }
}

export const contentService = new ContentService();
