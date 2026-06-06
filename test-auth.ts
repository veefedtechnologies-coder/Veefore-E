import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { MongoStorage } from './server/mongodb-storage.js';
dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  const storage = new MongoStorage();
  const user = await storage.getUserByFirebaseId('XG0OYy2RkmYMhgRzT4cVjb4H0rY2');
  console.log("Returned User:", user);
  await mongoose.disconnect();
}
check().catch(console.error);
