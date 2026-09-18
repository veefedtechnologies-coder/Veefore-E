/**
 * Razorpay webhook — INTEGRATION test.
 *
 * Unlike the unit tests (which check logic in isolation), this drives the REAL
 * `handleRazorpayWebhook` controller against a REAL in-memory MongoDB, posting
 * genuinely HMAC-signed payloads shaped like Razorpay's, and asserts the actual
 * database effects. It answers the question "does the webhook land and do the
 * right thing" for the three money flows:
 *
 *   1. purchase        → `subscription.activated` grants the plan + first-cycle credits
 *   2. cancellation    → `subscription.cancelled` flags cancel-at-period-end (access kept)
 *   3. buy credit pack → `payment.captured` grants prepaid credits, exactly once
 *
 * Only true external I/O is mocked — Redis (an in-memory fake that honours SET
 * NX so idempotency is exercised for real), Resend email, the QuotaNotifier, and
 * the Razorpay REST client (order lookup). Everything else — signature
 * verification, idempotency claim/release, payload routing, and every DB write —
 * runs for real.
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from 'vitest';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const WEBHOOK_SECRET = 'whsec_integration_test';
process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.RAZORPAY_KEY_ID = 'dummy_razorpay_key_test_key';
process.env.RAZORPAY_KEY_SECRET = 'dummy_razorpay_key_test_secret';

// ── Mock external I/O only ──────────────────────────────────────────────────

// In-memory Redis honouring SET ... NX so the webhook's idempotency claim and
// the exactly-once behaviour are genuinely exercised, not stubbed away.
const { fakeRedis } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    fakeRedis: {
      store,
      async set(key: string, value: string, ...args: unknown[]) {
        const nx = args.map(String).some(a => a.toUpperCase() === 'NX');
        if (nx && store.has(key)) return null;
        store.set(key, value);
        return 'OK';
      },
      async get(key: string) {
        return store.has(key) ? store.get(key)! : null;
      },
      async del(key: string) {
        return store.delete(key) ? 1 : 0;
      },
      async exists(key: string) {
        return store.has(key) ? 1 : 0;
      },
      async expire() {
        return 1;
      },
    },
  };
});

vi.mock('../../../lib/redis', () => ({
  getRedisClient: () => fakeRedis,
  getRedisOptions: () => ({}),
}));

vi.mock('../../../services/resend.service', () => ({
  sendInvoiceEmail: vi.fn().mockResolvedValue(undefined),
  sendRefundEmail: vi.fn().mockResolvedValue(undefined),
  sendCancellationEmail: vi.fn().mockResolvedValue(undefined),
  sendQuotaAlertEmail: vi.fn().mockResolvedValue(undefined),
  sendPaymentFailedEmail: vi.fn().mockResolvedValue(undefined),
  sendPreRenewalEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/QuotaNotifier', () => ({
  quotaNotifier: {
    sendCancellationConfirmation: vi.fn().mockResolvedValue(undefined),
    sendCreditPurchaseConfirmation: vi.fn().mockResolvedValue(undefined),
    sendPaymentFailedNotification: vi.fn().mockResolvedValue(undefined),
    sendPreRenewalNotification: vi.fn().mockResolvedValue(undefined),
    checkAndNotify: vi.fn().mockResolvedValue(undefined),
  },
  QuotaNotifier: class {},
  NotificationLogModel: {},
}));

const getOrderMock = vi.fn();
vi.mock('../services/RazorpaySubscriptionService', () => ({
  razorpaySubscriptionService: {
    getOrder: (...args: unknown[]) => getOrderMock(...args),
    getPayment: vi.fn(),
    getSubscription: vi.fn(),
    createPlan: vi.fn(),
    createSubscription: vi.fn(),
  },
  RazorpaySubscriptionService: class {},
}));

// Imported AFTER the mocks are registered.
import { handleRazorpayWebhook } from '../controllers/webhook.controller';
import SubscriptionModel from '../db/models/SubscriptionModel';
import AICreditsModel from '../db/models/AICreditsModel';
import PaymentModel from '../db/models/PaymentModel';
import { SubscriptionEventModel } from '../db/models/SubscriptionEventModel';

// ── Test harness ─────────────────────────────────────────────────────────────

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}, 60_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  const db = mongoose.connection.db;
  if (db) {
    const collections = await db.collections();
    await Promise.all(collections.map(c => c.deleteMany({})));
  }
  fakeRedis.store.clear();
  vi.clearAllMocks();
});

/** POST a signed event through the real controller; returns the fake response. */
async function postWebhook(
  event: Record<string, unknown>,
  opts: { eventId?: string; tamper?: boolean } = {}
) {
  const raw = Buffer.from(JSON.stringify(event));
  const signature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(raw)
    .digest('hex');

  const req = {
    body: raw,
    headers: {
      'x-razorpay-signature': opts.tamper ? 'deadbeef' : signature,
      ...(opts.eventId ? { 'x-razorpay-event-id': opts.eventId } : {}),
    },
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  } as never;

  let statusCode = 0;
  let body: unknown;
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: unknown) {
      body = payload;
      return this;
    },
  } as never;

  await handleRazorpayWebhook(req, res);
  return { statusCode, body: body as Record<string, unknown> };
}

