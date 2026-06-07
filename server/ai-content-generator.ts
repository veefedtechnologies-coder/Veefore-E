import { storage } from './mongodb-storage';
import { aiServiceManager } from './services/AIServiceManager';
import { hashtagGeneratorService } from './services/HashtagGeneratorService';
import { generatedCaptionRepository } from './repositories/GeneratedCaptionRepository';
import { calculateLevenshteinDistance } from './utils/levenshtein';
import { ICaptionVariation } from './models/AI';

interface GenerateContentParams {
  userId: string;
  workspaceId?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  postType?: 'post' | 'story' | 'reel';
  platform?: string;
  existingCaption?: string;
  userInsights?: any;
  aiPreferences?: any;
}

interface GeneratedContent {
  caption: string;
  hashtags: string[];
  mentions?: string[];
  engagementScore?: number;
  viralityScore?: number;
  ctaRecommendation?: string;
  hashtagBreakdown?: {
    high: string[];
    medium: string[];
    low: string[];
    branded: string[];
  };
  hashtagPerformance?: {
    discoverabilityScore: number;
    rankingPotential: number;
    overall: number;
  };
}

export class AIContentGenerator {
  // In-memory cache for trending data with timestamp tracking
  private trendingDataCache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 3600000; // 1 hour in milliseconds

  constructor() {
    // No longer need to initialize OpenAI directly
    // We'll use AIServiceManager which handles multiple providers
  }

  /**
   * Analyze image or video using AI vision (only available with OpenAI GPT-4o)
   */
  private async analyzeMedia(mediaUrl: string, mediaType: 'image' | 'video', aiPreferences: any): Promise<string> {
    try {
      console.log('[AI CONTENT] Analyzing media:', { mediaUrl, mediaType });

      // Media analysis with vision is currently only supported by OpenAI GPT-4o
      // Skip if user is using a different provider
      if (aiPreferences.aiModel !== 'openai-gpt4o') {
        console.log('[AI CONTENT] Media analysis skipped - not available for:', aiPreferences.aiModel);
        return `${mediaType === 'image' ? 'Image' : 'Video'} uploaded - visual analysis not available with current AI provider`;
      }

      // For OpenAI, we would need to import it here
      // For now, return a placeholder since vision requires special handling
      return `${mediaType === 'image' ? 'Image' : 'Video'} content detected. Visual analysis temporarily unavailable.`;
      
    } catch (error: any) {
      console.error('[AI CONTENT] Media analysis failed:', error);
      return 'Unable to analyze media. Proceeding with text-based generation.';
    }
  }

  /**
   * Get user insights and analytics for personalized content
   */
  private async getUserInsights(userId: string, workspaceId?: string): Promise<any> {
    try {
      const user = await storage.getUser(userId);
      const insights: any = {
        preferences: user?.preferences || {},
        businessType: user?.businessType || 'solo',
        contentNiche: user?.preferences?.contentNiche || 'general',
        primaryPlatform: user?.preferences?.primaryPlatform || 'instagram',
        aiPersona: user?.preferences?.aiPersona || 'Professional & Authoritative',
        captionStyle: user?.preferences?.captionStyle || 'Storytelling',
        optimizationGoals: user?.preferences?.optimizationGoals || 'Engagement',
        creativityLevel: user?.preferences?.creativityLevel || 0.7,
        autoHashtags: user?.preferences?.autoHashtags !== false,
        targetAudience: user?.preferences?.targetAudience || 'General audience',
        brandVoice: user?.preferences?.brandVoice || '',
        contentThemes: user?.preferences?.contentThemes || [],
      };

      // Get workspace-specific AI configuration
      if (workspaceId) {
        const workspace = await storage.getWorkspace(workspaceId);
        if (workspace?.aiConfiguration) {
          insights.workspaceAI = workspace.aiConfiguration;
        }
        
        // Get social accounts for this workspace to understand platforms and niches
        try {
          const socialAccounts = await storage.getSocialAccountsByWorkspace(workspaceId);
          if (socialAccounts && socialAccounts.length > 0) {
            insights.connectedPlatforms = socialAccounts.map((acc: any) => acc.platform);
            insights.accountHandles = socialAccounts.map((acc: any) => ({
              platform: acc.platform,
              handle: acc.username || acc.accountName
            }));
          }
        } catch (e) {
          console.warn('[AI CONTENT] Could not fetch social accounts');
        }
      }

      // Get recent analytics for this user's content
      try {
        const recentContent = await storage.getContentByWorkspace(workspaceId || '', 20);
        if (recentContent && recentContent.length > 0) {
          insights.recentPerformance = {
            avgEngagement: this.calculateAvgEngagement(recentContent),
            topHashtags: this.extractTopHashtags(recentContent),
            bestPostingTimes: this.analyzeBestTimes(recentContent),
            topPerformingCaptions: this.getTopCaptions(recentContent),
            engagementTrends: this.analyzeEngagementTrends(recentContent),
          };
        }
      } catch (e) {
        console.warn('[AI CONTENT] Could not fetch recent analytics:', e);
      }

      // Get trending topics and hashtags (would integrate with real trend API in production)
      insights.trending = await this.getTrendingData(insights.contentNiche, insights.primaryPlatform);

      return insights;
    } catch (error) {
      console.error('[AI CONTENT] Failed to get user insights:', error);
      return {
        preferences: {},
        contentNiche: 'general',
        aiPersona: 'Professional & Authoritative',
        captionStyle: 'Storytelling',
        optimizationGoals: 'Engagement',
        creativityLevel: 0.7,
      };
    }
  }

  private calculateAvgEngagement(content: any[]): number {
    const engagements = content
      .filter(c => c.analytics?.engagement)
      .map(c => c.analytics.engagement);
    return engagements.length > 0 
      ? engagements.reduce((a, b) => a + b, 0) / engagements.length 
      : 0;
  }

  private extractTopHashtags(content: any[]): string[] {
    const hashtagCounts: Record<string, number> = {};
    content.forEach(c => {
      if (c.contentData?.hashtags) {
        c.contentData.hashtags.forEach((tag: string) => {
          hashtagCounts[tag] = (hashtagCounts[tag] || 0) + 1;
        });
      }
    });
    return Object.entries(hashtagCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([tag]) => tag);
  }

  private analyzeBestTimes(content: any[]): string[] {
    // Analyze actual performance by posting time
    const timePerformance: Record<string, { count: number; totalEngagement: number }> = {};
    
    content.forEach(c => {
      if (c.scheduledFor || c.publishedAt) {
        const date = new Date(c.scheduledFor || c.publishedAt);
        const hour = date.getHours();
        const timeSlot = `${hour}:00`;
        
        if (!timePerformance[timeSlot]) {
          timePerformance[timeSlot] = { count: 0, totalEngagement: 0 };
        }
        
        timePerformance[timeSlot].count++;
        timePerformance[timeSlot].totalEngagement += (c.analytics?.engagement || 0);
      }
    });
    
    // Calculate average engagement per time slot
    const avgByTime = Object.entries(timePerformance).map(([time, data]) => ({
      time,
      avgEngagement: data.totalEngagement / data.count
    }));
    
    // Sort by average engagement and return top 3
    return avgByTime
      .sort((a, b) => b.avgEngagement - a.avgEngagement)
      .slice(0, 3)
      .map(t => t.time);
  }

