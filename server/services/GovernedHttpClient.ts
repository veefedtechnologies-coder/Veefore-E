/**
 * GovernedHttpClient — Single Governed HTTP Client for Meta API Calls
 *
 * ALL outbound requests to graph.facebook.com and graph.instagram.com MUST flow
 * through this client. It captures usage headers from every response, writes
 * metrics to UsageStore, handles retries with exponential backoff + jitter,
 * and supports request deduplication.
 *
 * Replaces `InstagramApiService.makeApiRequest` as the sole mechanism for
 * making outbound HTTP requests to Meta's APIs.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.9
 */

import axios, { AxiosResponse, AxiosError } from 'axios';
import crypto from 'crypto';
import { logger } from '../config/logger';
import { rateLimitConfig, type RateLimitConfig } from '../config/rateLimitConfig';
import { UsageStore, type AccountUsageMetrics } from './UsageStore';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/**
 * Configuration for the GovernedHttpClient instance.
 */
export interface GovernedHttpClientConfig {
  /** Base URL for the Meta Graph API (e.g., 'https://graph.facebook.com') */
  baseUrl: string;
  /** HTTP request timeout in milliseconds */
  timeout: number;
  /** Maximum retry attempts for failed requests */
  maxRetries: number;
  /** Window in ms during which duplicate requests are deduplicated */
  deduplicationWindowMs: number;
}

/**
 * Options for a single governed API request.
 */
export interface GovernedRequestOptions {
  /** HTTP method */
  method: 'GET' | 'POST';
  /** Request path (appended to baseUrl, e.g., '/v22.0/{accountId}/insights') */
  path: string;
  /** OAuth access token for the request */
  token: string;
  /** URL query parameters */
  params?: Record<string, string>;
  /** Request body (for POST requests) */
  body?: unknown;
  /** Instagram account ID for usage tracking — required */
  accountId: string;
  /** Priority level — affects retry behavior */
  priority?: 'critical' | 'normal' | 'low';
}

/**
 * Response from the GovernedHttpClient including parsed usage metrics.
 */
export interface GovernedResponse<T> {
  data: T;
  usageMetrics: ParsedUsageMetrics | null;
  statusCode: number;
}

/**
 * Parsed usage metrics from response headers.
 */
export interface ParsedUsageMetrics {
  accountMetrics: Map<string, AccountUsageMetrics>;
  appMetrics: AppUsageMetrics | null;
}

/**
 * App-level usage metrics from X-App-Usage header.
 */
export interface AppUsageMetrics {
  callCountPct: number;
  totalCputimePct: number;
  totalTimePct: number;
}

/**
 * Error thrown by GovernedHttpClient with additional context.
 */
