import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const agg = await mongoose.connection.db.collection('listeningaggregations').findOne();
  console.log('workspaceId:', agg?.workspaceId, 'type:', typeof agg?.workspaceId, 'constructor:', agg?.workspaceId?.constructor?.name);
  await mongoose.disconnect();
}
check().catch(console.error);
