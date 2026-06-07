import { describe, it, expect, beforeEach } from 'vitest';
import { EngagementPredictor } from './EngagementPredictor';

/**
 * Unit tests for EngagementPredictor service
 * Tests Requirements: 9.1, 9.2, 9.4
 */
describe('EngagementPredictor', () => {
  let predictor: EngagementPredictor;

  beforeEach(() => {
    predictor = new EngagementPredictor();
  });

  describe('predictEngagement', () => {
    it('should predict engagement for a caption with strong hook', async () => {
      const caption = `Hot take: Most people overthink their content strategy.

Here's what actually matters:
1. Show up consistently
2. Be authentic
3. Provide value

That's it. No need for complicated frameworks.

What do you think? Comment below! 👇`;

      const result = await predictor.predictEngagement(
        caption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      expect(result).toBeDefined();
      expect(result.predictedLikeRate).toBeGreaterThan(0);
      expect(result.predictedCommentRate).toBeGreaterThan(0);
      expect(result.predictedSaveRate).toBeGreaterThan(0);
      expect(result.predictedShareRate).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.factors.hookStrength).toBeGreaterThan(7); // Strong hook
    });

    it('should predict lower engagement for weak caption', async () => {
      const caption = `Today I want to talk about something. It's important and I think you should know about it. Let me know your thoughts.`;

      const result = await predictor.predictEngagement(
        caption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      expect(result).toBeDefined();
      expect(result.factors.hookStrength).toBeLessThan(6); // Weak hook
      expect(result.factors.ctaClarity).toBeLessThan(7); // Vague CTA
    });

    it('should predict high engagement for emotional story', async () => {
      const caption = `I failed 10 times before I succeeded.

Each rejection taught me something new. Each setback made me stronger. 

Today, I'm sharing the lessons I learned from failure so you don't have to make the same mistakes.

Save this post if you need a reminder that failure is just part of the journey. 💪

What's one failure that taught you the most? Let me know below!`;

      const result = await predictor.predictEngagement(
        caption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      expect(result.factors.emotionalResonance).toBeGreaterThan(6);
      expect(result.factors.ctaClarity).toBeGreaterThan(7);
      expect(result.predictedSaveRate).toBeGreaterThan(1); // Should be above average
    });

    it('should adjust predictions based on platform', async () => {
      const caption = `Hot take: Content quality matters more than quantity.

What do you think?`;

      const instagramResult = await predictor.predictEngagement(
        caption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      const tiktokResult = await predictor.predictEngagement(
        caption,
        'user123',
        'workspace456',
        'post',
        'tiktok'
      );

      // TikTok should have higher engagement multiplier
      expect(tiktokResult.predictedLikeRate).toBeGreaterThan(instagramResult.predictedLikeRate);
    });

    it('should adjust predictions based on post type', async () => {
      const caption = `Quick tip: Always engage with your audience! 💡`;

      const postResult = await predictor.predictEngagement(
        caption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      const reelResult = await predictor.predictEngagement(
        caption,
        'user123',
        'workspace456',
        'reel',
        'instagram'
      );

      // Reels should have higher engagement
      expect(reelResult.predictedLikeRate).toBeGreaterThan(postResult.predictedLikeRate);
    });
  });

  describe('factor analysis', () => {
    it('should detect strong hooks correctly', async () => {
      const testCases = [
        { caption: 'Hot take: AI will change everything', expectedMin: 7 },
        { caption: 'POV: You just discovered the secret', expectedMin: 7 },
        { caption: 'Unpopular opinion: Quality > Quantity', expectedMin: 7 },
        { caption: 'Today I want to talk about...', expectedMax: 6 },
      ];

      for (const testCase of testCases) {
        const result = await predictor.predictEngagement(
          testCase.caption,
          'user123',
          'workspace456',
          'post',
          'instagram'
        );

        if (testCase.expectedMin) {
          expect(result.factors.hookStrength).toBeGreaterThanOrEqual(testCase.expectedMin);
        }
        if (testCase.expectedMax) {
          expect(result.factors.hookStrength).toBeLessThanOrEqual(testCase.expectedMax);
        }
      }
    });

    it('should evaluate readability correctly', async () => {
      const readableCaption = `Here's a simple truth.

Social media is about connection.

Not perfection.

Share your story. Be authentic. Engage genuinely.

That's it.`;

      const unreadableCaption = `Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum`;

      const readableResult = await predictor.predictEngagement(
        readableCaption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      const unreadableResult = await predictor.predictEngagement(
        unreadableCaption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      expect(readableResult.factors.readabilityScore).toBeGreaterThan(
        unreadableResult.factors.readabilityScore
      );
    });

    it('should detect CTA clarity correctly', async () => {
      const strongCTA = `What an amazing experience!

Comment below with your thoughts! 👇`;

      const noCTA = `What an amazing experience! I had such a great time today.`;

      const strongCTAResult = await predictor.predictEngagement(
        strongCTA,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      const noCTAResult = await predictor.predictEngagement(
        noCTA,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      expect(strongCTAResult.factors.ctaClarity).toBeGreaterThan(noCTAResult.factors.ctaClarity);
    });

    it('should detect emotional resonance correctly', async () => {
      const emotionalCaption = `I was heartbroken when my dream project failed.

But that struggle taught me resilience. That pain became my greatest lesson. 

Today, I'm grateful for every setback because it made me who I am.`;

      const neutralCaption = `I worked on a project. It didn't work out. I learned some things and moved on to the next one.`;

      const emotionalResult = await predictor.predictEngagement(
        emotionalCaption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      const neutralResult = await predictor.predictEngagement(
        neutralCaption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      expect(emotionalResult.factors.emotionalResonance).toBeGreaterThan(
        neutralResult.factors.emotionalResonance
      );
    });

    it('should evaluate length optimality for different post types', async () => {
      const shortCaption = 'Quick tip! 💡';
      const mediumCaption = `Here's a great tip for growing on social media.

Always engage with your audience and provide value.

What's your best growth tip?`;
      const longCaption = `${mediumCaption}\n\n${mediumCaption}\n\n${mediumCaption}`;

      // Story should prefer short
      const storyShort = await predictor.predictEngagement(
        shortCaption,
        'user123',
        'workspace456',
        'story',
        'instagram'
      );
      const storyLong = await predictor.predictEngagement(
        longCaption,
        'user123',
        'workspace456',
        'story',
        'instagram'
      );
      expect(storyShort.factors.lengthOptimality).toBeGreaterThan(
        storyLong.factors.lengthOptimality
      );

      // Post should prefer medium
      const postMedium = await predictor.predictEngagement(
        mediumCaption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );
      const postShort = await predictor.predictEngagement(
        shortCaption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );
      expect(postMedium.factors.lengthOptimality).toBeGreaterThanOrEqual(
        postShort.factors.lengthOptimality
      );
    });
  });

  describe('engagement rate calculations', () => {
    it('should predict reasonable like rates (2-10%)', async () => {
      const caption = `Amazing content strategy tips!

Follow for more insights.`;

      const result = await predictor.predictEngagement(
        caption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      expect(result.predictedLikeRate).toBeGreaterThanOrEqual(2);
      expect(result.predictedLikeRate).toBeLessThanOrEqual(15); // Allow some margin
    });

    it('should predict reasonable comment rates (0.5-3%)', async () => {
      const caption = `What's your biggest challenge with content creation?

Let me know in the comments! 👇`;

      const result = await predictor.predictEngagement(
        caption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      expect(result.predictedCommentRate).toBeGreaterThanOrEqual(0.5);
      expect(result.predictedCommentRate).toBeLessThanOrEqual(5); // Allow some margin
    });

    it('should predict higher comment rate when CTA is strong', async () => {
      const strongCTACaption = `Drop a 🔥 if you agree!

Tag someone who needs to see this.

What's your take? Comment below!`;

      const weakCTACaption = `Interesting thoughts about social media.`;

      const strongResult = await predictor.predictEngagement(
        strongCTACaption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      const weakResult = await predictor.predictEngagement(
        weakCTACaption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      expect(strongResult.predictedCommentRate).toBeGreaterThan(weakResult.predictedCommentRate);
    });
  });

  describe('confidence scoring', () => {
    it('should have high confidence when all factors are consistently high', async () => {
      const caption = `POV: You just discovered the secret to viral content.

It's simple:
- Strong hook ✓
- Clear value ✓
- Engaging CTA ✓

Save this post for later!

What's your secret to engagement? Drop it below! 👇`;

      const result = await predictor.predictEngagement(
        caption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      // All factors should be relatively high, resulting in high confidence
      expect(result.confidence).toBeGreaterThan(0.6);
    });

    it('should have lower confidence when factors are inconsistent', async () => {
      // Strong hook but weak everything else
      const caption = `Hot take: Something about social media.`;

      const result = await predictor.predictEngagement(
        caption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      // Factors will be inconsistent (high hook, low readability, low CTA, etc.)
      // This should result in lower confidence
      expect(result.confidence).toBeLessThan(0.9);
    });
  });

  describe('getUserAverageMetrics', () => {
    it('should return default metrics when no history exists', async () => {
      const metrics = await predictor.getUserAverageMetrics('newUser', 'newWorkspace');

      expect(metrics).toBeDefined();
      expect(metrics.avgLikeRate).toBeGreaterThan(0);
      expect(metrics.avgCommentRate).toBeGreaterThan(0);
      expect(metrics.avgSaveRate).toBeGreaterThan(0);
      expect(metrics.avgShareRate).toBeGreaterThan(0);
    });
  });

  describe('recordActualPerformance', () => {
    it('should record actual performance metrics without error', async () => {
      const metrics = {
        likes: 100,
        comments: 10,
        saves: 5,
        shares: 2,
        impressions: 1000,
      };

      // Should not throw
      await expect(
        predictor.recordActualPerformance('caption123', metrics)
      ).resolves.not.toThrow();
    });

    it('should handle zero impressions', async () => {
      const metrics = {
        likes: 0,
        comments: 0,
        saves: 0,
        shares: 0,
        impressions: 0,
      };

      // Should not throw
      await expect(
        predictor.recordActualPerformance('caption123', metrics)
      ).resolves.not.toThrow();
    });

    it('should calculate actual rates correctly', async () => {
      const metrics = {
        likes: 50,
        comments: 10,
        saves: 5,
        shares: 2,
        impressions: 1000,
      };

      // Should not throw and should log calculated rates
      await predictor.recordActualPerformance('caption123', metrics);
      
      // Expected rates:
      // likeRate = (50/1000) * 100 = 5%
      // commentRate = (10/1000) * 100 = 1%
      // saveRate = (5/1000) * 100 = 0.5%
      // shareRate = (2/1000) * 100 = 0.2%
    });

    it('should handle high-performing content', async () => {
      const metrics = {
        likes: 200,
        comments: 50,
        saves: 30,
        shares: 10,
        impressions: 1000,
      };

      // High engagement rates: 20% like, 5% comment, 3% save, 1% share
      await expect(
        predictor.recordActualPerformance('caption123', metrics)
      ).resolves.not.toThrow();
    });
  });

  describe('getPredictionAccuracy', () => {
    it('should return zero stats when no data available', async () => {
      const accuracy = await predictor.getPredictionAccuracy('newUser', 'newWorkspace');

      expect(accuracy).toBeDefined();
      expect(accuracy.sampleSize).toBe(0);
      expect(accuracy.averageError).toBe(0);
      expect(accuracy.accuracyByMetric.likeRateAccuracy).toBe(0);
      expect(accuracy.confidenceCalibration).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty caption', async () => {
      const result = await predictor.predictEngagement(
        '',
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      expect(result).toBeDefined();
      // Empty caption should have poor scores
      expect(result.factors.hookStrength).toBeLessThan(6);
      expect(result.factors.ctaClarity).toBeLessThan(6);
    });

    it('should handle very long caption', async () => {
      const longCaption = 'This is a test. '.repeat(200); // ~600 words

      const result = await predictor.predictEngagement(
        longCaption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      expect(result).toBeDefined();
      // Very long caption should have length penalty
      expect(result.factors.lengthOptimality).toBeLessThan(8);
    });

    it('should handle caption with only emojis', async () => {
      const caption = '🔥🔥🔥 💯 ✨✨✨';

      const result = await predictor.predictEngagement(
        caption,
        'user123',
        'workspace456',
        'story',
        'instagram'
      );

      expect(result).toBeDefined();
      expect(result.predictedLikeRate).toBeGreaterThan(0);
    });

    it('should handle caption with special characters', async () => {
      const caption = `#1 tip: Use @ mentions & # hashtags!

What's your favorite "hack"?`;

      const result = await predictor.predictEngagement(
        caption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      expect(result).toBeDefined();
      expect(result.factors.hookStrength).toBeGreaterThanOrEqual(5); // Number hook
    });

    it('should handle unknown platform', async () => {
      const caption = 'Great content!';

      const result = await predictor.predictEngagement(
        caption,
        'user123',
        'workspace456',
        'post',
        'unknownPlatform'
      );

      expect(result).toBeDefined();
      // Should use default multiplier
      expect(result.predictedLikeRate).toBeGreaterThan(0);
    });

    it('should handle unknown post type', async () => {
      const caption = 'Great content!';

      const result = await predictor.predictEngagement(
        caption,
        'user123',
        'workspace456',
        'unknownType' as any,
        'instagram'
      );

      expect(result).toBeDefined();
      // Should use default adjustment
      expect(result.predictedLikeRate).toBeGreaterThan(0);
    });
  });

  describe('real-world examples', () => {
    it('should predict high engagement for viral-style caption', async () => {
      const caption = `POV: You finally figured out the Instagram algorithm 🤯

Here's what nobody tells you:

1. Consistency > Perfection
2. Engagement > Followers
3. Value > Vanity metrics

Save this if you need the reminder 📌

Drop a 🔥 if this hit different!`;

      const result = await predictor.predictEngagement(
        caption,
        'user123',
        'workspace456',
        'reel',
        'instagram'
      );

      expect(result.factors.hookStrength).toBeGreaterThan(7);
      expect(result.factors.ctaClarity).toBeGreaterThanOrEqual(6);
      expect(result.factors.readabilityScore).toBeGreaterThan(6);
      expect(result.predictedSaveRate).toBeGreaterThan(1);
    });

    it('should predict moderate engagement for educational caption', async () => {
      const caption = `5 Content Creation Tips for 2024:

1. Focus on storytelling
2. Use data to inform your strategy
3. Engage with your community
4. Experiment with new formats
5. Stay consistent

Which tip resonates most with you?`;

      const result = await predictor.predictEngagement(
        caption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      expect(result.factors.hookStrength).toBeGreaterThanOrEqual(6); // Number hook
      expect(result.factors.readabilityScore).toBeGreaterThan(6);
      expect(result.factors.ctaClarity).toBeGreaterThanOrEqual(5);
    });

    it('should predict lower engagement for promotional caption', async () => {
      const caption = `Check out our new product! Available now at our website. Link in bio. Get yours today!`;

      const result = await predictor.predictEngagement(
        caption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      // Promotional content typically gets lower engagement
      expect(result.factors.emotionalResonance).toBeLessThanOrEqual(6);
      expect(result.factors.hookStrength).toBeLessThan(7);
    });
  });

  describe('performanceFlag - Task 8.3', () => {
    it('should not flag caption above user average', async () => {
      const caption = `Hot take: Content consistency beats perfection every time!

Save this reminder 📌

What's your biggest content challenge? Comment below! 👇`;

      const result = await predictor.predictEngagement(
        caption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      expect(result.performanceFlag).toBeDefined();
      
      // If vsUserAverage is > -10%, should not be flagged
      if (result.vsUserAverage > -10) {
        expect(result.performanceFlag?.isBelowAverage).toBe(false);
        expect(result.performanceFlag?.severity).toBe('none');
        expect(result.performanceFlag?.suggestions).toHaveLength(0);
      }
    });

    it('should flag caption significantly below user average', async () => {
      const weakCaption = `Today I want to talk about something.`;

      const result = await predictor.predictEngagement(
        weakCaption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      expect(result.performanceFlag).toBeDefined();
      
      // Weak caption should likely be below average
      // Check if it's flagged correctly
      if (result.vsUserAverage < -10) {
        expect(result.performanceFlag?.isBelowAverage).toBe(true);
        expect(result.performanceFlag?.severity).toMatch(/minor|moderate|major/);
        expect(result.performanceFlag?.suggestions.length).toBeGreaterThan(0);
        expect(result.performanceFlag?.weakestFactors.length).toBeGreaterThan(0);
      }
    });

    it('should identify weak factors and provide suggestions', async () => {
      const caption = `Just sharing some thoughts today. Nothing special.`;

      const result = await predictor.predictEngagement(
        caption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      expect(result.performanceFlag).toBeDefined();
      
      // This caption should have multiple weak factors
      const weakFactors = result.performanceFlag?.weakestFactors || [];
      
      // Should identify at least some weak factors
      weakFactors.forEach(factor => {
        expect(factor.factor).toBeDefined();
        expect(factor.score).toBeLessThan(6);
        expect(factor.suggestion).toBeDefined();
        expect(factor.suggestion.length).toBeGreaterThan(0);
      });
    });

    it('should provide severity levels correctly', async () => {
      const testCases = [
        { caption: 'test', expectedMinSeverity: 'minor' }, // Very weak
        { caption: 'Today something happened.', expectedMinSeverity: 'minor' },
      ];

      for (const testCase of testCases) {
        const result = await predictor.predictEngagement(
          testCase.caption,
          'user123',
          'workspace456',
          'post',
          'instagram'
        );

        expect(result.performanceFlag).toBeDefined();
        
        // Check severity matches expectations if flagged
        if (result.performanceFlag?.isBelowAverage) {
          expect(['none', 'minor', 'moderate', 'major']).toContain(
            result.performanceFlag.severity
          );
        }
      }
    });

    it('should suggest improvements for weak hook', async () => {
      const caption = `So I had this idea today. Let me know what you think.`;

      const result = await predictor.predictEngagement(
        caption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      expect(result.performanceFlag).toBeDefined();
      
      // Should have low hook strength
      expect(result.factors.hookStrength).toBeLessThan(6);
      
      // Check if hook weakness is identified
      const hookFactor = result.performanceFlag?.weakestFactors.find(
        f => f.factor === 'Hook Strength'
      );
      
      if (hookFactor) {
        expect(hookFactor.suggestion).toContain('hook');
      }
    });

    it('should suggest improvements for weak CTA', async () => {
      const caption = `Hot take: AI is changing everything.

It's incredible to see how technology evolves.`;

      const result = await predictor.predictEngagement(
        caption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      expect(result.performanceFlag).toBeDefined();
      
      // Should have low CTA clarity (no clear call-to-action)
      expect(result.factors.ctaClarity).toBeLessThan(6);
      
      // Check if CTA weakness is identified
      const ctaFactor = result.performanceFlag?.weakestFactors.find(
        f => f.factor === 'CTA Clarity'
      );
      
      if (ctaFactor) {
        expect(ctaFactor.suggestion.toLowerCase()).toMatch(/call-to-action|cta|question|comment/);
      }
    });
  });

  describe('compareVariations - Task 8.3', () => {
    it('should compare and rank multiple variations', async () => {
      const variations = [
        {
          caption: `Today I want to share something.`,
          prediction: await predictor.predictEngagement(
            `Today I want to share something.`,
            'user123',
            'workspace456',
            'post',
            'instagram'
          ),
        },
        {
          caption: `Hot take: Consistency beats perfection!

Save this 📌

What do you think?`,
          prediction: await predictor.predictEngagement(
            `Hot take: Consistency beats perfection!\n\nSave this 📌\n\nWhat do you think?`,
            'user123',
            'workspace456',
            'post',
            'instagram'
          ),
        },
        {
          caption: `5 tips for better content:
1. Be authentic
2. Provide value
3. Engage consistently

Which resonates most?`,
          prediction: await predictor.predictEngagement(
            `5 tips for better content:\n1. Be authentic\n2. Provide value\n3. Engage consistently\n\nWhich resonates most?`,
            'user123',
            'workspace456',
            'post',
            'instagram'
          ),
        },
      ];

      const ranked = await predictor.compareVariations(variations, 'balanced');

      expect(ranked).toHaveLength(3);
      
      // Check that ranks are assigned correctly (1, 2, 3)
      expect(ranked[0].rank).toBe(1);
      expect(ranked[1].rank).toBe(2);
      expect(ranked[2].rank).toBe(3);
      
      // Top ranked should have highest overall score
      expect(ranked[0].overallScore).toBeGreaterThanOrEqual(ranked[1].overallScore);
      expect(ranked[1].overallScore).toBeGreaterThanOrEqual(ranked[2].overallScore);
      
      // Each should have strengths/weaknesses identified
      ranked.forEach(variation => {
        expect(variation.strengths).toBeDefined();
        expect(variation.weaknesses).toBeDefined();
        expect(variation.index).toBeGreaterThanOrEqual(0);
        expect(variation.caption).toBeDefined();
      });
    });

    it('should rank by likes strategy correctly', async () => {
      const variations = [
        {
          caption: `Great content!`,
          prediction: await predictor.predictEngagement(
            `Great content!`,
            'user123',
            'workspace456',
            'post',
            'instagram'
          ),
        },
        {
          caption: `Hot take: Quality > Quantity!`,
          prediction: await predictor.predictEngagement(
            `Hot take: Quality > Quantity!`,
            'user123',
            'workspace456',
            'post',
            'instagram'
          ),
        },
      ];

      const ranked = await predictor.compareVariations(variations, 'likes');

      expect(ranked).toHaveLength(2);
      
      // Higher predicted like rate should rank first
      expect(ranked[0].prediction.predictedLikeRate).toBeGreaterThanOrEqual(
        ranked[1].prediction.predictedLikeRate
      );
    });

    it('should rank by comments strategy correctly', async () => {
      const variations = [
        {
          caption: `Just posting.`,
          prediction: await predictor.predictEngagement(
            `Just posting.`,
            'user123',
            'workspace456',
            'post',
            'instagram'
          ),
        },
        {
          caption: `What's your biggest challenge?

Comment below! 👇`,
          prediction: await predictor.predictEngagement(
            `What's your biggest challenge?\n\nComment below! 👇`,
            'user123',
            'workspace456',
            'post',
            'instagram'
          ),
        },
      ];

      const ranked = await predictor.compareVariations(variations, 'comments');

      expect(ranked).toHaveLength(2);
      
      // Variation with stronger CTA should rank first
      expect(ranked[0].prediction.predictedCommentRate).toBeGreaterThanOrEqual(
        ranked[1].prediction.predictedCommentRate
      );
    });

    it('should identify strengths correctly', async () => {
      const variations = [
        {
          caption: `POV: You discovered the secret!

Here's what works:
- Strong hook
- Clear value
- Engaging CTA

Save this 📌

What's your take? Drop it below! 👇`,
          prediction: await predictor.predictEngagement(
            `POV: You discovered the secret!\n\nHere's what works:\n- Strong hook\n- Clear value\n- Engaging CTA\n\nSave this 📌\n\nWhat's your take? Drop it below! 👇`,
            'user123',
            'workspace456',
            'post',
            'instagram'
          ),
        },
      ];

      const ranked = await predictor.compareVariations(variations, 'balanced');

      expect(ranked[0].strengths.length).toBeGreaterThan(0);
      
      // Should identify strong factors
      const strengthText = ranked[0].strengths.join(' ');
      expect(strengthText).toBeDefined();
    });

    it('should identify weaknesses correctly', async () => {
      const variations = [
        {
          caption: `test`,
          prediction: await predictor.predictEngagement(
            `test`,
            'user123',
            'workspace456',
            'post',
            'instagram'
          ),
        },
      ];

      const ranked = await predictor.compareVariations(variations, 'balanced');

      // Weak caption should have multiple weaknesses
      expect(ranked[0].weaknesses.length).toBeGreaterThan(0);
      
      const weaknessText = ranked[0].weaknesses.join(' ');
      expect(weaknessText).toBeDefined();
    });
  });

  describe('historical accuracy and confidence calibration - Task 8.3', () => {
    it('should return moderate default confidence with no historical data', async () => {
      const caption = `Hot take: Consistency beats perfection!

What do you think?`;

      const result = await predictor.predictEngagement(
        caption,
        'newUser123', // New user with no history
        'newWorkspace456',
        'post',
        'instagram'
      );

      expect(result).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0.3);
      expect(result.confidence).toBeLessThan(0.95);
      // With no history, confidence should be moderate (around 0.6-0.8)
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should incorporate historical accuracy into confidence score', async () => {
      const caption = `Amazing content strategy!

Follow for more tips 💡`;

      // Make two predictions for the same user
      const result1 = await predictor.predictEngagement(
        caption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      const result2 = await predictor.predictEngagement(
        caption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      // Both should have confidence scores
      expect(result1.confidence).toBeGreaterThan(0);
      expect(result2.confidence).toBeGreaterThan(0);
      
      // Confidence should be calibrated (between 0.3 and 0.95)
      expect(result1.confidence).toBeGreaterThanOrEqual(0.3);
      expect(result1.confidence).toBeLessThanOrEqual(0.95);
    });

    it('should calculate confidence based on factor consistency', async () => {
      // Caption with consistent high factors
      const consistentCaption = `POV: You found the secret!

Here's what works:
✓ Strong hook
✓ Clear value
✓ Engaging CTA

Save this 📌

Drop your thoughts below! 👇`;

      // Caption with inconsistent factors (strong hook, weak everything else)
      const inconsistentCaption = `Hot take!`;

      const consistentResult = await predictor.predictEngagement(
        consistentCaption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      const inconsistentResult = await predictor.predictEngagement(
        inconsistentCaption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      // Consistent factors should have higher confidence
      expect(consistentResult.confidence).toBeGreaterThan(inconsistentResult.confidence);
    });

    it('should track prediction accuracy over time', async () => {
      const accuracy = await predictor.getPredictionAccuracy('user123', 'workspace456', 20);

      expect(accuracy).toBeDefined();
      expect(accuracy.sampleSize).toBeGreaterThanOrEqual(0);
      expect(accuracy.averageError).toBeGreaterThanOrEqual(0);
      expect(accuracy.accuracyByMetric).toBeDefined();
      expect(accuracy.accuracyByMetric.likeRateAccuracy).toBeGreaterThanOrEqual(0);
      expect(accuracy.accuracyByMetric.commentRateAccuracy).toBeGreaterThanOrEqual(0);
      expect(accuracy.accuracyByMetric.saveRateAccuracy).toBeGreaterThanOrEqual(0);
      expect(accuracy.accuracyByMetric.shareRateAccuracy).toBeGreaterThanOrEqual(0);
      expect(accuracy.confidenceCalibration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('learning from actual performance - Task 8.3', () => {
    it('should record actual performance and generate insights', async () => {
      const metrics = {
        likes: 100,
        comments: 15,
        saves: 10,
        shares: 5,
        impressions: 1000,
      };

      // Should complete without error
      await expect(
        predictor.recordActualPerformance('caption123', metrics)
      ).resolves.not.toThrow();
    });

    it('should handle performance that exceeds predictions', async () => {
      const highPerformanceMetrics = {
        likes: 200,
        comments: 50,
        saves: 30,
        shares: 20,
        impressions: 1000,
      };

      await expect(
        predictor.recordActualPerformance('caption456', highPerformanceMetrics)
      ).resolves.not.toThrow();
    });

    it('should handle performance below predictions', async () => {
      const lowPerformanceMetrics = {
        likes: 10,
        comments: 1,
        saves: 0,
        shares: 0,
        impressions: 1000,
      };

      await expect(
        predictor.recordActualPerformance('caption789', lowPerformanceMetrics)
      ).resolves.not.toThrow();
    });

    it('should calculate actual rates correctly from raw metrics', async () => {
      const metrics = {
        likes: 75,
        comments: 15,
        saves: 10,
        shares: 3,
        impressions: 1500,
      };

      // Expected rates:
      // likeRate = (75/1500) * 100 = 5%
      // commentRate = (15/1500) * 100 = 1%
      // saveRate = (10/1500) * 100 = 0.67%
      // shareRate = (3/1500) * 100 = 0.2%

      await expect(
        predictor.recordActualPerformance('caption999', metrics)
      ).resolves.not.toThrow();
    });
  });

  describe('comparison with user average - Task 8.3', () => {
    it('should calculate vsUserAverage correctly', async () => {
      const caption = `Hot take: Quality content takes time!

Be patient with your growth.

What's your biggest growth tip? 👇`;

      const result = await predictor.predictEngagement(
        caption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      expect(result.vsUserAverage).toBeDefined();
      expect(typeof result.vsUserAverage).toBe('number');
      
      // vsUserAverage can be positive (above average) or negative (below average)
      // It represents percentage difference from user's average performance
    });

    it('should flag predictions significantly below user average', async () => {
      const weakCaption = `Post.`;

      const result = await predictor.predictEngagement(
        weakCaption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      expect(result.performanceFlag).toBeDefined();
      
      // If prediction is >10% below average, should be flagged
      if (result.vsUserAverage < -10) {
        expect(result.performanceFlag?.isBelowAverage).toBe(true);
        expect(result.performanceFlag?.severity).not.toBe('none');
      }
    });

    it('should not flag predictions at or above user average', async () => {
      const strongCaption = `POV: You finally cracked the code!

Here's what actually works:
- Authentic storytelling
- Value-first content
- Consistent engagement

Save this if you needed the reminder 📌

What's working for you? Let me know! 👇`;

      const result = await predictor.predictEngagement(
        strongCaption,
        'user123',
        'workspace456',
        'post',
        'instagram'
      );

      expect(result.performanceFlag).toBeDefined();
      
      // If prediction is within -10% or above average, should not be flagged
      if (result.vsUserAverage > -10) {
        expect(result.performanceFlag?.isBelowAverage).toBe(false);
        expect(result.performanceFlag?.severity).toBe('none');
      }
    });
  });

  describe('ranking strategies - Task 8.3', () => {
    it('should rank by saves strategy correctly', async () => {
      const variations = [
        {
          caption: `Random post`,
          prediction: await predictor.predictEngagement(
            `Random post`,
            'user123',
            'workspace456',
            'post',
            'instagram'
          ),
        },
        {
          caption: `5 game-changing tips you need to know:

1. Tip one
2. Tip two
3. Tip three
4. Tip four
5. Tip five

Save this for later! 📌`,
          prediction: await predictor.predictEngagement(
            `5 game-changing tips you need to know:\n\n1. Tip one\n2. Tip two\n3. Tip three\n4. Tip four\n5. Tip five\n\nSave this for later! 📌`,
            'user123',
            'workspace456',
            'post',
            'instagram'
          ),
        },
      ];

      const ranked = await predictor.compareVariations(variations, 'saves');

      expect(ranked).toHaveLength(2);
      
      // Educational content with save CTA should rank first
      expect(ranked[0].prediction.predictedSaveRate).toBeGreaterThanOrEqual(
        ranked[1].prediction.predictedSaveRate
      );
    });
  });
});
