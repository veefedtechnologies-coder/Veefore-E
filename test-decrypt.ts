import mongoose from 'mongoose';
import 'dotenv/config';

async function testDecrypt() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log('Connected to DB');
  
  const db = mongoose.connection.db;
  if (!db) {
    console.log('No DB');
    process.exit(1);
  }
  
  const account = await db.collection('socialaccounts').findOne({ platform: 'instagram' });
  if (account) {
    console.log('Found account:', account.username);
    if (account.encryptedAccessToken) {
      console.log('Account has encrypted token!');
      try {
        const { tokenEncryption } = await import('./server/security/token-encryption');
        const decrypted = tokenEncryption.decryptToken(account.encryptedAccessToken);
        console.log('Successfully decrypted token!');
      } catch (e: any) {
        console.log('Failed to decrypt:', e.message);
      }
    } else {
      console.log('No encrypted token on this account.');
    }
  } else {
    console.log('No instagram account found in socialaccounts.');
  }
  
  process.exit(0);
}

testDecrypt();
