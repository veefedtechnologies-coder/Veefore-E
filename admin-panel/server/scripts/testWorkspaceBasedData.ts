import mongoose from 'mongoose';
import 'dotenv/config';
import { MainAppUserSchema } from '../models/MainAppUser';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function testWorkspaceBasedData() {
  try {
    console.log('🔍 Testing workspace-based data fetching...');
    
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
    
    // Find the user's workspace
    let userWorkspace = null;
    
    if (user.workspaceId) {
      try {
        if (mongoose.Types.ObjectId.isValid(user.workspaceId)) {
          userWorkspace = await db.collection('workspaces').findOne({
            _id: new mongoose.Types.ObjectId(user.workspaceId)
          });
        } else {
          userWorkspace = await db.collection('workspaces').findOne({
            _id: user.workspaceId
          });
        }
      } catch (error) {
        console.log('Error finding workspace by ID:', error);
      }
    }
    
    if (!userWorkspace) {
      try {
        userWorkspace = await db.collection('workspaces').findOne({
          userId: user._id.toString()
        });
      } catch (error) {
        console.log('Error finding workspace by user ID:', error);
      }
    }
    
    console.log('\n🏢 WORKSPACE DATA:');
    console.log('==================');
    if (userWorkspace) {
      console.log('✅ Found workspace');
      console.log('Workspace ID:', userWorkspace._id);
      console.log('Workspace Name:', userWorkspace.name);
      console.log('Description:', userWorkspace.description);
      console.log('Credits:', userWorkspace.credits);
      console.log('Theme:', userWorkspace.theme);
      console.log('AI Personality:', userWorkspace.aiPersonality);
    } else {
      console.log('❌ No workspace found');
    }
    
    // Find social accounts for this specific workspace
    let socialAccounts = [];
    
    if (userWorkspace) {
      try {
        socialAccounts = await db.collection('socialaccounts').find({
          $or: [
            { workspaceId: userWorkspace._id },
            { workspaceId: userWorkspace._id.toString() }
          ]
        }).toArray();
      } catch (error) {
        console.log('Error finding social accounts by workspace ID:', error);
      }
    }
    
    console.log('\n📱 SOCIAL ACCOUNTS FOR THIS WORKSPACE:');
    console.log('=======================================');
    console.log('Found:', socialAccounts.length, 'accounts');
    
    if (socialAccounts.length > 0) {
      socialAccounts.forEach((account, index) => {
        console.log(`${index + 1}. ${account.platform}: ${account.username}`);
        console.log(`   Workspace ID: ${account.workspaceId}`);
        console.log(`   Followers: ${account.followersCount}`);
        console.log(`   Posts: ${account.mediaCount}`);
        console.log(`   Active: ${account.isActive}`);
        console.log('   ---');
      });
    } else {
      console.log('❌ No social accounts found for this workspace');
    }
    
    // Simulate the social media object that would be returned
    console.log('\n📱 SIMULATED SOCIAL MEDIA OBJECT:');
    console.log('==================================');
    
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
            connectedAt: account.createdAt,
            workspaceId: account.workspaceId
          };
        }
        return acc;
      }, {}),
      instagram: (socialAccounts || []).find((account: any) => account && account.platform === 'instagram' && account.isActive) ? {
        username: (socialAccounts || []).find((account: any) => account && account.platform === 'instagram' && account.isActive)?.username,
        followers: (socialAccounts || []).find((account: any) => account && account.platform === 'instagram' && account.isActive)?.followersCount,
        connected: true,
        workspaceId: (socialAccounts || []).find((account: any) => account && account.platform === 'instagram' && account.isActive)?.workspaceId
      } : null,
      totalConnections: (socialAccounts || []).filter((account: any) => account && account.isActive).length,
      workspaceSpecific: true
    };
    
    console.log(JSON.stringify(socialMedia, null, 2));
    
    // Simulate the workspace object that would be returned
    console.log('\n🏢 SIMULATED WORKSPACE OBJECT:');
    console.log('===============================');
    
    const workspaceData = userWorkspace ? {
      id: userWorkspace._id,
      name: userWorkspace.name || 'Default Workspace',
      description: userWorkspace.description || '',
      credits: userWorkspace.credits || 0,
      theme: userWorkspace.theme || 'light',
      aiPersonality: userWorkspace.aiPersonality || 'professional',
      socialAccountsCount: socialAccounts.length,
      connectedPlatforms: socialAccounts.map(account => account.platform)
    } : {
      id: user.workspaceId,
      name: 'Default Workspace',
      description: '',
      credits: 0,
      theme: 'light',
      aiPersonality: 'professional',
      socialAccountsCount: 0,
      connectedPlatforms: []
    };
    
    console.log(JSON.stringify(workspaceData, null, 2));

  } catch (error) {
    console.error('❌ Error testing workspace-based data:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

testWorkspaceBasedData();
