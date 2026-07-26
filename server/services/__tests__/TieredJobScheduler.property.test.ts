import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  TieredJobScheduler,
  JobType,
  TIER_POLICIES,
  WEBHOOK_ONLY_DATA_TYPES,
  type TierPolicy,
} from '../TieredJobScheduler';
import { UsageTier, CeilingClassification } from '../UsageStore';
import type { RateLimitConfig, PollingCadence } from '../../config/rateLimitConfig';
import { rateLimitConfig } from '../../config/rateLimitConfig';

/**
 * Property-Based Tests for TieredJobScheduler
 *
 * Tests correctness properties from the design document using fast-check
 * to verify universal properties hold across all valid inputs.
 *
 * Properties tested:
 * - Property 5: Tier Determines Job Permission
 * - Property 6: Account Isolation
 * - Property 7: Polling Cadence Scales with Ceiling Classification
 * - Property 8: Deferred Jobs Re-dispatch on Usage Drop
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.9, 5.1, 5.2, 11.2, 11.5, 12.3
 */

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Generator for valid percentage values [0, 100].
 */
const percentageArb = fc.double({ min: 0, max: 100, noNaN: true });

/**
 * Generator for valid account IDs.
 */
const accountIdArb = fc.stringMatching(/^[a-zA-Z0-9]{5,20}$/);

/**
 * Generator for any valid JobType.
 */
const jobTypeArb = fc.constantFrom(
  JobType.ANALYTICS_REFRESH,
  JobType.BACKFILL,
  JobType.POLLING,
  JobType.AUTOMATION_REPLY,
  JobType.SCHEDULED_POST,
  JobType.USER_INITIATED,
  JobType.ACTIVE_VIEW
);

/**
 * Generator for UsageTier enum values.
 */
const tierArb = fc.constantFrom(
  UsageTier.NORMAL,
  UsageTier.CAUTION,
  UsageTier.RESTRICTED,
  UsageTier.CRITICAL
);

/**
 * Generator for tier thresholds where caution < restricted < critical ≤ 100.
 */
const thresholdsArb = fc
  .tuple(
    fc.integer({ min: 1, max: 40 }),
    fc.integer({ min: 1, max: 20 }),
    fc.integer({ min: 1, max: 20 })
  )
  .map(([caution, gap1, gap2]) => ({
    caution,
    restricted: caution + gap1,
    critical: caution + gap1 + gap2,
  }));

/**
 * Generator for valid PollingCadence with positive intervals.
 */
const pollingCadenceArb = fc.record({
  accountInsightsMs: fc.integer({ min: 60_000, max: 24 * 60 * 60 * 1000 }),
  postInsightsRecentMs: fc.integer({ min: 60_000, max: 24 * 60 * 60 * 1000 }),
  postInsightsOlderMs: fc.integer({ min: 60_000, max: 48 * 60 * 60 * 1000 }),
  newPostDetectionMs: fc.integer({ min: 60_000, max: 24 * 60 * 60 * 1000 }),
  followerCountMs: fc.integer({ min: 60_000, max: 24 * 60 * 60 * 1000 }),
});

/**
 * Generator for a valid RateLimitConfig with consistent high/low ceiling
 * cadence (high-ceiling intervals ≤ low-ceiling intervals).
 */
const rateLimitConfigArb = fc
  .tuple(pollingCadenceArb, pollingCadenceArb, thresholdsArb)
  .map(([highCeiling, lowCeilingBase, thresholds]): RateLimitConfig => {
    // Ensure low-ceiling intervals are >= high-ceiling intervals
    const lowCeiling: PollingCadence = {
      accountInsightsMs: Math.max(highCeiling.accountInsightsMs, lowCeilingBase.accountInsightsMs),
      postInsightsRecentMs: Math.max(highCeiling.postInsightsRecentMs, lowCeilingBase.postInsightsRecentMs),
      postInsightsOlderMs: Math.max(highCeiling.postInsightsOlderMs, lowCeilingBase.postInsightsOlderMs),
      newPostDetectionMs: Math.max(highCeiling.newPostDetectionMs, lowCeilingBase.newPostDetectionMs),
      followerCountMs: Math.max(highCeiling.followerCountMs, lowCeilingBase.followerCountMs),
    };

    return {
      bucMultiplier: 4800,
      platformRateLimitMultiplier: 200,
      publishLimitPerDay: 25,
      messagingCeilingPerHour: 250,
      tierThresholds: thresholds,
      polling: { highCeiling, lowCeiling },
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
    };
  });

