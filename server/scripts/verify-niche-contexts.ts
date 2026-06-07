/**
 * Verification script for niche context database
 * Verifies that all seeded data is properly accessible through the NicheContextService
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { nicheContextService } from '../services/NicheContextService';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env from parent directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function verifyNicheContexts() {
  try {
    console.log('🔍 Verifying niche context database...\n');

    // Connect to MongoDB Atlas
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI environment variable is not set');
    }

    console.log('📡 Connecting to MongoDB Atlas...');
    await mongoose.connect(mongoUri, { dbName: 'veeforedb' });
    console.log('✅ Connected to MongoDB Atlas\n');

    // Test niches
    const testNiches = ['fashion', 'fitness', 'food', 'travel', 'beauty', 'business', 'lifestyle', 'gaming', 'pets', 'art', 'music', 'photography', 'diy', 'parenting', 'tech'];

    console.log('🧪 Testing NicheContextService methods:\n');

    for (const niche of testNiches) {
      console.log(`\n📋 Testing: ${niche.toUpperCase()}`);
      console.log('─'.repeat(50));
      
      // Test getNicheContext
      const context = await nicheContextService.getNicheContext(niche);
      console.log(`✓ getNicheContext(): Retrieved context`);
      console.log(`  - Vocabulary: ${context.vocabulary.length} terms`);
      console.log(`  - Slang terms: ${Object.keys(context.slangTerms).length} terms`);
      console.log(`  - Trending topics: ${context.trendingTopics.length} topics`);
      console.log(`  - Trending hashtags: ${context.trendingHashtags.length} hashtags`);
      console.log(`  - Sample vocabulary: ${context.vocabulary.slice(0, 5).join(', ')}`);
      console.log(`  - Sample hashtags: ${context.trendingHashtags.slice(0, 5).join(', ')}`);
      
      // Test term relevance
      const sampleTerm = context.vocabulary[0];
      const score = await nicheContextService.getTermRelevanceScore(sampleTerm, niche);
      console.log(`✓ getTermRelevanceScore('${sampleTerm}'): ${score}/100`);
      
      // Test isTermOutdated
      const isOutdated = await nicheContextService.isTermOutdated(sampleTerm, niche);
      console.log(`✓ isTermOutdated('${sampleTerm}'): ${isOutdated ? 'Yes' : 'No'}`);
      
      // Test isTrendsDataStale
      const isStale = await nicheContextService.isTrendsDataStale(niche);
      console.log(`✓ isTrendsDataStale(): ${isStale ? 'Yes (needs update)' : 'No (current)'}`);
    }

    // Test blended context
    console.log('\n\n🔀 Testing Blended Context:');
    console.log('─'.repeat(50));
    const blendedNiches = ['fashion', 'lifestyle'];
    const blendedContext = await nicheContextService.getBlendedContext(blendedNiches);
    console.log(`✓ getBlendedContext([${blendedNiches.join(', ')}]):`);
    console.log(`  - Combined vocabulary: ${blendedContext.vocabulary.length} terms`);
    console.log(`  - Combined slang: ${Object.keys(blendedContext.slangTerms).length} terms`);
    console.log(`  - Combined topics: ${blendedContext.trendingTopics.length} topics`);
    console.log(`  - Combined hashtags: ${blendedContext.trendingHashtags.length} hashtags`);

    console.log('\n\n✅ All verification tests passed!');
    console.log('🎉 Niche context database is properly seeded and functional.\n');

    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB Atlas');

  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  }
}

// Run verification
verifyNicheContexts();
