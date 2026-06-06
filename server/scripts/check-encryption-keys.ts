import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';

// Load env
dotenv.config({ path: path.join(process.cwd(), '.env') });

const key = process.env.TOKEN_ENCRYPTION_KEY;
const salt = process.env.TOKEN_ENCRYPTION_GLOBAL_SALT;
const iterations = parseInt(process.env.TOKEN_KDF_ITERATIONS || '100000', 10);

console.log('Environment Variables:');
console.log('- TOKEN_ENCRYPTION_KEY:', key ? `SET (${key.length} chars, hash: ${crypto.createHash('sha256').update(key).digest('hex').substring(0, 16)})` : 'NOT SET');
console.log('- TOKEN_ENCRYPTION_GLOBAL_SALT:', salt ? `SET (${salt.length} chars)` : 'NOT SET');
console.log('- TOKEN_KDF_ITERATIONS:', iterations);
console.log('\nEnvironment file path:', path.join(process.cwd(), '.env'));

// Check if file exists
const fs = require('fs');
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
    console.log('✅ .env file exists');
    const content = fs.readFileSync(envPath, 'utf-8');
    const hasKey = content.includes('TOKEN_ENCRYPTION_KEY');
    console.log('✅ .env contains TOKEN_ENCRYPTION_KEY:', hasKey);
} else {
    console.log('❌ .env file does NOT exist at:', envPath);
}
