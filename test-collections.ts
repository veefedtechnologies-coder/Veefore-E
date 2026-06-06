import mongoose from 'mongoose';
import 'dotenv/config';

async function listCollections() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log('Connected to DB');
  const db = mongoose.connection.db;
  if (db) {
    const collections = await db.listCollections().toArray();
    console.log(collections.map(c => c.name));
  }
  process.exit(0);
}
listCollections();
