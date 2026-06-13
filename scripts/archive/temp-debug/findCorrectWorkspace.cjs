const { MongoClient } = require('mongodb');

const MONGODB_URI = 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function findCorrectWorkspace() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    console.log('🔍 Finding correct workspace for arpit.10...');
    
    await client.connect();
    const db = client.db('veeforedb');
    
    console.log('✅ Connected to veeforedb database');
    
    // Find the Instagram account for arpit.10
    const instagramAccount = await db.collection('socialaccounts').findOne({
      username: 'arpit.10',
      platform: 'instagram'
    });
    
    if (instagramAccount) {
      console.log('\n🎯 INSTAGRAM ACCOUNT FOUND:');
      console.log('============================');
      console.log('Username:', instagramAccount.username);
      console.log('Workspace ID:', instagramAccount.workspaceId);
      console.log('Followers:', instagramAccount.followersCount);
      console.log('Posts:', instagramAccount.mediaCount);
      console.log('Is Active:', instagramAccount.isActive);
      console.log('Total Reach:', instagramAccount.totalReach);
      console.log('Account Level Reach:', instagramAccount.accountLevelReach);
      console.log('Reach By Period:', instagramAccount.reachByPeriod);
      
      // Find the user who owns this workspace
      const user = await db.collection('users').findOne({
        workspaceId: instagramAccount.workspaceId
      });
      
      if (user) {
        console.log('\n👤 USER FOUND:');
        console.log('==============');
        console.log('User ID:', user._id);
        console.log('Email:', user.email);
        console.log('Username:', user.username);
        console.log('Workspace ID:', user.workspaceId);
        
        // Test the metrics API with this workspace ID
        console.log('\n🧪 TESTING METRICS API:');
        console.log('========================');
        console.log(`Correct workspace ID to use: ${instagramAccount.workspaceId}`);
        console.log(`Test URL: http://localhost:5000/api/workspaces/${instagramAccount.workspaceId}/metrics?days=7`);
      } else {
        console.log('\n❌ No user found with this workspace ID');
      }
      
      // Also check if there are any workspaces collection entries
      const workspace = await db.collection('workspaces').findOne({
        _id: instagramAccount.workspaceId
      });
      
      if (workspace) {
        console.log('\n🏢 WORKSPACE FOUND:');
        console.log('==================');
        console.log('Workspace ID:', workspace._id);
        console.log('Name:', workspace.name);
        console.log('Members:', workspace.members);
      } else {
        console.log('\n❌ No workspace document found with this ID');
      }
      
    } else {
      console.log('\n❌ No Instagram account found for arpit.10');
      
      // Let's see what Instagram accounts exist
      const allInstagramAccounts = await db.collection('socialaccounts').find({
        platform: 'instagram'
      }).toArray();
      
      console.log('\n📱 ALL INSTAGRAM ACCOUNTS:');
      console.log('==========================');
      allInstagramAccounts.forEach((account, index) => {
        console.log(`${index + 1}. ${account.username} (workspace: ${account.workspaceId})`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

findCorrectWorkspace();