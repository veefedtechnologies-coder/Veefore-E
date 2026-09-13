/**
 * Confirm the ledger's indexes exist IN MONGO, not merely in the schema.
 *
 * Idempotency (spec §52) is enforced by a unique index on `reservationId`. A
 * schema declaration alone proves nothing: if the index was never built — a
 * pre-existing collection, a failed sync, a restored dump — duplicate charges
 * become possible while every unit test still passes. So this asserts against the
 * live collection and then attempts a genuine duplicate insert.
 *
 * Run: npx tsx server/scripts/verify-vgu-indexes.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { connectionManager } from '../infrastructure/mongodb-connection';
import { VeegptUsageEvent } from '../services/veegpt-ledger';

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : fail++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  → got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`
  );
}

(async () => {
  await connectionManager.connect().catch(() => {});
  if (mongoose.connection.readyState !== 1) {
    console.error('Mongo not connected — cannot verify indexes.');
    process.exit(1);
  }

  // Build any missing indexes, then read back what the server actually has.
  await VeegptUsageEvent.syncIndexes();
  const indexes = await VeegptUsageEvent.collection.indexes();
  const byKey = new Map(
    indexes.map(i => [JSON.stringify(i.key), i as Record<string, unknown>])
  );

  console.log(
    `collection = ${VeegptUsageEvent.collection.collectionName}, ${indexes.length} indexes\n`
  );

  const resIdx = byKey.get(JSON.stringify({ reservationId: 1 }));
  check('reservationId index exists', !!resIdx, true);
  check('and is UNIQUE (this is what makes reconciliation idempotent)',
    resIdx?.unique === true, true);

  check('user+period index exists (counter rebuilds)',
    !!byKey.get(JSON.stringify({ userId: 1, billingPeriodId: 1 })), true);
  check('workspace+period index exists (pool rebuilds)',
    !!byKey.get(JSON.stringify({ workspaceId: 1, billingPeriodId: 1 })), true);
  check('createdAt index exists (admin analytics)',
    !!byKey.get(JSON.stringify({ createdAt: -1 })), true);
  check('feature+createdAt index exists',
    !!byKey.get(JSON.stringify({ feature: 1, createdAt: -1 })), true);
  check('model+createdAt index exists',
    !!byKey.get(JSON.stringify({ model: 1, createdAt: -1 })), true);

  // Prove the constraint is live by attempting a real duplicate insert.
  const reservationId = `r_idxprobe_${Date.now()}`;
  const base = {
    reservationId,
    userId: '__vgu_idx_probe',
    billingPeriodId: 'cal:probe',
    plan: 'pro',
    modelTier: 'cheap',
    feature: 'veegpt.chat',
    status: 'RECONCILED',
  };
  await VeegptUsageEvent.deleteMany({ userId: '__vgu_idx_probe' });
  await VeegptUsageEvent.create(base);
  let rejected = false;
  try {
    await VeegptUsageEvent.create(base);
  } catch (err) {
    rejected = (err as { code?: number })?.code === 11000;
  }
  check('a second insert with the same reservationId is REJECTED by Mongo',
    rejected, true);
  check('leaving exactly one row',
    await VeegptUsageEvent.countDocuments({ reservationId }), 1);
  await VeegptUsageEvent.deleteMany({ userId: '__vgu_idx_probe' });

  console.log(
    `\n${fail === 0 ? 'ALL CHECKS PASSED' : `${fail} CHECK(S) FAILED`}  (${pass} passed)`
  );
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => {
  console.error('probe error:', e?.stack || e?.message || e);
  process.exit(1);
});
