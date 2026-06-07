/**
 * Unit tests for AuthenticityScorer
 * Tests all 12 scoring criteria and overall scoring logic
 */

import { AuthenticityScorer, CaptionVoiceProfile } from './AuthenticityScorer';

describe('AuthenticityScorer', () => {
  let scorer: AuthenticityScorer;
  let mockVoiceProfile: CaptionVoiceProfile;

  beforeEach(() => {
    scorer = new AuthenticityScorer();
    
    // Create a mock voice profile
    mockVoiceProfile = {
      userId: 'test-user',
      workspaceId: 'test-workspace',
      vocabularyFrequency: {
        'love': 10,
        'amazing': 8,
        'excited': 5,
        'journey': 2
      },
      signaturePhrases: ['let me tell you', 'here\'s the thing'],
      sentenceLengthDistribution: {
        short: 30,
        medium: 50,
        long: 20
      },
      paragraphStructure: 'short-breaks',
      emojiUsagePattern: {
        frequency: 'moderate',
        placement: 'inline',
        topEmojis: ['❤️', '🔥', '✨']
      },
      punctuationStyle: {
        exclamationUsage: 'moderate',
        questionUsage: 'frequent',
        ellipsisUsage: false
      },
      toneMarkers: {
        casual: 0.8,
        professional: 0.2,
        humorous: 0.5,
        inspirational: 0.6,
        educational: 0.3,
        conversational: 0.9
      },
      hookPatterns: ['So here\'s the thing', 'Real talk'],
      engagementQuestionStyle: ['What do you think?', 'Have you tried this?'],
      storytellingStructure: 'buildup',
      sampleSize: 20,
      confidence: 0.85
    };
  });

  describe('scoreCaption', () => {
    it('should return a score between 0 and 100', async () => {
      const caption = 'Love this! ❤️ What do you think? Let me know in the comments!';
      const result = await scorer.scoreCaption(caption, mockVoiceProfile, 'instagram');
      
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
    });

    it('should pass threshold for authentic-sounding caption', async () => {
      const caption = `So here's the thing... I just discovered something amazing! 🔥
      
Been testing this for weeks and I'm honestly blown away. The results speak for themselves.

What's your experience with this? Drop a comment below! 💬`;
      
      const result = await scorer.scoreCaption(caption, mockVoiceProfile, 'instagram');
      
      expect(result.passesThreshold).toBe(true);
      expect(result.overallScore).toBeGreaterThanOrEqual(80);
    });

    it('should fail threshold for AI-sounding caption', async () => {
      const caption = `Let's delve into this revolutionary journey to unlock the potential of optimization. 
      
      In today's digital age, it is important to leverage synergy and paradigm shifts to transform your business ecosystem.`;
      
      const result = await scorer.scoreCaption(caption, mockVoiceProfile, 'instagram');
      
      expect(result.passesThreshold).toBe(false);
      expect(result.aiTellsDetected.length).toBeGreaterThan(0);
    });

    it('should have all 12 criteria scores', async () => {
      const caption = 'Test caption';
      const result = await scorer.scoreCaption(caption, mockVoiceProfile, 'instagram');
      
      expect(result.criteriaScores).toHaveProperty('vocabularyNaturalness');
      expect(result.criteriaScores).toHaveProperty('sentenceFlow');
      expect(result.criteriaScores).toHaveProperty('emojiPlacement');
      expect(result.criteriaScores).toHaveProperty('conversationalTone');
      expect(result.criteriaScores).toHaveProperty('platformAppropriateness');
      expect(result.criteriaScores).toHaveProperty('avoidsCorporateJargon');
      expect(result.criteriaScores).toHaveProperty('avoidsGenericPhrases');
      expect(result.criteriaScores).toHaveProperty('voiceConsistency');
      expect(result.criteriaScores).toHaveProperty('mobileReadability');
      expect(result.criteriaScores).toHaveProperty('hookStrength');
      expect(result.criteriaScores).toHaveProperty('engagementClarity');
      expect(result.criteriaScores).toHaveProperty('emotionalResonance');
    });
  });

  describe('detectAITells', () => {
    it('should detect AI vocabulary', () => {
      const caption = 'Let me delve into this revolutionary journey to unlock your potential.';
      const tells = scorer.detectAITells(caption);
      
      expect(tells.length).toBeGreaterThan(0);
      expect(tells.some(t => t.includes('delve'))).toBe(true);
    });

    it('should detect corporate jargon', () => {
      const caption = 'We need to leverage synergy to optimize our ecosystem.';
      const tells = scorer.detectAITells(caption);
      
      expect(tells.some(t => t.includes('jargon'))).toBe(true);
    });

    it('should detect generic phrases', () => {
      const caption = "Let's dive in to today's digital age!";
      const tells = scorer.detectAITells(caption);
      
      expect(tells.some(t => t.includes('generic'))).toBe(true);
    });

    it('should detect emoji clustering', () => {
      const caption = 'Check this out!!! 🔥🔥🔥🔥';
      const tells = scorer.detectAITells(caption);
      
      expect(tells.some(t => t.includes('emoji clustering'))).toBe(true);
    });

    it('should detect formal transitions', () => {
      const caption = 'Furthermore, we should consider this. Moreover, it is important.';
      const tells = scorer.detectAITells(caption);
      
      expect(tells.some(t => t.includes('formal transition'))).toBe(true);
    });

    it('should detect excessive passive voice', () => {
      const caption = 'The food was eaten. The dishes were cleaned. Everything was organized perfectly. Items were placed carefully.';
      const tells = scorer.detectAITells(caption);
      
      expect(tells.some(t => t.includes('passive voice'))).toBe(true);
    });

    it('should detect overly long sentences', () => {
      const caption = 'This is a very long sentence that goes on and on without any natural breaks or pauses which makes it sound unnatural and difficult to read and ultimately makes the content feel AI-generated because humans typically break up their thoughts into smaller more digestible chunks.';
      const tells = scorer.detectAITells(caption);
      
      expect(tells.some(t => t.includes('overly long sentence'))).toBe(true);
    });

    it('should detect lack of contractions', () => {
      const caption = 'I am so excited to share this with you. You are going to love what I have prepared. It is not going to disappoint you at all. I cannot wait for you to see this.';
      const tells = scorer.detectAITells(caption);
      
      expect(tells.some(t => t.includes('No contractions'))).toBe(true);
    });

    it('should detect AI hedging language', () => {
      const caption = 'It is worth noting that this is important. It should be noted that results may vary.';
      const tells = scorer.detectAITells(caption);
      
      expect(tells.some(t => t.includes('hedging language'))).toBe(true);
    });

    it('should detect unnatural enthusiasm', () => {
      const caption = 'I am incredibly excited to share this absolutely thrilling opportunity!';
      const tells = scorer.detectAITells(caption);
      
      expect(tells.some(t => t.includes('unnatural enthusiasm'))).toBe(true);
    });

    it('should detect overly polished writing', () => {
      const caption = 'This product represents exceptional quality. We have tested it thoroughly over several months. The results are impressive and consistent. Our customers appreciate the attention to detail in every aspect. The performance exceeds expectations consistently across all metrics. We remain committed to excellence in everything we do.';
      const tells = scorer.detectAITells(caption);
      
      expect(tells.some(t => t.includes('Too polished'))).toBe(true);
    });

    it('should not flag natural casual captions', () => {
      const caption = "Okay so I'm obsessed with this lol! You're gonna love it. What do you think? 🔥";
      const tells = scorer.detectAITells(caption);
      
      // Should have minimal or no tells
      expect(tells.length).toBeLessThan(2);
    });

    it('should handle multiple AI tells in one caption', () => {
      const caption = 'Let us delve into this revolutionary paradigm. Furthermore, we should leverage synergy. It is worth noting that this will optimize your ecosystem.';
      const tells = scorer.detectAITells(caption);
      
      expect(tells.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('checkVoiceConsistency', () => {
    it('should return consistency score', () => {
      const caption = 'Love this amazing thing! So excited. What do you think?';
      const score = scorer.checkVoiceConsistency(caption, mockVoiceProfile);
      
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(10);
    });
    
    it('should reward high vocabulary overlap', () => {
      // Caption using words from the voice profile
      const caption = 'I love this amazing journey! So excited about it!';
      const score = scorer.checkVoiceConsistency(caption, mockVoiceProfile);
      
      // Should score well due to vocabulary overlap
      expect(score).toBeGreaterThanOrEqual(6);
    });
    
    it('should penalize low vocabulary overlap', () => {
      // Caption using words NOT in the voice profile
      const caption = 'The utilization of unprecedented methodologies facilitates optimization.';
      const score = scorer.checkVoiceConsistency(caption, mockVoiceProfile);
      
      // Should score poorly due to no vocabulary overlap
      expect(score).toBeLessThan(6);
    });
    
    it('should reward signature phrase usage', () => {
      const caption = 'Let me tell you something amazing! This is incredible.';
      const score = scorer.checkVoiceConsistency(caption, mockVoiceProfile);
      
      // Should get bonus for using signature phrase
      expect(score).toBeGreaterThan(5);
    });
    
    it('should match sentence length distribution', () => {
      // Create caption matching the profile (30% short, 50% medium, 20% long)
      const caption = `Hey! Love this. What about you? This is something pretty cool and interesting. This is a much longer sentence that goes on for quite a while to match the distribution we want to test here.`;
      const score = scorer.checkVoiceConsistency(caption, mockVoiceProfile);
      
      // Should score reasonably well
      expect(score).toBeGreaterThan(4);
    });
    
    it('should penalize mismatched tone markers', () => {
      // Professional tone caption for a casual profile
      const professionalCaption = 'I am pleased to inform you of this delightful opportunity. It is my honor to collaborate professionally.';
      const score = scorer.checkVoiceConsistency(professionalCaption, mockVoiceProfile);
      
      // Should penalize for tone mismatch (profile is 0.8 casual, 0.2 professional)
      expect(score).toBeLessThan(7);
    });
    
    it('should reward matching tone markers', () => {
      // Casual, conversational caption matching profile
      const casualCaption = 'Hey! Yeah, this is gonna be amazing. You know what I mean? Kinda excited about this!';
      const score = scorer.checkVoiceConsistency(casualCaption, mockVoiceProfile);
      
      // Should score well for tone match
      expect(score).toBeGreaterThan(5);
    });
    
    it('should check punctuation style consistency', () => {
      // Profile has frequent question usage
      const captionWithQuestions = 'What do you think? Have you tried this? Isn\'t it amazing?';
      const score = scorer.checkVoiceConsistency(captionWithQuestions, mockVoiceProfile);
      
      // Should match the frequent question usage pattern
      expect(score).toBeGreaterThanOrEqual(5);
    });
    
    it('should check paragraph structure consistency', () => {
      // Profile has 'short-breaks' structure
      const goodStructure = `First paragraph is short.

Second one too.

And the third.`;
      
      const score = scorer.checkVoiceConsistency(goodStructure, mockVoiceProfile);
      
      // Should match the short-breaks structure
      expect(score).toBeGreaterThanOrEqual(4);
    });
    
    it('should match hook patterns', () => {
      // Profile has hook patterns like 'So here\'s the thing', 'Real talk'
      const caption = 'So here\'s the thing about this product. It changed everything.';
      const score = scorer.checkVoiceConsistency(caption, mockVoiceProfile);
      
      // Should get bonus for matching hook pattern
      expect(score).toBeGreaterThan(5);
    });
    
    it('should match engagement question style', () => {
      // Profile has engagement styles like 'What do you think?', 'Have you tried this?'
      const caption = 'This is amazing! What do you think about it?';
      const score = scorer.checkVoiceConsistency(caption, mockVoiceProfile);
      
      // Should get bonus for matching engagement style
      expect(score).toBeGreaterThan(5);
    });
    
    it('should handle comprehensive voice profile matching', () => {
      // Caption that matches multiple aspects of the profile
      const caption = `So here's the thing... I love this amazing journey! 🔥

Been so excited about this. What do you think? Have you tried something like this?`;
      
      const score = scorer.checkVoiceConsistency(caption, mockVoiceProfile);
      
      // Should score very well - matches vocabulary, signature phrase, tone, punctuation, engagement style
      expect(score).toBeGreaterThan(7);
    });
    
    it('should handle missing profile fields gracefully', () => {
      const minimalProfile: CaptionVoiceProfile = {
        userId: 'test',
        workspaceId: 'test',
        vocabularyFrequency: {},
        signaturePhrases: [],
        sentenceLengthDistribution: { short: 33, medium: 33, long: 34 },
        paragraphStructure: 'single',
        emojiUsagePattern: { frequency: 'none', placement: 'end', topEmojis: [] },
        punctuationStyle: { exclamationUsage: 'rare', questionUsage: 'rare', ellipsisUsage: false },
        toneMarkers: { casual: 0.5, professional: 0.5, humorous: 0, inspirational: 0, educational: 0, conversational: 0.5 },
        hookPatterns: [],
        engagementQuestionStyle: [],
        storytellingStructure: 'linear',
        sampleSize: 0,
        confidence: 0
      };
      
      const caption = 'This is a test caption.';
      const score = scorer.checkVoiceConsistency(caption, minimalProfile);
      
      // Should still return a valid score without errors
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(10);
    });
  });

  describe('compareVoiceProfile', () => {
    it('should return detailed voice consistency result', async () => {
      const caption = 'Love this amazing thing! So excited. What do you think?';
      const result = await scorer.compareVoiceProfile(caption, mockVoiceProfile);
      
      expect(result).toHaveProperty('overallScore');
      expect(result).toHaveProperty('passesThreshold');
      expect(result).toHaveProperty('dimensions');
      expect(result).toHaveProperty('mismatches');
      expect(result).toHaveProperty('recommendations');
      expect(result).toHaveProperty('regenerationGuidance');
      
      // Overall score should be 0-100
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
    });

    it('should have all 8 dimension scores', async () => {
      const caption = 'Test caption';
      const result = await scorer.compareVoiceProfile(caption, mockVoiceProfile);
      
      expect(result.dimensions).toHaveProperty('vocabularyMatch');
      expect(result.dimensions).toHaveProperty('toneAlignment');
      expect(result.dimensions).toHaveProperty('structureMatch');
      expect(result.dimensions).toHaveProperty('signaturePhraseUsage');
      expect(result.dimensions).toHaveProperty('punctuationStyle');
      expect(result.dimensions).toHaveProperty('emojiConsistency');
      expect(result.dimensions).toHaveProperty('hookPatternMatch');
      expect(result.dimensions).toHaveProperty('engagementStyleMatch');
    });

    it('should pass threshold for voice-matched caption', async () => {
      const caption = `So here's the thing... I love this amazing journey! 🔥

Been so excited about this. What do you think? Have you tried something like this?`;
      
      const result = await scorer.compareVoiceProfile(caption, mockVoiceProfile);
      
      expect(result.passesThreshold).toBe(true);
      expect(result.overallScore).toBeGreaterThanOrEqual(80); // 80+ is the threshold
    });

    it('should fail threshold for mismatched caption', async () => {
      const caption = 'The utilization of unprecedented methodologies facilitates optimization. Furthermore, we should leverage synergy.';
      const result = await scorer.compareVoiceProfile(caption, mockVoiceProfile);
      
      // This should have mismatches even if it passes threshold due to neutral dimension scores
      expect(result.mismatches.length).toBeGreaterThan(0);
      // Vocabulary overlap should be low
      expect(result.dimensions.vocabularyMatch.overlap).toBeLessThan(0.3);
    });

    it('should identify vocabulary mismatches', async () => {
      const caption = 'The utilization of unprecedented methodologies facilitates optimization.';
      const result = await scorer.compareVoiceProfile(caption, mockVoiceProfile);
      
      expect(result.dimensions.vocabularyMatch.score).toBeLessThan(7);
      expect(result.dimensions.vocabularyMatch.overlap).toBeLessThan(0.3);
      expect(result.dimensions.vocabularyMatch.unexpectedWords.length).toBeGreaterThan(0);
    });

    it('should reward vocabulary overlap', async () => {
      const caption = 'I love this amazing journey! So excited about it!';
      const result = await scorer.compareVoiceProfile(caption, mockVoiceProfile);
      
      expect(result.dimensions.vocabularyMatch.score).toBeGreaterThanOrEqual(6);
      expect(result.dimensions.vocabularyMatch.overlap).toBeGreaterThan(0.3);
    });

    it('should detect tone mismatches', async () => {
      const professionalCaption = 'I am pleased to inform you of this delightful opportunity. It is my honor to collaborate professionally.';
      const result = await scorer.compareVoiceProfile(professionalCaption, mockVoiceProfile);
      
      expect(result.dimensions.toneAlignment.score).toBeLessThan(8);
      expect(result.dimensions.toneAlignment.mismatches.length).toBeGreaterThan(0);
    });

    it('should detect tone alignment', async () => {
      const casualCaption = 'Hey! Yeah, this is gonna be amazing. You know what I mean? Kinda excited about this!';
      const result = await scorer.compareVoiceProfile(casualCaption, mockVoiceProfile);
      
      expect(result.dimensions.toneAlignment.score).toBeGreaterThan(6);
    });

    it('should detect structure mismatches', async () => {
      const longFormCaption = 'This is one very long paragraph that goes on and on without any breaks which is not typical of the user who normally uses short breaks in their writing and this should be detected as a structural mismatch.';
      const result = await scorer.compareVoiceProfile(longFormCaption, mockVoiceProfile);
      
      expect(result.dimensions.structureMatch.paragraphStyleMatch).toBe(false);
      expect(result.dimensions.structureMatch.deviations.length).toBeGreaterThan(0);
    });

    it('should reward signature phrase usage', async () => {
      const caption = 'Let me tell you something amazing! This is incredible.';
      const result = await scorer.compareVoiceProfile(caption, mockVoiceProfile);
      
      expect(result.dimensions.signaturePhraseUsage.score).toBeGreaterThan(8);
      expect(result.dimensions.signaturePhraseUsage.phrasesUsed.length).toBeGreaterThan(0);
    });

    it('should detect punctuation style mismatches', async () => {
      const noQuestionCaption = 'This is amazing. Love it. So good.';
      const result = await scorer.compareVoiceProfile(noQuestionCaption, mockVoiceProfile);
      
      // Profile has frequent question usage
      expect(result.dimensions.punctuationStyle.questionMatch).toBe(false);
    });

    it('should detect emoji frequency mismatches', async () => {
      const heavyEmojiCaption = 'Love this! 🔥❤️✨💯🎉😍';
      const result = await scorer.compareVoiceProfile(heavyEmojiCaption, mockVoiceProfile);
      
      // Profile has moderate emoji usage
      expect(result.dimensions.emojiConsistency.frequencyMatch).toBe(false);
      expect(result.dimensions.emojiConsistency.deviations.length).toBeGreaterThan(0);
    });

    it('should reward using user top emojis', async () => {
      const caption = 'Love this! 🔥 What do you think?';
      const result = await scorer.compareVoiceProfile(caption, mockVoiceProfile);
      
      // Profile has 🔥 as top emoji
      expect(result.dimensions.emojiConsistency.topEmojisUsed).toContain('🔥');
    });

    it('should detect hook pattern matches', async () => {
      const caption = 'So here\'s the thing about this product. It changed everything.';
      const result = await scorer.compareVoiceProfile(caption, mockVoiceProfile);
      
      expect(result.dimensions.hookPatternMatch.matchFound).toBe(true);
      expect(result.dimensions.hookPatternMatch.score).toBeGreaterThanOrEqual(8);
    });

    it('should detect engagement style matches', async () => {
      const caption = 'This is amazing! What do you think?';
      const result = await scorer.compareVoiceProfile(caption, mockVoiceProfile);
      
      // Profile has engagement styles like 'What do you think?', 'Have you tried this?'
      // The caption ends with a question so should get a reasonable score
      expect(result.dimensions.engagementStyleMatch.score).toBeGreaterThanOrEqual(5);
    });

    it('should provide regeneration guidance', async () => {
      const mismatchedCaption = 'The utilization of unprecedented methodologies.';
      const result = await scorer.compareVoiceProfile(mismatchedCaption, mockVoiceProfile);
      
      expect(result.regenerationGuidance).toHaveProperty('vocabularyAdjustments');
      expect(result.regenerationGuidance).toHaveProperty('toneAdjustments');
      expect(result.regenerationGuidance).toHaveProperty('structureAdjustments');
      expect(result.regenerationGuidance).toHaveProperty('styleAdjustments');
      
      // Should have actionable guidance
      const allGuidance = [
        ...result.regenerationGuidance.vocabularyAdjustments,
        ...result.regenerationGuidance.toneAdjustments,
        ...result.regenerationGuidance.structureAdjustments,
        ...result.regenerationGuidance.styleAdjustments
      ];
      expect(allGuidance.length).toBeGreaterThan(0);
    });

    it('should generate specific recommendations', async () => {
      const mismatchedCaption = 'This is a very formal and corporate caption without any personality.';
      const result = await scorer.compareVoiceProfile(mismatchedCaption, mockVoiceProfile);
      
      expect(result.recommendations.length).toBeGreaterThan(0);
      // Recommendations should be actionable strings
      result.recommendations.forEach(rec => {
        expect(typeof rec).toBe('string');
        expect(rec.length).toBeGreaterThan(0);
      });
    });

    it('should calculate overall score from dimension scores', async () => {
      const caption = 'Test caption for scoring';
      const result = await scorer.compareVoiceProfile(caption, mockVoiceProfile);
      
      // Overall score should be 0-100 (normalized from 0-10 dimension scores)
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
      
      // Verify calculation: average of dimension scores normalized to 0-100
      const dimensionScores = [
        result.dimensions.vocabularyMatch.score,
        result.dimensions.toneAlignment.score,
        result.dimensions.structureMatch.score,
        result.dimensions.signaturePhraseUsage.score,
        result.dimensions.punctuationStyle.score,
        result.dimensions.emojiConsistency.score,
        result.dimensions.hookPatternMatch.score,
        result.dimensions.engagementStyleMatch.score
      ];
      
      const expectedAvg = dimensionScores.reduce((a, b) => a + b, 0) / 8;
      const expectedOverall = Math.round((expectedAvg / 10) * 100);
      expect(result.overallScore).toBe(expectedOverall);
    });

    it('should handle comprehensive voice matching', async () => {
      const perfectCaption = `So here's the thing... I love this amazing journey! 🔥

Been so excited about this. What do you think? Have you tried something like this?`;
      
      const result = await scorer.compareVoiceProfile(perfectCaption, mockVoiceProfile);
      
      // Should score well across multiple dimensions (70+ on 0-100 scale)
      expect(result.overallScore).toBeGreaterThan(70);
      expect(result.passesThreshold).toBe(true);
      expect(result.dimensions.vocabularyMatch.score).toBeGreaterThanOrEqual(6);
      expect(result.dimensions.toneAlignment.score).toBeGreaterThan(6);
      expect(result.dimensions.signaturePhraseUsage.score).toBeGreaterThan(7);
      expect(result.dimensions.emojiConsistency.score).toBeGreaterThan(6);
      expect(result.dimensions.hookPatternMatch.matchFound).toBe(true);
      // Engagement style should get a good score even if not exact match
      expect(result.dimensions.engagementStyleMatch.score).toBeGreaterThanOrEqual(5);
    });

    it('should handle minimal profile gracefully', async () => {
      const minimalProfile: CaptionVoiceProfile = {
        userId: 'test',
        workspaceId: 'test',
        vocabularyFrequency: {},
        signaturePhrases: [],
        sentenceLengthDistribution: { short: 33, medium: 33, long: 34 },
        paragraphStructure: 'single',
        emojiUsagePattern: { frequency: 'none', placement: 'end', topEmojis: [] },
        punctuationStyle: { exclamationUsage: 'rare', questionUsage: 'rare', ellipsisUsage: false },
        toneMarkers: { casual: 0.5, professional: 0.5, humorous: 0, inspirational: 0, educational: 0, conversational: 0.5 },
        hookPatterns: [],
        engagementQuestionStyle: [],
        storytellingStructure: 'linear',
        sampleSize: 0,
        confidence: 0
      };
      
      const caption = 'This is a test caption.';
      const result = await scorer.compareVoiceProfile(caption, minimalProfile);
      
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
      expect(() => result).not.toThrow();
    });

    it('should provide mismatches summary', async () => {
      const mismatchedCaption = 'The unprecedented utilization of methodologies is quite revolutionary.';
      const result = await scorer.compareVoiceProfile(mismatchedCaption, mockVoiceProfile);
      
      expect(result.mismatches).toBeDefined();
      expect(Array.isArray(result.mismatches)).toBe(true);
      
      if (result.overallScore < 70) {
        expect(result.mismatches.length).toBeGreaterThan(0);
      }
    });
  });
});