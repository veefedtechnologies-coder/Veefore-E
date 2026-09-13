/**
 * BLOCK 5 VERIFICATION — no AI path bypasses the VGU engine.
 *
 * The static audit (audit-ai-coverage.ts) proves every provider call site gets
 * its client from the guarded factories and sits on a metered path. That is a
 * claim about the source. This script proves the RUNTIME behaviour, which is what
 * actually protects the bill:
 *
 *   1. A provider call outside a metered context is DETECTED, and in strict mode
 *      BLOCKED before it reaches the network.
 *   2. The same call inside withVGU proceeds and its tokens are recorded.
 *   3. meterAI reserves BEFORE the handler runs, so an over-quota request never
 *      reaches a provider.
 *   4. meterAI covers a STREAMING handler: usage recorded mid-stream is
 *      reconciled when the response ends.
 *   5. A refusal is a structured 429, not a bare error, and never a silent model
 *      swap.
 *   6. A retry with the same idempotency key does not double-charge.
 *   7. Background jobs go through the same engine, with the job id as the
 *      idempotency key.
 *   8. Platform-chosen models do not consume the user's model-tier allowance,
 *      while user-chosen models do.
 *
 * No real provider is called: the guard is exercised against a stubbed transport,
 * so the test is deterministic and free.
 *
 * Run: npx tsx server/scripts/verify-vgu-coverage.ts
 */

import 'dotenv/config';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { getRedisClient } from '../lib/redis';
import {
  createOpenAI,
  enforcementMode,
  providerGuardStats,
  resetProviderGuardStats,
  UnmeteredAICallError,
} from '../services/ai-provider-guard';
import { withVGU, withVGUForUser, VGUQuotaError } from '../services/veegpt-metering';
import { meterAI } from '../middleware/meter-ai';
import { getReservationEngine, RESERVATION_KEYS } from '../services/veegpt-reservation.engine';
import { recordAIUsage } from '../services/aiUsageTracker';
import { resolveBillingPeriod } from '../services/veegpt-billing-period';
import { policyForPlan } from '../config/veegpt-vgu.config';
import { initializeRateLimiting } from '../middleware/rate-limiting-working';
import { connectionManager } from '../infrastructure/mongodb-connection';
import mongoose from 'mongoose';

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

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
    console.log(`  ✗ ${label}\n      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`);
  }
}

function section(title: string): void {
  console.log(`\n${title}\n${'-'.repeat(title.length)}`);
}

const RUN = `__cov_probe_${Date.now()}`;

/**
 * Each section gets its OWN quota owner.
 *
 * The sections now spend REAL measured VGU (a gpt-4o turn is 16.36), so sharing
 * one user meant later sections were refused by the budget the earlier ones had
 * spent — the probe would fail because the engine worked. Isolation keeps each
 * assertion about the one behaviour it is testing.
 */
const U = {
  metered: `${RUN}_metered`,
  gate: `${RUN}_gate`,
  stream: `${RUN}_stream`,
  idem: `${RUN}_idem`,
  worker: `${RUN}_worker`,
  tiers: `${RUN}_tiers`,
  refused: `${RUN}_refused`,
  nonblocking: `${RUN}_nonblocking`,
  rate: `${RUN}_rate`,
};
const ALL_USERS = Object.values(U);

/** Remove every Redis key this probe could have created. */
async function cleanup(users: string[]): Promise<void> {
  const redis = getRedisClient();
  for (const u of users) {
    const period = await resolveBillingPeriod(u).catch(() => null);
    const keys = [
      RESERVATION_KEYS.window(u),
      RESERVATION_KEYS.amounts(u),
      RESERVATION_KEYS.concurrency(u),
      ...(period ? [RESERVATION_KEYS.period(u, period.id)] : []),
    ];
    await redis.del(...keys).catch(() => {});
  }
  // Idempotency keys this probe uses. Deliberately an explicit list rather than
  // a wildcard: an earlier version deleted `vgu:res:*`, which would have wiped
  // every reservation record in the database — including live ones — if this
  // script were ever pointed at a shared Redis.
  // Seeded plan cache + rate-limit buckets, so a repeat run starts clean.
  for (const u of users) {
    await redis
      .del(`veegpt_ai_rpm:user:${u}`, `veegpt:rl:plan:${u}`)
      .catch(() => {});
    const rl = await redis.keys(`*veegpt_ai_rpm*${u}*`).catch(() => [] as string[]);
    if (rl.length) await redis.del(...rl).catch(() => {});
  }

  const idemIds = [
    'covprobe_metered_1',
    'covprobe_filler',
    'covprobe_idem_1',
    'covprobe_job_42',
  ];
  // Idempotency keys are namespaced per user, so clear them for every probe user.
  const idemKeys = users.flatMap(u => idemIds.map(id => RESERVATION_KEYS.idem(u, id)));
  if (idemKeys.length) await redis.del(...idemKeys).catch(() => {});

  // Open-reservation index entries belonging to this probe only.
  const open = await redis.zrange(RESERVATION_KEYS.open, 0, -1).catch(() => [] as string[]);
  for (const resId of open) {
    const rec = await redis.hget(RESERVATION_KEYS.reservation(resId), 'meta').catch(() => null);
    if (rec && users.some(u => rec.includes(u))) {
      await redis
        .del(RESERVATION_KEYS.reservation(resId))
        .catch(() => {});
      await redis.zrem(RESERVATION_KEYS.open, resId).catch(() => {});
    }
  }
}

