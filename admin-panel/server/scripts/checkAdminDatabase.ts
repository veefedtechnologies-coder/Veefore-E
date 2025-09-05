import 'dotenv/config';
import mongoose from 'mongoose';

// Connect to admin database
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function checkAdminDatabase() {
  try {
    console.log('🔍 Connecting to admin database...');
    await mongoose.connect(MONGODB_URI, { dbName: 'veefore-admin' });
    console.log('✅ Connected to admin database (veefore-admin)');

    // Get the database
    const db = mongoose.connection.db;
    
    // List all collections
    const collections = await db.listCollections().toArray();
    console.log('\n📊 Collections in veefore-admin:');
    console.log('================================');
    
    for (const collection of collections) {
      console.log(`- ${collection.name}`);
      
      // Get count for each collection
      const count = await db.collection(collection.name).countDocuments();
      console.log(`  Count: ${count} documents`);
      
      // If it's a users collection, show samples
      if (collection.name.toLowerCase().includes('user')) {
        const samples = await db.collection(collection.name).find({}).limit(5).toArray();
        console.log(`  Sample emails:`);
        samples.forEach((sample, index) => {
          console.log(`    ${index + 1}. ${sample.email}`);
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

checkAdminDatabase();
