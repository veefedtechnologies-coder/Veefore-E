/**
 * PromptConstructorService Example Usage
 * 
 * This file demonstrates how to use the PromptConstructorService
 * for building comprehensive AI prompts for authentic caption generation.
 */

import { promptConstructorService, PromptConstructionParams } from './PromptConstructorService';
import { aiServiceManager, UserAIPreferences } from './AIServiceManager';
import { MongoClient } from 'mongodb';
import { VoiceProfileService } from './VoiceProfileService';

// ============================================================================
// EXAMPLE 1: Basic Caption Generation
// ============================================================================

async function example1_basicCaptionGeneration() {
  console.log('=== Example 1: Basic Caption Generation ===\n');

  const params: PromptConstructionParams = {
    userId: 'user123',
    workspaceId: 'workspace456',
    postType: 'post',
    platform: 'Instagram',
    aiPreferences: {
      contentNiche: 'fitness',
      optimizationGoals: 'Engagement',
      contentSafety: 'standard',
      aiModel: 'veegpt-hybrid',
      creativityLevel: 0.7,
    },
  };

  try {
    // Build the comprehensive prompt
    const prompt = await promptConstructorService.buildGenerationPrompt(params);
    
    console.log('Generated prompt length:', prompt.length);
    console.log('Prompt preview (first 500 chars):\n', prompt.substring(0, 500) + '...\n');

    // Use the prompt with AI Service Manager
    const caption = await aiServiceManager.generateText(prompt, params.aiPreferences);
    
    console.log('Generated Caption:\n', caption);
  } catch (error) {
    console.error('Error:', error);
  }
}

// ============================================================================
// EXAMPLE 2: Caption Generation with Media Analysis
// ============================================================================

async function example2_withMediaAnalysis() {
  console.log('\n=== Example 2: Caption Generation with Media Analysis ===\n');

  const params: PromptConstructionParams = {
    userId: 'user123',
    workspaceId: 'workspace456',
    mediaAnalysis: 'Image shows a person performing a deadlift in a modern gym with bright lighting. Person is wearing black athletic wear and has focused expression.',
    postType: 'post',
    platform: 'Instagram',
    aiPreferences: {
      contentNiche: 'fitness',
      optimizationGoals: 'Engagement',
      contentSafety: 'standard',
      captionStyle: 'Motivational',
      aiPersona: 'Fitness Coach',
    },
  };

  try {
    const prompt = await promptConstructorService.buildGenerationPrompt(params);
    const caption = await aiServiceManager.generateText(prompt, params.aiPreferences);
    
    console.log('Generated Caption (with media context):\n', caption);
  } catch (error) {
    console.error('Error:', error);
  }
}

// ============================================================================
// EXAMPLE 3: Improving Existing Caption
// ============================================================================

async function example3_improveExistingCaption() {
  console.log('\n=== Example 3: Improving Existing Caption ===\n');

  const existingCaption = 'Just finished my workout! 💪 Feeling great!';

  const params: PromptConstructionParams = {
    userId: 'user123',
    workspaceId: 'workspace456',
    existingCaption,
    postType: 'post',
    platform: 'Instagram',
    aiPreferences: {
      contentNiche: 'fitness',
      optimizationGoals: 'Engagement',
      contentSafety: 'standard',
    },
  };

  try {
    console.log('Original Caption:', existingCaption);
    
    const prompt = await promptConstructorService.buildGenerationPrompt(params);
    const improvedCaption = await aiServiceManager.generateText(prompt, params.aiPreferences);
    
    console.log('\nImproved Caption:\n', improvedCaption);
  } catch (error) {
    console.error('Error:', error);
  }
}

// ============================================================================
// EXAMPLE 4: Different Post Types
// ============================================================================

async function example4_differentPostTypes() {
  console.log('\n=== Example 4: Different Post Types ===\n');

  const baseParams = {
    userId: 'user123',
    workspaceId: 'workspace456',
    platform: 'Instagram',
    aiPreferences: {
      contentNiche: 'fitness',
      optimizationGoals: 'Engagement',
    },
  };

  // Story caption
  const storyParams: PromptConstructionParams = {
    ...baseParams,
    postType: 'story',
    mediaAnalysis: 'Quick gym selfie showing sweaty workout',
  };

  // Reel caption
  const reelParams: PromptConstructionParams = {
    ...baseParams,
    postType: 'reel',
    mediaAnalysis: 'Short video showing deadlift form tutorial',
  };

  // Feed post caption
  const feedParams: PromptConstructionParams = {
    ...baseParams,
    postType: 'post',
    mediaAnalysis: 'Before/after transformation photos',
  };

  try {
    console.log('🎬 STORY CAPTION:');
    const storyPrompt = await promptConstructorService.buildGenerationPrompt(storyParams);
    const storyCaption = await aiServiceManager.generateText(storyPrompt, storyParams.aiPreferences);
    console.log(storyCaption);

    console.log('\n🎥 REEL CAPTION:');
    const reelPrompt = await promptConstructorService.buildGenerationPrompt(reelParams);
    const reelCaption = await aiServiceManager.generateText(reelPrompt, reelParams.aiPreferences);
    console.log(reelCaption);

    console.log('\n📱 FEED POST CAPTION:');
    const feedPrompt = await promptConstructorService.buildGenerationPrompt(feedParams);
    const feedCaption = await aiServiceManager.generateText(feedPrompt, feedParams.aiPreferences);
    console.log(feedCaption);
  } catch (error) {
    console.error('Error:', error);
  }
}

