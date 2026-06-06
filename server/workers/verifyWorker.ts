import { Worker, Job } from 'bullmq';
import { redisConnection, isRedisAvailable } from '../queues/metricsQueue';
import { VerifyPostJobData } from '../queues/postQueue';
import axios from 'axios';
import { instagramAPI } from '../instagram-api';

export class VerifyWorker {
  private static worker: Worker | null = null;
  private static storage: any = null;

  static async start(storage: any): Promise<void> {
    this.storage = storage;

    console.log('[VERIFY_WORKER] Starting verification worker...');

    if (!process.env.REDIS_URL && !process.env.KV_URL) {
      console.log('[VERIFY_WORKER] No REDIS_URL configured. Worker permanently disabled.');
      return;
    }

    if (!isRedisAvailable() || !redisConnection) {
      console.log('[VERIFY_WORKER] Redis unavailable, worker will not start.');
      return;
    }

    try {
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
        'post-verifier',
        async (job: Job<VerifyPostJobData>) => {
          return this.processVerifyJob(job);
        },
        {
          connection,
          concurrency: 5,
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 50 },
        }
      );

      this.setupEventHandlers();
      console.log('[VERIFY_WORKER] ✅ Verification worker started successfully');
    } catch (error) {
      console.error('[VERIFY_WORKER] Failed to start worker:', error);
    }
  }

  static async stop(): Promise<void> {
    console.log('[VERIFY_WORKER] Stopping verification worker...');
    try {
      if (this.worker) {
        await this.worker.close();
        this.worker = null;
      }
      console.log('[VERIFY_WORKER] ✅ Worker stopped');
    } catch (error) {
      console.error('[VERIFY_WORKER] Error stopping worker:', error);
    }
  }

  private static async processVerifyJob(job: Job<VerifyPostJobData>): Promise<any> {
    const { contentId, workspaceId, containerId, accessToken, accountId } = job.data;
    const attempt = job.attemptsMade + 1;

    console.log(`[VERIFY_WORKER] Verifying container ${containerId} for content ${contentId} (Attempt ${attempt}/6)`);

    try {
      if (!this.storage) throw new Error('Storage not initialized');

      if (attempt === 1) {
        await this.updateContentStatus(contentId, workspaceId, 'processing', undefined, undefined, attempt);
      }

      const publishBaseUrl = instagramAPI.getPublishApiBase(accountId);
      
      const publishResponse = await axios.post(`${publishBaseUrl}/media_publish`, {
        creation_id: containerId,
        access_token: accessToken
      });

      console.log(`[VERIFY_WORKER] ✅ Container ${containerId} published successfully! Post ID: ${publishResponse.data.id}`);
      await this.updateContentStatus(contentId, workspaceId, 'published', undefined, publishResponse.data.id, attempt);
      
      return { status: 'success', postId: publishResponse.data.id };

    } catch (error: any) {
      const errData = error.response?.data?.error;
      
      if (errData && errData.code === 9007) {
        const maxAttempts = job.opts.attempts || 6;
        if (attempt >= maxAttempts) {
          console.log(`[VERIFY_WORKER] ❌ Max attempts reached for container ${containerId}. Marking as failed.`);
          await this.updateContentStatus(
            contentId,
            workspaceId,
            'failed',
            'Instagram media processing timed out after maximum attempts (15+ minutes).',
            undefined,
            attempt
          );
          return { status: 'timeout_error', reason: 'Processing timed out' };
        } else {
          console.log(`[VERIFY_WORKER] ⏳ Container ${containerId} still processing (Code 9007). Throwing to trigger backoff.`);
          throw new Error(`Processing not finished for container ${containerId}`);
        }
      }

      console.error(`[VERIFY_WORKER] ❌ Fatal error verifying container ${containerId}:`, errData || error.message);
      
      await this.updateContentStatus(
        contentId,
        workspaceId,
        'failed', 
        errData?.message || error.message || 'Fatal verification error', 
        undefined, 
        attempt
      );

      return { status: 'fatal_error', reason: errData?.message || error.message };
    }
  }

  private static async updateContentStatus(
    contentId: number,
    workspaceId: string,
    status: string,
    error?: string,
    instagramPostId?: string,
    attempts?: number
  ): Promise<void> {
    try {
      if (!this.storage) return;

      const updates: any = {
        status,
        publishAttempts: attempts,
        updatedAt: new Date()
      };

      if (status === 'published') updates.publishedAt = new Date();
      if (status === 'processing') updates.processingStartedAt = new Date();
      if (status === 'failed') {
        updates.failedAt = new Date();
        updates.lastError = error;
      }
      if (instagramPostId) updates.instagramPostId = instagramPostId;
      if (error) updates.error = error;

      await this.storage.updateContent(contentId, updates);
      
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
        console.error('[VERIFY_WORKER] Failed to emit websocket event:', wsErr);
      }
      
      try {
        const { PublishJobLog } = await import('../models/PublishJobLog');
        await PublishJobLog.create({
          scheduledPostId: contentId.toString(),
          jobType: 'verify',
          attemptNumber: attempts || 1,
          error: error || (status === 'published' ? undefined : status),
        });
      } catch (logErr) {
        console.error('[VERIFY_WORKER] Failed to log publish job:', logErr);
      }

    } catch (error) {
      console.error(`[VERIFY_WORKER] Error updating content ${contentId} status:`, error);
    }
  }

  private static setupEventHandlers(): void {
    if (!this.worker) return;
    this.worker.on('completed', (job) => console.log(`[VERIFY_WORKER] Job ${job.id} finished.`));
    this.worker.on('failed', (job, err) => console.error(`[VERIFY_WORKER] Job ${job?.id} failed:`, err.message));
  }
}

export default VerifyWorker;
