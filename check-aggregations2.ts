import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function checkAggregations() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  
  const aggs = await mongoose.connection.db.collection('listeningaggregations').find().toArray();
  console.log('ListeningAggregations:');
  aggs.forEach(a => console.log(`- workspaceId: ${a.workspaceId}, posts: ${a.metrics?.totalPosts}`));

  await mongoose.disconnect();
}
checkAggregations().catch(console.error);
