/**
 * remove-legacy-ai-best-active-time.ts
 *
 * One-time cleanup: removes the dead `aiBestActiveTime` field (old V4.6 engine
 * output) from every document in the `socialaccounts` collection.
 *
 * Nothing reads this field anymore — it was fully replaced by the unified
 * best-time engine (server/services/bestTimeEngine.ts), which computes
 * on-demand from `audienceActiveTimeWeekly` + `Content` and stores nothing.
 * The old V4.6 engine (server/services/bestActiveTime.ts) has already been
 * deleted and its post-sync trigger removed from SocialAccountService.ts.
 *
 * Run once:
 *   npx tsx server/scripts/remove-legacy-ai-best-active-time.ts
 *
 * Safe to re-run — $unset on a field that doesn't exist is a no-op.
 */

import mongoose from 'mongoose';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.join(process.cwd(), '.env') });

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI not set. Aborting.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('✅ Connected to MongoDB');

  const db = mongoose.connection.db;
  if (!db) {
    console.error('❌ No DB handle available.');
    process.exit(1);
  }

  const collection = db.collection('socialaccounts');

  const before = await collection.countDocuments({ aiBestActiveTime: { $exists: true } });
  console.log(`Found ${before} document(s) with a stale aiBestActiveTime field.`);

  if (before === 0) {
    console.log('Nothing to clean up. Done.');
    await mongoose.disconnect();
    return;
  }

  const result = await collection.updateMany(
    { aiBestActiveTime: { $exists: true } },
    { $unset: { aiBestActiveTime: '' } }
  );

  console.log(`✅ Removed aiBestActiveTime from ${result.modifiedCount} document(s).`);

  const after = await collection.countDocuments({ aiBestActiveTime: { $exists: true } });
  if (after === 0) {
    console.log('✅ Verified: no documents still have the field.');
  } else {
    console.warn(`⚠️ ${after} document(s) still report the field — investigate.`);
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
