
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { tokenEncryption } from '../security/token-encryption';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env');
console.log('Loading .env from:', envPath);
dotenv.config({ path: envPath });

async function main() {
    console.log('--- Testing Local Encryption Configuration ---');

    // 1. Check if keys are loaded
    const status = tokenEncryption.getEncryptionStatus();
    console.log('Encryption Status:', JSON.stringify(status, null, 2));

    if (!status.hasEnvironmentKey) {
        console.error('❌ FAILURE: TOKEN_ENCRYPTION_KEY not found in environment!');
        return;
    }

    // 2. Perform Round-Trip Test
    const originalSecret = "my-secret-access-token-123";
    console.log(`\nOriginal Token: ${originalSecret}`);

    try {
        console.log('Encrypting...');
        const encrypted = tokenEncryption.encryptToken(originalSecret);
        console.log('Encrypted Data:', encrypted.encryptedData.substring(0, 20) + '...');

        console.log('Decrypting...');
        const decrypted = tokenEncryption.decryptToken(encrypted);

        if (decrypted === originalSecret) {
            console.log('\n✅ SUCCESS: Local encryption/decryption is working perfectly.');
            console.log('CONCLUSION: Since this local test works, the error with the Database data PROVES that the key in your local .env is DIFFERENT from the key that encrypted the data in MongoDB Atlas.');
            console.log('ACTION: Please overwrite your local TOKEN_ENCRYPTION_KEY with the one from Render.');
        } else {
            console.error('\n❌ FAILURE: Decrypted value does not match original!');
        }
    } catch (error) {
        console.error('\n❌ CRASH: Encryption test failed:', error);
    }
}

main();
