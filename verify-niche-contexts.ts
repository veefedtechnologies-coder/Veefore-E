import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 
  'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/';

async function verifyNicheContexts() {
  try {
    await mongoose.connect(MONGODB_URI, { dbName: 'veeforedb' });
    const db = mongoose.connection.db;
    
    if (!db) {
      throw new Error('Database connection failed');
    }
    
    const niches = await db.collection('nichecontexts').find({}).toArray();
    
    console.log('\n📊 Niche Contexts in Database:\n');
    console.log(`Total niches: ${niches.length}\n`);
    
    for (const niche of niches) {
      console.log(`✓ ${niche.niche}:`);
      console.log(`  - ${niche.vocabulary?.length || 0} vocabulary terms`);
      console.log(`  - ${niche.slangTerms ? Object.keys(niche.slangTerms).length : 0} slang terms`);
      console.log(`  - ${niche.trendingTopics?.length || 0} trending topics`);
      console.log(`  - ${niche.trendingHashtags?.length || 0} hashtags`);
      console.log(`  - ${niche.typicalEmojis?.length || 0} typical emojis`);
      console.log(`  - Tone: ${niche.toneGuidelines?.substring(0, 60)}...\n`);
    }
    
    await mongoose.disconnect();
    console.log('✅ Verification complete!\n');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

verifyNicheContexts();
