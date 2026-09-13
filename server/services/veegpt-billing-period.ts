/**
 * Billing-period resolution — spec §13.
 *
 * Monthly VGU follows the user's ACTUAL subscription period, not the calendar
 * month. Resetting everyone on the 1st would give a user who renews on the 20th
 * a free top-up ten days early, and would strand usage across two periods.
 *
 * Every usage event and counter is keyed by `billingPeriodId`, so usage always
 * belongs to exactly one period and a renewal starts a clean counter without a
 * cron job.
 */

import { getRedisClient } from '../lib/redis';
import SubscriptionRepository from '../features/subscription/db/repositories/SubscriptionRepository';
import logger from '../config/logger';

export interface BillingPeriod {
  /** Stable id, e.g. "sub_abc:2026-08-20" or "cal:2026-08" for free users. */
  id: string;
  start: Date;
  end: Date;
  /** Seconds until the period ends (used for counter TTLs). */
  secondsRemaining: number;
  /** True when derived from the calendar rather than a real subscription. */
  calendarFallback: boolean;
  /** The subscription this period belongs to; absent on the calendar fallback. */
  subscriptionId?: string;
}

/** Start of the current UTC calendar month. */
function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Start of the next UTC calendar month. */
function nextMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/**
 * Calendar-month period, used for users with no subscription document (free
 * signups) and as the safe fallback when the subscription cannot be read.
 */
export function calendarPeriod(now = new Date()): BillingPeriod {
  const start = monthStart(now);
  const end = nextMonthStart(now);
  return {
    id: `cal:${now.toISOString().slice(0, 7)}`,
    start,
    end,
    secondsRemaining: Math.max(
      1,
      Math.ceil((end.getTime() - now.getTime()) / 1000)
    ),
    calendarFallback: true,
  };
}

const CACHE_PREFIX = 'vgu:period:';
const CACHE_TTL_SEC = 300;

/**
 * Resolve the billing period in force for a user.
 *
 * Cached for 5 minutes because this runs on every AI request. The cache is keyed
 * per user and holds the resolved window, so a renewal is picked up within the
 * TTL — and because the period id embeds the period start, a stale cache can
 * never charge usage into the wrong period for longer than the TTL.
 */
export async function resolveBillingPeriod(
  userId: string,
  now = new Date()
): Promise<BillingPeriod> {
  if (!userId) return calendarPeriod(now);

  const redis = getRedisClient();
  const cacheKey = `${CACHE_PREFIX}${userId}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const p = JSON.parse(cached) as {
        id: string;
        start: string;
        end: string;
        calendarFallback: boolean;
        subscriptionId?: string;
      };
      const end = new Date(p.end);
      // Only trust the cache while it still covers "now".
      if (end.getTime() > now.getTime()) {
        return {
          id: p.id,
          start: new Date(p.start),
          end,
          secondsRemaining: Math.max(
            1,
            Math.ceil((end.getTime() - now.getTime()) / 1000)
          ),
          calendarFallback: p.calendarFallback,
          subscriptionId: p.subscriptionId,
        };
      }
    }
  } catch {
    /* cache miss / parse failure → resolve directly */
  }

  let period = calendarPeriod(now);
  try {
    const sub = await new SubscriptionRepository().findByUserId(userId);
    const start = sub?.currentPeriodStart
      ? new Date(sub.currentPeriodStart)
      : null;
    const end = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;

    // Use the subscription window only when it is valid AND actually contains
    // now. A stale/expired document must not define the current period, or usage
    // would accumulate forever in a window that never rolls over.
    if (
      start &&
      end &&
      !Number.isNaN(start.getTime()) &&
      !Number.isNaN(end.getTime()) &&
      end.getTime() > start.getTime() &&
      now.getTime() >= start.getTime() &&
      now.getTime() < end.getTime()
    ) {
      const subId = String(
        (sub as { id?: string; _id?: unknown })?.id ??
          (sub as { _id?: unknown })?._id ??
          userId
      );
      period = {
        id: `sub_${subId}:${start.toISOString().slice(0, 10)}`,
        start,
        end,
        secondsRemaining: Math.max(
          1,
          Math.ceil((end.getTime() - now.getTime()) / 1000)
        ),
        calendarFallback: false,
        subscriptionId: subId,
      };
    }
  } catch (err) {
    logger.warn('vgu: billing period resolution failed — using calendar month', {
      userId,
      err: err instanceof Error ? err.message : String(err),
      module: 'veegpt-billing-period',
    });
  }

  try {
    await redis.set(
      cacheKey,
      JSON.stringify({
        id: period.id,
        start: period.start.toISOString(),
        end: period.end.toISOString(),
        calendarFallback: period.calendarFallback,
        subscriptionId: period.subscriptionId,
      }),
      'EX',
      Math.min(CACHE_TTL_SEC, period.secondsRemaining)
    );
  } catch {
    /* best effort */
  }

  return period;
}

/**
 * Drop the cached period for a user. Must be called when a subscription changes
 * (upgrade, downgrade, renewal, cancellation) so the new period takes effect
 * immediately rather than after the cache TTL.
 */
export async function invalidateBillingPeriod(userId: string): Promise<void> {
  try {
    await getRedisClient().del(`${CACHE_PREFIX}${userId}`);
  } catch {
    /* best effort */
  }
}
