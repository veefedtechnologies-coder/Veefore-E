/**
 * PromptConstructorService Unit Tests
 * 
 * Tests the 6-layer prompt construction architecture for authentic caption generation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PromptConstructorService, PromptConstructionParams } from './PromptConstructorService';
import { VoiceProfileService, VoiceProfile } from './VoiceProfileService';
import { viralPatternService } from './ViralPatternService';
import { nicheContextService } from './NicheContextService';
import { exampleCaptionService } from './ExampleCaptionService';

// Mock dependencies
vi.mock('./ViralPatternService');
vi.mock('./NicheContextService');
vi.mock('./ExampleCaptionService');

describe('PromptConstructorService', () => {
  let service: PromptConstructorService;
  let mockVoiceProfileService: any;

  const mockVoiceProfile: VoiceProfile = {
    userId: 'user123',
    workspaceId: 'workspace123',
    vocabularyFrequency: { 'love': 0.05, 'amazing': 0.03, 'vibes': 0.02 },
    signaturePhrases: ["let's be real", "here's the thing"],
    sentenceLengthDistribution: { short: 30, medium: 50, long: 20 },
    paragraphStructure: 'short-breaks',
    emojiUsagePattern: {
      frequency: 'moderate',
      placement: 'inline',
      topEmojis: ['✨', '💯', '🔥'],
    },
    punctuationStyle: {
      exclamationUsage: 'moderate',
      questionUsage: 'frequent',
      ellipsisUsage: true,
    },
    toneMarkers: {
      casual: 0.8,
      professional: 0.2,
      humorous: 0.6,
      inspirational: 0.4,
      educational: 0.3,
      conversational: 0.9,
    },
    hookPatterns: ['You know what', 'Hot take', 'Real talk'],
    engagementQuestionStyle: ['What about you?', 'Anyone else?', 'Drop a comment!'],
    storytellingStructure: 'buildup',
    sampleSize: 15,
    confidence: 0.87,
    lastUpdated: new Date(),
    createdAt: new Date(),
  };

  beforeEach(() => {
    // Create mock voice profile service
    mockVoiceProfileService = {
      getProfile: vi.fn(),
      voiceProfileToPrompt: vi.fn(),
    } as any;

    service = new PromptConstructorService(mockVoiceProfileService);

    // Setup default mock returns
    mockVoiceProfileService.getProfile.mockResolvedValue(mockVoiceProfile);
    mockVoiceProfileService.voiceProfileToPrompt.mockReturnValue('Mock voice profile prompt');

    (viralPatternService.getRelevantPatterns as any).mockResolvedValue([
      {
        id: 'pattern1',
        name: 'Story-Insight-Question',
        category: 'structure',
        pattern: 'Personal story → Key insight → Engagement question',
        description: 'Classic engagement structure',
        niches: ['fitness'],
        postTypes: ['post'],
        avgEngagementRate: 4.5,
        usageCount: 100,
        successRate: 0.85,
        exampleCaptions: ['Started my fitness journey... learned that consistency beats intensity. What motivates you?'],
        trending: true,
        lastUsed: new Date(),
        createdAt: new Date(),
      },
    ]);

    (viralPatternService.getViralHooks as any).mockResolvedValue([
      {
        id: 'hook1',
        hookText: 'Hot take:',
        niche: 'fitness',
        avgEngagementBoost: 12.5,
        usageCount: 50,
        createdAt: new Date(),
      },
    ]);

    (nicheContextService.getNicheContext as any).mockResolvedValue({
      id: 'niche1',
      niche: 'fitness',
      vocabulary: ['gains', 'PR', 'macros', 'shredded'],
      slangTerms: { 'PR': 'Personal Record', 'gains': 'muscle growth' },
      culturalReferences: ['gym bro culture', 'transformation journey'],
      trendingTopics: ['75 Hard Challenge', 'Protein intake myths'],
      trendingHashtags: ['#FitnessJourney', '#GymTok'],
      trendingPhrases: ['no days off', 'trust the process'],
      typicalEmojis: ['💪', '🔥', '💯'],
      toneGuidelines: 'Motivational but realistic, no toxic positivity',
      lastUpdated: new Date(),
    });

    (exampleCaptionService.getExamplesForGeneration as any).mockResolvedValue([
      {
        id: 'example1',
        caption: 'Real talk: I used to think lifting heavy = instant gains. Wrong. Consistency + proper form + recovery = actual results. 6 months in and finally seeing progress. What took you the longest to learn?',
        source: 'curated',
        niche: 'fitness',
        postType: 'post',
        style: 'storytelling',
        engagementRate: 5.2,
        likes: 1000,
        comments: 50,
        saves: 75,
        shares: 10,
        captionLength: 180,
        hookType: 'hot-take',
        hasQuestion: true,
        hasEmoji: false,
        emojiCount: 0,
        capturedAt: new Date(),
        verified: true,
      },
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('buildGenerationPrompt', () => {
    const baseParams: PromptConstructionParams = {
      userId: 'user123',
      workspaceId: 'workspace123',
      postType: 'post',
      platform: 'Instagram',
      aiPreferences: {
        contentNiche: 'fitness',
        optimizationGoals: 'Engagement',
        contentSafety: 'standard',
      },
    };

    it('should build a complete 6-layer prompt', async () => {
      const prompt = await service.buildGenerationPrompt(baseParams);

      // Check that all 6 layers are present
      expect(prompt).toContain('LAYER 1: BASE CONTEXT');
      expect(prompt).toContain('LAYER 2: VOICE PROFILE');
      expect(prompt).toContain('LAYER 3: VIRAL PATTERNS');
      expect(prompt).toContain('LAYER 4: NICHE CONTEXT');
      expect(prompt).toContain('LAYER 5: EXAMPLES');
      expect(prompt).toContain('LAYER 6: YOUR SPECIFIC TASK');
    });

    it('should include platform-specific guidelines in Layer 1', async () => {
      const prompt = await service.buildGenerationPrompt(baseParams);

      expect(prompt).toContain('Instagram');
      expect(prompt).toContain('Story-Insight-Question structure');
      expect(prompt).toContain('Mobile-first readability');
      expect(prompt).toContain('Never include hashtags in caption body');
    });

    it('should include voice profile information in Layer 2', async () => {
      const prompt = await service.buildGenerationPrompt(baseParams);

      expect(mockVoiceProfileService.getProfile).toHaveBeenCalledWith('user123', 'workspace123');
      expect(prompt).toContain('VOICE PROFILE');
      expect(prompt).toContain('87% confidence');
      expect(prompt).toContain('15 analyzed captions');
    });

    it('should handle missing voice profile gracefully', async () => {
      mockVoiceProfileService.getProfile.mockResolvedValue(null);

      const prompt = await service.buildGenerationPrompt(baseParams);

      expect(prompt).toContain('No voice profile available');
      expect(prompt).toContain('Default Voice Guidelines');
    });

    it('should include viral patterns and hooks in Layer 3', async () => {
      const prompt = await service.buildGenerationPrompt(baseParams);

      expect(viralPatternService.getRelevantPatterns).toHaveBeenCalledWith('fitness', 'post', 3);
      expect(viralPatternService.getViralHooks).toHaveBeenCalledWith('fitness', 5);
      expect(prompt).toContain('Story-Insight-Question');
      expect(prompt).toContain('Hot take:');
      expect(prompt).toContain('ADAPT these patterns');
    });

    it('should include niche context in Layer 4', async () => {
      const prompt = await service.buildGenerationPrompt(baseParams);

      expect(nicheContextService.getNicheContext).toHaveBeenCalledWith('fitness');
      expect(prompt).toContain('FITNESS NICHE CONTEXT');
      expect(prompt).toContain('gains');
      expect(prompt).toContain('PR');
      expect(prompt).toContain('75 Hard Challenge');
    });

    it('should include examples in Layer 5', async () => {
      const prompt = await service.buildGenerationPrompt(baseParams);

      expect(exampleCaptionService.getExamplesForGeneration).toHaveBeenCalledWith('fitness', 'post', 3);
      expect(prompt).toContain('Real talk: I used to think');
      expect(prompt).toContain('5.20% engagement');
    });

    it('should include task-specific constraints in Layer 6', async () => {
      const prompt = await service.buildGenerationPrompt(baseParams);

      expect(prompt).toContain('Generate 3 DISTINCT VARIATIONS');
      expect(prompt).toContain('VARIATION 1 - Maximum Virality');
      expect(prompt).toContain('VARIATION 2 - Authentic Storytelling');
      expect(prompt).toContain('VARIATION 3 - Balanced Engagement');
      expect(prompt).toContain('Score minimum 80/100 on authenticity');
    });

    it('should include media analysis when provided', async () => {
      const paramsWithMedia = {
        ...baseParams,
        mediaAnalysis: 'Image shows person doing a deadlift in a gym',
      };

      const prompt = await service.buildGenerationPrompt(paramsWithMedia);

      expect(prompt).toContain('VISUAL CONTENT ANALYSIS');
      expect(prompt).toContain('person doing a deadlift');
    });

    it('should include existing caption when provided', async () => {
      const paramsWithExisting = {
        ...baseParams,
        existingCaption: 'Check out my workout today!',
      };

      const prompt = await service.buildGenerationPrompt(paramsWithExisting);

      expect(prompt).toContain('EXISTING CAPTION TO IMPROVE');
      expect(prompt).toContain('Check out my workout today!');
    });

    it('should handle different post types correctly', async () => {
      // Test story
      const storyParams = { ...baseParams, postType: 'story' as const };
      const storyPrompt = await service.buildGenerationPrompt(storyParams);
      expect(storyPrompt).toContain('Ultra-casual, 1-2 sentences max');
      expect(storyPrompt).toContain('1-2 sentences (ultra-short)');

      // Test reel
      const reelParams = { ...baseParams, postType: 'reel' as const };
      const reelPrompt = await service.buildGenerationPrompt(reelParams);
      expect(reelPrompt).toContain('Hook-first structure');
      expect(reelPrompt).toContain('50-150 characters');
    });

    it('should handle different content safety levels', async () => {
      // Strict safety
      const strictParams = {
        ...baseParams,
        aiPreferences: { ...baseParams.aiPreferences, contentSafety: 'strict' },
      };
      const strictPrompt = await service.buildGenerationPrompt(strictParams);
      expect(strictPrompt).toContain('Avoid ANY potentially controversial statements');
      expect(strictPrompt).toContain('Family-friendly language only');

      // Safety off
      const offParams = {
        ...baseParams,
        aiPreferences: { ...baseParams.aiPreferences, contentSafety: 'off' },
      };
      const offPrompt = await service.buildGenerationPrompt(offParams);
      expect(offPrompt).toContain('Creative freedom');
      expect(offPrompt).toContain('Allow edgy content');
    });

    it('should handle errors gracefully when services fail', async () => {
      (viralPatternService.getRelevantPatterns as any).mockRejectedValue(new Error('Service error'));
      (nicheContextService.getNicheContext as any).mockRejectedValue(new Error('Service error'));

      const prompt = await service.buildGenerationPrompt(baseParams);

      // Should still generate a prompt even if some layers fail
      expect(prompt).toContain('LAYER 1: BASE CONTEXT');
      expect(prompt).toContain('LAYER 6: YOUR SPECIFIC TASK');
    });

    it('should use default niche when not provided', async () => {
      const paramsWithoutNiche = {
        ...baseParams,
        aiPreferences: { optimizationGoals: 'Engagement' },
      };

      await service.buildGenerationPrompt(paramsWithoutNiche);

      expect(viralPatternService.getRelevantPatterns).toHaveBeenCalledWith('lifestyle', 'post', 3);
      expect(nicheContextService.getNicheContext).toHaveBeenCalledWith('lifestyle');
    });

    it('should load all context data in parallel', async () => {
      const startTime = Date.now();
      await service.buildGenerationPrompt(baseParams);
      const endTime = Date.now();

      // Verify all services were called
      expect(mockVoiceProfileService.getProfile).toHaveBeenCalled();
      expect(viralPatternService.getRelevantPatterns).toHaveBeenCalled();
      expect(viralPatternService.getViralHooks).toHaveBeenCalled();
      expect(nicheContextService.getNicheContext).toHaveBeenCalled();
      expect(exampleCaptionService.getExamplesForGeneration).toHaveBeenCalled();

      // Should complete quickly (parallel loading)
      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should include AI tell warnings in Layer 1', async () => {
      const prompt = await service.buildGenerationPrompt(baseParams);

      expect(prompt).toContain('WHAT TO AVOID (AI Tells - Never use these)');
      expect(prompt).toContain('delve');
      expect(prompt).toContain('leverage');
      expect(prompt).toContain('synergy');
      expect(prompt).toContain("Let's dive in");
    });

    it('should include authentic writing characteristics', async () => {
      const prompt = await service.buildGenerationPrompt(baseParams);

      expect(prompt).toContain('AUTHENTIC WRITING CHARACTERISTICS');
      expect(prompt).toContain('Natural conversational tone');
      expect(prompt).toContain('Varied sentence lengths');
      expect(prompt).toContain('Casual contractions');
    });

    it('should format prompt with clear layer separations', async () => {
      const prompt = await service.buildGenerationPrompt(baseParams);

      // Check for separator lines between layers
      const separatorCount = (prompt.match(/━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━/g) || []).length;
      expect(separatorCount).toBeGreaterThanOrEqual(5); // At least 5 separators for 6 layers
    });
  });

  describe('Error handling', () => {
    const baseParams: PromptConstructionParams = {
      userId: 'user123',
      workspaceId: 'workspace123',
      postType: 'post',
      platform: 'Instagram',
      aiPreferences: {
        contentNiche: 'fitness',
      },
    };

    it('should handle voice profile service errors', async () => {
      mockVoiceProfileService.getProfile.mockRejectedValue(new Error('Database error'));

      const prompt = await service.buildGenerationPrompt(baseParams);

      expect(prompt).toContain('No voice profile available');
    });

    it('should handle viral pattern service errors', async () => {
      (viralPatternService.getRelevantPatterns as any).mockRejectedValue(new Error('Service error'));

      const prompt = await service.buildGenerationPrompt(baseParams);

      expect(prompt).toContain('No specific patterns available');
    });

    it('should handle niche context service errors', async () => {
      (nicheContextService.getNicheContext as any).mockRejectedValue(new Error('Service error'));

      const prompt = await service.buildGenerationPrompt(baseParams);

      expect(prompt).toContain('No niche context available');
    });

    it('should handle example caption service errors', async () => {
      (exampleCaptionService.getExamplesForGeneration as any).mockRejectedValue(new Error('Service error'));

      const prompt = await service.buildGenerationPrompt(baseParams);

      expect(prompt).toContain('No examples available');
    });
  });

  describe('Voice profile formatting', () => {
    it('should format voice profile with default profile data', async () => {
      const service = new PromptConstructorService(); // No voice profile service

      const params: PromptConstructionParams = {
        userId: 'user123',
        workspaceId: 'workspace123',
        postType: 'post',
        platform: 'Instagram',
        aiPreferences: {
          contentNiche: 'fitness',
        },
      };

      const prompt = await service.buildGenerationPrompt(params);

      expect(prompt).toContain('LAYER 2: VOICE PROFILE');
    });
  });

  describe('Public formatting methods', () => {
    let service: PromptConstructorService;

    beforeEach(() => {
      service = new PromptConstructorService();
    });

    describe('voiceProfileToPrompt', () => {
      it('should format a voice profile into prompt text', () => {
        const result = service.voiceProfileToPrompt(mockVoiceProfile);

        expect(result).toContain('CRITICAL: Match this user\'s EXACT writing style');
        expect(result).toContain('VOCABULARY: "love", "amazing", "vibes"');
        expect(result).toContain('SIGNATURE PHRASES: "let\'s be real", "here\'s the thing"');
        expect(result).toContain('SENTENCE LENGTH: 30% short, 50% medium, 20% long');
        expect(result).toContain('87% confidence based on 15 analyzed captions');
      });

      it('should handle null voice profile', () => {
        const result = service.voiceProfileToPrompt(null);

        expect(result).toContain('No voice profile available');
        expect(result).toContain('Default Voice Guidelines');
        expect(result).toContain('Conversational and relatable tone');
      });

      it('should handle voice profile with no samples', () => {
        const emptyProfile = { ...mockVoiceProfile, sampleSize: 0 };
        const result = service.voiceProfileToPrompt(emptyProfile);

        expect(result).toContain('No voice profile available');
      });
    });

    describe('viralPatternsToPrompt', () => {
      const mockPatterns = [
        {
          id: 'p1',
          name: 'Hook-Story-CTA',
          category: 'structure' as const,
          pattern: 'Hook → Story → Call to action',
          description: 'Engaging structure',
          niches: ['fitness'],
          postTypes: ['post' as const],
          avgEngagementRate: 5.2,
          usageCount: 100,
          successRate: 0.85,
          exampleCaptions: ['Example caption here'],
          trending: true,
          lastUsed: new Date(),
          createdAt: new Date(),
        },
      ];

      const mockHooks = [
        {
          id: 'h1',
          hookText: 'Real talk:',
          niche: 'fitness',
          avgEngagementBoost: 15.3,
          usageCount: 50,
          createdAt: new Date(),
        },
      ];

      it('should format viral patterns and hooks into prompt text', () => {
        const result = service.viralPatternsToPrompt(mockPatterns, mockHooks);

        expect(result).toContain('IMPORTANT: ADAPT these patterns');
        expect(result).toContain('Hook-Story-CTA');
        expect(result).toContain('5.2% avg engagement');
        expect(result).toContain('Real talk:');
        expect(result).toContain('+15.3% engagement boost');
      });

      it('should handle empty patterns and hooks', () => {
        const result = service.viralPatternsToPrompt([], []);

        expect(result).toContain('No specific patterns available');
        expect(result).toContain('Use strong opening statements or questions');
      });
    });

    describe('nicheContextToPrompt', () => {
      const mockContext = {
        id: 'nc1',
        niche: 'fitness',
        vocabulary: ['gains', 'PR', 'macros'],
        slangTerms: { 'PR': 'Personal Record' },
        culturalReferences: ['gym culture'],
        trendingTopics: ['75 Hard Challenge'],
        trendingHashtags: ['#FitnessJourney'],
        trendingPhrases: ['no days off'],
        typicalEmojis: ['💪', '🔥'],
        toneGuidelines: 'Motivational but realistic',
        lastUpdated: new Date(),
      };

      it('should format niche context into prompt text', () => {
        const result = service.nicheContextToPrompt(mockContext);

        expect(result).toContain('FITNESS NICHE CONTEXT');
        expect(result).toContain('75 Hard Challenge');
        expect(result).toContain('gains, PR, macros');
        expect(result).toContain('"PR" (Personal Record)');
        expect(result).toContain('💪 🔥');
        expect(result).toContain('Motivational but realistic');
      });

      it('should handle null niche context', () => {
        const result = service.nicheContextToPrompt(null);

        expect(result).toContain('No niche context available');
      });
    });

    describe('examplesToPrompt', () => {
      const mockExamples = [
        {
          id: 'e1',
          caption: 'This is a great caption about fitness',
          source: 'curated' as const,
          niche: 'fitness',
          postType: 'post',
          style: 'storytelling',
          engagementRate: 6.5,
          likes: 1000,
          comments: 50,
          saves: 75,
          shares: 10,
          captionLength: 150,
          hookType: 'question',
          hasQuestion: true,
          hasEmoji: true,
          emojiCount: 3,
          capturedAt: new Date(),
          verified: true,
        },
      ];

      it('should format example captions into prompt text', () => {
        const result = service.examplesToPrompt(mockExamples, 'post');

        expect(result).toContain('Real High-Performing POSTS');
        expect(result).toContain('EXAMPLE 1 (6.50% engagement)');
        expect(result).toContain('This is a great caption about fitness');
        expect(result).toContain('Hook: question');
        expect(result).toContain('Style: storytelling');
        expect(result).toContain('Includes question');
      });

      it('should handle empty examples', () => {
        const result = service.examplesToPrompt([], 'post');

        expect(result).toContain('No examples available');
        expect(result).toContain('Study general Instagram best practices');
      });
    });

    describe('buildTaskInstructions', () => {
      const baseParams: PromptConstructionParams = {
        userId: 'user123',
        workspaceId: 'workspace123',
        postType: 'post',
        platform: 'Instagram',
        aiPreferences: {
          contentNiche: 'fitness',
          optimizationGoals: 'Engagement',
          contentSafety: 'standard',
        },
      };

      it('should build task instructions with all parameters', () => {
        const result = service.buildTaskInstructions(baseParams);

        expect(result).toContain('POST TYPE: post');
        expect(result).toContain('PLATFORM: Instagram');
        expect(result).toContain('OPTIMIZATION GOAL: Engagement');
        expect(result).toContain('Generate 3 DISTINCT VARIATIONS');
        expect(result).toContain('VARIATION 1 - Maximum Virality');
        expect(result).toContain('VARIATION 2 - Authentic Storytelling');
        expect(result).toContain('VARIATION 3 - Balanced Engagement');
      });

      it('should include media analysis when provided', () => {
        const paramsWithMedia = {
          ...baseParams,
          mediaAnalysis: 'Person doing squats',
        };

        const result = service.buildTaskInstructions(paramsWithMedia);

        expect(result).toContain('VISUAL CONTENT ANALYSIS');
        expect(result).toContain('Person doing squats');
      });

      it('should include existing caption when provided', () => {
        const paramsWithExisting = {
          ...baseParams,
          existingCaption: 'Check out my workout!',
        };

        const result = service.buildTaskInstructions(paramsWithExisting);

        expect(result).toContain('EXISTING CAPTION TO IMPROVE');
        expect(result).toContain('Check out my workout!');
      });

      it('should handle different content safety levels', () => {
        const strictParams = {
          ...baseParams,
          aiPreferences: { ...baseParams.aiPreferences, contentSafety: 'strict' },
        };
        const strictResult = service.buildTaskInstructions(strictParams);
        expect(strictResult).toContain('Avoid ANY potentially controversial statements');

        const offParams = {
          ...baseParams,
          aiPreferences: { ...baseParams.aiPreferences, contentSafety: 'off' },
        };
        const offResult = service.buildTaskInstructions(offParams);
        expect(offResult).toContain('Creative freedom');
      });
    });
  });
});
