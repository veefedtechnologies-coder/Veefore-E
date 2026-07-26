/**
 * Integration Test: Scheduler Platform Isolation (Task 15.3)
 *
 * Tests the real `TieredJobScheduler.createPlatformJobs()` flow with mocked
 * infrastructure (DB, Redis, BullMQ) to verify that per-platform job isolation
 * is enforced correctly in named, readable scenarios — without fast-check.
 *
 * Scenarios covered:
 *  1. Facebook REQUIRES_RECONNECT → Instagram created, Facebook rejected
 *  2. Instagram REQUIRES_RECONNECT → Facebook created, Instagram rejected
 *  3. Neither job is affected by the other's outcome (isolation invariant)
 *
 * _Requirements: 10.4, 10.6_
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TieredJobScheduler,
  type MultiPlatformPublishRequest,
} from '../TieredJobScheduler';
import { UsageTier, CeilingClassification } from '../UsageStore';
import type { UsageStore } from '../UsageStore';
import { rateLimitConfig } from '../../config/rateLimitConfig';
import type { RateLimitConfig } from '../../config/rateLimitConfig';

// ---------------------------------------------------------------------------
// Module-level mocks (hoisted before any import resolution)
// ---------------------------------------------------------------------------

vi.mock('../realtime', () => ({
  RealtimeService: { broadcastToWorkspace: vi.fn() },
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
    add: vi.fn().mockResolvedValue({ id: 'bullmq-job-id' }),
    getJobs: vi.fn().mockResolvedValue([]),
    on: vi.fn(),
  })),
}));

/**
 * Mock the social account repository — each test controls `findOne` behavior
 * to simulate ACTIVE and REQUIRES_RECONNECT accounts.
 */
vi.mock('../../repositories/SocialAccountRepository', () => ({
  socialAccountRepository: {
    findOne: vi.fn(),
  },
}));

/**
 * Mock CapabilityGuard so every platform + post-type combination is "supported".
 * This isolates the test to the connectionStatus pre-check only (Req 10.6),
 * not the capability-guard path (which is tested separately).
 */
vi.mock('../../../src/shared/platform-registry', () => ({
  CapabilityGuard: {
    supportsPublishing: vi.fn().mockReturnValue(true),
    getMetricSupport: vi.fn().mockReturnValue('FULL'),
    getRegisteredPlatforms: vi.fn().mockReturnValue(['instagram', 'facebook']),
    getConnectablePlatforms: vi.fn().mockReturnValue(['instagram', 'facebook']),
  },
}));

vi.mock('../../features/social/providers/factory', () => ({
  UnsupportedPlatformError: class UnsupportedPlatformError extends Error {
    constructor(public readonly platform: string) {
      super(`Unsupported platform: ${platform}`);
      this.name = 'UnsupportedPlatformError';
    }
  },
}));

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/** Minimal ACTIVE social account stub. */
function makeActiveAccount(platform: string) {
  return {
    _id: { toString: () => `account-${platform}-active` },
    platform,
    connectionStatus: 'ACTIVE',
    isActive: true,
  };
}

/** Minimal account stub with REQUIRES_RECONNECT status. */
function makeRequiresReconnectAccount(platform: string) {
  return {
    _id: { toString: () => `account-${platform}-reconnect` },
    platform,
    connectionStatus: 'REQUIRES_RECONNECT',
    isActive: false,
  };
}

/** UsageStore mock always returning NORMAL tier (so no usage-tier rejections). */
function createNormalUsageStore(): UsageStore {
  return {
    getEffectiveUsage: vi.fn().mockResolvedValue({
      percentage: 10,
      tier: UsageTier.NORMAL,
      isStale: false,
    }),
    getCeilingClassification: vi.fn().mockResolvedValue(CeilingClassification.HIGH),
    getTier: vi.fn().mockResolvedValue(UsageTier.NORMAL),
    getAppUsage: vi.fn().mockResolvedValue({
      callCountPct: 0,
      totalCputimePct: 0,
      totalTimePct: 0,
      percentage: 0,
      tier: UsageTier.NORMAL,
      lastUpdatedAt: Date.now(),
    }),
  } as unknown as UsageStore;
}