// ============================================================================
// EXAMPLE 5: Different Content Safety Levels
// ============================================================================

async function example5_contentSafetyLevels() {
  console.log('\n=== Example 5: Content Safety Levels ===\n');

  const baseParams = {
    userId: 'user123',
    workspaceId: 'workspace456',
    postType: 'post' as const,
    platform: 'Instagram',
    mediaAnalysis: 'Post-workout selfie showing visible progress',
    aiPreferences: {
      contentNiche: 'fitness',
      optimizationGoals: 'Engagement',
    },
  };

  // Strict safety
  const strictParams: PromptConstructionParams = {
    ...baseParams,
    aiPreferences: {
      ...baseParams.aiPreferences,
      contentSafety: 'strict',
    },
  };

  // Standard safety
  const standardParams: PromptConstructionParams = {
    ...baseParams,
    aiPreferences: {
      ...baseParams.aiPreferences,
      contentSafety: 'standard',
    },
  };

  // Safety off
  const offParams: PromptConstructionParams = {
    ...baseParams,
    aiPreferences: {
      ...baseParams.aiPreferences,
      contentSafety: 'off',
    },
  };

  try {
    console.log('🛡️ STRICT SAFETY (Family-friendly):');
    const strictPrompt = await promptConstructorService.buildGenerationPrompt(strictParams);
    const strictCaption = await aiServiceManager.generateText(strictPrompt, strictParams.aiPreferences);
    console.log(strictCaption);

    console.log('\n⚖️ STANDARD SAFETY (Balanced):');
    const standardPrompt = await promptConstructorService.buildGenerationPrompt(standardParams);
    const standardCaption = await aiServiceManager.generateText(standardPrompt, standardParams.aiPreferences);
    console.log(standardCaption);

    console.log('\n🔓 SAFETY OFF (Authentic/Edgy):');
    const offPrompt = await promptConstructorService.buildGenerationPrompt(offParams);
    const offCaption = await aiServiceManager.generateText(offPrompt, offParams.aiPreferences);
    console.log(offCaption);
  } catch (error) {
    console.error('Error:', error);
  }
}

// ============================================================================
// EXAMPLE 6: With Voice Profile Service
// ============================================================================

async function example6_withVoiceProfileService() {
  console.log('\n=== Example 6: With Custom Voice Profile Service ===\n');

  // In a real application, you would have MongoDB connection
  // const mongoClient = new MongoClient('mongodb://localhost:27017');
  // await mongoClient.connect();
  // const voiceProfileService = new VoiceProfileService(mongoClient, 'veefore');

  // For this example, we'll use the singleton service
  const params: PromptConstructionParams = {
    userId: 'user123',
    workspaceId: 'workspace456',
    postType: 'post',
    platform: 'Instagram',
    aiPreferences: {
      contentNiche: 'fitness',
      optimizationGoals: 'Engagement',
      contentSafety: 'standard',
    },
  };

  try {
    // The service will automatically load the user's voice profile
    const prompt = await promptConstructorService.buildGenerationPrompt(params);
    
    console.log('Prompt includes voice profile matching user\'s style');
    console.log('Voice profile section:', prompt.includes('LAYER 2: VOICE PROFILE'));
    
    const caption = await aiServiceManager.generateText(prompt, params.aiPreferences);
    console.log('\nGenerated Caption (voice-matched):\n', caption);
  } catch (error) {
    console.error('Error:', error);
  }
}

// ============================================================================
// EXAMPLE 7: Multiple Niches
// ============================================================================

async function example7_multipleNiches() {
  console.log('\n=== Example 7: Different Niches ===\n');

  const niches = ['fitness', 'food', 'travel', 'fashion', 'tech'];

  for (const niche of niches) {
    const params: PromptConstructionParams = {
      userId: 'user123',
      workspaceId: 'workspace456',
      postType: 'post',
      platform: 'Instagram',
      aiPreferences: {
        contentNiche: niche,
        optimizationGoals: 'Engagement',
      },
    };

    try {
      console.log(`\n📍 ${niche.toUpperCase()} NICHE:`);
      const prompt = await promptConstructorService.buildGenerationPrompt(params);
      
      // Check that niche context is included
      const hasNicheContext = prompt.includes(`${niche.toUpperCase()} Industry Language`);
      console.log(`Niche context loaded: ${hasNicheContext ? '✅' : '❌'}`);
      
      const caption = await aiServiceManager.generateText(prompt, params.aiPreferences);
      console.log(caption.substring(0, 150) + '...');
    } catch (error) {
      console.error(`Error for ${niche}:`, error);
    }
  }
}

