/**
 * BackfillService — Initial account backfill and older post queue management.
 *
 * On new OAuth account connection this service:
 * 1. Fetches profile/account metadata first
 * 2. Fetches the most recent 20-25 posts with insights using Meta's
 *    field-expansion syntax in a SINGLE combined API request (not N+1 calls)
 * 3. For low-ceiling accounts: limits initial fetch to 15-20 posts (configurable)
 * 4. Enqueues all older posts into the `backfill-jobs` BullMQ queue at low priority
 * 5. Triggers a WebSocket `sync-complete` event when initial posts are loaded
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8
 */

import { Queue, QueueOptions } from 'bullmq';
import { getSharedRedisConnection } from '../lib/redis';
import { rateLimitConfig } from '../config/rateLimitConfig';
import { GovernedHttpClient, GovernedRequestOptions } from './GovernedHttpClient';
import { getUsageStoreInstance, CeilingClassification } from './UsageStore';
import { InstagramApiService, InstagramMediaInsights } from './instagramApi';
import {
  CURRENT_CONTENT_INSIGHT_EXPANSION,
  requestInsightsWithDeprecationFallback,
} from './insightMetricSelection';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FACEBOOK_GRAPH_API_BASE = 'https://graph.facebook.com';
const INSTAGRAM_GRAPH_API_VERSION = 'v22.0';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result of an initial backfill operation.
 */
export interface BackfillResult {
  /** Profile/metadata fetched successfully */
  profileFetched: boolean;
  /** Number of posts fetched in the initial batch */
  postsFetched: number;
  /** Number of older posts enqueued for background backfill */
  postsEnqueued: number;
  /** Whether sync-complete WebSocket event was emitted */
  syncCompleteEmitted: boolean;
  /** Account ceiling classification used */
  ceilingClassification: CeilingClassification;
  /** Paging cursor for older posts (if available) */
  nextPageCursor?: string;
}

/**
 * Data structure for backfill queue jobs.
 */
export interface BackfillJobData {
  /** Instagram account ID */
  accountId: string;
  /** OAuth access token */
  accessToken: string;
  /** Workspace ID for WebSocket targeting */
  workspaceId: string;
  /** The paging cursor (next URL) to fetch from */
  pagingCursor: string;
  /** Priority (lower = higher priority) */
  priority: number;
  /** When this job was originally created */
  createdAt: number;
  /** Number of posts expected per page */
  pageSize: number;
}

/**
 * Media item with embedded insights from field-expansion response.
 */
interface MediaWithInsights {
  id: string;
  caption?: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'STORY';
  timestamp: string;
  like_count?: number;
  comments_count?: number;
  insights?: {
    data: Array<{
      name: string;
      period: string;
      values: Array<{ value: number }>;
      title: string;
      description: string;
      id: string;
    }>;
  };
}

/**
 * Response from the field-expansion media+insights API call.
 */
interface MediaWithInsightsResponse {
  data: MediaWithInsights[];
  paging?: {
    cursors?: { before?: string; after?: string };
    next?: string;
    previous?: string;
  };
}

// ---------------------------------------------------------------------------
// Backfill Queue Setup
// ---------------------------------------------------------------------------

let backfillQueue: Queue<BackfillJobData> | null = null;

/**
 * Lazily initialize the backfill-jobs BullMQ queue.
 * Returns null if Redis is unavailable (graceful degradation).
 */
