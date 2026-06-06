import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

async function run() {
  let mongoUri = process.env.MONGODB_URI || '';
  if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
      mongoUri = `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_HOST}/${process.env.MONGODB_DATABASE}?retryWrites=true&w=majority`;
  }
  await mongoose.connect(mongoUri, { dbName: 'veeforedb' });
  const collections = await mongoose.connection.db.listCollections().toArray();
  console.log('Collections in veeforedb:', collections.map(c => c.name));
  
  for (const c of collections) {
     const count = await mongoose.connection.collection(c.name).countDocuments();
     if (count > 0) {
        console.log(`- ${c.name}: ${count}`);
     }
  }
  
  process.exit(0);
}
run();
