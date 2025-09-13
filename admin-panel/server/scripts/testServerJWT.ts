import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';

async function testServerJWT() {
  try {
    console.log('🔍 Testing server JWT configuration...');
    
    // Create a token with the correct JWT secret
    const testPayload = {
      adminId: '68bc481d7d1e16ef75881636',
      email: 'admin@veefore.com',
      role: 'superadmin'
    };
    
    const correctSecret = 'veefore-admin-super-secret-jwt-key-2024-change-in-production';
    const token = jwt.sign(testPayload, correctSecret, { expiresIn: '1h' });
    
    console.log('  - Generated token with correct secret:', token.substring(0, 50) + '...');
    
    // Test the API endpoint
    const response = await fetch('http://localhost:5001/api/admin', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('  - Response status:', response.status);
    console.log('  - Response status text:', response.statusText);
    
    const data = await response.text();
    console.log('  - Response body:', data);
    
    if (response.status === 200) {
      console.log('✅ JWT authentication successful!');
    } else {
      console.log('❌ JWT authentication failed');
    }
    
  } catch (error) {
    console.log('❌ Test failed:', error.message);
  }
}

testServerJWT();


