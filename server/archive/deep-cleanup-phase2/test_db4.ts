import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

async function run() {
  let mongoUri = process.env.MONGODB_URI || '';
  if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
      mongoUri = `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_HOST}/${process.env.MONGODB_DATABASE}?retryWrites=true&w=majority`;
  }
  await mongoose.connect(mongoUri);
  
  const accounts = await mongoose.connection.collection('social_accounts').find({}).toArray();
  console.log('Social Accounts:', accounts.map(a => ({ platform: a.platform, accountId: a.accountId, reach: a.reach })));
  
  process.exit(0);
}
run();
