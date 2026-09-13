/**
 * Plan resolution for VeeGPT quota decisions.
 *
 * This is all that survives of the old `veegpt-usage.service.ts`. That module
 * used to own a second usage engine — Redis GET → compare → INCRBY counters, a
 * monthly Mongo mirror, a fail-open gate and a "premium turns" counter. All of it
 * is gone, replaced by the single authoritative engine:
 *
 *   server/services/veegpt-reservation.engine.ts  atomic quota + counters
 *   server/services/veegpt-metering.ts            withVGU lifecycle
 *   server/services/veegpt-ledger.ts              durable audit trail
 *
 * Keeping the old counters alongside the new ones would have meant two sets of
 * numbers that drift, and two answers to "how much has this user used" — exactly
 * the duplication the specification forbids.
 *
 * The plan lookup itself is still needed on every AI request, so it lives here on
 * its own, with the same brief Redis cache it always had.
 */

import { getRedisClient } from '../lib/redis';
import SubscriptionRepository from '../features/subscription/db/repositories/SubscriptionRepository';
import { getEntitlementService } from '../features/subscription/services/EntitlementService';
import type { PlanId } from '../config/plan-config';
import logger from '../config/logger';

const PLAN_CACHE_PREFIX = 'veegpt:rl:plan:';
const PLAN_CACHE_TTL_SEC = 60;

/**
 * Resolve the user's plan from the Subscription document (never the stale
 * `req.user.plan`), cached briefly because this runs on every AI request.
 *
 * Returns null when it genuinely cannot be resolved. Callers must NOT treat that
 * as "unlimited": `meterAI` maps it to `free`, the most restrictive real plan, so
 * a lookup failure can never become free premium usage.
 */
export async function resolveVeegptPlan(
  userId: string
): Promise<PlanId | null> {
  const redis = getRedisClient();
  const cacheKey = `${PLAN_CACHE_PREFIX}${userId}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) return cached as PlanId;
  } catch {
    /* ignore cache read errors — fall through to a direct read */
  }

  try {
    const entitlementService = getEntitlementService(
      redis,
      new SubscriptionRepository()
    );
    const plan = await entitlementService.getPlan(userId);
    try {
      await redis.set(cacheKey, plan, 'EX', PLAN_CACHE_TTL_SEC);
    } catch {
      /* ignore cache write errors */
    }
    return plan;
  } catch (err) {
    logger.warn('veegpt-plan: plan resolution failed', {
      userId,
      err: err instanceof Error ? err.message : String(err),
      module: 'veegpt-plan',
    });
    return null;
  }
}

/** Drop the cached plan so a subscription change takes effect immediately. */
export async function invalidateVeegptPlanCache(userId: string): Promise<void> {
  try {
    await getRedisClient().del(`${PLAN_CACHE_PREFIX}${userId}`);
  } catch {
    /* the cache expires on its own within a minute */
  }
}

const AGE_CACHE_PREFIX = 'veegpt:acctage:';
/**
 * Account age barely changes, and the only consumer is an abuse signal that
 * cares whether it is under a day. A 6-hour cache keeps a database read off the
 * AI hot path while staying far more precise than that signal needs.
 */
const AGE_CACHE_TTL_SEC = 6 * 3600;

/**
 * Whole days since the account was created, or undefined when unknown.
 *
 * Used only by the abuse `account` signal (heavy volume from an account created
 * hours ago is the throwaway-account pattern). Returning undefined disables that
 * one signal rather than guessing — a wrong age would accuse a long-standing
 * customer of being a throwaway.
 */
export async function accountAgeDays(
  userId: string
): Promise<number | undefined> {
  const key = `${AGE_CACHE_PREFIX}${userId}`;
  try {
    const cached = await getRedisClient().get(key);
    if (cached !== null) {
      const n = Number(cached);
      // '' is the cached "unknown" marker, so a missing createdAt does not
      // re-query the database on every request.
      return cached === '' || !Number.isFinite(n) ? undefined : n;
    }
  } catch {
    /* treated as a miss */
  }

  // CACHE MISS — do NOT block the caller on a database read.
  //
  // This value only feeds one abuse signal, and the AI request it would delay is
  // the user's own. A slow lookup here measurably stalled a request (seconds, on a
  // cold cache), which is a bad trade for a heuristic input. So warm the cache in
  // the background and let this request run without the signal; every subsequent
  // request has it.
  void warmAccountAge(userId, key);
  return undefined;
}

/** Populate the account-age cache off the request path. Never throws. */
async function warmAccountAge(userId: string, key: string): Promise<void> {
  let days: number | undefined;
  try {
    const { storage } = await import('../storage');
    const user = await storage.getUser(userId);
    const created = (user as { createdAt?: unknown } | undefined)?.createdAt;
    const t = created ? new Date(created as string | Date).getTime() : NaN;
    if (Number.isFinite(t)) {
      days = Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
    }
  } catch {
    /* unknown — the signal simply does not fire */
  }
  try {
    await getRedisClient().set(
      key,
      days === undefined ? '' : String(days),
      'EX',
      AGE_CACHE_TTL_SEC
    );
  } catch {
    /* caching is an optimisation, not a requirement */
  }
}
