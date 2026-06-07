import { BaseService } from './BaseService';
import { nicheContextService } from './NicheContextService';
import { aiServiceManager } from './AIServiceManager';
import { storage } from '../mongodb-storage';
import { hashtagPerformanceRepository } from '../repositories/HashtagPerformanceRepository';

/**
 * Enhanced Hashtag Generation Service
 * 
 * Implements strategic hashtag generation with:
 * - 30/50/20 competition mix (high/medium/low)
 * - Content-specific relevance scoring
 * - Niche context integration
 * - Trending hashtag prioritization
 * - Performance tracking
 * 
 * Requirements addressed:
 * - 6.1: Generate 15-25 strategic hashtags per post
 * - 6.2: Implement 30/50/20 competition ratio (high/medium/low)
 * - 6.3: Content theme analysis for micro-niche hashtags
 * - 6.4: Banned/spam hashtag filtering
 * - 6.5: Branded hashtag detection
 * - 6.6: Niche-specific hashtag performance tracking
 */

export interface HashtagCompetition {
  hashtag: string;
  competition: 'high' | 'medium' | 'low';
  estimatedPostCount: number;
  relevanceScore: number;
}

export interface HashtagGenerationParams {
  caption: string;
  mediaAnalysis?: string;
  niche: string;
  platform: string;
  postType: 'post' | 'story' | 'reel';
  userId?: string;
  workspaceId?: string;
  targetCount?: number; // Default 15-25
  brandedHashtags?: string[];
  aiPreferences?: any; // AI preferences for generation
}

export interface HashtagGenerationResult {
  hashtags: string[];
  breakdown: {
    high: string[];      // 30% - >1M posts
    medium: string[];    // 50% - 100K-1M posts
    low: string[];       // 20% - <100K posts
    branded: string[];   // User-specific branded tags
  };
  performanceEstimate: {
    discoverabilityScore: number;  // 0-100
    rankingPotential: number;      // 0-100
    overall: number;               // 0-100
  };
}

export class HashtagGeneratorService extends BaseService {
  // Hashtag blacklist - banned, broken, or spam-associated hashtags
  // Updated weekly through external integration
  private readonly HASHTAG_BLACKLIST = new Set([
    // Instagram banned hashtags (common ones)
    'alone',
    'brain',
    'costumes',
    'date',
    'dating',
    'direct',
    'dm',
    'follow',
    'followers',
    'followme',
    'followback',
    'ilovemyjob',
    'instagram',
    'instagood',
    'instamood',
    'likes',
    'like4like',
    'likeforlike',
    'sextember',
    'single',
    'snapchat',
    'stranger',
    'thought',
    'valentinesday',
    'workflow',
    // Generic spam-associated
    'spam',
    'f4f',
    'l4l',
    's4s',
    'followforfollow',
    'likeforfollow',
    'likeforlikes',
    'followtrain',
    'teamfollowback',
    'follow4follow',
    'followforfollow',
    'like4likes',
    'tagsforlikes',
    'instadaily',
    'instalike',
    'instacool',
    'tflers'
  ]);

  // Competition thresholds (post counts)
  private readonly COMPETITION = {
    HIGH: 1_000_000,    // >1M posts
    MEDIUM_MIN: 100_000, // 100K-1M posts
    LOW_MAX: 100_000    // <100K posts
  };

  constructor() {
    super('HashtagGeneratorService');
  }