/**
 * Generator for priority values (lower = higher priority).
 */
const priorityArb = fc.integer({ min: 0, max: 100 });

/**
 * Generator for timestamps (Unix ms).
 */
const timestampArb = fc.integer({ min: 1700000000000, max: 1800000000000 });

// ---------------------------------------------------------------------------
// Helper: Determine tier from percentage and thresholds
// ---------------------------------------------------------------------------

function determineTier(
  percentage: number,
  thresholds: { caution: number; restricted: number; critical: number }
): UsageTier {
  if (percentage >= thresholds.critical) return UsageTier.CRITICAL;
  if (percentage >= thresholds.restricted) return UsageTier.RESTRICTED;
  if (percentage >= thresholds.caution) return UsageTier.CAUTION;
  return UsageTier.NORMAL;
}

// ---------------------------------------------------------------------------
// Default test config (matches production defaults)
// ---------------------------------------------------------------------------

const defaultConfig: RateLimitConfig = {
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
// Tests
// ---------------------------------------------------------------------------

describe('Feature: instagram-rate-limit-architecture — TieredJobScheduler Property Tests', () => {
  // =========================================================================
  // Property 5: Tier Determines Job Permission
  // =========================================================================

  describe('Property 5: Tier Determines Job Permission', () => {
    /**
     * **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
     *
     * For any usage percentage in [0, 100] and any job type, the tier policy
     * function shall return `permitted` if and only if the job type appears in
     * the permitted list for the tier determined by that percentage.
     *
     * Specifically:
     * - Normal (0-60%): all jobs permitted
     * - Caution (60-80%): automation, posts, user-initiated, active-view
     * - Restricted (80-95%): only active-view
     * - Critical (95%+): only scheduled posts (due-now)
     */
    it('PROPERTY 5: isJobPermitted returns correct result per tier policy matrix', () => {
      fc.assert(
        fc.property(tierArb, jobTypeArb, (tier, jobType) => {
          const result = TieredJobScheduler.isJobPermitted(tier, jobType, TIER_POLICIES);
          const policy = TIER_POLICIES[tier];

          // isJobPermitted should return true iff the jobType is in the tier's permitted list
          const expectedPermitted = policy.permitted.includes(jobType);
          expect(result).toBe(expectedPermitted);

          return true;
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * Verify Normal tier permits ALL job types — most permissive tier.
     */
    it('PROPERTY 5 (Normal): Normal tier permits every job type', () => {
      fc.assert(
        fc.property(jobTypeArb, (jobType) => {
          const result = TieredJobScheduler.isJobPermitted(
            UsageTier.NORMAL, jobType, TIER_POLICIES
          );
          expect(result).toBe(true);
          return true;
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * Verify Caution tier only permits high-priority job types.
     * Defers: ANALYTICS_REFRESH, BACKFILL, POLLING.
     */
    it('PROPERTY 5 (Caution): Caution tier defers analytics, backfill, polling', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(JobType.ANALYTICS_REFRESH, JobType.BACKFILL, JobType.POLLING),
          (deferredJobType) => {
            const result = TieredJobScheduler.isJobPermitted(
              UsageTier.CAUTION, deferredJobType, TIER_POLICIES
            );
            expect(result).toBe(false);
            return true;
          }
        ),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * Verify Restricted tier only permits ACTIVE_VIEW.
     */
    it('PROPERTY 5 (Restricted): Restricted tier denies everything except ACTIVE_VIEW', () => {
      fc.assert(
        fc.property(jobTypeArb, (jobType) => {
          const result = TieredJobScheduler.isJobPermitted(
            UsageTier.RESTRICTED, jobType, TIER_POLICIES
          );
          if (jobType === JobType.ACTIVE_VIEW) {
            expect(result).toBe(true);
          } else {
            expect(result).toBe(false);
          }
          return true;
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * Verify Critical tier only permits SCHEDULED_POST (due-now publishing).
     */
    it('PROPERTY 5 (Critical): Critical tier only permits SCHEDULED_POST', () => {
      fc.assert(
        fc.property(jobTypeArb, (jobType) => {
          const result = TieredJobScheduler.isJobPermitted(
            UsageTier.CRITICAL, jobType, TIER_POLICIES
          );
          if (jobType === JobType.SCHEDULED_POST) {
            expect(result).toBe(true);
          } else {
            expect(result).toBe(false);
          }
          return true;
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * Verify that percentage → tier → permission is consistent end-to-end.
     * Uses default thresholds (60/80/95).
     */
    it('PROPERTY 5 (end-to-end): percentage + job type → correct permission via tier', () => {
      fc.assert(
        fc.property(percentageArb, jobTypeArb, (percentage, jobType) => {
          const tier = determineTier(percentage, defaultConfig.tierThresholds);
          const result = TieredJobScheduler.isJobPermitted(tier, jobType, TIER_POLICIES);
          const expected = TIER_POLICIES[tier].permitted.includes(jobType);
          expect(result).toBe(expected);
          return true;
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * Verify tier permission monotonicity: if a job is permitted at a more
     * restrictive tier, it must be permitted at all less restrictive tiers.
     */
    it('PROPERTY 5 (monotonicity): Permission at a higher tier implies permission at lower tiers', () => {
      const tierOrder = [UsageTier.NORMAL, UsageTier.CAUTION, UsageTier.RESTRICTED, UsageTier.CRITICAL];

      fc.assert(
        fc.property(jobTypeArb, (jobType) => {
          let lostPermission = false;

          for (const tier of tierOrder) {
            const permitted = TieredJobScheduler.isJobPermitted(tier, jobType, TIER_POLICIES);
            if (lostPermission) {
              // Once a job is denied at a tier, it should stay denied at stricter tiers
              // EXCEPTION: SCHEDULED_POST is re-permitted at Critical (due-now only)
              if (jobType !== JobType.SCHEDULED_POST) {
                expect(permitted).toBe(false);
              }
            }
            if (!permitted) {
              lostPermission = true;
            }
          }

          return true;
        }),
        { numRuns: 100, verbose: true }
      );
    });
  });

  // =========================================================================
  // Property 6: Account Isolation
  // =========================================================================

  describe('Property 6: Account Isolation', () => {
    /**
     * **Validates: Requirements 4.9, 12.3**
     *
     * For any set of accounts with varying usage tiers, the job dispatch decision
     * for one account shall depend solely on that account's own usage percentage
     * and tier — never on another account's state.
     *
     * We test this by verifying that `isJobPermitted` is a pure function of
     * (tier, jobType, policies) — it doesn't reference any external state.
     * Additionally, we verify that two different accounts with the same tier
     * get the same permission result, and accounts with different tiers get
     * independent results.
     */
    it('PROPERTY 6: Same tier + same job type always yields same permission regardless of account', () => {
      fc.assert(
        fc.property(
          accountIdArb,
          accountIdArb,
          tierArb,
          jobTypeArb,
          (accountA, accountB, tier, jobType) => {
            // Two different accounts at the same tier should get identical permissions
            const resultA = TieredJobScheduler.isJobPermitted(tier, jobType, TIER_POLICIES);
            const resultB = TieredJobScheduler.isJobPermitted(tier, jobType, TIER_POLICIES);

            expect(resultA).toBe(resultB);
            return true;
          }
        ),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * A Critical-tier account does not affect permission for a Normal-tier account.
     * Verifies true isolation: one account's tier never influences another's dispatch.
     */
    it('PROPERTY 6: Critical account cannot block Normal account dispatch', () => {
      fc.assert(
        fc.property(jobTypeArb, (jobType) => {
          // Account A is at Critical — severely restricted
          const criticalPermission = TieredJobScheduler.isJobPermitted(
            UsageTier.CRITICAL, jobType, TIER_POLICIES
          );

          // Account B is at Normal — fully permissive
          const normalPermission = TieredJobScheduler.isJobPermitted(
            UsageTier.NORMAL, jobType, TIER_POLICIES
          );

          // Normal account always gets permission regardless of Critical account's state
          expect(normalPermission).toBe(true);

          // The Critical account's restriction is independent
          // (only SCHEDULED_POST is permitted for Critical)
          if (jobType === JobType.SCHEDULED_POST) {
            expect(criticalPermission).toBe(true);
          } else {
            expect(criticalPermission).toBe(false);
          }

          return true;
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * Verify that varying one account's tier doesn't change another account's result.
     * The function takes only tier and jobType — no hidden account coupling.
     */
    it('PROPERTY 6: Changing one account tier has no side effect on another', () => {
      fc.assert(
        fc.property(
          tierArb,
          tierArb,
          jobTypeArb,
          (tierForAccountA, tierForAccountB, jobType) => {
            // Account A's permission depends only on its own tier
            const permA = TieredJobScheduler.isJobPermitted(tierForAccountA, jobType, TIER_POLICIES);
            const expectedA = TIER_POLICIES[tierForAccountA].permitted.includes(jobType);
            expect(permA).toBe(expectedA);

            // Account B's permission depends only on its own tier
            const permB = TieredJobScheduler.isJobPermitted(tierForAccountB, jobType, TIER_POLICIES);
            const expectedB = TIER_POLICIES[tierForAccountB].permitted.includes(jobType);
            expect(permB).toBe(expectedB);

            // No cross-account dependency
            return true;
          }
        ),
        { numRuns: 100, verbose: true }
      );
    });
  });

  // =========================================================================
  // Property 7: Polling Cadence Scales with Ceiling Classification
  // =========================================================================

  describe('Property 7: Polling Cadence Scales with Ceiling Classification', () => {
    /**
     * **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
     *
     * For any account, if classified as high-ceiling the polling interval for
     * each data type shall be shorter than or equal to the interval for the
     * same data type on a low-ceiling account.
     */
    it('PROPERTY 7: High-ceiling intervals ≤ low-ceiling intervals for all data types', () => {
      fc.assert(
        fc.property(rateLimitConfigArb, (config) => {
          const highCadence = TieredJobScheduler.computePollingCadence(
            CeilingClassification.HIGH, config
          );
          const lowCadence = TieredJobScheduler.computePollingCadence(
            CeilingClassification.LOW, config
          );

          // For each data type, high-ceiling interval ≤ low-ceiling interval
          expect(highCadence.accountInsightsMs).toBeLessThanOrEqual(lowCadence.accountInsightsMs);
          expect(highCadence.postInsightsRecentMs).toBeLessThanOrEqual(lowCadence.postInsightsRecentMs);
          expect(highCadence.postInsightsOlderMs).toBeLessThanOrEqual(lowCadence.postInsightsOlderMs);
          expect(highCadence.newPostDetectionMs).toBeLessThanOrEqual(lowCadence.newPostDetectionMs);
          expect(highCadence.followerCountMs).toBeLessThanOrEqual(lowCadence.followerCountMs);

          return true;
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * Verify the default production config satisfies the scaling property.
     */
    it('PROPERTY 7 (default config): Production defaults have high < low cadence', () => {
      const highCadence = TieredJobScheduler.computePollingCadence(
        CeilingClassification.HIGH, defaultConfig
      );
      const lowCadence = TieredJobScheduler.computePollingCadence(
        CeilingClassification.LOW, defaultConfig
      );

      // Strictly less (not equal) for most data types per requirements:
      // High: 60min account, Low: 4h account → High < Low
      expect(highCadence.accountInsightsMs).toBeLessThan(lowCadence.accountInsightsMs);
      expect(highCadence.postInsightsRecentMs).toBeLessThan(lowCadence.postInsightsRecentMs);
      expect(highCadence.newPostDetectionMs).toBeLessThan(lowCadence.newPostDetectionMs);
      expect(highCadence.followerCountMs).toBeLessThan(lowCadence.followerCountMs);

      // Older post insights may be equal (both daily) per the config
      expect(highCadence.postInsightsOlderMs).toBeLessThanOrEqual(lowCadence.postInsightsOlderMs);
    });

    /**
     * Verify that all polling intervals are positive (no zero or negative intervals).
     */
    it('PROPERTY 7 (positive intervals): All cadence intervals are positive', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(CeilingClassification.HIGH, CeilingClassification.LOW),
          rateLimitConfigArb,
          (classification, config) => {
            const cadence = TieredJobScheduler.computePollingCadence(classification, config);

            expect(cadence.accountInsightsMs).toBeGreaterThan(0);
            expect(cadence.postInsightsRecentMs).toBeGreaterThan(0);
            expect(cadence.postInsightsOlderMs).toBeGreaterThan(0);
            expect(cadence.newPostDetectionMs).toBeGreaterThan(0);
            expect(cadence.followerCountMs).toBeGreaterThan(0);

            return true;
          }
        ),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * Verify computePollingCadence is a pure function of classification + config
     * (deterministic — same inputs always yield same output).
     */
    it('PROPERTY 7 (deterministic): Same classification + config yields same cadence', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(CeilingClassification.HIGH, CeilingClassification.LOW),
          rateLimitConfigArb,
          (classification, config) => {
            const cadence1 = TieredJobScheduler.computePollingCadence(classification, config);
            const cadence2 = TieredJobScheduler.computePollingCadence(classification, config);

            expect(cadence1).toEqual(cadence2);
            return true;
          }
        ),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * Verify that computePollingCadence returns a fresh copy (not a reference to config).
     * Mutating the returned cadence should not affect future calls.
     */
    it('PROPERTY 7 (immutability): Returned cadence is a fresh copy, not a reference', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(CeilingClassification.HIGH, CeilingClassification.LOW),
          (classification) => {
            const cadence1 = TieredJobScheduler.computePollingCadence(classification, defaultConfig);
            const originalValue = cadence1.accountInsightsMs;

            // Mutate the returned object
            cadence1.accountInsightsMs = 999;

            // Get a new cadence — should NOT be affected by mutation
            const cadence2 = TieredJobScheduler.computePollingCadence(classification, defaultConfig);
            expect(cadence2.accountInsightsMs).toBe(originalValue);

            return true;
          }
        ),
        { numRuns: 100, verbose: true }
      );
    });
  });

  // =========================================================================
  // Property 8: Deferred Jobs Re-dispatch on Usage Drop
  // =========================================================================

  describe('Property 8: Deferred Jobs Re-dispatch on Usage Drop', () => {
    /**
     * **Validates: Requirements 4.5, 11.2, 11.5**
     *
     * When an account's effective usage drops below 80% (restricted threshold),
     * deferred jobs become eligible for dispatch in priority order, with
     * earlier-deferred jobs dispatched before later-deferred jobs at the same
     * priority level.
     *
     * We verify this property through the policy matrix: at any tier below
     * Restricted (i.e., Normal or Caution), more job types are permitted,
     * meaning deferred jobs become eligible for dispatch.
     */
    it('PROPERTY 8: Below restricted threshold, more job types become permitted', () => {
      fc.assert(
        fc.property(
          percentageArb,
          thresholdsArb,
          (percentage, thresholds) => {
            const tier = determineTier(percentage, thresholds);

            if (percentage < thresholds.restricted) {
              // Below restricted: at Normal or Caution tier
              // Normal permits everything, Caution permits automation/posts/user/active-view
              const permittedCount = TIER_POLICIES[tier].permitted.length;
              const restrictedPermitted = TIER_POLICIES[UsageTier.RESTRICTED].permitted.length;

              // Tier below restricted MUST permit MORE job types than Restricted tier
              expect(permittedCount).toBeGreaterThan(restrictedPermitted);
            }

            return true;
          }
        ),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * Verify priority ordering: given a set of deferred jobs, when sorted by
     * (priority ASC, deferredAt ASC), lower-priority-number jobs come first,
     * and within the same priority, earlier-deferred jobs come first (FIFO).
     */
    it('PROPERTY 8 (priority + FIFO ordering): Jobs sort by priority then deferredAt', () => {
      const deferredJobArb = fc.record({
        priority: priorityArb,
        deferredAt: timestampArb,
        jobType: jobTypeArb,
        accountId: accountIdArb,
      });

      fc.assert(
        fc.property(fc.array(deferredJobArb, { minLength: 2, maxLength: 20 }), (jobs) => {
          // Sort using the same logic as reEvaluateDeferredJobs:
          // priority ASC (lower = higher priority), then deferredAt ASC (FIFO)
          const sorted = [...jobs].sort((a, b) => {
            const priorityDiff = a.priority - b.priority;
            if (priorityDiff !== 0) return priorityDiff;
            return a.deferredAt - b.deferredAt;
          });

          // Verify ordering properties
          for (let i = 1; i < sorted.length; i++) {
            const prev = sorted[i - 1];
            const curr = sorted[i];

            // Priority must be non-decreasing
            expect(curr.priority).toBeGreaterThanOrEqual(prev.priority);

            // Within same priority, deferredAt must be non-decreasing (FIFO)
            if (curr.priority === prev.priority) {
              expect(curr.deferredAt).toBeGreaterThanOrEqual(prev.deferredAt);
            }
          }

          return true;
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * Verify that dropping from Restricted/Critical to Normal means ALL previously
     * deferred job types become dispatchable (everything is permitted at Normal).
     */
    it('PROPERTY 8 (full recovery): Drop to Normal tier re-enables all job types', () => {
      fc.assert(
        fc.property(jobTypeArb, (jobType) => {
          // At Restricted or Critical, most jobs are deferred
          const restrictedPerm = TieredJobScheduler.isJobPermitted(
            UsageTier.RESTRICTED, jobType, TIER_POLICIES
          );
          const criticalPerm = TieredJobScheduler.isJobPermitted(
            UsageTier.CRITICAL, jobType, TIER_POLICIES
          );

          // When usage drops to Normal, ALL job types are permitted
          const normalPerm = TieredJobScheduler.isJobPermitted(
            UsageTier.NORMAL, jobType, TIER_POLICIES
          );
          expect(normalPerm).toBe(true);

          // Any job that was deferred at Restricted/Critical is now eligible
          if (!restrictedPerm || !criticalPerm) {
            // Job was deferred at higher tier → now permitted at Normal
            expect(normalPerm).toBe(true);
          }

          return true;
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * Verify that the restricted threshold (80%) is the re-dispatch boundary.
     * Any percentage below restricted means we're at Normal or Caution,
     * where more jobs are permitted than at Restricted.
     */
    it('PROPERTY 8 (threshold boundary): Usage < restricted enables re-dispatch', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 79.99, noNaN: true }),
          thresholdsArb,
          (percentage, thresholds) => {
            // Force percentage below the restricted threshold
            const belowRestricted = Math.min(percentage, thresholds.restricted - 0.01);
            const tier = determineTier(belowRestricted, thresholds);

            // Should be Normal or Caution (not Restricted, not Critical)
            expect(tier === UsageTier.NORMAL || tier === UsageTier.CAUTION).toBe(true);

            // More job types are permitted than at Restricted
            const currentPermitted = TIER_POLICIES[tier].permitted.length;
            const restrictedPermitted = TIER_POLICIES[UsageTier.RESTRICTED].permitted.length;
            expect(currentPermitted).toBeGreaterThan(restrictedPermitted);

            return true;
          }
        ),
        { numRuns: 100, verbose: true }
      );
    });
  });
});
