/**
 * Instagram API Raw Data Test Script
 * 
 * Tests all Instagram Graph API endpoints and shows exactly what data is returned.
 * Uses the stored access token from the database for the connected account.
 * 
 * Run: npx tsx scripts/test-instagram-api.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { InstagramApiService } from '../server/services/instagramApi';
import { getAccessTokenFromAccount } from '../server/storage/converters';

async function main() {
  console.log('='.repeat(80));
  console.log('INSTAGRAM API RAW DATA TEST');
  console.log('='.repeat(80));

  // Connect to MongoDB
  await mongoose.connect(process.env.MONGODB_URI!, { dbName: 'veeforedb' });
  console.log('\n✅ Connected to MongoDB');

  // Get the connected Instagram account
  const account = await mongoose.connection.collection('socialaccounts').findOne({
    platform: 'instagram',
    isActive: true
  });

  if (!account) {
    console.error('❌ No active Instagram account found in database');
    process.exit(1);
  }

  console.log(`\n📱 Account: @${account.username}`);
  console.log(`   Account ID (Instagram): ${account.accountId}`);
  console.log(`   DB ID: ${account._id}`);

  const accessToken = getAccessTokenFromAccount(account as any);
  if (!accessToken) {
    console.error('❌ No access token available');
    process.exit(1);
  }
  console.log(`   Token: ${accessToken.substring(0, 20)}...`);

  // ============================================================
  // 1. ACCOUNT PROFILE (getUserProfile / getAccountInfo)
  // ============================================================
  console.log('\n' + '='.repeat(80));
  console.log('1. ACCOUNT PROFILE (getAccountInfo)');
  console.log('   API: GET /{account-id}?fields=id,username,name,biography,...');
  console.log('='.repeat(80));

  try {
    const profile = await InstagramApiService.getAccountInfo(accessToken, account.accountId);
    console.log('\n   RAW RESPONSE:');
    console.log(JSON.stringify(profile, null, 4));
  } catch (err: any) {
    console.error('   ❌ FAILED:', err.message);
  }

  // ============================================================
  // 2. ACCOUNT INSIGHTS (getAccountInsights) - Day period
  // ============================================================
  console.log('\n' + '='.repeat(80));
  console.log('2. ACCOUNT INSIGHTS - Day Period');
  console.log('   API: GET /{account-id}/insights?metric=reach,follower_count,...&period=day');
  console.log('='.repeat(80));

  try {
    const insightsDay = await InstagramApiService.getAccountInsights(account.accountId, accessToken, 'day');
    console.log('\n   RAW RESPONSE:');
    console.log(JSON.stringify(insightsDay, null, 4));
  } catch (err: any) {
    console.error('   ❌ FAILED:', err.message);
  }

  // ============================================================
  // 3. ACCOUNT INSIGHTS - 28 Days period
  // ============================================================
  console.log('\n' + '='.repeat(80));
  console.log('3. ACCOUNT INSIGHTS - 28 Day Period');
  console.log('   API: GET /{account-id}/insights?metric=reach&period=days_28');
  console.log('='.repeat(80));

  try {
    const insights28 = await InstagramApiService.getAccountInsights(account.accountId, accessToken, 'days_28');
    console.log('\n   RAW RESPONSE:');
    console.log(JSON.stringify(insights28, null, 4));
  } catch (err: any) {
    console.error('   ❌ FAILED:', err.message);
  }

  // ============================================================
  // 4. BATCH ACCOUNT INSIGHTS (getBatchAccountInsights)
  //    Single batch call for ALL account data
  // ============================================================
  console.log('\n' + '='.repeat(80));
  console.log('4. BATCH ACCOUNT INSIGHTS (single POST batch call)');
  console.log('   API: POST / with batch=[profile, reach_day, reach_week, reach_28d, views, demographics]');
  console.log('='.repeat(80));

  try {
    const batchAccount = await InstagramApiService.getBatchAccountInsights(account.accountId, accessToken);
    console.log('\n   ACCOUNT INFO:');
    console.log(JSON.stringify(batchAccount.account, null, 4));
    console.log('\n   INSIGHTS:');
    console.log(JSON.stringify(batchAccount.insights, null, 4));
  } catch (err: any) {
    console.error('   ❌ FAILED:', err.message);
  }

  // ============================================================
  // 5. USER MEDIA LIST (getUserMedia)
  // ============================================================
  console.log('\n' + '='.repeat(80));
  console.log('5. USER MEDIA LIST (getUserMedia) - up to 50 posts');
  console.log('   API: GET /{account-id}/media?fields=id,media_type,timestamp,caption,like_count,...&limit=50');
  console.log('='.repeat(80));

  let mediaItems: any[] = [];
  try {
    const mediaResult = await InstagramApiService.getUserMedia(accessToken, 50, account.accountId);
    mediaItems = mediaResult.data || [];
    console.log(`\n   Total media returned: ${mediaItems.length}`);
    console.log('\n   FIRST 3 ITEMS (RAW):');
    for (let i = 0; i < Math.min(3, mediaItems.length); i++) {
      console.log(`\n   --- Post ${i + 1} ---`);
      console.log(JSON.stringify(mediaItems[i], null, 4));
    }
    if (mediaItems.length === 0) {
      console.log('   (No media items returned - account may have 0 posts)');
    }
  } catch (err: any) {
    console.error('   ❌ FAILED:', err.message);
  }

  // ============================================================
  // 6. BATCH MEDIA INSIGHTS (getBatchMediaInsights)
  // ============================================================
  console.log('\n' + '='.repeat(80));
  console.log('6. BATCH MEDIA INSIGHTS (getBatchMediaInsights)');
  console.log('   API: POST / with batch=[{media1}/insights, {media2}/insights, ...]');
  console.log('   Metrics per post: reach, saved, shares (for VIDEO)');
  console.log('='.repeat(80));

  if (mediaItems.length > 0) {
    try {
      const batchInsights = await InstagramApiService.getBatchMediaInsights(mediaItems, accessToken);
      console.log(`\n   Insights received for ${Object.keys(batchInsights).length} media items`);
      console.log('\n   FIRST 3 ITEMS WITH INSIGHTS:');
      const ids = Object.keys(batchInsights).slice(0, 3);
      for (const id of ids) {
        const media = mediaItems.find(m => m.id === id);
        console.log(`\n   --- ${id} (${media?.media_type || 'unknown'}) ---`);
        console.log(`       Caption: ${(media?.caption || '').substring(0, 50)}...`);
        console.log(`       Likes: ${media?.like_count || 0}, Comments: ${media?.comments_count || 0}`);
        console.log(`       Batch insights: ${JSON.stringify(batchInsights[id])}`);
      }
    } catch (err: any) {
      console.error('   ❌ FAILED:', err.message);
    }
  } else {
    console.log('   ⚠️ Skipped - no media items to get insights for');
  }

  // ============================================================
  // 7. INDIVIDUAL MEDIA INSIGHTS (getMediaInsights) - for first post
  // ============================================================
  console.log('\n' + '='.repeat(80));
  console.log('7. INDIVIDUAL MEDIA INSIGHTS (getMediaInsights) - first post');
  console.log('   API: GET /{media-id}/insights?metric=reach,saved,shares,likes,comments');
  console.log('='.repeat(80));

  if (mediaItems.length > 0) {
    const firstMedia = mediaItems[0];
    try {
      const singleInsights = await InstagramApiService.getMediaInsights(
        firstMedia.id,
        accessToken,
        firstMedia.media_type
      );
      console.log(`\n   Media: ${firstMedia.id} (${firstMedia.media_type})`);
      console.log('   RAW RESPONSE:');
      console.log(JSON.stringify(singleInsights, null, 4));
    } catch (err: any) {
      console.error('   ❌ FAILED:', err.message);
    }
  } else {
    console.log('   ⚠️ Skipped - no media items');
  }

  // ============================================================
  // 8. USER STORIES (getUserStories)
  // ============================================================
  console.log('\n' + '='.repeat(80));
  console.log('8. USER STORIES (getUserStories)');
  console.log('   API: GET /{account-id}/stories?fields=id,media_type,timestamp,...');
  console.log('='.repeat(80));

  try {
    const stories = await InstagramApiService.getUserStories(accessToken, account.accountId);
    console.log(`\n   Stories returned: ${stories.data?.length || 0}`);
    if (stories.data?.length > 0) {
      console.log('   FIRST STORY:');
      console.log(JSON.stringify(stories.data[0], null, 4));
    } else {
      console.log('   (No active stories)');
    }
  } catch (err: any) {
    console.error('   ❌ FAILED:', err.message);
  }

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY: What data the Instagram API returns');
  console.log('='.repeat(80));

  console.log(`
📊 ACCOUNT-LEVEL DATA (1 API call or batch):
   ├── Profile: id, username, name, biography, website, followers_count, follows_count, media_count, profile_picture_url, account_type
   ├── Insights (day):    reach, follower_count, views/impressions, profile_views, website_clicks
   ├── Insights (week):   reach
   ├── Insights (28 day): reach
   ├── Demographics:      audience_city, audience_country, audience_gender_age
   └── Active Time:       online_followers (hour-by-hour when followers are online)

📸 POST-LEVEL DATA:
   ├── Media List fields: id, media_type, media_url, permalink, thumbnail_url, timestamp, caption, like_count, comments_count, is_shared_to_feed
   └── Per-post insights: reach, saved/saves, shares (VIDEO only), likes, comments, video_views (VIDEO)

📖 STORIES DATA:
   └── Story fields: id, media_type, media_url, permalink, thumbnail_url, timestamp, caption

🔄 BATCH OPTIMIZATION:
   ├── getBatchAccountInsights: 1 POST call → profile + all insights + demographics + active time (9 sub-requests)
   └── getBatchMediaInsights: 1 POST call per 50 posts → reach + saved + shares for each
`);

  await mongoose.disconnect();
  console.log('\n✅ Done. Disconnected from MongoDB.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
