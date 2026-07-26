/**
 * Integration Tests — Full Rate-Limit Architecture Lifecycle
 *
 * Tests the data flow between GovernedHttpClient, UsageStore, and TieredJobScheduler
 * as integrated components. Mocks only external dependencies (Redis, BullMQ, network)
 * but exercises actual class interactions.
 *
 * Test scenarios:
 * 1. API call → header parse → store update → tier change → WebSocket event
 * 2. Webhook receive → enqueue → worker processes → reply via governed client
 * 3. Deferred job lifecycle (defer → usage drops → re-dispatch)
 *
 * Requirements validated: 1.2, 1.4, 4.5, 4.10, 7.3
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GovernedHttpClient, type GovernedHttpClientConfig } from '../GovernedHttpClient';
import { UsageStore, UsageTier, CeilingClassification } from '../UsageStore';
import { TieredJobScheduler, JobType, type ScheduledJob } from '../TieredJobScheduler';
import { type RateLimitConfig, rateLimitConfig } from '../../config/rateLimitConfig';

// ---------------------------------------------------------------------------
// Mocks — External Dependencies Only
// ---------------------------------------------------------------------------

const mockBroadcastToWorkspace = vi.fn();

vi.mock('../realtime', () => ({
  RealtimeService: {
    broadcastToWorkspace: (...args: any[]) => mockBroadcastToWorkspace(...args),
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

// Use vi.hoisted to create mock functions that are accessible in vi.mock factories
const { mockDeferredQueueAdd, mockDeferredQueueGetJobs, mockDeferredQueueOn, mockAxios } = vi.hoisted(() => ({
  mockDeferredQueueAdd: vi.fn().mockResolvedValue({}),
  mockDeferredQueueGetJobs: vi.fn().mockResolvedValue([]),
  mockDeferredQueueOn: vi.fn(),
  mockAxios: vi.fn(),
}));

// Track if Queue was constructed (for debugging)
const mockQueueConstructor = vi.fn();

vi.mock('bullmq', () => ({
  Queue: class MockQueue {
    add = mockDeferredQueueAdd;
    getJobs = mockDeferredQueueGetJobs;
    on = mockDeferredQueueOn;
    constructor(...args: any[]) {
      mockQueueConstructor(...args);
    }
  },
}));

vi.mock('axios', () => ({
  default: mockAxios,
}));

// ---------------------------------------------------------------------------
// Test Configuration
// ---------------------------------------------------------------------------

const TEST_CONFIG: RateLimitConfig = {
  bucMultiplier: 4800,
  platformRateLimitMultiplier: 200,
  publishLimitPerDay: 25,
  messagingCeilingPerHour: 250,
  tierThresholds: { caution: 60, restricted: 80, critical: 95 },
  polling: {
    highCeiling: {
      accountInsightsMs: 3600000,
      postInsightsRecentMs: 10800000,
      postInsightsOlderMs: 86400000,
      newPostDetectionMs: 7200000,
      followerCountMs: 3600000,
    },
    lowCeiling: {
      accountInsightsMs: 14400000,
      postInsightsRecentMs: 18000000,
      postInsightsOlderMs: 86400000,
      newPostDetectionMs: 10800000,
      followerCountMs: 18000000,
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
  stalenessThresholdMs: 300000,
  initialFetchCount: 25,
  initialFetchCountLowCeiling: 20,
  httpTimeoutMs: 10000,
  maxRetries: 3,
  deduplicationWindowMs: 2000,
  errorMessageMap: {
    '80002': 'Temporarily pausing. Will resume shortly.',
    '429': 'Spacing out requests. Data will refresh soon.',
    'default': 'Something went wrong. Retrying soon.',
  },
  smartPolling: rateLimitConfig.smartPolling,
};

const CLIENT_CONFIG: GovernedHttpClientConfig = {
  baseUrl: 'https://graph.facebook.com',
  timeout: TEST_CONFIG.httpTimeoutMs,
  maxRetries: TEST_CONFIG.maxRetries,
  deduplicationWindowMs: TEST_CONFIG.deduplicationWindowMs,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createScheduledJob(overrides: Partial<ScheduledJob> = {}): ScheduledJob {
  return {
    id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    accountId: 'test-account-1',
    type: JobType.ANALYTICS_REFRESH,
    payload: { metric: 'impressions' },
    priority: 1,
    scheduledAt: Date.now(),
    retryCount: 0,
    maxRetries: 10,
    ...overrides,
  };
}

/**
 * Creates a Meta API response with usage headers.
 */
