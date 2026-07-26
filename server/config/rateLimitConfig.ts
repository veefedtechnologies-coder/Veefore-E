/**
 * Centralized Rate-Limit Configuration Module
 *
 * Single source of truth for all Meta-published rate-limit numbers, polling intervals,
 * tier thresholds, queue parameters, TTLs, and operational constants.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.5, 10.6, 10.7, 10.8
 *
 * When Meta publishes updated rate-limit numbers, modify ONLY this file.
 * No other file should contain bare numeric literals for these values.
 */

import { logger } from './logger';

// ---------------------------------------------------------------------------
// Polling Cadence Interface
// ---------------------------------------------------------------------------

/**
 * Polling intervals in milliseconds for each data type.
 * Governs how frequently each type of data is refreshed for an account.
 */
export interface PollingCadence {
  /** Interval for account-level insights refresh (e.g., followers, profile views) */
  accountInsightsMs: number;
  /** Interval for recent post insights (posts within last 7 days) */
  postInsightsRecentMs: number;
  /** Interval for older post insights (posts beyond 7 days) */
  postInsightsOlderMs: number;
  /** Interval for new post detection polling */
  newPostDetectionMs: number;
  /** Interval for follower count polling */
  followerCountMs: number;
}

// ---------------------------------------------------------------------------
// Smart-Polling Configuration Interfaces (smart-polling-system, Req 14.1)
// ---------------------------------------------------------------------------

/**
 * Post-age bucket boundary and the media-insight refresh interval applied to
 * posts whose age falls inside it (smart-polling-system Req 4.1–4.5).
 */
export interface PostAgeBucketConfig {
  /** Upper bound (exclusive) of this bucket in ms; the last bucket uses Infinity. */
  maxAgeMs: number;
  /** Base media-insight refresh interval (ms) for this bucket. */
  baseIntervalMs: number;
}

/**
 * Smart-polling enhancement-layer configuration.
 *
 * Single source of truth for every interval, threshold, factor, and weight used
 * by the smart-polling modules (cadence selection, jitter, story scheduling,
 * demographics gating, backpressure, audit, business discovery, tenant priority).
 * Added additively to {@link RateLimitConfig}; existing fields are unchanged.
 *
 * smart-polling-system Requirements: 14.1, 14.2, 14.6
 */
export interface SmartPollingConfig {
  /**
   * Per-tier base polling interval (ms), keyed by ClassificationTier
   * (smart-polling-system Req 1.4, 14.1). Tier 1 shortest → Tier 4 longest.
   * Source: internal smart-polling cadence policy.
   * Last verified: 2025-01-15
   */
  metricTierBaseIntervalsMs: Record<1 | 2 | 3 | 4, number>;

  /**
   * Ordered age buckets: 0–48h, 48h–7d, 7–30d, >30d (smart-polling-system Req 4.1–4.5).
   * Intervals MUST be strictly increasing across buckets.
   * Source: internal smart-polling cadence policy.
   * Last verified: 2025-01-15
   */
  postAgeBuckets: PostAgeBucketConfig[];

  /**
   * Hard age cutoff (ms) beyond which media insights are NOT fetched by smart
   * polling. Posts older than this are excluded from both the live media-list
   * filter and the DB-driven older-post refresh, regardless of bucket cadence.
   * Default: 6 months (smart-polling cost control — old posts rarely change).
   * Source: internal smart-polling cadence policy.
   * Last verified: 2025-01-15
   */
  maxInsightsAgeMs: number;

  /**
   * Cadence multiplier per ceiling classification (smart-polling-system Req 4.1–4.4).
   * LOW ≥ HIGH so low-ceiling accounts are polled less often.
   * Source: internal smart-polling cadence policy.
   * Last verified: 2025-01-15
   */
  ceilingScalingFactor: { HIGH: number; LOW: number };

  /**
   * Jitter spread as a fraction of base interval (smart-polling-system Req 7.2, 7.5).
   * Constrained to [0.10, 0.25]; default 0.25.
   * Source: internal smart-polling cadence policy.
   * Last verified: 2025-01-15
   */
  jitterSpreadFraction: number;

  /**
   * Minimum recent follower_count to allow follower_demographics calls
   * (smart-polling-system Req 6.5). Default 100.
   * Source: internal smart-polling cadence policy.
   * Last verified: 2025-01-15
   */
  followerDemographicsThreshold: number;

  /**
   * New-post detection intervals (ms) scaled by ceiling
   * (smart-polling-system Req 8.1, 8.2, 8.4). HIGH 2–4h, LOW 6–8h.
   * Source: internal smart-polling cadence policy.
   * Last verified: 2025-01-15
   */
  newPostDetectionMs: { highCeiling: number; lowCeiling: number };

  /**
   * Recurring story-insights interval (ms) (smart-polling-system Req 5.1). Default ~2.5h.
   * Source: internal smart-polling cadence policy.
   * Last verified: 2025-01-15
   */
  storyRecurringIntervalMs: number;

  /**
   * Pre-expiry lead time (ms) for the final story fetch (smart-polling-system Req 5.2).
   * Default 30min.
   * Source: internal smart-polling cadence policy.
   * Last verified: 2025-01-15
   */
  storyFinalFetchLeadMs: number;

