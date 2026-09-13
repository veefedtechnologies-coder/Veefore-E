/**
 * Block 4 verification — durable ledger, outbox failover, repair/reconciliation.
 *
 * Runs against REAL Mongo and REAL Redis. Durability and drift-repair cannot be
 * proven with mocks: the whole point is what happens when a store misbehaves, so
 * failures are injected against live infrastructure.
 *
 * Run: npx tsx server/scripts/verify-vgu-ledger.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { connectionManager } from '../infrastructure/mongodb-connection';
import { getRedisClient } from '../lib/redis';
import { RESERVATION_KEYS as K } from '../services/veegpt-reservation.engine';
import { calendarPeriod } from '../services/veegpt-billing-period';
import { withVGU } from '../services/veegpt-metering';
import { recordAIUsage } from '../services/aiUsageTracker';
import {
  VeegptUsageEvent,
  writeLedgerEvent,
  drainLedgerOutbox,
  ledgerOutboxDepth,
  ledgerPeriodTotal,
  LEDGER_OUTBOX_KEY,
  type LedgerEntry,
} from '../services/veegpt-ledger';
import {
  runRepair,
  verifyUserPeriod,
  verifyWorkspacePool,
  findStaleReservations,
  findDuplicateEvents,
  DRIFT_TOLERANCE_VGU,
} from '../services/veegpt-repair.service';

const redis = getRedisClient();
const period = calendarPeriod();

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : fail++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  → got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`
  );
}
const checkTrue = (l: string, c: boolean) => check(l, c, true);
function checkNear(l: string, a: number, e: number, tol: number) {
  const ok = Math.abs(a - e) <= tol;
  ok ? pass++ : fail++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${l}${ok ? ` (${a})` : `  → got ${a}, want ${e}±${tol}`}`
  );
}

let seq = 0;
const newUser = () => `__vgu_led_${Date.now()}_${seq++}`;

async function pinPeriod(userId: string) {
  await redis.set(
    `vgu:period:${userId}`,
    JSON.stringify({
      id: period.id,
      start: period.start.toISOString(),
      end: period.end.toISOString(),
      calendarFallback: true,
    }),
    'EX',
    300
  );
}
async function cleanup(userId: string, workspaceId?: string) {
  const keys = [
    K.window(userId),
    K.amounts(userId),
    K.period(userId, period.id),
    K.concurrency(userId),
    `vgu:period:${userId}`,
  ];
  if (workspaceId) keys.push(K.pool(workspaceId, period.id));
  await redis.del(...keys).catch(() => {});
  await VeegptUsageEvent.deleteMany({ userId }).catch(() => {});
}
const fakeCall = (model: string, p: number, c: number, extra = {}) =>
  recordAIUsage({
    provider: 'openai',
    model,
    callType: 'text',
    usage: { promptTokens: p, completionTokens: c, totalTokens: p + c, ...extra },
  });

function sampleEntry(over: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    reservationId: `r_probe_${Date.now()}_${seq++}`,
    userId: '__vgu_led_entry',
    billingPeriodId: period.id,
    plan: 'pro',
    modelTier: 'cheap',
    feature: 'veegpt.chat',
    inputTokens: 100,
    outputTokens: 20,
    reasoningTokens: 0,
    cachedTokens: 0,
    providerCalls: 1,
    estimatedVGU: 1,
    actualVGU: 1,
    estimatedProviderCostUSD: 0.001,
    actualProviderCostUSD: 0.001,
    pricingVersions: ['x@1'],
    capped: false,
    fallbackPricing: false,
    status: 'RECONCILED',
    ...over,
  };
}

(async () => {
  await connectionManager.connect().catch(() => {});
  if (mongoose.connection.readyState !== 1) {
    console.error('Mongo not connected — this block cannot be verified.');
    process.exit(1);
  }
  console.log(`[MONGO] ${mongoose.connection.name}   period=${period.id}\n`);

  process.env.VEEGPT_CONCURRENCY_PRO = '-1';
  process.env.VEEGPT_CONCURRENCY_BUSINESS = '-1';

  // ── 1. Every metered operation writes one complete ledger event ───────────
  {
    const userId = newUser();
    await pinPeriod(userId);
    const { usage } = await withVGU(
      {
        userId, plan: 'pro', feature: 'veegpt.chat', model: 'openai-gpt4o',
        requestId: `rq_${userId}`, meta: { conversationId: 42 },
      },
      async () => { fakeCall('gpt-4o', 4400, 700, { reasoningTokens: 300 }); return 1; }
    );

    const ev = await VeegptUsageEvent.findOne({ userId }).lean();
    checkTrue('a ledger event was written', !!ev);
    const e = ev as unknown as Record<string, unknown>;
    check('reservationId recorded', e.reservationId, usage.reservationId);
    check('requestId recorded', e.requestId, `rq_${userId}`);
    check('billingPeriodId recorded', e.billingPeriodId, period.id);
    check('plan recorded', e.plan, 'pro');
    check('modelTier recorded', e.modelTier, 'premium');
    check('model recorded', e.model, 'gpt-4o');
    check('provider recorded', e.provider, 'openai');
    check('feature recorded', e.feature, 'veegpt.chat');
    check('input tokens recorded', e.inputTokens, 4400);
    check('output tokens recorded', e.outputTokens, 700);
    check('reasoning tokens recorded', e.reasoningTokens, 300);
    check('providerCalls recorded', e.providerCalls, 1);
    check('estimatedVGU recorded', e.estimatedVGU, 12);
    checkNear('actualVGU recorded', e.actualVGU as number, usage.actualVGU, 1e-9);
    checkTrue('actual provider cost recorded', (e.actualProviderCostUSD as number) > 0);
    checkTrue('pricing version recorded',
      Array.isArray(e.pricingVersions) && (e.pricingVersions as string[]).length === 1);
    check('status recorded', e.status, 'RECONCILED');
    check('audit metadata preserved', (e.meta as Record<string, unknown>)?.conversationId, 42);
    await cleanup(userId);
  }

  // ── 2. Idempotency is enforced by the DATABASE, not by app memory ─────────
  {
    const entry = sampleEntry({ userId: '__vgu_led_idem' });
    await VeegptUsageEvent.deleteMany({ userId: '__vgu_led_idem' });
    const a = await writeLedgerEvent(entry);
    const b = await writeLedgerEvent(entry);
    const c = await writeLedgerEvent({ ...entry, actualVGU: 999 });
    checkTrue('first write succeeds', a.ok);
    checkTrue('repeat write succeeds (no throw)', b.ok);
    check('exactly one row exists for the reservation',
      await VeegptUsageEvent.countDocuments({ reservationId: entry.reservationId }), 1);
    checkTrue('an update to the same reservation is an upsert, not a duplicate', c.ok);
    const row = await VeegptUsageEvent.findOne({ reservationId: entry.reservationId }).lean();
    check('the row reflects the latest write', (row as any).actualVGU, 999);
    await VeegptUsageEvent.deleteMany({ userId: '__vgu_led_idem' });
  }

  // ── 3. Negative usage can never be persisted (spec §51) ──────────────────
  {
    const entry = sampleEntry({
      userId: '__vgu_led_neg',
      actualVGU: -50,
      inputTokens: -10,
      actualProviderCostUSD: -1,
    });
    await VeegptUsageEvent.deleteMany({ userId: '__vgu_led_neg' });
    await writeLedgerEvent(entry);
    const row = await VeegptUsageEvent.findOne({ reservationId: entry.reservationId }).lean();
    check('negative VGU clamped to zero', (row as any).actualVGU, 0);
    check('negative tokens clamped to zero', (row as any).inputTokens, 0);
    check('negative cost clamped to zero', (row as any).actualProviderCostUSD, 0);
    await VeegptUsageEvent.deleteMany({ userId: '__vgu_led_neg' });
  }

  // ── 4. Mongo outage → event goes to the outbox, then replays ─────────────
  {
    await redis.del(LEDGER_OUTBOX_KEY);
    const entry = sampleEntry({ userId: '__vgu_led_outbox' });
    await VeegptUsageEvent.deleteMany({ userId: '__vgu_led_outbox' });

    // Simulate the durable store being unreachable.
    const realUpdate = VeegptUsageEvent.updateOne;
    (VeegptUsageEvent as any).updateOne = () => ({
      exec: () => Promise.reject(new Error('Mongo unreachable (simulated)')),
    });
    const res = await writeLedgerEvent(entry);
    (VeegptUsageEvent as any).updateOne = realUpdate;

    check('the write reports failure', res.ok, false);
    check('but the event was queued, not lost', res.queued, true);
    check('outbox depth is 1', await ledgerOutboxDepth(), 1);
    check('nothing reached Mongo yet',
      await VeegptUsageEvent.countDocuments({ userId: '__vgu_led_outbox' }), 0);

    const drain = await drainLedgerOutbox();
    check('the outbox drained one event', drain.drained, 1);
    check('outbox is now empty', await ledgerOutboxDepth(), 0);
    check('the event is now durable',
      await VeegptUsageEvent.countDocuments({ userId: '__vgu_led_outbox' }), 1);
    await VeegptUsageEvent.deleteMany({ userId: '__vgu_led_outbox' });
  }

  // ── 5. A still-failing drain requeues rather than dropping ───────────────
  {
    await redis.del(LEDGER_OUTBOX_KEY);
    const entry = sampleEntry({ userId: '__vgu_led_requeue' });
    await redis.rpush(LEDGER_OUTBOX_KEY, JSON.stringify(entry));

    const realUpdate = VeegptUsageEvent.updateOne;
    (VeegptUsageEvent as any).updateOne = () => ({
      exec: () => Promise.reject(new Error('still down')),
    });
    const drain = await drainLedgerOutbox();
    (VeegptUsageEvent as any).updateOne = realUpdate;

    check('nothing was drained', drain.drained, 0);
    check('the drain stopped early instead of hammering', drain.stoppedEarly, true);
    check('the event is still in the outbox', await ledgerOutboxDepth(), 1);

    // And it succeeds once Mongo is back.
    const again = await drainLedgerOutbox();
    check('it replays after recovery', again.drained, 1);
    await VeegptUsageEvent.deleteMany({ userId: '__vgu_led_requeue' });
    await redis.del(LEDGER_OUTBOX_KEY);
  }

  // ── 6. A corrupt outbox payload cannot block the queue forever ───────────
  {
    await redis.del(LEDGER_OUTBOX_KEY);
    await redis.rpush(LEDGER_OUTBOX_KEY, 'not-json-at-all');
    const good = sampleEntry({ userId: '__vgu_led_corrupt' });
    await redis.rpush(LEDGER_OUTBOX_KEY, JSON.stringify(good));
    const drain = await drainLedgerOutbox();
    check('the good event still drained', drain.drained, 1);
    check('and the queue is clear', await ledgerOutboxDepth(), 0);
    await VeegptUsageEvent.deleteMany({ userId: '__vgu_led_corrupt' });
  }

  // ── 7. Counter rebuild: ledger totals match the Redis counter ────────────
  {
    const userId = newUser();
    await pinPeriod(userId);
    let expected = 0;
    for (let i = 0; i < 4; i++) {
      const { usage } = await withVGU(
        { userId, plan: 'pro', feature: 'veegpt.chat', model: 'openai-gpt-4o-mini' },
        async () => { fakeCall('gpt-4o-mini', 4400, 700); return 1; }
      );
      expected += usage.actualVGU;
    }
    const led = await ledgerPeriodTotal(userId, period.id);
    check('ledger holds all four events', led.events, 4);
    checkNear('ledger total matches what was charged', led.vgu, expected, 0.01);
    const redisTotal = Number(await redis.hget(K.period(userId, period.id), 'total')) || 0;
    checkNear('and matches the Redis counter', redisTotal, led.vgu, DRIFT_TOLERANCE_VGU);
    const findings = await verifyUserPeriod(userId, period.id);
    check('so no drift is reported', findings.length, 0);
    await cleanup(userId);
  }

  // ── 8. Refunded operations are recorded but excluded from the total ──────
  {
    const userId = newUser();
    await pinPeriod(userId);
    try {
      await withVGU(
        { userId, plan: 'pro', feature: 'veegpt.chat', model: 'openai-gpt4o' },
        async () => { throw new Error('failed before any tokens'); }
      );
    } catch { /* expected */ }
    const row = await VeegptUsageEvent.findOne({ userId }).lean();
    checkTrue('the refunded attempt is still audited', !!row);
    check('recorded as RELEASED', (row as any).status, 'RELEASED');
    check('with zero charge', (row as any).actualVGU, 0);
    const led = await ledgerPeriodTotal(userId, period.id);
    check('and excluded from the billable total', led.vgu, 0);
    await cleanup(userId);
  }

  // ── 9. Drift detection + repair, in both directions ─────────────────────
  {
    const userId = newUser();
    await pinPeriod(userId);
    const { usage } = await withVGU(
      { userId, plan: 'pro', feature: 'veegpt.chat', model: 'openai-gpt-4o-mini' },
      async () => { fakeCall('gpt-4o-mini', 4400, 700); return 1; }
    );

    // Corrupt the counter upward (user being over-charged).
    await redis.hset(K.period(userId, period.id), 'total', '500');
    let f = await verifyUserPeriod(userId, period.id);
    check('over-count detected', f.length, 1);
    check('classified as drift', f[0].kind, 'drift');
    checkTrue('direction reported', (f[0].delta || 0) > 0);
    check('dry run does not write', f[0].repaired, false);
    check('counter untouched by the dry run',
      Number(await redis.hget(K.period(userId, period.id), 'total')), 500);

    f = await verifyUserPeriod(userId, period.id, { apply: true });
    check('repair applied', f[0].repaired, true);
    checkNear('counter realigned to the ledger',
      Number(await redis.hget(K.period(userId, period.id), 'total')),
      usage.actualVGU, 0.01);

    // Corrupt it downward (user has unearned capacity).
    await redis.hset(K.period(userId, period.id), 'total', '0');
    f = await verifyUserPeriod(userId, period.id, { apply: true });
    check('under-count detected and repaired', f[0].repaired, true);
    checkNear('counter restored upward',
      Number(await redis.hget(K.period(userId, period.id), 'total')),
      usage.actualVGU, 0.01);
    await cleanup(userId);
  }

  // ── 10. A negative counter is always treated as a bug ───────────────────
  {
    const userId = newUser();
    await pinPeriod(userId);
    await redis.hset(K.period(userId, period.id), 'total', '-42');
    const f = await verifyUserPeriod(userId, period.id, { apply: true });
    check('negative counter detected', f[0].kind, 'negative_counter');
    check('and repaired', f[0].repaired, true);
    checkTrue('never left below zero',
      (Number(await redis.hget(K.period(userId, period.id), 'total')) || 0) >= 0);
    await cleanup(userId);
  }

  // ── 11. In-flight work is NOT mistaken for drift ────────────────────────
  {
    const userId = newUser();
    await pinPeriod(userId);
    const { getReservationEngine } = await import(
      '../services/veegpt-reservation.engine'
    );
    // An open reservation: counted in Redis, legitimately absent from the ledger.
    const r = await getReservationEngine().reserve({
      userId, plan: 'pro', feature: 'veegpt.chat', tier: 'cheap',
      estimatedVGU: 30, meta: { userId },
    });
    checkTrue('reservation is open', r.ok);
    const f = await verifyUserPeriod(userId, period.id);
    check('an in-flight reservation is not reported as drift', f.length, 0);
    console.log('      → repair excludes live work, so it cannot erase real usage');
    await redis.del(K.open).catch(() => {});
    await cleanup(userId);
  }

  // ── 12. Workspace pool drift ────────────────────────────────────────────
  {
    const userId = newUser();
    const workspaceId = `__vgu_led_ws_${Date.now()}`;
    await pinPeriod(userId);
    const { usage } = await withVGU(
      {
        userId, workspaceId, plan: 'business',
        feature: 'veegpt.chat', model: 'openai-gpt-4o-mini',
      },
      async () => { fakeCall('gpt-4o-mini', 4400, 700); return 1; }
    );
    let f = await verifyWorkspacePool(workspaceId, period.id);
    check('a healthy pool reports no drift', f.length, 0);
    await redis.hset(K.pool(workspaceId, period.id), 'total', '9999');
    f = await verifyWorkspacePool(workspaceId, period.id, { apply: true });
    check('pool drift detected and repaired', f[0].repaired, true);
    checkNear('pool realigned to the ledger',
      Number(await redis.hget(K.pool(workspaceId, period.id), 'total')),
      usage.actualVGU, 0.01);
    await cleanup(userId, workspaceId);
  }

  // ── 13. Stale reservation is closed; its charge is retained ─────────────
  {
    const userId = newUser();
    await pinPeriod(userId);
    const { getReservationEngine } = await import(
      '../services/veegpt-reservation.engine'
    );
    await redis.del(K.open);
    const r = await getReservationEngine().reserve({
      userId, plan: 'pro', feature: 'veegpt.chat', tier: 'cheap',
      estimatedVGU: 9, meta: { userId },
    });
    if (r.ok) {
      // Age it past the reservation TTL.
      await redis.hset(K.reservation(r.reservationId), 'createdAt',
        String(Date.now() - 3600_000));
      const before = Number(await redis.hget(K.period(userId, period.id), 'total'));
      let f = await findStaleReservations();
      const mine = f.filter(x => x.reservationId === r.reservationId);
      check('stale reservation detected', mine.length, 1);
      check('classified correctly', mine[0].kind, 'stale_reservation');

      f = await findStaleReservations({ apply: true });
      const rec = await redis.hget(K.reservation(r.reservationId), 'status');
      check('marked EXPIRED', rec, 'EXPIRED');
      check('concurrency slot freed', await redis.zcard(K.concurrency(userId)), 0);
      checkNear('charge retained (outcome unknown, so assume it ran)',
        Number(await redis.hget(K.period(userId, period.id), 'total')), before, 0.01);
    }
    await redis.del(K.open);
    await cleanup(userId);
  }

  // ── 14. Duplicate detection finds nothing, because the index prevents it ─
  {
    const dup = await findDuplicateEvents();
    check('no duplicate ledger rows exist', dup.length, 0);
    console.log('      → duplicates are impossible: unique index on reservationId');
  }

  // ── 15. Full pass reports healthy on a clean system ─────────────────────
  {
    const userId = newUser();
    await pinPeriod(userId);
    await redis.del(K.open);
    await withVGU(
      { userId, plan: 'pro', feature: 'veegpt.chat', model: 'openai-gpt-4o-mini' },
      async () => { fakeCall('gpt-4o-mini', 4400, 700); return 1; }
    );
    const report = await runRepair({
      users: [{ userId, billingPeriodId: period.id }],
    });
    check('repair pass reports healthy', report.healthy, true);
    check('one user scanned', report.scannedUsers, 1);
    check('outbox empty', report.outboxRemaining, 0);
    await cleanup(userId);
  }

  delete process.env.VEEGPT_CONCURRENCY_PRO;
  delete process.env.VEEGPT_CONCURRENCY_BUSINESS;

  console.log(
    `\n${fail === 0 ? 'ALL CHECKS PASSED' : `${fail} CHECK(S) FAILED`}  (${pass} passed)`
  );
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => {
  console.error('probe error:', e?.stack || e?.message || e);
  process.exit(1);
});
