import mongoose from 'mongoose';
import 'dotenv/config';
import { MainAppUserSchema } from '../models/MainAppUser';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function findRealUserData() {
  try {
    console.log('🔍 Finding REAL user data in database...');
    
    // Connect to veeforedb
    await mongoose.connect(MONGODB_URI, {
      dbName: 'veeforedb'
    });
    
    console.log('✅ Connected to veeforedb database');
    
    const User = mongoose.model('User', MainAppUserSchema, 'users');
    
    // Search for user with Instagram username rahulc1020
    console.log('\n🔍 Searching for user with Instagram username rahulc1020...');
    const userByInstagram = await User.findOne({ 
      $or: [
        { instagramUsername: /rahulc1020/i },
        { 'socialPlatforms.username': /rahulc1020/i }
      ]
    }).lean();
    
    if (userByInstagram) {
      console.log('✅ Found user by Instagram username:', userByInstagram.email);
      console.log('User ID:', userByInstagram._id);
    }
    
    // Search for user with email containing rahul
    console.log('\n🔍 Searching for user with email containing rahul...');
    const userByEmail = await User.findOne({ 
      email: /rahul/i 
    }).lean();
    
    if (userByEmail) {
      console.log('✅ Found user by email:', userByEmail.email);
      console.log('User ID:', userByEmail._id);
    }
    
    // Get all users and check their Instagram data
    console.log('\n🔍 Checking all users for real Instagram data...');
    const allUsers = await User.find({}).limit(10).lean();
    
    console.log(`Found ${allUsers.length} users. Checking their Instagram data:`);
    
    allUsers.forEach((user, index) => {
      console.log(`\n${index + 1}. User: ${user.email}`);
      console.log('   Instagram Username:', user.instagramUsername);
      console.log('   Instagram Followers:', user.instagramFollowers);
      console.log('   Instagram Following:', user.instagramFollowing);
      console.log('   Instagram Posts:', user.instagramPosts);
      console.log('   Instagram Likes:', user.instagramLikes);
      console.log('   Instagram Comments:', user.instagramComments);
      
      // Check social platforms
      if (user.socialPlatforms && user.socialPlatforms.length > 0) {
        console.log('   Social Platforms:');
        user.socialPlatforms.forEach((platform: any, pIndex: number) => {
          console.log(`     ${pIndex + 1}. ${platform.name}: ${platform.followers} followers`);
        });
      }
      
      // Check if this looks like real data (low numbers, realistic usernames)
      const hasRealData = user.instagramFollowers && user.instagramFollowers < 1000 && 
                         user.instagramUsername && !user.instagramUsername.includes('_ig');
      
      if (hasRealData) {
        console.log('   🎯 This looks like REAL data!');
      } else {
        console.log('   ❌ This looks like mock data');
      }
    });
    
    // Search for users with very low follower counts (likely real)
    console.log('\n🔍 Searching for users with low follower counts (likely real data)...');
    const realUsers = await User.find({
      $or: [
        { instagramFollowers: { $lt: 100, $gt: 0 } },
        { 'socialPlatforms.followers': { $lt: 100, $gt: 0 } }
      ]
    }).limit(5).lean();
    
    console.log(`Found ${realUsers.length} users with low follower counts:`);
    realUsers.forEach((user, index) => {
      console.log(`\n${index + 1}. User: ${user.email}`);
      console.log('   Instagram Username:', user.instagramUsername);
      console.log('   Instagram Followers:', user.instagramFollowers);
      console.log('   Social Platforms:', user.socialPlatforms?.map((p: any) => `${p.name}: ${p.followers}`).join(', '));
    });

  } catch (error) {
    console.error('❌ Error finding real user data:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

findRealUserData();