  /**
   * Story lifetime (ms) — 24h. Used to compute the final-fetch deadline
   * (smart-polling-system Req 5.2).
   * Source: Meta Instagram Stories 24-hour lifetime.
   * Last verified: 2025-01-15
   */
  storyLifetimeMs: number;

  /**
   * Backpressure thresholds + sample interval (smart-polling-system Req 12.3, 12.6, 12.7).
   * Clear thresholds MUST be strictly less than their trigger (hysteresis).
   * Source: internal smart-polling operational policy.
   * Last verified: 2025-01-15
   */
  backpressure: {
    /** Queue-depth job count above which pressure is active. */
    triggerQueueDepth: number;
    /** Redis command latency (ms) above which pressure is active. */
    triggerRedisLatencyMs: number;
    /** Clear threshold — MUST be strictly less than triggerQueueDepth (Req 12.7). */
    clearQueueDepth: number;
    /** Clear threshold — MUST be strictly less than triggerRedisLatencyMs (Req 12.7). */
    clearRedisLatencyMs: number;
    /** Sampling interval (ms) for queue depth + latency (Req 12.6). */
    evaluationIntervalMs: number;
  };

  /**
   * Audit trail retention + persistence retry policy
   * (smart-polling-system Req 11.5, 11.6).
   * Source: internal smart-polling operational policy.
   * Last verified: 2025-01-15
   */
  audit: {
    /** Retention period (seconds) for the TTL index. */
    retentionSeconds: number;
    /** Max persistence retries on write failure. */
    persistenceMaxRetries: number;
  };

  /**
   * Business Discovery feature flag + cadence + cap (smart-polling-system Req 9).
   * Source: internal smart-polling operational policy.
   * Last verified: 2025-01-15
   */
  businessDiscovery: {
    /** Feature flag — disabled by default (Req 9.4). */
    enabled: boolean;
    /** Per-competitor lookup interval (ms); ≤ once / 24h (Req 9.2). */
    intervalMs: number;
    /** Cap on competitors tracked per account (Req 9.3). */
    maxCompetitorsPerAccount: number;
  };

  /**
   * Tenant priority weighting (smart-polling-system Req 13).
   * Source: internal smart-polling operational policy.
   * Last verified: 2025-01-15
   */
  tenantPriority: {
    /** Feature flag — disabled by default; equal shares when off (Req 13.3). */
    enabled: boolean;
    /** tenantId → weight (1–1000). Invalid/missing ⇒ default 1 + warning (Req 13.5). */
    weights: Record<string, number>;
    /** Rolling fairness window (ms). Default 60_000. */
    windowMs: number;
  };
}

// ---------------------------------------------------------------------------
// Main RateLimitConfig Interface
// ---------------------------------------------------------------------------

/**
 * Complete rate-limit configuration interface.
 * All Meta-published constants, tier thresholds, polling cadence, queue settings,
 * TTLs, timeouts, retry logic, and error message mapping in one typed structure.
 */
export interface RateLimitConfig {
  // -------------------------------------------------------------------------
  // Meta-Published Constants
  // -------------------------------------------------------------------------

  /**
   * BUC (Business Use Case) multiplier.
   * Formula: 4,800 × daily impressions = calls allowed per 24-hour rolling window.
   * Source: https://developers.facebook.com/docs/graph-api/overview/rate-limiting#business-use-case-rate-limiting
   * Last verified: 2025-01-15
   */
  bucMultiplier: number;

  /**
   * Platform Rate Limit — calls per user per hour.
   * Applies to non-BUC endpoints (e.g., User nodes, Pages).
   * Source: https://developers.facebook.com/docs/graph-api/overview/rate-limiting#platform-rate-limits
   * Last verified: 2025-01-15
   */
  platformRateLimitMultiplier: number;

  /**
   * Maximum posts an IG Professional account can publish per 24-hour period.
   * Source: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing#rate-limit
   * Last verified: 2025-01-15
   */
  publishLimitPerDay: number;

  /**
   * Messaging endpoint ceiling — messages per account per hour.
   * Source: https://developers.facebook.com/docs/messenger-platform/send-messages#rate-limiting
   * Last verified: 2025-01-15
   */
  messagingCeilingPerHour: number;

  // -------------------------------------------------------------------------
  // Tier Thresholds (percentage-based)
  // -------------------------------------------------------------------------

  /**
   * Usage percentage thresholds for tier classification.
   * Normal: 0 – caution%, Caution: caution% – restricted%, Restricted: restricted% – critical%, Critical: ≥ critical%
   */
  tierThresholds: {
    /** Percentage at which an account enters Caution tier (default 60) */
    caution: number;
    /** Percentage at which an account enters Restricted tier (default 80) */
    restricted: number;
    /** Percentage at which an account enters Critical tier (default 95) */
    critical: number;
  };

  // -------------------------------------------------------------------------
  // Polling Cadence
  // -------------------------------------------------------------------------

  /**
   * Polling intervals per ceiling classification.
   * High-ceiling accounts (more impressions) get polled more frequently.
   * Low-ceiling accounts get protected with longer intervals.
   */
  polling: {
    highCeiling: PollingCadence;
    lowCeiling: PollingCadence;
  };

  // -------------------------------------------------------------------------
  // Ceiling Classification
  // -------------------------------------------------------------------------