const SECONDS = (d: Date) => Math.floor(d.getTime() / 1000);

// ── Signature gate ───────────────────────────────────────────────────────────

describe('webhook security gate', () => {
  it('rejects an invalid signature with 401 and does nothing', async () => {
    const res = await postWebhook(
      { event: 'subscription.activated', payload: {} },
      { tamper: true }
    );
    expect(res.statusCode).toBe(401);
  });
});

// ── 1. Purchase ────────────────────────────────────────────────────────────

describe('purchase — subscription.activated', () => {
  const RZP_SUB = 'sub_purchase_1';

  async function seedPendingSubscription() {
    const now = new Date();
    await SubscriptionModel.create({
      userId: 'user_purchase',
      workspaceId: 'ws_1',
      plan: 'free',
      pendingPlan: 'creator',
      billingCycle: 'monthly',
      status: 'pending_payment',
      currentPeriodStart: now,
      currentPeriodEnd: now,
      nextBillingDate: now,
      razorpaySubscriptionId: RZP_SUB,
    });
  }

  function activatedEvent() {
    const start = new Date();
    const end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return {
      event: 'subscription.activated',
      payload: {
        subscription: {
          entity: {
            id: RZP_SUB,
            current_start: SECONDS(start),
            current_end: SECONDS(end),
            notes: { veefore_plan_id: 'creator' },
          },
        },
        payment: { entity: { id: 'pay_purchase_1', amount: 79900 } },
      },
    };
  }

  it('lands (200) and activates the paid plan', async () => {
    await seedPendingSubscription();

    const res = await postWebhook(activatedEvent(), { eventId: 'evt_act_1' });
    expect(res.statusCode).toBe(200);

    const sub = await SubscriptionModel.findOne({
      userId: 'user_purchase',
    }).lean();
    expect(sub?.status).toBe('active');
    expect(sub?.plan).toBe('creator');
    expect(sub?.pendingPlan).toBeNull();
  });

  it('allocates the first-cycle AI credit allowance (creator = 500)', async () => {
    await seedPendingSubscription();
    await postWebhook(activatedEvent(), { eventId: 'evt_act_2' });

    const credits = await AICreditsModel.findOne({
      userId: 'user_purchase',
    }).lean();
    expect(credits?.monthlyCredits).toBe(500);
    expect(credits?.remainingCredits).toBe(500);
  });

  it('writes an audit event for the activation', async () => {
    await seedPendingSubscription();
    await postWebhook(activatedEvent(), { eventId: 'evt_act_3' });

    const events = await SubscriptionEventModel.find({
      userId: 'user_purchase',
    }).lean();
    expect(events.length).toBeGreaterThan(0);
  });

  it('is idempotent — a duplicate delivery is acknowledged without reprocessing', async () => {
    await seedPendingSubscription();
    const first = await postWebhook(activatedEvent(), { eventId: 'evt_dupe' });
    const second = await postWebhook(activatedEvent(), { eventId: 'evt_dupe' });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.body.status).toBe('already_processed');
  });
});

// ── 2. Cancellation ──────────────────────────────────────────────────────────

describe('cancellation — subscription.cancelled', () => {
  const RZP_SUB = 'sub_cancel_1';

  it('flags cancel-at-period-end and KEEPS access while still paid through', async () => {
    const now = new Date();
    const periodEnd = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    await SubscriptionModel.create({
      userId: 'user_cancel',
      workspaceId: 'ws_1',
      plan: 'creator',
      billingCycle: 'monthly',
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      nextBillingDate: periodEnd,
      razorpaySubscriptionId: RZP_SUB,
    });

    const res = await postWebhook(
      {
        event: 'subscription.cancelled',
        payload: { subscription: { entity: { id: RZP_SUB } } },
      },
      { eventId: 'evt_cancel_1' }
    );
    expect(res.statusCode).toBe(200);

    const sub = await SubscriptionModel.findOne({
      userId: 'user_cancel',
    }).lean();
    // No grace period is removed early: plan stays until currentPeriodEnd.
    expect(sub?.cancelAtPeriodEnd).toBe(true);
    expect(sub?.plan).toBe('creator');
    expect(sub?.status).toBe('active');
  });

  it('downgrades immediately to free once the paid-through date has passed', async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await SubscriptionModel.create({
      userId: 'user_cancel_expired',
      workspaceId: 'ws_1',
      plan: 'creator',
      billingCycle: 'monthly',
      status: 'active',
      currentPeriodStart: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: past,
      nextBillingDate: past,
      razorpaySubscriptionId: 'sub_cancel_2',
    });

    await postWebhook(
      {
        event: 'subscription.cancelled',
        payload: {
          entity: {},
          subscription: {
            entity: { id: 'sub_cancel_2', ended_at: SECONDS(past) },
          },
        },
      },
      { eventId: 'evt_cancel_2' }
    );

    const sub = await SubscriptionModel.findOne({
      userId: 'user_cancel_expired',
    }).lean();
    expect(sub?.status).toBe('cancelled');
    expect(sub?.plan).toBe('free');
    expect(sub?.cancelAtPeriodEnd).toBe(false);
  });
});

