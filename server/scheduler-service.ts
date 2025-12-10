import { IStorage } from "./storage";
import { instagramAPI } from "./instagram-api";
import { PostSchedulerManager, isRedisAvailable } from "./queues/postQueue";
import { ensureRedisConnected } from "./queues/metricsQueue";
import { PostWorker } from "./workers/postWorker";

export class SchedulerService {
  private storage: IStorage;
  private checkInterval: NodeJS.Timeout | null = null;
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
      PostWorker.start(this.storage);
      this.workerStarted = true;
    } else {
      console.log('[SCHEDULER] Redis unavailable - using in-memory fallback scheduler');
    }
    
    this.checkInterval = setInterval(() => {
      this.processScheduledContent();
    }, 60000);

    this.processScheduledContent();
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
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
      PostWorker.start(this.storage);
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

      console.log(`[SCHEDULER] Looking for Instagram account for workspace: ${content.workspaceId} (type: ${typeof content.workspaceId})`);
      const workspaceId = content.workspaceId.toString();
      const instagramAccount = await this.storage.getSocialAccountByPlatform(workspaceId, 'instagram');
      
      if (!instagramAccount || !instagramAccount.accessToken) {
        console.error(`[SCHEDULER] No Instagram account found for workspace ${content.workspaceId}`);
        await this.updateContentStatus(content.id, 'failed', 'No Instagram account connected');
        return;
      }

      if (!content.contentData?.mediaUrl) {
        console.error(`[SCHEDULER] No media URL found for content ${content.id}`);
        await this.updateContentStatus(content.id, 'failed', 'No media URL');
        return;
      }

      const caption = `${content.title}\n\n${content.description || ''}`;
      const mediaUrl = content.contentData.mediaUrl;
      
      console.log(`[SCHEDULER] Publishing ${content.type || 'post'} content to Instagram`);
      
      let contentType: 'video' | 'photo' | 'reel' | 'story' = 'photo';
      
      if (content.type === 'story') {
        contentType = 'story';
      } else if (content.type === 'reel') {
        contentType = 'reel';
      } else if (content.type === 'video') {
        contentType = 'video';
      } else {
        const isVideo = mediaUrl?.match(/\.(mp4|mov|avi|mkv|webm|3gp|m4v)$/i) || 
                       mediaUrl?.includes('video');
        contentType = isVideo ? 'video' : 'photo';
      }
      
      console.log(`[SCHEDULER] Detected content type: ${contentType} for URL: ${mediaUrl}`);
      
      const { InstagramDirectPublisher } = await import('./instagram-direct-publisher');
      
      console.log(`[SCHEDULER] Using direct publisher for permission-compatible publishing`);
      const directResult = await InstagramDirectPublisher.publishContent(
        instagramAccount.accessToken,
        mediaUrl,
        caption,
        contentType
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

      await this.storage.updateContent(contentId, updates);
      console.log(`[SCHEDULER] Updated content ${contentId} status to ${status}`);
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
