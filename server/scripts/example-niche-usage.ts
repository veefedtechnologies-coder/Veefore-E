/**
 * Example usage of seeded niche context data
 * Demonstrates how to retrieve and use niche-specific context for caption generation
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { nicheContextService } from '../services/NicheContextService';

dotenv.config();

async function demonstrateNicheUsage() {
  try {
    console.log('🎯 Demonstrating Niche Context Usage\n');

    // Connect to MongoDB Atlas
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI environment variable is not set');
    }

    await mongoose.connect(mongoUri, { dbName: 'veeforedb' });
    console.log('✅ Connected to MongoDB Atlas\n');

    // Example 1: Get context for a specific niche
    console.log('📋 Example 1: Getting Fashion Niche Context');
    console.log('─'.repeat(60));
    const fashionContext = await nicheContextService.getNicheContext('fashion');
    
    console.log('\n🎨 Fashion Vocabulary (sample):');
    console.log('   ' + fashionContext.vocabulary.slice(0, 10).join(', '));
    
    console.log('\n💬 Fashion Slang Terms (sample):');
    Object.entries(fashionContext.slangTerms).slice(0, 5).forEach(([term, meaning]) => {
      console.log(`   "${term}" - ${meaning}`);
    });
    
    console.log('\n📈 Trending Fashion Topics:');
    console.log('   ' + fashionContext.trendingTopics.slice(0, 5).join('\n   '));
    
    console.log('\n#️⃣ Top Fashion Hashtags:');
    console.log('   ' + fashionContext.trendingHashtags.slice(0, 10).join(' '));
    
    console.log('\n✨ Typical Fashion Emojis:');
    console.log('   ' + fashionContext.typicalEmojis.join(' '));
    
    console.log('\n📝 Tone Guidelines:');
    console.log('   ' + fashionContext.toneGuidelines);

    // Example 2: Blended context for multi-niche content
    console.log('\n\n📋 Example 2: Blended Context (Fashion + Lifestyle)');
    console.log('─'.repeat(60));
    const blendedContext = await nicheContextService.getBlendedContext(['fashion', 'lifestyle']);
    
    console.log('\n🔀 Blended Vocabulary (sample):');
    console.log('   ' + blendedContext.vocabulary.slice(0, 15).join(', '));
    
    console.log('\n🔀 Blended Hashtags (sample):');
    console.log('   ' + blendedContext.trendingHashtags.slice(0, 15).join(' '));

    // Example 3: Check term relevance
    console.log('\n\n📋 Example 3: Term Relevance Scoring');
    console.log('─'.repeat(60));
    
    const termsToCheck = [
      { term: 'outfit', niche: 'fashion' },
      { term: 'gains', niche: 'fitness' },
      { term: 'recipe', niche: 'food' },
      { term: 'wanderlust', niche: 'travel' }
    ];
    
    for (const { term, niche } of termsToCheck) {
      const score = await nicheContextService.getTermRelevanceScore(term, niche);
      const isOutdated = await nicheContextService.isTermOutdated(term, niche);
      console.log(`\n   "${term}" in ${niche}:`);
      console.log(`   Relevance: ${score}/100`);
      console.log(`   Status: ${isOutdated ? '⚠️ Outdated' : '✅ Current'}`);
    }

    // Example 4: Generate prompt context from niche data
    console.log('\n\n📋 Example 4: Building AI Prompt Context');
    console.log('─'.repeat(60));
    
    const fitnessContext = await nicheContextService.getNicheContext('fitness');
    
    console.log('\n📄 Sample Prompt Section for Fitness Caption:\n');
    console.log('```');
    console.log('NICHE-SPECIFIC LANGUAGE (fitness):');
    console.log('');
    console.log('Current trending topics:');
    console.log(fitnessContext.trendingTopics.slice(0, 5).join(', '));
    console.log('');
    console.log('Niche vocabulary to use naturally:');
    console.log(fitnessContext.vocabulary.slice(0, 15).join(', '));
    console.log('');
    console.log('Current slang/phrases:');
    Object.entries(fitnessContext.slangTerms).slice(0, 5).forEach(([term, meaning]) => {
      console.log(`"${term}" (${meaning})`);
    });
    console.log('');
    console.log('Typical emojis:', fitnessContext.typicalEmojis.join(' '));
    console.log('');
    console.log('Tone guidelines:', fitnessContext.toneGuidelines);
    console.log('```');

    // Example 5: Check if trends need updating
    console.log('\n\n📋 Example 5: Checking Trend Freshness');
    console.log('─'.repeat(60));
    
    const nichesToCheck = ['fashion', 'fitness', 'food', 'travel'];
    console.log('\n📊 Trend Status:');
    
    for (const niche of nichesToCheck) {
      const isStale = await nicheContextService.isTrendsDataStale(niche);
      console.log(`   ${niche.padEnd(10)} - ${isStale ? '⚠️ Needs Update' : '✅ Current'}`);
    }

    // Example 6: Practical caption generation use case
    console.log('\n\n📋 Example 6: Practical Caption Generation Flow');
    console.log('─'.repeat(60));
    
    console.log('\n🎯 Use Case: Generate fitness post caption');
    console.log('   1. Get fitness niche context');
    console.log('   2. Extract relevant vocabulary and slang');
    console.log('   3. Select trending topics and hashtags');
    console.log('   4. Build prompt with niche-specific language');
    console.log('   5. Generate authentic, on-brand caption');
    
    console.log('\n💡 Retrieved Context:');
    console.log(`   ✓ ${fitnessContext.vocabulary.length} vocabulary terms`);
    console.log(`   ✓ ${Object.keys(fitnessContext.slangTerms).length} slang terms`);
    console.log(`   ✓ ${fitnessContext.trendingTopics.length} trending topics`);
    console.log(`   ✓ ${fitnessContext.trendingHashtags.length} trending hashtags`);
    console.log(`   ✓ ${fitnessContext.trendingPhrases.length} trending phrases`);
    
    console.log('\n📝 Sample Caption Elements:');
    console.log(`   Hook: "${fitnessContext.trendingPhrases[0]}"`);
    console.log(`   Vocabulary: ${fitnessContext.vocabulary.slice(0, 3).join(', ')}`);
    console.log(`   Slang: "${Object.keys(fitnessContext.slangTerms)[0]}"`);
    console.log(`   Hashtags: ${fitnessContext.trendingHashtags.slice(0, 5).join(' ')}`);
    console.log(`   Emojis: ${fitnessContext.typicalEmojis.slice(0, 4).join(' ')}`);

    console.log('\n\n✅ Demonstration complete!');
    console.log('🎉 The seeded niche data is ready for caption generation.\n');

    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB Atlas');

  } catch (error) {
    console.error('❌ Error in demonstration:', error);
    process.exit(1);
  }
}

// Run demonstration
demonstrateNicheUsage();