  /**
   * Daily impressions threshold above which an account is classified as high-ceiling.
   * Accounts below this are classified as low-ceiling and polled less frequently.
   * Default: 1000 impressions/day
   */
  highCeilingImpressionThreshold: number;

  // -------------------------------------------------------------------------
  // Queue Configuration
  // -------------------------------------------------------------------------

  queue: {
    /** Max concurrent webhook processing jobs per account */
    webhookConcurrencyPerAccount: number;
    /** Maximum retries for deferred jobs before alerting */
    maxDeferredRetries: number;
    /** Hours after which a stuck deferred job triggers an alert */
    deferredAlertThresholdHours: number;
    /** Webhook queue depth threshold that triggers a monitoring alert */
    queueDepthAlertThreshold: number;
  };

  // -------------------------------------------------------------------------
  // TTLs and Staleness
  // -------------------------------------------------------------------------

  /**
   * TTL for each account's usage record in Redis (seconds).
   * Prevents indefinitely stale data from persisting.
   * Default: 7200 (2 hours)
   */
  usageRecordTtlSeconds: number;

  /**
   * Time in ms after which a usage record is considered stale-but-usable.
   * Stale records are still used for tier decisions but flagged in the UX.
   * Default: 300000 (5 minutes)
   */
  stalenessThresholdMs: number;

  // -------------------------------------------------------------------------
  // Backfill Configuration
  // -------------------------------------------------------------------------

  /**
   * Number of recent posts to fetch on initial account connection (high-ceiling).
   * Uses field-expansion syntax in a single combined API request.
   * Default: 25
   */
  initialFetchCount: number;

  /**
   * Number of recent posts to fetch for low-ceiling accounts on initial connection.
   * Reduced to conserve API budget for smaller accounts.
   * Default: 20
   */
  initialFetchCountLowCeiling: number;

  // -------------------------------------------------------------------------
  // HTTP Client Configuration
  // -------------------------------------------------------------------------

  /**
   * HTTP request timeout for Meta Graph API calls in milliseconds.
   * Default: 10000 (10 seconds)
   */
  httpTimeoutMs: number;

  /**
   * Maximum retry attempts for failed HTTP requests.
   * Uses exponential backoff with jitter between retries.
   * Default: 3
   */
  maxRetries: number;

  /**
   * Window in ms during which duplicate requests are deduplicated.
   * Prevents redundant API calls for the same resource.
   * Default: 2000 (2 seconds)
   */
  deduplicationWindowMs: number;

  // -------------------------------------------------------------------------
  // Error Message Mapping
  // -------------------------------------------------------------------------

  /**
   * Maps Meta API error codes and HTTP status codes to plain-language,
   * user-friendly messages. No message should contain numeric codes or Meta raw strings.
   * Source: https://developers.facebook.com/docs/graph-api/guides/error-handling
   * Last verified: 2025-01-15
   */
  errorMessageMap: Record<string | number, string>;

  // -------------------------------------------------------------------------
  // Smart-Polling Enhancement Layer (smart-polling-system, additive)
  // -------------------------------------------------------------------------

  /**
   * Smart-polling configuration — single source of truth for the smart-polling
   * enhancement-layer intervals, thresholds, factors, and weights.
   * Added additively; existing fields above are unchanged.
   * smart-polling-system Requirements: 14.1
   */
  smartPolling: SmartPollingConfig;
}

// ---------------------------------------------------------------------------
// Default Configuration Values
// ---------------------------------------------------------------------------

/**
 * Default rate-limit configuration.
 * Every value is documented with its source, meaning, and last-verified date.
 * Environment variable overrides are applied on top of these defaults.
 */