function getBackfillQueue(): Queue<BackfillJobData> | null {
  if (backfillQueue) return backfillQueue;

  try {
    if (!process.env.REDIS_URL) {
      console.log('[BackfillService] ℹ️  No REDIS_URL configured, backfill queue disabled');
      return null;
    }

    const connection = getSharedRedisConnection();
    const queueOptions: QueueOptions = {
      connection,
      defaultJobOptions: {
        removeOnComplete: 500,
        removeOnFail: 200,
        attempts: rateLimitConfig.maxRetries,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        priority: 10, // Low priority by default
      },
    };

    backfillQueue = new Queue<BackfillJobData>('backfill-jobs', queueOptions);
    console.log('[BackfillService] ✅ Backfill queue initialized');
    return backfillQueue;
  } catch (error) {
    console.error('[BackfillService] ❌ Failed to initialize backfill queue:', (error as Error).message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// BackfillService
// ---------------------------------------------------------------------------

export class BackfillService {
  /**
   * Execute initial backfill for a newly connected Instagram account.
   *
   * This is the main entry point called after OAuth completes:
   * 1. Fetch profile/metadata (Step 1 per Requirement 6.1)
   * 2. Fetch recent posts with insights via field-expansion (Requirement 6.2, 6.3)
   * 3. Enqueue older posts into backfill queue (Requirement 6.4)
   * 4. Emit sync-complete WebSocket event (Requirement 6.8)
   *
   * @param accountId - Instagram account ID (e.g., "17841400123456")
   * @param accessToken - Valid OAuth access token
   * @param workspaceId - Veefore workspace ID for WebSocket targeting
   * @returns BackfillResult with details of what was fetched/enqueued
   */
  static async executeInitialBackfill(
    accountId: string,
    accessToken: string,
    workspaceId: string
  ): Promise<BackfillResult> {
    console.log(`[BackfillService] Starting initial backfill for account ${accountId} in workspace ${workspaceId}`);

    const usageStore = getUsageStoreInstance();
    const result: BackfillResult = {
      profileFetched: false,
      postsFetched: 0,
      postsEnqueued: 0,
      syncCompleteEmitted: false,
      ceilingClassification: CeilingClassification.LOW,
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Step 1: Fetch profile/account metadata (Requirement 6.1)
    // ─────────────────────────────────────────────────────────────────────────
    try {
      const profile = await InstagramApiService.getAccountInfo(accessToken, accountId);
      result.profileFetched = true;
      console.log(`[BackfillService] ✅ Profile fetched for @${profile.username} (${profile.followers_count} followers)`);
    } catch (profileError: any) {
      console.error(`[BackfillService] ❌ Profile fetch failed for ${accountId}:`, profileError?.message || profileError);
      // Profile fetch failure is non-blocking — continue with media fetch
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2: Determine fetch limit based on ceiling classification
    // (Requirement 6.6, 6.7)
    // ─────────────────────────────────────────────────────────────────────────
    let ceilingClassification: CeilingClassification;
    try {
      ceilingClassification = await usageStore.getCeilingClassification(accountId);
    } catch {
      // Default to LOW for new accounts (Requirement 3.3)
      ceilingClassification = CeilingClassification.LOW;
    }
    result.ceilingClassification = ceilingClassification;

    const fetchLimit = ceilingClassification === CeilingClassification.HIGH
      ? rateLimitConfig.initialFetchCount
      : rateLimitConfig.initialFetchCountLowCeiling;

    console.log(`[BackfillService] Ceiling: ${ceilingClassification}, fetching ${fetchLimit} posts`);

    // ─────────────────────────────────────────────────────────────────────────
    // Step 3: Fetch recent posts with insights using field-expansion syntax
    // (Requirements 6.2, 6.3)
    //
    // Uses format:
    // ?fields=id,caption,media_type,timestamp,like_count,comments_count,
    //         insights.metric(views,reach,saved,shares,total_interactions){data}&limit=25
    // ─────────────────────────────────────────────────────────────────────────
    let mediaResponse: MediaWithInsightsResponse | null = null;
    try {
      mediaResponse = await this.fetchMediaWithInsights(accountId, accessToken, fetchLimit);
      result.postsFetched = mediaResponse.data?.length || 0;
      console.log(`[BackfillService] ✅ Fetched ${result.postsFetched} posts with insights in single request`);
    } catch (mediaError: any) {
      console.error(`[BackfillService] ❌ Media+insights fetch failed for ${accountId}:`, mediaError?.message || mediaError);
      // Try fallback: fetch media without insights embedded
      try {
        mediaResponse = await this.fetchMediaWithInsightsFallback(accountId, accessToken, fetchLimit);
        result.postsFetched = mediaResponse.data?.length || 0;
        console.log(`[BackfillService] ⚠️ Fallback: fetched ${result.postsFetched} posts without embedded insights`);
      } catch (fallbackError: any) {
        console.error(`[BackfillService] ❌ Fallback media fetch also failed:`, fallbackError?.message || fallbackError);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 4: Enqueue older posts into backfill-jobs queue (Requirement 6.4)
    // ─────────────────────────────────────────────────────────────────────────
    if (mediaResponse?.paging?.next) {
      result.postsEnqueued = await this.enqueueOlderPosts(
        accountId,
        accessToken,
        workspaceId,
        mediaResponse.paging.next
      );
      result.nextPageCursor = mediaResponse.paging.next;
      console.log(`[BackfillService] ✅ Enqueued backfill job for older posts (cursor available)`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 5: Emit sync-complete WebSocket event (Requirement 6.8)
    // ─────────────────────────────────────────────────────────────────────────
    try {
      const RealtimeService = require('./realtime').default;
      RealtimeService.broadcastToWorkspace(workspaceId, 'sync-complete', {
        accountId,
        postsLoaded: result.postsFetched,
        ceilingClassification: result.ceilingClassification,
        timestamp: Date.now(),
      });
      result.syncCompleteEmitted = true;
      console.log(`[BackfillService] ✅ sync-complete event emitted to workspace ${workspaceId}`);
    } catch (wsError: any) {
      console.warn(`[BackfillService] ⚠️ Failed to emit sync-complete:`, wsError?.message || wsError);
    }

    console.log(`[BackfillService] Initial backfill complete:`, {
      profileFetched: result.profileFetched,
      postsFetched: result.postsFetched,
      postsEnqueued: result.postsEnqueued,
      ceiling: result.ceilingClassification,
    });

    return result;
  }

  /**
   * Fetch recent media with insights using Meta's field-expansion syntax.
   *
   * This creates a SINGLE API request that returns posts WITH their insights
   * embedded, avoiding N+1 calls (Requirement 6.2, 6.3):
   *
   * GET /{accountId}/media?fields=id,caption,media_type,timestamp,like_count,
   *     comments_count,insights.metric(views,reach,saved,shares,total_interactions){data}&limit=25
   *
   * Current-content polling requests `views` (not the deprecated `impressions`)
   * and bundles `saved`/`shares` into the same request (smart-polling-system
   * Req 2.2, 3.1). If Meta reports `impressions` as deprecated/unavailable, the
   * request is retried once with `views` substituted and the job is not failed
   * (smart-polling-system Req 2.6).
   */
  static async fetchMediaWithInsights(
    accountId: string,
    accessToken: string,
    limit: number
  ): Promise<MediaWithInsightsResponse> {
    const usageStore = getUsageStoreInstance();
    const client = new GovernedHttpClient(
      {
        baseUrl: FACEBOOK_GRAPH_API_BASE,
        timeout: rateLimitConfig.httpTimeoutMs,
        maxRetries: rateLimitConfig.maxRetries,
        deduplicationWindowMs: rateLimitConfig.deduplicationWindowMs,
      },
      usageStore
    );

    // Field-expansion syntax: insights.metric(views,reach,saved,shares,total_interactions){data}
    // This fetches post data AND insights in one request (Requirement 6.3) and
    // requests `views` rather than the deprecated `impressions` metric
    // (smart-polling-system Req 2.2, 3.1).
    const insightExpansion = `${CURRENT_CONTENT_INSIGHT_EXPANSION}{data}`;

    const runRequest = async (fieldExpansion: string): Promise<MediaWithInsightsResponse> => {
      const fields = `id,caption,media_type,timestamp,like_count,comments_count,${fieldExpansion}`;
      const requestOptions: GovernedRequestOptions = {
        method: 'GET',
        path: `/${INSTAGRAM_GRAPH_API_VERSION}/${accountId}/media`,
        token: accessToken,
        params: {
          fields,
          limit: String(limit),
        },
        accountId,
        priority: 'normal',
      };

      const response = await client.request<MediaWithInsightsResponse>(requestOptions);
      return response.data;
    };

    // Single-request deprecation fallback: retry once substituting `views` for
    // `impressions` if Meta reports it deprecated/unavailable (Req 2.6). The
    // current expansion already uses `views`, so this only engages if Meta
    // rejects the request for an impressions-related reason.
    const { result, substitution } = await requestInsightsWithDeprecationFallback(
      insightExpansion,
      runRequest,
      (record) => {
        console.warn(
          `[BackfillService] ⚠️ impressions deprecated for ${accountId}; substituted '${record.from}'→'${record.to}' and retried`
        );
      }
    );

    if (substitution?.substituted) {
      console.log(`[BackfillService] ✅ Recovered media insights for ${accountId} via views substitution`);
    }

    return result;
  }

  /**
   * Fallback: fetch media without embedded insights if field-expansion fails.
   * Some account types or permissions may not support nested insights.
   */
  private static async fetchMediaWithInsightsFallback(
    accountId: string,
    accessToken: string,
    limit: number
  ): Promise<MediaWithInsightsResponse> {
    const usageStore = getUsageStoreInstance();
    const client = new GovernedHttpClient(
      {
        baseUrl: FACEBOOK_GRAPH_API_BASE,
        timeout: rateLimitConfig.httpTimeoutMs,
        maxRetries: rateLimitConfig.maxRetries,
        deduplicationWindowMs: rateLimitConfig.deduplicationWindowMs,
      },
      usageStore
    );

    // Simpler field set without nested insights
    const fields = 'id,caption,media_type,timestamp,like_count,comments_count';

    const requestOptions: GovernedRequestOptions = {
      method: 'GET',
      path: `/${INSTAGRAM_GRAPH_API_VERSION}/${accountId}/media`,
      token: accessToken,
      params: {
        fields,
        limit: String(limit),
      },
      accountId,
      priority: 'normal',
    };

    const response = await client.request<MediaWithInsightsResponse>(requestOptions);
    return response.data;
  }

  /**
   * Enqueue older posts into the backfill-jobs BullMQ queue at low priority.
   * (Requirement 6.4)
   *
   * The backfill worker (task 9.2) will process these jobs respecting tier policy:
   * - Only runs during Normal tier
   * - Defers during Caution and above
   *
   * @returns Number of jobs enqueued (typically 1 job representing the next page cursor)
   */
  static async enqueueOlderPosts(
    accountId: string,
    accessToken: string,
    workspaceId: string,
    pagingCursor: string
  ): Promise<number> {
    const queue = getBackfillQueue();

    if (!queue) {
      console.warn(`[BackfillService] ⚠️ Backfill queue unavailable, skipping older post enqueue for ${accountId}`);
      return 0;
    }

    const jobData: BackfillJobData = {
      accountId,
      accessToken,
      workspaceId,
      pagingCursor,
      priority: 10, // Low priority
      createdAt: Date.now(),
      pageSize: rateLimitConfig.initialFetchCount,
    };

    try {
      await queue.add(
        `backfill-${accountId}-${Date.now()}`,
        jobData,
        {
          priority: 10, // Low priority (higher number = lower priority in BullMQ)
          attempts: rateLimitConfig.queue.maxDeferredRetries,
          backoff: {
            type: 'exponential',
            delay: 10000, // 10 second initial delay for backfill retries
          },
          removeOnComplete: 200,
          removeOnFail: 100,
        }
      );

      console.log(`[BackfillService] ✅ Backfill job enqueued for account ${accountId}`);
      return 1;
    } catch (enqueueError: any) {
      console.error(`[BackfillService] ❌ Failed to enqueue backfill job:`, enqueueError?.message || enqueueError);
      return 0;
    }
  }

  /**
   * Parse insights from field-expansion response into a flat structure.
   * Converts the nested `insights.data` array into a simple key-value map.
   */
  static parseEmbeddedInsights(media: MediaWithInsights): InstagramMediaInsights {
    const insights: InstagramMediaInsights = {};

    if (!media.insights?.data) return insights;

    for (const metric of media.insights.data) {
      const value = metric.values?.[0]?.value || 0;

      switch (metric.name) {
        case 'impressions':
          insights.impressions = value;
          break;
        case 'reach':
          insights.reach = value;
          break;
        case 'saved':
          insights.saves = value;
          break;
      }
    }

    return insights;
  }

  /**
   * Get the backfill queue instance (for external consumers like the backfill worker).
   */
  static getQueue(): Queue<BackfillJobData> | null {
    return getBackfillQueue();
  }
}
