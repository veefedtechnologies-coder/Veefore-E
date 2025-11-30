/**
 * Test script for comprehensive Instagram engagement fetching
 * This script tests the new comprehensive engagement analysis
 */

const { InstagramApiService } = require('./server/services/instagramApi');

async function testComprehensiveEngagement() {
  console.log('🧪 Testing Comprehensive Instagram Engagement Analysis...\n');
  
  // You'll need to replace this with a real Instagram access token
  const testToken = 'YOUR_INSTAGRAM_ACCESS_TOKEN_HERE';
  
  if (testToken === 'YOUR_INSTAGRAM_ACCESS_TOKEN_HERE') {
    console.log('❌ Please replace the test token with a real Instagram access token');
    console.log('   You can get one from: https://developers.facebook.com/tools/explorer/');
    return;
  }
  
  try {
    console.log('📊 Testing comprehensive engagement data fetching...');
    
    // Test the new comprehensive method
    const comprehensiveData = await InstagramApiService.getComprehensiveEngagementData(testToken, 200);
    
    console.log('\n✅ Comprehensive Engagement Results:');
    console.log('=====================================');
    console.log(`📈 Total Likes: ${comprehensiveData.totalLikes.toLocaleString()}`);
    console.log(`💬 Total Comments: ${comprehensiveData.totalComments.toLocaleString()}`);
    console.log(`📊 Posts Analyzed: ${comprehensiveData.postsAnalyzed}`);
    console.log(`🎯 Sampling Strategy: ${comprehensiveData.samplingStrategy}`);
    console.log(`📊 Avg Likes per Post: ${comprehensiveData.avgLikesPerPost}`);
    console.log(`💬 Avg Comments per Post: ${comprehensiveData.avgCommentsPerPost}`);
    console.log(`📈 Total Engagement: ${(comprehensiveData.totalLikes + comprehensiveData.totalComments).toLocaleString()}`);
    
    // Test caching
    console.log('\n🔄 Testing caching (should be instant)...');
    const startTime = Date.now();
    const cachedData = await InstagramApiService.getComprehensiveEngagementData(testToken, 200);
    const endTime = Date.now();
    
    console.log(`⚡ Cached request took: ${endTime - startTime}ms`);
    console.log(`📊 Cached data matches: ${JSON.stringify(comprehensiveData) === JSON.stringify(cachedData)}`);
    
    // Compare with old method (if available)
    console.log('\n📊 Comparison with old method:');
    try {
      const oldMethodData = await InstagramApiService.getRecentMediaWithInsights(testToken, 7);
      const oldTotalLikes = oldMethodData.reduce((sum, post) => sum + (post.like_count || 0), 0);
      const oldTotalComments = oldMethodData.reduce((sum, post) => sum + (post.comments_count || 0), 0);
      
      console.log(`🔍 Old method (7 days): ${oldTotalLikes} likes, ${oldTotalComments} comments`);
      console.log(`🚀 New method (comprehensive): ${comprehensiveData.totalLikes} likes, ${comprehensiveData.totalComments} comments`);
      console.log(`📈 Improvement: ${Math.round(((comprehensiveData.totalLikes + comprehensiveData.totalComments) / (oldTotalLikes + oldTotalComments)) * 100)}% more data`);
    } catch (error) {
      console.log('⚠️ Could not compare with old method:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testComprehensiveEngagement().then(() => {
  console.log('\n✅ Test completed!');
  process.exit(0);
}).catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});



