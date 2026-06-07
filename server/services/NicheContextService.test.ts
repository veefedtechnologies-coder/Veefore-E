import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NicheContextService } from './NicheContextService';
import { nicheContextRepository } from '../repositories/NicheContextRepository';
import { INicheContext } from '../models/NicheContext/NicheContext';

// Mock the repository
vi.mock('../repositories/NicheContextRepository', () => ({
  nicheContextRepository: {
    findByNiche: vi.fn(),
    create: vi.fn(),
    updateTrends: vi.fn(),
    isStale: vi.fn()
  }
}));

describe('NicheContextService', () => {
  let service: NicheContextService;

  beforeEach(() => {
    service = new NicheContextService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getNicheContext', () => {
    it('should fetch niche context from repository', async () => {
      const mockContext: Partial<INicheContext> = {
        _id: '123' as any,
        niche: 'fitness',
        vocabulary: ['workout', 'gains', 'protein'],
        slangTerms: new Map([['gains', 'muscle growth']]),
        culturalReferences: ['Arnold Schwarzenegger'],
        trendingTopics: ['HIIT workouts'],
        trendingHashtags: ['#fitness', '#gym'],
        trendingPhrases: ['no pain no gain'],
        typicalEmojis: ['💪', '🔥', '🏋️'],
        toneGuidelines: 'Motivational and energetic',
        lastUpdated: new Date()
      };

      vi.mocked(nicheContextRepository.findByNiche).mockResolvedValue(mockContext as INicheContext);

      const result = await service.getNicheContext('fitness');

      expect(result).toBeDefined();
      expect(result.niche).toBe('fitness');
      expect(result.vocabulary).toEqual(['workout', 'gains', 'protein']);
      expect(result.slangTerms).toHaveProperty('gains');
      expect(nicheContextRepository.findByNiche).toHaveBeenCalledWith('fitness');
    });

    it('should create default context if niche does not exist', async () => {
      vi.mocked(nicheContextRepository.findByNiche).mockResolvedValue(null);
      vi.mocked(nicheContextRepository.create).mockResolvedValue({
        _id: 'new123' as any,
        niche: 'travel',
        vocabulary: [],
        slangTerms: new Map(),
        culturalReferences: [],
        trendingTopics: [],
        trendingHashtags: [],
        trendingPhrases: [],
        typicalEmojis: ['✨', '🔥', '💯'],
        toneGuidelines: 'Casual and engaging, authentic to the platform',
        lastUpdated: new Date()
      } as INicheContext);

      const result = await service.getNicheContext('travel');

      expect(result).toBeDefined();
      expect(result.niche).toBe('travel');
      expect(nicheContextRepository.create).toHaveBeenCalled();
    });

    it('should use cached context on subsequent calls', async () => {
      const mockContext: Partial<INicheContext> = {
        _id: '123' as any,
        niche: 'food',
        vocabulary: ['recipe'],
        slangTerms: new Map(),
        culturalReferences: [],
        trendingTopics: [],
        trendingHashtags: [],
        trendingPhrases: [],
        typicalEmojis: ['🍕'],
        toneGuidelines: 'Friendly',
        lastUpdated: new Date()
      };

      vi.mocked(nicheContextRepository.findByNiche).mockResolvedValue(mockContext as INicheContext);

      // First call
      await service.getNicheContext('food');
      
      // Second call - should use cache
      await service.getNicheContext('food');

      // Repository should only be called once
      expect(nicheContextRepository.findByNiche).toHaveBeenCalledTimes(1);
    });
  });

  describe('getBlendedContext', () => {
    it('should blend contexts from multiple niches', async () => {
      const fitnessContext: Partial<INicheContext> = {
        _id: '1' as any,
        niche: 'fitness',
        vocabulary: ['workout', 'gains'],
        slangTerms: new Map([['gains', 'muscle growth']]),
        culturalReferences: ['Arnold'],
        trendingTopics: ['HIIT'],
        trendingHashtags: ['#fitness'],
        trendingPhrases: ['no pain no gain'],
        typicalEmojis: ['💪'],
        toneGuidelines: 'Motivational',
        lastUpdated: new Date()
      };

      const foodContext: Partial<INicheContext> = {
        _id: '2' as any,
        niche: 'food',
        vocabulary: ['recipe', 'delicious'],
        slangTerms: new Map([['yum', 'tasty']]),
        culturalReferences: ['Gordon Ramsay'],
        trendingTopics: ['meal prep'],
        trendingHashtags: ['#foodie'],
        trendingPhrases: ['nom nom'],
        typicalEmojis: ['🍕'],
        toneGuidelines: 'Friendly',
        lastUpdated: new Date()
      };

      vi.mocked(nicheContextRepository.findByNiche)
        .mockResolvedValueOnce(fitnessContext as INicheContext)
        .mockResolvedValueOnce(foodContext as INicheContext);

      const result = await service.getBlendedContext(['fitness', 'food']);

      expect(result).toBeDefined();
      expect(result.niche).toBe('fitness, food');
      expect(result.vocabulary).toContain('workout');
      expect(result.vocabulary).toContain('recipe');
      expect(result.slangTerms).toHaveProperty('gains');
      expect(result.slangTerms).toHaveProperty('yum');
      expect(result.typicalEmojis).toContain('💪');
      expect(result.typicalEmojis).toContain('🍕');
    });

    it('should return single context when only one niche provided', async () => {
      const mockContext: Partial<INicheContext> = {
        _id: '1' as any,
        niche: 'fitness',
        vocabulary: ['workout'],
        slangTerms: new Map(),
        culturalReferences: [],
        trendingTopics: [],
        trendingHashtags: [],
        trendingPhrases: [],
        typicalEmojis: ['💪'],
        toneGuidelines: 'Motivational',
        lastUpdated: new Date()
      };

      vi.mocked(nicheContextRepository.findByNiche).mockResolvedValue(mockContext as INicheContext);

      const result = await service.getBlendedContext(['fitness']);

      expect(result.niche).toBe('fitness');
    });

    it('should throw error when no niches provided', async () => {
      await expect(service.getBlendedContext([])).rejects.toThrow('At least one niche must be provided');
    });

    it('should remove duplicate values when blending', async () => {
      const context1: Partial<INicheContext> = {
        _id: '1' as any,
        niche: 'tech',
        vocabulary: ['code', 'dev'],
        slangTerms: new Map(),
        culturalReferences: [],
        trendingTopics: ['AI'],
        trendingHashtags: [],
        trendingPhrases: [],
        typicalEmojis: ['💻'],
        toneGuidelines: 'Technical',
        lastUpdated: new Date()
      };

      const context2: Partial<INicheContext> = {
        _id: '2' as any,
        niche: 'gaming',
        vocabulary: ['code', 'game'], // 'code' is duplicate
        slangTerms: new Map(),
        culturalReferences: [],
        trendingTopics: ['AI'], // 'AI' is duplicate
        trendingHashtags: [],
        trendingPhrases: [],
        typicalEmojis: ['💻', '🎮'], // '💻' is duplicate
        toneGuidelines: 'Fun',
        lastUpdated: new Date()
      };

      vi.mocked(nicheContextRepository.findByNiche)
        .mockResolvedValueOnce(context1 as INicheContext)
        .mockResolvedValueOnce(context2 as INicheContext);

      const result = await service.getBlendedContext(['tech', 'gaming']);

      // Should have unique values only
      expect(result.vocabulary).toHaveLength(3); // 'code', 'dev', 'game'
      expect(result.trendingTopics).toHaveLength(1); // 'AI'
      expect(result.typicalEmojis).toHaveLength(2); // '💻', '🎮'
    });
  });

  describe('isTermOutdated', () => {
    it('should return false for terms in current slang', async () => {
      const mockContext: Partial<INicheContext> = {
        _id: '1' as any,
        niche: 'fitness',
        vocabulary: ['workout'],
        slangTerms: new Map([['gains', 'muscle growth']]),
        culturalReferences: [],
        trendingTopics: [],
        trendingHashtags: [],
        trendingPhrases: [],
        typicalEmojis: [],
        toneGuidelines: '',
        lastUpdated: new Date()
      };

      vi.mocked(nicheContextRepository.findByNiche).mockResolvedValue(mockContext as INicheContext);

      const result = await service.isTermOutdated('gains', 'fitness');

      expect(result).toBe(false);
    });

    it('should return false for terms in trending phrases', async () => {
      const mockContext: Partial<INicheContext> = {
        _id: '1' as any,
        niche: 'fitness',
        vocabulary: [],
        slangTerms: new Map(),
        culturalReferences: [],
        trendingTopics: [],
        trendingHashtags: [],
        trendingPhrases: ['summer body ready'],
        typicalEmojis: [],
        toneGuidelines: '',
        lastUpdated: new Date()
      };

      vi.mocked(nicheContextRepository.findByNiche).mockResolvedValue(mockContext as INicheContext);

      const result = await service.isTermOutdated('summer', 'fitness');

      expect(result).toBe(false);
    });

    it('should return false for terms in vocabulary', async () => {
      const mockContext: Partial<INicheContext> = {
        _id: '1' as any,
        niche: 'fitness',
        vocabulary: ['workout', 'cardio'],
        slangTerms: new Map(),
        culturalReferences: [],
        trendingTopics: [],
        trendingHashtags: [],
        trendingPhrases: [],
        typicalEmojis: [],
        toneGuidelines: '',
        lastUpdated: new Date()
      };

      vi.mocked(nicheContextRepository.findByNiche).mockResolvedValue(mockContext as INicheContext);

      const result = await service.isTermOutdated('cardio', 'fitness');

      expect(result).toBe(false);
    });

    it('should return true for terms not in any list', async () => {
      const mockContext: Partial<INicheContext> = {
        _id: '1' as any,
        niche: 'fitness',
        vocabulary: ['workout'],
        slangTerms: new Map([['gains', 'muscle growth']]),
        culturalReferences: [],
        trendingTopics: [],
        trendingHashtags: [],
        trendingPhrases: ['no pain no gain'],
        typicalEmojis: [],
        toneGuidelines: '',
        lastUpdated: new Date()
      };

      vi.mocked(nicheContextRepository.findByNiche).mockResolvedValue(mockContext as INicheContext);

      const result = await service.isTermOutdated('obsolete_slang', 'fitness');

      expect(result).toBe(true);
    });
  });

  describe('updateTrends', () => {
    it('should call repository to update trends', async () => {
      vi.mocked(nicheContextRepository.updateTrends).mockResolvedValue(null);

      await service.updateTrends('fitness');

      expect(nicheContextRepository.updateTrends).toHaveBeenCalledWith('fitness', expect.any(Object));
    });

    it('should invalidate cache after updating trends', async () => {
      const mockContext: Partial<INicheContext> = {
        _id: '1' as any,
        niche: 'fitness',
        vocabulary: ['workout'],
        slangTerms: new Map(),
        culturalReferences: [],
        trendingTopics: [],
        trendingHashtags: [],
        trendingPhrases: [],
        typicalEmojis: [],
        toneGuidelines: '',
        lastUpdated: new Date()
      };

      vi.mocked(nicheContextRepository.findByNiche).mockResolvedValue(mockContext as INicheContext);
      vi.mocked(nicheContextRepository.updateTrends).mockResolvedValue(null);

      // First call to populate cache
      await service.getNicheContext('fitness');
      
      // Update trends (should invalidate cache)
      await service.updateTrends('fitness');

      // Next call should hit repository again
      await service.getNicheContext('fitness');

      // Should be called twice: once before update, once after
      expect(nicheContextRepository.findByNiche).toHaveBeenCalledTimes(2);
    });

    it('should accept and use provided trends data', async () => {
      vi.mocked(nicheContextRepository.updateTrends).mockResolvedValue(null);

      const trendsData = {
        trendingTopics: ['topic1', 'topic2'],
        trendingHashtags: ['#hash1', '#hash2'],
        trendingPhrases: ['phrase1', 'phrase2']
      };

      await service.updateTrends('fitness', trendsData);

      expect(nicheContextRepository.updateTrends).toHaveBeenCalledWith('fitness', trendsData);
    });
  });

  describe('getTermRelevanceScore', () => {
    it('should return high score for terms in trending phrases', async () => {
      const mockContext: Partial<INicheContext> = {
        _id: '1' as any,
        niche: 'fitness',
        vocabulary: [],
        slangTerms: new Map(),
        culturalReferences: [],
        trendingTopics: [],
        trendingHashtags: [],
        trendingPhrases: ['summer body ready'],
        typicalEmojis: [],
        toneGuidelines: '',
        lastUpdated: new Date()
      };

      vi.mocked(nicheContextRepository.findByNiche).mockResolvedValue(mockContext as INicheContext);

      const score = await service.getTermRelevanceScore('summer', 'fitness');

      expect(score).toBeGreaterThanOrEqual(40); // At least 40 points for trending phrases
    });

    it('should return score for terms in slang terms', async () => {
      const mockContext: Partial<INicheContext> = {
        _id: '1' as any,
        niche: 'fitness',
        vocabulary: [],
        slangTerms: new Map([['gains', 'muscle growth']]),
        culturalReferences: [],
        trendingTopics: [],
        trendingHashtags: [],
        trendingPhrases: [],
        typicalEmojis: [],
        toneGuidelines: '',
        lastUpdated: new Date()
      };

      vi.mocked(nicheContextRepository.findByNiche).mockResolvedValue(mockContext as INicheContext);

      const score = await service.getTermRelevanceScore('gains', 'fitness');

      expect(score).toBeGreaterThanOrEqual(30); // At least 30 points for slang terms
    });

    it('should return score for terms in vocabulary', async () => {
      const mockContext: Partial<INicheContext> = {
        _id: '1' as any,
        niche: 'fitness',
        vocabulary: ['workout', 'cardio'],
        slangTerms: new Map(),
        culturalReferences: [],
        trendingTopics: [],
        trendingHashtags: [],
        trendingPhrases: [],
        typicalEmojis: [],
        toneGuidelines: '',
        lastUpdated: new Date()
      };

      vi.mocked(nicheContextRepository.findByNiche).mockResolvedValue(mockContext as INicheContext);

      const score = await service.getTermRelevanceScore('cardio', 'fitness');

      expect(score).toBeGreaterThanOrEqual(20); // At least 20 points for vocabulary
    });

    it('should return zero for terms not in any list', async () => {
      const mockContext: Partial<INicheContext> = {
        _id: '1' as any,
        niche: 'fitness',
        vocabulary: ['workout'],
        slangTerms: new Map([['gains', 'muscle growth']]),
        culturalReferences: [],
        trendingTopics: [],
        trendingHashtags: [],
        trendingPhrases: ['no pain no gain'],
        typicalEmojis: [],
        toneGuidelines: '',
        lastUpdated: new Date()
      };

      vi.mocked(nicheContextRepository.findByNiche).mockResolvedValue(mockContext as INicheContext);

      const score = await service.getTermRelevanceScore('obsolete_slang', 'fitness');

      expect(score).toBe(0);
    });

    it('should accumulate scores for terms in multiple categories', async () => {
      const mockContext: Partial<INicheContext> = {
        _id: '1' as any,
        niche: 'fitness',
        vocabulary: ['workout'],
        slangTerms: new Map([['workout', 'exercise session']]),
        culturalReferences: [],
        trendingTopics: ['home workout'],
        trendingHashtags: [],
        trendingPhrases: ['quick workout'],
        typicalEmojis: [],
        toneGuidelines: '',
        lastUpdated: new Date()
      };

      vi.mocked(nicheContextRepository.findByNiche).mockResolvedValue(mockContext as INicheContext);

      const score = await service.getTermRelevanceScore('workout', 'fitness');

      // Should get: 40 (trending phrases) + 30 (slang) + 20 (vocabulary) + 10 (trending topics) = 100
      expect(score).toBe(100);
    });
  });

  describe('analyzeTrendsFromContent', () => {
    it('should extract trending hashtags from content', async () => {
      const contents = [
        {
          caption: 'Great workout today! #fitness #gym #workout',
          hashtags: ['#fitness', '#gym', '#workout'],
          engagementRate: 5.5,
          timestamp: new Date()
        },
        {
          caption: 'Another great session #fitness #training #workout',
          hashtags: ['#fitness', '#training', '#workout'],
          engagementRate: 5.2,
          timestamp: new Date()
        },
        {
          caption: 'Leg day complete #fitness #legday #gym',
          hashtags: ['#fitness', '#legday', '#gym'],
          engagementRate: 5.0,
          timestamp: new Date()
        },
        {
          caption: 'Morning cardio session #fitness #workout #gym',
          hashtags: ['#fitness', '#workout', '#gym'],
          engagementRate: 4.8,
          timestamp: new Date()
        },
        {
          caption: 'Strength training #fitness #strength #gym',
          hashtags: ['#fitness', '#strength', '#gym'],
          engagementRate: 4.5,
          timestamp: new Date()
        },
        {
          caption: 'Post workout meal #fitness #nutrition #workout',
          hashtags: ['#fitness', '#nutrition', '#workout'],
          engagementRate: 4.2,
          timestamp: new Date()
        }
      ];

      const trends = await service.analyzeTrendsFromContent('fitness', contents);

      expect(trends.trendingHashtags).toBeDefined();
      expect(trends.trendingHashtags.length).toBeGreaterThan(0);
      // With 6 posts, top 50% = 3 posts analyzed
      // #fitness should appear in all top 3 posts
      expect(trends.trendingHashtags).toContain('#fitness');
    });

    it('should extract trending phrases from captions', async () => {
      const contents = [
        {
          caption: 'Great workout today! Feeling strong and motivated',
          hashtags: [],
          engagementRate: 5.0,
          timestamp: new Date()
        },
        {
          caption: 'Another great workout! So motivated to keep going',
          hashtags: [],
          engagementRate: 4.5,
          timestamp: new Date()
        },
        {
          caption: 'Amazing great workout session this morning',
          hashtags: [],
          engagementRate: 4.8,
          timestamp: new Date()
        }
      ];

      const trends = await service.analyzeTrendsFromContent('fitness', contents);

      expect(trends.trendingPhrases).toBeDefined();
      expect(trends.trendingPhrases.length).toBeGreaterThan(0);
      // 'great workout' should appear as a trending phrase
    });

    it('should filter content from last 30 days', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 45); // 45 days ago

      const contents = [
        {
          caption: 'Old content #fitness',
          hashtags: ['#fitness'],
          engagementRate: 5.0,
          timestamp: oldDate // Too old
        }
      ];

      const trends = await service.analyzeTrendsFromContent('fitness', contents);

      // Should return empty arrays since all content is too old
      expect(trends.trendingHashtags).toEqual([]);
      expect(trends.trendingPhrases).toEqual([]);
      expect(trends.trendingTopics).toEqual([]);
    });

    it('should prioritize high-engagement content', async () => {
      const contents = [
        {
          caption: 'Low engagement post #lowEngagement',
          hashtags: ['#lowEngagement'],
          engagementRate: 1.0,
          timestamp: new Date()
        },
        {
          caption: 'Low engagement post 2 #lowEngagement',
          hashtags: ['#lowEngagement'],
          engagementRate: 1.1,
          timestamp: new Date()
        },
        {
          caption: 'High engagement post #highEngagement',
          hashtags: ['#highEngagement'],
          engagementRate: 10.0,
          timestamp: new Date()
        },
        {
          caption: 'Another high engagement #highEngagement',
          hashtags: ['#highEngagement'],
          engagementRate: 9.5,
          timestamp: new Date()
        },
        {
          caption: 'Third high engagement #highEngagement',
          hashtags: ['#highEngagement'],
          engagementRate: 9.0,
          timestamp: new Date()
        },
        {
          caption: 'Fourth high engagement #highEngagement',
          hashtags: ['#highEngagement'],
          engagementRate: 8.5,
          timestamp: new Date()
        }
      ];

      const trends = await service.analyzeTrendsFromContent('fitness', contents);

      // High engagement hashtag should appear (top 50% = 3 posts, all have #highEngagement)
      // Low engagement hashtag should NOT appear (bottom 50%)
      expect(trends.trendingHashtags).toContain('#highengagement');
      expect(trends.trendingHashtags).not.toContain('#lowengagement');
    });
  });

  describe('isTrendsDataStale', () => {
    it('should return true for stale trends', async () => {
      vi.mocked(nicheContextRepository.isStale).mockResolvedValue(true);

      const result = await service.isTrendsDataStale('fitness');

      expect(result).toBe(true);
      expect(nicheContextRepository.isStale).toHaveBeenCalledWith('fitness');
    });

    it('should return false for current trends', async () => {
      vi.mocked(nicheContextRepository.isStale).mockResolvedValue(false);

      const result = await service.isTrendsDataStale('fitness');

      expect(result).toBe(false);
      expect(nicheContextRepository.isStale).toHaveBeenCalledWith('fitness');
    });
  });
});
