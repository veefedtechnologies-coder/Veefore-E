import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  const user = await mongoose.connection.db.collection('users').findOne({ firebaseUid: 'XG0OYy2RkmYMhgRzT4cVjb4H0rY2' });
  console.log("USER NICHE IN DB:", user?.niche);
  await mongoose.disconnect();
}
check().catch(console.error);
