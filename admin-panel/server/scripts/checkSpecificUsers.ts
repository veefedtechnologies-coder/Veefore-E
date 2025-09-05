import 'dotenv/config';
import mongoose from 'mongoose';

// Connect to main app database
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function checkSpecificUsers() {
  try {
    console.log('🔍 Connecting to main app database...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to main app database');

    // Get the users collection
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    
    // Check specific users that are showing in admin panel
    const specificEmails = ['dcfe@ded.de', 'rgrg@ff.f', 'sdxsds@dfs.gf'];
    
    for (const email of specificEmails) {
      const user = await usersCollection.findOne({ email });
      if (user) {
        console.log(`\n📊 User: ${email}`);
        console.log('==================');
        console.log('Social Platforms:', JSON.stringify(user.socialPlatforms, null, 2));
        console.log('Last Login At:', user.lastLoginAt);
        console.log('Last Login:', user.lastLogin);
        console.log('Last Active At:', user.lastActiveAt);
        console.log('Daily Login Streak:', user.dailyLoginStreak);
        console.log('Login Count:', user.loginCount);
        console.log('Status:', user.status);
        console.log('Instagram Username:', user.instagramUsername);
        console.log('Workspace ID:', user.workspaceId);
        console.log('Created At:', user.createdAt);
        console.log('Updated At:', user.updatedAt);
      } else {
        console.log(`❌ User not found: ${email}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

checkSpecificUsers();
