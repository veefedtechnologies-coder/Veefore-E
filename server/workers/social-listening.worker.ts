import { Worker, Job } from 'bullmq';
import { getSharedRedisConnection } from '../lib/redis';
import { SocialListeningJobData, SocialListeningQueueManager } from '../queues/socialListeningQueue';
import { ListeningSourceModel } from '../models/SocialListening/ListeningSource';
import { ListeningPostModel } from '../models/SocialListening/ListeningPost';
import { RedditAdapter } from '../services/social-listening/adapters/RedditAdapter';
import { YouTubeAdapter } from '../services/social-listening/adapters/YouTubeAdapter';

// Lazy initialization: Worker only starts when first job is queued (Task 5.3)
let socialListeningWorker: Worker | null = null;

/**
 * Get Social Listening Worker - Lazy initialization pattern
 * Worker only starts when first social listening job is queued to eliminate idle overhead
 * @returns Worker instance or null if Redis unavailable
 */
export const getSocialListeningWorker = (): Worker | null => {
  if (!socialListeningWorker) {
    const redisConnection = getSharedRedisConnection();
    if (!redisConnection) {
      console.warn('⚠️ Redis not configured. Social Listening worker cannot be initialized.');
      return null;
    }

    console.log('👂 Lazy-initializing Social Listening Worker on first use...');

    socialListeningWorker = new Worker<SocialListeningJobData>(
      'social-listening-ingest',
      async (job: Job<SocialListeningJobData>) => {
        const { sourceId, platform, value, workspaceId } = job.data;

        try {
          const source = await ListeningSourceModel.findById(sourceId);
          if (!source || source.status !== 'active') {
            console.log(`Source ${sourceId} is not active or deleted. Skipping.`);
            return;
          }

          const sourceNiche = (job.data.niche || source.metadata?.niche || '').trim();
          if (!sourceNiche) {
            throw new Error('Niche is required for social listening ingestion job.');
          }
          console.log(`[SocialListeningWorker] Processing ingestion for ${platform}: ${value} | niche=${sourceNiche}`);

          let adapter;
          if (platform === 'reddit') adapter = new RedditAdapter();
          else if (platform === 'youtube') adapter = new YouTubeAdapter();
          else throw new Error(`Unsupported platform: ${platform}`);

          const result = await adapter.fetchLatest(source, undefined, sourceNiche);

          if (result.posts && result.posts.length > 0) {
            // Process and save posts
            const operations = result.posts.map(postData => ({
              updateOne: {
                filter: { externalId: postData.externalId, platform: postData.platform },
                update: { 
                  $set: {
                    ...postData,
                    sourceId,
                    workspaceId
                  }
                },
                upsert: true
              }
            }));

            await ListeningPostModel.bulkWrite(operations);
            console.log(`[SocialListeningWorker] Saved ${result.posts.length} posts for ${value}`);

            // Trigger AI Analysis for new posts
            for (const post of result.posts) {
              // Note: In real world, only trigger if new or not analyzed recently
              if (post.externalId && post.content) {
                 await SocialListeningQueueManager.scheduleAIAnalysis({
                   workspaceId,
                   postId: post.externalId, // Ideally the MongoDB _id after saving, but we can look it up by externalId
                   platform,
                   content: post.content,
                   niche: sourceNiche
                 });
              }
            }
          }

          // Update last crawled
          source.lastCrawledAt = new Date();
          await source.save();

        } catch (error) {
          console.error(`[SocialListeningWorker] Error processing job ${job.id}:`, error);
          throw error;
        }
      },
      { connection: redisConnection as any, concurrency: 5 }
    );

    socialListeningWorker.on('failed', (job, err) => {
      console.error(`🚨 Social Listening Job ${job?.id} failed:`, err);
    });

    console.log('✅ Social Listening Ingestion Worker initialized');
  }

  return socialListeningWorker;
};

// Backward compatibility: Keep old function name but delegate to lazy getter
export const startSocialListeningWorker = getSocialListeningWorker;
