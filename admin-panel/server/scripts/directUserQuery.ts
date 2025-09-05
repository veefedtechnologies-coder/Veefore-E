import 'dotenv/config';
import mongoose from 'mongoose';

// Connect to main app database
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function directUserQuery() {
  try {
    console.log('🔍 Connecting to main app database...');
    await mongoose.connect(MONGODB_URI, { dbName: 'veeforedb' });
    console.log('✅ Connected to main app database');

    // Get the users collection directly
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    
    // Get users with pagination (same as admin panel)
    const users = await usersCollection
      .find({})
      .sort({ createdAt: -1 })
      .skip(0)
      .limit(3)
      .toArray();
    
    console.log(`\n📊 Found ${users.length} users (direct query):`);
    
    users.forEach((user, index) => {
      console.log(`\n--- User ${index + 1} ---`);
      console.log('Email:', user.email);
      console.log('Username:', user.username);
      console.log('Display Name:', user.displayName);
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
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

directUserQuery();
