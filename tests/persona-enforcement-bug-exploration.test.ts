import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { AIServiceManager } from '../server/services/AIServiceManager';
import type { UserAIPreferences } from '../server/services/AIServiceManager';
import dotenv from 'dotenv';
import fc from 'fast-check';

// Load environment variables
dotenv.config();

/**
 * Bug Condition Exploration Test - Persona Enforcement
 * 
 * **CRITICAL**: This test MUST FAIL on UNFIXED code - failure confirms the bug exists
 * 
 * **Property 1: Bug Condition** - Persona Characteristics Not Present
 * 
 * **IMPORTANT**: DO NOT attempt to fix the test or the code when it fails
 * 
 * **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
 * 
 * **GOAL**: Surface counterexamples demonstrating that selected personas don't match output tone
 * 
 * **Scoped PBT Approach**: Test "Casual & Friendly" and "Professional & Authoritative" personas
 * 
 * **Expected Outcome on UNFIXED code**: 
 *   - Tests FAIL showing formal language when casual is configured
 *   - Tests FAIL showing casual language when professional is configured
 *   - Multiple counterexamples document the persona enforcement bug
 * 
 * **Expected Outcome on FIXED code**:
 *   - Tests PASS with casual personas producing contractions and friendly tone
 *   - Tests PASS with professional personas producing authoritative language
 *   - Persona enforcement is consistent across all topics
 * 
 * **Validates: Requirements 1.4, 1.5, 1.6, 2.4, 2.5, 2.6**
 * 
 * Test implementation: Configure `aiPersona: "Casual & Friendly"`, generate caption, assert casual language (contractions, friendly vocabulary)
 * 
 * Expected behavior: Casual persona must produce casual contractions and friendly tone (from Bug Condition specification)
 */

