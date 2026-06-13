import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

async function run() {
  let mongoUri = process.env.MONGODB_URI || '';
  if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
      mongoUri = `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_HOST}/${process.env.MONGODB_DATABASE}?retryWrites=true&w=majority`;
  }
  
  const dbs = ['veefore', 'veeforedb', 'veforedb'];
  for (const dbName of dbs) {
     await mongoose.connect(mongoUri, { dbName });
     const accounts = await mongoose.connection.collection('social_accounts').countDocuments();
     const platforms = await mongoose.connection.collection('workspace_platforms').countDocuments();
     console.log(`DB ${dbName} - social_accounts: ${accounts}, workspace_platforms: ${platforms}`);
     await mongoose.disconnect();
  }
  
  process.exit(0);
}
run();
