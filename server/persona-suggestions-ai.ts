import { getOpenAIClient, isOpenAIAvailable } from './openai-client';

export interface PersonaInput {
  industry: string;
  audience: string;
  brandTone: string;
  goals: string[];
  currentChallenges: string[];
  platforms: string[];
  contentTypes: string[];
  brandValues?: string;
  competitorExamples?: string;
  budget?: number;
  timeframe: string;
}

export interface ContentSuggestion {
  id: string;
  title: string;
  description: string;
  platform: string;
  contentType: string;
  estimatedReach: number;
  engagementPotential: number;
  difficulty: 'easy' | 'medium' | 'hard';
  timeToCreate: string;
  keywords: string[];
  callToAction: string;
  personalizedReason: string;
  trendRelevance: number;
}

export interface PersonaSuggestions {
  personaAnalysis: {
    profileSummary: string;
    strengthsIdentified: string[];
    growthOpportunities: string[];
    recommendedVoice: string;
    targetAudienceInsights: string[];
  };
  contentSuggestions: ContentSuggestion[];
  strategicRecommendations: {
    postingSchedule: {
      platform: string;
      frequency: string;
      bestTimes: string[];
      contentMix: Record<string, number>;
    }[];
    engagementStrategy: string[];
    hashtags: {
      trending: string[];
      niche: string[];
      branded: string[];
    };
    collaborationOpportunities: string[];
  };
  monthlyContentPlan: {
    week: number;
    theme: string;
    contentTypes: string[];
    keyMessages: string[];
    metrics: string[];
  }[];
  personalizationInsights: {
    uniqueAngles: string[];
    competitiveDifferentiators: string[];
    audienceConnectionPoints: string[];
    brandPersonalityTips: string[];
  };
  growthProjections: {
    timeframe: string;
    expectedGrowth: {
      followers: number;
      engagement: number;
      reach: number;
    };
    milestones: string[];
    successMetrics: string[];
  };
}

export interface PersonaResult {
  suggestions: PersonaSuggestions;
  remainingCredits?: number;
}

export class PersonaSuggestionsAI {
  async generatePersonaSuggestions(input: PersonaInput): Promise<PersonaSuggestions> {
    const prompt = this.buildPersonaPrompt(input);
    
    try {
      // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert social media strategist and brand consultant specializing in persona-based content recommendations. Analyze the provided brand information and generate highly personalized, actionable content suggestions that align with the brand's unique voice, audience, and goals. Provide comprehensive strategic guidance and monthly planning."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 4000
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      return this.formatPersonaSuggestions(result, input);
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error('Failed to generate persona-based suggestions');
    }
  }

