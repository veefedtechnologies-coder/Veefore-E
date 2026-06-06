import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  const trends = await mongoose.connection.db.collection('listeningtrends').countDocuments();
  const hooks = await mongoose.connection.db.collection('listeninghooks').countDocuments();
  const insights = await mongoose.connection.db.collection('listeninginsights').countDocuments();
  const aggs = await mongoose.connection.db.collection('listeningaggregations').countDocuments();
  
  console.log(`Trends: ${trends}`);
  console.log(`Hooks: ${hooks}`);
  console.log(`Insights: ${insights}`);
  console.log(`Aggregations: ${aggs}`);
  
  await mongoose.disconnect();
}
check().catch(console.error);
