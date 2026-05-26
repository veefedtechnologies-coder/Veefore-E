const fetch = require('node-fetch');

async function checkSmartPolling() {
  try {
    console.log('🔍 Checking Smart Polling Status...');
    
    const response = await fetch('http://localhost:5000/api/instagram/polling-status');
    
    if (!response.ok) {
      console.error('❌ Failed to get polling status:', response.status, response.statusText);
      return;
    }
    
    const data = await response.json();
    console.log('📊 Smart Polling Status:');
    console.log(JSON.stringify(data, null, 2));
    
    if (data.accounts && data.accounts.length > 0) {
      console.log('\n📈 Account Details:');
      data.accounts.forEach((account, index) => {
        console.log(`Account ${index + 1}: @${account.username}`);
        console.log(`  - Next Poll In: ${Math.round(account.nextPollIn / 1000)}s`);
        console.log(`  - Interval: ${Math.round(account.interval / 1000)}s`);
        console.log(`  - Last Polled: ${account.lastPolled}`);
        console.log(`  - Active: ${account.isActive}`);
      });
    } else {
      console.log('⚠️ No accounts found in smart polling system');
    }
    
  } catch (error) {
    console.error('❌ Error checking smart polling:', error.message);
  }
}

checkSmartPolling();