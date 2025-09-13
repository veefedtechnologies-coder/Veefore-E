import fetch from 'node-fetch';

async function testServer() {
  try {
    console.log('🔍 Testing admin panel server...');
    
    // Test if server is running
    const response = await fetch('http://localhost:5001/api/admin', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer test-token',
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Server is running!');
    console.log('  - Status:', response.status);
    console.log('  - Status Text:', response.statusText);
    
    const data = await response.text();
    console.log('  - Response:', data);
    
  } catch (error) {
    console.log('❌ Server test failed:', error.message);
  }
}

testServer();