const DEFAULT_CONFIG: RateLimitConfig = {
  // Meta-published constants (last verified: 2025-01-15)
  bucMultiplier: 4800,
  platformRateLimitMultiplier: 200,
  publishLimitPerDay: 25,
  messagingCeilingPerHour: 250,

  // Tier thresholds — Requirements 4.1–4.4
  tierThresholds: {
    caution: 60,
    restricted: 80,
    critical: 95,
  },

  // Polling cadence — Requirements 5.1–5.5
  // NOTE: App-level rate limit = 200 calls × num_users per hour.
  // With 2 dev users = 400 calls/hour budget. Keep insight polling conservative.
  polling: {
    highCeiling: {
      accountInsightsMs: 4 * 60 * 60 * 1000,       // 4 hours (was 1h — too aggressive)
      postInsightsRecentMs: 6 * 60 * 60 * 1000,    // 6 hours (was 3h)
      postInsightsOlderMs: 24 * 60 * 60 * 1000,    // 24 hours (once daily)
      newPostDetectionMs: 3 * 60 * 60 * 1000,      // 3 hours (was 2h)
      followerCountMs: 4 * 60 * 60 * 1000,         // 4 hours (was 1h)
    },
    lowCeiling: {
      accountInsightsMs: 8 * 60 * 60 * 1000,       // 8 hours (was 4h)
      postInsightsRecentMs: 12 * 60 * 60 * 1000,   // 12 hours (was 5h)
      postInsightsOlderMs: 24 * 60 * 60 * 1000,    // 24 hours (once daily)
      newPostDetectionMs: 6 * 60 * 60 * 1000,      // 6 hours (was 3h)
      followerCountMs: 8 * 60 * 60 * 1000,         // 8 hours (was 5h)
    },
  },

  // Classification threshold
  highCeilingImpressionThreshold: 1000,

  // Queue configuration — Requirements 7.5, 11.1, 12.6, 12.7
  queue: {
    webhookConcurrencyPerAccount: 3,
    maxDeferredRetries: 3,   // was 10 — excessive retries burn app-level rate limit
    deferredAlertThresholdHours: 24,
    queueDepthAlertThreshold: 500,
  },

  // TTLs — Requirements 2.3, 2.5
  usageRecordTtlSeconds: 7200,
  stalenessThresholdMs: 300_000,

  // Backfill — Requirements 6.2, 6.6, 6.7
  initialFetchCount: 25,
  initialFetchCountLowCeiling: 20,

  // HTTP client — Requirements 1.7
  httpTimeoutMs: 10_000,
  maxRetries: 3,
  deduplicationWindowMs: 2000,

  // Error message mapping — Requirements 8.5, 8.8
  errorMessageMap: {
    '80002': 'Your account is temporarily pausing data refresh to stay within platform limits. It will resume automatically shortly.',
    '429': 'We are spacing out requests to keep your account in good standing. Your data will refresh soon.',
    '190': 'Your Instagram connection needs to be refreshed. Please reconnect your account in settings.',
    '100': 'We encountered an issue retrieving your data. Our system will retry automatically.',
    '10': 'A temporary permissions issue occurred. Please verify your account connection in settings.',
    '2': 'Instagram is experiencing a temporary issue. Your data will update once it resolves.',
    '4': 'We are managing your API usage to protect your account. Data refresh will resume shortly.',
    '17': 'Your account has reached a temporary activity limit. Normal service will resume within the hour.',
    '32': 'There was a brief interruption while communicating with Instagram. Retrying automatically.',
    '368': 'A temporary block has been applied to this action. Please wait a few minutes and try again.',
    'default': 'Something went wrong while syncing your account. We are working on it and will retry soon.',
  },

  // -------------------------------------------------------------------------
  // Smart-polling enhancement layer — smart-polling-system Req 14.1, 14.2, 14.6
  // Source: internal smart-polling cadence/operational policy. Last verified: 2025-01-15
  // -------------------------------------------------------------------------
  smartPolling: {
    // Per-tier base intervals, T1 < T2 < T3 < T4 (Req 1.4). Last verified: 2025-01-15
    metricTierBaseIntervalsMs: {
      1: 5 * 60_000,        // Tier 1: 5 minutes
      2: 60 * 60_000,       // Tier 2: 1 hour
      3: 3 * 60 * 60_000,   // Tier 3: 3 hours
      4: 24 * 60 * 60_000,  // Tier 4: 24 hours
    },

    // Strictly-increasing post-age buckets (Req 4.2–4.4). Last verified: 2025-01-15
    postAgeBuckets: [
      { maxAgeMs: 48 * 3_600_000, baseIntervalMs: 1 * 3_600_000 },                  // 0–48h : hourly
      { maxAgeMs: 7 * 24 * 3_600_000, baseIntervalMs: 6 * 3_600_000 },              // 48h–7d : 6h
      { maxAgeMs: 30 * 24 * 3_600_000, baseIntervalMs: 24 * 3_600_000 },           // 7–30d : daily
      { maxAgeMs: Number.POSITIVE_INFINITY, baseIntervalMs: 7 * 24 * 3_600_000 },  // >30d : weekly
    ],

    // Hard cutoff: never fetch media insights for posts older than 6 months. Last verified: 2025-01-15
    maxInsightsAgeMs: 180 * 24 * 3_600_000,

    // Ceiling factors HIGH=1.0 / LOW=2.0; LOW polled less often (Req 4.1–4.4). Last verified: 2025-01-15
    ceilingScalingFactor: { HIGH: 1.0, LOW: 2.0 },

    // Jitter spread fraction; constrained to [0.10, 0.25], default 0.25 (Req 7.2, 7.5). Last verified: 2025-01-15
    jitterSpreadFraction: 0.25,

    // Follower-demographics gate threshold (Req 6.5). Last verified: 2025-01-15
    followerDemographicsThreshold: 100,

    // New-post detection intervals scaled by ceiling (Req 8.1, 8.2, 8.4). Last verified: 2025-01-15
    newPostDetectionMs: {
      highCeiling: 2 * 60 * 60_000,  // 2 hours
      lowCeiling: 6 * 60 * 60_000,   // 6 hours
    },

    // Story scheduling (Req 5.1, 5.2). Last verified: 2025-01-15
    storyRecurringIntervalMs: 150 * 60_000,   // ~2.5 hours
    storyFinalFetchLeadMs: 30 * 60_000,        // 30 minutes before expiry
    storyLifetimeMs: 24 * 60 * 60_000,         // 24 hours

    // Backpressure thresholds with hysteresis; clear < trigger (Req 12.3, 12.6, 12.7). Last verified: 2025-01-15
    backpressure: {
      triggerQueueDepth: 1000,
      triggerRedisLatencyMs: 250,
      clearQueueDepth: 500,
      clearRedisLatencyMs: 100,
      evaluationIntervalMs: 5_000,
    },

    // Audit trail retention + retries (Req 11.5, 11.6). Last verified: 2025-01-15
    audit: {
      retentionSeconds: 90 * 24 * 60 * 60,  // 90 days
      persistenceMaxRetries: 3,
    },

    // Business Discovery (Req 9). Disabled by default. Last verified: 2025-01-15
    businessDiscovery: {
      enabled: false,
      intervalMs: 24 * 60 * 60_000,  // once per 24h per competitor
      maxCompetitorsPerAccount: 10,
    },

    // Tenant priority weighting (Req 13). Disabled by default. Last verified: 2025-01-15
    tenantPriority: {
      enabled: false,
      weights: {},
      windowMs: 60_000,
    },
  },
};