/**
 * An OpenAI client whose network layer is replaced by a stub. The GUARD still
 * runs — that is the whole point: we are testing the guard, not OpenAI.
 */
function stubbedOpenAI(usage?: {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}) {
  const client = createOpenAI({ apiKey: 'sk-probe' });
  // Replace the transport underneath the guard. The guard wrapped
  // `chat.completions.create`, so we swap what it calls through to by patching
  // the SDK's internal post method.
  (client as unknown as { post: unknown }).post = async () => ({
    id: 'stub',
    model: 'gpt-4o-mini',
    choices: [{ message: { content: 'stub' } }],
    usage:
      usage ?? {
        prompt_tokens: 1000,
        completion_tokens: 200,
        total_tokens: 1200,
      },
  });
  return client;
}

/** Start an express app on an ephemeral port and return its base URL. */
async function listen(app: express.Express): Promise<{ url: string; close: () => Promise<void> }> {
  const server = app.listen(0);
  await new Promise<void>(r => server.once('listening', () => r()));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>(r => {
        server.close(() => r());
      }),
  };
}

/**
 * Pre-seed the plan cache.
 *
 * `resolveVeegptPlan` reads the Subscription document, and these synthetic users
 * have none — so without this, every metered request waits out Mongo's 10-second
 * buffering timeout before falling back. That made each request take ~10s, which
 * silently invalidated the rate-limit section: the 60-second window expired
 * before the limit could be reached. Seeding the cache is exactly what a real
 * user's second request would hit anyway.
 */
async function seedPlan(userId: string, plan: string): Promise<void> {
  await getRedisClient()
    .set(`veegpt:rl:plan:${userId}`, plan, 'EX', 600)
    .catch(() => {});
}

