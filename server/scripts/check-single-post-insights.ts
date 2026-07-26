/**
 * Direct API test: fetch insights for a single VIDEO post to see what Meta returns
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env') });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI!, { dbName: process.env.MONGODB_DB_NAME || 'veeforedb' });

  const acc = await mongoose.connection.db!.collection('socialaccounts').findOne({ username: 'arpit.10' });
  if (!acc) { console.error('not found'); process.exit(1); }

  const { tokenEncryption } = await import('../security/token-encryption');
  const token = tokenEncryption.decryptToken(acc.encryptedAccessToken);
  if (!token) { console.error('no token'); process.exit(1); }

  // Get the most recent VIDEO post's Instagram media ID
  const post = await mongoose.connection.db!.collection('contents').findOne(
    { workspaceId: acc.workspaceId.toString(), platform: 'instagram', status: 'published', 'contentData.media_type': 'VIDEO' },
    { sort: { publishedAt: -1 } }
  );
  if (!post) { console.error('no VIDEO post found'); process.exit(1); }
  
  const mediaId = (post as any).instagramPostId || (post as any).contentData?.id || (post as any).metaPublishedId;
  console.log(`\nTesting post: ${(post as any).publishedAt?.toISOString?.()?.slice(0,10)}`);
  console.log(`Media ID: ${mediaId}`);
  
  if (!mediaId) { console.error('no media ID on post'); process.exit(1); }

  // Try views metric directly
  const apiBase = 'https://graph.facebook.com';
  const ver = 'v22.0';
  
  const metricsToTry = [
    'views',
    'video_views', 
    'reach,saved,shares,views',
    'reach,saved,shares',
  ];

  for (const m of metricsToTry) {
    try {
      const url = `${apiBase}/${ver}/${mediaId}/insights?metric=${m}&access_token=${token}`;
      const res = await fetch(url);
      const data = await res.json() as any;
      if (data.error) {
        console.log(`  [${m}] → ERROR: ${data.error.message}`);
      } else {
        const values = (data.data || []).map((d: any) => `${d.name}=${d.values?.[0]?.value ?? d.total_value?.value ?? '?'}`).join(', ');
        console.log(`  [${m}] → ${values}`);
      }
    } catch (e: any) {
      console.log(`  [${m}] → FETCH ERROR: ${e.message}`);
    }
  }

  await mongoose.disconnect();
  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
