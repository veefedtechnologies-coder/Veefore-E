/**
 * UsageStore — Per-Account Usage Storage (replaces ApiBudgetTracker)
 *
 * Stores real-time per-account BUC (Business Use Case) usage percentages in Redis.
 * Provides tier classification, staleness detection, ceiling classification,
 * and broadcasts tier transitions via WebSocket.
 *
 * Redis key schema: usage:{accountId} → Hash (AccountUsageRecord fields)
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.1, 3.2, 3.3, 4.10
 */

import type Redis from 'ioredis';
import { logger } from '../config/logger';
import { rateLimitConfig, type RateLimitConfig } from '../config/rateLimitConfig';
import { RealtimeService } from './realtime';
import { getSharedRedisConnection } from '../lib/redis';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * Four-level usage tier classification based on effective usage percentage.
 * Normal: 0 – caution%, Caution: caution% – restricted%,
 * Restricted: restricted% – critical%, Critical: ≥ critical%
 */
export enum UsageTier {
  NORMAL = 'NORMAL',
  CAUTION = 'CAUTION',
  RESTRICTED = 'RESTRICTED',
  CRITICAL = 'CRITICAL',
}

/**
 * Ceiling classification based on rolling daily impressions.
 * HIGH-ceiling accounts have larger rate-limit budgets and are polled more frequently.
 * LOW-ceiling accounts are protected with longer polling intervals.
 */
export enum CeilingClassification {
  HIGH = 'HIGH',
  LOW = 'LOW',
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/**
 * Full per-account usage record persisted as a Redis hash.
 */
export interface AccountUsageRecord {
  accountId: string;
  callCountPct: number;
  totalCputimePct: number;
  totalTimePct: number;
  estimatedMinutesToRegainAccess: number;
  rollingImpressionsEstimate: number | null;
  lastUpdatedAt: number; // Unix timestamp ms
  ceilingClassification: CeilingClassification;
}

/**
 * Partial metrics from a parsed usage header.
 * Only fields present in the header should be included.
 */
export interface AccountUsageMetrics {
  callCountPct: number;
  totalCputimePct: number;
  totalTimePct: number;
  estimatedMinutesToRegainAccess: number;
}

/**
 * Configuration subset for UsageStore behavior.
 */
export interface UsageStoreConfig {
  ttlSeconds: number;
  stalenessThresholdMs: number;
  tierThresholds: { caution: number; restricted: number; critical: number };
  highCeilingThreshold: number;
}

/**
 * Result of getEffectiveUsage() — includes the computed percentage, derived tier, and staleness flag.
 */
export interface EffectiveUsageResult {
  percentage: number;
  tier: UsageTier;
  isStale: boolean;
}

/**
 * App-level usage metrics from the X-App-Usage header.
 * This is a SEPARATE rate-limit system from BUC (account-level).
 * Budget = 200 calls × number of app users, per hour.
 */
export interface AppUsageMetrics {
  callCountPct: number;
  totalCputimePct: number;
  totalTimePct: number;
}

/**
 * App-level usage result including effective percentage and tier.
 */
export interface AppUsageResult {
  callCountPct: number;
  totalCputimePct: number;
  totalTimePct: number;
  /** max of the three — the effective app-level usage */
  percentage: number;
  tier: UsageTier;
  lastUpdatedAt: number | null;
}

// ---------------------------------------------------------------------------
// Redis Hash Field Names (snake_case for Redis convention)
// ---------------------------------------------------------------------------

const REDIS_FIELDS = {
  callCountPct: 'call_count_pct',
  totalCputimePct: 'total_cputime_pct',
  totalTimePct: 'total_time_pct',
  estimatedMinutesToRegainAccess: 'estimated_minutes_to_regain',
  rollingImpressionsEstimate: 'rolling_impressions_estimate',
  lastUpdatedAt: 'last_updated_at',
  ceilingClassification: 'ceiling_classification',
} as const;

// ---------------------------------------------------------------------------
// UsageStore Class
// ---------------------------------------------------------------------------

export class UsageStore {
  private redis: Redis | null;
  private config: UsageStoreConfig;
  private realtimeService: typeof RealtimeService;

  /**
   * Local memory fallback cache used when Redis is unavailable.
   * Defaults unknown accounts to Caution tier (Requirement 2.4).
   */
  private localCache: Map<string, AccountUsageRecord> = new Map();

