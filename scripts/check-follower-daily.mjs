/*
 * Read-only: daily follower readings for ONE account id (genuine Analytics captures).
 * USAGE: node scripts/check-follower-daily.mjs <workspaceId> <accountId>
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env') });
const DB_NAME = process.env.MONGO_DB_NAME || 'veeforedb';
const [workspaceId, accountId] = process.argv.slice(2);

async function run() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URL || '';
  await mongoose.connect(uri, { dbName: DB_NAME });
  const db = mongoose.connection.db;
  const match = { workspaceId: String(workspaceId) };
  if (accountId) match.accountId = String(accountId);
  const rows = await db.collection('analytics').aggregate([
    { $match: match },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, followers: { $last: '$followers' } } },
    { $sort: { _id: 1 } },
  ]).toArray();
  console.log(`account=${accountId || 'ALL'} — ${rows.length} daily readings:`);
  for (const r of rows) console.log(`  ${r._id}: ${r.followers}`);
  let g = 0, l = 0;
  for (let i = 1; i < rows.length; i++) { const d = rows[i].followers - rows[i-1].followers; if (d>0) g+=d; else l+=-d; }
  console.log(`\nGross gained=${g}, gross lost=${l}, net=${g-l} over the whole span.`);
  await mongoose.disconnect();
}
run().catch((e)=>{console.error(e);process.exit(1);});
