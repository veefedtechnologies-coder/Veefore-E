import mongoose from 'mongoose';
import { SocialAccountSchema } from './server/models/Social/SocialAccount';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

async function run() {
  const uri = process.env.MONGODB_URI;
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB_NAME || 'veeforedb', serverSelectionTimeoutMS: 5000 });
  const SocialAccount = mongoose.model('SocialAccount', SocialAccountSchema);
  const accounts = await SocialAccount.find({ workspaceId: '684402c2fd2cd4eb6521b386' });
  console.log(`Found ${accounts.length} accounts.`);
  for (const acc of accounts) {
    const json = acc.toJSON();
    console.log(JSON.stringify(json, null, 2));
  }
  await mongoose.disconnect();
}
run().catch(console.error);
