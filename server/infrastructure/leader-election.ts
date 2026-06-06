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

    // FIX FOR DEV/SINGLE-INSTANCE: If we failed to get lock, but it might be a ghost lock from a crash
    // In dev/test environments, we want to force takeover if possible
    if (!hasPollingLock && (process.env.NODE_ENV !== 'production' || process.env.FORCE_LEADER === 'true')) {
      console.log('[LEADER ELECTION] ⚠️ Failed to acquire polling lock in DEV/FORCE mode. Attempting to clear ghost lock...');
      await distributedLock.forceReleaseLock(LOCK_NAMES.INSTAGRAM_POLLING);
      const retryLock = await waitForMongoDBAndAcquireLock(LOCK_NAMES.INSTAGRAM_POLLING, 5, 1000);
      if (retryLock) {
        console.log('[LEADER ELECTION] 🧨 Successfully acquired polling lock after force release!');
      }
    } else if (!hasPollingLock) {
      console.log('[LEADER ELECTION] Failed to acquire polling lock (and not in dev force mode)');
    }

    // Re-check status after potential retry
    const finalPollingLock = distributedLock.isLockOwner(LOCK_NAMES.INSTAGRAM_POLLING);
    console.log(`[LEADER ELECTION] Polling lock status: ${finalPollingLock}`);

    console.log('[LEADER ELECTION] Attempting to acquire monitor lock...');
    const hasMonitorLock = await waitForMongoDBAndAcquireLock(LOCK_NAMES.INSTAGRAM_ACCOUNT_MONITOR);

    // Same fix for monitor lock
    if (!hasMonitorLock && (process.env.NODE_ENV !== 'production' || process.env.FORCE_LEADER === 'true')) {
      console.log('[LEADER ELECTION] ⚠️ Failed to acquire monitor lock in DEV/FORCE mode. Attempting to clear ghost lock...');
      await distributedLock.forceReleaseLock(LOCK_NAMES.INSTAGRAM_ACCOUNT_MONITOR);
      const retryLock = await waitForMongoDBAndAcquireLock(LOCK_NAMES.INSTAGRAM_ACCOUNT_MONITOR, 5, 1000);
      if (retryLock) {
        console.log('[LEADER ELECTION] 🧨 Successfully acquired monitor lock after force release!');
      }
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
    }
  } catch (error) {
    console.error('[LEADER ELECTION] Failed to acquire polling locks:', error);
    console.log('[SMART POLLING] ⚠️ Starting polling as fallback due to lock error');
    startFallbackSmartPolling();
  }
}

let isPollingExecuting = false;

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
