/**
 * Property-Based Test: Per-Platform Job Isolation (Property 3)
 *
 * **Property 3: Per-Platform Job Isolation**
 * For any multi-platform publish request where exactly one platform's account has
 * `connectionStatus !== ACTIVE`, the scheduler creates a job for the valid platform
 * and rejects only the invalid platform's job.
 *
 * Invariant: `result.valid.status === 'created' && result.invalid.status === 'rejected'`
 *            for all such requests.
 *
 * **Validates: Requirements 10.4, 10.6**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  TieredJobScheduler,
  type MultiPlatformPublishRequest,
  type PlatformJobResult,
} from '../TieredJobScheduler';
import { UsageStore, UsageTier, CeilingClassification } from '../UsageStore';
import { rateLimitConfig } from '../../config/rateLimitConfig';
import type { RateLimitConfig } from '../../config/rateLimitConfig';

// ---------------------------------------------------------------------------
// Module-level mocks (must be hoisted before imports)
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
    add: vi.fn().mockResolvedValue({}),
    getJobs: vi.fn().mockResolvedValue([]),
    on: vi.fn(),
  })),
}));

// Mock the socialAccountRepository — we control findOne per-test
vi.mock('../../repositories/SocialAccountRepository', () => ({
  socialAccountRepository: {
    findOne: vi.fn(),
  },
}));

// Mock CapabilityGuard so every platform+postType combo is "supported"
// (we want to isolate the connectionStatus gate only for these tests)
vi.mock('../../../src/shared/platform-registry', () => ({
  CapabilityGuard: {
    supportsPublishing: vi.fn().mockReturnValue(true),
    getMetricSupport: vi.fn().mockReturnValue('FULL'),
    getRegisteredPlatforms: vi.fn().mockReturnValue(['instagram', 'facebook']),
    getConnectablePlatforms: vi.fn().mockReturnValue(['instagram', 'facebook']),
  },
}));

// UnsupportedPlatformError must still be importable
vi.mock('../../features/social/providers/factory', () => ({
  UnsupportedPlatformError: class UnsupportedPlatformError extends Error {
    constructor(public readonly platform: string) {
      super(`Unsupported platform: ${platform}`);
      this.name = 'UnsupportedPlatformError';
    }
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Connection status values that are NOT ACTIVE (trigger rejection). */
const INVALID_STATUSES = ['DISCONNECTED', 'REQUIRES_RECONNECT', 'SYNCING'] as const;
type InvalidStatus = typeof INVALID_STATUSES[number];

/** Minimal stub for an ACTIVE social account. */
function makeActiveAccount(platform: string) {
  return {
    _id: { toString: () => `account-${platform}-id` },
    platform,
    connectionStatus: 'ACTIVE',
    isActive: true,
  };
}

/** Minimal stub for an account with a non-ACTIVE connectionStatus. */
function makeInvalidAccount(platform: string, status: InvalidStatus) {
  return {
    _id: { toString: () => `account-${platform}-id` },
    platform,
    connectionStatus: status,
    isActive: false,
  };
}

/** Build a UsageStore mock that is always at Normal (SCHEDULED_POST permitted). */
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

/** Shared test config (production defaults). */
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
  errorMessageMap: { default: 'Something went wrong.' },
  smartPolling: rateLimitConfig.smartPolling,
};

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Generator for a valid workspace ID.
 */
const workspaceIdArb = fc.stringMatching(/^ws-[a-z0-9]{4,12}$/);

/**
 * Generator for a valid non-empty caption string.
 */
const captionArb = fc.string({ minLength: 1, maxLength: 200 });

/**
 * Generator for a future scheduledAt Date (0–30 days from now).
 * Optional — undefined half the time.
 */
const scheduledAtArb: fc.Arbitrary<Date | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.integer({ min: 60_000, max: 30 * 24 * 60 * 60 * 1000 }).map(
    (offsetMs) => new Date(Date.now() + offsetMs)
  )
);

/**
 * Generator for optional media URL arrays (0–3 image URLs).
 */
