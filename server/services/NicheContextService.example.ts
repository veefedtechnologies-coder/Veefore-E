/**
 * Example usage of NicheContextService
 * 
 * This file demonstrates how the NicheContextService should be used
 * in the caption generation workflow.
 */

import { nicheContextService } from './NicheContextService';

/**
 * Example 1: Get single niche context
 */
async function exampleGetSingleNiche() {
  console.log('=== Example 1: Get Single Niche Context ===\n');
  
  const fitnessContext = await nicheContextService.getNicheContext('fitness');
  
  console.log('Niche:', fitnessContext.niche);
  console.log('Vocabulary sample:', fitnessContext.vocabulary.slice(0, 5));
  console.log('Slang terms:', Object.keys(fitnessContext.slangTerms).slice(0, 3));
  console.log('Trending topics:', fitnessContext.trendingTopics.slice(0, 3));
  console.log('Typical emojis:', fitnessContext.typicalEmojis);
  console.log('Tone guidelines:', fitnessContext.toneGuidelines);
  console.log('\n');
}

/**
 * Example 2: Get blended context for multi-niche content
 */
async function exampleGetBlendedContext() {
  console.log('=== Example 2: Get Blended Context ===\n');
  
  // For a post about healthy meal prep for athletes
  const blendedContext = await nicheContextService.getBlendedContext([
    'fitness',
    'food',
    'lifestyle'
  ]);
  
  console.log('Blended niches:', blendedContext.niche);
  console.log('Combined vocabulary size:', blendedContext.vocabulary.length);
  console.log('Combined slang terms:', Object.keys(blendedContext.slangTerms).length);
  console.log('Sample vocabulary:', blendedContext.vocabulary.slice(0, 10));
  console.log('Trending hashtags:', blendedContext.trendingHashtags.slice(0, 5));
  console.log('\n');
}

/**
 * Example 3: Check if term is outdated
 */
async function exampleCheckOutdatedTerm() {
  console.log('=== Example 3: Check Outdated Terms ===\n');
  
  const currentTerm = 'gains';
  const outdatedTerm = 'rad'; // 1980s slang
  
  const isCurrentOutdated = await nicheContextService.isTermOutdated(
    currentTerm,
    'fitness'
  );
  const isRadOutdated = await nicheContextService.isTermOutdated(
    outdatedTerm,
    'fitness'
  );
  
  console.log(`"${currentTerm}" is outdated:`, isCurrentOutdated);
  console.log(`"${outdatedTerm}" is outdated:`, isRadOutdated);
  console.log('\n');
}

/**
 * Example 4: Update trends (would be called periodically)
 */
async function exampleUpdateTrends() {
  console.log('=== Example 4: Update Trends ===\n');
  
  console.log('Updating trends for fitness niche...');
  await nicheContextService.updateTrends('fitness');
  console.log('Trends updated successfully!');
  console.log('Cache invalidated, next getNicheContext() will fetch fresh data.\n');
}

/**
 * Example 5: Usage in caption generation workflow
 */
async function exampleCaptionGenerationWorkflow() {
  console.log('=== Example 5: Caption Generation Workflow ===\n');
  
  // Step 1: Determine user's content niche
  const userNiche = 'fitness';
  const postType = 'post';
  
  // Step 2: Get niche context
  const context = await nicheContextService.getNicheContext(userNiche);
  
  // Step 3: Build prompt components from context
  const promptComponents = {
    nicheVocabulary: context.vocabulary.slice(0, 20).join(', '),
    slangToUse: Object.entries(context.slangTerms)
      .slice(0, 5)
      .map(([term, meaning]) => `"${term}" (${meaning})`)
      .join(', '),
    trendingTopics: context.trendingTopics.slice(0, 5).join(', '),
    trendingHashtags: context.trendingHashtags.slice(0, 10).join(', '),
    typicalEmojis: context.typicalEmojis.join(' '),
    toneGuidelines: context.toneGuidelines
  };
  
  console.log('Prompt Components for AI Generation:');
  console.log('-------------------------------------');
  console.log('Niche Vocabulary:', promptComponents.nicheVocabulary);
  console.log('Slang to Use:', promptComponents.slangToUse);
  console.log('Trending Topics:', promptComponents.trendingTopics);
  console.log('Trending Hashtags:', promptComponents.trendingHashtags);
  console.log('Typical Emojis:', promptComponents.typicalEmojis);
  console.log('Tone Guidelines:', promptComponents.toneGuidelines);
  console.log('\n');
  
  // Step 4: These components would be injected into the AI prompt
  const aiPromptLayer = `
NICHE-SPECIFIC LANGUAGE (${userNiche}):

Current trending topics:
${context.trendingTopics.slice(0, 5).join(', ')}

Niche vocabulary to use naturally:
${context.vocabulary.slice(0, 20).join(', ')}

Current slang/phrases:
${Object.entries(context.slangTerms).slice(0, 5)
  .map(([term, meaning]) => `"${term}" (${meaning})`).join(', ')}

Typical emojis: ${context.typicalEmojis.join(' ')}

Tone guidelines: ${context.toneGuidelines}
`;
  
  console.log('AI Prompt Layer:');
  console.log(aiPromptLayer);
}

/**
 * Example 6: Caching demonstration
 */
async function exampleCachingBehavior() {
  console.log('=== Example 6: Caching Behavior ===\n');
  
  console.log('First call (cache miss) - fetches from database:');
  const start1 = Date.now();
  await nicheContextService.getNicheContext('tech');
  const time1 = Date.now() - start1;
  console.log(`Time taken: ${time1}ms\n`);
  
  console.log('Second call (cache hit) - returns from memory:');
  const start2 = Date.now();
  await nicheContextService.getNicheContext('tech');
  const time2 = Date.now() - start2;
  console.log(`Time taken: ${time2}ms\n`);
  
  console.log(`Cache speedup: ${(time1 / time2).toFixed(2)}x faster`);
}

// Run examples
async function runAllExamples() {
  try {
    await exampleGetSingleNiche();
    await exampleGetBlendedContext();
    await exampleCheckOutdatedTerm();
    await exampleUpdateTrends();
    await exampleCaptionGenerationWorkflow();
    await exampleCachingBehavior();
    
    console.log('All examples completed successfully!');
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

// Uncomment to run examples
// runAllExamples();

export {
  exampleGetSingleNiche,
  exampleGetBlendedContext,
  exampleCheckOutdatedTerm,
  exampleUpdateTrends,
  exampleCaptionGenerationWorkflow,
  exampleCachingBehavior
};
