/**
 * Authentic Instagram Caption Generation - Integration Test
 * 
 * Tests Task 23.1: Complete flow integration
 * - Voice profile setup → caption generation → variation selection → performance tracking
 * - All services integrate correctly with AIContentGenerator
 * - Database queries and indexes work correctly
 * - API endpoints function with various inputs
 * 
 * Requirements: All requirements (1-12)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { connectionManager } from '../infrastructure/mongodb-connection';
import { VoiceProfileService } from '../services/VoiceProfileService';
import { viralPatternService } from '../services/ViralPatternService';
import { nicheContextService } from '../services/NicheContextService';
import { exampleCaptionService } from '../services/ExampleCaptionService';
import { authenticityScorer } from '../services/AuthenticityScorer';
import { engagementPredictor } from '../services/EngagementPredictor';
import { promptConstructorService } from '../services/PromptConstructorService';
import { aiServiceManager } from '../services/AIServiceManager';
import { FeedbackCaptureService } from '../services/FeedbackCaptureService';
import { generatedCaptionRepository } from '../repositories/GeneratedCaptionRepository';
import mongoose from 'mongoose';

// Test data
const TEST_USER_ID = 'test-integration-user-123';
const TEST_WORKSPACE_ID = 'test-integration-workspace-456';

// Service instances
let voiceProfileService: VoiceProfileService;
let feedbackCaptureService: FeedbackCaptureService;

describe('Authentic Caption Generation - Integration Tests', () => {
  beforeAll(async () => {
    // Ensure database connection
    await connectionManager.connect();
    
    // Initialize services
    const mongoClient = mongoose.connection.getClient();
    const dbName = process.env.MONGODB_DB_NAME || 'veeforedb';
    voiceProfileService = new VoiceProfileService(mongoClient, dbName);
    feedbackCaptureService = new FeedbackCaptureService(mongoClient, dbName);
  });


  describe('1. Voice Profile Integration', () => {
    it('should create voice profile from sample captions', async () => {
      const sampleCaptions = [
        "Can't stop thinking about this workout 💪 Who's ready to crush Monday?",
        "Real talk: consistency > perfection. Small wins add up! 🔥",
        "Here's what nobody tells you about meal prep...",
        "POV: You finally hit that PR 🎯 Let's goooo!",
        "Not gonna lie, today was rough. But we showed up anyway 💯"
      ];

      const profile = await voiceProfileService.analyzeAndCreateProfile(
        TEST_USER_ID,
        TEST_WORKSPACE_ID,
        sampleCaptions
      );

      // Verify profile was created with correct structure
      expect(profile).toBeDefined();
      expect(profile.userId).toBe(TEST_USER_ID);
      expect(profile.workspaceId).toBe(TEST_WORKSPACE_ID);
      expect(profile.sampleSize).toBe(5);
      expect(profile.confidence).toBeGreaterThan(0);
      
      // Verify voice characteristics were extracted
      expect(profile.vocabularyFrequency).toBeDefined();
      expect(Object.keys(profile.vocabularyFrequency).length).toBeGreaterThan(0);
      expect(profile.emojiUsagePattern).toBeDefined();
      expect(profile.toneMarkers).toBeDefined();
    });

    it('should retrieve existing voice profile', async () => {
      const sampleCaptions = [
        "Testing voice profile retrieval 🚀",
        "Another test caption for consistency",
        "Making sure the profile sticks around"
      ];

      // Create profile
      await voiceProfileService.analyzeAndCreateProfile(
        TEST_USER_ID,
        TEST_WORKSPACE_ID,
        sampleCaptions
      );

      // Retrieve profile
      const retrieved = await voiceProfileService.getProfile(
        TEST_USER_ID,
        TEST_WORKSPACE_ID
      );

      expect(retrieved).toBeDefined();
      expect(retrieved.userId).toBe(TEST_USER_ID);
      expect(retrieved.workspaceId).toBe(TEST_WORKSPACE_ID);
    });
  });

  describe('2. Viral Pattern and Niche Context Integration', () => {
    it('should load relevant patterns and context for fitness niche', async () => {
      const patterns = await viralPatternService.getRelevantPatterns('fitness', 'post', 3);
      const hooks = await viralPatternService.getViralHooks('fitness', 5);
      const context = await nicheContextService.getNicheContext('fitness');

      expect(patterns).toBeDefined();
      expect(Array.isArray(patterns)).toBe(true);
      
      expect(hooks).toBeDefined();
      expect(Array.isArray(hooks)).toBe(true);
      
      expect(context).toBeDefined();
      expect(context.niche).toBe('fitness');
      expect(context.vocabulary.length).toBeGreaterThan(0);
    });
  });

  describe('3. End-to-End Caption Generation Flow', () => {
    // Skip if no AI keys configured
    const hasAIKeys = process.env.GOOGLE_API_KEY || process.env.OPENAI_API_KEY;
    const testCondition = hasAIKeys ? it : it.skip;

    testCondition('should generate captions with full context integration', async () => {
      // Step 1: Create voice profile
      const sampleCaptions = [
        "Can't stop thinking about this workout 💪 Who's ready to crush Monday?",
        "Real talk: consistency > perfection. Small wins add up! 🔥",
        "Here's what nobody tells you about meal prep...",
        "POV: You finally hit that PR 🎯 Let's goooo!",
        "Not gonna lie, today was rough. But we showed up anyway 💯"
      ];

      await voiceProfileService.analyzeAndCreateProfile(
        TEST_USER_ID,
        TEST_WORKSPACE_ID,
        sampleCaptions
      );

      // Step 2: Generate captions using AIServiceManager
      const params = {
        userId: TEST_USER_ID,
        workspaceId: TEST_WORKSPACE_ID,
        topic: 'Morning workout routine and healthy breakfast',
        postType: 'post' as const,
        platform: 'Instagram',
        preferences: {
          contentNiche: 'fitness',
          aiModel: 'veegpt-hybrid',
          creativityLevel: 0.7,
          aiPersona: 'Energetic & Motivational',
          captionStyle: 'Authentic & Relatable',
          optimizationGoals: 'Engagement'
        }
      };

      const variations = await aiServiceManager.generateInstagramCaptions(params);

      // Verify variations were generated
      expect(variations).toBeDefined();
      expect(Array.isArray(variations)).toBe(true);
      expect(variations.length).toBe(3);

      // Verify each variation structure
      variations.forEach((variation, index) => {
        expect(variation.caption).toBeDefined();
        expect(variation.caption.length).toBeGreaterThan(0);
        expect(variation.style).toBeDefined();
        expect(['viral', 'authentic', 'balanced']).toContain(variation.style);
        expect(variation.styleDescription).toBeDefined();
        
        console.log(`\nVariation ${index + 1} (${variation.style}):`);
        console.log(variation.caption);
      });

      // Verify we have one of each style
      const styles = variations.map(v => v.style);
      expect(styles).toContain('viral');
      expect(styles).toContain('authentic');
      expect(styles).toContain('balanced');
    }, 90000); // 90 second timeout for AI generation
  });

  describe('4. Authenticity Scoring Integration', () => {
    it('should score captions against voice profile', async () => {
      // Create voice profile
      const sampleCaptions = [
        "Can't believe this happened! 😱",
        "Real talk: this is exactly what I needed",
        "POV: crushing goals and living my best life"
      ];

      await voiceProfileService.analyzeAndCreateProfile(
        TEST_USER_ID,
        TEST_WORKSPACE_ID,
        sampleCaptions
      );

      const profile = await voiceProfileService.getProfile(
        TEST_USER_ID,
        TEST_WORKSPACE_ID
      );

      // Score a caption that matches the voice
      const matchingCaption = "Can't stop thinking about this! Real talk, it's amazing 💯";
      const score = await authenticityScorer.scoreCaption(
        matchingCaption,
        profile,
        'Instagram'
      );

      expect(score).toBeDefined();
      expect(score.overallScore).toBeGreaterThanOrEqual(0);
      expect(score.overallScore).toBeLessThanOrEqual(100);
      expect(score.criteriaScores).toBeDefined();
      expect(Object.keys(score.criteriaScores).length).toBe(12);
    });

    it('should detect AI tells in corporate captions', async () => {
      const corporateCaption = "Let's delve into the journey of unlocking synergistic leverage to revolutionize your paradigm.";
      
      // Get default profile for scoring
      const profile = await voiceProfileService.getProfile(
        TEST_USER_ID,
        TEST_WORKSPACE_ID
      );

      const score = await authenticityScorer.scoreCaption(
        corporateCaption,
        profile,
        'Instagram'
      );

      expect(score.aiTellsDetected.length).toBeGreaterThan(0);
      expect(score.overallScore).toBeLessThan(60); // Should score low
    });
  });

  describe('5. Engagement Prediction Integration', () => {
    it('should predict engagement for captions', async () => {
      const caption = "Morning workout complete! 💪 Who's crushing their fitness goals today? Drop a 🔥 if you're with me!";
      
      const prediction = await engagementPredictor.predictEngagement(
        caption,
        TEST_USER_ID,
        TEST_WORKSPACE_ID,
        'post',
        'Instagram'
      );

      expect(prediction).toBeDefined();
      expect(prediction.predictedLikeRate).toBeGreaterThanOrEqual(0);
      expect(prediction.predictedCommentRate).toBeGreaterThanOrEqual(0);
      expect(prediction.predictedSaveRate).toBeGreaterThanOrEqual(0);
      expect(prediction.predictedShareRate).toBeGreaterThanOrEqual(0);
      expect(prediction.confidence).toBeGreaterThan(0);
      expect(prediction.confidence).toBeLessThanOrEqual(1);
      expect(prediction.factors).toBeDefined();
    });
  });

  describe('6. Feedback Learning Integration', () => {
    it('should capture caption selection feedback', async () => {
      const captionId = 'test-caption-123';
      const variations = [
        {
          caption: 'Variation 1: Viral style',
          style: 'viral' as const,
          hashtags: ['#fitness', '#motivation']
        },
        {
          caption: 'Variation 2: Authentic style',
          style: 'authentic' as const,
          hashtags: ['#reallife', '#journey']
        },
        {
          caption: 'Variation 3: Balanced style',
          style: 'balanced' as const,
          hashtags: ['#balance', '#growth']
        }
      ];

      const feedback = await feedbackCaptureService.captureSelection(
        TEST_USER_ID,
        TEST_WORKSPACE_ID,
        captionId,
        1, // Selected variation index
        variations
      );

      expect(feedback).toBeDefined();
      expect(feedback.feedbackType).toBe('selection');
      expect(feedback.selectedVariation).toBe(1);
      expect(feedback.rejectedVariations).toEqual([0, 2]);
    });

    it('should capture edit feedback', async () => {
      const captionId = 'test-caption-456';
      const originalCaption = "This is the original AI-generated caption.";
      const editedCaption = "This is my edited version with personal touch!";

      const feedback = await feedbackCaptureService.captureEdit(
        TEST_USER_ID,
        TEST_WORKSPACE_ID,
        captionId,
        originalCaption,
        editedCaption
      );

      expect(feedback).toBeDefined();
      expect(feedback.feedbackType).toBe('edit');
      expect(feedback.editsMade).toBeDefined();
      expect(Array.isArray(feedback.editsMade)).toBe(true);
    });
  });

  describe('7. Prompt Constructor Service Integration', () => {
    it('should build comprehensive prompt with all context layers', async () => {
      // Create voice profile
      await voiceProfileService.analyzeAndCreateProfile(
        TEST_USER_ID,
        TEST_WORKSPACE_ID,
        [
          "Love this vibe! 💯",
          "Real talk: consistency is key",
          "POV: living your best life"
        ]
      );

      const params = {
        userId: TEST_USER_ID,
        workspaceId: TEST_WORKSPACE_ID,
        topic: 'Fitness motivation',
        postType: 'post' as const,
        platform: 'Instagram',
        aiPreferences: {
          contentNiche: 'fitness',
          aiModel: 'veegpt-hybrid',
          creativityLevel: 0.7
        }
      };

      const prompt = await promptConstructorService.buildGenerationPrompt(params);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(100);
      
      // Verify prompt contains key sections
      expect(prompt.toLowerCase()).toContain('voice');
      expect(prompt.toLowerCase()).toContain('niche');
    });
  });

  describe('8. Database Query Performance', () => {
    it('should efficiently query voice profiles by userId and workspaceId', async () => {
      // Create multiple profiles
      await voiceProfileService.analyzeAndCreateProfile(
        TEST_USER_ID,
        TEST_WORKSPACE_ID,
        ['Test caption 1', 'Test caption 2']
      );

      const start = Date.now();
      const profile = await voiceProfileService.getProfile(
        TEST_USER_ID,
        TEST_WORKSPACE_ID
      );
      const queryTime = Date.now() - start;

      expect(profile).toBeDefined();
      expect(queryTime).toBeLessThan(1000); // Should complete in under 1 second
    });

    it('should efficiently query viral patterns by niche and postType', async () => {
      const start = Date.now();
      const patterns = await viralPatternService.getRelevantPatterns('fitness', 'post', 5);
      const queryTime = Date.now() - start;

      expect(patterns).toBeDefined();
      expect(Array.isArray(patterns)).toBe(true);
      expect(queryTime).toBeLessThan(1000);
    });

    it('should efficiently query niche context with caching', async () => {
      // First query (cold)
      const start1 = Date.now();
      await nicheContextService.getNicheContext('fitness');
      const coldTime = Date.now() - start1;

      // Second query (cached)
      const start2 = Date.now();
      await nicheContextService.getNicheContext('fitness');
      const cachedTime = Date.now() - start2;

      expect(cachedTime).toBeLessThan(coldTime);
      expect(cachedTime).toBeLessThan(100); // Cache should be very fast
    });
  });

  describe('9. Error Handling and Edge Cases', () => {
    it('should handle missing voice profile gracefully', async () => {
      const profile = await voiceProfileService.getProfile(
        'nonexistent-user',
        'nonexistent-workspace'
      );

      // Should return default profile, not throw error
      expect(profile).toBeDefined();
      expect(profile.confidence).toBe(0);
    });

    it('should handle empty or insufficient sample captions', async () => {
      // Test with less than 5 captions
      await expect(
        voiceProfileService.analyzeAndCreateProfile(
          TEST_USER_ID,
          TEST_WORKSPACE_ID,
          ['Only one caption']
        )
      ).rejects.toThrow();
    });
  });

  describe('10. Cross-Service Data Flow', () => {
    const hasAIKeys = process.env.GOOGLE_API_KEY || process.env.OPENAI_API_KEY;
    const testCondition = hasAIKeys ? it : it.skip;

    testCondition('should flow data correctly from profile to generation to feedback', async () => {
      // Step 1: Create voice profile
      const sampleCaptions = [
        "Can't stop thinking about this! 🔥",
        "Real talk: this changed everything",
        "POV: finally getting it right 💯"
      ];

      const profile = await voiceProfileService.analyzeAndCreateProfile(
        TEST_USER_ID,
        TEST_WORKSPACE_ID,
        sampleCaptions
      );

      expect(profile.userId).toBe(TEST_USER_ID);

      // Step 2: Generate captions (uses voice profile internally)
      const params = {
        userId: TEST_USER_ID,
        workspaceId: TEST_WORKSPACE_ID,
        topic: 'Fitness transformation',
        postType: 'post' as const,
        platform: 'Instagram',
        preferences: {
          contentNiche: 'fitness',
          aiModel: 'veegpt-hybrid',
          creativityLevel: 0.7
        }
      };

      const variations = await aiServiceManager.generateInstagramCaptions(params);
      expect(variations.length).toBe(3);

      // Step 3: Capture feedback
      const feedback = await feedbackCaptureService.captureSelection(
        TEST_USER_ID,
        TEST_WORKSPACE_ID,
        'test-caption-789',
        0,
        variations
      );

      expect(feedback.userId).toBe(TEST_USER_ID);
      expect(feedback.workspaceId).toBe(TEST_WORKSPACE_ID);
      
      console.log('\n✅ Complete data flow validated: Profile → Generation → Feedback');
    }, 90000);
  });
});

