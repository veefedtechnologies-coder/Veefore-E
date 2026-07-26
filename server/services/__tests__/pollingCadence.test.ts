/**
 * Unit Tests for Polling Cadence Logic
 *
 * Tests impression-scaled polling cadence behavior:
 * - High-ceiling accounts get shorter polling intervals
 * - Low-ceiling accounts get longer polling intervals
 * - Config updates are adopted without restart
 * - Webhook-only data types are never polled
 *
 * Requirements validated: 5.1, 5.2, 5.7, 5.8
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  TieredJobScheduler,
  WEBHOOK_ONLY_DATA_TYPES,
} from '../TieredJobScheduler';
import { UsageStore, CeilingClassification } from '../UsageStore';
import { type RateLimitConfig, type PollingCadence } from '../../config/rateLimitConfig';

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

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({}),
    getJobs: vi.fn().mockResolvedValue([]),
    on: vi.fn(),
  })),
}));

// ---------------------------------------------------------------------------
// Test Config
// ---------------------------------------------------------------------------

function createTestConfig(overrides?: Partial<RateLimitConfig>): RateLimitConfig {
  return {
    bucMultiplier: 4800,
    platformRateLimitMultiplier: 200,
    publishLimitPerDay: 25,
    messagingCeilingPerHour: 250,
    tierThresholds: { caution: 60, restricted: 80, critical: 95 },
    polling: {
      highCeiling: {
        accountInsightsMs: 60 * 60 * 1000,          // 60 minutes
        postInsightsRecentMs: 3 * 60 * 60 * 1000,   // 3 hours
        postInsightsOlderMs: 24 * 60 * 60 * 1000,   // 24 hours
        newPostDetectionMs: 2 * 60 * 60 * 1000,     // 2 hours
        followerCountMs: 60 * 60 * 1000,            // 1 hour
      },
      lowCeiling: {
        accountInsightsMs: 4 * 60 * 60 * 1000,      // 4 hours
        postInsightsRecentMs: 5 * 60 * 60 * 1000,   // 5 hours
        postInsightsOlderMs: 24 * 60 * 60 * 1000,   // 24 hours
        newPostDetectionMs: 3 * 60 * 60 * 1000,     // 3 hours
        followerCountMs: 5 * 60 * 60 * 1000,        // 5 hours
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
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockUsageStore(classification: CeilingClassification): UsageStore {
  return {
    getEffectiveUsage: vi.fn().mockResolvedValue({
      percentage: 30,
      tier: 'NORMAL',
      isStale: false,
    }),
    getCeilingClassification: vi.fn().mockResolvedValue(classification),
    getTier: vi.fn().mockResolvedValue('NORMAL'),
  } as unknown as UsageStore;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Polling Cadence — Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.REDIS_URL = 'redis://localhost:6379';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Requirement 5.1: High-ceiling accounts get shorter intervals
  // =========================================================================
  describe('high-ceiling account gets shorter intervals (Req 5.1)', () => {
    it('account insights refreshes every ~60 minutes', () => {
      const config = createTestConfig();
      const cadence = TieredJobScheduler.computePollingCadence(
        CeilingClassification.HIGH,
        config
      );
      expect(cadence.accountInsightsMs).toBe(60 * 60 * 1000); // 60 min
    });

    it('recent post insights refreshes every 2-4 hours', () => {
      const config = createTestConfig();
      const cadence = TieredJobScheduler.computePollingCadence(
        CeilingClassification.HIGH,
        config
      );
      const twoHours = 2 * 60 * 60 * 1000;
      const fourHours = 4 * 60 * 60 * 1000;
      expect(cadence.postInsightsRecentMs).toBeGreaterThanOrEqual(twoHours);
      expect(cadence.postInsightsRecentMs).toBeLessThanOrEqual(fourHours);
    });

    it('new post detection polls every 1-4 hours', () => {
      const config = createTestConfig();
      const cadence = TieredJobScheduler.computePollingCadence(
        CeilingClassification.HIGH,
        config
      );
      const oneHour = 60 * 60 * 1000;
      const fourHours = 4 * 60 * 60 * 1000;
      expect(cadence.newPostDetectionMs).toBeGreaterThanOrEqual(oneHour);
      expect(cadence.newPostDetectionMs).toBeLessThanOrEqual(fourHours);
    });

    it('follower count polls hourly', () => {
      const config = createTestConfig();
      const cadence = TieredJobScheduler.computePollingCadence(
        CeilingClassification.HIGH,
        config
      );
      expect(cadence.followerCountMs).toBe(60 * 60 * 1000); // 1 hour
    });

    it('older post insights poll at most once daily', () => {
      const config = createTestConfig();
      const cadence = TieredJobScheduler.computePollingCadence(
        CeilingClassification.HIGH,
        config
      );
      expect(cadence.postInsightsOlderMs).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000);
    });

    it('getPollingCadence returns high-ceiling cadence for high-ceiling account', async () => {
      const store = createMockUsageStore(CeilingClassification.HIGH);
      const config = createTestConfig();
      const scheduler = new TieredJobScheduler(store, config);

      const cadence = await scheduler.getPollingCadence('acc-high-ceiling');

      expect(cadence.accountInsightsMs).toBe(60 * 60 * 1000);
      expect(cadence.followerCountMs).toBe(60 * 60 * 1000);
      expect(store.getCeilingClassification).toHaveBeenCalledWith('acc-high-ceiling');
    });
  });

  // =========================================================================
  // Requirement 5.2: Low-ceiling accounts get longer intervals
  // =========================================================================
  describe('low-ceiling account gets longer intervals (Req 5.2)', () => {
    it('account insights refreshes every 3-6 hours', () => {
      const config = createTestConfig();
      const cadence = TieredJobScheduler.computePollingCadence(
        CeilingClassification.LOW,
        config
      );
      const threeHours = 3 * 60 * 60 * 1000;
      const sixHours = 6 * 60 * 60 * 1000;
      expect(cadence.accountInsightsMs).toBeGreaterThanOrEqual(threeHours);
      expect(cadence.accountInsightsMs).toBeLessThanOrEqual(sixHours);
    });

    it('recent post insights refreshes every 4-6 hours', () => {
      const config = createTestConfig();
      const cadence = TieredJobScheduler.computePollingCadence(
        CeilingClassification.LOW,
        config
      );
      const fourHours = 4 * 60 * 60 * 1000;
      const sixHours = 6 * 60 * 60 * 1000;
      expect(cadence.postInsightsRecentMs).toBeGreaterThanOrEqual(fourHours);
      expect(cadence.postInsightsRecentMs).toBeLessThanOrEqual(sixHours);
    });

    it('new post detection polls every 1-4 hours (longer end)', () => {
      const config = createTestConfig();
      const cadence = TieredJobScheduler.computePollingCadence(
        CeilingClassification.LOW,
        config
      );
      const oneHour = 60 * 60 * 1000;
      const fourHours = 4 * 60 * 60 * 1000;
      expect(cadence.newPostDetectionMs).toBeGreaterThanOrEqual(oneHour);
      expect(cadence.newPostDetectionMs).toBeLessThanOrEqual(fourHours);
    });

    it('follower count polls every 4-6 hours', () => {
      const config = createTestConfig();
      const cadence = TieredJobScheduler.computePollingCadence(
        CeilingClassification.LOW,
        config
      );
      const fourHours = 4 * 60 * 60 * 1000;
      const sixHours = 6 * 60 * 60 * 1000;
      expect(cadence.followerCountMs).toBeGreaterThanOrEqual(fourHours);
      expect(cadence.followerCountMs).toBeLessThanOrEqual(sixHours);
    });

    it('older post insights poll at most once daily', () => {
      const config = createTestConfig();
      const cadence = TieredJobScheduler.computePollingCadence(
        CeilingClassification.LOW,
        config
      );
      expect(cadence.postInsightsOlderMs).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000);
    });

    it('low-ceiling intervals are strictly longer than high-ceiling for non-daily metrics', () => {
      const config = createTestConfig();
      const high = TieredJobScheduler.computePollingCadence(CeilingClassification.HIGH, config);
      const low = TieredJobScheduler.computePollingCadence(CeilingClassification.LOW, config);

      expect(low.accountInsightsMs).toBeGreaterThan(high.accountInsightsMs);
      expect(low.postInsightsRecentMs).toBeGreaterThan(high.postInsightsRecentMs);
      expect(low.newPostDetectionMs).toBeGreaterThan(high.newPostDetectionMs);
      expect(low.followerCountMs).toBeGreaterThan(high.followerCountMs);
    });

    it('getPollingCadence returns low-ceiling cadence for low-ceiling account', async () => {
      const store = createMockUsageStore(CeilingClassification.LOW);
      const config = createTestConfig();
      const scheduler = new TieredJobScheduler(store, config);

      const cadence = await scheduler.getPollingCadence('acc-low-ceiling');

      expect(cadence.accountInsightsMs).toBe(4 * 60 * 60 * 1000);
      expect(cadence.followerCountMs).toBe(5 * 60 * 60 * 1000);
      expect(store.getCeilingClassification).toHaveBeenCalledWith('acc-low-ceiling');
    });
  });

  // =========================================================================
  // Requirement 5.7: Config update adoption without restart
  // =========================================================================
  describe('config update adoption without restart (Req 5.7)', () => {
    it('computePollingCadence reads from provided config on each call', () => {
      // First call with default config
      const config1 = createTestConfig();
      const cadence1 = TieredJobScheduler.computePollingCadence(
        CeilingClassification.HIGH,
        config1
      );
      expect(cadence1.accountInsightsMs).toBe(60 * 60 * 1000); // 60 min

      // Second call with updated config (simulating runtime config change)
      const config2 = createTestConfig({
        polling: {
          highCeiling: {
            accountInsightsMs: 30 * 60 * 1000,        // Changed to 30 min
            postInsightsRecentMs: 2 * 60 * 60 * 1000, // Changed to 2h
            postInsightsOlderMs: 24 * 60 * 60 * 1000,
            newPostDetectionMs: 60 * 60 * 1000,       // Changed to 1h
            followerCountMs: 30 * 60 * 1000,          // Changed to 30 min
          },
          lowCeiling: {
            accountInsightsMs: 6 * 60 * 60 * 1000,
            postInsightsRecentMs: 6 * 60 * 60 * 1000,
            postInsightsOlderMs: 24 * 60 * 60 * 1000,
            newPostDetectionMs: 4 * 60 * 60 * 1000,
            followerCountMs: 6 * 60 * 60 * 1000,
          },
        },
      });
      const cadence2 = TieredJobScheduler.computePollingCadence(
        CeilingClassification.HIGH,
        config2
      );
      expect(cadence2.accountInsightsMs).toBe(30 * 60 * 1000); // Now 30 min
      expect(cadence2.postInsightsRecentMs).toBe(2 * 60 * 60 * 1000);
      expect(cadence2.newPostDetectionMs).toBe(60 * 60 * 1000);
      expect(cadence2.followerCountMs).toBe(30 * 60 * 1000);
    });

    it('getPollingCadence adopts new config values within one call cycle', async () => {
      const store = createMockUsageStore(CeilingClassification.HIGH);

      // Create scheduler with a mutable config object (simulates config module update)
      const mutableConfig = createTestConfig();
      const scheduler = new TieredJobScheduler(store, mutableConfig);

      // First call — uses original values
      const cadence1 = await scheduler.getPollingCadence('acc-1');
      expect(cadence1.accountInsightsMs).toBe(60 * 60 * 1000);

      // Mutate the config (simulating a runtime config update)
      mutableConfig.polling.highCeiling.accountInsightsMs = 45 * 60 * 1000; // 45 min

      // Second call — should pick up the new value immediately
      const cadence2 = await scheduler.getPollingCadence('acc-1');
      expect(cadence2.accountInsightsMs).toBe(45 * 60 * 1000);
    });

    it('low-ceiling config updates are also adopted immediately', async () => {
      const store = createMockUsageStore(CeilingClassification.LOW);
      const mutableConfig = createTestConfig();
      const scheduler = new TieredJobScheduler(store, mutableConfig);

      const cadence1 = await scheduler.getPollingCadence('acc-1');
      expect(cadence1.followerCountMs).toBe(5 * 60 * 60 * 1000); // 5h

      // Update low-ceiling follower interval
      mutableConfig.polling.lowCeiling.followerCountMs = 3 * 60 * 60 * 1000; // 3h

      const cadence2 = await scheduler.getPollingCadence('acc-1');
      expect(cadence2.followerCountMs).toBe(3 * 60 * 60 * 1000); // Now 3h
    });
  });

  // =========================================================================
  // Requirement 5.8: No-poll enforcement for webhook-only data types
  // =========================================================================
  describe('no-poll enforcement for webhook-only data types (Req 5.8)', () => {
    it('comments are webhook-only — must not be polled', () => {
      expect(TieredJobScheduler.isWebhookOnlyDataType('comments')).toBe(true);
    });

    it('mentions are webhook-only — must not be polled', () => {
      expect(TieredJobScheduler.isWebhookOnlyDataType('mentions')).toBe(true);
    });

    it('story_expiry is webhook-only — must not be polled', () => {
      expect(TieredJobScheduler.isWebhookOnlyDataType('story_expiry')).toBe(true);
    });

    it('story_insights is webhook-only — must not be polled', () => {
      expect(TieredJobScheduler.isWebhookOnlyDataType('story_insights')).toBe(true);
    });

    it('direct_messages is webhook-only — must not be polled', () => {
      expect(TieredJobScheduler.isWebhookOnlyDataType('direct_messages')).toBe(true);
    });

    it('WEBHOOK_ONLY_DATA_TYPES constant includes all expected types', () => {
      expect(WEBHOOK_ONLY_DATA_TYPES).toContain('comments');
      expect(WEBHOOK_ONLY_DATA_TYPES).toContain('mentions');
      expect(WEBHOOK_ONLY_DATA_TYPES).toContain('story_expiry');
      expect(WEBHOOK_ONLY_DATA_TYPES).toContain('story_insights');
      expect(WEBHOOK_ONLY_DATA_TYPES).toContain('direct_messages');
      expect(WEBHOOK_ONLY_DATA_TYPES).toHaveLength(5);
    });

    it('pollable data types are NOT webhook-only', () => {
      const pollableTypes = [
        'account_insights',
        'post_insights',
        'followers',
        'media',
        'profile',
        'analytics',
        'new_posts',
      ];

      for (const dataType of pollableTypes) {
        expect(TieredJobScheduler.isWebhookOnlyDataType(dataType)).toBe(false);
      }
    });

    it('empty string is not webhook-only', () => {
      expect(TieredJobScheduler.isWebhookOnlyDataType('')).toBe(false);
    });

    it('similar but incorrect strings are not webhook-only', () => {
      expect(TieredJobScheduler.isWebhookOnlyDataType('comment')).toBe(false);
      expect(TieredJobScheduler.isWebhookOnlyDataType('mention')).toBe(false);
      expect(TieredJobScheduler.isWebhookOnlyDataType('COMMENTS')).toBe(false);
      expect(TieredJobScheduler.isWebhookOnlyDataType('direct_message')).toBe(false);
    });

    it('polling cadence does not contain fields for webhook-only data types', () => {
      const config = createTestConfig();
      const cadence = TieredJobScheduler.computePollingCadence(
        CeilingClassification.HIGH,
        config
      );

      // The PollingCadence interface only contains pollable data type intervals.
      // There should be no fields for comments, mentions, story_expiry, etc.
      const cadenceKeys = Object.keys(cadence);
      expect(cadenceKeys).not.toContain('commentsMs');
      expect(cadenceKeys).not.toContain('mentionsMs');
      expect(cadenceKeys).not.toContain('storyExpiryMs');
      expect(cadenceKeys).not.toContain('directMessagesMs');

      // Only contains legitimate polling fields
      expect(cadenceKeys).toEqual(
        expect.arrayContaining([
          'accountInsightsMs',
          'postInsightsRecentMs',
          'postInsightsOlderMs',
          'newPostDetectionMs',
          'followerCountMs',
        ])
      );
    });
  });
});
