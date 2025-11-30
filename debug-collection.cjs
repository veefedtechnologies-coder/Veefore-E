const { MongoClient } = require('mongodb');

async function debugCollections() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
  const client = new MongoClient(mongoUri);

  try {
    console.log('🔍 Debugging database collections...\n');
    
    await client.connect();
    const db = client.db('veeforedb');
    
    // List all collections
    const collections = await db.listCollections().toArray();
    console.log('📋 Available collections:');
    collections.forEach(col => {
      console.log(`  - ${col.name}`);
    });
    
    console.log('\n🔍 Checking instagramaccounts collection...');
    const instagramCollection = db.collection('instagramaccounts');
    const instagramCount = await instagramCollection.countDocuments();
    console.log(`Found ${instagramCount} documents in instagramaccounts`);
    
    if (instagramCount > 0) {
      const sample = await instagramCollection.findOne();
      console.log('\n📄 Sample document structure:');
      console.log(JSON.stringify(sample, null, 2));
    }
    
    console.log('\n🔍 Checking socialaccounts collection...');
    const socialCollection = db.collection('socialaccounts');
    const socialCount = await socialCollection.countDocuments();
    console.log(`Found ${socialCount} documents in socialaccounts`);
    
    if (socialCount > 0) {
      const sample = await socialCollection.findOne();
      console.log('\n📄 Sample document structure:');
      console.log(JSON.stringify(sample, null, 2));
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

debugCollections();