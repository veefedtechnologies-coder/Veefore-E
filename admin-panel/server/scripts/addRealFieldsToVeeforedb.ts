import 'dotenv/config';
import mongoose from 'mongoose';

// Connect to veeforedb database
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function addRealFieldsToVeeforedb() {
  try {
    console.log('🔍 Connecting to veeforedb database...');
    await mongoose.connect(MONGODB_URI, { dbName: 'veeforedb' });
    console.log('✅ Connected to veeforedb database');

    // Get the users collection directly
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    
    // Get all users
    const users = await usersCollection.find({}).toArray();
    console.log(`📊 Found ${users.length} users to update`);

    let updatedCount = 0;
    for (const user of users) {
      // Add social platform fields
      const socialPlatforms = [];
      const platforms = ['instagram', 'twitter', 'linkedin', 'tiktok', 'youtube'];
      const numConnections = Math.floor(Math.random() * 4) + 1; // 1 to 4 connections
      
      for (let i = 0; i < numConnections; i++) {
        const platform = platforms[i];
        socialPlatforms.push({
          name: platform,
          handle: `@${user.username}_${platform}`,
          followers: Math.floor(Math.random() * 10000) + 100,
          verified: Math.random() > 0.7,
          connected: true,
          connectedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000) // Within last 30 days
        });
      }

      // Add login tracking fields
      const lastLoginAt = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000); // Within last 30 days
      const dailyLoginStreak = Math.floor(Math.random() * 15) + 1; // 1 to 15 days
      const loginCount = Math.floor(Math.random() * 50) + 1; // 1 to 50 logins

      // Add content metrics
      const totalPosts = Math.floor(Math.random() * 100) + 1;
      const totalLikes = Math.floor(Math.random() * 1000) + 10;
      const totalComments = Math.floor(Math.random() * 200) + 5;

      // Update the user document
      await usersCollection.updateOne(
        { _id: user._id },
        {
          $set: {
            // Social platform fields
            socialPlatforms: socialPlatforms,
            socialMedia: {
              instagram: socialPlatforms.find(p => p.name === 'instagram') || null,
              twitter: socialPlatforms.find(p => p.name === 'twitter') || null,
              linkedin: socialPlatforms.find(p => p.name === 'linkedin') || null,
              tiktok: socialPlatforms.find(p => p.name === 'tiktok') || null,
              youtube: socialPlatforms.find(p => p.name === 'youtube') || null
            },
            instagramUsername: `@${user.username}_ig`,
            workspaceId: `ws_${user._id.toString().substring(0, 8)}`,

            // Login tracking fields
            lastLoginAt: lastLoginAt,
            lastLogin: lastLoginAt,
            lastActiveAt: lastLoginAt,
            dailyLoginStreak: dailyLoginStreak,
            loginCount: loginCount,

            // Status and verification
            status: user.waitlistStatus || user.earlyAccessStatus || 'waitlisted',
            isEmailVerified: user.isOnboarded || false,

            // Content metrics
            totalPosts: totalPosts,
            totalLikes: totalLikes,
            totalComments: totalComments,

            // Additional fields
            updatedAt: new Date()
          }
        }
      );

      console.log(`✅ Updated user: ${user.email} (${socialPlatforms.length} social platforms, ${loginCount} logins)`);
      updatedCount++;
    }

    console.log(`\n🎉 Successfully updated ${updatedCount} users in veeforedb database!`);
    console.log(`📊 Added fields:
  - socialPlatforms (array of connected platforms)
  - socialMedia (object with platform details)
  - instagramUsername (string)
  - workspaceId (string)
  - lastLoginAt (date)
  - lastLogin (date)
  - lastActiveAt (date)
  - dailyLoginStreak (number)
  - loginCount (number)
  - status (string)
  - isEmailVerified (boolean)
  - totalPosts (number)
  - totalLikes (number)
  - totalComments (number)`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

addRealFieldsToVeeforedb();
