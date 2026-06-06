import { tokenEncryption } from '../security/token-encryption';
import mongoose from 'mongoose';
import { SocialAccountModel } from '../models/Social/SocialAccount';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || 'veeforedb';

async function comprehensiveDiagnostic() {
    console.log('=== COMPREHENSIVE ENCRYPTION DIAGNOSTIC ===\n');

    // Test 1: Fresh encrypt/decrypt
    console.log('TEST 1: Fresh Encrypt/Decrypt');
    const testToken = 'IGTEST1234567890ABCDEFGH';
    try {
        const encrypted = tokenEncryption.encryptToken(testToken);
        console.log('✅ Encryption succeeded');
        console.log('  - IV length:', Buffer.from(encrypted.iv, 'base64').length);
        console.log('  - Salt length:', Buffer.from(encrypted.salt, 'base64').length);
        console.log('  - Tag length:', Buffer.from(encrypted.tag, 'base64').length);
        console.log('  - KDF iterations:', encrypted.kdf);

        const decrypted = tokenEncryption.decryptToken(encrypted);
        console.log('✅ Decryption succeeded');
        console.log('  - Match:', testToken === decrypted ? '✅ YES' : '❌ NO');
    } catch (e: any) {
        console.log('❌ Test 1 FAILED:', e.message);
        return;
    }

    // Test 2: Database token
    console.log('\nTEST 2: Database Token Decryption');
    await mongoose.connect(MONGODB_URI!, { dbName: DB_NAME });

    const account = await SocialAccountModel.findOne({
        workspaceId: '6847b9cdfabaede1706f2994',
        platform: 'instagram',
        username: 'arpit.10'
    }).sort({ updatedAt: -1 });

    if (!account) {
        console.log('❌ No account found');
        await mongoose.disconnect();
        return;
    }

    console.log('Found account:', account._id);
    console.log('  - Created:', account.createdAt);
    console.log('  - Updated:', account.updatedAt);

    if (!account.encryptedAccessToken) {
        console.log('❌ No encrypted token in DB');
        await mongoose.disconnect();
        return;
    }

    const dbToken = account.encryptedAccessToken;
    console.log('Encrypted token structure:');
    console.log('  - Has encryptedData:', !!dbToken.encryptedData, `(length: ${dbToken.encryptedData?.length || 0})`);
    console.log('  - Has iv:', !!dbToken.iv, `(buf len: ${Buffer.from(dbToken.iv, 'base64').length})`);
    console.log('  - Has salt:', !!dbToken.salt, `(buf len: ${Buffer.from(dbToken.salt, 'base64').length})`);
    console.log('  - Has tag:', !!dbToken.tag, `(buf len: ${Buffer.from(dbToken.tag, 'base64').length})`);
    console.log('  - KDF:', dbToken.kdf);

    // Test 3: Manual key derivation
    console.log('\nTEST 3: Manual Key Derivation Test');
    const masterKey = process.env.TOKEN_ENCRYPTION_KEY!;
    const keyHash = crypto.createHash('sha256').update(masterKey).digest('hex').substring(0, 16);
    console.log('Master key hash:', keyHash);

    const saltBuffer = Buffer.from(dbToken.salt, 'base64');
    const iterations = dbToken.kdf || 100000;

    // Derive key manually (should match what encryption service does)
    const derivedKey = crypto.pbkdf2Sync(masterKey, saltBuffer, iterations, 32, 'sha256');
    console.log('Derived key (first 16 bytes):', derivedKey.toString('hex').substring(0, 32));

    // Try decrypting with this manually derived key
    const ivBuffer = Buffer.from(dbToken.iv, 'base64');
    const tagBuffer = Buffer.from(dbToken.tag, 'base64');

    try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, ivBuffer);
        decipher.setAuthTag(tagBuffer);
        let decrypted = decipher.update(dbToken.encryptedData, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        console.log('✅ Manual decryption SUCCEEDED!');
        console.log('  - Token starts with:', decrypted.substring(0, 20));
    } catch (e: any) {
        console.log('❌ Manual decryption FAILED:', e.message);
    }

    // Test 4: Try service decryption
    console.log('\nTEST 4: Service Decryption');
    try {
        const decrypted = tokenEncryption.decryptToken(dbToken);
        console.log('✅ Service decryption SUCCEEDED!');
        console.log('  - Token starts with:', decrypted.substring(0, 20));
    } catch (e: any) {
        console.log('❌ Service decryption FAILED:', e.message);
    }

    await mongoose.disconnect();
    console.log('\n=== DIAGNOSTIC COMPLETE ===');
}

comprehensiveDiagnostic().catch(console.error);
