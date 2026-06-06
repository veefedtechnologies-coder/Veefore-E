import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || '');
  const adminDb = mongoose.connection.db.admin();
  
  // List all databases
  const dbList = await adminDb.listDatabases();
  console.log('All databases:', dbList.databases.map((d: any) => `${d.name} (${d.sizeOnDisk} bytes)`));
  
  // Check each db for a 'contents' or 'posts' collection with published status
  for (const dbInfo of dbList.databases) {
    if (['admin', 'local', 'config'].includes(dbInfo.name)) continue;
    
    const db = mongoose.connection.client.db(dbInfo.name);
    const colNames = (await db.listCollections().toArray()).map((c: any) => c.name);
    
    for (const colName of ['contents', 'posts']) {
      if (!colNames.includes(colName)) continue;
      const col = db.collection(colName);
      const count = await col.countDocuments({ status: 'published' });
      if (count > 0) {
        console.log(`\n*** Found ${count} published docs in db="${dbInfo.name}", col="${colName}" ***`);
        
        // Find and delete duplicates
        const allPublished = await col.find({ status: 'published' }).toArray();
        const seen = new Map<string, any>();
        const toDelete: mongoose.Types.ObjectId[] = [];
        
        for (const post of allPublished) {
          const mediaKey = post.contentData?.mediaUrls?.[0] || post.contentData?.mediaUrl || post.contentData?.thumbnailUrl || '';
          if (!mediaKey) continue;
          const wid = post.workspaceId?.toString() || '';
          const key = `${wid}::${mediaKey}`;
          const existing = seen.get(key);
          
          if (existing) {
            const diff = Math.abs(
              (existing.publishedAt ? new Date(existing.publishedAt).getTime() : 0) -
              (post.publishedAt ? new Date(post.publishedAt).getTime() : 0)
            );
            console.log(`  Potential dup (diff=${Math.round(diff/1000)}s): ${existing._id}(${existing.type}) vs ${post._id}(${post.type})`);
            
            if (diff < 10 * 60 * 1000) {
              const keepExisting = !!(existing.instagramPostId);
              const del = keepExisting ? post : existing;
              const keep = keepExisting ? existing : post;
              console.log(`  -> DELETE ${del._id} (${del.type}), KEEP ${keep._id} (${keep.type})`);
              toDelete.push(del._id);
              seen.set(key, keep);
            }
          } else {
            seen.set(key, post);
          }
        }
        
        if (toDelete.length > 0) {
          const result = await col.deleteMany({ _id: { $in: toDelete } });
          console.log(`  DELETED ${result.deletedCount} duplicates from ${dbInfo.name}.${colName}`);
        }
      }
    }
  }
  
  await mongoose.disconnect();
  console.log('\nDone!');
}
run().catch(err => { console.error(err); process.exit(1); });
