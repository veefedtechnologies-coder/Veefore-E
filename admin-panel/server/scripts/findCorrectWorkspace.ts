import mongoose from 'mongoose';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function findCorrectWorkspace() {
  try {
    console.log('🔍 Finding correct workspace for rahulc1020...');
    
    // Connect to veeforedb
    await mongoose.connect(MONGODB_URI, {
      dbName: 'veeforedb'
    });
    
    console.log('✅ Connected to veeforedb database');
    
    const db = mongoose.connection.db;
    
    // Find the Instagram account for rahulc1020
    const instagramAccount = await db.collection('socialaccounts').findOne({
      username: 'rahulc1020',
      platform: 'instagram'
    });
    
    if (instagramAccount) {
      console.log('\n🎯 INSTAGRAM ACCOUNT FOUND:');
      console.log('============================');
      console.log('Username:', instagramAccount.username);
      console.log('Workspace ID:', instagramAccount.workspaceId);
      console.log('Followers:', instagramAccount.followersCount);
      console.log('Posts:', instagramAccount.mediaCount);
      
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
        
        console.log('\n✅ This is the correct user with real Instagram data!');
        console.log('Use this User ID in the admin panel:', user._id);
      } else {
        console.log('❌ No user found for this workspace');
      }
    } else {
      console.log('❌ Instagram account not found');
    }
    
    // Also check all users and their workspaces
    console.log('\n🔍 ALL USERS AND THEIR WORKSPACES:');
    console.log('==================================');
    const allUsers = await db.collection('users').find({}).limit(10).toArray();
    
    allUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.email} - Workspace: ${user.workspaceId}`);
    });

  } catch (error) {
    console.error('❌ Error finding correct workspace:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

findCorrectWorkspace();
