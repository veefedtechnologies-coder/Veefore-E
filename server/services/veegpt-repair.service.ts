/**
 * VGU consistency repair (spec §51, §53).
 *
 * Redis counters are fast but volatile; the Mongo ledger is durable but not on the
 * hot path. They can legitimately diverge for a moment (a reservation is counted
 * in Redis before its ledger event is written), and they can diverge permanently
 * after an outage, a crash mid-reconciliation, or an outbox drop.
 *
 * This module DETECTS each divergence class and repairs it safely:
 *
 *   drift               Redis period total ≠ ledger total
 *   orphaned reservation open in Redis but never reconciled
 *   stale reservation    past its deadline with no terminal state
 *   missing event        reservation reconciled but no ledger row
 *   duplicate event      more than one ledger row for a reservation
 *   negative counter     a counter driven below zero by an over-refund
 *
 * SAFETY RULES
 *  • The ledger is authoritative: repair moves Redis toward the ledger, never the
 *    other way. Rewriting the ledger from a volatile counter would destroy the
 *    only durable record.
 *  • In-flight work is excluded. A reservation still RESERVED is legitimately in
 *    Redis and not yet in the ledger, so counting it as drift would "repair" away
 *    real usage and hand out free capacity.
 *  • Repair NEVER lowers a counter below the ledger total, and never below zero.
 *  • Dry-run by default: nothing is written unless `apply` is set.
 */

import { getRedisClient } from '../lib/redis';
import { RESERVATION_KEYS as K } from './veegpt-reservation.engine';
import {
  VeegptUsageEvent,
  ledgerPeriodTotal,
  ledgerPoolTotal,
  drainLedgerOutbox,
  ledgerOutboxDepth,
} from './veegpt-ledger';
import { reservationTtlSec, roundVGU } from '../config/veegpt-vgu.config';
import logger from '../config/logger';

/**
 * Tolerance for counter drift, in VGU.
 *
 * Redis HINCRBYFLOAT accumulates IEEE error across reserve/adjust cycles, so an
 * exact match is not achievable. This is far below any quota decision boundary
 * (caps are whole numbers), so drift under it cannot change an outcome.
 */
export const DRIFT_TOLERANCE_VGU = 0.05;

export interface DriftFinding {
  kind:
    | 'drift'
    | 'orphaned_reservation'
    | 'stale_reservation'
    | 'missing_event'
    | 'duplicate_event'
    | 'negative_counter';
  userId?: string;
  workspaceId?: string;
  billingPeriodId?: string;
  reservationId?: string;
  redisValue?: number;
  ledgerValue?: number;
  delta?: number;
  detail?: string;
  repaired: boolean;
}

export interface RepairReport {
  scannedUsers: number;
  findings: DriftFinding[];
  outboxDrained: number;
  outboxRemaining: number;
  /** True when nothing needed fixing. */
  healthy: boolean;
}

/**
 * Compare a single user's Redis period counter with the ledger and optionally
 * repair it.
 *
 * In-flight reservations are added to the ledger total before comparing: they are
 * genuinely counted in Redis and genuinely absent from the ledger, so treating
 * them as drift would erase live usage.
 */
export async function verifyUserPeriod(
  userId: string,
  billingPeriodId: string,
  opts: { apply?: boolean } = {}
): Promise<DriftFinding[]> {
  const redis = getRedisClient();
  const findings: DriftFinding[] = [];

  let redisTotal = 0;
  try {
    redisTotal =
      Number(await redis.hget(K.period(userId, billingPeriodId), 'total')) || 0;
  } catch (err) {
    logger.warn('vgu-repair: could not read the Redis counter', {
      userId,
      err: err instanceof Error ? err.message : String(err),
      module: 'veegpt-repair',
    });
    return findings;
  }

  const ledger = await ledgerPeriodTotal(userId, billingPeriodId);
  const inFlight = await inFlightVGU(userId);
  const expected = roundVGU(ledger.vgu + inFlight);
  const delta = roundVGU(redisTotal - expected);

  // A counter below zero is always a bug (an over-refund), never legitimate.
  if (redisTotal < 0) {
    const f: DriftFinding = {
      kind: 'negative_counter',
      userId,
      billingPeriodId,
      redisValue: redisTotal,
      ledgerValue: ledger.vgu,
      repaired: false,
      detail: 'counter driven below zero',
    };
    if (opts.apply) {
      await redis
        .hset(K.period(userId, billingPeriodId), 'total', String(expected))
        .catch(() => {});
      f.repaired = true;
    }
    findings.push(f);
    return findings;
  }

  if (Math.abs(delta) > DRIFT_TOLERANCE_VGU) {
    const f: DriftFinding = {
      kind: 'drift',
      userId,
      billingPeriodId,
      redisValue: redisTotal,
      ledgerValue: expected,
      delta,
      repaired: false,
      detail:
        delta > 0
          ? `Redis over-counts by ${delta} VGU (user is being over-charged)`
          : `Redis under-counts by ${-delta} VGU (user has unearned capacity)`,
    };
    if (opts.apply) {
      // Move Redis to the ledger's value. Never below zero.
      await redis
        .hset(
          K.period(userId, billingPeriodId),
          'total',
          String(Math.max(0, expected))
        )
        .catch(() => {});
      f.repaired = true;
      logger.warn('vgu-repair: counter realigned to the ledger', {
        userId,
        billingPeriodId,
        from: redisTotal,
        to: expected,
        module: 'veegpt-repair',
      });
    }
    findings.push(f);
  }

  return findings;
}

