import mongoose from 'mongoose';
import 'dotenv/config';

async function listDocs() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log('Connected to DB');
  const db = mongoose.connection.db;
  if (db) {
    const doc = await db.collection('social_accounts').findOne({});
    console.log(JSON.stringify(doc, null, 2));
  }
  process.exit(0);
}
listDocs();
