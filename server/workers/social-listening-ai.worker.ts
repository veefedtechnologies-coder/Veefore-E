import { Worker, Job } from 'bullmq';
import { redisConnection } from '../queues/metricsQueue';
import IORedis from 'ioredis';
import { AIAnalysisJobData } from '../queues/socialListeningQueue';
import { ListeningPostModel } from '../models/SocialListening/ListeningPost';
import { ListeningHookModel } from '../models/SocialListening/ListeningHook';
import { AIExtractionService } from '../services/social-listening/ai-extraction.service';

export const startSocialListeningAIWorker = () => {
  if (!redisConnection) {
    console.warn('⚠️ Redis not configured. Social Listening AI worker will not start.');
    return;
  }

  const worker = new Worker<AIAnalysisJobData>(
    'social-listening-ai',
    async (job: Job<AIAnalysisJobData>) => {
      const { postId, platform, content, niche } = job.data;
      console.log(`[SocialListeningAIWorker] Processing AI extraction for post ${postId}`);

      try {
        const post = await ListeningPostModel.findOne({ externalId: postId, platform });
        if (!post) {
          console.log(`Post ${postId} not found. Skipping AI analysis.`);
          return;
        }

        const analysisResult = await AIExtractionService.analyzeContent(content, platform);

        if (analysisResult) {
          post.aiMetadata = {
            sentiment: analysisResult.sentiment,
            sentimentScore: analysisResult.sentimentScore,
            emotions: analysisResult.emotions,
            hooks: analysisResult.hooks,
            painPoints: analysisResult.painPoints,
            topics: analysisResult.topics,
            analyzedAt: new Date()
          };
          
          await post.save();
          console.log(`[SocialListeningAIWorker] Saved AI metadata for post ${postId}`);

          // Create Hook/PainPoint entities
          const calcScore = (text: string, type: 'hook' | 'pain_point') => {
            const likes = Number(post.metrics?.likes || 0);
            const comments = Number(post.metrics?.comments || 0);
            const shares = Number(post.metrics?.shares || 0);
            const views = Number(post.metrics?.views || 0);
            const engagementSignal = likes + comments * 2 + shares * 3 + views * 0.02;
            const normalizedEngagement = Math.max(0, Math.min(70, engagementSignal / 15));
            const sentimentRaw = Number(analysisResult.sentimentScore ?? 0);
            const sentimentNormalized = sentimentRaw > 1 ? sentimentRaw / 100 : sentimentRaw;
            const sentimentBoost = type === 'hook'
              ? Math.max(0, sentimentNormalized) * 20
              : Math.max(0, -sentimentNormalized) * 20;
            const textLower = text.toLowerCase();
            const nicheBoost = niche?.trim() && textLower.includes(niche.trim().toLowerCase()) ? 10 : 0;
            return Math.round(Math.max(0, Math.min(100, normalizedEngagement + sentimentBoost + nicheBoost)));
          };

          const hookDocs = analysisResult.hooks.map((hook: string) => ({
            workspaceId: post.workspaceId,
            sourcePostId: post._id.toString(),
            platform,
            type: 'hook',
            content: hook,
            score: calcScore(hook, 'hook'),
            metrics: {
              engagementAtExtraction:
                Number(post.metrics?.likes || 0) +
                Number(post.metrics?.comments || 0) +
                Number(post.metrics?.shares || 0) +
                Number(post.metrics?.views || 0)
            },
            topics: analysisResult.topics
          }));

          const painPointDocs = analysisResult.painPoints.map((pp: string) => ({
            workspaceId: post.workspaceId,
            sourcePostId: post._id.toString(),
            platform,
            type: 'pain_point',
            content: pp,
            score: calcScore(pp, 'pain_point'),
            metrics: {
              engagementAtExtraction:
                Number(post.metrics?.likes || 0) +
                Number(post.metrics?.comments || 0) +
                Number(post.metrics?.shares || 0) +
                Number(post.metrics?.views || 0)
            },
            topics: analysisResult.topics
          }));

          if (hookDocs.length > 0 || painPointDocs.length > 0) {
            await ListeningHookModel.insertMany([...hookDocs, ...painPointDocs]);
          }
        }
      } catch (error) {
        console.error(`[SocialListeningAIWorker] Error processing job ${job.id}:`, error);
        throw error;
      }
    },
    { 
      connection: new IORedis({ ...(redisConnection as any).options, commandTimeout: undefined }), 
      concurrency: 2 // Keep low to avoid rate limits with OpenAI
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`🚨 Social Listening AI Job ${job?.id} failed:`, err);
  });

  console.log('✅ Social Listening AI Worker started');
};
