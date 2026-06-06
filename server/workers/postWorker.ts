import { Worker, Job } from 'bullmq';
import { redisConnection, isRedisAvailable } from '../queues/metricsQueue';
import { ScheduledPostJobData } from '../queues/postQueue';

export class PostWorker {
  private static worker: Worker | null = null;
  private static storage: any = null;

  static async start(storage: any): Promise<void> {
    this.storage = storage;

    console.log('[POST_WORKER] Starting post publishing worker...');

    // Extra safety check: specifically check for REDIS_URL env var
    // This prevents falling back to localhost defaults which causes timeouts
    if (!process.env.REDIS_URL && !process.env.KV_URL) {
      console.log('[POST_WORKER] No REDIS_URL configured. Worker permanently disabled.');
      return;
    }

    if (!isRedisAvailable() || !redisConnection) {
      console.log('[POST_WORKER] Redis unavailable, worker will not start. Using in-memory fallback.');
      return;
    }

    try {
      // Create a dedicated connection for the worker (blocking commands require this)
      // Reusing the shared redisConnection causes timeouts because BullMQ needs exclusion
      const { getRedisOptions } = await import('../lib/redis');
      const redisUrl = process.env.REDIS_URL || process.env.KV_URL || process.env.STORAGE_REDIS_URL;

      if (!redisUrl) {
        throw new Error('Redis URL not configured');
      }

      const connectionConfig: any = {
        ...getRedisOptions(redisUrl),
        maxRetriesPerRequest: null,
      };

      const IORedis = (await import('ioredis')).default;
      const connection = new IORedis(redisUrl, connectionConfig);

      this.worker = new Worker(
        'post-scheduler',
        async (job: Job<ScheduledPostJobData>) => {
          return this.processPublishJob(job);
        },
        {
          connection,
          concurrency: 3,
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 50 },
          lockDuration: 60000, // 1 minute - worker no longer blocks on video polling
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
    const isFallbackCheck = job.name === 'fallback-checks' || (job.data as any).fallback === true;

    if (isFallbackCheck) {
      console.log(`[POST_WORKER] 🔄 Running global fallback content checks...`);
      if (!this.storage) return { status: 'skipped', reason: 'No storage' };
      
      const { SchedulerService } = await import('../scheduler-service');
      const scheduler = new SchedulerService(this.storage);
      // We safely call processScheduledContent to pick up any missed items
      await (scheduler as any).processScheduledContent();
      return { status: 'success', type: 'fallback-checks' };
    }

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

      const accounts = await this.storage.getSocialAccountsWithTokensInternal(workspaceId);
      
      let instagramAccount;
      
      const specificAccountId = content.contentData?.accountId;
      if (specificAccountId) {
        console.log(`[POST_WORKER] Looking for specific account ID: ${specificAccountId} in workspace accounts`);
        instagramAccount = accounts.find(a => a.id === specificAccountId);
      }
      
      if (!instagramAccount) {
        console.log(`[POST_WORKER] Looking for any Instagram account for workspace: ${workspaceId}`);
        instagramAccount = accounts.find(a => a.platform === 'instagram');
      }

      if (!instagramAccount || !instagramAccount.accessToken) {
        console.error(`[POST_WORKER] No Instagram account found for workspace ${workspaceId}`);
        await this.updateContentStatus(contentId, 'failed', 'No Instagram account connected');
        return { status: 'failed', reason: 'No Instagram account connected' };
      }

      const mediaUrl = content.contentData?.mediaUrls?.[0] || content.contentData?.mediaUrl;

      if (!mediaUrl) {
        console.error(`[POST_WORKER] No media URL found for content ${contentId}`);
        await this.updateContentStatus(contentId, 'failed', 'No media URL');
        return { status: 'failed', reason: 'No media URL' };
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

      console.log(`[POST_WORKER] Publishing ${contentType} content to Instagram`);

      const { SimpleInstagramPublisher } = await import('../simple-instagram-publisher');
      
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
        mentions,
        content.contentData?.collaborators || []
      );

      if (directResult.success) {
        if (directResult.processing && directResult.id) {
          console.log(`[POST_WORKER] ⏳ Content ${contentId} is processing (container: ${directResult.id}). Dispatching to verifyQueue.`);
          
          try {
            const { verifyQueue } = await import('../queues/postQueue');
            if (verifyQueue) {
              await verifyQueue.add('verify-post', {
                contentId,
                workspaceId,
                containerId: directResult.id,
                accessToken: instagramAccount.accessToken,
                accountId: instagramAccount.accountId || (instagramAccount as any)._id?.toString()
              }, { delay: 30000 }); // initial delay 30s
            }
          } catch (err) {
            console.error(`[POST_WORKER] Failed to dispatch to verifyQueue:`, err);
          }
          
          await this.updateContentStatus(contentId, workspaceId, 'processing', '', directResult.id);
          return { status: 'processing', containerId: directResult.id };
        } else {
          console.log(`[POST_WORKER] ✅ Successfully published content ${contentId} (postId: ${directResult.id})`);
          await this.updateContentStatus(contentId, workspaceId, 'published', '', directResult.id);
          return { status: 'success', postId: directResult.id };
        }
      } else {
        console.error(`[POST_WORKER] ❌ Publishing failed for content ${contentId}: ${directResult.error}`);

        const attemptsMade = job.attemptsMade;
        const maxAttempts = job.opts?.attempts || 3;

        if (attemptsMade >= maxAttempts - 1) {
          await this.updateContentStatus(contentId, workspaceId, 'failed', directResult.error || 'Publishing failed');
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
    workspaceId: string,
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
      
      try {
        const { RealtimeService } = await import('../services/realtime');
        RealtimeService.broadcastToWorkspace(workspaceId, 'post_status_updated', {
          contentId,
          status,
          error,
          instagramPostId,
          timestamp: new Date()
        });
      } catch (wsErr) {
        console.error('[POST_WORKER] Failed to emit websocket event:', wsErr);
      }
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
