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
    const agg = await mongoose.connection.collection('listeningaggregations').find({}).toArray();
    console.log('Aggs in test db:', agg.map(a => ({ wid: a.workspaceId, posts: a.metrics?.totalPosts })));
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
run();
