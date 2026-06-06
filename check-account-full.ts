import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function debug() {
  const dbName = process.env.MONGODB_DB_NAME || 'veeforedb';
  await mongoose.connect(process.env.MONGODB_URI!, { 
    dbName,
    serverSelectionTimeoutMS: 20000 
  });
  console.log(`Connected to ${dbName}`);

  const db = mongoose.connection.db;
  const accounts = await db?.collection('socialaccounts').find({ username: 'arpit.10' }).toArray();
  
  console.log('--- Account Detail for arpit.10 ---');
  for (const acc of (accounts || [])) {
    console.log(JSON.stringify(acc, null, 2));
  }

  process.exit(0);
}

debug().catch(console.error);
