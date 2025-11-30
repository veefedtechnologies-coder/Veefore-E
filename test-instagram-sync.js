/**
 * Test script to trigger Instagram manual sync and see debug logs
 */

const fetch = require('node-fetch');

async function testInstagramSync() {
  console.log('🧪 Testing Instagram Manual Sync...');
  
  try {
    // First, let's check what Instagram accounts exist
    console.log('\n1. Checking Instagram accounts...');
    const accountsResponse = await fetch('http://localhost:5000/api/social-accounts', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // You'll need to add your auth headers here
      }
    });
    
    if (accountsResponse.ok) {
      const accounts = await accountsResponse.json();
      const instagramAccounts = accounts.filter(acc => acc.platform === 'instagram');
      console.log(`Found ${instagramAccounts.length} Instagram accounts:`, instagramAccounts.map(acc => acc.username));
      
      if (instagramAccounts.length > 0) {
        const account = instagramAccounts[0];
        console.log(`\n2. Testing sync for account: @${account.username}`);
        
        // Trigger manual sync
        const syncResponse = await fetch(`http://localhost:5000/api/instagram/sync/${account.accountId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // You'll need to add your auth headers here
          }
        });
        
        if (syncResponse.ok) {
          const result = await syncResponse.json();
          console.log('✅ Sync response:', result);
        } else {
          console.log('❌ Sync failed:', syncResponse.status, syncResponse.statusText);
        }
      }
    } else {
      console.log('❌ Failed to fetch accounts:', accountsResponse.status);
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



