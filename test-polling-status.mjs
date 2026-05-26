#!/usr/bin/env node

console.log('🧪 TESTING POLLING STATUS API');
console.log('==============================\n');

try {
  const response = await fetch('https://veefore-webhook.veefore.com/api/instagram/polling-status', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    console.log(`❌ API Error: ${response.status} ${response.statusText}`);
    const errorText = await response.text();
    console.log('Error response:', errorText);
    process.exit(1);
  }

  const data = await response.json();
  
  console.log('📊 POLLING STATUS RESPONSE:');
  console.log('===========================');
  console.log(`Total Accounts: ${data.totalAccounts}`);
  console.log(`Accounts Array Length: ${data.accounts?.length || 0}`);
  
  if (data.accounts && data.accounts.length > 0) {
    console.log('\n📋 ACCOUNT DETAILS:');
    data.accounts.forEach((account, index) => {
      console.log(`\n${index + 1}. @${account.username}:`);
      console.log(`   Account ID: ${account.accountId}`);
      console.log(`   Status: ${account.status}`);
      console.log(`   Next Poll In: ${account.nextPollIn}ms (${Math.round(account.nextPollIn / 1000 / 60)} minutes)`);
      console.log(`   Time Since Activity: ${Math.round(account.timeSinceActivity / 1000 / 60)} minutes`);
      console.log(`   Last Follower Count: ${account.lastFollowerCount}`);
      console.log(`   Consecutive No Changes: ${account.consecutiveNoChanges}`);
    });
  } else {
    console.log('\n⚠️  NO ACCOUNTS FOUND');
    console.log('This could mean:');
    console.log('- No Instagram accounts are connected');
    console.log('- Smart polling system is not initialized');
    console.log('- Accounts are not active');
  }
  
  console.log('\n✅ POLLING STATUS TEST COMPLETED');
  
} catch (error) {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
}




