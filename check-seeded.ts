import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  const posts = await mongoose.connection.db.collection('listening_posts').find({ workspaceId: 'ws_68440274' }).toArray();
  console.log("POSTS:", posts.length);
  console.log("POST[0]:", posts[0]?.title, posts[0]?.content);
  await mongoose.disconnect();
}
check().catch(console.error);
