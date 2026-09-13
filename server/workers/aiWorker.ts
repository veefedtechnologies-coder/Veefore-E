import { Worker, Job } from 'bullmq';
import { getSharedRedisConnection } from '../lib/redis';
import { AIJobData } from '../queues/aiQueue';
import { generateCompetitorAnalysis } from '../competitor-analysis-ai';
import { storage } from '../mongodb-storage';

// Lazy initialization: Worker only starts when first job is queued (Task 5.1)
let aiWorker: Worker | null = null;

/**
 * Get AI Worker - Lazy initialization pattern
 * Worker only starts when first job is queued to eliminate idle overhead
 * @returns Worker instance or null if Redis unavailable
 */
export const getAIWorker = (): Worker | null => {
  if (!aiWorker) {
    const redisConnection = getSharedRedisConnection();
    const redisAvailable = redisConnection && redisConnection.status === 'ready';

    if (!redisAvailable) {
      console.warn('⚠️ Redis unavailable, AI Worker cannot be initialized');
      return null;
    }

    console.log('🧠 Lazy-initializing AI Worker on first use...');

    aiWorker = new Worker<AIJobData>(
      'ai-processing',
      async (job: Job<AIJobData>) => {
        const { type, payload, userId, workspaceId } = job.data;
        
        console.log(`[AI WORKER] 🔄 Processing ${type} job for user ${userId}`);
        
        try {
          if (type === 'competitor_analysis') {
            // Offload competitor analysis to the background. It still runs
            // through the SAME VGU engine as the synchronous route, so queuing
            // work is not a way to spend outside the user's budget. The job id
            // is the idempotency key, so a re-delivered job cannot double-charge.
            const { withVGUForUser } = await import('../services/veegpt-metering');
            const { result: analysisResult } = await withVGUForUser(
              {
                userId,
                workspaceId,
                feature: 'competitor.analysis',
                requestId: job.id ? `aiworker_${job.id}` : undefined,
                // Server-generated: a re-delivered BullMQ job is the SAME logical
                // operation, so it must reuse its reservation even after the first
                // attempt reached a terminal state.
                requestIdTrusted: true,
                meta: { userId, source: 'ai-worker', type },
              },
              () =>
                generateCompetitorAnalysis({
                  competitorUsername: payload.competitorUsername,
                  platform: payload.platform,
                  analysisType: payload.analysisType || 'full_profile',
                })
            );
            
            await storage.createCompetitorAnalysis({
              workspaceId: workspaceId,
              userId,
              competitorUsername: payload.competitorUsername,
              platform: payload.platform,
              analysisType: payload.analysisType || 'full_profile',
              scrapedData: {
                timestamp: new Date().toISOString(),
                platform: payload.platform,
                username: payload.competitorUsername
              },
              analysisResults: analysisResult.analysisResults,
              topPerformingPosts: analysisResult.topPerformingPosts,
              contentPatterns: analysisResult.contentPatterns,
              hashtags: analysisResult.analysisResults.contentAnalysis.hashtagStrategy,
              postingSchedule: { schedule: analysisResult.contentPatterns.postingSchedule },
              engagementRate: Math.round(analysisResult.analysisResults.performanceMetrics.averageEngagementRate * 100),
              growthRate: Math.floor(Math.random() * 15) + 5,
              recommendations: analysisResult.analysisResults.actionableRecommendations.join('\n'),
              competitorScore: analysisResult.competitorScore,
              lastScraped: new Date(),
              creditsUsed: 10 // Fixed background cost
            });
            
            console.log(`[AI WORKER] ✅ Competitor analysis completed and saved`);
          }
        } catch (error) {
          console.error(`[AI WORKER] ❌ Failed to process AI job:`, error);
          throw error;
        }
      },
      {
        connection: redisConnection as any,
        concurrency: 5, // AI requests are slow, limit concurrency to avoid 429 from OpenAI
      }
    );

    aiWorker.on('failed', (job, err) => {
      console.error(`[AI WORKER] 🚨 Job ${job?.id} failed:`, err);
    });
  }

  return aiWorker;
};

// Backward compatibility: Keep old function name but delegate to lazy getter
export const startAIWorker = getAIWorker;
