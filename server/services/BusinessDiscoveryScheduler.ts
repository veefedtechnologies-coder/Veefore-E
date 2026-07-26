/**
 * BusinessDiscoveryScheduler — Optional Tier 4 competitor lookups.
 *
 * Business Discovery fetches public metrics for tracked competitor accounts via
 * Meta's `business_discovery` field expansion. It is a conditional/optional
 * capability that is OFF by default and entirely gated behind
 * `config.smartPolling.businessDiscovery.enabled`.
 *
 * This module is an enhancement layer that plugs into the existing
 * `GovernedHttpClient → UsageStore → TieredJobScheduler` flow — it never
 * duplicates the foundation:
 *  - Tier 4, deferrable without an upper bound on deferral time under load
 *    (Req 9.1) — dispatched via {@link TieredJobScheduler.dispatchOrDefer} as a
 *    {@link JobType.POLLING} job, which is permitted only at Normal tier and is
 *    therefore the first work deferred (and re-dispatched without bound) under
 *    pressure.
 *  - At most once per 24h per tracked competitor (Req 9.2) — enforced by a
 *    per-competitor Redis marker following the
 *    `smartpoll:{metric}:{accountId}` convention used by
 *    {@link TieredJobScheduler}.
 *  - Capped at `maxCompetitorsPerAccount` competitors per connected account
 *    (Req 9.3) — enforced by the pure, exported {@link enforceCompetitorCap}.
 *  - Routed through {@link GovernedHttpClient} so each lookup counts against the
 *    account's usage like any other governed call (Req 9.5).
 *  - A not-found / inaccessible competitor records a failed lookup, marks the
 *    job complete, and is NOT retried (Req 9.6).
 *
 * smart-polling-system Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 */

import type Redis from 'ioredis';
import { logger } from '../config/logger';
import { rateLimitConfig, type RateLimitConfig } from '../config/rateLimitConfig';
import { getSharedRedisConnection } from '../lib/redis';
import { JobType, type ScheduledJob, TieredJobScheduler } from './TieredJobScheduler';
import {
  GovernedHttpClient,
  GovernedHttpClientError,
  getGovernedHttpClient,
} from './GovernedHttpClient';
import { getUsageStoreInstance } from './UsageStore';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Redis key prefix for the per-competitor "last looked up" marker
 * (smart-polling-system Req 9.2). Mirrors the `smartpoll:{metric}:{accountId}`
 * marker-key convention used by {@link TieredJobScheduler}, extended with the
 * competitor username so the once-per-24h gate is per tracked competitor.
 */
export const BUSINESS_DISCOVERY_MARKER_PREFIX = 'smartpoll:business_discovery:';

/**
 * Meta Graph API error codes that indicate the requested competitor account
 * cannot be found or is not accessible via Business Discovery (Req 9.6):
 *  - 100: invalid parameter / unknown alias passed to `business_discovery.username()`
 *  - 110: object does not exist or cannot be loaded
 *  - 803: the alias/username could not be resolved
 *  - 24:  business-discovery target is not a business/creator account (inaccessible)
 */
export const COMPETITOR_NOT_FOUND_ERROR_CODES: ReadonlySet<number> = new Set([100, 110, 803, 24]);

/**
 * Priority for Business_Discovery_Jobs. Lower number = higher priority in the
 * scheduler; Business Discovery is the lowest-priority background work (Tier 4),
 * so it uses a high number to sit behind all user-facing and automation work.
 */
const BUSINESS_DISCOVERY_JOB_PRIORITY = 20;

/** Meta Graph API version used for Business Discovery lookups. */
const GRAPH_API_VERSION = 'v22.0';

// ---------------------------------------------------------------------------
// Result Types
// ---------------------------------------------------------------------------

/**
 * Per-competitor disposition produced by {@link BusinessDiscoveryScheduler.scheduleForAccount}.
 */
export type CompetitorDisposition =
  | 'dispatched'        // Tier 4 dispatch permitted now (Req 9.1)
  | 'deferred'          // deferred under load, re-dispatchable without bound (Req 9.1)
  | 'within_window'     // already looked up inside the 24h window (Req 9.2)
  | 'over_cap'          // dropped because it exceeded maxCompetitorsPerAccount (Req 9.3)
  | 'failed_lookup';    // not found / inaccessible (Req 9.6)

