import { tokenEncryption } from '../security/token-encryption';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

console.log('Testing TokenEncryptionService...\n');

const testToken = 'TEST_ACCESS_TOKEN_12345_ABCDEFG';

console.log('1. Encrypting test token...');
const encrypted = tokenEncryption.encryptToken(testToken);
console.log('✅ Encrypted successfully');
console.log('   Encrypted object keys:', Object.keys(encrypted));

console.log('\n2. Immediately decrypting...');
try {
    const decrypted = tokenEncryption.decryptToken(encrypted);
    console.log('✅ Decrypted successfully');
    console.log('   Match:', decrypted === testToken ? 'YES ✅' : `NO ❌ (got: "${decrypted}")`);
} catch (e: any) {
    console.log('❌ Decryption FAILED:', e.message);
    console.error(e);
}

console.log('\n3. Testing with real token from database...');
// We'll manually create a token structure like what's in the DB
import mongoose from 'mongoose';
import { SocialAccountModel } from '../models/Social/SocialAccount';

async function testRealToken() {
    const MONGODB_URI = process.env.MONGODB_URI;
    const DB_NAME = process.env.MONGODB_DB_NAME || 'veeforedb';

    await mongoose.connect(MONGODB_URI!, { dbName: DB_NAME });

    const workspaceId = '6847b9cdfabaede1706f2994';
    const account = await SocialAccountModel.findOne({
        workspaceId,
        platform: 'instagram',
        username: 'arpit.10'
    }).sort({ updatedAt: -1 });

    if (!account || !account.encryptedAccessToken) {
        console.log('❌ No encrypted token found in DB');
        await mongoose.disconnect();
        return;
    }

    console.log('Found encrypted token in DB:');
    console.log('  - Has encryptedData:', !!account.encryptedAccessToken.encryptedData);
    console.log('  -Has iv:', !!account.encryptedAccessToken.iv);
    console.log('  - Has salt:', !!account.encryptedAccessToken.salt);
    console.log('  - Has tag:', !!account.encryptedAccessToken.tag);
    console.log('  - KDF iterations:', account.encryptedAccessToken.kdf || 'not set');

    console.log('\nAttempting to decrypt...');
    try {
        const decrypted = tokenEncryption.decryptToken(account.encryptedAccessToken);
        console.log('✅ SUCCESS! Decrypted token starts with:', decrypted.substring(0, 20));
    } catch (e: any) {
        console.log('❌ FAILED:', e.message);
    }

    await mongoose.disconnect();
}

testRealToken();