  /**
   * Generate strategic hashtags with competition mix
   * 
   * Implements the core hashtag generation algorithm:
   * 1. Extract content themes from caption and media analysis
   * 2. Fetch trending hashtags from niche context
   * 3. Generate additional relevant hashtags using AI
   * 4. Score and filter based on relevance and competition
   * 5. Apply 30/50/20 distribution strategy
   * 6. Filter blacklisted hashtags
   * 7. Add branded hashtags
   * 
   * @param params - Hashtag generation parameters
   * @returns Strategic hashtag mix with performance estimates
   * 
   * Requirement: 6.1, 6.2, 6.3
   */
  async generateStrategicHashtags(params: HashtagGenerationParams): Promise<HashtagGenerationResult> {
    const method = 'generateStrategicHashtags';
    this.log(method, 'Starting strategic hashtag generation', {
      niche: params.niche,
      platform: params.platform,
      postType: params.postType
    });

    try {
      const targetCount = params.targetCount || this.getRandomCountInRange(15, 25);

      // Step 1: Extract content themes
      const themes = await this.extractContentThemes(params.caption, params.mediaAnalysis);
      this.log(method, `Extracted ${themes.length} content themes`, { themes });

      // Step 2: Get niche context with trending hashtags
      const nicheContext = await nicheContextService.getNicheContext(params.niche);
      const trendingHashtags = nicheContext.trendingHashtags || [];
      this.log(method, `Fetched ${trendingHashtags.length} trending hashtags from niche context`);

      // Step 3: Generate additional hashtags using AI
      const aiHashtags = await this.generateAIHashtags(params, themes, trendingHashtags);
      this.log(method, `Generated ${aiHashtags.length} hashtags using AI`);

      // Step 3.5: Get performance-based recommendations
      let performanceHashtags: string[] = [];
      try {
        const highRecs = await this.getPerformanceBasedRecommendations(params.niche, themes, 'high', 5);
        const mediumRecs = await this.getPerformanceBasedRecommendations(params.niche, themes, 'medium', 8);
        const lowRecs = await this.getPerformanceBasedRecommendations(params.niche, themes, 'low', 5);
        
        performanceHashtags = [
          ...highRecs.map(r => r.hashtag),
          ...mediumRecs.map(r => r.hashtag),
          ...lowRecs.map(r => r.hashtag)
        ];
        
        this.log(method, `Added ${performanceHashtags.length} performance-based hashtags`);
      } catch (error) {
        this.logError(method, error as Error, { context: 'performance recommendations' });
        // Continue without performance recommendations if they fail
      }

      // Step 4: Combine and deduplicate hashtags
      const allHashtags = this.deduplicateHashtags([
        ...performanceHashtags,    // Prioritize proven performers
        ...trendingHashtags,
        ...aiHashtags
      ]);
      this.log(method, `Combined into ${allHashtags.length} unique hashtags`);

      // Step 5: Score hashtags for relevance
      const scoredHashtags = await this.scoreHashtagRelevance(
        allHashtags,
        themes,
        params.caption,
        params.niche
      );
      this.log(method, `Scored ${scoredHashtags.length} hashtags for relevance`);

      // Step 6: Categorize by competition level
      const categorized = await this.categorizeByCompetition(scoredHashtags);
      this.log(method, 'Categorized hashtags by competition', {
        high: categorized.high.length,
        medium: categorized.medium.length,
        low: categorized.low.length
      });

      // Step 7: Apply 30/50/20 distribution strategy
      const distributed = this.applyDistributionStrategy(categorized, targetCount);
      this.log(method, 'Applied 30/50/20 distribution', {
        high: distributed.high.length,
        medium: distributed.medium.length,
        low: distributed.low.length
      });

      // Step 8: Add branded hashtags if provided
      let brandedHashtags: string[] = [];
      if (params.brandedHashtags && params.brandedHashtags.length > 0) {
        brandedHashtags = params.brandedHashtags.slice(0, 3); // Max 3 branded tags
      } else if (params.userId && params.workspaceId) {
        // Detect branded hashtags from user's voice profile
        brandedHashtags = await this.detectBrandedHashtags(params.userId, params.workspaceId);
      }
      this.log(method, `Added ${brandedHashtags.length} branded hashtags`);

      // Step 9: Combine all hashtags
      const finalHashtags = [
        ...distributed.high.map(h => h.hashtag),
        ...distributed.medium.map(h => h.hashtag),
        ...distributed.low.map(h => h.hashtag),
        ...brandedHashtags
      ];

      // Step 10: Calculate performance estimates
      const performanceEstimate = this.calculatePerformanceEstimate(
        distributed,
        brandedHashtags.length,
        targetCount
      );

      const result: HashtagGenerationResult = {
        hashtags: finalHashtags,
        breakdown: {
          high: distributed.high.map(h => h.hashtag),
          medium: distributed.medium.map(h => h.hashtag),
          low: distributed.low.map(h => h.hashtag),
          branded: brandedHashtags
        },
        performanceEstimate
      };

      this.log(method, 'Strategic hashtag generation complete', {
        total: result.hashtags.length,
        performanceScore: result.performanceEstimate.overall
      });

      return result;
    } catch (error) {
      this.logError(method, error as Error, params);
      throw error;
    }
  }

