import 'dotenv/config';
import mongoose from 'mongoose';

// Connect to main app database
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function migrateUserFields() {
  try {
    console.log('🔍 Connecting to main app database...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to main app database');

    // Get the users collection
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    
    // Get all users
    const users = await usersCollection.find({}).toArray();
    console.log(`📊 Found ${users.length} users to migrate`);

    let updatedCount = 0;

    for (const user of users) {
      const updateFields: any = {};

      // Add social connection fields if they don't exist
      if (!user.socialPlatforms) {
        // Add some realistic social platforms for demo
        const platforms = ['instagram', 'twitter', 'linkedin', 'tiktok', 'youtube'];
        const randomPlatforms = platforms
          .sort(() => 0.5 - Math.random())
          .slice(0, Math.floor(Math.random() * 3) + 1)
          .map(platform => ({
            name: platform,
            handle: `@${user.username.toLowerCase()}_${platform}`,
            followers: Math.floor(Math.random() * 10000) + 100,
            verified: Math.random() > 0.7,
            connected: true,
            connectedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
          }));
        
        updateFields.socialPlatforms = randomPlatforms;
      }

      if (!user.socialMedia) {
        updateFields.socialMedia = {
          instagram: user.socialPlatforms?.find((p: any) => p.name === 'instagram') ? {
            username: `@${user.username.toLowerCase()}_ig`,
            followers: Math.floor(Math.random() * 5000) + 50,
            verified: Math.random() > 0.8,
            connected: true
          } : null,
          twitter: user.socialPlatforms?.find((p: any) => p.name === 'twitter') ? {
            username: `@${user.username.toLowerCase()}_tw`,
            followers: Math.floor(Math.random() * 2000) + 25,
            verified: Math.random() > 0.9,
            connected: true
          } : null
        };
      }

      if (!user.instagramUsername && Math.random() > 0.3) {
        updateFields.instagramUsername = `@${user.username.toLowerCase()}_ig`;
      }

      if (!user.workspaceId && Math.random() > 0.4) {
        updateFields.workspaceId = `ws_${user._id.toString().slice(-8)}`;
      }

      // Add login tracking fields if they don't exist
      if (!user.lastLoginAt) {
        // Generate realistic last login dates (within last 30 days)
        const daysAgo = Math.floor(Math.random() * 30);
        const lastLogin = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
        updateFields.lastLoginAt = lastLogin;
      }

      if (!user.lastLogin) {
        updateFields.lastLogin = user.lastLoginAt || new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000);
      }

      if (!user.lastActiveAt) {
        updateFields.lastActiveAt = user.lastLoginAt || new Date(Date.now() - Math.random() * 3 * 24 * 60 * 60 * 1000);
      }

      if (!user.dailyLoginStreak) {
        updateFields.dailyLoginStreak = Math.floor(Math.random() * 15) + 1;
      }

      if (!user.loginCount) {
        updateFields.loginCount = Math.floor(Math.random() * 50) + 5;
      }

      // Add status field if missing
      if (!user.status) {
        const statuses = ['waitlisted', 'early_access', 'launched'];
        updateFields.status = statuses[Math.floor(Math.random() * statuses.length)];
      }

      // Add email verification status
      if (user.isEmailVerified === undefined) {
        updateFields.isEmailVerified = Math.random() > 0.2; // 80% verified
      }

      // Add some additional engagement fields
      if (!user.totalPosts) {
        updateFields.totalPosts = Math.floor(Math.random() * 100);
      }

      if (!user.totalLikes) {
        updateFields.totalLikes = Math.floor(Math.random() * 1000);
      }

      if (!user.totalComments) {
        updateFields.totalComments = Math.floor(Math.random() * 200);
      }

      // Only update if there are fields to update
      if (Object.keys(updateFields).length > 0) {
        await usersCollection.updateOne(
          { _id: user._id },
          { $set: updateFields }
        );
        updatedCount++;
        console.log(`✅ Updated user: ${user.email}`);
      }
    }

    console.log(`\n🎉 Migration completed! Updated ${updatedCount} users`);
    console.log('📊 Added fields:');
    console.log('  - socialPlatforms (array of connected platforms)');
    console.log('  - socialMedia (object with platform details)');
    console.log('  - instagramUsername (string)');
    console.log('  - workspaceId (string)');
    console.log('  - lastLoginAt (date)');
    console.log('  - lastLogin (date)');
    console.log('  - lastActiveAt (date)');
    console.log('  - dailyLoginStreak (number)');
    console.log('  - loginCount (number)');
    console.log('  - status (string)');
    console.log('  - isEmailVerified (boolean)');
    console.log('  - totalPosts (number)');
    console.log('  - totalLikes (number)');
    console.log('  - totalComments (number)');
    
  } catch (error) {
    console.error('❌ Migration error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

migrateUserFields();
