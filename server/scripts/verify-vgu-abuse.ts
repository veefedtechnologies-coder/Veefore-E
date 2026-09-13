/**
 * BLOCK 6 VERIFICATION — concurrency bounds and abuse protection.
 *
 * Proves, against real Redis:
 *
 *   1. Per-user concurrency is atomic: N simultaneous requests take exactly the
 *      allowed number of slots, never more.
 *   2. A POOLED workspace is bounded as a workspace (spec §39), so N seats cannot
 *      multiply the team's concurrency by N.
 *   3. Slots are returned on commit, release AND expiry, so capacity cannot leak.
 *   4. Abuse scoring never acts on a single signal, whatever its weight (§32).
 *   5. Each of the eight signals actually fires on its own pattern.
 *   6. Escalation is proportionate: throttle tightens, restrict removes only the
 *      expensive tiers, block denies.
 *   7. Detection FAILS OPEN — a Redis outage cannot lock users out.
 *   8. A small sample is never judged.
 *   9. Enforcement is off by default: an action is recorded, not applied.
 *
 * Run: npx tsx server/scripts/verify-vgu-abuse.ts
 */

import 'dotenv/config';
import { getRedisClient } from '../lib/redis';
import {
  getReservationEngine,
  RESERVATION_KEYS,
  VGUReservationEngine,
} from '../services/veegpt-reservation.engine';
import {
  ABUSE_KEYS,
  ABUSE_THRESHOLD,
  MIN_DISTINCT_SIGNALS,
  SIGNAL_WEIGHT,
  actionFor,
  adjustmentFor,
  assessAbuse,
  clearAbuseState,
  recordAbuseObservation,
} from '../services/veegpt-abuse';
import { policyForPlan } from '../config/veegpt-vgu.config';
import { accountAgeDays } from '../services/veegpt-plan';
import { resolveBillingPeriod } from '../services/veegpt-billing-period';

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.log(
      `  ✗ ${label}\n      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`
    );
  }
}

function section(t: string): void {
  console.log(`\n${t}\n${'-'.repeat(t.length)}`);
}

