import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';

async function debugJWT() {
  try {
    console.log('🔍 Debugging JWT authentication...');
    
    // Test with the main server's JWT secret
    const mainServerSecret = 'veefore-admin-super-secret-jwt-key-2024-change-in-production';
    
    // Test with the admin panel's JWT secret (if different)
    const adminPanelSecret = 'your-super-secret-jwt-key-here';
    
    const testPayload = {
      adminId: '68bc481d7d1e16ef75881636',
      email: 'admin@veefore.com',
      role: 'superadmin'
    };
    
    console.log('  - Testing with main server secret...');
    const token1 = jwt.sign(testPayload, mainServerSecret, { expiresIn: '1h' });
    
    const response1 = await fetch('http://localhost:5001/api/admin', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token1}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('  - Main server secret result:', response1.status, response1.statusText);
    const data1 = await response1.text();
    console.log('  - Response:', data1);
    
    console.log('  - Testing with admin panel secret...');
    const token2 = jwt.sign(testPayload, adminPanelSecret, { expiresIn: '1h' });
    
    const response2 = await fetch('http://localhost:5001/api/admin', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token2}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('  - Admin panel secret result:', response2.status, response2.statusText);
    const data2 = await response2.text();
    console.log('  - Response:', data2);
    
  } catch (error) {
    console.log('❌ Debug failed:', error.message);
  }
}

debugJWT();


