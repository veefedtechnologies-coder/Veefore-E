/*
 * Read-only: daily follower totals from InstagramFollowerSnapshot for an account
 * (the source the Home "Monthly Momentum" uses), plus the live account count.
 * USAGE: node scripts/check-snapshot-followers.mjs <instagramUserId>
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env') });
const DB_NAME = process.env.MONGO_DB_NAME || 'veeforedb';
const igUserId = process.argv[2];

async function run() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URL || '';
  await mongoose.connect(uri, { dbName: DB_NAME });
  const db = mongoose.connection.db;

  const rows = await db.collection('instagramfollowersnapshots')
    .find({ instagramUserId: String(igUserId) })
    .sort({ snapshotDate: 1 })
    .toArray();
  console.log(`InstagramFollowerSnapshot for ${igUserId} — ${rows.length} rows:`);
  for (const r of rows) {
    console.log(`  ${new Date(r.snapshotDate).toISOString().slice(0,10)}: ${r.followerCount}`);
  }
  let g = 0, l = 0;
  for (let i = 1; i < rows.length; i++) { const d = rows[i].followerCount - rows[i-1].followerCount; if (d>0) g+=d; else l+=-d; }
  console.log(`\nGross gained=${g}, lost=${l}, net=${g-l} across all snapshots.`);

  const acct = await db.collection('socialaccounts').findOne({ accountId: String(igUserId) });
  console.log(`\nLive account followersCount = ${acct?.followersCount}`);
  await mongoose.disconnect();
}
run().catch((e)=>{console.error(e);process.exit(1);});
