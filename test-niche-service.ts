/**
 * Test NicheContextService with seeded data
 */
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 
  'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/';

async function testNicheContextService() {
  try {
    console.log('🧪 Testing Niche Context Data...\n');
    
    await mongoose.connect(MONGODB_URI, { 
      dbName: 'veeforedb',
      serverSelectionTimeoutMS: 30000 
    });
    console.log('✅ Connected to MongoDB\n');
    
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection failed');

    // Test 1: Verify all niches are seeded
    console.log('Test 1: Verify all niches are seeded');
    const count = await db.collection('nichecontexts').countDocuments();
    console.log(`✓ Found ${count} niche contexts\n`);

    // Test 2: Check fitness niche structure
    console.log('Test 2: Verify fitness niche data structure');
    const fitness = await db.collection('nichecontexts').findOne({ niche: 'fitness' });
    if (!fitness) throw new Error('Fitness niche not found');
    
    console.log(`✓ Fitness niche:`);
    console.log(`  - ${fitness.vocabulary?.length || 0} vocabulary terms`);
    console.log(`  - Sample vocab: ${fitness.vocabulary?.slice(0, 5).join(', ')}`);
    console.log(`  - ${Object.keys(fitness.slangTerms || {}).length} slang terms`);
    console.log(`  - Sample slang: gains = "${fitness.slangTerms?.gains}"`);
    console.log(`  - ${fitness.trendingTopics?.length || 0} trending topics`);
    console.log(`  - ${fitness.trendingHashtags?.length || 0} hashtags`);
    console.log(`  - ${fitness.typicalEmojis?.length || 0} emojis: ${fitness.typicalEmojis?.join(' ')}`);
    console.log(`  - Tone: ${fitness.toneGuidelines?.substring(0, 80)}...\n`);

    // Test 3: Verify engagement triggers (extended data)
    console.log('Test 3: Check niche-specific data quality');
    const business = await db.collection('nichecontexts').findOne({ niche: 'business' });
    if (business) {
      console.log(`✓ Business niche has ${business.trendingHashtags?.length} hashtags`);
      console.log(`  Sample: ${business.trendingHashtags?.slice(0, 3).join(', ')}\n`);
    }

    // Test 4: Verify all niches have required fields
    console.log('Test 4: Verify data completeness');
    const allNiches = await db.collection('nichecontexts').find({}).toArray();
    let allValid = true;
    
    for (const niche of allNiches) {
      const hasRequired = 
        niche.vocabulary && niche.vocabulary.length > 0 &&
        niche.slangTerms && Object.keys(niche.slangTerms).length > 0 &&
        niche.trendingTopics && niche.trendingTopics.length > 0 &&
        niche.trendingHashtags && niche.trendingHashtags.length > 0 &&
        niche.typicalEmojis && niche.typicalEmojis.length > 0 &&
        niche.toneGuidelines && niche.toneGuidelines.length > 0;
      
      if (!hasRequired) {
        console.log(`  ❌ ${niche.niche} is missing required fields`);
        allValid = false;
      } else {
        console.log(`  ✓ ${niche.niche} has all required fields`);
      }
    }
    
    if (!allValid) throw new Error('Some niches are missing required data');

    await mongoose.disconnect();
    console.log('\n✅ All tests passed! Niche context database is properly seeded.\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testNicheContextService();