/** VGU currently held by this user's still-open reservations. */
async function inFlightVGU(userId: string): Promise<number> {
  const redis = getRedisClient();
  try {
    const ids = await redis.zrange(K.concurrency(userId), 0, -1);
    if (!ids.length) return 0;
    let total = 0;
    for (const id of ids) {
      const rec = await redis.hmget(K.reservation(id), 'status', 'reserved');
      if (rec[0] === 'RESERVED') total += Number(rec[1]) || 0;
    }
    return roundVGU(total);
  } catch {
    return 0;
  }
}

/** Compare a workspace pool counter with the ledger and optionally repair it. */
export async function verifyWorkspacePool(
  workspaceId: string,
  billingPeriodId: string,
  opts: { apply?: boolean } = {}
): Promise<DriftFinding[]> {
  const redis = getRedisClient();
  const findings: DriftFinding[] = [];
  let redisTotal = 0;
  try {
    redisTotal =
      Number(await redis.hget(K.pool(workspaceId, billingPeriodId), 'total')) ||
      0;
  } catch {
    return findings;
  }
  const ledgerTotal = await ledgerPoolTotal(workspaceId, billingPeriodId);
  const delta = roundVGU(redisTotal - ledgerTotal);

  if (Math.abs(delta) > DRIFT_TOLERANCE_VGU) {
    const f: DriftFinding = {
      kind: 'drift',
      workspaceId,
      billingPeriodId,
      redisValue: redisTotal,
      ledgerValue: ledgerTotal,
      delta,
      repaired: false,
      detail: 'workspace pool differs from the ledger',
    };
    if (opts.apply) {
      await redis
        .hset(
          K.pool(workspaceId, billingPeriodId),
          'total',
          String(Math.max(0, ledgerTotal))
        )
        .catch(() => {});
      f.repaired = true;
    }
    findings.push(f);
  }
  return findings;
}

/**
 * Reservations that never reached a terminal state.
 *
 * Their VGU charge is intentionally KEPT — we cannot know whether the provider
 * call completed, and assuming it did is the only safe assumption for cost. What
 * repair does is close the record and free the concurrency slot so the user is not
 * blocked forever.
 */
export async function findStaleReservations(
  opts: { apply?: boolean; limit?: number } = {}
): Promise<DriftFinding[]> {
  const redis = getRedisClient();
  const findings: DriftFinding[] = [];
  const cutoff = Date.now() - reservationTtlSec() * 1000;

  let ids: string[] = [];
  try {
    ids = await redis.zrange(K.open, 0, (opts.limit ?? 500) - 1);
  } catch {
    return findings;
  }

  for (const id of ids) {
    let rec: Record<string, string> = {};
    try {
      rec = await redis.hgetall(K.reservation(id));
    } catch {
      continue;
    }

    // The record is gone but the index still points at it.
    if (!rec || !Object.keys(rec).length) {
      const f: DriftFinding = {
        kind: 'orphaned_reservation',
        reservationId: id,
        repaired: false,
        detail: 'index entry with no reservation record',
      };
      if (opts.apply) {
        await redis.zrem(K.open, id).catch(() => {});
        f.repaired = true;
      }
      findings.push(f);
      continue;
    }

    const createdAt = Number(rec.createdAt) || 0;
    if (rec.status === 'RESERVED' && createdAt > 0 && createdAt < cutoff) {
      const f: DriftFinding = {
        kind: 'stale_reservation',
        reservationId: id,
        redisValue: Number(rec.reserved) || 0,
        repaired: false,
        detail: `RESERVED for longer than the ${reservationTtlSec()}s TTL; charge retained, slot freed`,
      };
      if (opts.apply) {
        await redis
          .hset(K.reservation(id), 'status', 'EXPIRED')
          .catch(() => {});
        const meta = safeJson(rec.meta);
        const userId = typeof meta.userId === 'string' ? meta.userId : '';
        if (userId) {
          await redis.zrem(K.concurrency(userId), id).catch(() => {});
        }
        await redis.zrem(K.open, id).catch(() => {});
        f.repaired = true;
      }
      findings.push(f);
    } else if (rec.status && rec.status !== 'RESERVED') {
      // Terminal but still indexed — harmless, just tidy it away.
      const f: DriftFinding = {
        kind: 'orphaned_reservation',
        reservationId: id,
        repaired: false,
        detail: `already ${rec.status} but still in the open index`,
      };
      if (opts.apply) {
        await redis.zrem(K.open, id).catch(() => {});
        f.repaired = true;
      }
      findings.push(f);
    }
  }
  return findings;
}