  private getTopCaptions(content: any[]): string[] {
    return content
      .filter(c => c.contentData?.caption && c.analytics?.engagement)
      .sort((a, b) => (b.analytics?.engagement || 0) - (a.analytics?.engagement || 0))
      .slice(0, 5)
      .map(c => c.contentData.caption);
  }

  private analyzeEngagementTrends(content: any[]): any {
    const sorted = content
      .filter(c => c.analytics?.engagement)
      .sort((a, b) => new Date(b.publishedAt || b.createdAt).getTime() - new Date(a.publishedAt || a.createdAt).getTime());
    
    if (sorted.length < 2) return { trend: 'stable', change: 0 };
    
    const recent = sorted.slice(0, 5);
    const older = sorted.slice(5, 10);
    
    const recentAvg = recent.reduce((sum, c) => sum + (c.analytics?.engagement || 0), 0) / recent.length;
    const olderAvg = older.length > 0 
      ? older.reduce((sum, c) => sum + (c.analytics?.engagement || 0), 0) / older.length 
      : recentAvg;
    
    const changePercent = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;
    
    return {
      trend: changePercent > 10 ? 'growing' : changePercent < -10 ? 'declining' : 'stable',
      change: Math.round(changePercent),
      recentAvg: Math.round(recentAvg),
      olderAvg: Math.round(olderAvg)
    };
  }

  /**
   * Fetch real-time trending data from external APIs
   * 
   * INTEGRATION POINTS:
   * - Twitter/X API: https://developer.twitter.com/en/docs/twitter-api/trends/api-reference
   * - Instagram Graph API: https://developers.facebook.com/docs/instagram-api/guides/hashtag-search
   * - TikTok Trends API: https://developers.tiktok.com/
   * - Google Trends API: https://trends.google.com/trends/
   * 
   * Environment Variables Required:
   * - TWITTER_API_KEY
   * - TWITTER_API_SECRET
   * - INSTAGRAM_API_TOKEN
   * - TIKTOK_API_KEY
   * - GOOGLE_TRENDS_API_KEY
   * 
   * @param niche - Content niche for targeted trends
   * @param platform - Social platform for platform-specific trends
   * @returns Trending data object or null if unavailable
   */
  private async fetchRealTimeTrends(niche: string, platform: string): Promise<any | null> {
    // Check if trend API configuration exists
    const twitterApiKey = process.env.TWITTER_API_KEY;
    const instagramApiToken = process.env.INSTAGRAM_API_TOKEN;
    const tiktokApiKey = process.env.TIKTOK_API_KEY;
    
    // If no API keys configured, return null to fallback to curated data
    if (!twitterApiKey && !instagramApiToken && !tiktokApiKey) {
      console.log('[AI CONTENT] No trend API keys configured, using curated data');
      return null;
    }
    
    // TODO: Implement real-time trend API calls when keys are available
    // Example implementation structure:
    /*
    try {
      let trends: any = { topics: [], hashtags: [], viralHooks: [] };
      
      // Fetch from Twitter/X API
      if (twitterApiKey && platform === 'twitter') {
        const twitterTrends = await this.fetchTwitterTrends(niche);
        trends.topics.push(...twitterTrends.topics);
        trends.hashtags.push(...twitterTrends.hashtags);
      }
      
      // Fetch from Instagram Graph API
      if (instagramApiToken && platform === 'instagram') {
        const instagramTrends = await this.fetchInstagramTrends(niche);
        trends.hashtags.push(...instagramTrends.hashtags);
      }
      
      // Fetch from TikTok API
      if (tiktokApiKey && platform === 'tiktok') {
        const tiktokTrends = await this.fetchTikTokTrends(niche);
        trends.topics.push(...tiktokTrends.topics);
        trends.viralHooks.push(...tiktokTrends.viralSounds);
      }
      
      return trends;
    } catch (error: any) {
      // Handle API rate limits gracefully
      if (error.status === 429) {
        console.warn('[AI CONTENT] Trend API rate limit reached, using cached/curated data');
      } else {
        console.error('[AI CONTENT] Trend API error:', error);
      }
      return null;
    }
    */
    
    // For now, return null to use curated data fallback
    console.log('[AI CONTENT] Real-time trend API integration not yet implemented');
    return null;
  }

  private async getTrendingData(niche: string, platform: string): Promise<any> {
    // Check cache first - use niche_platform as cache key
    const cacheKey = `${niche.toLowerCase()}_${platform.toLowerCase()}`;
    const cachedEntry = this.trendingDataCache.get(cacheKey);
    
    // Return cached data if it exists and hasn't expired
    if (cachedEntry && (Date.now() - cachedEntry.timestamp) < this.CACHE_TTL) {
      console.log('[AI CONTENT] Returning cached trending data for:', cacheKey);
      return cachedEntry.data;
    }
    
    console.log('[AI CONTENT] Fetching fresh trending data for:', cacheKey);
    
    // Try to fetch real-time trends from API (when available)
    try {
      const realTimeTrends = await this.fetchRealTimeTrends(niche, platform);
      if (realTimeTrends) {
        // Cache the real-time data
        this.trendingDataCache.set(cacheKey, {
          data: realTimeTrends,
          timestamp: Date.now()
        });
        return realTimeTrends;
      }
    } catch (error: any) {
      console.warn('[AI CONTENT] Real-time trends API unavailable, falling back to curated data:', error.message);
    }
    
    // Fallback to curated trending topics by niche
    const trendsByNiche: Record<string, any> = {
      fashion: {
        topics: ['sustainable fashion', 'street style', 'outfit of the day', 'fashion trends 2026'],
        hashtags: ['OOTD', 'FashionInspo', 'StyleGuide', 'TrendingNow', 'FashionBlogger'],
        viralHooks: ['This styling trick changed everything', 'Nobody talks about this', 'The secret to...']
      },
      fitness: {
        topics: ['home workouts', 'nutrition tips', 'fitness transformation', 'healthy lifestyle'],
        hashtags: ['FitnessMotivation', 'WorkoutRoutine', 'HealthyLiving', 'FitFam', 'GymLife'],
        viralHooks: ['Try this workout hack', 'The one exercise that...', 'Transform your body in...']
      },
      food: {
        topics: ['quick recipes', 'meal prep', 'food hacks', 'restaurant reviews'],
        hashtags: ['Foodie', 'RecipeOfTheDay', 'FoodPhotography', 'Yummy', 'InstaFood'],
        viralHooks: ['This recipe went viral for a reason', 'You need to try this', 'The secret ingredient is...']
      },
      tech: {
        topics: ['AI tools', 'productivity hacks', 'tech reviews', 'coding tips'],
        hashtags: ['TechTok', 'TechReview', 'Productivity', 'TechLife', 'Innovation'],
        viralHooks: ['This AI tool is insane', 'Game-changing tech hack', 'The future of...']
      },
      travel: {
        topics: ['hidden gems', 'travel tips', 'budget travel', 'destination guides'],
        hashtags: ['TravelGram', 'Wanderlust', 'TravelPhotography', 'ExploreMore', 'TravelTips'],
        viralHooks: ['Hidden gems nobody knows about', 'Travel hack that saved me...', 'The best destination for...']
      },
      business: {
        topics: ['entrepreneurship', 'productivity', 'marketing tips', 'success stories'],
        hashtags: ['Entrepreneur', 'BusinessTips', 'Marketing', 'StartupLife', 'Success'],
        viralHooks: ['Business lesson I learned the hard way', 'This strategy changed my business', 'The truth about...']
      },
      general: {
        topics: ['lifestyle', 'motivation', 'daily life', 'personal growth'],
        hashtags: ['DailyMotivation', 'Lifestyle', 'InspirationalQuotes', 'LifeGoals', 'SelfImprovement'],
        viralHooks: ['This changed my perspective', 'Life lesson everyone needs', 'The power of...']
      }
    };
    
    // Get the trending data for the niche (or fallback to general)
    const trendingData = trendsByNiche[niche.toLowerCase()] || trendsByNiche.general;
    
    // Store in cache with current timestamp
    this.trendingDataCache.set(cacheKey, {
      data: trendingData,
      timestamp: Date.now()
    });
    
    return trendingData;
  }

