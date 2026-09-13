/**
 * BLOCK 8 VERIFICATION — Deep Research and Autopilot governance (spec §22, §23).
 *
 * The gap this closes: both features had their ceilings DECLARED in the registry
 * and applied to nothing. Deep research ran inside the chat turn's reservation, so
 * the chat turn's 120 VGU cap governed a job whose own limit is 250, its monthly
 * allowance was never checked, and "max 1 concurrent research job" was not
 * enforced at all. Autopilot looped with no budget of its own whatsoever.
 *
 * Proven here:
 *   1. Per-feature concurrency is enforced, independently of the plan limit.
 *   2. A NESTED reservation does not deadlock against its parent's slot.
 *   3. Deep research is capped per job at its OWN ceiling, not the caller's.
 *   4. Its monthly allowance is enforced and is plan-specific.
 *   5. Its provider-call ceiling, timeout and retry limit apply.
 *   6. Autopilot has the same protections, and stops SAFELY with the spec's
 *      message rather than failing the mission.
 *   7. A refused sub-operation does not consume its parent's budget.
 *   8. Both features report their own used/allowance line for the usage panel.
 *   9. The pre-flight estimate is a range, honest about the hard ceiling.
 *
 * Run: npx tsx server/scripts/verify-vgu-governance.ts
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { getRedisClient } from '../lib/redis';
import { connectionManager } from '../infrastructure/mongodb-connection';
import {
  getReservationEngine,
  RESERVATION_KEYS,
} from '../services/veegpt-reservation.engine';
import { withVGU, VGUQuotaError } from '../services/veegpt-metering';
import { recordAIUsage, ProviderCallBudgetError } from '../services/aiUsageTracker';
import {
  AUTOPILOT_FEATURE,
  DEEP_RESEARCH_FEATURE,
  featureMonthlyCap,
  featureProviderCallLimit,
  featureSpec,
  policyForPlan,
  UNLIMITED,
} from '../config/veegpt-vgu.config';
import { estimateVGURange } from '../services/veegpt-vgu';
import { resolveBillingPeriod } from '../services/veegpt-billing-period';
import { AUTOPILOT_CAPACITY_MESSAGE } from '../features/autopilot/workers/autopilotLoopWorker';

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

const RUN = `__gov_probe_${Date.now()}`;
const users: string[] = [];
function user(tag: string): string {
  const u = `${RUN}_${tag}`;
  users.push(u);
  return u;
}

/** One anchor turn = $0.00108 = ~1 VGU (floored to 1 when alone). */
function recordAnchorTurn(): void {
  recordAIUsage({
    provider: 'openai',
    model: 'gpt-4o-mini',
    callType: 'text',
    usage: { promptTokens: 4400, completionTokens: 700, totalTokens: 5100 },
  });
}

/**
 * Record a call whose provider cost is exactly `usd`, so a test can assert an
 * exact VGU figure instead of one that drifts with token arithmetic.
 * gpt-4o-mini output is $0.60 per 1M tokens.
 */
function recordCostUSD(usd: number): void {
  recordAIUsage({
    provider: 'openai',
    model: 'gpt-4o-mini',
    callType: 'text',
    usage: {
      promptTokens: 0,
      completionTokens: Math.round((usd / 0.6) * 1_000_000),
      totalTokens: Math.round((usd / 0.6) * 1_000_000),
    },
  });
}

/** A deliberately huge call, for driving a job to its per-job ceiling. */
function recordHugeTurn(): void {
  recordAIUsage({
    provider: 'openai',
    model: 'gpt-4o',
    callType: 'text',
    usage: { promptTokens: 100_000, completionTokens: 20_000, totalTokens: 120_000 },
  });
}

async function seedPlan(userId: string, plan: string): Promise<void> {
  await getRedisClient().set(`veegpt:rl:plan:${userId}`, plan, 'EX', 900).catch(() => {});
}