/** Ledger rows sharing a reservationId — should be impossible (unique index). */
export async function findDuplicateEvents(
  since?: Date
): Promise<DriftFinding[]> {
  const match: Record<string, unknown> = {};
  if (since) match.createdAt = { $gte: since };
  const rows = await VeegptUsageEvent.aggregate<{
    _id: string;
    count: number;
  }>([
    { $match: match },
    { $group: { _id: '$reservationId', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 100 },
  ]).exec();

  return rows.map(r => ({
    kind: 'duplicate_event' as const,
    reservationId: r._id,
    detail: `${r.count} ledger rows for one reservation — the unique index should prevent this`,
    repaired: false,
  }));
}

/**
 * Reservations that reached a terminal state in Redis but have no ledger row.
 * Indicates a lost ledger write (Mongo outage with an exhausted outbox).
 */
export async function findMissingEvents(
  opts: { limit?: number } = {}
): Promise<DriftFinding[]> {
  const redis = getRedisClient();
  const findings: DriftFinding[] = [];
  let ids: string[] = [];
  try {
    // Scan a bounded slice of recently-known reservations.
    ids = await redis.zrange(K.open, 0, (opts.limit ?? 200) - 1);
  } catch {
    return findings;
  }
  if (!ids.length) return findings;

  const existing = new Set(
    (
      await VeegptUsageEvent.find({ reservationId: { $in: ids } })
        .select('reservationId')
        .lean()
        .exec()
    ).map(d => (d as { reservationId: string }).reservationId)
  );

  for (const id of ids) {
    if (existing.has(id)) continue;
    let status = '';
    try {
      status = (await redis.hget(K.reservation(id), 'status')) || '';
    } catch {
      continue;
    }
    // Only terminal reservations should have a ledger row.
    if (status && status !== 'RESERVED') {
      findings.push({
        kind: 'missing_event',
        reservationId: id,
        detail: `reservation is ${status} but has no ledger row`,
        repaired: false,
      });
    }
  }
  return findings;
}

function safeJson(s?: string): Record<string, unknown> {
  if (!s) return {};
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Full consistency pass.
 *
 * Always drains the ledger outbox FIRST: replaying buffered events removes the
 * most common cause of apparent drift, so the scan does not "repair" a difference
 * that was about to resolve itself.
 */
export async function runRepair(
  opts: {
    apply?: boolean;
    users?: Array<{ userId: string; billingPeriodId: string }>;
    workspaces?: Array<{ workspaceId: string; billingPeriodId: string }>;
  } = {}
): Promise<RepairReport> {
  const outbox = await drainLedgerOutbox(1000);

  const findings: DriftFinding[] = [];
  for (const u of opts.users || []) {
    findings.push(
      ...(await verifyUserPeriod(u.userId, u.billingPeriodId, {
        apply: opts.apply,
      }))
    );
  }
  for (const w of opts.workspaces || []) {
    findings.push(
      ...(await verifyWorkspacePool(w.workspaceId, w.billingPeriodId, {
        apply: opts.apply,
      }))
    );
  }
  findings.push(...(await findStaleReservations({ apply: opts.apply })));
  findings.push(...(await findDuplicateEvents()));
  findings.push(...(await findMissingEvents()));

  const report: RepairReport = {
    scannedUsers: (opts.users || []).length,
    findings,
    outboxDrained: outbox.drained,
    outboxRemaining: outbox.remaining,
    healthy: findings.length === 0,
  };

  if (findings.length) {
    logger.warn('vgu-repair: consistency issues found', {
      apply: !!opts.apply,
      counts: findings.reduce<Record<string, number>>((acc, f) => {
        acc[f.kind] = (acc[f.kind] || 0) + 1;
        return acc;
      }, {}),
      outboxRemaining: report.outboxRemaining,
      module: 'veegpt-repair',
    });
  }
  return report;
}

/** Outbox backlog, for the alerting layer. */
export { ledgerOutboxDepth };
