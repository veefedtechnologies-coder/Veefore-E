
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import fetch from 'node-fetch';

// Load env
dotenv.config({ path: path.join(process.cwd(), '.env') });

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || 'veeforedb';
const TOKEN_KEY = process.env.TOKEN_ENCRYPTION_KEY;
const GLOBAL_SALT = process.env.TOKEN_ENCRYPTION_GLOBAL_SALT || '';

if (!MONGODB_URI || !TOKEN_KEY) {
    console.error('Missing MONGODB_URI or TOKEN_ENCRYPTION_KEY');
    process.exit(1);
}

// Decryption Logic
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const DEC_ITERATIONS = 100000;

function decryptToken(encryptedToken: any): string {
    const { encryptedData, iv, salt, tag, kdf } = encryptedToken;

    console.log('Decryption Metadata:', {
        hasIV: !!iv,
        hasSalt: !!salt,
        hasTag: !!tag,
        kdfFromFile: kdf,
        envKeyLen: TOKEN_KEY?.length
    });

    const ivBuffer = Buffer.from(iv, 'base64');
    const saltBuffer = Buffer.from(salt, 'base64');
    const tagBuffer = Buffer.from(tag, 'base64');
    const globalSaltBuffer = Buffer.from(GLOBAL_SALT, 'utf8');

    // Derive key
    const saltWithGlobal = globalSaltBuffer.length > 0
        ? Buffer.concat([saltBuffer, globalSaltBuffer])
        : saltBuffer;

    const iterations = (typeof kdf === 'number') ? kdf : DEC_ITERATIONS;

    console.log('Using iterations:', iterations);

    const key = crypto.pbkdf2Sync(TOKEN_KEY!, saltWithGlobal, iterations, KEY_LENGTH, 'sha256');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
    decipher.setAuthTag(tagBuffer);

    let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

async function run() {
    try {
        console.log('Connecting to DB:', DB_NAME);
        await mongoose.connect(MONGODB_URI!, { dbName: DB_NAME });

        // Models
        const socialSchema = new mongoose.Schema({}, { strict: false });
        const SocialAccount = mongoose.model('SocialAccount', socialSchema, 'socialaccounts');

        // Find account
        const account = await SocialAccount.findOne({ username: 'arpit.10', platform: 'instagram' });
        if (!account) {
            console.error('Account arpit.10 not found');
            return;
        }
        console.log('Found account:', account._id);

        // Decrypt token
        console.log('Decrypting token...');
        let token = '';
        if (account.accessToken) {
            token = account.accessToken;
        } else if (account.encryptedAccessToken) {
            token = decryptToken(account.encryptedAccessToken);
        } else {
            console.error('No token found');
            return;
        }
        console.log('Token decrypted (length):', token.length);

        // Fetch Audience Data
        const igAccountId = account.accountId; // 24756229734039197
        console.log('Fetching insights for IG Account:', igAccountId);

        const url = `https://graph.facebook.com/v19.0/${igAccountId}/insights?metric=audience_city,audience_country,audience_gender_age&period=lifetime&access_token=${token}`;

        const resp = await fetch(url);
        const data: any = await resp.json();

        if (data.error) {
            console.error('API Error:', data.error);
            return;
        }

        console.log('Fetched Data Points:', data.data.length);

        const audienceCity: Record<string, number> = {};
        const audienceCountry: Record<string, number> = {};
        const audienceGenderAge: Record<string, number> = {};

        data.data.forEach((item: any) => {
            const values = item.values[0].value;
            if (item.name === 'audience_city') Object.assign(audienceCity, values);
            if (item.name === 'audience_country') Object.assign(audienceCountry, values);
            if (item.name === 'audience_gender_age') Object.assign(audienceGenderAge, values);
        });

        console.log('City count:', Object.keys(audienceCity).length);
        console.log('Country count:', Object.keys(audienceCountry).length);

        // Update Analytics
        const Analytics = mongoose.model('Analytics', new mongoose.Schema({}, { strict: false }), 'analytics');
        const AnalyticsCap = mongoose.model('AnalyticsCap', new mongoose.Schema({}, { strict: false }), 'Analytics');

        const update = {
            audienceCity,
            audienceCountry,
            audienceGenderAge,
            updatedAt: new Date()
        };

        console.log('Updating Analytics for workspace:', account.workspaceId);

        // Update both collections to be safe
        const res1 = await Analytics.updateMany({ workspaceId: account.workspaceId }, { $set: update });
        console.log('Updated analytics (lowercase):', res1);

        const res2 = await AnalyticsCap.updateMany({ workspaceId: account.workspaceId }, { $set: update });
        console.log('Updated Analytics (capital):', res2);

        console.log('Done.');

    } catch (e: any) {
        console.error('Error:', e);
    } finally {
        await mongoose.disconnect();
        setTimeout(() => process.exit(0), 1000); // Force exit
    }
}

run();
