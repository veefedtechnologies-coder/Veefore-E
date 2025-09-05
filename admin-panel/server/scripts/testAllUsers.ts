import mongoose from 'mongoose';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function testAllUsers() {
  try {
    console.log('🔍 Testing direct connection to veeforedb...');
    
    // Connect directly to veeforedb
    await mongoose.connect(MONGODB_URI, {
      dbName: 'veeforedb'
    });
    
    console.log('✅ Connected to veeforedb database');
    
    // Get the users collection directly
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    
    // Count all users
    const totalUsers = await usersCollection.countDocuments();
    console.log(`📊 Total users in veeforedb: ${totalUsers}`);
    
    // Get all users (first 10)
    const allUsers = await usersCollection.find({}).limit(10).toArray();
    console.log(`\n📋 First 10 users:`);
    allUsers.forEach((user, index) => {
      console.log(`${index + 1}. Email: ${user.email}, Username: ${user.username}, Plan: ${user.plan || 'N/A'}`);
    });
    
    // Test the admin panel's User model
    console.log('\n🔍 Testing admin panel User model...');
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }), 'users');
    const adminPanelUsers = await User.find({}).limit(10).lean();
    console.log(`📊 Admin panel User model found: ${adminPanelUsers.length} users`);
    
    if (adminPanelUsers.length > 0) {
      console.log('📋 First user from admin panel model:');
      console.log(JSON.stringify(adminPanelUsers[0], null, 2));
    }

  } catch (error) {
    console.error('❌ Error testing users:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

testAllUsers();
