import 'dotenv/config';
import mongoose from 'mongoose';

// Connect to main app database
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function checkCollections() {
  try {
    console.log('🔍 Connecting to main app database...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to main app database');

    // Get the database
    const db = mongoose.connection.db;
    
    // List all collections
    const collections = await db.listCollections().toArray();
    console.log('\n📊 Collections in veeforedb:');
    console.log('============================');
    
    for (const collection of collections) {
      console.log(`- ${collection.name}`);
      
      // Get count for each collection
      const count = await db.collection(collection.name).countDocuments();
      console.log(`  Count: ${count} documents`);
      
      // If it's a users collection, show a sample
      if (collection.name.toLowerCase().includes('user')) {
        const sample = await db.collection(collection.name).findOne({});
        if (sample) {
          console.log(`  Sample email: ${sample.email}`);
          console.log(`  Sample social platforms: ${sample.socialPlatforms ? 'Yes' : 'No'}`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

checkCollections();
