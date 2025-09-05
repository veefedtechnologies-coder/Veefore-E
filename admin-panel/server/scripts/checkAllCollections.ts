import mongoose from 'mongoose';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function checkAllCollections() {
  try {
    console.log('🔍 Checking all collections in veeforedb database...');
    
    // Connect to veeforedb
    await mongoose.connect(MONGODB_URI, {
      dbName: 'veeforedb'
    });
    
    console.log('✅ Connected to veeforedb database');
    
    const db = mongoose.connection.db;
    
    // List all collections
    const collections = await db.listCollections().toArray();
    console.log(`\n📊 Found ${collections.length} collections in veeforedb:`);
    
    collections.forEach((collection, index) => {
      console.log(`${index + 1}. ${collection.name}`);
    });
    
    // Check each collection for social media data
    for (const collection of collections) {
      console.log(`\n🔍 Checking collection: ${collection.name}`);
      
      try {
        const count = await db.collection(collection.name).countDocuments();
        console.log(`  📊 Document count: ${count}`);
        
        if (count > 0) {
          // Get a sample document to see its structure
          const sampleDoc = await db.collection(collection.name).findOne();
          if (sampleDoc) {
            console.log(`  📋 Sample document keys: ${Object.keys(sampleDoc).join(', ')}`);
            
            // Check if this collection has social media related fields
            const socialFields = ['instagram', 'social', 'followers', 'username', 'rahulc1020'];
            const hasSocialData = socialFields.some(field => 
              JSON.stringify(sampleDoc).toLowerCase().includes(field.toLowerCase())
            );
            
            if (hasSocialData) {
              console.log(`  🎯 This collection likely contains social media data!`);
              
              // Search for rahulc1020 in this collection
              const rahulData = await db.collection(collection.name).find({
                $or: [
                  { instagramUsername: /rahulc1020/i },
                  { username: /rahulc1020/i },
                  { instagram: /rahulc1020/i },
                  { social: /rahulc1020/i }
                ]
              }).limit(3).toArray();
              
              if (rahulData.length > 0) {
                console.log(`  ✅ Found rahulc1020 data in ${collection.name}:`);
                rahulData.forEach((doc, index) => {
                  console.log(`    ${index + 1}. ${JSON.stringify(doc, null, 2)}`);
                });
              }
              
              // Search for users with 4 followers
              const fourFollowersData = await db.collection(collection.name).find({
                $or: [
                  { instagramFollowers: 4 },
                  { followers: 4 },
                  { 'instagram.followers': 4 },
                  { 'social.followers': 4 }
                ]
              }).limit(3).toArray();
              
              if (fourFollowersData.length > 0) {
                console.log(`  ✅ Found users with 4 followers in ${collection.name}:`);
                fourFollowersData.forEach((doc, index) => {
                  console.log(`    ${index + 1}. ${JSON.stringify(doc, null, 2)}`);
                });
              }
            }
          }
        }
      } catch (error) {
        console.log(`  ❌ Error checking ${collection.name}: ${error.message}`);
      }
    }
    
    // Specifically check social media related collections
    console.log('\n🔍 Checking social media related collections specifically...');
    
    const socialCollections = ['socialaccounts', 'instagramaccounts', 'social_accounts', 'instagram_accounts', 'socialmedia', 'social_media'];
    
    for (const collectionName of socialCollections) {
      try {
        const exists = await db.collection(collectionName).countDocuments();
        if (exists > 0) {
          console.log(`\n📱 Found ${collectionName} collection with ${exists} documents`);
          
          // Get sample documents
          const samples = await db.collection(collectionName).find({}).limit(3).toArray();
          samples.forEach((doc, index) => {
            console.log(`  Sample ${index + 1}:`, JSON.stringify(doc, null, 2));
          });
          
          // Search for rahulc1020
          const rahulData = await db.collection(collectionName).find({
            $or: [
              { instagramUsername: /rahulc1020/i },
              { username: /rahulc1020/i },
              { instagram: /rahulc1020/i },
              { social: /rahulc1020/i }
            ]
          }).limit(3).toArray();
          
          if (rahulData.length > 0) {
            console.log(`  🎯 Found rahulc1020 in ${collectionName}:`);
            rahulData.forEach((doc, index) => {
              console.log(`    ${index + 1}. ${JSON.stringify(doc, null, 2)}`);
            });
          }
        }
      } catch (error) {
        // Collection doesn't exist, continue
      }
    }

  } catch (error) {
    console.error('❌ Error checking collections:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

checkAllCollections();
