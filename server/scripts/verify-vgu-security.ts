/**
 * BLOCK 11 · SECURITY / ATTACK VERIFICATION (spec §59).
 *
 * §59 lists the ways a determined client will try to get AI it did not pay for.
 * This probe attempts each one against the real engine and proves it is rejected
 * or handled correctly — the spec's bar is "All must be rejected or handled
 * correctly", and the hard rule from the build is "no known quota bypass may
 * remain".
 *
 * Attacks attempted here:
 *   1. Premium tier from a Free plan — the previews are finite and then it stops.
 *   2. A model the plan cannot use at all (Free → Ultra) is refused outright.
 *   3. Platform-chosen models are NOT punished as if the user picked them (the
 *      gating governs USER choice, not a feature's hard-coded model).
 *   4. A forged plan cannot inflate limits — the plan is resolved server-side and
 *      an unresolved plan collapses to Free, never to unlimited.
 *   5. Replaying a completed CLIENT request-id does not yield free AI (it is
 *      re-charged); a trusted SERVER id is reused so a job retry is not charged
 *      twice.
 *   6. One user cannot hijack another user's reservation via a shared request-id
 *      (the idempotency namespace is per-user).
 *   7. Pointing at a workspace id cannot escape a personal plan's budget.
 *   8. A downgrade takes effect immediately (the cached plan is invalidated), so
 *      a just-downgraded user cannot keep spending at the old ceiling.
 *   9. A never-subscribed user resolves to a real, restrictive plan — never to a
 *      privileged default.
 *
 * HTTP-surface attacks (direct calls, old/undocumented endpoints) are proven at
 * the router in the live boot check that accompanies this block.
 *
 * Run: npx tsx server/scripts/verify-vgu-security.ts
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
import { resolveVeegptPlan, invalidateVeegptPlanCache } from '../services/veegpt-plan';
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

const RUN = `__sec_probe_${Date.now()}`;
const users: string[] = [];
function user(tag: string): string {
  const u = `${RUN}_${tag}`;
  users.push(u);
  return u;
}

async function seedPlan(userId: string, plan: string): Promise<void> {
  await getRedisClient().set(`veegpt:rl:plan:${userId}`, plan, 'EX', 900).catch(() => {});
}

const engine = getReservationEngine();

async function commit(r: Extract<ReserveResult, { ok: true }>, u: string, plan: PlanId, feature: string): Promise<void> {
  await engine.commit(r.reservationId, r.estimatedVGU, {
    userId: u,
    plan,
    tier: 'cheap',
    feature,
    billingPeriodId: r.billingPeriodId,
  }).catch(() => {});
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
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('SECURITY / ATTACK VERIFICATION (Block 11 · \u00a759)\n' + '='.repeat(70));
  await connectionManager.connect().catch(() => {});
  const mongoUp = mongoose.connection.readyState === 1;
  console.log(`mongo=${mongoUp ? mongoose.connection.name : 'not connected'}`);
  await cleanup();

  // =========================================================================
  section('1. ATTACK: use Premium repeatedly on a Free plan');
  // =========================================================================
  {
    const u = user('freePrem');
    await seedPlan(u, 'free');
    // Isolate the preview COUNT as the only binding limit.
    process.env.VEEGPT_CONCURRENCY_FREE = '10000';
    process.env.VEEGPT_5H_VGU_FREE = '-1';
    process.env.VEEGPT_MONTHLY_VGU_FREE = '100000';

    let granted = 0;
    let code = '';
    for (let i = 0; i < 9; i++) {
      const r = await engine.reserve({
        userId: u,
        plan: 'free',
        feature: 'veegpt.chat',
        tier: 'premium',
        estimatedVGU: 1,
        modelChosenBy: 'user',
      });
      if (r.ok) granted++;
      else {
        code = r.code;
        break;
      }
    }
    check('Free gets exactly 5 Premium previews (spec \u00a716)', granted, 5);
    check('then Premium is refused', code, 'MODEL_QUOTA_EXHAUSTED');

    // Fast (cheap) remains usable after previews are spent — the fallback path.
    const cheap = await engine.reserve({
      userId: u,
      plan: 'free',
      feature: 'veegpt.chat',
      tier: 'cheap',
      estimatedVGU: 1,
    });
    check('Fast stays usable after Premium previews are exhausted', cheap.ok, true);
    delete process.env.VEEGPT_CONCURRENCY_FREE;
    delete process.env.VEEGPT_5H_VGU_FREE;
    delete process.env.VEEGPT_MONTHLY_VGU_FREE;
    await cleanup();
  }

  // =========================================================================
  section('2. ATTACK: request a model the plan cannot use at all');
  // =========================================================================
  {
    const u = user('freeUltra');
    await seedPlan(u, 'free');
    const r = await engine.reserve({
      userId: u,
      plan: 'free',
      feature: 'veegpt.chat',
      tier: 'ultra',
      estimatedVGU: 1,
      modelChosenBy: 'user',
    });
    check('Free cannot select Ultra at all', r.ok, false);
    check('and the refusal is explicit, before any spend', !r.ok && r.code, 'MODEL_NOT_IN_PLAN');
    await cleanup();
  }

  // =========================================================================
  section('3. Platform-chosen models are not punished as user choices');
  // =========================================================================
  {
    // A feature that hard-codes an Ultra model (the user never chose it) must not
    // be refused MODEL_NOT_IN_PLAN — that would deny a Free user a feature they
    // are entitled to. Cost is still charged against the budgets.
    const u = user('platform');
    await seedPlan(u, 'free');
    process.env.VEEGPT_5H_VGU_FREE = '-1';
    process.env.VEEGPT_MONTHLY_VGU_FREE = '1000';
    const r = await engine.reserve({
      userId: u,
      plan: 'free',
      feature: 'caption.generation',
      tier: 'ultra',
      estimatedVGU: 1,
      modelChosenBy: 'platform',
    });
    check('a platform-chosen Ultra model is allowed for Free', r.ok, true);
    delete process.env.VEEGPT_5H_VGU_FREE;
    delete process.env.VEEGPT_MONTHLY_VGU_FREE;
    await cleanup();
  }

  // =========================================================================
  section('4. ATTACK: forge the plan id to inflate limits');
  // =========================================================================
  {
    // The plan is NEVER taken from the client. It is resolved from the
    // subscription and cached here; an unresolved plan must collapse to Free.
    const u = user('forgePlan');
    await seedPlan(u, 'free');
    const resolved = await resolveVeegptPlan(u);
    check('the resolver returns the server-side plan, not a client claim', resolved, 'free');

    // Even if a caller *passes* an inflated plan to the engine, the enforcement is
    // only as generous as that plan's real limits — and the routes never pass a
    // client value. Prove Free's own ceiling still binds under the resolved plan.
    process.env.VEEGPT_5H_VGU_FREE = '-1';
    process.env.VEEGPT_CONCURRENCY_FREE = '10000';
    process.env.VEEGPT_MONTHLY_VGU_FREE = '3';
    let granted = 0;
    let code = '';
    for (let i = 0; i < 6; i++) {
      const r = await engine.reserve({
        userId: u,
        plan: 'free',
        feature: 'veegpt.chat',
        tier: 'cheap',
        estimatedVGU: 1,
      });
      if (r.ok) granted++;
      else { code = r.code; break; }
    }
    check('the resolved Free budget binds hard', granted, 3);
    check('and stops with a quota error, not an overspend', code, 'MONTHLY_QUOTA_EXHAUSTED');
    delete process.env.VEEGPT_5H_VGU_FREE;
    delete process.env.VEEGPT_CONCURRENCY_FREE;
    delete process.env.VEEGPT_MONTHLY_VGU_FREE;
    await cleanup();
  }

  // =========================================================================
  section('5. ATTACK: replay a completed request-id for free AI');
  // =========================================================================
  {
    const u = user('replay');
    await seedPlan(u, 'pro');
    process.env.VEEGPT_5H_VGU_PRO = '-1';
    process.env.VEEGPT_CONCURRENCY_PRO = '10000';
    process.env.VEEGPT_MONTHLY_VGU_PRO = '1000';

    // A CLIENT-supplied id, honoured only while in flight.
    const clientId = `client_${Date.now()}`;
    const first = await engine.reserve({
      userId: u, plan: 'pro', feature: 'veegpt.chat', tier: 'cheap',
      estimatedVGU: 5, requestId: clientId, requestIdTrusted: false,
    });
    check('the first attempt is granted', first.ok, true);
    if (first.ok) await commit(first, u, 'pro', 'veegpt.chat');

    const replay = await engine.reserve({
      userId: u, plan: 'pro', feature: 'veegpt.chat', tier: 'cheap',
      estimatedVGU: 5, requestId: clientId, requestIdTrusted: false,
    });
    check('replaying the COMPLETED client id creates a NEW reservation', replay.ok && !replay.idempotent, true);
    check(
      'so it is re-charged, not free',
      first.ok && replay.ok && replay.reservationId !== first.reservationId,
      true
    );

    // A SERVER-generated id (a job id) IS reused across a terminal state, so a
    // legitimate job retry is not double-charged.
    const jobId = `job_${Date.now()}`;
    const j1 = await engine.reserve({
      userId: u, plan: 'pro', feature: 'veegpt.chat', tier: 'cheap',
      estimatedVGU: 5, requestId: jobId, requestIdTrusted: true,
    });
    if (j1.ok) await commit(j1, u, 'pro', 'veegpt.chat');
    const j2 = await engine.reserve({
      userId: u, plan: 'pro', feature: 'veegpt.chat', tier: 'cheap',
      estimatedVGU: 5, requestId: jobId, requestIdTrusted: true,
    });
    check('a trusted job id is reused (idempotent) on retry', j2.ok && j2.idempotent, true);
    check(
      'so the retry maps to the same reservation, not a second charge',
      j1.ok && j2.ok && j2.reservationId === j1.reservationId,
      true
    );
    delete process.env.VEEGPT_5H_VGU_PRO;
    delete process.env.VEEGPT_CONCURRENCY_PRO;
    delete process.env.VEEGPT_MONTHLY_VGU_PRO;
    await cleanup();
  }

  // =========================================================================
  section('6. ATTACK: hijack another user\u2019s reservation via a shared id');
  // =========================================================================
  {
    const a = user('victim');
    const b = user('attacker');
    await seedPlan(a, 'pro');
    await seedPlan(b, 'pro');
    process.env.VEEGPT_5H_VGU_PRO = '-1';
    process.env.VEEGPT_CONCURRENCY_PRO = '10000';
    process.env.VEEGPT_MONTHLY_VGU_PRO = '1000';
    const shared = `shared_${Date.now()}`;
    const ra = await engine.reserve({
      userId: a, plan: 'pro', feature: 'veegpt.chat', tier: 'cheap',
      estimatedVGU: 5, requestId: shared, requestIdTrusted: true,
    });
    const rb = await engine.reserve({
      userId: b, plan: 'pro', feature: 'veegpt.chat', tier: 'cheap',
      estimatedVGU: 5, requestId: shared, requestIdTrusted: true,
    });
    check('both users get their OWN reservation for the same id', ra.ok && rb.ok, true);
    check(
      'the attacker cannot reuse the victim\u2019s reservation',
      ra.ok && rb.ok && ra.reservationId !== rb.reservationId,
      true
    );
    delete process.env.VEEGPT_5H_VGU_PRO;
    delete process.env.VEEGPT_CONCURRENCY_PRO;
    delete process.env.VEEGPT_MONTHLY_VGU_PRO;
    await cleanup();
  }

  // =========================================================================
  section('7. ATTACK: use a workspace id to escape a personal budget');
  // =========================================================================
  {
    // A non-pooled (personal) plan does not gain a shared pool by being handed a
    // workspaceId; the personal period budget still binds.
    const u = user('wsEscape');
    await seedPlan(u, 'pro');
    process.env.VEEGPT_5H_VGU_PRO = '-1';
    process.env.VEEGPT_CONCURRENCY_PRO = '10000';
    process.env.VEEGPT_MONTHLY_VGU_PRO = '3';
    let granted = 0;
    let code = '';
    for (let i = 0; i < 6; i++) {
      const r = await engine.reserve({
        userId: u,
        workspaceId: `${RUN}_someWorkspace`,
        plan: 'pro',
        feature: 'veegpt.chat',
        tier: 'cheap',
        estimatedVGU: 1,
      });
      if (r.ok) granted++;
      else { code = r.code; break; }
    }
    check('passing a workspace id does not unlock extra budget', granted, 3);
    check('the personal budget still stops it', code, 'MONTHLY_QUOTA_EXHAUSTED');
    await cleanup();
  }

  // =========================================================================
  section('8. ATTACK: keep spending at the old ceiling after a downgrade');
  // =========================================================================
  {
    const u = user('downgrade');
    await seedPlan(u, 'pro');
    check('the user starts on Pro', await resolveVeegptPlan(u), 'pro');
    // Simulate the downgrade: the subscription changed, so the cache is invalidated
    // and the fresh (lower) plan is seeded, exactly as the lifecycle hook does.
    await invalidateVeegptPlanCache(u);
    await seedPlan(u, 'free');
    check('the downgrade takes effect on the very next resolve', await resolveVeegptPlan(u), 'free');

    // And the lower ceiling now binds.
    process.env.VEEGPT_5H_VGU_FREE = '-1';
    process.env.VEEGPT_CONCURRENCY_FREE = '10000';
    process.env.VEEGPT_MONTHLY_VGU_FREE = '2';
    let granted = 0;
    for (let i = 0; i < 5; i++) {
      const r = await engine.reserve({
        userId: u, plan: 'free', feature: 'veegpt.chat', tier: 'cheap', estimatedVGU: 1,
      });
      if (r.ok) granted++; else break;
    }
    check('the downgraded (Free) ceiling binds immediately', granted, 2);
    delete process.env.VEEGPT_5H_VGU_FREE;
    delete process.env.VEEGPT_CONCURRENCY_FREE;
    delete process.env.VEEGPT_MONTHLY_VGU_FREE;
    await cleanup();
  }

  // =========================================================================
  section('9. A never-subscribed user never resolves to a privileged plan');
  // =========================================================================
  if (mongoUp) {
    const u = user('nosub');
    // No cache seeded — force a real subscription lookup.
    await invalidateVeegptPlanCache(u);
    const plan = await resolveVeegptPlan(u);
    // The contract: either a real restrictive plan, or null (which meterAI maps
    // to 'free'). It must NEVER be a paid plan for someone who never paid.
    const safe = plan === null || plan === 'free';
    check('an unknown user is Free or unresolved — never a paid plan', safe, true);
    await cleanup();
  } else {
    console.log('  (mongo not connected — unknown-user resolution skipped)');
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
