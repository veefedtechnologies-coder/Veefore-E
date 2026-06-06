
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Force load .env
const envPath = path.join(process.cwd(), '.env');
dotenv.config({ path: envPath });

async function verifyEncryption() {
    console.log('--- ENCRYPTION VERIFICATION ---');
    console.log(`Env parameters:`);
    console.log(`- TOKEN_ENCRYPTION_KEY loaded: ${!!process.env.TOKEN_ENCRYPTION_KEY}`);
    if (process.env.TOKEN_ENCRYPTION_KEY) {
        console.log(`- Key prefix: ${process.env.TOKEN_ENCRYPTION_KEY.substring(0, 5)}...`);
    } else {
        console.log(`- Key: <MISSING> (Will generate random key)`);
    }

    try {
        await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
        console.log('📦 MongoDB Connected');

        // Import AFTER env is loaded
        const { tokenEncryption } = await import('./server/security/token-encryption');
        const SocialAccount = mongoose.connection.collection('socialaccounts');

        // Target specific account
        const accountId = '69882372f5077d91457e876a';
        const acc = await SocialAccount.findOne({ _id: new mongoose.Types.ObjectId(accountId) });

        if (!acc) {
            console.error('❌ Account not found');
            return;
        }

        console.log(`Found account: @${acc.username}`);
        console.log(`Has encryptedAccessToken: ${!!acc.encryptedAccessToken}`);

        if (acc.encryptedAccessToken) {
            console.log('\nAttempting decryption...');
            try {
                // Manually reconstructing the object if needed, but the model likely stores it as object
                let tokenData = acc.encryptedAccessToken;
                if (typeof tokenData === 'string') {
                    console.log('Note: encryptedAccessToken is string, parsing JSON...');
                    tokenData = JSON.parse(tokenData);
                }

                const decrypted = tokenEncryption.decryptToken(tokenData);
                console.log(`✅ Decryption SUCCESS!`);
                console.log(`Token prefix: ${decrypted.substring(0, 10)}...`);
            } catch (e: any) {
                console.error(`❌ Decryption FAILED: ${e.message}`);
                console.log('\nCONCLUSION: The stored token cannot be decrypted with the current environment key.');
                console.log('Probable Cause: The token was encrypted with a different key (possibly a random dev key) or the key in .env has changed.');
                console.log('RECOMMENDATION: The user MUST re-authenticate the Instagram account to generate a new token with the current key.');
            }
        } else {
            console.log('⚠️ No encryptedAccessToken found on account.');
        }

    } catch (err: any) {
        console.error('Script Error:', err.message);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

verifyEncryption();
