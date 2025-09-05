import mongoose from 'mongoose';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function debugStep2() {
  try {
    console.log('🔍 Debugging step 2 (user workspace lookup)...');
    
    // Connect to veeforedb
    await mongoose.connect(MONGODB_URI, {
      dbName: 'veeforedb'
    });
    
    console.log('✅ Connected to veeforedb database');
    
    const db = mongoose.connection.db;
    
    // Get the user
    const userId = '6844027426cae0200f88b5db';
    const user = await db.collection('users').findOne({
      _id: new mongoose.Types.ObjectId(userId)
    });
    
    console.log('\n👤 USER:');
    console.log('Email:', user.email);
    console.log('User ID:', user._id);
    console.log('User ID Type:', typeof user._id);
    
    // Try to find workspace by user ID
    console.log('\n🔍 SEARCHING FOR WORKSPACE:');
    console.log('============================');
    
    const userWorkspace = await db.collection('workspaces').findOne({
      userId: user._id.toString()
    });
    
    console.log('Workspace found:', !!userWorkspace);
    
    if (userWorkspace) {
      console.log('Workspace ID:', userWorkspace._id);
      console.log('Workspace Name:', userWorkspace.name);
      
      // Try to find social accounts by this workspace ID
      console.log('\n📱 SEARCHING FOR SOCIAL ACCOUNTS:');
      console.log('==================================');
      
      // Try with ObjectId
      const socialAccountsByObjectId = await db.collection('socialaccounts').find({
        workspaceId: userWorkspace._id
      }).toArray();
      
      console.log('By ObjectId:', socialAccountsByObjectId.length, 'accounts');
      
      // Try with string
      const socialAccountsByString = await db.collection('socialaccounts').find({
        workspaceId: userWorkspace._id.toString()
      }).toArray();
      
      console.log('By string:', socialAccountsByString.length, 'accounts');
      
      // Try with $or
      const socialAccountsByOr = await db.collection('socialaccounts').find({
        $or: [
          { workspaceId: userWorkspace._id },
          { workspaceId: userWorkspace._id.toString() }
        ]
      }).toArray();
      
      console.log('By $or:', socialAccountsByOr.length, 'accounts');
      
      if (socialAccountsByOr.length > 0) {
        console.log('\n🎯 FOUND SOCIAL ACCOUNTS:');
        socialAccountsByOr.forEach((account, index) => {
          console.log(`${index + 1}. ${account.platform}: ${account.username}`);
          console.log(`   Followers: ${account.followersCount}`);
          console.log(`   Active: ${account.isActive}`);
        });
      }
    } else {
      console.log('❌ No workspace found');
    }

  } catch (error) {
    console.error('❌ Error debugging step 2:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

debugStep2();
