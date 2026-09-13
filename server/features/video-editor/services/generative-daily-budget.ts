/**
 * Generative_Daily_Budget — a per-WORKSPACE daily cap on generative video
 * (Google Omni/Veo) provider calls.
 *
 * WHY this exists: `generativeVideoApiKey()` resolves ONLY server env keys, so
 * every workspace shares ONE Google API key. Google meters
 * `generate_requests_per_model_per_day` PER API KEY, which means the (small)
 * daily Omni/Veo request pool is shared app-wide — a single heavy workspace can
 * starve everyone else. This module is a SECONDARY, app-side guardrail that caps
 * how many generative operations one workspace may start per UTC day. Google's
 * own quota remains the hard stop; this only keeps one tenant from burning the
 * shared pool.
 *
 * Design rules:
 *  - DISABLED BY DEFAULT. `VIDEO_EDITOR_GENERATIVE_DAILY_LIMIT_PER_WORKSPACE`
 *    unset / `0` / negative / non-numeric ⇒ no gating at all, and Redis is never
 *    touched. Existing production behaviour therefore does not silently change.
 *  - FAIL OPEN. Redis unavailable, a rejected command, a hung client — anything
 *    that throws resolves to `{ allowed: true }` with a string-first warn. A
 *    secondary guardrail must never become a new failure mode.
 *  - The counter is a plain `INCR` on a UTC-day-scoped key with a TTL set ONLY
 *    when the key is new (`INCR` returned 1). TTL = seconds until the next UTC
 *    midnight, floored at 60 s so a near-midnight consume still gets a sane TTL
 *    and the key can never leak.
 *
 * The limit-resolution and reset-window MATH live in exported PURE helpers
 * ({@link resolveDailyLimit}, {@link msUntilNextUtcMidnight}) so they are
 * unit-testable with zero Redis. Both are total: they never throw.
 *
 * ESM static imports only; string-first logger only (mirrors
 * `generative-video.service.ts` / `edit-localization.service.ts`).
 */

import { logger as defaultLogger } from '../../../config/logger';
import { getRedisClient } from '../../../lib/redis';

const COMPONENT = 'videoEditor.GenerativeDailyBudget';

/** Redis key prefix for the per-workspace, per-UTC-day counter. */
const KEY_PREFIX = 'veditor:genbudget';

/** Env var holding the per-workspace daily cap. Unset/≤0 ⇒ disabled. */
export const DAILY_LIMIT_ENV_VAR = 'VIDEO_EDITOR_GENERATIVE_DAILY_LIMIT_PER_WORKSPACE';

/** Milliseconds in a day (used for the UTC reset-window math). */
const DAY_MS = 24 * 60 * 60 * 1000;

/** Floor for the key TTL (seconds) so a near-midnight key still expires sanely. */
const MIN_TTL_SECONDS = 60;

// ---------------------------------------------------------------------------
// Pure helpers (no Redis, no env mutation, never throw)
// ---------------------------------------------------------------------------

/**
 * Resolve the effective per-workspace daily limit from an env-like record.
 *
 * PURE + TOTAL. `0` means DISABLED (the default), so anything that is not a
 * finite integer `>= 1` resolves to `0`:
 *   - unset / empty / whitespace  → 0 (disabled)
 *   - `'0'`, `'-3'`              → 0 (disabled)
 *   - `'abc'`, `'1.5'`, `'NaN'`  → 0 (disabled)
 *   - `'5'`                      → 5
 *
 * @param env Environment-like record (defaults to `process.env`).
 * @returns The daily limit, or `0` when gating is disabled.
 */
export function resolveDailyLimit(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env?.[DAILY_LIMIT_ENV_VAR];
  if (raw === undefined || raw === null) return 0;
  const trimmed = String(raw).trim();
  if (trimmed === '') return 0;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return 0;
  return n;
}

/**
 * Milliseconds from `nowMs` until the next UTC midnight (the reset boundary).
 *
 * PURE + TOTAL. The result is always in `(0, DAY_MS]` for a finite input; a
 * non-finite input falls back to a full day so callers always get a usable
 * window. Exactly at UTC midnight the answer is a full day (the day that just
 * started resets a day later).
 *
 * @param nowMs Epoch milliseconds.
 * @returns Milliseconds remaining until the next UTC midnight.
 */
export function msUntilNextUtcMidnight(nowMs: number): number {
  if (!Number.isFinite(nowMs)) return DAY_MS;
  const sinceMidnight = ((nowMs % DAY_MS) + DAY_MS) % DAY_MS;
  return DAY_MS - sinceMidnight;
}

/**
 * The UTC calendar date (`YYYY-MM-DD`) the counter is bucketed by.
 *
 * PURE + TOTAL — a non-finite input falls back to the epoch date rather than
 * throwing on `toISOString()`.
 *
 * @param nowMs Epoch milliseconds.
 * @returns The `YYYY-MM-DD` UTC date string.
 */
