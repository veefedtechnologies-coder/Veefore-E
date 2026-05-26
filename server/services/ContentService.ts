import { BaseService } from './BaseService';
import { contentRepository, ContentStatus } from '../repositories';
import { IContent } from '../models/Content';
import { NotFoundError, ValidationError } from '../errors';
import { socialAccountService } from './SocialAccountService';
import { getAccessTokenFromAccount } from '../storage/converters';
import { SimpleInstagramPublisher } from '../simple-instagram-publisher';
import { getSchedulerService } from '../scheduler-service';

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
    accountId?: string
  ) {
    return this.withErrorHandling('getContentByWorkspace', async () => {
      return contentRepository.findByWorkspaceId(workspaceId, { page, limit }, accountId);
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
      const finalBaseUrl = baseUrl || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'http://localhost:5000');
      
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
}

export const contentService = new ContentService();
