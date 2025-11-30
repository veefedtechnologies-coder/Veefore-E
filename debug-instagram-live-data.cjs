// Debug script to test Instagram API with real account data
const { MongoClient } = require('mongodb');
require('dotenv').config();

async function debugInstagramData() {
  const client = new MongoClient(process.env.DATABASE_URL);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db();
    
    // Find the Instagram account for arpit.10
    const socialAccount = await db.collection('social_accounts').findOne({
      username: 'arpit.10',
      platform: 'instagram'
    });
    
    if (!socialAccount) {
      console.log('❌ No Instagram account found for arpit.10');
      return;
    }
    
    console.log('\n📊 Database Record:');
    console.log('- Username:', socialAccount.username);
    console.log('- Followers in DB:', socialAccount.followersCount || socialAccount.followers || 0);
    console.log('- Media Count in DB:', socialAccount.mediaCount || 0);
    console.log('- Has Access Token:', !!socialAccount.accessToken);
    console.log('- Account Type:', socialAccount.accountType);
    console.log('- Is Business:', socialAccount.isBusinessAccount);
    console.log('- Last Sync:', socialAccount.lastSyncAt);
    
    if (!socialAccount.accessToken) {
      console.log('\n❌ No access token found - cannot test API');
      return;
    }
    
    // Decrypt token if encrypted
    let accessToken = socialAccount.accessToken;
    if (socialAccount.encryptedAccessToken) {
      console.log('\n🔐 Access token is encrypted, using encrypted version...');
      accessToken = socialAccount.encryptedAccessToken;
      // Note: We'd need the encryption key to decrypt, so we'll try both
    }
    
    console.log('\n🔍 Testing Instagram API...');
    console.log('Access Token (first 20 chars):', accessToken.substring(0, 20) + '...');
    
    // Test 1: Basic profile data
    console.log('\n1️⃣ Testing: Basic Profile Data');
    const url1 = `https://graph.instagram.com/me?fields=id,username,account_type,media_count,followers_count,profile_picture_url&access_token=${accessToken}`;
    
    try {
      const response = await fetch(url1);
      const data = await response.json();
      
      if (response.ok) {
        console.log('✅ API Response SUCCESS:');
        console.log('   - Instagram ID:', data.id);
        console.log('   - Username:', data.username);
        console.log('   - Account Type:', data.account_type);
        console.log('   - Followers Count:', data.followers_count);
        console.log('   - Media Count:', data.media_count);
        console.log('   - Profile Picture:', data.profile_picture_url ? 'Yes' : 'No');
        
        if (data.followers_count === undefined || data.followers_count === null) {
          console.log('\n⚠️  WARNING: followers_count is not in API response!');
          console.log('   This usually means the account type doesn\'t support this field.');
          console.log('   Account type:', data.account_type);
        }
      } else {
        console.log('❌ API Error:', data.error?.message || 'Unknown error');
        console.log('   Error Type:', data.error?.type);
        console.log('   Error Code:', data.error?.code);
        console.log('   Full Error:', JSON.stringify(data.error, null, 2));
        
        if (data.error?.message?.includes('token')) {
          console.log('\n💡 This looks like a token issue. The access token might be:');
          console.log('   1. Expired');
          console.log('   2. Invalid');
          console.log('   3. Missing required permissions (instagram_basic, instagram_business_basic)');
        }
      }
    } catch (error) {
      console.log('❌ API Call Failed:', error.message);
    }
    
    // Test 2: Try alternative endpoints
    console.log('\n2️⃣ Testing: Alternative Instagram Basic Display API');
    const url2 = `https://graph.instagram.com/me?fields=id,username,media_count&access_token=${accessToken}`;
    
    try {
      const response = await fetch(url2);
      const data = await response.json();
      
      if (response.ok) {
        console.log('✅ Basic Display API works:');
        console.log('   - ID:', data.id);
        console.log('   - Username:', data.username);
        console.log('   - Media Count:', data.media_count);
      } else {
        console.log('❌ Basic Display API Error:', data.error?.message);
      }
    } catch (error) {
      console.log('❌ API Call Failed:', error.message);
    }
    
    // Test 3: Check media/posts
    console.log('\n3️⃣ Testing: Fetch Recent Media');
    const url3 = `https://graph.instagram.com/me/media?fields=id,caption,like_count,comments_count,timestamp&limit=5&access_token=${accessToken}`;
    
    try {
      const response = await fetch(url3);
      const data = await response.json();
      
      if (response.ok && data.data) {
        console.log(`✅ Found ${data.data.length} recent posts`);
        data.data.forEach((post, index) => {
          console.log(`   Post ${index + 1}:`);
          console.log(`     - Likes: ${post.like_count || 0}`);
          console.log(`     - Comments: ${post.comments_count || 0}`);
        });
      } else {
        console.log('❌ Media API Error:', data.error?.message);
      }
    } catch (error) {
      console.log('❌ API Call Failed:', error.message);
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('🎯 DIAGNOSIS:');
    console.log('='.repeat(70));
    
    // Check if we got followers_count
    const profileResponse = await fetch(url1);
    const profileData = await profileResponse.json();
    
    if (profileResponse.ok) {
      if (profileData.followers_count !== undefined && profileData.followers_count !== null) {
        console.log(`✅ Instagram API IS returning followers: ${profileData.followers_count}`);
        console.log(`❌ But database shows: ${socialAccount.followersCount || 0}`);
        console.log(`\n💡 ISSUE: Backend sync is working, but database isn't being updated!`);
        console.log(`   or the dashboard is reading from wrong field.`);
      } else {
        console.log(`❌ Instagram API is NOT returning followers_count`);
        console.log(`   Account Type: ${profileData.account_type}`);
        console.log(`\n💡 ISSUE: This account type doesn't support followers_count API field`);
        console.log(`   Solutions:`);
        console.log(`   1. Convert to Business/Creator account on Instagram`);
        console.log(`   2. Use Instagram Business API instead of Basic Display API`);
        console.log(`   3. Request facebook_instagram_business_basic permission`);
      }
    } else {
      console.log(`❌ Instagram API call failed`);
      console.log(`   Error: ${profileData.error?.message}`);
      console.log(`\n💡 ISSUE: Access token problem`);
      console.log(`   Solutions:`);
      console.log(`   1. Reconnect Instagram account`);
      console.log(`   2. Check if app permissions are correct`);
      console.log(`   3. Verify token hasn't expired`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

debugInstagramData();