/** Inject a fake authenticated user so meterAI has someone to charge. */
function fakeAuth(userId: string): express.RequestHandler {
  return (req, _res, next) => {
    (req as express.Request & { user?: unknown }).user = { id: userId };
    next();
  };
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('VGU COVERAGE VERIFICATION (Block 5)\n' + '='.repeat(70));
  // The rate limiter is Redis-backed in the running server (initialised at boot).
  // Wiring it here too keeps the rate-limit section deterministic instead of
  // falling back to a per-process in-memory store.
  initializeRateLimiting(getRedisClient() as never);
  // Connect Mongo so billing-period resolution answers immediately instead of
  // waiting out a 10-second buffering timeout on every reservation.
  await connectionManager.connect().catch(() => {});
  console.log(
    `mongo=${mongoose.connection.readyState === 1 ? mongoose.connection.name : 'not connected'}`
  );
  await cleanup(ALL_USERS);
  await Promise.all([
    seedPlan(U.metered, 'creator'),
    seedPlan(U.gate, 'free'),
    seedPlan(U.stream, 'creator'),
    seedPlan(U.idem, 'creator'),
    seedPlan(U.worker, 'free'),
    seedPlan(U.rate, 'free'),
  ]);

  // =========================================================================
  section('1. An unmetered provider call is detected');
  // =========================================================================
  process.env.VGU_ENFORCEMENT = 'warn';
  resetProviderGuardStats();
  check('enforcement mode reads from env', enforcementMode(), 'warn');

  {
    const client = stubbedOpenAI();
    await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
    });
    const s = providerGuardStats();
    check('the call was seen by the guard', s.guardedCalls, 1);
    check('it was flagged as unmetered', s.unmeteredCalls, 1);
    check('warn mode allows it through', s.blockedCalls, 0);
  }

  // =========================================================================
  section('2. Strict mode BLOCKS an unmetered call before the network');
  // =========================================================================
  process.env.VGU_ENFORCEMENT = 'strict';
  resetProviderGuardStats();
  {
    const client = stubbedOpenAI();
    let thrown: unknown;
    try {
      await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hi' }],
      });
    } catch (err) {
      thrown = err;
    }
    check(
      'strict mode throws UnmeteredAICallError',
      thrown instanceof UnmeteredAICallError,
      true
    );
    check(
      'the error carries a machine-readable code',
      (thrown as UnmeteredAICallError)?.code,
      'UNMETERED_AI_CALL'
    );
    check('the block is counted', providerGuardStats().blockedCalls, 1);
  }

  // =========================================================================
  section('3. The same call inside withVGU proceeds and records tokens');
  // =========================================================================
  resetProviderGuardStats();
  {
    const client = stubbedOpenAI({
      prompt_tokens: 4400,
      completion_tokens: 700,
      total_tokens: 5100,
    });
    const { usage } = await withVGU(
      {
        userId: U.metered,
        plan: 'creator',
        feature: 'caption.generation',
        model: 'openai-gpt-4o-mini',
        modelChosenBy: 'platform',
        requestId: 'covprobe_metered_1',
      },
      async () => {
        await client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'hi' }],
        });
        return 'ok';
      }
    );
    check('strict mode did NOT block a metered call', providerGuardStats().blockedCalls, 0);
    check('the guard recorded one provider call', usage.providerCalls, 1);
    check('input tokens came from the provider payload', usage.tokens.inputTokens, 4400);
    check('output tokens came from the provider payload', usage.tokens.outputTokens, 700);
    // 4,400 in + 700 out on gpt-4o-mini IS the anchor request by definition, so
    // exactly 1 VGU. The tier estimate for this feature is also 1, so the
    // stronger evidence that measurement happened is the token assertions above
    // plus the 16.36 VGU gpt-4o case in section 5.
    check('actual VGU is the measured anchor, not a flat weight', usage.actualVGU, 1);
    check('the reservation reconciled', usage.status, 'RECONCILED');
  }

  // =========================================================================
  section('4. meterAI reserves BEFORE the handler runs');
  // =========================================================================
  {
    // Spend the whole Free 5-hour budget so the next request cannot fit.
    //
    // The filler is COMMITTED, not left open. Leaving it open would also occupy
    // the plan's single concurrency slot, and the next request would then be
    // refused with CONCURRENCY_LIMIT — the test would pass for the wrong reason
    // and prove nothing about the VGU budget. Committing keeps the charge and
    // frees the slot, so the only thing left blocking is the budget itself.
    const engine = getReservationEngine();
    const filler = await engine.reserve({
      userId: U.gate,
      plan: 'free',
      feature: 'caption.generation',
      tier: 'cheap',
      estimatedVGU: 15,
      requestId: 'covprobe_filler',
    });
    check('the filler reservation was granted', filler.ok, true);
    if (filler.ok) {
      await engine.commit(filler.reservationId, 15, {
        userId: U.gate,
        plan: 'free',
        tier: 'cheap',
        feature: 'caption.generation',
        billingPeriodId: filler.billingPeriodId,
      });
      check(
        'no concurrency slot is held, so only the budget can refuse',
        (await engine.usageSnapshot(U.gate, 'free')).concurrency.inflight,
        0
      );
    }

    let handlerRan = false;
    const app = express();
    app.use(express.json());
    app.post(
      '/gen',
      fakeAuth(U.gate),
      meterAI({ feature: 'caption.generation', model: 'openai-gpt-4o-mini' }),
      (_req, res) => {
        handlerRan = true;
        res.json({ ok: true });
      }
    );
    const srv = await listen(app);
    const resp = await fetch(`${srv.url}/gen`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const body = (await resp.json()) as Record<string, unknown>;
    await srv.close();

    check('an over-quota request is refused with 429', resp.status, 429);
    check('the handler NEVER ran', handlerRan, false);
    check('the refusal names the exhausted window', body.code, 'BURST_QUOTA_EXHAUSTED');
    check('Retry-After is set', !!resp.headers.get('retry-after'), true);
    check(
      'a burst refusal does NOT suggest a cheaper model (it would not help)',
      body.suggestedTier,
      undefined
    );
  }

  // =========================================================================
  section('5. meterAI covers a STREAMING handler end-to-end');
  // =========================================================================
  {
    const app = express();
    app.use(express.json());
    app.post(
      '/stream',
      fakeAuth(U.stream),
      meterAI({ feature: 'veegpt.chat', model: 'openai-gpt4o' }),
      async (_req, res) => {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
        });
        res.write('data: {"type":"start"}\n\n');
        // Usage recorded MID-STREAM, exactly as the real chat route does.
        recordAIUsage({
          provider: 'openai',
          model: 'gpt-4o',
          callType: 'stream',
          usage: { promptTokens: 4400, completionTokens: 700, totalTokens: 5100 },
        });
        await new Promise(r => setTimeout(r, 30));
        res.write('data: {"type":"done"}\n\n');
        res.end();
      }
    );
    const srv = await listen(app);

    const before = await getReservationEngine().usageSnapshot(U.stream, 'creator');
    const resp = await fetch(`${srv.url}/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const text = await resp.text();
    // The middleware reconciles once the response has settled.
    await new Promise(r => setTimeout(r, 150));
    const after = await getReservationEngine().usageSnapshot(U.stream, 'creator');
    await srv.close();

    check('the stream completed', resp.status, 200);
    check('the stream body arrived', text.includes('"type":"done"'), true);
    check(
      'usage recorded mid-stream was charged after the response ended',
      after.period.used > before.period.used,
      true
    );
    // 4,400 in + 700 out on gpt-4o = $0.018 at the registry price, and
    // $0.018 / $0.0011 per VGU = 16.36 VGU. Deliberately far from BOTH the
    // 1 VGU floor and the tier estimate, so this can only pass if the real
    // token counts were measured and priced.
    check(
      'the charge is the measured token cost, not the estimate or the floor',
      Math.round((after.period.used - before.period.used) * 100) / 100,
      16.36
    );
  }

  // =========================================================================
  section('6. A retry with the same idempotency key does not double-charge');
  // =========================================================================
  {
    const before = await getReservationEngine().usageSnapshot(U.idem, 'creator');
    const run = () =>
      withVGU(
        {
          userId: U.idem,
          plan: 'creator',
          feature: 'caption.generation',
          model: 'openai-gpt-4o-mini',
          modelChosenBy: 'platform',
          requestId: 'covprobe_idem_1',
          // Server-generated id: this models an internal retry of ONE logical
          // operation, so it must reuse the reservation even after the first
          // attempt reconciled. A CLIENT-supplied id is deliberately NOT honoured
          // that way — see verify-vgu-failures section 9.
          requestIdTrusted: true,
        },
        async () => {
          recordAIUsage({
            provider: 'openai',
            model: 'gpt-4o',
            callType: 'text',
            usage: { promptTokens: 4400, completionTokens: 700, totalTokens: 5100 },
          });
          return 'ok';
        }
      );
    const first = await run();
    const second = await run();
    const after = await getReservationEngine().usageSnapshot(U.idem, 'creator');

    check(
      'the retry reuses the same reservation',
      second.usage.reservationId,
      first.usage.reservationId
    );
    check(
      'total charged once, not twice',
      Math.round((after.period.used - before.period.used) * 100) / 100,
      16.36
    );
  }

  // =========================================================================
  section('7. Background work goes through the same engine');
  // =========================================================================
  {
    const before = await getReservationEngine().usageSnapshot(U.worker, 'free');
    const { usage } = await withVGUForUser(
      {
        userId: U.worker,
        // No plan supplied — the worker path must resolve it itself.
        feature: 'trend.intelligence',
        requestId: 'covprobe_job_42',
        // A BullMQ job id is server-generated, so a re-delivery is the same job.
        requestIdTrusted: true,
        meta: { userId: U.worker, source: 'probe-worker' },
      },
      async () => {
        recordAIUsage({
          provider: 'openai',
          // A cheap model: an unresolvable plan becomes `free`, whose 5-hour
          // budget is 15 VGU, and a gpt-4o turn (16.36) would not fit. The
          // subject here is the engine path, not the amount.
          model: 'gpt-4o-mini',
          callType: 'text',
          usage: { promptTokens: 4400, completionTokens: 700, totalTokens: 5100 },
        });
        return 'done';
      }
    );
    const after = await getReservationEngine().usageSnapshot(U.worker, 'free');
    check('a worker job reserves and reconciles', usage.status, 'RECONCILED');
    check('the worker job was charged', after.period.used > before.period.used, true);

    // A re-delivered job must not charge again.
    const beforeRetry = await getReservationEngine().usageSnapshot(U.worker, 'free');
    await withVGUForUser(
      {
        userId: U.worker,
        feature: 'trend.intelligence',
        requestId: 'covprobe_job_42',
        requestIdTrusted: true,
      },
      async () => {
        recordAIUsage({
          provider: 'openai',
          model: 'gpt-4o-mini',
          callType: 'text',
          usage: { promptTokens: 4400, completionTokens: 700, totalTokens: 5100 },
        });
        return 'done';
      }
    );
    const afterRetry = await getReservationEngine().usageSnapshot(U.worker, 'free');
    check(
      'a re-delivered job with the same job id charges nothing extra',
      Math.round((afterRetry.period.used - beforeRetry.period.used) * 100) / 100,
      0
    );
  }

  // =========================================================================
  section('8. Model-tier allowance applies to the USER\u2019s choice only');
  // =========================================================================
  {
    const engine = getReservationEngine();
    const freeUser = U.tiers;
    await cleanup([freeUser]);

    // Free gets exactly 5 premium PREVIEWS per period (spec §16). Spend them.
    for (let i = 0; i < 5; i++) {
      const r = await engine.reserve({
        userId: freeUser,
        plan: 'free',
        feature: 'veegpt.chat',
        tier: 'premium',
        estimatedVGU: 0.1,
        modelChosenBy: 'user',
      });
      if (!r.ok) break;
      // COMMIT, not release: a released reservation is refunded and correctly
      // does NOT consume a preview, so releasing here would never exhaust the
      // allowance and the assertion below would be meaningless.
      await engine.commit(r.reservationId, 0.1, {
        userId: freeUser,
        plan: 'free',
        tier: 'premium',
        feature: 'veegpt.chat',
        billingPeriodId: r.billingPeriodId,
      });
    }
    check(
      'exactly 5 premium previews are recorded as used',
      (await engine.usageSnapshot(freeUser, 'free')).tiers.find(t => t.tier === 'premium')
        ?.usedRequests,
      5
    );

    const sixth = await engine.reserve({
      userId: freeUser,
      plan: 'free',
      feature: 'veegpt.chat',
      tier: 'premium',
      estimatedVGU: 0.1,
      modelChosenBy: 'user',
    });
    check(
      'a 6th USER-chosen premium turn is refused',
      sixth.ok === false && sixth.code,
      'MODEL_QUOTA_EXHAUSTED'
    );
    check(
      'the refusal is structured, never a silent model swap',
      sixth.ok === false && typeof sixth.message === 'string' && sixth.message.length > 0,
      true
    );

    // Same tier, but the FEATURE fixed the model. The user made no choice, so the
    // tier allowance must not deny them a feature they paid for.
    const platform = await engine.reserve({
      userId: freeUser,
      plan: 'free',
      feature: 'caption.generation',
      tier: 'premium',
      estimatedVGU: 0.1,
      modelChosenBy: 'platform',
    });
    check(
      'a PLATFORM-chosen premium model is still allowed',
      platform.ok,
      true
    );
    if (platform.ok) {
      await engine.commit(platform.reservationId, 0.1, {
        userId: freeUser,
        plan: 'free',
        tier: 'premium',
        feature: 'caption.generation',
        billingPeriodId: platform.billingPeriodId,
      });
    }

    // Ultra is not in the Free plan at all — an explicit choice must be refused.
    const ultra = await engine.reserve({
      userId: freeUser,
      plan: 'free',
      feature: 'veegpt.chat',
      tier: 'ultra',
      estimatedVGU: 1,
      modelChosenBy: 'user',
    });
    check(
      'a tier outside the plan is refused, not downgraded',
      ultra.ok === false && ultra.code,
      'MODEL_NOT_IN_PLAN'
    );
    await cleanup([freeUser]);
  }

  // =========================================================================
  section('9. A quota refusal is a VGUQuotaError, and the work never runs');
  // =========================================================================
  {
    const engine = getReservationEngine();
    const blocked = U.refused;
    await cleanup([blocked]);
    const filler = await engine.reserve({
      userId: blocked,
      plan: 'free',
      feature: 'caption.generation',
      tier: 'cheap',
      estimatedVGU: 15,
    });
    check('budget pre-spent', filler.ok, true);
    // Committed so the concurrency slot is free — see section 4.
    if (filler.ok) {
      await engine.commit(filler.reservationId, 15, {
        userId: blocked,
        plan: 'free',
        tier: 'cheap',
        feature: 'caption.generation',
        billingPeriodId: filler.billingPeriodId,
      });
    }

    let ran = false;
    let thrown: unknown;
    try {
      await withVGU(
        {
          userId: blocked,
          plan: 'free',
          feature: 'caption.generation',
          model: 'openai-gpt-4o-mini',
        },
        async () => {
          ran = true;
          return 'should not happen';
        }
      );
    } catch (err) {
      thrown = err;
    }
    check('the operation was refused', thrown instanceof VGUQuotaError, true);
    check('the wrapped work never executed', ran, false);
    check(
      'the refusal has a machine-readable code',
      (thrown as VGUQuotaError)?.code,
      'BURST_QUOTA_EXHAUSTED'
    );
    check(
      'the response body is structured for the client',
      typeof (thrown as VGUQuotaError)?.toResponse()?.code,
      'string'
    );
    await cleanup([blocked]);
  }

  // =========================================================================
  section('10. A non-blocking internal feature is not killed by quota');
  // =========================================================================
  {
    const engine = getReservationEngine();
    const spent = U.nonblocking;
    await cleanup([spent]);
    const pre = await engine.reserve({
      userId: spent,
      plan: 'free',
      feature: 'caption.generation',
      tier: 'cheap',
      estimatedVGU: 15,
    });
    if (pre.ok) {
      await engine.commit(pre.reservationId, 15, {
        userId: spent,
        plan: 'free',
        tier: 'cheap',
        feature: 'caption.generation',
        billingPeriodId: pre.billingPeriodId,
      });
    }

    // veegpt.title is `blocking: false`: failing it would break the product for a
    // cost of ~0.2 VGU, so it is recorded and allowed.
    let ran = false;
    const { usage } = await withVGU(
      { userId: spent, plan: 'free', feature: 'veegpt.title' },
      async () => {
        ran = true;
        return 'A title';
      }
    );
    check('a non-blocking internal feature still runs', ran, true);
    check('but it is explicitly marked as unmetered', usage.status, 'UNMETERED');
    await cleanup([spent]);
  }

  // =========================================================================
  section('11. meterAI enforces the per-plan REQUEST RATE (spec §31)');
  // =========================================================================
  {
    // Rate is a separate concern from budget: a budget bounds total spend, it
    // does nothing about a client loop hammering an endpoint inside its
    // allowance. Free is 10 requests/minute.
    const u = U.rate;
    // Pin the limit explicitly so the assertion does not depend on NODE_ENV
    // (development deliberately raises the ceiling for local work).
    process.env.VEEGPT_RPM_FREE = '10';
    const limit = policyForPlan('free').requestsPerMinute;
    check('the per-plan limit is what the probe pinned', limit, 10);
    let handlerCalls = 0;

    const app = express();
    app.use(express.json());
    app.post(
      '/rl',
      fakeAuth(u),
      meterAI({ feature: 'caption.generation', model: 'openai-gpt-4o-mini' }),
      (_req, res) => {
        handlerCalls++;
        res.json({ ok: true });
      }
    );
    const srv = await listen(app);

    // Sequential, so this measures the RATE limit and not concurrency.
    const codes: number[] = [];
    for (let i = 0; i < limit + 4; i++) {
      const r = await fetch(`${srv.url}/rl`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      codes.push(r.status);
      if (r.status === 429) {
        const body = (await r.json()) as Record<string, unknown>;
        if (i === limit) {
          check('the first refusal names the rate limit', body.code, 'RATE_LIMITED');
          check('and reports the limit that was hit', body.limit, limit);
          check('and tells the client when to retry', typeof body.retryAfter, 'number');
        }
      } else {
        await r.text();
      }
    }
    await srv.close();
    delete process.env.VEEGPT_RPM_FREE;

    check(`exactly ${limit} requests were served`, codes.filter(c => c === 200).length, limit);
    check('the rest were rate-limited', codes.filter(c => c === 429).length, 4);
    check('a rate-limited request never reached the handler', handlerCalls, limit);
    // A rate refusal must not consume budget — it never got a reservation.
    const snap = await getReservationEngine().usageSnapshot(u, 'free');
    check(
      'refused requests charged nothing',
      Math.round(snap.period.used * 100) / 100,
      Math.round(limit * 1) / 1
    );
  }

  // ---------------------------------------------------------------------------
  await cleanup(ALL_USERS);
  process.env.VGU_ENFORCEMENT = 'warn';

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
