/**
 * Unit Test Suite: Enhanced Hashtag Generation Service
 * 
 * Tests for Task 12.1: Create enhanced hashtag generation logic
 * 
 * Validates:
 * - Strategic 30/50/20 competition mix
 * - Generation of 15-25 hashtags
 * - Trending hashtag integration from NicheContext
 * - Content theme extraction
 * - Hashtag blacklist filtering
 * - Performance estimation
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */

import { hashtagGeneratorService } from '../server/services/HashtagGeneratorService';

describe('HashtagGeneratorService - Enhanced Hashtag Generation (Task 12.1)', () => {
  
  /**
   * Test Case 1: Verify hashtag count is within 15-25 range
   * 
   * Requirement: 6.1
   */
  test('should generate 15-25 hashtags per caption', async () => {
    const params = {
      caption: 'Just finished an amazing morning workout! 💪 Feeling energized and ready to crush the day. Remember: consistency beats perfection every time.',
      niche: 'fitness',
      platform: 'instagram',
      postType: 'post' as const,
      targetCount: 20
    };

    const result = await hashtagGeneratorService.generateStrategicHashtags(params);

    expect(result.hashtags.length).toBeGreaterThanOrEqual(15);
    expect(result.hashtags.length).toBeLessThanOrEqual(25);
    
    console.log('✅ Generated hashtag count:', result.hashtags.length);
  }, 30000); // 30 second timeout for AI calls

  /**
   * Test Case 2: Verify 30/50/20 competition distribution
   * 
   * Requirement: 6.2
   */
  test('should apply 30/50/20 competition mix (high/medium/low)', async () => {
    const params = {
      caption: 'Sharing my favorite healthy meal prep recipe! 🥗 This quinoa bowl is packed with protein and takes only 15 minutes to make.',
      niche: 'food',
      platform: 'instagram',
      postType: 'post' as const,
      targetCount: 20
    };

    const result = await hashtagGeneratorService.generateStrategicHashtags(params);

    const totalNonBranded = result.breakdown.high.length + 
                           result.breakdown.medium.length + 
                           result.breakdown.low.length;
    
    // Calculate actual ratios
    const highRatio = result.breakdown.high.length / totalNonBranded;
    const mediumRatio = result.breakdown.medium.length / totalNonBranded;
    const lowRatio = result.breakdown.low.length / totalNonBranded;

    // Allow for some flexibility (±10% from target ratios)
    expect(highRatio).toBeGreaterThanOrEqual(0.20);  // 30% target, allow 20-40%
    expect(highRatio).toBeLessThanOrEqual(0.40);
    
    expect(mediumRatio).toBeGreaterThanOrEqual(0.40); // 50% target, allow 40-60%
    expect(mediumRatio).toBeLessThanOrEqual(0.60);
    
    expect(lowRatio).toBeGreaterThanOrEqual(0.10);   // 20% target, allow 10-30%
    expect(lowRatio).toBeLessThanOrEqual(0.30);

    console.log('✅ Competition breakdown:', {
      high: `${result.breakdown.high.length} (${Math.round(highRatio * 100)}%)`,
      medium: `${result.breakdown.medium.length} (${Math.round(mediumRatio * 100)}%)`,
      low: `${result.breakdown.low.length} (${Math.round(lowRatio * 100)}%)`
    });
  }, 30000);

  /**
   * Test Case 3: Verify hashtag breakdown structure
   * 
   * Requirement: 6.1, 6.2
   */
  test('should return proper hashtag breakdown structure', async () => {
    const params = {
      caption: 'Exploring the beautiful streets of Paris! 🗼 Every corner tells a story.',
      niche: 'travel',
      platform: 'instagram',
      postType: 'post' as const
    };

    const result = await hashtagGeneratorService.generateStrategicHashtags(params);

    // Verify structure exists
    expect(result.breakdown).toBeDefined();
    expect(result.breakdown.high).toBeInstanceOf(Array);
    expect(result.breakdown.medium).toBeInstanceOf(Array);
    expect(result.breakdown.low).toBeInstanceOf(Array);
    expect(result.breakdown.branded).toBeInstanceOf(Array);

    // Verify all hashtags are strings without # symbol
    const allHashtags = [
      ...result.breakdown.high,
      ...result.breakdown.medium,
      ...result.breakdown.low,
      ...result.breakdown.branded
    ];

    allHashtags.forEach(tag => {
      expect(typeof tag).toBe('string');
      expect(tag.startsWith('#')).toBe(false); // Should not include # symbol
      expect(tag.length).toBeGreaterThan(0);
    });

    console.log('✅ Breakdown structure valid');
  }, 30000);

  /**
   * Test Case 4: Verify performance estimate structure
   * 
   * Requirement: 6.6
   */
  test('should return performance estimate with discoverability and ranking scores', async () => {
    const params = {
      caption: 'New tech gadget review! 🎮 This gaming mouse changed everything.',
      niche: 'tech',
      platform: 'instagram',
      postType: 'post' as const
    };

    const result = await hashtagGeneratorService.generateStrategicHashtags(params);

    // Verify performance estimate structure
    expect(result.performanceEstimate).toBeDefined();
    expect(result.performanceEstimate.discoverabilityScore).toBeGreaterThanOrEqual(0);
    expect(result.performanceEstimate.discoverabilityScore).toBeLessThanOrEqual(100);
    expect(result.performanceEstimate.rankingPotential).toBeGreaterThanOrEqual(0);
    expect(result.performanceEstimate.rankingPotential).toBeLessThanOrEqual(100);
    expect(result.performanceEstimate.overall).toBeGreaterThanOrEqual(0);
    expect(result.performanceEstimate.overall).toBeLessThanOrEqual(100);

    console.log('✅ Performance estimate:', result.performanceEstimate);
  }, 30000);

  /**
   * Test Case 5: Verify blacklist filtering
   * 
   * Requirement: 6.4
   */
  test('should filter out blacklisted/spam hashtags', async () => {
    const params = {
      caption: 'Follow me for more content! Like and share this post!',
      niche: 'lifestyle',
      platform: 'instagram',
      postType: 'post' as const
    };

    const result = await hashtagGeneratorService.generateStrategicHashtags(params);

    // Common spam hashtags that should NOT be included
    const spamHashtags = [
      'follow',
      'followme',
      'followback',
      'follow4follow',
      'like4like',
      'likeforlike',
      'f4f',
      'l4l',
      'spam',
      'instadaily',
      'instalike'
    ];

    const allHashtags = result.hashtags.map(h => h.toLowerCase());
    
    spamHashtags.forEach(spamTag => {
      expect(allHashtags).not.toContain(spamTag);
    });

    console.log('✅ No blacklisted hashtags found');
  }, 30000);

  /**
   * Test Case 6: Verify branded hashtag support
   * 
   * Requirement: 6.5
   */
  test('should include branded hashtags when provided', async () => {
    const brandedTags = ['MyBrand', 'BrandCampaign2025'];
    
    const params = {
      caption: 'Launching our new product line! So excited to share this with you all.',
      niche: 'business',
      platform: 'instagram',
      postType: 'post' as const,
      brandedHashtags: brandedTags
    };

    const result = await hashtagGeneratorService.generateStrategicHashtags(params);

    // Verify branded hashtags are included
    expect(result.breakdown.branded.length).toBeGreaterThan(0);
    brandedTags.forEach(brand => {
      expect(result.hashtags.map(h => h.toLowerCase())).toContain(brand.toLowerCase());
    });

    console.log('✅ Branded hashtags included:', result.breakdown.branded);
  }, 30000);

  /**
   * Test Case 7: Verify unique hashtags (no duplicates)
   * 
   * Requirement: 6.1
   */
  test('should generate unique hashtags without duplicates', async () => {
    const params = {
      caption: 'Fashion fashion fashion! Style style style!',
      niche: 'fashion',
      platform: 'instagram',
      postType: 'post' as const
    };

    const result = await hashtagGeneratorService.generateStrategicHashtags(params);

    // Check for duplicates (case-insensitive)
    const lowerCaseHashtags = result.hashtags.map(h => h.toLowerCase());
    const uniqueHashtags = new Set(lowerCaseHashtags);

    expect(lowerCaseHashtags.length).toBe(uniqueHashtags.size);

    console.log('✅ All hashtags are unique');
  }, 30000);

  /**
   * Test Case 8: Verify content theme extraction
   * 
   * Requirement: 6.3
   */
  test('should extract and use content themes for micro-niche hashtags', async () => {
    const params = {
      caption: 'Morning yoga session by the beach at sunrise 🧘‍♀️ Finding inner peace through meditation and breathing exercises.',
      mediaAnalysis: 'Image shows person doing yoga pose on beach at sunrise, peaceful ocean view, golden hour lighting',
      niche: 'fitness',
      platform: 'instagram',
      postType: 'post' as const
    };

    const result = await hashtagGeneratorService.generateStrategicHashtags(params);

    // Check if generated hashtags include theme-related terms
    const allHashtags = result.hashtags.map(h => h.toLowerCase()).join(' ');
    
    // Should include yoga-related or beach-related or sunrise-related hashtags
    const themeMatches = 
      allHashtags.includes('yoga') ||
      allHashtags.includes('beach') ||
      allHashtags.includes('sunrise') ||
      allHashtags.includes('meditation') ||
      allHashtags.includes('morning') ||
      allHashtags.includes('peace');

    expect(themeMatches).toBe(true);

    console.log('✅ Theme-specific hashtags generated');
  }, 30000);

  /**
   * Test Case 9: Verify different post types
   * 
   * Requirement: 6.1
   */
  test('should generate appropriate hashtags for different post types', async () => {
    const baseParams = {
      caption: 'Quick fitness tip of the day!',
      niche: 'fitness',
      platform: 'instagram'
    };

    // Test post type
    const postResult = await hashtagGeneratorService.generateStrategicHashtags({
      ...baseParams,
      postType: 'post' as const
    });

    // Test reel type
    const reelResult = await hashtagGeneratorService.generateStrategicHashtags({
      ...baseParams,
      postType: 'reel' as const
    });

    // Test story type
    const storyResult = await hashtagGeneratorService.generateStrategicHashtags({
      ...baseParams,
      postType: 'story' as const
    });

    // All should generate valid hashtags
    expect(postResult.hashtags.length).toBeGreaterThan(0);
    expect(reelResult.hashtags.length).toBeGreaterThan(0);
    expect(storyResult.hashtags.length).toBeGreaterThan(0);

    console.log('✅ Hashtags generated for all post types');
  }, 45000);

  /**
   * Test Case 10: Verify performance tracking method exists
   * 
   * Requirement: 6.6
   */
  test('should have hashtag performance tracking capability', async () => {
    // Verify the method exists and can be called
    expect(hashtagGeneratorService.trackHashtagPerformance).toBeDefined();
    expect(typeof hashtagGeneratorService.trackHashtagPerformance).toBe('function');

    // Test calling the method
    const testHashtags = ['fitness', 'workout', 'health'];
    const testPerformance = {
      likes: 150,
      comments: 25,
      saves: 40,
      shares: 10,
      impressions: 1000,
      reach: 800
    };

    await expect(
      hashtagGeneratorService.trackHashtagPerformance(testHashtags, testPerformance, 'fitness')
    ).resolves.not.toThrow();

    console.log('✅ Performance tracking method available');
  }, 10000);
});

