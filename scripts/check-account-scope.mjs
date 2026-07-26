/*
 * Read-only diagnostic: shows, per workspace, the distinct accountIds present in
 * the `analytics` collection and their latest follower value, plus which social
 * accounts are currently ACTIVE. This reveals when a workspace's analytics mix
 * data from more than one Instagram account (e.g. a disconnected/other account).
 *
 * USAGE (from Veefore-E/):
 *   node scripts/check-account-scope.mjs <workspaceId>
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });
const DB_NAME = process.env.MONGO_DB_NAME || 'veeforedb';
const workspaceId = process.argv[2];

async function run() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URL || '';
  if (!uri) { console.error('❌ MONGODB_URI not set'); process.exit(1); }
  if (!workspaceId) { console.error('Usage: node scripts/check-account-scope.mjs <workspaceId>'); process.exit(1); }

  await mongoose.connect(uri, { dbName: DB_NAME });
  const db = mongoose.connection.db;
  console.log(`✅ Connected (db: ${mongoose.connection.name})\n`);

  console.log(`Analytics accountIds in workspace ${workspaceId}:`);
  const rows = await db.collection('analytics').aggregate([
    { $match: { workspaceId: String(workspaceId) } },
    { $group: {
        _id: { accountId: '$accountId', platform: '$platform' },
        days: { $sum: 1 },
        latestFollowers: { $last: '$followers' },
        maxFollowers: { $max: '$followers' },
        minDate: { $min: '$date' }, maxDate: { $max: '$date' },
    } },
    { $sort: { days: -1 } },
  ]).toArray();
  for (const r of rows) {
    console.log(`  accountId=${r._id.accountId ?? '(none)'} platform=${r._id.platform} | days=${r.days} | latestFollowers=${r.latestFollowers} maxFollowers=${r.maxFollowers} | ${fmt(r.minDate)}→${fmt(r.maxDate)}`);
  }

  console.log(`\nActive social accounts for workspace ${workspaceId}:`);
  const accts = await db.collection('socialaccounts').find({ workspaceId: String(workspaceId) }).toArray();
  for (const a of accts) {
    console.log(`  _id=${a._id} accountId=${a.accountId} username=${a.username} platform=${a.platform} isActive=${a.isActive} followersCount=${a.followersCount}`);
  }

  await mongoose.disconnect();
}
function fmt(d){ try { return new Date(d).toISOString().slice(0,10); } catch { return String(d); } }
run().catch((e)=>{ console.error(e); process.exit(1); });
