const { MongoClient } = require('mongodb');
require('dotenv').config();

// Use dynamic import for node-fetch v3 (ES module)
let fetch;
(async () => {
  const fetchModule = await import('node-fetch');
  fetch = fetchModule.default;
})();

const MONGODB_URI = 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function testImmediateSyncSimulation() {
  console.log('🧪 Testing immediate sync API simulation...\n');
  
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    const db = client.db('veeforedb');
    
    // Find the Instagram account for rahulc1020
    const account = await db.collection('socialaccounts').findOne({
      username: 'rahulc1020',
      platform: 'instagram'
    });
    
    if (!account) {
      console.log('❌ Account not found');
      return;
    }
    
    console.log('📊 Account Details:');
    console.log('Username:', account.username);
    console.log('Account ID:', account.accountId);
    console.log('Workspace ID:', account.workspaceId);
    console.log('Has encryptedAccessToken:', !!account.encryptedAccessToken);
    console.log('Has accessToken:', !!account.accessToken);
    console.log('');
    
    // Wait for fetch to be loaded
    await new Promise(resolve => {
      const checkFetch = () => {
        if (fetch) {
          resolve();
        } else {
          setTimeout(checkFetch, 100);
        }
      };
      checkFetch();
    });
    
    // Test the immediate sync API call
    console.log('🚀 Testing immediate sync API call...');
    
    try {
      const response = await fetch('http://localhost:5000/api/instagram/immediate-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workspaceId: account.workspaceId,
          accountId: account.accountId
        })
      });
      
      const responseText = await response.text();
      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));
      console.log('Response body:', responseText);
      
      if (response.status === 400 && responseText.includes('No access token available')) {
        console.log('\n❌ CONFIRMED: The API is still returning "No access token available"');
        console.log('This means the server is not properly decrypting the token.');
      } else if (response.ok) {
        console.log('\n✅ SUCCESS: The API call worked!');
      } else {
        console.log('\n⚠️  Unexpected response:', response.status, responseText);
      }
      
    } catch (fetchError) {
      console.log('❌ Failed to call immediate sync API:', fetchError.message);
      
      // Check if server is running
      try {
        const healthCheck = await fetch('http://localhost:5000/health');
        console.log('Server health check status:', healthCheck.status);
      } catch (healthError) {
        console.log('❌ Server appears to be down. Please make sure the server is running with "npm run dev"');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

testImmediateSyncSimulation();