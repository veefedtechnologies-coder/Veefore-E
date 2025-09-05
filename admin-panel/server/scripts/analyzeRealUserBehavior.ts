import mongoose from 'mongoose';
import 'dotenv/config';
import { MainAppUserSchema } from '../models/MainAppUser';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function analyzeRealUserBehavior() {
  try {
    console.log('🔍 Analyzing REAL user behavior data...');
    
    // Connect to veeforedb
    await mongoose.connect(MONGODB_URI, {
      dbName: 'veeforedb'
    });
    
    console.log('✅ Connected to veeforedb database');
    
    const User = mongoose.model('User', MainAppUserSchema, 'users');
    
    // Get a sample user to analyze real data patterns
    const user = await User.findById('6844027426cae0200f88b5db').lean();
    
    if (!user) {
      console.log('❌ User not found');
      return;
    }
    
    console.log('\n📊 REAL USER DATA ANALYSIS:');
    console.log('============================');
    console.log('User ID:', user._id);
    console.log('Email:', user.email);
    console.log('Created:', user.createdAt);
    console.log('Last Updated:', user.updatedAt);
    
    console.log('\n🔍 REAL SOCIAL MEDIA DATA:');
    console.log('===========================');
    if (user.socialPlatforms && user.socialPlatforms.length > 0) {
      console.log('✅ Real social platforms found:');
      user.socialPlatforms.forEach((platform: any, index: number) => {
        console.log(`  ${index + 1}. ${platform.name}:`);
        console.log(`     - Handle: ${platform.handle}`);
        console.log(`     - Followers: ${platform.followers} (REAL DATA)`);
        console.log(`     - Verified: ${platform.verified}`);
        console.log(`     - Connected: ${platform.connected}`);
        console.log(`     - Connected At: ${platform.connectedAt}`);
      });
    } else {
      console.log('❌ No real social platforms found');
    }
    
    console.log('\n🔍 REAL USER ACTIVITY DATA:');
    console.log('============================');
    console.log('Login Count:', user.loginCount || 0, '(REAL)');
    console.log('Daily Login Streak:', user.dailyLoginStreak || 0, '(REAL)');
    console.log('Last Login:', user.lastLogin || user.lastLoginAt, '(REAL)');
    console.log('Last Active:', user.lastActiveAt, '(REAL)');
    console.log('Total Posts:', user.totalPosts || 0, '(REAL)');
    console.log('Total Likes:', user.totalLikes || 0, '(REAL)');
    console.log('Total Comments:', user.totalComments || 0, '(REAL)');
    
    console.log('\n🔍 REAL CREDIT USAGE:');
    console.log('=====================');
    console.log('Total Credits:', user.credits || 0, '(REAL)');
    console.log('Plan:', user.plan || user.subscriptionPlan, '(REAL)');
    console.log('Plan Upgraded At:', user.planUpgradedAt, '(REAL)');
    
    console.log('\n🔍 REAL WORKSPACE DATA:');
    console.log('=======================');
    console.log('Workspace ID:', user.workspaceId, '(REAL)');
    console.log('Instagram Username:', user.instagramUsername, '(REAL)');
    
    console.log('\n🔍 REAL REFERRAL DATA:');
    console.log('======================');
    console.log('Referral Code:', user.referralCode, '(REAL)');
    console.log('Total Referrals:', user.totalReferrals || 0, '(REAL)');
    console.log('Total Earned:', user.totalEarned || 0, '(REAL)');
    
    console.log('\n🔍 REAL PREFERENCES:');
    console.log('====================');
    if (user.preferences) {
      console.log('Business Name:', user.preferences.businessName, '(REAL)');
      console.log('Description:', user.preferences.description, '(REAL)');
      console.log('Niches:', user.preferences.niches, '(REAL)');
      console.log('Brand Tone:', user.preferences.brandTone, '(REAL)');
    }
    
    console.log('\n🔍 REAL ACCOUNT STATUS:');
    console.log('=======================');
    console.log('Status:', user.status, '(REAL)');
    console.log('Account Status:', user.accountStatus, '(REAL)');
    console.log('Email Verified:', user.isEmailVerified, '(REAL)');
    console.log('Onboarded:', user.isOnboarded, '(REAL)');
    
    // Check if we have any real analytics data
    console.log('\n🔍 CURRENT ANALYTICS DATA (SIMULATED):');
    console.log('======================================');
    console.log('AI Usage Total:', user.aiUsage?.totalCreditsUsed || 0, '(SIMULATED)');
    console.log('Content Created:', user.contentStats?.totalCreated || 0, '(SIMULATED)');
    console.log('Growth Followers:', user.growthStats?.totalFollowers || 0, '(SIMULATED)');
    console.log('Revenue Total:', user.revenueStats?.totalSpent || 0, '(SIMULATED)');
    console.log('Activity Sessions:', user.activityStats?.totalSessions || 0, '(SIMULATED)');
    
    console.log('\n💡 RECOMMENDATIONS:');
    console.log('===================');
    console.log('1. Use REAL social platform data for social analytics');
    console.log('2. Calculate AI usage from actual credit consumption');
    console.log('3. Use real post counts for content analytics');
    console.log('4. Calculate engagement from real likes/comments');
    console.log('5. Track real login patterns for activity analytics');
    console.log('6. Calculate revenue from actual plan upgrades');

  } catch (error) {
    console.error('❌ Error analyzing user behavior:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

analyzeRealUserBehavior();