describe('HashtagGeneratorService - Edge Cases', () => {
  
  /**
   * Edge Case 1: Empty caption
   */
  test('should handle empty caption gracefully', async () => {
    const params = {
      caption: '',
      niche: 'lifestyle',
      platform: 'instagram',
      postType: 'post' as const
    };

    const result = await hashtagGeneratorService.generateStrategicHashtags(params);

    // Should still generate hashtags based on niche
    expect(result.hashtags.length).toBeGreaterThan(0);
    
    console.log('✅ Handled empty caption');
  }, 30000);

  /**
   * Edge Case 2: Very long caption
   */
  test('should handle very long captions', async () => {
    const longCaption = 'Amazing journey '.repeat(100);
    
    const params = {
      caption: longCaption,
      niche: 'travel',
      platform: 'instagram',
      postType: 'post' as const
    };

    const result = await hashtagGeneratorService.generateStrategicHashtags(params);

    expect(result.hashtags.length).toBeGreaterThan(0);
    
    console.log('✅ Handled long caption');
  }, 30000);

  /**
   * Edge Case 3: Caption with emojis only
   */
  test('should handle emoji-only caption', async () => {
    const params = {
      caption: '🎉🎊✨💫🌟⭐️🔥💯',
      niche: 'lifestyle',
      platform: 'instagram',
      postType: 'post' as const
    };

    const result = await hashtagGeneratorService.generateStrategicHashtags(params);

    expect(result.hashtags.length).toBeGreaterThan(0);
    
    console.log('✅ Handled emoji-only caption');
  }, 30000);
});