  /**
   * Local memory fallback for app-level usage when Redis is unavailable.
   */
  private appUsageCache: (AppUsageMetrics & { lastUpdatedAt: number }) | null = null;

  /**
   * Tracks last known tier per account for detecting tier transitions.
   */
  private lastKnownTier: Map<string, UsageTier> = new Map();

  constructor(
    redis: Redis | null,
    config?: Partial<UsageStoreConfig>,
    realtimeService?: typeof RealtimeService
  ) {
    this.redis = redis;
    this.config = {
      ttlSeconds: config?.ttlSeconds ?? rateLimitConfig.usageRecordTtlSeconds,
      stalenessThresholdMs: config?.stalenessThresholdMs ?? rateLimitConfig.stalenessThresholdMs,
      tierThresholds: config?.tierThresholds ?? rateLimitConfig.tierThresholds,
      highCeilingThreshold: config?.highCeilingThreshold ?? rateLimitConfig.highCeilingImpressionThreshold,
    };
    this.realtimeService = realtimeService ?? RealtimeService;
  }

  // -------------------------------------------------------------------------
  // Public Methods
  // -------------------------------------------------------------------------

  /**
   * Update usage metrics for an account.
   * Overwrites ONLY the fields present in the provided metrics (Requirement 2.2).
   * Updates lastUpdatedAt to the current timestamp.
   * Sets TTL on the Redis key (Requirement 2.5).
   * Uses atomic Redis operations (MULTI/EXEC) for concurrent safety (Requirement 2.7).
   */
  async updateUsage(accountId: string, metrics: Partial<AccountUsageMetrics>): Promise<void> {
    const now = Date.now();
    const redisKey = this.getRedisKey(accountId);

    // Determine old tier before update (for transition detection)
    const oldTier = await this.getTier(accountId);

    if (this.isRedisAvailable()) {
      try {
        const fields: [string, string][] = [];

        if (metrics.callCountPct !== undefined) {
          fields.push([REDIS_FIELDS.callCountPct, String(metrics.callCountPct)]);
        }
        if (metrics.totalCputimePct !== undefined) {
          fields.push([REDIS_FIELDS.totalCputimePct, String(metrics.totalCputimePct)]);
        }
        if (metrics.totalTimePct !== undefined) {
          fields.push([REDIS_FIELDS.totalTimePct, String(metrics.totalTimePct)]);
        }
        if (metrics.estimatedMinutesToRegainAccess !== undefined) {
          fields.push([REDIS_FIELDS.estimatedMinutesToRegainAccess, String(metrics.estimatedMinutesToRegainAccess)]);
        }

        // Always update lastUpdatedAt
        fields.push([REDIS_FIELDS.lastUpdatedAt, String(now)]);

        if (fields.length > 0) {
          // Atomic MULTI/EXEC for concurrent read/write safety
          const pipeline = this.redis!.multi();
          pipeline.hset(redisKey, ...fields.flat());
          pipeline.expire(redisKey, this.config.ttlSeconds);
          await pipeline.exec();
        }
      } catch (error) {
        logger.warn('[UsageStore] Redis write failed, falling back to local cache', {
          component: 'UsageStore',
          accountId,
          error: (error as Error).message,
        });
        this.updateLocalCache(accountId, metrics, now);
      }
    } else {
      // Redis unavailable — use local memory fallback
      this.updateLocalCache(accountId, metrics, now);
    }

    // Detect tier transition and broadcast if changed
    const newTier = await this.getTier(accountId);
    await this.detectAndBroadcastTierTransition(accountId, oldTier, newTier);
  }

  /**
   * Update the rolling impressions estimate for an account (Requirement 3.1).
   * Also updates the ceiling classification (Requirement 3.2).
   */
  async updateImpressionsEstimate(accountId: string, impressions: number): Promise<void> {
    const redisKey = this.getRedisKey(accountId);
    const classification = UsageStore.classifyCeiling(impressions, this.config.highCeilingThreshold);

    if (this.isRedisAvailable()) {
      try {
        const pipeline = this.redis!.multi();
        pipeline.hset(
          redisKey,
          REDIS_FIELDS.rollingImpressionsEstimate, String(impressions),
          REDIS_FIELDS.ceilingClassification, classification
        );
        pipeline.expire(redisKey, this.config.ttlSeconds);
        await pipeline.exec();
      } catch (error) {
        logger.warn('[UsageStore] Redis write failed for impressions update', {
          component: 'UsageStore',
          accountId,
          error: (error as Error).message,
        });
        // Fallback to local cache
        const existing = this.localCache.get(accountId);
        if (existing) {
          existing.rollingImpressionsEstimate = impressions;
          existing.ceilingClassification = classification;
        }
      }
    } else {
      const existing = this.localCache.get(accountId);
      if (existing) {
        existing.rollingImpressionsEstimate = impressions;
        existing.ceilingClassification = classification;
      } else {
        this.localCache.set(accountId, {
          accountId,
          callCountPct: 0,
          totalCputimePct: 0,
          totalTimePct: 0,
          estimatedMinutesToRegainAccess: 0,
          rollingImpressionsEstimate: impressions,
          lastUpdatedAt: Date.now(),
          ceilingClassification: classification,
        });
      }
    }
  }

