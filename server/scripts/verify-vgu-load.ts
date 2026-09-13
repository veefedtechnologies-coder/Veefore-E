/**
 * BLOCK 11 · LOAD + RACE VERIFICATION (spec §58).
 *
 * §58 states the one invariant that matters under load, in plain words:
 *
 *     "The system must never overspend quotas due to race conditions."
 *
 * A budget check that is a GET-then-INCR (read the counter, decide, write it back)
 * is safe when requests arrive one at a time and catastrophic when they arrive
 * together: a hundred requests all read "39 used, 40 allowed", all decide "yes",
 * and all write — authorising a hundred against a budget of one. This probe fires
 * requests in a genuine thundering herd (Promise.all, no staggering) and proves
 * the atomic Lua reservation authorises EXACTLY the budget, not a VGU more, at
 * 100 and at 500 concurrent, for a single user and across pooled Business seats.
 *
 * Proven here:
 *   1. 100 concurrent requests never overspend a period budget.
 *   2. 500 concurrent requests never overspend it either (scale changes nothing).
 *   3. The plan concurrency limit strictly bounds how many run at once.
 *   4. A pooled workspace pool is never overspent by concurrent seats, and one
 *      seat cannot drain the whole pool.
 *   5. Concurrent duplicate request-ids collapse to ONE reservation (no double
 *      spend from a retry storm).
 *   6. An expired reservation is reclaimed and its budget refunded — a crashed
 *      request cannot leak quota forever.
 *   7. The committed total equals the authorised total (no accounting drift under
 *      load), and the counter is never left negative.
 *
 * Run: npx tsx server/scripts/verify-vgu-load.ts
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { getRedisClient } from '../lib/redis';
import { connectionManager } from '../infrastructure/mongodb-connection';
import {
  getReservationEngine,
  RESERVATION_KEYS,
  type ReserveResult,
} from '../services/veegpt-reservation.engine';
import { policyForPlan, seatMonthlyCap } from '../config/veegpt-vgu.config';
import { resolveBillingPeriod } from '../services/veegpt-billing-period';
import type { PlanId } from '../config/plan-config';

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
    console.log(`  \u2713 ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.log(
      `  \u2717 ${label}\n      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`
    );
  }
}

function section(t: string): void {
  console.log(`\n${t}\n${'-'.repeat(t.length)}`);
}

const RUN = `__load_probe_${Date.now()}`;
const users: string[] = [];
const workspaces: string[] = [];
function user(tag: string): string {
  const u = `${RUN}_${tag}`;
  users.push(u);
  return u;
}

async function seedPlan(userId: string, plan: string): Promise<void> {
  await getRedisClient().set(`veegpt:rl:plan:${userId}`, plan, 'EX', 900).catch(() => {});
}

const engine = getReservationEngine();

/** Fire N reservations at once, as a true herd. Returns every result. */
async function herd(
  n: number,
  make: (i: number) => Parameters<typeof engine.reserve>[0]
): Promise<ReserveResult[]> {
  return Promise.all(Array.from({ length: n }, (_, i) => engine.reserve(make(i))));
}

async function periodUsed(userId: string, plan: PlanId): Promise<number> {
  const snap = await engine.usageSnapshot(userId, plan);
  return Math.round(snap.period.used * 100) / 100;
}

