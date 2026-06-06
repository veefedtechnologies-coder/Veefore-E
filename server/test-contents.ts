import mongoose from 'mongoose';
import { config } from 'dotenv';

config();

async function checkContents() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log('Connected to DB');
  const db = mongoose.connection.db;
  if (!db) {
      console.log('No db');
      process.exit(1);
  }
  const contents = db.collection('contents');
  const allPublished = await contents.find({ status: 'published' }).toArray();
  console.log(`Total published contents: ${allPublished.length}`);
  
  const platforms = {};
  allPublished.forEach(c => {
      platforms[c.platform] = (platforms[c.platform] || 0) + 1;
  });
  console.log('Platforms:', platforms);
  
  process.exit(0);
}

checkContents();
