import { describe, test, expect, beforeAll } from 'vitest';
import { aiContentGenerator } from '../server/ai-content-generator';

/**
 * Unit Test: Viral Hooks Integration in buildUserPrompt
 * 
 * **Validates: Requirements 2.4, 3.6**
 * 
 * **Property 3 from Design**: System incorporates viral hooks into caption prompts 
 * to increase engagement (Property 3 from design)
 * 
 * **Preservation**: System prompt building continues to respect user preferences 
 * (AI persona, caption style, content niche, creativity level)
 * 
 * This test verifies that buildUserPrompt() method in ai-content-generator.ts:
 * 1. Checks if insights.trending.viralHooks exists and has content
 * 2. Adds viral hooks section to user prompt when available
 * 3. Suggests incorporating one viral hook naturally into caption structure
 * 4. Handles cases where trending data is undefined without error
 */

describe('AI Prompt Building - Viral Hooks Integration', () => {
  /**
   * Test Case 1: Prompt includes viral hooks when trending data exists
   */
  test('should include viral hooks section when insights.trending.viralHooks exists', async () => {
    // Access the private buildEnhancedUserPrompt method through a workaround
    // We'll generate content and check if the method was called with correct data
    const insights = {
      contentNiche: 'fashion',
      aiPersona: 'Professional & Authoritative',
      captionStyle: 'Storytelling',
      optimizationGoals: 'Maximize Engagement',
      creativityLevel: 0.7,
      trending: {
        viralHooks: [
          'This styling trick changed everything',
          'Nobody talks about this',
          'The secret to...'
        ],
        topics: ['sustainable fashion', 'street style'],
        hashtags: ['OOTD', 'FashionInspo']
      }
    };

    const aiPreferences = {
      aiModel: 'veegpt-hybrid',
      creativityLevel: 0.7,
      optimizationGoals: 'Maximize Engagement',
      aiPersona: 'Professional & Authoritative',
      captionStyle: 'Storytelling',
      contentSafety: 'Standard (Block explicit content)',
      multilingualOutput: 'Auto-detect (Match User)',
      autoHashtags: true
    };

    // Use reflection to access the private method (TypeScript workaround)
    const buildMethod = (aiContentGenerator as any).buildEnhancedUserPrompt.bind(aiContentGenerator);
    
    const prompt = buildMethod({
      mediaAnalysis: 'Image of a stylish outfit',
      existingCaption: undefined,
      postType: 'post',
      platform: 'instagram',
      insights,
      aiPreferences
    });

    // Verify viral hooks are mentioned in the prompt
    expect(prompt).toContain('Viral Hooks to Consider');
    expect(prompt).toContain('This styling trick changed everything');
    expect(prompt).toContain('Nobody talks about this');
    expect(prompt).toContain('The secret to...');
    expect(prompt).toContain('INSTRUCTION: Consider incorporating one of these proven viral hooks');
  });

  /**
   * Test Case 2: Prompt works without error when trending data is missing
   */
  test('should work without error when insights.trending is undefined', async () => {
    const insights = {
      contentNiche: 'general',
      aiPersona: 'Friendly & Conversational',
      captionStyle: 'Short & Punchy',
      optimizationGoals: 'Engagement',
      creativityLevel: 0.5,
      // No trending data
    };

    const aiPreferences = {
      aiModel: 'veegpt-hybrid',
      creativityLevel: 0.5,
      optimizationGoals: 'Engagement',
      aiPersona: 'Friendly & Conversational',
      captionStyle: 'Short & Punchy',
      contentSafety: 'Standard (Block explicit content)',
      multilingualOutput: 'Auto-detect (Match User)',
      autoHashtags: true
    };

    const buildMethod = (aiContentGenerator as any).buildEnhancedUserPrompt.bind(aiContentGenerator);
    
    const prompt = buildMethod({
      mediaAnalysis: '',
      existingCaption: 'Check this out',
      postType: 'post',
      platform: 'instagram',
      insights,
      aiPreferences
    });

    // Should not crash and should not contain viral hooks section
    expect(prompt).toBeDefined();
    expect(prompt).not.toContain('Viral Hooks to Consider');
    expect(prompt).toContain('Content Requirements');
  });

  /**
   * Test Case 3: Prompt works when viralHooks array is empty
   */
  test('should work without error when viralHooks array is empty', async () => {
    const insights = {
      contentNiche: 'tech',
      aiPersona: 'Educational & Informative',
      captionStyle: 'Educational & How-to',
      optimizationGoals: 'Drive Website Clicks',
      creativityLevel: 0.6,
      trending: {
        viralHooks: [], // Empty array
        topics: ['AI tools', 'productivity hacks'],
        hashtags: ['TechTok', 'TechReview']
      }
    };

    const aiPreferences = {
      aiModel: 'openai-gpt4o',
      creativityLevel: 0.6,
      optimizationGoals: 'Drive Website Clicks',
      aiPersona: 'Educational & Informative',
      captionStyle: 'Educational & How-to',
      contentSafety: 'Standard (Block explicit content)',
      multilingualOutput: 'English Only',
      autoHashtags: true
    };

    const buildMethod = (aiContentGenerator as any).buildEnhancedUserPrompt.bind(aiContentGenerator);
    
    const prompt = buildMethod({
      mediaAnalysis: 'Tech product screenshot',
      existingCaption: undefined,
      postType: 'reel',
      platform: 'instagram',
      insights,
      aiPreferences
    });

    // Should not crash and should not contain viral hooks section (empty array)
    expect(prompt).toBeDefined();
    expect(prompt).not.toContain('Viral Hooks to Consider');
  });

  /**
   * Test Case 4: Preservation - User preferences are still included
   */
  test('should preserve user preferences in prompt along with viral hooks', async () => {
    const insights = {
      contentNiche: 'fitness',
      aiPersona: 'Inspirational & Motivational',
      captionStyle: 'Question-based Engagement',
      optimizationGoals: 'Increase Followers & Reach',
      creativityLevel: 0.8,
      targetAudience: 'Fitness enthusiasts aged 25-35',
      trending: {
        viralHooks: ['Try this workout hack', 'Transform your body in...'],
        topics: ['home workouts', 'nutrition tips'],
        hashtags: ['FitnessMotivation', 'WorkoutRoutine']
      }
    };

    const aiPreferences = {
      aiModel: 'veegpt-hybrid',
      creativityLevel: 0.8,
      optimizationGoals: 'Increase Followers & Reach',
      aiPersona: 'Inspirational & Motivational',
      captionStyle: 'Question-based Engagement',
      contentSafety: 'Strict (Family-friendly only)',
      multilingualOutput: 'Auto-detect (Match User)',
      autoHashtags: true
    };

    const buildMethod = (aiContentGenerator as any).buildEnhancedUserPrompt.bind(aiContentGenerator);
    
    const prompt = buildMethod({
      mediaAnalysis: 'Gym workout video',
      existingCaption: undefined,
      postType: 'reel',
      platform: 'instagram',
      insights,
      aiPreferences
    });

    // Verify both viral hooks AND user preferences are included
    expect(prompt).toContain('Viral Hooks to Consider');
    expect(prompt).toContain('Try this workout hack');
    expect(prompt).toContain('Transform your body in...');
    
    // Verify user preferences are preserved
    expect(prompt).toContain('fitness');
    expect(prompt).toContain('Inspirational & Motivational');
    expect(prompt).toContain('Question-based Engagement');
    expect(prompt).toContain('Increase Followers & Reach');
    expect(prompt).toContain('80%'); // Creativity level
    expect(prompt).toContain('Strict (Family-friendly only)');
  });

  /**
   * Test Case 5: Legacy buildUserPrompt method also includes viral hooks
   */
  test('legacy buildUserPrompt should also include viral hooks when available', async () => {
    const insights = {
      contentNiche: 'travel',
      aiPersona: 'Bold & Provocative',
      captionStyle: 'Storytelling',
      optimizationGoals: 'Boost Shares & Saves',
      creativityLevel: 0.9,
      trending: {
        viralHooks: ['Hidden gems nobody knows about', 'Travel hack that saved me...'],
        topics: ['hidden gems', 'budget travel'],
        hashtags: ['TravelGram', 'Wanderlust']
      }
    };

    // Access the legacy buildUserPrompt method
    const buildMethod = (aiContentGenerator as any).buildUserPrompt.bind(aiContentGenerator);
    
    const prompt = buildMethod({
      mediaAnalysis: 'Beautiful beach photo',
      existingCaption: undefined,
      postType: 'post',
      platform: 'instagram',
      insights
    });

    // Verify viral hooks are included
    expect(prompt).toContain('Consider these proven viral hooks for your niche');
    expect(prompt).toContain('Hidden gems nobody knows about');
    expect(prompt).toContain('Travel hack that saved me...');
    expect(prompt).toContain('INSTRUCTION: Try incorporating one viral hook naturally');
  });

  /**
   * Test Case 6: Suggestion to incorporate hooks naturally
   */
  test('should suggest incorporating hooks naturally into caption structure', async () => {
    const insights = {
      contentNiche: 'business',
      aiPersona: 'Professional & Authoritative',
      captionStyle: 'List & Bullet Points',
      optimizationGoals: 'Engagement',
      creativityLevel: 0.7,
      trending: {
        viralHooks: ['Business lesson I learned the hard way'],
        topics: ['entrepreneurship'],
        hashtags: ['Entrepreneur']
      }
    };

    const aiPreferences = {
      aiModel: 'veegpt-hybrid',
      creativityLevel: 0.7,
      optimizationGoals: 'Engagement',
      aiPersona: 'Professional & Authoritative',
      captionStyle: 'List & Bullet Points',
      contentSafety: 'Standard (Block explicit content)',
      multilingualOutput: 'Auto-detect (Match User)',
      autoHashtags: true
    };

    const buildMethod = (aiContentGenerator as any).buildEnhancedUserPrompt.bind(aiContentGenerator);
    
    const prompt = buildMethod({
      mediaAnalysis: '',
      existingCaption: undefined,
      postType: 'post',
      platform: 'linkedin',
      insights,
      aiPreferences
    });

    // Verify instruction is present
    expect(prompt).toContain('INSTRUCTION:');
    expect(prompt).toMatch(/incorporating one.*viral hook/i);
    expect(prompt).toMatch(/naturally/i);
    expect(prompt).toMatch(/caption structure/i);
    expect(prompt).toMatch(/increase engagement/i);
  });

  /**
   * Test Case 7: Multiple viral hooks are listed
   */
  test('should display up to 3 viral hooks in enhanced prompt', async () => {
    const insights = {
      contentNiche: 'food',
      aiPersona: 'Humorous & Entertaining',
      captionStyle: 'Storytelling & Long-form',
      optimizationGoals: 'Maximize Engagement',
      creativityLevel: 0.75,
      trending: {
        viralHooks: [
          'This recipe went viral for a reason',
          'You need to try this',
          'The secret ingredient is...',
          'Mind-blown by this food hack', // This 4th one should not appear
        ],
        topics: ['quick recipes', 'meal prep'],
        hashtags: ['Foodie', 'RecipeOfTheDay']
      }
    };

    const aiPreferences = {
      aiModel: 'veegpt-hybrid',
      creativityLevel: 0.75,
      optimizationGoals: 'Maximize Engagement',
      aiPersona: 'Humorous & Entertaining',
      captionStyle: 'Storytelling & Long-form',
      contentSafety: 'Relaxed (Allow mature themes)',
      multilingualOutput: 'Auto-detect (Match User)',
      autoHashtags: true
    };

    const buildMethod = (aiContentGenerator as any).buildEnhancedUserPrompt.bind(aiContentGenerator);
    
    const prompt = buildMethod({
      mediaAnalysis: 'Delicious pasta dish',
      existingCaption: undefined,
      postType: 'post',
      platform: 'instagram',
      insights,
      aiPreferences
    });

    // Should include only first 3 viral hooks
    expect(prompt).toContain('This recipe went viral for a reason');
    expect(prompt).toContain('You need to try this');
    expect(prompt).toContain('The secret ingredient is...');
    expect(prompt).not.toContain('Mind-blown by this food hack'); // 4th hook should be excluded
  });
});

/**
 * TEST SUMMARY
 * 
 * These tests verify that Task 3.2 requirements are met:
 * 
 * ✓ Modify buildUserPrompt() method in server/ai-content-generator.ts
 * ✓ Check if insights.trending.viralHooks exists and has content
 * ✓ Add section to user prompt: "Consider these proven viral hooks for your niche: [viralHooks]"
 * ✓ Suggest incorporating one viral hook naturally into the caption structure
 * ✓ Ensure prompt building handles cases where trending data is undefined
 * ✓ Test that prompts include viral hooks when available
 * ✓ Test that prompts work without error when trending data is missing
 * ✓ Preservation: System prompt building continues to respect user preferences
 * 
 * Expected Behavior:
 * - When trending.viralHooks exists: prompts include viral hooks with instructions
 * - When trending.viralHooks is missing/empty: prompts work without errors
 * - User preferences (persona, style, goals) are always preserved
 */
