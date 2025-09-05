import mongoose from 'mongoose';
import 'dotenv/config';
import { MainAppUserSchema } from '../models/MainAppUser';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function debugUserLinking() {
  try {
    console.log('🔍 Debugging user linking with social accounts...');
    
    // Connect to veeforedb
    await mongoose.connect(MONGODB_URI, {
      dbName: 'veeforedb'
    });
    
    console.log('✅ Connected to veeforedb database');
    
    const User = mongoose.model('User', MainAppUserSchema, 'users');
    const db = mongoose.connection.db;
    
    // Get all users and their data
    const users = await User.find({}).limit(5).lean();
    
    console.log('\n👥 USERS DATA:');
    console.log('==============');
    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.email}`);
      console.log(`   Workspace ID: ${user.workspaceId}`);
      console.log(`   Instagram Username: ${user.instagramUsername || 'Not set'}`);
      console.log(`   Username: ${user.username || 'Not set'}`);
      console.log('   ---');
    });
    
    // Get all social accounts
    const socialAccounts = await db.collection('socialaccounts').find({}).toArray();
    
    console.log('\n📱 SOCIAL ACCOUNTS:');
    console.log('===================');
    socialAccounts.forEach((account, index) => {
      console.log(`${index + 1}. ${account.platform}: ${account.username}`);
      console.log(`   Workspace ID: ${account.workspaceId}`);
      console.log(`   Followers: ${account.followersCount}`);
      console.log(`   Active: ${account.isActive}`);
      console.log('   ---');
    });
    
    // Get all workspaces
    const workspaces = await db.collection('workspaces').find({}).limit(5).toArray();
    
    console.log('\n🏢 WORKSPACES:');
    console.log('==============');
    workspaces.forEach((workspace, index) => {
      console.log(`${index + 1}. ${workspace.name || 'Unnamed'}`);
      console.log(`   ID: ${workspace._id}`);
      console.log(`   User ID: ${workspace.userId || 'Not set'}`);
      console.log(`   Credits: ${workspace.credits || 0}`);
      console.log('   ---');
    });
    
    // Try to find the connection between users and social accounts
    console.log('\n🔗 LINKING ANALYSIS:');
    console.log('====================');
    
    // Check if any user's workspace ID matches any social account's workspace ID
    for (const user of users) {
      const matchingSocialAccounts = socialAccounts.filter(account => 
        account.workspaceId === user.workspaceId
      );
      
      if (matchingSocialAccounts.length > 0) {
        console.log(`✅ User ${user.email} has ${matchingSocialAccounts.length} social accounts`);
        matchingSocialAccounts.forEach(account => {
          console.log(`   - ${account.platform}: ${account.username}`);
        });
      } else {
        console.log(`❌ User ${user.email} has no matching social accounts`);
      }
    }
    
    // Check if any social account's username matches any user's username
    for (const account of socialAccounts) {
      const matchingUsers = users.filter(user => 
        user.username === account.username || 
        user.instagramUsername === account.username ||
        user.instagramUsername === `@${account.username}`
      );
      
      if (matchingUsers.length > 0) {
        console.log(`✅ Social account ${account.username} matches ${matchingUsers.length} users`);
        matchingUsers.forEach(user => {
          console.log(`   - ${user.email}`);
        });
      }
    }

  } catch (error) {
    console.error('❌ Error debugging user linking:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

debugUserLinking();
