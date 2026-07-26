import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env') });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI!, { dbName: process.env.MONGODB_DB_NAME || 'veeforedb' });
  const acc = await mongoose.connection.db!.collection('socialaccounts').findOne({ username: 'arpit.10' }) as any;
  const { tokenEncryption } = await import('../security/token-encryption');
  const token = tokenEncryption.decryptToken(acc.encryptedAccessToken);

  // Get one IMAGE and one CAROUSEL post
  const posts = await mongoose.connection.db!.collection('contents').find(
    { workspaceId: acc.workspaceId.toString(), status: 'published',
      'contentData.media_type': { $in: ['IMAGE', 'CAROUSEL_ALBUM'] } },
    { sort: { publishedAt: -1 } }
  ).limit(3).toArray() as any[];

  const apiBase = 'https://graph.facebook.com';
  const ver = 'v22.0';

  for (const post of posts) {
    const mediaId = post.instagramPostId || post.contentData?.id;
    const mediaType = post.contentData?.media_type;
    const pubDate = post.publishedAt?.toISOString?.()?.slice(0, 10);
    console.log(`\n[${mediaType}] ${pubDate} — ID: ${mediaId}`);
    if (!mediaId) { console.log('  No media ID'); continue; }

    // Test with views metric
    const url = `${apiBase}/${ver}/${mediaId}/insights?metric=reach,saved,views&access_token=${token}`;
    const res = await fetch(url);
    const data = await res.json() as any;
    if (data.error) {
      console.log(`  reach,saved,views → ERROR: ${data.error.message}`);
      // Try without views
      const url2 = `${apiBase}/${ver}/${mediaId}/insights?metric=reach,saved&access_token=${token}`;
      const res2 = await fetch(url2);
      const d2 = await res2.json() as any;
      const vals2 = (d2.data || []).map((d: any) => `${d.name}=${d.values?.[0]?.value}`).join(', ');
      console.log(`  reach,saved → ${vals2}`);
    } else {
      const vals = (data.data || []).map((d: any) => `${d.name}=${d.values?.[0]?.value}`).join(', ');
      console.log(`  reach,saved,views → ${vals}`);
    }
  }

  await mongoose.disconnect();
  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
