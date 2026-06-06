
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { MongoStorage } from './mongodb-storage';
import { socialAccountService } from './services/SocialAccountService';
import { tokenEncryption } from './security/token-encryption'; // Adjust path if needed

// Load env from current directory (Veefore-E because we run from root)
const envPath = path.join(process.cwd(), '.env');
console.log(`Loading .env from: ${envPath}`);
dotenv.config({ path: envPath });

async function run() {
    try {
        const uri = process.env.MONGODB_URI || '';
        if (!uri) {
            console.error('MONGODB_URI is empty!');
            process.exit(1);
        }

        // Check Encryption Key
        const key = process.env.TOKEN_ENCRYPTION_KEY;
        console.log(`TOKEN_ENCRYPTION_KEY present: ${!!key}`);
        if (key) {
            console.log(`Key length: ${key.length}`);
            console.log(`Key start: ${key.substring(0, 4)}...`);
        } else {
            console.warn("WARNING: TOKEN_ENCRYPTION_KEY is missing!");
        }

        // Check Encryption Status
        console.log('Encryption Status:', tokenEncryption.getEncryptionStatus());

        // Connect to veeforedb
        console.log('Connecting to MongoDB (veeforedb)...');
        await mongoose.connect(uri, { dbName: 'veeforedb' });
        console.log('Connected to:', mongoose.connection.db?.databaseName);

        const storage = new MongoStorage(uri);

        // Check active accounts and token decryption manually first
        const accounts = await storage.getSocialAccountsByWorkspace('6847b9cdfabaede1706f2994');
        const insta = accounts.find((a: any) => a.platform === 'instagram');

        if (insta) {
            // We need to access getSocialAccountsWithTokensInternal to see if it decrypts
            // Or just emulate what it does.
            // Convert social account to see if we get a token
            /* 
               Wait, MongoStorage.getSocialAccountsByWorkspace calls 'convertSocialAccount'
               which calls 'getAccessTokenFromAccount'
               which calls 'decryptStoredToken'.
               
               So 'insta.accessToken' (if interface allows) might be populated if MongoStorage exposes it?
               No, SocialAccount interface usually Hides token.
               
               Let's use the internal method if possible or just rely on 'insta' having it if I cast to any.
               Actually, `getSocialAccountsByWorkspace` returns `ISocialAccount`, which has `accessToken`?
               Let's check ISocialAccount in SocialAccountRepository.
               
               In SocialAccountRepository:
               getAccessTokenFromAccount is used in `findActiveWithDecryptedTokens`.
               `getSocialAccountsByWorkspace` uses `convertSocialAccount`?
               Wait, MongoStorage implementation of `getSocialAccountsByWorkspace`?
            */

            console.log(`Found Instagram account: ${insta.username}`);
            // Let's try to decrypt manually if we have encrypted fields
            const rawModel = await mongoose.connection.db?.collection('socialaccounts').findOne({ _id: new mongoose.Types.ObjectId(insta.id) });
            if (rawModel) {
                console.log('Raw Encrypted Token:', rawModel.encryptedAccessToken ? 'Present' : 'Missing');
                if (rawModel.encryptedAccessToken) {
                    try {
                        const decrypted = tokenEncryption.decryptToken(rawModel.encryptedAccessToken);
                        console.log(`Decrypted Token Success! Length: ${decrypted.length}, Start: ${decrypted.substring(0, 6)}...`);
                    } catch (e: any) {
                        console.error(`Manual Decryption Failed: ${e.message}`);
                    }
                }
            }
        }

        // Instantiate Smart Polling equivalent via manual sync for testing
        console.log('Running manual sync to simulate polling...');
        if (insta) {
            await socialAccountService.syncAccount(insta.id);
            console.log('Sync complete.');
        } else {
            console.log('No instagram account found to sync.');
        }

        console.log('Done.');
        process.exit(0);

    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