// ---------------------------------------------------------------------------
// Environment Override Keys
// ---------------------------------------------------------------------------

/**
 * Parses a boolean environment override.
 *
 * Accepts (case-insensitive, trimmed) `true`/`1`/`yes`/`on` as `true` and
 * `false`/`0`/`no`/`off` as `false`. Any unrecognized input returns `NaN`
 * so the config builder can reject the override and retain the prior valid
 * value (smart-polling-system Req 14.5).
 *
 * @param value Raw environment variable string.
 * @returns `true`/`false` for recognized input, otherwise `NaN`.
 */
function parseBool(value: string): boolean | number {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') {
    return false;
  }
  return NaN; // Unparseable -> rejected by buildRateLimitConfig (Req 14.5)
}

/**
 * Maps environment variable names to their config paths and parse functions.
 * Supports development vs production overrides without code changes.
 *
 * `parse` may return a boolean (via {@link parseBool}) for feature-flag values;
 * unparseable input is signalled by returning `NaN`. Optional `min`/`max`
 * bounds declare an inclusive allowed range for numeric overrides; values
 * outside the range are rejected and the prior valid value is retained
 * (smart-polling-system Req 14.5).
 */
interface EnvOverride {
  envKey: string;
  configPath: string[];
  parse: (value: string) => number | string | boolean;
  /** Inclusive lower bound for numeric overrides (optional). */
  min?: number;
  /** Inclusive upper bound for numeric overrides (optional). */
  max?: number;
}

