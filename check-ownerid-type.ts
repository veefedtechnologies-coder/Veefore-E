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
  
  const sampleWorkspace = await db?.collection('workspaces').findOne({});
  console.log('Sample Workspace:', JSON.stringify(sampleWorkspace, null, 2));
  if (sampleWorkspace) {
    console.log('Type of ownerId:', typeof sampleWorkspace.ownerId);
    console.log('Is ownerId ObjectId?', sampleWorkspace.ownerId instanceof mongoose.Types.ObjectId);
  }

  process.exit(0);
}

debug().catch(console.error);
