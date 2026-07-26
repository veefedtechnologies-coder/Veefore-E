/*
 * One-off backfill: mark users as onboarded if they have at least one workspace.
 *
 * WHY: some accounts have `isOnboarded: false` in the DB despite being fully
 * onboarded (they have workspaces, use the dashboard). That stale flag caused
 * the `/api/user` invalidation loop and the cross-tab "bounce to /signup"
 * behaviour. Owning a workspace is a definitive signal that onboarding finished,
 * so we set `isOnboarded: true` for those users.
 *
 * SAFE: only flips `isOnboarded` from not-true → true (never the reverse), and
 * only for users who own a workspace. Idempotent — safe to run repeatedly.
 *
 * USAGE (from Veefore-E/):
 *   node scripts/backfill-onboarded.mjs --dry-run   # preview, no writes
 *   node scripts/backfill-onboarded.mjs             # apply
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const DRY_RUN = process.argv.includes('--dry-run');
const DB_NAME = process.env.MONGO_DB_NAME || 'veeforedb';

async function run() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URL || '';
  if (!uri) {
    console.error('❌ MONGODB_URI (or MONGO_URL) is not set in .env');
    process.exit(1);
  }

  await mongoose.connect(uri, { dbName: DB_NAME });
  const db = mongoose.connection.db;
  console.log(`✅ Connected to MongoDB (db: ${mongoose.connection.name})`);
  console.log(DRY_RUN ? '🔎 DRY RUN — no writes will be made\n' : '✍️  APPLY MODE — will update users\n');

  // 1) Collect the distinct workspace owner ids.
  const rawOwnerIds = await db.collection('workspaces').distinct('userId');
  console.log(`Found ${rawOwnerIds.length} distinct workspace owner id(s).`);

  // 2) Normalize to a set of candidate _id values (ObjectId when possible, plus
  //    the raw value), since workspaces.userId is a Mixed type.
  const idCandidates = [];
  const seen = new Set();
  for (const raw of rawOwnerIds) {
    if (raw == null) continue;
    const asStr = String(raw);
    if (seen.has(asStr)) continue;
    seen.add(asStr);
    // Raw value (covers string/number _id schemas).
    idCandidates.push(raw);
    // ObjectId form (covers the common ObjectId _id schema).
    if (mongoose.isValidObjectId(asStr)) {
      try { idCandidates.push(new mongoose.Types.ObjectId(asStr)); } catch { /* ignore */ }
    }
  }

  // 3) Find owners who are NOT already onboarded.
  const usersCol = db.collection('users');
  const notOnboarded = await usersCol
    .find({ _id: { $in: idCandidates }, isOnboarded: { $ne: true } })
    .project({ _id: 1, email: 1, isOnboarded: 1 })
    .toArray();

  console.log(`Owners needing isOnboarded=true: ${notOnboarded.length}`);
  for (const u of notOnboarded) {
    console.log(`  - ${u._id} ${u.email || '(no email)'} (isOnboarded=${u.isOnboarded})`);
  }

  if (notOnboarded.length === 0) {
    console.log('\n✅ Nothing to update — all workspace owners are already onboarded.');
  } else if (DRY_RUN) {
    console.log(`\n🔎 DRY RUN: would set isOnboarded=true on ${notOnboarded.length} user(s).`);
  } else {
    const ids = notOnboarded.map((u) => u._id);
    const res = await usersCol.updateMany(
      { _id: { $in: ids } },
      { $set: { isOnboarded: true, updatedAt: new Date() } },
    );
    console.log(`\n✅ Updated ${res.modifiedCount} user(s) → isOnboarded=true.`);
  }

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch(async (err) => {
  console.error('❌ Backfill failed:', err);
  try { await mongoose.disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
