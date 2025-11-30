/**
 * Check Token Encryption Key Status
 * This script will check if TOKEN_ENCRYPTION_KEY is set and provide guidance
 */

const crypto = require('crypto');

function checkEncryptionKeyStatus() {
  console.log('🔍 Checking TOKEN_ENCRYPTION_KEY status...');
  console.log('='.repeat(50));
  
  const tokenKey = process.env.TOKEN_ENCRYPTION_KEY;
  
  console.log('Environment:', process.env.NODE_ENV || 'development');
  console.log('Has TOKEN_ENCRYPTION_KEY:', !!tokenKey);
  
  if (tokenKey) {
    console.log('Key length:', tokenKey.length);
    console.log('Key format (first 10 chars):', tokenKey.substring(0, 10) + '...');
    
    // Check if it's a hex string
    const isHex = /^[0-9a-fA-F]+$/.test(tokenKey);
    console.log('Is hex format:', isHex);
    
    if (isHex && tokenKey.length === 64) {
      console.log('✅ Key appears to be in correct format (64-char hex)');
    } else if (tokenKey.length >= 32) {
      console.log('⚠️  Key is present but may not be in optimal format');
      console.log('   Expected: 64-character hex string');
      console.log('   Actual: ' + tokenKey.length + '-character string');
    } else {
      console.log('❌ Key is too short (minimum 32 characters recommended)');
    }
  } else {
    console.log('❌ TOKEN_ENCRYPTION_KEY is not set');
    console.log('');
    console.log('🔧 SOLUTION:');
    console.log('Add this to your .env file:');
    
    // Generate a secure 256-bit key
    const secureKey = crypto.randomBytes(32).toString('hex');
    console.log('TOKEN_ENCRYPTION_KEY=' + secureKey);
    console.log('');
    console.log('This key will be used to encrypt/decrypt social media tokens.');
    console.log('⚠️  IMPORTANT: Keep this key secure and backed up!');
    console.log('⚠️  If you lose this key, all encrypted tokens will be unrecoverable!');
  }
  
  console.log('');
  console.log('📋 Next Steps:');
  console.log('1. Set TOKEN_ENCRYPTION_KEY in your .env file');
  console.log('2. Restart the server');
  console.log('3. Re-authenticate Instagram accounts to get fresh tokens');
}

checkEncryptionKeyStatus();