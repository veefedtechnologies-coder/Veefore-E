/**
 * Block 3 verification — reconciliation against measured provider usage.
 *
 * Runs the real withVGU lifecycle against real Redis, with a fake "provider" that
 * reports controlled token counts via recordAIUsage. That is the only honest way
 * to prove the estimate → reserve → execute → measure → reconcile loop, including
 * the failure paths where accounting bugs hide.
 *
 * Run: npx tsx server/scripts/verify-vgu-reconciliation.ts
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { getRedisClient } from '../lib/redis';
import { RESERVATION_KEYS as K } from '../services/veegpt-reservation.engine';
import { calendarPeriod } from '../services/veegpt-billing-period';
import { withVGU, VGUQuotaError } from '../services/veegpt-metering';
import {
  recordAIUsage,
  recordExternalCostUSD,
} from '../services/aiUsageTracker';
import { featureSpec, VGU_ANCHOR_USD } from '../config/veegpt-vgu.config';

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
function checkTrue(label: string, cond: boolean) {
  check(label, cond, true);
}
function checkNear(label: string, actual: number, expected: number, tol: number) {
  const ok = Math.abs(actual - expected) <= tol;
  ok ? pass++ : fail++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? ` (${actual.toFixed(2)})` : `  → got ${actual}, want ${expected}±${tol}`}`
  );
}

let seq = 0;
const newUser = () => `__vgu_rec_${Date.now()}_${seq++}`;

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
async function cleanup(userId: string) {
  await redis
    .del(
      K.window(userId),
      K.amounts(userId),
      K.period(userId, period.id),
      K.concurrency(userId),
      `vgu:period:${userId}`
    )
    .catch(() => {});
}
async function usedPeriod(userId: string): Promise<number> {
  return Number(await redis.hget(K.period(userId, period.id), 'total')) || 0;
}

/** Simulate one provider call reporting real token usage. */
function fakeProviderCall(
  model: string,
  promptTokens: number,
  completionTokens: number,
  extra: { cachedTokens?: number; reasoningTokens?: number } = {}
) {
  recordAIUsage({
    provider: 'openai',
    model,
    callType: 'text',
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      cachedTokens: extra.cachedTokens ?? 0,
      reasoningTokens: extra.reasoningTokens ?? 0,
    },
  });
}

