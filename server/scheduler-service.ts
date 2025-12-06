import { IStorage } from "./storage";
import { instagramAPI } from "./instagram-api";

export class SchedulerService {
  private storage: IStorage;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(storage: IStorage) {
    this.storage = storage;
  }

  start() {
    console.log('[SCHEDULER] Starting background scheduler service');
    // Check for scheduled content every minute
    this.checkInterval = setInterval(() => {
      this.processScheduledContent();
    }, 60000); // 60 seconds

    // Also run immediately
    this.processScheduledContent();
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    console.log('[SCHEDULER] Stopped background scheduler service');
  }

  private async processScheduledContent() {
    try {
      const currentTime = new Date();
      console.log(`[SCHEDULER] Checking for scheduled content to publish at ${currentTime.toISOString()}`);
      
      // Get all scheduled content that should be published now
      const allScheduledContent = await this.getAllScheduledContent();
      console.log(`[SCHEDULER] Found ${allScheduledContent.length} total scheduled items`);
      
      // Debug each item
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
        // Publish if scheduled time is in the past or within the next minute
        return scheduledTime <= currentTime;
      });

      console.log(`[SCHEDULER] Found ${contentToPublish.length} items ready to publish`);

      for (const content of contentToPublish) {
        await this.publishScheduledContent(content);
      }
    } catch (error) {
      console.error('[SCHEDULER] Error processing scheduled content:', error);
    }
  }

  private async getAllScheduledContent(): Promise<any[]> {
    try {
      // Get scheduled content from the storage layer directly (no workspace filter)
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

      // Get Instagram account for this workspace
      console.log(`[SCHEDULER] Looking for Instagram account for workspace: ${content.workspaceId} (type: ${typeof content.workspaceId})`);
      // Keep workspace ID as string for MongoDB ObjectId compatibility
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

      // Publish to Instagram using simple, reliable approach
      const caption = `${content.title}\n\n${content.description || ''}`;
      const mediaUrl = content.contentData.mediaUrl;
      
      console.log(`[SCHEDULER] Publishing ${content.type || 'post'} content to Instagram`);
      
      // Determine content type
      let contentType: 'video' | 'photo' | 'reel' | 'story' = 'photo';
      
      if (content.type === 'story') {
        contentType = 'story';
      } else if (content.type === 'reel') {
        contentType = 'reel';
      } else if (content.type === 'video') {
        contentType = 'video';
      } else {
        // Auto-detect for posts
        const isVideo = mediaUrl?.match(/\.(mp4|mov|avi|mkv|webm|3gp|m4v)$/i) || 
                       mediaUrl?.includes('video');
        contentType = isVideo ? 'video' : 'photo';
      }
      
      console.log(`[SCHEDULER] Detected content type: ${contentType} for URL: ${mediaUrl}`);
      
      // Use direct publisher approach that works with current permissions
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
        
        // Update content status
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
