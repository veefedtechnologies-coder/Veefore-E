/**
 * Test Instagram comprehensive engagement analysis
 */

const fetch = require('node-fetch');

async function testInstagramSync() {
  console.log('🧪 Testing Instagram Comprehensive Engagement Analysis...');
  
  try {
    // Test the immediate-sync endpoint
    console.log('\n1. Testing immediate-sync endpoint...');
    
    const response = await fetch('http://localhost:5000/api/instagram/immediate-sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_TOKEN_HERE' // You'll need to add your auth token
      },
      body: JSON.stringify({
        workspaceId: '686d98d74888852d5d7beb75' // From your logs
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Sync successful:', result);
      
      // Check if comprehensive data is included
      if (result.account) {
        console.log('\n📊 Account Data:');
        console.log(`Username: @${result.account.username}`);
        console.log(`Followers: ${result.account.followersCount}`);
        console.log(`Posts: ${result.account.mediaCount}`);
        console.log(`Reach: ${result.account.totalReach}`);
        console.log(`Last Sync: ${result.account.lastSyncAt}`);
      }
    } else {
      const error = await response.text();
      console.log('❌ Sync failed:', response.status, error);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testInstagramSync().then(() => {
  console.log('\n✅ Test completed!');
}).catch((error) => {
  console.error('❌ Test failed:', error);
});