  /**
   * Generate AI-powered caption and hashtags
   */
  async generateContent(params: GenerateContentParams): Promise<GeneratedContent> {
    const {
      userId,
      workspaceId,
      mediaUrl,
      mediaType,
      postType = 'post',
      platform = 'instagram',
      existingCaption
    } = params;

    console.log('[AI CONTENT][START] Generating content for user:', userId);
    const startTime = Date.now();

    try {
      // Early API key validation - check before any expensive operations
      // Note: With AIServiceManager, we support multiple AI providers, not just OpenAI
      // The AIServiceManager will handle the actual validation based on the configured provider
      // This is just a placeholder check - the actual validation happens in AIServiceManager
      try {
        // AIServiceManager handles provider-specific validation internally
        // We log for debugging purposes
        console.log('[AI CONTENT][VALIDATION] Checking AI service availability...');
      } catch (error: any) {
        console.error('[AI CONTENT][ERROR] AI service configuration error:', error);
        throw new Error('AI service is not configured properly. Please contact support for assistance.');
      }

    // Step 1: Get user insights and preferences
    const insightsStartTime = Date.now();
    const insights = await this.getUserInsights(userId, workspaceId);
    const insightsDuration = Date.now() - insightsStartTime;
    console.log('[AI CONTENT][INSIGHTS] User insights loaded:', {
      duration: `${insightsDuration}ms`,
      niche: insights.contentNiche,
      persona: insights.aiPersona,
      style: insights.captionStyle,
      aiModel: insights.workspaceAI?.aiModel || 'default',
      hasTrendingData: !!insights.trending,
      hasRecentPerformance: !!insights.recentPerformance
    });

    // Step 2: Build comprehensive AI preferences from workspace configuration
    const aiConfig = insights.workspaceAI || {};
    const aiPreferences = {
      // Core Intelligence
      aiModel: aiConfig.aiModel || 'veegpt-hybrid',
      creativityLevel: aiConfig.creativityLevel ?? insights.creativityLevel ?? 0.7,
      
      // Optimization Goals
      optimizationGoals: aiConfig.primaryOptimizationGoal || insights.optimizationGoals || 'Maximize Engagement & Comments',
      
      // Content & Tone
      aiPersona: aiConfig.defaultAiPersona || insights.aiPersona || 'Professional & Authoritative',
      captionStyle: aiConfig.postCaptionStyle || insights.captionStyle || 'Storytelling & Long-form',
      
      // DM & Response (for context awareness)
      dmResponseLength: aiConfig.dmResponseLength || 'Medium (Detailed but concise)',
      
      // Multilingual
      multilingualOutput: aiConfig.multilingualOutput || 'Auto-detect (Match User)',
      
      // Safety & Memory
      contentSafety: aiConfig.contentSafetyFilter || 'Standard (Block explicit content)',
      aiMemoryRetention: aiConfig.aiMemoryRetention || 'Long-term (Remember past interactions)',
      
      // Auto-features
      autoHashtags: aiConfig.autoHashtagGeneration !== false,
      systemAutoLearning: aiConfig.systemAutoLearning !== false,
    };

    console.log('[AI CONTENT][CONFIG] Using comprehensive AI configuration:', {
      model: aiPreferences.aiModel,
      creativity: aiPreferences.creativityLevel,
      persona: aiPreferences.aiPersona,
      style: aiPreferences.captionStyle,
      optimization: aiPreferences.optimizationGoals,
      safety: aiPreferences.contentSafety,
      memory: aiPreferences.aiMemoryRetention,
      autoHashtags: aiPreferences.autoHashtags
    });

    // Step 3: Analyze media if provided (skip for now if using non-OpenAI provider without vision support)
    let mediaAnalysis = '';
    if (mediaUrl && mediaType && aiPreferences.aiModel === 'openai-gpt4o') {
      const mediaStartTime = Date.now();
      try {
        mediaAnalysis = await this.analyzeMedia(mediaUrl, mediaType, aiPreferences);
        const mediaDuration = Date.now() - mediaStartTime;
        console.log('[AI CONTENT][MEDIA] Media analysis completed:', {
          duration: `${mediaDuration}ms`,
          mediaType,
          analysisLength: mediaAnalysis.length
        });
      } catch (error: any) {
        const mediaDuration = Date.now() - mediaStartTime;
        console.warn('[AI CONTENT][MEDIA] Media analysis skipped:', {
          duration: `${mediaDuration}ms`,
          error: error.message,
          mediaType
        });
        mediaAnalysis = 'Media uploaded but analysis unavailable';
      }
    } else if (mediaUrl && mediaType) {
      console.log('[AI CONTENT][MEDIA] Media analysis skipped - not available for model:', aiPreferences.aiModel);
    }

    // Step 4: Build enhanced context-aware prompts with ALL user preferences
    const systemPrompt = this.buildEnhancedSystemPrompt(insights, postType, platform, aiPreferences);
    const userPrompt = this.buildEnhancedUserPrompt({
      mediaAnalysis,
      existingCaption,
      postType,
      platform,
      insights,
      aiPreferences
    });

    // Step 5: Generate caption using configured AI provider with full preferences
    console.log(`[AI CONTENT][CAPTION] Generating caption with ${aiPreferences.aiModel}...`);
    const captionStartTime = Date.now();
    const fullCaptionPrompt = `${systemPrompt}\n\n${userPrompt}`;
    const caption = await aiServiceManager.generateText(fullCaptionPrompt, aiPreferences);
    const captionDuration = Date.now() - captionStartTime;
    console.log(`[AI CONTENT][CAPTION] Caption generated:`, {
      duration: `${captionDuration}ms`,
      model: aiPreferences.aiModel,
      captionLength: caption.length,
      promptLength: fullCaptionPrompt.length
    });

    // Step 6: Generate strategic hashtags if auto-hashtag is enabled
    let hashtags: string[] = [];
    let hashtagBreakdown: any = null;
    let hashtagPerformance: any = null;
    
    if (aiPreferences.autoHashtags) {
      console.log(`[AI CONTENT][HASHTAGS] Generating strategic hashtags with enhanced algorithm...`);
      const hashtagStartTime = Date.now();
      
      try {
        // Use enhanced hashtag generation service
        const hashtagResult = await hashtagGeneratorService.generateStrategicHashtags({
          caption,
          mediaAnalysis,
          niche: insights.contentNiche || 'lifestyle',
          platform,
          postType,
          userId,
          workspaceId,
          targetCount: 20, // Generate 15-25 hashtags
          aiPreferences
        });

        hashtags = hashtagResult.hashtags;
        hashtagBreakdown = hashtagResult.breakdown;
        hashtagPerformance = hashtagResult.performanceEstimate;
        
        const hashtagDuration = Date.now() - hashtagStartTime;
        console.log('[AI CONTENT][HASHTAGS] Strategic hashtags generated:', {
          duration: `${hashtagDuration}ms`,
          totalCount: hashtags.length,
          high: hashtagBreakdown.high.length,
          medium: hashtagBreakdown.medium.length,
          low: hashtagBreakdown.low.length,
          branded: hashtagBreakdown.branded.length,
          performanceScore: hashtagPerformance.overall
        });
      } catch (error: any) {
        console.error('[AI CONTENT][HASHTAGS] Enhanced generation failed, falling back to legacy:', error);
        
        // Fallback to legacy hashtag generation
        const hashtagSystemPrompt = this.buildHashtagSystemPrompt(platform, aiPreferences);
        const hashtagUserPrompt = this.buildHashtagUserPrompt({
          postType,
          platform,
          caption,
          mediaAnalysis,
          insights,
          aiPreferences
        });
        
        const fullHashtagPrompt = `${hashtagSystemPrompt}\n\n${hashtagUserPrompt}`;
        const hashtagText = await aiServiceManager.generateText(fullHashtagPrompt, {
          ...aiPreferences,
          creativityLevel: aiPreferences.creativityLevel * 0.85
        });

        hashtags = hashtagText
          .split(/\s+/)
          .filter(tag => tag.startsWith('#'))
          .map(tag => tag.replace('#', ''))
          .slice(0, 20);
        
        const hashtagDuration = Date.now() - hashtagStartTime;
        console.log('[AI CONTENT][HASHTAGS] Fallback hashtags generated:', {
          duration: `${hashtagDuration}ms`,
          hashtagCount: hashtags.length
        });
      }
    } else {
      console.log('[AI CONTENT][HASHTAGS] Auto-hashtag generation disabled by user');
    }

    // Step 7: Generate engagement predictions
    const engagementScore = this.predictEngagement(caption, hashtags, insights);
    const viralityScore = this.predictVirality(caption, hashtags, mediaAnalysis);

    // Step 8: Generate CTA recommendation based on optimization goals
    const ctaRecommendation = this.generateCTA(postType, aiPreferences.optimizationGoals);

    const totalDuration = Date.now() - startTime;
    console.log('[AI CONTENT][COMPLETE] Content generation complete:', {
      totalDuration: `${totalDuration}ms`,
      userId,
      workspaceId: workspaceId || 'none',
      captionLength: caption.length,
      hashtagCount: hashtags.length,
      engagementScore,
      viralityScore,
      model: aiPreferences.aiModel,
      hadMedia: !!mediaUrl,
      mediaType: mediaType || 'none'
    });

    return {
      caption,
      hashtags,
      engagementScore,
      viralityScore,
      ctaRecommendation,
      hashtagBreakdown,
      hashtagPerformance
    };
    } catch (error: any) {
      const errorDuration = Date.now() - startTime;
      console.error('[AI CONTENT][ERROR] Content generation failed:', {
        duration: `${errorDuration}ms`,
        userId,
        workspaceId: workspaceId || 'none',
        operation: 'generateContent',
        errorMessage: error.message,
        errorStack: error.stack,
        params: {
          hasMediaUrl: !!mediaUrl,
          mediaType: mediaType || 'none',
          postType,
          platform,
          hasExistingCaption: !!existingCaption
        }
      });
      
      // Re-throw with more context
      throw new Error(`AI content generation failed: ${error.message}`);
    }
  }

