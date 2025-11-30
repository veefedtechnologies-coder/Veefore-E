const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function syncRealData() {
  const BASE_URL = 'http://localhost:5000';
  const workspaceId = '686d98d34888852d5d7beb6c'; // arpit9996363 workspace
  
  console.log('🔄 Triggering Instagram sync for arpit9996363 account...');
  
  try {
    const response = await fetch(`${BASE_URL}/api/instagram/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId })
    });
    
    const result = await response.json();
    console.log('✅ Sync response:', result);
    
    // Check the updated values
    console.log('\n🔍 Checking updated account data...');
    const checkResponse = await fetch(`${BASE_URL}/api/diagnostics/instagram/account?workspaceId=${workspaceId}`);
    
    if (checkResponse.ok) {
      const accountData = await checkResponse.json();
      console.log('📊 Updated account data:');
      console.log('- Username:', accountData.account.username);
      console.log('- Total Shares:', accountData.account.totalShares);
      console.log('- Total Saves:', accountData.account.totalSaves);
      console.log('- Posts Analyzed:', accountData.account.postsAnalyzed);
      console.log('- Last Sync:', accountData.account.lastSyncAt);
      
      console.log('\n=== COMPARISON ===');
      console.log('Previous hardcoded value: 14 shares');
      console.log(`Current API value: ${accountData.account.totalShares} shares`);
      
      if (accountData.account.totalShares !== 14) {
        console.log('✅ SUCCESS: Real API data is now being used instead of hardcoded test data!');
      } else {
        console.log('⚠️ WARNING: Still showing hardcoded test data. Need to investigate further.');
      }
    } else {
      console.log('❌ Failed to check account data:', checkResponse.status);
    }
    
  } catch (error) {
    console.error('❌ Sync failed:', error.message);
  }
}

syncRealData().catch(console.error);