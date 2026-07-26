/**
 * Unit Tests for GovernedHttpClient
 *
 * Tests timeout behavior, retry logic with exponential backoff,
 * deduplication window, header parsing edge cases, and error propagation.
 *
 * Requirements validated: 1.5, 1.6, 1.7
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import axios from 'axios';
import {
  GovernedHttpClient,
  GovernedHttpClientError,
  type GovernedHttpClientConfig,
  type GovernedRequestOptions,
} from '../GovernedHttpClient';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

vi.mock('../../config/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../config/rateLimitConfig', () => ({
  rateLimitConfig: {
    httpTimeoutMs: 10000,
    maxRetries: 3,
    deduplicationWindowMs: 2000,
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: GovernedHttpClientConfig = {
  baseUrl: 'https://graph.facebook.com',
  timeout: 10000,
  maxRetries: 3,
  deduplicationWindowMs: 2000,
};

function createMockUsageStore() {
  return {
    updateUsage: vi.fn().mockResolvedValue(undefined),
    escalateToCritical: vi.fn().mockResolvedValue(undefined),
    getEffectiveUsage: vi.fn().mockResolvedValue({ percentage: 0, tier: 'NORMAL', isStale: false }),
    getUsageRecord: vi.fn().mockResolvedValue(null),
    updateImpressionsEstimate: vi.fn().mockResolvedValue(undefined),
    getTier: vi.fn().mockResolvedValue('NORMAL'),
    getCeilingClassification: vi.fn().mockResolvedValue('LOW'),
  };
}

function createAxiosResponse(data: unknown, headers: Record<string, string> = {}, status = 200) {
  return {
    data,
    headers,
    status,
    statusText: 'OK',
    config: {} as any,
  };
}

function createAxiosError(
  status: number,
  data: unknown = {},
  headers: Record<string, string> = {},
  message = 'Request failed'
) {
  const error = new Error(message) as any;
  error.isAxiosError = true;
  error.response = { data, headers, status, statusText: 'Error', config: {} };
  error.message = message;
  return error;
}

const DEFAULT_REQUEST: GovernedRequestOptions = {
  method: 'GET',
  path: '/v22.0/123/insights',
  token: 'test-token',
  accountId: 'acc-123',
  params: { metric: 'impressions' },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GovernedHttpClient — Unit Tests', () => {
  let client: GovernedHttpClient;
  let mockUsageStore: ReturnType<typeof createMockUsageStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockUsageStore = createMockUsageStore();
    client = new GovernedHttpClient(DEFAULT_CONFIG, mockUsageStore as any);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Header Parsing: parseBusinessUseCaseHeader edge cases
  // =========================================================================
  describe('parseBusinessUseCaseHeader', () => {
    it('returns empty map for empty string', () => {
      const result = client.parseBusinessUseCaseHeader('');
      expect(result.size).toBe(0);
    });

    it('returns empty map for whitespace-only string', () => {
      const result = client.parseBusinessUseCaseHeader('   ');
      expect(result.size).toBe(0);
    });

    it('returns empty map for malformed JSON', () => {
      const result = client.parseBusinessUseCaseHeader('{not valid json}');
      expect(result.size).toBe(0);
    });

    it('returns empty map for JSON null', () => {
      const result = client.parseBusinessUseCaseHeader('null');
      expect(result.size).toBe(0);
    });

    it('returns empty map for JSON array', () => {
      const result = client.parseBusinessUseCaseHeader('[1, 2, 3]');
      expect(result.size).toBe(0);
    });

    it('defaults missing fields to 0 for partial entries', () => {
      const header = JSON.stringify({
        'acct-1': [{ call_count: 50 }], // missing total_cputime, total_time, estimated_time_to_regain_access
      });
      const result = client.parseBusinessUseCaseHeader(header);
      expect(result.size).toBe(1);
      const metrics = result.get('acct-1')!;
      expect(metrics.callCountPct).toBe(50);
      expect(metrics.totalCputimePct).toBe(0);
      expect(metrics.totalTimePct).toBe(0);
      expect(metrics.estimatedMinutesToRegainAccess).toBe(0);
    });

    it('caps at 32 accounts', () => {
      const headerObj: Record<string, any[]> = {};
      for (let i = 0; i < 40; i++) {
        headerObj[`acct-${i}`] = [{ call_count: i, total_cputime: i, total_time: i }];
      }
      const result = client.parseBusinessUseCaseHeader(JSON.stringify(headerObj));
      expect(result.size).toBe(32);
    });

    it('parses valid multi-account header correctly', () => {
      const header = JSON.stringify({
        'acct-A': [{ call_count: 28, total_cputime: 25, total_time: 27, estimated_time_to_regain_access: 0 }],
        'acct-B': [{ call_count: 90, total_cputime: 85, total_time: 88, estimated_time_to_regain_access: 15 }],
      });
      const result = client.parseBusinessUseCaseHeader(header);
      expect(result.size).toBe(2);
      expect(result.get('acct-A')).toEqual({
        callCountPct: 28,
        totalCputimePct: 25,
        totalTimePct: 27,
        estimatedMinutesToRegainAccess: 0,
      });
      expect(result.get('acct-B')).toEqual({
        callCountPct: 90,
        totalCputimePct: 85,
        totalTimePct: 88,
        estimatedMinutesToRegainAccess: 15,
      });
    });

    it('skips entries with empty arrays', () => {
      const header = JSON.stringify({
        'acct-valid': [{ call_count: 10, total_cputime: 5, total_time: 3 }],
        'acct-empty': [],
      });
      const result = client.parseBusinessUseCaseHeader(header);
      expect(result.size).toBe(1);
      expect(result.has('acct-valid')).toBe(true);
      expect(result.has('acct-empty')).toBe(false);
    });

    it('handles string values for numbers gracefully', () => {
      const header = JSON.stringify({
        'acct-str': [{ call_count: '42', total_cputime: '10', total_time: '5' }],
      });
      const result = client.parseBusinessUseCaseHeader(header);
      const metrics = result.get('acct-str')!;
      expect(metrics.callCountPct).toBe(42);
      expect(metrics.totalCputimePct).toBe(10);
      expect(metrics.totalTimePct).toBe(5);
    });
  });

  // =========================================================================
  // Header Parsing: parseAppUsageHeader edge cases
  // =========================================================================
  describe('parseAppUsageHeader', () => {
    it('returns null for empty string', () => {
      expect(client.parseAppUsageHeader('')).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
      expect(client.parseAppUsageHeader('  ')).toBeNull();
    });

    it('returns null for malformed JSON', () => {
      expect(client.parseAppUsageHeader('not json at all')).toBeNull();
    });

    it('returns null for JSON null', () => {
      expect(client.parseAppUsageHeader('null')).toBeNull();
    });

    it('parses valid header with all fields', () => {
      const header = JSON.stringify({ call_count: 10, total_cputime: 5, total_time: 8 });
      const result = client.parseAppUsageHeader(header);
      expect(result).toEqual({
        callCountPct: 10,
        totalCputimePct: 5,
        totalTimePct: 8,
      });
    });

    it('defaults missing fields to 0', () => {
      const header = JSON.stringify({ call_count: 15 });
      const result = client.parseAppUsageHeader(header);
      expect(result).toEqual({
        callCountPct: 15,
        totalCputimePct: 0,
        totalTimePct: 0,
      });
    });
  });

  // =========================================================================
  // GovernedHttpClientError constructor and fields
  // =========================================================================
  describe('GovernedHttpClientError', () => {
    it('stores all fields correctly', () => {
      const error = new GovernedHttpClientError(
        'Rate limited',
        429,
        80002,
        'OAuthException',
        30,
        null
      );
      expect(error.message).toBe('Rate limited');
      expect(error.statusCode).toBe(429);
      expect(error.metaErrorCode).toBe(80002);
      expect(error.metaErrorType).toBe('OAuthException');
      expect(error.retryAfter).toBe(30);
      expect(error.usageMetrics).toBeNull();
      expect(error.name).toBe('GovernedHttpClientError');
    });

    it('is an instance of Error', () => {
      const error = new GovernedHttpClientError('test', 500, null, null, null, null);
      expect(error).toBeInstanceOf(Error);
    });

    it('includes usage metrics when provided', () => {
      const metrics = {
        accountMetrics: new Map(),
        appMetrics: { callCountPct: 10, totalCputimePct: 5, totalTimePct: 8 },
      };
      const error = new GovernedHttpClientError('test', 400, null, null, null, metrics);
      expect(error.usageMetrics).toBe(metrics);
    });
  });

  // =========================================================================
  // Timeout behavior (Requirement 1.7)
  // =========================================================================
  describe('timeout behavior', () => {
    it('passes configured timeout to axios', async () => {
      mockedAxios.mockResolvedValueOnce(createAxiosResponse({ ok: true }));

      await client.request(DEFAULT_REQUEST);

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({ timeout: 10000 })
      );
    });

    it('uses custom timeout from config', async () => {
      const shortTimeoutClient = new GovernedHttpClient(
        { ...DEFAULT_CONFIG, timeout: 5000 },
        mockUsageStore as any
      );
      mockedAxios.mockResolvedValueOnce(createAxiosResponse({ ok: true }));

      await shortTimeoutClient.request(DEFAULT_REQUEST);

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({ timeout: 5000 })
      );
    });
  });

  // =========================================================================
  // Retry logic with exponential backoff (Requirement 1.7)
  // =========================================================================
  describe('retry logic with exponential backoff', () => {
    it('retries on 5xx errors up to maxRetries', async () => {
      const error500 = createAxiosError(500, { error: { message: 'Server error' } });
      mockedAxios
        .mockRejectedValueOnce(error500)
        .mockRejectedValueOnce(error500)
        .mockRejectedValueOnce(error500)
        .mockResolvedValueOnce(createAxiosResponse({ ok: true }));

      const promise = client.request(DEFAULT_REQUEST);
      // Advance timers for retry delays
      await vi.advanceTimersByTimeAsync(100000);

      const result = await promise;
      expect(result.data).toEqual({ ok: true });
      // 1 initial + 3 retries = 4 total calls
      expect(mockedAxios).toHaveBeenCalledTimes(4);
    });

    it('throws after exhausting all retries on 5xx', async () => {
      const error500 = createAxiosError(500, { error: { message: 'Server error' } });
      mockedAxios
        .mockRejectedValueOnce(error500)
        .mockRejectedValueOnce(error500)
        .mockRejectedValueOnce(error500)
        .mockRejectedValueOnce(error500); // exceeds maxRetries

      const promise = client.request(DEFAULT_REQUEST).catch((e) => e);
      await vi.advanceTimersByTimeAsync(100000);

      const result = await promise;
      expect(result).toBeInstanceOf(GovernedHttpClientError);
    });

    it('does not retry on 4xx errors (non-5xx)', async () => {
      const error400 = createAxiosError(400, { error: { message: 'Bad request' } });
      mockedAxios.mockRejectedValueOnce(error400);

      const result = await client.request(DEFAULT_REQUEST).catch((e) => e);

      expect(result).toBeInstanceOf(GovernedHttpClientError);
      expect(mockedAxios).toHaveBeenCalledTimes(1); // no retry
    });

    it('does not retry on 429 (rate limit) — escalates to Critical instead', async () => {
      const error429 = createAxiosError(429, {
        error: { code: 80002, type: 'OAuthException', message: 'Rate limit' },
      });
      mockedAxios.mockRejectedValueOnce(error429);

      const result = await client.request(DEFAULT_REQUEST).catch((e) => e);

      expect(result).toBeInstanceOf(GovernedHttpClientError);
      expect(mockedAxios).toHaveBeenCalledTimes(1);
      expect(mockUsageStore.escalateToCritical).toHaveBeenCalledWith('acc-123', expect.any(Number));
    });

    it('uses a shorter max retries when configured lower', async () => {
      const singleRetryClient = new GovernedHttpClient(
        { ...DEFAULT_CONFIG, maxRetries: 1 },
        mockUsageStore as any
      );
      const error500 = createAxiosError(500);
      mockedAxios
        .mockRejectedValueOnce(error500)
        .mockRejectedValueOnce(error500);

      const promise = singleRetryClient.request(DEFAULT_REQUEST).catch((e) => e);
      await vi.advanceTimersByTimeAsync(100000);

      const result = await promise;
      expect(result).toBeInstanceOf(GovernedHttpClientError);
      // 1 initial + 1 retry = 2 calls
      expect(mockedAxios).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // Request deduplication (Requirement 1.7)
  // =========================================================================
  describe('request deduplication', () => {
    it('deduplicates identical GET requests within the dedup window', async () => {
      mockedAxios.mockResolvedValueOnce(createAxiosResponse({ data: 'shared' }));

      // Fire two identical requests concurrently
      const promise1 = client.request(DEFAULT_REQUEST);
      const promise2 = client.request(DEFAULT_REQUEST);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // Both resolve to same data, but axios called only once
      expect(result1.data).toEqual({ data: 'shared' });
      expect(result2.data).toEqual({ data: 'shared' });
      expect(mockedAxios).toHaveBeenCalledTimes(1);
    });

    it('does NOT deduplicate POST requests', async () => {
      mockedAxios
        .mockResolvedValueOnce(createAxiosResponse({ id: 1 }))
        .mockResolvedValueOnce(createAxiosResponse({ id: 2 }));

      const postRequest: GovernedRequestOptions = {
        ...DEFAULT_REQUEST,
        method: 'POST',
        body: { text: 'hello' },
      };

      const promise1 = client.request(postRequest);
      const promise2 = client.request(postRequest);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1.data).toEqual({ id: 1 });
      expect(result2.data).toEqual({ id: 2 });
      expect(mockedAxios).toHaveBeenCalledTimes(2);
    });

    it('does NOT deduplicate GET requests with different params', async () => {
      mockedAxios
        .mockResolvedValueOnce(createAxiosResponse({ data: 'first' }))
        .mockResolvedValueOnce(createAxiosResponse({ data: 'second' }));

      const request1: GovernedRequestOptions = {
        ...DEFAULT_REQUEST,
        params: { metric: 'impressions' },
      };
      const request2: GovernedRequestOptions = {
        ...DEFAULT_REQUEST,
        params: { metric: 'reach' },
      };

      const [result1, result2] = await Promise.all([
        client.request(request1),
        client.request(request2),
      ]);

      expect(result1.data).toEqual({ data: 'first' });
      expect(result2.data).toEqual({ data: 'second' });
      expect(mockedAxios).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // Error propagation with usage header parsing (Requirement 1.6)
  // =========================================================================
  describe('error propagation with usage header parsing', () => {
    it('parses usage headers from 4xx error responses before throwing', async () => {
      const bucHeader = JSON.stringify({
        'acc-123': [{ call_count: 75, total_cputime: 60, total_time: 50, estimated_time_to_regain_access: 0 }],
      });
      const error400 = createAxiosError(
        400,
        { error: { code: 100, message: 'Invalid param' } },
        { 'x-business-use-case-usage': bucHeader }
      );
      mockedAxios.mockRejectedValueOnce(error400);

      const result = await client.request(DEFAULT_REQUEST).catch((e) => e);
      expect(result).toBeInstanceOf(GovernedHttpClientError);
      expect(mockUsageStore.updateUsage).toHaveBeenCalledWith('acc-123', {
        callCountPct: 75,
        totalCputimePct: 60,
        totalTimePct: 50,
        estimatedMinutesToRegainAccess: 0,
      });
    });

    it('parses usage headers from 5xx error responses on final retry failure', async () => {
      const bucHeader = JSON.stringify({
        'acc-123': [{ call_count: 30, total_cputime: 20, total_time: 15 }],
      });
      const error500 = createAxiosError(
        500,
        { error: { message: 'Internal error' } },
        { 'x-business-use-case-usage': bucHeader }
      );
      // Fill all retries + 1 initial
      mockedAxios
        .mockRejectedValueOnce(error500)
        .mockRejectedValueOnce(error500)
        .mockRejectedValueOnce(error500)
        .mockRejectedValueOnce(error500);

      const promise = client.request(DEFAULT_REQUEST).catch((e) => e);
      await vi.advanceTimersByTimeAsync(100000);

      const result = await promise;
      expect(result).toBeInstanceOf(GovernedHttpClientError);
      // Each retry attempt should parse headers
      expect(mockUsageStore.updateUsage).toHaveBeenCalled();
    });

    it('escalates to Critical on HTTP 429 and includes usage metrics in error', async () => {
      const bucHeader = JSON.stringify({
        'acc-123': [{ call_count: 98, total_cputime: 95, total_time: 97, estimated_time_to_regain_access: 25 }],
      });
      const error429 = createAxiosError(
        429,
        { error: { code: 80002, type: 'OAuthException', message: 'Too many calls' } },
        { 'x-business-use-case-usage': bucHeader }
      );
      mockedAxios.mockRejectedValueOnce(error429);

      try {
        await client.request(DEFAULT_REQUEST);
        expect.fail('Should have thrown');
      } catch (err) {
        const e = err as GovernedHttpClientError;
        expect(e).toBeInstanceOf(GovernedHttpClientError);
        expect(e.statusCode).toBe(429);
        expect(e.metaErrorCode).toBe(80002);
        expect(e.metaErrorType).toBe('OAuthException');
        expect(e.retryAfter).toBe(25);
        expect(e.usageMetrics).not.toBeNull();
        expect(e.usageMetrics!.accountMetrics.get('acc-123')).toEqual({
          callCountPct: 98,
          totalCputimePct: 95,
          totalTimePct: 97,
          estimatedMinutesToRegainAccess: 25,
        });
      }

      expect(mockUsageStore.escalateToCritical).toHaveBeenCalledWith('acc-123', 25);
    });

    it('does not overwrite store when error response has no usage headers', async () => {
      const error400 = createAxiosError(400, { error: { message: 'Bad' } }, {});
      mockedAxios.mockRejectedValueOnce(error400);

      const result = await client.request(DEFAULT_REQUEST).catch((e) => e);
      expect(result).toBeInstanceOf(GovernedHttpClientError);
      // updateUsage should not be called since no headers
      expect(mockUsageStore.updateUsage).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Successful request with usage header parsing
  // =========================================================================
  describe('successful requests', () => {
    it('writes usage metrics to store on successful response', async () => {
      const bucHeader = JSON.stringify({
        'acc-123': [{ call_count: 15, total_cputime: 10, total_time: 12, estimated_time_to_regain_access: 0 }],
      });
      mockedAxios.mockResolvedValueOnce(
        createAxiosResponse({ result: 'data' }, { 'x-business-use-case-usage': bucHeader })
      );

      const result = await client.request(DEFAULT_REQUEST);

      expect(result.data).toEqual({ result: 'data' });
      expect(result.statusCode).toBe(200);
      expect(mockUsageStore.updateUsage).toHaveBeenCalledWith('acc-123', {
        callCountPct: 15,
        totalCputimePct: 10,
        totalTimePct: 12,
        estimatedMinutesToRegainAccess: 0,
      });
    });

    it('does not write to store when no usage headers present (Req 1.5)', async () => {
      mockedAxios.mockResolvedValueOnce(createAxiosResponse({ ok: true }, {}));

      await client.request(DEFAULT_REQUEST);

      expect(mockUsageStore.updateUsage).not.toHaveBeenCalled();
    });

    it('writes app-level metrics to store when X-App-Usage present', async () => {
      const appHeader = JSON.stringify({ call_count: 8, total_cputime: 3, total_time: 5 });
      mockedAxios.mockResolvedValueOnce(
        createAxiosResponse({ ok: true }, { 'x-app-usage': appHeader })
      );

      await client.request(DEFAULT_REQUEST);

      // Since no BUC header for acc-123, app-level metrics are written against accountId
      expect(mockUsageStore.updateUsage).toHaveBeenCalledWith('acc-123', {
        callCountPct: 8,
        totalCputimePct: 3,
        totalTimePct: 5,
        estimatedMinutesToRegainAccess: 0,
      });
    });
  });
});
