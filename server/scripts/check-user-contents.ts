import mongoose from 'mongoose';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.join(process.cwd(), '..', '.env') });

async function checkAccounts() {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string);
    const db = mongoose.connection.db;
    if (!db) process.exit(1);
    
    // Let's also check contents without 'status' filter just in case
    const contents = db.collection('contents');
    const allContents = await contents.find({ platform: 'instagram' }).toArray();
    console.log(`Total instagram contents in DB regardless of status: ${allContents.length}`);
    allContents.forEach(c => {
       console.log(`Content ID: ${c._id}, Status: ${c.status}, Type: ${c.mediaType}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

checkAccounts();
