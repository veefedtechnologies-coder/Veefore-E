console.log('Testing smart polling status...');

// Simple fetch test for polling status
fetch('http://localhost:5000/api/instagram/polling-status')
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  })
  .then(data => {
    console.log('Polling Status Response:', JSON.stringify(data, null, 2));
    
    if (data.accounts && data.accounts.length > 0) {
      console.log('\n=== Account Details ===');
      data.accounts.forEach((acc, index) => {
        console.log(`\nAccount ${index + 1}:`);
        console.log(`  Username: ${acc.username}`);
        console.log(`  Shares: ${acc.totalShares || 0}`);
        console.log(`  Saves: ${acc.totalSaves || 0}`);
        console.log(`  Last Poll: ${acc.lastPolledAt || 'Never'}`);
        console.log(`  Next Poll: ${acc.nextPollAt || 'Not scheduled'}`);
        console.log(`  Business Account: ${acc.isBusinessAccount || false}`);
      });
    } else {
      console.log('No accounts found in polling status');
    }
  })
  .catch(error => {
    console.error('Error fetching polling status:', error.message);
  });