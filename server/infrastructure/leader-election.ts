import { IStorage } from '../storage';
// Legacy memory-bound polling removed - Handled by BullMQ now
import {
  distributedLock,
  waitForMongoDBAndAcquireLock,
  LOCK_NAMES
} from '../services/distributed-lock';

export async function performHealthCheck(storage: IStorage): Promise<boolean> {
  try {
    const metrics = (storage as any).getConnectionMetrics?.();
    if (metrics && metrics.readyState !== 1) {
      console.warn('[HEALTH CHECK] MongoDB not in ready state:', metrics.readyStateLabel);
      return false;
    }

    if (metrics && metrics.readyState === 1) {
      console.log('[HEALTH CHECK] Storage layer responding normally');
      return true;
    }

    console.log('[HEALTH CHECK] No metrics available, assuming healthy');
    return true;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[HEALTH CHECK] Failed:', errorMessage);
    return false;
  }
}

export async function initializeLeaderElection(storage: IStorage): Promise<void> {
  console.log('[LEADER ELECTION] Starting leader election for Instagram polling...');

  const isHealthy = await performHealthCheck(storage);
  if (!isHealthy) {
    console.warn('[LEADER ELECTION] Health check failed, delaying leader election...');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  try {
    console.log('[LEADER ELECTION] Attempting to acquire polling lock...');
    const hasPollingLock = await waitForMongoDBAndAcquireLock(LOCK_NAMES.INSTAGRAM_POLLING);

    // PRODUCTION FIX: In production, if another instance holds the lock, this is normal
    // Only force-release in development or with explicit FORCE_LEADER flag
    const shouldForceRelease = process.env.NODE_ENV !== 'production' || process.env.FORCE_LEADER === 'true';
    
    if (!hasPollingLock && shouldForceRelease) {
      console.log('[LEADER ELECTION] ⚠️ Failed to acquire polling lock in DEV/FORCE mode. Attempting to clear ghost lock...');
      await distributedLock.forceReleaseLock(LOCK_NAMES.INSTAGRAM_POLLING);
      const retryLock = await waitForMongoDBAndAcquireLock(LOCK_NAMES.INSTAGRAM_POLLING, 5, 1000);
      if (retryLock) {
        console.log('[LEADER ELECTION] 🧨 Successfully acquired polling lock after force release!');
      }
    } else if (!hasPollingLock) {
      console.log('[LEADER ELECTION] ⏸️ Polling lock held by another instance - this instance is a FOLLOWER');
    }

    // Re-check status after potential retry
    const finalPollingLock = distributedLock.isLockOwner(LOCK_NAMES.INSTAGRAM_POLLING);
    console.log(`[LEADER ELECTION] Polling lock status: ${finalPollingLock}`);

    console.log('[LEADER ELECTION] Attempting to acquire monitor lock...');
    const hasMonitorLock = await waitForMongoDBAndAcquireLock(LOCK_NAMES.INSTAGRAM_ACCOUNT_MONITOR);

    // Same logic for monitor lock
    if (!hasMonitorLock && shouldForceRelease) {
      console.log('[LEADER ELECTION] ⚠️ Failed to acquire monitor lock in DEV/FORCE mode. Attempting to clear ghost lock...');
      await distributedLock.forceReleaseLock(LOCK_NAMES.INSTAGRAM_ACCOUNT_MONITOR);
      const retryLock = await waitForMongoDBAndAcquireLock(LOCK_NAMES.INSTAGRAM_ACCOUNT_MONITOR, 5, 1000);
      if (retryLock) {
        console.log('[LEADER ELECTION] 🧨 Successfully acquired monitor lock after force release!');
      }
    } else if (!hasMonitorLock) {
      console.log('[LEADER ELECTION] ⏸️ Monitor lock held by another instance - this instance is a FOLLOWER');
    }

    const finalMonitorLock = distributedLock.isLockOwner(LOCK_NAMES.INSTAGRAM_ACCOUNT_MONITOR);
    console.log(`[LEADER ELECTION] Monitor lock status: ${finalMonitorLock}`);

    // Use current lock ownership status
    if (finalPollingLock && finalMonitorLock) {
      console.log(`[LEADER ELECTION] ✅ This instance (${distributedLock.getInstanceId()}) is the LEADER for Instagram polling`);
      console.log('[SMART POLLING] 🚀 Activating hybrid system - webhooks + smart polling');

      try {
        console.log('[SMART POLLING] ✅ Initializing polling system');
        startFallbackSmartPolling();
      } catch (pollingError) {
        console.error('[LEADER ELECTION] Error starting polling services:', pollingError);
      }
    } else {
      console.log(`[LEADER ELECTION] ⏳ This instance (${distributedLock.getInstanceId()}) is a FOLLOWER - skipping Instagram polling`);
      console.log('[SMART POLLING] ℹ️ Polling will be handled by the leader instance');
      console.log('[SMART POLLING] ℹ️ This is normal behavior for horizontal scaling');
    }
  } catch (error) {
    console.error('[LEADER ELECTION] Failed to acquire polling locks:', error);
    
    // PRODUCTION FIX: Don't start fallback polling in production if locks failed
    // This prevents multiple instances from all running polling
    if (process.env.NODE_ENV !== 'production') {
      console.log('[SMART POLLING] ⚠️ Starting polling as fallback (development mode only)');
      startFallbackSmartPolling();
    } else {
      console.log('[SMART POLLING] ⏸️ Not starting polling - lock acquisition failed in production');
      console.log('[SMART POLLING] ℹ️ Another instance should be handling polling');
    }
  }
}

let isPollingExecuting = false;
let deferredSweepTimer: NodeJS.Timeout | null = null;

/** How often the leader sweeps the deferred-jobs queue for resumable work. */
const DEFERRED_SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Start (once) a periodic sweep that re-dispatches deferred jobs whose account
 * usage has dropped back below the restricted threshold (smart-polling-system
 * Req 11.2). Idempotent — repeated calls do not stack timers. Only the leader
 * instance calls this (via startFallbackSmartPolling).
 */
function startDeferredJobSweep(): void {
  if (deferredSweepTimer) return; // already running

  deferredSweepTimer = setInterval(async () => {
    try {
      const { reEvaluateAllDeferredJobs } = await import('../queues/metricsQueue');
      const count = await reEvaluateAllDeferredJobs();
      if (count > 0) {
        console.log(`[SMART POLLING] ♻️ Deferred sweep re-dispatched ${count} job(s)`);
      }
    } catch (err) {
      console.error('[SMART POLLING] Deferred sweep error:', (err as Error).message);
    }
  }, DEFERRED_SWEEP_INTERVAL_MS);

  // Don't let the timer keep the event loop alive on shutdown.
  if (typeof deferredSweepTimer.unref === 'function') {
    deferredSweepTimer.unref();
  }

  console.log(`[SMART POLLING] ♻️ Deferred-job recovery sweep started (every ${DEFERRED_SWEEP_INTERVAL_MS / 60000}m)`);
}

export async function startFallbackSmartPolling() {
  console.log('[SMART POLLING] Initializing BullMQ Smart Polling system...');
  
  try {
    // Dynamic import to avoid circular dependencies
    const { SocialAccountModel } = await import('../models/Social/SocialAccount');
    const { isRedisAvailable, MetricsQueueManager } = await import('../queues/metricsQueue');

    const activeAccounts = await SocialAccountModel.find({
      platform: 'instagram',
      $or: [{ accessToken: { $exists: true, $ne: '' } }, { encryptedAccessToken: { $exists: true, $ne: '' } }]
    });

    // Also collect active Facebook accounts for polling
    const activeFacebookAccounts = await SocialAccountModel.find({
      platform: 'facebook',
      connectionStatus: 'ACTIVE',
      $or: [{ accessToken: { $exists: true, $ne: '' } }, { encryptedAccessToken: { $exists: true, $ne: '' } }]
    });

    if (!isRedisAvailable()) {
      console.log('[SMART POLLING] ⚠️ Redis unavailable. System is configured to ONLY use BullMQ. Smart Polling is PAUSED.');
      return;
    }

    console.log('[SMART POLLING] ✅ Redis available - Activating distributed BullMQ polling workers');
    
    for (const acc of activeAccounts) {
      try {
         const accountId = (acc as any)._id.toString();
         
         // Calculate dynamic activity level based on engagement rate
         let activityLevel: 'high' | 'medium' | 'low' = 'low';
         const engagementRate = acc.engagementRate || 0;
         
         if (engagementRate >= 5.0) {
           activityLevel = 'high';
         } else if (engagementRate >= 1.0) {
           activityLevel = 'medium';
         }

         // BullMQ schedule true smart granular polling
         await MetricsQueueManager.scheduleSmartPolling(
           acc.workspaceId.toString(),
           acc.username || 'system',
           accountId,
           acc.accessToken || '',
           activityLevel
         );
      } catch (err: any) {
        console.error(`[SMART POLLING] Failed to schedule BullMQ job for ${acc.username}:`, err.message);
      }
    }

    // ── Facebook Page polling (repeatable, every 2 hours) ─────────────────
    // Facebook analytics are fetched live on dashboard load, but we also
    // schedule a background repeatable job so data stays fresh without
    // requiring a user to open the dashboard. Every 2 hours is appropriate
    // since Facebook Page Insights have a ~1-hour granularity.
    for (const fbAcc of activeFacebookAccounts) {
      try {
        const fbAccountId = String((fbAcc as any).accountId || (fbAcc as any)._id);
        const fbToken = (fbAcc as any).accessToken || '';
        if (!fbToken || !fbAccountId) continue;

        // Enqueue a one-shot refresh now + schedule repeatable every 2 hours.
        // metricsQueue handles Facebook via the same 'all' type — the worker
        // routes to SocialAccountService.syncFacebookAccount() when platform='facebook'.
        await MetricsQueueManager.scheduleMetricsFetch(
          fbAcc.workspaceId.toString(),
          'system',
          fbAccountId,
          fbToken,
          'all',
          { priority: 15 }
        );

        // Schedule repeatable Facebook polling (every 2 hours = 120 minutes)
        const { metricsQueue: fbQueue } = await import('../queues/metricsQueue');
        if (fbQueue) {
          const fbJobId = `fb-poll-${fbAcc.workspaceId}-${fbAccountId}`;
          await fbQueue.add(
            'fetch-metrics' as any,
            {
              workspaceId: fbAcc.workspaceId.toString(),
              userId: 'system',
              instagramAccountId: fbAccountId,  // field name is legacy; used as accountId
              token: fbToken,
              metricsType: 'all',
              priority: 15,
              forceRefresh: false,
            },
            {
              repeat: { every: 2 * 60 * 60 * 1000 }, // every 2 hours
              jobId: fbJobId,
              priority: 15,
            }
          );
          console.log(`[SMART POLLING] 🔵 Scheduled Facebook polling for page ${fbAccountId} (every 2h)`);
        }

        // ── Trigger 24-month history backfill for existing FB accounts ──────
        // For accounts connected before the durable store was built, enqueue
        // the prewarm on startup so their history gets populated. The worker
        // skips immutable days already stored, so this is idempotent — running
        // on every restart just means each run only fetches the latest missing day.
        try {
          const { prewarmFacebookInsightsForWorkspace } = await import('../features/facebook/analytics/facebookInsightsHistory');
          prewarmFacebookInsightsForWorkspace(fbAcc.workspaceId.toString())
            .catch((e: Error) => console.warn('[SMART POLLING] FB prewarm failed:', e.message));
        } catch {
          // non-fatal
        }
      } catch (err: any) {
        console.error(`[SMART POLLING] Failed to schedule Facebook polling for ${(fbAcc as any).username}:`, err.message);
      }
    }

    // Start the periodic deferred-job recovery sweep (leader only). Recovers any
    // jobs that were deferred while an account was throttled, once its usage
    // drops back below the restricted threshold (smart-polling-system Req 11.2).
    startDeferredJobSweep();
  } catch (err) {
    console.error('[SMART POLLING] Initialization error:', err);
  }
}

export async function triggerImmediateSmartPoll() {
  console.log('[SMART POLLING] Manual trigger for immediate smart poll received');
  
  try {
    const { isRedisAvailable, MetricsQueueManager } = await import('../queues/metricsQueue');
    const { SocialAccountModel } = await import('../models/Social/SocialAccount');
    
    if (isRedisAvailable()) {
      console.log('[SMART POLLING] Dispatching immediate BullMQ jobs...');
      const activeAccounts = await SocialAccountModel.find({
        platform: 'instagram',
        $or: [{ accessToken: { $exists: true, $ne: '' } }, { encryptedAccessToken: { $exists: true, $ne: '' } }]
      });
      
      for (const acc of activeAccounts) {
         // Dispatch an immediate fetch-metrics job for ALL metrics
         await MetricsQueueManager.scheduleMetricsFetch(
           acc.workspaceId.toString(),
           acc.username || 'system',
           (acc as any)._id.toString(),
           acc.accessToken || '',
           'all',
           { priority: 1, forceRefresh: true } // Priority 1 = Highest
         );
      }
    } else {
       console.log('[SMART POLLING] ⚠️ Redis unavailable, cannot trigger immediate sync. Please check Redis connection.');
    }
  } catch (err) {
    console.error('[SMART POLLING] Failed to dispatch BullMQ immediate sync:', err);
  }
}