export function utcDateKey(nowMs: number): string {
  const ms = Number.isFinite(nowMs) ? nowMs : 0;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Build the Redis key for one workspace/day bucket:
 * `veditor:genbudget:<workspaceId>:<YYYY-MM-DD>`.
 *
 * PURE + TOTAL.
 *
 * @param workspaceId Workspace identifier (blank collapses to `unknown`).
 * @param nowMs Epoch milliseconds used to derive the UTC date bucket.
 */
export function budgetKey(workspaceId: string, nowMs: number): string {
  const ws = (workspaceId || '').trim() || 'unknown';
  return `${KEY_PREFIX}:${ws}:${utcDateKey(nowMs)}`;
}

// ---------------------------------------------------------------------------
// Public contracts
// ---------------------------------------------------------------------------

/** The verdict of one {@link GenerativeDailyBudget.tryConsume} attempt. */
export interface DailyBudgetDecision {
  /** `true` when the caller may proceed with the provider call. */
  allowed: boolean;
  /** The effective daily limit; `0` means gating is disabled. */
  limit: number;
  /** Calls counted for this workspace today (`0` when disabled/unknown). */
  used: number;
  /** Milliseconds until the counter resets (next UTC midnight). */
  resetsInMs: number;
}

/**
 * The tiny subset of the Redis client this module needs. Kept structural so the
 * counter can be exercised against a fake in tests without a real connection.
 */
export interface DailyBudgetRedis {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
}

/** Injectable collaborators (defaulted for production, overridable in tests). */
export interface GenerativeDailyBudgetDeps {
  /** Redis accessor. Defaults to the shared `getRedisClient()` singleton. */
  getRedis?: () => DailyBudgetRedis;
  /** Env-like record used for limit resolution. Defaults to `process.env`. */
  env?: Record<string, string | undefined>;
  logger?: Pick<typeof defaultLogger, 'info' | 'warn' | 'error' | 'debug'>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Redis-backed per-workspace daily counter for generative video provider calls.
 *
 * One {@link tryConsume} call == one generative operation the caller is about to
 * start. The counter is incremented BEFORE the provider call so an over-budget
 * workspace never reaches Google and never gets charged credits.
 */
export class GenerativeDailyBudget {
  private readonly getRedis: () => DailyBudgetRedis;
  private readonly env: Record<string, string | undefined>;
  private readonly log: Pick<typeof defaultLogger, 'info' | 'warn' | 'error' | 'debug'>;

  constructor(deps: GenerativeDailyBudgetDeps = {}) {
    this.getRedis = deps.getRedis ?? (() => getRedisClient() as unknown as DailyBudgetRedis);
    this.env = deps.env ?? process.env;
    this.log = deps.logger ?? defaultLogger;
  }

  /**
   * Count one generative operation against this workspace's daily budget.
   *
   * Behaviour:
   *  - Gating disabled (limit `0`) ⇒ short-circuits BEFORE touching Redis and
   *    returns `{ allowed: true, limit: 0, used: 0 }`.
   *  - Enabled ⇒ atomic `INCR`, then `EXPIRE` only when the key is new (the
   *    `INCR` returned 1), with TTL = seconds until the next UTC midnight
   *    (floored at 60 s). Allowed while the post-increment count `<= limit`.
   *  - Any Redis failure ⇒ FAIL OPEN (`allowed: true`) with a string-first warn.
   *
   * Never throws.
   *
   * @param workspaceId The workspace the operation belongs to.
   * @param nowMs Epoch milliseconds (injectable for deterministic tests).
   * @returns The {@link DailyBudgetDecision} for this attempt.
   */
  async tryConsume(workspaceId: string, nowMs: number = Date.now()): Promise<DailyBudgetDecision> {
    const limit = resolveDailyLimit(this.env);
    const resetsInMs = msUntilNextUtcMidnight(nowMs);

    // Disabled by default — no Redis round-trip, no behaviour change.
    if (limit <= 0) {
      return { allowed: true, limit: 0, used: 0, resetsInMs };
    }

    const key = budgetKey(workspaceId, nowMs);

    try {
      const redis = this.getRedis();
      const used = await redis.incr(key);
      if (used === 1) {
        // Brand-new bucket: give it a TTL so the key expires shortly after the
        // UTC day it counts. Floored at 60 s for near-midnight consumes.
        const ttlSeconds = Math.max(MIN_TTL_SECONDS, Math.ceil(resetsInMs / 1000));
        await redis.expire(key, ttlSeconds);
      }

      const allowed = used <= limit;
      if (!allowed) {
        this.log?.warn?.('Workspace hit the generative video daily budget', {
          component: COMPONENT,
          workspaceId,
          limit,
          used,
          resetsInMs,
        });
      }
      return { allowed, limit, used, resetsInMs };
    } catch (error) {
      // FAIL OPEN: this is a secondary guardrail, never a new failure mode.
      this.log?.warn?.('Generative daily budget check failed; failing open', {
        component: COMPONENT,
        workspaceId,
        limit,
        error: error instanceof Error ? error.message : String(error),
      });
      return { allowed: true, limit, used: 0, resetsInMs };
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton accessor (mirrors getGenerativeVideoService / getEditLocalizationService)
// ---------------------------------------------------------------------------

let generativeDailyBudgetInstance: GenerativeDailyBudget | null = null;

/** Get or lazily create the shared {@link GenerativeDailyBudget} instance. */
export function getGenerativeDailyBudget(): GenerativeDailyBudget {
  if (!generativeDailyBudgetInstance) {
    generativeDailyBudgetInstance = new GenerativeDailyBudget();
  }
  return generativeDailyBudgetInstance;
}
