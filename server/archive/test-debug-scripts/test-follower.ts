import dotenv from 'dotenv';
dotenv.config({path: '../.env'});
import mongoose from 'mongoose';
import { tokenEncryption } from './security/token-encryption';

async function test() {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: 'veeforedb' });
  const db = mongoose.connection.db;
  const account = await db.collection('socialaccounts').findOne({ accountId: '17841474747481653' });
  const token = tokenEncryption.decryptToken(account.encryptedAccessToken);
  const igsid = '1479580653003682'; // From screenshot
  
  const url = `https://graph.facebook.com/v19.0/${igsid}?metadata=1&access_token=${token}`;
  const res = await fetch(url);
  
  if (res.ok) {
    const data = await res.json();
    console.log('Result:', JSON.stringify(data, null, 2));
  } else {
    console.log('Error Status:', res.status);
    console.log('Error Body:', await res.text());
  }
  process.exit(0);
}
test();