  /**
   * Get the full usage record for an account.
   * Returns null if no record exists.
   */
  async getUsageRecord(accountId: string): Promise<AccountUsageRecord | null> {
    if (this.isRedisAvailable()) {
      try {
        const redisKey = this.getRedisKey(accountId);
        const data = await this.redis!.hgetall(redisKey);

        if (!data || Object.keys(data).length === 0) {
          // Check local cache as secondary
          return this.localCache.get(accountId) ?? null;
        }

        return this.parseRedisHash(accountId, data);
      } catch (error) {
        logger.warn('[UsageStore] Redis read failed, using local cache', {
          component: 'UsageStore',
          accountId,
          error: (error as Error).message,
        });
        return this.localCache.get(accountId) ?? null;
      }
    }

    // Redis unavailable — use local memory fallback
    return this.localCache.get(accountId) ?? null;
  }

  /**
   * Get the effective usage percentage and tier for an account (Requirement 2.6).
   * Returns max(callCountPct, totalCputimePct, totalTimePct) as effective percentage.
   * Marks records older than 5 minutes as stale-but-usable (Requirement 2.3).
   * If no record exists and Redis is unavailable, defaults to Caution tier (Requirement 2.4).
   */
  async getEffectiveUsage(accountId: string): Promise<EffectiveUsageResult> {
    const record = await this.getUsageRecord(accountId);

    if (!record) {
      // No usage record for this account. There are two very different cases,
      // and conflating them caused a silent polling deadlock:
      //
      //  1. Redis is UNAVAILABLE → we genuinely cannot know the account's usage,
      //     so default to the conservative Caution tier (Requirement 4.4).
      //
      //  2. Redis IS available but this account simply has no record yet — it
      //     was just connected, or its 2-hour TTL expired between polls. "No
      //     record" is NOT evidence of high usage. Defaulting to Caution here is
      //     a deadlock: background polling (ANALYTICS_REFRESH / POLLING) is not
      //     permitted in Caution, so the job is deferred; but the ONLY thing
      //     that writes a fresh usage record is a *successful* governed API
      //     call — which only happens when polling runs. Polling is blocked →
      //     record never recreated → account stays Caution forever → all smart
      //     polling silently freezes ~2h after the last successful sync.
      //
      // Treat "Redis up + no record" as Normal (0% usage) so the next poll can
      // run and re-establish a real usage record. This is safe: if the account
      // is actually throttled, the very next governed call returns the usage
      // header (or a 429 / error 80002) and immediately escalates it to Critical
      // via escalateToCritical(). TTL expiry thus becomes a recovery path
      // instead of a trap.
      const redisUp = this.isRedisAvailable();
      return {
        percentage: 0,
        tier: redisUp ? UsageTier.NORMAL : UsageTier.CAUTION,
        isStale: true,
      };
    }

    const percentage = UsageStore.computeEffectivePercentage(record);
    const tier = UsageStore.determineTier(percentage, this.config.tierThresholds);
    const isStale = (Date.now() - record.lastUpdatedAt) > this.config.stalenessThresholdMs;

    return { percentage, tier, isStale };
  }

  /**
   * Get the current tier for an account.
   * Shortcut for getEffectiveUsage().tier.
   */
  async getTier(accountId: string): Promise<UsageTier> {
    const { tier } = await this.getEffectiveUsage(accountId);
    return tier;
  }

  /**
   * Get the ceiling classification for an account (HIGH or LOW).
   * Newly connected accounts with no data default to LOW (Requirement 3.3).
   */
  async getCeilingClassification(accountId: string): Promise<CeilingClassification> {
    const record = await this.getUsageRecord(accountId);

    if (!record) {
      return CeilingClassification.LOW;
    }

    return UsageStore.classifyCeiling(
      record.rollingImpressionsEstimate,
      this.config.highCeilingThreshold
    );
  }

