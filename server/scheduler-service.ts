import { IStorage } from "./storage";
import { instagramAPI } from "./instagram-api";
import { PostSchedulerManager, isRedisAvailable } from "./queues/postQueue";
import { ensureRedisConnected } from "./queues/metricsQueue";
import { PostWorker } from "./workers/postWorker";
import { VerifyWorker } from "./workers/verifyWorker";

export class SchedulerService {
  private storage: IStorage;
  private checkInterval: NodeJS.Timeout | null = null;
  private dailySnapshotInterval: NodeJS.Timeout | null = null;
  private workerStarted: boolean = false;

  constructor(storage: IStorage) {
    this.storage = storage;
  }

  async start() {
    console.log('[SCHEDULER] Starting background scheduler service');

    // Try to connect to Redis and start the worker
    const redisConnected = await ensureRedisConnected();
    if (redisConnected) {
      console.log('[SCHEDULER] Redis available - starting BullMQ post + verify workers');
      await PostWorker.start(this.storage);
      await VerifyWorker.start(this.storage);
      this.workerStarted = true;
    } else {
      console.log('[SCHEDULER] Redis unavailable - using in-memory fallback scheduler');
    }

    // Schedule daily analytics snapshot + deep hibernation cleanup via BullMQ
    import('./queues/metricsQueue').then(({ MetricsQueueManager }) => {
      MetricsQueueManager.scheduleDailySnapshots();
      MetricsQueueManager.scheduleSocialListeningTrends();
      MetricsQueueManager.scheduleDeepHibernationCleanup();
    }).catch(err => {
      console.error('Failed to load metricsQueue:', err);
    });

    // Schedule fallback content processing via BullMQ
    import('./queues/postQueue').then(({ PostSchedulerManager }) => {
      PostSchedulerManager.scheduleFallbackChecks();
    }).catch(err => {
      console.error('Failed to load postQueue for fallback checks:', err);
    });

    // Clean up corrupted ghost records before starting
    this.cleanupCorruptedScheduledContent().catch(err => {
      console.error('[SCHEDULER] Failed to clean up corrupted content:', err);
    });

    this.processScheduledContent();
  }

  private async cleanupCorruptedScheduledContent() {
    try {
      const { ContentModel } = await import('./models/Content');
      // Delete content that was permanently corrupted by old legacy code
      // missing workspaceId, or scheduled/queued but without a scheduledAt date
      const result = await ContentModel.deleteMany({
        $or: [
          { workspaceId: { $exists: false } },
          { workspaceId: null },
          { status: { $in: ['scheduled', 'queued'] }, scheduledAt: null }
        ]
      });
      
      if (result.deletedCount > 0) {
        console.log(`[SCHEDULER] 🧹 Cleaned up ${result.deletedCount} permanently corrupted ghost records from database.`);
      }
    } catch (err) {
      console.error('[SCHEDULER] Cleanup check failed:', err);
    }
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    if (this.dailySnapshotInterval) {
      clearInterval(this.dailySnapshotInterval);
      this.dailySnapshotInterval = null;
    }

    if (PostWorker.isRunning()) {
      PostWorker.stop();
    }
    VerifyWorker.stop();

    console.log('[SCHEDULER] Stopped background scheduler service');
  }

  async scheduleWithQueue(content: any): Promise<{ success: boolean; jobId?: string; error?: string }> {
    // Check dynamically at runtime - Redis may have connected after startup
    if (!isRedisAvailable()) {
      console.log(`[SCHEDULER] Queue scheduling unavailable for content ${content.id}, using in-memory fallback`);
      return { success: false, error: 'Queue scheduler unavailable' };
    }

    // Start worker if not already running (late Redis connection)
    if (!this.workerStarted && !PostWorker.isRunning()) {
      console.log('[SCHEDULER] Late Redis connection detected - starting BullMQ post + verify workers');
      await PostWorker.start(this.storage);
      await VerifyWorker.start(this.storage);
      this.workerStarted = true;
    }

    if (!content.scheduledAt) {
      return { success: false, error: 'No scheduledAt time provided' };
    }

    const scheduledAt = new Date(content.scheduledAt);

    const result = await PostSchedulerManager.schedulePost(
      content.id,
      scheduledAt,
      content.workspaceId.toString(),
      {
        platform: content.platform || 'instagram',
        title: content.title,
      }
    );

    if (result.success) {
      console.log(`[SCHEDULER] Content ${content.id} scheduled via BullMQ (jobId: ${result.jobId})`);
    }

    return result;
  }

