import mongoose from 'mongoose';
import 'dotenv/config';
import { MainAppUserSchema } from '../models/MainAppUser';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function testRealDataFetch() {
  try {
    console.log('🔍 Testing real data fetch from veeforedb...');
    
    // Connect to veeforedb
    await mongoose.connect(MONGODB_URI, {
      dbName: 'veeforedb'
    });
    
    console.log('✅ Connected to veeforedb database');
    
    const User = mongoose.model('User', MainAppUserSchema, 'users');
    const db = mongoose.connection.db;
    
    // Get a sample user
    const user = await User.findOne({}).lean();
    
    if (!user) {
      console.log('❌ No user found');
      return;
    }
    
    console.log('\n📊 USER DATA:');
    console.log('=============');
    console.log('Email:', user.email);
    console.log('User ID:', user._id);
    console.log('Workspace ID:', user.workspaceId);
    console.log('Instagram Username:', user.instagramUsername);
    
    // Test social accounts fetch
    console.log('\n📱 TESTING SOCIAL ACCOUNTS FETCH:');
    console.log('==================================');
    
    let socialAccounts = await db.collection('socialaccounts').find({
      workspaceId: user.workspaceId
    }).toArray();
    
    console.log('1. By workspace ID:', socialAccounts.length, 'accounts');
    
    // Try by user ID through workspace
    if (socialAccounts.length === 0) {
      const userWorkspace = await db.collection('workspaces').findOne({
        userId: user._id.toString()
      });
      
      if (userWorkspace) {
        // Try both ObjectId and string formats for workspace ID
        socialAccounts = await db.collection('socialaccounts').find({
          $or: [
            { workspaceId: userWorkspace._id },
            { workspaceId: userWorkspace._id.toString() }
          ]
        }).toArray();
        console.log('2. By user workspace:', socialAccounts.length, 'accounts');
      }
    }
    
    // Try by username
    if (socialAccounts.length === 0 && user.instagramUsername) {
      const cleanUsername = user.instagramUsername.replace('@', '').replace('_ig', '');
      socialAccounts = await db.collection('socialaccounts').find({
        username: cleanUsername
      }).toArray();
      console.log('3. By username:', socialAccounts.length, 'accounts');
    }
    
    // Fallback to any Instagram account
    if (socialAccounts.length === 0) {
      socialAccounts = await db.collection('socialaccounts').find({
        platform: 'instagram'
      }).limit(1).toArray();
      console.log('4. Fallback Instagram:', socialAccounts.length, 'accounts');
    }
    
    // Display found social accounts
    if (socialAccounts.length > 0) {
      console.log('\n🎯 FOUND SOCIAL ACCOUNTS:');
      socialAccounts.forEach((account, index) => {
        console.log(`${index + 1}. ${account.platform}: ${account.username}`);
        console.log(`   Followers: ${account.followersCount}`);
        console.log(`   Posts: ${account.mediaCount}`);
        console.log(`   Active: ${account.isActive}`);
      });
    } else {
      console.log('❌ No social accounts found');
    }
    
    // Test workspace fetch
    console.log('\n🏢 TESTING WORKSPACE FETCH:');
    console.log('============================');
    
    let workspace = null;
    if (user.workspaceId) {
      try {
        workspace = await db.collection('workspaces').findOne({
          _id: new mongoose.Types.ObjectId(user.workspaceId)
        });
        console.log('1. By workspace ID:', workspace ? 'Found' : 'Not found');
      } catch (error) {
        console.log('1. By workspace ID: Error -', error.message);
      }
    }
    
    if (!workspace) {
      try {
        workspace = await db.collection('workspaces').findOne({
          userId: user._id
        });
        console.log('2. By user ID:', workspace ? 'Found' : 'Not found');
      } catch (error) {
        console.log('2. By user ID: Error -', error.message);
      }
    }
    
    if (workspace) {
      console.log('\n🎯 FOUND WORKSPACE:');
      console.log('Name:', workspace.name);
      console.log('Description:', workspace.description);
      console.log('Credits:', workspace.credits);
      console.log('Theme:', workspace.theme);
    } else {
      console.log('❌ No workspace found');
    }
    
    // Test the actual user data service function
    console.log('\n🧪 TESTING USER DATA SERVICE:');
    console.log('==============================');
    
    // Simulate the user data service logic
    const socialMedia = {
      platforms: (socialAccounts || []).reduce((acc: any, account: any) => {
        if (account && account.isActive) {
          acc[account.platform] = {
            handle: account.username || '',
            followers: account.followersCount || 0,
            following: account.followingCount || 0,
            posts: account.mediaCount || 0,
            verified: account.isVerified || false,
            connected: account.isActive || false,
            connectedAt: account.createdAt
          };
        }
        return acc;
      }, {}),
      instagram: (socialAccounts || []).find((account: any) => account && account.platform === 'instagram' && account.isActive) ? {
        username: (socialAccounts || []).find((account: any) => account && account.platform === 'instagram' && account.isActive)?.username,
        followers: (socialAccounts || []).find((account: any) => account && account.platform === 'instagram' && account.isActive)?.followersCount,
        connected: true
      } : null,
      totalConnections: (socialAccounts || []).filter((account: any) => account && account.isActive).length
    };
    
    console.log('Social Media Object:');
    console.log(JSON.stringify(socialMedia, null, 2));
    
    const workspaceData = workspace ? {
      id: workspace._id,
      name: workspace.name || 'Default Workspace',
      description: workspace.description || '',
      credits: workspace.credits || 0,
      theme: workspace.theme || 'light'
    } : {
      id: user.workspaceId,
      name: 'Default Workspace',
      description: '',
      credits: 0,
      theme: 'light'
    };
    
    console.log('\nWorkspace Object:');
    console.log(JSON.stringify(workspaceData, null, 2));

  } catch (error) {
    console.error('❌ Error testing real data fetch:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

testRealDataFetch();
