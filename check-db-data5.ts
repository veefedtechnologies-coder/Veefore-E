import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  const posts = await mongoose.connection.db.collection('listeningposts').countDocuments();
  console.log(`Total Posts in DB: ${posts}`);
  await mongoose.disconnect();
}
check().catch(console.error);
