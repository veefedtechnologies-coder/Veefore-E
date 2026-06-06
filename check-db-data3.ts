import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  const trends = await mongoose.connection.db.collection('listeningtrends').find({ workspaceId: '684402c2fd2cd4eb6521b386' }).toArray();
  const hooks = await mongoose.connection.db.collection('listeninghooks').find({ workspaceId: '684402c2fd2cd4eb6521b386' }).toArray();
  
  console.log(`Trends: ${trends.length}`);
  console.log(`Hooks: ${hooks.length}`);
  await mongoose.disconnect();
}
check().catch(console.error);
