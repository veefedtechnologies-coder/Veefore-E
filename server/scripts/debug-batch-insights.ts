/**
 * Debug: test the exact batch insights request that getBatchMediaInsights makes
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env') });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI!, { dbName: process.env.MONGODB_DB_NAME || 'veeforedb' });

  const acc = await mongoose.connection.db!.collection('socialaccounts').findOne({ username: 'arpit.10' });
  const { tokenEncryption } = await import('../security/token-encryption');
  const token = tokenEncryption.decryptToken((acc as any).encryptedAccessToken);

  // The most recent VIDEO post
  const post = await mongoose.connection.db!.collection('contents').findOne(
    { workspaceId: (acc as any).workspaceId.toString(), 'contentData.media_type': 'VIDEO', status: 'published' },
    { sort: { publishedAt: -1 } }
  ) as any;
  
  const mediaId = post.instagramPostId || post.contentData?.id || post.metaPublishedId;
  console.log('Testing media ID:', mediaId, 'publishedAt:', post.publishedAt?.toISOString?.()?.slice(0,10));

  const ver = 'v22.0';
  const apiBase = 'https://graph.facebook.com';
  
  // Simulate exactly what getBatchMediaInsights does
  const batchEntry = {
    method: 'GET',
    relative_url: `${ver}/${mediaId}/insights?metric=reach,saved,shares,views`
  };
  
  const params = new URLSearchParams();
  params.append('batch', JSON.stringify([batchEntry]));
  params.append('access_token', token as string);
  params.append('include_headers', 'false');
  
  const res = await fetch(`${apiBase}/`, { method: 'POST', body: params });
  const items = await res.json() as any[];
  
  console.log('Batch response code:', items[0]?.code);
  if (items[0]?.body) {
    const body = JSON.parse(items[0].body);
    console.log('Body data:');
    (body.data || []).forEach((d: any) => {
      console.log(`  name=${d.name}, values=${JSON.stringify(d.values)}, total_value=${JSON.stringify(d.total_value)}`);
    });
  }

  await mongoose.disconnect();
  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