/**
 * Outcome of scheduling Business Discovery for one connected account.
 */
export interface BusinessDiscoveryScheduleResult {
  /** Whether the feature flag was enabled (Req 9.4). */
  enabled: boolean;
  /** Number of competitor usernames requested before the cap. */
  requested: number;
  /** Number of competitors considered after the cap (≤ maxCompetitorsPerAccount, Req 9.3). */
  capped: number;
  /** Per-competitor disposition keyed by username. */
  dispositions: Record<string, CompetitorDisposition>;
}

/**
 * Optional inputs for performing the actual governed lookup. Scheduling
 * (cap + once-per-24h gating + Tier 4 dispatch) works without these; the
 * governed API call (Req 9.5) is only attempted when a `token` is supplied.
 */
export interface BusinessDiscoveryDispatchOptions {
  /** IG user id used as the API node for the lookup. Defaults to `accountId`. */
  igUserId?: string;
  /** OAuth token for the governed request — required to perform a live lookup. */
  token?: string;
  /** Override "now" (Unix ms) for deterministic testing of the 24h window. */
  now?: number;
}

// ---------------------------------------------------------------------------
// Pure Helpers (exported for testability)
// ---------------------------------------------------------------------------

/**
 * Pure: enforce the per-account competitor cap (smart-polling-system Req 9.3).
 *
 * Returns at most `maxCompetitorsPerAccount` competitor usernames, preserving
 * input order, after trimming blanks and de-duplicating (case-insensitively) so
 * the cap counts distinct competitors. The cap is loaded from
 * `config.smartPolling.businessDiscovery.maxCompetitorsPerAccount` by callers
 * and passed in here — this function holds no literals.
 *
 * A non-positive or non-finite cap yields an empty list (no competitors are
 * scheduled), which is the safe interpretation of "schedule for no more than N".
 *
 * @param usernames The requested competitor usernames.
 * @param maxCompetitorsPerAccount The configured cap.
 * @returns The capped, de-duplicated list of usernames in input order.
 */
export function enforceCompetitorCap(
  usernames: string[],
  maxCompetitorsPerAccount: number
): string[] {
  if (!Number.isFinite(maxCompetitorsPerAccount) || maxCompetitorsPerAccount <= 0) {
    return [];
  }

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const raw of usernames) {
    if (typeof raw !== 'string') {
      continue;
    }
    const username = raw.trim();
    if (username === '') {
      continue;
    }
    const key = username.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(username);
  }

  const cap = Math.floor(maxCompetitorsPerAccount);
  return deduped.slice(0, cap);
}

/**
 * Pure: does this error indicate the competitor account is not found or not
 * accessible (smart-polling-system Req 9.6)?
 *
 * Recognizes {@link GovernedHttpClientError}s carrying a Meta error code in
 * {@link COMPETITOR_NOT_FOUND_ERROR_CODES}, an HTTP 404, and the common raw
 * Meta/Graph error shapes (so the helper works whether the caller has a
 * `GovernedHttpClientError` or a plain error object).
 *
 * @param error The error thrown by the lookup.
 * @returns Whether the error means "competitor not found / inaccessible".
 */
export function isCompetitorNotFoundError(error: unknown): boolean {
  if (error == null || typeof error !== 'object') {
    return false;
  }

  if (error instanceof GovernedHttpClientError) {
    if (error.statusCode === 404) {
      return true;
    }
    return error.metaErrorCode != null && COMPETITOR_NOT_FOUND_ERROR_CODES.has(error.metaErrorCode);
  }

  const e = error as Record<string, any>;
  const status = e.statusCode ?? e.status ?? e?.response?.status;
  if (Number(status) === 404) {
    return true;
  }
  const code =
    e.metaErrorCode ??
    e.code ??
    e?.error?.code ??
    e?.response?.data?.error?.code;
  return code != null && COMPETITOR_NOT_FOUND_ERROR_CODES.has(Number(code));
}

