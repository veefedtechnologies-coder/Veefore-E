import { describe, it, expect, beforeEach } from 'vitest';
import { EngagementPredictor } from './EngagementPredictor';
import type { EngagementPrediction } from '../domain/types';

/**
 * Unit tests for Task 8.3: Engagement comparison logic
 * Tests Requirements: 9.3, 9.6
 */
describe('EngagementPredictor - Task 8.3: Engagement Comparison Logic', () => {
  let predictor: EngagementPredictor;

  beforeEach(() => {
    predictor = new EngagementPredictor();
  });

  describe('performanceFlag (Requirement 9.6)', () => {
    it('should include performanceFlag in prediction results', async () => {
      const caption = `Test caption for engagement prediction`;

      const result = await predictor.predictEngagement(
        caption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      expect(result.performanceFlag).toBeDefined();
      expect(result.performanceFlag?.isBelowAverage).toBeDefined();
      expect(result.performanceFlag?.severity).toBeDefined();
      expect(result.performanceFlag?.suggestions).toBeDefined();
      expect(result.performanceFlag?.weakestFactors).toBeDefined();
    });

    it('should flag weak captions as below average', async () => {
      const weakCaption = `test`;

      const result = await predictor.predictEngagement(
        weakCaption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      // Weak caption should have low scores
      expect(result.factors.hookStrength).toBeLessThan(6);
      expect(result.factors.ctaClarity).toBeLessThan(6);
      
      // Performance flag should be defined
      expect(result.performanceFlag).toBeDefined();
    });

    it('should provide severity levels', async () => {
      const caption = `Test caption`;

      const result = await predictor.predictEngagement(
        caption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      expect(result.performanceFlag?.severity).toMatch(/none|minor|moderate|major/);
    });

    it('should identify weakest factors correctly', async () => {
      const caption = `Random text without proper hook or CTA`;

      const result = await predictor.predictEngagement(
        caption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      const weakFactors = result.performanceFlag?.weakestFactors || [];
      
      // Each weak factor should have proper structure
      weakFactors.forEach(factor => {
        expect(factor.factor).toBeDefined();
        expect(typeof factor.score).toBe('number');
        expect(factor.score).toBeLessThan(6);
        expect(factor.suggestion).toBeDefined();
        expect(factor.suggestion.length).toBeGreaterThan(0);
      });
    });

    it('should provide actionable suggestions', async () => {
      const caption = `Just a simple post`;

      const result = await predictor.predictEngagement(
        caption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      if (result.performanceFlag?.isBelowAverage) {
        expect(result.performanceFlag.suggestions).toBeDefined();
        expect(Array.isArray(result.performanceFlag.suggestions)).toBe(true);
        
        // Suggestions should be meaningful strings
        result.performanceFlag.suggestions.forEach(suggestion => {
          expect(typeof suggestion).toBe('string');
          expect(suggestion.length).toBeGreaterThan(10);
        });
      }
    });
  });

  describe('compareVariations (Requirement 9.3)', () => {
    it('should rank multiple caption variations correctly', async () => {
      // Create three variations with different quality levels
      const variations = [
        {
          caption: `Weak caption`,
          prediction: {
            predictedLikeRate: 3.0,
            predictedCommentRate: 0.5,
            predictedSaveRate: 0.3,
            predictedShareRate: 0.1,
            confidence: 0.7,
            factors: {
              hookStrength: 4,
              readabilityScore: 5,
              ctaClarity: 3,
              emotionalResonance: 4,
              lengthOptimality: 6,
              trendingTopicBonus: 5,
            },
            vsUserAverage: -20,
          } as EngagementPrediction,
        },
        {
          caption: `Strong caption with hook and CTA!`,
          prediction: {
            predictedLikeRate: 7.0,
            predictedCommentRate: 2.0,
            predictedSaveRate: 1.5,
            predictedShareRate: 0.8,
            confidence: 0.9,
            factors: {
              hookStrength: 8,
              readabilityScore: 8,
              ctaClarity: 9,
              emotionalResonance: 7,
              lengthOptimality: 8,
              trendingTopicBonus: 6,
            },
            vsUserAverage: 15,
          } as EngagementPrediction,
        },
        {
          caption: `Medium quality caption`,
          prediction: {
            predictedLikeRate: 5.0,
            predictedCommentRate: 1.2,
            predictedSaveRate: 0.8,
            predictedShareRate: 0.4,
            confidence: 0.8,
            factors: {
              hookStrength: 6,
              readabilityScore: 6,
              ctaClarity: 6,
              emotionalResonance: 6,
              lengthOptimality: 7,
              trendingTopicBonus: 5,
            },
            vsUserAverage: 0,
          } as EngagementPrediction,
        },
      ];

      const ranked = await predictor.compareVariations(variations, 'balanced');

      expect(ranked).toHaveLength(3);
      
      // Should be ranked 1, 2, 3
      expect(ranked[0].rank).toBe(1);
      expect(ranked[1].rank).toBe(2);
      expect(ranked[2].rank).toBe(3);
      
      // Best ranked should have highest overall score
      expect(ranked[0].overallScore).toBeGreaterThanOrEqual(ranked[1].overallScore);
      expect(ranked[1].overallScore).toBeGreaterThanOrEqual(ranked[2].overallScore);
      
      // Best caption should be the "strong" one (index 1 in original array)
      expect(ranked[0].index).toBe(1);
    });

    it('should handle different ranking strategies', async () => {
      const variations = [
        {
          caption: `Caption optimized for likes`,
          prediction: {
            predictedLikeRate: 10.0,
            predictedCommentRate: 0.5,
            predictedSaveRate: 0.3,
            predictedShareRate: 0.1,
            confidence: 0.9,
            factors: {
              hookStrength: 9,
              readabilityScore: 7,
              ctaClarity: 5,
              emotionalResonance: 6,
              lengthOptimality: 8,
              trendingTopicBonus: 7,
            },
            vsUserAverage: 20,
          } as EngagementPrediction,
        },
        {
          caption: `Caption optimized for comments`,
          prediction: {
            predictedLikeRate: 5.0,
            predictedCommentRate: 3.5,
            predictedSaveRate: 0.5,
            predictedShareRate: 0.2,
            confidence: 0.85,
            factors: {
              hookStrength: 7,
              readabilityScore: 8,
              ctaClarity: 10,
              emotionalResonance: 8,
              lengthOptimality: 7,
              trendingTopicBonus: 6,
            },
            vsUserAverage: 10,
          } as EngagementPrediction,
        },
      ];

      // Rank by likes
      const rankedByLikes = await predictor.compareVariations(variations, 'likes');
      expect(rankedByLikes[0].index).toBe(0); // First caption should win

      // Rank by comments
      const rankedByComments = await predictor.compareVariations(variations, 'comments');
      expect(rankedByComments[0].index).toBe(1); // Second caption should win
    });

    it('should identify strengths and weaknesses', async () => {
      const variations = [
        {
          caption: `POV: You just discovered the secret!`,
          prediction: {
            predictedLikeRate: 8.0,
            predictedCommentRate: 2.0,
            predictedSaveRate: 1.5,
            predictedShareRate: 0.8,
            confidence: 0.9,
            factors: {
              hookStrength: 9,  // Strong
              readabilityScore: 8,  // Strong
              ctaClarity: 4,  // Weak
              emotionalResonance: 7,  // Strong
              lengthOptimality: 3,  // Weak
              trendingTopicBonus: 8,  // Strong
            },
            vsUserAverage: 20,
          } as EngagementPrediction,
        },
      ];

      const ranked = await predictor.compareVariations(variations, 'balanced');

      expect(ranked[0].strengths.length).toBeGreaterThan(0);
      expect(ranked[0].weaknesses.length).toBeGreaterThan(0);
      
      // Should identify strong hook
      const strengthsText = ranked[0].strengths.join(' ').toLowerCase();
      expect(strengthsText).toContain('hook');
      
      // Should identify weak CTA or length
      const weaknessesText = ranked[0].weaknesses.join(' ').toLowerCase();
      expect(weaknessesText.length).toBeGreaterThan(0);
    });

    it('should handle single variation', async () => {
      const variations = [
        {
          caption: `Single caption`,
          prediction: {
            predictedLikeRate: 6.0,
            predictedCommentRate: 1.5,
            predictedSaveRate: 1.0,
            predictedShareRate: 0.5,
            confidence: 0.8,
            factors: {
              hookStrength: 6,
              readabilityScore: 7,
              ctaClarity: 6,
              emotionalResonance: 6,
              lengthOptimality: 7,
              trendingTopicBonus: 5,
            },
            vsUserAverage: 5,
          } as EngagementPrediction,
        },
      ];

      const ranked = await predictor.compareVariations(variations, 'balanced');

      expect(ranked).toHaveLength(1);
      expect(ranked[0].rank).toBe(1);
      expect(ranked[0].index).toBe(0);
    });

    it('should rank by saves strategy correctly', async () => {
      const variations = [
        {
          caption: `Regular post`,
          prediction: {
            predictedLikeRate: 7.0,
            predictedCommentRate: 2.0,
            predictedSaveRate: 0.5,  // Low saves
            predictedShareRate: 0.3,
            confidence: 0.8,
            factors: {
              hookStrength: 7,
              readabilityScore: 6,
              ctaClarity: 7,
              emotionalResonance: 6,
              lengthOptimality: 7,
              trendingTopicBonus: 6,
            },
            vsUserAverage: 10,
          } as EngagementPrediction,
        },
        {
          caption: `Educational tips - save for later!`,
          prediction: {
            predictedLikeRate: 5.0,
            predictedCommentRate: 1.0,
            predictedSaveRate: 2.5,  // High saves
            predictedShareRate: 0.5,
            confidence: 0.85,
            factors: {
              hookStrength: 7,
              readabilityScore: 9,
              ctaClarity: 8,
              emotionalResonance: 7,
              lengthOptimality: 8,
              trendingTopicBonus: 6,
            },
            vsUserAverage: 5,
          } as EngagementPrediction,
        },
      ];

      const ranked = await predictor.compareVariations(variations, 'saves');

      expect(ranked).toHaveLength(2);
      // Educational content with high save rate should rank first
      expect(ranked[0].index).toBe(1);
      expect(ranked[0].prediction.predictedSaveRate).toBeGreaterThan(
        ranked[1].prediction.predictedSaveRate
      );
    });

    it('should include performance comparison in strengths/weaknesses', async () => {
      const variations = [
        {
          caption: `Caption performing above average`,
          prediction: {
            predictedLikeRate: 8.0,
            predictedCommentRate: 2.5,
            predictedSaveRate: 1.5,
            predictedShareRate: 0.8,
            confidence: 0.9,
            factors: {
              hookStrength: 8,
              readabilityScore: 8,
              ctaClarity: 8,
              emotionalResonance: 7,
              lengthOptimality: 8,
              trendingTopicBonus: 7,
            },
            vsUserAverage: 25,  // 25% above average
          } as EngagementPrediction,
        },
        {
          caption: `Caption performing below average`,
          prediction: {
            predictedLikeRate: 3.0,
            predictedCommentRate: 0.8,
            predictedSaveRate: 0.3,
            predictedShareRate: 0.1,
            confidence: 0.7,
            factors: {
              hookStrength: 4,
              readabilityScore: 5,
              ctaClarity: 4,
              emotionalResonance: 4,
              lengthOptimality: 6,
              trendingTopicBonus: 5,
            },
            vsUserAverage: -25,  // 25% below average
          } as EngagementPrediction,
        },
      ];

      const ranked = await predictor.compareVariations(variations, 'balanced');

      // Top ranked caption should mention being above average
      const topStrengths = ranked[0].strengths.join(' ');
      expect(topStrengths).toContain('above your average');

      // Bottom ranked caption should mention being below average
      const bottomWeaknesses = ranked[1].weaknesses.join(' ');
      expect(bottomWeaknesses).toContain('below your average');
    });
  });

  describe('Integration: performanceFlag + compareVariations', () => {
    it('should work together for multi-variation generation', { timeout: 90000 }, async () => {
      // Simulate real-world scenario: generate 3 variations, each with predictions
      const caption1 = `Today I want to share something`;
      const caption2 = `Hot take: Consistency beats perfection!

Save this 📌

What do you think?`;
      const caption3 = `5 tips for better content:
1. Be authentic
2. Provide value
3. Engage consistently

Which resonates most?`;

      const pred1 = await predictor.predictEngagement(caption1, 'user123', 'ws456', 'post', 'instagram');
      const pred2 = await predictor.predictEngagement(caption2, 'user123', 'ws456', 'post', 'instagram');
      const pred3 = await predictor.predictEngagement(caption3, 'user123', 'ws456', 'post', 'instagram');

      // All should have performance flags
      expect(pred1.performanceFlag).toBeDefined();
      expect(pred2.performanceFlag).toBeDefined();
      expect(pred3.performanceFlag).toBeDefined();

      // Now compare them
      const variations = [
        { caption: caption1, prediction: pred1 },
        { caption: caption2, prediction: pred2 },
        { caption: caption3, prediction: pred3 },
      ];

      const ranked = await predictor.compareVariations(variations, 'balanced');

      expect(ranked).toHaveLength(3);
      expect(ranked[0].rank).toBe(1);
      expect(ranked[1].rank).toBe(2);
      expect(ranked[2].rank).toBe(3);

      // Best caption should have better overall characteristics
      expect(ranked[0].overallScore).toBeGreaterThan(ranked[2].overallScore);
    });
  });
});
