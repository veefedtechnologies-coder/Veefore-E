import OpenAI from 'openai';
import { storage } from './mongodb-storage';

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
}

export class AIContentGenerator {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  /**
   * Analyze image or video using GPT-4 Vision
   */
  private async analyzeMedia(mediaUrl: string, mediaType: 'image' | 'video'): Promise<string> {
    try {
      console.log('[AI CONTENT] Analyzing media:', { mediaUrl, mediaType });

      // For videos, we analyze the thumbnail or first frame
      // For images, we analyze directly
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert social media content analyzer. Analyze the provided ${mediaType} and describe:
            1. Main subject/theme
            2. Visual elements (colors, composition, mood)
            3. Potential audience appeal
            4. Emotional tone
            5. Key objects or people
            6. Setting/environment
            7. Suggested content angle for maximum engagement
            
            Be detailed but concise. Focus on elements that would help create viral, engaging captions and hashtags.`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this ${mediaType} for social media content creation:`
              },
              {
                type: "image_url",
                image_url: {
                  url: mediaUrl,
                  detail: "high"
                }
              }
            ]
          }
        ],
        max_tokens: 500,
        temperature: 0.7
      });

      const analysis = response.choices[0]?.message?.content || '';
      console.log('[AI CONTENT] Media analysis complete:', analysis.substring(0, 100) + '...');
      return analysis;
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
        autoHashtags: user?.preferences?.autoHashtags !== false
      };

      // Get workspace-specific AI configuration
      if (workspaceId) {
        const workspace = await storage.getWorkspace(workspaceId);
        if (workspace?.aiConfiguration) {
          insights.workspaceAI = workspace.aiConfiguration;
        }
      }

      // Get recent analytics for this user's content
      try {
        const recentContent = await storage.getContentByWorkspace(workspaceId || '', 10);
        if (recentContent && recentContent.length > 0) {
          insights.recentPerformance = {
            avgEngagement: this.calculateAvgEngagement(recentContent),
            topHashtags: this.extractTopHashtags(recentContent),
            bestPostingTimes: this.analyzeBestTimes(recentContent)
          };
        }
      } catch (e) {
        console.warn('[AI CONTENT] Could not fetch recent analytics');
      }

      return insights;
    } catch (error) {
      console.error('[AI CONTENT] Failed to get user insights:', error);
      return {};
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
    // Simplified - in production, analyze actual performance by time
    return ['9:00 AM', '1:00 PM', '7:00 PM'];
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

    console.log('[AI CONTENT] Generating content for user:', userId);

    // Step 1: Get user insights and preferences
    const insights = await this.getUserInsights(userId, workspaceId);
    console.log('[AI CONTENT] User insights loaded:', {
      niche: insights.contentNiche,
      persona: insights.aiPersona,
      style: insights.captionStyle
    });

    // Step 2: Analyze media if provided
    let mediaAnalysis = '';
    if (mediaUrl && mediaType) {
      mediaAnalysis = await this.analyzeMedia(mediaUrl, mediaType);
    }

    // Step 3: Build context-aware prompt
    const systemPrompt = this.buildSystemPrompt(insights, postType, platform);
    const userPrompt = this.buildUserPrompt({
      mediaAnalysis,
      existingCaption,
      postType,
      platform,
      insights
    });

    // Step 4: Generate caption
    console.log('[AI CONTENT] Generating caption with GPT-4o...');
    const captionResponse = await this.openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 300,
      temperature: insights.creativityLevel || 0.7
    });

    const caption = captionResponse.choices[0]?.message?.content?.trim() || '';

    // Step 5: Generate strategic hashtags
    console.log('[AI CONTENT] Generating strategic hashtags...');
    const hashtagResponse = await this.openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a viral social media strategist specializing in hashtag optimization for ${platform}.
          
          Generate hashtags that:
          1. Mix high-volume (100k-1M posts) and niche (10k-100k posts) tags
          2. Include trending tags relevant to the content
          3. Target the specific audience niche
          4. Optimize for ${insights.optimizationGoals || 'engagement'}
          5. Follow ${platform} best practices
          6. Include branded/unique tags for discoverability
          
          Return 15-20 hashtags that maximize virality and engagement.
          Format: Return ONLY hashtags with # symbols, separated by spaces.`
        },
        {
          role: "user",
          content: `Generate viral hashtags for:
          
          Content Type: ${postType}
          Platform: ${platform}
          Niche: ${insights.contentNiche || 'general'}
          Caption: ${caption}
          ${mediaAnalysis ? `Visual Analysis: ${mediaAnalysis}` : ''}
          ${insights.recentPerformance?.topHashtags ? `Previously successful tags: ${insights.recentPerformance.topHashtags.join(', ')}` : ''}
          
          Optimization Goal: ${insights.optimizationGoals || 'Maximum engagement and virality'}`
        }
      ],
      max_tokens: 200,
      temperature: 0.6
    });

    const hashtagText = hashtagResponse.choices[0]?.message?.content?.trim() || '';
    const hashtags = hashtagText
      .split(/\s+/)
      .filter(tag => tag.startsWith('#'))
      .map(tag => tag.replace('#', ''))
      .slice(0, 20);

    // Step 6: Generate engagement predictions
    const engagementScore = this.predictEngagement(caption, hashtags, insights);
    const viralityScore = this.predictVirality(caption, hashtags, mediaAnalysis);

    // Step 7: Generate CTA recommendation
    const ctaRecommendation = this.generateCTA(postType, insights.optimizationGoals);

    console.log('[AI CONTENT] Content generation complete:', {
      captionLength: caption.length,
      hashtagCount: hashtags.length,
      engagementScore,
      viralityScore
    });

    return {
      caption,
      hashtags,
      engagementScore,
      viralityScore,
      ctaRecommendation
    };
  }

  private buildSystemPrompt(insights: any, postType: string, platform: string): string {
    return `You are an expert ${platform} content creator with deep knowledge of viral content strategies.

Your Profile:
- Persona: ${insights.aiPersona || 'Professional & Authoritative'}
- Caption Style: ${insights.captionStyle || 'Storytelling'}
- Content Niche: ${insights.contentNiche || 'General'}
- Optimization Goal: ${insights.optimizationGoals || 'Engagement'}

Create ${postType} captions that:
1. Hook readers in the first line (critical for ${platform})
2. Tell a compelling story or deliver value
3. Include natural, strategic emoji placement
4. Ask engaging questions to drive comments
5. Use line breaks for readability
6. Match the brand voice: ${insights.aiPersona}
7. Optimize for ${insights.optimizationGoals}
8. Drive specific actions (CTA)

${postType === 'story' ? 'Keep it brief and punchy for Stories format.' : ''}
${postType === 'reel' ? 'Focus on hook + value + CTA structure for Reels.' : ''}

DO NOT include hashtags in the caption - they will be generated separately.
Write in a natural, authentic voice that resonates with the target audience.`;
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

Create a caption that will go VIRAL and drive maximum ${insights.optimizationGoals?.toLowerCase() || 'engagement'}.`;

    return prompt;
  }

  private predictEngagement(caption: string, hashtags: string[], insights: any): number {
    // Simplified engagement prediction algorithm
    let score = 50; // Base score

    // Caption quality factors
    if (caption.length > 100 && caption.length < 500) score += 10;
    if (caption.includes('?')) score += 5; // Questions drive engagement
    if (caption.match(/[😀-🙏]/g)) score += 5; // Emojis
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
