/**
 * Debug endpoint to check Instagram account type and API permissions
 * This will help us understand why comprehensive engagement data isn't showing
 */

const { InstagramApiService } = require('./server/services/instagramApi');

async function debugInstagramAccount() {
  console.log('🔍 DEBUGGING INSTAGRAM ACCOUNT PERMISSIONS...\n');
  
  try {
    // Get your Instagram account from the database
    const accounts = await storage.getSocialAccountsByWorkspace('YOUR_WORKSPACE_ID');
    const instagramAccount = accounts.find(acc => acc.platform === 'instagram' && acc.isActive);
    
    if (!instagramAccount) {
      console.log('❌ No Instagram account found');
      return;
    }
    
    console.log('📊 Instagram Account Details:');
    console.log('================================');
    console.log(`Username: @${instagramAccount.username}`);
    console.log(`Account ID: ${instagramAccount.accountId}`);
    console.log(`Account Type: ${instagramAccount.accountType || 'Unknown'}`);
    console.log(`Has Access Token: ${!!instagramAccount.accessToken}`);
    console.log(`Current Total Likes: ${instagramAccount.totalLikes || 0}`);
    console.log(`Current Total Comments: ${instagramAccount.totalComments || 0}`);
    console.log(`Posts Analyzed: ${instagramAccount.postsAnalyzed || 'Not set'}`);
    console.log(`Sampling Strategy: ${instagramAccount.samplingStrategy || 'Not set'}`);
    
    if (!instagramAccount.accessToken) {
      console.log('\n❌ No access token available - cannot test API');
      return;
    }
    
    console.log('\n🔍 Testing Instagram API Access...');
    console.log('=====================================');
    
    // Test 1: Validate token
    console.log('\n1. Testing token validation...');
    const tokenValidation = await InstagramApiService.validateToken(instagramAccount.accessToken);
    console.log(`   Token Valid: ${tokenValidation.is_valid}`);
    console.log(`   Scopes: ${tokenValidation.scopes?.join(', ') || 'Unknown'}`);
    
    // Test 2: Get account info
    console.log('\n2. Testing account info...');
    const accountInfo = await InstagramApiService.getAccountInfo(instagramAccount.accessToken);
    console.log(`   Username: @${accountInfo.username}`);
    console.log(`   Account Type: ${accountInfo.account_type}`);
    console.log(`   Followers: ${accountInfo.followers_count}`);
    console.log(`   Media Count: ${accountInfo.media_count}`);
    
    // Test 3: Test comprehensive engagement analysis
    console.log('\n3. Testing comprehensive engagement analysis...');
    const comprehensiveData = await InstagramApiService.getComprehensiveEngagementData(instagramAccount.accessToken, 200);
    console.log(`   Posts Analyzed: ${comprehensiveData.postsAnalyzed}`);
    console.log(`   Total Likes: ${comprehensiveData.totalLikes}`);
    console.log(`   Total Comments: ${comprehensiveData.totalComments}`);
    console.log(`   Sampling Strategy: ${comprehensiveData.samplingStrategy}`);
    console.log(`   Avg Likes per Post: ${comprehensiveData.avgLikesPerPost}`);
    console.log(`   Avg Comments per Post: ${comprehensiveData.avgCommentsPerPost}`);
    
    // Test 4: Test basic media fetching
    console.log('\n4. Testing basic media fetching...');
    const mediaResponse = await InstagramApiService.getUserMedia(instagramAccount.accessToken, 25);
    console.log(`   Media Retrieved: ${mediaResponse.data.length} posts`);
    
    if (mediaResponse.data.length > 0) {
      const samplePost = mediaResponse.data[0];
      console.log(`   Sample Post ID: ${samplePost.id}`);
      console.log(`   Sample Post Likes: ${samplePost.like_count || 0}`);
      console.log(`   Sample Post Comments: ${samplePost.comments_count || 0}`);
    }
    
    // Test 5: Check if account can access insights
    console.log('\n5. Testing insights access...');
    if (accountInfo.account_type === 'BUSINESS' || accountInfo.account_type === 'CREATOR') {
      try {
        const insights = await InstagramApiService.getAccountInsights(instagramAccount.accountId, instagramAccount.accessToken, 'day');
        console.log(`   Insights Available: Yes`);
        console.log(`   Insights Data: ${JSON.stringify(insights, null, 2)}`);
      } catch (insightsError) {
        console.log(`   Insights Available: No - ${insightsError.message}`);
      }
    } else {
      console.log(`   Insights Available: No - Account type is ${accountInfo.account_type} (requires BUSINESS or CREATOR)`);
    }
    
    console.log('\n📋 DIAGNOSIS:');
    console.log('==============');
    
    if (!tokenValidation.is_valid) {
      console.log('❌ PROBLEM: Access token is invalid or expired');
      console.log('   SOLUTION: Reconnect your Instagram account');
    } else if (accountInfo.account_type === 'PERSONAL') {
      console.log('⚠️  LIMITATION: Personal account - limited API access');
      console.log('   SOLUTION: Convert to Business/Creator account for full insights');
    } else if (comprehensiveData.postsAnalyzed < 50) {
      console.log('⚠️  LIMITATION: Limited posts analyzed - may be API rate limiting');
      console.log('   SOLUTION: Wait and retry, or check API rate limits');
    } else {
      console.log('✅ ACCOUNT LOOKS GOOD: Should have comprehensive data access');
      console.log('   ISSUE: May be in data flow from API to dashboard');
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run the debug
debugInstagramAccount().then(() => {
  console.log('\n✅ Debug completed!');
  process.exit(0);
}).catch((error) => {
  console.error('❌ Debug failed:', error);
  process.exit(1);
});



