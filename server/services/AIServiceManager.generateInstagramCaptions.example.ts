/**
 * AIServiceManager.generateInstagramCaptions() - Usage Examples
 * 
 * This file demonstrates how to use the new generateInstagramCaptions method
 * implemented in Task 11.1 for generating authentic Instagram captions with
 * voice matching and viral patterns.
 * 
 * Requirements: 1.4, 2.3, 3.2, 7.3, 8.1, 8.2
 */

import { aiServiceManager } from './AIServiceManager';
import type { CaptionVariation } from './AIServiceManager';

/**
 * Example 1: Basic Usage
 * Generate 3 caption variations for a fitness post
 */
async function example1_BasicUsage() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Example 1: Basic Usage - Fitness Post');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const variations = await aiServiceManager.generateInstagramCaptions({
    userId: 'user-123',
    workspaceId: 'workspace-456',
    topic: 'Morning workout routine and healthy breakfast',
    preferences: {
      contentNiche: 'fitness',
      aiModel: 'veegpt-hybrid',
      creativityLevel: 0.7
    }
  });

  // Log all variations
  variations.forEach((variation: CaptionVariation, index: number) => {
    console.log(`\n📝 Variation ${index + 1}: ${variation.style.toUpperCase()}`);
    console.log(`Style: ${variation.styleDescription}`);
    console.log(`\nCaption:\n${variation.caption}\n`);
    console.log('─'.repeat(70));
  });
}

/**
 * Example 2: With Media Analysis
 * Generate captions based on image content analysis
 */
async function example2_WithMediaAnalysis() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Example 2: With Media Analysis - Travel Post');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const variations = await aiServiceManager.generateInstagramCaptions({
    userId: 'user-123',
    workspaceId: 'workspace-456',
    topic: 'Tropical paradise vacation',
    mediaAnalysis: 'Image shows a beautiful sunset over a beach with palm trees, crystal clear turquoise water, and a hammock in the foreground',
    postType: 'post',
    platform: 'Instagram',
    preferences: {
      contentNiche: 'travel',
      aiModel: 'veegpt-hybrid',
      creativityLevel: 0.8,
      aiPersona: 'Adventurous & Inspiring',
      captionStyle: 'Storytelling'
    }
  });

  console.log(`Generated ${variations.length} variations with media analysis integration\n`);
  variations.forEach((variation: CaptionVariation) => {
    console.log(`• ${variation.style}: ${variation.caption.substring(0, 80)}...`);
  });
}

/**
 * Example 3: Improving Existing Caption
 * Enhance a weak existing caption with better hooks and engagement
 */
async function example3_ImprovingExistingCaption() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Example 3: Improving Existing Caption - Food Post');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const existingCaption = 'Here is my new recipe. It tastes good. Try it!';
  console.log(`Original Caption: "${existingCaption}"\n`);

  const variations = await aiServiceManager.generateInstagramCaptions({
    userId: 'user-123',
    workspaceId: 'workspace-456',
    topic: 'Homemade chocolate chip cookies recipe',
    existingCaption,
    postType: 'post',
    preferences: {
      contentNiche: 'food',
      aiModel: 'veegpt-hybrid',
      creativityLevel: 0.7,
      aiPersona: 'Warm & Friendly',
      captionStyle: 'Conversational'
    }
  });

  console.log('Improved Variations:\n');
  variations.forEach((variation: CaptionVariation, index: number) => {
    console.log(`${index + 1}. [${variation.style}] ${variation.caption}\n`);
  });
}

/**
 * Example 4: Different Post Types
 * Generate captions optimized for Stories, Reels, and Feed Posts
 */
async function example4_DifferentPostTypes() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Example 4: Different Post Types - Fashion Content');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const postTypes: Array<'post' | 'story' | 'reel'> = ['story', 'reel', 'post'];

  for (const postType of postTypes) {
    console.log(`\n📱 ${postType.toUpperCase()} Caption:\n`);

    const variations = await aiServiceManager.generateInstagramCaptions({
      userId: 'user-123',
      workspaceId: 'workspace-456',
      topic: 'New fall fashion outfit',
      postType,
      preferences: {
        contentNiche: 'fashion',
        aiModel: 'veegpt-hybrid',
        creativityLevel: 0.7
      }
    });

    // Show just the balanced variation for each post type
    const balanced = variations.find(v => v.style === 'balanced');
    if (balanced) {
      console.log(balanced.caption);
    }
  }
}

