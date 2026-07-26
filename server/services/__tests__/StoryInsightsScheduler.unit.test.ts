/**
 * Unit / example tests for Story-Insights Hard-Deadline Handling
 * (smart-polling-system).
 *
 * These tests cover the behavioural branches of `StoryInsightsScheduler` that
 * the property tests (Properties 8 & 9, pure arithmetic) do not:
 *
 *   - Recurring + final-fetch scheduling on story detection (Req 5.1)
 *   - non-Critical override of headroom deferral + success (Req 5.3)
 *   - Critical-tier deferral while still before expiry (Req 5.4)
 *   - Critical deferral surviving to expiry → not-captured, stop (Req 5.5)
 *   - Meta error code 10 (<5 viewers) → insufficient data, no retry (Req 5.6)
 *   - story-insights webhook does NOT replace the safety net (Req 5.8)
 *   - successful final fetch cancels recurring polling (Req 5.9)
 *
 * The dedicated BullMQ queue is mocked (so no live Redis/BullMQ is required) and
 * `REDIS_URL` is set so the lazily-constructed queue is the mock. The tier
 * branch is driven by a fake `UsageStore` and the fetch result by a fake
 * `StoryInsightsFetcher`, both injected through the constructor.
 *
 * _Requirements: 5.1, 5.3, 5.4, 5.5, 5.6, 5.8, 5.9_
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// The story-insights queue is lazily constructed only when REDIS_URL is set.
// Set it before the module under test is imported so the mocked Queue is built.
process.env.REDIS_URL = 'redis://localhost:6379';

// ---------------------------------------------------------------------------
// Mocks — keep the queue inert (no live BullMQ / Redis).
// ---------------------------------------------------------------------------

// Shared, stable mock queue methods so call history can be asserted per test.
const mockQueueAdd = vi.fn().mockResolvedValue({});
const mockRemoveRepeatableByKey = vi.fn().mockResolvedValue(undefined);

vi.mock('bullmq', () => {
  class MockQueue {
    add = mockQueueAdd;
    removeRepeatableByKey = mockRemoveRepeatableByKey;
    getJobs = vi.fn().mockResolvedValue([]);
    on = vi.fn();
  }
  return { Queue: MockQueue };
});

vi.mock('../../lib/redis', () => ({
  getSharedRedisConnection: vi.fn(() => ({ status: 'ready' })),
}));

vi.mock('../../config/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Imported AFTER mocks are declared.
import {
  StoryInsightsScheduler,
  type StoryInsightsFetcher,
  type StoryInsightsJobData,
} from '../StoryInsightsScheduler';
import { UsageTier, type UsageStore } from '../UsageStore';
import { TieredJobScheduler } from '../TieredJobScheduler';
import { rateLimitConfig, type RateLimitConfig } from '../../config/rateLimitConfig';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const config: RateLimitConfig = rateLimitConfig;
const { storyLifetimeMs, storyRecurringIntervalMs } = config.smartPolling;

const ACCOUNT_ID = 'acct-123';
const STORY_ID = 'story-456';
// A fixed, realistic publish time so expiry arithmetic is deterministic.
const PUBLISH_TIME_MS = 1_700_000_000_000;

/** Build a fake UsageStore whose `getTier` resolves to the given tier. */
function makeUsageStore(tier: UsageTier): UsageStore {
  return {
    getTier: vi.fn().mockResolvedValue(tier),
  } as unknown as UsageStore;
}

/** Minimal TieredJobScheduler stand-in — never touched by the tested paths. */
const schedulerStub = {} as TieredJobScheduler;

function makeScheduler(tier: UsageTier, fetcher: StoryInsightsFetcher): StoryInsightsScheduler {
  return new StoryInsightsScheduler(schedulerStub, makeUsageStore(tier), config, fetcher);
}

function finalJobData(): StoryInsightsJobData {
  return { accountId: ACCOUNT_ID, storyId: STORY_ID, publishTimeMs: PUBLISH_TIME_MS, kind: 'final' };
}

beforeEach(() => {
  process.env.REDIS_URL = 'redis://localhost:6379';
  mockQueueAdd.mockClear();
  mockRemoveRepeatableByKey.mockClear();
});

// ---------------------------------------------------------------------------
// Req 5.1 — recurring + final-fetch scheduling on story detection
// ---------------------------------------------------------------------------

describe('StoryInsightsScheduler.onStoryDetected (Req 5.1)', () => {
  it('schedules a recurring Story_Insights_Job at the configured interval plus a final fetch', async () => {
    const fetcher = vi.fn().mockResolvedValue(undefined);
    const scheduler = makeScheduler(UsageTier.NORMAL, fetcher);

    await scheduler.onStoryDetected(ACCOUNT_ID, STORY_ID, PUBLISH_TIME_MS);

    // Two jobs enqueued: the recurring poll and the single final fetch.
    expect(mockQueueAdd).toHaveBeenCalledTimes(2);

    const recurringCall = mockQueueAdd.mock.calls.find(
      ([, data]) => (data as StoryInsightsJobData).kind === 'recurring'
    );
    const finalCall = mockQueueAdd.mock.calls.find(
      ([, data]) => (data as StoryInsightsJobData).kind === 'final'
    );

    expect(recurringCall).toBeDefined();
    expect(finalCall).toBeDefined();

    // Recurring job repeats at the configured interval (Req 5.1).
    const recurringOpts = recurringCall![2] as { repeat?: { every?: number } };
    expect(recurringOpts.repeat?.every).toBe(storyRecurringIntervalMs);
  });
});

