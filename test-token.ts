import mongoose from 'mongoose';
import { tokenEncryption } from './server/security/token-encryption';

async function run() {
  await mongoose.connect('mongodb://localhost:27017/veefore');
  const acc = await mongoose.connection.db!.collection('socialaccounts').findOne({ username: 'rahulc1020' });
  if (acc) {
    console.log('Plain:', acc.accessToken);
    if (acc.encryptedAccessToken) {
      console.log('Decrypted:', tokenEncryption.decryptToken(acc.encryptedAccessToken));
    }
  }
  process.exit(0);
}
run();
