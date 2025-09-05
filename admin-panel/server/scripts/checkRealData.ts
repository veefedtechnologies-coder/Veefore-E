import 'dotenv/config';
import mongoose from 'mongoose';

// Connect to veeforedb database
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function checkRealData() {
  try {
    console.log('🔍 Connecting to veeforedb database...');
    await mongoose.connect(MONGODB_URI, { dbName: 'veeforedb' });
    console.log('✅ Connected to veeforedb database');

    // Get the users collection directly
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    
    // Get a few users to see what fields are available
    const users = await usersCollection.find({}).limit(3).toArray();
    
    console.log(`\n📊 Found ${users.length} users in veeforedb:`);
    
    users.forEach((user, index) => {
      console.log(`\n--- User ${index + 1} ---`);
      console.log('Email:', user.email);
      console.log('Username:', user.username);
      console.log('Display Name:', user.displayName);
      console.log('Plan:', user.plan);
      console.log('Status:', user.status);
      console.log('Credits:', user.credits);
      console.log('Created At:', user.createdAt);
      console.log('Updated At:', user.updatedAt);
      
      // Check for social fields
      console.log('Social Platforms:', user.socialPlatforms ? user.socialPlatforms.length : 'Not found');
      console.log('Last Login At:', user.lastLoginAt || 'Not found');
      console.log('Last Login:', user.lastLogin || 'Not found');
      console.log('Daily Login Streak:', user.dailyLoginStreak || 'Not found');
      console.log('Login Count:', user.loginCount || 'Not found');
      console.log('Instagram Username:', user.instagramUsername || 'Not found');
      console.log('Workspace ID:', user.workspaceId || 'Not found');
      
      // Show all available fields
      console.log('\nAll available fields:');
      Object.keys(user).forEach(key => {
        if (key !== '_id' && key !== '__v') {
          console.log(`  ${key}: ${typeof user[key]} = ${JSON.stringify(user[key]).substring(0, 100)}...`);
        }
      });
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

checkRealData();
