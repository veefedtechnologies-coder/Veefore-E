import { BaseService } from './BaseService';
import { nicheContextRepository } from '../repositories/NicheContextRepository';
import { NicheContext } from '../domain/types';
import { INicheContext } from '../models/NicheContext/NicheContext';

/**
 * Service for managing niche-specific language, trends, and context
 * 
 * Requirements addressed:
 * - 3.1: Maintain language databases for different content niches
 * - 3.2: Provide niche-specific vocabulary, slang, references, and emojis
 * - 3.5: Blend language from multiple niches appropriately
 */
export class NicheContextService extends BaseService {
  // In-memory cache with TTL
  private contextCache: Map<string, { context: NicheContext; timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    super('NicheContextService');
  }

  /**
   * Get niche context for generation
   * Implements caching mechanism with TTL
   * 
   * @param niche - The content niche (e.g., 'fitness', 'food', 'travel')
   * @returns NicheContext with language data, trends, and style guidelines
   * 
   * Requirement: 3.1, 3.2
   */
  async getNicheContext(niche: string): Promise<NicheContext> {
    const method = 'getNicheContext';
    this.log(method, `Fetching context for niche: ${niche}`);

    try {
      // Check cache first
      const cached = this.getCachedContext(niche);
      if (cached) {
        this.log(method, `Cache hit for niche: ${niche}`);
        return cached;
      }

      // Fetch from database
      const normalizedNiche = niche.toLowerCase().trim();
      let contextDoc = await nicheContextRepository.findByNiche(normalizedNiche);

      // If niche doesn't exist, create default context
      if (!contextDoc) {
        this.log(method, `Niche not found, creating default context: ${normalizedNiche}`);
        contextDoc = await this.createDefaultContext(normalizedNiche);
      }

      // Convert to domain type and cache
      const context = this.convertToNicheContext(contextDoc);
      this.cacheContext(normalizedNiche, context);

      this.log(method, `Successfully fetched context for niche: ${niche}`, {
        vocabularySize: context.vocabulary.length,
        slangTerms: Object.keys(context.slangTerms).length,
        trendingTopics: context.trendingTopics.length
      });

      return context;
    } catch (error) {
      this.logError(method, error as Error, { niche });
      throw error;
    }
  }

  /**
   * Get blended context for multi-niche content
   * Merges language, trends, and style from multiple niches
   * 
   * @param niches - Array of content niches to blend
   * @returns Merged NicheContext with combined data from all niches
   * 
   * Requirement: 3.5
   */
  async getBlendedContext(niches: string[]): Promise<NicheContext> {
    const method = 'getBlendedContext';
    this.log(method, `Blending contexts for niches: ${niches.join(', ')}`);

    try {
      if (niches.length === 0) {
        throw new Error('At least one niche must be provided');
      }

      if (niches.length === 1) {
        return this.getNicheContext(niches[0]);
      }

      // Fetch all niche contexts
      const contexts = await Promise.all(
        niches.map(niche => this.getNicheContext(niche))
      );

      // Blend contexts
      const blendedContext: NicheContext = {
        id: `blended-${niches.join('-')}`,
        niche: niches.join(', '),
        vocabulary: this.mergeArrays(contexts.map(c => c.vocabulary)),
        slangTerms: this.mergeSlangTerms(contexts.map(c => c.slangTerms)),
        culturalReferences: this.mergeArrays(contexts.map(c => c.culturalReferences)),
        trendingTopics: this.mergeArrays(contexts.map(c => c.trendingTopics)),
        trendingHashtags: this.mergeArrays(contexts.map(c => c.trendingHashtags)),
        trendingPhrases: this.mergeArrays(contexts.map(c => c.trendingPhrases)),
        typicalEmojis: this.mergeArrays(contexts.map(c => c.typicalEmojis)),
        toneGuidelines: this.mergeToneGuidelines(contexts.map(c => c.toneGuidelines)),
        lastUpdated: new Date() // Current time for blended context
      };

      this.log(method, `Successfully blended ${niches.length} niches`, {
        vocabularySize: blendedContext.vocabulary.length,
        slangTerms: Object.keys(blendedContext.slangTerms).length
      });

      return blendedContext;
    } catch (error) {
      this.logError(method, error as Error, { niches });
      throw error;
    }
  }

