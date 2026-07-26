/**
 * Unit Tests for Impressions Estimate
 *
 * Tests ceiling classification updates when impressions cross threshold,
 * null/new account defaults, and integration with scheduler polling cadence.
 *
 * Requirements validated: 3.2, 3.3, 3.4
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  UsageStore,
  CeilingClassification,
  type UsageStoreConfig,
} from '../UsageStore';
import { TieredJobScheduler } from '../TieredJobScheduler';
import { rateLimitConfig } from '../../config/rateLimitConfig';

// ---------------------------------------------------------------------------
// Mock dependencies
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

// Mock BullMQ to prevent Redis connection attempts in TieredJobScheduler
vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    getJobs: vi.fn().mockResolvedValue([]),
    on: vi.fn(),
  })),
  Worker: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Test Config
// ---------------------------------------------------------------------------

const TEST_CONFIG: UsageStoreConfig = {
  ttlSeconds: 7200,
  stalenessThresholdMs: 300_000,
  tierThresholds: { caution: 60, restricted: 80, critical: 95 },
  highCeilingThreshold: 1000,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Impressions Estimate — Unit Tests', () => {
  // =========================================================================
  // Static classifyCeiling tests (Requirement 3.2)
  // =========================================================================
  describe('classifyCeiling — static classification', () => {
    it('classifies impressions below threshold as LOW', () => {
      // 500 impressions, threshold 1000 → LOW
      expect(UsageStore.classifyCeiling(500, 1000)).toBe(CeilingClassification.LOW);
    });

    it('classifies impressions above threshold as HIGH', () => {
      // 1500 impressions, threshold 1000 → HIGH
      expect(UsageStore.classifyCeiling(1500, 1000)).toBe(CeilingClassification.HIGH);
    });

    it('classifies null impressions (new account) as LOW', () => {
      // null → LOW (Requirement 3.3)
      expect(UsageStore.classifyCeiling(null, 1000)).toBe(CeilingClassification.LOW);
    });

    it('classifies impressions at threshold as HIGH (inclusive boundary)', () => {
      // 1000 impressions, threshold 1000 → HIGH (at-threshold = HIGH)
      expect(UsageStore.classifyCeiling(1000, 1000)).toBe(CeilingClassification.HIGH);
    });
  });

  // =========================================================================
  // Full flow: updateImpressionsEstimate → getCeilingClassification
  // (Requirements 3.1, 3.2, 3.3)
  // =========================================================================
  describe('updateImpressionsEstimate → getCeilingClassification flow', () => {
    let store: UsageStore;

    beforeEach(() => {
      store = new UsageStore(null, TEST_CONFIG);
    });

    it('updates classification to HIGH when impressions cross above threshold', async () => {
      // Start with a LOW account (below threshold)
      await store.updateImpressionsEstimate('acc-cross', 500);
      expect(await store.getCeilingClassification('acc-cross')).toBe(CeilingClassification.LOW);

      // Update with impressions above threshold
      await store.updateImpressionsEstimate('acc-cross', 1500);
      expect(await store.getCeilingClassification('acc-cross')).toBe(CeilingClassification.HIGH);
    });

    it('updates classification to LOW when impressions drop below threshold', async () => {
      // Start HIGH
      await store.updateImpressionsEstimate('acc-drop', 2000);
      expect(await store.getCeilingClassification('acc-drop')).toBe(CeilingClassification.HIGH);

      // Drop below threshold
      await store.updateImpressionsEstimate('acc-drop', 800);
      expect(await store.getCeilingClassification('acc-drop')).toBe(CeilingClassification.LOW);
    });

    it('new account with no record defaults to LOW', async () => {
      // Never written — getCeilingClassification returns LOW (Requirement 3.3)
      const classification = await store.getCeilingClassification('acc-brand-new');
      expect(classification).toBe(CeilingClassification.LOW);
    });

    it('persists impressions value in the usage record', async () => {
      await store.updateImpressionsEstimate('acc-persist', 3500);

      const record = await store.getUsageRecord('acc-persist');
      expect(record).not.toBeNull();
      expect(record!.rollingImpressionsEstimate).toBe(3500);
      expect(record!.ceilingClassification).toBe(CeilingClassification.HIGH);
    });

    it('handles account with existing usage data getting impressions update', async () => {
      // Create account with usage data first
      await store.updateUsage('acc-existing', {
        callCountPct: 45,
        totalCputimePct: 30,
        totalTimePct: 25,
      });

      // Now update impressions
      await store.updateImpressionsEstimate('acc-existing', 1200);

      const record = await store.getUsageRecord('acc-existing');
      expect(record).not.toBeNull();
      // Usage data should be preserved
      expect(record!.callCountPct).toBe(45);
      expect(record!.totalCputimePct).toBe(30);
      expect(record!.totalTimePct).toBe(25);
      // Impressions data should be set
      expect(record!.rollingImpressionsEstimate).toBe(1200);
      expect(record!.ceilingClassification).toBe(CeilingClassification.HIGH);
    });
  });

  // =========================================================================
  // Integration with scheduler polling cadence (Requirement 3.4)
  // =========================================================================
  describe('scheduler polling cadence differentiation by ceiling', () => {
    it('HIGH ceiling account gets shorter polling intervals than LOW ceiling', () => {
      // Use the static computePollingCadence — no Redis needed
      const highCadence = TieredJobScheduler.computePollingCadence(
        CeilingClassification.HIGH,
        rateLimitConfig
      );
      const lowCadence = TieredJobScheduler.computePollingCadence(
        CeilingClassification.LOW,
        rateLimitConfig
      );

      // HIGH-ceiling should have shorter (or equal) intervals for every metric
      expect(highCadence.accountInsightsMs).toBeLessThanOrEqual(lowCadence.accountInsightsMs);
      expect(highCadence.postInsightsRecentMs).toBeLessThanOrEqual(lowCadence.postInsightsRecentMs);
      expect(highCadence.newPostDetectionMs).toBeLessThanOrEqual(lowCadence.newPostDetectionMs);
      expect(highCadence.followerCountMs).toBeLessThanOrEqual(lowCadence.followerCountMs);
    });

    it('getPollingCadence returns HIGH cadence after impressions update crosses threshold', async () => {
      const store = new UsageStore(null, TEST_CONFIG);
      const scheduler = new TieredJobScheduler(store, rateLimitConfig);

      // Start below threshold
      await store.updateImpressionsEstimate('acc-sched', 500);
      const lowResult = await scheduler.getPollingCadence('acc-sched');
      expect(lowResult.accountInsightsMs).toBe(rateLimitConfig.polling.lowCeiling.accountInsightsMs);

      // Update above threshold
      await store.updateImpressionsEstimate('acc-sched', 2000);
      const highResult = await scheduler.getPollingCadence('acc-sched');
      expect(highResult.accountInsightsMs).toBe(rateLimitConfig.polling.highCeiling.accountInsightsMs);
    });

    it('new account (no impressions) gets LOW ceiling polling cadence', async () => {
      const store = new UsageStore(null, TEST_CONFIG);
      const scheduler = new TieredJobScheduler(store, rateLimitConfig);

      // Brand new account — no impressions set
      const cadence = await scheduler.getPollingCadence('acc-new-sched');
      expect(cadence.accountInsightsMs).toBe(rateLimitConfig.polling.lowCeiling.accountInsightsMs);
      expect(cadence.followerCountMs).toBe(rateLimitConfig.polling.lowCeiling.followerCountMs);
    });
  });
});