  private buildPersonaPrompt(input: PersonaInput): string {
    return `
    Analyze the following brand profile and generate comprehensive persona-based content suggestions:

    **Brand Profile:**
    - Industry: ${input.industry}
    - Target Audience: ${input.audience}
    - Brand Tone: ${input.brandTone}
    - Primary Goals: ${input.goals.join(', ')}
    - Current Challenges: ${input.currentChallenges.join(', ')}
    - Active Platforms: ${input.platforms.join(', ')}
    - Preferred Content Types: ${input.contentTypes.join(', ')}
    - Brand Values: ${input.brandValues || 'Not specified'}
    - Competitor Examples: ${input.competitorExamples || 'Not provided'}
    - Budget Range: ${input.budget ? `$${input.budget}` : 'Not specified'}
    - Planning Timeframe: ${input.timeframe}

    Provide a comprehensive JSON response with the following structure:

    {
      "personaAnalysis": {
        "profileSummary": "Detailed analysis of the brand's current position and potential",
        "strengthsIdentified": ["List of 4-5 key brand strengths"],
        "growthOpportunities": ["List of 4-5 specific growth opportunities"],
        "recommendedVoice": "Specific voice and tone recommendations",
        "targetAudienceInsights": ["List of 5-6 audience insights and behaviors"]
      },
      "contentSuggestions": [
        {
          "id": "suggestion_1",
          "title": "Engaging content title",
          "description": "Detailed content description and execution guide",
          "platform": "Primary platform for this content",
          "contentType": "Type of content (post, video, story, etc.)",
          "estimatedReach": "Expected reach number",
          "engagementPotential": "Engagement rate percentage (1-100)",
          "difficulty": "easy/medium/hard",
          "timeToCreate": "Estimated time needed",
          "keywords": ["relevant", "keywords"],
          "callToAction": "Specific CTA recommendation",
          "personalizedReason": "Why this content fits their brand persona",
          "trendRelevance": "Trend relevance score (1-100)"
        }
        // Generate 8-12 diverse content suggestions
      ],
      "strategicRecommendations": {
        "postingSchedule": [
          {
            "platform": "Platform name",
            "frequency": "Posting frequency recommendation",
            "bestTimes": ["Time slots for posting"],
            "contentMix": {"contentType": percentage}
          }
        ],
        "engagementStrategy": ["List of engagement tactics"],
        "hashtags": {
          "trending": ["#trending", "#hashtags"],
          "niche": ["#niche", "#specific"],
          "branded": ["#brand", "#custom"]
        },
        "collaborationOpportunities": ["Partnership and collaboration ideas"]
      },
      "monthlyContentPlan": [
        {
          "week": 1,
          "theme": "Weekly theme",
          "contentTypes": ["Types to focus on"],
          "keyMessages": ["Key messages to convey"],
          "metrics": ["Metrics to track"]
        }
        // Generate 4 weeks
      ],
      "personalizationInsights": {
        "uniqueAngles": ["Unique content angles for this brand"],
        "competitiveDifferentiators": ["How to stand out from competitors"],
        "audienceConnectionPoints": ["Ways to connect with target audience"],
        "brandPersonalityTips": ["Tips for expressing brand personality"]
      },
      "growthProjections": {
        "timeframe": "${input.timeframe}",
        "expectedGrowth": {
          "followers": "Projected follower growth percentage",
          "engagement": "Projected engagement growth percentage",
          "reach": "Projected reach growth percentage"
        },
        "milestones": ["Key milestones to track"],
        "successMetrics": ["KPIs to monitor"]
      }
    }

    Focus on:
    1. Highly personalized recommendations based on the specific brand profile
    2. Actionable, implementable suggestions
    3. Platform-specific optimization
    4. Audience-centric content ideas
    5. Competitive differentiation strategies
    6. Measurable growth projections
    7. Trend awareness and relevance
    8. Brand voice consistency
    `;
  }

