import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { AIServiceManager } from '../server/services/AIServiceManager';
import type { UserAIPreferences } from '../server/services/AIServiceManager';
import dotenv from 'dotenv';
import fc from 'fast-check';

// Load environment variables
dotenv.config();

/**
 * Bug Condition Exploration Test - Caption Style Enforcement
 * 
 * **CRITICAL**: This test MUST FAIL on UNFIXED code - failure confirms the bug exists
 * 
 * **Property 1: Bug Condition** - Punchy & Short Style Not Enforced
 * 
 * **IMPORTANT**: DO NOT attempt to fix the test or the code when it fails
 * 
 * **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
 * 
 * **GOAL**: Surface counterexamples demonstrating that "Punchy & Short" style generates >150 character captions
 * 
 * **Scoped PBT Approach**: Scope the property to concrete failing cases with various topics
 * 
 * **Expected Outcome on UNFIXED code**: 
 *   - Tests FAIL showing captions with 200-300+ characters
 *   - Multiple counterexamples document the bug condition
 *   - Examples show violation of "Punchy & Short" constraint (50-150 chars, 1-3 sentences)
 * 
 * **Expected Outcome on FIXED code**:
 *   - Tests PASS with captions between 50-150 characters
 *   - All captions have 1-3 sentences max
 *   - Style enforcement is consistent across all topics
 * 
 * **Validates: Requirements 1.1, 1.3, 2.1, 2.3**
 * 
 * Test implementation: Configure `captionStyle: "Punchy & Short"`, generate caption, assert `length <= 150 AND sentenceCount <= 3`
 * 
 * Expected behavior: Caption must be 50-150 characters with 1-3 sentences max (from Bug Condition specification)
 */

