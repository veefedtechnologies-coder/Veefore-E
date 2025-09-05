import mongoose from 'mongoose';
import 'dotenv/config';
import { MainAppUserSchema } from '../models/MainAppUser';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function checkRealInstagramData() {
  try {
    console.log('🔍 Checking REAL Instagram data in database...');
    
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
    
    console.log('\n📊 REAL INSTAGRAM DATA:');
    console.log('========================');
    console.log('User ID:', user._id);
    console.log('Email:', user.email);
    
    // Check Instagram-specific fields
    console.log('\n🔍 INSTAGRAM FIELDS:');
    console.log('====================');
    console.log('Instagram Username:', user.instagramUsername);
    console.log('Instagram Followers:', user.instagramFollowers);
    console.log('Instagram Following:', user.instagramFollowing);
    console.log('Instagram Posts:', user.instagramPosts);
    console.log('Instagram Likes:', user.instagramLikes);
    console.log('Instagram Comments:', user.instagramComments);
    console.log('Instagram Bio:', user.instagramBio);
    console.log('Instagram Profile Picture:', user.instagramProfilePicture);
    console.log('Instagram Verified:', user.instagramVerified);
    console.log('Instagram Business Account:', user.instagramBusinessAccount);
    console.log('Instagram Category:', user.instagramCategory);
    console.log('Instagram Website:', user.instagramWebsite);
    console.log('Instagram External URL:', user.instagramExternalUrl);
    
    // Check social platforms array
    console.log('\n🔍 SOCIAL PLATFORMS ARRAY:');
    console.log('===========================');
    if (user.socialPlatforms && user.socialPlatforms.length > 0) {
      user.socialPlatforms.forEach((platform: any, index: number) => {
        console.log(`${index + 1}. Platform: ${platform.name}`);
        console.log(`   - Followers: ${platform.followers}`);
        console.log(`   - Following: ${platform.following}`);
        console.log(`   - Posts: ${platform.posts}`);
        console.log(`   - Likes: ${platform.likes}`);
        console.log(`   - Comments: ${platform.comments}`);
        console.log(`   - Username: ${platform.username}`);
        console.log(`   - Verified: ${platform.verified}`);
        console.log(`   - Business: ${platform.businessAccount}`);
        console.log('   ---');
      });
    } else {
      console.log('No social platforms data found');
    }
    
    // Check if there are any Instagram-specific collections or documents
    console.log('\n🔍 CHECKING FOR INSTAGRAM COLLECTIONS:');
    console.log('======================================');
    
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    console.log('Available collections:', collections.map(c => c.name));
    
    // Check if there's an instagram_accounts collection
    if (collections.some(c => c.name === 'instagram_accounts')) {
      console.log('\n📱 INSTAGRAM ACCOUNTS COLLECTION:');
      const instagramAccounts = await db.collection('instagram_accounts').find({ userId: user._id }).toArray();
      console.log('Instagram accounts for this user:', instagramAccounts.length);
      if (instagramAccounts.length > 0) {
        instagramAccounts.forEach((account, index) => {
          console.log(`${index + 1}. Account:`, {
            username: account.username,
            followers: account.followers,
            following: account.following,
            posts: account.posts,
            likes: account.likes,
            comments: account.comments,
            bio: account.bio,
            verified: account.verified,
            businessAccount: account.businessAccount
          });
        });
      }
    }
    
    // Check if there's a social_accounts collection
    if (collections.some(c => c.name === 'social_accounts')) {
      console.log('\n📱 SOCIAL ACCOUNTS COLLECTION:');
      const socialAccounts = await db.collection('social_accounts').find({ userId: user._id }).toArray();
      console.log('Social accounts for this user:', socialAccounts.length);
      if (socialAccounts.length > 0) {
        socialAccounts.forEach((account, index) => {
          console.log(`${index + 1}. Account:`, {
            platform: account.platform,
            username: account.username,
            followers: account.followers,
            following: account.following,
            posts: account.posts,
            likes: account.likes,
            comments: account.comments
          });
        });
      }
    }
    
    // Check workspace for Instagram data
    if (user.workspaceId) {
      console.log('\n🔍 CHECKING WORKSPACE FOR INSTAGRAM DATA:');
      console.log('==========================================');
      console.log('Workspace ID:', user.workspaceId);
      
      if (collections.some(c => c.name === 'workspaces')) {
        const workspace = await db.collection('workspaces').findOne({ _id: user.workspaceId });
        if (workspace) {
          console.log('Workspace found:', {
            name: workspace.name,
            instagramAccounts: workspace.instagramAccounts?.length || 0,
            socialAccounts: workspace.socialAccounts?.length || 0
          });
          
          if (workspace.instagramAccounts && workspace.instagramAccounts.length > 0) {
            console.log('\n📱 WORKSPACE INSTAGRAM ACCOUNTS:');
            workspace.instagramAccounts.forEach((account: any, index: number) => {
              console.log(`${index + 1}. Account:`, {
                username: account.username,
                followers: account.followers,
                following: account.following,
                posts: account.posts,
                likes: account.likes,
                comments: account.comments
              });
            });
          }
        }
      }
    }

  } catch (error) {
    console.error('❌ Error checking Instagram data:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

checkRealInstagramData();
