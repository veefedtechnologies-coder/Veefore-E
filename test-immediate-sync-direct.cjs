const https = require('https');
const http = require('http');

function makeRequest(url, options, postData) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https:') ? https : http;
    
    const req = protocol.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function testImmediateSyncDirect() {
  console.log('🧪 [TEST] Testing immediate sync API directly...');
  
  try {
    // Test with the workspace ID from the URL you showed
    const workspaceId = '686d91be22c4290df81af016'; // rahulc1020's workspace
    
    console.log(`📊 Testing immediate sync for workspace: ${workspaceId}`);
    
    const postData = JSON.stringify({
      workspaceId: workspaceId
    });
    
    const response = await makeRequest('http://localhost:5000/api/instagram/immediate-sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, postData);
    
    console.log(`📡 Response status: ${response.status}`);
    console.log(`📡 Response headers:`, response.headers);
    console.log(`📡 Response body: ${response.body}`);
    
    if (response.status === 200) {
      console.log('✅ Immediate sync API call successful');
      try {
        const jsonResponse = JSON.parse(response.body);
        console.log('📊 Parsed response:', jsonResponse);
      } catch (parseError) {
        console.log('⚠️ Response is not JSON');
      }
    } else {
      console.log('❌ Immediate sync API call failed');
      
      // Try to parse error response
      try {
        const errorResponse = JSON.parse(response.body);
        console.log('❌ Error details:', errorResponse);
      } catch (parseError) {
        console.log('❌ Raw error response:', response.body);
      }
    }
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
    console.error('❌ Full error:', error);
  }
}

testImmediateSyncDirect().catch(console.error);