  async cancelScheduledPost(contentId: number): Promise<{ success: boolean; error?: string }> {
    if (isRedisAvailable()) {
      return PostSchedulerManager.cancelScheduledPost(contentId);
    }
    return { success: true };
  }

  async reschedulePost(contentId: number, newScheduledAt: Date, workspaceId?: string): Promise<{ success: boolean; jobId?: string; error?: string }> {
    if (isRedisAvailable()) {
      return PostSchedulerManager.reschedulePost(contentId, newScheduledAt, workspaceId);
    }
    return { success: false, error: 'Queue scheduler unavailable' };
  }

  isUsingQueueScheduler(): boolean {
    return isRedisAvailable();
  }

  private async processScheduledContent() {
    try {
      const currentTime = new Date();
      console.log(`[SCHEDULER] Checking for scheduled content to publish at ${currentTime.toISOString()}`);

      const allScheduledContent = await this.getAllScheduledContent();
      
      // Only log if there are items to publish
      if (allScheduledContent.length > 0) {
        // Find items that are ready to publish
        const contentToPublish = allScheduledContent.filter((content: any) => {
          if (!content.scheduledAt || content.status !== 'scheduled') {
            return false;
          }

          const scheduledTime = new Date(content.scheduledAt);
          return scheduledTime <= currentTime;
        });

        if (contentToPublish.length > 0) {
          console.log(`[SCHEDULER] Found ${contentToPublish.length} items ready to publish`);

          for (const content of contentToPublish) {
            if (isRedisAvailable()) {
              const isInQueue = await this.isContentInQueue(content.id);
              if (isInQueue) {
                console.log(`[SCHEDULER] Content ${content.id} is already in BullMQ queue, skipping in-memory processing`);
                continue;
              }
            }

            await this.publishScheduledContent(content);
          }
        }
      }


    } catch (error) {
      console.error('[SCHEDULER] Error processing scheduled content:', error);
    }
  }

  private async isContentInQueue(contentId: number): Promise<boolean> {
    if (!isRedisAvailable()) {
      return false;
    }

    try {
      const scheduledPosts = await PostSchedulerManager.getScheduledPosts();
      return scheduledPosts.some(post => post.contentId === contentId);
    } catch (error) {
      return false;
    }
  }

  private async getAllScheduledContent(): Promise<any[]> {
    try {
      const allScheduled = await this.storage.getScheduledContent();
      return allScheduled;
    } catch (error) {
      console.error('[SCHEDULER] Error getting all scheduled content:', error);
      return [];
    }
  }

