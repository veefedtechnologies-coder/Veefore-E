import mongoose from 'mongoose';
import 'dotenv/config';
import { MainAppUserSchema } from '../models/MainAppUser';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function checkRealUserData() {
  try {
    console.log('🔍 Checking real user data in veeforedb database...');
    
    // Connect to veeforedb
    await mongoose.connect(MONGODB_URI, {
      dbName: 'veeforedb'
    });
    
    console.log('✅ Connected to veeforedb database');
    
    const User = mongoose.model('User', MainAppUserSchema, 'users');
    
    // Get the specific user we're testing
    const userId = '6844027426cae0200f88b5db';
    const user = await User.findById(userId).lean();
    
    if (!user) {
      console.log('❌ User not found');
      return;
    }
    
    console.log('\n📊 USER DETAILS:');
    console.log('================');
    console.log('User ID:', user._id);
    console.log('Email:', user.email);
    console.log('Username:', user.username);
    console.log('Display Name:', user.displayName);
    console.log('Plan:', user.plan);
    console.log('Status:', user.status);
    console.log('Credits:', user.credits);
    
    console.log('\n🔍 SOCIAL PLATFORMS:');
    console.log('====================');
    if (user.socialPlatforms && user.socialPlatforms.length > 0) {
      user.socialPlatforms.forEach((platform: any, index: number) => {
        console.log(`Platform ${index + 1}:`);
        console.log(`  Name: ${platform.name}`);
        console.log(`  Handle: ${platform.handle}`);
        console.log(`  Followers: ${platform.followers}`);
        console.log(`  Verified: ${platform.verified}`);
        console.log(`  Connected: ${platform.connected}`);
        console.log(`  Connected At: ${platform.connectedAt}`);
        console.log('---');
      });
    } else {
      console.log('❌ No social platforms found');
    }
    
    console.log('\n🤖 AI USAGE:');
    console.log('============');
    if (user.aiUsage) {
      console.log('Total Credits Used:', user.aiUsage.totalCreditsUsed);
      console.log('Image Generation:', user.aiUsage.imageGeneration);
      console.log('Video Generation:', user.aiUsage.videoGeneration);
      console.log('Caption Generation:', user.aiUsage.captionGeneration);
      console.log('Hashtag Generation:', user.aiUsage.hashtagGeneration);
      console.log('Content Optimization:', user.aiUsage.contentOptimization);
      console.log('Last Used:', user.aiUsage.lastUsed);
    } else {
      console.log('❌ No AI usage data found');
    }
    
    console.log('\n📝 CONTENT STATS:');
    console.log('==================');
    if (user.contentStats) {
      console.log('Total Created:', user.contentStats.totalCreated);
      console.log('Images:', user.contentStats.images);
      console.log('Videos:', user.contentStats.videos);
      console.log('Captions:', user.contentStats.captions);
      console.log('Hashtags:', user.contentStats.hashtags);
      console.log('Last Created:', user.contentStats.lastCreated);
    } else {
      console.log('❌ No content stats found');
    }
    
    console.log('\n📈 GROWTH STATS:');
    console.log('=================');
    if (user.growthStats) {
      console.log('Total Followers:', user.growthStats.totalFollowers);
      console.log('Follower Growth:', user.growthStats.followerGrowth);
      console.log('Engagement Rate:', user.growthStats.engagementRate);
      console.log('Reach:', user.growthStats.reach);
      console.log('Impressions:', user.growthStats.impressions);
      console.log('Last Calculated:', user.growthStats.lastCalculated);
    } else {
      console.log('❌ No growth stats found');
    }
    
    console.log('\n💰 REVENUE STATS:');
    console.log('==================');
    if (user.revenueStats) {
      console.log('Total Spent:', user.revenueStats.totalSpent);
      console.log('Subscription Revenue:', user.revenueStats.subscriptionRevenue);
      console.log('Credit Purchases:', user.revenueStats.creditPurchases);
      console.log('Lifetime Value:', user.revenueStats.lifetimeValue);
      console.log('Last Payment:', user.revenueStats.lastPayment);
    } else {
      console.log('❌ No revenue stats found');
    }
    
    console.log('\n🏃 ACTIVITY STATS:');
    console.log('==================');
    if (user.activityStats) {
      console.log('Total Sessions:', user.activityStats.totalSessions);
      console.log('Average Session Duration:', user.activityStats.averageSessionDuration);
      console.log('Time Spent Today:', user.activityStats.timeSpentToday);
      console.log('Time Spent This Week:', user.activityStats.timeSpentThisWeek);
      console.log('Time Spent This Month:', user.activityStats.timeSpentThisMonth);
      console.log('Last Active At:', user.activityStats.lastActiveAt);
    } else {
      console.log('❌ No activity stats found');
    }
    
    console.log('\n🏢 WORKSPACE INFO:');
    console.log('==================');
    console.log('Workspace Count:', user.workspaceCount);
    console.log('Workspace IDs:', user.workspaceIds);
    console.log('Current Workspace:', user.workspaceId);
    
    console.log('\n📝 NOTES:');
    console.log('==========');
    console.log('Notes:', user.notes);
    
    console.log('\n🔍 RAW DATABASE FIELDS:');
    console.log('========================');
    const fields = Object.keys(user);
    fields.forEach(field => {
      const value = user[field];
      const type = Array.isArray(value) ? 'array' : typeof value;
      console.log(`${field}: ${type} = ${JSON.stringify(value).substring(0, 100)}${JSON.stringify(value).length > 100 ? '...' : ''}`);
    });

  } catch (error) {
    console.error('❌ Error checking user data:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

checkRealUserData();