  private formatPersonaSuggestions(result: any, input: PersonaInput): PersonaSuggestions {
    // Ensure we have proper data structure
    const suggestions: PersonaSuggestions = {
      personaAnalysis: {
        profileSummary: result.personaAnalysis?.profileSummary || `Comprehensive analysis for ${input.industry} brand targeting ${input.audience}`,
        strengthsIdentified: result.personaAnalysis?.strengthsIdentified || [
          `Strong ${input.brandTone} brand voice`,
          `Clear understanding of ${input.audience}`,
          `Diverse content across ${input.platforms.join(', ')}`,
          "Authentic brand messaging",
          "Consistent visual identity"
        ],
        growthOpportunities: result.personaAnalysis?.growthOpportunities || [
          "Increased video content production",
          "Enhanced audience engagement",
          "Cross-platform content optimization",
          "Influencer collaboration expansion",
          "Community building initiatives"
        ],
        recommendedVoice: result.personaAnalysis?.recommendedVoice || `Maintain ${input.brandTone} tone while focusing on authentic storytelling`,
        targetAudienceInsights: result.personaAnalysis?.targetAudienceInsights || [
          `${input.audience} prefers authentic content`,
          "Values transparency and honesty",
          "Engages most with visual storytelling",
          "Responds well to interactive content",
          "Appreciates behind-the-scenes content",
          "Influenced by social proof and testimonials"
        ]
      },
      contentSuggestions: this.formatContentSuggestions(result.contentSuggestions, input),
      strategicRecommendations: {
        postingSchedule: result.strategicRecommendations?.postingSchedule || this.generateDefaultPostingSchedule(input),
        engagementStrategy: result.strategicRecommendations?.engagementStrategy || [
          "Respond to comments within 2 hours",
          "Ask engaging questions in captions",
          "Use polls and interactive features",
          "Share user-generated content",
          "Host live Q&A sessions"
        ],
        hashtags: result.strategicRecommendations?.hashtags || {
          trending: ["#trending", "#viral", "#explore", "#fyp"],
          niche: [`#${input.industry.toLowerCase()}`, `#${input.audience.toLowerCase().replace(/\s+/g, '')}`, "#contentcreator"],
          branded: [`#${input.industry.toLowerCase()}life`, "#brandstory", "#authentic"]
        },
        collaborationOpportunities: result.strategicRecommendations?.collaborationOpportunities || [
          "Partner with micro-influencers in your niche",
          "Collaborate with complementary brands",
          "Guest appearances on industry podcasts",
          "Cross-promote with industry peers",
          "Participate in relevant online events"
        ]
      },
      monthlyContentPlan: result.monthlyContentPlan || this.generateDefaultMonthlyPlan(),
      personalizationInsights: {
        uniqueAngles: result.personalizationInsights?.uniqueAngles || [
          `Unique ${input.industry} perspective`,
          "Personal brand story integration",
          "Behind-the-scenes authenticity",
          "Customer success storytelling"
        ],
        competitiveDifferentiators: result.personalizationInsights?.competitiveDifferentiators || [
          "Authentic storytelling approach",
          "Community-first mindset",
          "Transparent communication",
          "Value-driven content"
        ],
        audienceConnectionPoints: result.personalizationInsights?.audienceConnectionPoints || [
          "Shared values and beliefs",
          "Common challenges and solutions",
          "Aspirational lifestyle content",
          "Educational and informative posts"
        ],
        brandPersonalityTips: result.personalizationInsights?.brandPersonalityTips || [
          `Maintain consistent ${input.brandTone} voice`,
          "Show personality in captions",
          "Use brand-specific language",
          "Stay true to core values"
        ]
      },
      growthProjections: {
        timeframe: input.timeframe,
        expectedGrowth: result.growthProjections?.expectedGrowth || {
          followers: 25,
          engagement: 35,
          reach: 40
        },
        milestones: result.growthProjections?.milestones || [
          "1000 new followers",
          "5% engagement rate increase",
          "50% reach growth",
          "3 viral content pieces"
        ],
        successMetrics: result.growthProjections?.successMetrics || [
          "Follower growth rate",
          "Engagement rate",
          "Reach and impressions",
          "Save and share rates",
          "Website traffic from social"
        ]
      }
    };

    return suggestions;
  }

  private formatContentSuggestions(suggestions: any[], input: PersonaInput): ContentSuggestion[] {
    if (!suggestions || !Array.isArray(suggestions)) {
      return this.generateDefaultSuggestions(input);
    }

    return suggestions.slice(0, 10).map((suggestion, index) => ({
      id: suggestion.id || `suggestion_${index + 1}`,
      title: suggestion.title || `Content Idea ${index + 1}`,
      description: suggestion.description || "Engaging content suggestion tailored to your brand",
      platform: suggestion.platform || input.platforms[0] || "Instagram",
      contentType: suggestion.contentType || input.contentTypes[0] || "Post",
      estimatedReach: suggestion.estimatedReach || Math.floor(Math.random() * 5000) + 1000,
      engagementPotential: suggestion.engagementPotential || Math.floor(Math.random() * 30) + 70,
      difficulty: suggestion.difficulty || 'medium',
      timeToCreate: suggestion.timeToCreate || "2-3 hours",
      keywords: suggestion.keywords || [`${input.industry}`, `${input.audience.split(' ')[0]}`],
      callToAction: suggestion.callToAction || "Share your thoughts in the comments!",
      personalizedReason: suggestion.personalizedReason || `Aligns with your ${input.brandTone} brand voice and ${input.audience} audience`,
      trendRelevance: suggestion.trendRelevance || Math.floor(Math.random() * 30) + 70
    }));
  }

