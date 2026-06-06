import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  const count = await mongoose.connection.db.collection('listening_posts').countDocuments({ workspaceId: 'ws_68440274' });
  const posts = await mongoose.connection.db.collection('listening_posts').find({ workspaceId: 'ws_68440274' }).sort({ _id: -1 }).limit(5).toArray();
  console.log("TOTAL POSTS:", count);
  console.log("TOP 5:", posts.map(p => ({ platform: p.platform, title: p.title, createdAt: p.createdAt })));
  
  await mongoose.disconnect();
}
check().catch(console.error);