  /**
   * Save generated caption with all variations to database for tracking and learning
   * 
   * This method stores:
   * - All caption variations with their metadata (authenticity scores, engagement predictions)
   * - Hashtags generated for each variation
   * - Patterns and hooks used in generation
   * - Links to Content collection for performance tracking
   * 
   * Requirements: 8.3, 10.1, 10.2
   * 
   * @param params - Caption generation details
   * @returns Saved caption document ID
   */
  async saveGeneratedCaption(params: {
    userId: string;
    workspaceId: string;
    contentId?: string;
    variations: Array<{
      caption: string;
      hashtags: string[];
      authenticityScore?: number;
      engagementPrediction?: {
        likeRate: number;
        commentRate: number;
        saveRate: number;
        shareRate: number;
        confidence: number;
      };
      usedPatterns?: string[];
      usedHooks?: string[];
    }>;
    postType: 'post' | 'story' | 'reel';
    platform: string;
    niche: string;
    selectedVariationIndex?: number;
    wasEdited?: boolean;
    originalCaption?: string;
    editedCaption?: string;
  }): Promise<string> {
    const startTime = Date.now();
    
    try {
      console.log('[AI CONTENT][SAVE] Saving generated caption:', {
        userId: params.userId,
        workspaceId: params.workspaceId,
        contentId: params.contentId,
        variationCount: params.variations.length,
        postType: params.postType,
        platform: params.platform,
        niche: params.niche
      });

      // Calculate edit distance if caption was edited
      let editDistance: number | undefined;
      if (params.wasEdited && params.originalCaption && params.editedCaption) {
        editDistance = calculateLevenshteinDistance(
          params.originalCaption,
          params.editedCaption
        );
        console.log('[AI CONTENT][SAVE] Edit distance calculated:', {
          editDistance,
          originalLength: params.originalCaption.length,
          editedLength: params.editedCaption.length,
          similarity: `${Math.round((1 - editDistance / Math.max(params.originalCaption.length, params.editedCaption.length)) * 100)}%`
        });
      }

      // Format variations to match schema
      const formattedVariations: ICaptionVariation[] = params.variations.map(v => ({
        caption: v.caption,
        hashtagsGenerated: v.hashtags || [],
        authenticityScore: v.authenticityScore || 0,
        engagementPrediction: v.engagementPrediction || {
          likeRate: 0,
          commentRate: 0,
          saveRate: 0,
          shareRate: 0,
          confidence: 0
        },
        usedPatterns: v.usedPatterns || [],
        usedHooks: v.usedHooks || []
      }));

      // Create caption document
      const savedCaption = await generatedCaptionRepository.create({
        userId: params.userId,
        workspaceId: params.workspaceId,
        contentId: params.contentId,
        variations: formattedVariations,
        selectedVariationIndex: params.selectedVariationIndex,
        wasEdited: params.wasEdited || false,
        originalCaption: params.originalCaption,
        editedCaption: params.editedCaption,
        editDistance,
        postType: params.postType,
        platform: params.platform,
        niche: params.niche,
        generatedAt: new Date()
      } as any);

      const duration = Date.now() - startTime;
      console.log('[AI CONTENT][SAVE] Caption saved successfully:', {
        captionId: savedCaption._id.toString(),
        duration: `${duration}ms`,
        hasContentLink: !!params.contentId,
        wasEdited: params.wasEdited,
        editDistance
      });

      return savedCaption._id.toString();
    } catch (error: any) {
      const errorDuration = Date.now() - startTime;
      console.error('[AI CONTENT][SAVE] Failed to save caption:', {
        duration: `${errorDuration}ms`,
        userId: params.userId,
        workspaceId: params.workspaceId,
        errorMessage: error.message,
        errorStack: error.stack
      });
      
      throw new Error(`Failed to save generated caption: ${error.message}`);
    }
  }

