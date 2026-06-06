import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || '');
  const db = mongoose.connection.db;
  if (!db) throw new Error('No DB');
  const col = db.collection('contents');
  
  const statuses = await col.distinct('status');
  console.log('Statuses in contents:', statuses);
  const total = await col.countDocuments();
  console.log('Total docs:', total);
  const sample = await col.findOne({ status: 'published' });
  if (sample) {
    console.log('Sample published post:', JSON.stringify({ 
      _id: sample._id, type: sample.type, status: sample.status, 
      instagramPostId: sample.instagramPostId,
      contentData: sample.contentData 
    }, null, 2));
  } else {
    const anySample = await col.findOne();
    console.log('No published, any doc:', JSON.stringify({ _id: anySample?._id, status: anySample?.status }, null, 2));
  }
  
  await mongoose.disconnect();
}
run().catch(err => { console.error(err); process.exit(1); });
