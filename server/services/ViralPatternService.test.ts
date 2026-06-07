import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { ViralPatternService } from './ViralPatternService';
import { ViralPatternModel } from '../models/AI/ViralPattern';
import { ViralHookModel } from '../models/AI/ViralHook';

describe('ViralPatternService', () => {
  let service: ViralPatternService;
  let testPatternIds: string[] = [];
  let testHookIds: string[] = [];

  beforeAll(async () => {
    // Connect to test database
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/veefore_test';
    await mongoose.connect(mongoUri);
    
    // Drop invalid parallel array index if it exists
    try {
      await ViralPatternModel.collection.dropIndex('niches_1_postTypes_1');
    } catch (error) {
      // Index doesn't exist, ignore error
    }
    
    service = new ViralPatternService();
  });

  afterAll(async () => {
    // Cleanup test data
    if (testPatternIds.length > 0) {
      await ViralPatternModel.deleteMany({ _id: { $in: testPatternIds } });
    }
    if (testHookIds.length > 0) {
      await ViralHookModel.deleteMany({ _id: { $in: testHookIds } });
    }
    
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clear test data before each test
    await ViralPatternModel.deleteMany({});
    await ViralHookModel.deleteMany({});
    testPatternIds = [];
    testHookIds = [];
  });

  describe('getRelevantPatterns', () => {
    it('should return patterns matching niche and post type', async () => {
      // Create test patterns
      const pattern1 = await ViralPatternModel.create({
        name: 'Story-Insight-Question',
        category: 'structure',
        pattern: '{story} → {insight} → {question}',
        description: 'Personal story leading to insight and engagement question',
        niches: ['fitness', 'wellness'],
        postTypes: ['post', 'reel'],
        avgEngagementRate: 5.2,
        usageCount: 100,
        successRate: 85,
        exampleCaptions: ['Example 1', 'Example 2'],
        trending: true,
      });

      const pattern2 = await ViralPatternModel.create({
        name: 'Hook-Reveal-CTA',
        category: 'engagement',
        pattern: '{hook} → {reveal} → {cta}',
        description: 'Strong hook with gradual reveal and call to action',
        niches: ['fitness', 'food'],
        postTypes: ['post'],
        avgEngagementRate: 6.8,
        usageCount: 150,
        successRate: 90,
        exampleCaptions: ['Example 3'],
        trending: false,
      });

      testPatternIds.push(pattern1._id.toString(), pattern2._id.toString());

      // Test retrieval
      const results = await service.getRelevantPatterns('fitness', 'post', 5);

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('Story-Insight-Question'); // Trending first
      expect(results[0].niches).toContain('fitness');
      expect(results[0].postTypes).toContain('post');
    });

    it('should sort by trending first, then engagement rate', async () => {
      // Create patterns with different trending status and engagement
      const pattern1 = await ViralPatternModel.create({
        name: 'High Engagement Non-Trending',
        category: 'hook',
        pattern: 'Pattern 1',
        description: 'Desc 1',
        niches: ['travel'],
        postTypes: ['post'],
        avgEngagementRate: 9.0,
        trending: false,
        usageCount: 50,
        successRate: 80,
        exampleCaptions: [],
      });

      const pattern2 = await ViralPatternModel.create({
        name: 'Lower Engagement Trending',
        category: 'hook',
        pattern: 'Pattern 2',
        description: 'Desc 2',
        niches: ['travel'],
        postTypes: ['post'],
        avgEngagementRate: 7.0,
        trending: true,
        usageCount: 80,
        successRate: 75,
        exampleCaptions: [],
      });

      testPatternIds.push(pattern1._id.toString(), pattern2._id.toString());

      const results = await service.getRelevantPatterns('travel', 'post', 10);

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('Lower Engagement Trending'); // Trending comes first
      expect(results[0].trending).toBe(true);
    });

    it('should return empty array when no patterns match', async () => {
      const results = await service.getRelevantPatterns('nonexistent', 'post', 5);
      expect(results).toHaveLength(0);
    });

    it('should respect the limit parameter', async () => {
      // Create 10 patterns
      for (let i = 0; i < 10; i++) {
        const pattern = await ViralPatternModel.create({
          name: `Pattern ${i}`,
          category: 'hook',
          pattern: `Pattern ${i}`,
          description: `Desc ${i}`,
          niches: ['tech'],
          postTypes: ['post'],
          avgEngagementRate: i,
          trending: false,
          usageCount: i * 10,
          successRate: 50 + i,
          exampleCaptions: [],
        });
        testPatternIds.push(pattern._id.toString());
      }

      const results = await service.getRelevantPatterns('tech', 'post', 3);
      expect(results).toHaveLength(3);
    });
  });

  describe('getViralHooks', () => {
    it('should return hooks for the specified niche', async () => {
      const hook1 = await ViralHookModel.create({
        hookText: 'Hot take:',
        niche: 'fitness',
        avgEngagementBoost: 15.5,
        usageCount: 200,
      });

      const hook2 = await ViralHookModel.create({
        hookText: 'POV:',
        niche: 'fitness',
        avgEngagementBoost: 12.3,
        usageCount: 150,
      });

      const hook3 = await ViralHookModel.create({
        hookText: 'Unpopular opinion:',
        niche: 'food',
        avgEngagementBoost: 10.0,
        usageCount: 100,
      });

      testHookIds.push(hook1._id.toString(), hook2._id.toString(), hook3._id.toString());

      const results = await service.getViralHooks('fitness', 10);

      expect(results).toHaveLength(2);
      expect(results[0].hookText).toBe('Hot take:'); // Highest boost first
      expect(results[0].avgEngagementBoost).toBe(15.5);
      expect(results[1].hookText).toBe('POV:');
    });

    it('should sort by engagement boost descending', async () => {
      const hooks = [
        { text: 'Hook 1', boost: 5.0 },
        { text: 'Hook 2', boost: 15.0 },
        { text: 'Hook 3', boost: 10.0 },
      ];

      for (const h of hooks) {
        const hook = await ViralHookModel.create({
          hookText: h.text,
          niche: 'travel',
          avgEngagementBoost: h.boost,
          usageCount: 50,
        });
        testHookIds.push(hook._id.toString());
      }

      const results = await service.getViralHooks('travel', 10);

      expect(results).toHaveLength(3);
      expect(results[0].avgEngagementBoost).toBe(15.0);
      expect(results[1].avgEngagementBoost).toBe(10.0);
      expect(results[2].avgEngagementBoost).toBe(5.0);
    });

    it('should respect the limit parameter', async () => {
      for (let i = 0; i < 10; i++) {
        const hook = await ViralHookModel.create({
          hookText: `Hook ${i}`,
          niche: 'fashion',
          avgEngagementBoost: i,
          usageCount: i * 10,
        });
        testHookIds.push(hook._id.toString());
      }

      const results = await service.getViralHooks('fashion', 5);
      expect(results).toHaveLength(5);
    });

    it('should return empty array when no hooks match', async () => {
      const results = await service.getViralHooks('nonexistent', 5);
      expect(results).toHaveLength(0);
    });
  });

  describe('getPatternsByCategory', () => {
    it('should return patterns filtered by category', async () => {
      const hookPattern = await ViralPatternModel.create({
        name: 'Hook Pattern',
        category: 'hook',
        pattern: 'Hook template',
        description: 'Hook description',
        niches: ['fitness'],
        postTypes: ['post'],
        avgEngagementRate: 5.0,
        trending: false,
        usageCount: 50,
        successRate: 70,
        exampleCaptions: [],
      });

      const structurePattern = await ViralPatternModel.create({
        name: 'Structure Pattern',
        category: 'structure',
        pattern: 'Structure template',
        description: 'Structure description',
        niches: ['fitness'],
        postTypes: ['post'],
        avgEngagementRate: 6.0,
        trending: false,
        usageCount: 60,
        successRate: 75,
        exampleCaptions: [],
      });

      testPatternIds.push(hookPattern._id.toString(), structurePattern._id.toString());

      const results = await service.getPatternsByCategory('hook');

      expect(results).toHaveLength(1);
      expect(results[0].category).toBe('hook');
      expect(results[0].name).toBe('Hook Pattern');
    });

    it('should filter by niche when provided', async () => {
      const pattern1 = await ViralPatternModel.create({
        name: 'Fitness Hook',
        category: 'hook',
        pattern: 'Template',
        description: 'Desc',
        niches: ['fitness'],
        postTypes: ['post'],
        avgEngagementRate: 5.0,
        trending: false,
        usageCount: 50,
        successRate: 70,
        exampleCaptions: [],
      });

      const pattern2 = await ViralPatternModel.create({
        name: 'Food Hook',
        category: 'hook',
        pattern: 'Template',
        description: 'Desc',
        niches: ['food'],
        postTypes: ['post'],
        avgEngagementRate: 6.0,
        trending: false,
        usageCount: 60,
        successRate: 75,
        exampleCaptions: [],
      });

      testPatternIds.push(pattern1._id.toString(), pattern2._id.toString());

      const results = await service.getPatternsByCategory('hook', 'fitness');

      expect(results).toHaveLength(1);
      expect(results[0].niches).toContain('fitness');
    });
  });

  describe('getTrendingPatterns', () => {
    it('should return only trending patterns', async () => {
      const trending = await ViralPatternModel.create({
        name: 'Trending Pattern',
        category: 'hook',
        pattern: 'Template',
        description: 'Desc',
        niches: ['fitness'],
        postTypes: ['post'],
        avgEngagementRate: 8.0,
        trending: true,
        usageCount: 100,
        successRate: 85,
        exampleCaptions: [],
      });

      const notTrending = await ViralPatternModel.create({
        name: 'Not Trending Pattern',
        category: 'hook',
        pattern: 'Template',
        description: 'Desc',
        niches: ['fitness'],
        postTypes: ['post'],
        avgEngagementRate: 9.0,
        trending: false,
        usageCount: 50,
        successRate: 80,
        exampleCaptions: [],
      });

      testPatternIds.push(trending._id.toString(), notTrending._id.toString());

      const results = await service.getTrendingPatterns(10);

      expect(results).toHaveLength(1);
      expect(results[0].trending).toBe(true);
      expect(results[0].name).toBe('Trending Pattern');
    });
  });

  describe('recordPatternUsage', () => {
    it('should increment usage count and update lastUsed', async () => {
      const pattern = await ViralPatternModel.create({
        name: 'Test Pattern',
        category: 'hook',
        pattern: 'Template',
        description: 'Desc',
        niches: ['fitness'],
        postTypes: ['post'],
        avgEngagementRate: 5.0,
        trending: false,
        usageCount: 10,
        successRate: 70,
        exampleCaptions: [],
      });

      testPatternIds.push(pattern._id.toString());

      await service.recordPatternUsage(pattern._id.toString());

      const updated = await ViralPatternModel.findById(pattern._id);
      expect(updated?.usageCount).toBe(11);
      expect(updated?.lastUsed).toBeDefined();
    });
  });

  describe('recordHookUsage', () => {
    it('should increment usage count', async () => {
      const hook = await ViralHookModel.create({
        hookText: 'Test Hook',
        niche: 'fitness',
        avgEngagementBoost: 10.0,
        usageCount: 5,
      });

      testHookIds.push(hook._id.toString());

      await service.recordHookUsage(hook._id.toString());

      const updated = await ViralHookModel.findById(hook._id);
      expect(updated?.usageCount).toBe(6);
    });
  });

  describe('extractAndAddPattern', () => {
    it('should extract and create new pattern from caption with hook', async () => {
      const caption = 'Hot take: meal prep is overrated. Here\'s why I think flexible eating works better. What do you think?';
      const engagementRate = 8.5;
      const niche = 'fitness';
      const postType = 'post';

      await service.extractAndAddPattern(caption, engagementRate, niche, postType);

      // Verify pattern was created
      const patterns = await ViralPatternModel.find({ niches: niche }).lean();
      expect(patterns.length).toBeGreaterThan(0);
      
      const createdPattern = patterns[0];
      testPatternIds.push(createdPattern._id.toString());

      expect(createdPattern.name).toContain('Hook');
      expect(createdPattern.avgEngagementRate).toBe(engagementRate);
      expect(createdPattern.exampleCaptions).toContain(caption);
      expect(createdPattern.trending).toBe(true); // > 8% engagement
    });

    it('should extract storytelling pattern from multi-sentence caption', async () => {
      const caption = 'I was struggling with consistency. Then I realized it wasn\'t about motivation. What\'s your biggest fitness challenge?';
      const engagementRate = 6.5;
      const niche = 'fitness';
      const postType = 'post';

      await service.extractAndAddPattern(caption, engagementRate, niche, postType);

      const patterns = await ViralPatternModel.find({ 
        niches: niche,
        category: 'storytelling' 
      }).lean();
      
      expect(patterns.length).toBeGreaterThan(0);
      
      const createdPattern = patterns[0];
      testPatternIds.push(createdPattern._id.toString());

      expect(createdPattern.name).toBe('Story-Insight-Question');
      expect(createdPattern.category).toBe('storytelling');
      expect(createdPattern.avgEngagementRate).toBe(engagementRate);
    });

    it('should update existing pattern when similar pattern exists', async () => {
      const caption1 = 'Hot take: cardio is overrated. Focus on strength training instead. What do you think?';
      const caption2 = 'Hot take: supplements are a waste of money. Real food is better. Agree or disagree?';
      const niche = 'fitness';
      const postType = 'post';

      // Add first caption
      await service.extractAndAddPattern(caption1, 7.0, niche, postType);
      
      // Get the created pattern
      let patterns = await ViralPatternModel.find({ niches: niche }).lean();
      const initialCount = patterns[0].usageCount;
      const initialExampleCount = patterns[0].exampleCaptions.length;
      testPatternIds.push(patterns[0]._id.toString());

      // Add second caption with same pattern
      await service.extractAndAddPattern(caption2, 8.0, niche, postType);

      // Verify pattern was updated, not duplicated
      patterns = await ViralPatternModel.find({ niches: niche }).lean();
      expect(patterns.length).toBe(1); // No duplicate patterns

      const updatedPattern = patterns[0];
      expect(updatedPattern.usageCount).toBe(initialCount + 1);
      expect(updatedPattern.exampleCaptions.length).toBe(initialExampleCount + 1);
      expect(updatedPattern.exampleCaptions).toContain(caption2);
    });

    it('should not create pattern for unclear caption structure', async () => {
      const caption = 'Nice day today.';
      const engagementRate = 3.0;
      const niche = 'lifestyle';
      const postType = 'post';

      await service.extractAndAddPattern(caption, engagementRate, niche, postType);

      // Verify no pattern was created
      const patterns = await ViralPatternModel.find({ niches: niche }).lean();
      expect(patterns.length).toBe(0);
    });

    it('should detect engagement-focused pattern', async () => {
      const caption = 'New workout guide is live! Comment WORKOUT and I\'ll send it to you. Tag someone who needs this!';
      const engagementRate = 9.5;
      const niche = 'fitness';
      const postType = 'post';

      await service.extractAndAddPattern(caption, engagementRate, niche, postType);

      const patterns = await ViralPatternModel.find({ 
        niches: niche,
        category: 'engagement' 
      }).lean();
      
      expect(patterns.length).toBeGreaterThan(0);
      
      const createdPattern = patterns[0];
      testPatternIds.push(createdPattern._id.toString());

      expect(createdPattern.name).toBe('Multi-CTA Engagement');
      expect(createdPattern.category).toBe('engagement');
    });
  });

  describe('updatePatternPerformance', () => {
    it('should update avgEngagementRate and successRate', async () => {
      // Create test pattern
      const pattern = await ViralPatternModel.create({
        name: 'Test Pattern',
        category: 'hook',
        pattern: 'Test → Template',
        description: 'Test description',
        niches: ['fitness'],
        postTypes: ['post'],
        avgEngagementRate: 6.0,
        usageCount: 10,
        successRate: 80.0,
        trending: false,
        exampleCaptions: [],
      });

      testPatternIds.push(pattern._id.toString());

      // Update with high performance
      await service.updatePatternPerformance(pattern._id.toString(), 10.0);

      // Verify updates
      const updated = await ViralPatternModel.findById(pattern._id);
      
      expect(updated?.usageCount).toBe(11); // Incremented
      
      // Calculate expected avg: (6.0 * 10 + 10.0) / 11 = 70 / 11 ≈ 6.36
      expect(updated?.avgEngagementRate).toBeCloseTo(6.36, 1);
      
      // Calculate expected success rate: (80% of 10 = 8 successes, + 1 = 9) / 11 ≈ 81.8%
      expect(updated?.successRate).toBeCloseTo(81.8, 1);
    });

    it('should decrease successRate when performance is below threshold', async () => {
      const pattern = await ViralPatternModel.create({
        name: 'Test Pattern 2',
        category: 'structure',
        pattern: 'Test → Template 2',
        description: 'Test description 2',
        niches: ['food'],
        postTypes: ['post'],
        avgEngagementRate: 7.0,
        usageCount: 10,
        successRate: 90.0, // 9 out of 10 successes
        trending: false,
        exampleCaptions: [],
      });

      testPatternIds.push(pattern._id.toString());

      // Update with low performance (below 5% threshold)
      await service.updatePatternPerformance(pattern._id.toString(), 2.0);

      const updated = await ViralPatternModel.findById(pattern._id);
      
      // 9 successes out of 11 total = 81.8%
      expect(updated?.successRate).toBeCloseTo(81.8, 1);
      expect(updated?.successRate).toBeLessThan(90.0);
    });

    it('should set trending to true for high performance patterns', async () => {
      const pattern = await ViralPatternModel.create({
        name: 'High Performer',
        category: 'hook',
        pattern: 'Viral → Pattern',
        description: 'High performing pattern',
        niches: ['tech'],
        postTypes: ['reel'],
        avgEngagementRate: 8.5,
        usageCount: 20,
        successRate: 85.0,
        trending: false,
        exampleCaptions: [],
      });

      testPatternIds.push(pattern._id.toString());

      // Update with very high performance
      await service.updatePatternPerformance(pattern._id.toString(), 12.0);

      const updated = await ViralPatternModel.findById(pattern._id);
      
      // Should be trending (avgEngagement > 8.0 && successRate > 80)
      expect(updated?.avgEngagementRate).toBeGreaterThan(8.0);
      expect(updated?.successRate).toBeGreaterThan(80.0);
      expect(updated?.trending).toBe(true);
    });

    it('should not throw error for non-existent pattern', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      
      // Should not throw
      await expect(
        service.updatePatternPerformance(fakeId, 5.0)
      ).resolves.not.toThrow();
    });

    it('should correctly calculate weighted average with multiple updates', async () => {
      const pattern = await ViralPatternModel.create({
        name: 'Multi Update Pattern',
        category: 'structure',
        pattern: 'Pattern → Template',
        description: 'Pattern for multiple updates',
        niches: ['travel'],
        postTypes: ['post'],
        avgEngagementRate: 5.0,
        usageCount: 5, // 5 uses with 5% avg = 25 total
        successRate: 100.0,
        trending: false,
        exampleCaptions: [],
      });

      testPatternIds.push(pattern._id.toString());

      // First update: 7%
      await service.updatePatternPerformance(pattern._id.toString(), 7.0);
      // New avg: (25 + 7) / 6 = 5.33%

      let updated = await ViralPatternModel.findById(pattern._id);
      expect(updated?.avgEngagementRate).toBeCloseTo(5.33, 1);
      expect(updated?.usageCount).toBe(6);

      // Second update: 9%
      await service.updatePatternPerformance(pattern._id.toString(), 9.0);
      // New avg: (32 + 9) / 7 = 5.86%

      updated = await ViralPatternModel.findById(pattern._id);
      expect(updated?.avgEngagementRate).toBeCloseTo(5.86, 1);
      expect(updated?.usageCount).toBe(7);
    });
  });
});
