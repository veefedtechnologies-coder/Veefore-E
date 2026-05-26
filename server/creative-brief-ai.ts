import OpenAI from "openai";
import type { InsertCreativeBrief } from "@shared/schema";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface CreativeBriefInput {
  title: string;
  targetAudience: string;
  platforms: string[];
  campaignGoals: string[];
  tone: string;
  style: string;
  industry: string;
  deadline?: string;
  budget?: number;
  additionalRequirements?: string;
}

export interface GeneratedBrief {
  briefContent: string;
  keyMessages: string[];
  contentFormats: string[];
  hashtags: string[];
  references: string[];
  insights: string;
  timeline: {
    phase: string;
    duration: string;
    deliverables: string[];
  }[];
}

export class CreativeBriefAI {
  async generateBrief(input: CreativeBriefInput): Promise<GeneratedBrief> {
    console.log('[CREATIVE BRIEF AI] Generating brief for:', input.title);

    try {
      const briefPrompt = this.buildBriefPrompt(input);
      
      // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert creative strategist and content planning specialist. Generate comprehensive, actionable creative briefs that drive results. Always output valid JSON with the specified structure.`
          },
          {
            role: "user",
            content: briefPrompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 2000
      });

      const generated = JSON.parse(response.choices[0].message.content || '{}');
      
      console.log('[CREATIVE BRIEF AI] Successfully generated brief with', generated.keyMessages?.length || 0, 'key messages');
      
      return {
        briefContent: generated.briefContent || '',
        keyMessages: generated.keyMessages || [],
        contentFormats: generated.contentFormats || [],
        hashtags: generated.hashtags || [],
        references: generated.references || [],
        insights: generated.insights || '',
        timeline: generated.timeline || []
      };

    } catch (error) {
      console.error('[CREATIVE BRIEF AI] Generation failed:', error);
      throw new Error('Failed to generate creative brief');
    }
  }

  private buildBriefPrompt(input: CreativeBriefInput): string {
    return `
Generate a comprehensive creative brief in JSON format for the following campaign:

CAMPAIGN DETAILS:
- Title: ${input.title}
- Target Audience: ${input.targetAudience}
- Platforms: ${input.platforms.join(', ')}
- Goals: ${input.campaignGoals.join(', ')}
- Tone: ${input.tone}
- Style: ${input.style}
- Industry: ${input.industry}
${input.deadline ? `- Deadline: ${input.deadline}` : ''}
${input.budget ? `- Budget: $${input.budget}` : ''}
${input.additionalRequirements ? `- Additional Requirements: ${input.additionalRequirements}` : ''}

Generate a JSON response with this exact structure:
{
  "briefContent": "A comprehensive 3-4 paragraph brief covering objectives, target audience, key messaging, deliverables, and success metrics",
  "keyMessages": ["Primary message 1", "Supporting message 2", "Call to action message"],
  "contentFormats": ["post", "reel", "story", "video", "carousel"],
  "hashtags": ["#relevant", "#hashtags", "#for", "#campaign"],
  "references": ["URL or description of inspiration 1", "Competitor example to study"],
  "insights": "Strategic insights about the target audience, optimal posting times, and platform-specific recommendations",
  "timeline": [
    {
      "phase": "Planning & Research",
      "duration": "Week 1",
      "deliverables": ["Audience research", "Competitor analysis", "Content calendar"]
    },
    {
      "phase": "Content Creation", 
      "duration": "Week 2-3",
      "deliverables": ["Visual assets", "Copy variations", "Video content"]
    },
    {
      "phase": "Campaign Launch",
      "duration": "Week 4",
      "deliverables": ["Publishing schedule", "Engagement monitoring", "Performance tracking"]
    }
  ]
}

Make the brief specific to the ${input.industry} industry and optimized for ${input.platforms.join(' and ')} platforms.
Focus on ${input.campaignGoals.join(' and ')} goals with a ${input.tone} tone.
`;
  }

  async generatePersonalizedBrief(
    input: CreativeBriefInput, 
    userPersona?: {
      refinedNiche: string;
      contentPillars: string[];
      toneProfile: any;
      platformPreferences: any;
    }
  ): Promise<GeneratedBrief> {
    console.log('[CREATIVE BRIEF AI] Generating personalized brief for niche:', userPersona?.refinedNiche);

    const personalizedInput = {
      ...input,
      // Override with persona data if available
      tone: userPersona?.toneProfile?.primary || input.tone,
      platforms: userPersona?.platformPreferences?.primary || input.platforms,
      additionalRequirements: `${input.additionalRequirements || ''} 
        Niche Focus: ${userPersona?.refinedNiche || 'General'}
        Content Pillars: ${userPersona?.contentPillars?.join(', ') || 'Not specified'}`
    };

    return this.generateBrief(personalizedInput);
  }

  async generateMultiLanguageBrief(
    input: CreativeBriefInput,
    targetLanguages: string[] = ['en']
  ): Promise<{ [language: string]: GeneratedBrief }> {
    console.log('[CREATIVE BRIEF AI] Generating multi-language brief for:', targetLanguages);

    const results: { [language: string]: GeneratedBrief } = {};

    for (const language of targetLanguages) {
      const localizedInput = {
        ...input,
        additionalRequirements: `${input.additionalRequirements || ''} 
          Generate all content in ${language} language with cultural adaptations for that market.`
      };

      results[language] = await this.generateBrief(localizedInput);
    }

    return results;
  }

  async enhanceBriefWithTrends(
    brief: GeneratedBrief,
    currentTrends: string[]
  ): Promise<GeneratedBrief> {
    console.log('[CREATIVE BRIEF AI] Enhancing brief with trends:', currentTrends);

    try {
      const enhancementPrompt = `
Enhance this creative brief by incorporating current trends: ${currentTrends.join(', ')}

Current Brief: ${brief.briefContent}
Current Hashtags: ${brief.hashtags.join(', ')}

Return JSON with:
{
  "enhancedBrief": "Updated brief content incorporating trends",
  "trendHashtags": ["#trending", "#hashtags"],
  "trendOpportunities": ["Specific ways to leverage trend 1", "How to use trend 2"],
  "timingSuggestions": "When to post to maximize trend visibility"
}
`;

      // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a trend analysis expert. Enhance creative briefs with current trends while maintaining brand authenticity."
          },
          {
            role: "user",
            content: enhancementPrompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.6
      });

      const enhancement = JSON.parse(response.choices[0].message.content || '{}');

      return {
        ...brief,
        briefContent: enhancement.enhancedBrief || brief.briefContent,
        hashtags: [...brief.hashtags, ...(enhancement.trendHashtags || [])],
        insights: `${brief.insights}\n\nTrend Analysis: ${enhancement.timingSuggestions || ''}\n\nTrend Opportunities:\n${enhancement.trendOpportunities?.join('\n- ') || ''}`
      };

    } catch (error) {
      console.error('[CREATIVE BRIEF AI] Trend enhancement failed:', error);
      return brief; // Return original brief if enhancement fails
    }
  }
}

export const creativeBriefAI = new CreativeBriefAI();