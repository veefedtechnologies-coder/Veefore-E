import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  const trends = await mongoose.connection.db.collection('listening_trends').find({ workspaceId: '684402c2fd2cd4eb6521b386' }).toArray();
  console.log(trends.map(t => t.status));
  await mongoose.disconnect();
}
check().catch(console.error);
