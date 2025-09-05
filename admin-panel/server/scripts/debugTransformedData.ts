import 'dotenv/config';
import mongoose from 'mongoose';

// Connect to main app database
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function debugTransformedData() {
  try {
    console.log('🔍 Connecting to main app database...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to main app database');

    // Get the users collection
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    
    // Get a sample user
    const user = await usersCollection.findOne({});
    
    if (user) {
      console.log('\n📊 Raw User Data:');
      console.log('==================');
      console.log('Email:', user.email);
      console.log('Social Platforms:', JSON.stringify(user.socialPlatforms, null, 2));
      console.log('Social Media:', JSON.stringify(user.socialMedia, null, 2));
      console.log('Instagram Username:', user.instagramUsername);
      console.log('Workspace ID:', user.workspaceId);
      console.log('Last Login At:', user.lastLoginAt);
      console.log('Last Login:', user.lastLogin);
      console.log('Last Active At:', user.lastActiveAt);
      console.log('Daily Login Streak:', user.dailyLoginStreak);
      console.log('Login Count:', user.loginCount);
      console.log('Status:', user.status);
      console.log('Is Email Verified:', user.isEmailVerified);
      
      // Now simulate the transformation logic
      console.log('\n🔄 Transformation Logic:');
      console.log('========================');
      
      // Count social connections
      let socialConnections = 0;
      
      if (user.socialPlatforms && Array.isArray(user.socialPlatforms)) {
        const connectedPlatforms = user.socialPlatforms.filter((platform: any) => platform.connected);
        console.log('Connected Platforms:', connectedPlatforms.length);
        socialConnections += connectedPlatforms.length;
      }
      
      if (user.instagramUsername) {
        console.log('Has Instagram Username: +1');
        socialConnections += 1;
      }
      
      if (user.workspaceId) {
        console.log('Has Workspace ID: +1');
        socialConnections += 1;
      }
      
      if (user.socialMedia) {
        const socialMediaKeys = Object.keys(user.socialMedia).filter(key => 
          user.socialMedia[key] !== null && user.socialMedia[key].connected
        );
        console.log('Connected Social Media:', socialMediaKeys.length);
        socialConnections += socialMediaKeys.length;
      }
      
      console.log('Total Social Connections:', socialConnections);
      
      // Check last login
      const lastLogin = user.lastLoginAt || user.lastLogin || user.lastActiveAt;
      console.log('Last Login Date:', lastLogin);
      console.log('Last Login Formatted:', lastLogin ? new Date(lastLogin).toLocaleDateString() : 'Never');
      
      // Check engagement score
      const dailyLoginStreak = user.dailyLoginStreak || 0;
      const isEmailVerified = user.isEmailVerified || false;
      const credits = user.credits || 0;
      const lastLoginAt = user.lastLoginAt;
      
      const engagementScore = Math.min(
        (dailyLoginStreak * 10) + 
        (isEmailVerified ? 20 : 0) + 
        (credits > 0 ? 15 : 0) + 
        (lastLoginAt ? 25 : 0) +
        (user.updatedAt && user.updatedAt !== user.createdAt ? 10 : 0) +
        (user.isOnboarded ? 15 : 0) +
        (socialConnections * 5) +
        (user.totalPosts ? Math.min(user.totalPosts * 2, 20) : 0) +
        (user.totalLikes ? Math.min(user.totalLikes / 10, 15) : 0),
        100
      );
      
      console.log('Engagement Score:', engagementScore);
      
    } else {
      console.log('❌ No users found');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

debugTransformedData();