/**
 * Example 5: Multiple Niches
 * Generate captions for different content niches
 */
async function example5_MultipleNiches() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Example 5: Multiple Niches Comparison');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const niches = ['fitness', 'food', 'travel', 'fashion', 'tech', 'business'];

  for (const niche of niches) {
    const variations = await aiServiceManager.generateInstagramCaptions({
      userId: 'user-123',
      workspaceId: 'workspace-456',
      topic: 'New product launch announcement',
      postType: 'post',
      preferences: {
        contentNiche: niche,
        aiModel: 'veegpt-hybrid',
        creativityLevel: 0.7
      }
    });

    // Show the viral variation for each niche
    const viral = variations.find(v => v.style === 'viral');
    if (viral) {
      console.log(`\n🎯 ${niche.toUpperCase()}:`);
      console.log(viral.caption.substring(0, 100) + '...');
    }
  }
}

/**
 * Example 6: Selecting Variations Programmatically
 * Choose variations based on specific criteria
 */
async function example6_SelectingVariations() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Example 6: Selecting Variations Programmatically');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const variations = await aiServiceManager.generateInstagramCaptions({
    userId: 'user-123',
    workspaceId: 'workspace-456',
    topic: 'Weekend getaway tips',
    preferences: {
      contentNiche: 'travel',
      aiModel: 'veegpt-hybrid'
    }
  });

  // Select by style
  const viralVariation = variations.find(v => v.style === 'viral');
  const authenticVariation = variations.find(v => v.style === 'authentic');
  const balancedVariation = variations.find(v => v.style === 'balanced');

  console.log('Available variations:');
  console.log(`• Viral: ${viralVariation ? '✓' : '✗'}`);
  console.log(`• Authentic: ${authenticVariation ? '✓' : '✗'}`);
  console.log(`• Balanced: ${balancedVariation ? '✓' : '✗'}`);

  // Select based on length preference
  const shortestCaption = variations.reduce((shortest, current) =>
    current.caption.length < shortest.caption.length ? current : shortest
  );

  console.log(`\n📏 Shortest caption (${shortestCaption.caption.length} chars): ${shortestCaption.style}`);

  // Select based on emoji count (simple check)
  const variationsByEmoji = variations.map(v => ({
    style: v.style,
    emojiCount: (v.caption.match(/[\p{Emoji}]/gu) || []).length
  }));

  console.log('\n😊 Emoji count by variation:');
  variationsByEmoji.forEach(v => {
    console.log(`   ${v.style}: ${v.emojiCount} emojis`);
  });
}

/**
 * Example 7: Advanced Preferences
 * Use all available AI preferences for fine-tuned control
 */
async function example7_AdvancedPreferences() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Example 7: Advanced Preferences - Tech Post');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const variations = await aiServiceManager.generateInstagramCaptions({
    userId: 'user-123',
    workspaceId: 'workspace-456',
    topic: 'New AI-powered productivity tool launch',
    postType: 'post',
    platform: 'Instagram',
    preferences: {
      contentNiche: 'tech',
      aiModel: 'veegpt-hybrid',
      creativityLevel: 0.9, // High creativity
      aiPersona: 'Professional & Authoritative',
      captionStyle: 'Educational',
      responseLength: 'medium',
      multilingual: 'auto',
      contentSafety: 'standard',
      aiMemory: 'long-term',
      optimizationGoals: 'Reach'
    }
  });

  console.log('Generated variations with advanced preferences:\n');
  variations.forEach((variation: CaptionVariation) => {
    console.log(`[${variation.style.toUpperCase()}]`);
    console.log(`${variation.styleDescription}\n`);
    console.log(`${variation.caption}\n`);
    console.log('─'.repeat(70) + '\n');
  });
}

