/**
 * force-demographics-sync.ts
 * 
 * One-shot script to trigger a demographics refresh (including online_followers /
 * audienceActiveTime) for the account using metricsType='reach'.  This is the
 * same path ConnectInitService uses when audienceActiveTime is missing after an
 * OAuth reconnect with no content changes.
 *
 * Usage:
 *   npx tsx server/scripts/force-demographics-sync.ts
 */
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function run() {
  const uri = process.env.MONGODB_URI || process.env.DATABASE_URL;
  if (!uri) {
    console.error('❌ MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB_NAME || 'veeforedb' });
  console.log('✅ Connected to MongoDB');

  const { socialAccountService } = await import('../services/SocialAccountService');

  const account = await mongoose.connection.db!.collection('socialaccounts').findOne({
    platform: 'instagram',
    username: 'arpit.10',
  });

  if (!account) {
    console.error('❌ Account arpit.10 not found');
    process.exit(1);
  }

  const accountDbId = account._id.toString();
  console.log(`\n📱 Account: @${account.username} (${accountDbId})`);
  console.log(`   audienceActiveTime keys BEFORE: ${Object.keys((account.audienceActiveTime as any) || {}).length}`);
  console.log(`   Last sync: ${account.lastSyncAt}`);
  console.log('\n🔄 Running syncAccount with metricsType=reach (fetches insights including online_followers)...');

  try {
    const updated = await socialAccountService.syncAccount(accountDbId, {
      metricsType: 'reach',
      forceRefresh: true,
    });

    const activeTime = (updated as any).audienceActiveTime;
    const hourKeys = activeTime ? Object.keys(activeTime).length : 0;

    console.log('\n✅ Sync complete!');
    console.log(`   audienceActiveTime keys AFTER: ${hourKeys}`);
    if (hourKeys > 0) {
      const sample = Object.entries(activeTime as Record<string, number>)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      console.log(`   Top 5 hours: ${sample.map(([h, c]) => `${h}h→${c}`).join(', ')}`);
      console.log('\n🎉 Best Time to Post data is now populated!');
    } else {
      console.log('\n⚠️  audienceActiveTime still empty after sync.');
      console.log('    Possible reasons:');
      console.log('    1. Meta API returned no online_followers data (account needs >100 followers + Business/Creator)');
      console.log('    2. All 30-day snapshots returned empty (new account with sparse data)');
      console.log('    3. API error — check server logs for "⚠️ online_followers" messages');
    }
  } catch (err: any) {
    console.error('❌ Sync failed:', err.message);
  }

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Fatal:', err.message);
  process.exit(1);
});
