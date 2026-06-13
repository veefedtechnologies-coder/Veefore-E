import mongoose from 'mongoose';
import { tokenEncryption } from './server/security/token-encryption';
import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI!, { dbName: 'veeforedb' });
    const account = await mongoose.connection.collection('socialaccounts').findOne({ username: 'arpit.10' });
    const token = tokenEncryption.decryptToken(account!.encryptedAccessToken);
    
    // Test with 2 IDs
    const ids = ['18103553305673636', '18013282820584107'];
    const batchEntries = ids.map(id => ({
      method: 'GET',
      relative_url: `v22.0/${id}/insights?metric=reach,saved`
    }));

    const params = new URLSearchParams();
    params.append('batch', JSON.stringify(batchEntries));
    params.append('access_token', token);

    const resp = await axios.post('https://graph.facebook.com/', params);
    console.log('Batch Result:', JSON.stringify(resp.data, null, 2));

  } catch (e: any) {
    console.error('Error:', e.response?.data || e.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}
run();
