/**
 * getPaymentUpdateLink — INTEGRATION test.
 *
 * Verifies the grace-period "update payment method" endpoint only issues a
 * Razorpay hosted link when the subscription is genuinely in a renewal-failure
 * state, and refuses otherwise (so it can't mint checkout URLs for healthy
 * subscriptions).
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
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.RAZORPAY_KEY_ID = 'dummy_razorpay_key_test_key';
process.env.RAZORPAY_KEY_SECRET = 'dummy_razorpay_key_test_secret';

// In-memory Redis so getServices() never opens a real connection.
const { fakeRedis } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    fakeRedis: {
      store,
      async set() {
        return 'OK';
      },
      async get() {
        return null;
      },
      async del() {
        return 1;
      },
      async exists() {
        return 0;
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

const getSubscriptionMock = vi.fn();
vi.mock('../services/RazorpaySubscriptionService', () => ({
  razorpaySubscriptionService: {
    getSubscription: (...args: unknown[]) => getSubscriptionMock(...args),
    getOrder: vi.fn(),
    getPayment: vi.fn(),
    createPlan: vi.fn(),
    createSubscription: vi.fn(),
  },
  RazorpaySubscriptionService: class {},
}));

import { getPaymentUpdateLink } from '../controllers/subscription.controller';
import SubscriptionModel from '../db/models/SubscriptionModel';

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
  vi.clearAllMocks();
});

const USER = 'user_grace';

function makeReq() {
  return { user: { id: USER }, body: {} } as never;
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
      return body as Record<string, unknown>;
    },
  };
}

async function seed(status: string) {
  const now = new Date();
  await SubscriptionModel.create({
    userId: USER,
    workspaceId: 'ws_1',
    plan: 'creator',
    billingCycle: 'monthly',
    status,
    currentPeriodStart: now,
    currentPeriodEnd: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    nextBillingDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    pastDueGraceEndsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    renewalRetryCount: 1,
    razorpaySubscriptionId: 'sub_grace_1',
  });
}

describe('getPaymentUpdateLink', () => {
  it('returns the Razorpay short_url when past_due', async () => {
    await seed('past_due');
    getSubscriptionMock.mockResolvedValue({
      id: 'sub_grace_1',
      short_url: 'https://rzp.io/i/abc123',
    });

    const r = makeRes();
    await getPaymentUpdateLink(makeReq(), r.res);

    expect(r.statusCode).toBe(200);
    expect(r.body.shortUrl).toBe('https://rzp.io/i/abc123');
  });

  it('refuses when the subscription is healthy (active)', async () => {
    await seed('active');

    const r = makeRes();
    await getPaymentUpdateLink(makeReq(), r.res);

    expect(r.statusCode).toBe(400);
    expect(getSubscriptionMock).not.toHaveBeenCalled();
  });

  it('404s when there is no subscription', async () => {
    const r = makeRes();
    await getPaymentUpdateLink(makeReq(), r.res);
    expect(r.statusCode).toBe(404);
  });

  it('502s when Razorpay returns no short_url', async () => {
    await seed('payment_failed');
    getSubscriptionMock.mockResolvedValue({ id: 'sub_grace_1' });

    const r = makeRes();
    await getPaymentUpdateLink(makeReq(), r.res);
    expect(r.statusCode).toBe(502);
  });
});
