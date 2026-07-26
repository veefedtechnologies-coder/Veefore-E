/**
 * ConnectInitService — Worker-side connect/reconnect initialization
 *
 * Runs the post-OAuth account initialization decision INSIDE a BullMQ worker
 * (Redis-backed), instead of inline in the OAuth web request. Decides between:
 *
 *   1. RESTORE  (0 Meta API calls): preserved/stored content exists and the OAuth
 *      profile shows no change → re-attach to workspace + hydrate account stats
 *      from the DB.
 *   2. INCREMENTAL: stored content exists but posts/followers changed → enqueue a
 *      light metrics-fetch (forceRefresh=false).
 *   3. BACKFILL: no stored content (fresh connect) → enqueue a full metrics-fetch
 *      (forceRefresh=true, capped media limit).
 *
 * Change detection uses the profile data captured during OAuth, so it costs ZERO
 * additional Meta API calls.
 */

import { logger } from '../config/logger';

/**
 * Payload for a connect-init job (enqueued by the OAuth handler).
 */
export interface ConnectInitInput {
  workspaceId: string;
  instagramAccountId: string;
  accessToken: string;
  username?: string;
  /** Post count from the OAuth profile fetch (for change detection). */
  mediaCount?: number;
  /** Follower count from the OAuth profile fetch (for change detection). */
  followersCount?: number;
}

export type ConnectInitDecision = 'restored' | 'incremental' | 'backfill';

/** Days that disconnected account data is preserved for restore-on-reconnect. */
const RECONNECT_PRESERVE_DAYS = 30;

export class ConnectInitService {
  /**
   * Execute the connect/reconnect initialization. Returns the decision taken.
   * All work runs inside the calling worker (Redis/BullMQ driven).
   */
  static async run(input: ConnectInitInput): Promise<ConnectInitDecision> {
    const { workspaceId, instagramAccountId, accessToken, username } = input;

    const { ContentModel } = await import('../models/Content/Content');
    const { MetricsQueueManager } = await import('../queues/metricsQueue');

    const enqueueSync = async (forceRefresh: boolean) => {
      await MetricsQueueManager.scheduleMetricsFetch(
        workspaceId,
        'system',
        instagramAccountId,
        accessToken,
        'all',
        { priority: 5, forceRefresh }
      );
    };

    const preserveCutoff = new Date(
      Date.now() - RECONNECT_PRESERVE_DAYS * 24 * 60 * 60 * 1000
    );

    // Existing imported content for this account — either still attached to the
    // workspace, or preserved from a disconnect within the 30-day window.
    const existingQuery: any = {
      accountId: instagramAccountId,
      platform: 'instagram',
      isImported: true,
      $or: [
        { workspaceId: { $exists: true, $ne: null } },
        { disconnectedAt: { $gte: preserveCutoff } },
      ],
    };

    const existingCount = await ContentModel.countDocuments(existingQuery);

    if (existingCount === 0) {
      logger.info('[ConnectInit] No stored data — enqueueing full backfill sync', {
        component: 'ConnectInitService', instagramAccountId, username,
      });
      await enqueueSync(true);
      return 'backfill';
    }

    // Re-attach preserved content to this workspace and clear the disconnect marker.
    await ContentModel.updateMany(
      { accountId: instagramAccountId, platform: 'instagram', isImported: true },
      { $set: { workspaceId }, $unset: { disconnectedAt: '' } }
    );
    logger.info(`[ConnectInit] Restored ${existingCount} stored posts to workspace`, {
      component: 'ConnectInitService', instagramAccountId, username,
    });

    // Change detection using OAuth profile data (no extra API call).
    const profileMediaCount = typeof input.mediaCount === 'number' ? input.mediaCount : null;
    const profileFollowers = typeof input.followersCount === 'number' ? input.followersCount : null;

    let lastFollowers: number | null = null;
    try {
      const { InstagramFollowerSnapshotModel } = await import('../models/Analytics');
      const latestSnapshot = await InstagramFollowerSnapshotModel
        .findOne({ instagramUserId: instagramAccountId })
        .sort({ snapshotDate: -1 })
        .lean();
      lastFollowers = (latestSnapshot as any)?.followerCount ?? null;
    } catch {
      // Best-effort; if unavailable we treat followers as changed.
    }

    const postsUnchanged = profileMediaCount !== null && profileMediaCount === existingCount;
    const followersUnchanged =
      profileFollowers !== null && lastFollowers !== null && profileFollowers === lastFollowers;

    logger.info('[ConnectInit] Change check', {
      component: 'ConnectInitService',
      instagramAccountId, username,
      profilePosts: profileMediaCount, dbPosts: existingCount, postsUnchanged,
      profileFollowers, snapshotFollowers: lastFollowers, followersUnchanged,
    });

    if (postsUnchanged && followersUnchanged) {
      logger.info('[ConnectInit] No changes — serving from DB, skipping content sync', {
        component: 'ConnectInitService', instagramAccountId, username,
      });
      await this.hydrateAccountFromDb(input);

      // Even when content hasn't changed, always refresh demographics (audience
      // active time, country, city, gender/age) because this data is independent
      // of posts/followers and only stored on the SocialAccount record.
      // Use metricsType='reach' which sets fetchInsights=true without media fetch,
      // so we call getAccountInsights (includes online_followers with since/until fix)
      // without burning API quota on the full media list.
      try {
        const { socialAccountRepository } = await import('../repositories');
        const account = await socialAccountRepository.findByInstagramAccountId(instagramAccountId);
        if (account?._id) {
          const hasActiveTime =
            account.audienceActiveTime &&
            typeof account.audienceActiveTime === 'object' &&
            Object.keys(account.audienceActiveTime).length > 0;
          const hasWeeklyActiveTime =
            (account as any).audienceActiveTimeWeekly &&
            typeof (account as any).audienceActiveTimeWeekly === 'object' &&
            Object.keys((account as any).audienceActiveTimeWeekly).length > 0;
          
          if (!hasActiveTime || !hasWeeklyActiveTime) {
            logger.info('[ConnectInit] audienceActiveTime or weekly grid missing — enqueueing demographics refresh', {
              component: 'ConnectInitService', instagramAccountId, username,
              hasActiveTime, hasWeeklyActiveTime,
            });
            await MetricsQueueManager.scheduleMetricsFetch(
              workspaceId,
              'system',
              instagramAccountId,
              accessToken,
              'reach',
              { priority: 4, forceRefresh: false }
            );
          } else {
            logger.info('[ConnectInit] audienceActiveTime and weekly grid already populated — skipping demographics refresh', {
              component: 'ConnectInitService', instagramAccountId, username,
              hourSlots: Object.keys(account.audienceActiveTime!).length,
              weeklySlots: Object.keys((account as any).audienceActiveTimeWeekly).length,
            });
          }
        }
      } catch (demoErr) {
        logger.warn('[ConnectInit] demographics refresh enqueue failed (non-critical)', {
          component: 'ConnectInitService', error: (demoErr as Error).message,
        });
      }

      return 'restored';
    }

    logger.info('[ConnectInit] Changes detected — enqueueing incremental sync', {
      component: 'ConnectInitService', instagramAccountId, username,
    });
    // If posts DECREASED, a post was deleted. A light incremental sync (10 recent
    // posts) cannot tell which older post was removed, so the DB would stay out of
    // sync forever. Force a full sync so syncAccount fetches the complete set and
    // reconciles deletions. Otherwise (new posts / follower delta) a light sync is enough.
    const postsDecreased =
      profileMediaCount !== null && profileMediaCount < existingCount;
    if (postsDecreased) {
      logger.info('[ConnectInit] Posts decreased — forcing full sync to reconcile deletions', {
        component: 'ConnectInitService', instagramAccountId, username,
        profilePosts: profileMediaCount, dbPosts: existingCount,
      });
      await enqueueSync(true);
      return 'backfill';
    }
    await enqueueSync(false);
    return 'incremental';
  }

