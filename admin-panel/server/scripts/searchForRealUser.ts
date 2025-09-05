import mongoose from 'mongoose';
import 'dotenv/config';
import { MainAppUserSchema } from '../models/MainAppUser';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function searchForRealUser() {
  try {
    console.log('🔍 Searching for REAL user data...');
    
    // Connect to veeforedb
    await mongoose.connect(MONGODB_URI, {
      dbName: 'veeforedb'
    });
    
    console.log('✅ Connected to veeforedb database');
    
    const User = mongoose.model('User', MainAppUserSchema, 'users');
    
    // Search for user with rahulc1020 in any field
    console.log('\n🔍 Searching for rahulc1020 in all fields...');
    const userByRahul = await User.findOne({ 
      $or: [
        { instagramUsername: /rahulc1020/i },
        { username: /rahulc1020/i },
        { email: /rahulc1020/i },
        { 'socialPlatforms.username': /rahulc1020/i },
        { 'socialPlatforms.name': /rahulc1020/i }
      ]
    }).lean();
    
    if (userByRahul) {
      console.log('✅ Found user with rahulc1020:', userByRahul.email);
      console.log('User ID:', userByRahul._id);
      console.log('Instagram Username:', userByRahul.instagramUsername);
      console.log('Instagram Followers:', userByRahul.instagramFollowers);
    } else {
      console.log('❌ No user found with rahulc1020');
    }
    
    // Search for users with 4 followers (your real data)
    console.log('\n🔍 Searching for users with 4 followers...');
    const userWith4Followers = await User.findOne({
      $or: [
        { instagramFollowers: 4 },
        { 'socialPlatforms.followers': 4 }
      ]
    }).lean();
    
    if (userWith4Followers) {
      console.log('✅ Found user with 4 followers:', userWith4Followers.email);
      console.log('User ID:', userWith4Followers._id);
      console.log('Instagram Username:', userWith4Followers.instagramUsername);
    } else {
      console.log('❌ No user found with 4 followers');
    }
    
    // Check if there are any users with very low follower counts (0-10)
    console.log('\n🔍 Searching for users with 0-10 followers...');
    const lowFollowerUsers = await User.find({
      $or: [
        { instagramFollowers: { $gte: 0, $lte: 10 } },
        { 'socialPlatforms.followers': { $gte: 0, $lte: 10 } }
      ]
    }).limit(5).lean();
    
    console.log(`Found ${lowFollowerUsers.length} users with 0-10 followers:`);
    lowFollowerUsers.forEach((user, index) => {
      console.log(`\n${index + 1}. User: ${user.email}`);
      console.log('   Instagram Username:', user.instagramUsername);
      console.log('   Instagram Followers:', user.instagramFollowers);
      console.log('   Social Platforms:', user.socialPlatforms?.map((p: any) => `${p.name}: ${p.followers}`).join(', '));
    });
    
    // Check if there are any users without the _ig suffix (real usernames)
    console.log('\n🔍 Searching for users without _ig suffix...');
    const realUsernameUsers = await User.find({
      instagramUsername: { $not: /_ig$/ }
    }).limit(5).lean();
    
    console.log(`Found ${realUsernameUsers.length} users without _ig suffix:`);
    realUsernameUsers.forEach((user, index) => {
      console.log(`\n${index + 1}. User: ${user.email}`);
      console.log('   Instagram Username:', user.instagramUsername);
      console.log('   Instagram Followers:', user.instagramFollowers);
    });
    
    // Check if there are any users with null/undefined social data (real users)
    console.log('\n🔍 Searching for users with null social data (real users)...');
    const nullSocialUsers = await User.find({
      $or: [
        { instagramFollowers: { $exists: false } },
        { instagramFollowers: null },
        { socialPlatforms: { $exists: false } },
        { socialPlatforms: null }
      ]
    }).limit(5).lean();
    
    console.log(`Found ${nullSocialUsers.length} users with null social data:`);
    nullSocialUsers.forEach((user, index) => {
      console.log(`\n${index + 1}. User: ${user.email}`);
      console.log('   Instagram Username:', user.instagramUsername);
      console.log('   Instagram Followers:', user.instagramFollowers);
      console.log('   Social Platforms:', user.socialPlatforms);
    });

  } catch (error) {
    console.error('❌ Error searching for real user:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

searchForRealUser();
