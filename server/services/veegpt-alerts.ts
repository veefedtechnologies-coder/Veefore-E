/**
 * Alerts (spec §57).
 *
 * Periodically scans the operational signals the rest of the system already
 * records — the provider guard's unmetered-call counter, the ledger's fallback
 * pricing and reservation-leak markers, the repair service's divergence report,
 * Redis daily counters — and raises structured alerts.
 *
 * WHY A SCAN RATHER THAN INLINE THROWS
 * The conditions §57 lists are AGGREGATE ("cost spike", "premium usage spike",
 * "reservation leak") — you cannot judge them from one request. So each request
 * cheaply records a signal (a counter, a log line, a ledger flag) and this module
 * reads those signals on a schedule and decides. Keeping the judgement in one
 * place means the thresholds live together and an alert fires once, not per
 * request.
 *
 * DELIVERY
 * Alerts are logged at error (critical) / warn (warning) — which the platform's
 * log pipeline already ships — and pushed to a capped Redis list an admin route
 * can read. This module does not own paging/email; wiring those to the same
 * `emitAlert` seam is a later, non-blocking step.
 */

import { getRedisClient } from '../lib/redis';
import { providerGuardStats } from './ai-provider-guard';
import logger from '../config/logger';

export type AlertSeverity = 'critical' | 'warning';

export type AlertKind =
  // Critical (§57)
  | 'ai_cost_spike'
  | 'premium_usage_spike'
  | 'redis_quota_failure'
  | 'reconciliation_failure'
  | 'reservation_leak'
  | 'quota_bypass'
  | 'unmetered_ai_call'
  // Warning (§57)
  | 'high_vgu_usage'
  | 'unusual_model_distribution'
  | 'abnormal_user_usage'
  | 'provider_pricing_mismatch';

export interface Alert {
  kind: AlertKind;
  severity: AlertSeverity;
  message: string;
  /** Supporting evidence, safe to show an admin. */
  detail: Record<string, unknown>;
  at: string;
}

/** Capped list of recent alerts, for the admin surface. */
const ALERTS_KEY = 'vgu:alerts:recent';
const ALERTS_MAX = 500;

function todayKey(prefix: string): string {
  return `${prefix}:${new Date().toISOString().slice(0, 10)}`;
}

function envNum(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Record an alert: log it at the right level and push it to the capped Redis
 * list. Never throws — an alerting failure must not cascade.
 */
export async function emitAlert(alert: Omit<Alert, 'at'>): Promise<void> {
  const full: Alert = { ...alert, at: new Date().toISOString() };
  const line = `vgu-alert [${full.severity}] ${full.kind}: ${full.message}`;
  if (full.severity === 'critical') logger.error(line, { ...full.detail, module: 'veegpt-alerts' });
  else logger.warn(line, { ...full.detail, module: 'veegpt-alerts' });
  try {
    const redis = getRedisClient();
    await redis.lpush(ALERTS_KEY, JSON.stringify(full));
    await redis.ltrim(ALERTS_KEY, 0, ALERTS_MAX - 1);
    // A per-kind daily counter so a spike of the SAME alert is itself visible.
    await redis.incr(todayKey(`vgu:alerts:count:${full.kind}`));
  } catch {
    /* the log line above is the durable record; Redis is a convenience */
  }
}

/** The most recent alerts, newest first, for the admin dashboard. */
export async function recentAlerts(limit = 100): Promise<Alert[]> {
  try {
    const raw = await getRedisClient().lrange(ALERTS_KEY, 0, Math.max(0, limit - 1));
    return raw
      .map(r => {
        try {
          return JSON.parse(r) as Alert;
        } catch {
          return null;
        }
      })
      .filter((a): a is Alert => !!a);
  } catch {
    return [];
  }
}

export interface AlertScanInput {
  /**
   * The most recent repair report, when the scheduler just ran repair. Lets the
   * scan turn reservation leaks / reconciliation divergence into alerts without
   * re-scanning Mongo itself.
   */
  repair?: {
    reservationLeaks?: number;
    reconciliationDivergences?: number;
    fallbackPriced?: number;
  };
}

/**
 * Read the operational signals and raise any alert whose threshold is crossed.
 * Returns the alerts it raised (also emitted). Safe to call on a schedule.
 */
export async function scanForAlerts(input: AlertScanInput = {}): Promise<Alert[]> {
  const raised: Alert[] = [];
  const add = async (a: Omit<Alert, 'at'>) => {
    const full: Alert = { ...a, at: new Date().toISOString() };
    raised.push(full);
    await emitAlert(a);
  };

  const redis = getRedisClient();

  // ── CRITICAL: an AI endpoint reached a provider without a metered context ──
  // The provider guard counts these. In production this must be zero; any
  // non-zero value is a coverage regression (§57 "AI endpoint without
  // enforcement" / "quota bypass").
  const guard = providerGuardStats();
  if (guard.unmeteredCalls > 0) {
    await add({
      kind: 'unmetered_ai_call',
      severity: 'critical',
      message: `${guard.unmeteredCalls} provider call(s) were made outside a metered context.`,
      detail: {
        unmeteredCalls: guard.unmeteredCalls,
        blockedCalls: guard.blockedCalls,
        guardedCalls: guard.guardedCalls,
      },
    });
  }

  // ── CRITICAL: Redis quota-verification failures ────────────────────────────
  // The reservation engine increments this when it cannot verify quota state.
  try {
    const failures = Number(await redis.get(todayKey('vgu:redis_failures'))) || 0;
    if (failures >= envNum('VGU_ALERT_REDIS_FAILURES', 10)) {
      await add({
        kind: 'redis_quota_failure',
        severity: 'critical',
        message: `${failures} Redis quota-verification failures today.`,
        detail: { failures },
      });
    }
  } catch {
    /* the metric is best-effort */
  }

  // ── CRITICAL: reservation leak / reconciliation divergence (from repair) ───
  if (input.repair) {
    const leaks = input.repair.reservationLeaks ?? 0;
    if (leaks >= envNum('VGU_ALERT_RESERVATION_LEAKS', 5)) {
      await add({
        kind: 'reservation_leak',
        severity: 'critical',
        message: `${leaks} reservation(s) were leaked and reclaimed by repair.`,
        detail: { leaks },
      });
    }
    const div = input.repair.reconciliationDivergences ?? 0;
    if (div >= envNum('VGU_ALERT_RECONCILIATION_DIVERGENCES', 5)) {
      await add({
        kind: 'reconciliation_failure',
        severity: 'critical',
        message: `${div} counter/ledger divergence(s) were repaired.`,
        detail: { divergences: div },
      });
    }
    // ── WARNING: provider pricing mismatch (conservative fallback used) ──────
    const fb = input.repair.fallbackPriced ?? 0;
    if (fb >= envNum('VGU_ALERT_FALLBACK_PRICED', 20)) {
      await add({
        kind: 'provider_pricing_mismatch',
        severity: 'warning',
        message: `${fb} event(s) were priced with the conservative fallback — a model may be missing from the pricing registry.`,
        detail: { fallbackPriced: fb },
      });
    }
  }

  return raised;
}

/** Reset the recent-alerts list. Admin "acknowledge / clear". */
export async function clearAlerts(): Promise<void> {
  try {
    await getRedisClient().del(ALERTS_KEY);
  } catch {
    /* nothing to do */
  }
}
