import OpenAI from 'openai';
import { getOpenAIClient } from './openai-client';

let openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openai) {
    openai = getOpenAIClient();
  }
  return openai;
}

interface TrendingTopic {
  topic: string;
  description: string;
  engagement: number;
  category: string;
  growth: number;
  platform: string[];
  relevanceScore: number;
  timeframe: string;
}

interface TrendingTopicsResponse {
  topics: TrendingTopic[];
  lastUpdated: string;
  category: string;
  source: string;
}

export class TrendingTopicsAPI {
  private static instance: TrendingTopicsAPI;
  private cache: Map<string, { data: TrendingTopicsResponse; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

  static getInstance(): TrendingTopicsAPI {
    if (!TrendingTopicsAPI.instance) {
      TrendingTopicsAPI.instance = new TrendingTopicsAPI();
    }
    return TrendingTopicsAPI.instance;
  }

  async getTrendingTopics(category: string = 'Business and Finance', preferences: any = {}): Promise<TrendingTopicsResponse> {
    console.log(`[TRENDING TOPICS] Fetching trending topics for category: ${category}`);

    // Check cache first
    const cacheKey = category.toLowerCase();
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      console.log(`[TRENDING TOPICS] ✅ Returning cached data for ${category}`);
      return cached.data;
    }

    try {
      // Generate real trending topics using OpenAI with current context
      const trendingData = await this.generateTrendingTopics(category);

      // Cache the result
      this.cache.set(cacheKey, {
        data: trendingData,
        timestamp: Date.now()
      });

      console.log(`[TRENDING TOPICS] ✅ Generated ${trendingData.topics.length} trending topics for ${category}`);
      return trendingData;

    } catch (error) {
      console.error('[TRENDING TOPICS] ❌ Error generating trending topics:', error);

      // Return fallback data with current context
      return this.getFallbackTopics(category);
    }
  }

  private async generateTrendingTopics(category: string): Promise<TrendingTopicsResponse> {
    const currentDate = new Date().toISOString().split('T')[0];

    const categorySpecificGuidelines = this.getCategoryGuidelines(category);

    const prompt = `Generate 3-4 authentic trending topics specifically for "${category}" that are currently relevant in ${currentDate}. 
    
    IMPORTANT: ALL topics must be directly related to ${category}. Do not include topics from other categories.
    
    ${categorySpecificGuidelines}

    Provide realistic data in this exact JSON format:
    {
      "topics": [
        {
          "topic": "Topic Title (must be ${category} related)",
          "description": "Brief description of why this ${category} topic is trending",
          "engagement": number (1-100),
          "category": "${category}",
          "growth": number (1-100),
          "platform": ["Instagram", "Twitter", "LinkedIn"],
          "relevanceScore": number (1-100),
          "timeframe": "Past 24 hours"
        }
      ],
      "lastUpdated": "${new Date().toISOString()}",
      "category": "${category}",
      "source": "AI-Generated Trends Analysis"
    }

    Guidelines:
    - ALL topics must be strictly about ${category} - no other categories allowed
    - Topics should be current, realistic, and relevant to ${category} specifically
    - Descriptions should explain why this ${category} topic is trending
    - Engagement scores should reflect realistic social media metrics
    - Growth percentages should be believable (10-50% for most topics)
    - Include variety in platform distribution
    - Focus on ${category} topics that content creators would want to engage with`;

    const promptStr = `System: You are a social media trends analyst with access to real-time trending data across all major platforms. Generate authentic, current trending topics with realistic engagement metrics.\n\nUser: ${prompt}`;
    
    const { aiServiceManager } = await import('./services/AIServiceManager');
    let result = {};
    try {
      result = await aiServiceManager.generateJSON(promptStr, preferences);
    } catch (e) {
      console.warn('[TRENDING TOPICS] Failed to generate JSON using AIServiceManager', e);
    }

    // Validate and ensure proper structure
    if (!result.topics || !Array.isArray(result.topics)) {
      throw new Error('Invalid response structure from OpenAI');
    }

    return {
      topics: result.topics.slice(0, 4), // Limit to 4 topics
      lastUpdated: new Date().toISOString(),
      category: category,
      source: "AI-Generated Trends Analysis"
    };
  }

  private getCategoryGuidelines(category: string): string {
    const guidelines: Record<string, string> = {
      'Food and Cooking': `
        Focus on:
        - New cooking trends, techniques, and viral recipes
        - Restaurant industry developments and chef innovations
        - Food technology and dietary movements (plant-based, keto, etc.)
        - Seasonal cooking trends and ingredient spotlights
        - Food content creator collaborations and viral food challenges
      `,
      'Business and Finance': `
        Focus on:
        - Market movements, investment trends, and financial innovation
        - Business strategy, entrepreneurship, and startup developments
        - Economic indicators, policy changes, and market analysis
        - Cryptocurrency, fintech, and digital financial services
        - Corporate news, mergers, and industry disruptions
      `,
      'Technology': `
        Focus on:
        - AI developments, software updates, and tech product launches
        - Digital transformation, cybersecurity, and data privacy
        - Emerging technologies, tech industry news, and innovation
        - Programming languages, development tools, and tech education
        - Tech company developments and industry shifts
      `,
      'Health & Wellness': `
        Focus on:
        - Fitness trends, mental health awareness, and wellness practices
        - Nutrition research, health technology, and medical breakthroughs
        - Wellness lifestyle trends and self-care practices
        - Healthcare innovation and public health developments
        - Alternative medicine and holistic health approaches
      `
    };

    return guidelines[category] || `
      Focus on current trends and developments specifically related to ${category}.
      Ensure all topics are directly relevant to this category and would interest content creators in this space.
    `;
  }

  private getFallbackTopics(category: string): TrendingTopicsResponse {
    return {
      topics: [],
      lastUpdated: new Date().toISOString(),
      category,
      source: "Trending data unavailable"
    };
  }

  // Clear cache manually if needed
  clearCache(): void {
    this.cache.clear();
    console.log('[TRENDING TOPICS] Cache cleared');
  }

  // Get all available categories
  getAvailableCategories(): string[] {
    return [
      'Business and Finance',
      'Technology',
      'Marketing',
      'Social Media',
      'Entertainment',
      'Health & Wellness',
      'Education',
      'Sports',
      'Travel',
      'Food & Lifestyle'
    ];
  }
}