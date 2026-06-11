/**
 * Debug Token Format Script
 * 
 * This script checks if the auth_token cookie contains a valid Firebase custom token
 */

const http = require('http');

console.log('🔍 Checking token format from /api/auth/session...\n');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/auth/session',
  method: 'GET',
  headers: {
    // Use a dummy token to test the response format
    'Cookie': 'auth_token=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOiJ0ZXN0In0.test'
  }
};

const req = http.request(options, (res) => {
  console.log(`✅ Status Code: ${res.statusCode}\n`);
  
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log('📦 Response:', JSON.stringify(parsed, null, 2));
      
      if (parsed.customToken) {
        console.log('\n✅ Custom token found!');
        console.log(`   Length: ${parsed.customToken.length} characters`);
        console.log(`   Starts with: ${parsed.customToken.substring(0, 50)}...`);
        
        // Check if it looks like a JWT
        const parts = parsed.customToken.split('.');
        console.log(`   JWT parts: ${parts.length} (should be 3 for valid JWT)`);
        
        if (parts.length === 3) {
          console.log('\n✅ Token appears to be a valid JWT format');
          try {
            const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
            console.log('   Header:', JSON.stringify(header, null, 2));
          } catch (e) {
            console.log('   ⚠️  Could not decode header');
          }
        } else {
          console.log('\n❌ Token is NOT in JWT format!');
          console.log('   This could be why Firebase rejects it');
        }
      } else if (parsed.error) {
        console.log('\n❌ Error response:', parsed.error);
        console.log('   Message:', parsed.message);
      } else {
        console.log('\n⚠️  Unexpected response format');
      }
    } catch (e) {
      console.log('❌ Failed to parse response:', e.message);
      console.log('   Raw data:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request failed:', error.message);
  console.log('\n⚠️  Make sure your server is running on port 3000');
});

req.end();
