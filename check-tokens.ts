import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';
import { getAccessTokenFromAccount } from './server/storage/converters.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function checkTokens() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || '', {
      dbName: process.env.MONGODB_DB_NAME || 'veeforedb'
    });
    console.log('Connected to DB:', mongoose.connection.db.databaseName);

    const socialAccounts = mongoose.connection.db.collection('socialaccounts');
    const accounts = await socialAccounts.find().toArray();
    
    console.log(`\n--- ALL SOCIAL ACCOUNTS (${accounts.length}) ---`);
    for (const acc of accounts) {
        console.log(`_id: ${acc._id}`);
        console.log(`workspaceId: ${acc.workspaceId}`);
        console.log(`platform: ${acc.platform}`);
        console.log(`username: ${acc.username}`);
        console.log(`isActive: ${acc.isActive}`);
        const token = getAccessTokenFromAccount(acc);
        console.log(`Decrypted Token Length: ${token ? token.length : 0}`);
        console.log('-----------------------------------');
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

checkTokens();
