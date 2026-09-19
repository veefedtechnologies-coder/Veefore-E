/**
 * claimNextSubscriptionModalEvent — INTEGRATION test.
 *
 * Drives the REAL controller against an in-memory MongoDB to prove the
 * once-per-event guarantees the premium modal host relies on:
 *
 *   1. only future-only, modalType-stamped events are ever returned;
 *   2. a claimed event is never returned again (concurrent claims included);
 *   3. renewals / historical rows without a modalType are never surfaced;
 *   4. a later genuine repurchase produces a separate, claimable event.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.RAZORPAY_KEY_ID = 'rzp_test_id';
process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret';

import {
  claimNextSubscriptionModalEvent,
  ackSubscriptionModalEvent,
} from '../controllers/subscription.controller';
import {
  SubscriptionEventModel,
  MODAL_CLAIM_LEASE_MS,
} from '../db/models/SubscriptionEventModel';

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
});

const USER = 'user_claim';

function makeReq(
  userId: string | null = USER,
  extra?: { params?: Record<string, string>; body?: Record<string, unknown> }
) {
  return {
    user: userId ? { id: userId } : undefined,
    params: extra?.params ?? {},
    body: extra?.body ?? {},
  } as never;
}

function makeRes() {
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
  };
  return {
    res: res as never,
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body as { event: Record<string, unknown> | null };
    },
  };
}

async function seedActivated(when: Date) {
  await SubscriptionEventModel.create({
    eventType: 'subscription.activated',
    userId: USER,
    subscriptionId: 'sub_1',
    previousStatus: 'pending_payment',
    newStatus: 'active',
    previousPlan: 'free',
    newPlan: 'pro',
    triggeredBy: 'webhook',
    modalType: 'premium_welcome',
    modalClaimedAt: null,
    metadata: {},
    timestamp: when,
  });
}

describe('claimNextSubscriptionModalEvent', () => {
  it('returns null when there are no eligible events', async () => {
    const r = makeRes();
    await claimNextSubscriptionModalEvent(makeReq(), r.res);
    expect(r.statusCode).toBe(200);
    expect(r.body.event).toBeNull();
  });

  it('401s when unauthenticated', async () => {
    const r = makeRes();
    await claimNextSubscriptionModalEvent(makeReq(null), r.res);
    expect(r.statusCode).toBe(401);
  });

  it('returns a stamped premium_welcome event and normalizes its fields', async () => {
    await seedActivated(new Date());

    const r = makeRes();
    await claimNextSubscriptionModalEvent(makeReq(), r.res);

    expect(r.statusCode).toBe(200);
    expect(r.body.event).toMatchObject({
      modalType: 'premium_welcome',
      newPlan: 'pro',
      previousPlan: 'free',
    });
  });

  it('never returns the same event twice', async () => {
    await seedActivated(new Date());

    const first = makeRes();
    await claimNextSubscriptionModalEvent(makeReq(), first.res);
    expect(first.body.event).not.toBeNull();

    const second = makeRes();
    await claimNextSubscriptionModalEvent(makeReq(), second.res);
    expect(second.body.event).toBeNull();
  });

  it('returns the event to exactly one of two concurrent claims', async () => {
    await seedActivated(new Date());

    const a = makeRes();
    const b = makeRes();
    await Promise.all([
      claimNextSubscriptionModalEvent(makeReq(), a.res),
      claimNextSubscriptionModalEvent(makeReq(), b.res),
    ]);

    const winners = [a.body.event, b.body.event].filter(Boolean);
    expect(winners).toHaveLength(1);
  });

  it('ignores events without a modalType (renewals / historical rows)', async () => {
    await SubscriptionEventModel.create({
      eventType: 'subscription.charged',
      userId: USER,
      subscriptionId: 'sub_1',
      previousStatus: 'active',
      newStatus: 'active',
      previousPlan: 'pro',
      newPlan: 'pro',
      triggeredBy: 'webhook',
      modalType: null,
      modalClaimedAt: null,
      metadata: {},
      timestamp: new Date(),
    });

    const r = makeRes();
    await claimNextSubscriptionModalEvent(makeReq(), r.res);
    expect(r.body.event).toBeNull();
  });

  it('surfaces a later repurchase as a separate claimable event', async () => {
    // First purchase — recent, claimed AND acknowledged.
    await seedActivated(new Date(Date.now() - 60_000));
    const first = makeRes();
    await claimNextSubscriptionModalEvent(makeReq(), first.res);
    expect(first.body.event).not.toBeNull();
    const firstId = first.body.event?.id as string;
    const ack = makeRes();
    await ackSubscriptionModalEvent(
      makeReq(USER, { params: { id: firstId } }),
      ack.res
    );

    // A genuine repurchase — a brand-new event document.
    await seedActivated(new Date());
    const second = makeRes();
    await claimNextSubscriptionModalEvent(makeReq(), second.res);
    expect(second.body.event).not.toBeNull();

    // And then nothing left.
    const third = makeRes();
    await claimNextSubscriptionModalEvent(makeReq(), third.res);
    expect(third.body.event).toBeNull();
  });

  it('never surfaces a stale event older than the freshness window', async () => {
    // A historical / test event from hours ago must never resurface — this is
    // the fix for the "modal always shows" backlog-replay bug.
    await seedActivated(new Date(Date.now() - 2 * 60 * 60 * 1000));

    const r = makeRes();
    await claimNextSubscriptionModalEvent(makeReq(), r.res);
    expect(r.body.event).toBeNull();
  });

  it('claims the oldest eligible event first', async () => {
    await SubscriptionEventModel.create({
      eventType: 'addon.credit_pack_purchased',
      userId: USER,
      subscriptionId: 'order_old',
      previousStatus: null,
      newStatus: null,
      previousPlan: null,
      newPlan: null,
      triggeredBy: 'webhook',
      modalType: 'credit_purchase_success',
      modalClaimedAt: null,
      metadata: { credits: 500, quantity: 1, addonType: 'ai_credits_500' },
      timestamp: new Date(Date.now() - 10_000),
    });
    await seedActivated(new Date());

    const r = makeRes();
    await claimNextSubscriptionModalEvent(makeReq(), r.res);
    expect(r.body.event?.modalType).toBe('credit_purchase_success');
    expect(r.body.event?.credits).toBe(500);
  });

  // ── Lease-and-ack (crash-safe delivery) ──────────────────────────────────

  it('re-offers a leased event whose lease has expired (crashed claim recovers)', async () => {
    await seedActivated(new Date());

    // First claim leases the event.
    const first = makeRes();
    await claimNextSubscriptionModalEvent(makeReq(), first.res);
    const id = first.body.event?.id as string;
    expect(id).toBeTruthy();

    // A second claim right away must NOT re-offer it (lease still valid).
    const second = makeRes();
    await claimNextSubscriptionModalEvent(makeReq(), second.res);
    expect(second.body.event).toBeNull();

    // Simulate a crash: the client never acked. Age the lease past expiry.
    await SubscriptionEventModel.updateOne(
      { _id: id },
      {
        $set: {
          modalClaimedAt: new Date(Date.now() - MODAL_CLAIM_LEASE_MS - 1000),
        },
      }
    );

    // Now it is claimable again — the event was never lost.
    const third = makeRes();
    await claimNextSubscriptionModalEvent(makeReq(), third.res);
    expect(third.body.event?.id).toBe(id);
  });

  it('never re-offers an acknowledged event, even after the lease expires', async () => {
    await seedActivated(new Date());

    const claim = makeRes();
    await claimNextSubscriptionModalEvent(makeReq(), claim.res);
    const id = claim.body.event?.id as string;
    expect(id).toBeTruthy();

    // Acknowledge (permanent consume).
    const ack = makeRes();
    await ackSubscriptionModalEvent(makeReq(USER, { params: { id } }), ack.res);
    expect((ack.body as { success?: boolean }).success).toBe(true);

    // Even after the lease would have expired, an acked event is gone for good.
    await SubscriptionEventModel.updateOne(
      { _id: id },
      {
        $set: {
          modalClaimedAt: new Date(Date.now() - MODAL_CLAIM_LEASE_MS - 1000),
        },
      }
    );

    const after = makeRes();
    await claimNextSubscriptionModalEvent(makeReq(), after.res);
    expect(after.body.event).toBeNull();
  });

  it('renew (heartbeat) extends the lease so an open modal is not re-claimed', async () => {
    await seedActivated(new Date());

    const claim = makeRes();
    await claimNextSubscriptionModalEvent(makeReq(), claim.res);
    const id = claim.body.event?.id as string;

    // Age the lease to just past expiry (as if the modal stayed open a while).
    await SubscriptionEventModel.updateOne(
      { _id: id },
      {
        $set: {
          modalClaimedAt: new Date(Date.now() - MODAL_CLAIM_LEASE_MS - 1000),
        },
      }
    );

    // Heartbeat renews the lease.
    const renew = makeRes();
    await ackSubscriptionModalEvent(
      makeReq(USER, { params: { id }, body: { renew: true } }),
      renew.res
    );
    expect((renew.body as { success?: boolean }).success).toBe(true);

    // A concurrent claim must NOT steal it now that the lease was renewed.
    const other = makeRes();
    await claimNextSubscriptionModalEvent(makeReq(), other.res);
    expect(other.body.event).toBeNull();
  });

  it('ack rejects a malformed id and ignores a foreign event id', async () => {
    // Malformed id → 400.
    const bad = makeRes();
    await ackSubscriptionModalEvent(
      makeReq(USER, { params: { id: 'nope' } }),
      bad.res
    );
    expect(bad.statusCode).toBe(400);

    // Another user's event → benign no-op (success:false), never consumed.
    await seedActivated(new Date());
    const claim = makeRes();
    await claimNextSubscriptionModalEvent(makeReq(), claim.res);
    const id = claim.body.event?.id as string;

    const foreign = makeRes();
    await ackSubscriptionModalEvent(
      makeReq('someone_else', { params: { id } }),
      foreign.res
    );
    expect((foreign.body as { success?: boolean }).success).toBe(false);

    // Still owned/leased by USER — after lease expiry it re-offers to USER only.
    await SubscriptionEventModel.updateOne(
      { _id: id },
      {
        $set: {
          modalClaimedAt: new Date(Date.now() - MODAL_CLAIM_LEASE_MS - 1000),
        },
      }
    );
    const reclaim = makeRes();
    await claimNextSubscriptionModalEvent(makeReq(), reclaim.res);
    expect(reclaim.body.event?.id).toBe(id);
  });
});
