/**
 * Tests for WebhookVerifier — Razorpay webhook signature verification and
 * replay/idempotency claiming.
 *
 * This is the single trust boundary for all inbound billing events: every plan
 * grant, renewal, cancellation and refund is applied on the strength of these
 * checks. A regression here means an attacker can forge billing events, so the
 * negative cases matter more than the positive one.
 *
 * Covers:
 *  - HMAC-SHA256 over the RAW body (Razorpay's documented scheme)
 *  - rejection of tampered bodies, wrong secrets, and malformed signatures
 *  - the atomic SET-NX claim that dedupes concurrent duplicate deliveries
 *  - release-on-failure so a failed handler can be retried
 */

import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { WebhookVerifier } from './WebhookVerifier';

const SECRET = 'whsec_test_secret_value';

function sign(body: string | Buffer, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

/**
 * Minimal in-memory stand-in for the subset of ioredis the verifier uses.
 * `set` honours the NX flag so the claim semantics are exercised for real
 * rather than mocked away.
 */
function createFakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    calls: [] as string[],
    async set(key: string, value: string, ..._args: unknown[]) {
      const nx = _args.some(a => String(a).toUpperCase() === 'NX');
      this.calls.push(`set:${key}`);
      if (nx && store.has(key)) return null;
      store.set(key, value);
      return 'OK';
    },
    async exists(key: string) {
      return store.has(key) ? 1 : 0;
    },
    async del(key: string) {
      return store.delete(key) ? 1 : 0;
    },
  };
}

describe('WebhookVerifier.verify — signature validation', () => {
  const verifier = new WebhookVerifier();
  const body = Buffer.from(
    JSON.stringify({ event: 'subscription.charged', payload: { a: 1 } })
  );

  it('accepts a correctly signed raw body', () => {
    expect(verifier.verify(body, sign(body), SECRET)).toBe(true);
  });

  it('rejects a body that was modified after signing (tampering)', () => {
    const signature = sign(body);
    const tampered = Buffer.from(
      JSON.stringify({ event: 'subscription.charged', payload: { a: 2 } })
    );
    expect(verifier.verify(tampered, signature, SECRET)).toBe(false);
  });

  it('rejects a signature produced with a different secret', () => {
    expect(verifier.verify(body, sign(body, 'wrong_secret'), SECRET)).toBe(
      false
    );
  });

  it('rejects an empty signature header', () => {
    expect(verifier.verify(body, '', SECRET)).toBe(false);
  });

  it('rejects when the webhook secret is not configured', () => {
    // Guards the misconfiguration case: an unset RAZORPAY_WEBHOOK_SECRET must
    // never degrade into "accept everything".
    expect(verifier.verify(body, sign(body), '')).toBe(false);
  });

  it('rejects a truncated signature without throwing', () => {
    // timingSafeEqual throws on length mismatch, so the length pre-check must
    // run first — otherwise a short signature becomes a 500 instead of a 401.
    const short = sign(body).slice(0, 32);
    expect(() => verifier.verify(body, short, SECRET)).not.toThrow();
    expect(verifier.verify(body, short, SECRET)).toBe(false);
  });

  it('rejects a same-length signature of non-hex garbage', () => {
    const garbage = 'z'.repeat(sign(body).length);
    expect(verifier.verify(body, garbage, SECRET)).toBe(false);
  });

  it('is sensitive to whitespace/byte differences in the raw body', () => {
    // Razorpay signs the exact bytes. Re-serialising JSON (e.g. if
    // express.json() consumed the body) changes them and must fail.
    const reSerialised = Buffer.from(
      JSON.stringify(JSON.parse(body.toString()), null, 2)
    );
    expect(verifier.verify(reSerialised, sign(body), SECRET)).toBe(false);
  });
});

describe('WebhookVerifier.claim — idempotency / replay protection', () => {
  const verifier = new WebhookVerifier();
  let redis: ReturnType<typeof createFakeRedis>;

  beforeEach(() => {
    redis = createFakeRedis();
  });

  it('grants the claim to the first caller only', async () => {
    const first = await verifier.claim('evt_1', redis as never);
    const second = await verifier.claim('evt_1', redis as never);

    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it('treats distinct event ids independently', async () => {
    expect(await verifier.claim('evt_a', redis as never)).toBe(true);
    expect(await verifier.claim('evt_b', redis as never)).toBe(true);
  });

  it('only one winner emerges from concurrent duplicate deliveries', async () => {
    // Razorpay can deliver the same event twice in parallel. The claim must be
    // atomic (SET NX) rather than check-then-act, or both would process and
    // double-apply the billing effect.
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        verifier.claim('evt_race', redis as never)
      )
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('release() allows a failed event to be reprocessed on retry', async () => {
    expect(await verifier.claim('evt_fail', redis as never)).toBe(true);
    // Handler threw → claim released → Razorpay's retry must be able to re-claim.
    await verifier.release('evt_fail', redis as never);
    expect(await verifier.claim('evt_fail', redis as never)).toBe(true);
  });

  it('release() is best-effort and never throws when Redis fails', async () => {
    const brokenRedis = {
      async del() {
        throw new Error('redis down');
      },
    };
    await expect(
      verifier.release('evt_x', brokenRedis as never)
    ).resolves.toBeUndefined();
  });

  it('markProcessed/isAlreadyProcessed round-trip', async () => {
    expect(await verifier.isAlreadyProcessed('evt_m', redis as never)).toBe(
      false
    );
    await verifier.markProcessed('evt_m', redis as never);
    expect(await verifier.isAlreadyProcessed('evt_m', redis as never)).toBe(
      true
    );
  });
});

describe('Razorpay client-side payment signature scheme', () => {
  // Mirrors the verification performed in subscription.controller.checkoutCallback
  // and the legacy order-based flows. Documented scheme:
  //   subscription checkout: HMAC(key_secret, `${payment_id}|${subscription_id}`)
  //   order checkout:        HMAC(key_secret, `${order_id}|${payment_id}`)
  const KEY_SECRET = 'rzp_test_key_secret';

  function verifyPair(a: string, b: string, provided: string): boolean {
    const expected = crypto
      .createHmac('sha256', KEY_SECRET)
      .update(`${a}|${b}`)
      .digest('hex');
    const e = Buffer.from(expected);
    const p = Buffer.from(provided);
    return e.length === p.length && crypto.timingSafeEqual(e, p);
  }

  it('accepts a genuine payment|subscription signature', () => {
    const sig = crypto
      .createHmac('sha256', KEY_SECRET)
      .update('pay_123|sub_456')
      .digest('hex');
    expect(verifyPair('pay_123', 'sub_456', sig)).toBe(true);
  });

  it('rejects a signature replayed onto a different subscription id', () => {
    // This is the attack the order/subscription binding checks defend against:
    // a valid signature for one entity must not validate for another.
    const sig = crypto
      .createHmac('sha256', KEY_SECRET)
      .update('pay_123|sub_456')
      .digest('hex');
    expect(verifyPair('pay_123', 'sub_OTHER', sig)).toBe(false);
  });

  it('rejects swapped operands', () => {
    const sig = crypto
      .createHmac('sha256', KEY_SECRET)
      .update('order_1|pay_1')
      .digest('hex');
    expect(verifyPair('pay_1', 'order_1', sig)).toBe(false);
  });
});