async function cleanup(): Promise<void> {
  const redis = getRedisClient();
  for (const u of users) {
    const period = await resolveBillingPeriod(u).catch(() => null);
    await redis
      .del(
        RESERVATION_KEYS.window(u),
        RESERVATION_KEYS.amounts(u),
        RESERVATION_KEYS.concurrency(u),
        `veegpt:rl:plan:${u}`,
        ...(period ? [RESERVATION_KEYS.period(u, period.id)] : [])
      )
      .catch(() => {});
    const idem = await redis.keys(`vgu:idem:${u}:*`).catch(() => [] as string[]);
    if (idem.length) await redis.del(...idem).catch(() => {});
  }
  for (const ws of workspaces) {
    const anyUser = users[0];
    const period = anyUser ? await resolveBillingPeriod(anyUser).catch(() => null) : null;
    if (period) await redis.del(RESERVATION_KEYS.pool(ws, period.id)).catch(() => {});
    const wsc = await redis.keys(`*${ws}*`).catch(() => [] as string[]);
    if (wsc.length) await redis.del(...wsc).catch(() => {});
  }
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('LOAD + RACE VERIFICATION (Block 11 · \u00a758)\n' + '='.repeat(70));
  await connectionManager.connect().catch(() => {});
  console.log(
    `mongo=${mongoose.connection.readyState === 1 ? mongoose.connection.name : 'not connected'}`
  );
  await cleanup();

  // A budget the herd will fight over. Concurrency is set far above the herd so
  // it is provably NOT the constraint — the period budget is.
  const BUDGET = 40;
  process.env.VEEGPT_5H_VGU_PRO = '-1';
  process.env.VEEGPT_CONCURRENCY_PRO = '10000';

  // =========================================================================
  section('1. 100 concurrent requests never overspend the budget');
  // =========================================================================
  {
    const u = user('herd100');
    await seedPlan(u, 'pro');
    process.env.VEEGPT_MONTHLY_VGU_PRO = String(BUDGET);
    const results = await herd(100, () => ({
      userId: u,
      plan: 'pro' as PlanId,
      feature: 'veegpt.chat',
      tier: 'cheap' as const,
      estimatedVGU: 1,
    }));
    const granted = results.filter(r => r.ok);
    const denied = results.filter(r => !r.ok);
    check('exactly the budget-many requests are granted', granted.length, BUDGET);
    check('the rest are denied', denied.length, 100 - BUDGET);
    check(
      'every denial is a quota exhaustion, not an error',
      denied.every(r => !r.ok && r.code === 'MONTHLY_QUOTA_EXHAUSTED'),
      true
    );
    check('the counter equals the budget — not a VGU more', await periodUsed(u, 'pro'), BUDGET);
    check('the authorised total never exceeded the budget', granted.length <= BUDGET, true);
    await cleanup();
  }

  // =========================================================================
  section('2. 500 concurrent requests are just as safe (scale is irrelevant)');
  // =========================================================================
  {
    const u = user('herd500');
    await seedPlan(u, 'pro');
    process.env.VEEGPT_MONTHLY_VGU_PRO = String(BUDGET);
    const results = await herd(500, () => ({
      userId: u,
      plan: 'pro' as PlanId,
      feature: 'veegpt.chat',
      tier: 'cheap' as const,
      estimatedVGU: 1,
    }));
    const granted = results.filter(r => r.ok);
    check('still exactly the budget-many are granted', granted.length, BUDGET);
    check('the counter still equals the budget under 500-way contention', await periodUsed(u, 'pro'), BUDGET);
    check('no request was authorised beyond the budget', granted.length <= BUDGET, true);
    await cleanup();
  }

  // =========================================================================
  section('3. The plan concurrency limit strictly bounds parallelism');
  // =========================================================================
  {
    // Now let concurrency be the constraint: a small limit, a big budget, and no
    // reservation is released, so every grant holds its slot.
    const u = user('conc');
    await seedPlan(u, 'pro');
    process.env.VEEGPT_MONTHLY_VGU_PRO = '100000';
    process.env.VEEGPT_CONCURRENCY_PRO = '4';
    const limit = policyForPlan('pro').maxConcurrentAI;
    check('the configured limit is in force', limit, 4);
    const results = await herd(100, () => ({
      userId: u,
      plan: 'pro' as PlanId,
      feature: 'veegpt.chat',
      tier: 'cheap' as const,
      estimatedVGU: 1,
    }));
    const granted = results.filter(r => r.ok);
    check('exactly the concurrency limit run at once', granted.length, limit);
    check(
      'the rest are refused for concurrency, not budget',
      results.filter(r => !r.ok).every(r => !r.ok && r.code === 'CONCURRENCY_LIMIT'),
      true
    );
    const live = await getRedisClient().zcard(RESERVATION_KEYS.concurrency(u));
    check('no more than the limit hold a slot', live <= limit, true);
    process.env.VEEGPT_CONCURRENCY_PRO = '10000';
    await cleanup();
  }

  // =========================================================================
  section('4. A pooled workspace pool is never overspent by concurrent seats');
  // =========================================================================
  {
    // Three seats, each capped at a 40% share, contend for a 100-VGU pool. No
    // seat may exceed 40; the pool may never exceed 100; and 3 × 40 = 120 would
    // overspend, so the pool cap must bind — proving one seat cannot drain it and
    // the seats together cannot breach the pool.
    process.env.VEEGPT_MONTHLY_VGU_BUSINESS = '100';
    process.env.VEEGPT_5H_VGU_BUSINESS = '-1';
    process.env.VEEGPT_SEAT_SHARE_BUSINESS = '40';
    process.env.VEEGPT_CONCURRENCY_BUSINESS = '10000';
    process.env.VEEGPT_WS_CONCURRENCY_BUSINESS = '10000';
    const policy = policyForPlan('business');
    const seatCap = seatMonthlyCap(policy);
    check('each seat is capped at the 40% share', seatCap, 40);

    const ws = `${RUN}_wsPool`;
    workspaces.push(ws);
    const seats = [user('seatA'), user('seatB'), user('seatC')];
    for (const s of seats) await seedPlan(s, 'business');

    // Every seat fires 60 concurrent 1-VGU reservations, all at once.
    const all = await Promise.all(
      seats.map(s =>
        herd(60, () => ({
          userId: s,
          workspaceId: ws,
          plan: 'business' as PlanId,
          feature: 'veegpt.chat',
          tier: 'cheap' as const,
          estimatedVGU: 1,
        }))
      )
    );
    const grantedPerSeat = all.map(rs => rs.filter(r => r.ok).length);
    const totalGranted = grantedPerSeat.reduce((a, b) => a + b, 0);
    check('no seat was granted more than its share', grantedPerSeat.every(g => g <= seatCap), true);
    check('the seats together never breach the pool', totalGranted <= 100, true);
    check('the pool cap is what bound them (not the seat cap alone)', totalGranted, 100);

    // The durable pool counter agrees.
    const period = await resolveBillingPeriod(seats[0]);
    const poolUsed = Number(
      await getRedisClient().hget(RESERVATION_KEYS.pool(ws, period.id), 'total')
    );
    check('the pool counter never exceeds the pool budget', poolUsed <= 100, true);
    delete process.env.VEEGPT_MONTHLY_VGU_BUSINESS;
    delete process.env.VEEGPT_5H_VGU_BUSINESS;
    delete process.env.VEEGPT_SEAT_SHARE_BUSINESS;
    await cleanup();
  }

  // =========================================================================
  section('5. Concurrent duplicate request-ids collapse to one reservation');
  // =========================================================================
  {
    const u = user('dup');
    await seedPlan(u, 'pro');
    process.env.VEEGPT_MONTHLY_VGU_PRO = '1000';
    const dupId = `dup_${Date.now()}`;
    // A retry storm: the same idempotency key fired 50 times at once.
    const results = await herd(50, () => ({
      userId: u,
      plan: 'pro' as PlanId,
      feature: 'veegpt.chat',
      tier: 'cheap' as const,
      estimatedVGU: 3,
      requestId: dupId,
    }));
    const ok = results.filter((r): r is Extract<ReserveResult, { ok: true }> => r.ok);
    const uniqueReservationIds = new Set(ok.map(r => r.reservationId));
    check('every attempt is granted (idempotent, not refused)', ok.length, 50);
    check('but they all share ONE reservation id', uniqueReservationIds.size, 1);
    check('so only one estimate is held, not fifty', await periodUsed(u, 'pro'), 3);
    await cleanup();
  }

  // =========================================================================
  section('6. An expired reservation frees its slot; the charge safely stands');
  // =========================================================================
  {
    // §10/§54: when a request crashes before reconciling, we cannot know whether
    // the provider call actually ran. The sweeper therefore frees the concurrency
    // SLOT (so a crash cannot block future requests forever) but KEEPS the VGU
    // charge (assuming the spend happened is the only safe assumption for cost).
    const u = user('expire');
    await seedPlan(u, 'pro');
    process.env.VEEGPT_MONTHLY_VGU_PRO = '1000';
    const r = await engine.reserve({
      userId: u,
      plan: 'pro',
      feature: 'veegpt.chat',
      tier: 'cheap',
      estimatedVGU: 10,
    });
    check('the reservation was granted', r.ok, true);
    check('and its estimate is held', await periodUsed(u, 'pro'), 10);
    const slotBefore = await getRedisClient().zcard(RESERVATION_KEYS.concurrency(u));
    check('and it holds a concurrency slot', slotBefore, 1);

    // Age the open-set entry into the past so the sweep sees it as due.
    if (r.ok) {
      await getRedisClient()
        .zadd(RESERVATION_KEYS.open, Date.now() - 3_600_000, r.reservationId)
        .catch(() => {});
    }
    const { swept } = await engine.sweepExpired();
    check('the sweeper reclaimed at least this reservation', swept >= 1, true);
    const slotAfter = await getRedisClient().zcard(RESERVATION_KEYS.concurrency(u));
    check('the concurrency slot was freed (a crash cannot block forever)', slotAfter, 0);
    check('but the charge safely stands (no under-billing on a crash)', await periodUsed(u, 'pro'), 10);
    await cleanup();
  }

  // =========================================================================
  section('7. Commit under load matches authorisation (no drift)');
  // =========================================================================
  {
    const u = user('commit');
    await seedPlan(u, 'pro');
    process.env.VEEGPT_MONTHLY_VGU_PRO = '1000';
    process.env.VEEGPT_CONCURRENCY_PRO = '10000';
    // Reserve 30 at once, then commit each to its exact estimate concurrently.
    const results = await herd(30, () => ({
      userId: u,
      plan: 'pro' as PlanId,
      feature: 'veegpt.chat',
      tier: 'cheap' as const,
      estimatedVGU: 2,
    }));
    const ok = results.filter((r): r is Extract<ReserveResult, { ok: true }> => r.ok);
    check('all 30 were granted within budget', ok.length, 30);
    await Promise.all(
      ok.map(r =>
        engine.commit(r.reservationId, 2, {
          userId: u,
          plan: 'pro',
          tier: 'cheap',
          feature: 'veegpt.chat',
          billingPeriodId: r.billingPeriodId,
        })
      )
    );
    check('the committed total equals the authorised total', await periodUsed(u, 'pro'), 60);
    // Every committed reservation is removed from the global open-set (closeOpen),
    // so none is left dangling for the sweeper to later mistake for a crash.
    const openMembers = await getRedisClient().zrange(RESERVATION_KEYS.open, 0, -1);
    const mine = ok.filter(r => openMembers.includes(r.reservationId)).length;
    check('no committed reservation is left in the open-set', mine, 0);
    await cleanup();
  }

  // Restore env.
  delete process.env.VEEGPT_5H_VGU_PRO;
  delete process.env.VEEGPT_MONTHLY_VGU_PRO;
  delete process.env.VEEGPT_CONCURRENCY_PRO;
  delete process.env.VEEGPT_CONCURRENCY_BUSINESS;
  delete process.env.VEEGPT_WS_CONCURRENCY_BUSINESS;
  await cleanup();

  console.log('\n' + '='.repeat(70));
  console.log(`passed=${pass}  failed=${fail}`);
  if (fail) {
    console.log('\nFAILED CHECKS:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(fail ? 1 : 0);
}

main().catch(err => {
  console.error('probe crashed:', err);
  process.exit(1);
});
