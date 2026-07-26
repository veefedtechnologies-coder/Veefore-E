/**
 * Force re-sync of per-post insights for all VIDEO/REELS posts so metrics.views
 * gets populated correctly now that the parseBatchInsightEntry bug is fixed.
 * 
 * Usage: npx tsx server/scripts/force-video-insights-sync.ts
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env') });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI!, { dbName: process.env.MONGODB_DB_NAME || 'veeforedb' });
  console.log('✅ Connected');

  const { socialAccountService } = await import('../services/SocialAccountService');
  
  // Find the account
  const acc = await mongoose.connection.db!.collection('socialaccounts').findOne({ username: 'arpit.10' });
  if (!acc) { console.error('Account not found'); process.exit(1); }
  
  console.log(`\n🔄 Syncing account ${acc._id} (@${acc.username}) with metricsType='new_posts' to refresh per-post insights...`);
  
  const updated = await socialAccountService.syncAccount(acc._id.toString(), {
    metricsType: 'all',
    forceRefresh: true,
  });
  
  console.log('\n✅ Sync complete. Now checking Content documents for views...');
  
  const posts = await mongoose.connection.db!.collection('contents').find(
    { workspaceId: acc.workspaceId.toString(), platform: 'instagram', status: 'published' },
    { projection: { 'contentData.media_type': 1, 'metrics.views': 1, 'metrics.reach': 1, publishedAt: 1 } }
  ).sort({ publishedAt: -1 }).toArray();
  
  let withViews = 0;
  posts.forEach((p: any) => {
    const views = p.metrics?.views || 0;
    if (views > 0) withViews++;
    const mt = p.contentData?.media_type || '?';
    if (['VIDEO', 'REELS'].includes(mt)) {
      console.log(`  [${mt}] ${p.publishedAt?.toISOString?.()?.slice(0,10)} → views:${views} reach:${p.metrics?.reach || 0}`);
    }
  });
  
  console.log(`\nPosts with views > 0: ${withViews}/${posts.length}`);
  
  await mongoose.disconnect();
  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
