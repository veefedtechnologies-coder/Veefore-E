async function debugApiResponse() {
  const fetch = (await import('node-fetch')).default;
  try {
    console.log('🔍 Debugging API response for social accounts...');
    
    const workspaceId = '686d98d34888852d5d7beb6c'; // arpit9996363 workspace
    const BASE_URL = 'http://localhost:5000';
    
    // Make the same API call that the frontend makes
    const response = await fetch(`${BASE_URL}/api/social-accounts?workspaceId=${workspaceId}&period=week&_ts=${Date.now()}`);
    
    if (!response.ok) {
      console.error('❌ API request failed:', response.status, response.statusText);
      return;
    }
    
    const data = await response.json();
    console.log('📊 Full API Response:', JSON.stringify(data, null, 2));
    
    // Find Instagram accounts
    const instagramAccounts = data.filter(account => account.platform === 'instagram');
    console.log(`\n📸 Found ${instagramAccounts.length} Instagram accounts:`);
    
    instagramAccounts.forEach((account, index) => {
      console.log(`\n--- Instagram Account ${index + 1} ---`);
      console.log(`Username: ${account.username}`);
      console.log(`Display Name: ${account.displayName}`);
      console.log(`Total Shares: ${account.totalShares}`);
      console.log(`Total Saves: ${account.totalSaves}`);
      console.log(`Total Likes: ${account.totalLikes}`);
      console.log(`Total Comments: ${account.totalComments}`);
      console.log(`Posts Analyzed: ${account.postsAnalyzed}`);
      console.log(`Last Sync: ${account.lastSync}`);
      console.log(`Account ID: ${account._id}`);
    });
    
    // Check if any account has 16 shares
    const accountWith16Shares = instagramAccounts.find(acc => acc.totalShares === 16);
    if (accountWith16Shares) {
      console.log('\n🚨 FOUND ACCOUNT WITH 16 SHARES:');
      console.log(`Username: ${accountWith16Shares.username}`);
      console.log(`Account ID: ${accountWith16Shares._id}`);
      console.log('This explains why the UI shows 16 shares!');
    }
    
    // Check if any account has 2 shares
    const accountWith2Shares = instagramAccounts.find(acc => acc.totalShares === 2);
    if (accountWith2Shares) {
      console.log('\n✅ FOUND ACCOUNT WITH 2 SHARES:');
      console.log(`Username: ${accountWith2Shares.username}`);
      console.log(`Account ID: ${accountWith2Shares._id}`);
    }
    
  } catch (error) {
    console.error('❌ Error debugging API response:', error);
  }
}

debugApiResponse();