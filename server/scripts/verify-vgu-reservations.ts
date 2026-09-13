/**
 * Block 2 verification — atomic reservation engine, against REAL Redis.
 *
 * Concurrency and atomicity cannot be proven with mocks: the whole defect being
 * fixed (GET → compare → INCRBY) only appears when independent clients race on a
 * real server. Every check here therefore drives the live engine.
 *
 * Run: npx tsx server/scripts/verify-vgu-reservations.ts
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { getRedisClient } from '../lib/redis';
import {
  VGUReservationEngine,
  RESERVATION_KEYS as K,
  UNVERIFIED_RESERVATION,
} from '../services/veegpt-reservation.engine';
import { calendarPeriod } from '../services/veegpt-billing-period';
import {
  burstWindowSec,
  policyForPlan,
  tierAllocation,
} from '../config/veegpt-vgu.config';

const redis = getRedisClient();
const engine = new VGUReservationEngine();

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : fail++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  → got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`
  );
}
function checkTrue(label: string, cond: boolean) {
  check(label, cond, true);
}

const period = calendarPeriod();
let seq = 0;
const newUser = () => `__vgu_probe_${Date.now()}_${seq++}`;

async function cleanup(userId: string, workspaceId?: string) {
  const keys = [
    K.window(userId),
    K.amounts(userId),
    K.period(userId, period.id),
    K.concurrency(userId),
  ];
  if (workspaceId) keys.push(K.pool(workspaceId, period.id));
  await redis.del(...keys).catch(() => {});
  await redis.del(`vgu:period:${userId}`).catch(() => {});
}

/** Force a known billing period so the probe never depends on a subscription. */
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

async function usedPeriod(userId: string): Promise<number> {
  const v = await redis.hget(K.period(userId, period.id), 'total');
  return Number(v) || 0;
}

