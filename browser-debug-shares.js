// Browser console debug script for shares data
// Copy and paste this into your browser's developer console

console.log('🔍 Debugging shares data in browser...');

// Check if there's any cached data
const queryClient = window.__REACT_QUERY_CLIENT__;
if (queryClient) {
  console.log('📊 React Query Cache Data:');
  const cache = queryClient.getQueryCache();
  const queries = cache.getAll();
  
  queries.forEach(query => {
    if (query.queryKey && query.queryKey.some(key => key.includes('social-accounts'))) {
      console.log('🔍 Social Accounts Query:', query.queryKey);
      console.log('📊 Data:', query.state.data);
      
      if (query.state.data && Array.isArray(query.state.data)) {
        const instagramAccounts = query.state.data.filter(acc => acc.platform === 'instagram');
        console.log(`📸 Instagram accounts found: ${instagramAccounts.length}`);
        
        instagramAccounts.forEach((acc, index) => {
          console.log(`--- Instagram Account ${index + 1} ---`);
          console.log(`Username: ${acc.username}`);
          console.log(`Total Shares: ${acc.totalShares}`);
          console.log(`Total Saves: ${acc.totalSaves}`);
          console.log(`Account ID: ${acc._id}`);
          console.log(`Last Sync: ${acc.lastSync}`);
        });
      }
    }
  });
} else {
  console.log('❌ React Query client not found');
}

// Check localStorage for any cached data
console.log('\n💾 Checking localStorage...');
Object.keys(localStorage).forEach(key => {
  if (key.includes('social') || key.includes('instagram') || key.includes('shares')) {
    console.log(`${key}:`, localStorage.getItem(key));
  }
});

// Check sessionStorage
console.log('\n🔄 Checking sessionStorage...');
Object.keys(sessionStorage).forEach(key => {
  if (key.includes('social') || key.includes('instagram') || key.includes('shares')) {
    console.log(`${key}:`, sessionStorage.getItem(key));
  }
});

console.log('\n✅ Debug complete. Check the logs above for shares data.');