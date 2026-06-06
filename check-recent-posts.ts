import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  const posts = await mongoose.connection.db.collection('listening_posts').find({ workspaceId: 'ws_68440274' }).sort({ _id: -1 }).limit(5).toArray();
  console.log("POSTS:", JSON.stringify(posts, null, 2));
  
  const trends = await mongoose.connection.db.collection('listening_trends').find({ workspaceId: 'ws_68440274' }).toArray();
  console.log("TRENDS:", JSON.stringify(trends, null, 2));
  
  await mongoose.disconnect();
}
check().catch(console.error);
