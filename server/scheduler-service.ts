import { IStorage } from "./storage";
import { instagramAPI } from "./instagram-api";
import { PostSchedulerManager, isRedisAvailable } from "./queues/postQueue";
import { ensureRedisConnected } from "./queues/metricsQueue";
import { PostWorker } from "./workers/postWorker";

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
      console.log('[SCHEDULER] Redis available - starting BullMQ post worker');
      await PostWorker.start(this.storage);
      this.workerStarted = true;
    } else {
      console.log('[SCHEDULER] Redis unavailable - using in-memory fallback scheduler');
    }

    // Schedule post processing every minute
    this.checkInterval = setInterval(() => {
      this.processScheduledContent();
    }, 60000);

    // Schedule daily analytics snapshot every hour (it will only run once per day per workspace)
    // In a real production app, this should be a cron job running at midnight
    this.dailySnapshotInterval = setInterval(() => {
      this.processDailySnapshots();
    }, 60 * 60 * 1000); // Check every hour

    this.processScheduledContent();

    // Run initial snapshot check after short delay to let server startup
    setTimeout(() => {
      this.processDailySnapshots();
    }, 30000);
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
      console.log('[SCHEDULER] Late Redis connection detected - starting BullMQ post worker');
      await PostWorker.start(this.storage);
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
      console.log(`[SCHEDULER] Found ${allScheduledContent.length} total scheduled items`);

      allScheduledContent.forEach((content: any, index: number) => {
        console.log(`[SCHEDULER] Item ${index + 1}:`, {
          id: content.id,
          title: content.title,
          status: content.status,
          scheduledAt: content.scheduledAt,
          scheduledTime: content.scheduledAt ? new Date(content.scheduledAt).toISOString() : 'null',
          shouldPublish: content.scheduledAt && content.status === 'scheduled' && new Date(content.scheduledAt) <= currentTime
        });
      });

      const contentToPublish = allScheduledContent.filter((content: any) => {
        if (!content.scheduledAt || content.status !== 'scheduled') {
          return false;
        }

        const scheduledTime = new Date(content.scheduledAt);
        return scheduledTime <= currentTime;
      });

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
      console.log(`[SCHEDULER DEBUG] Raw scheduled content from storage:`, allScheduled.map(c => ({
        id: c.id,
        title: c.title,
        workspaceId: c.workspaceId,
        workspaceIdType: typeof c.workspaceId,
        status: c.status,
        scheduledAt: c.scheduledAt
      })));
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
      const currentDomain = process.env.SOCIAL_AUTH_BASE_URL || process.env.VITE_APP_URL || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'http://localhost:5000');
      
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
        console.log(`[SCHEDULER] ✓ Publishing succeeded using ${directResult.approach}: ${directResult.id}`);
        console.log(`[SCHEDULER] Successfully published ${content.type || 'post'} content ${content.id} to Instagram:`, directResult.id);

        await this.updateContentStatus(content.id, 'published', '', directResult.id);
      } else {
        console.error(`[SCHEDULER] ✗ Publishing failed with ${directResult.approach}: ${directResult.error}`);
        const nextAttempts = attempts + 1;
        const updates: any = { contentData: { ...(content.contentData || {}), publishAttempts: nextAttempts } };
        await this.storage.updateContent(content.id, updates);
        if (nextAttempts >= maxAttempts) {
          await this.updateContentStatus(content.id, 'failed', directResult.error || 'Publishing failed');
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
        await this.updateContentStatus(content.id, 'failed', error.message);
      } else {
        console.log(`[SCHEDULER] Will retry content ${content.id} on next interval (attempt ${attempts}/${maxAttempts})`);
      }
    }
  }

  private async updateContentStatus(contentId: number, status: string, error?: string, instagramPostId?: string) {
    try {
      const updates: any = {
        status,
        publishedAt: status === 'published' ? new Date() : undefined
      };

      if (error) {
        updates.error = error;
      }

      if (instagramPostId) {
        updates.instagramPostId = instagramPostId;
      }

      await this.storage.updateContent(contentId.toString(), updates);
      console.log(`[SCHEDULER] Updated content ${contentId} status to ${status}`);
    } catch (error) {
      console.error(`[SCHEDULER] Error updating content ${contentId} status:`, error);
    }
  }

  private async processDailySnapshots() {
    try {
      console.log('[SCHEDULER] Starting daily analytics snapshot process');
      // Import here dynamically to avoid circular dependencies if any
      const { analyticsService } = await import('./services/index');
      const { workspaceRepository } = await import('./repositories/index');

      // 1. Get all workspaces
      // In a large system, we would stream this or paginate
      const workspaces = await workspaceRepository.findAll();
      console.log(`[SCHEDULER] Found ${workspaces.length} workspaces for analytics snapshot`);

      // 2. Generate snapshot for each workspace
      let successCount = 0;
      let failCount = 0;

      for (const workspace of workspaces) {
        try {
          const workspaceId = (workspace._id as any).toString();
          // Generate for Instagram (default)
          await analyticsService.generateDailySnapshot(workspaceId, 'instagram');
          successCount++;
        } catch (error) {
          // console.error(`[SCHEDULER] Failed to generate snapshot for workspace ${workspace._id}:`, error);
          failCount++;
        }
      }

      console.log(`[SCHEDULER] Daily snapshots completed. Success: ${successCount}, Failed: ${failCount}`);
    } catch (error) {
      console.error('[SCHEDULER] Error in processDailySnapshots:', error);
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