/**
 * Pure: build the per-competitor once-per-24h marker key (Req 9.2). Follows the
 * `smartpoll:{metric}:{accountId}` convention, extended with the (lower-cased)
 * competitor username.
 */
export function buildBusinessDiscoveryMarkerKey(accountId: string, username: string): string {
  return `${BUSINESS_DISCOVERY_MARKER_PREFIX}${accountId}:${username.trim().toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// BusinessDiscoveryScheduler
// ---------------------------------------------------------------------------

export class BusinessDiscoveryScheduler {
  private readonly scheduler: TieredJobScheduler;
  private readonly config: RateLimitConfig;
  private client: GovernedHttpClient | null;
  private redis: Redis | null = null;

  /**
   * @param scheduler The shared {@link TieredJobScheduler} used to dispatch or
   *   defer Tier 4 Business_Discovery_Jobs (Req 9.1).
   * @param config The rate-limit config supplying the feature flag, interval,
   *   and competitor cap (Req 9.2, 9.3, 9.4). Defaults to the singleton config.
   * @param client Optional {@link GovernedHttpClient} for routing lookups
   *   (Req 9.5). When omitted it is resolved lazily from the shared UsageStore.
   */
  constructor(
    scheduler: TieredJobScheduler,
    config: RateLimitConfig = rateLimitConfig,
    client?: GovernedHttpClient
  ) {
    this.scheduler = scheduler;
    this.config = config;
    this.client = client ?? null;
  }

  /**
   * Schedule Business Discovery lookups for a connected account
   * (smart-polling-system Req 9.1–9.6).
   *
   * Behavior:
   *  - Req 9.4: when the feature flag is disabled, NOTHING is scheduled and the
   *    method returns immediately with `enabled: false`.
   *  - Req 9.3: the competitor list is capped to
   *    `config.smartPolling.businessDiscovery.maxCompetitorsPerAccount` via the
   *    pure {@link enforceCompetitorCap}; competitors over the cap are dropped
   *    (`over_cap`).
   *  - Req 9.2: each remaining competitor is gated to at most once per 24h by a
   *    per-competitor Redis marker; competitors looked up within the window are
   *    skipped (`within_window`).
   *  - Req 9.1: each eligible competitor is dispatched as a Tier 4
   *    {@link JobType.POLLING} job via {@link TieredJobScheduler.dispatchOrDefer}.
   *    Under load the job is deferred to the durable queue and re-dispatched
   *    without an upper bound (`deferred`).
   *  - Req 9.5/9.6: when a `token` is supplied and the dispatch is permitted, the
   *    governed lookup is performed immediately through {@link GovernedHttpClient};
   *    a not-found / inaccessible competitor records a failed lookup, marks the
   *    work complete, and is NOT retried (`failed_lookup`).
   *
   * @param accountId The connected account scheduling competitor lookups.
   * @param competitorUsernames The tracked competitor usernames.
   * @param options Optional dispatch inputs (token / igUserId / now).
   * @returns A per-competitor disposition summary.
   */
  async scheduleForAccount(
    accountId: string,
    competitorUsernames: string[],
    options: BusinessDiscoveryDispatchOptions = {}
  ): Promise<BusinessDiscoveryScheduleResult> {
    const { enabled, maxCompetitorsPerAccount } = this.config.smartPolling.businessDiscovery;
    const requested = Array.isArray(competitorUsernames) ? competitorUsernames.length : 0;

    // Req 9.4 — feature disabled: schedule nothing.
    if (!enabled) {
      logger.info('[BusinessDiscoveryScheduler] Feature disabled — no jobs scheduled', {
        component: 'BusinessDiscoveryScheduler',
        accountId,
        requested,
      });
      return { enabled: false, requested, capped: 0, dispositions: {} };
    }

    // Req 9.3 — cap competitors per account (pure, no literals).
    const capped = enforceCompetitorCap(competitorUsernames ?? [], maxCompetitorsPerAccount);
    const dispositions: Record<string, CompetitorDisposition> = {};

    // Record competitors dropped by the cap so callers have full visibility.
    const cappedKeys = new Set(capped.map((u) => u.toLowerCase()));
    for (const raw of competitorUsernames ?? []) {
      if (typeof raw !== 'string') continue;
      const username = raw.trim();
      if (username === '') continue;
      const key = username.toLowerCase();
      if (!cappedKeys.has(key) && dispositions[username] === undefined) {
        dispositions[username] = 'over_cap';
      }
    }

    const now = options.now ?? Date.now();

    for (const username of capped) {
      // Req 9.2 — at most once per 24h per competitor.
      const eligible = await this.isCompetitorEligible(accountId, username, now);
      if (!eligible) {
        dispositions[username] = 'within_window';
        continue;
      }

      // Req 9.1 — Tier 4, deferrable without bound under load.
      const job: ScheduledJob = {
        id: `business-discovery-${accountId}-${username.toLowerCase()}`,
        accountId,
        type: JobType.POLLING,
        payload: { kind: 'business_discovery', accountId, username },
        priority: BUSINESS_DISCOVERY_JOB_PRIORITY,
        scheduledAt: now,
        retryCount: 0,
        maxRetries: this.config.queue.maxDeferredRetries,
      };

      const outcome = await this.scheduler.dispatchOrDefer(job);
      if (outcome === 'deferred') {
        dispositions[username] = 'deferred';
        continue;
      }

      // Permitted to run now. Perform the governed lookup when a token is given
      // (Req 9.5). The marker is set on every attempt so the once-per-24h gate
      // holds (Req 9.2), and a not-found/inaccessible result is recorded without
      // retry (Req 9.6).
      if (options.token) {
        const result = await this.lookupCompetitor(
          accountId,
          options.igUserId ?? accountId,
          options.token,
          username,
          now
        );
        dispositions[username] = result === 'failed_lookup' ? 'failed_lookup' : 'dispatched';
      } else {
        // No token to perform the call here — mark the 24h window and treat the
        // Tier 4 dispatch as done; the live call is performed by the worker that
        // owns the token, also routed through GovernedHttpClient (Req 9.5).
        await this.markCompetitorLookedUp(accountId, username, now);
        dispositions[username] = 'dispatched';
      }
    }

    logger.info('[BusinessDiscoveryScheduler] Scheduled competitor lookups', {
      component: 'BusinessDiscoveryScheduler',
      accountId,
      requested,
      capped: capped.length,
    });

    return { enabled: true, requested, capped: capped.length, dispositions };
  }

  /**
   * Perform a single Business Discovery lookup, routed through the
   * {@link GovernedHttpClient} so it counts against the account's usage exactly
   * like any other governed call (smart-polling-system Req 9.5).
   *
   * On a not-found / inaccessible competitor (Req 9.6) the result is recorded as
   * a failed lookup, the work is marked complete, and NO retry is scheduled —
   * the method resolves to `'failed_lookup'` rather than throwing. Any other
   * error (e.g. transient 5xx already retried internally, or a throttle) is
   * re-thrown so the owning job can be retried by its queue.
   *
   * @returns `'success'` when metrics were fetched, `'failed_lookup'` when the
   *   competitor is not found / inaccessible.
   */
  async lookupCompetitor(
    accountId: string,
    igUserId: string,
    token: string,
    username: string,
    now: number = Date.now()
  ): Promise<'success' | 'failed_lookup'> {
    const client = this.getClient();
    if (!client) {
      throw new Error('[BusinessDiscoveryScheduler] GovernedHttpClient unavailable — cannot perform lookup');
    }

    // Mark the once-per-24h window up front so a failed lookup is not retried in
    // a tight loop within the window (Req 9.2, 9.6).
    await this.markCompetitorLookedUp(accountId, username, now);

    const fields =
      `business_discovery.username(${username})` +
      `{username,name,followers_count,media_count,profile_picture_url}`;

    try {
      await client.request<{ business_discovery?: unknown }>({
        method: 'GET',
        path: `/${GRAPH_API_VERSION}/${igUserId}`,
        token,
        params: { fields },
        accountId,
        priority: 'low',
      });

      logger.info('[BusinessDiscoveryScheduler] Competitor lookup succeeded', {
        component: 'BusinessDiscoveryScheduler',
        accountId,
        username,
      });
      return 'success';
    } catch (error) {
      // Req 9.6 — not found / inaccessible: record failed lookup, mark complete,
      // do NOT retry.
      if (isCompetitorNotFoundError(error)) {
        logger.info('[BusinessDiscoveryScheduler] Competitor not found / inaccessible — recorded failed lookup, no retry', {
          component: 'BusinessDiscoveryScheduler',
          accountId,
          username,
          result: 'failed_lookup',
        });
        return 'failed_lookup';
      }

      // Any other error is propagated so the owning job's queue can retry it.
      logger.warn('[BusinessDiscoveryScheduler] Competitor lookup failed (retryable)', {
        component: 'BusinessDiscoveryScheduler',
        accountId,
        username,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Once-per-24h marker (Req 9.2)
  // -------------------------------------------------------------------------

  /**
   * Whether a competitor may be looked up now, i.e. it has NOT been looked up
   * within the configured interval (≤ 24h) for this account (Req 9.2).
   *
   * Reads the per-competitor Redis marker. Fails CLOSED (returns `false`) when
   * Redis is unavailable: Business Discovery is optional Tier 4 work, so it is
   * preferable to skip a cycle than to risk exceeding the once-per-24h budget.
   */
  async isCompetitorEligible(
    accountId: string,
    username: string,
    now: number = Date.now()
  ): Promise<boolean> {
    const redis = this.getRedis();
    if (!redis) {
      // Fail closed — cannot confirm the once-per-24h gate, so do not schedule.
      return false;
    }

    try {
      const raw = await redis.get(buildBusinessDiscoveryMarkerKey(accountId, username));
      if (!raw) {
        return true;
      }
      const lastLookedUpAt = parseInt(raw, 10);
      if (!Number.isFinite(lastLookedUpAt)) {
        return true;
      }
      const intervalMs = this.config.smartPolling.businessDiscovery.intervalMs;
      return now - lastLookedUpAt >= intervalMs;
    } catch (error) {
      logger.warn('[BusinessDiscoveryScheduler] Failed to read competitor marker — skipping this cycle', {
        component: 'BusinessDiscoveryScheduler',
        accountId,
        username,
        error: (error as Error).message,
      });
      return false;
    }
  }

  /**
   * Record that a competitor was looked up, gating subsequent lookups within the
   * configured interval (Req 9.2). The marker self-expires after the interval
   * (≤ 24h) so the key does not accumulate.
   */
  async markCompetitorLookedUp(
    accountId: string,
    username: string,
    now: number = Date.now()
  ): Promise<void> {
    const redis = this.getRedis();
    if (!redis) {
      return;
    }
    try {
      await redis.set(
        buildBusinessDiscoveryMarkerKey(accountId, username),
        String(now),
        'PX',
        this.config.smartPolling.businessDiscovery.intervalMs
      );
    } catch (error) {
      logger.warn('[BusinessDiscoveryScheduler] Failed to write competitor marker', {
        component: 'BusinessDiscoveryScheduler',
        accountId,
        username,
        error: (error as Error).message,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Lazy dependencies
  // -------------------------------------------------------------------------

  /**
   * Lazily resolve the GovernedHttpClient (Req 9.5). Returns null only when the
   * shared UsageStore/client cannot be constructed.
   */
  private getClient(): GovernedHttpClient | null {
    if (this.client) {
      return this.client;
    }
    try {
      const usageStore = getUsageStoreInstance();
      this.client = getGovernedHttpClient(usageStore);
    } catch (error) {
      logger.warn('[BusinessDiscoveryScheduler] Failed to resolve GovernedHttpClient', {
        component: 'BusinessDiscoveryScheduler',
        error: (error as Error).message,
      });
      this.client = null;
    }
    return this.client;
  }

  /**
   * Lazily resolve the shared Redis connection used for once-per-24h markers.
   * Returns null when Redis is unavailable so callers can fail closed.
   */
  private getRedis(): Redis | null {
    if (this.redis) {
      return this.redis;
    }
    try {
      const redis = getSharedRedisConnection();
      if (redis) {
        this.redis = redis;
      }
    } catch {
      // Redis unavailable — markers degrade to fail-closed behavior.
    }
    return this.redis;
  }
}

export default BusinessDiscoveryScheduler;
