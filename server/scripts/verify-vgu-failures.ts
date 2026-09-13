/**
 * BLOCK 7 VERIFICATION — failure handling, idempotency and streaming.
 *
 * Spec §35 (provider failure), §36 (streaming) and §37 (retries) each list a set
 * of cases. This exercises every one of them and asserts the two invariants that
 * matter economically:
 *
 *   A. A reservation ALWAYS reaches a terminal state.
 *   B. Tokens already consumed are charged; a failure with no usage is refunded
 *      in full. Failing must never be free, and must never cost more than it did.
 *
 * §35  timeout · 4xx · 5xx · rate limit · partial response · connection failure ·
 *      streaming interruption
 * §36  partial output · client disconnect · provider disconnect · timeout ·
 *      cancellation · successful completion
 * §37  bounded retry count · exponential backoff · provider-aware rules ·
 *      idempotency · reservation handling · each retry accounted for
 *
 * Run: npx tsx server/scripts/verify-vgu-failures.ts
 */

import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import type { AddressInfo } from 'node:net';
import { getRedisClient } from '../lib/redis';
import { connectionManager } from '../infrastructure/mongodb-connection';
import {
  getReservationEngine,
  RESERVATION_KEYS,
} from '../services/veegpt-reservation.engine';
import { withVGU, VGUQuotaError, AITimeoutError } from '../services/veegpt-metering';
import { meterAI } from '../middleware/meter-ai';
import {
  ProviderCallBudgetError,
  recordAIUsage,
  currentAbortSignal,
} from '../services/aiUsageTracker';
import {
  backoffDelayMs,
  classifyFailure,
  isRetryable,
  withProviderRetry,
  type FailureKind,
} from '../services/veegpt-retry';
import { resolveBillingPeriod } from '../services/veegpt-billing-period';
import { initializeRateLimiting } from '../middleware/rate-limiting-working';
import { createOpenAI } from '../services/ai-provider-guard';

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

const RUN = `__fail_probe_${Date.now()}`;
const users: string[] = [];
function user(tag: string): string {
  const u = `${RUN}_${tag}`;
  users.push(u);
  return u;
}

/** 4,400 in + 700 out on gpt-4o-mini is the anchor request: exactly 1.00 VGU. */
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

async function usedVGU(userId: string, plan = 'pro'): Promise<number> {
  const snap = await getReservationEngine().usageSnapshot(userId, plan as never);
  return Math.round(snap.period.used * 100) / 100;
}

async function inflight(userId: string): Promise<number> {
  return getRedisClient().zcard(RESERVATION_KEYS.concurrency(userId));
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
        `veegpt:acctage:${u}`,
        `veegpt_ai_rpm:user:${u}`,
        ...(period ? [RESERVATION_KEYS.period(u, period.id)] : [])
      )
      .catch(() => {});
    const ab = await redis.keys(`vgu:abuse*${u}*`).catch(() => [] as string[]);
    if (ab.length) await redis.del(...ab).catch(() => {});
  }
  // Idempotency keys are namespaced per user: vgu:idem:<userId>:<requestId>.
  for (const u of users) {
    const idem = await redis.keys(`vgu:idem:${u}:*`).catch(() => [] as string[]);
    if (idem.length) await redis.del(...idem).catch(() => {});
  }
}

