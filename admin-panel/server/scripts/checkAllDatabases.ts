import mongoose from 'mongoose';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function checkAllDatabases() {
  try {
    console.log('🔍 Checking all databases for real user data...');
    
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    
    console.log('✅ Connected to MongoDB');
    
    const db = mongoose.connection.db;
    const admin = db.admin();
    
    // List all databases
    console.log('\n📊 Available databases:');
    const databases = await admin.listDatabases();
    databases.databases.forEach((dbInfo: any) => {
      console.log(`- ${dbInfo.name} (${(dbInfo.sizeOnDisk / 1024 / 1024).toFixed(2)} MB)`);
    });
    
    // Check each database for users
    for (const dbInfo of databases.databases) {
      if (dbInfo.name === 'admin' || dbInfo.name === 'local') continue;
      
      console.log(`\n🔍 Checking database: ${dbInfo.name}`);
      
      try {
        const dbConnection = mongoose.connection.useDb(dbInfo.name);
        const collections = await dbConnection.listCollections().toArray();
        
        // Check if there's a users collection
        const usersCollection = collections.find(c => c.name === 'users');
        if (usersCollection) {
          console.log(`  ✅ Found users collection in ${dbInfo.name}`);
          
          // Count users
          const userCount = await dbConnection.collection('users').countDocuments();
          console.log(`  📊 User count: ${userCount}`);
          
          // Check for real Instagram data
          const realInstagramUsers = await dbConnection.collection('users').find({
            $or: [
              { instagramUsername: /rahulc1020/i },
              { instagramFollowers: 4 },
              { instagramFollowers: { $lt: 10, $gt: 0 } }
            ]
          }).limit(3).toArray();
          
          if (realInstagramUsers.length > 0) {
            console.log(`  🎯 Found potential real users in ${dbInfo.name}:`);
            realInstagramUsers.forEach((user, index) => {
              console.log(`    ${index + 1}. ${user.email}`);
              console.log(`       Instagram: ${user.instagramUsername} (${user.instagramFollowers} followers)`);
            });
          }
        }
      } catch (error) {
        console.log(`  ❌ Error accessing ${dbInfo.name}:`, error.message);
      }
    }
    
    // Check the main app database (not veeforedb)
    console.log('\n🔍 Checking main app database (default)...');
    try {
      const mainDb = mongoose.connection.useDb('veefore');
      const mainCollections = await mainDb.listCollections().toArray();
      console.log('Collections in veefore database:', mainCollections.map(c => c.name));
      
      if (mainCollections.some(c => c.name === 'users')) {
        const mainUserCount = await mainDb.collection('users').countDocuments();
        console.log(`User count in veefore database: ${mainUserCount}`);
        
        // Check for real Instagram data
        const realUsers = await mainDb.collection('users').find({
          $or: [
            { instagramUsername: /rahulc1020/i },
            { instagramFollowers: 4 },
            { instagramFollowers: { $lt: 10, $gt: 0 } }
          ]
        }).limit(3).toArray();
        
        if (realUsers.length > 0) {
          console.log(`🎯 Found real users in veefore database:`);
          realUsers.forEach((user, index) => {
            console.log(`  ${index + 1}. ${user.email}`);
            console.log(`     Instagram: ${user.instagramUsername} (${user.instagramFollowers} followers)`);
          });
        }
      }
    } catch (error) {
      console.log('❌ Error accessing veefore database:', error.message);
    }

  } catch (error) {
    console.error('❌ Error checking databases:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

checkAllDatabases();