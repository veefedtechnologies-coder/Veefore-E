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

  async getTrendingTopics(category: string = 'Business and Finance'): Promise<TrendingTopicsResponse> {
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

    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a social media trends analyst with access to real-time trending data across all major platforms. Generate authentic, current trending topics with realistic engagement metrics."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 1500
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    
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
    const fallbackTopics: Record<string, TrendingTopic[]> = {
      'Business and Finance': [
        {
          topic: "AI Investment Surge",
          description: "Major corporations are increasing AI investments following recent breakthrough announcements in generative AI capabilities.",
          engagement: 78,
          category: "Business and Finance",
          growth: 45,
          platform: ["LinkedIn", "Twitter", "Instagram"],
          relevanceScore: 85,
          timeframe: "Past 24 hours"
        },
        {
          topic: "Remote Work Evolution",
          description: "New hybrid work models emerge as companies adapt to changing workforce expectations and productivity data.",
          engagement: 62,
          category: "Business and Finance",
          growth: 32,
          platform: ["LinkedIn", "Twitter"],
          relevanceScore: 78,
          timeframe: "Past 24 hours"
        }
      ],
      'Technology': [
        {
          topic: "Quantum Computing Breakthrough",
          description: "Scientists achieve new milestone in quantum error correction, bringing practical quantum computing closer to reality.",
          engagement: 84,
          category: "Technology",
          growth: 67,
          platform: ["Twitter", "LinkedIn", "Instagram"],
          relevanceScore: 92,
          timeframe: "Past 24 hours"
        },
        {
          topic: "5G Infrastructure Expansion",
          description: "Major telecommunications companies announce accelerated 5G deployment plans for rural and urban areas.",
          engagement: 56,
          category: "Technology",
          growth: 28,
          platform: ["LinkedIn", "Twitter"],
          relevanceScore: 71,
          timeframe: "Past 24 hours"
        }
      ],
      'Marketing': [
        {
          topic: "Influencer Marketing ROI",
          description: "New study reveals changing dynamics in influencer marketing effectiveness across different platform demographics.",
          engagement: 71,
          category: "Marketing",
          growth: 39,
          platform: ["Instagram", "LinkedIn", "TikTok"],
          relevanceScore: 82,
          timeframe: "Past 24 hours"
        },
        {
          topic: "Video Content Dominance",
          description: "Short-form video content continues to drive highest engagement rates across all social media platforms.",
          engagement: 88,
          category: "Marketing",
          growth: 54,
          platform: ["TikTok", "Instagram", "YouTube"],
          relevanceScore: 89,
          timeframe: "Past 24 hours"
        }
      ],
      'Food and Cooking': [
        {
          topic: "Plant-Based Meat Innovation",
          description: "New plant-based meat alternatives achieve taste and texture breakthrough, attracting mainstream food chains and home cooks.",
          engagement: 92,
          category: "Food and Cooking",
          growth: 67,
          platform: ["Instagram", "TikTok", "YouTube"],
          relevanceScore: 88,
          timeframe: "Past 24 hours"
        },
        {
          topic: "Fermentation Revival",
          description: "Ancient fermentation techniques gain popularity as health-conscious cooks discover gut health benefits and unique flavors.",
          engagement: 76,
          category: "Food and Cooking",
          growth: 43,
          platform: ["Instagram", "YouTube", "Pinterest"],
          relevanceScore: 81,
          timeframe: "Past 24 hours"
        },
        {
          topic: "AI Recipe Generation",
          description: "AI-powered recipe creators help home cooks design meals based on dietary restrictions and available ingredients.",
          engagement: 84,
          category: "Food and Cooking",
          growth: 58,
          platform: ["TikTok", "Instagram", "YouTube"],
          relevanceScore: 85,
          timeframe: "Past 24 hours"
        },
        {
          topic: "Sustainable Cooking Movement",
          description: "Zero-waste cooking techniques and sustainable ingredient sourcing become viral trends among food content creators.",
          engagement: 69,
          category: "Food and Cooking",
          growth: 34,
          platform: ["Instagram", "YouTube", "Twitter"],
          relevanceScore: 78,
          timeframe: "Past 24 hours"
        }
      ]
    };

    const topics = fallbackTopics[category] || fallbackTopics['Business and Finance'];

    return {
      topics,
      lastUpdated: new Date().toISOString(),
      category,
      source: "Fallback Trends Data"
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