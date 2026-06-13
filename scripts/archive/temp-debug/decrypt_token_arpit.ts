import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { tokenEncryption } from './server/security/token-encryption';

dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI!, { dbName: 'veeforedb' });
    const account = await mongoose.connection.collection('socialaccounts').findOne({ username: 'arpit.10' });
    
    if (account?.encryptedAccessToken) {
      const decrypted = tokenEncryption.decryptToken(account.encryptedAccessToken);
      console.log('Decrypted Token Prefix:', decrypted.substring(0, 10));
      console.log('Is Basic Token (IGAA):', decrypted.startsWith('IGAA'));
    } else {
      console.log('No encrypted token found');
    }
  } catch (e: any) {
    console.error('Error:', e.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
