import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  const posts = await mongoose.connection.db.collection('listening_posts').find({ workspaceId: "684402c2fd2cd4eb6521b386" }).sort({ _id: -1 }).limit(1).toArray();
  console.log("POST AI METADATA:", JSON.stringify(posts[0]?.aiMetadata, null, 2));
  
  const trends = await mongoose.connection.db.collection('listening_trends').find({ workspaceId: "684402c2fd2cd4eb6521b386" }).toArray();
  console.log("TRENDS COUNT:", trends.length);
  console.log("TRENDS:", JSON.stringify(trends, null, 2));
  
  const hooks = await mongoose.connection.db.collection('listening_hooks').find({ workspaceId: "684402c2fd2cd4eb6521b386" }).toArray();
  console.log("HOOKS COUNT:", hooks.length);
  
  await mongoose.disconnect();
}
check().catch(console.error);
