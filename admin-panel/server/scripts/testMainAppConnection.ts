import 'dotenv/config';
import { connectToMainApp } from '../services/userDataService';

async function testMainAppConnection() {
  try {
    console.log('🔍 Testing main app connection...');
    
    const connection = await connectToMainApp();
    console.log('✅ Connected to main app');
    
    // Get the User model
    const User = connection.model('User', new (require('mongoose').Schema)({
      email: String,
      username: String,
      displayName: String,
      socialPlatforms: Array,
      lastLoginAt: Date,
      lastLogin: Date,
      lastActiveAt: Date,
      dailyLoginStreak: Number,
      loginCount: Number,
      status: String,
      instagramUsername: String,
      workspaceId: String,
      createdAt: Date,
      updatedAt: Date
    }));
    
    // Get a few users
    const users = await User.find({}).limit(3).lean();
    console.log(`\n📊 Found ${users.length} users in main app:`);
    
    users.forEach((user, index) => {
      console.log(`\n--- User ${index + 1} ---`);
      console.log('Email:', user.email);
      console.log('Username:', user.username);
      console.log('Social Platforms:', user.socialPlatforms ? user.socialPlatforms.length : 0);
      console.log('Last Login At:', user.lastLoginAt);
      console.log('Last Login:', user.lastLogin);
      console.log('Last Active At:', user.lastActiveAt);
      console.log('Daily Login Streak:', user.dailyLoginStreak);
      console.log('Login Count:', user.loginCount);
      console.log('Status:', user.status);
      console.log('Instagram Username:', user.instagramUsername);
      console.log('Workspace ID:', user.workspaceId);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

testMainAppConnection();