export class GovernedHttpClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly metaErrorCode: number | null,
    public readonly metaErrorType: string | null,
    public readonly retryAfter: number | null,
    public readonly usageMetrics: ParsedUsageMetrics | null,
    public readonly metaErrorSubcode: number | null = null
  ) {
    super(message);
    this.name = 'GovernedHttpClientError';
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Meta BUC throttle error code */
const BUC_THROTTLE_ERROR_CODE = 80002;

/** Meta App-Level (Application) rate-limit throttle error code */
const APP_THROTTLE_ERROR_CODE = 4;

/** Default minutes to regain access when not provided by Meta */
const DEFAULT_MINUTES_TO_REGAIN = 60;

/** Base delay for exponential backoff (ms) */
const BASE_RETRY_DELAY_MS = 1000;

/** Maximum delay cap for retries (ms) */
const MAX_RETRY_DELAY_MS = 30000;

/** Backoff multiplier */
const BACKOFF_MULTIPLIER = 2;

// ---------------------------------------------------------------------------
// GovernedHttpClient Class
// ---------------------------------------------------------------------------

export class GovernedHttpClient {
  private config: GovernedHttpClientConfig;
  private usageStore: UsageStore;

  /**
   * In-flight request deduplication map.
   * Key: request hash, Value: { promise, timestamp }
   */
  private inflightRequests: Map<string, { promise: Promise<any>; timestamp: number }> = new Map();

  constructor(config: GovernedHttpClientConfig, usageStore: UsageStore) {
    this.config = config;
    this.usageStore = usageStore;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Make a governed HTTP request to Meta's API.
   * - Deduplicates identical concurrent requests within the deduplication window
   * - Retries on 5xx errors with exponential backoff + jitter
   * - Parses usage headers from every response (success or error)
   * - Writes parsed metrics to UsageStore
   * - Escalates to Critical tier on 429 / error code 80002
   * - Preserves previous store values when no usage headers present
   */
  async request<T>(options: GovernedRequestOptions): Promise<GovernedResponse<T>> {
    // Check for deduplication (only GET requests)
    if (options.method === 'GET') {
      const requestKey = this.computeRequestKey(options);
      const existing = this.getInflightRequest(requestKey);
      if (existing) {
        logger.debug('[GovernedHttpClient] Deduplicating request', {
          component: 'GovernedHttpClient',
          path: options.path,
        });
        return existing as Promise<GovernedResponse<T>>;
      }

      // Execute with deduplication tracking
      const promise = this.executeWithRetry<T>(options);
      this.trackInflightRequest(requestKey, promise);

      try {
        const result = await promise;
        return result;
      } finally {
        this.removeInflightRequest(requestKey);
      }
    }

    // POST requests are not deduplicated — execute directly
    return this.executeWithRetry<T>(options);
  }

  // -------------------------------------------------------------------------
  // Header Parsing — exposed for testing
  // -------------------------------------------------------------------------

  /**
   * Parse the `X-Business-Use-Case-Usage` header.
   *
   * Format:
   * ```json
   * {
   *   "{business_id}": [
   *     {
   *       "type": "...",
   *       "call_count": 28,
   *       "total_cputime": 25,
   *       "total_time": 27,
   *       "estimated_time_to_regain_access": 0
   *     }
   *   ],
   *   ...
   * }
   * ```
   *
   * Extracts up to 32 account entries.
   */
  parseBusinessUseCaseHeader(headerValue: string): Map<string, AccountUsageMetrics> {
    const result = new Map<string, AccountUsageMetrics>();

    if (!headerValue || headerValue.trim() === '') {
      return result;
    }

    try {
      const parsed = JSON.parse(headerValue);

      if (typeof parsed !== 'object' || parsed === null) {
        return result;
      }

      let entryCount = 0;
      for (const [accountId, entries] of Object.entries(parsed)) {
        if (entryCount >= 32) break; // Cap at 32 account entries

        if (!Array.isArray(entries) || entries.length === 0) {
          continue;
        }

        // Use the first (most relevant) entry for the account
        const entry = entries[0] as Record<string, unknown>;

        const callCountPct = this.safeParseNumber(entry.call_count, 0);
        const totalCputimePct = this.safeParseNumber(entry.total_cputime, 0);
        const totalTimePct = this.safeParseNumber(entry.total_time, 0);
        const estimatedMinutesToRegainAccess = this.safeParseNumber(
          entry.estimated_time_to_regain_access,
          0
        );

        result.set(accountId, {
          callCountPct,
          totalCputimePct,
          totalTimePct,
          estimatedMinutesToRegainAccess,
        });

        entryCount++;
      }
    } catch (error) {
      logger.warn('[GovernedHttpClient] Failed to parse X-Business-Use-Case-Usage header', {
        component: 'GovernedHttpClient',
        error: (error as Error).message,
      });
    }

    return result;
  }

  /**
   * Parse the `X-App-Usage` header.
   *
   * Format:
   * ```json
   * {
   *   "call_count": 10,
   *   "total_cputime": 5,
   *   "total_time": 8
   * }
   * ```
   */
  parseAppUsageHeader(headerValue: string): AppUsageMetrics | null {
    if (!headerValue || headerValue.trim() === '') {
      return null;
    }

    try {
      const parsed = JSON.parse(headerValue);

      if (typeof parsed !== 'object' || parsed === null) {
        return null;
      }

      return {
        callCountPct: this.safeParseNumber(parsed.call_count, 0),
        totalCputimePct: this.safeParseNumber(parsed.total_cputime, 0),
        totalTimePct: this.safeParseNumber(parsed.total_time, 0),
      };
    } catch (error) {
      logger.warn('[GovernedHttpClient] Failed to parse X-App-Usage header', {
        component: 'GovernedHttpClient',
        error: (error as Error).message,
      });
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Private: Request Execution
  // -------------------------------------------------------------------------

  /**
   * Execute a request with retry logic (exponential backoff + jitter).
   */
  private async executeWithRetry<T>(
    options: GovernedRequestOptions,
    attempt: number = 0
  ): Promise<GovernedResponse<T>> {
    try {
      return await this.executeSingleRequest<T>(options);
    } catch (error) {
      const axiosError = error as AxiosError;
      const statusCode = axiosError.response?.status ?? 0;

      // Always attempt to parse usage headers from error responses (Requirement 1.6)
      if (axiosError.response) {
        const usageMetrics = this.parseHeadersFromResponse(axiosError.response);
        await this.writeUsageToStore(usageMetrics, options.accountId);

        // Handle 429 or throttle error codes — escalate to Critical (Requirement 1.9)
        const metaErrorCode = this.extractMetaErrorCode(axiosError.response);
        if (statusCode === 429 || metaErrorCode === BUC_THROTTLE_ERROR_CODE || metaErrorCode === APP_THROTTLE_ERROR_CODE) {
          const minutesToRegain = this.extractMinutesToRegain(axiosError.response, usageMetrics);

          // App-Level throttle (error code 4) or an X-App-Usage header at/near 100%
          // means the WHOLE app is throttled — escalate app-level usage to Critical
          // so the scheduler stops ALL accounts, not just this one.
          const appMetrics = usageMetrics?.appMetrics;
          const appAtCeiling = appMetrics
            ? Math.max(appMetrics.callCountPct, appMetrics.totalCputimePct, appMetrics.totalTimePct) >= 95
            : false;

          if (metaErrorCode === APP_THROTTLE_ERROR_CODE || appAtCeiling) {
            await this.usageStore.escalateAppToCritical();
          } else {
            // Account-level (BUC) throttle — escalate just this account
            await this.usageStore.escalateToCritical(options.accountId, minutesToRegain);
          }

          throw new GovernedHttpClientError(
            `Meta API rate limit hit (${statusCode === 429 ? 'HTTP 429' : 'error code ' + metaErrorCode})`,
            statusCode || 429,
            metaErrorCode,
            this.extractMetaErrorType(axiosError.response),
            minutesToRegain,
            usageMetrics
          );
        }
      }

      // Retry on 5xx errors with exponential backoff + jitter
      if (statusCode >= 500 && attempt < this.config.maxRetries) {
        const delay = this.computeRetryDelay(attempt);
        logger.debug(`[GovernedHttpClient] Retrying after ${delay}ms (attempt ${attempt + 1}/${this.config.maxRetries})`, {
          component: 'GovernedHttpClient',
          path: options.path,
          statusCode,
        });
        await this.sleep(delay);
        return this.executeWithRetry<T>(options, attempt + 1);
      }

      // Non-retryable or max retries exceeded — propagate error
      const metaErrorCode = axiosError.response ? this.extractMetaErrorCode(axiosError.response) : null;
      const metaErrorSubcode = axiosError.response ? this.extractMetaErrorSubcode(axiosError.response) : null;
      const usageMetrics = axiosError.response ? this.parseHeadersFromResponse(axiosError.response) : null;
      
      // Include Meta's actual error message in the thrown error so callers can
      // log the real reason (e.g. "Unsupported request" vs just "HTTP 400").
      const metaMsg = axiosError.response?.data?.error?.message || axiosError.response?.data?.message || null;
      const fullMessage = metaMsg
        ? `${axiosError.message} — Meta: ${metaMsg}`
        : axiosError.message || 'Request failed';

      // Write full Meta error body to the dedicated debug log file.
      // This runs regardless of server log volume and survives scroll-back.
      try {
        const { logMetaApiError } = await import('../utils/instagram-api-debug-logger');
        const reqUrl = (options as any)?.path
          ? `${this.config.baseUrl}${(options as any).path}`
          : undefined;
        logMetaApiError('GovernedHttpClient.request', {
          url: reqUrl,
          statusCode: statusCode || 0,
          metaBody: axiosError.response?.data,
          tokenPrefix: options.token ? String(options.token).slice(0, 12) : undefined,
          accountId: options.accountId,
        });
      } catch { /* non-fatal */ }

      throw new GovernedHttpClientError(
        fullMessage,
        statusCode || 500,
        metaErrorCode,
        axiosError.response ? this.extractMetaErrorType(axiosError.response) : null,
        null,
        usageMetrics,
        metaErrorSubcode
      );
    }
  }

  /**
   * Execute a single HTTP request via axios.
   */
  private async executeSingleRequest<T>(options: GovernedRequestOptions): Promise<GovernedResponse<T>> {
    const url = this.buildUrl(options);

    const axiosConfig: Record<string, unknown> = {
      method: options.method,
      url,
      timeout: this.config.timeout,
      headers: {
        'User-Agent': 'VeeFore/2.0 GovernedHttpClient',
      },
    };

    // Send access_token as a query parameter (not Bearer header).
    // Meta's Graph API only returns X-Business-Use-Case-Usage headers
    // when the token is passed as a query param, not via Authorization header.
    const params: Record<string, string> = {
      ...(options.params || {}),
      access_token: options.token,
    };

    if (options.method === 'GET') {
      axiosConfig.params = params;
    } else {
      // For POST, send token in query string and body data separately
      axiosConfig.params = { access_token: options.token };
      if (options.body !== undefined) {
        axiosConfig.data = options.body;
      }
    }

    const response: AxiosResponse<T> = await axios(axiosConfig as any);

    // Parse usage headers on success (Requirement 1.2, 1.3, 1.4)
    const usageMetrics = this.parseHeadersFromResponse(response);

    // Write parsed metrics to UsageStore (Requirement 1.4)
    // If no usage header was present, we do NOT overwrite (Requirement 1.5)
    await this.writeUsageToStore(usageMetrics, options.accountId);

    return {
      data: response.data,
      usageMetrics,
      statusCode: response.status,
    };
  }

  // -------------------------------------------------------------------------
  // Private: Header Parsing Helpers
  // -------------------------------------------------------------------------

  /**
   * Parse both usage headers from a response (success or error).
   * Returns null if no usage headers are present.
   */
  private parseHeadersFromResponse(response: AxiosResponse | any): ParsedUsageMetrics | null {
    const headers = response.headers || {};

    const bucHeader = headers['x-business-use-case-usage'] as string | undefined;
    const appHeader = headers['x-app-usage'] as string | undefined;

    if (!bucHeader && !appHeader) {
      return null; // No usage headers present — do not overwrite (Requirement 1.5)
    }

    const accountMetrics = bucHeader
      ? this.parseBusinessUseCaseHeader(bucHeader)
      : new Map<string, AccountUsageMetrics>();

    const appMetrics = appHeader ? this.parseAppUsageHeader(appHeader) : null;

    return { accountMetrics, appMetrics };
  }

  /**
   * Write parsed usage metrics to the UsageStore.
   * Only writes if metrics are present (Requirement 1.5 — no-header = no overwrite).
   */
  private async writeUsageToStore(
    usageMetrics: ParsedUsageMetrics | null,
    requestAccountId: string
  ): Promise<void> {
    if (!usageMetrics) {
      return; // No headers — preserve previous values (Requirement 1.5)
    }

    // Write per-account BUC (Business Use Case) metrics — the 4800×impressions/24h budget
    for (const [accountId, metrics] of usageMetrics.accountMetrics) {
      try {
        await this.usageStore.updateUsage(accountId, metrics);
      } catch (error) {
        logger.warn('[GovernedHttpClient] Failed to write usage metrics to store', {
          component: 'GovernedHttpClient',
          accountId,
          error: (error as Error).message,
        });
      }
    }

    // Write app-level metrics SEPARATELY (the 200×users/hour budget).
    // This is a DIFFERENT rate-limit system from BUC and must not overwrite
    // account-level data. Stored under a global app-usage key.
    if (usageMetrics.appMetrics) {
      try {
        await this.usageStore.updateAppUsage({
          callCountPct: usageMetrics.appMetrics.callCountPct,
          totalCputimePct: usageMetrics.appMetrics.totalCputimePct,
          totalTimePct: usageMetrics.appMetrics.totalTimePct,
        });
      } catch (error) {
        logger.warn('[GovernedHttpClient] Failed to write app-level usage to store', {
          component: 'GovernedHttpClient',
          error: (error as Error).message,
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Private: Error Extraction Helpers
  // -------------------------------------------------------------------------

  /**
   * Extract Meta error code from an error response body.
   */
  private extractMetaErrorCode(response: AxiosResponse | any): number | null {
    try {
      const data = response.data;
      if (data?.error?.code) {
        return Number(data.error.code);
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Extract Meta error subcode from an error response body.
   */
  private extractMetaErrorSubcode(response: AxiosResponse | any): number | null {
    try {
      const data = response.data;
      const sub = data?.error?.error_subcode ?? data?.error?.error_user_msg;
      return sub != null ? Number(sub) : null;
    } catch {
      return null;
    }
  }

  /**
   * Extract Meta error type from an error response body.
   */
  private extractMetaErrorType(response: AxiosResponse | any): string | null {
    try {
      const data = response.data;
      return data?.error?.type ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Extract estimated minutes to regain access from the response.
   * Checks the usage header first, then falls back to a default.
   */
  private extractMinutesToRegain(
    response: AxiosResponse | any,
    usageMetrics: ParsedUsageMetrics | null
  ): number {
    // Check BUC header for estimated_time_to_regain_access
    if (usageMetrics?.accountMetrics) {
      for (const metrics of usageMetrics.accountMetrics.values()) {
        if (metrics.estimatedMinutesToRegainAccess > 0) {
          return metrics.estimatedMinutesToRegainAccess;
        }
      }
    }

    // Check Retry-After header (in seconds)
    const retryAfterHeader = response.headers?.['retry-after'];
    if (retryAfterHeader) {
      const seconds = parseInt(retryAfterHeader, 10);
      if (!isNaN(seconds) && seconds > 0) {
        return Math.ceil(seconds / 60);
      }
    }

    return DEFAULT_MINUTES_TO_REGAIN;
  }

  // -------------------------------------------------------------------------
  // Private: Deduplication Helpers
  // -------------------------------------------------------------------------

  /**
   * Compute a deterministic key for request deduplication.
   */
  private computeRequestKey(options: GovernedRequestOptions): string {
    const data = JSON.stringify({
      method: options.method,
      path: options.path,
      params: options.params || {},
      accountId: options.accountId,
    });
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Get an in-flight request if it exists and is within the deduplication window.
   */
  private getInflightRequest(key: string): Promise<any> | null {
    const entry = this.inflightRequests.get(key);
    if (!entry) return null;

    const age = Date.now() - entry.timestamp;
    if (age > this.config.deduplicationWindowMs) {
      // Expired — remove it
      this.inflightRequests.delete(key);
      return null;
    }

    return entry.promise;
  }

  /**
   * Track a new in-flight request for deduplication.
   */
  private trackInflightRequest(key: string, promise: Promise<any>): void {
    this.inflightRequests.set(key, { promise, timestamp: Date.now() });
  }

  /**
   * Remove a completed in-flight request.
   */
  private removeInflightRequest(key: string): void {
    this.inflightRequests.delete(key);
  }

  // -------------------------------------------------------------------------
  // Private: URL Building
  // -------------------------------------------------------------------------

  /**
   * Build the full request URL from baseUrl + path + query params (for GET).
   */
  private buildUrl(options: GovernedRequestOptions): string {
    const base = this.config.baseUrl.replace(/\/$/, '');
    const path = options.path.startsWith('/') ? options.path : `/${options.path}`;
    return `${base}${path}`;
  }

  // -------------------------------------------------------------------------
  // Private: Retry Delay
  // -------------------------------------------------------------------------

  /**
   * Compute retry delay with exponential backoff + jitter.
   * delay = min(baseDelay × 2^attempt + jitter, maxDelay)
   */
  private computeRetryDelay(attempt: number): number {
    const exponentialDelay = BASE_RETRY_DELAY_MS * Math.pow(BACKOFF_MULTIPLIER, attempt);
    const jitter = Math.random() * BASE_RETRY_DELAY_MS; // 0 to baseDelay of random jitter
    return Math.min(exponentialDelay + jitter, MAX_RETRY_DELAY_MS);
  }

  // -------------------------------------------------------------------------
  // Private: Utility
  // -------------------------------------------------------------------------

  /**
   * Safely parse a numeric value, returning a default if invalid.
   */
  private safeParseNumber(value: unknown, defaultValue: number): number {
    if (typeof value === 'number' && !isNaN(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      if (!isNaN(parsed)) return parsed;
    }
    return defaultValue;
  }

  /**
   * Sleep helper for delays.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ---------------------------------------------------------------------------
// Singleton Factory
// ---------------------------------------------------------------------------

let defaultInstance: GovernedHttpClient | null = null;

/**
 * Get or create the default GovernedHttpClient instance.
 * Uses the centralized rateLimitConfig for all settings.
 */
export function getGovernedHttpClient(usageStore: UsageStore): GovernedHttpClient {
  if (!defaultInstance) {
    defaultInstance = new GovernedHttpClient(
      {
        baseUrl: 'https://graph.facebook.com',
        timeout: rateLimitConfig.httpTimeoutMs,
        maxRetries: rateLimitConfig.maxRetries,
        deduplicationWindowMs: rateLimitConfig.deduplicationWindowMs,
      },
      usageStore
    );
  }
  return defaultInstance;
}

/**
 * Reset the default instance (useful for testing).
 */
export function resetGovernedHttpClient(): void {
  defaultInstance = null;
}

export default GovernedHttpClient;
