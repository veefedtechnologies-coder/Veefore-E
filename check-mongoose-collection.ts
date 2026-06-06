import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  const countReal = await mongoose.connection.db.collection('listeningtrends').countDocuments();
  const countFake = await mongoose.connection.db.collection('listening_trends').countDocuments();
  console.log("listeningtrends count:", countReal);
  console.log("listening_trends count:", countFake);
  await mongoose.disconnect();
}
check().catch(console.error);