(async () => {
  // Isolate the VGU arithmetic from the concurrency gate throughout.
  process.env.VEEGPT_CONCURRENCY_PRO = '-1';
  process.env.VEEGPT_CONCURRENCY_FREE = '-1';

  // ── 1. Over-estimate is refunded down to measured usage ────────────────────
  {
    const userId = newUser();
    await pinPeriod(userId);
    // Reserve as premium (estimate 12) but actually consume a tiny amount.
    const { usage } = await withVGU(
      { userId, plan: 'pro', feature: 'veegpt.chat', model: 'openai-gpt4o' },
      async () => {
        fakeProviderCall('gpt-4o', 500, 100);
        return 'ok';
      }
    );
    check('estimate was the premium tier multiplier', usage.estimatedVGU, 12);
    checkTrue('actual is far below the estimate', usage.actualVGU < 5);
    // Tolerance, not equality: the counter is a Redis HINCRBYFLOAT accumulator,
    // so reserve-then-adjust leaves ~1e-15 of IEEE drift. Quota decisions compare
    // against integer caps, where drift of that size cannot change the outcome.
    checkNear('period holds the ACTUAL, not the estimate',
      await usedPeriod(userId), usage.actualVGU, 1e-6);
    check('status reconciled', usage.status, 'RECONCILED');
    check('provider calls counted', usage.providerCalls, 1);
    await cleanup(userId);
  }

  // ── 2. Under-estimate is topped up from measured usage ─────────────────────
  {
    const userId = newUser();
    await pinPeriod(userId);
    const { usage } = await withVGU(
      { userId, plan: 'pro', feature: 'veegpt.chat', model: 'veegpt-hybrid' },
      async () => {
        // A cheap model on a huge context genuinely costs more than 1 VGU.
        fakeProviderCall('gemini-flash-lite-latest', 400_000, 30_000);
        return 'ok';
      }
    );
    check('cheap-tier estimate was 1', usage.estimatedVGU, 1);
    checkTrue('actual exceeds the estimate', usage.actualVGU > usage.estimatedVGU);
    checkNear('period reflects the real cost',
      await usedPeriod(userId), usage.actualVGU, 1e-6);
    await cleanup(userId);
  }

  // ── 3. The SAME model costs different VGU for different request sizes ──────
  {
    const small = newUser();
    const large = newUser();
    await pinPeriod(small);
    await pinPeriod(large);
    const a = await withVGU(
      { userId: small, plan: 'pro', feature: 'veegpt.chat', model: 'openai-gpt-4o-mini' },
      async () => { fakeProviderCall('gpt-4o-mini', 1_000, 200); return 1; }
    );
    const b = await withVGU(
      { userId: large, plan: 'pro', feature: 'veegpt.chat', model: 'openai-gpt-4o-mini' },
      async () => { fakeProviderCall('gpt-4o-mini', 100_000, 8_000); return 1; }
    );
    checkTrue('a bigger request on the same model costs more VGU',
      b.usage.actualVGU > a.usage.actualVGU);
    console.log(`      → small=${a.usage.actualVGU} VGU, large=${b.usage.actualVGU} VGU`);
    await cleanup(small);
    await cleanup(large);
  }

  // ── 4. A premium turn reconciles ABOVE its 12× estimate (the real ratio) ───
  {
    const userId = newUser();
    await pinPeriod(userId);
    const { usage } = await withVGU(
      { userId, plan: 'pro', feature: 'veegpt.chat', model: 'openai-gpt4o' },
      async () => { fakeProviderCall('gpt-4o', 4_400, 700); return 1; }
    );
    checkNear('reference premium turn ≈ 16 VGU, not the 12 estimate',
      usage.actualVGU, 16.4, 1.5);
    checkTrue('so a flat 12× would have undercharged', usage.actualVGU > 12);
    await cleanup(userId);
  }

  // ── 5. Cached tokens reduce the charge ─────────────────────────────────────
  {
    const cold = newUser();
    const warm = newUser();
    await pinPeriod(cold);
    await pinPeriod(warm);
    const a = await withVGU(
      { userId: cold, plan: 'pro', feature: 'veegpt.chat', model: 'openai-gpt-4o-mini' },
      async () => { fakeProviderCall('gpt-4o-mini', 100_000, 500); return 1; }
    );
    const b = await withVGU(
      { userId: warm, plan: 'pro', feature: 'veegpt.chat', model: 'openai-gpt-4o-mini' },
      async () => {
        fakeProviderCall('gpt-4o-mini', 100_000, 500, { cachedTokens: 90_000 });
        return 1;
      }
    );
    checkTrue('a prompt-cache hit costs less', b.usage.actualVGU < a.usage.actualVGU);
    check('cached tokens are recorded', b.usage.tokens.cachedTokens, 90_000);
    await cleanup(cold);
    await cleanup(warm);
  }

  // ── 6. Reasoning tokens are recorded but NOT double-charged ────────────────
  {
    const plain = newUser();
    const think = newUser();
    await pinPeriod(plain);
    await pinPeriod(think);
    const a = await withVGU(
      { userId: plain, plan: 'pro', feature: 'veegpt.chat', model: 'openai-gpt-5' },
      async () => { fakeProviderCall('gpt-5', 5_000, 4_500); return 1; }
    );
    const b = await withVGU(
      { userId: think, plan: 'pro', feature: 'veegpt.chat', model: 'openai-gpt-5' },
      async () => {
        // Same completion count, but 4,000 of it was reasoning.
        fakeProviderCall('gpt-5', 5_000, 4_500, { reasoningTokens: 4_000 });
        return 1;
      }
    );
    check('reasoning tokens surfaced in the ledger', b.usage.tokens.reasoningTokens, 4_000);
    check('and do not change the charge', b.usage.actualVGU, a.usage.actualVGU);
    await cleanup(plain);
    await cleanup(think);
  }

  // ── 7. Multi-call job aggregates every provider call ──────────────────────
  {
    const userId = newUser();
    await pinPeriod(userId);
    const { usage } = await withVGU(
      {
        userId, plan: 'pro', feature: 'veegpt.deep_research',
        model: 'openai-gpt-5-nano', tools: ['deep_research'],
      },
      async () => {
        for (let i = 0; i < 12; i++) fakeProviderCall('gpt-5-nano', 8_750, 1_500);
        // The paid search API is real money that tokens cannot see.
        recordExternalCostUSD(0.06);
        return 1;
      }
    );
    check('all 12 provider calls counted', usage.providerCalls, 12);
    check('aggregate input tokens', usage.tokens.inputTokens, 105_000);
    checkTrue('external search cost included in the charge',
      usage.providerCostUSD > 0.06);
    checkTrue('deep research costs far more than a chat turn', usage.actualVGU > 12);
    console.log(
      `      → deep research: ${usage.actualVGU} VGU, $${usage.providerCostUSD.toFixed(4)} provider cost`
    );
    await cleanup(userId);
  }

  // ── 8. A runaway job is stopped TWICE OVER ────────────────────────────────
  //
  // Two independent protections, and it matters that they are independent:
  //   • the FAN-OUT ceiling stops the provider CALLS (Block 7), and
  //   • the per-request VGU ceiling clips the CHARGE (Block 3).
  // A charge cap alone still lets a loop keep calling the provider; a call cap
  // alone still lets a few enormous calls run up a bill. Each is asserted on its
  // own here so neither can quietly stop working behind the other.
  {
    const userId = newUser();
    await pinPeriod(userId);
    process.env.VEEGPT_MONTHLY_VGU_PRO = '-1';
    process.env.VEEGPT_5H_VGU_PRO = '-1';
    const spec = featureSpec('veegpt.deep_research');
    const callCeiling = spec.maxProviderCalls ?? 0;
    const vguCeiling = spec.maxVGUPerRequest;

    // (a) The fan-out ceiling halts the loop.
    let calls = 0;
    let stoppedBy = '';
    try {
      await withVGU(
        { userId, plan: 'pro', feature: 'veegpt.deep_research', model: 'openai-gpt4o' },
        async () => {
          for (let i = 0; i < 300; i++) {
            fakeProviderCall('gpt-4o', 100_000, 20_000);
            calls++;
          }
          return 1;
        }
      );
    } catch (err) {
      stoppedBy = (err as { code?: string })?.code || 'unknown';
    }
    check('a 300-call runaway is stopped by the fan-out ceiling', stoppedBy, 'PROVIDER_CALL_BUDGET_EXCEEDED');
    check('after the permitted number of calls, not 300', calls, callCeiling);
    await cleanup(userId);

    // (b) With the fan-out ceiling lifted, the VGU ceiling still clips the charge.
    const userId2 = newUser();
    await pinPeriod(userId2);
    process.env.VEEGPT_FEATURE_CALLS_VEEGPT_DEEP_RESEARCH = '-1';
    const { usage } = await withVGU(
      { userId: userId2, plan: 'pro', feature: 'veegpt.deep_research', model: 'openai-gpt4o' },
      async () => {
        for (let i = 0; i < 300; i++) fakeProviderCall('gpt-4o', 100_000, 20_000);
        return 1;
      }
    );
    check('charge clipped at the feature ceiling', usage.actualVGU, vguCeiling);
    check('and flagged as capped', usage.capped, true);
    console.log(
      `      → uncapped provider cost was $${usage.providerCostUSD.toFixed(2)}; charge held at ${vguCeiling} VGU`
    );
    delete process.env.VEEGPT_FEATURE_CALLS_VEEGPT_DEEP_RESEARCH;
    delete process.env.VEEGPT_MONTHLY_VGU_PRO;
    delete process.env.VEEGPT_5H_VGU_PRO;
    await cleanup(userId2);
  }

  // ── 9. Failure AFTER partial usage → charge what was consumed ─────────────
  {
    const userId = newUser();
    await pinPeriod(userId);
    let threw = false;
    try {
      await withVGU(
        { userId, plan: 'pro', feature: 'veegpt.chat', model: 'openai-gpt4o' },
        async () => {
          fakeProviderCall('gpt-4o', 20_000, 3_000);
          throw new Error('provider 500 mid-stream');
        }
      );
    } catch {
      threw = true;
    }
    checkTrue('the error still propagates to the caller', threw);
    const charged = await usedPeriod(userId);
    checkTrue('tokens burned before the failure are charged', charged > 0);
    console.log(`      → charged ${charged} VGU for the partial stream`);
    await cleanup(userId);
  }

  // ── 10. Failure with NO usage → full refund (spec §35) ────────────────────
  {
    const userId = newUser();
    await pinPeriod(userId);
    try {
      await withVGU(
        { userId, plan: 'pro', feature: 'veegpt.chat', model: 'openai-gpt4o' },
        async () => {
          throw new Error('connection refused before any tokens');
        }
      );
    } catch {
      /* expected */
    }
    check('nothing is charged when nothing was consumed', await usedPeriod(userId), 0);
    await cleanup(userId);
  }

  // ── 11. Abort (user pressed Stop) with no usage → released ────────────────
  {
    const userId = newUser();
    await pinPeriod(userId);
    try {
      await withVGU(
        { userId, plan: 'pro', feature: 'veegpt.chat', model: 'veegpt-hybrid' },
        async () => {
          const e = new Error('Generation cancelled');
          e.name = 'AbortError';
          throw e;
        }
      );
    } catch {
      /* expected */
    }
    check('an abort before any tokens refunds fully', await usedPeriod(userId), 0);
    await cleanup(userId);
  }

  // ── 12. Concurrency slot is freed on both success and failure ─────────────
  {
    const userId = newUser();
    await pinPeriod(userId);
    await withVGU(
      { userId, plan: 'pro', feature: 'veegpt.chat', model: 'veegpt-hybrid' },
      async () => { fakeProviderCall('gemini-flash-lite-latest', 1000, 100); return 1; }
    );
    check('slot released after success', await redis.zcard(K.concurrency(userId)), 0);
    try {
      await withVGU(
        { userId, plan: 'pro', feature: 'veegpt.chat', model: 'veegpt-hybrid' },
        async () => { throw new Error('boom'); }
      );
    } catch { /* expected */ }
    check('slot released after failure', await redis.zcard(K.concurrency(userId)), 0);
    await cleanup(userId);
  }

  // ── 13. Refusal is structured, and the operation never runs ──────────────
  {
    const userId = newUser();
    await pinPeriod(userId);
    process.env.VEEGPT_MONTHLY_VGU_PRO = '1';
    let ran = false;
    let caught: VGUQuotaError | null = null;
    // Burn the tiny budget.
    await withVGU(
      { userId, plan: 'pro', feature: 'veegpt.chat', model: 'veegpt-hybrid' },
      async () => { fakeProviderCall('gemini-flash-lite-latest', 4400, 700); return 1; }
    );
    try {
      await withVGU(
        { userId, plan: 'pro', feature: 'veegpt.chat', model: 'veegpt-hybrid' },
        async () => { ran = true; return 1; }
      );
    } catch (e) {
      if (e instanceof VGUQuotaError) caught = e;
    }
    checkTrue('a refusal is a VGUQuotaError', caught !== null);
    check('the AI operation never executed', ran, false);
    check('refusal carries a machine-readable code',
      caught?.code, 'MONTHLY_QUOTA_EXHAUSTED');
    const body = caught!.toResponse();
    checkTrue('response includes retryAt', typeof body.retryAt === 'string');
    check('a monthly refusal does NOT suggest a cheaper model',
      body.suggestedTier, undefined);
    delete process.env.VEEGPT_MONTHLY_VGU_PRO;
    await cleanup(userId);
  }

  // ── 14. A MODEL refusal DOES offer a cheaper tier (never auto-switches) ───
  {
    const userId = newUser();
    await pinPeriod(userId);
    process.env.VEEGPT_MONTHLY_VGU_FREE = '-1';
    process.env.VEEGPT_5H_VGU_FREE = '-1';
    // Spend the 5 Free premium previews.
    for (let i = 0; i < 5; i++) {
      await withVGU(
        { userId, plan: 'free', feature: 'veegpt.chat', model: 'openai-gpt4o' },
        async () => { fakeProviderCall('gpt-4o', 500, 100); return 1; }
      );
    }
    let caught: VGUQuotaError | null = null;
    try {
      await withVGU(
        { userId, plan: 'free', feature: 'veegpt.chat', model: 'openai-gpt4o' },
        async () => 1
      );
    } catch (e) {
      if (e instanceof VGUQuotaError) caught = e;
    }
    check('premium exhaustion is MODEL-scoped', caught?.code, 'MODEL_QUOTA_EXHAUSTED');
    const body = caught!.toResponse();
    check('the client is offered a cheaper tier to confirm', body.suggestedTier, 'cheap');
    check('the requested model is echoed back', body.requestedModel, 'openai-gpt4o');

    // And the cheap model still works — no silent switch happened, the user asks.
    const cheap = await withVGU(
      { userId, plan: 'free', feature: 'veegpt.chat', model: 'veegpt-hybrid' },
      async () => { fakeProviderCall('gemini-flash-lite-latest', 1000, 200); return 'fast'; }
    );
    check('continuing on the cheap model works', cheap.result, 'fast');
    delete process.env.VEEGPT_MONTHLY_VGU_FREE;
    delete process.env.VEEGPT_5H_VGU_FREE;
    await cleanup(userId);
  }

  // ── 15. Idempotent retry charges once ────────────────────────────────────
  // A SERVER-GENERATED id names one logical operation, so a retry of it reuses the
  // reservation. A CLIENT-supplied id is deliberately not honoured after the first
  // attempt completes — that was an unlimited-free-AI replay hole, closed and
  // proven in verify-vgu-failures section 9.
  {
    const userId = newUser();
    await pinPeriod(userId);
    const requestId = `rq_${Date.now()}`;
    const run = () =>
      withVGU(
        {
          userId,
          plan: 'pro',
          feature: 'veegpt.chat',
          model: 'veegpt-hybrid',
          requestId,
          requestIdTrusted: true,
        },
        async () => { fakeProviderCall('gemini-flash-lite-latest', 4400, 700); return 1; }
      );
    const a = await run();
    const b = await run();
    check('both attempts return the same reservation',
      b.usage.reservationId, a.usage.reservationId);
    checkNear('charged once, not twice', await usedPeriod(userId), a.usage.actualVGU, 0.05);
    await cleanup(userId);
  }

  // ── 16. Non-blocking internal features survive an exhausted quota ────────
  {
    const userId = newUser();
    await pinPeriod(userId);
    process.env.VEEGPT_MONTHLY_VGU_PRO = '1';
    await withVGU(
      { userId, plan: 'pro', feature: 'veegpt.chat', model: 'veegpt-hybrid' },
      async () => { fakeProviderCall('gemini-flash-lite-latest', 4400, 700); return 1; }
    );
    // Chat is now blocked, but a conversation title must not fail the product.
    let titleRan = false;
    const t = await withVGU(
      { userId, plan: 'pro', feature: 'veegpt.title', model: 'veegpt-hybrid' },
      async () => { titleRan = true; fakeProviderCall('gemini-flash-lite-latest', 200, 20); return 'Title'; }
    );
    checkTrue('a non-blocking internal feature still runs', titleRan);
    check('and is marked unmetered rather than silently accounted', t.usage.status, 'UNMETERED');

    // While a blocking feature is still refused.
    let chatRan = false;
    try {
      await withVGU(
        { userId, plan: 'pro', feature: 'veegpt.chat', model: 'veegpt-hybrid' },
        async () => { chatRan = true; return 1; }
      );
    } catch { /* expected */ }
    check('a blocking feature is still refused', chatRan, false);
    delete process.env.VEEGPT_MONTHLY_VGU_PRO;
    await cleanup(userId);
  }

  // ── 17. Economic sanity: VGU tracks real money at the anchor ─────────────
  {
    const userId = newUser();
    await pinPeriod(userId);
    const { usage } = await withVGU(
      { userId, plan: 'pro', feature: 'veegpt.chat', model: 'openai-gpt-4o-mini' },
      async () => { fakeProviderCall('gpt-4o-mini', 4_400, 700); return 1; }
    );
    checkNear('1 VGU ≈ one reference cheap turn', usage.actualVGU, 1, 0.25);
    checkNear('and equals providerCost / anchor',
      usage.actualVGU, usage.providerCostUSD / VGU_ANCHOR_USD, 0.6);
    await cleanup(userId);
  }

  delete process.env.VEEGPT_CONCURRENCY_PRO;
  delete process.env.VEEGPT_CONCURRENCY_FREE;

  console.log(
    `\n${fail === 0 ? 'ALL CHECKS PASSED' : `${fail} CHECK(S) FAILED`}  (${pass} passed)`
  );
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => {
  console.error('probe error:', e?.stack || e?.message || e);
  process.exit(1);
});
