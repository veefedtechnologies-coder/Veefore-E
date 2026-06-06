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
    const posts = await mongoose.connection.collection('listening_posts').find({}).toArray();
    console.log('Post publishedAt dates:');
    posts.forEach(p => console.log(p.publishedAt, typeof p.publishedAt, p.publishedAt instanceof Date));
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
run();