  /**
   * Extract content themes from caption and media analysis
   * Identifies specific topics, objects, emotions, and concepts
   * 
   * @param caption - Post caption text
   * @param mediaAnalysis - Optional media analysis text
   * @returns Array of content themes
   * 
   * Requirement: 6.3
   */
  private async extractContentThemes(caption: string, mediaAnalysis?: string): Promise<string[]> {
    const method = 'extractContentThemes';
    const themes = new Set<string>();

    try {
      // Extract themes from caption
      const captionThemes = this.extractThemesFromText(caption);
      captionThemes.forEach(theme => themes.add(theme));

      // Extract themes from media analysis if available
      if (mediaAnalysis) {
        const mediaThemes = this.extractThemesFromText(mediaAnalysis);
        mediaThemes.forEach(theme => themes.add(theme));
      }

      // Use AI to extract deeper themes if needed
      if (themes.size < 5) {
        const aiThemes = await this.extractThemesUsingAI(caption, mediaAnalysis);
        aiThemes.forEach(theme => themes.add(theme));
      }

      return Array.from(themes).slice(0, 10); // Max 10 themes
    } catch (error) {
      this.logError(method, error as Error, { caption, mediaAnalysis });
      return Array.from(themes);
    }
  }

  /**
   * Extract themes from text using NLP techniques
   */
  private extractThemesFromText(text: string): string[] {
    const themes: string[] = [];
    
    // Remove emojis, hashtags, mentions
    const cleaned = text
      .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
      .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
      .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
      .replace(/[\u{2600}-\u{26FF}]/gu, '')
      .replace(/[\u{2700}-\u{27BF}]/gu, '')
      .replace(/#\w+/g, '')
      .replace(/@\w+/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .toLowerCase()
      .trim();

    // Extract nouns and significant words (basic approach)
    const words = cleaned.split(/\s+/).filter(w => w.length > 3);
    
    // Common stop words to exclude
    const stopWords = new Set([
      'this', 'that', 'these', 'those', 'will', 'would', 'should', 'could',
      'have', 'has', 'had', 'been', 'being', 'were', 'was', 'are', 'is',
      'just', 'very', 'really', 'more', 'most', 'some', 'such', 'your',
      'their', 'with', 'from', 'about', 'into', 'through', 'during', 'before',
      'after', 'above', 'below', 'between', 'under', 'again', 'further',
      'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how'
    ]);

    // Filter significant words
    const significantWords = words.filter(w => !stopWords.has(w));
    
    // Take top 5 by frequency
    const wordFreq = new Map<string, number>();
    significantWords.forEach(word => {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    });

    const sortedWords = Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);

    themes.push(...sortedWords);
    
    return themes;
  }

  /**
   * Use AI to extract themes from content
   */
  private async extractThemesUsingAI(caption: string, mediaAnalysis?: string): Promise<string[]> {
    try {
      const prompt = `Analyze this social media content and extract 5-10 specific content themes as single words or short phrases (max 2 words each).

Caption: ${caption}
${mediaAnalysis ? `Visual content: ${mediaAnalysis}` : ''}

Return ONLY a comma-separated list of themes. Focus on specific topics, objects, emotions, concepts.
Example format: "fitness, motivation, morning routine, healthy eating, workout"

Themes:`;

      const response = await aiServiceManager.generateText(prompt, {
        aiModel: 'veegpt-hybrid',
        creativityLevel: 0.5
      });

      const themes = response
        .split(',')
        .map(t => t.trim().toLowerCase())
        .filter(t => t.length > 0 && t.length < 30);

      return themes;
    } catch (error) {
      this.logError('extractThemesUsingAI', error as Error, { caption });
      return [];
    }
  }

  /**
   * Generate hashtags using AI based on content and themes
   */
  private async generateAIHashtags(
    params: HashtagGenerationParams,
    themes: string[],
    trendingHashtags: string[]
  ): Promise<string[]> {
    const method = 'generateAIHashtags';
    
    try {
      const prompt = `Generate 20-30 highly relevant Instagram hashtags for this content.

Content Niche: ${params.niche}
Post Type: ${params.postType}
Content Themes: ${themes.join(', ')}
Caption: ${params.caption}
${params.mediaAnalysis ? `Visual content: ${params.mediaAnalysis}` : ''}

TRENDING HASHTAGS (PRIORITY - include 8-12 of these):
${trendingHashtags.join(', ')}

REQUIREMENTS:
1. Include 8-12 trending hashtags from the list above
2. Generate micro-niche hashtags specific to the content themes
3. Mix hashtag sizes: some popular (100K-1M), some niche (10K-100K), some ultra-niche (<10K)
4. Focus on discoverability and relevance over pure popularity
5. Avoid banned or spam hashtags (no #follow, #like4like, #f4f, etc.)
6. Make hashtags specific to the actual content, not just the general niche

Return ONLY hashtags with # symbols, separated by spaces. No explanations.

Hashtags:`;

      const response = await aiServiceManager.generateText(prompt, {
        aiModel: params.aiPreferences?.aiModel || 'veegpt-hybrid',
        creativityLevel: 0.7
      });

      const hashtags = response
        .split(/\s+/)
        .filter(tag => tag.startsWith('#'))
        .map(tag => tag.replace('#', '').toLowerCase())
        .filter(tag => !this.HASHTAG_BLACKLIST.has(tag) && tag.length > 0);

      this.log(method, `AI generated ${hashtags.length} hashtags`);
      return hashtags;
    } catch (error) {
      this.logError(method, error as Error, params);
      return [];
    }
  }

  /**
   * Deduplicate hashtags (case-insensitive)
   */
  private deduplicateHashtags(hashtags: string[]): string[] {
    const seen = new Set<string>();
    const unique: string[] = [];

    for (const tag of hashtags) {
      const normalized = tag.replace('#', '').toLowerCase().trim();
      if (normalized && !seen.has(normalized) && !this.HASHTAG_BLACKLIST.has(normalized)) {
        seen.add(normalized);
        unique.push(normalized);
      }
    }

    return unique;
  }

  /**
   * Score hashtags for relevance to content with performance-based ranking
   * 
   * Enhanced scoring factors:
   * - Content relevance (50 points):
   *   - Theme match (25 points)
   *   - Caption keyword match (15 points)
   *   - Niche relevance (10 points)
   * - Historical performance (30 points):
   *   - Engagement rate history (20 points)
   *   - Usage frequency bonus (10 points)
   * - Trending bonus (10 points)
   * - Competition optimization (10 points):
   *   - Balanced competition score
   * 
   * @returns Array of hashtags with enhanced relevance scores (0-100)
   * 
   * Requirement: 6.3, 6.6
   */
  private async scoreHashtagRelevance(
    hashtags: string[],
    themes: string[],
    caption: string,
    niche: string
  ): Promise<HashtagCompetition[]> {
    const method = 'scoreHashtagRelevance';
    
    try {
      const scored: HashtagCompetition[] = [];
      const captionLower = caption.toLowerCase();
      const nicheContext = await nicheContextService.getNicheContext(niche);

      // Get performance data for all hashtags in parallel
      const performancePromises = hashtags.map(hashtag => 
        hashtagPerformanceRepository.findByHashtagAndNiche(hashtag, niche)
      );
      const performanceRecords = await Promise.all(performancePromises);
      const performanceMap = new Map<string, typeof performanceRecords[0]>();
      
      hashtags.forEach((hashtag, index) => {
        if (performanceRecords[index]) {
          performanceMap.set(hashtag, performanceRecords[index]);
        }
      });

      for (const hashtag of hashtags) {
        let score = 0;
        let contentRelevanceScore = 0;
        let performanceScore = 0;
        let trendingScore = 0;
        let competitionScore = 0;

        // ========== Content Relevance (50 points) ==========
        
        // Theme match (25 points) - exact or partial match
        let themeMatchScore = 0;
        for (const theme of themes) {
          if (hashtag === theme) {
            themeMatchScore = 25; // Exact match
            break;
          } else if (hashtag.includes(theme)) {
            themeMatchScore = Math.max(themeMatchScore, 20); // Contains theme
          } else if (theme.includes(hashtag)) {
            themeMatchScore = Math.max(themeMatchScore, 15); // Theme contains hashtag
          }
        }
        contentRelevanceScore += themeMatchScore;

        // Caption keyword match (15 points)
        if (captionLower.includes(hashtag)) {
          contentRelevanceScore += 15;
        }

        // Niche relevance (10 points)
        const nicheRelevance = await nicheContextService.getTermRelevanceScore(hashtag, niche);
        contentRelevanceScore += (nicheRelevance / 100) * 10;

        // ========== Historical Performance (30 points) ==========
        
        const perfRecord = performanceMap.get(hashtag);
        if (perfRecord && perfRecord.usageCount >= 3) {
          // Has enough historical data for reliable scoring
          
          // Engagement rate history (20 points)
          // Scale: 0-5% engagement = 0-20 points
          const engagementScore = Math.min((perfRecord.avgEngagementRate / 5) * 20, 20);
          performanceScore += engagementScore;
          
          // Usage frequency bonus (10 points)
          // More usage = more confidence in performance data
          const usageBonus = Math.min((perfRecord.usageCount / 20) * 10, 10);
          performanceScore += usageBonus;
        } else if (perfRecord && perfRecord.usageCount > 0) {
          // Limited data, give partial credit
          const limitedDataScore = Math.min((perfRecord.avgEngagementRate / 5) * 10, 10);
          performanceScore += limitedDataScore;
        }
        // If no performance data, score remains 0 (neutral)

        // ========== Trending Bonus (10 points) ==========
        
        const isTrending = nicheContext.trendingHashtags.some(t => 
          t.replace('#', '').toLowerCase() === hashtag
        );
        if (isTrending) {
          trendingScore = 10;
        }

        // ========== Competition Optimization (10 points) ==========
        
        // Use performance data for competition estimate if available
        let estimatedPostCount: number;
        let competition: 'high' | 'medium' | 'low';
        
        if (perfRecord) {
          estimatedPostCount = perfRecord.estimatedPostCount;
          competition = perfRecord.estimatedCompetition;
        } else {
          estimatedPostCount = this.estimateHashtagCompetition(hashtag, niche);
          competition = this.getCompetitionLevel(estimatedPostCount);
        }
        
        // Balanced competition scoring:
        // Medium competition is ideal (10 points)
        // Low and high get proportionally less
        if (competition === 'medium') {
          competitionScore = 10;
        } else if (competition === 'low') {
          competitionScore = 7; // Still good for ranking
        } else {
          competitionScore = 5; // High competition, harder to rank
        }

        // ========== Calculate Total Score ==========
        
        score = contentRelevanceScore + performanceScore + trendingScore + competitionScore;

        scored.push({
          hashtag,
          competition,
          estimatedPostCount,
          relevanceScore: Math.min(score, 100)
        });
      }

      // Sort by relevance score (highest first)
      scored.sort((a, b) => b.relevanceScore - a.relevanceScore);

      this.log(method, `Scored ${scored.length} hashtags with performance data`, {
        withPerformanceData: performanceMap.size,
        avgScore: scored.reduce((sum, h) => sum + h.relevanceScore, 0) / scored.length
      });
      
      return scored;
    } catch (error) {
      this.logError(method, error as Error, { hashtagCount: hashtags.length });
      return [];
    }
  }

  /**
   * Estimate hashtag competition based on hashtag characteristics
   * In production, this would query Instagram API for actual post counts
   */
  private estimateHashtagCompetition(hashtag: string, niche: string): number {
    // Simple heuristic estimation based on hashtag length and niche
    // In production, replace with actual Instagram API query
    
    const length = hashtag.length;
    
    // Very short hashtags tend to be high competition
    if (length <= 5) return 5_000_000;
    
    // Generic terms are high competition
    const genericTerms = ['love', 'life', 'happy', 'beautiful', 'amazing', 'cool', 'fun'];
    if (genericTerms.some(term => hashtag.includes(term))) {
      return 2_000_000;
    }
    
    // Niche-specific tags with length 6-10 are medium competition
    if (length >= 6 && length <= 10) return 500_000;
    
    // Longer, more specific hashtags are low competition
    if (length > 10) return 50_000;
    
    // Default medium
    return 300_000;
  }

  /**
   * Determine competition level based on estimated post count
   */
  private getCompetitionLevel(postCount: number): 'high' | 'medium' | 'low' {
    if (postCount >= this.COMPETITION.HIGH) return 'high';
    if (postCount >= this.COMPETITION.MEDIUM_MIN) return 'medium';
    return 'low';
  }

  /**
   * Categorize hashtags by competition level
   */
  private async categorizeByCompetition(scored: HashtagCompetition[]): Promise<{
    high: HashtagCompetition[];
    medium: HashtagCompetition[];
    low: HashtagCompetition[];
  }> {
    const high: HashtagCompetition[] = [];
    const medium: HashtagCompetition[] = [];
    const low: HashtagCompetition[] = [];

    for (const item of scored) {
      if (item.competition === 'high') high.push(item);
      else if (item.competition === 'medium') medium.push(item);
      else low.push(item);
    }

    return { high, medium, low };
  }

  /**
   * Apply 30/50/20 distribution strategy
   * 
   * @param categorized - Hashtags categorized by competition
   * @param targetCount - Target total number of hashtags (15-25)
   * @returns Distributed hashtags following 30/50/20 rule
   * 
   * Requirement: 6.2
   */
  private applyDistributionStrategy(
    categorized: {
      high: HashtagCompetition[];
      medium: HashtagCompetition[];
      low: HashtagCompetition[];
    },
    targetCount: number
  ): {
    high: HashtagCompetition[];
    medium: HashtagCompetition[];
    low: HashtagCompetition[];
  } {
    const highTarget = Math.round(targetCount * 0.30);  // 30%
    const mediumTarget = Math.round(targetCount * 0.50); // 50%
    const lowTarget = Math.round(targetCount * 0.20);    // 20%

    // Ensure we have enough hashtags in each category
    // If not enough in a category, redistribute to others
    const highAvailable = Math.min(highTarget, categorized.high.length);
    const mediumAvailable = Math.min(mediumTarget, categorized.medium.length);
    const lowAvailable = Math.min(lowTarget, categorized.low.length);

    // If we're short in any category, take from the most abundant
    const shortage = (highTarget - highAvailable) + 
                     (mediumTarget - mediumAvailable) + 
                     (lowTarget - lowAvailable);

    let mediumAdjusted = mediumAvailable;
    let highAdjusted = highAvailable;
    let lowAdjusted = lowAvailable;

    if (shortage > 0) {
      // Try to fill shortage from medium first (usually most available)
      if (categorized.medium.length > mediumAvailable) {
        const extraMedium = Math.min(shortage, categorized.medium.length - mediumAvailable);
        mediumAdjusted += extraMedium;
      }
    }

    return {
      high: categorized.high.slice(0, highAdjusted),
      medium: categorized.medium.slice(0, mediumAdjusted),
      low: categorized.low.slice(0, lowAdjusted)
    };
  }

  /**
   * Detect branded hashtags from user's voice profile
   * 
   * @param userId - User ID
   * @param workspaceId - Workspace ID
   * @returns Array of branded hashtags
   * 
   * Requirement: 6.5
   */
  private async detectBrandedHashtags(userId: string, workspaceId: string): Promise<string[]> {
    const method = 'detectBrandedHashtags';
    
    try {
      // Get user's recent content to detect branded hashtags
      const recentContent = await storage.getContentByWorkspace(workspaceId, 20);
      
      if (!recentContent || recentContent.length === 0) {
        return [];
      }

      // Count hashtag frequency across user's content
      const hashtagFrequency = new Map<string, number>();
      
      for (const content of recentContent) {
        const hashtags = content.contentData?.hashtags || [];
        hashtags.forEach((tag: string) => {
          const normalized = tag.replace('#', '').toLowerCase();
          hashtagFrequency.set(normalized, (hashtagFrequency.get(normalized) || 0) + 1);
        });
      }

      // Branded hashtags are those that appear in 30%+ of posts
      const threshold = Math.ceil(recentContent.length * 0.3);
      const brandedHashtags = Array.from(hashtagFrequency.entries())
        .filter(([_, count]) => count >= threshold)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([tag]) => tag);

      this.log(method, `Detected ${brandedHashtags.length} branded hashtags`, { brandedHashtags });
      return brandedHashtags;
    } catch (error) {
      this.logError(method, error as Error, { userId, workspaceId });
      return [];
    }
  }