const ENV_OVERRIDES: EnvOverride[] = [
  { envKey: 'RATE_LIMIT_BUC_MULTIPLIER', configPath: ['bucMultiplier'], parse: Number },
  { envKey: 'RATE_LIMIT_PLATFORM_MULTIPLIER', configPath: ['platformRateLimitMultiplier'], parse: Number },
  { envKey: 'RATE_LIMIT_PUBLISH_LIMIT_PER_DAY', configPath: ['publishLimitPerDay'], parse: Number },
  { envKey: 'RATE_LIMIT_MESSAGING_CEILING', configPath: ['messagingCeilingPerHour'], parse: Number },
  { envKey: 'RATE_LIMIT_TIER_CAUTION', configPath: ['tierThresholds', 'caution'], parse: Number },
  { envKey: 'RATE_LIMIT_TIER_RESTRICTED', configPath: ['tierThresholds', 'restricted'], parse: Number },
  { envKey: 'RATE_LIMIT_TIER_CRITICAL', configPath: ['tierThresholds', 'critical'], parse: Number },
  { envKey: 'RATE_LIMIT_HIGH_CEILING_THRESHOLD', configPath: ['highCeilingImpressionThreshold'], parse: Number },
  { envKey: 'RATE_LIMIT_WEBHOOK_CONCURRENCY', configPath: ['queue', 'webhookConcurrencyPerAccount'], parse: Number },
  { envKey: 'RATE_LIMIT_MAX_DEFERRED_RETRIES', configPath: ['queue', 'maxDeferredRetries'], parse: Number },
  { envKey: 'RATE_LIMIT_DEFERRED_ALERT_HOURS', configPath: ['queue', 'deferredAlertThresholdHours'], parse: Number },
  { envKey: 'RATE_LIMIT_QUEUE_DEPTH_ALERT', configPath: ['queue', 'queueDepthAlertThreshold'], parse: Number },
  { envKey: 'RATE_LIMIT_USAGE_TTL_SECONDS', configPath: ['usageRecordTtlSeconds'], parse: Number },
  { envKey: 'RATE_LIMIT_STALENESS_MS', configPath: ['stalenessThresholdMs'], parse: Number },
  { envKey: 'RATE_LIMIT_INITIAL_FETCH_COUNT', configPath: ['initialFetchCount'], parse: Number },
  { envKey: 'RATE_LIMIT_INITIAL_FETCH_LOW_CEILING', configPath: ['initialFetchCountLowCeiling'], parse: Number },
  { envKey: 'RATE_LIMIT_HTTP_TIMEOUT_MS', configPath: ['httpTimeoutMs'], parse: Number },
  { envKey: 'RATE_LIMIT_MAX_RETRIES', configPath: ['maxRetries'], parse: Number },
  { envKey: 'RATE_LIMIT_DEDUP_WINDOW_MS', configPath: ['deduplicationWindowMs'], parse: Number },
  // Polling cadence overrides (high ceiling)
  { envKey: 'RATE_LIMIT_POLL_HC_ACCOUNT_MS', configPath: ['polling', 'highCeiling', 'accountInsightsMs'], parse: Number },
  { envKey: 'RATE_LIMIT_POLL_HC_POST_RECENT_MS', configPath: ['polling', 'highCeiling', 'postInsightsRecentMs'], parse: Number },
  { envKey: 'RATE_LIMIT_POLL_HC_POST_OLDER_MS', configPath: ['polling', 'highCeiling', 'postInsightsOlderMs'], parse: Number },
  { envKey: 'RATE_LIMIT_POLL_HC_NEW_POST_MS', configPath: ['polling', 'highCeiling', 'newPostDetectionMs'], parse: Number },
  { envKey: 'RATE_LIMIT_POLL_HC_FOLLOWERS_MS', configPath: ['polling', 'highCeiling', 'followerCountMs'], parse: Number },
  // Polling cadence overrides (low ceiling)
  { envKey: 'RATE_LIMIT_POLL_LC_ACCOUNT_MS', configPath: ['polling', 'lowCeiling', 'accountInsightsMs'], parse: Number },
  { envKey: 'RATE_LIMIT_POLL_LC_POST_RECENT_MS', configPath: ['polling', 'lowCeiling', 'postInsightsRecentMs'], parse: Number },
  { envKey: 'RATE_LIMIT_POLL_LC_POST_OLDER_MS', configPath: ['polling', 'lowCeiling', 'postInsightsOlderMs'], parse: Number },
  { envKey: 'RATE_LIMIT_POLL_LC_NEW_POST_MS', configPath: ['polling', 'lowCeiling', 'newPostDetectionMs'], parse: Number },
  { envKey: 'RATE_LIMIT_POLL_LC_FOLLOWERS_MS', configPath: ['polling', 'lowCeiling', 'followerCountMs'], parse: Number },
  // -------------------------------------------------------------------------
  // Smart-polling enhancement-layer overrides (smart-polling-system Req 14.3)
  // One entry per runtime-configurable smart-polling value. Last verified: 2025-01-15
  // -------------------------------------------------------------------------
  // Per-tier base intervals (Req 1.4, 14.1)
  { envKey: 'SP_TIER1_BASE_INTERVAL_MS', configPath: ['smartPolling', 'metricTierBaseIntervalsMs', '1'], parse: Number, min: 0 },
  { envKey: 'SP_TIER2_BASE_INTERVAL_MS', configPath: ['smartPolling', 'metricTierBaseIntervalsMs', '2'], parse: Number, min: 0 },
  { envKey: 'SP_TIER3_BASE_INTERVAL_MS', configPath: ['smartPolling', 'metricTierBaseIntervalsMs', '3'], parse: Number, min: 0 },
  { envKey: 'SP_TIER4_BASE_INTERVAL_MS', configPath: ['smartPolling', 'metricTierBaseIntervalsMs', '4'], parse: Number, min: 0 },
  // Hard insights age cutoff (posts older than this are never insight-polled)
  { envKey: 'SP_MAX_INSIGHTS_AGE_MS', configPath: ['smartPolling', 'maxInsightsAgeMs'], parse: Number, min: 0 },
  // Ceiling scaling factors (Req 4.1–4.4)
  { envKey: 'SP_CEILING_FACTOR_HIGH', configPath: ['smartPolling', 'ceilingScalingFactor', 'HIGH'], parse: Number, min: 0 },
  { envKey: 'SP_CEILING_FACTOR_LOW', configPath: ['smartPolling', 'ceilingScalingFactor', 'LOW'], parse: Number, min: 0 },
  // Jitter spread fraction, constrained to [0.10, 0.25] (Req 7.2, 7.5, 14.5)
  { envKey: 'SP_JITTER_SPREAD_FRACTION', configPath: ['smartPolling', 'jitterSpreadFraction'], parse: Number, min: 0.10, max: 0.25 },
  // Follower-demographics gate threshold (Req 6.5)
  { envKey: 'SP_FOLLOWER_DEMOGRAPHICS_THRESHOLD', configPath: ['smartPolling', 'followerDemographicsThreshold'], parse: Number, min: 0 },
  // New-post detection intervals scaled by ceiling (Req 8.1, 8.2, 8.4)
  { envKey: 'SP_NEW_POST_DETECTION_HIGH_MS', configPath: ['smartPolling', 'newPostDetectionMs', 'highCeiling'], parse: Number, min: 0 },
  { envKey: 'SP_NEW_POST_DETECTION_LOW_MS', configPath: ['smartPolling', 'newPostDetectionMs', 'lowCeiling'], parse: Number, min: 0 },
  // Story scheduling (Req 5.1, 5.2)
  { envKey: 'SP_STORY_RECURRING_MS', configPath: ['smartPolling', 'storyRecurringIntervalMs'], parse: Number, min: 0 },
  { envKey: 'SP_STORY_FINAL_LEAD_MS', configPath: ['smartPolling', 'storyFinalFetchLeadMs'], parse: Number, min: 0 },
  { envKey: 'SP_STORY_LIFETIME_MS', configPath: ['smartPolling', 'storyLifetimeMs'], parse: Number, min: 0 },
  // Backpressure thresholds + evaluation interval; clear < trigger enforced cross-field (Req 12.3, 12.6, 12.7, 14.5)
  { envKey: 'SP_BP_TRIGGER_QUEUE_DEPTH', configPath: ['smartPolling', 'backpressure', 'triggerQueueDepth'], parse: Number, min: 0 },
  { envKey: 'SP_BP_TRIGGER_REDIS_LATENCY_MS', configPath: ['smartPolling', 'backpressure', 'triggerRedisLatencyMs'], parse: Number, min: 0 },
  { envKey: 'SP_BP_CLEAR_QUEUE_DEPTH', configPath: ['smartPolling', 'backpressure', 'clearQueueDepth'], parse: Number, min: 0 },
  { envKey: 'SP_BP_CLEAR_REDIS_LATENCY_MS', configPath: ['smartPolling', 'backpressure', 'clearRedisLatencyMs'], parse: Number, min: 0 },
  { envKey: 'SP_BP_EVALUATION_INTERVAL_MS', configPath: ['smartPolling', 'backpressure', 'evaluationIntervalMs'], parse: Number, min: 0 },
  // Audit retention + persistence retries (Req 11.5, 11.6)
  { envKey: 'SP_AUDIT_RETENTION_SECONDS', configPath: ['smartPolling', 'audit', 'retentionSeconds'], parse: Number, min: 0 },
  { envKey: 'SP_AUDIT_PERSISTENCE_MAX_RETRIES', configPath: ['smartPolling', 'audit', 'persistenceMaxRetries'], parse: Number, min: 0 },
  // Business Discovery feature flag + cadence + cap (Req 9)
  { envKey: 'SP_BUSINESS_DISCOVERY_ENABLED', configPath: ['smartPolling', 'businessDiscovery', 'enabled'], parse: parseBool },
  { envKey: 'SP_BUSINESS_DISCOVERY_INTERVAL_MS', configPath: ['smartPolling', 'businessDiscovery', 'intervalMs'], parse: Number, min: 0 },
  { envKey: 'SP_BUSINESS_DISCOVERY_MAX_COMPETITORS', configPath: ['smartPolling', 'businessDiscovery', 'maxCompetitorsPerAccount'], parse: Number, min: 0 },
  // Tenant priority weighting (Req 13)
  { envKey: 'SP_TENANT_PRIORITY_ENABLED', configPath: ['smartPolling', 'tenantPriority', 'enabled'], parse: parseBool },
  { envKey: 'SP_TENANT_PRIORITY_WINDOW_MS', configPath: ['smartPolling', 'tenantPriority', 'windowMs'], parse: Number, min: 0 },
];