// ---------------------------------------------------------------------------
// Req 5.3 + 5.9 — non-Critical overrides deferral, succeeds, cancels recurring
// ---------------------------------------------------------------------------

describe('StoryInsightsScheduler.runFinalFetch — non-Critical success (Req 5.3, 5.9)', () => {
  it('executes the fetch and cancels recurring polling on success', async () => {
    const fetcher = vi.fn().mockResolvedValue(undefined);
    const scheduler = makeScheduler(UsageTier.NORMAL, fetcher);

    // now is before expiry — but non-Critical must still execute regardless.
    const now = PUBLISH_TIME_MS + 1000;
    const outcome = await scheduler.runFinalFetch(finalJobData(), { now });

    expect(outcome).toEqual({ status: 'success' });
    // Req 5.3 — the fetch actually ran (deferral overridden).
    expect(fetcher).toHaveBeenCalledTimes(1);
    // Req 5.9 — recurring polling cancelled by its deterministic key.
    expect(mockRemoveRepeatableByKey).toHaveBeenCalledWith(
      `story-insights-recurring-${ACCOUNT_ID}-${STORY_ID}`
    );
  });
});

// ---------------------------------------------------------------------------
// Req 5.4 — Critical tier defers while still before expiry
// ---------------------------------------------------------------------------

describe('StoryInsightsScheduler.runFinalFetch — Critical before expiry (Req 5.4)', () => {
  it('defers without fetching when the account is Critical and the story has not expired', async () => {
    const fetcher = vi.fn().mockResolvedValue(undefined);
    const scheduler = makeScheduler(UsageTier.CRITICAL, fetcher);

    const now = PUBLISH_TIME_MS + 1000; // well before the 24h expiry
    const outcome = await scheduler.runFinalFetch(finalJobData(), { now });

    expect(outcome).toEqual({ status: 'deferred', reason: 'critical_tier' });
    // No fetch performed and recurring polling left intact while deferred.
    expect(fetcher).not.toHaveBeenCalled();
    expect(mockRemoveRepeatableByKey).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Req 5.5 — Critical deferral surviving to expiry → not-captured, stop
// ---------------------------------------------------------------------------

describe('StoryInsightsScheduler.runFinalFetch — Critical past expiry (Req 5.5)', () => {
  it('records not-captured and stops further polling when expired in Critical tier', async () => {
    const fetcher = vi.fn().mockResolvedValue(undefined);
    const scheduler = makeScheduler(UsageTier.CRITICAL, fetcher);

    const now = PUBLISH_TIME_MS + storyLifetimeMs + 1000; // past 24h expiry
    const outcome = await scheduler.runFinalFetch(finalJobData(), { now });

    expect(outcome).toEqual({ status: 'not_captured', reason: 'expired_in_critical' });
    // No fetch attempted; recurring polling stopped (no further attempts).
    expect(fetcher).not.toHaveBeenCalled();
    expect(mockRemoveRepeatableByKey).toHaveBeenCalledWith(
      `story-insights-recurring-${ACCOUNT_ID}-${STORY_ID}`
    );
  });
});

// ---------------------------------------------------------------------------
// Req 5.6 — Meta error code 10 (<5 viewers) → insufficient data, no retry
// ---------------------------------------------------------------------------

describe('StoryInsightsScheduler.runFinalFetch — error code 10 (Req 5.6)', () => {
  it('records insufficient data and does not schedule a retry on error code 10', async () => {
    const code10Error = Object.assign(new Error('Not enough viewers'), { code: 10 });
    const fetcher = vi.fn().mockRejectedValue(code10Error);
    const scheduler = makeScheduler(UsageTier.NORMAL, fetcher);

    const now = PUBLISH_TIME_MS + 1000; // plenty of time left before expiry
    const outcome = await scheduler.runFinalFetch(finalJobData(), { now });

    expect(outcome).toEqual({ status: 'insufficient_data' });
    expect(fetcher).toHaveBeenCalledTimes(1);

    // No retry job was enqueued (only the recurring-poll cancellation happened).
    const retryAdds = mockQueueAdd.mock.calls.filter(([, data]) => {
      const jobData = data as StoryInsightsJobData;
      return jobData.kind === 'final';
    });
    expect(retryAdds).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Req 5.8 — story-insights webhook does NOT replace the safety net
// ---------------------------------------------------------------------------

describe('StoryInsightsScheduler.onStoryInsightsWebhook (Req 5.8)', () => {
  it('is a no-op with respect to scheduled jobs: does not cancel recurring polling and does not throw', () => {
    const fetcher = vi.fn().mockResolvedValue(undefined);
    const scheduler = makeScheduler(UsageTier.NORMAL, fetcher);

    const cancelSpy = vi.spyOn(scheduler, 'cancelRecurringPolling');

    expect(() => scheduler.onStoryInsightsWebhook(ACCOUNT_ID, STORY_ID)).not.toThrow();

    // The recurring + final jobs remain the safety net — nothing cancelled.
    expect(cancelSpy).not.toHaveBeenCalled();
    expect(mockRemoveRepeatableByKey).not.toHaveBeenCalled();
  });
});
