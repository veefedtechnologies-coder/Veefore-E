import mongoose from 'mongoose';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function debugWorkspaceLookup() {
  try {
    console.log('🔍 Debugging workspace lookup...');
    
    // Connect to veeforedb
    await mongoose.connect(MONGODB_URI, {
      dbName: 'veeforedb'
    });
    
    console.log('✅ Connected to veeforedb database');
    
    const db = mongoose.connection.db;
    
    // Get the specific user
    const userId = '6844027426cae0200f88b5db';
    console.log('\n👤 USER ID:', userId);
    console.log('User ID Type:', typeof userId);
    
    // Try to find workspace by user ID
    console.log('\n🔍 SEARCHING FOR WORKSPACE BY USER ID:');
    console.log('=====================================');
    
    const userWorkspace = await db.collection('workspaces').findOne({
      userId: userId
    });
    
    console.log('Result:', userWorkspace);
    
    if (userWorkspace) {
      console.log('✅ Found workspace by user ID');
      console.log('Workspace ID:', userWorkspace._id);
      console.log('Workspace Name:', userWorkspace.name);
      
      // Try to find social accounts by this workspace ID
      const socialAccounts = await db.collection('socialaccounts').find({
        workspaceId: userWorkspace._id
      }).toArray();
      
      console.log('\n📱 SOCIAL ACCOUNTS BY WORKSPACE:');
      console.log('Found:', socialAccounts.length, 'accounts');
      socialAccounts.forEach((account, index) => {
        console.log(`${index + 1}. ${account.platform}: ${account.username}`);
        console.log(`   Followers: ${account.followersCount}`);
        console.log(`   Active: ${account.isActive}`);
      });
    } else {
      console.log('❌ No workspace found by user ID');
      
      // Let's check what workspaces exist and their user IDs
      console.log('\n🔍 ALL WORKSPACES:');
      const allWorkspaces = await db.collection('workspaces').find({}).toArray();
      allWorkspaces.forEach((ws, index) => {
        console.log(`${index + 1}. Workspace ID: ${ws._id}`);
        console.log(`   User ID: ${ws.userId}`);
        console.log(`   User ID Type: ${typeof ws.userId}`);
        console.log(`   Match: ${ws.userId === userId}`);
        console.log('   ---');
      });
    }
    
    // Try with ObjectId
    console.log('\n🔍 TRYING WITH OBJECTID:');
    console.log('=========================');
    
    try {
      const userObjectId = new mongoose.Types.ObjectId(userId);
      console.log('User ObjectId:', userObjectId);
      
      const userWorkspaceByObjectId = await db.collection('workspaces').findOne({
        userId: userObjectId
      });
      
      console.log('Result with ObjectId:', userWorkspaceByObjectId);
      
      if (userWorkspaceByObjectId) {
        console.log('✅ Found workspace with ObjectId');
      } else {
        console.log('❌ No workspace found with ObjectId');
      }
    } catch (error) {
      console.log('Error with ObjectId:', error.message);
    }

  } catch (error) {
    console.error('❌ Error debugging workspace lookup:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

debugWorkspaceLookup();
