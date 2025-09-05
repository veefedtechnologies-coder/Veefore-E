import mongoose from 'mongoose';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function addMissingUserFields() {
  try {
    console.log('🔍 Adding missing user fields to veeforedb database...');
    
    // Connect to veeforedb
    await mongoose.connect(MONGODB_URI, {
      dbName: 'veeforedb'
    });
    
    console.log('✅ Connected to veeforedb database');
    
    // Get the users collection
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    
    const totalUsers = await usersCollection.countDocuments();
    console.log(`📊 Found ${totalUsers} users to update`);
    
    let updatedCount = 0;
    
    // Get all users and update them with missing fields
    const users = await usersCollection.find({}).toArray();
    
    for (const user of users) {
      const updateFields: any = {};
      
      // Workspace information
      if (!user.workspaceCount) {
        updateFields.workspaceCount = 1; // Default to 1 workspace
      }
      if (!user.workspaceIds) {
        updateFields.workspaceIds = [user.workspaceId || `ws_${user._id}`];
      }
      
      // AI usage tracking
      if (!user.aiUsage) {
        updateFields.aiUsage = {
          totalCreditsUsed: 0,
          imageGeneration: { count: 0, creditsUsed: 0 },
          videoGeneration: { count: 0, creditsUsed: 0 },
          captionGeneration: { count: 0, creditsUsed: 0 },
          hashtagGeneration: { count: 0, creditsUsed: 0 },
          contentOptimization: { count: 0, creditsUsed: 0 },
          lastUsed: null
        };
      }
      
      // Content creation tracking
      if (!user.contentStats) {
        updateFields.contentStats = {
          totalCreated: 0,
          images: { count: 0, aiGenerated: 0 },
          videos: { count: 0, aiGenerated: 0 },
          captions: { count: 0, aiGenerated: 0 },
          hashtags: { count: 0, aiGenerated: 0 },
          lastCreated: null
        };
      }
      
      // Growth analytics
      if (!user.growthStats) {
        updateFields.growthStats = {
          totalFollowers: 0,
          followerGrowth: { daily: 0, weekly: 0, monthly: 0 },
          engagementRate: 0,
          reach: 0,
          impressions: 0,
          lastCalculated: new Date()
        };
      }
      
      // Revenue tracking
      if (!user.revenueStats) {
        updateFields.revenueStats = {
          totalSpent: 0,
          subscriptionRevenue: 0,
          creditPurchases: 0,
          lastPayment: null,
          lifetimeValue: 0
        };
      }
      
      // Activity tracking
      if (!user.activityStats) {
        updateFields.activityStats = {
          totalSessions: 0,
          averageSessionDuration: 0,
          lastActiveAt: user.lastActiveAt || new Date(),
          timeSpentToday: 0,
          timeSpentThisWeek: 0,
          timeSpentThisMonth: 0
        };
      }
      
      // User status and controls
      if (!user.accountStatus) {
        updateFields.accountStatus = 'active';
      }
      if (!user.suspensionReason) {
        updateFields.suspensionReason = null;
      }
      if (!user.suspendedAt) {
        updateFields.suspendedAt = null;
      }
      if (!user.notes) {
        updateFields.notes = [];
      }
      
      // Update the user if there are fields to add
      if (Object.keys(updateFields).length > 0) {
        await usersCollection.updateOne(
          { _id: user._id },
          { $set: updateFields }
        );
        
        console.log(`✅ Updated user: ${user.email}`);
        updatedCount++;
      }
    }
    
    console.log(`\n🎉 Successfully updated ${updatedCount} users with missing fields!`);
    console.log(`📊 Added fields:
  - workspaceCount, workspaceIds
  - aiUsage (totalCreditsUsed, imageGeneration, videoGeneration, etc.)
  - contentStats (totalCreated, images, videos, captions, hashtags)
  - growthStats (totalFollowers, followerGrowth, engagementRate)
  - revenueStats (totalSpent, subscriptionRevenue, lifetimeValue)
  - activityStats (totalSessions, averageSessionDuration, timeSpent)
  - accountStatus, suspensionReason, suspendedAt, notes`);

  } catch (error) {
    console.error('❌ Error adding missing fields:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

addMissingUserFields();