  private async publishScheduledContent(content: any) {
    try {
      const maxAttempts = parseInt(process.env.SCHEDULER_MAX_ATTEMPTS || '3', 10);
      const attempts = (content.contentData?.publishAttempts || 0);
      if (content.status === 'published' || content.instagramPostId) {
        return;
      }
      if (attempts >= maxAttempts) {
        await this.updateContentStatus(content.id, 'failed', 'Max publish attempts reached');
        return;
      }
      console.log(`[SCHEDULER] Publishing scheduled content: ${content.title} (ID: ${content.id})`);

      if (content.platform !== 'instagram') {
        console.log(`[SCHEDULER] Platform ${content.platform} not supported yet`);
        return;
      }

      const workspaceId = content.workspaceId.toString();
      const accounts = await this.storage.getSocialAccountsWithTokensInternal(workspaceId);
      
      let instagramAccount;
      
      const specificAccountId = content.contentData?.accountId;
      if (specificAccountId) {
        console.log(`[SCHEDULER] Looking for specific account ID: ${specificAccountId} in workspace accounts`);
        instagramAccount = accounts.find(a => a.id === specificAccountId);
      }
      
      if (!instagramAccount) {
        console.log(`[SCHEDULER] Looking for any Instagram account for workspace: ${workspaceId}`);
        instagramAccount = accounts.find(a => a.platform === 'instagram');
      }

      if (!instagramAccount || !instagramAccount.accessToken) {
        console.error(`[SCHEDULER] No Instagram account found for workspace ${content.workspaceId}`);
        await this.updateContentStatus(content.id, 'failed', 'No Instagram account connected');
        return;
      }

      const mediaUrl = content.contentData?.mediaUrls?.[0] || content.contentData?.mediaUrl;

      if (!mediaUrl) {
        console.error(`[SCHEDULER] No media URL found for content ${content.id}`);
        await this.updateContentStatus(content.id, 'failed', 'No media URL');
        return;
      }

      let caption = '';
      if (content.contentData?.text) {
        caption = content.contentData.text;
      } else {
        caption = content.description ? content.description : content.title;
      }
      caption = caption.trim();

      const mentions = content.contentData?.mentions || [];
      const hashtags = content.contentData?.hashtags || [];

      const isVideoType = content.type === 'video' || content.type === 'reel' || content.type === 'story' || 
                         (mediaUrl && mediaUrl.match(/\.(mp4|mov|avi|mkv|webm|3gp|m4v)$/i));

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

      console.log(`[SCHEDULER] Publishing ${content.type || 'post'} content to Instagram`);

      let contentType: 'video' | 'photo' | 'reel' | 'story' = 'photo';

      if (content.type === 'story') {
        contentType = 'story';
      } else if (content.type === 'reel') {
        contentType = 'reel';
      } else if (content.type === 'video') {
        contentType = 'video';
      } else {
        const isVideo = !!mediaUrl?.match(/\.(mp4|mov|avi|mkv|webm|3gp|m4v)$/i);
        contentType = isVideo ? 'video' : 'photo';
      }

      console.log(`[SCHEDULER] Detected content type: ${contentType} for URL: ${mediaUrl}`);

      const { SimpleInstagramPublisher } = await import('./simple-instagram-publisher');

      console.log(`[SCHEDULER] Using simple publisher for permission-compatible publishing`);
      
      // Ensure mediaUrl is absolute using finalBaseUrl if necessary
      let cleanUrl = mediaUrl;
      const devDomain = process.env.REPLIT_DEV_DOMAIN && process.env.REPLIT_DEV_DOMAIN !== 'your-replit-dev-domain-here' ? process.env.REPLIT_DEV_DOMAIN : null;
      const currentDomain = process.env.SOCIAL_AUTH_BASE_URL || process.env.VITE_APP_URL || (devDomain ? `https://${devDomain}` : 'http://localhost:5000');
      
      if (cleanUrl.startsWith('/')) {
        cleanUrl = `${currentDomain}${cleanUrl}`;
      } else if (cleanUrl.includes('localhost') || cleanUrl.includes('your-replit-dev-domain')) {
        try {
          const urlObj = new URL(cleanUrl);
          cleanUrl = `${currentDomain}${urlObj.pathname}${urlObj.search}`;
        } catch (e) {
          const filename = cleanUrl.split('/').pop() || 'media';
          cleanUrl = `${currentDomain}/uploads/${filename}`;
        }
      }

      const directResult = await SimpleInstagramPublisher.publishContent(
        instagramAccount.accessToken,
        cleanUrl,
        caption,
        contentType,
        instagramAccount.accountId || (instagramAccount as any)._id?.toString(),
        mentions
      );

      if (directResult.success) {
        if (directResult.processing && directResult.id) {
          console.log(`[SCHEDULER] ⏳ Content ${content.id} is processing (container: ${directResult.id}). Dispatching to verifyQueue.`);
          
          try {
            const { verifyQueue } = await import('./queues/postQueue');
            if (verifyQueue) {
              await verifyQueue.add('verify-post', {
                contentId: content.id,
                workspaceId: content.workspaceId.toString(),
                containerId: directResult.id,
                accessToken: instagramAccount.accessToken,
                accountId: instagramAccount.accountId || (instagramAccount as any)._id?.toString()
              }, { delay: 30000 });
            }
          } catch (err) {
            console.error(`[SCHEDULER] Failed to dispatch to verifyQueue:`, err);
          }
          
          await this.updateContentStatus(content.id, workspaceId, 'processing', '', directResult.id);
        } else {
          console.log(`[SCHEDULER] ✓ Publishing succeeded: ${directResult.id}`);
          console.log(`[SCHEDULER] Successfully published ${content.type || 'post'} content ${content.id} to Instagram:`, directResult.id);
          await this.updateContentStatus(content.id, workspaceId, 'published', '', directResult.id);
        }
      } else {
        console.error(`[SCHEDULER] ✗ Publishing failed: ${directResult.error}`);
        const nextAttempts = attempts + 1;
        const updates: any = { contentData: { ...(content.contentData || {}), publishAttempts: nextAttempts } };
        await this.storage.updateContent(content.id, updates);
        if (nextAttempts >= maxAttempts) {
          await this.updateContentStatus(content.id, workspaceId, 'failed', directResult.error || 'Publishing failed');
        } else {
          console.log(`[SCHEDULER] Will retry content ${content.id} on next interval (attempt ${nextAttempts}/${maxAttempts})`);
        }
      }

    } catch (error: any) {
      console.error(`[SCHEDULER] Failed to publish content ${content.id}:`, error);
      const maxAttempts = parseInt(process.env.SCHEDULER_MAX_ATTEMPTS || '3', 10);
      const attempts = (content.contentData?.publishAttempts || 0) + 1;
      const updates: any = { contentData: { ...(content.contentData || {}), publishAttempts: attempts } };
      await this.storage.updateContent(content.id, updates);
      if (attempts >= maxAttempts) {
        await this.updateContentStatus(content.id, content.workspaceId.toString(), 'failed', error.message);
      } else {
        console.log(`[SCHEDULER] Will retry content ${content.id} on next interval (attempt ${attempts}/${maxAttempts})`);
      }
    }
  }

