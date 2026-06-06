
import dotenv from 'dotenv';
import path from 'path';
import mongoose from 'mongoose';
import { MongoStorage } from './mongodb-storage';
import { tokenEncryption } from './security/token-encryption';

// Load environment variables from root (Veefore-E/.env)
dotenv.config({ path: path.join(process.cwd(), '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/veeforedb';

async function verifyTokens() {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, { dbName: 'veeforedb' });
    console.log('Connected to:', mongoose.connection.db?.databaseName);

    console.log('ENCRYPTION_KEY loaded:', !!process.env.TOKEN_ENCRYPTION_KEY, 'Length:', process.env.TOKEN_ENCRYPTION_KEY?.length);

    const storage = new MongoStorage();

    // Get all instagram accounts directly from DB to see raw state
    const accounts = await (mongoose.connection.db as any).collection('socialaccounts').find({ platform: 'instagram' }).toArray();

    console.log(`Found ${accounts.length} Instagram accounts.`);

    for (const account of accounts) {
        console.log(`\n--- Account: @${account.username} (${account._id}) ---`);
        console.log('isActive:', account.isActive);
        console.log('tokenStatus:', account.tokenStatus);
        console.log('platform:', account.platform);
        console.log('Raw Fields:', Object.keys(account).filter(k => !k.startsWith('_')));
        if (account.accessToken) {
            console.log('Plain accessToken detected! Length:', account.accessToken.length);
        }

        if (account.encryptedAccessToken) {
            console.log('Encrypted Metadata:', JSON.stringify(account.encryptedAccessToken).substring(0, 100) + '...');

            // Decryption test using environment variables from root .env
            console.log('Testing Decryption with Environment Key...');
            try {
                const decryptedData = tokenEncryption.decryptToken(account.encryptedAccessToken);
                console.log('✅ Decryption SUCCESS:', decryptedData?.substring(0, 10) + '...');
            } catch (e: any) {
                console.log('❌ Decryption FAILED:', e.message);
            }
        } else {
            console.log('No encryptedAccessToken');
        }
    }

    await mongoose.disconnect();
}

verifyTokens().catch(console.error);
