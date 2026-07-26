import { Worker, Job } from 'bullmq';
import { getSharedRedisConnection } from '../lib/redis';
import type { AnalyticsHistoryJobData } from '../queues/analyticsHistoryQueue';
import { fetchAndPersistFollowsDaily, getFreshTokenForAccount } from '../features/analytics/history/followsHistory';
import { fetchAndPersistInsightsDaily } from '../features/analytics/history/insightsHistory';
import { fetchAndPersistFacebookInsightsDaily, getFreshFacebookToken } from '../features/facebook/analytics/facebookInsightsHistory';
import { histLog } from '../features/analytics/history/historyDebugLog';

let analyticsHistoryWorker: Worker | null = null;

/**
 * Lazy-initialised BullMQ worker that performs the expensive, rate-limited Meta
 * `follows_and_unfollows` fetch and persists the window into
 * `AnalyticsRangeMetric` (durable) + warms Redis. HTTP routes only read the
 * cache; this worker is the sole writer to Meta, so repeated dashboard queries
 * never hit the platform or overload MongoDB.
 */
export const getAnalyticsHistoryWorker = (): Worker | null => {
  if (analyticsHistoryWorker) return analyticsHistoryWorker;

  const connection = getSharedRedisConnection();
  if (!connection) {
    console.warn('⚠️ Redis unavailable, Analytics History Worker cannot be initialized');
    return null;
  }

  console.log('📈 Lazy-initializing Analytics History Worker on first use...');

  analyticsHistoryWorker = new Worker<AnalyticsHistoryJobData>(
    'analytics-history-backfill',
    async (job: Job<AnalyticsHistoryJobData>) => {
      const { kind, workspaceId, accountId, token, fromIso, toIso } = job.data;
      if (kind !== 'follows_and_unfollows' && kind !== 'insights' && kind !== 'facebook_insights') return;

      histLog('WORKER_JOB_START', {
        jobId: job.id,
        kind,
        attempt: job.attemptsMade + 1,
        workspaceId,
        accountId,
        fromYmd: fromIso.slice(0, 10),
        toYmd: toIso.slice(0, 10),
      });

      // Use platform-appropriate token resolver
      let freshToken: string | null;
      if (kind === 'facebook_insights') {
        freshToken = (await getFreshFacebookToken(accountId)) ?? token;
      } else {
        freshToken = (await getFreshTokenForAccount(accountId)) ?? token;
      }

      if (!freshToken) {
        histLog('WORKER_JOB_SKIP_NO_TOKEN', { jobId: job.id, kind, accountId, note: 'no valid token — reconnect needed' });
        console.warn(`[ANALYTICS HISTORY] ⏭️  No valid token for ${accountId}; skipping (reconnect needed)`);
        return;
      }

      const from = new Date(fromIso);
      const to = new Date(toIso);
      if (kind === 'facebook_insights') {
        await fetchAndPersistFacebookInsightsDaily(workspaceId, accountId, freshToken, from, to);
      } else if (kind === 'insights') {
        await fetchAndPersistInsightsDaily(workspaceId, accountId, freshToken, from, to);
      } else {
        await fetchAndPersistFollowsDaily(workspaceId, accountId, freshToken, from, to);
      }
      histLog('WORKER_JOB_DONE', { jobId: job.id, kind, workspaceId, accountId });
      console.log(
        `[ANALYTICS HISTORY] ✅ ${kind} per-day ${accountId} ${fromIso.slice(0, 10)}..${toIso.slice(0, 10)} stored`
      );
    },
    {
      connection: connection as never,
      // Meta calls are rate-limited; keep concurrency low to be a good citizen.
      concurrency: 2,
    }
  );

  analyticsHistoryWorker.on('failed', (job, err) => {
    histLog('WORKER_JOB_FAILED', { jobId: job?.id, error: err?.message });
    console.error(`[ANALYTICS HISTORY] 🚨 Job ${job?.id} failed:`, err?.message);
  });

  return analyticsHistoryWorker;
};

export const startAnalyticsHistoryWorker = getAnalyticsHistoryWorker;
