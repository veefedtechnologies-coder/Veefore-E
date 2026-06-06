import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  const posts = await mongoose.connection.db.collection('listening_posts').countDocuments({ workspaceId: "684402c2fd2cd4eb6521b386" });
  console.log("POSTS IN WS:", posts);
  await mongoose.disconnect();
}
check().catch(console.error);