  private generateDefaultSuggestions(input: PersonaInput): ContentSuggestion[] {
    const suggestions = [
      {
        title: "Behind-the-Scenes Story",
        description: "Share your daily process and what goes into creating your content",
        contentType: "Story",
        personalizedReason: `Perfect for building authentic connections with ${input.audience}`
      },
      {
        title: "Educational Tutorial",
        description: "Create a step-by-step guide related to your industry expertise",
        contentType: "Video",
        personalizedReason: `Establishes authority in ${input.industry} space`
      },
      {
        title: "User-Generated Content Feature",
        description: "Showcase your customers or community members",
        contentType: "Post",
        personalizedReason: "Builds trust and social proof for your brand"
      },
      {
        title: "Trending Topic Commentary",
        description: "Share your unique perspective on current industry trends",
        contentType: "Post",
        personalizedReason: `Positions you as a thought leader in ${input.industry}`
      },
      {
        title: "Interactive Poll or Quiz",
        description: "Engage your audience with questions relevant to their interests",
        contentType: "Story",
        personalizedReason: "Increases engagement and provides audience insights"
      }
    ];

    return suggestions.map((suggestion, index) => ({
      id: `default_${index + 1}`,
      title: suggestion.title,
      description: suggestion.description,
      platform: input.platforms[0] || "Instagram",
      contentType: suggestion.contentType,
      estimatedReach: Math.floor(Math.random() * 3000) + 1000,
      engagementPotential: Math.floor(Math.random() * 25) + 75,
      difficulty: 'medium' as const,
      timeToCreate: "1-2 hours",
      keywords: [`${input.industry.toLowerCase()}`, "engagement", "content"],
      callToAction: "Let me know what you think!",
      personalizedReason: suggestion.personalizedReason,
      trendRelevance: Math.floor(Math.random() * 20) + 80
    }));
  }

  private generateDefaultPostingSchedule(input: PersonaInput) {
    return input.platforms.map(platform => ({
      platform,
      frequency: "Daily",
      bestTimes: ["9:00 AM", "12:00 PM", "6:00 PM"],
      contentMix: {
        "Educational": 40,
        "Behind-the-scenes": 20,
        "Promotional": 20,
        "Entertainment": 20
      }
    }));
  }

  private generateDefaultMonthlyPlan() {
    return [
      {
        week: 1,
        theme: "Introduction & Brand Story",
        contentTypes: ["Posts", "Stories"],
        keyMessages: ["Brand values", "Mission", "Authenticity"],
        metrics: ["Follower growth", "Engagement rate"]
      },
      {
        week: 2,
        theme: "Educational & Value-Driven",
        contentTypes: ["Tutorials", "Tips"],
        keyMessages: ["Expertise", "Helpful content", "Problem-solving"],
        metrics: ["Saves", "Shares", "Comments"]
      },
      {
        week: 3,
        theme: "Community & Engagement",
        contentTypes: ["User-generated content", "Interactive posts"],
        keyMessages: ["Community appreciation", "Social proof", "Connection"],
        metrics: ["Comments", "User-generated content", "Mentions"]
      },
      {
        week: 4,
        theme: "Growth & Forward Looking",
        contentTypes: ["Behind-the-scenes", "Future plans"],
        keyMessages: ["Transparency", "Growth journey", "Future vision"],
        metrics: ["Reach", "Profile visits", "Website clicks"]
      }
    ];
  }
}

export const personaSuggestionsAI = new PersonaSuggestionsAI();