  private async updateContentStatus(contentId: number, workspaceId: string, status: string, error?: string, instagramPostId?: string) {
    try {
      const updates: any = {
        status,
        updatedAt: new Date(),
        publishedAt: status === 'published' ? new Date() : undefined,
        processingStartedAt: status === 'processing' ? new Date() : undefined,
        failedAt: status === 'failed' ? new Date() : undefined,
        lastError: (status === 'failed' && error) ? error : undefined
      };

      if (error && status !== 'failed') {
        updates.error = error;
      }

      if (instagramPostId) {
        updates.instagramPostId = instagramPostId;
        updates.metaCreationId = instagramPostId;
      }

      await this.storage.updateContent(contentId.toString(), updates);
      console.log(`[SCHEDULER] Updated content ${contentId} status to ${status}`);
      
      try {
        const { RealtimeService } = await import('./services/realtime');
        RealtimeService.broadcastToWorkspace(workspaceId, 'post_status_updated', {
          contentId,
          status,
          error,
          instagramPostId,
          timestamp: new Date()
        });
      } catch (wsErr) {
        console.error('[SCHEDULER] Failed to emit websocket event:', wsErr);
      }
    } catch (error) {
      console.error(`[SCHEDULER] Error updating content ${contentId} status:`, error);
    }
  }
}

let schedulerService: SchedulerService | null = null;

export function startSchedulerService(storage: IStorage) {
  if (schedulerService) {
    schedulerService.stop();
  }

  schedulerService = new SchedulerService(storage);
  schedulerService.start();
  return schedulerService;
}

export function stopSchedulerService() {
  if (schedulerService) {
    schedulerService.stop();
    schedulerService = null;
  }
}

export function getSchedulerService(): SchedulerService | null {
  return schedulerService;
}
