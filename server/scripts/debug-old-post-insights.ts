import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env') });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI!, { dbName: process.env.MONGODB_DB_NAME || 'veeforedb' });
  const acc = await mongoose.connection.db!.collection('socialaccounts').findOne({ username: 'arpit.10' }) as any;
  const { tokenEncryption } = await import('../security/token-encryption');
  const token = tokenEncryption.decryptToken(acc.encryptedAccessToken);

  // Get the old VIDEO posts with views:0
  const posts = await mongoose.connection.db!.collection('contents').find(
    { workspaceId: acc.workspaceId.toString(), 'contentData.media_type': 'VIDEO', status: 'published', 'metrics.views': 0 },
    { sort: { publishedAt: 1 } }  // oldest first
  ).limit(3).toArray() as any[];

  const apiBase = 'https://graph.facebook.com';
  const ver = 'v22.0';

  for (const post of posts) {
    const mediaId = post.instagramPostId || post.contentData?.id || post.metaPublishedId;
    const pubDate = post.publishedAt?.toISOString?.()?.slice(0,10);
    console.log(`\n[${pubDate}] Media ID: ${mediaId}`);
    
    if (!mediaId) { console.log('  No media ID — skipping'); continue; }

    try {
      const url = `${apiBase}/${ver}/${mediaId}/insights?metric=reach,saved,shares,views&access_token=${token}`;
      const res = await fetch(url);
      const data = await res.json() as any;
      if (data.error) {
        console.log(`  ERROR ${data.error.code}: ${data.error.message} | subcode: ${data.error.error_subcode} | type: ${data.error.type}`);
        // Try with just reach to see if ANY metric works
        const r2 = await fetch(`${apiBase}/${ver}/${mediaId}/insights?metric=reach&access_token=${token}`);
        const d2 = await r2.json() as any;
        if (d2.error) console.log(`  reach-only ERROR: ${d2.error.message}`);
        else console.log(`  reach-only: ${(d2.data||[]).map((d:any)=>`${d.name}=${d.values?.[0]?.value}`).join(', ')}`);
      } else {
        const vals = (data.data || []).map((d: any) => `${d.name}=${d.values?.[0]?.value ?? '?'}`).join(', ');
        console.log(`  OK: ${vals}`);
      }
    } catch (e: any) {
      console.log(`  FETCH ERROR: ${e.message}`);
    }
  }

  await mongoose.disconnect();
  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
