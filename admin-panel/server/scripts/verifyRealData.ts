import mongoose from 'mongoose';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function verifyRealData() {
  try {
    console.log('🔍 Verifying REAL data in veeforedb database...');
    
    // Connect to veeforedb
    await mongoose.connect(MONGODB_URI, {
      dbName: 'veeforedb'
    });
    
    console.log('✅ Connected to veeforedb database');
    
    // Get all users
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    
    const totalUsers = await usersCollection.countDocuments();
    console.log(`📊 Total users in veeforedb: ${totalUsers}`);
    
    // Check users with social connections
    const usersWithSocial = await usersCollection.countDocuments({
      $or: [
        { 'socialPlatforms.0': { $exists: true } },
        { 'socialMedia.instagram': { $exists: true } },
        { 'socialMedia.twitter': { $exists: true } },
        { 'socialMedia.linkedin': { $exists: true } },
        { 'socialMedia.tiktok': { $exists: true } },
        { 'socialMedia.youtube': { $exists: true } }
      ]
    });
    
    // Check users with last login data
    const usersWithLastLogin = await usersCollection.countDocuments({
      $or: [
        { lastLogin: { $exists: true } },
        { lastLoginAt: { $exists: true } },
        { lastActiveAt: { $exists: true } }
      ]
    });
    
    // Check users with login count
    const usersWithLoginCount = await usersCollection.countDocuments({
      loginCount: { $exists: true, $gt: 0 }
    });
    
    // Check users with daily streak
    const usersWithStreak = await usersCollection.countDocuments({
      dailyLoginStreak: { $exists: true, $gt: 0 }
    });
    
    console.log('\n📊 REAL DATA ANALYSIS:');
    console.log('========================');
    console.log(`Users with social connections: ${usersWithSocial}/${totalUsers} (${Math.round(usersWithSocial/totalUsers*100)}%)`);
    console.log(`Users with last login data: ${usersWithLastLogin}/${totalUsers} (${Math.round(usersWithLastLogin/totalUsers*100)}%)`);
    console.log(`Users with login count: ${usersWithLoginCount}/${totalUsers} (${Math.round(usersWithLoginCount/totalUsers*100)}%)`);
    console.log(`Users with daily streak: ${usersWithStreak}/${totalUsers} (${Math.round(usersWithStreak/totalUsers*100)}%)`);
    
    // Get sample users to verify data quality
    console.log('\n📋 SAMPLE USERS (first 5):');
    console.log('============================');
    
    const sampleUsers = await usersCollection.find({}).limit(5).toArray();
    
    sampleUsers.forEach((user, index) => {
      console.log(`\n${index + 1}. ${user.email}`);
      console.log(`   Social Platforms: ${user.socialPlatforms?.length || 0}`);
      console.log(`   Last Login: ${user.lastLogin || user.lastLoginAt || 'N/A'}`);
      console.log(`   Login Count: ${user.loginCount || 'N/A'}`);
      console.log(`   Daily Streak: ${user.dailyLoginStreak || 'N/A'}`);
      console.log(`   Total Posts: ${user.totalPosts || 'N/A'}`);
      console.log(`   Total Likes: ${user.totalLikes || 'N/A'}`);
      console.log(`   Total Comments: ${user.totalComments || 'N/A'}`);
      
      if (user.socialPlatforms && user.socialPlatforms.length > 0) {
        console.log(`   Social Details:`);
        user.socialPlatforms.forEach(platform => {
          console.log(`     - ${platform.name}: @${platform.handle} (${platform.followers} followers)`);
        });
      }
    });
    
    // Check if data looks simulated (all similar values)
    console.log('\n🔍 CHECKING FOR SIMULATION PATTERNS:');
    console.log('====================================');
    
    const loginCounts = await usersCollection.distinct('loginCount');
    const streaks = await usersCollection.distinct('dailyLoginStreak');
    const posts = await usersCollection.distinct('totalPosts');
    
    console.log(`Unique login counts: ${loginCounts.length} (${loginCounts.slice(0, 10).join(', ')}...)`);
    console.log(`Unique daily streaks: ${streaks.length} (${streaks.slice(0, 10).join(', ')}...)`);
    console.log(`Unique post counts: ${posts.length} (${posts.slice(0, 10).join(', ')}...)`);
    
    if (loginCounts.length < 10) {
      console.log('⚠️  WARNING: Login counts look simulated (too few unique values)');
    } else {
      console.log('✅ Login counts look realistic (good variety)');
    }
    
    if (streaks.length < 10) {
      console.log('⚠️  WARNING: Daily streaks look simulated (too few unique values)');
    } else {
      console.log('✅ Daily streaks look realistic (good variety)');
    }

  } catch (error) {
    console.error('❌ Error verifying data:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

verifyRealData();
