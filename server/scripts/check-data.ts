import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string);
    console.log('✅ Connected to MongoDB');

    const aggregations = await mongoose.connection.collection('listening_aggregations').find({}).toArray();
    console.log('Aggregations count:', aggregations.length);
    aggregations.forEach(a => console.log(a.workspaceId, a.metrics?.totalPosts));
    
    const posts = await mongoose.connection.collection('listening_posts').countDocuments();
    console.log('Total listening_posts:', posts);

    const hooks = await mongoose.connection.collection('listening_hooks').countDocuments();
    console.log('Total hooks:', hooks);

    const trends = await mongoose.connection.collection('listening_trends').countDocuments();
    console.log('Total trends:', trends);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

run();
