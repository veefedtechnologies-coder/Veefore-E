import { ViralPatternModel } from '../models/AI/ViralPattern';
import { ViralHookModel } from '../models/AI/ViralHook';
import { ViralPattern, ViralHook } from '../domain/types';
import { Logger } from '../utils/logger';

/**
 * Service for managing viral patterns and hooks for caption generation
 * Implements requirements 2.1, 2.2, 2.3
 */
export class ViralPatternService {
  /**
   * Get relevant viral patterns for generation request
   * Filters patterns by niche and post type, ranks by engagement metrics
   * 
   * @param niche - Content niche (fitness, food, travel, etc.)
   * @param postType - Type of post (post, story, reel)
   * @param limit - Maximum number of patterns to return
   * @returns Array of relevant viral patterns sorted by performance
   * 
   * **Validates: Requirements 2.1, 2.3**
   */
  async getRelevantPatterns(
    niche: string,
    postType: 'post' | 'story' | 'reel',
    limit: number = 5
  ): Promise<ViralPattern[]> {
    try {
      Logger.info('ViralPatternService', `Getting relevant patterns for niche: ${niche}, postType: ${postType}, limit: ${limit}`);

      // Query patterns matching niche and post type
      // Prioritize: trending patterns first, then by engagement rate
      const patterns = await ViralPatternModel.find({
        niches: niche,
        postTypes: postType,
      })
        .sort({
          trending: -1,           // Trending patterns first
          avgEngagementRate: -1,  // Then by engagement rate
          successRate: -1,        // Then by success rate
        })
        .limit(limit)
        .lean()
        .exec();

      // Convert MongoDB documents to domain types
      const result: ViralPattern[] = patterns.map((doc) => ({
        id: doc._id.toString(),
        name: doc.name,
        category: doc.category,
        pattern: doc.pattern,
        description: doc.description,
        niches: doc.niches,
        postTypes: doc.postTypes,
        avgEngagementRate: doc.avgEngagementRate,
        usageCount: doc.usageCount,
        successRate: doc.successRate,
        exampleCaptions: doc.exampleCaptions,
        trending: doc.trending,
        lastUsed: doc.lastUsed,
        createdAt: doc.createdAt,
      }));

      Logger.info('ViralPatternService', `Found ${result.length} relevant patterns for ${niche}/${postType}`);
      return result;
    } catch (error) {
      Logger.error('ViralPatternService', 'Error getting relevant patterns:', error);
      throw new Error(`Failed to retrieve viral patterns: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get viral hooks for a specific niche
   * Returns high-performing hooks that boost engagement
   * 
   * @param niche - Content niche
   * @param limit - Maximum number of hooks to return
   * @returns Array of viral hooks sorted by engagement boost
   * 
   * **Validates: Requirements 2.2**
   */
  async getViralHooks(
    niche: string,
    limit: number = 5
  ): Promise<ViralHook[]> {
    try {
      Logger.info('ViralPatternService', `Getting viral hooks for niche: ${niche}, limit: ${limit}`);

      // Query hooks for the specified niche
      // Sort by engagement boost to get the most effective hooks
      const hooks = await ViralHookModel.find({
        niche: niche,
      })
        .sort({
          avgEngagementBoost: -1,  // Highest engagement boost first
          usageCount: -1,           // Then by usage count (proven effectiveness)
        })
        .limit(limit)
        .lean()
        .exec();

      // Convert MongoDB documents to domain types
      const result: ViralHook[] = hooks.map((doc) => ({
        id: doc._id.toString(),
        hookText: doc.hookText,
        niche: doc.niche,
        avgEngagementBoost: doc.avgEngagementBoost,
        usageCount: doc.usageCount,
        createdAt: doc.createdAt,
      }));

      Logger.info('ViralPatternService', `Found ${result.length} viral hooks for ${niche}`);
      return result;
    } catch (error) {
      Logger.error('ViralPatternService', 'Error getting viral hooks:', error);
      throw new Error(`Failed to retrieve viral hooks: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get patterns filtered by multiple criteria with advanced ranking
   * Internal helper method for pattern filtering logic
   * 
   * @param options - Filtering options
   * @returns Filtered and ranked patterns
   * 
   * **Validates: Requirements 2.3**
   */
  private async filterPatternsByMultipleCriteria(options: {
    niches?: string[];
    postTypes?: ('post' | 'story' | 'reel')[];
    categories?: ('hook' | 'structure' | 'engagement' | 'storytelling')[];
    minEngagementRate?: number;
    minSuccessRate?: number;
    trendingOnly?: boolean;
    limit?: number;
  }): Promise<ViralPattern[]> {
    try {
      const {
        niches,
        postTypes,
        categories,
        minEngagementRate = 0,
        minSuccessRate = 0,
        trendingOnly = false,
        limit = 10,
      } = options;

      // Build query filter
      const filter: any = {
        avgEngagementRate: { $gte: minEngagementRate },
        successRate: { $gte: minSuccessRate },
      };

      if (niches && niches.length > 0) {
        filter.niches = { $in: niches };
      }

      if (postTypes && postTypes.length > 0) {
        filter.postTypes = { $in: postTypes };
      }

      if (categories && categories.length > 0) {
        filter.category = { $in: categories };
      }

      if (trendingOnly) {
        filter.trending = true;
      }

      const patterns = await ViralPatternModel.find(filter)
        .sort({
          trending: -1,
          avgEngagementRate: -1,
          successRate: -1,
          usageCount: -1,
        })
        .limit(limit)
        .lean()
        .exec();

      return patterns.map((doc) => ({
        id: doc._id.toString(),
        name: doc.name,
        category: doc.category,
        pattern: doc.pattern,
        description: doc.description,
        niches: doc.niches,
        postTypes: doc.postTypes,
        avgEngagementRate: doc.avgEngagementRate,
        usageCount: doc.usageCount,
        successRate: doc.successRate,
        exampleCaptions: doc.exampleCaptions,
        trending: doc.trending,
        lastUsed: doc.lastUsed,
        createdAt: doc.createdAt,
      }));
    } catch (error) {
      Logger.error('ViralPatternService', 'Error filtering patterns by criteria:', error);
      throw error;
    }
  }

  /**
   * Get patterns by category for specific use cases
   * Useful for targeted pattern selection (e.g., only hooks, only storytelling)
   * 
   * @param category - Pattern category
   * @param niche - Optional niche filter
   * @param limit - Maximum number to return
   * @returns Patterns in the specified category
   */
  async getPatternsByCategory(
    category: 'hook' | 'structure' | 'engagement' | 'storytelling',
    niche?: string,
    limit: number = 10
  ): Promise<ViralPattern[]> {
    try {
      const filter: any = { category };
      
      if (niche) {
        filter.niches = niche;
      }

      const patterns = await ViralPatternModel.find(filter)
        .sort({ avgEngagementRate: -1 })
        .limit(limit)
        .lean()
        .exec();

      return patterns.map((doc) => ({
        id: doc._id.toString(),
        name: doc.name,
        category: doc.category,
        pattern: doc.pattern,
        description: doc.description,
        niches: doc.niches,
        postTypes: doc.postTypes,
        avgEngagementRate: doc.avgEngagementRate,
        usageCount: doc.usageCount,
        successRate: doc.successRate,
        exampleCaptions: doc.exampleCaptions,
        trending: doc.trending,
        lastUsed: doc.lastUsed,
        createdAt: doc.createdAt,
      }));
    } catch (error) {
      Logger.error('ViralPatternService', 'Error getting patterns by category:', error);
      throw error;
    }
  }

  /**
   * Get all trending patterns across niches
   * Useful for discovering current viral trends
   * 
   * @param limit - Maximum number to return
   * @returns Currently trending patterns
   */
  async getTrendingPatterns(limit: number = 10): Promise<ViralPattern[]> {
    try {
      const patterns = await ViralPatternModel.find({ trending: true })
        .sort({ avgEngagementRate: -1 })
        .limit(limit)
        .lean()
        .exec();

      return patterns.map((doc) => ({
        id: doc._id.toString(),
        name: doc.name,
        category: doc.category,
        pattern: doc.pattern,
        description: doc.description,
        niches: doc.niches,
        postTypes: doc.postTypes,
        avgEngagementRate: doc.avgEngagementRate,
        usageCount: doc.usageCount,
        successRate: doc.successRate,
        exampleCaptions: doc.exampleCaptions,
        trending: doc.trending,
        lastUsed: doc.lastUsed,
        createdAt: doc.createdAt,
      }));
    } catch (error) {
      Logger.error('ViralPatternService', 'Error getting trending patterns:', error);
      throw error;
    }
  }

  /**
   * Record pattern usage for tracking and analytics
   * Updates usage count and last used timestamp
   * 
   * @param patternId - ID of the pattern that was used
   */
  async recordPatternUsage(patternId: string): Promise<void> {
    try {
      await ViralPatternModel.findByIdAndUpdate(
        patternId,
        {
          $inc: { usageCount: 1 },
          $set: { lastUsed: new Date() },
        }
      ).exec();

      Logger.info('ViralPatternService', `Recorded usage for pattern ${patternId}`);
    } catch (error) {
      Logger.error('ViralPatternService', 'Error recording pattern usage:', error);
      // Don't throw - this is a non-critical tracking operation
    }
  }

  /**
   * Record hook usage for tracking and analytics
   * Updates usage count
   * 
   * @param hookId - ID of the hook that was used
   */
  async recordHookUsage(hookId: string): Promise<void> {
    try {
      await ViralHookModel.findByIdAndUpdate(
        hookId,
        {
          $inc: { usageCount: 1 },
        }
      ).exec();

      Logger.info('ViralPatternService', `Recorded usage for hook ${hookId}`);
    } catch (error) {
      Logger.error('ViralPatternService', 'Error recording hook usage:', error);
      // Don't throw - this is a non-critical tracking operation
    }
  }

  /**
   * Extract pattern from successful caption and add to database
   * Analyzes caption structure to identify reusable patterns
   * 
   * @param caption - The successful caption to analyze
   * @param engagementRate - Actual engagement rate achieved
   * @param niche - Content niche
   * @param postType - Type of post
   * 
   * **Validates: Requirements 2.4, 2.5, 2.6**
   */
  async extractAndAddPattern(
    caption: string,
    engagementRate: number,
    niche: string,
    postType: string
  ): Promise<void> {
    try {
      Logger.info('ViralPatternService', `Extracting pattern from caption in ${niche}/${postType} with ${engagementRate}% engagement`);

      // Extract pattern structure from caption
      const extractedPattern = this.analyzePatternStructure(caption);
      
      if (!extractedPattern) {
        Logger.info('ViralPatternService', 'No clear pattern structure detected in caption');
        return;
      }

      // Check if similar pattern already exists
      const existingPattern = await this.findSimilarPattern(
        extractedPattern.pattern,
        niche,
        postType
      );

      if (existingPattern) {
        // Update existing pattern with new example and performance data
        await this.updateExistingPatternWithNewExample(
          existingPattern.id,
          caption,
          engagementRate
        );
        Logger.info('ViralPatternService', `Updated existing pattern ${existingPattern.id} with new example`);
      } else {
        // Create new pattern
        const newPattern = await ViralPatternModel.create({
          name: extractedPattern.name,
          category: extractedPattern.category,
          pattern: extractedPattern.pattern,
          description: extractedPattern.description,
          niches: [niche],
          postTypes: [postType],
          avgEngagementRate: engagementRate,
          usageCount: 1,
          successRate: 100, // First use is a success by definition
          exampleCaptions: [caption],
          trending: engagementRate > 8.0, // Consider trending if >8% engagement
          createdAt: new Date(),
        });

        Logger.info('ViralPatternService', `Created new viral pattern: ${newPattern.name} (ID: ${newPattern._id})`);
      }
    } catch (error) {
      Logger.error('ViralPatternService', 'Error extracting and adding pattern:', error);
      throw new Error(`Failed to extract and add pattern: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update pattern performance metrics based on actual engagement
   * Tracks effectiveness and adjusts avgEngagementRate and successRate
   * 
   * @param patternId - ID of the pattern to update
   * @param actualEngagement - Actual engagement rate achieved
   * 
   * **Validates: Requirements 2.5**
   */
  async updatePatternPerformance(
    patternId: string,
    actualEngagement: number
  ): Promise<void> {
    try {
      Logger.info('ViralPatternService', `Updating performance for pattern ${patternId} with ${actualEngagement}% engagement`);

      const pattern = await ViralPatternModel.findById(patternId);
      
      if (!pattern) {
        Logger.warn('ViralPatternService', `Pattern ${patternId} not found`);
        return;
      }

      // Calculate new average engagement rate (weighted average)
      const totalEngagement = pattern.avgEngagementRate * pattern.usageCount;
      const newUsageCount = pattern.usageCount + 1;
      const newAvgEngagementRate = (totalEngagement + actualEngagement) / newUsageCount;

      // Calculate success (performance above average threshold)
      const performanceThreshold = 5.0; // 5% engagement is considered successful
      const isSuccess = actualEngagement >= performanceThreshold;
      
      // Calculate new success rate
      const totalSuccesses = Math.round((pattern.successRate / 100) * pattern.usageCount);
      const newSuccesses = isSuccess ? totalSuccesses + 1 : totalSuccesses;
      const newSuccessRate = (newSuccesses / newUsageCount) * 100;

      // Update trending status based on recent performance
      const isTrending = newAvgEngagementRate > 8.0 && newSuccessRate > 80;

      // Update the pattern
      await ViralPatternModel.findByIdAndUpdate(
        patternId,
        {
          $set: {
            avgEngagementRate: newAvgEngagementRate,
            successRate: newSuccessRate,
            trending: isTrending,
          },
          $inc: { usageCount: 1 },
        }
      ).exec();

      Logger.info(
        'ViralPatternService',
        `Updated pattern ${patternId}: ` +
        `avgEngagement ${pattern.avgEngagementRate.toFixed(2)}% → ${newAvgEngagementRate.toFixed(2)}%, ` +
        `successRate ${pattern.successRate.toFixed(2)}% → ${newSuccessRate.toFixed(2)}%, ` +
        `trending: ${isTrending}`
      );
    } catch (error) {
      Logger.error('ViralPatternService', 'Error updating pattern performance:', error);
      throw new Error(`Failed to update pattern performance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Analyze caption structure to extract reusable pattern
   * Internal helper method for pattern extraction
   * 
   * @param caption - Caption to analyze
   * @returns Extracted pattern or null if no clear pattern
   */
  private analyzePatternStructure(caption: string): {
    name: string;
    category: 'hook' | 'structure' | 'engagement' | 'storytelling';
    pattern: string;
    description: string;
  } | null {
    // Split caption into sentences
    const sentences = caption.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    if (sentences.length === 0) {
      return null;
    }

    // Detect hook patterns (first sentence)
    const firstSentence = sentences[0].trim().toLowerCase();
    
    // Common viral hooks
    const hookPatterns = [
      { regex: /^(hot take|unpopular opinion|controversial take|real talk)/i, name: 'Hot Take Hook' },
      { regex: /^(pov|point of view):/i, name: 'POV Hook' },
      { regex: /^(let me tell you|here's the thing|listen up)/i, name: 'Direct Address Hook' },
      { regex: /^(imagine|picture this|what if)/i, name: 'Scenario Hook' },
      { regex: /^(stop|wait|hold on)/i, name: 'Interrupt Hook' },
      { regex: /^(why|how|what|when|where)/i, name: 'Question Hook' },
    ];

    for (const hookPattern of hookPatterns) {
      if (hookPattern.regex.test(firstSentence)) {
        return {
          name: hookPattern.name,
          category: 'hook',
          pattern: `${hookPattern.name} → {main_content} → {engagement}`,
          description: `Opens with ${hookPattern.name.toLowerCase()} to grab attention`,
        };
      }
    }

    // Check entire caption for storytelling and engagement elements
    const fullCaptionLower = caption.toLowerCase();
    
    // Detect engagement-focused patterns FIRST (before structural patterns)
    // Look for multiple engagement CTAs
    const engagementIndicators = caption.match(/comment|share|save|tag someone|tag|double tap|swipe|dm me|link in bio/gi);
    if (engagementIndicators && engagementIndicators.length >= 2) {
      return {
        name: 'Multi-CTA Engagement',
        category: 'engagement',
        pattern: '{content} → {multiple_ctas}',
        description: 'Multiple clear calls to action for maximum engagement',
      };
    }

    // Detect structural patterns
    if (sentences.length >= 3) {
      const lastSentence = sentences[sentences.length - 1].trim().toLowerCase();
      
      // Check for engagement question at the end (either has question word or question-related phrases)
      const hasQuestionAtEnd = lastSentence.startsWith('what') || 
                                lastSentence.startsWith('how') || 
                                lastSentence.startsWith('why') ||
                                lastSentence.startsWith('when') ||
                                lastSentence.startsWith('where') ||
                                lastSentence.startsWith('who') ||
                                lastSentence.match(/what do you think|thoughts|comment|share|let me know|tag/);
      
      if (hasQuestionAtEnd) {
        // Check if caption contains storytelling elements (use full caption, not just middle)
        if (fullCaptionLower.match(/i was|i had|i thought|i realized|then|suddenly|but/)) {
          return {
            name: 'Story-Insight-Question',
            category: 'storytelling',
            pattern: '{story} → {insight} → {question}',
            description: 'Personal story leading to insight and engagement question',
          };
        } else {
          return {
            name: 'Hook-Value-Engagement',
            category: 'structure',
            pattern: '{hook} → {value/insight} → {engagement_question}',
            description: 'Strong opening, valuable content, clear call to action',
          };
        }
      }
    }

    // Default pattern for successful captions we can't categorize
    if (sentences.length >= 2) {
      return {
        name: 'Linear Content Flow',
        category: 'structure',
        pattern: '{opening} → {development} → {conclusion}',
        description: 'Clear linear progression from opening to conclusion',
      };
    }

    return null;
  }

  /**
   * Find similar existing pattern in database
   * Internal helper method for pattern deduplication
   * 
   * @param patternTemplate - Pattern template to search for
   * @param niche - Content niche
   * @param postType - Post type
   * @returns Existing similar pattern or null
   */
  private async findSimilarPattern(
    patternTemplate: string,
    niche: string,
    postType: string
  ): Promise<ViralPattern | null> {
    try {
      // Look for exact pattern match in same niche and post type
      const existingPattern = await ViralPatternModel.findOne({
        pattern: patternTemplate,
        niches: niche,
        postTypes: postType,
      }).lean().exec();

      if (!existingPattern) {
        return null;
      }

      return {
        id: existingPattern._id.toString(),
        name: existingPattern.name,
        category: existingPattern.category,
        pattern: existingPattern.pattern,
        description: existingPattern.description,
        niches: existingPattern.niches,
        postTypes: existingPattern.postTypes,
        avgEngagementRate: existingPattern.avgEngagementRate,
        usageCount: existingPattern.usageCount,
        successRate: existingPattern.successRate,
        exampleCaptions: existingPattern.exampleCaptions,
        trending: existingPattern.trending,
        lastUsed: existingPattern.lastUsed,
        createdAt: existingPattern.createdAt,
      };
    } catch (error) {
      Logger.error('ViralPatternService', 'Error finding similar pattern:', error);
      return null;
    }
  }

  /**
   * Update existing pattern with new example caption and performance data
   * Internal helper method for pattern learning
   * 
   * @param patternId - ID of pattern to update
   * @param caption - New example caption
   * @param engagementRate - Engagement rate of new example
   */
  private async updateExistingPatternWithNewExample(
    patternId: string,
    caption: string,
    engagementRate: number
  ): Promise<void> {
    const pattern = await ViralPatternModel.findById(patternId);
    
    if (!pattern) {
      return;
    }

    // Add caption to examples (limit to 10 most recent)
    const updatedExamples = [...pattern.exampleCaptions, caption].slice(-10);

    // Calculate new metrics
    const totalEngagement = pattern.avgEngagementRate * pattern.usageCount;
    const newUsageCount = pattern.usageCount + 1;
    const newAvgEngagementRate = (totalEngagement + engagementRate) / newUsageCount;

    // Update trending status
    const isTrending = newAvgEngagementRate > 8.0 && pattern.successRate > 80;

    await ViralPatternModel.findByIdAndUpdate(
      patternId,
      {
        $set: {
          exampleCaptions: updatedExamples,
          avgEngagementRate: newAvgEngagementRate,
          trending: isTrending,
        },
        $inc: { usageCount: 1 },
      }
    ).exec();
  }
}

// Export singleton instance
export const viralPatternService = new ViralPatternService();