// ---------------------------------------------------------------------------
// Config Builder
// ---------------------------------------------------------------------------

/**
 * Sets a nested value on an object given a path array.
 */
function setNestedValue(obj: Record<string, unknown>, path: string[], value: unknown): void {
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]!;
    if (typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  const lastKey = path[path.length - 1]!;
  current[lastKey] = value;
}

/**
 * Deeply clones a plain object (no functions, no circular refs).
 *
 * Uses the structured clone algorithm (Node ≥17, this project targets Node 20
 * per `.nvmrc`) so non-finite numeric values such as `Number.POSITIVE_INFINITY`
 * are preserved. The previous `JSON.parse(JSON.stringify(obj))` approach
 * silently coerced `Infinity` to `null`, corrupting the last (>30d) entry of
 * `smartPolling.postAgeBuckets` whose `maxAgeMs` is `Infinity`
 * (smart-polling-system Req 14.5). A JSON-based fallback is retained only for
 * exotic runtimes where `structuredClone` is unavailable.
 */
function deepClone<T>(obj: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(obj);
  }
  return JSON.parse(JSON.stringify(obj)) as T;
}

/**
 * Builds the rate-limit config by starting from defaults and applying
 * any environment variable overrides found in `process.env`.
 *
 * Returns the resolved config and a list of keys that were explicitly overridden.
 */
export function buildRateLimitConfig(): { config: RateLimitConfig; overriddenKeys: string[] } {
  const config = deepClone(DEFAULT_CONFIG) as unknown as Record<string, unknown>;
  const overriddenKeys: string[] = [];

  for (const override of ENV_OVERRIDES) {
    const envValue = process.env[override.envKey];
    if (envValue !== undefined && envValue !== '') {
      const parsed = override.parse(envValue);

      // Reject unparseable values: NaN signals an unparseable number or boolean.
      // Retain the prior valid (default) value and surface which key failed (Req 14.5).
      if (typeof parsed === 'number' && isNaN(parsed)) {
        logger.warn(`[RateLimitConfig] Invalid value for ${override.envKey}: "${envValue}" — using previous valid value`, {
          component: 'RateLimitConfig',
        });
        continue;
      }

      // Range validation for numeric overrides with declared bounds (Req 14.5).
      if (typeof parsed === 'number') {
        if (override.min !== undefined && parsed < override.min) {
          logger.warn(
            `[RateLimitConfig] Out-of-range value for ${override.envKey}: ${parsed} < min ${override.min} — using previous valid value`,
            { component: 'RateLimitConfig' }
          );
          continue;
        }
        if (override.max !== undefined && parsed > override.max) {
          logger.warn(
            `[RateLimitConfig] Out-of-range value for ${override.envKey}: ${parsed} > max ${override.max} — using previous valid value`,
            { component: 'RateLimitConfig' }
          );
          continue;
        }
      }

      setNestedValue(config, override.configPath, parsed);
      overriddenKeys.push(override.envKey);
    }
  }

  // Cross-field validation: backpressure clear thresholds MUST be strictly below
  // their triggers (hysteresis, Req 12.7, 14.5). If an applied override violates
  // this, revert that clear threshold to its default and surface which key failed.
  validateBackpressureHysteresis(config, overriddenKeys);

  return { config: config as unknown as RateLimitConfig, overriddenKeys };
}

