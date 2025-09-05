import mongoose from 'mongoose';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function testVeeforedbConnection() {
  try {
    console.log('🔍 Connecting to veeforedb database...');
    
    // Connect to veeforedb database explicitly
    const connection = await mongoose.createConnection(MONGODB_URI, {
      dbName: 'veeforedb'
    });
    
    console.log('✅ Connected to veeforedb database');

    // Get the users collection
    const db = connection.useDb('veeforedb');
    const usersCollection = db.collection('users');
    
    // Count total users
    const totalUsers = await usersCollection.countDocuments();
    console.log(`📊 Total users in veeforedb: ${totalUsers}`);
    
    // Get a sample of users
    const sampleUsers = await usersCollection.find({}).limit(3).toArray();
    console.log('\n📋 Sample users:');
    sampleUsers.forEach((user, index) => {
      console.log(`${index + 1}. Email: ${user.email}, Username: ${user.username}, Plan: ${user.plan || 'N/A'}`);
    });

  } catch (error) {
    console.error('❌ Error testing veeforedb connection:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

testVeeforedbConnection();
