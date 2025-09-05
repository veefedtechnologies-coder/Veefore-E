import mongoose from 'mongoose';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function checkWorkspaceIds() {
  try {
    console.log('🔍 Checking workspace IDs in veeforedb...');
    
    // Connect to veeforedb
    await mongoose.connect(MONGODB_URI, {
      dbName: 'veeforedb'
    });
    
    console.log('✅ Connected to veeforedb database');
    
    const db = mongoose.connection.db;
    
    // Check workspaces collection
    console.log('\n🏢 WORKSPACES COLLECTION:');
    console.log('==========================');
    const workspaces = await db.collection('workspaces').find({}).limit(5).toArray();
    
    workspaces.forEach((workspace, index) => {
      console.log(`${index + 1}. ID: ${workspace._id}`);
      console.log(`   Name: ${workspace.name}`);
      console.log(`   User ID: ${workspace.userId}`);
      console.log(`   Credits: ${workspace.credits}`);
      console.log('   ---');
    });
    
    // Check socialaccounts collection
    console.log('\n📱 SOCIAL ACCOUNTS COLLECTION:');
    console.log('===============================');
    const socialAccounts = await db.collection('socialaccounts').find({}).toArray();
    
    socialAccounts.forEach((account, index) => {
      console.log(`${index + 1}. Platform: ${account.platform}`);
      console.log(`   Username: ${account.username}`);
      console.log(`   Workspace ID: ${account.workspaceId}`);
      console.log(`   User ID: ${account.userId || 'Not set'}`);
      console.log('   ---');
    });
    
    // Check users collection workspace IDs
    console.log('\n👥 USERS COLLECTION WORKSPACE IDs:');
    console.log('===================================');
    const users = await db.collection('users').find({}).limit(5).toArray();
    
    users.forEach((user, index) => {
      console.log(`${index + 1}. Email: ${user.email}`);
      console.log(`   User ID: ${user._id}`);
      console.log(`   Workspace ID: ${user.workspaceId}`);
      console.log(`   Workspace ID Type: ${typeof user.workspaceId}`);
      console.log('   ---');
    });
    
    // Try to find the connection
    console.log('\n🔗 CONNECTION ANALYSIS:');
    console.log('========================');
    
    // Find user with workspace ID ws_68440274
    const userWithWsId = await db.collection('users').findOne({
      workspaceId: 'ws_68440274'
    });
    
    if (userWithWsId) {
      console.log('✅ Found user with workspace ID ws_68440274');
      console.log('User ID:', userWithWsId._id);
      
      // Try to find workspace by user ID
      const workspaceByUserId = await db.collection('workspaces').findOne({
        userId: userWithWsId._id
      });
      
      if (workspaceByUserId) {
        console.log('✅ Found workspace by user ID');
        console.log('Workspace ID:', workspaceByUserId._id);
        console.log('Workspace Name:', workspaceByUserId.name);
        
        // Try to find social accounts by this workspace ID
        const socialAccountsByWorkspace = await db.collection('socialaccounts').find({
          workspaceId: workspaceByUserId._id
        }).toArray();
        
        console.log('Social accounts by workspace ID:', socialAccountsByWorkspace.length);
        socialAccountsByWorkspace.forEach(account => {
          console.log(`  - ${account.platform}: ${account.username}`);
        });
      } else {
        console.log('❌ No workspace found by user ID');
      }
    } else {
      console.log('❌ No user found with workspace ID ws_68440274');
    }

  } catch (error) {
    console.error('❌ Error checking workspace IDs:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

checkWorkspaceIds();
