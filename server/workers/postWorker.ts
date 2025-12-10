import { Worker, Job } from 'bullmq';
import { redisConnection, redisAvailable } from '../queues/metricsQueue';
import { ScheduledPostJobData } from '../queues/postQueue';

export class PostWorker {
  private static worker: Worker | null = null;
  private static storage: any = null;

  static start(storage: any): void {
    this.storage = storage;
    
    console.log('[POST_WORKER] Starting post publishing worker...');

    if (!redisAvailable || !redisConnection) {
      console.log('[POST_WORKER] Redis unavailable, worker will not start. Using in-memory fallback.');
      return;
    }

    try {
      this.worker = new Worker(
        'post-scheduler',
        async (job: Job<ScheduledPostJobData>) => {
          return this.processPublishJob(job);
        },
        {
          connection: redisConnection,
          concurrency: 3,
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 50 },
        }
      );

      this.setupEventHandlers();
      console.log('[POST_WORKER] ✅ Post publishing worker started successfully');
    } catch (error) {
      console.error('[POST_WORKER] Failed to start worker:', error);
    }
  }

  static async stop(): Promise<void> {
    console.log('[POST_WORKER] Stopping post publishing worker...');
    
    try {
      if (this.worker) {
        await this.worker.close();
        this.worker = null;
      }
      console.log('[POST_WORKER] ✅ Worker stopped');
    } catch (error) {
      console.error('[POST_WORKER] Error stopping worker:', error);
    }
  }

  private static async processPublishJob(job: Job<ScheduledPostJobData>): Promise<any> {
    const { contentId, workspaceId, platform, title } = job.data;
    
    console.log(`[POST_WORKER] Processing publish job for content ${contentId} (workspace: ${workspaceId})`);

    try {
      if (!this.storage) {
        throw new Error('Storage not initialized');
      }

      const content = await this.storage.getContent(contentId);
      
      if (!content) {
        console.log(`[POST_WORKER] Content ${contentId} not found, skipping`);
        return { status: 'skipped', reason: 'Content not found' };
      }

      if (content.status === 'published' || content.instagramPostId) {
        console.log(`[POST_WORKER] Content ${contentId} already published, skipping`);
        return { status: 'skipped', reason: 'Already published' };
      }

      if (content.status !== 'scheduled') {
        console.log(`[POST_WORKER] Content ${contentId} status is ${content.status}, not scheduled - skipping`);
        return { status: 'skipped', reason: `Status is ${content.status}` };
      }

      if (platform !== 'instagram') {
        console.log(`[POST_WORKER] Platform ${platform} not supported yet`);
        return { status: 'skipped', reason: 'Platform not supported' };
      }

      const instagramAccount = await this.storage.getSocialAccountByPlatform(workspaceId, 'instagram');
      
      if (!instagramAccount || !instagramAccount.accessToken) {
        console.error(`[POST_WORKER] No Instagram account found for workspace ${workspaceId}`);
        await this.updateContentStatus(contentId, 'failed', 'No Instagram account connected');
        return { status: 'failed', reason: 'No Instagram account connected' };
      }

      if (!content.contentData?.mediaUrl) {
        console.error(`[POST_WORKER] No media URL found for content ${contentId}`);
        await this.updateContentStatus(contentId, 'failed', 'No media URL');
        return { status: 'failed', reason: 'No media URL' };
      }

      const caption = `${content.title}\n\n${content.description || ''}`;
      const mediaUrl = content.contentData.mediaUrl;
      
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
      
      console.log(`[POST_WORKER] Publishing ${contentType} content to Instagram`);
      
      const { InstagramDirectPublisher } = await import('../instagram-direct-publisher');
      
      const directResult = await InstagramDirectPublisher.publishContent(
        instagramAccount.accessToken,
        mediaUrl,
        caption,
        contentType
      );
      
      if (directResult.success) {
        console.log(`[POST_WORKER] ✅ Successfully published content ${contentId} (postId: ${directResult.id})`);
        await this.updateContentStatus(contentId, 'published', '', directResult.id);
        return { status: 'success', postId: directResult.id, approach: directResult.approach };
      } else {
        console.error(`[POST_WORKER] ❌ Publishing failed for content ${contentId}: ${directResult.error}`);
        
        const attemptsMade = job.attemptsMade;
        const maxAttempts = job.opts?.attempts || 3;
        
        if (attemptsMade >= maxAttempts - 1) {
          await this.updateContentStatus(contentId, 'failed', directResult.error || 'Publishing failed');
        }
        
        throw new Error(directResult.error || 'Publishing failed');
      }

    } catch (error: any) {
      console.error(`[POST_WORKER] Error processing job for content ${contentId}:`, error);
      throw error;
    }
  }

  private static async updateContentStatus(
    contentId: number, 
    status: string, 
    error?: string, 
    instagramPostId?: string
  ): Promise<void> {
    try {
      if (!this.storage) {
        console.error('[POST_WORKER] Storage not initialized, cannot update content status');
        return;
      }

      const updates: any = {
        status,
        publishedAt: status === 'published' ? new Date() : undefined,
      };

      if (error) {
        updates.error = error;
      }

      if (instagramPostId) {
        updates.instagramPostId = instagramPostId;
      }

      await this.storage.updateContent(contentId, updates);
      console.log(`[POST_WORKER] Updated content ${contentId} status to ${status}`);
    } catch (error) {
      console.error(`[POST_WORKER] Error updating content ${contentId} status:`, error);
    }
  }

  private static setupEventHandlers(): void {
    if (!this.worker) return;

    this.worker.on('completed', (job) => {
      console.log(`[POST_WORKER] ✅ Job ${job.id} completed - content ${job.data.contentId}`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`[POST_WORKER] ❌ Job ${job?.id} failed - content ${job?.data.contentId}:`, err.message);
    });

    this.worker.on('error', (err) => {
      console.error('[POST_WORKER] Worker error:', err);
    });

    this.worker.on('active', (job) => {
      console.log(`[POST_WORKER] 🔄 Processing job ${job.id} - content ${job.data.contentId}`);
    });

    this.worker.on('stalled', (jobId) => {
      console.warn(`[POST_WORKER] ⚠️ Job ${jobId} stalled`);
    });
  }

  static isRunning(): boolean {
    return this.worker !== null;
  }
}

export default PostWorker;
