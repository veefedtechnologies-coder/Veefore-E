// Test the actual API endpoint to see what it returns
const http = require('http');

const workspaceId = '684402c2fd2cd4eb6521b386';

// Note: This won't work without auth, but let's check if server is responding
const options = {
  hostname: 'localhost',
  port: 5000,
  path: `/api/social-accounts?workspaceId=${workspaceId}`,
  method: 'GET',
  headers: {
    'Content-Type': 'application/json'
  }
};

console.log('🔍 Testing actual API endpoint...');
console.log(`URL: http://localhost:5000${options.path}\n`);

const req = http.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const accounts = JSON.parse(data);
      if (Array.isArray(accounts) && accounts.length > 0) {
        const instagramAccount = accounts.find(acc => acc.platform === 'instagram');
        if (instagramAccount) {
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('📊 API RESPONSE FOR INSTAGRAM ACCOUNT:');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log({
            username: instagramAccount.username,
            totalShares: instagramAccount.totalShares,
            totalSaves: instagramAccount.totalSaves,
            totalLikes: instagramAccount.totalLikes,
            totalComments: instagramAccount.totalComments,
          });
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
          
          if (instagramAccount.totalShares === 0 || instagramAccount.totalSaves === 0) {
            console.log('❌ API IS RETURNING 0! Server needs to be restarted with fixes.');
          } else {
            console.log('✅ API IS RETURNING CORRECT VALUES!');
            console.log('   The issue is in frontend cache or data transformation.');
          }
        }
      } else {
        console.log('⚠️  No accounts returned (might need authentication)');
      }
    } catch (error) {
      console.log('Response (might be error):', data.substring(0, 500));
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Error making request:', error.message);
  console.log('   Server might not be running or requires authentication');
});

req.end();

