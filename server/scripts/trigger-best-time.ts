
// Load environment variables FIRST
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env');
console.log('Loading .env from:', envPath);
dotenv.config({ path: envPath, override: true }); // Force reload

// Log key status for debugging (masked)
const key = process.env.TOKEN_ENCRYPTION_KEY;
console.log('Active TOKEN_ENCRYPTION_KEY:', key ? `${key.substring(0, 5)}...${key.substring(key.length - 5)}` : 'MISSING');
console.log('Active SALT:', process.env.TOKEN_ENCRYPTION_GLOBAL_SALT ? 'PRESENT' : 'MISSING');

// Import services AFTER env is loaded
import mongoose from 'mongoose';
import { BestActiveTimeService } from '../services/bestActiveTime';
import { SocialAccountModel } from '../models/Social/SocialAccount';
import { tokenEncryption } from '../security/token-encryption';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/veefore-local';

async function main() {
    try {
        console.log('Connecting to MongoDB at:', MONGODB_URI);
        const dbName = process.env.MONGODB_DB_NAME || 'veeforedb';
        console.log('Using Database Name:', dbName);

        await mongoose.connect(MONGODB_URI, {
            dbName: dbName
        });
        console.log('Connected.');

        // Debug: List all accounts
        const allAccounts = await SocialAccountModel.find({});
        console.log(`Found ${allAccounts.length} total accounts in DB.`);
        allAccounts.forEach(acc => {
            console.log(`- ID: ${acc._id}, Platform: ${acc.platform}, Username: ${acc.username}`);
        });

        // 1. Find the target account (adjust as needed, e.g. first one)
        // Hardcoding to a known real account based on previous log: arpit.10
        let account = await SocialAccountModel.findOne({ username: 'arpit.10', platform: 'instagram' });

        if (!account) {
            console.log('Target account arpit.10 not found, trying rahulc1020...');
            account = await SocialAccountModel.findOne({ username: 'rahulc1020', platform: 'instagram' });
        }

        if (!account) {
            console.error('No Instagram account found (checked platform="instagram").');
            // Try fallback
            const fallback = await SocialAccountModel.findOne({ platform: { $regex: /instagram/i } });
            if (fallback) {
                console.log(`Found fallback account: ${fallback.platform}. Using that.`);
                await processAccount(fallback);
                return;
            }
            process.exit(1);
        }

        await processAccount(account);
    } catch (error) {
        console.error('Error in main:', error);
    } finally {
        await mongoose.disconnect();
    }
}

async function processAccount(account: any) {
    console.log(`Processing account: ${account.username} (${account.accountId})`);

    // Decrypt token if needed
    let token = account.accessToken;
    if (!token && account.encryptedAccessToken) {
        try {
            console.log('Decrypting access token...');
            token = tokenEncryption.decryptToken(account.encryptedAccessToken);
        } catch (e) {
            console.error('Failed to decrypt token:', e);
        }
    }

    if (!token) {
        console.error('No valid access token available for account.');
        return;
    }

    // 2. Clear previous calculation timestamp to force run
    await SocialAccountModel.updateOne(
        { _id: account._id },
        { $unset: { "aiBestActiveTime.lastComputedAt": "" } }
    );
    console.log('Cleared lastComputedAt throttle.');

    // 3. Trigger calculation
    console.log('Triggering BestActiveTime calculation...');
    await BestActiveTimeService.calculateBestActiveTime(account.accountId, token);

    // 4. Verify result
    const updated = await SocialAccountModel.findOne({ _id: account._id });
    console.log('Calculation complete.');
    console.log('New Best Time Label:', updated?.aiBestActiveTime?.best_window_label || updated?.aiBestActiveTime?.best_hour_label);
    console.log('Status:', updated?.aiBestActiveTime?.status);
}

main();
