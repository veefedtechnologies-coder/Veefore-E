/**
 * Check raw online_followers API response to understand hour key timezone
 */
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI!, { dbName: process.env.MONGODB_DB_NAME || 'veeforedb' });
  
  const acc = await mongoose.connection.db!.collection('socialaccounts').findOne({ username: 'arpit.10' });
  if (!acc) { console.error('not found'); process.exit(1); }
  
  const { tokenEncryption } = await import('../security/token-encryption');
  const token = tokenEncryption.decryptToken(acc.encryptedAccessToken);
  
  const DAY_S = 86400;
  const now = Math.floor(Date.now() / 1000);
  const since = now - 7 * DAY_S;
  const until = now - DAY_S;
  
  const url = `https://graph.facebook.com/v22.0/${acc.accountId}/insights?metric=online_followers&period=lifetime&since=${since}&until=${until}&access_token=${token}`;
  console.log('\nFetching:', url.replace(token, 'TOKEN'));
  
  const res = await fetch(url);
  const data = await res.json() as any;
  
  if (data.error) { console.error('API error:', JSON.stringify(data.error)); process.exit(1); }
  
  const metric = data.data?.find((m: any) => m.name === 'online_followers');
  if (!metric?.values?.length) {
    console.log('No data'); process.exit(0);
  }
  
  console.log(`\n${metric.values.length} daily snapshots:`);
  metric.values.forEach((v: any, i: number) => {
    const hasData = v.value && Object.keys(v.value).length > 0;
    console.log(`\n[Day ${i+1}] end_time: ${v.end_time}`);
    if (hasData) {
      // Show all 24 hours sorted
      const sorted = Object.entries(v.value as Record<string, number>)
        .sort((a, b) => Number(a[0]) - Number(b[0]));
      console.log('  All hours:', sorted.map(([h, c]) => `${h}h:${c}`).join(' '));
      const peak = [...sorted].sort((a, b) => (b[1] as number) - (a[1] as number))[0];
      console.log('  Peak hour:', `${peak[0]}h (${peak[1]} followers)`);
      
      // IST offset is +5:30 = 330 minutes = 5.5 hours
      // If hours are UTC: peak at h9 UTC = 14:30 IST (2:30pm)
      // If hours are IST: peak at h9 IST = 9am IST
      console.log('  If UTC: peak IST =', `${(Number(peak[0]) + 5) % 24}:30 IST (${(Number(peak[0]) + 5) % 24}h)`);
      console.log('  If IST: peak IST =', `${peak[0]}:00 IST`);
    } else {
      console.log('  empty');
    }
  });
  
  await mongoose.disconnect();
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
