import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  const posts = await mongoose.connection.db.collection('listening_posts').find({ workspaceId: '684402c2fd2cd4eb6521b386' }).toArray();
  console.log("POST COUNT:", posts.length);
  if (posts.length > 0) {
    console.log("First post URL:", posts[0].url);
  }
  await mongoose.disconnect();
}
check().catch(console.error);