  /**
   * Check if a term is outdated based on usage frequency over time
   * 
   * @param term - The slang term or phrase to check
   * @param niche - The content niche
   * @returns True if the term is outdated (not in current context)
   * 
   * Requirement: 3.6
   */
  async isTermOutdated(term: string, niche: string): Promise<boolean> {
    const method = 'isTermOutdated';
    
    try {
      const context = await this.getNicheContext(niche);
      const normalizedTerm = term.toLowerCase().trim();

      // Check if term exists in current slang terms or trending phrases
      const isInSlang = Object.keys(context.slangTerms).some(
        key => key.toLowerCase() === normalizedTerm
      );
      const isInTrending = context.trendingPhrases.some(
        phrase => phrase.toLowerCase().includes(normalizedTerm)
      );
      const isInVocabulary = context.vocabulary.some(
        word => word.toLowerCase() === normalizedTerm
      );

      const isOutdated = !isInSlang && !isInTrending && !isInVocabulary;

      this.log(method, `Term "${term}" in niche "${niche}" is ${isOutdated ? 'outdated' : 'current'}`);
      return isOutdated;
    } catch (error) {
      this.logError(method, error as Error, { term, niche });
      throw error;
    }
  }

  /**
   * Calculate term relevance score based on frequency and recency
   * Higher scores indicate more relevant/current terms
   * 
   * @param term - The term to score
   * @param niche - The content niche
   * @returns Relevance score (0-100)
   * 
   * Requirement: 3.6
   */
  async getTermRelevanceScore(term: string, niche: string): Promise<number> {
    const method = 'getTermRelevanceScore';
    
    try {
      const context = await this.getNicheContext(niche);
      const normalizedTerm = term.toLowerCase().trim();
      
      let score = 0;
      
      // Check if in trending phrases (highest priority) - 40 points
      const isInTrendingPhrases = context.trendingPhrases.some(
        phrase => phrase.toLowerCase().includes(normalizedTerm)
      );
      if (isInTrendingPhrases) {
        score += 40;
      }
      
      // Check if in slang terms (current language) - 30 points
      const isInSlang = Object.keys(context.slangTerms).some(
        key => key.toLowerCase() === normalizedTerm
      );
      if (isInSlang) {
        score += 30;
      }
      
      // Check if in vocabulary (established terms) - 20 points
      const isInVocabulary = context.vocabulary.some(
        word => word.toLowerCase() === normalizedTerm
      );
      if (isInVocabulary) {
        score += 20;
      }
      
      // Check if in trending topics - 10 points
      const isInTrendingTopics = context.trendingTopics.some(
        topic => topic.toLowerCase().includes(normalizedTerm)
      );
      if (isInTrendingTopics) {
        score += 10;
      }
      
      this.log(method, `Term "${term}" in niche "${niche}" scored ${score}/100`);
      return score;
    } catch (error) {
      this.logError(method, error as Error, { term, niche });
      throw error;
    }
  }