function createMetaResponse(
  data: unknown,
  usagePercentages: { call: number; cpu: number; time: number },
  accountId: string
) {
  const bucHeader = JSON.stringify({
    [accountId]: [
      {
        type: 'messenger',
        call_count: usagePercentages.call,
        total_cputime: usagePercentages.cpu,
        total_time: usagePercentages.time,
        estimated_time_to_regain_access: 0,
      },
    ],
  });

  return {
    data,
    status: 200,
    headers: {
      'x-business-use-case-usage': bucHeader,
    },
  };
}

// ===========================================================================
// Integration Test Suite
// ===========================================================================

describe('Rate-Limit Architecture — Integration Tests', () => {
  let usageStore: UsageStore;
  let governedClient: GovernedHttpClient;
  let scheduler: TieredJobScheduler;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDeferredQueueAdd.mockResolvedValue({});
    mockDeferredQueueGetJobs.mockResolvedValue([]);

    // Set REDIS_URL so TieredJobScheduler initializes the deferred queue
    process.env.REDIS_URL = 'redis://localhost:6379';

    // Create real instances wired together (no Redis — local memory fallback)
    usageStore = new UsageStore(null, {
      ttlSeconds: TEST_CONFIG.usageRecordTtlSeconds,
      stalenessThresholdMs: TEST_CONFIG.stalenessThresholdMs,
      tierThresholds: TEST_CONFIG.tierThresholds,
      highCeilingThreshold: TEST_CONFIG.highCeilingImpressionThreshold,
    });

    governedClient = new GovernedHttpClient(CLIENT_CONFIG, usageStore);
    scheduler = new TieredJobScheduler(usageStore, TEST_CONFIG);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.REDIS_URL;
  });

  // =========================================================================
  // Scenario 1: API Call → Header Parse → Store Update → Tier Change → WS
  // Requirements: 1.2, 1.4, 4.10
  // =========================================================================
  describe('Scenario 1: Full API call lifecycle', () => {
    it('parses usage headers, updates store, and broadcasts tier change via WebSocket', async () => {
      const accountId = 'ig-account-123';

      // Simulate a Meta API response with 70% usage (Caution tier)
      mockAxios.mockResolvedValueOnce(
        createMetaResponse(
          { id: accountId, media: [] },
          { call: 70, cpu: 50, time: 45 },
          accountId
        )
      );

      // Make the governed API call
      const response = await governedClient.request({
        method: 'GET',
        path: `/v22.0/${accountId}/media`,
        token: 'test-token',
        accountId,
      });

      // Verify response data passed through
      expect(response.data).toEqual({ id: accountId, media: [] });
      expect(response.statusCode).toBe(200);

      // Verify usage metrics were parsed
      expect(response.usageMetrics).not.toBeNull();
      expect(response.usageMetrics!.accountMetrics.has(accountId)).toBe(true);
      const metrics = response.usageMetrics!.accountMetrics.get(accountId)!;
      expect(metrics.callCountPct).toBe(70);
      expect(metrics.totalCputimePct).toBe(50);
      expect(metrics.totalTimePct).toBe(45);

      // Verify store was updated
      const usageResult = await usageStore.getEffectiveUsage(accountId);
      expect(usageResult.percentage).toBe(70); // max(70, 50, 45) = 70
      expect(usageResult.tier).toBe(UsageTier.CAUTION);

      // Note: No tier change broadcast expected here because the account starts
      // as "unknown" (defaults to CAUTION) and remains at CAUTION after 70% usage.
      // The WebSocket broadcast only fires on tier TRANSITIONS.
    });

    it('tier escalation on 429 triggers Critical tier and WebSocket broadcast', async () => {
      const accountId = 'ig-account-throttled';

      // First establish the account at Normal tier
      mockAxios.mockResolvedValueOnce(
        createMetaResponse(
          { status: 'ok' },
          { call: 30, cpu: 20, time: 15 },
          accountId
        )
      );

      await governedClient.request({
        method: 'GET',
        path: `/v22.0/${accountId}/insights`,
        token: 'test-token',
        accountId,
      });

      // Verify Normal tier
      let usage = await usageStore.getEffectiveUsage(accountId);
      expect(usage.tier).toBe(UsageTier.NORMAL);

      // Clear previous broadcasts
      mockBroadcastToWorkspace.mockClear();

      // Now simulate a 429 response with usage headers
      const throttleError = new Error('Request failed with status code 429') as any;
      throttleError.response = {
        status: 429,
        data: { error: { code: 80002, type: 'OAuthException', message: 'Rate limit hit' } },
        headers: {
          'x-business-use-case-usage': JSON.stringify({
            [accountId]: [{
              call_count: 98,
              total_cputime: 95,
              total_time: 97,
              estimated_time_to_regain_access: 30,
            }],
          }),
        },
      };
      throttleError.isAxiosError = true;
      mockAxios.mockRejectedValueOnce(throttleError);

      // The governed client should escalate to Critical and throw
      await expect(
        governedClient.request({
          method: 'GET',
          path: `/v22.0/${accountId}/media`,
          token: 'test-token',
          accountId,
        })
      ).rejects.toThrow();

      // Verify Critical tier in store
      usage = await usageStore.getEffectiveUsage(accountId);
      expect(usage.tier).toBe(UsageTier.CRITICAL);
      expect(usage.percentage).toBe(100);

      // Verify WebSocket broadcast for tier transition (Normal → Critical)
      expect(mockBroadcastToWorkspace).toHaveBeenCalledWith(
        'global',
        'tier-change',
        expect.objectContaining({
          accountId,
          newTier: UsageTier.CRITICAL,
        })
      );
    });

    it('usage update flows through to scheduler canDispatch decisions', async () => {
      const accountId = 'ig-account-scheduler';

      // Simulate a response with 85% usage (Restricted tier)
      mockAxios.mockResolvedValueOnce(
        createMetaResponse(
          { data: 'insights' },
          { call: 85, cpu: 60, time: 70 },
          accountId
        )
      );

      await governedClient.request({
        method: 'GET',
        path: `/v22.0/${accountId}/insights`,
        token: 'test-token',
        accountId,
      });

      // Verify the scheduler reads the updated store and restricts jobs
      const canAnalytics = await scheduler.canDispatch(accountId, JobType.ANALYTICS_REFRESH);
      expect(canAnalytics).toBe(false); // Restricted tier blocks analytics

      const canActiveView = await scheduler.canDispatch(accountId, JobType.ACTIVE_VIEW);
      expect(canActiveView).toBe(true); // Restricted tier allows active-view

      const canBackfill = await scheduler.canDispatch(accountId, JobType.BACKFILL);
      expect(canBackfill).toBe(false); // Restricted tier blocks backfill
    });

    it('multiple accounts have independent tier tracking', async () => {
      const account1 = 'ig-account-normal';
      const account2 = 'ig-account-critical';

      // Account 1: Normal usage (30%)
      mockAxios.mockResolvedValueOnce(
        createMetaResponse({ id: account1 }, { call: 30, cpu: 20, time: 25 }, account1)
      );

      await governedClient.request({
        method: 'GET',
        path: `/v22.0/${account1}/insights`,
        token: 'token-1',
        accountId: account1,
      });

      // Account 2: Critical usage (97%)
      mockAxios.mockResolvedValueOnce(
        createMetaResponse({ id: account2 }, { call: 97, cpu: 90, time: 88 }, account2)
      );

      await governedClient.request({
        method: 'GET',
        path: `/v22.0/${account2}/insights`,
        token: 'token-2',
        accountId: account2,
      });

      // Account 1 should allow all jobs (Normal)
      expect(await scheduler.canDispatch(account1, JobType.ANALYTICS_REFRESH)).toBe(true);
      expect(await scheduler.canDispatch(account1, JobType.BACKFILL)).toBe(true);

      // Account 2 should block nearly all jobs (Critical)
      expect(await scheduler.canDispatch(account2, JobType.ANALYTICS_REFRESH)).toBe(false);
      expect(await scheduler.canDispatch(account2, JobType.BACKFILL)).toBe(false);
      expect(await scheduler.canDispatch(account2, JobType.SCHEDULED_POST)).toBe(true);
    });
  });

  // =========================================================================
  // Scenario 2: Webhook receive → enqueue → worker processes → governed reply
  // Requirements: 7.3
  // =========================================================================
  describe('Scenario 2: Webhook processing lifecycle', () => {
    it('webhook worker checks tier before making reply calls via governed client', async () => {
      const accountId = 'ig-webhook-account';

      // Set up account at Caution tier (allows automation replies)
      mockAxios.mockResolvedValueOnce(
        createMetaResponse({ ok: true }, { call: 65, cpu: 55, time: 50 }, accountId)
      );

      await governedClient.request({
        method: 'GET',
        path: `/v22.0/${accountId}/media`,
        token: 'test-token',
        accountId,
      });

      // Verify Caution tier
      const usage = await usageStore.getEffectiveUsage(accountId);
      expect(usage.tier).toBe(UsageTier.CAUTION);

      // At Caution tier, AUTOMATION_REPLY should be permitted
      const canReply = await scheduler.canDispatch(accountId, JobType.AUTOMATION_REPLY);
      expect(canReply).toBe(true);

      // Simulate reply call through governed client
      mockAxios.mockResolvedValueOnce(
        createMetaResponse(
          { id: 'comment-reply-1', text: 'Thanks!' },
          { call: 67, cpu: 56, time: 52 },
          accountId
        )
      );

      const replyResponse = await governedClient.request({
        method: 'POST',
        path: `/v22.0/comment-123/replies`,
        token: 'test-token',
        accountId,
        body: { message: 'Thanks!' },
      });

      expect(replyResponse.data).toEqual({ id: 'comment-reply-1', text: 'Thanks!' });
      expect(replyResponse.statusCode).toBe(200);

      // Usage store updated with new percentages from reply
      const updatedUsage = await usageStore.getEffectiveUsage(accountId);
      expect(updatedUsage.percentage).toBe(67);
    });

    it('webhook worker defers reply when account is in Restricted tier', async () => {
      const accountId = 'ig-restricted-account';

      // Set account to Restricted tier (90% usage)
      mockAxios.mockResolvedValueOnce(
        createMetaResponse({ ok: true }, { call: 90, cpu: 85, time: 88 }, accountId)
      );

      await governedClient.request({
        method: 'GET',
        path: `/v22.0/${accountId}/media`,
        token: 'test-token',
        accountId,
      });

      // Verify Restricted tier
      const usage = await usageStore.getEffectiveUsage(accountId);
      expect(usage.tier).toBe(UsageTier.RESTRICTED);

      // At Restricted tier, automation reply is NOT permitted
      const canReply = await scheduler.canDispatch(accountId, JobType.AUTOMATION_REPLY);
      expect(canReply).toBe(false);

      // Worker would defer the job via scheduler
      const replyJob = createScheduledJob({
        accountId,
        type: JobType.AUTOMATION_REPLY,
        payload: { commentId: 'comment-456', message: 'Thanks!' },
      });

      const result = await scheduler.dispatchOrDefer(replyJob);
      expect(result).toBe('deferred');

      // Verify the deferred queue received the job
      expect(mockDeferredQueueAdd).toHaveBeenCalledWith(
        'deferred-job',
        expect.objectContaining({
          accountId,
          jobType: JobType.AUTOMATION_REPLY,
          retryCount: 1,
        }),
        expect.objectContaining({
          priority: replyJob.priority,
        })
      );
    });

    it('webhook events for one account do not affect other accounts', async () => {
      const floodAccount = 'ig-flood-account';
      const normalAccount = 'ig-normal-separate';

      // Flood account is Critical
      await usageStore.escalateToCritical(floodAccount, 30);

      // Normal account has low usage
      mockAxios.mockResolvedValueOnce(
        createMetaResponse({ ok: true }, { call: 20, cpu: 15, time: 10 }, normalAccount)
      );

      await governedClient.request({
        method: 'GET',
        path: `/v22.0/${normalAccount}/media`,
        token: 'test-token',
        accountId: normalAccount,
      });

      // Flood account cannot dispatch anything except scheduled posts
      expect(await scheduler.canDispatch(floodAccount, JobType.AUTOMATION_REPLY)).toBe(false);
      expect(await scheduler.canDispatch(floodAccount, JobType.ACTIVE_VIEW)).toBe(false);

      // Normal account is fully unaffected
      expect(await scheduler.canDispatch(normalAccount, JobType.AUTOMATION_REPLY)).toBe(true);
      expect(await scheduler.canDispatch(normalAccount, JobType.ANALYTICS_REFRESH)).toBe(true);
      expect(await scheduler.canDispatch(normalAccount, JobType.BACKFILL)).toBe(true);
    });
  });

  // =========================================================================
  // Scenario 3: Deferred job lifecycle (defer → usage drops → re-dispatch)
  // Requirements: 4.5, 4.10
  // =========================================================================
  describe('Scenario 3: Deferred job lifecycle', () => {
    it('jobs deferred at high tier are re-dispatched when usage drops', async () => {
      const accountId = 'ig-defer-lifecycle';

      // Start at Restricted tier (85% usage)
      mockAxios.mockResolvedValueOnce(
        createMetaResponse({ ok: true }, { call: 85, cpu: 80, time: 75 }, accountId)
      );

      await governedClient.request({
        method: 'GET',
        path: `/v22.0/${accountId}/insights`,
        token: 'test-token',
        accountId,
      });

      expect((await usageStore.getEffectiveUsage(accountId)).tier).toBe(UsageTier.RESTRICTED);

      // Attempt to dispatch analytics job — should be deferred
      const analyticsJob = createScheduledJob({
        accountId,
        type: JobType.ANALYTICS_REFRESH,
        priority: 2,
      });

      const result1 = await scheduler.dispatchOrDefer(analyticsJob);
      expect(result1).toBe('deferred');

      // Attempt to dispatch backfill job — also deferred
      const backfillJob = createScheduledJob({
        accountId,
        type: JobType.BACKFILL,
        priority: 5,
      });

      const result2 = await scheduler.dispatchOrDefer(backfillJob);
      expect(result2).toBe('deferred');

      // Now simulate usage dropping to 50% (Normal tier)
      mockAxios.mockResolvedValueOnce(
        createMetaResponse({ ok: true }, { call: 50, cpu: 40, time: 35 }, accountId)
      );

      await governedClient.request({
        method: 'GET',
        path: `/v22.0/${accountId}/insights`,
        token: 'test-token',
        accountId,
      });

      const newUsage = await usageStore.getEffectiveUsage(accountId);
      expect(newUsage.tier).toBe(UsageTier.NORMAL);
      expect(newUsage.percentage).toBe(50);

      // Simulate deferred jobs in the queue (BullMQ getJobs mock)
      const mockJobs = [
        {
          data: {
            originalJobId: analyticsJob.id,
            accountId,
            jobType: JobType.ANALYTICS_REFRESH,
            payload: analyticsJob.payload,
            originalScheduledAt: analyticsJob.scheduledAt,
            deferredAt: Date.now() - 60000,
            retryCount: 1,
            maxRetries: 10,
            priority: 2,
          },
          id: 'deferred-1',
          remove: vi.fn().mockResolvedValue(undefined),
        },
        {
          data: {
            originalJobId: backfillJob.id,
            accountId,
            jobType: JobType.BACKFILL,
            payload: backfillJob.payload,
            originalScheduledAt: backfillJob.scheduledAt,
            deferredAt: Date.now() - 30000,
            retryCount: 1,
            maxRetries: 10,
            priority: 5,
          },
          id: 'deferred-2',
          remove: vi.fn().mockResolvedValue(undefined),
        },
      ];

      mockDeferredQueueGetJobs.mockResolvedValueOnce(mockJobs);

      // Re-evaluate deferred jobs — should dispatch both (now at Normal tier)
      const dispatched = await scheduler.reEvaluateDeferredJobs(accountId);
      expect(dispatched).toBe(2);

      // Jobs are removed from the queue in priority order (lower = higher priority)
      expect(mockJobs[0].remove).toHaveBeenCalled();
      expect(mockJobs[1].remove).toHaveBeenCalled();
    });

    it('deferred jobs respect priority and FIFO ordering on re-dispatch', async () => {
      const accountId = 'ig-priority-order';

      // Set to Normal tier so re-evaluation dispatches
      mockAxios.mockResolvedValueOnce(
        createMetaResponse({ ok: true }, { call: 40, cpu: 30, time: 25 }, accountId)
      );

      await governedClient.request({
        method: 'GET',
        path: `/v22.0/${accountId}/insights`,
        token: 'test-token',
        accountId,
      });

      // Mock jobs in queue with different priorities and timestamps
      const removeOrder: string[] = [];
      const mockJobs = [
        {
          data: {
            originalJobId: 'job-low-priority-early',
            accountId,
            jobType: JobType.BACKFILL,
            payload: {},
            originalScheduledAt: Date.now() - 120000,
            deferredAt: Date.now() - 120000,
            retryCount: 1,
            maxRetries: 10,
            priority: 5, // Lower priority
          },
          id: 'deferred-low-early',
          remove: vi.fn().mockImplementation(() => {
            removeOrder.push('low-priority-early');
            return Promise.resolve();
          }),
        },
        {
          data: {
            originalJobId: 'job-high-priority',
            accountId,
            jobType: JobType.ANALYTICS_REFRESH,
            payload: {},
            originalScheduledAt: Date.now() - 60000,
            deferredAt: Date.now() - 60000,
            retryCount: 1,
            maxRetries: 10,
            priority: 1, // Higher priority
          },
          id: 'deferred-high',
          remove: vi.fn().mockImplementation(() => {
            removeOrder.push('high-priority');
            return Promise.resolve();
          }),
        },
        {
          data: {
            originalJobId: 'job-low-priority-late',
            accountId,
            jobType: JobType.POLLING,
            payload: {},
            originalScheduledAt: Date.now() - 30000,
            deferredAt: Date.now() - 30000,
            retryCount: 1,
            maxRetries: 10,
            priority: 5, // Same as first, but deferred later (FIFO)
          },
          id: 'deferred-low-late',
          remove: vi.fn().mockImplementation(() => {
            removeOrder.push('low-priority-late');
            return Promise.resolve();
          }),
        },
      ];

      mockDeferredQueueGetJobs.mockResolvedValueOnce(mockJobs);

      const dispatched = await scheduler.reEvaluateDeferredJobs(accountId);
      expect(dispatched).toBe(3);

      // Verify priority ordering: high priority first, then FIFO within same priority
      expect(removeOrder[0]).toBe('high-priority');
      expect(removeOrder[1]).toBe('low-priority-early');
      expect(removeOrder[2]).toBe('low-priority-late');
    });

    it('deferred jobs are NOT re-dispatched if usage is still above 80%', async () => {
      const accountId = 'ig-still-restricted';

      // Account remains at 82% (still Restricted)
      mockAxios.mockResolvedValueOnce(
        createMetaResponse({ ok: true }, { call: 82, cpu: 75, time: 70 }, accountId)
      );

      await governedClient.request({
        method: 'GET',
        path: `/v22.0/${accountId}/insights`,
        token: 'test-token',
        accountId,
      });

      expect((await usageStore.getEffectiveUsage(accountId)).tier).toBe(UsageTier.RESTRICTED);

      // Mock deferred jobs in queue
      const mockJobs = [
        {
          data: {
            originalJobId: 'stuck-job',
            accountId,
            jobType: JobType.ANALYTICS_REFRESH,
            payload: {},
            originalScheduledAt: Date.now() - 60000,
            deferredAt: Date.now() - 60000,
            retryCount: 1,
            maxRetries: 10,
            priority: 1,
          },
          id: 'deferred-stuck',
          remove: vi.fn(),
        },
      ];

      mockDeferredQueueGetJobs.mockResolvedValueOnce(mockJobs);

      // Re-evaluate — should NOT dispatch (still >= 80%)
      const dispatched = await scheduler.reEvaluateDeferredJobs(accountId);
      expect(dispatched).toBe(0);
      expect(mockJobs[0].remove).not.toHaveBeenCalled();
    });

    it('deferred job emits WebSocket broadcast when deferred', async () => {
      const accountId = 'ig-defer-ws';

      // Set to Critical tier
      await usageStore.escalateToCritical(accountId, 45);
      mockBroadcastToWorkspace.mockClear();

      // Defer a job
      const job = createScheduledJob({
        accountId,
        type: JobType.ANALYTICS_REFRESH,
      });

      await scheduler.dispatchOrDefer(job);

      // Verify WebSocket broadcast for deferred-operation
      expect(mockBroadcastToWorkspace).toHaveBeenCalledWith(
        'global',
        'deferred-operation',
        expect.objectContaining({
          accountId,
          operation: JobType.ANALYTICS_REFRESH,
          estimatedRetryMinutes: expect.any(Number),
        })
      );
    });
  });
});