// ── 3. Buy credit pack ───────────────────────────────────────────────────────

describe('buy credit pack — payment.captured', () => {
  const ORDER_ID = 'order_credits_1';
  const PAYMENT_ID = 'pay_credits_1';

  async function seedCreditsAccount(remaining = 100) {
    // A prepaid pack tops up an EXISTING credits account (created on subscribe).
    await AICreditsModel.create({
      userId: 'user_credits',
      remainingCredits: remaining,
      monthlyCredits: remaining,
      purchasedCredits: 0,
      rolloverCredits: 0,
      usedThisCycle: 0,
      lastResetAt: new Date(),
      nextResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
  }

  function orderPaidResponse() {
    return {
      id: ORDER_ID,
      status: 'paid',
      amount: 29900,
      currency: 'INR',
      notes: {
        veefore_purpose: 'ai_credit_pack',
        veefore_user_id: 'user_credits',
        veefore_addon_type: 'ai_credits_500',
        veefore_quantity: '1',
        veefore_credits: '500',
      },
    };
  }

  function capturedEvent() {
    return {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: PAYMENT_ID,
            order_id: ORDER_ID,
            amount: 29900,
            currency: 'INR',
            method: 'upi',
            created_at: SECONDS(new Date()),
          },
        },
      },
    };
  }

  it('grants the purchased credits after a confirmed capture', async () => {
    await seedCreditsAccount(100);
    getOrderMock.mockResolvedValue(orderPaidResponse());

    const res = await postWebhook(capturedEvent(), { eventId: 'evt_cap_1' });
    expect(res.statusCode).toBe(200);

    const credits = await AICreditsModel.findOne({
      userId: 'user_credits',
    }).lean();
    expect(credits?.purchasedCredits).toBe(500);
    expect(credits?.remainingCredits).toBe(600); // 100 existing + 500 purchased

    // A Payment row is recorded for reconciliation/refunds.
    const payment = await PaymentModel.findOne({
      razorpayPaymentId: PAYMENT_ID,
    }).lean();
    expect(payment?.source).toBe('credits');
  });

  it('does NOT double-credit when the same payment is delivered twice', async () => {
    await seedCreditsAccount(100);
    getOrderMock.mockResolvedValue(orderPaidResponse());

    // Two deliveries with DIFFERENT event ids so the Redis dedup does not mask
    // the test — this exercises the payment-level exactly-once guard (the unique
    // Payment row), which is the real protection against double-crediting.
    await postWebhook(capturedEvent(), { eventId: 'evt_cap_a' });
    await postWebhook(capturedEvent(), { eventId: 'evt_cap_b' });

    const credits = await AICreditsModel.findOne({
      userId: 'user_credits',
    }).lean();
    expect(credits?.purchasedCredits).toBe(500); // granted once, not 1000
    expect(credits?.remainingCredits).toBe(600);

    const paymentCount = await PaymentModel.countDocuments({
      razorpayPaymentId: PAYMENT_ID,
    });
    expect(paymentCount).toBe(1);
  });

  it('refuses to grant when the captured amount is short of the pack price', async () => {
    await seedCreditsAccount(100);
    getOrderMock.mockResolvedValue(orderPaidResponse());

    // Paid only 100 paise for a 29,900-paise pack.
    const shortEvent = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_short',
            order_id: ORDER_ID,
            amount: 100,
            currency: 'INR',
            method: 'upi',
            created_at: SECONDS(new Date()),
          },
        },
      },
    };

    await postWebhook(shortEvent, { eventId: 'evt_short' });

    const credits = await AICreditsModel.findOne({
      userId: 'user_credits',
    }).lean();
    expect(credits?.purchasedCredits).toBe(0); // nothing granted
  });

  it('ignores an order that is not an AI credit pack', async () => {
    await seedCreditsAccount(100);
    getOrderMock.mockResolvedValue({
      id: ORDER_ID,
      status: 'paid',
      amount: 29900,
      notes: { veefore_purpose: 'something_else' },
    });

    const res = await postWebhook(capturedEvent(), { eventId: 'evt_other' });
    expect(res.statusCode).toBe(200);

    const credits = await AICreditsModel.findOne({
      userId: 'user_credits',
    }).lean();
    expect(credits?.purchasedCredits).toBe(0);
  });
});

