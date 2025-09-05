import mongoose from 'mongoose';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function checkSocialAccountWorkspace() {
  try {
    console.log('🔍 Checking social account workspace connections...');
    
    // Connect to veeforedb
    await mongoose.connect(MONGODB_URI, {
      dbName: 'veeforedb'
    });
    
    console.log('✅ Connected to veeforedb database');
    
    const db = mongoose.connection.db;
    
    // Get the workspace for our user
    const userId = '6844027426cae0200f88b5db';
    const userWorkspace = await db.collection('workspaces').findOne({
      userId: userId
    });
    
    console.log('\n🏢 USER WORKSPACE:');
    console.log('==================');
    console.log('Workspace ID:', userWorkspace._id);
    console.log('Workspace Name:', userWorkspace.name);
    
    // Check social accounts by this workspace ID
    console.log('\n📱 SOCIAL ACCOUNTS BY WORKSPACE ID:');
    console.log('====================================');
    const socialAccountsByWorkspace = await db.collection('socialaccounts').find({
      workspaceId: userWorkspace._id
    }).toArray();
    
    console.log('Found:', socialAccountsByWorkspace.length, 'accounts');
    socialAccountsByWorkspace.forEach((account, index) => {
      console.log(`${index + 1}. ${account.platform}: ${account.username}`);
    });
    
    // Check all social accounts and their workspace IDs
    console.log('\n📱 ALL SOCIAL ACCOUNTS:');
    console.log('=======================');
    const allSocialAccounts = await db.collection('socialaccounts').find({}).toArray();
    
    allSocialAccounts.forEach((account, index) => {
      console.log(`${index + 1}. ${account.platform}: ${account.username}`);
      console.log(`   Workspace ID: ${account.workspaceId}`);
      console.log(`   Workspace ID Type: ${typeof account.workspaceId}`);
      console.log(`   Matches user workspace: ${account.workspaceId.toString() === userWorkspace._id.toString()}`);
      console.log('   ---');
    });
    
    // Check if there's a connection through user ID
    console.log('\n🔗 CHECKING USER ID CONNECTIONS:');
    console.log('=================================');
    
    const socialAccountsByUserId = await db.collection('socialaccounts').find({
      userId: userId
    }).toArray();
    
    console.log('Social accounts by user ID:', socialAccountsByUserId.length);
    socialAccountsByUserId.forEach((account, index) => {
      console.log(`${index + 1}. ${account.platform}: ${account.username}`);
    });
    
    // Check if there's a connection through username
    console.log('\n🔗 CHECKING USERNAME CONNECTIONS:');
    console.log('==================================');
    
    const user = await db.collection('users').findOne({
      _id: new mongoose.Types.ObjectId(userId)
    });
    
    console.log('User Instagram Username:', user.instagramUsername);
    
    if (user.instagramUsername) {
      const cleanUsername = user.instagramUsername.replace('@', '').replace('_ig', '');
      console.log('Clean Username:', cleanUsername);
      
      const socialAccountsByUsername = await db.collection('socialaccounts').find({
        username: cleanUsername
      }).toArray();
      
      console.log('Social accounts by username:', socialAccountsByUsername.length);
      socialAccountsByUsername.forEach((account, index) => {
        console.log(`${index + 1}. ${account.platform}: ${account.username}`);
        console.log(`   Workspace ID: ${account.workspaceId}`);
      });
    }

  } catch (error) {
    console.error('❌ Error checking social account workspace:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

checkSocialAccountWorkspace();