const mediaUrlsArb: fc.Arbitrary<string[] | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.array(
    fc.constant('https://example.com/image.jpg'),
    { minLength: 0, maxLength: 3 }
  )
);

/**
 * Generator for a `MultiPlatformPublishRequest` targeting both instagram and
 * facebook, where exactly one platform gets an invalid connectionStatus.
 *
 * Returns { req, invalidPlatform, invalidStatus } so the test can assert
 * the correct result per platform.
 */
function arbitraryMultiPlatformRequest() {
  return fc.tuple(
    workspaceIdArb,
    captionArb,
    captionArb,
    scheduledAtArb,
    scheduledAtArb,
    mediaUrlsArb,
    fc.constantFrom(...INVALID_STATUSES),
    // Which platform gets the invalid status: 0 = instagram invalid, 1 = facebook invalid
    fc.constantFrom(0 as const, 1 as const)
  ).map(([workspaceId, igCaption, fbCaption, igScheduledAt, fbScheduledAt,
          sharedMedia, invalidStatus, invalidIdx]) => {
    const platforms = [
      { platform: 'instagram' as const, caption: igCaption, scheduledAt: igScheduledAt },
      { platform: 'facebook' as const, caption: fbCaption, scheduledAt: fbScheduledAt },
    ];

    const req: MultiPlatformPublishRequest = {
      workspaceId,
      platforms,
      sharedMediaUrls: sharedMedia,
    };

    return {
      req,
      invalidPlatform: platforms[invalidIdx].platform,
      validPlatform: platforms[1 - invalidIdx].platform,
      invalidStatus,
      invalidIdx,
    };
  });
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Feature: facebook-page-integration — TieredJobScheduler Per-Platform Job Isolation (Property 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.REDIS_URL = 'redis://localhost:6379';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Property 3: Per-Platform Job Isolation
  // =========================================================================

  describe('Property 3: Per-Platform Job Isolation', () => {
    /**
     * **Validates: Requirements 10.4, 10.6**
     *
     * Core isolation invariant:
     *   For any multi-platform request where exactly one platform has
     *   connectionStatus !== 'ACTIVE', the scheduler:
     *   - Creates a job (status: 'created') for the ACTIVE platform
     *   - Rejects (status: 'rejected') the non-ACTIVE platform's job
     *   - Neither result affects the other (isolation)
     */
    it('PROPERTY 3: valid platform job is created; invalid platform job is rejected (fast-check)', async () => {
      const { socialAccountRepository } = await import('../../repositories/SocialAccountRepository');
      const findOneMock = socialAccountRepository.findOne as ReturnType<typeof vi.fn>;

      await fc.assert(
        fc.asyncProperty(
          arbitraryMultiPlatformRequest(),
          async ({ req, invalidPlatform, validPlatform, invalidStatus }) => {
            // Wire findOne: ACTIVE for valid platform, non-ACTIVE for invalid
            findOneMock.mockImplementation(
              async ({ platform }: { workspaceId: string; platform: string }) => {
                if (platform === validPlatform) {
                  return makeActiveAccount(platform);
                }
                return makeInvalidAccount(platform, invalidStatus);
              }
            );

            const scheduler = new TieredJobScheduler(createNormalUsageStore(), TEST_CONFIG);
            const results = await scheduler.createPlatformJobs(req);

            // Must have exactly 2 results (one per platform spec)
            expect(results).toHaveLength(2);

            const validResult = results.find((r) => r.platform === validPlatform);
            const invalidResult = results.find((r) => r.platform === invalidPlatform);

            // Core isolation invariant
            expect(validResult?.status).toBe('created');
            expect(invalidResult?.status).toBe('rejected');

            // The rejected platform must carry a reason
            expect(invalidResult?.reason).toBeTruthy();
            // The rejection reason must reference the bad connectionStatus
            expect(invalidResult?.reason).toMatch(new RegExp(invalidStatus, 'i'));

            // The valid job must have been assigned a jobId
            expect(validResult?.jobId).toBeTruthy();

            // The invalid job must NOT have a jobId (was never enqueued)
            expect(invalidResult?.jobId).toBeUndefined();

            return true;
          }
        ),
        { numRuns: 50, verbose: false }
      );
    });

    /**
     * **Validates: Requirements 10.4, 10.6**
     *
     * Specific ordering: instagram ACTIVE, facebook INVALID
     * Parameterized across all non-ACTIVE statuses.
     */
    it.each(INVALID_STATUSES)(
      'PROPERTY 3 (instagram valid): instagram job created when facebook status is %s',
      async (fbStatus) => {
        const { socialAccountRepository } = await import('../../repositories/SocialAccountRepository');
        const findOneMock = socialAccountRepository.findOne as ReturnType<typeof vi.fn>;

        findOneMock.mockImplementation(
          async ({ platform }: { workspaceId: string; platform: string }) => {
            if (platform === 'instagram') return makeActiveAccount('instagram');
            return makeInvalidAccount('facebook', fbStatus);
          }
        );

        const req: MultiPlatformPublishRequest = {
          workspaceId: 'ws-test-ig-valid',
          platforms: [
            { platform: 'instagram', caption: 'Instagram caption #test' },
            { platform: 'facebook', caption: 'Facebook caption' },
          ],
        };

        const scheduler = new TieredJobScheduler(createNormalUsageStore(), TEST_CONFIG);
        const results = await scheduler.createPlatformJobs(req);

        expect(results).toHaveLength(2);

        const igResult = results.find((r) => r.platform === 'instagram')!;
        const fbResult = results.find((r) => r.platform === 'facebook')!;

        // Instagram job created — unaffected by Facebook's invalid status
        expect(igResult.status).toBe('created');
        expect(igResult.jobId).toBeTruthy();

        // Facebook job rejected — reason identifies the bad status
        expect(fbResult.status).toBe('rejected');
        expect(fbResult.reason).toMatch(new RegExp(fbStatus, 'i'));
        expect(fbResult.jobId).toBeUndefined();
      }
    );

    /**
     * **Validates: Requirements 10.4, 10.6**
     *
     * Specific ordering: facebook ACTIVE, instagram INVALID
     * Parameterized across all non-ACTIVE statuses.
     */
    it.each(INVALID_STATUSES)(
      'PROPERTY 3 (facebook valid): facebook job created when instagram status is %s',
      async (igStatus) => {
        const { socialAccountRepository } = await import('../../repositories/SocialAccountRepository');
        const findOneMock = socialAccountRepository.findOne as ReturnType<typeof vi.fn>;

        findOneMock.mockImplementation(
          async ({ platform }: { workspaceId: string; platform: string }) => {
            if (platform === 'facebook') return makeActiveAccount('facebook');
            return makeInvalidAccount('instagram', igStatus);
          }
        );

        const req: MultiPlatformPublishRequest = {
          workspaceId: 'ws-test-fb-valid',
          platforms: [
            { platform: 'instagram', caption: 'Instagram caption #test' },
            { platform: 'facebook', caption: 'Facebook caption' },
          ],
        };

        const scheduler = new TieredJobScheduler(createNormalUsageStore(), TEST_CONFIG);
        const results = await scheduler.createPlatformJobs(req);

        expect(results).toHaveLength(2);

        const igResult = results.find((r) => r.platform === 'instagram')!;
        const fbResult = results.find((r) => r.platform === 'facebook')!;

        // Facebook job created — unaffected by Instagram's invalid status
        expect(fbResult.status).toBe('created');
        expect(fbResult.jobId).toBeTruthy();

        // Instagram job rejected — reason identifies the bad status
        expect(igResult.status).toBe('rejected');
        expect(igResult.reason).toMatch(new RegExp(igStatus, 'i'));
        expect(igResult.jobId).toBeUndefined();
      }
    );

    /**
     * **Validates: Requirements 10.4, 10.6**
     *
     * Isolation invariant verified with fast-check:
     * The result array always has exactly one 'created' and one 'rejected' entry
     * when exactly one account is invalid.
     *
     * Verifies the invariant holds across all combinations of valid/invalid
     * platform ordering and all invalid connection statuses.
     */
    it('PROPERTY 3 (invariant): result always has exactly one created and one rejected', async () => {
      const { socialAccountRepository } = await import('../../repositories/SocialAccountRepository');
      const findOneMock = socialAccountRepository.findOne as ReturnType<typeof vi.fn>;

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('instagram' as const, 'facebook' as const),
          fc.constantFrom(...INVALID_STATUSES),
          async (invalidPlatform, invalidStatus) => {
            const validPlatform = invalidPlatform === 'instagram' ? 'facebook' : 'instagram';

            findOneMock.mockImplementation(
              async ({ platform }: { workspaceId: string; platform: string }) => {
                if (platform === validPlatform) return makeActiveAccount(platform);
                return makeInvalidAccount(platform, invalidStatus);
              }
            );

            const req: MultiPlatformPublishRequest = {
              workspaceId: 'ws-invariant-test',
              platforms: [
                { platform: 'instagram', caption: 'Caption for instagram' },
                { platform: 'facebook', caption: 'Caption for facebook' },
              ],
            };

            const scheduler = new TieredJobScheduler(createNormalUsageStore(), TEST_CONFIG);
            const results = await scheduler.createPlatformJobs(req);

            const createdCount = results.filter((r) => r.status === 'created').length;
            const rejectedCount = results.filter((r) => r.status === 'rejected').length;

            // Exactly one created and one rejected — isolation invariant
            expect(createdCount).toBe(1);
            expect(rejectedCount).toBe(1);

            return true;
          }
        ),
        { numRuns: 30, verbose: false }
      );
    });

    /**
     * **Validates: Requirement 10.4**
     *
     * Order independence: regardless of which platform appears first in the
     * `platforms` array, isolation is maintained — processing order has no
     * effect on which job gets created vs rejected.
     */
    it('PROPERTY 3 (order independence): platform processing order does not affect isolation', async () => {
      const { socialAccountRepository } = await import('../../repositories/SocialAccountRepository');
      const findOneMock = socialAccountRepository.findOne as ReturnType<typeof vi.fn>;

      // instagram is ACTIVE, facebook is REQUIRES_RECONNECT
      findOneMock.mockImplementation(
        async ({ platform }: { workspaceId: string; platform: string }) => {
          if (platform === 'instagram') return makeActiveAccount('instagram');
          return makeInvalidAccount('facebook', 'REQUIRES_RECONNECT');
        }
      );

      // Order 1: instagram first
      const reqIgFirst: MultiPlatformPublishRequest = {
        workspaceId: 'ws-order-test',
        platforms: [
          { platform: 'instagram', caption: 'Caption A' },
          { platform: 'facebook', caption: 'Caption B' },
        ],
      };

      // Order 2: facebook first
      const reqFbFirst: MultiPlatformPublishRequest = {
        workspaceId: 'ws-order-test',
        platforms: [
          { platform: 'facebook', caption: 'Caption B' },
          { platform: 'instagram', caption: 'Caption A' },
        ],
      };

      const scheduler = new TieredJobScheduler(createNormalUsageStore(), TEST_CONFIG);

      const resultsIgFirst = await scheduler.createPlatformJobs(reqIgFirst);
      const resultsFbFirst = await scheduler.createPlatformJobs(reqFbFirst);

      // Same outcome regardless of order in the request array
      const getStatus = (results: PlatformJobResult[], platform: string) =>
        results.find((r) => r.platform === platform)?.status;

      expect(getStatus(resultsIgFirst, 'instagram')).toBe('created');
      expect(getStatus(resultsIgFirst, 'facebook')).toBe('rejected');

      expect(getStatus(resultsFbFirst, 'instagram')).toBe('created');
      expect(getStatus(resultsFbFirst, 'facebook')).toBe('rejected');
    });

  }); // end Property 3 describe
}); // end suite
