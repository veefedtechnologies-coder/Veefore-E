import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!, { dbName: 'veeforedb' });
  
  const oldSnap = await mongoose.connection.collection('instagramfollowersnapshots').findOne({ accountId: new mongoose.Types.ObjectId('6a2059cc3d64bcca64a7e0e6') });
  console.log('Old snapshot instagramUserId:', oldSnap?.instagramUserId);
  
  const newSnap = await mongoose.connection.collection('instagramfollowersnapshots').findOne({ accountId: new mongoose.Types.ObjectId('6a32150f10e0f2c826bdb092') });
  console.log('New snapshot instagramUserId:', newSnap?.instagramUserId);
  
  const acc = await mongoose.connection.collection('socialaccounts').findOne({ _id: new mongoose.Types.ObjectId('6a32150f10e0f2c826bdb092') });
  console.log('Current account accountId (Instagram ID):', acc?.accountId);
  
  await mongoose.disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
