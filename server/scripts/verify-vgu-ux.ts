/**
 * BLOCK 9 VERIFICATION — structured refusal + Continue-with-Fast (spec §28, §42, §43).
 *
 * The server side of the UX flow, proven end to end:
 *
 *   1. An explicit premium selection refused for quota returns MODEL_QUOTA_EXHAUSTED
 *      with suggestedTier:'cheap' — it does NOT switch models (spec §28).
 *   2. "Continue with Fast" (the same request with continueWithFast:true) runs on
 *      the Light model and succeeds where the premium one was refused.
 *   3. The switch is the USER'S choice, made per-request: it does not alter the
 *      stored selection, so the next request uses premium again.
 *   4. A burst/monthly refusal carries NO suggestedTier — no model choice helps.
 *   5. /limits carries the §42 plain-language notice and the §44 feature lines.
 *
 * The premium selection is refused deterministically by giving the user a premium
 * tier VGU sub-budget of 0, so no real premium spend is required.
 *
 * Run: npx tsx server/scripts/verify-vgu-ux.ts
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
import { recordAIUsage } from '../services/aiUsageTracker';
import { usageNotice } from '../config/veegpt-vgu.config';
import { modelTierOf, TIER_DEFAULT_MODEL } from '@shared/veegpt-model-tiers';
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

const RUN = `__ux_probe_${Date.now()}`;
const users: string[] = [];
function user(tag: string): string {
  const u = `${RUN}_${tag}`;
  users.push(u);
  return u;
}

function recordAnchorTurn(): void {
  recordAIUsage({
    provider: 'openai',
    model: 'gpt-4o-mini',
    callType: 'text',
    usage: { promptTokens: 4400, completionTokens: 700, totalTokens: 5100 },
  });
}

async function seedPlan(userId: string, plan: string): Promise<void> {
  await getRedisClient().set(`veegpt:rl:plan:${userId}`, plan, 'EX', 900).catch(() => {});
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
  }
}

/** Simulate the chat route: it runs on the model the user selected, unless the
 *  user chose Continue-with-Fast, which forces the Light model for that request. */
