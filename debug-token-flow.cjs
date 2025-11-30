const { MongoClient } = require('mongodb');
const mongoose = require('mongoose');

async function debugTokenFlow() {
  console.log('🔍 [DEBUG] Testing token flow from getSocialAccountsByWorkspace...');
  
  try {
    // Connect to MongoDB using the same connection string as the app
    const mongoUri = 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/veeforedb?retryWrites=true&w=majority&appName=Cluster0';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
    
    // Import storage after connection
    const { storage } = require('./server/mongodb-storage');
    
    // Get all workspaces to find one with Instagram accounts
    const allWorkspaces = await storage.getAllWorkspaces();
    console.log(`📊 Found ${allWorkspaces.length} workspaces`);
    
    for (const workspace of allWorkspaces) {
      console.log(`\n🔍 Testing workspace: ${workspace.id} (${workspace.name})`);
      
      // Get social accounts for this workspace
      const accounts = await storage.getSocialAccountsByWorkspace(workspace.id);
      const instagramAccounts = accounts.filter(acc => acc.platform === 'instagram');
      
      if (instagramAccounts.length > 0) {
        console.log(`📱 Found ${instagramAccounts.length} Instagram accounts in workspace ${workspace.id}`);
        
        for (const account of instagramAccounts) {
          console.log(`\n👤 Account: @${account.username}`);
          console.log(`   - ID: ${account.id}`);
          console.log(`   - Account ID: ${account.accountId}`);
          console.log(`   - Has Access Token: ${!!account.accessToken}`);
          console.log(`   - Access Token Length: ${account.accessToken?.length || 0}`);
          console.log(`   - Access Token Preview: ${account.accessToken ? account.accessToken.substring(0, 20) + '...' : 'NONE'}`);
          console.log(`   - Has Refresh Token: ${!!account.refreshToken}`);
          console.log(`   - Is Active: ${account.isActive}`);
          console.log(`   - Last Sync: ${account.lastSyncAt}`);
          
          // Test immediate sync simulation
          if (account.accessToken) {
            console.log(`\n🚀 Testing immediate sync simulation for @${account.username}...`);
            
            // Simulate the immediate sync endpoint logic
            const testAccount = {
              platform: 'instagram',
              isActive: account.isActive,
              accountId: account.accountId,
              username: account.username,
              accessToken: account.accessToken
            };
            
            console.log(`   - Test account object keys: ${Object.keys(testAccount)}`);
            console.log(`   - Has accessToken field: ${'accessToken' in testAccount}`);
            console.log(`   - AccessToken value type: ${typeof testAccount.accessToken}`);
            console.log(`   - AccessToken exists: ${testAccount.accessToken ? 'YES' : 'NO'}`);
            
            if (!testAccount.accessToken) {
              console.log('❌ ISSUE: No access token available for immediate sync');
            } else {
              console.log('✅ Access token is available for immediate sync');
            }
          } else {
            console.log('❌ No access token found - cannot test immediate sync');
          }
        }
        
        // Test the immediate sync endpoint directly
        if (instagramAccounts.length > 0 && instagramAccounts[0].accessToken) {
          console.log(`\n🧪 Testing immediate sync API call...`);
          
          try {
            const response = await fetch('http://localhost:3000/api/instagram/immediate-sync', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                workspaceId: workspace.id,
                accountId: instagramAccounts[0].accountId
              })
            });
            
            const result = await response.text();
            console.log(`   - Response status: ${response.status}`);
            console.log(`   - Response body: ${result}`);
            
            if (response.status === 200) {
              console.log('✅ Immediate sync API call successful');
            } else {
              console.log('❌ Immediate sync API call failed');
            }
          } catch (apiError) {
            console.log(`❌ API call error: ${apiError.message}`);
          }
        }
        
        break; // Only test first workspace with Instagram accounts
      }
    }
    
  } catch (error) {
    console.error('❌ Debug error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

debugTokenFlow().catch(console.error);