  // -------------------------------------------------------------------------
  // App-Level Usage (X-App-Usage) — separate from BUC account-level usage
  // -------------------------------------------------------------------------

  /**
   * Redis key for app-level usage (single global key for the whole app).
   */
  private getAppUsageRedisKey(): string {
    return 'usage:app:global';
  }

  /**
   * Update app-level usage metrics from the X-App-Usage header.
   * This is the 200×users/hour budget — a different system from BUC.
   */
  async updateAppUsage(metrics: AppUsageMetrics): Promise<void> {
    const now = Date.now();
    const redisKey = this.getAppUsageRedisKey();

    if (this.isRedisAvailable()) {
      try {
        const pipeline = this.redis!.multi();
        pipeline.hset(
          redisKey,
          'call_count_pct', String(metrics.callCountPct),
          'total_cputime_pct', String(metrics.totalCputimePct),
          'total_time_pct', String(metrics.totalTimePct),
          'last_updated_at', String(now)
        );
        // App usage resets hourly — TTL of 1 hour keeps it fresh
        pipeline.expire(redisKey, 3600);
        await pipeline.exec();
        return;
      } catch (error) {
        logger.warn('[UsageStore] Redis write failed for app usage', {
          component: 'UsageStore',
          error: (error as Error).message,
        });
      }
    }

    // Local memory fallback
    this.appUsageCache = { ...metrics, lastUpdatedAt: now };
  }

