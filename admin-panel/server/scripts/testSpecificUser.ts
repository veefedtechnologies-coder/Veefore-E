import mongoose from 'mongoose';
import 'dotenv/config';
import { MainAppUserSchema } from '../models/MainAppUser';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function testSpecificUser() {
  try {
    console.log('🔍 Testing specific user with Instagram account...');
    
    // Connect to veeforedb
    await mongoose.connect(MONGODB_URI, {
      dbName: 'veeforedb'
    });
    
    console.log('✅ Connected to veeforedb database');
    
    const User = mongoose.model('User', MainAppUserSchema, 'users');
    const db = mongoose.connection.db;
    
    // Get the user who owns the Instagram account (rahulc1020)
    const userId = '6844027426cae0200f88b5db';
    const user = await User.findById(userId).lean();
    
    if (!user) {
      console.log('❌ User not found');
      return;
    }
    
    console.log('\n📊 USER DATA:');
    console.log('=============');
    console.log('Email:', user.email);
    console.log('User ID:', user._id);
    console.log('Workspace ID:', user.workspaceId);
    console.log('Instagram Username:', user.instagramUsername);
    
    // Get REAL social media data from socialaccounts collection
    let socialAccounts = await db.collection('socialaccounts').find({
      workspaceId: user.workspaceId
    }).toArray();
    
    console.log('\n📱 SOCIAL ACCOUNTS BY WORKSPACE:');
    console.log('=================================');
    console.log('Found social accounts:', socialAccounts.length);
    
    // If no social accounts found by workspace, try to find by user's Instagram username
    if (socialAccounts.length === 0 && user.instagramUsername) {
      const cleanUsername = user.instagramUsername.replace('@', '').replace('_ig', '');
      console.log('Trying username:', cleanUsername);
      socialAccounts = await db.collection('socialaccounts').find({
        username: cleanUsername
      }).toArray();
    }
    
    console.log('\n📱 SOCIAL ACCOUNTS BY USERNAME:');
    console.log('================================');
    console.log('Found social accounts:', socialAccounts.length);
    
    // If still no accounts found, try to find by user ID through workspace
    if (socialAccounts.length === 0) {
      const userWorkspace = await db.collection('workspaces').findOne({
        userId: user._id
      });
      
      console.log('\n🏢 USER WORKSPACE:');
      console.log('==================');
      if (userWorkspace) {
        console.log('Workspace ID:', userWorkspace._id);
        console.log('Workspace Name:', userWorkspace.name);
        
        socialAccounts = await db.collection('socialaccounts').find({
          workspaceId: userWorkspace._id
        }).toArray();
        
        console.log('\n📱 SOCIAL ACCOUNTS BY USER WORKSPACE:');
        console.log('=====================================');
        console.log('Found social accounts:', socialAccounts.length);
      } else {
        console.log('No workspace found for this user');
      }
    }
    
    // If still no accounts found, try to find any Instagram account
    if (socialAccounts.length === 0) {
      socialAccounts = await db.collection('socialaccounts').find({
        platform: 'instagram'
      }).limit(1).toArray();
      
      console.log('\n📱 FALLBACK INSTAGRAM ACCOUNT:');
      console.log('===============================');
      console.log('Found social accounts:', socialAccounts.length);
    }
    
    // Display found social accounts
    if (socialAccounts.length > 0) {
      console.log('\n🎯 FOUND SOCIAL ACCOUNTS:');
      console.log('==========================');
      socialAccounts.forEach((account, index) => {
        console.log(`${index + 1}. ${account.platform}: ${account.username}`);
        console.log(`   Workspace ID: ${account.workspaceId}`);
        console.log(`   Followers: ${account.followersCount}`);
        console.log(`   Active: ${account.isActive}`);
      });
    }

  } catch (error) {
    console.error('❌ Error testing specific user:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

testSpecificUser();
