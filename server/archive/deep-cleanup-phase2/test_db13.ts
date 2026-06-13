import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

async function run() {
  let mongoUri = process.env.MONGODB_URI || '';
  if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
      mongoUri = `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_HOST}/${process.env.MONGODB_DATABASE}?retryWrites=true&w=majority`;
  }
  await mongoose.connect(mongoUri, { dbName: 'veeforedb' });
  const logs = await mongoose.connection.collection('logs')
      .find({ "meta.accountId": "6a2059cc3d64bcca64a7e0e6" })
      .sort({ timestamp: -1 })
      .limit(5)
      .toArray();
      
  console.log('Logs for rahulc1020:');
  logs.forEach(l => console.log(l.timestamp, l.message, l.level));
  
  process.exit(0);
}
run();