  /**
   * Recompute the account's rollup stats from data already in the database
   * (no Meta API calls), update the SocialAccount record, and emit the realtime
   * update so the dashboard renders preserved data instead of staying on
   * "Syncing your account...".
   */
  static async hydrateAccountFromDb(input: ConnectInitInput): Promise<void> {
    const { workspaceId, instagramAccountId, username } = input;
    try {
      const { socialAccountRepository } = await import('../repositories');
      const { contentRepository } = await import('../repositories/ContentRepository');

      const account = await socialAccountRepository.findByInstagramAccountId(instagramAccountId);
      if (!account || !account._id) {
        logger.warn('[ConnectInit] hydrateAccountFromDb: account record not found', {
          component: 'ConnectInitService', instagramAccountId,
        });
        return;
      }
      const accountDbId = (account._id as any).toString();

      const dbMetrics = await contentRepository.getAggregatedMetrics(workspaceId, instagramAccountId);
      const totalPosts =
        (dbMetrics.totalVideos || 0) + (dbMetrics.totalImages || 0) + (dbMetrics.totalCarousels || 0);
      const followers = typeof input.followersCount === 'number' ? input.followersCount : (account.followersCount || 0);

      let engagementRate = account.engagementRate || 0;
      if (followers > 0 && totalPosts > 0) {
        const totalEngagements =
          dbMetrics.totalLikes + dbMetrics.totalComments + dbMetrics.totalShares + dbMetrics.totalSaves;
        engagementRate = (totalEngagements / (followers * totalPosts)) * 100;
      }

      await socialAccountRepository.updateMetrics(accountDbId, {
        followersCount: followers,
        mediaCount: typeof input.mediaCount === 'number' ? input.mediaCount : account.mediaCount,
        totalLikes: dbMetrics.totalLikes,
        totalComments: dbMetrics.totalComments,
        totalReach: Math.max(dbMetrics.totalReach, account.totalReach || 0),
        totalSaves: dbMetrics.totalSaves,
        totalShares: dbMetrics.totalShares,
        engagementRate,
        avgLikes: dbMetrics.totalLikes / (totalPosts || 1),
        avgComments: dbMetrics.totalComments / (totalPosts || 1),
        avgReach: dbMetrics.totalReach / (totalPosts || 1),
      });

      logger.info('[ConnectInit] Hydrated account stats from DB', {
        component: 'ConnectInitService',
        instagramAccountId, username,
        posts: totalPosts, likes: dbMetrics.totalLikes, reach: dbMetrics.totalReach,
      });

      try {
        const RealtimeService = (await import('./realtime')).default;
        RealtimeService.broadcastToWorkspace(workspaceId, 'instagram_data_update', {
          type: 'initial_sync_complete',
          accountId: accountDbId,
          username,
          source: 'db_restore',
        });
      } catch (broadcastError) {
        logger.warn('[ConnectInit] realtime broadcast failed (non-critical)', {
          component: 'ConnectInitService', error: (broadcastError as Error).message,
        });
      }
    } catch (error) {
      logger.warn('[ConnectInit] hydrateAccountFromDb failed (non-critical)', {
        component: 'ConnectInitService', error: (error as Error).message,
      });
    }
  }
}

export default ConnectInitService;
