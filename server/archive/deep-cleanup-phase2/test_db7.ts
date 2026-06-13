import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

async function run() {
  let mongoUri = process.env.MONGODB_URI || '';
  if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
      mongoUri = `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_HOST}/${process.env.MONGODB_DATABASE}?retryWrites=true&w=majority`;
  }
  await mongoose.connect(mongoUri, { dbName: 'test' });
  
  const accounts = await mongoose.connection.collection('social_accounts').find({}).toArray();
  const platforms = await mongoose.connection.collection('workspace_platforms').find({}).toArray();
  
  console.log('Social Accounts in test db:', accounts.length);
  if (accounts.length > 0) console.log(accounts[0]);
  
  console.log('Platforms in test db:', platforms.length);
  
  process.exit(0);
}
run();
