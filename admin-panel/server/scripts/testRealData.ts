import 'dotenv/config';
import { getMainAppUsers } from '../services/userDataService';

async function testRealData() {
  try {
    console.log('🔍 Testing real data from veeforedb...');
    
    const result = await getMainAppUsers({}, {
      page: 1,
      limit: 3,
      sortBy: 'createdAt',
      sortOrder: 'desc'
    });
    
    console.log(`\n📊 Found ${result.users.length} users with REAL data:`);
    
    result.users.forEach((user, index) => {
      console.log(`\n--- User ${index + 1} ---`);
      console.log('Email:', user.email);
      console.log('Name:', user.name);
      console.log('Social Connections:', user.socialConnections);
      console.log('Last Login Formatted:', user.lastLoginFormatted);
      console.log('Engagement Score:', user.engagementScore);
      console.log('Status:', user.status);
      console.log('Plan:', user.subscriptionPlan);
      console.log('Credits:', user.creditsRemaining);
      console.log('Login Count:', user.loginCount);
      console.log('Daily Streak:', user.dailyLoginStreak);
      console.log('Total Posts:', user.totalPosts);
      console.log('Total Likes:', user.totalLikes);
      console.log('Total Comments:', user.totalComments);
      
      // Show social media details
      if (user.socialMedia && user.socialMedia.platforms) {
        console.log('Social Platforms:');
        Object.keys(user.socialMedia.platforms).forEach(platform => {
          const platformData = user.socialMedia.platforms[platform];
          console.log(`  ${platform}: @${platformData.handle} (${platformData.followers} followers, verified: ${platformData.verified})`);
        });
      }
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

testRealData();