// ── 4. Premium modal eligibility (once-per-event, never on renewals) ─────────

describe('premium modal eligibility', () => {
  it('arms premium_welcome exactly once on a first-charge activation', async () => {
    const now = new Date();
    await SubscriptionModel.create({
      userId: 'user_modal_act',
      workspaceId: 'ws_1',
      plan: 'free',
      pendingPlan: 'creator',
      billingCycle: 'monthly',
      status: 'pending_payment',
      currentPeriodStart: now,
      currentPeriodEnd: now,
      nextBillingDate: now,
      razorpaySubscriptionId: 'sub_modal_act',
    });

    const start = new Date();
    const end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await postWebhook(
      {
        event: 'subscription.activated',
        payload: {
          subscription: {
            entity: {
              id: 'sub_modal_act',
              current_start: SECONDS(start),
              current_end: SECONDS(end),
              notes: { veefore_plan_id: 'creator' },
            },
          },
          payment: { entity: { id: 'pay_modal_act', amount: 79900 } },
        },
      },
      { eventId: 'evt_modal_act' }
    );

    const eligible = await SubscriptionEventModel.find({
      userId: 'user_modal_act',
      modalType: 'premium_welcome',
      modalClaimedAt: null,
    }).lean();
    expect(eligible).toHaveLength(1);
    expect(eligible[0].newPlan).toBe('creator');
  });

  it('never arms a modal for a recurring renewal charge', async () => {
    const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await SubscriptionModel.create({
      userId: 'user_modal_renew',
      workspaceId: 'ws_1',
      plan: 'creator',
      billingCycle: 'monthly',
      status: 'active',
      currentPeriodStart: start,
      currentPeriodEnd: end,
      nextBillingDate: end,
      razorpaySubscriptionId: 'sub_modal_renew',
    });

    const newStart = new Date();
    const newEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await postWebhook(
      {
        event: 'subscription.charged',
        payload: {
          subscription: {
            entity: {
              id: 'sub_modal_renew',
              current_start: SECONDS(newStart),
              current_end: SECONDS(newEnd),
              notes: { veefore_plan_id: 'creator' },
            },
          },
          payment: { entity: { id: 'pay_modal_renew', amount: 79900 } },
        },
      },
      { eventId: 'evt_modal_renew' }
    );

    // The renewal must be audited, but with NO modalType — so it can never be
    // claimed by the premium modal host.
    const charged = await SubscriptionEventModel.findOne({
      userId: 'user_modal_renew',
      eventType: 'subscription.charged',
    }).lean();
    expect(charged).toBeTruthy();
    expect(charged?.modalType ?? null).toBeNull();

    const eligible = await SubscriptionEventModel.countDocuments({
      userId: 'user_modal_renew',
      modalType: { $ne: null },
      modalClaimedAt: null,
    });
    expect(eligible).toBe(0);
  });

  it('arms credit_purchase_success only after webhook-confirmed fulfilment', async () => {
    await AICreditsModel.create({
      userId: 'user_modal_credits',
      remainingCredits: 100,
      monthlyCredits: 100,
      purchasedCredits: 0,
      rolloverCredits: 0,
      usedThisCycle: 0,
      lastResetAt: new Date(),
      nextResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    getOrderMock.mockResolvedValue({
      id: 'order_modal_credits',
      status: 'paid',
      amount: 29900,
      currency: 'INR',
      notes: {
        veefore_purpose: 'ai_credit_pack',
        veefore_user_id: 'user_modal_credits',
        veefore_addon_type: 'ai_credits_500',
        veefore_quantity: '1',
        veefore_credits: '500',
      },
    });

    await postWebhook(
      {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_modal_credits',
              order_id: 'order_modal_credits',
              amount: 29900,
              currency: 'INR',
              method: 'upi',
              created_at: SECONDS(new Date()),
            },
          },
        },
      },
      { eventId: 'evt_modal_credits' }
    );

    const eligible = await SubscriptionEventModel.find({
      userId: 'user_modal_credits',
      modalType: 'credit_purchase_success',
      modalClaimedAt: null,
    }).lean();
    expect(eligible).toHaveLength(1);
    expect((eligible[0].metadata as { credits?: number }).credits).toBe(500);
  });
});