  /**
   * Calculate performance estimate for hashtag strategy
   */
  private calculatePerformanceEstimate(
    distributed: {
      high: HashtagCompetition[];
      medium: HashtagCompetition[];
      low: HashtagCompetition[];
    },
    brandedCount: number,
    targetCount: number
  ): { discoverabilityScore: number; rankingPotential: number; overall: number } {
    // Calculate discoverability score (how many people might see this)
    // Heavily weighted towards high and medium competition hashtags
    const discoverabilityScore = Math.min(100, 
      (distributed.high.length * 15) + 
      (distributed.medium.length * 8) + 
      (distributed.low.length * 3) +
      (brandedCount * 2)
    );

    // Calculate ranking potential (likelihood of ranking high in hashtag searches)
    // Heavily weighted towards low and medium competition hashtags
    const rankingPotential = Math.min(100,
      (distributed.low.length * 15) + 
      (distributed.medium.length * 10) + 
      (distributed.high.length * 3) +
      (brandedCount * 5)
    );

    // Calculate average relevance score
    const allHashtags = [
      ...distributed.high,
      ...distributed.medium,
      ...distributed.low
    ];
    const avgRelevance = allHashtags.length > 0
      ? allHashtags.reduce((sum, h) => sum + h.relevanceScore, 0) / allHashtags.length
      : 0;

    // Overall score factors in discoverability, ranking, and relevance
    const overall = Math.round(
      (discoverabilityScore * 0.35) +
      (rankingPotential * 0.35) +
      (avgRelevance * 0.30)
    );

    return {
      discoverabilityScore: Math.round(discoverabilityScore),
      rankingPotential: Math.round(rankingPotential),
      overall
    };
  }