// ============================================================================
// EXAMPLE 8: Using Individual Formatting Methods
// ============================================================================

async function example8_individualFormattingMethods() {
  console.log('\n=== Example 8: Using Individual Formatting Methods ===\n');

  try {
    // Import the services
    const { viralPatternService } = await import('./ViralPatternService');
    const { nicheContextService } = await import('./NicheContextService');
    const { exampleCaptionService } = await import('./ExampleCaptionService');
    const { voiceProfileService } = await import('./VoiceProfileService');

    console.log('📝 1. Format Voice Profile Independently:');
    const voiceProfile = await voiceProfileService.getProfile('user123', 'workspace456');
    const voiceInstructions = promptConstructorService.voiceProfileToPrompt(voiceProfile);
    console.log(voiceInstructions.substring(0, 200) + '...\n');

    console.log('🔥 2. Format Viral Patterns Independently:');
    const patterns = await viralPatternService.getRelevantPatterns('fitness', 'post', 3);
    const hooks = await viralPatternService.getViralHooks('fitness', 5);
    const viralInstructions = promptConstructorService.viralPatternsToPrompt(patterns, hooks);
    console.log(viralInstructions.substring(0, 200) + '...\n');

    console.log('🎯 3. Format Niche Context Independently:');
    const nicheContext = await nicheContextService.getNicheContext('fitness');
    const nicheInstructions = promptConstructorService.nicheContextToPrompt(nicheContext);
    console.log(nicheInstructions.substring(0, 200) + '...\n');

    console.log('📚 4. Format Examples Independently:');
    const examples = await exampleCaptionService.getExamplesForGeneration('fitness', 'post', 3);
    const exampleInstructions = promptConstructorService.examplesToPrompt(examples, 'post');
    console.log(exampleInstructions.substring(0, 200) + '...\n');

    console.log('✅ 5. Build Task Instructions Independently:');
    const taskInstructions = promptConstructorService.buildTaskInstructions({
      userId: 'user123',
      workspaceId: 'workspace456',
      postType: 'post',
      platform: 'Instagram',
      aiPreferences: {
        contentNiche: 'fitness',
        optimizationGoals: 'Engagement',
        contentSafety: 'standard',
      },
    });
    console.log(taskInstructions.substring(0, 200) + '...\n');

    console.log('🔧 These individual methods can be used to:');
    console.log('   • Build custom prompts with selective layers');
    console.log('   • Generate documentation or style guides');
    console.log('   • Test and validate individual components');
    console.log('   • Create specialized prompt variations');
  } catch (error) {
    console.error('Error:', error);
  }
}

// ============================================================================
// EXAMPLE 9: Error Handling
// ============================================================================

async function example9_errorHandling() {
  console.log('\n=== Example 8: Error Handling & Graceful Degradation ===\n');

  // Example with invalid/missing data
  const params: PromptConstructionParams = {
    userId: 'newuser',
    workspaceId: 'newworkspace',
    postType: 'post',
    platform: 'Instagram',
    aiPreferences: {
      contentNiche: 'unknown-niche', // This might not exist
      optimizationGoals: 'Engagement',
    },
  };

  try {
    console.log('Building prompt for user with no voice profile...');
    const prompt = await promptConstructorService.buildGenerationPrompt(params);
    
    // Service should still generate a prompt with default values
    console.log('✅ Prompt generated successfully despite missing data');
    console.log('Prompt length:', prompt.length);
    console.log('Uses default voice guidelines:', prompt.includes('No voice profile available'));
    
    const caption = await aiServiceManager.generateText(prompt, params.aiPreferences);
    console.log('\nGenerated Caption (with defaults):\n', caption);
  } catch (error) {
    console.error('Error:', error);
  }
}

// ============================================================================
// RUN ALL EXAMPLES
// ============================================================================

async function runAllExamples() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  PromptConstructorService - Example Usage Demonstrations    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  try {
    await example1_basicCaptionGeneration();
    await example2_withMediaAnalysis();
    await example3_improveExistingCaption();
    await example4_differentPostTypes();
    await example5_contentSafetyLevels();
    await example6_withVoiceProfileService();
    await example7_multipleNiches();
    await example8_individualFormattingMethods();
    await example9_errorHandling();
    
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║  All Examples Completed Successfully!                       ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
  } catch (error) {
    console.error('Fatal error running examples:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  runAllExamples()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export {
  example1_basicCaptionGeneration,
  example2_withMediaAnalysis,
  example3_improveExistingCaption,
  example4_differentPostTypes,
  example5_contentSafetyLevels,
  example6_withVoiceProfileService,
  example7_multipleNiches,
  example8_individualFormattingMethods,
  example9_errorHandling,
  runAllExamples,
};