  /**
   * Escalate APP-LEVEL usage to Critical immediately.
   * Called when an App-Level throttle (error code 4) or HTTP 429 with the
   * X-App-Usage header at/near 100% is received. Sets all app-level percentages
   * to 100 so the scheduler treats the WHOLE app as Critical and stops all
   * accounts until the hourly window resets.
   */
  async escalateAppToCritical(): Promise<void> {
    await this.updateAppUsage({
      callCountPct: 100,
      totalCputimePct: 100,
      totalTimePct: 100,
    });

    logger.warn('[UsageStore] ⚠️ App-Level usage escalated to CRITICAL (app-wide throttle)', {
      component: 'UsageStore',
    });

    // Broadcast app-wide throttle so the frontend can show a global notice
    try {
      this.realtimeService.broadcastToWorkspace('global', 'app-level-critical', {
        message: 'App-wide rate limit reached. Refreshes paused until the next hour.',
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.warn('[UsageStore] Failed to broadcast app-level-critical event', {
        component: 'UsageStore',
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get app-level usage. Returns the effective percentage (max of three metrics)
   * and the derived tier. Returns zeros if no data captured yet.
   */
  async getAppUsage(): Promise<AppUsageResult> {
    let metrics: AppUsageMetrics | null = null;
    let lastUpdatedAt: number | null = null;

    if (this.isRedisAvailable()) {
      try {
        const data = await this.redis!.hgetall(this.getAppUsageRedisKey());
        if (data && Object.keys(data).length > 0) {
          metrics = {
            callCountPct: parseFloat(data.call_count_pct || '0'),
            totalCputimePct: parseFloat(data.total_cputime_pct || '0'),
            totalTimePct: parseFloat(data.total_time_pct || '0'),
          };
          lastUpdatedAt = parseInt(data.last_updated_at || '0', 10) || null;
        }
      } catch (error) {
        logger.warn('[UsageStore] Redis read failed for app usage', {
          component: 'UsageStore',
          error: (error as Error).message,
        });
      }
    }

    if (!metrics && this.appUsageCache) {
      metrics = {
        callCountPct: this.appUsageCache.callCountPct,
        totalCputimePct: this.appUsageCache.totalCputimePct,
        totalTimePct: this.appUsageCache.totalTimePct,
      };
      lastUpdatedAt = this.appUsageCache.lastUpdatedAt;
    }

    if (!metrics) {
      return {
        callCountPct: 0,
        totalCputimePct: 0,
        totalTimePct: 0,
        percentage: 0,
        tier: UsageTier.NORMAL,
        lastUpdatedAt: null,
      };
    }

    const percentage = Math.max(
      metrics.callCountPct,
      metrics.totalCputimePct,
      metrics.totalTimePct
    );
    const tier = UsageStore.determineTier(percentage, this.config.tierThresholds);

    return { ...metrics, percentage, tier, lastUpdatedAt };
  }

  /**
   * Escalate an account to Critical tier immediately.
   * Called when error code 80002 or HTTP 429 is received (Requirement 1.9).
   * Sets all percentages to 100 and the estimated minutes to regain access.
   */
  async escalateToCritical(accountId: string, minutesToRegain: number): Promise<void> {
    const criticalMetrics: Partial<AccountUsageMetrics> = {
      callCountPct: 100,
      totalCputimePct: 100,
      totalTimePct: 100,
      estimatedMinutesToRegainAccess: minutesToRegain,
    };

    // Get old tier before escalation
    const oldTier = await this.getTier(accountId);

    const now = Date.now();
    const redisKey = this.getRedisKey(accountId);

    if (this.isRedisAvailable()) {
      try {
        const pipeline = this.redis!.multi();
        pipeline.hset(
          redisKey,
          REDIS_FIELDS.callCountPct, '100',
          REDIS_FIELDS.totalCputimePct, '100',
          REDIS_FIELDS.totalTimePct, '100',
          REDIS_FIELDS.estimatedMinutesToRegainAccess, String(minutesToRegain),
          REDIS_FIELDS.lastUpdatedAt, String(now)
        );
        pipeline.expire(redisKey, this.config.ttlSeconds);
        await pipeline.exec();
      } catch (error) {
        logger.warn('[UsageStore] Redis write failed during escalation, using local cache', {
          component: 'UsageStore',
          accountId,
          error: (error as Error).message,
        });
        this.updateLocalCache(accountId, criticalMetrics, now);
      }
    } else {
      this.updateLocalCache(accountId, criticalMetrics, now);
    }

    // Always broadcast the tier transition for escalation
    await this.detectAndBroadcastTierTransition(accountId, oldTier, UsageTier.CRITICAL);
  }

  // -------------------------------------------------------------------------
  // Pure Static Functions (exported for testability)
  // -------------------------------------------------------------------------

  /**
   * Compute the effective usage percentage from an account record.
   * Returns max(callCountPct, totalCputimePct, totalTimePct) (Requirement 2.6).
   */
  static computeEffectivePercentage(record: AccountUsageRecord): number {
    return Math.max(
      record.callCountPct,
      record.totalCputimePct,
      record.totalTimePct
    );
  }

  /**
   * Determine the usage tier from an effective percentage and configured thresholds.
   * Normal: [0, caution), Caution: [caution, restricted),
   * Restricted: [restricted, critical), Critical: [critical, ∞)
   */
  static determineTier(
    percentage: number,
    thresholds: UsageStoreConfig['tierThresholds']
  ): UsageTier {
    if (percentage >= thresholds.critical) {
      return UsageTier.CRITICAL;
    }
    if (percentage >= thresholds.restricted) {
      return UsageTier.RESTRICTED;
    }
    if (percentage >= thresholds.caution) {
      return UsageTier.CAUTION;
    }
    return UsageTier.NORMAL;
  }

  /**
   * Classify an account's ceiling based on rolling impressions estimate.
   * Above threshold → HIGH, below or null → LOW (Requirement 3.2, 3.3).
   */
  static classifyCeiling(
    impressions: number | null,
    threshold: number
  ): CeilingClassification {
    if (impressions === null || impressions < threshold) {
      return CeilingClassification.LOW;
    }
    return CeilingClassification.HIGH;
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  /**
   * Get the Redis key for an account's usage record.
   */
  private getRedisKey(accountId: string): string {
    return `usage:${accountId}`;
  }

  /**
   * Check if Redis is available and connected.
   */
  private isRedisAvailable(): boolean {
    // Lazily attach the shared Redis connection if we don't have one yet.
    // This handles construction-time timing where Redis wasn't ready.
    if (!this.redis) {
      try {
        const redis = getSharedRedisConnection();
        if (redis) {
          this.redis = redis;
        }
      } catch {
        // Redis unavailable — fall back to local memory cache
      }
    }
    return !!this.redis;
  }

  /**
   * Parse a Redis hash into an AccountUsageRecord.
   */
  private parseRedisHash(accountId: string, data: Record<string, string>): AccountUsageRecord {
    return {
      accountId,
      callCountPct: parseFloat(data[REDIS_FIELDS.callCountPct] || '0'),
      totalCputimePct: parseFloat(data[REDIS_FIELDS.totalCputimePct] || '0'),
      totalTimePct: parseFloat(data[REDIS_FIELDS.totalTimePct] || '0'),
      estimatedMinutesToRegainAccess: parseFloat(data[REDIS_FIELDS.estimatedMinutesToRegainAccess] || '0'),
      rollingImpressionsEstimate: data[REDIS_FIELDS.rollingImpressionsEstimate]
        ? parseFloat(data[REDIS_FIELDS.rollingImpressionsEstimate])
        : null,
      lastUpdatedAt: parseInt(data[REDIS_FIELDS.lastUpdatedAt] || '0', 10),
      ceilingClassification: (data[REDIS_FIELDS.ceilingClassification] as CeilingClassification) || CeilingClassification.LOW,
    };
  }

  /**
   * Update the local memory fallback cache.
   */
  private updateLocalCache(accountId: string, metrics: Partial<AccountUsageMetrics>, now: number): void {
    const existing = this.localCache.get(accountId);

    if (existing) {
      if (metrics.callCountPct !== undefined) existing.callCountPct = metrics.callCountPct;
      if (metrics.totalCputimePct !== undefined) existing.totalCputimePct = metrics.totalCputimePct;
      if (metrics.totalTimePct !== undefined) existing.totalTimePct = metrics.totalTimePct;
      if (metrics.estimatedMinutesToRegainAccess !== undefined) {
        existing.estimatedMinutesToRegainAccess = metrics.estimatedMinutesToRegainAccess;
      }
      existing.lastUpdatedAt = now;
    } else {
      this.localCache.set(accountId, {
        accountId,
        callCountPct: metrics.callCountPct ?? 0,
        totalCputimePct: metrics.totalCputimePct ?? 0,
        totalTimePct: metrics.totalTimePct ?? 0,
        estimatedMinutesToRegainAccess: metrics.estimatedMinutesToRegainAccess ?? 0,
        rollingImpressionsEstimate: null,
        lastUpdatedAt: now,
        ceilingClassification: CeilingClassification.LOW,
      });
    }
  }

  /**
   * Detect tier transitions and emit structured log + WebSocket broadcast (Requirements 2.8, 4.10).
   */
  private async detectAndBroadcastTierTransition(
    accountId: string,
    oldTier: UsageTier,
    newTier: UsageTier
  ): Promise<void> {
    if (oldTier === newTier) {
      this.lastKnownTier.set(accountId, newTier);
      return;
    }

    // Structured log on tier transition (Requirement 2.8)
    logger.info(`[UsageStore] Tier transition: ${oldTier}→${newTier}`, {
      component: 'UsageStore',
      accountId,
      oldTier,
      newTier,
    });

    this.lastKnownTier.set(accountId, newTier);

    // Get estimated time for recovery info
    const record = await this.getUsageRecord(accountId);
    const estimatedMinutesToRecover = record?.estimatedMinutesToRegainAccess ?? 0;

    // Broadcast tier change via WebSocket (Requirement 4.10)
    try {
      this.realtimeService.broadcastToWorkspace('global', 'tier-change', {
        accountId,
        oldTier,
        newTier,
        estimatedMinutesToRecover,
      });
    } catch (error) {
      // Non-critical — don't let broadcast failure affect core functionality
      logger.warn('[UsageStore] Failed to broadcast tier change via WebSocket', {
        component: 'UsageStore',
        accountId,
        error: (error as Error).message,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton Factory
// ---------------------------------------------------------------------------

let usageStoreInstance: UsageStore | null = null;

/**
 * Get or create the singleton UsageStore instance.
 * Uses the shared Redis connection from the application's Redis module.
 * Falls back gracefully to local memory cache if Redis is unavailable.
 */
export function getUsageStoreInstance(): UsageStore {
  if (!usageStoreInstance) {
    // Create with null initially — Redis is attached lazily on first write
    usageStoreInstance = new UsageStore(null);
  }

  // Attempt to upgrade from memory to Redis if not already connected
  if (!(usageStoreInstance as any).redis) {
    try {
      const redis = getSharedRedisConnection();
      if (redis) {
        (usageStoreInstance as any).redis = redis;
      }
    } catch (error) {
      // Still no Redis — continue with memory fallback
    }
  }

  return usageStoreInstance;
}

/**
 * Reset the singleton instance (useful for testing).
 */
export function resetUsageStoreInstance(): void {
  usageStoreInstance = null;
}

export default UsageStore;