  /**
   * Get random count within range
   */
  private getRandomCountInRange(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Track hashtag performance for learning and optimization
   * This method records actual post performance to improve future recommendations
   * 
   * Enhanced implementation that:
   * - Stores individual hashtag performance metrics
   * - Updates niche-specific performance tracking
   * - Enables engagement-based ranking
   * - Supports continuous learning from real data
   * 
   * @param hashtags - Hashtags used in the post
   * @param performance - Actual engagement metrics
   * @param niche - Content niche
   * @param postId - Post identifier for tracking
   * @param postType - Type of post (post, story, reel)
   * 
   * Requirement: 6.6
   */
  async trackHashtagPerformance(
    hashtags: string[],
    performance: {
      likes: number;
      comments: number;
      saves: number;
      shares: number;
      impressions: number;
      reach: number;
    },
    niche: string,
    postId?: string,
    postType: 'post' | 'story' | 'reel' = 'post'
  ): Promise<void> {
    const method = 'trackHashtagPerformance';
    
    try {
      const engagementRate = performance.impressions > 0
        ? ((performance.likes + performance.comments + performance.saves + performance.shares) / performance.impressions) * 100
        : 0;

      this.log(method, 'Tracking hashtag performance', {
        hashtagCount: hashtags.length,
        engagementRate: engagementRate.toFixed(2) + '%',
        niche,
        postType
      });

      // Generate postId if not provided
      const effectivePostId = postId || `post_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      // Track each hashtag individually
      const trackingPromises = hashtags.map(async (hashtag) => {
        try {
          const normalized = hashtag.replace('#', '').toLowerCase().trim();
          
          // Skip blacklisted hashtags
          if (this.HASHTAG_BLACKLIST.has(normalized)) {
            return;
          }

          // Estimate competition level
          const estimatedPostCount = this.estimateHashtagCompetition(normalized, niche);
          const competition = this.getCompetitionLevel(estimatedPostCount);

          // Record usage with performance metrics
          await hashtagPerformanceRepository.recordUsage(
            normalized,
            niche,
            effectivePostId,
            postType,
            {
              impressions: performance.impressions,
              reach: performance.reach,
              likes: performance.likes,
              comments: performance.comments,
              saves: performance.saves,
              shares: performance.shares
            },
            competition,
            estimatedPostCount
          );

          this.log(method, `Recorded performance for #${normalized}`, {
            engagementRate: engagementRate.toFixed(2) + '%',
            competition
          });
        } catch (error) {
          this.logError(method, error as Error, { hashtag });
          // Continue tracking other hashtags even if one fails
        }
      });

      await Promise.all(trackingPromises);

      this.log(method, 'Hashtag performance tracking complete', {
        hashtagsTracked: hashtags.length,
        avgEngagementRate: engagementRate.toFixed(2) + '%'
      });
    } catch (error) {
      this.logError(method, error as Error, { hashtagCount: hashtags.length });
      // Don't throw - tracking failure shouldn't break the application
    }
  }

  /**
   * Get hashtag recommendations based on historical performance
   * Uses engagement-based ranking to suggest proven hashtags
   * 
   * @param niche - Content niche
   * @param themes - Content themes
   * @param competition - Target competition level
   * @param limit - Number of recommendations
   * @returns Array of recommended hashtags with performance data
   * 
   * Requirement: 6.6
   */
  async getPerformanceBasedRecommendations(
    niche: string,
    themes: string[],
    competition: 'high' | 'medium' | 'low',
    limit: number = 10
  ): Promise<Array<{ hashtag: string; avgEngagementRate: number; usageCount: number }>> {
    const method = 'getPerformanceBasedRecommendations';
    
    try {
      // Get top performing hashtags for this niche and competition level
      const topHashtags = await hashtagPerformanceRepository.getTopPerformingByCompetition(
        niche,
        competition,
        limit * 2, // Get more than needed for filtering
        3 // Minimum 3 uses for reliability
      );

      if (topHashtags.length === 0) {
        this.log(method, 'No performance data available for recommendations', {
          niche,
          competition
        });
        return [];
      }

      // Score hashtags by theme relevance
      const scored = topHashtags.map(record => {
        let themeRelevanceScore = 0;
        
        for (const theme of themes) {
          if (record.hashtag === theme) {
            themeRelevanceScore = 10;
            break;
          } else if (record.hashtag.includes(theme) || theme.includes(record.hashtag)) {
            themeRelevanceScore = Math.max(themeRelevanceScore, 5);
          }
        }

        // Combined score: 70% engagement rate + 30% theme relevance
        const combinedScore = (record.avgEngagementRate * 0.7) + (themeRelevanceScore * 0.3);

        return {
          hashtag: record.hashtag,
          avgEngagementRate: record.avgEngagementRate,
          usageCount: record.usageCount,
          combinedScore
        };
      });

      // Sort by combined score and take top results
      const recommendations = scored
        .sort((a, b) => b.combinedScore - a.combinedScore)
        .slice(0, limit)
        .map(({ hashtag, avgEngagementRate, usageCount }) => ({
          hashtag,
          avgEngagementRate,
          usageCount
        }));

      this.log(method, `Generated ${recommendations.length} performance-based recommendations`, {
        niche,
        competition,
        avgEngagement: (recommendations.reduce((sum, r) => sum + r.avgEngagementRate, 0) / recommendations.length).toFixed(2) + '%'
      });

      return recommendations;
    } catch (error) {
      this.logError(method, error as Error, { niche, competition });
      return [];
    }
  }

  /**
   * Get niche-specific hashtag performance insights
   * Provides analytics on hashtag performance for a niche
   * 
   * @param niche - Content niche
   * @returns Performance statistics and insights
   * 
   * Requirement: 6.6
   */
  async getNicheHashtagInsights(niche: string): Promise<{
    totalTrackedHashtags: number;
    avgEngagementRate: number;
    topPerformers: Array<{ hashtag: string; engagementRate: number }>;
    performanceByCompetition: {
      high: { count: number; avgEngagement: number };
      medium: { count: number; avgEngagement: number };
      low: { count: number; avgEngagement: number };
    };
  }> {
    const method = 'getNicheHashtagInsights';
    
    try {
      const stats = await hashtagPerformanceRepository.getNicheStatistics(niche);

      const insights = {
        totalTrackedHashtags: stats.totalHashtags,
        avgEngagementRate: stats.avgEngagementRate,
        topPerformers: stats.topPerformers.slice(0, 10).map(h => ({
          hashtag: h.hashtag,
          engagementRate: h.avgEngagementRate
        })),
        performanceByCompetition: stats.performanceByCompetition
      };

      this.log(method, `Retrieved insights for niche: ${niche}`, {
        totalHashtags: insights.totalTrackedHashtags,
        avgEngagement: insights.avgEngagementRate.toFixed(2) + '%'
      });

      return insights;
    } catch (error) {
      this.logError(method, error as Error, { niche });
      throw error;
    }
  }
}

// Export singleton instance
export const hashtagGeneratorService = new HashtagGeneratorService();
