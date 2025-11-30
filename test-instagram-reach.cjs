const { MongoClient } = require('mongodb');
const fetch = require('node-fetch');

const MONGODB_URI = 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function testInstagramReachAPI() {
  console.log('🔍 Testing Instagram Reach API for arpit.10...\n');
  
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    const db = client.db('veeforedb');
    
    // Find the arpit.10 account
    const account = await db.collection('socialaccounts').findOne({
      username: 'arpit.10',
      platform: 'instagram'
    });
    
    if (!account) {
      console.log('❌ Account arpit.10 not found');
      return;
    }
    
    console.log('📊 Account Details:');
    console.log('Username:', account.username);
    console.log('Account ID:', account.accountId);
    console.log('Account Type:', account.accountType);
    console.log('Access Token (first 20 chars):', account.accessToken ? account.accessToken.substring(0, 20) + '...' : 'No access token');
    console.log('Followers Count:', account.followersCount);
    console.log('Total Reach:', account.totalReach);
    console.log('');
    
    // Test different periods
    const periods = [
      { key: 'day', label: 'Day (24 hours)' },
      { key: 'week', label: 'Week (7 days)' },
      { key: 'days_28', label: 'Month (28 days)' }
    ];
    
    for (const period of periods) {
      console.log(`🔍 Testing ${period.label} reach...`);
      try {
        const url = `https://graph.instagram.com/${account.accountId}/insights?metric=reach&period=${period.key}&access_token=${account.accessToken}`;
        console.log(`   📡 API URL: ${url.replace(account.accessToken, 'TOKEN_HIDDEN')}`);
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (response.ok) {
          console.log(`   ✅ ${period.key} reach data:`, JSON.stringify(data, null, 2));
        } else {
          console.log(`   ❌ API Error (${response.status}):`, data);
        }
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
      }
      console.log('');
    }
    
    // Test account permissions
    console.log('🔍 Testing account permissions...');
    try {
      const permUrl = `https://graph.instagram.com/me?fields=id,username,account_type&access_token=${account.accessToken}`;
      const permResponse = await fetch(permUrl);
      const permData = await permResponse.json();
      
      if (permResponse.ok) {
        console.log('   ✅ Account permissions data:', JSON.stringify(permData, null, 2));
      } else {
        console.log('   ❌ Permission check failed:', permData);
      }
    } catch (error) {
      console.log('   ❌ Error:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Database error:', error);
  } finally {
    await client.close();
  }
}

testInstagramReachAPI().catch(console.error);