/**
 * Example 8: Error Handling
 * Demonstrate proper error handling
 */
async function example8_ErrorHandling() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Example 8: Error Handling');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    const variations = await aiServiceManager.generateInstagramCaptions({
      userId: 'user-123',
      workspaceId: 'workspace-456',
      topic: 'Test topic',
      preferences: {
        contentNiche: 'fitness',
        aiModel: 'veegpt-hybrid'
      }
    });

    console.log(`✅ Successfully generated ${variations.length} variations`);

  } catch (error) {
    if (error instanceof Error) {
      console.error('❌ Error generating captions:', error.message);
      
      // Handle specific error cases
      if (error.message.includes('AI provider')) {
        console.log('   → Check AI API keys configuration');
      } else if (error.message.includes('Database')) {
        console.log('   → Check database connection');
      } else {
        console.log('   → Unknown error, check logs for details');
      }
    }
  }
}

/**
 * Example 9: Batch Generation
 * Generate captions for multiple topics in sequence
 */
async function example9_BatchGeneration() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Example 9: Batch Generation - Multiple Topics');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const topics = [
    'Morning motivation quote',
    'Product announcement',
    'Behind the scenes content',
    'Customer testimonial'
  ];

  const results = [];

  for (const topic of topics) {
    console.log(`Generating captions for: "${topic}"...`);
    
    const variations = await aiServiceManager.generateInstagramCaptions({
      userId: 'user-123',
      workspaceId: 'workspace-456',
      topic,
      preferences: {
        contentNiche: 'business',
        aiModel: 'veegpt-hybrid',
        creativityLevel: 0.7
      }
    });

    results.push({ topic, variations });
    console.log(`   ✓ Generated ${variations.length} variations\n`);
  }

  console.log(`\n📊 Batch Results: Successfully generated captions for ${results.length} topics`);
}

/**
 * Example 10: Integration with Voice Profile
 * Demonstrate how the method uses voice profiles automatically
 */
async function example10_VoiceProfileIntegration() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Example 10: Voice Profile Integration');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('The generateInstagramCaptions method automatically:');
  console.log('1. Loads the user\'s voice profile using userId and workspaceId');
  console.log('2. Applies voice characteristics to all generated captions');
  console.log('3. Ensures captions match the user\'s unique writing style\n');

  const variations = await aiServiceManager.generateInstagramCaptions({
    userId: 'user-with-profile',
    workspaceId: 'workspace-456',
    topic: 'Personal achievement story',
    preferences: {
      contentNiche: 'lifestyle',
      aiModel: 'veegpt-hybrid'
    }
  });

  console.log('Voice-matched variations generated:');
  variations.forEach((variation: CaptionVariation) => {
    console.log(`• ${variation.style}: ${variation.caption.length} characters`);
  });

  console.log('\nEach variation maintains the user\'s voice while varying the engagement strategy.');
}

/**
 * Run all examples
 */
async function runAllExamples() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  AIServiceManager.generateInstagramCaptions() - Examples      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    await example1_BasicUsage();
    await example2_WithMediaAnalysis();
    await example3_ImprovingExistingCaption();
    await example4_DifferentPostTypes();
    await example5_MultipleNiches();
    await example6_SelectingVariations();
    await example7_AdvancedPreferences();
    await example8_ErrorHandling();
    await example9_BatchGeneration();
    await example10_VoiceProfileIntegration();

    console.log('\n✅ All examples completed successfully!\n');
  } catch (error) {
    console.error('\n❌ Error running examples:', error);
  }
}

// Export examples for testing or documentation
export {
  example1_BasicUsage,
  example2_WithMediaAnalysis,
  example3_ImprovingExistingCaption,
  example4_DifferentPostTypes,
  example5_MultipleNiches,
  example6_SelectingVariations,
  example7_AdvancedPreferences,
  example8_ErrorHandling,
  example9_BatchGeneration,
  example10_VoiceProfileIntegration,
  runAllExamples
};

// Run if executed directly
if (require.main === module) {
  runAllExamples().catch(console.error);
}
