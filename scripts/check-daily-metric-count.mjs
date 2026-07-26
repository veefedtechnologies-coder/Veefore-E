/* Count stored per-day follows rows. USAGE: node scripts/check-daily-metric-count.mjs <igUserId> */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env') });

const IG_ID = process.argv[2] || '17841406961110225';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URL, { dbName: process.env.MONGO_DB_NAME || 'veeforedb' });
  const col = mongoose.connection.collection('analyticsdailymetrics');
  const total = await col.countDocuments({ accountId: IG_ID, metricGroup: 'follows_and_unfollows' });
  const immutable = await col.countDocuments({ accountId: IG_ID, metricGroup: 'follows_and_unfollows', immutable: true });
  const first = await col.find({ accountId: IG_ID, metricGroup: 'follows_and_unfollows' }).sort({ date: 1 }).limit(1).toArray();
  const last = await col.find({ accountId: IG_ID, metricGroup: 'follows_and_unfollows' }).sort({ date: -1 }).limit(1).toArray();
  let g = 0, l = 0;
  for (const d of await col.find({ accountId: IG_ID, metricGroup: 'follows_and_unfollows' }).toArray()) {
    g += d.values?.gained || 0; l += d.values?.lost || 0;
  }
  console.log(JSON.stringify({
    accountId: IG_ID,
    totalDaysStored: total,
    immutableDays: immutable,
    earliest: first[0]?.date,
    latest: last[0]?.date,
    sumGainedAllStored: g,
    sumLostAllStored: l,
  }, null, 2));
  await mongoose.disconnect();
}
run().catch((e) => { console.error('ERROR', e?.message || e); process.exit(1); });