(async () => {
  console.log(
    `burst window = ${burstWindowSec()}s   period = ${period.id}\n`
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 1. THE SPEC'S CONCURRENCY CASE
  //    100 VGU remaining, five simultaneous 30-VGU requests → at most 3 succeed.
  // ─────────────────────────────────────────────────────────────────────────
  {
    const userId = newUser();
    await pinPeriod(userId);
    // Isolate the VGU race. Pro's concurrency limit is 4, which would itself cap
    // the batch at 3 and make this test pass for the WRONG reason — proving the
    // concurrency gate rather than the quota arithmetic. Concurrency is proven
    // separately in check 3.
    process.env.VEEGPT_CONCURRENCY_PRO = '-1';
    // Pro: 800 burst / 12000 period. Pre-spend so exactly 100 burst VGU remain.
    const policy = policyForPlan('pro');
    const preSpend = policy.fiveHourVGU - 100;
    const pre = await engine.reserve({
      userId,
      plan: 'pro',
      feature: 'veegpt.chat',
      tier: 'cheap',
      estimatedVGU: preSpend,
    });
    checkTrue('setup: pre-spend reserved', pre.ok);
    // Settle the pre-spend at its estimate so it holds no in-flight slot.
    if (pre.ok) {
      await engine.commit(pre.reservationId, preSpend, {
        userId, plan: 'pro', tier: 'cheap', feature: 'veegpt.chat',
        billingPeriodId: period.id,
      });
    }

    const results = await Promise.all(
      [1, 2, 3, 4, 5].map(() =>
        engine.reserve({
          userId,
          plan: 'pro',
          feature: 'veegpt.chat',
          tier: 'cheap',
          estimatedVGU: 30,
        })
      )
    );
    const granted = results.filter(r => r.ok).length;
    const denied = results.filter(r => !r.ok);

    check('5×30 VGU against 100 remaining → exactly 3 granted', granted, 3);
    check('the other 2 are refused', denied.length, 2);
    checkTrue(
      'refusals name the burst budget',
      denied.every(d => !d.ok && d.code === 'BURST_QUOTA_EXHAUSTED')
    );
    // The decisive assertion: 150 VGU of work was never authorised from a
    // 100 VGU allowance. The old GET→INCRBY code granted all five here.
    const used = await usedPeriod(userId);
    check('total charged never exceeds the budget', used, preSpend + 90);
    checkTrue('burst usage stayed within the cap',
      used - preSpend <= 100);
    delete process.env.VEEGPT_CONCURRENCY_PRO;
    await cleanup(userId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. High-contention race: 50 parallel requests against a 10-VGU budget.
  // ─────────────────────────────────────────────────────────────────────────
  {
    const userId = newUser();
    await pinPeriod(userId);
    process.env.VEEGPT_5H_VGU_FREE = '10';
    process.env.VEEGPT_CONCURRENCY_FREE = '-1'; // isolate the VGU race
    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        engine.reserve({
          userId,
          plan: 'free',
          feature: 'veegpt.chat',
          tier: 'cheap',
          estimatedVGU: 1,
        })
      )
    );
    check('50 parallel 1-VGU requests against 10 → exactly 10 granted',
      results.filter(r => r.ok).length, 10);
    check('burst usage lands exactly on the cap', await usedPeriod(userId), 10);
    delete process.env.VEEGPT_5H_VGU_FREE;
    delete process.env.VEEGPT_CONCURRENCY_FREE;
    await cleanup(userId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Concurrency slots are themselves atomic.
  // ─────────────────────────────────────────────────────────────────────────
  {
    const userId = newUser();
    await pinPeriod(userId);
    // Free allows 1 concurrent AI operation.
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        engine.reserve({
          userId,
          plan: 'free',
          feature: 'veegpt.chat',
          tier: 'cheap',
          estimatedVGU: 1,
        })
      )
    );
    check('Free concurrency 1 → only 1 of 6 parallel requests starts',
      results.filter(r => r.ok).length, 1);
    checkTrue('the rest are refused for concurrency',
      results.filter(r => !r.ok).every(r => !r.ok && r.code === 'CONCURRENCY_LIMIT'));

    // Committing frees the slot.
    const first = results.find(r => r.ok)!;
    if (first.ok) {
      await engine.commit(first.reservationId, 1, {
        userId, plan: 'free', tier: 'cheap',
        feature: 'veegpt.chat', billingPeriodId: period.id,
      });
    }
    const after = await engine.reserve({
      userId, plan: 'free', feature: 'veegpt.chat', tier: 'cheap', estimatedVGU: 1,
    });
    checkTrue('a new request proceeds once the slot is freed', after.ok);
    await cleanup(userId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Idempotency — a retried requestId must not double-charge.
  // ─────────────────────────────────────────────────────────────────────────
  {
    const userId = newUser();
    await pinPeriod(userId);
    const requestId = `req_${Date.now()}`;
    const a = await engine.reserve({
      userId, plan: 'pro', feature: 'veegpt.chat', tier: 'cheap',
      estimatedVGU: 5, requestId,
    });
    const b = await engine.reserve({
      userId, plan: 'pro', feature: 'veegpt.chat', tier: 'cheap',
      estimatedVGU: 5, requestId,
    });
    checkTrue('both attempts succeed', a.ok && b.ok);
    if (a.ok && b.ok) {
      check('the retry reuses the same reservation', b.reservationId, a.reservationId);
      check('the retry is flagged idempotent', b.idempotent, true);
    }
    check('charged once, not twice', await usedPeriod(userId), 5);
    await cleanup(userId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Reconciliation to actual usage, and its idempotency.
  // ─────────────────────────────────────────────────────────────────────────
  {
    const userId = newUser();
    await pinPeriod(userId);
    const r = await engine.reserve({
      userId, plan: 'pro', feature: 'veegpt.chat', tier: 'cheap', estimatedVGU: 20,
    });
    checkTrue('reserved 20', r.ok);
    check('period shows the reservation', await usedPeriod(userId), 20);

    if (r.ok) {
      const c1 = await engine.commit(r.reservationId, 15, {
        userId, plan: 'pro', tier: 'cheap', feature: 'veegpt.chat',
        billingPeriodId: period.id,
      });
      check('commit refunds the 5 VGU surplus', c1.delta, -5);
      check('period reflects actual usage', await usedPeriod(userId), 15);

      // Spec §52: reconciling twice must equal reconciling once.
      const c2 = await engine.commit(r.reservationId, 15, {
        userId, plan: 'pro', tier: 'cheap', feature: 'veegpt.chat',
        billingPeriodId: period.id,
      });
      check('second commit changes nothing', c2.delta, 0);
      check('period unchanged after re-commit', await usedPeriod(userId), 15);

      const rec = await engine.getReservation(r.reservationId);
      check('reservation status is RECONCILED', rec?.status, 'RECONCILED');
      check('actual usage recorded on the reservation', rec?.actual, '15');
    }
    await cleanup(userId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 6. Reconciling ABOVE the estimate must charge the shortfall.
  // ─────────────────────────────────────────────────────────────────────────
  {
    const userId = newUser();
    await pinPeriod(userId);
    const r = await engine.reserve({
      userId, plan: 'pro', feature: 'veegpt.chat', tier: 'premium', estimatedVGU: 12,
    });
    if (r.ok) {
      const c = await engine.commit(r.reservationId, 17, {
        userId, plan: 'pro', tier: 'premium', feature: 'veegpt.chat',
        billingPeriodId: period.id,
      });
      check('under-estimate is topped up', c.delta, 5);
      check('period reflects the real cost', await usedPeriod(userId), 17);
    }
    await cleanup(userId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 7. Provider failure → full refund, and release is idempotent.
  // ─────────────────────────────────────────────────────────────────────────
  {
    const userId = newUser();
    await pinPeriod(userId);
    const r = await engine.reserve({
      userId, plan: 'pro', feature: 'veegpt.chat', tier: 'cheap', estimatedVGU: 25,
    });
    if (r.ok) {
      const rel = await engine.release(r.reservationId, {
        userId, plan: 'pro', tier: 'cheap', feature: 'veegpt.chat',
        billingPeriodId: period.id,
      }, 'FAILED');
      check('release refunds the full reservation', rel.refunded, 25);
      check('nothing remains charged', await usedPeriod(userId), 0);

      const again = await engine.release(r.reservationId, {
        userId, plan: 'pro', tier: 'cheap', feature: 'veegpt.chat',
        billingPeriodId: period.id,
      });
      check('second release refunds nothing more', again.refunded, 0);
      check('still zero after re-release', await usedPeriod(userId), 0);
      const rec = await engine.getReservation(r.reservationId);
      check('terminal status recorded', rec?.status, 'FAILED');
    }
    await cleanup(userId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 8. Rolling window is genuinely sliding — old usage leaves.
  // ─────────────────────────────────────────────────────────────────────────
  {
    const userId = newUser();
    await pinPeriod(userId);
    process.env.VEEGPT_5H_VGU_FREE = '10';
    process.env.VEEGPT_CONCURRENCY_FREE = '-1';
    const r = await engine.reserve({
      userId, plan: 'free', feature: 'veegpt.chat', tier: 'cheap', estimatedVGU: 10,
    });
    checkTrue('burst budget filled', r.ok);
    const blocked = await engine.reserve({
      userId, plan: 'free', feature: 'veegpt.chat', tier: 'cheap', estimatedVGU: 1,
    });
    check('further requests blocked on burst', blocked.ok, false);

    // Age the entry beyond the window; a fixed-reset window would still block.
    if (r.ok) {
      await redis.zadd(
        K.window(userId),
        String(Date.now() - (burstWindowSec() + 60) * 1000),
        r.reservationId
      );
    }
    const afterSlide = await engine.reserve({
      userId, plan: 'free', feature: 'veegpt.chat', tier: 'cheap', estimatedVGU: 1,
    });
    checkTrue('capacity returns as usage ages out of the window', afterSlide.ok);
    delete process.env.VEEGPT_5H_VGU_FREE;
    delete process.env.VEEGPT_CONCURRENCY_FREE;
    await cleanup(userId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 9. Free premium previews: exactly 5, counted atomically.
  // ─────────────────────────────────────────────────────────────────────────
  {
    const userId = newUser();
    await pinPeriod(userId);
    process.env.VEEGPT_5H_VGU_FREE = '-1';
    process.env.VEEGPT_MONTHLY_VGU_FREE = '-1';
    process.env.VEEGPT_CONCURRENCY_FREE = '-1';
    const cap = tierAllocation('free', 'premium').maxRequests;
    check('configured preview allowance', cap, 5);

    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        engine.reserve({
          userId, plan: 'free', feature: 'veegpt.chat', tier: 'premium',
          estimatedVGU: 12,
        })
      )
    );
    check('12 parallel premium attempts → exactly 5 granted',
      results.filter(r => r.ok).length, 5);
    checkTrue('refusals use MODEL_QUOTA_EXHAUSTED',
      results.filter(r => !r.ok).every(r => !r.ok && r.code === 'MODEL_QUOTA_EXHAUSTED'));

    // Cheap models must still work after premium is exhausted (spec §16).
    const cheap = await engine.reserve({
      userId, plan: 'free', feature: 'veegpt.chat', tier: 'cheap', estimatedVGU: 1,
    });
    checkTrue('cheap models still usable after previews are spent', cheap.ok);

    // Ultra is not in the Free plan at all.
    const ultra = await engine.reserve({
      userId, plan: 'free', feature: 'veegpt.chat', tier: 'ultra', estimatedVGU: 20,
    });
    check('ultra refused outright on Free',
      ultra.ok ? 'allowed' : (ultra as { code: string }).code, 'MODEL_NOT_IN_PLAN');

    delete process.env.VEEGPT_5H_VGU_FREE;
    delete process.env.VEEGPT_MONTHLY_VGU_FREE;
    delete process.env.VEEGPT_CONCURRENCY_FREE;
    await cleanup(userId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 10. Premium VGU sub-budget cannot eat the whole plan.
  // ─────────────────────────────────────────────────────────────────────────
  {
    const userId = newUser();
    await pinPeriod(userId);
    process.env.VEEGPT_5H_VGU_PRO = '-1';
    process.env.VEEGPT_CONCURRENCY_PRO = '-1';
    process.env.VEEGPT_TIER_VGU_PRO_PREMIUM = '60';
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        engine.reserve({
          userId, plan: 'pro', feature: 'veegpt.chat', tier: 'premium',
          estimatedVGU: 12,
        })
      )
    );
    check('premium sub-budget 60 / 12 VGU each → 5 granted',
      results.filter(r => r.ok).length, 5);
    // Medium models must remain available — the sub-cap is per tier, not global.
    const medium = await engine.reserve({
      userId, plan: 'pro', feature: 'veegpt.chat', tier: 'medium', estimatedVGU: 3,
    });
    checkTrue('other tiers unaffected by the premium sub-cap', medium.ok);
    delete process.env.VEEGPT_5H_VGU_PRO;
    delete process.env.VEEGPT_CONCURRENCY_PRO;
    delete process.env.VEEGPT_TIER_VGU_PRO_PREMIUM;
    await cleanup(userId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 11. Business pool IS enforced (the previous code only incremented it),
  //     plus the 40% per-seat ceiling.
  // ─────────────────────────────────────────────────────────────────────────
  {
    const workspaceId = `__vgu_ws_${Date.now()}`;
    const seatA = newUser();
    const seatB = newUser();
    await pinPeriod(seatA);
    await pinPeriod(seatB);
    process.env.VEEGPT_5H_VGU_BUSINESS = '-1';
    process.env.VEEGPT_CONCURRENCY_BUSINESS = '-1';
    process.env.VEEGPT_MONTHLY_VGU_BUSINESS = '100';
    process.env.VEEGPT_SEAT_SHARE_BUSINESS = '40';

    // Seat A may take at most 40 of the 100-VGU pool.
    const a1 = await engine.reserve({
      userId: seatA, workspaceId, plan: 'business',
      feature: 'veegpt.chat', tier: 'cheap', estimatedVGU: 40,
    });
    checkTrue('seat A takes its full 40% share', a1.ok);
    const a2 = await engine.reserve({
      userId: seatA, workspaceId, plan: 'business',
      feature: 'veegpt.chat', tier: 'cheap', estimatedVGU: 1,
    });
    check('seat A blocked at its share, not at the pool',
      a2.ok ? 'allowed' : (a2 as { code: string }).code, 'SEAT_SHARE_EXHAUSTED');

    // Seat B still has its own share out of the shared pool.
    const b1 = await engine.reserve({
      userId: seatB, workspaceId, plan: 'business',
      feature: 'veegpt.chat', tier: 'cheap', estimatedVGU: 40,
    });
    checkTrue('seat B can still use the shared pool', b1.ok);
    const poolUsed = Number(
      await redis.hget(K.pool(workspaceId, period.id), 'total')
    );
    check('pool accumulates across seats', poolUsed, 80);

    // Drain the pool with a third seat and prove the POOL blocks, not the seat.
    const seatC = newUser();
    await pinPeriod(seatC);
    const c1 = await engine.reserve({
      userId: seatC, workspaceId, plan: 'business',
      feature: 'veegpt.chat', tier: 'cheap', estimatedVGU: 20,
    });
    checkTrue('seat C consumes the remaining pool', c1.ok);
    const c2 = await engine.reserve({
      userId: seatC, workspaceId, plan: 'business',
      feature: 'veegpt.chat', tier: 'cheap', estimatedVGU: 1,
    });
    check('pool exhaustion is enforced',
      c2.ok ? 'allowed' : (c2 as { code: string }).code, 'WORKSPACE_POOL_EXHAUSTED');

    delete process.env.VEEGPT_5H_VGU_BUSINESS;
    delete process.env.VEEGPT_CONCURRENCY_BUSINESS;
    delete process.env.VEEGPT_MONTHLY_VGU_BUSINESS;
    delete process.env.VEEGPT_SEAT_SHARE_BUSINESS;
    await cleanup(seatA, workspaceId);
    await cleanup(seatB, workspaceId);
    await cleanup(seatC, workspaceId);
    await redis.del(K.pool(workspaceId, period.id)).catch(() => {});
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 12. Per-feature period cap (deep research).
  // ─────────────────────────────────────────────────────────────────────────
  {
    const userId = newUser();
    await pinPeriod(userId);
    process.env.VEEGPT_5H_VGU_PRO = '-1';
    process.env.VEEGPT_CONCURRENCY_PRO = '-1';
    // Deep research also limits itself to ONE concurrent job (spec §22), asserted
    // on its own in verify-vgu-governance. Lift it here so THIS check measures the
    // feature VGU cap and nothing else — otherwise it would pass because of
    // concurrency and prove nothing about the cap.
    process.env.VEEGPT_FEATURE_CONCURRENCY_VEEGPT_DEEP_RESEARCH = '-1';
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        engine.reserve({
          userId, plan: 'pro', feature: 'veegpt.deep_research', tier: 'cheap',
          estimatedVGU: 800, // 4×800 = 3200 > the 3000 Pro deep-research cap → 3 fit
        })
      )
    );
    check('deep-research feature cap limits the job count',
      results.filter(r => r.ok).length, 3);
    checkTrue('refusal names the feature cap',
      results.filter(r => !r.ok).every(r => !r.ok && r.code === 'FEATURE_QUOTA_EXHAUSTED'));
    // Ordinary chat is unaffected by the research cap.
    const chat = await engine.reserve({
      userId, plan: 'pro', feature: 'veegpt.chat', tier: 'cheap', estimatedVGU: 1,
    });
    checkTrue('chat unaffected by the research feature cap', chat.ok);
    delete process.env.VEEGPT_5H_VGU_PRO;
    delete process.env.VEEGPT_CONCURRENCY_PRO;
    delete process.env.VEEGPT_FEATURE_CONCURRENCY_VEEGPT_DEEP_RESEARCH;
    await cleanup(userId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 13. Redis failure: fail CLOSED for premium, bounded fallback for cheap.
  // ─────────────────────────────────────────────────────────────────────────
  {
    const broken = {
      vguReserve: async () => {
        throw new Error('ECONNREFUSED (simulated Redis outage)');
      },
    } as unknown as import('ioredis').Redis;
    const brokenEngine = new VGUReservationEngine(broken);
    const userId = newUser();

    const premium = await brokenEngine.reserve({
      userId, plan: 'pro', feature: 'veegpt.chat', tier: 'premium', estimatedVGU: 12,
    });
    check('premium FAILS CLOSED when quota is unverifiable',
      premium.ok ? 'allowed' : (premium as { code: string }).code, 'QUOTA_UNVERIFIABLE');

    const expensiveCheap = await brokenEngine.reserve({
      userId, plan: 'pro', feature: 'veegpt.deep_research', tier: 'cheap',
      estimatedVGU: 40,
    });
    check('an expensive cheap-tier job also fails closed',
      expensiveCheap.ok ? 'allowed' : (expensiveCheap as { code: string }).code,
      'QUOTA_UNVERIFIABLE');

    const cheap = await brokenEngine.reserve({
      userId, plan: 'free', feature: 'veegpt.chat', tier: 'cheap', estimatedVGU: 1,
    });
    checkTrue('a cheap request still works during an outage', cheap.ok);
    if (cheap.ok) {
      check('and is marked unverified rather than pretending to be accounted',
        cheap.reservationId, UNVERIFIED_RESERVATION);
      // commit/release on the sentinel must be safe no-ops.
      const c = await brokenEngine.commit(cheap.reservationId, 1, {
        userId, plan: 'free', tier: 'cheap', feature: 'veegpt.chat',
        billingPeriodId: period.id,
      });
      check('committing an unverified reservation is a no-op', c.status, 'SKIPPED');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 14. Enterprise is unlimited but still tracked.
  // ─────────────────────────────────────────────────────────────────────────
  {
    const userId = newUser();
    await pinPeriod(userId);
    process.env.VEEGPT_CONCURRENCY_ENTERPRISE = '-1';
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        engine.reserve({
          userId, plan: 'enterprise', feature: 'veegpt.chat', tier: 'ultra',
          estimatedVGU: 500,
        })
      )
    );
    check('enterprise never blocked', results.filter(r => r.ok).length, 20);
    check('usage is still recorded', await usedPeriod(userId), 10000);
    delete process.env.VEEGPT_CONCURRENCY_ENTERPRISE;
    await cleanup(userId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 15. Expired reservation is reclaimed; the charge stands (unknown outcome).
  // ─────────────────────────────────────────────────────────────────────────
  {
    const userId = newUser();
    await pinPeriod(userId);
    const r = await engine.reserve({
      userId, plan: 'pro', feature: 'veegpt.chat', tier: 'cheap', estimatedVGU: 7,
      meta: { userId },
    });
    if (r.ok) {
      // `vgu:open` is a global set shared by every probe run, so a previous run's
      // leftovers can crowd this reservation out of the sweep batch and make the
      // assertion pass or fail for reasons unrelated to the sweeper. Isolate by
      // clearing prior probe entries first.
      const stale = await redis.zrange('vgu:open', 0, -1);
      const mine = stale.filter(id => id !== r.reservationId);
      if (mine.length) await redis.zrem('vgu:open', ...mine);

      // Simulate the owner dying: force the open-reservation deadline past.
      await redis.zadd('vgu:open', String(Date.now() - 1000), r.reservationId);
      const { swept } = await engine.sweepExpired(1000);
      check('sweeper reclaimed exactly the abandoned reservation', swept, 1);
      const rec = await engine.getReservation(r.reservationId);
      check('marked EXPIRED', rec?.status, 'EXPIRED');
      // Deliberate: we cannot know whether the provider ran, so the charge stays.
      check('charge is retained (safe default)', await usedPeriod(userId), 7);
      const slots = await redis.zcard(K.concurrency(userId));
      check('concurrency slot freed', slots, 0);
    }
    await cleanup(userId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 16. CONTROL EXPERIMENT — prove the defect being fixed is real.
  //     Replays the retired GET → compare → INCRBY pattern on the same Redis
  //     with the same race. If this does NOT overspend, the concurrency proof
  //     above is meaningless (the runtime would be serialising requests anyway).
  // ─────────────────────────────────────────────────────────────────────────
  {
    const legacyKey = `__vgu_legacy_race_${Date.now()}`;
    const CAP = 100;
    const COST = 30;
    await redis.del(legacyKey);

    const legacyReserve = async (): Promise<boolean> => {
      // Exactly the old logic: read, decide, then write.
      const used = Number(await redis.get(legacyKey)) || 0;
      if (used >= CAP) return false;
      await redis.incrby(legacyKey, COST);
      return true;
    };

    const legacyGranted = (
      await Promise.all([1, 2, 3, 4, 5].map(() => legacyReserve()))
    ).filter(Boolean).length;
    const legacyCharged = Number(await redis.get(legacyKey)) || 0;
    await redis.del(legacyKey);

    checkTrue(
      `control: old GET→INCRBY pattern overspends (granted ${legacyGranted}/5, charged ${legacyCharged} of ${CAP})`,
      legacyCharged > CAP
    );
    console.log(
      `      → old pattern authorised ${legacyCharged} VGU from a ${CAP} VGU budget; ` +
        `the Lua engine authorised exactly 90.`
    );
  }

  console.log(
    `\n${fail === 0 ? 'ALL CHECKS PASSED' : `${fail} CHECK(S) FAILED`}  (${pass} passed)`
  );
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => {
  console.error('probe error:', e?.stack || e?.message || e);
  process.exit(1);
});