describe('Bug Condition Exploration: Caption Style Enforcement - Punchy & Short', () => {
  let aiServiceManager: AIServiceManager;
  
  // Track counterexamples found
  const counterexamples: Array<{
    topic: string;
    caption: string;
    length: number;
    sentenceCount: number;
  }> = [];

  beforeAll(async () => {
    aiServiceManager = AIServiceManager.getInstance();
    
    // Check if AI service is configured
    const isConfigured = await aiServiceManager.isConfigured();
    if (!isConfigured) {
      console.warn('⚠️  AI service is not configured. These tests require GOOGLE_API_KEY or OPENAI_API_KEY.');
      console.warn('   To run these tests:');
      console.warn('   1. Set GOOGLE_API_KEY or OPENAI_API_KEY in .env');
      console.warn('   2. Run tests again');
      throw new Error('AI service not configured');
    }
    
    console.log('✅ AI service is configured');
  });

  afterAll(() => {
    // Document all counterexamples found
    if (counterexamples.length > 0) {
      console.log('\n📋 COUNTEREXAMPLES FOUND (Bug Confirmed):');
      console.log('=========================================');
      counterexamples.forEach((ex, index) => {
        console.log(`\nExample ${index + 1}:`);
        console.log(`Topic: "${ex.topic}"`);
        console.log(`Caption Length: ${ex.length} characters (EXCEEDS 150 limit)`);
        console.log(`Sentence Count: ${ex.sentenceCount} sentences`);
        console.log(`Caption: "${ex.caption}"`);
      });
      console.log('\n=========================================');
      console.log(`Total counterexamples: ${counterexamples.length}`);
      console.log('✅ Bug condition confirmed: "Punchy & Short" style generates >150 character captions');
    }
  });

  /**
   * Helper function to count sentences in a caption
   * Counts periods, exclamation marks, and question marks as sentence endings
   */
  function countSentences(text: string): number {
    // Remove emojis and special characters that might confuse sentence detection
    const cleaned = text.replace(/[\u{1F300}-\u{1F9FF}]/gu, '');
    
    // Match sentence-ending punctuation (., !, ?)
    // Ignore periods in common abbreviations and URLs
    const sentences = cleaned.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    return sentences.length;
  }

  /**
   * Helper function to validate caption against "Punchy & Short" requirements
   * Returns validation result with detailed failure information
   */
  function validatePunchyShort(caption: string): {
    isValid: boolean;
    length: number;
    sentenceCount: number;
    violations: string[];
  } {
    const length = caption.length;
    const sentenceCount = countSentences(caption);
    const violations: string[] = [];

    // Check length constraint: 50-150 characters
    if (length < 50) {
      violations.push(`Caption too short: ${length} chars (minimum 50)`);
    }
    if (length > 150) {
      violations.push(`Caption too long: ${length} chars (maximum 150)`);
    }

    // Check sentence count constraint: 1-3 sentences max
    if (sentenceCount > 3) {
      violations.push(`Too many sentences: ${sentenceCount} (maximum 3)`);
    }
    if (sentenceCount === 0) {
      violations.push(`No sentences detected`);
    }

    return {
      isValid: violations.length === 0 && length >= 50 && length <= 150 && sentenceCount >= 1 && sentenceCount <= 3,
      length,
      sentenceCount,
      violations
    };
  }

  /**
   * Test Case 1: Single Topic - Product Launch
   * 
   * **Bug Condition**: User selects "Punchy & Short" for product launch topic
   * **Expected (after fix)**: Caption between 50-150 characters, 1-3 sentences
   * **Actual (on unfixed code)**: Caption exceeds 150 characters (often 200-300+ chars)
   * 
   * **Validates: Requirements 1.1, 2.1**
   */
  test('should enforce "Punchy & Short" style for product launch topic', async () => {
    const topic = 'New product launch';
    const preferences: UserAIPreferences = {
      captionStyle: 'Punchy & Short',
      aiModel: 'veegpt-hybrid',
      creativityLevel: 0.7,
      contentSafety: 'standard'
    };

    console.log(`\nTesting topic: "${topic}"`);
    const caption = await aiServiceManager.generateCaption(topic, preferences);
    console.log(`Generated caption (${caption.length} chars): "${caption}"`);

    const validation = validatePunchyShort(caption);
    console.log(`Sentence count: ${validation.sentenceCount}`);
    
    if (!validation.isValid) {
      console.log('❌ VALIDATION FAILED:', validation.violations.join(', '));
      counterexamples.push({
        topic,
        caption,
        length: validation.length,
        sentenceCount: validation.sentenceCount
      });
    } else {
      console.log('✅ Validation passed');
    }

    // Assert caption meets requirements
    expect(validation.length, `Caption should be 50-150 characters, got ${validation.length}`).toBeGreaterThanOrEqual(50);
    expect(validation.length, `Caption should be 50-150 characters, got ${validation.length}`).toBeLessThanOrEqual(150);
    expect(validation.sentenceCount, `Caption should have 1-3 sentences, got ${validation.sentenceCount}`).toBeGreaterThanOrEqual(1);
    expect(validation.sentenceCount, `Caption should have 1-3 sentences, got ${validation.sentenceCount}`).toBeLessThanOrEqualTo(3);
  }, 60000);

  /**
   * Test Case 2: Multiple Topics - Scoped Property Test
   * 
   * **Bug Condition**: "Punchy & Short" style fails across various topics
   * **Expected (after fix)**: ALL captions are 50-150 characters, 1-3 sentences
   * **Actual (on unfixed code)**: Multiple topics produce 200-300+ character captions
   * 
   * **Scoped Approach**: Test specific topics known to trigger the bug
   * 
   * **Validates: Requirements 1.1, 1.3, 2.1, 2.3**
   */
  test('should enforce "Punchy & Short" style across multiple topics', async () => {
    const topics = [
      'Fitness transformation',
      'Weekend vibes',
      'Coffee break',
      'Travel adventure',
      'Productivity hack'
    ];

    const preferences: UserAIPreferences = {
      captionStyle: 'Punchy & Short',
      aiModel: 'veegpt-hybrid',
      creativityLevel: 0.7,
      contentSafety: 'standard'
    };

    console.log('\nTesting multiple topics with "Punchy & Short" style:');
    
    const results = [];
    for (const topic of topics) {
      console.log(`\n--- Testing topic: "${topic}" ---`);
      const caption = await aiServiceManager.generateCaption(topic, preferences);
      const validation = validatePunchyShort(caption);
      
      console.log(`Caption (${validation.length} chars): "${caption}"`);
      console.log(`Sentences: ${validation.sentenceCount}`);
      
      if (!validation.isValid) {
        console.log('❌ FAILED:', validation.violations.join(', '));
        counterexamples.push({
          topic,
          caption,
          length: validation.length,
          sentenceCount: validation.sentenceCount
        });
      } else {
        console.log('✅ Passed');
      }

      results.push({ topic, validation, caption });
    }

    // Assert ALL captions meet requirements
    for (const result of results) {
      expect(
        result.validation.length,
        `Topic "${result.topic}": Caption should be 50-150 characters, got ${result.validation.length}. Caption: "${result.caption}"`
      ).toBeGreaterThanOrEqual(50);
      
      expect(
        result.validation.length,
        `Topic "${result.topic}": Caption should be 50-150 characters, got ${result.validation.length}. Caption: "${result.caption}"`
      ).toBeLessThanOrEqual(150);
      
      expect(
        result.validation.sentenceCount,
        `Topic "${result.topic}": Caption should have 1-3 sentences, got ${result.validation.sentenceCount}`
      ).toBeGreaterThanOrEqual(1);
      
      expect(
        result.validation.sentenceCount,
        `Topic "${result.topic}": Caption should have 1-3 sentences, got ${result.validation.sentenceCount}`
      ).toBeLessThanOrEqual(3);
    }

    // Summary assertion
    const failedCount = results.filter(r => !r.validation.isValid).length;
    console.log(`\n📊 Results: ${results.length - failedCount}/${results.length} passed`);
    
    expect(
      failedCount,
      `All captions should meet "Punchy & Short" requirements (50-150 chars, 1-3 sentences). ${failedCount}/${results.length} failed.`
    ).toBe(0);
  }, 180000);

  /**
   * Test Case 3: Property-Based Test - Random Topics
   * 
   * **Bug Condition**: "Punchy & Short" style fails for generated topics
   * **Expected (after fix)**: ALL captions are 50-150 characters, 1-3 sentences
   * **Actual (on unfixed code)**: Random topics surface additional counterexamples
   * 
   * **PBT Approach**: Generate random topics and verify style enforcement
   * 
   * **Validates: Requirements 2.1, 2.3 (ABSOLUTE REQUIREMENTS)**
   */
  test('should enforce "Punchy & Short" style for any topic (property-based)', async () => {
    const topicGenerator = fc.oneof(
      fc.constant('morning routine'),
      fc.constant('sunset photography'),
      fc.constant('healthy breakfast'),
      fc.constant('workout motivation'),
      fc.constant('tech innovation'),
      fc.constant('fashion style'),
      fc.constant('home decor'),
      fc.constant('book recommendation')
    );

    await fc.assert(
      fc.asyncProperty(topicGenerator, async (topic) => {
        const preferences: UserAIPreferences = {
          captionStyle: 'Punchy & Short',
          aiModel: 'veegpt-hybrid',
          creativityLevel: 0.7,
          contentSafety: 'standard'
        };

        const caption = await aiServiceManager.generateCaption(topic, preferences);
        const validation = validatePunchyShort(caption);

        if (!validation.isValid) {
          console.log(`\n❌ PBT Counterexample found:`);
          console.log(`Topic: "${topic}"`);
          console.log(`Caption (${validation.length} chars): "${caption}"`);
          console.log(`Violations:`, validation.violations);
          
          counterexamples.push({
            topic,
            caption,
            length: validation.length,
            sentenceCount: validation.sentenceCount
          });
        }

        // Property: Caption MUST be 50-150 characters AND have 1-3 sentences
        return validation.isValid;
      }),
      {
        numRuns: 5, // Run 5 times to collect multiple counterexamples
        timeout: 60000
      }
    );
  }, 300000);

  /**
   * Test Case 4: generateInstagramCaptions with "Punchy & Short"
   * 
   * **Bug Condition**: Instagram caption generation doesn't enforce "Punchy & Short" style
   * **Expected (after fix)**: ALL variations are 50-150 characters, 1-3 sentences
   * **Actual (on unfixed code)**: Variations exceed 150 characters
   * 
   * **Validates: Requirements 1.1, 1.3, 2.1, 2.3**
   */
  test('should enforce "Punchy & Short" style in generateInstagramCaptions', async () => {
    const preferences: UserAIPreferences = {
      captionStyle: 'Punchy & Short',
      aiModel: 'veegpt-hybrid',
      creativityLevel: 0.7,
      contentSafety: 'standard',
      contentNiche: 'lifestyle'
    };

    console.log('\nTesting generateInstagramCaptions with "Punchy & Short" style:');
    
    const variations = await aiServiceManager.generateInstagramCaptions({
      userId: 'test-user-id',
      workspaceId: 'test-workspace-id',
      topic: 'Weekend adventure',
      postType: 'post',
      platform: 'Instagram',
      preferences
    });

    console.log(`\nGenerated ${variations.length} variations:`);
    
    const results = variations.map((variation, index) => {
      const validation = validatePunchyShort(variation.caption);
      console.log(`\nVariation ${index + 1} (${variation.style}):`);
      console.log(`Caption (${validation.length} chars): "${variation.caption}"`);
      console.log(`Sentences: ${validation.sentenceCount}`);
      console.log(`Authenticity: ${variation.authenticityScore?.overallScore}/100`);
      
      if (!validation.isValid) {
        console.log('❌ FAILED:', validation.violations.join(', '));
        counterexamples.push({
          topic: `Instagram ${variation.style}`,
          caption: variation.caption,
          length: validation.length,
          sentenceCount: validation.sentenceCount
        });
      } else {
        console.log('✅ Passed');
      }

      return { variation, validation };
    });

    // Assert ALL variations meet requirements
    for (const { variation, validation } of results) {
      expect(
        validation.length,
        `${variation.style} variation: Caption should be 50-150 characters, got ${validation.length}. Caption: "${variation.caption}"`
      ).toBeGreaterThanOrEqual(50);
      
      expect(
        validation.length,
        `${variation.style} variation: Caption should be 50-150 characters, got ${validation.length}. Caption: "${variation.caption}"`
      ).toBeLessThanOrEqual(150);
      
      expect(
        validation.sentenceCount,
        `${variation.style} variation: Caption should have 1-3 sentences, got ${validation.sentenceCount}`
      ).toBeGreaterThanOrEqual(1);
      
      expect(
        validation.sentenceCount,
        `${variation.style} variation: Caption should have 1-3 sentences, got ${validation.sentenceCount}`
      ).toBeLessThanOrEqual(3);
    }
  }, 180000);
});
