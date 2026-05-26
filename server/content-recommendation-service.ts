import { GoogleGenerativeAI } from '@google/generative-ai';
import { ContentRecommendation, InsertContentRecommendation, User, Workspace } from '@shared/schema';

interface UserGeoLocation {
  country: string;
  countryCode: string;
  city: string;
  region: string;
  timezone: string;
}

interface ContentRequest {
  type: 'video' | 'reel' | 'audio';
  niche: string;
  interests: string[];
  country: string;
  limit?: number;
}

interface AIContentSuggestion {
  title: string;
  description: string;
  category: string;
  tags: string[];
  duration: number;
  thumbnailPrompt: string;
  script?: string;
  audioDescription?: string;
  trending: boolean;
  engagement: {
    expectedViews: number;
    expectedLikes: number;
    expectedShares: number;
  };
}

class ContentRecommendationService {
  private genAI: GoogleGenerativeAI;

  constructor() {
    if (!process.env.GOOGLE_API_KEY) {
      throw new Error('GOOGLE_API_KEY is required for content recommendations');
    }
    this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  }

  async detectUserLocation(ip: string): Promise<UserGeoLocation> {
    try {
      console.log(`[GEOLOCATION] Detecting location for IP: ${ip}`);
      
      // Use ip-api.com (free tier allows 1000 requests/month)
      const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,city,timezone`);
      
      if (!response.ok) {
        console.log('[GEOLOCATION] API request failed, using fallback');
        return this.getFallbackLocation();
      }

      const data = await response.json();
      
      if (data.status === 'fail') {
        console.log('[GEOLOCATION] API returned fail status:', data.message);
        return this.getFallbackLocation();
      }

      console.log(`[GEOLOCATION] Detected location: ${data.city}, ${data.country} (${data.countryCode})`);
      
      return {
        country: data.country || 'India',
        countryCode: data.countryCode || 'IN',
        city: data.city || 'Mumbai',
        region: data.region || 'Maharashtra',
        timezone: data.timezone || 'Asia/Kolkata'
      };
    } catch (error) {
      console.error('[GEOLOCATION] Location detection failed:', error);
      return this.getFallbackLocation();
    }
  }

  private getFallbackLocation(): UserGeoLocation {
    return {
      country: 'India',
      countryCode: 'IN',
      city: 'Mumbai',
      region: 'Maharashtra',
      timezone: 'Asia/Kolkata'
    };
  }

  async generatePersonalizedRecommendations(
    user: User,
    workspace: Workspace,
    location: UserGeoLocation,
    request: ContentRequest
  ): Promise<AIContentSuggestion[]> {
    try {
      console.log(`[CONTENT AI] Generating ${request.type} recommendations for ${location.country}`);
      
      const model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const prompt = this.buildPersonalizedPrompt(user, workspace, location, request);
      
      const response = await model.generateContent(prompt);
      let responseText = response.response.text();

      // Clean up markdown formatting
      responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      try {
        let jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          responseText = jsonMatch[0];
        }
        
        const parsed = JSON.parse(responseText);
        console.log(`[CONTENT AI] Generated ${parsed.recommendations?.length || 0} personalized recommendations`);
        return parsed.recommendations || [];
      } catch (parseError) {
        console.error('[CONTENT AI] Failed to parse response:', parseError);
        return this.generateFallbackRecommendations(request);
      }
    } catch (error) {
      console.error('[CONTENT AI] Generation failed:', error);
      return this.generateFallbackRecommendations(request);
    }
  }

  private buildPersonalizedPrompt(
    user: User,
    workspace: Workspace,
    location: UserGeoLocation,
    request: ContentRequest
  ): string {
    const preferences = user.preferences as any || {};
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().toLocaleString('en-US', { month: 'long' });

    return `You are a content recommendation AI for VeeFore, specializing in ${location.country} market trends.

User Profile:
- Location: ${location.city}, ${location.country}
- Niche: ${request.niche}
- Interests: ${request.interests.join(', ')}
- Workspace: ${workspace.name}
- AI Personality: ${workspace.aiPersonality}

Generate ${request.limit || 6} highly engaging ${request.type} content ideas specifically for ${location.country} audience in ${currentMonth} ${currentYear}.

Requirements:
1. Content must be culturally relevant to ${location.country}
2. Include local festivals, trends, and regional preferences
3. Use ${location.country}-specific language nuances and references
4. Consider current seasonal trends in ${location.country}
5. Focus on ${request.niche} niche with ${request.interests.join(', ')} interests

For ${request.type === 'video' ? 'videos' : request.type === 'reel' ? 'reels' : 'audio content'}:
${request.type === 'video' ? '- Duration: 30-180 seconds\n- Include hook, main content, and call-to-action\n- Provide detailed shot suggestions' : ''}
${request.type === 'reel' ? '- Duration: 15-90 seconds\n- Fast-paced, trending format\n- Include trending music/audio suggestions' : ''}
${request.type === 'audio' ? '- Duration: 30-300 seconds\n- Voice-over or music-based content\n- Include audio style and tone suggestions' : ''}

Return ONLY a JSON object in this exact format:
{
  "recommendations": [
    {
      "title": "Engaging title in ${location.country} context",
      "description": "Detailed description explaining the content concept and why it works for ${location.country} audience",
      "category": "${request.niche}",
      "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
      "duration": ${request.type === 'video' ? '60' : request.type === 'reel' ? '30' : '120'},
      "thumbnailPrompt": "Detailed description for AI image generation",
      ${request.type === 'audio' ? '"audioDescription": "Audio style, tone, and music suggestions",' : '"script": "Complete script or detailed content outline",'}
      "trending": true,
      "engagement": {
        "expectedViews": 5000,
        "expectedLikes": 250,
        "expectedShares": 50
      }
    }
  ]
}

Make content highly specific to ${location.country} market, current trends, and ${request.niche} niche.`;
  }

  private generateFallbackRecommendations(request: ContentRequest): AIContentSuggestion[] {
    const baseRecommendations = {
      video: [
        {
          title: "Quick Tutorial: Master This Skill in 60 Seconds",
          description: "Create engaging educational content that teaches a valuable skill quickly",
          category: request.niche,
          tags: ["tutorial", "education", "skills", "quick", "howto"],
          duration: 60,
          thumbnailPrompt: "Clean, bright thumbnail with bold text and clear subject focus",
          script: "Hook: 'Here's the one skill everyone needs' → Problem → Solution → Quick demo → Call to action",
          trending: true,
          engagement: { expectedViews: 3000, expectedLikes: 180, expectedShares: 35 }
        },
        {
          title: "Behind the Scenes: My Daily Routine",
          description: "Show authentic moments and processes that build personal connection",
          category: request.niche,
          tags: ["lifestyle", "routine", "authentic", "personal", "behind-scenes"],
          duration: 90,
          thumbnailPrompt: "Natural, candid shot with warm lighting and authentic expression",
          script: "Morning routine → Work process → Evening wind-down → Key insights → Engagement question",
          trending: true,
          engagement: { expectedViews: 4500, expectedLikes: 225, expectedShares: 45 }
        }
      ],
      reel: [
        {
          title: "Trending Dance Challenge",
          description: "Jump on current dance trends with your unique twist",
          category: request.niche,
          tags: ["dance", "trending", "challenge", "music", "viral"],
          duration: 15,
          thumbnailPrompt: "Dynamic action shot with vibrant colors and movement blur",
          script: "Trending audio → Quick setup → Dance sequence → Unique ending → Hashtag challenge",
          trending: true,
          engagement: { expectedViews: 8000, expectedLikes: 400, expectedShares: 80 }
        },
        {
          title: "Quick Life Hack Reveal",
          description: "Share a surprising tip that solves a common problem",
          category: request.niche,
          tags: ["lifehack", "tips", "useful", "problem-solving", "viral"],
          duration: 30,
          thumbnailPrompt: "Split screen showing before and after with bright, attention-grabbing colors",
          script: "Problem setup → Build suspense → Reveal hack → Quick demonstration → Save for later reminder",
          trending: true,
          engagement: { expectedViews: 6000, expectedLikes: 300, expectedShares: 60 }
        }
      ],
      audio: [
        {
          title: "Motivational Morning Boost",
          description: "Energizing audio content to start the day with positivity",
          category: request.niche,
          tags: ["motivation", "morning", "positivity", "energy", "inspiration"],
          duration: 120,
          thumbnailPrompt: "Sunrise imagery with motivational text overlay and warm colors",
          audioDescription: "Upbeat background music with clear, energetic voice-over. Start soft and build energy.",
          trending: true,
          engagement: { expectedViews: 2500, expectedLikes: 150, expectedShares: 30 }
        },
        {
          title: "Relaxing Night Thoughts",
          description: "Calming audio for evening reflection and relaxation",
          category: request.niche,
          tags: ["relaxation", "evening", "mindfulness", "calm", "reflection"],
          duration: 180,
          thumbnailPrompt: "Peaceful night scene with soft lighting and calming colors",
          audioDescription: "Gentle ambient sounds with soft, soothing voice-over. Slow tempo throughout.",
          trending: false,
          engagement: { expectedViews: 1800, expectedLikes: 120, expectedShares: 25 }
        }
      ]
    };

    return baseRecommendations[request.type] || [];
  }

  async generateThumbnail(prompt: string): Promise<string> {
    // This would integrate with an AI image generation service
    // For now, return a placeholder that could be implemented with DALL-E, Midjourney, etc.
    console.log(`[THUMBNAIL] Would generate thumbnail for: ${prompt}`);
    return `https://via.placeholder.com/1280x720/6366f1/ffffff?text=${encodeURIComponent('AI Generated Thumbnail')}`;
  }

  async generateAudioContent(description: string): Promise<string> {
    // This would integrate with AI audio generation service
    // For now, return a placeholder for audio content
    console.log(`[AUDIO] Would generate audio for: ${description}`);
    return `https://www.soundjay.com/misc/sounds/bell-ringing-05.wav`; // Placeholder
  }

  getCountrySpecificNiches(countryCode: string): string[] {
    const countryNiches: Record<string, string[]> = {
      'IN': ['bollywood', 'cricket', 'festivals', 'food', 'spirituality', 'startups', 'education'],
      'US': ['sports', 'tech', 'entertainment', 'lifestyle', 'fitness', 'business'],
      'GB': ['football', 'culture', 'travel', 'food', 'history', 'comedy'],
      'AU': ['outdoors', 'sports', 'lifestyle', 'travel', 'nature', 'adventure'],
      'CA': ['nature', 'hockey', 'multiculturalism', 'tech', 'wellness']
    };

    return countryNiches[countryCode] || countryNiches['IN'];
  }

  getTrendingHashtags(country: string, niche: string): string[] {
    // This would integrate with real trending hashtag APIs
    const baseTags = [`#${niche}`, '#trending', '#viral', '#fyp'];
    
    if (country === 'India') {
      baseTags.push('#india', '#desi', '#trending');
    }
    
    return baseTags;
  }
}

export const contentRecommendationService = new ContentRecommendationService();