require('dotenv').config();

console.log('🔍 Testing Environment Key Loading...\n');

console.log('Environment Variables:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('Has TOKEN_ENCRYPTION_KEY:', !!process.env.TOKEN_ENCRYPTION_KEY);

if (process.env.TOKEN_ENCRYPTION_KEY) {
  console.log('TOKEN_ENCRYPTION_KEY length:', process.env.TOKEN_ENCRYPTION_KEY.length);
  console.log('TOKEN_ENCRYPTION_KEY preview:', process.env.TOKEN_ENCRYPTION_KEY.substring(0, 20) + '...');
  console.log('TOKEN_ENCRYPTION_KEY full:', process.env.TOKEN_ENCRYPTION_KEY);
} else {
  console.log('❌ TOKEN_ENCRYPTION_KEY is not loaded');
}

// Test the tokenEncryption service
console.log('\n🔧 Testing TokenEncryption Service...');
const { tokenEncryption } = require('./server/security/token-encryption.js');

console.log('TokenEncryption service loaded successfully');
console.log('Encryption status:', tokenEncryption.getEncryptionStatus());

// Test with a simple token
console.log('\n🧪 Testing Simple Encryption/Decryption...');
try {
  const testToken = 'test-token-12345';
  console.log('Original token:', testToken);
  
  const encrypted = tokenEncryption.encryptToken(testToken);
  console.log('Encrypted successfully:', !!encrypted);
  console.log('Encrypted structure:', {
    hasEncryptedData: !!encrypted.encryptedData,
    hasIV: !!encrypted.iv,
    hasSalt: !!encrypted.salt,
    hasTag: !!encrypted.tag
  });
  
  const decrypted = tokenEncryption.decryptToken(encrypted);
  console.log('Decrypted successfully:', !!decrypted);
  console.log('Decrypted token:', decrypted);
  console.log('Tokens match:', testToken === decrypted);
  
} catch (error) {
  console.log('❌ Encryption/Decryption test failed:', error.message);
}