const { MongoClient } = require('mongodb');
const fetch = require('node-fetch');

async function checkBusinessAccount() {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db('veefore');
    
    const account = await db.collection('socialaccounts').findOne({ username: 'arpit.10' });
    if (!account) {
      console.log('❌ Account not found, checking all accounts...');
      const allAccounts = await db.collection('socialaccounts').find({}).toArray();
      console.log('Available accounts:', allAccounts.map(acc => acc.username));
      return;
    }
    
    console.log('📊 Account Info:');
    console.log('- Username:', account.username);
    console.log('- Account Type:', account.accountType);
    console.log('- Is Business:', account.isBusinessAccount);
    console.log('- Has Access Token:', !!account.accessToken);
    console.log('- Total Shares:', account.totalShares || 0);
    console.log('- Total Saves:', account.totalSaves || 0);
    
    if (account.accessToken) {
      console.log('\n🔍 Testing Instagram API...');
      const response = await fetch(`https://graph.instagram.com/me?fields=account_type&access_token=${account.accessToken}`);
      const data = await response.json();
      console.log('- API Account Type:', data.account_type);
      
      // Test media insights
      const mediaResponse = await fetch(`https://graph.instagram.com/me/media?fields=id&limit=1&access_token=${account.accessToken}`);
      const mediaData = await mediaResponse.json();
      
      if (mediaData.data && mediaData.data[0]) {
        const mediaId = mediaData.data[0].id;
        console.log('- Testing insights for media ID:', mediaId);
        // Try Instagram Graph first
        const insightsResponse = await fetch(`https://graph.instagram.com/${mediaId}/insights?metric=shares,saved&access_token=${account.accessToken}`);
        const insightsData = await insightsResponse.json();
        console.log('- IG Insights Response:', JSON.stringify(insightsData, null, 2));
        // Fallback: test Facebook Graph for Business insights
        const fbInsightsResponse = await fetch(`https://graph.facebook.com/v21.0/${mediaId}/insights?metric=shares,saved&access_token=${account.accessToken}`);
        const fbInsightsData = await fbInsightsResponse.json();
        console.log('- FB Insights Response:', JSON.stringify(fbInsightsData, null, 2));
      }
    }
    
    await client.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkBusinessAccount();