  /**
   * Update trends from external sources
   * This method refreshes trending data for a specific niche
   * In production, this would integrate with Instagram API or social media analytics
   * 
   * @param niche - The content niche to update
   * @param trendsData - Optional trend data to update (if not provided, fetches from sources)
   * 
   * Requirement: 3.3
   */
  async updateTrends(
    niche: string,
    trendsData?: {
      trendingTopics?: string[];
      trendingHashtags?: string[];
      trendingPhrases?: string[];
    }
  ): Promise<void> {
    const method = 'updateTrends';
    this.log(method, `Updating trends for niche: ${niche}`);

    try {
      const normalizedNiche = niche.toLowerCase().trim();
      
      // If trends data is provided, use it directly
      if (trendsData) {
        await nicheContextRepository.updateTrends(normalizedNiche, trendsData);
        this.log(method, `Updated trends with provided data for niche: ${niche}`, {
          topicsCount: trendsData.trendingTopics?.length || 0,
          hashtagsCount: trendsData.trendingHashtags?.length || 0,
          phrasesCount: trendsData.trendingPhrases?.length || 0
        });
      } else {
        // Fetch trends from external sources
        // In a real implementation, this would call Instagram API, social analytics, etc.
        const fetchedTrends = await this.fetchTrendsFromSources(normalizedNiche);
        await nicheContextRepository.updateTrends(normalizedNiche, fetchedTrends);
        
        this.log(method, `Updated trends from external sources for niche: ${niche}`, {
          topicsCount: fetchedTrends.trendingTopics?.length || 0,
          hashtagsCount: fetchedTrends.trendingHashtags?.length || 0,
          phrasesCount: fetchedTrends.trendingPhrases?.length || 0
        });
      }

      // Invalidate cache for this niche
      this.invalidateCache(normalizedNiche);

      this.log(method, `Successfully updated trends for niche: ${niche}`);
    } catch (error) {
      this.logError(method, error as Error, { niche });
      throw error;
    }
  }

