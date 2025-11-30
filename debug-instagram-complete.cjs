const { default: fetch } = require('node-fetch');

const BASE_URL = 'http://localhost:5000';

async function debugInstagramSharesSaves() {
  console.log('\n=== COMPLETE INSTAGRAM SHARES/SAVES DEBUG ===\n');

  try {
    // 1. Create test user and workspace
    console.log('1. Creating test user and workspace...');
    let workspaceId;
    
    try {
      const userResponse = await fetch(`${BASE_URL}/api/debug/create-test-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (userResponse.ok) {
        const userData = await userResponse.json();
        workspaceId = userData.workspaceId;
        console.log('✅ Test user and workspace created');
        console.log('Workspace ID:', workspaceId);
      } else {
        throw new Error('User creation failed');
      }
    } catch (error) {
      console.log('⚠️ User creation failed, trying to get existing workspace...');
      
      // Get existing workspace
      const accountsResponse = await fetch(`${BASE_URL}/api/debug/instagram-accounts`);
      const accountsData = await accountsResponse.json();
      
      if (accountsData.accounts && accountsData.accounts.length > 0) {
        workspaceId = accountsData.accounts[0].workspaceId;
        console.log('Using existing workspace:', workspaceId);
      } else {
        throw new Error('No existing workspace found');
      }
    }

    // 2. Check full Instagram account data BEFORE sync
    console.log('\n2. Checking full Instagram account data before sync...');
    const beforeResponse = await fetch(`${BASE_URL}/api/debug/instagram-account-full/${workspaceId}`);
    
    if (beforeResponse.ok) {
      const beforeData = await beforeResponse.json();
      console.log('✅ Instagram account found before sync:');
      console.log('- Username:', beforeData.account.username);
      console.log('- Total Shares:', beforeData.account.totalShares);
      console.log('- Total Saves:', beforeData.account.totalSaves);
      console.log('- Posts Analyzed:', beforeData.account.postsAnalyzed);
      console.log('- Last Sync:', beforeData.account.lastSyncAt);
      console.log('- Engagement Rate:', beforeData.account.engagementRate);
    } else {
      console.log('⚠️ No Instagram account found before sync');
    }

    // 3. Trigger Instagram sync
     console.log('\n3. Triggering Instagram sync...');
     const syncResponse = await fetch(`${BASE_URL}/api/instagram/sync-test`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' }
     });

    if (syncResponse.ok) {
      const syncData = await syncResponse.json();
      console.log('✅ Instagram sync completed');
      console.log('Workspace ID:', syncData.workspaceId);
      
      if (syncData.instagramAccountData) {
        console.log('Instagram account data returned from sync');
      } else {
        console.log('⚠️ No Instagram account data returned from sync');
      }
    } else {
      const errorText = await syncResponse.text();
      console.log('❌ Instagram sync failed:', errorText);
    }

    // 4. Check full Instagram account data AFTER sync
    console.log('\n4. Checking full Instagram account data after sync...');
    const afterResponse = await fetch(`${BASE_URL}/api/debug/instagram-account-full/${workspaceId}`);
    
    if (afterResponse.ok) {
      const afterData = await afterResponse.json();
      console.log('✅ Instagram account found after sync:');
      console.log('- Username:', afterData.account.username);
      console.log('- Total Shares:', afterData.account.totalShares);
      console.log('- Total Saves:', afterData.account.totalSaves);
      console.log('- Posts Analyzed:', afterData.account.postsAnalyzed);
      console.log('- Last Sync:', afterData.account.lastSyncAt);
      console.log('- Engagement Rate:', afterData.account.engagementRate);
      console.log('- Sampling Strategy:', afterData.account.samplingStrategy);
      
      console.log('\n=== FINAL SHARES/SAVES DEBUG RESULTS ===');
      console.log('Account ID:', afterData.account.id);
      console.log('Username:', afterData.account.username);
      console.log('Workspace ID:', afterData.account.workspaceId);
      console.log('Followers Count:', afterData.account.followersCount);
      console.log('Media Count:', afterData.account.mediaCount);
      console.log('Last Sync:', afterData.account.lastSyncAt);
      console.log('Has Access Token:', afterData.account.hasAccessToken);
      console.log('Is Active:', afterData.account.isActive);
      
      console.log('\n🔍 SHARES/SAVES INVESTIGATION:');
      if (afterData.account.totalShares > 0 || afterData.account.totalSaves > 0) {
        console.log('✅ Shares/saves data is present!');
        console.log(`Total Shares: ${afterData.account.totalShares}`);
        console.log(`Total Saves: ${afterData.account.totalSaves}`);
      } else {
        console.log('❌ Shares/saves data is missing or zero.');
        console.log('The bug likely occurs in the updateAccountWithRealData method.');
        console.log('Need to check if the sync process is preserving or overwriting these values.');
      }
      
    } else {
      console.log('❌ No Instagram account found after sync');
    }

    console.log('\n=== DEBUG SUMMARY ===');
    console.log('✅ Test completed successfully');
    console.log('🔍 Next steps:');
    console.log('1. Check if updateAccountWithRealData is being called');
    console.log('2. Verify if shares/saves data is being fetched from Instagram API');
    console.log('3. Check if fallback logic is setting shares/saves to 0');
    console.log('4. Review the engagement metrics calculation');

  } catch (error) {
    console.error('❌ Debug test failed:', error.message);
  }
}

debugInstagramSharesSaves();