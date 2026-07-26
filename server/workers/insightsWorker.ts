import { Worker, Job } from 'bullmq';
import { getSharedRedisConnection } from '../lib/redis';
import { InsightsJobData, insightsCacheKey, insightsLastKnownKey, insightsLockKey, insightsCooldownKey } from '../queues/insightsQueue';
import { buildBannerData, buildRecommendationsData, withConfigSignature } from '../services/InsightsDataService';

let insightsWorker: Worker | null = null;

// How long a generated result stays warm in Redis before it is considered
// stale (a background refresh is then triggered while the stale value is still
// served). The result is keyed by data signature, so a fresh value also
// supersedes it whenever the underlying data changes.
const RESULT_TTL_SECONDS = 4 * 60 * 60; // 4h — signature check in the route busts it sooner when data changes

// After a failed generation (e.g. AI quota/429), block re-enqueues for this long
// so we don't hammer the AI provider and burn through quota.
const FAILURE_COOLDOWN_SECONDS = 10 * 60; // 10 minutes

/**
 * Lazy-initialised BullMQ worker that performs the MongoDB aggregation + AI
 * generation for the Performance Banner and Growth Recommendations, then writes
 * the finished result to Redis. HTTP routes only read from Redis.
 */
export const getInsightsWorker = (): Worker | null => {
  if (insightsWorker) return insightsWorker;

  const connection = getSharedRedisConnection();
  if (!connection) {
    console.warn('⚠️ Redis unavailable, Insights Worker cannot be initialized');
    return null;
  }

  console.log('💡 Lazy-initializing Insights Worker on first use...');

  insightsWorker = new Worker<InsightsJobData>(
    'insights-generation',
    async (job: Job<InsightsJobData>) => {
      const { kind, workspaceId, userId, preferences } = job.data;
      const redis = getSharedRedisConnection();

      const period = kind === 'banner' ? (job.data.period || 'month') : undefined;
      try {
        const { aiServiceManager } = await import('../services/AIServiceManager');
        const { aiCreditMeteringService } = await import('../features/subscription/services/AICreditMeteringService');

        if (kind === 'banner') {
          const { data, signature } = await buildBannerData(workspaceId, period as any, job.data.clientMetrics);
          const fullSignature = withConfigSignature(signature, preferences);

          const idempotencyKey = `insight-banner:${job.id}`;
          const { result: banner, settlement } = await aiCreditMeteringService.runMetered(
            'performanceBanner',
            'growth.insight',
            {
              userId,
              workspaceId,
              automatic: true,
              idempotencyKey,
            },
            async () => {
              const insight = await aiServiceManager.generateAnalyticsInsight(data, preferences);
              if (!insight || (!String(insight.headline || '').trim() && !String(insight.tip || '').trim())) {
                throw new Error('AI returned no usable Performance Overview insight');
              }
              return insight;
            },
          );

          const payload = {
            signature: fullSignature,
            banner,
            creditsUsed: settlement.charged,
            generatedAt: new Date().toISOString(),
          };
          const serialized = JSON.stringify(payload);
          const cacheKey = insightsCacheKey('banner', workspaceId, period);
          const lastKnownKey = insightsLastKnownKey('banner', workspaceId, period);
          let previousLastKnown: string | null = null;
          try {
            previousLastKnown = await redis.get(lastKnownKey);
            await Promise.all([
              redis.set(cacheKey, serialized, 'EX', RESULT_TTL_SECONDS),
              redis.set(lastKnownKey, serialized),
            ]);
          } catch (persistenceError) {
            // Promise.all can partially commit. Remove the hot result and
            // restore the prior durable last-known value before refunding.
            await Promise.allSettled([
              redis.del(cacheKey),
              previousLastKnown == null
                ? redis.del(lastKnownKey)
                : redis.set(lastKnownKey, previousLastKnown),
            ]);
            await aiCreditMeteringService.refundSettlement(idempotencyKey);
            throw persistenceError;
          }
          console.log(`[INSIGHTS WORKER] ✅ Banner generated for ${workspaceId} (${period})`);
        } else {
          const { data, signature } = await buildRecommendationsData(workspaceId);
          const fullSignature = withConfigSignature(signature, preferences);

          const idempotencyKey = `insight-recommendations:${job.id}`;
          const { result: recommendations, settlement } = await aiCreditMeteringService.runMetered(
            'aiGrowthRecommendation',
            'growth.recommendations',
            {
              userId,
              workspaceId,
              automatic: true,
              idempotencyKey,
            },
            async () => {
              const generated = await aiServiceManager.generateGrowthRecommendations(data, preferences);
              if (!Array.isArray(generated) || generated.length === 0) {
                throw new Error('AI returned no usable growth recommendations');
              }
              return generated;
            },
          );

          const payload = {
            signature: fullSignature,
            recommendations,
            creditsUsed: settlement.charged,
            generatedAt: new Date().toISOString(),
          };
          const serialized = JSON.stringify(payload);
          const cacheKey = insightsCacheKey('recommendations', workspaceId);
          const lastKnownKey = insightsLastKnownKey('recommendations', workspaceId);
          let previousLastKnown: string | null = null;
          try {
            previousLastKnown = await redis.get(lastKnownKey);
            await Promise.all([
              redis.set(cacheKey, serialized, 'EX', RESULT_TTL_SECONDS),
              redis.set(lastKnownKey, serialized),
            ]);
          } catch (persistenceError) {
            await Promise.allSettled([
              redis.del(cacheKey),
              previousLastKnown == null
                ? redis.del(lastKnownKey)
                : redis.set(lastKnownKey, previousLastKnown),
            ]);
            await aiCreditMeteringService.refundSettlement(idempotencyKey);
            throw persistenceError;
          }
          console.log(`[INSIGHTS WORKER] ✅ Recommendations generated for ${workspaceId} (${recommendations.length})`);
        }

        // Success → clear any prior failure cooldown.
        try { await redis.del(insightsCooldownKey(kind, workspaceId, period)); } catch { /* noop */ }
      } catch (error) {
        if ((error as Error).name === 'AutomaticGenerationCapReachedError') {
          // The cap is an expected cost-control outcome, not a provider
          // failure. Keep the last-known result and do not create a cooldown.
          console.log(`[INSIGHTS WORKER] Monthly automatic ${kind} cap reached for ${workspaceId}; preserving last-known result`);
          return { status: 'monthly_cap' };
        }
        console.error(`[INSIGHTS WORKER] ❌ Failed ${kind} job for ${workspaceId}:`, (error as Error).message);
        // Set a cooldown marker so the polling client and future requests STOP
        // re-enqueuing for a while. This prevents a retry storm from multiplying
        // AI calls and exhausting quota (the original regression). The marker
        // stores the failure reason so the route can surface it.
        try {
          await redis.set(
            insightsCooldownKey(kind, workspaceId, period),
            JSON.stringify({ error: (error as Error).message, at: new Date().toISOString() }),
            'EX', FAILURE_COOLDOWN_SECONDS
          );
        } catch { /* noop */ }
        throw error;
      } finally {
        // Always release the in-flight lock so future requests can re-trigger
        // (subject to the cooldown marker above).
        try {
          await getSharedRedisConnection().del(insightsLockKey(kind, workspaceId, period));
        } catch { /* noop */ }
      }
    },
    {
      connection: connection as any,
      concurrency: 4, // AI calls are slow; keep concurrency modest
    }
  );

  insightsWorker.on('failed', (job, err) => {
    console.error(`[INSIGHTS WORKER] 🚨 Job ${job?.id} failed:`, err?.message);
  });

  return insightsWorker;
};

export const startInsightsWorker = getInsightsWorker;
