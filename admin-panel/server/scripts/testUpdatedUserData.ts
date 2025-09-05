import mongoose from 'mongoose';
import 'dotenv/config';
import { MainAppUserSchema } from '../models/MainAppUser';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function testUpdatedUserData() {
  try {
    console.log('🔍 Testing updated user data service...');
    
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
    console.log('Workspace ID:', user.workspaceId);
    
    // Get REAL social media data from socialaccounts collection
    const socialAccounts = await db.collection('socialaccounts').find({
      workspaceId: user.workspaceId
    }).toArray();
    
    console.log('\n📱 SOCIAL ACCOUNTS:');
    console.log('===================');
    console.log('Found social accounts:', socialAccounts.length);
    
    socialAccounts.forEach((account, index) => {
      console.log(`${index + 1}. ${account.platform}: ${account.username} (${account.followersCount} followers)`);
    });
    
    // Get REAL workspace data from workspaces collection
    const workspace = await db.collection('workspaces').findOne({
      _id: user.workspaceId
    });
    
    console.log('\n🏢 WORKSPACE DATA:');
    console.log('==================');
    if (workspace) {
      console.log('Workspace Name:', workspace.name);
      console.log('Description:', workspace.description);
      console.log('Credits:', workspace.credits);
      console.log('Theme:', workspace.theme);
      console.log('AI Personality:', workspace.aiPersonality);
      console.log('Max Team Members:', workspace.maxTeamMembers);
    } else {
      console.log('No workspace found for this user');
    }
    
    // Simulate the social media object that would be returned
    console.log('\n📱 SIMULATED SOCIAL MEDIA OBJECT:');
    console.log('==================================');
    
    const socialMedia = {
      platforms: socialAccounts.reduce((acc: any, account: any) => {
        if (account.isActive) {
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
      instagram: socialAccounts.find((account: any) => account.platform === 'instagram' && account.isActive) ? {
        username: socialAccounts.find((account: any) => account.platform === 'instagram' && account.isActive).username,
        followers: socialAccounts.find((account: any) => account.platform === 'instagram' && account.isActive).followersCount,
        connected: true
      } : null,
      totalConnections: socialAccounts.filter((account: any) => account.isActive).length
    };
    
    console.log(JSON.stringify(socialMedia, null, 2));
    
    // Simulate the workspace object that would be returned
    console.log('\n🏢 SIMULATED WORKSPACE OBJECT:');
    console.log('===============================');
    
    const workspaceData = workspace ? {
      id: workspace._id,
      name: workspace.name || 'Default Workspace',
      description: workspace.description || '',
      credits: workspace.credits || 0,
      theme: workspace.theme || 'light',
      aiPersonality: workspace.aiPersonality || 'professional'
    } : {
      id: user.workspaceId,
      name: 'Default Workspace',
      description: '',
      credits: 0,
      theme: 'light',
      aiPersonality: 'professional'
    };
    
    console.log(JSON.stringify(workspaceData, null, 2));

  } catch (error) {
    console.error('❌ Error testing updated user data:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

testUpdatedUserData();
