/**
 * Tests for dual-criteria (App-Level AU + Account-Level BUC) gating.
 *
 * Verifies that TieredJobScheduler.canDispatch uses the MORE RESTRICTIVE of:
 *   - Account-level (BUC) tier
 *   - App-level (AU) tier
 *
 * This matters for new/small apps where the App-Level limit (200×users/hour)
 * is hit before the per-account BUC limit (4800×impressions/24h).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TieredJobScheduler, JobType } from '../TieredJobScheduler';
import { UsageStore, UsageTier } from '../UsageStore';
import { type RateLimitConfig, rateLimitConfig } from '../../config/rateLimitConfig';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../realtime', () => ({
  RealtimeService: { broadcastToWorkspace: vi.fn() },
}));

vi.mock('../../config/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../lib/redis', () => ({
  getSharedRedisConnection: vi.fn(() => ({ status: 'ready' })),
}));

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({}),
    getJobs: vi.fn().mockResolvedValue([]),
    on: vi.fn(),
  })),
}));

const TEST_CONFIG: RateLimitConfig = {
  bucMultiplier: 4800,
  platformRateLimitMultiplier: 200,
  publishLimitPerDay: 25,
  messagingCeilingPerHour: 250,
  tierThresholds: { caution: 60, restricted: 80, critical: 95 },
  polling: {
    highCeiling: { accountInsightsMs: 3600000, postInsightsRecentMs: 10800000, postInsightsOlderMs: 86400000, newPostDetectionMs: 7200000, followerCountMs: 3600000 },
    lowCeiling: { accountInsightsMs: 14400000, postInsightsRecentMs: 18000000, postInsightsOlderMs: 86400000, newPostDetectionMs: 10800000, followerCountMs: 18000000 },
  },
  highCeilingImpressionThreshold: 1000,
  queue: { webhookConcurrencyPerAccount: 3, maxDeferredRetries: 10, deferredAlertThresholdHours: 24, queueDepthAlertThreshold: 500 },
  usageRecordTtlSeconds: 7200,
  stalenessThresholdMs: 300000,
  initialFetchCount: 25,
  initialFetchCountLowCeiling: 20,
  httpTimeoutMs: 10000,
  maxRetries: 3,
  deduplicationWindowMs: 2000,
  errorMessageMap: { default: 'err' },
  smartPolling: rateLimitConfig.smartPolling,
};

/**
 * Build a mock UsageStore with controllable account-level and app-level tiers.
 */
function mockStore(accountTier: UsageTier, appTier: UsageTier, accountPct = 0, appPct = 0): UsageStore {
  return {
    getEffectiveUsage: vi.fn().mockResolvedValue({
      percentage: accountPct,
      tier: accountTier,
      isStale: false,
    }),
    getAppUsage: vi.fn().mockResolvedValue({
      callCountPct: appPct,
      totalCputimePct: appPct,
      totalTimePct: appPct,
      percentage: appPct,
      tier: appTier,
      lastUpdatedAt: Date.now(),
    }),
    getCeilingClassification: vi.fn().mockResolvedValue('LOW'),
    getTier: vi.fn().mockResolvedValue(accountTier),
  } as unknown as UsageStore;
}

describe('Dual-criteria gating (AU + BUC)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.REDIS_URL = 'redis://localhost:6379';
  });

  describe('mostRestrictiveTier (pure function)', () => {
    it('returns the worse tier', () => {
      expect(TieredJobScheduler.mostRestrictiveTier(UsageTier.NORMAL, UsageTier.CAUTION)).toBe(UsageTier.CAUTION);
      expect(TieredJobScheduler.mostRestrictiveTier(UsageTier.RESTRICTED, UsageTier.NORMAL)).toBe(UsageTier.RESTRICTED);
      expect(TieredJobScheduler.mostRestrictiveTier(UsageTier.CRITICAL, UsageTier.CAUTION)).toBe(UsageTier.CRITICAL);
      expect(TieredJobScheduler.mostRestrictiveTier(UsageTier.NORMAL, UsageTier.NORMAL)).toBe(UsageTier.NORMAL);
    });
  });

  describe('canDispatch combines both systems', () => {
    it('THE KEY CASE: account NORMAL but app CAUTION → analytics denied', async () => {
      // New-app scenario: per-account BUC is fine, but app-wide AU is at Caution.
      const store = mockStore(UsageTier.NORMAL, UsageTier.CAUTION, 5, 65);
      const scheduler = new TieredJobScheduler(store, TEST_CONFIG);

      // ANALYTICS_REFRESH is allowed at NORMAL but NOT at CAUTION.
      // Because app is CAUTION, the effective tier is CAUTION → denied.
      const result = await scheduler.canDispatch('acc-1', JobType.ANALYTICS_REFRESH);
      expect(result).toBe(false);
    });

    it('account NORMAL and app NORMAL → analytics allowed', async () => {
      const store = mockStore(UsageTier.NORMAL, UsageTier.NORMAL, 5, 10);
      const scheduler = new TieredJobScheduler(store, TEST_CONFIG);
      expect(await scheduler.canDispatch('acc-1', JobType.ANALYTICS_REFRESH)).toBe(true);
    });

    it('account CRITICAL but app NORMAL → still gated by account (account wins)', async () => {
      const store = mockStore(UsageTier.CRITICAL, UsageTier.NORMAL, 97, 5);
      const scheduler = new TieredJobScheduler(store, TEST_CONFIG);
      // Critical only permits SCHEDULED_POST
      expect(await scheduler.canDispatch('acc-1', JobType.ANALYTICS_REFRESH)).toBe(false);
      expect(await scheduler.canDispatch('acc-1', JobType.SCHEDULED_POST)).toBe(true);
    });

    it('app CRITICAL forces everything except due scheduled posts, even if account NORMAL', async () => {
      const store = mockStore(UsageTier.NORMAL, UsageTier.CRITICAL, 5, 98);
      const scheduler = new TieredJobScheduler(store, TEST_CONFIG);
      expect(await scheduler.canDispatch('acc-1', JobType.ANALYTICS_REFRESH)).toBe(false);
      expect(await scheduler.canDispatch('acc-1', JobType.AUTOMATION_REPLY)).toBe(false);
      expect(await scheduler.canDispatch('acc-1', JobType.ACTIVE_VIEW)).toBe(false);
      expect(await scheduler.canDispatch('acc-1', JobType.SCHEDULED_POST)).toBe(true);
    });

    it('app CAUTION still allows automation/posts/user-initiated/active-view', async () => {
      const store = mockStore(UsageTier.NORMAL, UsageTier.CAUTION, 5, 70);
      const scheduler = new TieredJobScheduler(store, TEST_CONFIG);
      expect(await scheduler.canDispatch('acc-1', JobType.AUTOMATION_REPLY)).toBe(true);
      expect(await scheduler.canDispatch('acc-1', JobType.SCHEDULED_POST)).toBe(true);
      expect(await scheduler.canDispatch('acc-1', JobType.USER_INITIATED)).toBe(true);
      expect(await scheduler.canDispatch('acc-1', JobType.ACTIVE_VIEW)).toBe(true);
      // But backfill/polling/analytics are deferred
      expect(await scheduler.canDispatch('acc-1', JobType.BACKFILL)).toBe(false);
      expect(await scheduler.canDispatch('acc-1', JobType.POLLING)).toBe(false);
    });
  });
});