/**
 * Enforces backpressure hysteresis: each clear threshold must be strictly less
 * than its corresponding trigger threshold (smart-polling-system Req 12.7, 14.5).
 *
 * When a violation is detected, the offending clear threshold is reverted to its
 * default value, the failing env key is removed from `overriddenKeys`, and a
 * warning is logged identifying which value failed.
 */
function validateBackpressureHysteresis(
  config: Record<string, unknown>,
  overriddenKeys: string[]
): void {
  const smartPolling = config['smartPolling'] as { backpressure?: Record<string, number> } | undefined;
  const bp = smartPolling?.backpressure;
  if (!bp) {
    return;
  }

  const defaults = DEFAULT_CONFIG.smartPolling.backpressure;
  const checks: { clearKey: keyof typeof defaults; triggerKey: keyof typeof defaults; envKey: string }[] = [
    { clearKey: 'clearQueueDepth', triggerKey: 'triggerQueueDepth', envKey: 'SP_BP_CLEAR_QUEUE_DEPTH' },
    { clearKey: 'clearRedisLatencyMs', triggerKey: 'triggerRedisLatencyMs', envKey: 'SP_BP_CLEAR_REDIS_LATENCY_MS' },
  ];

  for (const { clearKey, triggerKey, envKey } of checks) {
    if (bp[clearKey] >= bp[triggerKey]) {
      logger.warn(
        `[RateLimitConfig] Out-of-range value for ${envKey}: clear threshold ${bp[clearKey]} must be strictly below trigger ${bp[triggerKey]} — reverting to default ${defaults[clearKey]}`,
        { component: 'RateLimitConfig' }
      );
      bp[clearKey] = defaults[clearKey];
      const idx = overriddenKeys.indexOf(envKey);
      if (idx !== -1) {
        overriddenKeys.splice(idx, 1);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Startup Validation & Warning
// ---------------------------------------------------------------------------

/**
 * Logs a warning at startup if the config is running entirely on defaults
 * (no environment overrides were detected). This alerts operators that
 * the deployment may not be intentionally configured.
 *
 * Requirement 10.8: Log a warning at startup if any value appears to be
 * at its default rather than explicitly set.
 */
export function validateRateLimitConfigAtStartup(overriddenKeys: string[]): void {
  if (overriddenKeys.length === 0) {
    logger.warn(
      '[RateLimitConfig] ⚠️  All rate-limit configuration values are using defaults. ' +
      'Set RATE_LIMIT_* environment variables for production deployments.',
      { component: 'RateLimitConfig' }
    );
  } else {
    logger.info(
      `[RateLimitConfig] Loaded with ${overriddenKeys.length} environment override(s): ${overriddenKeys.join(', ')}`,
      { component: 'RateLimitConfig' }
    );
  }

  // Warn about critical operational values still at defaults
  const criticalKeys = [
    'RATE_LIMIT_BUC_MULTIPLIER',
    'RATE_LIMIT_TIER_CAUTION',
    'RATE_LIMIT_TIER_RESTRICTED',
    'RATE_LIMIT_TIER_CRITICAL',
  ];

  const defaultCriticalKeys = criticalKeys.filter((key) => !overriddenKeys.includes(key));
  if (defaultCriticalKeys.length > 0 && overriddenKeys.length > 0) {
    logger.warn(
      `[RateLimitConfig] Critical config values still at defaults: ${defaultCriticalKeys.join(', ')}`,
      { component: 'RateLimitConfig' }
    );
  }
}

// ---------------------------------------------------------------------------
// Singleton Export
// ---------------------------------------------------------------------------

const { config: resolvedConfig, overriddenKeys } = buildRateLimitConfig();

// Run startup validation on module load
validateRateLimitConfigAtStartup(overriddenKeys);

/**
 * The resolved, typed rate-limit configuration.
 * Combines defaults with any environment variable overrides.
 * Import this in all modules that need rate-limit constants.
 */
export const rateLimitConfig: RateLimitConfig = Object.freeze(resolvedConfig) as RateLimitConfig;

/**
 * Re-export default config for testing and reference.
 */
export const RATE_LIMIT_DEFAULTS: Readonly<RateLimitConfig> = Object.freeze(DEFAULT_CONFIG);

/**
 * Utility: maps a Meta error code to a user-friendly message.
 * Never returns raw codes or Meta error strings.
 */
export function mapMetaErrorToUserMessage(errorCode: string | number): string {
  const key = String(errorCode);
  return rateLimitConfig.errorMessageMap[key] ?? rateLimitConfig.errorMessageMap['default'] ?? 'Something went wrong. Please try again later.';
}

export default rateLimitConfig;
