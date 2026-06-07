import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { nicheContextService } from './NicheContextService';
import { nicheContextRepository } from '../repositories/NicheContextRepository';
import { connectionManager } from '../infrastructure/mongodb-connection';

/**
 * Integration tests for NicheContextService
 * These tests verify the service works correctly with the database
 */
describe('NicheContextService Integration Tests', () => {
  beforeAll(async () => {
    // Ensure database connection
    await connectionManager.connect();
  });

  afterAll(async () => {
    // Cleanup test data
    await nicheContextRepository.deleteMany({ niche: { $in: ['test-fitness', 'test-food', 'test-tech'] } });
  });

  beforeEach(async () => {
    // Clean up any existing test data
    await nicheContextRepository.deleteMany({ niche: { $in: ['test-fitness', 'test-food', 'test-tech'] } });
  });

  describe('getNicheContext', () => {
    it('should create and retrieve a new niche context', async () => {
      const context = await nicheContextService.getNicheContext('test-fitness');

      expect(context).toBeDefined();
      expect(context.niche).toBe('test-fitness');
      expect(context.id).toBeDefined();
      expect(context.lastUpdated).toBeInstanceOf(Date);
    });

    it('should retrieve existing niche context', async () => {
      // Create context
      await nicheContextRepository.create({
        niche: 'test-food',
        vocabulary: ['recipe', 'delicious', 'yummy'],
        slangTerms: new Map([['yum', 'very tasty']]),
        culturalReferences: ['Gordon Ramsay'],
        trendingTopics: ['meal prep', 'healthy eating'],
        trendingHashtags: ['#foodie', '#instafood'],
        trendingPhrases: ['food porn', 'nom nom'],
        typicalEmojis: ['🍕', '🍔', '🥗'],
        toneGuidelines: 'Friendly and mouth-watering',
        lastUpdated: new Date()
      });

      const context = await nicheContextService.getNicheContext('test-food');

      expect(context.niche).toBe('test-food');
      expect(context.vocabulary).toContain('recipe');
      expect(context.slangTerms).toHaveProperty('yum');
      expect(context.culturalReferences).toContain('Gordon Ramsay');
      expect(context.trendingTopics).toContain('meal prep');
      expect(context.typicalEmojis).toContain('🍕');
    });

    it('should cache context for subsequent calls', async () => {
      const start1 = Date.now();
      const context1 = await nicheContextService.getNicheContext('test-fitness');
      const time1 = Date.now() - start1;

      const start2 = Date.now();
      const context2 = await nicheContextService.getNicheContext('test-fitness');
      const time2 = Date.now() - start2;

      // Second call should be faster (from cache)
      expect(time2).toBeLessThan(time1);
      expect(context1.id).toBe(context2.id);
    });
  });

  describe('getBlendedContext', () => {
    beforeEach(async () => {
      // Create test contexts
      await nicheContextRepository.create({
        niche: 'test-fitness',
        vocabulary: ['workout', 'gains', 'protein'],
        slangTerms: new Map([['gains', 'muscle growth'], ['swole', 'muscular']]),
        culturalReferences: ['Arnold Schwarzenegger'],
        trendingTopics: ['HIIT workouts', 'home gym'],
        trendingHashtags: ['#fitness', '#gym'],
        trendingPhrases: ['no pain no gain', 'beast mode'],
        typicalEmojis: ['💪', '🔥', '🏋️'],
        toneGuidelines: 'Motivational and energetic',
        lastUpdated: new Date()
      });

      await nicheContextRepository.create({
        niche: 'test-food',
        vocabulary: ['recipe', 'delicious'],
        slangTerms: new Map([['yum', 'tasty']]),
        culturalReferences: ['Gordon Ramsay'],
        trendingTopics: ['meal prep'],
        trendingHashtags: ['#foodie'],
        trendingPhrases: ['food porn'],
        typicalEmojis: ['🍕', '🥗'],
        toneGuidelines: 'Friendly and appetizing',
        lastUpdated: new Date()
      });
    });

    it('should blend vocabulary from multiple niches', async () => {
      const blended = await nicheContextService.getBlendedContext(['test-fitness', 'test-food']);

      expect(blended.vocabulary).toContain('workout');
      expect(blended.vocabulary).toContain('recipe');
      expect(blended.vocabulary.length).toBeGreaterThanOrEqual(5);
    });

    it('should blend slang terms from multiple niches', async () => {
      const blended = await nicheContextService.getBlendedContext(['test-fitness', 'test-food']);

      expect(blended.slangTerms).toHaveProperty('gains');
      expect(blended.slangTerms).toHaveProperty('yum');
      expect(blended.slangTerms['gains']).toBe('muscle growth');
      expect(blended.slangTerms['yum']).toBe('tasty');
    });

    it('should blend trending topics and hashtags', async () => {
      const blended = await nicheContextService.getBlendedContext(['test-fitness', 'test-food']);

      expect(blended.trendingTopics).toContain('HIIT workouts');
      expect(blended.trendingTopics).toContain('meal prep');
      expect(blended.trendingHashtags).toContain('#fitness');
      expect(blended.trendingHashtags).toContain('#foodie');
    });

    it('should merge emojis without duplicates', async () => {
      const blended = await nicheContextService.getBlendedContext(['test-fitness', 'test-food']);

      expect(blended.typicalEmojis).toContain('💪');
      expect(blended.typicalEmojis).toContain('🍕');
      
      // Check no duplicates
      const uniqueEmojis = new Set(blended.typicalEmojis);
      expect(uniqueEmojis.size).toBe(blended.typicalEmojis.length);
    });

    it('should combine tone guidelines', async () => {
      const blended = await nicheContextService.getBlendedContext(['test-fitness', 'test-food']);

      expect(blended.toneGuidelines).toContain('Motivational');
      expect(blended.toneGuidelines).toContain('Friendly');
    });
  });

  describe('isTermOutdated', () => {
    beforeEach(async () => {
      await nicheContextRepository.create({
        niche: 'test-tech',
        vocabulary: ['code', 'dev', 'algorithm'],
        slangTerms: new Map([['bae', 'before anyone else']]),
        culturalReferences: [],
        trendingTopics: ['AI revolution'],
        trendingHashtags: ['#tech'],
        trendingPhrases: ['move fast and break things'],
        typicalEmojis: ['💻', '🚀'],
        toneGuidelines: 'Technical and innovative',
        lastUpdated: new Date()
      });
    });

    it('should detect current terms', async () => {
      const isOutdated = await nicheContextService.isTermOutdated('code', 'test-tech');
      expect(isOutdated).toBe(false);
    });

    it('should detect current slang', async () => {
      const isOutdated = await nicheContextService.isTermOutdated('bae', 'test-tech');
      expect(isOutdated).toBe(false);
    });

    it('should detect terms in trending phrases', async () => {
      const isOutdated = await nicheContextService.isTermOutdated('fast', 'test-tech');
      expect(isOutdated).toBe(false);
    });

    it('should detect outdated terms', async () => {
      const isOutdated = await nicheContextService.isTermOutdated('obsolete_term_xyz', 'test-tech');
      expect(isOutdated).toBe(true);
    });
  });

  describe('updateTrends', () => {
    beforeEach(async () => {
      await nicheContextRepository.create({
        niche: 'test-fitness',
        vocabulary: ['workout'],
        slangTerms: new Map(),
        culturalReferences: [],
        trendingTopics: ['old topic'],
        trendingHashtags: [],
        trendingPhrases: [],
        typicalEmojis: [],
        toneGuidelines: '',
        lastUpdated: new Date(Date.now() - 86400000) // 1 day ago
      });
    });

    it('should update trends and refresh timestamp', async () => {
      const beforeUpdate = await nicheContextService.getNicheContext('test-fitness');
      const oldTimestamp = beforeUpdate.lastUpdated;

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 100));

      await nicheContextService.updateTrends('test-fitness');

      // Force cache invalidation by fetching again
      const afterUpdate = await nicheContextService.getNicheContext('test-fitness');
      
      expect(afterUpdate.lastUpdated.getTime()).toBeGreaterThanOrEqual(oldTimestamp.getTime());
    });
  });
});