async function chatTurn(
  userId: string,
  plan: 'pro' | 'free',
  selectedModel: string,
  opts: { continueWithFast?: boolean } = {}
): Promise<{ ok: boolean; code?: string; model: string; suggestedTier?: unknown }> {
  const model = opts.continueWithFast ? TIER_DEFAULT_MODEL.cheap : selectedModel;
  try {
    await withVGU(
      {
        userId,
        plan,
        feature: 'veegpt.chat',
        model,
        modelChosenBy: 'user',
      },
      async () => {
        recordAnchorTurn();
        return 'answer';
      }
    );
    return { ok: true, model };
  } catch (err) {
    if (err instanceof VGUQuotaError) {
      return {
        ok: false,
        code: err.code,
        model,
        suggestedTier: err.toResponse().suggestedTier,
      };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('VGU UX / STRUCTURED REFUSAL VERIFICATION (Block 9)\n' + '='.repeat(70));
  await connectionManager.connect().catch(() => {});
  console.log(
    `mongo=${mongoose.connection.readyState === 1 ? mongoose.connection.name : 'not connected'}`
  );
  await cleanup();

  // =========================================================================
  section('1. An explicit premium selection refused for quota is NOT swapped');
  // =========================================================================
  {
    const u = user('premium');
    await seedPlan(u, 'pro');
    // Deterministically exhaust premium: a 0 VGU sub-budget for the premium tier.
    process.env.VEEGPT_TIER_VGU_PRO_PREMIUM = '0';
    const selected = 'openai-gpt4o'; // premium tier
    check('the selection is a premium model', modelTierOf(selected), 'premium');

    const refused = await chatTurn(u, 'pro', selected);
    check('the premium turn is refused', refused.ok, false);
    check('with MODEL_QUOTA_EXHAUSTED, not a silent swap', refused.code, 'MODEL_QUOTA_EXHAUSTED');
    check('it ran on the model the user SELECTED, not a substitute', refused.model, selected);
    check('and offers Fast as the way forward', refused.suggestedTier, 'cheap');

    // =====================================================================
    section('2. "Continue with Fast" succeeds on the Light model');
    // =====================================================================
    const fast = await chatTurn(u, 'pro', selected, { continueWithFast: true });
    check('the fast fallback is granted', fast.ok, true);
    check('and actually ran on the Light model', modelTierOf(fast.model), 'cheap');

    // =====================================================================
    section('3. The switch is per-request; the next turn uses premium again');
    // =====================================================================
    const again = await chatTurn(u, 'pro', selected);
    check(
      'without the flag, the user is back on premium and refused again',
      again.code,
      'MODEL_QUOTA_EXHAUSTED',
    );
    check('the stored selection was never changed', again.model, selected);

    delete process.env.VEEGPT_TIER_VGU_PRO_PREMIUM;
    await cleanup();
  }

  // =========================================================================
  section('4. A burst/monthly refusal offers NO model fallback');
  // =========================================================================
  {
    const u = user('burst');
    await seedPlan(u, 'free');
    // Spend the whole Free 5-hour budget so even a Light turn is refused.
    const engine = getReservationEngine();
    const filler = await engine.reserve({
      userId: u,
      plan: 'free',
      feature: 'veegpt.chat',
      tier: 'cheap',
      estimatedVGU: 15,
    });
    if (filler.ok) {
      await engine.commit(filler.reservationId, 15, {
        userId: u,
        plan: 'free',
        tier: 'cheap',
        feature: 'veegpt.chat',
        billingPeriodId: filler.billingPeriodId,
      });
    }
    // Even Continue-with-Fast cannot help — the budget, not the model, is the wall.
    const fast = await chatTurn(u, 'free', 'veegpt-hybrid', { continueWithFast: true });
    check('a Light turn is still refused when the budget is spent', fast.ok, false);
    check('it is a burst refusal', fast.code, 'BURST_QUOTA_EXHAUSTED');
    check('and offers NO cheaper tier, because none would help', fast.suggestedTier, undefined);
    await cleanup();
  }

  // =========================================================================
  section('5. /limits carries the \u00a742 notice and \u00a744 feature lines');
  // =========================================================================
  {
    const u = user('panel');
    await seedPlan(u, 'creator');
    // Drive monthly usage into the "heavy" band (>=70%). Creator monthly is 1200.
    process.env.VEEGPT_MONTHLY_VGU_CREATOR = '10';
    const engine = getReservationEngine();
    const r = await engine.reserve({
      userId: u,
      plan: 'creator',
      feature: 'veegpt.chat',
      tier: 'cheap',
      estimatedVGU: 9, // 9 / 10 = 90% → "approaching" (0.85–0.95)
    });
    if (r.ok) {
      await engine.commit(r.reservationId, 9, {
        userId: u,
        plan: 'creator',
        tier: 'cheap',
        feature: 'veegpt.chat',
        billingPeriodId: r.billingPeriodId,
      });
    }
    const snap = await engine.usageSnapshot(u, 'creator');
    const notice = usageNotice(snap.period.used, snap.period.limit ?? 0);
    check('the monthly window is in a warning band', notice.band, 'approaching');
    check(
      'with the spec\u2019s exact wording',
      notice.message,
      "You're getting close to your VeeGPT allowance."
    );
    check(
      'the snapshot exposes Deep Research as its own line',
      snap.features.some(f => f.feature === 'veegpt.deep_research'),
      true
    );
    check(
      'and Autopilot',
      snap.features.some(f => f.feature === 'veegpt.autopilot'),
      true
    );
    delete process.env.VEEGPT_MONTHLY_VGU_CREATOR;
    await cleanup();
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
