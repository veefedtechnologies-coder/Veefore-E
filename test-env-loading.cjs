// Test environment variable loading
console.log('🔍 Testing environment variable loading...');

// Check if dotenv is available
try {
  require('dotenv').config();
  console.log('✅ dotenv loaded successfully');
} catch (error) {
  console.log('❌ dotenv not available:', error.message);
}

console.log('\n📋 Environment Variables:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
console.log('Has TOKEN_ENCRYPTION_KEY:', !!process.env.TOKEN_ENCRYPTION_KEY);

if (process.env.TOKEN_ENCRYPTION_KEY) {
  console.log('TOKEN_ENCRYPTION_KEY length:', process.env.TOKEN_ENCRYPTION_KEY.length);
  console.log('TOKEN_ENCRYPTION_KEY preview:', process.env.TOKEN_ENCRYPTION_KEY.substring(0, 20) + '...');
} else {
  console.log('❌ TOKEN_ENCRYPTION_KEY is not loaded');
}

console.log('\n🔍 All environment variables containing "TOKEN" or "KEY":');
Object.keys(process.env)
  .filter(key => key.includes('TOKEN') || key.includes('KEY'))
  .forEach(key => {
    const value = process.env[key];
    console.log(`${key}: ${value ? (value.length > 50 ? value.substring(0, 20) + '...' : value) : 'undefined'}`);
  });