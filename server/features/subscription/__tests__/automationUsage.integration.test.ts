/**
 * Automation conversation usage accounting — INTEGRATION test.
 *
 * Proves the previously-missing write half of the per-cycle conversation caps
 * now works end-to-end against a real in-memory MongoDB:
 *
 *   1. recordAutomationUsage increments the UsageCounter for conversation types;
 *   2. remainingAutomation subtracts that usage from the plan limit;
 *   3. canConsumeAutomation flips to false exactly at the cap and back after a
 *      cycle reset;
 *   4. resetAutomationCounters zeroes the per-cycle counters;
 *   5. non-conversation automation types are never counted.
 *
 * A user with no Subscription document resolves to the Free plan, whose
 * aiConversationsPerMonth cap is 30 — so no subscription fixture is needed.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Redis } from 'ioredis';

import { EntitlementService } from '../services/EntitlementService';
import SubscriptionRepository from '../db/repositories/SubscriptionRepository';

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

// Minimal in-memory Redis stand-in — only get/set/del are used by the
// entitlement cache, and both wrappers already swallow errors.
function makeFakeRedis(): Redis {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    },
    del: async (key: string) => (store.delete(key) ? 1 : 0),
  } as unknown as Redis;
}

function makeService(): EntitlementService {
  return new EntitlementService(makeFakeRedis(), new SubscriptionRepository());
}

const USER = 'user_automation_usage';

describe('EntitlementService — automation conversation usage', () => {
  it('starts a free user at the full plan cap (30 aiConversations)', async () => {
    const svc = makeService();
    expect(await svc.remainingAutomation(USER, 'aiConversations')).toBe(30);
    expect(await svc.canConsumeAutomation(USER, 'aiConversations')).toBe(true);
  });

  it('records usage and subtracts it from remaining', async () => {
    const svc = makeService();
    await svc.recordAutomationUsage(USER, 'aiConversations', 5);
    expect(await svc.remainingAutomation(USER, 'aiConversations')).toBe(25);

    await svc.recordAutomationUsage(USER, 'aiConversations'); // default +1
    expect(await svc.remainingAutomation(USER, 'aiConversations')).toBe(24);
  });

  it('blocks consumption exactly at the cap and allows again after reset', async () => {
    const svc = makeService();
    await svc.recordAutomationUsage(USER, 'aiConversations', 30);
    expect(await svc.remainingAutomation(USER, 'aiConversations')).toBe(0);
    expect(await svc.canConsumeAutomation(USER, 'aiConversations')).toBe(false);

    await svc.resetAutomationCounters(USER);
    expect(await svc.remainingAutomation(USER, 'aiConversations')).toBe(30);
    expect(await svc.canConsumeAutomation(USER, 'aiConversations')).toBe(true);
  });

  it('tracks each conversation type independently', async () => {
    const svc = makeService();
    await svc.recordAutomationUsage(USER, 'keywordConversations', 10);
    // Free keywordTriggerConversationsPerMonth = 50.
    expect(await svc.remainingAutomation(USER, 'keywordConversations')).toBe(
      40
    );
    // aiConversations untouched.
    expect(await svc.remainingAutomation(USER, 'aiConversations')).toBe(30);
    // Free followCampaignConversationsPerMonth = 0 → always blocked.
    expect(
      await svc.canConsumeAutomation(USER, 'followCampaignConversations')
    ).toBe(false);
  });

  it('ignores non-conversation automation types (never counts workflows)', async () => {
    const svc = makeService();
    await svc.recordAutomationUsage(USER, 'workflows', 3);
    const { UsageCounterModel } =
      await import('../services/EntitlementService');
    const counter = await UsageCounterModel.findOne({
      userId: USER,
      type: 'workflows',
    }).lean();
    expect(counter).toBeNull();
  });

  it('reset only affects the reset user', async () => {
    const svc = makeService();
    await svc.recordAutomationUsage(USER, 'aiConversations', 12);
    await svc.recordAutomationUsage('other_user', 'aiConversations', 7);

    await svc.resetAutomationCounters(USER);

    expect(await svc.remainingAutomation(USER, 'aiConversations')).toBe(30);
    expect(await svc.remainingAutomation('other_user', 'aiConversations')).toBe(
      23
    );
  });
});
