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
  const accounts = await db?.collection('socialaccounts').find({ platform: 'instagram' }).toArray();
  
  console.log('--- All Instagram Accounts ---');
  for (const acc of (accounts || [])) {
    console.log(`ID: ${acc._id}`);
    console.log(`Username: ${acc.username}`);
    console.log(`Workspace ID: ${acc.workspaceId}`);
    console.log(`Token Status: ${acc.tokenStatus}`);
    console.log('-------------------------');
  }

  process.exit(0);
}

debug().catch(console.error);
