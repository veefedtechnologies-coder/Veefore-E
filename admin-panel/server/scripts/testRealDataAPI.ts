import mongoose from 'mongoose';
import 'dotenv/config';
import { MainAppUserSchema } from '../models/MainAppUser';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function testRealDataAPI() {
  try {
    console.log('🔍 Testing real data API...');
    
    // Connect to veeforedb
    await mongoose.connect(MONGODB_URI, {
      dbName: 'veeforedb'
    });
    
    console.log('✅ Connected to veeforedb database');
    
    const User = mongoose.model('User', MainAppUserSchema, 'users');
    const db = mongoose.connection.db;
    
    // Get the user
    const userId = '6844027426cae0200f88b5db';
    const user = await User.findById(userId).lean();
    
    if (!user) {
      console.log('❌ User not found');
      return;
    }
    
    console.log('\n📊 USER DATA:');
    console.log('=============');
    console.log('Email:', user.email);
    console.log('Workspace ID:', user.workspaceId);
    
    // Get REAL Instagram data from socialaccounts collection
    let socialAccount = await db.collection('socialaccounts').findOne({
      workspaceId: user.workspaceId,
      platform: 'instagram'
    });
    
    // If no Instagram account found by workspace, try to find by user's Instagram username
    if (!socialAccount && user.instagramUsername) {
      const cleanUsername = user.instagramUsername.replace('@', '');
      socialAccount = await db.collection('socialaccounts').findOne({
        username: cleanUsername,
        platform: 'instagram'
      });
    }
    
    // If still no account found, try to find any Instagram account for this user
    if (!socialAccount) {
      socialAccount = await db.collection('socialaccounts').findOne({
        platform: 'instagram'
      });
    }
    
    if (socialAccount) {
      console.log('\n🎯 REAL INSTAGRAM DATA:');
      console.log('========================');
      console.log('Username:', socialAccount.username);
      console.log('Followers:', socialAccount.followersCount);
      console.log('Following:', socialAccount.followingCount);
      console.log('Posts:', socialAccount.mediaCount);
      console.log('Likes:', socialAccount.totalLikes);
      console.log('Comments:', socialAccount.totalComments);
      console.log('Engagement Rate:', socialAccount.engagementRate);
      console.log('Verified:', socialAccount.isVerified);
      console.log('Business Account:', socialAccount.isBusinessAccount);
      console.log('Last Sync:', socialAccount.lastSyncAt);
      
      // Calculate engagement rate
      const engagementRate = socialAccount.mediaCount > 0 ? 
        ((socialAccount.totalLikes + socialAccount.totalComments) / socialAccount.mediaCount) : 0;
      console.log('Calculated Engagement Rate:', engagementRate.toFixed(2));
      
    } else {
      console.log('❌ No Instagram account found for this user');
    }
    
    // Simulate what the API would return
    console.log('\n📱 API RESPONSE SIMULATION:');
    console.log('============================');
    
    if (socialAccount) {
      const apiResponse = {
        socialAnalytics: {
          totalConnections: 1,
          totalFollowers: socialAccount.followersCount,
          averageEngagement: socialAccount.mediaCount > 0 ? 
            ((socialAccount.totalLikes + socialAccount.totalComments) / socialAccount.mediaCount) : 0,
          platforms: [{
            name: 'instagram',
            handle: socialAccount.username,
            followers: socialAccount.followersCount,
            following: socialAccount.followingCount,
            posts: socialAccount.mediaCount,
            likes: socialAccount.totalLikes,
            comments: socialAccount.totalComments,
            verified: socialAccount.isVerified,
            businessAccount: socialAccount.isBusinessAccount,
            connected: true,
            connectedAt: socialAccount.createdAt
          }]
        },
        contentAnalytics: {
          totalCreated: socialAccount.mediaCount,
          totalLikes: socialAccount.totalLikes,
          totalComments: socialAccount.totalComments,
          engagementRate: socialAccount.mediaCount > 0 ? 
            ((socialAccount.totalLikes + socialAccount.totalComments) / socialAccount.mediaCount) : 0
        },
        growthAnalytics: {
          totalFollowers: socialAccount.followersCount,
          engagementRate: socialAccount.mediaCount > 0 ? 
            ((socialAccount.totalLikes + socialAccount.totalComments) / socialAccount.mediaCount) : 0,
          reach: socialAccount.totalReach || Math.floor(socialAccount.followersCount * 0.8)
        }
      };
      
      console.log(JSON.stringify(apiResponse, null, 2));
    }

  } catch (error) {
    console.error('❌ Error testing real data API:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

testRealDataAPI();
