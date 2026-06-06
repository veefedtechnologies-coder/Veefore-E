import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function debug() {
  await mongoose.connect(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 20000 });
  console.log('Connected');

  const db = mongoose.connection.db;
  const accounts = await db?.collection('socialaccounts').find({ username: 'arpit.10' }).toArray();
  
  console.log('--- All Social Accounts for arpit.10 ---');
  for (const acc of (accounts || [])) {
    console.log(`ID: ${acc._id}`);
    console.log(`Workspace ID: ${acc.workspaceId}`);
    console.log(`Token Status: ${acc.tokenStatus}`);
    console.log('-------------------------');
  }

  process.exit(0);
}

debug().catch(console.error);