  /**
   * Record user selection of a caption variation
   * 
   * This tracks which variation the user chose, enabling the system to learn
   * user preferences over time.
   * 
   * Requirements: 8.3, 10.1
   * 
   * @param captionId - ID of the generated caption document
   * @param selectedVariationIndex - Index of the variation user selected (0-based)
   * @returns Updated caption document
   */
  async recordCaptionSelection(
    captionId: string,
    selectedVariationIndex: number
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('[AI CONTENT][SELECTION] Recording caption selection:', {
        captionId,
        selectedVariationIndex
      });

      await generatedCaptionRepository.recordSelection(
        captionId,
        selectedVariationIndex,
        false // wasEdited - updated separately if user edits
      );

      const duration = Date.now() - startTime;
      console.log('[AI CONTENT][SELECTION] Selection recorded:', {
        duration: `${duration}ms`,
        captionId,
        selectedVariationIndex
      });
    } catch (error: any) {
      const errorDuration = Date.now() - startTime;
      console.error('[AI CONTENT][SELECTION] Failed to record selection:', {
        duration: `${errorDuration}ms`,
        captionId,
        errorMessage: error.message
      });
      
      throw new Error(`Failed to record caption selection: ${error.message}`);
    }
  }

  /**
   * Record user edit of a selected caption
   * 
   * Tracks how the user modified the AI-generated caption, calculating
   * edit distance for learning purposes.
   * 
   * Requirements: 10.1, 10.2
   * 
   * @param captionId - ID of the generated caption document
   * @param originalCaption - The caption before user edit
   * @param editedCaption - The caption after user edit
   * @returns Updated caption document
   */
  async recordCaptionEdit(
    captionId: string,
    originalCaption: string,
    editedCaption: string
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('[AI CONTENT][EDIT] Recording caption edit:', {
        captionId,
        originalLength: originalCaption.length,
        editedLength: editedCaption.length
      });

      // Calculate edit distance
      const editDistance = calculateLevenshteinDistance(
        originalCaption,
        editedCaption
      );

      const similarity = Math.round(
        (1 - editDistance / Math.max(originalCaption.length, editedCaption.length)) * 100
      );

      console.log('[AI CONTENT][EDIT] Edit metrics calculated:', {
        editDistance,
        similarity: `${similarity}%`,
        changeType: similarity > 90 ? 'minor' : similarity > 70 ? 'moderate' : 'major'
      });

      await generatedCaptionRepository.recordSelection(
        captionId,
        undefined as any, // Keep existing selectedVariationIndex
        true, // wasEdited
        originalCaption,
        editedCaption,
        editDistance
      );

      const duration = Date.now() - startTime;
      console.log('[AI CONTENT][EDIT] Edit recorded successfully:', {
        duration: `${duration}ms`,
        captionId,
        editDistance,
        similarity: `${similarity}%`
      });
    } catch (error: any) {
      const errorDuration = Date.now() - startTime;
      console.error('[AI CONTENT][EDIT] Failed to record edit:', {
        duration: `${errorDuration}ms`,
        captionId,
        errorMessage: error.message
      });
      
      throw new Error(`Failed to record caption edit: ${error.message}`);
    }
  }

  /**
   * Link generated caption to published content for performance tracking
   * 
   * When content is published, this links the caption record to the Content
   * collection, enabling later correlation of predictions with actual performance.
   * 
   * Requirements: 8.3, 10.2
   * 
   * @param captionId - ID of the generated caption document
   * @param contentId - ID of the published content
   * @param publishedAt - When the content was published
   * @returns Updated caption document
   */
  async linkCaptionToContent(
    captionId: string,
    contentId: string,
    publishedAt?: Date
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('[AI CONTENT][LINK] Linking caption to content:', {
        captionId,
        contentId,
        publishedAt: publishedAt?.toISOString() || 'now'
      });

      // Update the caption document with contentId
      await generatedCaptionRepository.updateById(captionId, {
        contentId,
        publishedAt: publishedAt || new Date()
      });

      // Mark as published
      await generatedCaptionRepository.markAsPublished(
        captionId,
        publishedAt || new Date()
      );

      const duration = Date.now() - startTime;
      console.log('[AI CONTENT][LINK] Caption linked to content successfully:', {
        duration: `${duration}ms`,
        captionId,
        contentId
      });
    } catch (error: any) {
      const errorDuration = Date.now() - startTime;
      console.error('[AI CONTENT][LINK] Failed to link caption to content:', {
        duration: `${errorDuration}ms`,
        captionId,
        contentId,
        errorMessage: error.message
      });
      
      throw new Error(`Failed to link caption to content: ${error.message}`);
    }
  }

  /**
   * Build enhanced system prompt with ALL AI configuration preferences
   */
  private buildEnhancedSystemPrompt(insights: any, postType: string, platform: string, aiPreferences: any): string {
    const trendingInfo = insights.trending ? 
      `\n\nCURRENT TRENDING TOPICS IN ${insights.contentNiche.toUpperCase()}:\n${insights.trending.topics?.join(', ') || 'N/A'}` : '';
    
    const performanceInsights = insights.recentPerformance ? 
      `\n\nYOUR RECENT PERFORMANCE:\n- Engagement Trend: ${insights.recentPerformance.engagementTrends?.trend || 'stable'} (${insights.recentPerformance.engagementTrends?.change || 0}% change)\n- Avg Engagement: ${insights.recentPerformance.engagementTrends?.recentAvg || 'N/A'}\n- Best Posting Times: ${insights.recentPerformance.bestPostingTimes?.join(', ') || 'N/A'}` : '';

    // Build content safety guidelines
    const safetyGuidelines = this.getContentSafetyGuidelines(aiPreferences.contentSafety);
    
    // Build memory context
    const memoryContext = aiPreferences.aiMemoryRetention === 'Long-term (Remember past interactions)' 
      ? '\n\nAI MEMORY: You have long-term memory of past interactions. Reference user\'s previous successful content styles and preferences to maintain consistency.' 
      : '\n\nAI MEMORY: Focus on this specific request without referencing past interactions.';

    // Build multilingual guidelines
    const languageGuidelines = this.getMultilingualGuidelines(aiPreferences.multilingualOutput);

    return `You are a viral ${platform} creator who knows exactly how real people talk and what makes content go viral. Your captions feel authentic, relatable, and scroll-stopping.

YOUR CREATOR PROFILE:
- Vibe: ${aiPreferences.aiPersona}
- Style: ${aiPreferences.captionStyle}
- Niche: ${insights.contentNiche || 'General'}
- Voice: ${insights.brandVoice || 'Authentic and engaging'}
- Audience: ${insights.targetAudience || 'General audience'}
- Goal: ${aiPreferences.optimizationGoals}
${trendingInfo}
${performanceInsights}
${memoryContext}

CONTENT SAFETY:
${safetyGuidelines}

LANGUAGE:
${languageGuidelines}

✨ VIRAL CAPTION FORMULA:

**HOOK (First 3-5 words):**
- Start with emotion, curiosity, or controversy
- Examples: "Hot take:", "Nobody talks about...", "I was today years old when...", "POV:", "This changed everything:"
- Make people STOP scrolling immediately

**BODY (Keep it tight):**
- Write like you're texting a friend
- Use short sentences. Like this. They hit harder.
- Be vulnerable, raw, honest
- Share a specific moment, feeling, or realization
- NO corporate speak, NO generic advice

**ENGAGEMENT:**
- Ask ONE specific question (not "thoughts?")
- Make it easy to answer
- Examples: "Which one are you?", "Am I the only one?", "1-10 rating?"

**FORMATTING:**
- Keep paragraphs 1-2 sentences max
- Use emojis naturally (not forced)
- Line breaks for easy mobile reading
- Total length: ${this.getOptimalLength(postType, platform)}

${postType === 'story' ? '⚡ STORIES: Ultra-casual. Like you are talking to the camera. 1-2 sentences max. End with a question or poll.' : ''}
${postType === 'reel' ? '⚡ REELS: Hook FIRST. Then deliver the payoff. No fluff. End with "follow for more [topic]".' : ''}
${postType === 'post' ? '⚡ FEED POST: Personal story > Universal insight > Engagement question. Keep it real.' : ''}

🚫 NEVER DO THIS:
- Don't say "Let's dive in", "In today's digital age", "Are you ready to..."
- Don't use business jargon or marketing speak
- Don't make it sound like a LinkedIn post
- Don't be generic or vague
- Don't overuse emojis (2-4 max)
- Don't include hashtags (generated separately)

✅ DO THIS INSTEAD:
- Sound like a real person
- Be specific (names, places, moments, numbers)
- Show personality and opinion
- Use casual language and contractions
- Create FOMO or relatability
- Make it scannable on mobile

TONE FOR ${aiPreferences.aiPersona}:
${this.getPersonaGuidelines(aiPreferences.aiPersona)}

${aiPreferences.captionStyle} STYLE:
${this.getCaptionStyleGuidelines(aiPreferences.captionStyle)}

REMEMBER: If someone reads this out loud, it should sound natural, NOT like an ad or essay.`;
  }

  /**
   * Build enhanced user prompt with all preferences
   */
  private buildEnhancedUserPrompt(params: {
    mediaAnalysis: string;
    existingCaption?: string;
    postType: string;
    platform: string;
    insights: any;
    aiPreferences: any;
  }): string {
    const { mediaAnalysis, existingCaption, postType, platform, insights, aiPreferences } = params;

    let prompt = `Write a ${platform} ${postType} caption that sounds like a real person, not an AI.\n\n`;

    if (mediaAnalysis) {
      prompt += `📸 WHAT'S IN THE IMAGE/VIDEO:\n${mediaAnalysis}\n\n`;
    }

    if (existingCaption) {
      prompt += `📝 STARTING POINT (rewrite this to make it more engaging and viral):\n${existingCaption}\n\n`;
    }

    prompt += `🎯 YOUR MISSION:
Write a caption that makes people:
1. STOP scrolling (hook in first 3-5 words)
2. FEEL something (emotion beats information)
3. ENGAGE (like, comment, save, share)

📊 CONTEXT:
- Niche: ${insights.contentNiche || 'General'}
- Vibe: ${aiPreferences.aiPersona}
- Style: ${aiPreferences.captionStyle}
- Goal: ${aiPreferences.optimizationGoals}
- Safety Level: ${aiPreferences.contentSafety}

${insights.trending?.viralHooks?.length ? `\n🔥 PROVEN VIRAL HOOKS (use one naturally):\n${insights.trending.viralHooks.slice(0, 3).map((hook: string, i: number) => `${i + 1}. "${hook}"`).join('\n')}\n` : ''}

${insights.recentPerformance?.topPerformingCaptions?.length ? `\n✨ YOUR BEST PERFORMING STYLE:\n${insights.recentPerformance.topPerformingCaptions.slice(0, 2).map((cap: string, i: number) => `${i + 1}. "${cap.substring(0, 80)}..."`).join('\n')}\n` : ''}

💡 EXAMPLES OF GREAT HOOKS:
- "I can't believe I'm sharing this but..."
- "Nobody talks about how..."
- "POV: You just discovered..."
- "This is your sign to..."
- "I was today years old when I learned..."
- "Hot take:"
- "Storytime:"
- "Real talk:"

✍️ NOW WRITE:
Create a caption for this ${postType} that ${aiPreferences.optimizationGoals.toLowerCase()}.
Make it conversational, authentic, and scroll-stopping.
Remember: Sound like a human, not a corporate blog post.`;

    return prompt;
  }

  /**
   * Build hashtag system prompt with preferences
   */
  private buildHashtagSystemPrompt(platform: string, aiPreferences: any): string {
    return `You are a viral social media strategist specializing in hashtag optimization for ${platform}.

OPTIMIZATION GOAL: ${aiPreferences.optimizationGoals}
CREATIVITY LEVEL: ${Math.round(aiPreferences.creativityLevel * 100)}%

Generate hashtags that:
1. Mix high-volume (100k-1M posts) and niche (10k-100k posts) tags
2. Include trending tags relevant to the content
3. Target the specific audience niche
4. Optimize specifically for: ${aiPreferences.optimizationGoals}
5. Follow ${platform} best practices
6. Include branded/unique tags for discoverability
7. Balance viral potential with relevance

HASHTAG STRATEGY based on goal:
${this.getHashtagStrategyForGoal(aiPreferences.optimizationGoals)}

Return 15-20 hashtags that maximize ${aiPreferences.optimizationGoals.toLowerCase()}.
Format: Return ONLY hashtags with # symbols, separated by spaces.`;
  }

  /**
   * Build hashtag user prompt with full context
   */
  private buildHashtagUserPrompt(params: {
    postType: string;
    platform: string;
    caption: string;
    mediaAnalysis: string;
    insights: any;
    aiPreferences: any;
  }): string {
    const { postType, platform, caption, mediaAnalysis, insights, aiPreferences } = params;

    // Build trending hashtags section with explicit prioritization instruction
    let trendingHashtagsInstruction = '';
    if (insights.trending?.hashtags && insights.trending.hashtags.length > 0) {
      trendingHashtagsInstruction = `\n\n🔥 TRENDING HASHTAGS (PRIORITY - Include 5-8 of these):
${insights.trending.hashtags.join(', ')}

INSTRUCTION: PRIORITIZE these trending hashtags in your selection. These are proven performers in the ${insights.contentNiche || 'general'} niche right now. Include at least 5-8 of these trending tags while maintaining relevance to the content. Balance with niche-specific and evergreen tags to ensure discoverability.`;
    }

    return `Generate viral hashtags optimized for ${aiPreferences.optimizationGoals}:

Content Type: ${postType}
Platform: ${platform}
Niche: ${insights.contentNiche || 'general'}
Caption: ${caption}
${mediaAnalysis ? `Visual Analysis: ${mediaAnalysis}` : ''}
${insights.recentPerformance?.topHashtags ? `Previously successful tags: ${insights.recentPerformance.topHashtags.join(', ')}` : ''}${trendingHashtagsInstruction}

Primary Goal: ${aiPreferences.optimizationGoals}
Target Audience: ${insights.targetAudience || 'General'}

HASHTAG MIX REQUIREMENTS (15-20 total):
- Trending hashtags: 5-8 tags (from trending list above when available)
- Niche-specific: 4-6 tags (targeted to ${insights.contentNiche || 'general'})
- Evergreen: 3-4 tags (timeless, consistent reach)
- Branded/Unique: 2-3 tags (distinctive, memorable)`;
  }

  /**
   * Get content safety guidelines based on user preference
   */
  private getContentSafetyGuidelines(safetyLevel: string): string {
    const guidelines: Record<string, string> = {
      'Standard (Block explicit content)': '- Avoid explicit language, violence, adult content\n- Keep content brand-safe and advertiser-friendly\n- No controversial topics unless essential to message',
      'Strict (Family-friendly only)': '- Strictly family-friendly content only\n- No profanity, suggestive content, or mature themes\n- Educational and positive messaging only',
      'Relaxed (Allow mature themes)': '- Mature themes allowed when contextually appropriate\n- Some edgy humor acceptable\n- Maintain platform community guidelines'
    };
    return guidelines[safetyLevel] || guidelines['Standard (Block explicit content)'];
  }

  /**
   * Get multilingual output guidelines
   */
  private getMultilingualGuidelines(multilingualSetting: string): string {
    const guidelines: Record<string, string> = {
      'Auto-detect (Match User)': 'Detect and match the user\'s language preference automatically. If English content, respond in English. If other languages detected, match accordingly.',
      'English Only': 'Generate all content in English, regardless of input language.',
      'Multi-language (Translate)': 'Provide content in multiple languages when beneficial for reach. Primary language: English, with key phrases in target audience languages.'
    };
    return guidelines[multilingualSetting] || guidelines['Auto-detect (Match User)'];
  }

  /**
   * Get persona-specific tone guidelines
   */
  private getPersonaGuidelines(persona: string): string {
    const guidelines: Record<string, string> = {
      'Professional & Authoritative': 'Confident expert voice. Use data, insights, and credible information. Maintain professionalism while being approachable.',
      'Friendly & Conversational': 'Warm, relatable, like talking to a friend. Use casual language, contractions, and personal anecdotes.',
      'Humorous & Entertaining': 'Witty, fun, engaging. Use clever wordplay, trending memes, and light humor. Keep it entertaining while valuable.',
      'Inspirational & Motivational': 'Uplifting, empowering, aspirational. Focus on possibility, growth mindset, and positive transformation.',
      'Educational & Informative': 'Clear, structured, teaching-focused. Break down complex topics simply. Use examples and actionable takeaways.',
      'Bold & Provocative': 'Challenge conventional thinking. Make strong statements. Push boundaries while staying authentic.'
    };
    return guidelines[persona] || guidelines['Professional & Authoritative'];
  }

  /**
   * Get caption style-specific guidelines
   */
  private getCaptionStyleGuidelines(style: string): string {
    const guidelines: Record<string, string> = {
      'Storytelling & Long-form': `Tell a REAL story with specific details.
Example: "So I'm standing in line at Starbucks yesterday, right? And this random person behind me whispers something that completely changed my perspective on..."
- Start with a scene
- Use conversational language ("like", "honestly", "literally")
- Build to a lesson or punchline
- 150-250 words`,

      'Short & Punchy': `Hit them FAST. Every word matters.
Example: "This one habit made me $10k this month. Thread 🧵"
- 20-60 words max
- One powerful idea
- End with intrigue or CTA
- Use numbers when possible`,

      'Question-based Engagement': `Ask questions people HAVE to answer.
Example: "Be honest: do you read books or just buy them? 👀"
- Make it specific and relatable
- Use "Be honest:", "Real talk:", "Quick poll:"
- Create FOMO or curiosity
- Easy yes/no or this/that format`,

      'List & Bullet Points': `Make it scannable. Value-packed.
Example: "5 things I wish I knew at 20:
1. Nobody knows what they're doing
2. Your 9-5 isn't your identity
3. [...]"
- Numbers in the hook
- One line per point
- Mix serious + funny
- End with "Which one hit hardest?"`,

      'Behind-the-scenes & Personal': `Get VULNERABLE. Show the messy parts.
Example: "Nobody tells you that success feels lonely af. Here's what my day actually looks like..."
- Share what you normally hide
- Use "Nobody tells you...", "The truth is...", "Can we talk about..."
- Be brutally honest
- Make them feel less alone`,

      'Educational & How-to': `Teach something specific they can use TODAY.
Example: "How to get 10k followers in 30 days (I tested this):
Step 1: [...]
The catch? Most people quit at step 3."
- Promise a clear outcome
- Numbered steps
- Add a surprising insight
- End with a warning or bonus tip`
    };
    return guidelines[style] || guidelines['Storytelling & Long-form'];
  }

  /**
   * Get hashtag strategy based on optimization goal
   */
  private getHashtagStrategyForGoal(goal: string): string {
    const strategies: Record<string, string> = {
      'Maximize Engagement & Comments': '- Use question-provoking hashtags\n- Include community hashtags that spark discussion\n- Mix controversial/trending tags that generate conversation',
      'Increase Followers & Reach': '- Focus on high-volume discovery hashtags\n- Include niche-specific tags for targeted audience\n- Use location-based tags for local reach',
      'Drive Website Clicks': '- Use action-oriented hashtags\n- Include industry/product-specific tags\n- Target hashtags that indicate purchase intent',
      'Boost Shares & Saves': '- Informational and educational hashtags\n- "How-to" and tutorial-related tags\n- Bookmark-worthy content indicators'
    };
    return strategies[goal] || strategies['Maximize Engagement & Comments'];
  }

  private buildSystemPrompt(insights: any, postType: string, platform: string): string {
    const trendingInfo = insights.trending ? 
      `\n\nCURRENT TRENDING TOPICS IN ${insights.contentNiche.toUpperCase()}:\n${insights.trending.topics?.join(', ') || 'N/A'}` : '';
    
    const performanceInsights = insights.recentPerformance ? 
      `\n\nYOUR RECENT PERFORMANCE:\n- Engagement Trend: ${insights.recentPerformance.engagementTrends?.trend || 'stable'} (${insights.recentPerformance.engagementTrends?.change || 0}% change)\n- Avg Engagement: ${insights.recentPerformance.engagementTrends?.recentAvg || 'N/A'}\n- Best Posting Times: ${insights.recentPerformance.bestPostingTimes?.join(', ') || 'N/A'}` : '';

    return `You are an expert ${platform} content creator and viral strategist with deep knowledge of what makes content go viral.

YOUR CREATOR PROFILE:
- Persona: ${insights.aiPersona || 'Professional & Authoritative'}
- Caption Style: ${insights.captionStyle || 'Storytelling'}
- Content Niche: ${insights.contentNiche || 'General'}
- Brand Voice: ${insights.brandVoice || 'Authentic and engaging'}
- Target Audience: ${insights.targetAudience || 'General audience'}
- Optimization Goal: ${insights.optimizationGoals || 'Engagement'}
- Creativity Level: ${Math.round((insights.creativityLevel || 0.7) * 100)}%
${trendingInfo}
${performanceInsights}

PLATFORM-SPECIFIC BEST PRACTICES (${platform.toUpperCase()}):
${this.getPlatformGuidelines(platform, postType)}

CREATE ${postType.toUpperCase()} CAPTIONS THAT:
1. **HOOK** - Grab attention in the first 3 words (CRITICAL - 80% of users scroll past without reading)
2. **VALUE** - Deliver immediate value, insight, or emotion
3. **STORY** - Use ${insights.captionStyle} approach to connect deeply
4. **ENGAGE** - Include questions, calls to action, or interactive elements
5. **OPTIMIZE** - Structure for ${insights.optimizationGoals?.toLowerCase() || 'maximum engagement'}
6. **BRAND** - Match the ${insights.aiPersona} persona consistently
7. **VIRAL** - Incorporate trending topics and viral content patterns

FORMATTING RULES:
- Use strategic emojis (2-4) for visual breaks and emphasis
- Add line breaks every 2-3 sentences for mobile readability
- Include an engaging question or CTA
- Keep tone ${insights.aiPersona}
- Length: ${this.getOptimalLength(postType, platform)}

${postType === 'story' ? '⚡ STORIES: Keep punchy, immediate, conversational. Use 2-3 sentences max.' : ''}
${postType === 'reel' ? '⚡ REELS: Lead with a pattern interrupt. Structure: Hook → Value → CTA. No fluff.' : ''}
${postType === 'post' ? '⚡ FEED POST: Build narrative. Hook → Story → Value → Engagement Question.' : ''}

CRITICAL: DO NOT include hashtags in the caption. They are generated separately.
CRITICAL: Write in a natural, authentic voice that sounds human, not AI-generated.
CRITICAL: Incorporate trending topics where relevant: ${insights.trending?.topics?.slice(0, 3).join(', ') || 'N/A'}`;
  }

  private getPlatformGuidelines(platform: string, postType: string): string {
    const guidelines: Record<string, string> = {
      instagram: `• Feed posts: 125-150 characters for preview text (hook), full 2,200 limit available
• Reels: Short, punchy, hook in first 3 seconds
• Stories: Conversational, immediate, 2-3 sentences
• Use emojis strategically (increases engagement by 47%)
• Ask questions (increases comments by 89%)
• Include clear CTA (boosts saves/shares by 65%)`,
      facebook: `• First 2-3 lines visible before "See More"
• Longer posts perform better (250-300 words ideal)
• Use paragraph breaks every 2-3 sentences
• Questions drive comments, stories drive shares`,
      twitter: `• Hook in first 140 characters
• Thread-worthy insights perform 10x better
• Numbers, data, and specific examples increase RT
• Conversational tone wins`,
      linkedin: `• Professional yet personable tone
• Start with a question or bold statement
• 150-200 words sweet spot
• Include takeaways or lessons learned
• Use first-person storytelling`
    };
    
    return guidelines[platform.toLowerCase()] || guidelines.instagram;
  }

  private getOptimalLength(postType: string, platform: string): string {
    const lengths: Record<string, Record<string, string>> = {
      instagram: {
        post: '100-250 characters (short & engaging)',
        reel: '50-100 characters (hook-focused)',
        story: '30-60 characters (punchy)'
      },
      facebook: {
        post: '250-300 words (storytelling)',
        reel: '50-100 characters',
        story: '30-60 characters'
      },
      twitter: {
        post: '100-280 characters (concise)',
        reel: '50-100 characters',
        story: '30-60 characters'
      }
    };
    
    return lengths[platform.toLowerCase()]?.[postType] || '100-250 characters';
  }

  private buildUserPrompt(params: {
    mediaAnalysis: string;
    existingCaption?: string;
    postType: string;
    platform: string;
    insights: any;
  }): string {
    const { mediaAnalysis, existingCaption, postType, platform, insights } = params;

    let prompt = `Create an engaging ${platform} ${postType} caption.\n\n`;

    if (mediaAnalysis) {
      prompt += `Visual Content Analysis:\n${mediaAnalysis}\n\n`;
    }

    if (existingCaption) {
      prompt += `Existing Caption (enhance this):\n${existingCaption}\n\n`;
    }

    prompt += `Requirements:
- Target Audience: ${insights.contentNiche || 'General audience'}
- Tone: ${insights.aiPersona || 'Professional'}
- Style: ${insights.captionStyle || 'Storytelling'}
- Goal: ${insights.optimizationGoals || 'Maximize engagement'}

${insights.trending?.viralHooks?.length ? `\nConsider these proven viral hooks for your niche:\n${insights.trending.viralHooks.join(', ')}\n\nINSTRUCTION: Try incorporating one viral hook naturally into the caption structure to increase engagement.\n` : ''}

Create a caption that will go VIRAL and drive maximum ${insights.optimizationGoals?.toLowerCase() || 'engagement'}.`;

    return prompt;
  }

  private predictEngagement(caption: string, hashtags: string[], insights: any): number {
    // Simplified engagement prediction algorithm
    let score = 50; // Base score

    // Caption quality factors
    if (caption.length > 100 && caption.length < 500) score += 10;
    if (caption.includes('?')) score += 5; // Questions drive engagement
    if (/[\u{1F600}-\u{1F64F}]/u.test(caption)) score += 5; // Emojis (emoticons range)
    if (caption.split('\n').length > 2) score += 5; // Line breaks

    // Hashtag factors
    if (hashtags.length >= 10 && hashtags.length <= 20) score += 10;
    if (hashtags.length >= 15) score += 5;

    // User history factors
    if (insights.recentPerformance?.avgEngagement > 100) score += 10;

    return Math.min(Math.max(score, 0), 100);
  }

  private predictVirality(caption: string, hashtags: string[], mediaAnalysis: string): number {
    let score = 40; // Base score

    // Viral indicators in caption
    const viralWords = ['secret', 'hack', 'tip', 'trick', 'must', 'need', 'amazing', 'incredible'];
    const hasViralWords = viralWords.some(word => caption.toLowerCase().includes(word));
    if (hasViralWords) score += 15;

    // Strong hook
    if (caption.split('\n')[0].length < 50) score += 10;

    // Hashtag diversity
    if (hashtags.length >= 15) score += 10;

    // Visual appeal (from analysis)
    if (mediaAnalysis.toLowerCase().includes('vibrant') || 
        mediaAnalysis.toLowerCase().includes('striking') ||
        mediaAnalysis.toLowerCase().includes('eye-catching')) {
      score += 15;
    }

    return Math.min(Math.max(score, 0), 100);
  }

  private generateCTA(postType: string, goal?: string): string {
    const ctas = {
      engagement: [
        'Ask a question in your caption',
        'Encourage comments with "Tag someone who..."',
        'Use "Double tap if you agree"',
        'Add "Comment your thoughts below"'
      ],
      conversion: [
        'Add "Link in bio" with clear benefit',
        'Use "Swipe up" for Stories',
        'Include "Shop now" with urgency',
        'Add "Learn more" with value proposition'
      ],
      awareness: [
        'Encourage shares with "Send this to..."',
        'Use "Save this for later"',
        'Add "Share your story"',
        'Include "Spread the word"'
      ]
    };

    const goalKey = goal?.toLowerCase().includes('conversion') ? 'conversion' :
                    goal?.toLowerCase().includes('awareness') ? 'awareness' : 'engagement';
    
    const options = ctas[goalKey];
    return options[Math.floor(Math.random() * options.length)];
  }
}

export const aiContentGenerator = new AIContentGenerator();