describe('Bug Condition Exploration: Persona Enforcement', () => {
  let aiServiceManager: AIServiceManager;
  
  // Track counterexamples found
  const counterexamples: Array<{
    topic: string;
    persona: string;
    caption: string;
    violations: string[];
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
        console.log(`Persona: "${ex.persona}"`);
        console.log(`Topic: "${ex.topic}"`);
        console.log(`Violations: ${ex.violations.join(', ')}`);
        console.log(`Caption: "${ex.caption}"`);
      });
      console.log('\n=========================================');
      console.log(`Total counterexamples: ${counterexamples.length}`);
      console.log('✅ Bug condition confirmed: Selected personas do not match output tone');
    }
  });

  /**
   * Helper function to detect casual language characteristics
   * Looks for: contractions, casual vocabulary, friendly tone markers
   */
  function detectCasualLanguage(text: string): {
    hasContractions: boolean;
    contractions: string[];
    hasCasualVocab: boolean;
    casualWords: string[];
    hasFriendlyEmojis: boolean;
    friendlyEmojis: string[];
  } {
    // Common contractions
    const contractionPatterns = [
      "it's", "you're", "don't", "can't", "won't", "we're", "they're", 
      "i'm", "he's", "she's", "that's", "what's", "here's", "there's",
      "isn't", "aren't", "wasn't", "weren't", "hasn't", "haven't",
      "doesn't", "didn't", "couldn't", "wouldn't", "shouldn't"
    ];
    
    const foundContractions = contractionPatterns.filter(pattern => 
      text.toLowerCase().includes(pattern)
    );

    // Casual vocabulary markers
    const casualVocab = [
      "hey", "awesome", "totally", "super", "cool", "great", "love", 
      "amazing", "excited", "fun", "yay", "yep", "nope", "gonna", "wanna",
      "kinda", "sorta", "yeah", "wow"
    ];
    
    const foundCasualWords = casualVocab.filter(word => 
      text.toLowerCase().includes(word)
    );

    // Friendly emojis (casual, warm, positive)
    const friendlyEmojiPatterns = ['😊', '❤️', '💙', '😄', '🙌', '👏', '✨', '💕', '🥰', '😍', '🤗', '☺️'];
    const foundFriendlyEmojis = friendlyEmojiPatterns.filter(emoji => text.includes(emoji));

    return {
      hasContractions: foundContractions.length > 0,
      contractions: foundContractions,
      hasCasualVocab: foundCasualWords.length > 0,
      casualWords: foundCasualWords,
      hasFriendlyEmojis: foundFriendlyEmojis.length > 0,
      friendlyEmojis: foundFriendlyEmojis
    };
  }

  /**
   * Helper function to detect professional/authoritative language
   * Looks for: formal structure, expert terminology, confident assertions, minimal contractions
   */
  function detectProfessionalLanguage(text: string): {
    hasFormalStructure: boolean;
    hasConfidentAssertions: boolean;
    professionalWords: string[];
    contractionCount: number;
    excessiveEmojis: boolean;
  } {
    // Professional/authoritative vocabulary markers
    const professionalVocab = [
      "analysis", "significant", "demonstrates", "represents", "industry",
      "essential", "critical", "research", "data", "evidence", "strategy",
      "implementation", "optimization", "framework", "methodology", "expertise",
      "professional", "comprehensive", "innovative", "transformative"
    ];
    
    const foundProfessionalWords = professionalVocab.filter(word => 
      text.toLowerCase().includes(word)
    );

    // Check for confident assertions (sentences starting with declarative statements)
    const hasConfidentAssertions = /^(This|These|The|Our|We|Research|Studies|Data|Evidence)/.test(text.trim());

    // Count contractions (professional tone should minimize them)
    const contractionPatterns = [
      "it's", "you're", "don't", "can't", "won't", "we're", "they're", 
      "i'm", "he's", "she's", "that's", "what's"
    ];
    const contractionCount = contractionPatterns.filter(pattern => 
      text.toLowerCase().includes(pattern)
    ).length;

    // Check for excessive emojis (professional should be minimal)
    const emojiCount = (text.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length;
    const excessiveEmojis = emojiCount > 2;

    // Formal structure: longer sentences, complex structure
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgSentenceLength = sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length;
    const hasFormalStructure = avgSentenceLength > 50 && foundProfessionalWords.length > 0;

    return {
      hasFormalStructure,
      hasConfidentAssertions,
      professionalWords: foundProfessionalWords,
      contractionCount,
      excessiveEmojis
    };
  }

  /**
   * Helper function to validate caption against "Casual & Friendly" persona
   */
  function validateCasualPersona(caption: string): {
    isValid: boolean;
    violations: string[];
    casualMarkers: ReturnType<typeof detectCasualLanguage>;
  } {
    const casualMarkers = detectCasualLanguage(caption);
    const violations: string[] = [];

    // Casual persona MUST have at least ONE of: contractions OR casual vocab OR friendly emojis
    const hasCasualCharacteristics = 
      casualMarkers.hasContractions || 
      casualMarkers.hasCasualVocab || 
      casualMarkers.hasFriendlyEmojis;

    if (!hasCasualCharacteristics) {
      violations.push('Missing casual characteristics (no contractions, casual vocabulary, or friendly emojis)');
    }

    // Check for overly formal language that contradicts casual persona
    const professionalMarkers = detectProfessionalLanguage(caption);
    if (professionalMarkers.hasFormalStructure && !casualMarkers.hasContractions) {
      violations.push('Uses formal structure without casual contractions');
    }

    return {
      isValid: violations.length === 0,
      violations,
      casualMarkers
    };
  }

  /**
   * Helper function to validate caption against "Professional & Authoritative" persona
   */
  function validateProfessionalPersona(caption: string): {
    isValid: boolean;
    violations: string[];
    professionalMarkers: ReturnType<typeof detectProfessionalLanguage>;
  } {
    const professionalMarkers = detectProfessionalLanguage(caption);
    const violations: string[] = [];

    // Professional persona should have formal structure OR confident assertions OR professional vocabulary
    const hasProfessionalCharacteristics = 
      professionalMarkers.hasFormalStructure || 
      professionalMarkers.hasConfidentAssertions ||
      professionalMarkers.professionalWords.length > 0;

    if (!hasProfessionalCharacteristics) {
      violations.push('Missing professional characteristics (no formal structure, confident assertions, or professional vocabulary)');
    }

    // Professional persona should minimize contractions
    if (professionalMarkers.contractionCount > 2) {
      violations.push(`Too many contractions (${professionalMarkers.contractionCount}) for professional tone`);
    }

    // Professional persona should minimize emojis
    if (professionalMarkers.excessiveEmojis) {
      violations.push('Excessive emojis for professional tone');
    }

    return {
      isValid: violations.length === 0,
      violations,
      professionalMarkers
    };
  }

  /**
   * Test Case 1: Casual & Friendly Persona - Single Topic
   * 
   * **Bug Condition**: User selects "Casual & Friendly" persona
   * **Expected (after fix)**: Caption has contractions, casual vocabulary, or friendly tone
   * **Actual (on unfixed code)**: Caption uses formal language without casual characteristics
   * 
   * **Validates: Requirements 1.4, 2.4**
   */
  test('should enforce "Casual & Friendly" persona for product launch topic', async () => {
    const topic = 'New product launch';
    const preferences: UserAIPreferences = {
      aiPersona: 'Casual & Friendly',
      aiModel: 'veegpt-hybrid',
      creativityLevel: 0.7,
      contentSafety: 'standard'
    };

    console.log(`\nTesting "Casual & Friendly" persona with topic: "${topic}"`);
    const caption = await aiServiceManager.generateCaption(topic, preferences);
    console.log(`Generated caption: "${caption}"`);

    const validation = validateCasualPersona(caption);
    console.log(`Casual markers:`, {
      contractions: validation.casualMarkers.contractions,
      casualWords: validation.casualMarkers.casualWords,
      friendlyEmojis: validation.casualMarkers.friendlyEmojis
    });
    
    if (!validation.isValid) {
      console.log('❌ VALIDATION FAILED:', validation.violations.join(', '));
      counterexamples.push({
        topic,
        persona: 'Casual & Friendly',
        caption,
        violations: validation.violations
      });
    } else {
      console.log('✅ Validation passed');
    }

    // Assert caption has casual characteristics
    expect(validation.isValid, 
      `Caption should have casual characteristics. Violations: ${validation.violations.join(', ')}. Caption: "${caption}"`
    ).toBe(true);
  }, 60000);

  /**
   * Test Case 2: Casual & Friendly Persona - Multiple Topics
   * 
   * **Bug Condition**: "Casual & Friendly" persona fails across various topics
   * **Expected (after fix)**: ALL captions have casual characteristics
   * **Actual (on unfixed code)**: Multiple topics produce formal language
   * 
   * **Validates: Requirements 1.4, 1.6, 2.4, 2.6**
   */
  test('should enforce "Casual & Friendly" persona across multiple topics', async () => {
    const topics = [
      'Morning coffee routine',
      'Fitness journey update',
      'Travel destination'
    ];

    const preferences: UserAIPreferences = {
      aiPersona: 'Casual & Friendly',
      aiModel: 'veegpt-hybrid',
      creativityLevel: 0.7,
      contentSafety: 'standard'
    };

    console.log('\nTesting "Casual & Friendly" persona across multiple topics:');
    
    const results = [];
    for (const topic of topics) {
      console.log(`\n--- Testing topic: "${topic}" ---`);
      const caption = await aiServiceManager.generateCaption(topic, preferences);
      const validation = validateCasualPersona(caption);
      
      console.log(`Caption: "${caption}"`);
      console.log(`Casual markers:`, {
        contractions: validation.casualMarkers.contractions,
        casualWords: validation.casualMarkers.casualWords
      });
      
      if (!validation.isValid) {
        console.log('❌ FAILED:', validation.violations.join(', '));
        counterexamples.push({
          topic,
          persona: 'Casual & Friendly',
          caption,
          violations: validation.violations
        });
      } else {
        console.log('✅ Passed');
      }

      results.push({ topic, validation, caption });
    }

    // Assert ALL captions have casual characteristics
    for (const result of results) {
      expect(
        result.validation.isValid,
        `Topic "${result.topic}": Caption should have casual characteristics. Violations: ${result.validation.violations.join(', ')}. Caption: "${result.caption}"`
      ).toBe(true);
    }

    // Summary assertion
    const failedCount = results.filter(r => !r.validation.isValid).length;
    console.log(`\n📊 Results: ${results.length - failedCount}/${results.length} passed`);
    
    expect(
      failedCount,
      `All captions should have "Casual & Friendly" persona characteristics. ${failedCount}/${results.length} failed.`
    ).toBe(0);
  }, 180000);

  /**
   * Test Case 3: Professional & Authoritative Persona - Single Topic
   * 
   * **Bug Condition**: User selects "Professional & Authoritative" persona
   * **Expected (after fix)**: Caption has formal structure, confident assertions, professional vocabulary
   * **Actual (on unfixed code)**: Caption uses casual language with contractions
   * 
   * **Validates: Requirements 1.5, 2.5**
   */
  test('should enforce "Professional & Authoritative" persona for industry trends topic', async () => {
    const topic = 'Industry trends and innovation';
    const preferences: UserAIPreferences = {
      aiPersona: 'Professional & Authoritative',
      aiModel: 'veegpt-hybrid',
      creativityLevel: 0.7,
      contentSafety: 'standard'
    };

    console.log(`\nTesting "Professional & Authoritative" persona with topic: "${topic}"`);
    const caption = await aiServiceManager.generateCaption(topic, preferences);
    console.log(`Generated caption: "${caption}"`);

    const validation = validateProfessionalPersona(caption);
    console.log(`Professional markers:`, {
      formalStructure: validation.professionalMarkers.hasFormalStructure,
      confidentAssertions: validation.professionalMarkers.hasConfidentAssertions,
      professionalWords: validation.professionalMarkers.professionalWords,
      contractionCount: validation.professionalMarkers.contractionCount
    });
    
    if (!validation.isValid) {
      console.log('❌ VALIDATION FAILED:', validation.violations.join(', '));
      counterexamples.push({
        topic,
        persona: 'Professional & Authoritative',
        caption,
        violations: validation.violations
      });
    } else {
      console.log('✅ Validation passed');
    }

    // Assert caption has professional characteristics
    expect(validation.isValid, 
      `Caption should have professional/authoritative characteristics. Violations: ${validation.violations.join(', ')}. Caption: "${caption}"`
    ).toBe(true);
  }, 60000);

  /**
   * Test Case 4: Professional & Authoritative Persona - Multiple Topics
   * 
   * **Bug Condition**: "Professional & Authoritative" persona fails across various topics
   * **Expected (after fix)**: ALL captions have professional characteristics
   * **Actual (on unfixed code)**: Multiple topics produce casual language
   * 
   * **Validates: Requirements 1.5, 1.6, 2.5, 2.6**
   */
  test('should enforce "Professional & Authoritative" persona across multiple topics', async () => {
    const topics = [
      'Business strategy insights',
      'Technology advancement'
    ];

    const preferences: UserAIPreferences = {
      aiPersona: 'Professional & Authoritative',
      aiModel: 'veegpt-hybrid',
      creativityLevel: 0.7,
      contentSafety: 'standard'
    };

    console.log('\nTesting "Professional & Authoritative" persona across multiple topics:');
    
    const results = [];
    for (const topic of topics) {
      console.log(`\n--- Testing topic: "${topic}" ---`);
      const caption = await aiServiceManager.generateCaption(topic, preferences);
      const validation = validateProfessionalPersona(caption);
      
      console.log(`Caption: "${caption}"`);
      console.log(`Professional markers:`, {
        professionalWords: validation.professionalMarkers.professionalWords,
        contractionCount: validation.professionalMarkers.contractionCount
      });
      
      if (!validation.isValid) {
        console.log('❌ FAILED:', validation.violations.join(', '));
        counterexamples.push({
          topic,
          persona: 'Professional & Authoritative',
          caption,
          violations: validation.violations
        });
      } else {
        console.log('✅ Passed');
      }

      results.push({ topic, validation, caption });
    }

    // Assert ALL captions have professional characteristics
    for (const result of results) {
      expect(
        result.validation.isValid,
        `Topic "${result.topic}": Caption should have professional/authoritative characteristics. Violations: ${result.validation.violations.join(', ')}. Caption: "${result.caption}"`
      ).toBe(true);
    }

    // Summary assertion
    const failedCount = results.filter(r => !r.validation.isValid).length;
    console.log(`\n📊 Results: ${results.length - failedCount}/${results.length} passed`);
    
    expect(
      failedCount,
      `All captions should have "Professional & Authoritative" persona characteristics. ${failedCount}/${results.length} failed.`
    ).toBe(0);
  }, 120000);

  /**
   * Test Case 5: Property-Based Test - Casual Persona with Random Topics (REDUCED ITERATIONS)
   * 
   * **Bug Condition**: "Casual & Friendly" persona fails for generated topics
   * **Expected (after fix)**: ALL captions have casual characteristics
   * **Actual (on unfixed code)**: Random topics surface additional counterexamples
   * 
   * **PBT Approach**: Generate random topics and verify persona enforcement
   * **NOTE**: Reduced to 3 iterations per user instruction for faster execution
   * 
   * **Validates: Requirements 2.4, 2.6 (ABSOLUTE REQUIREMENTS)**
   */
  test('should enforce "Casual & Friendly" persona for any topic (property-based, reduced)', async () => {
    const topicGenerator = fc.oneof(
      fc.constant('weekend plans'),
      fc.constant('favorite meal'),
      fc.constant('music discovery'),
      fc.constant('hobby update')
    );

    await fc.assert(
      fc.asyncProperty(topicGenerator, async (topic) => {
        const preferences: UserAIPreferences = {
          aiPersona: 'Casual & Friendly',
          aiModel: 'veegpt-hybrid',
          creativityLevel: 0.7,
          contentSafety: 'standard'
        };

        const caption = await aiServiceManager.generateCaption(topic, preferences);
        const validation = validateCasualPersona(caption);

        if (!validation.isValid) {
          console.log(`\n❌ PBT Counterexample found (Casual):`);
          console.log(`Topic: "${topic}"`);
          console.log(`Caption: "${caption}"`);
          console.log(`Violations:`, validation.violations);
          
          counterexamples.push({
            topic,
            persona: 'Casual & Friendly',
            caption,
            violations: validation.violations
          });
        }

        // Property: Caption MUST have casual characteristics
        return validation.isValid;
      }),
      {
        numRuns: 3, // REDUCED from 5 to 3 per user instruction
        timeout: 60000
      }
    );
  }, 180000);

  /**
   * Test Case 6: Property-Based Test - Professional Persona with Random Topics (REDUCED ITERATIONS)
   * 
   * **Bug Condition**: "Professional & Authoritative" persona fails for generated topics
   * **Expected (after fix)**: ALL captions have professional characteristics
   * **Actual (on unfixed code)**: Random topics surface additional counterexamples
   * 
   * **PBT Approach**: Generate random topics and verify persona enforcement
   * **NOTE**: Reduced to 3 iterations per user instruction for faster execution
   * 
   * **Validates: Requirements 2.5, 2.6 (ABSOLUTE REQUIREMENTS)**
   */
  test('should enforce "Professional & Authoritative" persona for any topic (property-based, reduced)', async () => {
    const topicGenerator = fc.oneof(
      fc.constant('market analysis'),
      fc.constant('leadership insights'),
      fc.constant('innovation trends')
    );

    await fc.assert(
      fc.asyncProperty(topicGenerator, async (topic) => {
        const preferences: UserAIPreferences = {
          aiPersona: 'Professional & Authoritative',
          aiModel: 'veegpt-hybrid',
          creativityLevel: 0.7,
          contentSafety: 'standard'
        };

        const caption = await aiServiceManager.generateCaption(topic, preferences);
        const validation = validateProfessionalPersona(caption);

        if (!validation.isValid) {
          console.log(`\n❌ PBT Counterexample found (Professional):`);
          console.log(`Topic: "${topic}"`);
          console.log(`Caption: "${caption}"`);
          console.log(`Violations:`, validation.violations);
          
          counterexamples.push({
            topic,
            persona: 'Professional & Authoritative',
            caption,
            violations: validation.violations
          });
        }

        // Property: Caption MUST have professional/authoritative characteristics
        return validation.isValid;
      }),
      {
        numRuns: 3, // REDUCED from 5 to 3 per user instruction
        timeout: 60000
      }
    );
  }, 180000);
});
