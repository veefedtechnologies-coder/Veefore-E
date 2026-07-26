/**
 * TieredJobScheduler — Tier-Aware Job Scheduling with Deferred Queue
 *
 * Integrates with UsageStore and MetricsQueueManager to gate background jobs
 * based on per-account usage tiers. Deferred jobs are persisted in a durable
 * BullMQ queue (Redis-backed) and re-dispatched when usage drops.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 11.1, 11.2, 11.3, 11.4, 11.5
 * Facebook Page Integration Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6
 */

import { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { logger } from '../config/logger';
import { rateLimitConfig, type RateLimitConfig, type PollingCadence, type PostAgeBucketConfig } from '../config/rateLimitConfig';
import { UsageStore, UsageTier, CeilingClassification } from './UsageStore';
import { MetricRegistry, type MetricDataType, ClassificationTier } from '../config/metricRegistry';
import { getSharedRedisConnection } from '../lib/redis';
import { RealtimeService } from './realtime';
import type { BackpressureMonitor } from './BackpressureMonitor';
import type { TenantWeightedDispatcher, TenantPending } from './TenantWeightedDispatcher';
import { CapabilityGuard } from '../../src/shared/platform-registry';
import type { PlatformId, PublishingCapabilities } from '../../src/shared/platform-registry/types';
import { UnsupportedPlatformError } from '../features/social/providers/factory';
import { socialAccountRepository } from '../repositories/SocialAccountRepository';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * All background job types governed by the tier policy.
 */
export enum JobType {
  ANALYTICS_REFRESH = 'ANALYTICS_REFRESH',
  BACKFILL = 'BACKFILL',
  POLLING = 'POLLING',
  AUTOMATION_REPLY = 'AUTOMATION_REPLY',
  SCHEDULED_POST = 'SCHEDULED_POST',
  USER_INITIATED = 'USER_INITIATED',
  ACTIVE_VIEW = 'ACTIVE_VIEW',
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/**
 * A job to be dispatched or deferred by the scheduler.
 */
export interface ScheduledJob {
  id: string;
  accountId: string;
  type: JobType;
  payload: unknown;
  priority: number; // Lower number = higher priority
  scheduledAt: number; // Unix timestamp ms
  retryCount: number;
  maxRetries: number;
  deferredAt?: number; // Unix timestamp ms when first deferred
}

/**
 * Tier policy — which job types are permitted at a given tier.
 */
export interface TierPolicy {
  permitted: JobType[];
}

/**
 * Data stored in the BullMQ deferred queue per job.
 */
export interface DeferredJobData {
  originalJobId: string;
  accountId: string;
  jobType: JobType;
  payload: unknown;
  originalScheduledAt: number;
  deferredAt: number;
  retryCount: number;
  maxRetries: number;
  priority: number;
}

// ---------------------------------------------------------------------------
// Tier Policy Matrix (config-driven, not hardcoded)
// ---------------------------------------------------------------------------

/**
 * Builds the tier policy matrix from config.
 * Normal: all jobs. Caution: automation, posts, user-initiated, active-view.
 * Restricted: only active-view. Critical: only due-now scheduled posts.
 *
 * Per design:
 * | Job Type           | Normal | Caution | Restricted | Critical |
 * |ANALYTICS_REFRESH   | ✅     | ❌      | ❌         | ❌       |
 * |BACKFILL            | ✅     | ❌      | ❌         | ❌       |
 * |POLLING             | ✅     | ❌      | ❌         | ❌       |
 * |AUTOMATION_REPLY    | ✅     | ✅      | ❌         | ❌       |
 * |SCHEDULED_POST      | ✅     | ✅      | ❌         | ✅ (due) |
 * |USER_INITIATED      | ✅     | ✅      | ❌         | ❌       |
 * |ACTIVE_VIEW         | ✅     | ✅      | ✅         | ❌       |
 */
const TIER_POLICIES: Record<UsageTier, TierPolicy> = {
  [UsageTier.NORMAL]: {
    permitted: [
      JobType.ANALYTICS_REFRESH,
      JobType.BACKFILL,
      JobType.POLLING,
      JobType.AUTOMATION_REPLY,
      JobType.SCHEDULED_POST,
      JobType.USER_INITIATED,
      JobType.ACTIVE_VIEW,
    ],
  },
  [UsageTier.CAUTION]: {
    permitted: [
      JobType.AUTOMATION_REPLY,
      JobType.SCHEDULED_POST,
      JobType.USER_INITIATED,
      JobType.ACTIVE_VIEW,
    ],
  },
  [UsageTier.RESTRICTED]: {
    permitted: [JobType.ACTIVE_VIEW],
  },
  [UsageTier.CRITICAL]: {
    permitted: [JobType.SCHEDULED_POST], // Only due-now scheduled posts
  },
};

/**
 * Maps each {@link JobType} to a {@link ClassificationTier} for backpressure
 * shed/resume ordering (smart-polling-system Req 12.1, 12.2, 12.4).
 *
 * Lower tier number = more critical = shed LAST / resumed FIRST. The mapping
 * mirrors the external usage-tier deferral priorities:
 *  - Tier 1 (most critical): user-facing, time-sensitive work — `ACTIVE_VIEW`,
 *    `USER_INITIATED`, due-now `SCHEDULED_POST`.
 *  - Tier 2: user-facing automation — `AUTOMATION_REPLY`.
 *  - Tier 3: scheduled refresh work — `POLLING`, `ANALYTICS_REFRESH`.
 *  - Tier 4 (least critical): pure background catch-up — `BACKFILL`.
 *
 * Under internal backpressure the scheduler sheds in ascending tier order
 * (Tier 4 first) and resumes in descending tier order (Tier 1 first).
 */
const JOB_TYPE_CLASSIFICATION_TIERS: Record<JobType, ClassificationTier> = {
  [JobType.ACTIVE_VIEW]: ClassificationTier.TIER_1,
  [JobType.USER_INITIATED]: ClassificationTier.TIER_1,
  [JobType.SCHEDULED_POST]: ClassificationTier.TIER_1,
  [JobType.AUTOMATION_REPLY]: ClassificationTier.TIER_2,
  [JobType.POLLING]: ClassificationTier.TIER_3,
  [JobType.ANALYTICS_REFRESH]: ClassificationTier.TIER_3,
  [JobType.BACKFILL]: ClassificationTier.TIER_4,
};

/**
 * The Classification_Tier shed boundary under active internal backpressure
 * (smart-polling-system Req 12.1, 12.2). Jobs whose tier number is at or above
 * this threshold are shed (Tier 4 first, then Tier 3); jobs below it (Tier 1
 * user-facing, Tier 2 automation) are protected. Mirrors the external CAUTION
 * usage-tier deferral set.
 */
const BACKPRESSURE_SHED_TIER_THRESHOLD: ClassificationTier = ClassificationTier.TIER_3;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFERRED_QUEUE_NAME = 'deferred-jobs';
const BACKOFF_BASE_MS = 5000; // 5 seconds base for exponential backoff
const BACKOFF_MAX_MS = 300_000; // 5 minutes max backoff

/**
 * Data types that are ONLY received via webhooks and should NEVER be polled.
 * The scheduler explicitly refuses to schedule polling for these data types.
 * Requirement 5.8: Never poll for comments, mentions, or story expiry events.
 */
export const WEBHOOK_ONLY_DATA_TYPES = [
  'comments',
  'mentions',
  'story_expiry',
  'story_insights',
  'direct_messages',
] as const;

export type WebhookOnlyDataType = typeof WEBHOOK_ONLY_DATA_TYPES[number];

// ---------------------------------------------------------------------------
// Tier 4 Low-Frequency Dispatch (smart-polling-system Req 6)
// ---------------------------------------------------------------------------

/**
 * The rolling window (ms) within which a Tier 4 low-frequency metric may be
 * dispatched at most once per account (smart-polling-system Req 6.2, 6.3, 6.4).
 * Equal to the Tier 4 base interval (24h) from `metricTierBaseIntervalsMs`.
 */
export const ROLLING_24H_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Meta Graph API error code indicating audience too small / insufficient data. */
export const META_INSUFFICIENT_DATA_ERROR_CODE = 10;

/**
 * Redis key prefix for the per-account "registered post ids" SET used by
 * new-post detection (smart-polling-system Req 8.3, 8.5, 8.7). A post id is a
 * member of `smartpoll:registeredposts:{accountId}` once it is known to Veefore
 * (whether published through Veefore or discovered by a New_Post_Detection_Job),
 * so re-detecting it is a no-op and never creates a duplicate registration.
 */
export const REGISTERED_POSTS_KEY_PREFIX = 'smartpoll:registeredposts:';

/**
 * Outcome of registering a post discovered by a New_Post_Detection_Job
 * (smart-polling-system Req 8.5, 8.7). `newlyRegistered` is true only when the
 * post id was NOT already a member of the account's registered-post set, i.e.
 * the caller should begin age-based insight polling for it (Req 4). When false
 * the post was already known and the caller MUST NOT create a duplicate
 * registration (Req 8.7).
 */
export interface PostRegistrationResult {
  postId: string;
  newlyRegistered: boolean;
}

/**
 * Tier 4 account-level metrics gated to at most once per rolling 24h window per
 * account via a per-account Redis `lastDispatchedAt` marker (Req 6.3, 6.4).
 * `follower_demographics` shares the same marker mechanism but is additionally
 * gated by the follower-count threshold (Req 6.1, 6.2).
 */
export type LowFrequencyMetric =
  | 'follower_demographics'
  | 'online_followers'
  | 'business_action_clicks';

// ---------------------------------------------------------------------------
// Multi-Platform Publishing Types (Facebook Page Integration Req 10.1, 10.2)
// ---------------------------------------------------------------------------

/**
 * A publish specification for a single platform within a multi-platform
 * publish request. Carries all platform-specific overrides: caption, media,
 * and scheduled time.
 *
 * Requirements: 10.1, 10.2
 */
export interface PlatformPublishSpec {
  /** The target platform for this publish slot. */
  platform: PlatformId;
  /** Platform-specific caption. Instagram: up to 2,200 chars; Facebook: up to 63,206 chars. */
  caption: string;
  /** Optional list of media asset URLs specific to this platform slot. */
  mediaUrls?: string[];
  /**
   * Optional scheduled publish time for this platform.
   * Rejected if it is in the past at the time of job creation.
   */
  scheduledAt?: Date;
}

/**
 * A request to create independent publish jobs for one or more platforms in a
 * single workspace. Each platform spec is processed independently — a rejection
 * on one platform MUST NOT cancel or affect any other platform's job.
 *
 * Requirements: 10.1, 10.4
 */
export interface MultiPlatformPublishRequest {
  /** The workspace that owns all accounts in this publish request. */
  workspaceId: string;
  /** Per-platform publish specifications. Must contain at least one entry. */
  platforms: PlatformPublishSpec[];
  /**
   * Optional shared media URLs applied to all platforms that do not provide
   * their own `mediaUrls`. Per-platform `mediaUrls` take precedence.
   */
  sharedMediaUrls?: string[];
}

/**
 * The outcome of attempting to create a job for a single platform within a
 * `MultiPlatformPublishRequest`.
 *
 * - `status: 'created'` — the job was accepted and handed to `dispatchOrDefer`.
 * - `status: 'rejected'` — the job was declined before dispatch; `reason`
 *   describes why (e.g. account not ACTIVE, unsupported post type, past schedule).
 *
 * Requirements: 10.1, 10.3, 10.4, 10.6
 */
export interface PlatformJobResult {
  /** The platform this result belongs to. */
  platform: PlatformId;
  /** Whether the job was accepted or rejected. */
  status: 'created' | 'rejected';
  /**
   * The BullMQ job ID assigned by `dispatchOrDefer`, present only when
   * `status === 'created'`.
   */
  jobId?: string;
  /** Human-readable explanation of why the job was rejected, when applicable. */
  reason?: string;
}

/**
 * The individual business-action-click metrics that are bundled under the
 * `business_action_clicks` Tier 4 data type (Req 6.4).
 */
export const BUSINESS_ACTION_CLICK_METRICS = [
  'email_contacts',
  'phone_call_clicks',
  'text_message_clicks',
  'get_directions_clicks',
] as const;

/**
 * Outcome of attempting to handle a follower_demographics Meta error code 10
 * (Req 6.6). `recorded` is always true so callers mark the job complete; the
 * result is explicitly NOT an error and MUST NOT be retried.
 */
export interface InsufficientDataOutcome {
  insufficientData: true;
  shouldRetry: false;
  markComplete: true;
}

// ---------------------------------------------------------------------------
// TieredJobScheduler Class
// ---------------------------------------------------------------------------

export class TieredJobScheduler {
  private usageStore: UsageStore;
  private config: RateLimitConfig;
  private deferredQueue: Queue<DeferredJobData> | null = null;
  private redis: Redis | null = null;

  /**
   * Optional internal-backpressure signal (smart-polling-system Req 12). When
   * configured and `'active'`, the scheduler sheds the lowest-priority work
   * (ascending Classification_Tier order, Tier 4 first) into the durable
   * deferred queue. When unset, `canDispatch`/`dispatchOrDefer` behave exactly
   * as before — this is a purely additive enhancement layer.
   */
  private backpressureMonitor: Pick<BackpressureMonitor, 'getState'> | null = null;

  /**
   * Optional tenant priority weighting (smart-polling-system Req 13). When
   * configured, {@link selectNextTenantUnderContention} delegates the
   * next-tenant choice to it during contention; when unset, selection falls
   * back to simple FIFO over the supplied pending tenants.
   */
  private tenantDispatcher: Pick<TenantWeightedDispatcher, 'selectNextTenant'> | null = null;

  /**
   * Optional re-enqueue hook used by {@link reEvaluateDeferredJobs} (smart-polling-system
   * Req 11.2). When set, a deferred job that becomes runnable again is re-enqueued
   * as a real `metrics-fetch` job via this callback BEFORE its deferred entry is
   * removed, so the work actually runs instead of being silently dropped. When
   * unset, re-dispatch only removes the deferred entry (legacy behavior) — the
   * repeatable job will re-fire on its own cadence next cycle.
   */
  private reEnqueueDeferred: ((data: DeferredJobData) => Promise<void>) | null = null;

  constructor(
    usageStore: UsageStore,
    config?: RateLimitConfig,
    options?: {
      backpressureMonitor?: Pick<BackpressureMonitor, 'getState'>;
      tenantDispatcher?: Pick<TenantWeightedDispatcher, 'selectNextTenant'>;
    }
  ) {
    this.usageStore = usageStore;
    this.config = config ?? rateLimitConfig;
    this.backpressureMonitor = options?.backpressureMonitor ?? null;
    this.tenantDispatcher = options?.tenantDispatcher ?? null;
    this.initDeferredQueue();
  }

  /**
   * Inject the {@link BackpressureMonitor} after construction (smart-polling-system
   * Req 12). Optional — when never set, dispatch behavior is unchanged.
   */
  setBackpressureMonitor(monitor: Pick<BackpressureMonitor, 'getState'> | null): void {
    this.backpressureMonitor = monitor;
  }

  /**
   * Inject the {@link TenantWeightedDispatcher} after construction
   * (smart-polling-system Req 13). Optional — when never set, contention
   * selection falls back to FIFO.
   */
  setTenantDispatcher(dispatcher: Pick<TenantWeightedDispatcher, 'selectNextTenant'> | null): void {
    this.tenantDispatcher = dispatcher;
  }

  /**
   * Inject the re-enqueue hook used when resuming deferred jobs
   * (smart-polling-system Req 11.2). The callback is responsible for adding a
   * real `metrics-fetch` job from the deferred job's stored payload. Optional —
   * when unset, {@link reEvaluateDeferredJobs} only removes deferred entries.
   */
  setReEnqueueDeferred(fn: ((data: DeferredJobData) => Promise<void>) | null): void {
    this.reEnqueueDeferred = fn;
  }

  // -------------------------------------------------------------------------
  // Queue Initialization
  // -------------------------------------------------------------------------

  /**
   * Initialize the BullMQ deferred job queue (durable, Redis-persisted).
   * Follows the same pattern as metricsQueue.ts — checks REDIS_URL availability.
   */
  private initDeferredQueue(): void {
    if (!process.env.REDIS_URL) {
      logger.warn('[TieredJobScheduler] No REDIS_URL configured, deferred queue disabled', {
        component: 'TieredJobScheduler',
      });
      this.deferredQueue = null;
      return;
    }

    try {
      const connection = getSharedRedisConnection();
      this.deferredQueue = new Queue<DeferredJobData>(DEFERRED_QUEUE_NAME, {
        connection,
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: this.config.queue.maxDeferredRetries,
          backoff: {
            type: 'exponential',
            delay: BACKOFF_BASE_MS,
          },
        },
      });

      this.deferredQueue.on('error', (err) => {
        logger.error('[TieredJobScheduler] Deferred queue error', {
          component: 'TieredJobScheduler',
          error: err.message,
        });
      });

      logger.info('[TieredJobScheduler] Deferred job queue initialized', {
        component: 'TieredJobScheduler',
      });
    } catch (error) {
      logger.warn('[TieredJobScheduler] Failed to initialize deferred queue', {
        component: 'TieredJobScheduler',
        error: (error as Error).message,
      });
      this.deferredQueue = null;
    }
  }

  // -------------------------------------------------------------------------
  // Public Methods
  // -------------------------------------------------------------------------

  /**
   * Check if a job can be dispatched for a given account (Requirement 4.6).
   * Queries UsageStore FIRST before allowing dispatch — never after a failed call.
   *
   * Evaluates BOTH Meta rate-limit systems and uses the MORE RESTRICTIVE tier:
   *   1. Account-Level (BUC): 4,800 × impressions per 24h — per account
   *   2. App-Level (AU): 200 × app users per hour — shared across the whole app
   *
   * For a new/small app the App-Level limit is the tighter ceiling, so it must
   * also gate dispatch — otherwise the app-wide rate limit gets hit. The job is
   * permitted only if BOTH tiers allow it (Requirement 4.9 — per-account
   * independence for BUC still holds; AU is a global overlay).
   */
  async canDispatch(accountId: string, jobType: JobType): Promise<boolean> {
    // 1. Account-level (BUC) tier for this specific account
    const { tier: accountTier } = await this.usageStore.getEffectiveUsage(accountId);

    // 2. App-level (AU) tier — global across the whole app
    const appUsage = await this.usageStore.getAppUsage();
    const appTier = appUsage.tier;

    // Use the more restrictive of the two tiers
    const effectiveTier = TieredJobScheduler.mostRestrictiveTier(accountTier, appTier);

    const permittedByUsage = TieredJobScheduler.isJobPermitted(effectiveTier, jobType, TIER_POLICIES);
    if (!permittedByUsage) {
      return false;
    }

    // 3. Internal backpressure overlay (smart-polling-system Req 12.1, 12.2).
    // When a monitor is configured and reports 'active', shed the lowest-priority
    // (Tier 4 first) work into the durable deferred queue — even though the usage
    // tier would otherwise permit it. When no monitor is configured this is a
    // no-op and behavior is exactly as before (purely additive).
    if (this.backpressureMonitor && this.backpressureMonitor.getState() === 'active') {
      const jobTier = JOB_TYPE_CLASSIFICATION_TIERS[jobType];
      if (TieredJobScheduler.isShedUnderBackpressure(jobTier)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Dispatch a job if permitted, otherwise defer to the durable queue (Requirement 4.5).
   * Returns 'dispatched' if the job was allowed, or 'deferred' if enqueued for later.
   */
  async dispatchOrDefer(job: ScheduledJob): Promise<'dispatched' | 'deferred'> {
    const permitted = await this.canDispatch(job.accountId, job.type);

    if (permitted) {
      return 'dispatched';
    }

    // Defer the job to durable BullMQ queue
    await this.deferJob(job);
    return 'deferred';
  }

  /**
   * Create independent publish jobs for each platform in a
   * `MultiPlatformPublishRequest` (Facebook Page Integration Requirements 10.3–10.6).
   *
   * For every platform spec in the request:
   * 1. Checks that a SocialAccount for the workspace + platform exists and has
   *    `connectionStatus === 'ACTIVE'`. If not, rejects immediately with a
   *    descriptive reason — never enqueues or calls any platform API.
   * 2. Consults `CapabilityGuard.supportsPublishing(platform, postType)` to
   *    confirm the post type is supported. If not, rejects with
   *    `UnsupportedPlatformError`. **No raw platform string comparison is
   *    used here or anywhere else in this method** (Requirement 1.3).
   * 3. Validates that `scheduledAt`, when provided, is not in the past.
   * 4. Calls `this.dispatchOrDefer(job)` for the validated platform spec.
   *
   * Isolation invariant: a rejection on one platform MUST NOT cancel or
   * affect any other platform's job. All specs are processed independently
   * via `Promise.allSettled`-equivalent sequential evaluation with individual
   * try/catch blocks (Requirement 10.4).
   *
   * @param req  A `MultiPlatformPublishRequest` with one or more platform specs.
   * @returns    An array of `PlatformJobResult`, one per platform spec, in the
   *             same order as `req.platforms`.
   *
   * Requirements: 10.3, 10.4, 10.5, 10.6
   */
  async createPlatformJobs(req: MultiPlatformPublishRequest): Promise<PlatformJobResult[]> {
    const results: PlatformJobResult[] = [];

    for (const spec of req.platforms) {
      // Each spec is processed fully independently — errors in one spec must
      // never bleed into another (Requirement 10.4).
      try {
        // ------------------------------------------------------------------
        // Step 1: Verify account exists and is ACTIVE (Requirement 10.6)
        // ------------------------------------------------------------------
        const account = await socialAccountRepository.findOne({
          workspaceId: req.workspaceId,
          platform: spec.platform,
        });

        if (!account) {
          results.push({
            platform: spec.platform,
            status: 'rejected',
            reason: `No ${spec.platform} account found for this workspace.`,
          });
          logger.info('[TieredJobScheduler] createPlatformJobs: account not found', {
            component: 'TieredJobScheduler',
            workspaceId: req.workspaceId,
            platform: spec.platform,
          });
          continue;
        }

        // connectionStatus is the canonical field added by the Facebook
        // Page Integration schema extension.  Fall back to `isActive` for
        // backward-compatibility with existing Instagram accounts that may
        // not yet have a `connectionStatus` field populated.
        const connectionStatus: string =
          (account as any).connectionStatus ??
          (account.isActive ? 'ACTIVE' : 'DISCONNECTED');

        if (connectionStatus !== 'ACTIVE') {
          results.push({
            platform: spec.platform,
            status: 'rejected',
            reason: `Account connectionStatus is '${connectionStatus}'. Reconnect the account before scheduling.`,
          });
          logger.info('[TieredJobScheduler] createPlatformJobs: account not ACTIVE', {
            component: 'TieredJobScheduler',
            workspaceId: req.workspaceId,
            platform: spec.platform,
            connectionStatus,
          });
          continue;
        }

        // ------------------------------------------------------------------
        // Step 2: Check publishing capability via CapabilityGuard
        // (Requirement 1.3 — never use raw platform string comparison)
        // ------------------------------------------------------------------
        // Infer the post type from the presence of media. This is a
        // best-effort classification used to gate the capability check;
        // the actual post-type enforcement lives in the provider layer.
        const mediaUrls = spec.mediaUrls ?? req.sharedMediaUrls ?? [];
        const inferredPostType = TieredJobScheduler.inferPostType(mediaUrls);

        if (!CapabilityGuard.supportsPublishing(spec.platform, inferredPostType)) {
          const error = new UnsupportedPlatformError(spec.platform);
          results.push({
            platform: spec.platform,
            status: 'rejected',
            reason: `Platform '${spec.platform}' does not support post type '${inferredPostType}': ${error.message}`,
          });
          logger.info('[TieredJobScheduler] createPlatformJobs: unsupported post type', {
            component: 'TieredJobScheduler',
            platform: spec.platform,
            inferredPostType,
          });
          continue;
        }

        // ------------------------------------------------------------------
        // Step 3: Validate scheduledAt is not in the past (Requirement 10.2)
        // ------------------------------------------------------------------
        if (spec.scheduledAt !== undefined) {
          const now = Date.now();
          if (spec.scheduledAt.getTime() <= now) {
            results.push({
              platform: spec.platform,
              status: 'rejected',
              reason: `scheduledAt (${spec.scheduledAt.toISOString()}) is in the past. Provide a future scheduled time.`,
            });
            logger.info('[TieredJobScheduler] createPlatformJobs: scheduledAt in past', {
              component: 'TieredJobScheduler',
              platform: spec.platform,
              scheduledAt: spec.scheduledAt.toISOString(),
            });
            continue;
          }
        }

        // ------------------------------------------------------------------
        // Step 4: Build a ScheduledJob and call dispatchOrDefer
        // (Requirement 10.5 — use existing TieredJobScheduler infrastructure)
        // ------------------------------------------------------------------
        const jobId = `platform-publish-${req.workspaceId}-${spec.platform}-${Date.now()}`;
        const job: ScheduledJob = {
          id: jobId,
          accountId: (account._id as any).toString(),
          type: JobType.SCHEDULED_POST,
          payload: {
            workspaceId: req.workspaceId,
            platform: spec.platform,
            caption: spec.caption,
            mediaUrls,
            scheduledAt: spec.scheduledAt?.toISOString(),
          },
          priority: 1, // SCHEDULED_POST is Tier 1 — highest priority
          scheduledAt: spec.scheduledAt ? spec.scheduledAt.getTime() : Date.now(),
          retryCount: 0,
          maxRetries: this.config.queue.maxDeferredRetries,
        };

        const dispatchResult = await this.dispatchOrDefer(job);

        results.push({
          platform: spec.platform,
          status: 'created',
          jobId,
        });

        logger.info('[TieredJobScheduler] createPlatformJobs: job created', {
          component: 'TieredJobScheduler',
          platform: spec.platform,
          jobId,
          dispatchResult,
          workspaceId: req.workspaceId,
        });
      } catch (err) {
        // Catch-all: an unexpected error for this platform spec MUST NOT
        // prevent other specs from being processed (Requirement 10.4).
        const message = err instanceof Error ? err.message : String(err);
        results.push({
          platform: spec.platform,
          status: 'rejected',
          reason: `Unexpected error: ${message}`,
        });
        logger.error('[TieredJobScheduler] createPlatformJobs: unexpected error for platform', {
          component: 'TieredJobScheduler',
          platform: spec.platform,
          workspaceId: req.workspaceId,
          error: message,
        });
      }
    }

    return results;
  }

  /**
   * Pure: infer the `PublishingCapabilities` key that best represents the post
   * type based on the supplied media URL list.
   *
   * - No media  → `textPosts`
   * - One media  → `imagePosts` (covers single image or video; detailed
   *   differentiation is the responsibility of the provider layer)
   * - Many media → `carouselPosts`
   *
   * This is intentionally coarse — it exists solely to enable a meaningful
   * `CapabilityGuard.supportsPublishing` call. The provider layer performs the
   * precise enforcement.
   */
  static inferPostType(mediaUrls: string[]): keyof PublishingCapabilities {
    if (mediaUrls.length === 0) return 'textPosts';
    if (mediaUrls.length === 1) return 'imagePosts';
    return 'carouselPosts';
  }

  /**
   * Get the polling cadence for an account based on ceiling classification.
   *
   * Cadence values are read from `this.config` on every invocation, meaning any
   * config update (env-var change + process restart, or future hot-reload) is
   * adopted within one polling cycle with no code change required (Requirement 5.7).
   *
   * NOTE: This method provides cadence ONLY for data types that should be polled.
   * Comments, mentions, and story expiry are webhook-only and MUST NOT be polled
   * (Requirement 5.8). Use `isWebhookOnlyDataType()` to guard against accidental polling.
   */
  async getPollingCadence(accountId: string): Promise<PollingCadence> {
    const classification = await this.usageStore.getCeilingClassification(accountId);
    return TieredJobScheduler.computePollingCadence(classification, this.config);
  }

  /**
   * Compute the media-insight refresh interval (ms) for a single post based on
   * its age and the account's ceiling classification (smart-polling-system
   * Req 4.1–4.6).
   *
   * The interval is `bucketBaseInterval × ceilingScalingFactor[classification]`,
   * where the bucket is selected for `now − postPublishedAt` and all numbers are
   * loaded from `this.config.smartPolling` (no hardcoded literals — Req 4.5).
   *
   * Because the bucket is recomputed from the current age on every invocation,
   * a post that has crossed an age-bucket boundary is rescheduled to the new
   * bucket's interval within one polling cycle (Req 4.6). Callers in
   * `MetricsQueueManager.scheduleSmartPolling` re-invoke this each cycle and
   * diff the repeatable-job interval.
   *
   * `saved` and `shares` are NOT separate jobs — they ride in the same
   * media-insights field-expansion request, so they inherit exactly this
   * cadence (Req 3.3).
   *
   * Reads the ceiling classification from `UsageStore`; all other inputs are
   * pure config, so the arithmetic is delegated to the pure static
   * `computePostInterval` for testability.
   */
  async getPostInsightCadence(accountId: string, postPublishedAt: number): Promise<number> {
    const classification = await this.usageStore.getCeilingClassification(accountId);
    const postAgeMs = Date.now() - postPublishedAt;
    return TieredJobScheduler.computePostInterval(postAgeMs, classification, this.config);
  }

  /**
   * Resolve the New_Post_Detection_Job polling interval (ms) for an account,
   * scaled by its ceiling classification (smart-polling-system Req 8.1, 8.2,
   * 8.4). Reads the ceiling from `UsageStore` and delegates the (hard-coded-free)
   * interval selection to the pure static {@link newPostDetectionInterval}.
   *
   * HIGH-ceiling accounts are detected more frequently; LOW-ceiling accounts at
   * a wider interval. The detection job itself fetches the media list through
   * `InstagramService.getUserMedia`, which routes through `GovernedHttpClient`,
   * so the request counts against the account's usage like any other governed
   * call (Req 8.6).
   *
   * @param accountId The Instagram account ID to resolve the interval for.
   * @returns The detection interval in milliseconds.
   */
  async getNewPostDetectionInterval(accountId: string): Promise<number> {
    const classification = await this.usageStore.getCeilingClassification(accountId);
    return TieredJobScheduler.newPostDetectionInterval(classification, this.config);
  }

  // -------------------------------------------------------------------------
  // Follower Demographics Gate + Tier 4 Low-Frequency Metrics (Req 6)
  // -------------------------------------------------------------------------

  /**
   * Decide whether a `follower_demographics` call should be scheduled for an
   * account on this polling cycle (smart-polling-system Req 6.1, 6.2, 6.5, 6.7).
   *
   * Returns `true` only when BOTH:
   *  - the account's most-recent recorded follower_count is greater than or equal
   *    to the configured threshold (`config.smartPolling.followerDemographicsThreshold`,
   *    a non-negative integer, default 100 — Req 6.1, 6.5); AND
   *  - `follower_demographics` has NOT already been dispatched for this account
   *    within the rolling 24h window (Req 6.2), tracked by a per-account Redis
   *    `lastDispatchedAt` marker.
   *
   * The threshold gate is pure (delegated to {@link demographicsGateOpen}) so it
   * is fully testable. When an account's follower_count rises from below the
   * threshold to at/above it, the gate opens again and demographics resume on the
   * next polling cycle (Req 6.7) — no extra state is needed because the decision
   * is recomputed from the live follower_count each cycle.
   *
   * NOTE: This method only DECIDES; it does not mark the metric dispatched.
   * Callers that actually dispatch MUST call
   * {@link markLowFrequencyDispatched}('follower_demographics', accountId) so the
   * once-per-24h marker is set (Req 6.2).
   */
  async shouldScheduleFollowerDemographics(
    accountId: string,
    lastFollowerCount: number
  ): Promise<boolean> {
    const threshold = this.config.smartPolling.followerDemographicsThreshold;

    // Req 6.1, 6.5, 6.7 — pure threshold gate.
    if (!TieredJobScheduler.demographicsGateOpen(lastFollowerCount, threshold)) {
      return false;
    }

    // Req 6.2 — at most once per rolling 24h window per account.
    return this.canDispatchLowFrequency('follower_demographics', accountId);
  }

  /**
   * Decide whether a Tier 4 low-frequency account metric (`online_followers` or
   * `business_action_clicks`) may be dispatched for an account on this cycle
   * (smart-polling-system Req 6.3, 6.4).
   *
   * Both are classified Tier 4 in the {@link MetricRegistry} and are dispatched at
   * most once per rolling 24h window per account, tracked by the same per-account
   * Redis `lastDispatchedAt` marker used by the demographics gate.
   *
   * Returns `true` if no dispatch has occurred within the rolling 24h window (or
   * if Redis is unavailable — fail-open so low-frequency work is not permanently
   * starved). Callers that dispatch MUST call {@link markLowFrequencyDispatched}.
   */
  async canDispatchLowFrequency(
    metric: LowFrequencyMetric,
    accountId: string,
    now: number = Date.now()
  ): Promise<boolean> {
    // Single source of truth: these metrics MUST be Tier 4 in the registry
    // (Req 6.3, 6.4). A misclassification is a startup/config bug, not a
    // per-dispatch error, so we surface it loudly but do not block dispatch.
    const entry = MetricRegistry.get(metric as MetricDataType);
    if (entry.classificationTier !== 4) {
      logger.warn('[TieredJobScheduler] Low-frequency metric is not classified Tier 4', {
        component: 'TieredJobScheduler',
        metric,
        tier: entry.classificationTier,
      });
    }

    const redis = this.getRedis();
    if (!redis) {
      // Redis unavailable — fail open so low-frequency metrics are not starved.
      return true;
    }

    try {
      const raw = await redis.get(this.lowFrequencyMarkerKey(metric, accountId));
      if (!raw) {
        return true;
      }
      const lastDispatchedAt = parseInt(raw, 10);
      if (!Number.isFinite(lastDispatchedAt)) {
        return true;
      }
      return TieredJobScheduler.rollingWindowElapsed(lastDispatchedAt, now, ROLLING_24H_WINDOW_MS);
    } catch (error) {
      logger.warn('[TieredJobScheduler] Failed to read low-frequency marker, allowing dispatch', {
        component: 'TieredJobScheduler',
        accountId,
        metric,
        error: (error as Error).message,
      });
      return true;
    }
  }

  /**
   * Record that a Tier 4 low-frequency metric was dispatched for an account, so
   * subsequent cycles within the rolling 24h window are gated off (Req 6.2, 6.3,
   * 6.4). Writes a per-account Redis `lastDispatchedAt` marker with a 24h TTL so
   * the key self-expires once the window has fully elapsed.
   */
  async markLowFrequencyDispatched(
    metric: LowFrequencyMetric,
    accountId: string,
    now: number = Date.now()
  ): Promise<void> {
    const redis = this.getRedis();
    if (!redis) {
      return;
    }

    try {
      await redis.set(
        this.lowFrequencyMarkerKey(metric, accountId),
        String(now),
        'PX',
        ROLLING_24H_WINDOW_MS
      );
    } catch (error) {
      logger.warn('[TieredJobScheduler] Failed to write low-frequency marker', {
        component: 'TieredJobScheduler',
        accountId,
        metric,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Handle a `follower_demographics` response that returned Meta error code 10
   * (audience too small / insufficient data) (smart-polling-system Req 6.6).
   *
   * Per the requirement, the system records the result as insufficient data,
   * marks the job complete, does NOT retry, and does NOT log the result as an
   * error. This is logged at `info` level (not `error`) and the marker is set so
   * the metric is not re-attempted within the rolling 24h window.
   *
   * @returns An {@link InsufficientDataOutcome} the caller uses to mark the job
   *          complete without scheduling a retry.
   */
  async handleDemographicsInsufficientData(
    accountId: string,
    metric: LowFrequencyMetric = 'follower_demographics',
    now: number = Date.now()
  ): Promise<InsufficientDataOutcome> {
    // Record the dispatch so we don't re-attempt within the rolling 24h window.
    await this.markLowFrequencyDispatched(metric, accountId, now);

    // Req 6.6 — recorded as insufficient data, NOT logged as an error.
    logger.info('[TieredJobScheduler] follower_demographics returned insufficient data (error 10)', {
      component: 'TieredJobScheduler',
      accountId,
      metric,
      result: 'insufficient_data',
    });

    return { insufficientData: true, shouldRetry: false, markComplete: true };
  }

  /**
   * Detect whether an error from a `follower_demographics` (or other low-frequency)
   * response is Meta error code 10 (insufficient data / audience too small).
   * Accepts the common shapes a Meta/Graph error can arrive in.
   */
  static isInsufficientDataError(error: unknown): boolean {
    if (error == null || typeof error !== 'object') {
      return false;
    }
    const e = error as Record<string, any>;
    const code =
      e.code ??
      e.errorCode ??
      e?.error?.code ??
      e?.response?.data?.error?.code;
    return Number(code) === META_INSUFFICIENT_DATA_ERROR_CODE;
  }

  /**
   * Redis key for a per-account Tier 4 low-frequency `lastDispatchedAt` marker.
   * Mirrors the `usage:{accountId}` schema used by {@link UsageStore}.
   */
  private lowFrequencyMarkerKey(metric: LowFrequencyMetric, accountId: string): string {
    return metric === 'follower_demographics'
      ? `smartpoll:demographics:${accountId}`
      : `smartpoll:${metric}:${accountId}`;
  }

  /**
   * Lazily resolve the shared Redis connection used for low-frequency markers.
   * Returns null when Redis is unavailable so callers can fail open.
   */
  private getRedis(): Redis | null {
    if (this.redis) {
      return this.redis;
    }
    try {
      const redis = getSharedRedisConnection();
      if (redis) {
        this.redis = redis;
      }
    } catch {
      // Redis unavailable — markers degrade to fail-open behavior.
    }
    return this.redis;
  }

  // -------------------------------------------------------------------------
  // New-Post Detection (smart-polling-system Req 8)
  // -------------------------------------------------------------------------

  /**
   * Register a post that was published through Veefore for insight polling
   * WITHOUT scheduling a New_Post_Detection_Job for it (smart-polling-system
   * Req 8.3).
   *
   * Because Veefore already knows about posts it published, detection is
   * unnecessary — the post id is simply added to the account's idempotent
   * registered-post set so a later New_Post_Detection_Job that re-observes the
   * same post treats it as already known and creates no duplicate registration
   * (Req 8.7). Returns `newlyRegistered: false` when the post was already in the
   * set.
   *
   * The caller is responsible for starting age-based insight polling
   * (Requirement 4); this method only records the registration.
   */
  async registerVeeforePost(
    accountId: string,
    postId: string
  ): Promise<PostRegistrationResult> {
    const newlyRegistered = await this.addRegisteredPost(accountId, postId);
    return { postId, newlyRegistered };
  }

  /**
   * Register a post discovered by a New_Post_Detection_Job (smart-polling-system
   * Req 8.5, 8.7).
   *
   * Adds the post id to the account's idempotent registered-post set. Returns
   * `newlyRegistered: true` only when the id was NOT already present — in that
   * case the caller SHALL begin age-based insight polling for the post per
   * Requirement 4 (Req 8.5). When the post was already registered (e.g. it was
   * published through Veefore, or a previous detection cycle already found it),
   * the result is `newlyRegistered: false` and the caller MUST NOT create a
   * duplicate registration (Req 8.7).
   */
  async registerDiscoveredPost(
    accountId: string,
    postId: string
  ): Promise<PostRegistrationResult> {
    const newlyRegistered = await this.addRegisteredPost(accountId, postId);
    return { postId, newlyRegistered };
  }

  /**
   * Register a batch of posts discovered by a New_Post_Detection_Job, returning
   * only those that were newly registered so the caller can start age-based
   * insight polling for exactly the unknown posts (smart-polling-system Req 8.5,
   * 8.7). Already-registered posts are silently skipped (idempotent), so a
   * detection cycle that re-observes known posts produces no duplicate
   * registrations even if it fails or is throttled and retried (Req 8.7).
   */
  async registerDiscoveredPosts(
    accountId: string,
    postIds: string[]
  ): Promise<PostRegistrationResult[]> {
    const results: PostRegistrationResult[] = [];
    for (const postId of postIds) {
      results.push(await this.registerDiscoveredPost(accountId, postId));
    }
    return results;
  }

  /**
   * Whether a post id is already registered (known) for an account
   * (smart-polling-system Req 8.7). Used to skip detection/registration work for
   * posts Veefore already tracks. Fails closed (`true`) when Redis is
   * unavailable so a transient outage cannot cause a duplicate registration.
   */
  async isPostRegistered(accountId: string, postId: string): Promise<boolean> {
    const redis = this.getRedis();
    if (!redis) {
      // Redis unavailable — fail closed so we never create a duplicate
      // registration during an outage (Req 8.7).
      return true;
    }
    try {
      const isMember = await redis.sismember(
        this.registeredPostsKey(accountId),
        postId
      );
      return isMember === 1;
    } catch (error) {
      logger.warn('[TieredJobScheduler] Failed to read registered-post set, assuming registered', {
        component: 'TieredJobScheduler',
        accountId,
        postId,
        error: (error as Error).message,
      });
      return true;
    }
  }

  /**
   * Idempotently add a post id to the account's registered-post SET (Req 8.7).
   * Returns `true` only when the id was newly added (Redis `SADD` returned 1),
   * `false` when it was already present. On Redis failure returns `false` so the
   * caller does NOT treat the post as newly registered and therefore does not
   * start duplicate polling — the next detection cycle will re-attempt safely.
   */
  private async addRegisteredPost(accountId: string, postId: string): Promise<boolean> {
    const redis = this.getRedis();
    if (!redis) {
      return false;
    }
    try {
      const added = await redis.sadd(this.registeredPostsKey(accountId), postId);
      return added === 1;
    } catch (error) {
      logger.warn('[TieredJobScheduler] Failed to write registered-post set', {
        component: 'TieredJobScheduler',
        accountId,
        postId,
        error: (error as Error).message,
      });
      return false;
    }
  }

  /**
   * Redis key for the per-account "registered post ids" SET used by new-post
   * detection (smart-polling-system Req 8.3, 8.5, 8.7). Mirrors the
   * `smartpoll:{metric}:{accountId}` marker-key convention.
   */
  private registeredPostsKey(accountId: string): string {
    return `${REGISTERED_POSTS_KEY_PREFIX}${accountId}`;
  }

  /**
   * Check if a data type is webhook-only and should NEVER be polled.
   * Returns true for comments, mentions, story expiry, direct messages.
   * Requirement 5.8: The system SHALL never poll for these — webhooks only.
   */
  static isWebhookOnlyDataType(dataType: string): boolean {
    return WEBHOOK_ONLY_DATA_TYPES.includes(dataType as any);
  }

  /**
   * Re-evaluate and dispatch deferred jobs when usage drops below 80% (Requirement 11.2).
   * Respects priority order and FIFO within same priority (Requirement 11.5).
   * Returns the count of jobs dispatched.
   */
  async reEvaluateDeferredJobs(accountId: string): Promise<number> {
    if (!this.deferredQueue) {
      return 0;
    }

    const { percentage } = await this.usageStore.getEffectiveUsage(accountId);

    // Also check App-Level usage — both must be below the restricted threshold
    // before we resume deferred work, otherwise we'd hit the app-wide ceiling.
    const appUsage = await this.usageStore.getAppUsage();

    // Only re-dispatch when BOTH account-level and app-level usage drop below
    // the restricted threshold (80%). Use the worse of the two as the gate.
    const worstPercentage = Math.max(percentage, appUsage.percentage);
    if (worstPercentage >= this.config.tierThresholds.restricted) {
      return 0;
    }

    // Get all waiting/delayed jobs for this account
    const waitingJobs = await this.deferredQueue.getJobs(['waiting', 'delayed']);
    const accountJobs = (waitingJobs ?? []).filter(
      (j) => j && j.data && j.data.accountId === accountId
    );

    if (accountJobs.length === 0) {
      return 0;
    }

    // Sort by priority (lower = higher priority), then by deferredAt (FIFO within same priority)
    accountJobs.sort((a, b) => {
      // Backpressure resume ordering (smart-polling-system Req 12.4): when a
      // monitor is configured, resume in DESCENDING Classification_Tier order
      // (Tier 1 most-critical first). This only changes ordering when the
      // monitor is wired in; otherwise the original priority/FIFO sort is used.
      if (this.backpressureMonitor) {
        const tierDiff =
          JOB_TYPE_CLASSIFICATION_TIERS[a.data.jobType] -
          JOB_TYPE_CLASSIFICATION_TIERS[b.data.jobType];
        if (tierDiff !== 0) return tierDiff;
      }
      const priorityDiff = a.data.priority - b.data.priority;
      if (priorityDiff !== 0) return priorityDiff;
      return a.data.deferredAt - b.data.deferredAt;
    });

    let dispatched = 0;

    for (const job of accountJobs) {
      // Re-check tier for each job type (tier may change as we process)
      const canRun = await this.canDispatch(accountId, job.data.jobType);
      if (!canRun) {
        break; // Stop dispatching if we hit a job that's not permitted
      }

      try {
        // Re-enqueue the actual fetch work BEFORE removing the deferred entry
        // (smart-polling-system Req 11.2). Without this the job is only deleted
        // and the work is lost; with it the metrics-fetch job runs now that the
        // account is permitted again. If re-enqueue fails we keep the deferred
        // entry (do not remove) so the work is retried on the next sweep.
        if (this.reEnqueueDeferred) {
          await this.reEnqueueDeferred(job.data);
        }

        await job.remove();
        dispatched++;

        logger.info('[TieredJobScheduler] Re-dispatched deferred job', {
          component: 'TieredJobScheduler',
          accountId,
          jobType: job.data.jobType,
          originalJobId: job.data.originalJobId,
          retryCount: job.data.retryCount,
        });
      } catch (error) {
        logger.warn('[TieredJobScheduler] Failed to re-dispatch deferred job', {
          component: 'TieredJobScheduler',
          jobId: job.id,
          error: (error as Error).message,
        });
      }
    }

    if (dispatched > 0) {
      logger.info(`[TieredJobScheduler] Re-dispatched ${dispatched} deferred job(s) for account`, {
        component: 'TieredJobScheduler',
        accountId,
        dispatched,
      });
    }

    return dispatched;
  }

  /**
   * Get the count of deferred jobs for an account (Requirement 11.3).
   * Exposed for monitoring and alerting.
   */
  async getDeferredJobCount(accountId: string): Promise<number> {
    if (!this.deferredQueue) {
      return 0;
    }

    try {
      const jobs = await this.deferredQueue.getJobs(['waiting', 'delayed']);
      return (jobs ?? []).filter((j) => j && j.data && j.data.accountId === accountId).length;
    } catch (error) {
      logger.warn('[TieredJobScheduler] Failed to get deferred job count', {
        component: 'TieredJobScheduler',
        accountId,
        error: (error as Error).message,
      });
      return 0;
    }
  }

  /**
   * Sweep ALL deferred jobs across every account and re-dispatch those whose
   * account+app usage now permits them (smart-polling-system Req 11.2). Intended
   * to be invoked periodically (e.g. on a timer) so deferred work is recovered
   * without waiting for a per-account trigger.
   *
   * Groups the durable deferred queue by `accountId` and runs
   * {@link reEvaluateDeferredJobs} once per distinct account. Returns the total
   * number of jobs re-dispatched across all accounts. Safe to call when the
   * queue is empty or unavailable (returns 0).
   */
  async reEvaluateAllDeferredJobs(): Promise<number> {
    if (!this.deferredQueue) {
      return 0;
    }

    let accountIds: string[];
    try {
      const jobs = await this.deferredQueue.getJobs(['waiting', 'delayed']);
      accountIds = Array.from(
        new Set(
          (jobs ?? [])
            .map((j) => j?.data?.accountId)
            .filter((id): id is string => typeof id === 'string' && id.length > 0)
        )
      );
    } catch (error) {
      logger.warn('[TieredJobScheduler] Failed to enumerate deferred jobs for sweep', {
        component: 'TieredJobScheduler',
        error: (error as Error).message,
      });
      return 0;
    }

    if (accountIds.length === 0) {
      return 0;
    }

    let total = 0;
    for (const accountId of accountIds) {
      try {
        total += await this.reEvaluateDeferredJobs(accountId);
      } catch (error) {
        logger.warn('[TieredJobScheduler] Deferred sweep failed for account', {
          component: 'TieredJobScheduler',
          accountId,
          error: (error as Error).message,
        });
      }
    }

    if (total > 0) {
      logger.info(`[TieredJobScheduler] Deferred sweep re-dispatched ${total} job(s) across ${accountIds.length} account(s)`, {
        component: 'TieredJobScheduler',
        total,
        accounts: accountIds.length,
      });
    }

    return total;
  }

  /**
   * Pure: whether a job of the given Classification_Tier should be shed when the
   * internal backpressure state is `'active'` (smart-polling-system Req 12.1,
   * 12.2).
   *
   * The shed boundary is {@link BACKPRESSURE_SHED_TIER_THRESHOLD}: any job at or
   * below that tier in criticality (i.e. tier number ≥ the threshold) is shed.
   * With the threshold at Tier 3 this sheds the background, non-user-facing
   * tiers — Tier 4 (`BACKFILL`) and Tier 3 (`POLLING`, `ANALYTICS_REFRESH`) —
   * Tier 4 first by construction, while protecting the user-facing Tier 1
   * (`ACTIVE_VIEW`, `USER_INITIATED`, due-now `SCHEDULED_POST`) and Tier 2
   * (`AUTOMATION_REPLY`) work. This exactly mirrors the external usage-tier
   * deferral logic, where the CAUTION tier defers those same job types
   * (Req 12.2).
   *
   * @param jobTier The job's Classification_Tier (1 = most critical … 4 = least).
   * @returns Whether the job is shed under active backpressure.
   */
  static isShedUnderBackpressure(jobTier: ClassificationTier): boolean {
    return jobTier >= BACKPRESSURE_SHED_TIER_THRESHOLD;
  }

  /**
   * Pure: the Classification_Tier assigned to a {@link JobType} for backpressure
   * shed/resume ordering (smart-polling-system Req 12.1, 12.2, 12.4). Lower tier
   * number = more critical = shed last / resumed first.
   */
  static classificationTierForJobType(jobType: JobType): ClassificationTier {
    return JOB_TYPE_CLASSIFICATION_TIERS[jobType];
  }

  /**
   * Determine which tenant's pending work should be dispatched next under
   * contention (smart-polling-system Req 13.1–13.3). Delegates to the injected
   * {@link TenantWeightedDispatcher} when configured; otherwise falls back to a
   * deterministic FIFO over the supplied pending tenants (so behavior is
   * unchanged when tenant weighting is not wired in).
   *
   * @param pending      Tenants that currently have pending jobs.
   * @param windowCounts Jobs already dispatched per tenant in the current
   *                     rolling fairness window (`tenantId → count`).
   * @returns The `tenantId` to dispatch next, or `''` when `pending` is empty.
   */
  selectNextTenantUnderContention(
    pending: TenantPending[],
    windowCounts: Record<string, number>
  ): string {
    if (pending.length === 0) {
      return '';
    }
    if (this.tenantDispatcher) {
      return this.tenantDispatcher.selectNextTenant(pending, windowCounts);
    }
    // No dispatcher configured — preserve prior behavior with simple FIFO.
    return pending[0].tenantId;
  }

  // -------------------------------------------------------------------------
  // Pure Static Functions (exported for testability)
  // -------------------------------------------------------------------------

  /**
   * Determine whether a job type is permitted at a given tier.
   * Pure function — no side effects, fully testable (Requirement 4.1–4.4).
   */
  static isJobPermitted(
    tier: UsageTier,
    jobType: JobType,
    tierPolicies: Record<UsageTier, TierPolicy>
  ): boolean {
    const policy = tierPolicies[tier];
    if (!policy) {
      return false;
    }
    return policy.permitted.includes(jobType);
  }

  /**
   * Return the more restrictive of two tiers.
   * Tier severity order: NORMAL < CAUTION < RESTRICTED < CRITICAL.
   *
   * Used to combine the Account-Level (BUC) tier and App-Level (AU) tier so a
   * job is gated by whichever Meta rate-limit system is closer to its ceiling.
   * Pure function — fully testable.
   */
  static mostRestrictiveTier(a: UsageTier, b: UsageTier): UsageTier {
    const severity: Record<UsageTier, number> = {
      [UsageTier.NORMAL]: 0,
      [UsageTier.CAUTION]: 1,
      [UsageTier.RESTRICTED]: 2,
      [UsageTier.CRITICAL]: 3,
    };
    return severity[a] >= severity[b] ? a : b;
  }

  /**
   * Compute the polling cadence for an account based on ceiling classification.
   * Pure function — maps classification to config-driven intervals (Requirement 5.1–5.5).
   *
   * Returns a fresh copy of the polling intervals so callers cannot mutate config.
   * High-ceiling: account insights ~60min, post insights recent 2-4h, new post detection 1-4h, follower hourly.
   * Low-ceiling: account insights 3-6h, post insights recent 4-6h, new post detection 1-4h (longer end), follower 4-6h.
   * Older post insights: once daily at most, low priority (both classifications).
   *
   * This does NOT include any cadence for webhook-only data types (comments, mentions, story expiry).
   * Those are received exclusively via webhooks (Requirement 5.8).
   */
  static computePollingCadence(
    classification: CeilingClassification,
    config: RateLimitConfig
  ): PollingCadence {
    if (classification === CeilingClassification.HIGH) {
      return { ...config.polling.highCeiling };
    }
    return { ...config.polling.lowCeiling };
  }

  /**
   * Pure: select the index of the age bucket a post falls into based on its age
   * in milliseconds (smart-polling-system Req 4.1–4.4, 4.6).
   *
   * Buckets are ordered by ascending `maxAgeMs` (exclusive upper bound); the
   * last bucket uses `Number.POSITIVE_INFINITY`. The first bucket whose
   * `maxAgeMs` is strictly greater than `postAgeMs` is selected. A negative age
   * (clock skew / future-dated publish) clamps to bucket 0.
   *
   * Returns the bucket index. If no bucket matches (misconfiguration), the last
   * bucket index is returned so a post is always schedulable.
   */
  static selectAgeBucket(postAgeMs: number, buckets: PostAgeBucketConfig[]): number {
    if (buckets.length === 0) {
      throw new Error('[TieredJobScheduler] postAgeBuckets must contain at least one bucket');
    }

    const age = postAgeMs < 0 ? 0 : postAgeMs;

    for (let i = 0; i < buckets.length; i++) {
      if (age < buckets[i].maxAgeMs) {
        return i;
      }
    }

    return buckets.length - 1;
  }

  /**
   * Pure: compute a post's media-insight refresh interval (ms) as
   * `bucketBaseInterval × ceilingScalingFactor[classification]`
   * (smart-polling-system Req 4.1–4.5).
   *
   * The bucket is selected by `selectAgeBucket(postAgeMs, …)` and the scaling
   * factor is keyed by the ceiling classification ('HIGH' | 'LOW'). All numbers
   * come from `config.smartPolling`; nothing is hardcoded (Req 4.5).
   */
  static computePostInterval(
    postAgeMs: number,
    classification: CeilingClassification,
    config: RateLimitConfig
  ): number {
    const { postAgeBuckets, ceilingScalingFactor } = config.smartPolling;
    const bucketIndex = TieredJobScheduler.selectAgeBucket(postAgeMs, postAgeBuckets);
    const baseIntervalMs = postAgeBuckets[bucketIndex].baseIntervalMs;
    const factor = ceilingScalingFactor[classification];
    return baseIntervalMs * factor;
  }

  /**
   * Pure: the New_Post_Detection_Job polling interval (ms) for an account, scaled
   * by its ceiling classification (smart-polling-system Req 8.1, 8.2, 8.4).
   *
   * HIGH-ceiling accounts are polled more frequently (default 2h) and LOW-ceiling
   * accounts at a wider interval (default 6h). Both values are loaded from
   * `config.smartPolling.newPostDetectionMs` keyed by ceiling — nothing is
   * hardcoded (Req 8.4).
   *
   * @param classification The account's ceiling classification (HIGH | LOW).
   * @param config The rate-limit config supplying the detection intervals.
   * @returns The detection interval in milliseconds.
   */
  static newPostDetectionInterval(
    classification: CeilingClassification,
    config: RateLimitConfig
  ): number {
    const { highCeiling, lowCeiling } = config.smartPolling.newPostDetectionMs;
    return classification === CeilingClassification.HIGH ? highCeiling : lowCeiling;
  }

  /**
   * Pure threshold gate for follower_demographics (smart-polling-system Req 6.1,
   * 6.5, 6.7).
   *
   * Returns `true` when the account's most-recent recorded follower_count is
   * greater than or equal to the configured threshold. The threshold is a
   * non-negative integer loaded from config (default 100) and passed in, so this
   * function holds no literals. When the count rises from below to at/above the
   * threshold the gate transitions closed→open, which is what re-enables
   * scheduling on the next cycle (Req 6.7).
   *
   * @param lastFollowerCount The account's most-recent recorded follower count.
   * @param threshold The configured follower-demographics threshold.
   * @returns Whether demographics scheduling is permitted by the threshold gate.
   */
  static demographicsGateOpen(lastFollowerCount: number, threshold: number): boolean {
    return lastFollowerCount >= threshold;
  }

  /**
   * Pure: has a full rolling window elapsed since the last dispatch?
   * Used to gate Tier 4 low-frequency metrics to at most once per rolling 24h
   * window per account (smart-polling-system Req 6.2, 6.3, 6.4).
   *
   * Returns `true` (dispatch allowed) when `now - lastDispatchedAt >= windowMs`,
   * or when `lastDispatchedAt` is non-finite (no prior dispatch recorded).
   *
   * @param lastDispatchedAt Unix ms of the last dispatch, or NaN if none.
   * @param now Current Unix ms.
   * @param windowMs The rolling window length in ms.
   */
  static rollingWindowElapsed(lastDispatchedAt: number, now: number, windowMs: number): boolean {
    if (!Number.isFinite(lastDispatchedAt)) {
      return true;
    }
    return now - lastDispatchedAt >= windowMs;
  }

  // -------------------------------------------------------------------------
  // Private Methods
  // -------------------------------------------------------------------------

  /**
   * Defer a job to the durable BullMQ queue with exponential backoff.
   * Tracks retry count, original scheduled time, and priority (Requirement 11.1).
   * Emits alert when max retries exceeded or job stuck > 24 hours (Requirement 4.7, 11.4).
   */
  private async deferJob(job: ScheduledJob): Promise<void> {
    const now = Date.now();
    const deferredAt = job.deferredAt ?? now;
    const retryCount = job.retryCount + 1;

    // Check if job exceeds max retries — emit monitoring alert (Requirement 4.7)
    if (retryCount > this.config.queue.maxDeferredRetries) {
      this.emitMaxRetriesAlert(job, retryCount);
      return; // Don't enqueue further — alert operators
    }

    // Check if job has been deferred > 24 hours — emit monitoring alert (Requirement 11.4)
    const hoursDeferred = (now - deferredAt) / (1000 * 60 * 60);
    if (hoursDeferred >= this.config.queue.deferredAlertThresholdHours) {
      this.emitStuckJobAlert(job, hoursDeferred);
      // Still enqueue for one more attempt but alert is fired
    }

    const deferredData: DeferredJobData = {
      originalJobId: job.id,
      accountId: job.accountId,
      jobType: job.type,
      payload: job.payload,
      originalScheduledAt: job.scheduledAt,
      deferredAt,
      retryCount,
      maxRetries: job.maxRetries,
      priority: job.priority,
    };

    if (!this.deferredQueue) {
      // Fallback: log warning if queue is not available
      logger.warn('[TieredJobScheduler] Deferred queue unavailable, job cannot be persisted', {
        component: 'TieredJobScheduler',
        accountId: job.accountId,
        jobType: job.type,
        jobId: job.id,
      });
      return;
    }

    // Compute exponential backoff delay
    const delay = Math.min(
      BACKOFF_BASE_MS * Math.pow(2, retryCount - 1),
      BACKOFF_MAX_MS
    );

    try {
      await this.deferredQueue.add(
        'deferred-job',
        deferredData,
        {
          delay,
          priority: job.priority,
          jobId: `deferred-${job.accountId}-${job.id}-${retryCount}`,
        }
      );

      logger.info('[TieredJobScheduler] Job deferred', {
        component: 'TieredJobScheduler',
        accountId: job.accountId,
        jobType: job.type,
        jobId: job.id,
        retryCount,
        delayMs: delay,
      });

      // Broadcast deferred-operation event via WebSocket (Requirement 8.6)
      try {
        RealtimeService.broadcastToWorkspace('global', 'deferred-operation', {
          accountId: job.accountId,
          operation: job.type,
          estimatedRetryMinutes: Math.round(delay / 60000),
        });
      } catch (broadcastError) {
        // Non-critical — don't let broadcast failure affect core functionality
        logger.warn('[TieredJobScheduler] Failed to broadcast deferred-operation via WebSocket', {
          component: 'TieredJobScheduler',
          accountId: job.accountId,
          error: (broadcastError as Error).message,
        });
      }
    } catch (error) {
      logger.error('[TieredJobScheduler] Failed to enqueue deferred job', {
        component: 'TieredJobScheduler',
        accountId: job.accountId,
        jobId: job.id,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Emit monitoring alert when a deferred job exceeds max retries.
   */
  private emitMaxRetriesAlert(job: ScheduledJob, retryCount: number): void {
    logger.error('[TieredJobScheduler] ⚠️ ALERT: Deferred job exceeded max retries', {
      component: 'TieredJobScheduler',
      alert: 'DEFERRED_JOB_MAX_RETRIES',
      accountId: job.accountId,
      jobType: job.type,
      jobId: job.id,
      retryCount,
      maxRetries: this.config.queue.maxDeferredRetries,
      originalScheduledAt: new Date(job.scheduledAt).toISOString(),
    });
  }

  /**
   * Emit monitoring alert when a deferred job has been stuck > 24 hours without execution.
   */
  private emitStuckJobAlert(job: ScheduledJob, hoursDeferred: number): void {
    logger.error('[TieredJobScheduler] ⚠️ ALERT: Deferred job stuck without execution', {
      component: 'TieredJobScheduler',
      alert: 'DEFERRED_JOB_STUCK',
      accountId: job.accountId,
      jobType: job.type,
      jobId: job.id,
      hoursDeferred: Math.round(hoursDeferred * 10) / 10,
      thresholdHours: this.config.queue.deferredAlertThresholdHours,
      originalScheduledAt: new Date(job.scheduledAt).toISOString(),
    });
  }
}

export { TIER_POLICIES };
export default TieredJobScheduler;