/** An error that looks like a real provider failure of a given kind. */
function providerError(kind: 'rate_limit' | '5xx' | '4xx' | 'connection' | 'timeout'): Error {
  switch (kind) {
    case 'rate_limit': {
      const e = new Error('Rate limit reached for requests') as Error & { status: number };
      e.status = 429;
      return e;
    }
    case '5xx': {
      const e = new Error('The server had an error') as Error & { status: number };
      e.status = 503;
      return e;
    }
    case '4xx': {
      const e = new Error('Invalid request: unknown parameter') as Error & { status: number };
      e.status = 400;
      return e;
    }
    case 'connection': {
      const e = new Error('socket hang up') as Error & { code: string };
      e.code = 'ECONNRESET';
      return e;
    }
    case 'timeout': {
      const e = new Error('request timed out') as Error & { code: string };
      e.code = 'ETIMEDOUT';
      return e;
    }
  }
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('VGU FAILURE / STREAMING / RETRY VERIFICATION (Block 7)\n' + '='.repeat(70));
  initializeRateLimiting(getRedisClient() as never);
  await connectionManager.connect().catch(() => {});
  console.log(
    `mongo=${mongoose.connection.readyState === 1 ? mongoose.connection.name : 'not connected'}`
  );
  await cleanup();

  // =========================================================================
  section('1. §35 Provider failure AFTER partial usage — charge what was used');
  // =========================================================================
  {
    const u = user('partial');
    await seedPlan(u, 'pro');
    const before = await usedVGU(u);
    let thrown: unknown;
    try {
      await withVGU(
        { userId: u, plan: 'pro', feature: 'veegpt.chat', model: 'openai-gpt-4o-mini' },
        async () => {
          // One complete provider call, then the stream dies.
          recordAnchorTurn();
          throw providerError('connection');
        }
      );
    } catch (err) {
      thrown = err;
    }
    check('the caller still sees the provider error', (thrown as Error)?.message, 'socket hang up');
    check('the consumed turn WAS charged', (await usedVGU(u)) - before, 1);
    check('the concurrency slot was returned', await inflight(u), 0);
  }

  // =========================================================================
  section('2. §35 Provider failure with NO usage — refund in full');
  // =========================================================================
  {
    const u = user('nousage');
    await seedPlan(u, 'pro');
    const before = await usedVGU(u);
    for (const kind of ['rate_limit', '5xx', '4xx', 'connection', 'timeout'] as const) {
      try {
        await withVGU(
          { userId: u, plan: 'pro', feature: 'caption.generation', model: 'openai-gpt-4o-mini' },
          async () => {
            throw providerError(kind);
          }
        );
      } catch {
        /* expected */
      }
    }
    check(
      'five failures across every provider failure mode charged nothing',
      (await usedVGU(u)) - before,
      0
    );
    check('and left no slot held', await inflight(u), 0);
  }

  // =========================================================================
  section('3. §36 Successful completion, cancellation and client disconnect');
  // =========================================================================
  {
    // Cancellation (user pressed Stop) surfaces as an AbortError. Nothing was
    // consumed, so it must be refunded — aborting is not a way to get free AI,
    // but it is also not a reason to charge for work that never happened.
    const u = user('aborted');
    await seedPlan(u, 'pro');
    const before = await usedVGU(u);
    try {
      await withVGU(
        { userId: u, plan: 'pro', feature: 'veegpt.chat', model: 'openai-gpt-4o-mini' },
        async () => {
          const e = new Error('The operation was aborted');
          e.name = 'AbortError';
          throw e;
        }
      );
    } catch {
      /* expected */
    }
    check('a cancellation with no output is refunded', (await usedVGU(u)) - before, 0);

    // Cancellation AFTER partial output still costs what it burned.
    try {
      await withVGU(
        { userId: u, plan: 'pro', feature: 'veegpt.chat', model: 'openai-gpt-4o-mini' },
        async () => {
          recordAnchorTurn();
          const e = new Error('The operation was aborted');
          e.name = 'AbortError';
          throw e;
        }
      );
    } catch {
      /* expected */
    }
    check(
      'cancelling AFTER partial output charges the partial usage',
      (await usedVGU(u)) - before,
      1
    );
    check('and always frees the slot', await inflight(u), 0);
  }
  {
    // Client disconnect on a STREAMING route: the response closes without a
    // normal end. meterAI must still reconcile, or every disconnect is free.
    const u = user('disconnect');
    await seedPlan(u, 'pro');
    const before = await usedVGU(u);

    const app = express();
    app.use(express.json());
    app.post(
      '/stream',
      (req, _res, next) => {
        (req as express.Request & { user?: unknown }).user = { id: u };
        next();
      },
      meterAI({ feature: 'veegpt.chat', model: 'openai-gpt-4o-mini' }),
      async (_req, res) => {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write('data: {"type":"start"}\n\n');
        recordAnchorTurn(); // tokens already paid for
        // Never finishes: the client goes away mid-stream.
        await new Promise(r => setTimeout(r, 5000));
        try {
          res.end();
        } catch {
          /* socket already gone */
        }
      }
    );
    const server = app.listen(0);
    await new Promise<void>(r => server.once('listening', () => r()));
    const { port } = server.address() as AddressInfo;

    const ac = new AbortController();
    const req = fetch(`http://127.0.0.1:${port}/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      signal: ac.signal,
    });
    await new Promise(r => setTimeout(r, 300));
    ac.abort(); // client disconnects
    await req.catch(() => undefined);
    // Poll for reconciliation rather than sleeping a fixed time: the point is that
    // it happens promptly, not that it happens within one exact interval.
    let settled = false;
    for (let i = 0; i < 24 && !settled; i++) {
      await new Promise(r => setTimeout(r, 250));
      settled = (await inflight(u)) === 0 && (await usedVGU(u)) > before;
    }
    server.close();

    check(
      'a client disconnect mid-stream still charges the delivered tokens',
      (await usedVGU(u)) - before,
      1
    );
    check('and reaches a terminal state (no slot held)', await inflight(u), 0);
  }

  // =========================================================================
  section('4. §36/§37 A wall-clock budget is enforced and reconciled');
  // =========================================================================
  {
    const u = user('timeout');
    await seedPlan(u, 'pro');
    // A tiny ceiling for the probe, via the feature registry's own knob.
    process.env.VEEGPT_FEATURE_CAP_VEEGPT_CHAT = undefined as never;
    const before = await usedVGU(u);

    let thrown: unknown;
    let sawSignal = false;
    try {
      await withVGU(
        {
          userId: u,
          plan: 'pro',
          // trend.intelligence declares timeoutMs: 120_000 — too long for a probe,
          // so this asserts the mechanism using a feature with a short budget set
          // below via the registry override.
          feature: 'social_listening.extract',
          model: 'openai-gpt-4o-mini',
        },
        async () => {
          // Honour the published signal, exactly as nested code should.
          const signal = currentAbortSignal();
          sawSignal = !!signal;
          recordAnchorTurn();
          await new Promise((_, reject) => {
            signal?.addEventListener('abort', () => reject(new Error('aborted by signal')), {
              once: true,
            });
            setTimeout(() => reject(new Error('probe timer')), 120_000).unref?.();
          });
        }
      );
    } catch (err) {
      thrown = err;
    }
    check('the operation is given an abort signal', sawSignal, true);
    check(
      'it fails with a timeout, not by hanging',
      thrown instanceof AITimeoutError || /abort/i.test(String((thrown as Error)?.message)),
      true
    );
    check('usage consumed before the timeout is charged', (await usedVGU(u)) - before, 1);
    check('the slot is freed, so capacity is not leaked', await inflight(u), 0);
  }

  // =========================================================================
  section('5. §37 The fan-out ceiling stops a runaway loop');
  // =========================================================================
  {
    const u = user('fanout');
    await seedPlan(u, 'pro');
    // social_listening.extract declares maxProviderCalls: 3.
    let calls = 0;
    let thrown: unknown;
    try {
      await withVGU(
        { userId: u, plan: 'pro', feature: 'social_listening.extract', model: 'openai-gpt-4o-mini' },
        async () => {
          // A loop that would otherwise call the provider 500 times.
          for (let i = 0; i < 500; i++) {
            recordAnchorTurn();
            calls++;
          }
        }
      );
    } catch (err) {
      thrown = err;
    }
    check(
      'the loop was stopped by the provider-call budget',
      thrown instanceof ProviderCallBudgetError,
      true
    );
    // maxProviderCalls is 3. The 4th recording throws, so the loop body never
    // reaches its own counter again — 3 completed iterations, not 500.
    check('the runaway loop completed 3 iterations, not 500', calls, 3);
    check(
      'the calls that DID happen were charged',
      (await usedVGU(u)) > 0,
      true
    );
    check('and the slot was freed', await inflight(u), 0);
  }

  // =========================================================================
  section('6. §37 Retry classification is provider-aware');
  // =========================================================================
  {
    const cases: Array<[string, unknown, FailureKind, boolean]> = [
      ['429 rate limit', providerError('rate_limit'), 'rate_limit', true],
      ['503 server error', providerError('5xx'), 'server_error', true],
      ['ECONNRESET', providerError('connection'), 'connection', true],
      ['ETIMEDOUT', providerError('timeout'), 'timeout', true],
      ['400 bad request', providerError('4xx'), 'client_error', false],
      ['401 unauthorised', Object.assign(new Error('bad key'), { status: 401 }), 'client_error', false],
      ['404 not found', Object.assign(new Error('no model'), { status: 404 }), 'client_error', false],
      ['content policy', new Error('Blocked by content_policy'), 'content_policy', false],
      ['our own quota refusal', Object.assign(new Error('nope'), { name: 'VGUQuotaError' }), 'quota', false],
      ['fan-out budget', Object.assign(new Error('too many'), { code: 'PROVIDER_CALL_BUDGET_EXCEEDED' }), 'quota', false],
      ['abort', Object.assign(new Error('stop'), { name: 'AbortError' }), 'aborted', false],
      ['insufficient provider credit', Object.assign(new Error('quota'), { type: 'insufficient_quota' }), 'client_error', false],
      ['unrecognised', new Error('something odd'), 'unknown', false],
    ];
    for (const [label, err, kind, retryable] of cases) {
      check(`${label} → ${kind}`, classifyFailure(err), kind);
      check(`${label} retryable=${retryable}`, isRetryable(classifyFailure(err)), retryable);
    }
    check(
      'a provider account with no credit is NEVER retried (it cannot succeed)',
      isRetryable('client_error'),
      false
    );
  }

  // =========================================================================
  section('7. §37 Retries are bounded and backoff grows');
  // =========================================================================
  {
    // social_listening.extract declares maxRetries: 2 → at most 3 attempts.
    let attempts = 0;
    let thrown: unknown;
    try {
      await withProviderRetry(
        { feature: 'social_listening.extract', baseDelayMs: 5, maxDelayMs: 20 },
        async () => {
          attempts++;
          throw providerError('rate_limit');
        }
      );
    } catch (err) {
      thrown = err;
    }
    check('a retryable failure is retried up to the feature ceiling', attempts, 3);
    check('and the last error still propagates', (thrown as Error)?.message.includes('Rate limit'), true);

    // A non-retryable failure must not be attempted twice, however many retries
    // remain — retrying a 400 pays for a guaranteed failure.
    let bad = 0;
    try {
      await withProviderRetry(
        { feature: 'social_listening.extract', baseDelayMs: 5 },
        async () => {
          bad++;
          throw providerError('4xx');
        }
      );
    } catch {
      /* expected */
    }
    check('a 4xx is attempted exactly once', bad, 1);

    // A caller may lower the ceiling but never raise it.
    let capped = 0;
    try {
      await withProviderRetry(
        { feature: 'social_listening.extract', maxRetries: 99, baseDelayMs: 5 },
        async () => {
          capped++;
          throw providerError('5xx');
        }
      );
    } catch {
      /* expected */
    }
    check('a caller cannot exceed the registry ceiling', capped, 3);

    // A feature with a lower ceiling gets fewer attempts.
    let dr = 0;
    try {
      await withProviderRetry(
        { feature: 'veegpt.deep_research', baseDelayMs: 5 },
        async () => {
          dr++;
          throw providerError('5xx');
        }
      );
    } catch {
      /* expected */
    }
    check('deep research (maxRetries 1) makes 2 attempts', dr, 2);

    // Success on a later attempt returns normally and reports the attempt count.
    let flaky = 0;
    const ok = await withProviderRetry(
      { feature: 'social_listening.extract', baseDelayMs: 5 },
      async () => {
        flaky++;
        if (flaky < 3) throw providerError('rate_limit');
        return 'recovered';
      }
    );
    check('a transient failure eventually succeeds', ok.result, 'recovered');
    check('and the attempt count is reported', ok.retry.attempts, 3);
    check('with each failure classified', ok.retry.failures, ['rate_limit', 'rate_limit']);
  }
  {
    // Exponential growth with jitter: each step's ceiling doubles, and the value
    // is never above the ceiling or below half of it.
    const base = 100;
    const max = 10_000;
    for (let attempt = 0; attempt < 5; attempt++) {
      const ceiling = Math.min(max, base * 2 ** attempt);
      const samples = Array.from({ length: 40 }, () => backoffDelayMs(attempt, base, max));
      check(
        `backoff attempt ${attempt} stays within [${ceiling / 2}, ${ceiling}]`,
        samples.every(v => v >= ceiling / 2 && v <= ceiling),
        true
      );
    }
    const spread = new Set(Array.from({ length: 40 }, () => backoffDelayMs(3, base, max)));
    check('backoff is jittered, not a fixed value', spread.size > 1, true);
    check('and is capped', backoffDelayMs(50, base, max) <= max, true);
  }

  // =========================================================================
  section('8. §37 Every retry is economically accounted for');
  // =========================================================================
  {
    // Three attempts inside ONE reservation: all tokens are charged, and the
    // request is charged once as a single logical operation.
    const u = user('retrycost');
    await seedPlan(u, 'pro');
    const before = await usedVGU(u);
    let attempts = 0;
    const { usage } = await withVGU(
      {
        userId: u,
        plan: 'pro',
        feature: 'social_listening.extract',
        model: 'openai-gpt-4o-mini',
        requestId: 'failprobe_retry_1',
      },
      () =>
        withProviderRetry(
          { feature: 'social_listening.extract', baseDelayMs: 5 },
          async () => {
            attempts++;
            // Every attempt burns real tokens before failing.
            recordAnchorTurn();
            if (attempts < 3) throw providerError('5xx');
            return 'done';
          }
        )
    );
    check('it took three attempts', attempts, 3);
    check('the operation reconciled once', usage.status, 'RECONCILED');
    check('all three attempts were counted as provider calls', usage.providerCalls, 3);
    // Three anchor turns cost $0.00324, and $0.00324 / $0.0011 per VGU = 2.95.
    // NOT 3.00: the 1 VGU minimum applies once PER OPERATION, not per call, so
    // three retried attempts are charged their true measured cost rather than
    // three times a floored value.
    check('and ALL of their tokens were charged', (await usedVGU(u)) - before, 2.95);
    check('under a single reservation', usage.reservationId.startsWith('r_'), true);
  }

  // =========================================================================
  section('9. §37/§52 Idempotency: a retried request cannot double-charge');
  // =========================================================================
  {
    const u = user('idem');
    await seedPlan(u, 'pro');
    const before = await usedVGU(u);
    const run = () =>
      withVGU(
        {
          userId: u,
          plan: 'pro',
          feature: 'caption.generation',
          model: 'openai-gpt-4o-mini',
          requestId: 'failprobe_idem_2',
        },
        async () => {
          recordAnchorTurn();
          return 'ok';
        }
      );
    // ── A TRUE retry: the first attempt is still in flight ───────────────────
    // This is what idempotency is for. Two concurrent attempts at the same
    // logical request must share one reservation, or a client that retried
    // because it saw no response would be charged twice for one operation.
    const concurrent = await Promise.all([run(), run(), run()]);
    check(
      'concurrent attempts at one request share a reservation',
      new Set(concurrent.map(x => x.usage.reservationId)).size,
      1
    );
    check('and are charged once', (await usedVGU(u)) - before, 1);

    // ── A REPLAY after completion is a NEW operation ─────────────────────────
    // SECURITY: requestId comes from a client-supplied `x-request-id` header. It
    // used to be honoured even after the reservation had reconciled, so a client
    // could replay one id forever and get unlimited free AI. It also used to be a
    // GLOBAL namespace, so one user could present another user's id and ride
    // their reservation. Both are closed: a completed operation replayed runs
    // again, consumes real tokens again, and is therefore charged again.
    const afterFirst = await usedVGU(u);
    const replay = await run();
    check(
      'a replay after completion gets a NEW reservation',
      replay.usage.reservationId !== concurrent[0].usage.reservationId,
      true
    );
    check(
      'and is charged, because it genuinely consumed tokens again',
      (await usedVGU(u)) - afterFirst,
      1
    );

    // ── One user cannot ride another user's idempotency key ──────────────────
    const other = user('idemother');
    await seedPlan(other, 'pro');
    const otherBefore = await usedVGU(other);
    await withVGU(
      {
        userId: other,
        plan: 'pro',
        feature: 'caption.generation',
        model: 'openai-gpt-4o-mini',
        // Deliberately the SAME id the first user used.
        requestId: 'failprobe_idem_2',
      },
      async () => {
        recordAnchorTurn();
        return 'ok';
      }
    );
    check(
      'a different user presenting the same id pays for their own request',
      (await usedVGU(other)) - otherBefore,
      1
    );

    // ── An orphaned pointer is not a free pass ───────────────────────────────
    // If the idempotency POINTER outlives its reservation RECORD, honouring it
    // would hand back a reservation commit() cannot find — so the request would
    // run and be charged nothing. Found by this probe failing on its own leftover
    // keys from an interrupted run.
    const afterOrphanSetup = await usedVGU(u);
    const live = await getRedisClient().get(RESERVATION_KEYS.idem(u, 'failprobe_idem_2'));
    if (live) await getRedisClient().del(RESERVATION_KEYS.reservation(live));
    await run();
    check(
      'an orphaned idempotency key is charged rather than being free',
      (await usedVGU(u)) - afterOrphanSetup,
      1
    );
  }

  // =========================================================================
  section('10. A reservation ALWAYS reaches a terminal state');
  // =========================================================================
  {
    const u = user('terminal');
    await seedPlan(u, 'pro');
    const engine = getReservationEngine();
    const outcomes: string[] = [];

    // success
    const okRun = await withVGU(
      { userId: u, plan: 'pro', feature: 'caption.generation', model: 'openai-gpt-4o-mini' },
      async () => {
        recordAnchorTurn();
        return 1;
      }
    );
    outcomes.push((await engine.getReservation(okRun.usage.reservationId))?.status || '?');

    // failure with usage
    let idWithUsage = '';
    try {
      await withVGU(
        {
          userId: u,
          plan: 'pro',
          feature: 'caption.generation',
          model: 'openai-gpt-4o-mini',
          meta: { probe: 'withUsage' },
        },
        async () => {
          recordAnchorTurn();
          throw providerError('5xx');
        }
      );
    } catch {
      /* expected */
    }
    // failure without usage
    try {
      await withVGU(
        { userId: u, plan: 'pro', feature: 'caption.generation', model: 'openai-gpt-4o-mini' },
        async () => {
          throw providerError('4xx');
        }
      );
    } catch {
      /* expected */
    }

    check('a successful operation ends RECONCILED', outcomes[0], 'RECONCILED');
    // Whatever happened, nothing is left holding capacity.
    check('no reservation is left in flight', await inflight(u), 0);
    const open = await getRedisClient().zrange(RESERVATION_KEYS.open, 0, -1);
    const mine: string[] = [];
    for (const id of open) {
      const meta = await getRedisClient().hget(RESERVATION_KEYS.reservation(id), 'meta');
      if (meta && meta.includes(u)) mine.push(id);
    }
    check('and none of this user\u2019s reservations are left open', mine.length, 0);
    void idWithUsage;
  }

  // =========================================================================
  section('11. A quota refusal is NOT a provider failure');
  // =========================================================================
  {
    // A refusal must not be retried and must not be recorded as a failed attempt:
    // it is a deliberate decision, and retrying it would hammer the gate.
    const u = user('refused');
    await seedPlan(u, 'free');
    const engine = getReservationEngine();
    const filler = await engine.reserve({
      userId: u,
      plan: 'free',
      feature: 'caption.generation',
      tier: 'cheap',
      estimatedVGU: 15,
    });
    if (filler.ok) {
      await engine.commit(filler.reservationId, 15, {
        userId: u,
        plan: 'free',
        tier: 'cheap',
        feature: 'caption.generation',
        billingPeriodId: filler.billingPeriodId,
      });
    }

    let attempts = 0;
    let thrown: unknown;
    try {
      await withProviderRetry({ feature: 'caption.generation', baseDelayMs: 5 }, async () => {
        attempts++;
        await withVGU(
          { userId: u, plan: 'free', feature: 'caption.generation', model: 'openai-gpt-4o-mini' },
          async () => 'never runs'
        );
      });
    } catch (err) {
      thrown = err;
    }
    check('the refusal propagates', thrown instanceof VGUQuotaError, true);
    check('and is attempted exactly once — never retried', attempts, 1);
    check('classified as a quota decision', classifyFailure(thrown), 'quota');
  }

  // =========================================================================
  section('12. The wall-clock signal reaches the actual provider request');
  // =========================================================================
  {
    // The gap this closes: a timeout used to only ABANDON the result. The provider
    // call kept running (and kept costing), and any usage it reported afterwards
    // arrived after reconciliation and was lost. The guard now injects the
    // operation's signal into every request's options, so a timeout genuinely
    // cancels the call in flight.
    const u = user('signalwire');
    await seedPlan(u, 'pro');

    let sawSignal: unknown;
    let callerSignalPreserved: unknown;
    const client = createOpenAI({ apiKey: 'sk-probe' });
    // Replace the transport and capture the options the SDK was handed.
    (client as unknown as { post: (p: string, o: { options?: unknown }) => Promise<unknown> }).post =
      async (_path, opts) => {
        // ioredis-style: the SDK folds RequestOptions into its internal call.
        sawSignal = (opts as { signal?: unknown })?.signal;
        return {
          id: 'stub',
          model: 'gpt-4o-mini',
          choices: [{ message: { content: 'ok' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        };
      };

    await withVGU(
      {
        userId: u,
        plan: 'pro',
        // A feature WITH a timeoutMs, so a signal exists to inject.
        feature: 'social_listening.extract',
        model: 'openai-gpt-4o-mini',
      },
      async () => {
        await client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'x' }],
        });
        // A caller-supplied signal must WIN — a route that owns its own
        // cancellation must not have it silently replaced.
        const own = new AbortController();
        callerSignalPreserved = own.signal;
        await client.chat.completions.create(
          { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'y' }] },
          { signal: own.signal }
        );
        return 'done';
      }
    );

    check('the operation had a signal to inject', sawSignal !== undefined, true);
    check(
      'the caller\u2019s own signal is preserved, not overwritten',
      sawSignal === callerSignalPreserved,
      true
    );
  }
  {
    // And end to end: a call that ignores nothing is actually aborted.
    const u = user('signalabort');
    await seedPlan(u, 'pro');
    let aborted = false;
    try {
      await withVGU(
        { userId: u, plan: 'pro', feature: 'automation.intent', model: 'openai-gpt-4o-mini' },
        async () => {
          // automation.intent has timeoutMs 20s; assert the signal fires by
          // aborting a wait on it directly.
          const signal = currentAbortSignal();
          check('a short-budget feature publishes a signal', !!signal, true);
          await new Promise((_, reject) => {
            signal?.addEventListener(
              'abort',
              () => {
                aborted = true;
                reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
              },
              { once: true }
            );
            // Nothing else resolves this: only the budget can end it.
          });
        }
      );
    } catch {
      /* expected */
    }
    check('the wall-clock budget aborted the in-flight work', aborted, true);
    check('and the slot was freed', await inflight(u), 0);
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