async function usedVGU(userId: string, plan = 'pro'): Promise<number> {
  const s = await getReservationEngine().usageSnapshot(userId, plan as never);
  return Math.round(s.period.used * 100) / 100;
}

async function featureUsed(userId: string, feature: string, plan = 'pro'): Promise<number> {
  const s = await getReservationEngine().usageSnapshot(userId, plan as never);
  return s.features.find(f => f.feature === feature)?.usedVGU ?? 0;
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
        RESERVATION_KEYS.featureConcurrency(u, DEEP_RESEARCH_FEATURE),
        RESERVATION_KEYS.featureConcurrency(u, AUTOPILOT_FEATURE),
        RESERVATION_KEYS.featureConcurrency(u, 'trend.intelligence'),
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
  console.log('DEEP RESEARCH / AUTOPILOT GOVERNANCE (Block 8)\n' + '='.repeat(70));
  await connectionManager.connect().catch(() => {});
  console.log(
    `mongo=${mongoose.connection.readyState === 1 ? mongoose.connection.name : 'not connected'}`
  );
  await cleanup();
  const engine = getReservationEngine();

  // =========================================================================
  section('1. Both features declare every ceiling the spec requires');
  // =========================================================================
  for (const [name, feature] of [
    ['Deep Research (§22)', DEEP_RESEARCH_FEATURE],
    ['Autopilot (§23)', AUTOPILOT_FEATURE],
  ] as const) {
    const spec = featureSpec(feature);
    check(`${name}: maximum VGU per job`, spec.maxVGUPerRequest > 0, true);
    check(`${name}: monthly feature allowance`, !!spec.monthlyCapByPlan, true);
    check(`${name}: concurrency limit`, (spec.concurrency ?? 0) > 0, true);
    check(`${name}: maximum provider calls`, (spec.maxProviderCalls ?? 0) > 0, true);
    check(`${name}: timeout`, (spec.timeoutMs ?? 0) > 0, true);
    check(`${name}: retry limit`, (spec.maxRetries ?? -1) >= 0, true);
  }
  check(
    'the allowance is plan-specific, not one global number',
    featureMonthlyCap(DEEP_RESEARCH_FEATURE, 'pro') <
      featureMonthlyCap(DEEP_RESEARCH_FEATURE, 'business'),
    true
  );
  check(
    'and Enterprise is uncapped',
    featureMonthlyCap(DEEP_RESEARCH_FEATURE, 'enterprise'),
    UNLIMITED
  );

  // =========================================================================
  section('2. Per-feature concurrency is enforced (§22: max concurrent jobs)');
  // =========================================================================
  {
    const u = user('conc');
    await seedPlan(u, 'pro');
    const limit = featureSpec(DEEP_RESEARCH_FEATURE).concurrency as number;
    const planLimit = policyForPlan('pro').maxConcurrentAI;
    check('deep research allows fewer at once than the plan does', limit < planLimit, true);

    // Five simultaneous research jobs, all cheap enough that no budget binds — so
    // the feature limit is provably the only thing refusing them.
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        engine.reserve({
          userId: u,
          plan: 'pro',
          feature: DEEP_RESEARCH_FEATURE,
          tier: 'cheap',
          estimatedVGU: 1,
        })
      )
    );
    const granted = results.filter(r => r.ok);
    check(`only ${limit} research job runs at a time`, granted.length, limit);
    check(
      'refusals name the FEATURE limit, not the plan limit',
      results.filter(r => !r.ok).every(r => !r.ok && r.code === 'FEATURE_CONCURRENCY_LIMIT'),
      true
    );

    // A DIFFERENT feature is unaffected: the point is per-feature, not global.
    const otherFeature = await engine.reserve({
      userId: u,
      plan: 'pro',
      feature: 'veegpt.chat',
      tier: 'cheap',
      estimatedVGU: 1,
    });
    check('a chat turn can still start alongside it', otherFeature.ok, true);

    // Finishing the job frees the feature slot.
    const first = granted[0];
    if (first.ok) {
      await engine.commit(first.reservationId, 1, {
        userId: u,
        plan: 'pro',
        tier: 'cheap',
        feature: DEEP_RESEARCH_FEATURE,
        billingPeriodId: first.billingPeriodId,
      });
    }
    const next = await engine.reserve({
      userId: u,
      plan: 'pro',
      feature: DEEP_RESEARCH_FEATURE,
      tier: 'cheap',
      estimatedVGU: 1,
    });
    check('and the next research job may then start', next.ok, true);
    await cleanup();
  }

  // =========================================================================
  section('3. A NESTED reservation does not deadlock against its parent');
  // =========================================================================
  {
    // This is why `nested` exists. Free allows ONE concurrent AI operation. A chat
    // turn holds it, so a deep-research sub-operation inside that turn would be
    // refused by the plan limit — the feature could never run at all on Free.
    const u = user('nested');
    await seedPlan(u, 'free');
    check('Free allows exactly one concurrent operation', policyForPlan('free').maxConcurrentAI, 1);

    let innerRan = false;
    let innerReservationId = '';
    const { usage, result: parentResult } = await withVGU(
      { userId: u, plan: 'free', feature: 'veegpt.chat', model: 'openai-gpt-4o-mini' },
      async () => {
        recordAnchorTurn();
        const inner = await withVGU(
          {
            userId: u,
            plan: 'free',
            feature: 'trend.intelligence',
            model: 'openai-gpt-4o-mini',
            nested: true,
          },
          async () => {
            innerRan = true;
            recordAnchorTurn();
            return 'inner';
          }
        );
        innerReservationId = inner.usage.reservationId;
        return inner.usage.reservationId;
      }
    );
    check('the nested operation ran', innerRan, true);
    check('the parent reconciled', usage.status, 'RECONCILED');
    check(
      'and the sub-operation got its OWN reservation, not the parent\u2019s',
      innerReservationId !== usage.reservationId && innerReservationId.startsWith('r_'),
      true
    );
    check('the parent saw the sub-operation\u2019s result', parentResult, innerReservationId);
    check('no slot is left held', await getRedisClient().zcard(RESERVATION_KEYS.concurrency(u)), 0);

    // WITHOUT nested, the same sub-operation is refused — proving the flag is what
    // makes it work rather than something incidental.
    let refusedCode = '';
    await withVGU(
      { userId: u, plan: 'free', feature: 'veegpt.chat', model: 'openai-gpt-4o-mini' },
      async () => {
        try {
          await withVGU(
            {
              userId: u,
              plan: 'free',
              feature: 'trend.intelligence',
              model: 'openai-gpt-4o-mini',
              // nested omitted on purpose
            },
            async () => 'never'
          );
        } catch (err) {
          refusedCode = (err as VGUQuotaError).code;
        }
        return 1;
      }
    );
    check(
      'a non-nested sub-operation IS refused by the plan slot',
      refusedCode,
      'CONCURRENCY_LIMIT'
    );
    await cleanup();
  }

  // =========================================================================
  section('4. Deep research is capped at its OWN per-job ceiling (§22)');
  // =========================================================================
  {
    const u = user('cap');
    await seedPlan(u, 'business');
    const chatCap = featureSpec('veegpt.chat').maxVGUPerRequest;
    const drCap = featureSpec(DEEP_RESEARCH_FEATURE).maxVGUPerRequest;
    check('the research ceiling is HIGHER than the chat turn it runs inside', drCap > chatCap, true);

    process.env.VEEGPT_MONTHLY_VGU_BUSINESS = '-1';
    process.env.VEEGPT_5H_VGU_BUSINESS = '-1';
    process.env.VEEGPT_FEATURE_CALLS_VEEGPT_DEEP_RESEARCH = '-1';
    const { usage } = await withVGU(
      {
        userId: u,
        plan: 'business',
        feature: DEEP_RESEARCH_FEATURE,
        model: 'openai-gpt4o',
        nested: true,
      },
      async () => {
        for (let i = 0; i < 40; i++) recordHugeTurn();
        return 1;
      }
    );
    check('a runaway research job is clipped at its own ceiling', usage.actualVGU, drCap);
    check('and flagged as capped', usage.capped, true);
    check(
      'the uncapped provider cost was far higher',
      usage.providerCostUSD > drCap * 0.0011,
      true
    );
    console.log(
      `      → $${usage.providerCostUSD.toFixed(2)} of provider cost held at ${drCap} VGU`
    );
    delete process.env.VEEGPT_FEATURE_CALLS_VEEGPT_DEEP_RESEARCH;
    delete process.env.VEEGPT_MONTHLY_VGU_BUSINESS;
    delete process.env.VEEGPT_5H_VGU_BUSINESS;
    await cleanup();
  }

  // =========================================================================
  section('5. The monthly Deep Research allowance is enforced');
  // =========================================================================
  {
    const u = user('allow');
    await seedPlan(u, 'pro');
    // A small allowance so the probe does not have to burn 2,000 VGU.
    process.env.VEEGPT_FEATURE_CAP_VEEGPT_DEEP_RESEARCH_PRO = '5';
    process.env.VEEGPT_5H_VGU_PRO = '-1';
    process.env.VEEGPT_MONTHLY_VGU_PRO = '-1';

    let granted = 0;
    let code = '';
    for (let i = 0; i < 8; i++) {
      const r = await engine.reserve({
        userId: u,
        plan: 'pro',
        feature: DEEP_RESEARCH_FEATURE,
        tier: 'cheap',
        estimatedVGU: 2,
        nested: true,
      });
      if (r.ok) {
        granted++;
        await engine.commit(r.reservationId, 2, {
          userId: u,
          plan: 'pro',
          tier: 'cheap',
          feature: DEEP_RESEARCH_FEATURE,
          billingPeriodId: r.billingPeriodId,
        });
      } else {
        code = r.code;
        break;
      }
    }
    check('research stops once the allowance is spent', granted, 2);
    check('and names the feature allowance', code, 'FEATURE_QUOTA_EXHAUSTED');
    check(
      'the feature counter reflects only research usage',
      await featureUsed(u, DEEP_RESEARCH_FEATURE),
      4
    );

    // The plan's OWN budget is untouched by the feature cap — a user refused
    // research can still chat.
    const chat = await engine.reserve({
      userId: u,
      plan: 'pro',
      feature: 'veegpt.chat',
      tier: 'cheap',
      estimatedVGU: 1,
    });
    check('a user out of research allowance can still use chat', chat.ok, true);

    delete process.env.VEEGPT_FEATURE_CAP_VEEGPT_DEEP_RESEARCH_PRO;
    delete process.env.VEEGPT_5H_VGU_PRO;
    delete process.env.VEEGPT_MONTHLY_VGU_PRO;
    await cleanup();
  }

  // =========================================================================
  section('6. Provider-call ceiling, timeout and retries apply to research');
  // =========================================================================
  {
    const u = user('bounds');
    await seedPlan(u, 'pro');
    check(
      'the research call ceiling is its own, not the chat turn\u2019s',
      featureProviderCallLimit(DEEP_RESEARCH_FEATURE),
      25
    );

    let calls = 0;
    let thrown: unknown;
    try {
      await withVGU(
        {
          userId: u,
          plan: 'pro',
          feature: DEEP_RESEARCH_FEATURE,
          model: 'openai-gpt-4o-mini',
          nested: true,
        },
        async () => {
          for (let i = 0; i < 200; i++) {
            recordAnchorTurn();
            calls++;
          }
        }
      );
    } catch (err) {
      thrown = err;
    }
    check('a research fan-out is halted', thrown instanceof ProviderCallBudgetError, true);
    check('after its own ceiling, not 200 calls', calls, 25);

    // Wall-clock budget.
    process.env.VEEGPT_FEATURE_TIMEOUT_VEEGPT_DEEP_RESEARCH = '400';
    let timedOut = false;
    try {
      await withVGU(
        {
          userId: u,
          plan: 'pro',
          feature: DEEP_RESEARCH_FEATURE,
          model: 'openai-gpt-4o-mini',
          nested: true,
        },
        () => new Promise(() => { /* never settles: only the budget can end it */ })
      );
    } catch (err) {
      timedOut = (err as { code?: string })?.code === 'AI_TIMEOUT';
    }
    check('a hanging research job is stopped by its wall-clock budget', timedOut, true);
    delete process.env.VEEGPT_FEATURE_TIMEOUT_VEEGPT_DEEP_RESEARCH;
    check(
      'and its retry limit is the tightest of the expensive features',
      featureSpec(DEEP_RESEARCH_FEATURE).maxRetries,
      1
    );
    await cleanup();
  }

  // =========================================================================
  section('7. A refused sub-operation does not consume its parent\u2019s budget');
  // =========================================================================
  {
    const u = user('isolate');
    await seedPlan(u, 'pro');
    process.env.VEEGPT_FEATURE_CAP_VEEGPT_DEEP_RESEARCH_PRO = '0';

    let parentCompleted = false;
    let innerRefused = '';
    const before = await usedVGU(u);
    const { usage } = await withVGU(
      { userId: u, plan: 'pro', feature: 'veegpt.chat', model: 'openai-gpt-4o-mini' },
      async () => {
        try {
          await withVGU(
            {
              userId: u,
              plan: 'pro',
              feature: DEEP_RESEARCH_FEATURE,
              model: 'openai-gpt-4o-mini',
              nested: true,
            },
            async () => {
              recordHugeTurn();
              return 'should not run';
            }
          );
        } catch (err) {
          innerRefused = (err as VGUQuotaError).code;
        }
        // The chat turn continues and answers normally.
        recordAnchorTurn();
        parentCompleted = true;
        return 'answered';
      }
    );
    check('the research sub-operation was refused', innerRefused, 'FEATURE_QUOTA_EXHAUSTED');
    check('the chat turn still completed', parentCompleted, true);
    check('and reconciled normally', usage.status, 'RECONCILED');
    check('charging only the chat turn', (await usedVGU(u)) - before, 1);
    check(
      'no research usage was recorded, because none happened',
      await featureUsed(u, DEEP_RESEARCH_FEATURE),
      0
    );
    delete process.env.VEEGPT_FEATURE_CAP_VEEGPT_DEEP_RESEARCH_PRO;
    await cleanup();
  }

  // =========================================================================
  section('8. Autopilot is bounded and stops SAFELY (§23)');
  // =========================================================================
  {
    const u = user('autopilot');
    await seedPlan(u, 'pro');
    check(
      'the stop message is the spec\u2019s sentence, verbatim',
      AUTOPILOT_CAPACITY_MESSAGE,
      'Autopilot reached its AI capacity for this task.'
    );
    check(
      'only one iteration runs at a time',
      featureSpec(AUTOPILOT_FEATURE).concurrency,
      1
    );

    // The allowance stops the loop rather than letting it run forever.
    // An allowance of exactly 3 iterations' worth. Each iteration is made to cost
    // precisely its 20 VGU estimate, so the stopping point is arithmetic rather
    // than approximate: 20 + 20 + 20 = 60, and the 4th cannot fit.
    const perIteration = 20;
    process.env.VEEGPT_FEATURE_CAP_VEEGPT_AUTOPILOT_PRO = String(perIteration * 3);
    process.env.VEEGPT_5H_VGU_PRO = '-1';
    process.env.VEEGPT_MONTHLY_VGU_PRO = '-1';
    let iterations = 0;
    let stopped = '';
    for (let tick = 0; tick < 10; tick++) {
      try {
        await withVGU(
          {
            userId: u,
            plan: 'pro',
            feature: AUTOPILOT_FEATURE,
            model: 'openai-gpt-4o-mini',
            nested: true,
          },
          async () => {
            recordCostUSD(perIteration * 0.0011);
            iterations++;
            return 1;
          }
        );
      } catch (err) {
        stopped = (err as VGUQuotaError).code;
        break;
      }
    }
    check('the agent loop ran only while it had allowance', iterations, 3);
    check('then stopped on its own allowance', stopped, 'FEATURE_QUOTA_EXHAUSTED');
    check('it did NOT run ten times', iterations < 10, true);

    // A per-job ceiling bounds one runaway iteration too.
    delete process.env.VEEGPT_FEATURE_CAP_VEEGPT_AUTOPILOT_PRO;
    process.env.VEEGPT_FEATURE_CALLS_VEEGPT_AUTOPILOT = '-1';
    const apCap = featureSpec(AUTOPILOT_FEATURE).maxVGUPerRequest;
    const { usage } = await withVGU(
      {
        userId: u,
        plan: 'pro',
        feature: AUTOPILOT_FEATURE,
        model: 'openai-gpt4o',
        nested: true,
      },
      async () => {
        for (let i = 0; i < 60; i++) recordHugeTurn();
        return 1;
      }
    );
    check('one runaway iteration is clipped at the per-job ceiling', usage.actualVGU, apCap);
    check('and flagged as capped', usage.capped, true);
    delete process.env.VEEGPT_FEATURE_CALLS_VEEGPT_AUTOPILOT;
    delete process.env.VEEGPT_5H_VGU_PRO;
    delete process.env.VEEGPT_MONTHLY_VGU_PRO;
    await cleanup();
  }

  // =========================================================================
  section('9. Both report their own used/allowance line (§1105)');
  // =========================================================================
  {
    const u = user('panel');
    await seedPlan(u, 'pro');
    await withVGU(
      {
        userId: u,
        plan: 'pro',
        feature: DEEP_RESEARCH_FEATURE,
        model: 'openai-gpt-4o-mini',
        nested: true,
      },
      async () => {
        recordAnchorTurn();
        return 1;
      }
    );
    const snap = await engine.usageSnapshot(u, 'pro');
    const dr = snap.features.find(f => f.feature === DEEP_RESEARCH_FEATURE);
    const ap = snap.features.find(f => f.feature === AUTOPILOT_FEATURE);
    check('Deep Research has its own line', !!dr, true);
    check('Autopilot has its own line', !!ap, true);
    check('with a readable label', dr?.label, 'Deep research');
    check('showing what was used', dr?.usedVGU, 1);
    check('and the allowance', dr?.maxVGU, featureMonthlyCap(DEEP_RESEARCH_FEATURE, 'pro'));
    check(
      'and what remains',
      dr?.remainingVGU,
      featureMonthlyCap(DEEP_RESEARCH_FEATURE, 'pro') - 1
    );
    check('and the per-job ceiling', dr?.maxVGUPerJob, 1000);
    check('and how many may run at once', dr?.concurrencyLimit, 1);
    check(
      'Autopilot usage is tracked separately and is still zero',
      ap?.usedVGU,
      0
    );
    await cleanup();
  }

  // =========================================================================
  section('10. The pre-flight estimate is an honest RANGE (§22)');
  // =========================================================================
  {
    const range = estimateVGURange({
      feature: DEEP_RESEARCH_FEATURE,
      model: 'openai-gpt-4o-mini',
    });
    check('the low end is the base estimate', range.low, 40);
    check('the high end is higher', range.high > range.low, true);
    check('and never exceeds the hard per-job ceiling', range.high <= range.ceiling, true);
    check('the ceiling is reported so the client can warn', range.ceiling, 1000);
    console.log(`      → "Estimated VeeGPT usage: ~${range.low}–${range.high} VGU"`);

    // A more expensive model raises the estimate rather than hiding it.
    const premium = estimateVGURange({
      feature: DEEP_RESEARCH_FEATURE,
      model: 'openai-gpt4o',
    });
    check('a premium model estimates higher', premium.low > range.low, true);
    check('but is still bounded by the same ceiling', premium.high <= premium.ceiling, true);
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
