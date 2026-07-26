/**
 * Unit Tests for TieredJobScheduler
 *
 * Tests tier boundary transitions, deferred job retry counting & max retry alerts,
 * priority ordering on re-dispatch, 24-hour stuck job alerts, polling cadence,
 * and webhook-only data type enforcement.
 *
 * Requirements validated: 4.5, 4.7, 11.4
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  TieredJobScheduler,
  JobType,
  TIER_POLICIES,
  WEBHOOK_ONLY_DATA_TYPES,
  type ScheduledJob,
} from '../TieredJobScheduler';
import { UsageStore, UsageTier, CeilingClassification } from '../UsageStore';
import { type RateLimitConfig, rateLimitConfig } from '../../config/rateLimitConfig';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../realtime', () => ({
  RealtimeService: {
    broadcastToWorkspace: vi.fn(),
  },
}));

vi.mock('../../config/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../lib/redis', () => ({
  getSharedRedisConnection: vi.fn(() => ({ status: 'ready' })),
}));

const { mockGetJobs, mockQueueAdd, mockQueueOn } = vi.hoisted(() => ({
  mockGetJobs: vi.fn().mockResolvedValue([]),
  mockQueueAdd: vi.fn().mockResolvedValue({}),
  mockQueueOn: vi.fn(),
}));

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: mockQueueAdd,
    getJobs: mockGetJobs,
    on: mockQueueOn,
  })),
}));

// ---------------------------------------------------------------------------
// Test Config
// ---------------------------------------------------------------------------

const TEST_CONFIG: RateLimitConfig = {
  bucMultiplier: 4800,
  platformRateLimitMultiplier: 200,
  publishLimitPerDay: 25,
  messagingCeilingPerHour: 250,
  tierThresholds: { caution: 60, restricted: 80, critical: 95 },
  polling: {
    highCeiling: {
      accountInsightsMs: 60 * 60 * 1000,
      postInsightsRecentMs: 3 * 60 * 60 * 1000,
      postInsightsOlderMs: 24 * 60 * 60 * 1000,
      newPostDetectionMs: 2 * 60 * 60 * 1000,
      followerCountMs: 60 * 60 * 1000,
    },
    lowCeiling: {
      accountInsightsMs: 4 * 60 * 60 * 1000,
      postInsightsRecentMs: 5 * 60 * 60 * 1000,
      postInsightsOlderMs: 24 * 60 * 60 * 1000,
      newPostDetectionMs: 3 * 60 * 60 * 1000,
      followerCountMs: 5 * 60 * 60 * 1000,
    },
  },
  highCeilingImpressionThreshold: 1000,
  queue: {
    webhookConcurrencyPerAccount: 3,
    maxDeferredRetries: 10,
    deferredAlertThresholdHours: 24,
    queueDepthAlertThreshold: 500,
  },
  usageRecordTtlSeconds: 7200,
  stalenessThresholdMs: 300_000,
  initialFetchCount: 25,
  initialFetchCountLowCeiling: 20,
  httpTimeoutMs: 10_000,
  maxRetries: 3,
  deduplicationWindowMs: 2000,
  errorMessageMap: {
    '80002': 'Pausing data refresh.',
    '429': 'Spacing out requests.',
    default: 'Something went wrong.',
  },
  smartPolling: rateLimitConfig.smartPolling,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockUsageStore(overrides: Partial<{
  getEffectiveUsage: ReturnType<typeof vi.fn>;
  getCeilingClassification: ReturnType<typeof vi.fn>;
  getTier: ReturnType<typeof vi.fn>;
  getAppUsage: ReturnType<typeof vi.fn>;
}> = {}): UsageStore {
  return {
    getEffectiveUsage: overrides.getEffectiveUsage ?? vi.fn().mockResolvedValue({
      percentage: 30,
      tier: UsageTier.NORMAL,
      isStale: false,
    }),
    getCeilingClassification: overrides.getCeilingClassification ?? vi.fn().mockResolvedValue(
      CeilingClassification.HIGH
    ),
    getTier: overrides.getTier ?? vi.fn().mockResolvedValue(UsageTier.NORMAL),
    // App-level (AU) usage overlay consulted by canDispatch/reEvaluateDeferredJobs.
    // Defaults to NORMAL so only the account-level (BUC) tier under test gates dispatch.
    getAppUsage: overrides.getAppUsage ?? vi.fn().mockResolvedValue({
      callCountPct: 0,
      totalCputimePct: 0,
      totalTimePct: 0,
      percentage: 0,
      tier: UsageTier.NORMAL,
      lastUpdatedAt: Date.now(),
    }),
  } as unknown as UsageStore;
}

function createJob(overrides: Partial<ScheduledJob> = {}): ScheduledJob {
  return {
    id: 'job-1',
    accountId: 'acc-1',
    type: JobType.ANALYTICS_REFRESH,
    payload: {},
    priority: 5,
    scheduledAt: Date.now(),
    retryCount: 0,
    maxRetries: 10,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TieredJobScheduler — Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-set mock return values after clear (clear doesn't remove implementations but let's be safe)
    mockGetJobs.mockResolvedValue([]);
    mockQueueAdd.mockResolvedValue({});
    // Set REDIS_URL so the deferred queue initializes in the constructor
    process.env.REDIS_URL = 'redis://localhost:6379';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // isJobPermitted — Tier Policy Matrix Tests
  // =========================================================================
  describe('isJobPermitted — tier policy matrix', () => {
    describe('Normal tier (0-60%) allows all 7 job types', () => {
      const allJobs = Object.values(JobType);
      it.each(allJobs)('%s is permitted at Normal tier', (jobType) => {
        expect(
          TieredJobScheduler.isJobPermitted(UsageTier.NORMAL, jobType, TIER_POLICIES)
        ).toBe(true);
      });
    });

    describe('Caution tier (60-80%) allows 4 job types', () => {
      const permittedAtCaution = [
        JobType.AUTOMATION_REPLY,
        JobType.SCHEDULED_POST,
        JobType.USER_INITIATED,
        JobType.ACTIVE_VIEW,
      ];
      const deniedAtCaution = [
        JobType.ANALYTICS_REFRESH,
        JobType.BACKFILL,
        JobType.POLLING,
      ];

      it.each(permittedAtCaution)('%s is permitted at Caution', (jobType) => {
        expect(
          TieredJobScheduler.isJobPermitted(UsageTier.CAUTION, jobType, TIER_POLICIES)
        ).toBe(true);
      });

      it.each(deniedAtCaution)('%s is denied at Caution', (jobType) => {
        expect(
          TieredJobScheduler.isJobPermitted(UsageTier.CAUTION, jobType, TIER_POLICIES)
        ).toBe(false);
      });
    });

    describe('Restricted tier (80-95%) allows only 1 job type', () => {
      it('ACTIVE_VIEW is permitted at Restricted', () => {
        expect(
          TieredJobScheduler.isJobPermitted(UsageTier.RESTRICTED, JobType.ACTIVE_VIEW, TIER_POLICIES)
        ).toBe(true);
      });

      const deniedAtRestricted = [
        JobType.ANALYTICS_REFRESH,
        JobType.BACKFILL,
        JobType.POLLING,
        JobType.AUTOMATION_REPLY,
        JobType.SCHEDULED_POST,
        JobType.USER_INITIATED,
      ];

      it.each(deniedAtRestricted)('%s is denied at Restricted', (jobType) => {
        expect(
          TieredJobScheduler.isJobPermitted(UsageTier.RESTRICTED, jobType, TIER_POLICIES)
        ).toBe(false);
      });
    });

    describe('Critical tier (95%+) allows only 1 job type', () => {
      it('SCHEDULED_POST is permitted at Critical (due-now only)', () => {
        expect(
          TieredJobScheduler.isJobPermitted(UsageTier.CRITICAL, JobType.SCHEDULED_POST, TIER_POLICIES)
        ).toBe(true);
      });

      const deniedAtCritical = [
        JobType.ANALYTICS_REFRESH,
        JobType.BACKFILL,
        JobType.POLLING,
        JobType.AUTOMATION_REPLY,
        JobType.USER_INITIATED,
        JobType.ACTIVE_VIEW,
      ];

      it.each(deniedAtCritical)('%s is denied at Critical', (jobType) => {
        expect(
          TieredJobScheduler.isJobPermitted(UsageTier.CRITICAL, jobType, TIER_POLICIES)
        ).toBe(false);
      });
    });
  });

  // =========================================================================
  // Tier Boundary Transitions via canDispatch
  // =========================================================================
  describe('canDispatch — tier boundary transitions', () => {
    it('59% usage → Normal tier → ANALYTICS_REFRESH permitted', async () => {
      const store = createMockUsageStore({
        getEffectiveUsage: vi.fn().mockResolvedValue({
          percentage: 59,
          tier: UsageTier.NORMAL,
          isStale: false,
        }),
      });
      const scheduler = new TieredJobScheduler(store, TEST_CONFIG);
      expect(await scheduler.canDispatch('acc-1', JobType.ANALYTICS_REFRESH)).toBe(true);
    });

    it('60% usage → Caution tier → ANALYTICS_REFRESH denied', async () => {
      const store = createMockUsageStore({
        getEffectiveUsage: vi.fn().mockResolvedValue({
          percentage: 60,
          tier: UsageTier.CAUTION,
          isStale: false,
        }),
      });
      const scheduler = new TieredJobScheduler(store, TEST_CONFIG);
      expect(await scheduler.canDispatch('acc-1', JobType.ANALYTICS_REFRESH)).toBe(false);
    });

    it('60% usage → Caution tier → AUTOMATION_REPLY permitted', async () => {
      const store = createMockUsageStore({
        getEffectiveUsage: vi.fn().mockResolvedValue({
          percentage: 60,
          tier: UsageTier.CAUTION,
          isStale: false,
        }),
      });
      const scheduler = new TieredJobScheduler(store, TEST_CONFIG);
      expect(await scheduler.canDispatch('acc-1', JobType.AUTOMATION_REPLY)).toBe(true);
    });

    it('80% usage → Restricted tier → ACTIVE_VIEW permitted', async () => {
      const store = createMockUsageStore({
        getEffectiveUsage: vi.fn().mockResolvedValue({
          percentage: 80,
          tier: UsageTier.RESTRICTED,
          isStale: false,
        }),
      });
      const scheduler = new TieredJobScheduler(store, TEST_CONFIG);
      expect(await scheduler.canDispatch('acc-1', JobType.ACTIVE_VIEW)).toBe(true);
    });

    it('80% usage → Restricted tier → AUTOMATION_REPLY denied', async () => {
      const store = createMockUsageStore({
        getEffectiveUsage: vi.fn().mockResolvedValue({
          percentage: 80,
          tier: UsageTier.RESTRICTED,
          isStale: false,
        }),
      });
      const scheduler = new TieredJobScheduler(store, TEST_CONFIG);
      expect(await scheduler.canDispatch('acc-1', JobType.AUTOMATION_REPLY)).toBe(false);
    });

    it('95% usage → Critical tier → SCHEDULED_POST permitted', async () => {
      const store = createMockUsageStore({
        getEffectiveUsage: vi.fn().mockResolvedValue({
          percentage: 95,
          tier: UsageTier.CRITICAL,
          isStale: false,
        }),
      });
      const scheduler = new TieredJobScheduler(store, TEST_CONFIG);
      expect(await scheduler.canDispatch('acc-1', JobType.SCHEDULED_POST)).toBe(true);
    });

    it('95% usage → Critical tier → ACTIVE_VIEW denied', async () => {
      const store = createMockUsageStore({
        getEffectiveUsage: vi.fn().mockResolvedValue({
          percentage: 95,
          tier: UsageTier.CRITICAL,
          isStale: false,
        }),
      });
      const scheduler = new TieredJobScheduler(store, TEST_CONFIG);
      expect(await scheduler.canDispatch('acc-1', JobType.ACTIVE_VIEW)).toBe(false);
    });
  });

  // =========================================================================
  // dispatchOrDefer — Deferred Job Retry Counting & Max Retry Alerts
  // =========================================================================
  describe('dispatchOrDefer — deferred jobs & retry alerts', () => {
    it('returns "dispatched" when job is permitted', async () => {
      const store = createMockUsageStore({
        getEffectiveUsage: vi.fn().mockResolvedValue({
          percentage: 30,
          tier: UsageTier.NORMAL,
          isStale: false,
        }),
      });
      const scheduler = new TieredJobScheduler(store, TEST_CONFIG);
      const job = createJob({ type: JobType.ANALYTICS_REFRESH });
      const result = await scheduler.dispatchOrDefer(job);
      expect(result).toBe('dispatched');
    });

    it('returns "deferred" when job is not permitted', async () => {
      const store = createMockUsageStore({
        getEffectiveUsage: vi.fn().mockResolvedValue({
          percentage: 70,
          tier: UsageTier.CAUTION,
          isStale: false,
        }),
      });
      const scheduler = new TieredJobScheduler(store, TEST_CONFIG);
      const job = createJob({ type: JobType.BACKFILL });
      const result = await scheduler.dispatchOrDefer(job);
      expect(result).toBe('deferred');
    });

    it('emits max retries alert when retryCount exceeds maxDeferredRetries (Req 4.7)', async () => {
      const { logger } = await import('../../config/logger');
      const store = createMockUsageStore({
        getEffectiveUsage: vi.fn().mockResolvedValue({
          percentage: 85,
          tier: UsageTier.RESTRICTED,
          isStale: false,
        }),
      });
      const scheduler = new TieredJobScheduler(store, TEST_CONFIG);

      // Job with retryCount already at max (10) — next defer will exceed
      const job = createJob({
        type: JobType.BACKFILL,
        retryCount: 10, // config.maxDeferredRetries = 10
      });

      await scheduler.dispatchOrDefer(job);

      // Should have emitted alert via logger.error
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('ALERT: Deferred job exceeded max retries'),
        expect.objectContaining({
          alert: 'DEFERRED_JOB_MAX_RETRIES',
          accountId: 'acc-1',
          jobType: JobType.BACKFILL,
        })
      );
    });

    it('emits 24-hour stuck job alert when deferredAt > 24h ago (Req 11.4)', async () => {
      const { logger } = await import('../../config/logger');
      const store = createMockUsageStore({
        getEffectiveUsage: vi.fn().mockResolvedValue({
          percentage: 85,
          tier: UsageTier.RESTRICTED,
          isStale: false,
        }),
      });
      const scheduler = new TieredJobScheduler(store, TEST_CONFIG);

      // Job that was first deferred 25 hours ago
      const twentyFiveHoursAgo = Date.now() - (25 * 60 * 60 * 1000);
      const job = createJob({
        type: JobType.ANALYTICS_REFRESH,
        retryCount: 3, // Below max (10), so it will be enqueued
        deferredAt: twentyFiveHoursAgo,
      });

      await scheduler.dispatchOrDefer(job);

      // Should have emitted stuck job alert via logger.error
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('ALERT: Deferred job stuck without execution'),
        expect.objectContaining({
          alert: 'DEFERRED_JOB_STUCK',
          accountId: 'acc-1',
          jobType: JobType.ANALYTICS_REFRESH,
          thresholdHours: 24,
        })
      );
    });

    it('does NOT emit 24-hour alert when deferredAt < 24h ago', async () => {
      const { logger } = await import('../../config/logger');
      const store = createMockUsageStore({
        getEffectiveUsage: vi.fn().mockResolvedValue({
          percentage: 85,
          tier: UsageTier.RESTRICTED,
          isStale: false,
        }),
      });
      const scheduler = new TieredJobScheduler(store, TEST_CONFIG);

      // Job deferred 12 hours ago — below threshold
      const twelveHoursAgo = Date.now() - (12 * 60 * 60 * 1000);
      const job = createJob({
        type: JobType.ANALYTICS_REFRESH,
        retryCount: 2,
        deferredAt: twelveHoursAgo,
      });

      await scheduler.dispatchOrDefer(job);

      // Should NOT have emitted DEFERRED_JOB_STUCK alert
      expect(logger.error).not.toHaveBeenCalledWith(
        expect.stringContaining('ALERT: Deferred job stuck'),
        expect.anything()
      );
    });
  });

  // =========================================================================
  // reEvaluateDeferredJobs — Priority Ordering on Re-dispatch
  // =========================================================================
  describe('reEvaluateDeferredJobs — priority ordering', () => {
    it('returns 0 when no deferred queue is available', async () => {
      // Temporarily remove REDIS_URL to prevent queue init
      delete process.env.REDIS_URL;
      const store = createMockUsageStore({
        getEffectiveUsage: vi.fn().mockResolvedValue({
          percentage: 40,
          tier: UsageTier.NORMAL,
          isStale: false,
        }),
      });
      const scheduler = new TieredJobScheduler(store, TEST_CONFIG);
      const count = await scheduler.reEvaluateDeferredJobs('acc-1');
      expect(count).toBe(0);
      // Restore for other tests
      process.env.REDIS_URL = 'redis://localhost:6379';
    });

    it('returns 0 when usage is >= restricted threshold (80%)', async () => {
      const store = createMockUsageStore({
        getEffectiveUsage: vi.fn().mockResolvedValue({
          percentage: 82,
          tier: UsageTier.RESTRICTED,
          isStale: false,
        }),
      });

      const scheduler = new TieredJobScheduler(store, TEST_CONFIG);
      const count = await scheduler.reEvaluateDeferredJobs('acc-1');
      expect(count).toBe(0);
    });

    it('dispatches deferred jobs sorted by priority then FIFO when usage drops below 80%', async () => {
      const store = createMockUsageStore({
        getEffectiveUsage: vi.fn().mockResolvedValue({
          percentage: 50,
          tier: UsageTier.NORMAL,
          isStale: false,
        }),
      });

      // Create mock jobs with different priorities and timestamps
      const now = Date.now();
      const mockJobs = [
        {
          data: {
            accountId: 'acc-1',
            jobType: JobType.BACKFILL,
            priority: 10,
            deferredAt: now - 5000,
            originalJobId: 'job-3',
            retryCount: 1,
            maxRetries: 10,
            payload: {},
            originalScheduledAt: now - 60000,
          },
          remove: vi.fn().mockResolvedValue(undefined),
        },
        {
          data: {
            accountId: 'acc-1',
            jobType: JobType.ANALYTICS_REFRESH,
            priority: 5,
            deferredAt: now - 10000,
            originalJobId: 'job-1',
            retryCount: 2,
            maxRetries: 10,
            payload: {},
            originalScheduledAt: now - 120000,
          },
          remove: vi.fn().mockResolvedValue(undefined),
        },
        {
          data: {
            accountId: 'acc-1',
            jobType: JobType.POLLING,
            priority: 5,
            deferredAt: now - 3000,
            originalJobId: 'job-2',
            retryCount: 1,
            maxRetries: 10,
            payload: {},
            originalScheduledAt: now - 90000,
          },
          remove: vi.fn().mockResolvedValue(undefined),
        },
      ];

      const scheduler = new TieredJobScheduler(store, TEST_CONFIG);

      // Manually inject a mock queue with getJobs returning our test jobs
      const mockQueue = {
        getJobs: vi.fn().mockResolvedValue(mockJobs),
        add: vi.fn().mockResolvedValue({}),
        on: vi.fn(),
      };
      (scheduler as any).deferredQueue = mockQueue;

      const count = await scheduler.reEvaluateDeferredJobs('acc-1');

      // All 3 jobs should be dispatched (account is at Normal tier, all permitted)
      expect(count).toBe(3);
      expect(mockQueue.getJobs).toHaveBeenCalledWith(['waiting', 'delayed']);
      // All remove calls should have been made
      for (const job of mockJobs) {
        expect(job.remove).toHaveBeenCalled();
      }
    });

    it('re-enqueues the stored fetch payload before removing the deferred entry', async () => {
      const store = createMockUsageStore({
        getEffectiveUsage: vi.fn().mockResolvedValue({
          percentage: 30,
          tier: UsageTier.NORMAL,
          isStale: false,
        }),
      });

      const now = Date.now();
      const job = {
        data: {
          accountId: 'acc-1',
          jobType: JobType.ANALYTICS_REFRESH,
          priority: 5,
          deferredAt: now - 1000,
          originalJobId: 'job-x',
          retryCount: 1,
          maxRetries: 10,
          payload: { workspaceId: 'ws-1', instagramAccountId: 'acc-1', metricsType: 'likes' },
          originalScheduledAt: now - 60000,
        },
        remove: vi.fn().mockResolvedValue(undefined),
      };

      const scheduler = new TieredJobScheduler(store, TEST_CONFIG);
      (scheduler as any).deferredQueue = {
        getJobs: vi.fn().mockResolvedValue([job]),
        add: vi.fn().mockResolvedValue({}),
        on: vi.fn(),
      };

      const reEnqueue = vi.fn().mockResolvedValue(undefined);
      scheduler.setReEnqueueDeferred(reEnqueue);

      const count = await scheduler.reEvaluateDeferredJobs('acc-1');

      expect(count).toBe(1);
      // The stored payload is re-enqueued as real work...
      expect(reEnqueue).toHaveBeenCalledWith(job.data);
      // ...and only then is the deferred entry removed.
      expect(job.remove).toHaveBeenCalled();
    });

    it('reEvaluateAllDeferredJobs sweeps every distinct account', async () => {
      const store = createMockUsageStore({
        getEffectiveUsage: vi.fn().mockResolvedValue({
          percentage: 20,
          tier: UsageTier.NORMAL,
          isStale: false,
        }),
      });

      const now = Date.now();
      const mk = (accountId: string, id: string) => ({
        data: {
          accountId,
          jobType: JobType.POLLING,
          priority: 5,
          deferredAt: now - 1000,
          originalJobId: id,
          retryCount: 1,
          maxRetries: 10,
          payload: { instagramAccountId: accountId, metricsType: 'reach' },
          originalScheduledAt: now - 60000,
        },
        remove: vi.fn().mockResolvedValue(undefined),
      });
      const jobs = [mk('acc-1', 'a'), mk('acc-2', 'b'), mk('acc-1', 'c')];

      const scheduler = new TieredJobScheduler(store, TEST_CONFIG);
      (scheduler as any).deferredQueue = {
        getJobs: vi.fn().mockResolvedValue(jobs),
        add: vi.fn().mockResolvedValue({}),
        on: vi.fn(),
      };

      const total = await scheduler.reEvaluateAllDeferredJobs();

      // 3 deferred jobs across 2 accounts → all re-dispatched.
      expect(total).toBe(3);
    });
  });

  // =========================================================================
  // computePollingCadence — returns correct intervals per classification
  // =========================================================================
  describe('computePollingCadence — HIGH vs LOW ceiling', () => {
    it('returns high-ceiling config for HIGH classification', () => {
      const cadence = TieredJobScheduler.computePollingCadence(
        CeilingClassification.HIGH,
        TEST_CONFIG
      );
      expect(cadence.accountInsightsMs).toBe(60 * 60 * 1000); // 60 min
      expect(cadence.postInsightsRecentMs).toBe(3 * 60 * 60 * 1000); // 3h
      expect(cadence.newPostDetectionMs).toBe(2 * 60 * 60 * 1000); // 2h
      expect(cadence.followerCountMs).toBe(60 * 60 * 1000); // 1h
      expect(cadence.postInsightsOlderMs).toBe(24 * 60 * 60 * 1000); // 24h
    });

    it('returns low-ceiling config for LOW classification', () => {
      const cadence = TieredJobScheduler.computePollingCadence(
        CeilingClassification.LOW,
        TEST_CONFIG
      );
      expect(cadence.accountInsightsMs).toBe(4 * 60 * 60 * 1000); // 4h
      expect(cadence.postInsightsRecentMs).toBe(5 * 60 * 60 * 1000); // 5h
      expect(cadence.newPostDetectionMs).toBe(3 * 60 * 60 * 1000); // 3h
      expect(cadence.followerCountMs).toBe(5 * 60 * 60 * 1000); // 5h
      expect(cadence.postInsightsOlderMs).toBe(24 * 60 * 60 * 1000); // 24h
    });

    it('high-ceiling intervals are shorter than low-ceiling intervals', () => {
      const high = TieredJobScheduler.computePollingCadence(CeilingClassification.HIGH, TEST_CONFIG);
      const low = TieredJobScheduler.computePollingCadence(CeilingClassification.LOW, TEST_CONFIG);

      expect(high.accountInsightsMs).toBeLessThan(low.accountInsightsMs);
      expect(high.postInsightsRecentMs).toBeLessThan(low.postInsightsRecentMs);
      expect(high.newPostDetectionMs).toBeLessThan(low.newPostDetectionMs);
      expect(high.followerCountMs).toBeLessThan(low.followerCountMs);
    });

    it('returns a copy — mutations do not affect config', () => {
      const cadence = TieredJobScheduler.computePollingCadence(CeilingClassification.HIGH, TEST_CONFIG);
      cadence.accountInsightsMs = 999;
      const cadence2 = TieredJobScheduler.computePollingCadence(CeilingClassification.HIGH, TEST_CONFIG);
      expect(cadence2.accountInsightsMs).toBe(60 * 60 * 1000); // unaffected
    });
  });

  // =========================================================================
  // isWebhookOnlyDataType — webhook-only check
  // =========================================================================
  describe('isWebhookOnlyDataType — webhook-only enforcement', () => {
    it.each(WEBHOOK_ONLY_DATA_TYPES)('"%s" is identified as webhook-only', (dataType) => {
      expect(TieredJobScheduler.isWebhookOnlyDataType(dataType)).toBe(true);
    });

    it('"analytics" is NOT webhook-only', () => {
      expect(TieredJobScheduler.isWebhookOnlyDataType('analytics')).toBe(false);
    });

    it('"post_insights" is NOT webhook-only', () => {
      expect(TieredJobScheduler.isWebhookOnlyDataType('post_insights')).toBe(false);
    });

    it('"followers" is NOT webhook-only', () => {
      expect(TieredJobScheduler.isWebhookOnlyDataType('followers')).toBe(false);
    });

    it('empty string is NOT webhook-only', () => {
      expect(TieredJobScheduler.isWebhookOnlyDataType('')).toBe(false);
    });
  });

  // =========================================================================
  // getPollingCadence — integration with UsageStore ceiling classification
  // =========================================================================
  describe('getPollingCadence — delegates to store + computePollingCadence', () => {
    it('returns high-ceiling cadence when store classifies as HIGH', async () => {
      const store = createMockUsageStore({
        getCeilingClassification: vi.fn().mockResolvedValue(CeilingClassification.HIGH),
      });
      const scheduler = new TieredJobScheduler(store, TEST_CONFIG);
      const cadence = await scheduler.getPollingCadence('acc-high');
      expect(cadence.accountInsightsMs).toBe(60 * 60 * 1000);
      expect(store.getCeilingClassification).toHaveBeenCalledWith('acc-high');
    });

    it('returns low-ceiling cadence when store classifies as LOW', async () => {
      const store = createMockUsageStore({
        getCeilingClassification: vi.fn().mockResolvedValue(CeilingClassification.LOW),
      });
      const scheduler = new TieredJobScheduler(store, TEST_CONFIG);
      const cadence = await scheduler.getPollingCadence('acc-low');
      expect(cadence.accountInsightsMs).toBe(4 * 60 * 60 * 1000);
      expect(store.getCeilingClassification).toHaveBeenCalledWith('acc-low');
    });
  });

  // =========================================================================
  // getDeferredJobCount
  // =========================================================================
  describe('getDeferredJobCount', () => {
    it('returns 0 when deferred queue is null', async () => {
      // Remove REDIS_URL to prevent queue init
      delete process.env.REDIS_URL;
      const store = createMockUsageStore();
      const scheduler = new TieredJobScheduler(store, TEST_CONFIG);
      const count = await scheduler.getDeferredJobCount('acc-1');
      expect(count).toBe(0);
      process.env.REDIS_URL = 'redis://localhost:6379';
    });
  });
});
