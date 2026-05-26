const http = require('http');

async function debugTotalRepliesError() {
  console.log('🔍 [DEBUG] Starting totalReplies error investigation...');
  
  const postData = JSON.stringify({
    workspaceId: '686d91be22c4290df81af016'
  });

  const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/instagram/immediate-sync',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log('📡 Response status:', res.statusCode);
        console.log('📡 Raw response:', data);
        
        if (res.statusCode !== 200) {
          console.log('❌ Response failed with status:', res.statusCode);
          
          try {
            const errorData = JSON.parse(data);
            console.log('📡 Parsed error data:', errorData);
            
            // Check if this is the totalReplies error
            if (errorData.message && errorData.message.includes('totalReplies is not defined')) {
              console.log('🎯 Found the totalReplies error!');
              console.log('🔍 Error message:', errorData.message);
              
              // The error is a ReferenceError, which means a variable is being used without being declared
              // This suggests the error is happening in JavaScript execution, not in our TypeScript code
              console.log('💡 This appears to be a ReferenceError during JavaScript execution');
              console.log('💡 The variable "totalReplies" is being referenced somewhere without being declared');
            }
          } catch (parseError) {
            console.log('❌ Could not parse error response as JSON');
          }
        }
        
        resolve();
      });
    });

    req.on('error', (error) => {
      console.error('❌ Request failed:', error.message);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

debugTotalRepliesError().catch(console.error);