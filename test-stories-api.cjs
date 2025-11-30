const { MongoClient } = require('mongodb');
const axios = require('axios');

async function testStoriesAPI() {
  console.log('🔍 Testing Instagram Stories API with real access token...');
  
  const client = new MongoClient('mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0');
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db('veeforedb');
    const collection = db.collection('socialaccounts');
    
    // Find the arpit.10 Instagram account
    const account = await collection.findOne({
      username: 'arpit.10',
      platform: 'instagram'
    });
    
    if (!account) {
      console.log('❌ No arpit.10 Instagram account found');
      return;
    }
    
    console.log('📱 Found Instagram account:');
    console.log('  Username:', account.username);
    console.log('  Account ID:', account.accountId);
    console.log('  Workspace ID:', account.workspaceId);
    console.log('  Has encryptedAccessToken:', !!account.encryptedAccessToken);
    
    // Import the storage class to decrypt the token
    const { MongoStorage } = require('./server/mongodb-storage.js');
    const storage = new MongoStorage();
    
    // Get decrypted access token
    console.log('\n🔓 Decrypting access token...');
    const accessToken = await storage.getAccessTokenFromAccount(account);
    
    if (!accessToken) {
      console.log('❌ Failed to decrypt access token');
      return;
    }
    
    console.log('✅ Access token decrypted successfully');
    console.log('  Token length:', accessToken.length);
    console.log('  Token preview:', accessToken.substring(0, 20) + '...');
    
    // Test the Instagram Stories API endpoint
    console.log('\n📊 Testing Instagram Stories API endpoint...');
    
    const storiesUrl = `https://graph.instagram.com/me/stories`;
    const params = {
      fields: 'id,media_type,media_url,timestamp,like_count,comments_count,shares_count,saves_count,reach,replies_count,product_type',
      access_token: accessToken
    };
    
    console.log('  URL:', storiesUrl);
    console.log('  Fields:', params.fields);
    
    try {
      const response = await axios.get(storiesUrl, { params });
      
      console.log('✅ Stories API Response:');
      console.log('  Status:', response.status);
      console.log('  Data:', JSON.stringify(response.data, null, 2));
      
      if (response.data && response.data.data) {
        console.log(`\n📈 Stories found: ${response.data.data.length}`);
        
        if (response.data.data.length > 0) {
          console.log('\n📋 Story details:');
          response.data.data.forEach((story, index) => {
            console.log(`  ${index + 1}. Story ID: ${story.id}`);
            console.log(`     Media Type: ${story.media_type}`);
            console.log(`     Product Type: ${story.product_type || 'N/A'}`);
            console.log(`     Timestamp: ${story.timestamp}`);
            console.log(`     Like Count: ${story.like_count || 0}`);
            console.log(`     Replies Count: ${story.replies_count || 0}`);
            console.log('');
          });
        } else {
          console.log('  ℹ️ No stories found - this could mean:');
          console.log('    - The account has no active stories (stories expire after 24 hours)');
          console.log('    - The account is not a business/creator account');
          console.log('    - The access token lacks proper permissions');
        }
      }
      
    } catch (apiError) {
      console.log('❌ Stories API Error:');
      console.log('  Status:', apiError.response?.status);
      console.log('  Status Text:', apiError.response?.statusText);
      console.log('  Error Data:', JSON.stringify(apiError.response?.data, null, 2));
      
      if (apiError.response?.status === 400) {
        console.log('\n💡 Possible reasons for 400 error:');
        console.log('  - Account is not a business/creator account');
        console.log('  - Access token lacks instagram_basic or instagram_manage_insights permissions');
        console.log('  - Stories endpoint requires specific account type');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

testStoriesAPI().catch(console.error);