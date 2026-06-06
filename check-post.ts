import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  const post = await mongoose.connection.db.collection('listening_posts').findOne({ title: /WATCH PART 2/i });
  console.log("POST:", post);
  await mongoose.disconnect();
}
check().catch(console.error);
