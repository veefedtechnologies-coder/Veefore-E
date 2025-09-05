import mongoose from 'mongoose';
import 'dotenv/config';
import { MainAppUserSchema } from '../models/MainAppUser';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function removeMockSocialFields() {
  try {
    console.log('🧹 Removing mock social media fields from users collection...');
    
    // Connect to veeforedb
    await mongoose.connect(MONGODB_URI, {
      dbName: 'veeforedb'
    });
    
    console.log('✅ Connected to veeforedb database');
    
    const User = mongoose.model('User', MainAppUserSchema, 'users');
    
    // Fields to remove from users collection (mock social media data)
    const fieldsToRemove = {
      // Mock social platforms array
      socialPlatforms: 1,
      
      // Mock Instagram fields
      instagramFollowers: 1,
      instagramFollowing: 1,
      instagramPosts: 1,
      instagramLikes: 1,
      instagramComments: 1,
      instagramBio: 1,
      instagramProfilePicture: 1,
      instagramVerified: 1,
      instagramBusinessAccount: 1,
      instagramCategory: 1,
      instagramWebsite: 1,
      instagramExternalUrl: 1,
      
      // Mock analytics fields that were simulated
      aiUsage: 1,
      contentStats: 1,
      growthStats: 1,
      revenueStats: 1,
      activityStats: 1,
      workspaceCount: 1,
      workspaceIds: 1,
      notes: 1,
      accountStatus: 1,
      suspensionReason: 1,
      suspendedAt: 1
    };
    
    console.log('\n📋 Fields to remove:');
    Object.keys(fieldsToRemove).forEach(field => {
      console.log(`  - ${field}`);
    });
    
    // Get count of users before cleanup
    const totalUsers = await User.countDocuments();
    console.log(`\n📊 Total users in database: ${totalUsers}`);
    
    // Remove the mock fields from all users
    console.log('\n🧹 Removing mock fields from all users...');
    const result = await User.updateMany(
      {}, // Update all users
      { $unset: fieldsToRemove }
    );
    
    console.log(`✅ Updated ${result.modifiedCount} users`);
    
    // Verify the cleanup
    console.log('\n🔍 Verifying cleanup...');
    const sampleUser = await User.findOne({}).lean();
    if (sampleUser) {
      console.log('Sample user fields after cleanup:');
      console.log('  - socialPlatforms:', sampleUser.socialPlatforms ? 'EXISTS' : 'REMOVED');
      console.log('  - instagramFollowers:', (sampleUser as any).instagramFollowers ? 'EXISTS' : 'REMOVED');
      console.log('  - aiUsage:', sampleUser.aiUsage ? 'EXISTS' : 'REMOVED');
      console.log('  - contentStats:', sampleUser.contentStats ? 'EXISTS' : 'REMOVED');
      console.log('  - growthStats:', sampleUser.growthStats ? 'EXISTS' : 'REMOVED');
      console.log('  - revenueStats:', sampleUser.revenueStats ? 'EXISTS' : 'REMOVED');
      console.log('  - activityStats:', sampleUser.activityStats ? 'EXISTS' : 'REMOVED');
    }
    
    // Show remaining real fields
    console.log('\n✅ Real fields that remain:');
    const realFields = [
      'email', 'username', 'displayName', 'avatar', 'credits', 'plan',
      'referralCode', 'totalReferrals', 'totalEarned', 'referredBy',
      'isOnboarded', 'createdAt', 'updatedAt', 'preferences',
      'lastMonthlyAllocation', 'planUpgradedAt', 'subscriptionPlan',
      'dailyLoginStreak', 'instagramUsername', 'isEmailVerified',
      'lastActiveAt', 'lastLogin', 'lastLoginAt', 'loginCount',
      'socialMedia', 'status', 'totalComments', 'totalLikes',
      'totalPosts', 'workspaceId'
    ];
    
    realFields.forEach(field => {
      if (sampleUser && (sampleUser as any)[field] !== undefined) {
        console.log(`  ✓ ${field}: ${typeof (sampleUser as any)[field]}`);
      }
    });
    
    console.log('\n🎯 Social media data is now only in socialaccounts collection:');
    const db = mongoose.connection.db;
    if (db) {
      const socialAccounts = await db.collection('socialaccounts').find({}).toArray();
      console.log(`  - Found ${socialAccounts.length} social accounts`);
      
      if (socialAccounts.length > 0) {
        console.log('  - Sample social account:');
        const sample = socialAccounts[0];
        console.log(`    Platform: ${sample.platform}`);
        console.log(`    Username: ${sample.username}`);
        console.log(`    Followers: ${sample.followersCount}`);
        console.log(`    Posts: ${sample.mediaCount}`);
      }
    } else {
      console.log('  - No database connection available');
    }
    
    console.log('\n✅ Mock social media fields cleanup completed!');
    console.log('📱 Real social media data is now only in socialaccounts collection');

  } catch (error) {
    console.error('❌ Error removing mock social fields:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

removeMockSocialFields();
