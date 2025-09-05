import mongoose from 'mongoose';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function checkDefaultDatabase() {
  try {
    console.log('🔍 Connecting to default database (not veeforedb)...');
    
    // Connect to the default database (no dbName specified)
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to default database');

    // List all collections in the default database
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('\n📊 Collections in default database:');
    console.log('============================');
    
    for (const collection of collections) {
      const collectionName = collection.name;
      const count = await mongoose.connection.db.collection(collectionName).countDocuments();
      
      console.log(`- ${collectionName}`);
      console.log(`  Count: ${count} documents`);
      
      // If it's a users collection, get a sample
      if (collectionName.toLowerCase().includes('user')) {
        const sample = await mongoose.connection.db.collection(collectionName).findOne({});
        if (sample) {
          console.log(`  Sample email: ${sample.email || 'No email field'}`);
          console.log(`  Sample social platforms: ${sample.socialPlatforms ? 'Yes' : 'No'}`);
        }
      }
    }

  } catch (error) {
    console.error('❌ Error checking default database:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

checkDefaultDatabase();