/** Shared test config using production defaults for the queue settings. */
const TEST_CONFIG: RateLimitConfig = {
  ...rateLimitConfig,
  queue: {
    webhookConcurrencyPerAccount: 3,
    maxDeferredRetries: 10,
    deferredAlertThresholdHours: 24,
    queueDepthAlertThreshold: 500,
  },
};

/** Standard two-platform publish request for the integration scenarios. */
const BASE_REQUEST: MultiPlatformPublishRequest = {
  workspaceId: 'ws-integration-test-01',
  platforms: [
    { platform: 'instagram', caption: 'Check out our new product launch! #launch' },
    { platform: 'facebook', caption: 'We are excited to share our new product launch with the community.' },
  ],
};

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Feature: facebook-page-integration — Scheduler Isolation Integration Tests (Task 15.3)', () => {
  let savedRedisUrl: string | undefined;

  beforeEach(() => {
    // Ensure the deferred queue is initialised (requires REDIS_URL).
    savedRedisUrl = process.env.REDIS_URL;
    process.env.REDIS_URL = 'redis://localhost:6379';
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (savedRedisUrl === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = savedRedisUrl;
    }
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Scenario 1: Facebook REQUIRES_RECONNECT — Instagram active
  // Requirements: 10.4, 10.6
  // =========================================================================

  describe('Scenario 1: Facebook account REQUIRES_RECONNECT, Instagram ACTIVE', () => {
    /**
     * The canonical scenario from the task description:
     *   - Instagram account: connectionStatus = 'ACTIVE'
     *   - Facebook account: connectionStatus = 'REQUIRES_RECONNECT'
     *
     * Expected:
     *   - Instagram job → status: 'created' (with a jobId)
     *   - Facebook job  → status: 'rejected' (with a reason mentioning REQUIRES_RECONNECT)
     *   - Neither job's outcome affected by the other
     */
    it('Instagram job is created and Facebook job is rejected with a REQUIRES_RECONNECT reason', async () => {
      const { socialAccountRepository } = await import('../../repositories/SocialAccountRepository');
      const findOneMock = socialAccountRepository.findOne as ReturnType<typeof vi.fn>;

      findOneMock.mockImplementation(
        async ({ platform }: { workspaceId: string; platform: string }) => {
          if (platform === 'instagram') return makeActiveAccount('instagram');
          if (platform === 'facebook') return makeRequiresReconnectAccount('facebook');
          return null;
        }
      );

      const scheduler = new TieredJobScheduler(createNormalUsageStore(), TEST_CONFIG);
      const results = await scheduler.createPlatformJobs(BASE_REQUEST);

      // Assert: exactly two results (one per platform spec)
      expect(results).toHaveLength(2);

      const igResult = results.find((r) => r.platform === 'instagram')!;
      const fbResult = results.find((r) => r.platform === 'facebook')!;

      // Instagram job must be created (Req 10.4 — isolation: Facebook rejection does not affect Instagram)
      expect(igResult.status).toBe('created');
      expect(igResult.jobId).toBeTruthy();
      expect(igResult.reason).toBeUndefined();

      // Facebook job must be rejected (Req 10.6 — REQUIRES_RECONNECT blocks new jobs)
      expect(fbResult.status).toBe('rejected');
      expect(fbResult.jobId).toBeUndefined();

      // The rejection reason must explicitly reference REQUIRES_RECONNECT
      expect(fbResult.reason).toBeTruthy();
      expect(fbResult.reason).toMatch(/REQUIRES_RECONNECT/i);
    });

    it('findOne is called once for each platform (two DB calls total)', async () => {
      const { socialAccountRepository } = await import('../../repositories/SocialAccountRepository');
      const findOneMock = socialAccountRepository.findOne as ReturnType<typeof vi.fn>;

      findOneMock.mockImplementation(
        async ({ platform }: { workspaceId: string; platform: string }) => {
          if (platform === 'instagram') return makeActiveAccount('instagram');
          return makeRequiresReconnectAccount('facebook');
        }
      );

      const scheduler = new TieredJobScheduler(createNormalUsageStore(), TEST_CONFIG);
      await scheduler.createPlatformJobs(BASE_REQUEST);

      // Each platform spec triggers exactly one `findOne` call
      expect(findOneMock).toHaveBeenCalledTimes(2);
      const calledPlatforms = findOneMock.mock.calls.map((call: any) => call[0].platform);
      expect(calledPlatforms).toContain('instagram');
      expect(calledPlatforms).toContain('facebook');
    });

    it('Instagram job carries the correct workspaceId in its payload', async () => {
      const { socialAccountRepository } = await import('../../repositories/SocialAccountRepository');
      const findOneMock = socialAccountRepository.findOne as ReturnType<typeof vi.fn>;

      findOneMock.mockImplementation(
        async ({ platform }: { workspaceId: string; platform: string }) => {
          if (platform === 'instagram') return makeActiveAccount('instagram');
          return makeRequiresReconnectAccount('facebook');
        }
      );

      const scheduler = new TieredJobScheduler(createNormalUsageStore(), TEST_CONFIG);
      const results = await scheduler.createPlatformJobs(BASE_REQUEST);

      const igResult = results.find((r) => r.platform === 'instagram')!;
      expect(igResult.status).toBe('created');

      // The jobId must be prefixed with the workspaceId so it's traceable
      expect(igResult.jobId).toContain(BASE_REQUEST.workspaceId);
      expect(igResult.jobId).toContain('instagram');
    });
  });

  // =========================================================================
  // Scenario 2: Instagram REQUIRES_RECONNECT — Facebook active
  // Requirements: 10.4, 10.6
  // =========================================================================

  describe('Scenario 2: Instagram account REQUIRES_RECONNECT, Facebook ACTIVE', () => {
    /**
     * Reverse of Scenario 1:
     *   - Facebook account: connectionStatus = 'ACTIVE'
     *   - Instagram account: connectionStatus = 'REQUIRES_RECONNECT'
     *
     * Expected:
     *   - Facebook job  → status: 'created' (with a jobId)
     *   - Instagram job → status: 'rejected' (with a reason mentioning REQUIRES_RECONNECT)
     *   - Neither job's outcome affected by the other
     */
    it('Facebook job is created and Instagram job is rejected with a REQUIRES_RECONNECT reason', async () => {
      const { socialAccountRepository } = await import('../../repositories/SocialAccountRepository');
      const findOneMock = socialAccountRepository.findOne as ReturnType<typeof vi.fn>;

      findOneMock.mockImplementation(
        async ({ platform }: { workspaceId: string; platform: string }) => {
          if (platform === 'facebook') return makeActiveAccount('facebook');
          if (platform === 'instagram') return makeRequiresReconnectAccount('instagram');
          return null;
        }
      );

      const scheduler = new TieredJobScheduler(createNormalUsageStore(), TEST_CONFIG);
      const results = await scheduler.createPlatformJobs(BASE_REQUEST);

      expect(results).toHaveLength(2);

      const igResult = results.find((r) => r.platform === 'instagram')!;
      const fbResult = results.find((r) => r.platform === 'facebook')!;

      // Facebook job must be created (Req 10.4 — isolation: Instagram rejection does not affect Facebook)
      expect(fbResult.status).toBe('created');
      expect(fbResult.jobId).toBeTruthy();
      expect(fbResult.reason).toBeUndefined();

      // Instagram job must be rejected (Req 10.6 — REQUIRES_RECONNECT blocks new jobs)
      expect(igResult.status).toBe('rejected');
      expect(igResult.jobId).toBeUndefined();

      // The rejection reason must explicitly reference REQUIRES_RECONNECT
      expect(igResult.reason).toBeTruthy();
      expect(igResult.reason).toMatch(/REQUIRES_RECONNECT/i);
    });

    it('Facebook job carries the correct workspaceId in its jobId', async () => {
      const { socialAccountRepository } = await import('../../repositories/SocialAccountRepository');
      const findOneMock = socialAccountRepository.findOne as ReturnType<typeof vi.fn>;

      findOneMock.mockImplementation(
        async ({ platform }: { workspaceId: string; platform: string }) => {
          if (platform === 'facebook') return makeActiveAccount('facebook');
          return makeRequiresReconnectAccount('instagram');
        }
      );

      const scheduler = new TieredJobScheduler(createNormalUsageStore(), TEST_CONFIG);
      const results = await scheduler.createPlatformJobs(BASE_REQUEST);

      const fbResult = results.find((r) => r.platform === 'facebook')!;
      expect(fbResult.status).toBe('created');
      expect(fbResult.jobId).toContain(BASE_REQUEST.workspaceId);
      expect(fbResult.jobId).toContain('facebook');
    });
  });

  // =========================================================================
  // Scenario 3: Isolation invariant — one rejection never affects the other
  // Requirements: 10.4
  // =========================================================================

  describe('Scenario 3: Isolation invariant — one platform rejection does not affect the other', () => {
    /**
     * Verifies that the two jobs are fully independent:
     *   - Setting one platform to REQUIRES_RECONNECT does not mutate the
     *     status or jobId of the other platform's result.
     *   - The result array always contains one 'created' and one 'rejected'
     *     entry when exactly one account is invalid.
     */
    it('result array always has exactly one created and one rejected (facebook invalid)', async () => {
      const { socialAccountRepository } = await import('../../repositories/SocialAccountRepository');
      const findOneMock = socialAccountRepository.findOne as ReturnType<typeof vi.fn>;

      findOneMock.mockImplementation(
        async ({ platform }: { workspaceId: string; platform: string }) => {
          if (platform === 'instagram') return makeActiveAccount('instagram');
          return makeRequiresReconnectAccount('facebook');
        }
      );

      const scheduler = new TieredJobScheduler(createNormalUsageStore(), TEST_CONFIG);
      const results = await scheduler.createPlatformJobs(BASE_REQUEST);

      const createdResults = results.filter((r) => r.status === 'created');
      const rejectedResults = results.filter((r) => r.status === 'rejected');

      expect(createdResults).toHaveLength(1);
      expect(rejectedResults).toHaveLength(1);

      // The single created job belongs to instagram
      expect(createdResults[0].platform).toBe('instagram');
      // The single rejected job belongs to facebook
      expect(rejectedResults[0].platform).toBe('facebook');
    });

    it('result array always has exactly one created and one rejected (instagram invalid)', async () => {
      const { socialAccountRepository } = await import('../../repositories/SocialAccountRepository');
      const findOneMock = socialAccountRepository.findOne as ReturnType<typeof vi.fn>;

      findOneMock.mockImplementation(
        async ({ platform }: { workspaceId: string; platform: string }) => {
          if (platform === 'facebook') return makeActiveAccount('facebook');
          return makeRequiresReconnectAccount('instagram');
        }
      );

      const scheduler = new TieredJobScheduler(createNormalUsageStore(), TEST_CONFIG);
      const results = await scheduler.createPlatformJobs(BASE_REQUEST);

      const createdResults = results.filter((r) => r.status === 'created');
      const rejectedResults = results.filter((r) => r.status === 'rejected');

      expect(createdResults).toHaveLength(1);
      expect(rejectedResults).toHaveLength(1);

      // The single created job belongs to facebook
      expect(createdResults[0].platform).toBe('facebook');
      // The single rejected job belongs to instagram
      expect(rejectedResults[0].platform).toBe('instagram');
    });

    it('rejected platform does not contaminate created platform result fields', async () => {
      const { socialAccountRepository } = await import('../../repositories/SocialAccountRepository');
      const findOneMock = socialAccountRepository.findOne as ReturnType<typeof vi.fn>;

      findOneMock.mockImplementation(
        async ({ platform }: { workspaceId: string; platform: string }) => {
          if (platform === 'instagram') return makeActiveAccount('instagram');
          return makeRequiresReconnectAccount('facebook');
        }
      );

      const scheduler = new TieredJobScheduler(createNormalUsageStore(), TEST_CONFIG);
      const results = await scheduler.createPlatformJobs(BASE_REQUEST);

      const igResult = results.find((r) => r.platform === 'instagram')!;
      const fbResult = results.find((r) => r.platform === 'facebook')!;

      // Instagram result is clean — no reason leak from Facebook rejection
      expect(igResult.status).toBe('created');
      expect(igResult.reason).toBeUndefined();

      // Facebook result is clean — no jobId leaked from Instagram creation
      expect(fbResult.status).toBe('rejected');
      expect(fbResult.jobId).toBeUndefined();
    });

    it('platform ordering in request array does not affect isolation (facebook-first variant)', async () => {
      const { socialAccountRepository } = await import('../../repositories/SocialAccountRepository');
      const findOneMock = socialAccountRepository.findOne as ReturnType<typeof vi.fn>;

      // Instagram ACTIVE, Facebook REQUIRES_RECONNECT (same condition as Scenario 1)
      findOneMock.mockImplementation(
        async ({ platform }: { workspaceId: string; platform: string }) => {
          if (platform === 'instagram') return makeActiveAccount('instagram');
          return makeRequiresReconnectAccount('facebook');
        }
      );

      // Request with Facebook listed first
      const fbFirstRequest: MultiPlatformPublishRequest = {
        workspaceId: 'ws-order-isolation-test',
        platforms: [
          { platform: 'facebook', caption: 'Facebook caption first in array' },
          { platform: 'instagram', caption: 'Instagram caption second in array' },
        ],
      };

      const scheduler = new TieredJobScheduler(createNormalUsageStore(), TEST_CONFIG);
      const results = await scheduler.createPlatformJobs(fbFirstRequest);

      expect(results).toHaveLength(2);

      const igResult = results.find((r) => r.platform === 'instagram')!;
      const fbResult = results.find((r) => r.platform === 'facebook')!;

      // Same isolation guarantee regardless of array order
      expect(igResult.status).toBe('created');
      expect(fbResult.status).toBe('rejected');
      expect(fbResult.reason).toMatch(/REQUIRES_RECONNECT/i);
    });
  });

  // =========================================================================
  // Scenario 4: Both accounts ACTIVE — control case
  // Verifies that normal operation is not disrupted by the isolation logic
  // =========================================================================

  describe('Scenario 4: Both platforms ACTIVE (control case)', () => {
    it('both jobs are created when both accounts are ACTIVE', async () => {
      const { socialAccountRepository } = await import('../../repositories/SocialAccountRepository');
      const findOneMock = socialAccountRepository.findOne as ReturnType<typeof vi.fn>;

      findOneMock.mockImplementation(
        async ({ platform }: { workspaceId: string; platform: string }) => {
          return makeActiveAccount(platform);
        }
      );

      const scheduler = new TieredJobScheduler(createNormalUsageStore(), TEST_CONFIG);
      const results = await scheduler.createPlatformJobs(BASE_REQUEST);

      expect(results).toHaveLength(2);

      const igResult = results.find((r) => r.platform === 'instagram')!;
      const fbResult = results.find((r) => r.platform === 'facebook')!;

      expect(igResult.status).toBe('created');
      expect(igResult.jobId).toBeTruthy();

      expect(fbResult.status).toBe('created');
      expect(fbResult.jobId).toBeTruthy();

      // Both jobIds must be distinct
      expect(igResult.jobId).not.toBe(fbResult.jobId);
    });
  });
});
