/**
 * AICreditsRepository — INTEGRATION test (in-memory MongoDB).
 *
 * Pins the credit-bucket invariants the product depends on:
 *   1. Purchased (add-on) credits are PERMANENT — never reset/refreshed by a
 *      monthly renewal or a plan upgrade, and never restored once consumed.
 *   2. Only the monthly (subscription) allocation refreshes each cycle.
 *   3. The permanent purchased bucket is always a whole integer — no stray
 *      sub-credit residue can persist and surface as e.g. "5500.3".
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import AICreditsModel from '../models/AICreditsModel';
import { AICreditsRepository } from './AICreditsRepository';

let mongo: MongoMemoryServer;
const repo = new AICreditsRepository();
const USER = 'user_credits_repo';

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}, 60_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await AICreditsModel.deleteMany({});
});

async function seed(fields: Partial<Record<string, unknown>>) {
  await AICreditsModel.create({
    userId: USER,
    remainingCredits: 0,
    monthlyCredits: 0,
    purchasedCredits: 0,
    rolloverCredits: 0,
    usedThisCycle: 0,
    lastResetAt: new Date(),
    nextResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    ...fields,
  });
}

const nextReset = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

describe('purchased credits are permanent and whole', () => {
  it('addPurchasedCredits keeps the bucket a whole integer even if legacy residue exists', async () => {
    await seed({
      monthlyCredits: 5000,
      remainingCredits: 5000.3,
      purchasedCredits: 0.3,
    });

    const updated = await repo.addPurchasedCredits(USER, 500);

    expect(updated?.purchasedCredits).toBe(500); // 0.3 residue normalised, +500
    // remaining = max(0, 5000-0) + 500 + 0
    expect(updated?.remainingCredits).toBe(5500);
  });

  it('monthly renewal refreshes the monthly allocation but preserves purchased', async () => {
    // User spent 100 of monthly; purchased 500 untouched.
    await seed({
      monthlyCredits: 5000,
      usedThisCycle: 100,
      purchasedCredits: 500,
      remainingCredits: 5400,
    });

    const updated = await repo.resetMonthly(USER, 5000, nextReset());

    expect(updated?.usedThisCycle).toBe(0);
    expect(updated?.purchasedCredits).toBe(500); // add-on untouched
    expect(updated?.remainingCredits).toBe(5500); // monthly refreshed + purchased
  });

  it('does NOT restore purchased credits that were already consumed', async () => {
    // Monthly exhausted and 200 of purchased consumed → purchased = 300.
    await seed({
      monthlyCredits: 5000,
      usedThisCycle: 5200,
      purchasedCredits: 300,
      remainingCredits: 300,
    });

    const updated = await repo.resetMonthly(USER, 5000, nextReset());

    expect(updated?.purchasedCredits).toBe(300); // consumed 200 stays consumed
    expect(updated?.remainingCredits).toBe(5300); // 5000 fresh + 300 remaining purchased
  });

  it('plan upgrade (upsertForUser) refreshes monthly and preserves purchased whole', async () => {
    await seed({
      monthlyCredits: 799,
      usedThisCycle: 50,
      purchasedCredits: 500.3, // legacy fractional residue
      remainingCredits: 1249.3,
    });

    const updated = await repo.upsertForUser(USER, 5000, nextReset());

    expect(updated?.monthlyCredits).toBe(5000);
    expect(updated?.usedThisCycle).toBe(0);
    expect(updated?.purchasedCredits).toBe(500); // normalised + preserved
    expect(updated?.remainingCredits).toBe(5500);
  });

  it('reconcileMonthlyAllocation preserves purchased as a whole integer', async () => {
    await seed({
      monthlyCredits: 100, // legacy free allocation
      usedThisCycle: 10,
      purchasedCredits: 500.3,
      remainingCredits: 590.3,
    });

    const updated = await repo.reconcileMonthlyAllocation(USER, 50);

    expect(updated?.monthlyCredits).toBe(50);
    expect(updated?.purchasedCredits).toBe(500);
    // max(0, 50 - min(10,100)) + 500 = 40 + 500
    expect(updated?.remainingCredits).toBe(540);
  });

  it('deduction consumes monthly before purchased (add-on preserved while monthly remains)', async () => {
    await seed({
      monthlyCredits: 5000,
      usedThisCycle: 0,
      purchasedCredits: 500,
      remainingCredits: 5500,
    });

    await repo.deductCredits(USER, 100);
    const doc = await repo.findByUserId(USER);

    expect(doc?.purchasedCredits).toBe(500); // add-on untouched
    expect(doc?.remainingCredits).toBe(5400);
  });
});