const RUN = `__abuse_probe_${Date.now()}`;
const users: string[] = [];
function user(tag: string): string {
  const u = `${RUN}_${tag}`;
  users.push(u);
  return u;
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
        ...(period ? [RESERVATION_KEYS.period(u, period.id)] : [])
      )
      .catch(() => {});
    await clearAbuseState(u);
    await redis.del(`veegpt:acctage:${u}`).catch(() => {});
  }
  const ws = await redis.keys(`vgu:wconc:${RUN}*`).catch(() => [] as string[]);
  if (ws.length) await redis.del(...ws).catch(() => {});
  const pools = await redis.keys(`vgu:pool:${RUN}*`).catch(() => [] as string[]);
  if (pools.length) await redis.del(...pools).catch(() => {});
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('VGU CONCURRENCY + ABUSE VERIFICATION (Block 6)\n' + '='.repeat(70));
  process.env.VGU_ABUSE_DETECTION = 'on';
  delete process.env.VGU_ABUSE_ENFORCE;
  await cleanup();
  const engine = getReservationEngine();

  // =========================================================================
  section('1. Per-user concurrency is atomic');
  // =========================================================================
  {
    const u = user('conc');
    const limit = policyForPlan('pro').maxConcurrentAI; // 4
    // Ten SIMULTANEOUS reservations, all cheap enough that no budget can bind —
    // so concurrency is provably the only thing refusing them.
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        engine.reserve({
          userId: u,
          plan: 'pro',
          feature: 'veegpt.chat',
          tier: 'cheap',
          estimatedVGU: 1,
        })
      )
    );
    const granted = results.filter(r => r.ok);
    check(`exactly ${limit} of 10 simultaneous requests are granted`, granted.length, limit);
    check(
      'every refusal names concurrency, not a budget',
      results.filter(r => !r.ok).every(r => !r.ok && r.code === 'CONCURRENCY_LIMIT'),
      true
    );
    check(
      'Redis holds exactly the granted number of slots',
      await getRedisClient().zcard(RESERVATION_KEYS.concurrency(u)),
      limit
    );

    // Returning a slot must free capacity again.
    const first = granted[0];
    if (first.ok) {
      await engine.commit(first.reservationId, 1, {
        userId: u,
        plan: 'pro',
        tier: 'cheap',
        feature: 'veegpt.chat',
        billingPeriodId: first.billingPeriodId,
      });
    }
    check(
      'committing returns the slot',
      await getRedisClient().zcard(RESERVATION_KEYS.concurrency(u)),
      limit - 1
    );
    const after = await engine.reserve({
      userId: u,
      plan: 'pro',
      feature: 'veegpt.chat',
      tier: 'cheap',
      estimatedVGU: 1,
    });
    check('the freed slot is immediately reusable', after.ok, true);
    if (after.ok) {
      await engine.release(after.reservationId, {
        userId: u,
        plan: 'pro',
        tier: 'cheap',
        feature: 'veegpt.chat',
        billingPeriodId: after.billingPeriodId,
      });
    }
    check(
      'releasing returns the slot too',
      await getRedisClient().zcard(RESERVATION_KEYS.concurrency(u)),
      limit - 1
    );
  }

  // =========================================================================
  section('2. A pooled WORKSPACE is bounded as a workspace (spec §39)');
  // =========================================================================
  {
    const wsId = `${RUN}_ws`;
    const policy = policyForPlan('business');
    const wsLimit = policy.maxConcurrentWorkspace; // 10
    const perSeat = policy.maxConcurrentAI; // 10
    check('Business bounds the workspace', wsLimit > 0, true);

    // Six seats, each opening 3 requests = 18 attempts. Per seat that is inside
    // the personal limit of 10, so WITHOUT a workspace bound all 18 would be
    // granted — 18 simultaneous provider calls on a plan that allows 10.
    const seats = Array.from({ length: 6 }, (_, i) => user(`seat${i}`));
    const attempts: Promise<unknown>[] = [];
    for (const seat of seats) {
      for (let i = 0; i < 3; i++) {
        attempts.push(
          engine.reserve({
            userId: seat,
            workspaceId: wsId,
            plan: 'business',
            feature: 'veegpt.chat',
            tier: 'cheap',
            estimatedVGU: 1,
          })
        );
      }
    }
    const res = (await Promise.all(attempts)) as Array<
      { ok: true; reservationId: string; billingPeriodId: string } | { ok: false; code: string }
    >;
    const granted = res.filter(r => r.ok) as Array<{
      ok: true;
      reservationId: string;
      billingPeriodId: string;
    }>;
    check('18 attempts were made across 6 seats', res.length, 18);
    check(
      `no more than the workspace limit (${wsLimit}) run at once`,
      granted.length <= wsLimit,
      true
    );
    check(`exactly ${wsLimit} granted`, granted.length, wsLimit);
    check(
      'each seat stayed within its personal limit, so only the workspace bound could refuse',
      3 <= perSeat,
      true
    );
    check(
      'refusals name the workspace limit',
      res
        .filter(r => !r.ok)
        .every(r => !r.ok && r.code === 'WORKSPACE_CONCURRENCY_LIMIT'),
      true
    );
    check(
      'Redis holds exactly the workspace slots',
      await getRedisClient().zcard(`vgu:wconc:${wsId}`),
      wsLimit
    );

    // Freeing one workspace slot must let another seat in.
    const one = granted[0];
    await engine.commit(one.reservationId, 1, {
      userId: seats[0],
      workspaceId: wsId,
      plan: 'business',
      tier: 'cheap',
      feature: 'veegpt.chat',
      billingPeriodId: one.billingPeriodId,
    });
    check(
      'committing frees the WORKSPACE slot, not just the seat slot',
      await getRedisClient().zcard(`vgu:wconc:${wsId}`),
      wsLimit - 1
    );
    const nextSeat = await engine.reserve({
      userId: seats[5],
      workspaceId: wsId,
      plan: 'business',
      feature: 'veegpt.chat',
      tier: 'cheap',
      estimatedVGU: 1,
    });
    check('a different seat can now start', nextSeat.ok, true);

    // A non-pooled plan must NOT be workspace-bounded, or a single-seat customer
    // would be limited twice by the same number.
    const solo = user('solo');
    const soloRes = await engine.reserve({
      userId: solo,
      workspaceId: wsId,
      plan: 'pro',
      feature: 'veegpt.chat',
      tier: 'cheap',
      estimatedVGU: 1,
    });
    check(
      'a non-pooled plan ignores the workspace concurrency set',
      soloRes.ok,
      true
    );
  }

  // =========================================================================
  section('3. The sweeper frees BOTH slots for a crashed request');
  // =========================================================================
  {
    // A worker that dies mid-request leaves its reservation open. The VGU charge
    // is deliberately kept (we cannot know whether the provider ran), but the
    // concurrency slots must come back or the user — and the whole workspace —
    // would be throttled by a ghost.
    //
    // Note: no `meta.userId` is passed here on purpose. The engine records the
    // owner itself, so reclaiming a slot does not depend on every caller
    // remembering to duplicate the id.
    const u = user('crashed');
    const wsId = `${RUN}_ws2`;
    process.env.VEEGPT_RESERVATION_TTL_SEC = '1';
    const r = await engine.reserve({
      userId: u,
      workspaceId: wsId,
      plan: 'business',
      feature: 'veegpt.chat',
      tier: 'cheap',
      estimatedVGU: 2,
    });
    delete process.env.VEEGPT_RESERVATION_TTL_SEC;
    check('the reservation was granted', r.ok, true);
    check('it holds a user slot', await getRedisClient().zcard(RESERVATION_KEYS.concurrency(u)), 1);
    check('and a workspace slot', await getRedisClient().zcard(`vgu:wconc:${wsId}`), 1);

    // Let the 1-second reservation TTL lapse, then sweep.
    await new Promise(res => setTimeout(res, 1200));
    const { swept } = await engine.sweepExpired();
    check('the sweeper reclaimed it', swept >= 1, true);
    check(
      'the user slot was returned',
      await getRedisClient().zcard(RESERVATION_KEYS.concurrency(u)),
      0
    );
    check(
      'the WORKSPACE slot was returned too',
      await getRedisClient().zcard(`vgu:wconc:${wsId}`),
      0
    );
    if (r.ok) {
      const rec = await engine.getReservation(r.reservationId);
      check('and it is marked EXPIRED, not silently forgotten', rec?.status, 'EXPIRED');
      // The charge stands: the outcome is unknown, so assuming it ran is the only
      // safe assumption for cost.
      const snap = await engine.usageSnapshot(u, 'business', wsId);
      check('the VGU charge is retained', snap.period.used, 2);
    }
  }

  // =========================================================================
  section('4. Abuse scoring cannot act on a single signal (spec §32)');
  // =========================================================================
  {
    const heaviest = Math.max(...Object.values(SIGNAL_WEIGHT));
    check(
      'the heaviest single signal scores below the first action threshold',
      heaviest < ABUSE_THRESHOLD.throttle,
      true
    );
    check('at least two distinct signals are required', MIN_DISTINCT_SIGNALS >= 2, true);
    // Even an absurd score from one signal must not escalate.
    check('one signal at a blocking score still only observes', actionFor(500, 1), 'observe');
    check('two signals below the threshold do not act', actionFor(30, 2), 'observe');
    check('two signals at the throttle threshold act', actionFor(45, 2), 'throttle');
    check('restrict needs the restrict score', actionFor(70, 2), 'restrict');
    check('block needs the block score', actionFor(100, 3), 'block');
    check('a quiet user is simply allowed', actionFor(0, 0), 'allow');
  }

  // =========================================================================
  section('5. A small sample is never judged');
  // =========================================================================
  {
    const u = user('small');
    for (let i = 0; i < 5; i++) {
      await recordAbuseObservation({ userId: u, tier: 'premium', failed: true });
    }
    const a = await assessAbuse(u, 'free');
    check('five requests produce no signals', a.signals.length, 0);
    check('and no action', a.action, 'allow');
    check('but they are counted', a.observedRequests, 5);
  }

  // =========================================================================
  section('6. Each signal fires on its own pattern');
  // =========================================================================
  {
    // duplicate + failures + premium, from 40 identical failing premium requests.
    const u = user('signals');
    for (let i = 0; i < 40; i++) {
      await recordAbuseObservation({
        userId: u,
        tier: 'premium',
        promptText: 'write me a caption about shoes',
        failed: true,
        userAgent: 'Mozilla/5.0',
      });
    }
    const a = await assessAbuse(u, 'pro');
    const names = a.signals.map(s => s.name).sort();
    check('duplicate prompts are detected', names.includes('duplicate'), true);
    check('an abnormal failure rate is detected', names.includes('failures'), true);
    check('an abnormal premium share is detected', names.includes('premium'), true);
    check('the score is the sum of the signal weights', a.score, a.signals.reduce((x, s) => x + s.weight, 0));
    check(
      'multiple signals DID justify an action',
      a.action !== 'allow' && a.action !== 'observe',
      true
    );
    check(
      'every signal carries readable evidence',
      a.signals.every(s => typeof s.detail === 'string' && s.detail.length > 0),
      true
    );
  }
  {
    // context size, on its own, must not act.
    const u = user('context');
    for (let i = 0; i < 25; i++) {
      await recordAbuseObservation({
        userId: u,
        tier: 'cheap',
        promptChars: i === 0 ? 900_000 : 500,
        promptText: `unique prompt ${i}`,
        userAgent: 'Mozilla/5.0',
      });
    }
    const a = await assessAbuse(u, 'pro');
    check('an outlier context size is detected', a.signals.some(s => s.name === 'context'), true);
    // Its weight (15) is below even the observe threshold (25), so on its own it
    // is recorded as evidence and changes nothing at all. What matters is that it
    // never escalates to an enforcement action.
    check('on its own it takes no action', a.action, 'allow');
    check('and it contributes exactly its weight', a.score, SIGNAL_WEIGHT.context);
    check('so it cannot deny anything', adjustmentFor(a.action).deny, false);
  }
  {
    // concurrency saturation.
    const u = user('concsig');
    for (let i = 0; i < 30; i++) {
      await recordAbuseObservation({
        userId: u,
        tier: 'cheap',
        concurrencyBlocked: true,
        promptText: `p${i}`,
        userAgent: 'Mozilla/5.0',
      });
    }
    const a = await assessAbuse(u, 'pro');
    check(
      'repeated concurrency saturation is detected',
      a.signals.some(s => s.name === 'concurrency'),
      true
    );
  }
  {
    // automation: no user-agent on everything.
    const u = user('auto');
    for (let i = 0; i < 30; i++) {
      await recordAbuseObservation({ userId: u, tier: 'cheap', promptText: `q${i}` });
    }
    const a = await assessAbuse(u, 'pro');
    check(
      'automated traffic is detected',
      a.signals.some(s => s.name === 'automation'),
      true
    );
  }
  {
    // a brand-new account at volume.
    const u = user('newacct');
    for (let i = 0; i < 120; i++) {
      await recordAbuseObservation({
        userId: u,
        tier: 'cheap',
        promptText: `r${i}`,
        userAgent: 'Mozilla/5.0',
      });
    }
    const a = await assessAbuse(u, 'pro', { accountAgeDays: 0 });
    check(
      'suspicious new-account volume is detected',
      a.signals.some(s => s.name === 'account'),
      true
    );
    const older = await assessAbuse(u, 'pro', { accountAgeDays: 400 });
    check(
      'the same traffic from an established account does NOT fire it',
      older.signals.some(s => s.name === 'account'),
      false
    );
  }

  // =========================================================================
  section('7. Escalation is proportionate');
  // =========================================================================
  {
    check('allow changes nothing', adjustmentFor('allow'), {
      concurrencyFactor: 1,
      rpmFactor: 1,
      maxTier: null,
      deny: false,
    });
    check('observe changes nothing either', adjustmentFor('observe').deny, false);
    const throttle = adjustmentFor('throttle');
    check('throttle tightens concurrency', throttle.concurrencyFactor < 1, true);
    check('throttle tightens the request rate', throttle.rpmFactor < 1, true);
    check('throttle does NOT restrict models', throttle.maxTier, null);
    check('throttle does NOT deny', throttle.deny, false);
    const restrict = adjustmentFor('restrict');
    check('restrict caps the tier', restrict.maxTier, 'medium');
    check('restrict still allows cheap models to run', restrict.deny, false);
    check('block denies', adjustmentFor('block').deny, true);
  }

  // =========================================================================
  section('8. A throttle tightens concurrency without locking anyone out');
  // =========================================================================
  {
    const u = user('throttled');
    const limit = policyForPlan('pro').maxConcurrentAI; // 4
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        engine.reserve({
          userId: u,
          plan: 'pro',
          feature: 'veegpt.chat',
          tier: 'cheap',
          estimatedVGU: 1,
          concurrencyFactor: 0.5,
        })
      )
    );
    const granted = results.filter(r => r.ok).length;
    check(`a 0.5 factor halves ${limit} to ${Math.floor(limit / 2)}`, granted, Math.floor(limit / 2));
    check('but it is never zero — a throttle is not a ban', granted > 0, true);

    // A factor can only tighten. Passing 5 must not raise the plan's limit.
    const u2 = user('nofactorboost');
    const boosted = await Promise.all(
      Array.from({ length: 8 }, () =>
        engine.reserve({
          userId: u2,
          plan: 'pro',
          feature: 'veegpt.chat',
          tier: 'cheap',
          estimatedVGU: 1,
          concurrencyFactor: 5,
        })
      )
    );
    check(
      'a factor above 1 cannot raise the limit',
      boosted.filter(r => r.ok).length,
      limit
    );
  }

  // =========================================================================
  section('9. Enforcement is OFF by default: recorded, not applied');
  // =========================================================================
  {
    delete process.env.VGU_ABUSE_ENFORCE;
    const u = user('shadow');
    for (let i = 0; i < 40; i++) {
      await recordAbuseObservation({
        userId: u,
        tier: 'premium',
        promptText: 'same prompt every time',
        failed: true,
      });
    }
    const off = await assessAbuse(u, 'pro');
    check('an action is computed', off.action !== 'allow' && off.action !== 'observe', true);
    check('but nothing beyond observation is applied', off.effectiveAction, 'observe');
    check('so no request is denied', adjustmentFor(off.effectiveAction).deny, false);

    process.env.VGU_ABUSE_ENFORCE = 'on';
    const on = await assessAbuse(u, 'pro');
    check('with enforcement on, the action applies', on.effectiveAction, on.action);
    delete process.env.VGU_ABUSE_ENFORCE;
  }

  // =========================================================================
  section('10. Detection FAILS OPEN');
  // =========================================================================
  {
    // A dead store must degrade abuse scoring to "no opinion", never to a
    // lockout: abuse detection is not the cost control, the VGU engine is.
    const broken = {
      hgetall: async (): Promise<Record<string, string>> => {
        throw new Error('ECONNREFUSED (simulated outage)');
      },
      zrangebyscore: async (): Promise<string[]> => {
        throw new Error('ECONNREFUSED (simulated outage)');
      },
    };
    // Enforcement ON, so this cannot pass merely because nothing is applied.
    process.env.VGU_ABUSE_ENFORCE = 'on';
    const a = await assessAbuse(user('degraded'), 'pro', { store: broken });
    check('the assessment reports itself as degraded', a.degraded, true);
    check('and takes no action', a.action, 'allow');
    check('nothing is denied even with enforcement ON', adjustmentFor(a.effectiveAction).deny, false);
    check('no signals are invented from a failed read', a.signals.length, 0);
    delete process.env.VGU_ABUSE_ENFORCE;
  }

  // =========================================================================
  section('11. Account age is actually supplied, not just supported');
  // =========================================================================
  {
    // The `account` signal was implemented but nothing fed it, which made it dead
    // code. `accountAgeDays` now resolves it (cached for hours, so it is not a
    // per-request database read) and meterAI passes it in.
    const u = user('agecache');
    const redis = getRedisClient();
    const key = `veegpt:acctage:${u}`;
    await redis.del(key);

    // A cache MISS must not block the request: it returns undefined immediately
    // (so the signal simply does not fire) and warms the cache in the background.
    // Blocking here measurably stalled a user's first AI request.
    const t0 = Date.now();
    const unknown = await accountAgeDays(u);
    const elapsed = Date.now() - t0;
    check('a cache miss yields undefined, not a guess', unknown, undefined);
    check('and returns immediately rather than waiting on the database', elapsed < 100, true);
    // The background warm then fills it in. Polled rather than slept, because the
    // whole point is that its duration is off the request path and unbounded.
    let warmed: string | null = null;
    for (let i = 0; i < 40 && warmed === null; i++) {
      await new Promise(r => setTimeout(r, 250));
      warmed = await redis.get(key);
    }
    check('the miss is cached by the background warm', warmed, '');

    // A cached age is used as-is.
    await redis.set(key, '0', 'EX', 60);
    check('a cached age of 0 days is read back', await accountAgeDays(u), 0);
    await redis.set(key, '900', 'EX', 60);
    check('an established account reads back too', await accountAgeDays(u), 900);

    // And it drives the signal end to end.
    for (let i = 0; i < 120; i++) {
      await recordAbuseObservation({
        userId: u,
        tier: 'cheap',
        promptText: `age${i}`,
        userAgent: 'Mozilla/5.0',
      });
    }
    await redis.set(key, '0', 'EX', 60);
    const young = await assessAbuse(u, 'pro', {
      accountAgeDays: await accountAgeDays(u),
    });
    check(
      'a day-old account at volume fires the account signal',
      young.signals.some(sg => sg.name === 'account'),
      true
    );
    await redis.set(key, '900', 'EX', 60);
    const old = await assessAbuse(u, 'pro', {
      accountAgeDays: await accountAgeDays(u),
    });
    check(
      'the same traffic from an established account does not',
      old.signals.some(sg => sg.name === 'account'),
      false
    );
    await redis.del(key);
  }

  // =========================================================================
  section('12. Detection can be switched off entirely');
  // =========================================================================
  {
    process.env.VGU_ABUSE_DETECTION = 'off';
    const u = user('disabled');
    for (let i = 0; i < 40; i++) {
      await recordAbuseObservation({ userId: u, tier: 'premium', failed: true });
    }
    const a = await assessAbuse(u, 'pro');
    check('no signals are produced when disabled', a.signals.length, 0);
    check('and nothing was recorded', a.observedRequests, 0);
    process.env.VGU_ABUSE_DETECTION = 'on';
  }

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