  /**
   * Analyze and extract trending content from niche data
   * This method processes raw content to identify trends
   * 
   * @param niche - The content niche
   * @param contents - Array of content samples with engagement metrics
   * @returns Extracted trends
   * 
   * Requirement: 3.3
   */
  async analyzeTrendsFromContent(
    niche: string,
    contents: Array<{
      caption: string;
      hashtags: string[];
      engagementRate: number;
      timestamp: Date;
    }>
  ): Promise<{
    trendingTopics: string[];
    trendingHashtags: string[];
    trendingPhrases: string[];
  }> {
    const method = 'analyzeTrendsFromContent';
    this.log(method, `Analyzing trends from ${contents.length} content samples for niche: ${niche}`);

    try {
      // Filter content from last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const recentContents = contents.filter(c => c.timestamp >= thirtyDaysAgo);
      
      if (recentContents.length === 0) {
        this.log(method, 'No recent content found, returning empty trends');
        return {
          trendingTopics: [],
          trendingHashtags: [],
          trendingPhrases: []
        };
      }

      // Extract hashtags from high-performing content
      const hashtagFrequency = new Map<string, number>();
      const phraseFrequency = new Map<string, number>();
      
      // Sort by engagement rate to prioritize high-performing content
      const sortedContents = recentContents.sort((a, b) => b.engagementRate - a.engagementRate);
      
      // Analyze top 50% of content by engagement
      const topPerformers = sortedContents.slice(0, Math.ceil(sortedContents.length * 0.5));
      
      for (const content of topPerformers) {
        // Count hashtag frequency
        content.hashtags.forEach(tag => {
          const normalized = tag.toLowerCase().replace(/^#/, '');
          hashtagFrequency.set(normalized, (hashtagFrequency.get(normalized) || 0) + 1);
        });
        
        // Extract phrases (2-4 word sequences)
        const phrases = this.extractPhrases(content.caption);
        phrases.forEach(phrase => {
          phraseFrequency.set(phrase, (phraseFrequency.get(phrase) || 0) + 1);
        });
      }

      // Get top hashtags (appearing in at least 3 posts)
      const trendingHashtags = Array.from(hashtagFrequency.entries())
        .filter(([_, count]) => count >= 3)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([tag, _]) => `#${tag}`);

      // Get top phrases (appearing in at least 2 posts)
      const trendingPhrases = Array.from(phraseFrequency.entries())
        .filter(([_, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([phrase, _]) => phrase);

      // Extract topics from high-frequency hashtags and phrases
      const trendingTopics = this.extractTopicsFromHashtags(
        Array.from(hashtagFrequency.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 30)
          .map(([tag, _]) => tag)
      );

      this.log(method, `Extracted trends from content`, {
        hashtags: trendingHashtags.length,
        phrases: trendingPhrases.length,
        topics: trendingTopics.length
      });

      return {
        trendingTopics,
        trendingHashtags,
        trendingPhrases
      };
    } catch (error) {
      this.logError(method, error as Error, { niche, contentsCount: contents.length });
      throw error;
    }
  }

  /**
   * Check if niche trends are stale and need updating
   * Trends older than 30 days are considered stale
   * 
   * @param niche - The content niche to check
   * @returns True if trends are stale
   * 
   * Requirement: 3.3
   */
  async isTrendsDataStale(niche: string): Promise<boolean> {
    const method = 'isTrendsDataStale';
    
    try {
      const normalizedNiche = niche.toLowerCase().trim();
      const isStale = await nicheContextRepository.isStale(normalizedNiche);
      
      this.log(method, `Niche "${niche}" trends are ${isStale ? 'stale' : 'current'}`);
      return isStale;
    } catch (error) {
      this.logError(method, error as Error, { niche });
      throw error;
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Fetch trends from external sources
   * In production, this would integrate with Instagram API, social analytics, etc.
   * For now, returns empty arrays as a placeholder for external integration
   */
  private async fetchTrendsFromSources(niche: string): Promise<{
    trendingTopics?: string[];
    trendingHashtags?: string[];
    trendingPhrases?: string[];
  }> {
    // Placeholder for external API integration
    // In production, this would:
    // 1. Call Instagram Graph API for trending hashtags
    // 2. Query social analytics services for trending topics
    // 3. Analyze top-performing content in the niche
    // 4. Integrate with trend tracking services
    
    this.log('fetchTrendsFromSources', `Fetching from external sources (placeholder) for: ${niche}`);
    
    // Return empty data structure
    // External integration would populate this
    return {
      trendingTopics: [],
      trendingHashtags: [],
      trendingPhrases: []
    };
  }

  /**
   * Extract 2-4 word phrases from caption text
   */
  private extractPhrases(caption: string): string[] {
    const phrases: string[] = [];
    
    // Clean caption - remove emojis, hashtags, mentions, URLs
    const cleaned = caption
      .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Emoticons
      .replace(/[\u{1F300}-\u{1F5FF}]/gu, '') // Misc symbols
      .replace(/[\u{1F680}-\u{1F6FF}]/gu, '') // Transport
      .replace(/[\u{2600}-\u{26FF}]/gu, '')   // Misc symbols
      .replace(/[\u{2700}-\u{27BF}]/gu, '')   // Dingbats
      .replace(/#\w+/g, '')                    // Hashtags
      .replace(/@\w+/g, '')                    // Mentions
      .replace(/https?:\/\/\S+/g, '')          // URLs
      .replace(/[^\w\s]/g, ' ')                // Punctuation
      .toLowerCase()
      .trim();
    
    const words = cleaned.split(/\s+/).filter(w => w.length > 0);
    
    // Extract 2-word phrases
    for (let i = 0; i < words.length - 1; i++) {
      phrases.push(`${words[i]} ${words[i + 1]}`);
    }
    
    // Extract 3-word phrases
    for (let i = 0; i < words.length - 2; i++) {
      phrases.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
    }
    
    // Extract 4-word phrases
    for (let i = 0; i < words.length - 3; i++) {
      phrases.push(`${words[i]} ${words[i + 1]} ${words[i + 2]} ${words[i + 3]}`);
    }
    
    return phrases;
  }

  /**
   * Extract topics from hashtags by removing common words and finding patterns
   */
  private extractTopicsFromHashtags(hashtags: string[]): string[] {
    const topics: string[] = [];
    const commonWords = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'who', 'way', 'use']);
    
    // Group hashtags by common themes
    const themeMap = new Map<string, number>();
    
    for (const hashtag of hashtags) {
      // Split camelCase or concatenated words
      const words = hashtag
        .replace(/([A-Z])/g, ' $1')
        .toLowerCase()
        .split(/[_\s]+/)
        .filter(w => w.length > 3 && !commonWords.has(w));
      
      words.forEach(word => {
        themeMap.set(word, (themeMap.get(word) || 0) + 1);
      });
    }
    
    // Get top recurring themes (appearing in multiple hashtags)
    const topThemes = Array.from(themeMap.entries())
      .filter(([_, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([theme, _]) => theme);
    
    topics.push(...topThemes);
    
    return topics;
  }

  /**
   * Get cached context if available and not expired
   */
  private getCachedContext(niche: string): NicheContext | null {
    const normalizedNiche = niche.toLowerCase().trim();
    const cached = this.contextCache.get(normalizedNiche);
    
    if (!cached) return null;
    
    const now = Date.now();
    if (now - cached.timestamp > this.CACHE_TTL_MS) {
      this.contextCache.delete(normalizedNiche);
      return null;
    }
    
    return cached.context;
  }

  /**
   * Cache context with current timestamp
   */
  private cacheContext(niche: string, context: NicheContext): void {
    const normalizedNiche = niche.toLowerCase().trim();
    this.contextCache.set(normalizedNiche, {
      context,
      timestamp: Date.now()
    });
  }

  /**
   * Invalidate cache for a specific niche
   */
  private invalidateCache(niche: string): void {
    const normalizedNiche = niche.toLowerCase().trim();
    this.contextCache.delete(normalizedNiche);
  }

  /**
   * Convert MongoDB document to domain type
   */
  private convertToNicheContext(doc: INicheContext): NicheContext {
    return {
      id: doc._id.toString(),
      niche: doc.niche,
      vocabulary: doc.vocabulary || [],
      slangTerms: Object.fromEntries(doc.slangTerms || new Map()),
      culturalReferences: doc.culturalReferences || [],
      trendingTopics: doc.trendingTopics || [],
      trendingHashtags: doc.trendingHashtags || [],
      trendingPhrases: doc.trendingPhrases || [],
      typicalEmojis: doc.typicalEmojis || [],
      toneGuidelines: doc.toneGuidelines || '',
      lastUpdated: doc.lastUpdated || new Date()
    };
  }

  /**
   * Create default context for a new niche
   */
  private async createDefaultContext(niche: string): Promise<INicheContext> {
    const defaultData = {
      niche,
      vocabulary: [],
      slangTerms: new Map(),
      culturalReferences: [],
      trendingTopics: [],
      trendingHashtags: [],
      trendingPhrases: [],
      typicalEmojis: ['✨', '🔥', '💯'],
      toneGuidelines: 'Casual and engaging, authentic to the platform',
      lastUpdated: new Date()
    };

    return await nicheContextRepository.create(defaultData);
  }

  /**
   * Merge arrays from multiple contexts, removing duplicates
   */
  private mergeArrays(arrays: string[][]): string[] {
    const merged = new Set<string>();
    for (const array of arrays) {
      for (const item of array) {
        merged.add(item);
      }
    }
    return Array.from(merged);
  }

  /**
   * Merge slang terms from multiple contexts
   */
  private mergeSlangTerms(slangMaps: Record<string, string>[]): Record<string, string> {
    const merged: Record<string, string> = {};
    for (const slangMap of slangMaps) {
      Object.assign(merged, slangMap);
    }
    return merged;
  }

  /**
   * Merge tone guidelines from multiple contexts
   */
  private mergeToneGuidelines(guidelines: string[]): string {
    // Filter out empty guidelines and join with semicolons
    const validGuidelines = guidelines.filter(g => g && g.trim().length > 0);
    if (validGuidelines.length === 0) {
      return 'Casual and engaging, authentic to the platform';
    }
    return validGuidelines.join('; ');
  }
}

// Export singleton instance
export const nicheContextService = new NicheContextService();
