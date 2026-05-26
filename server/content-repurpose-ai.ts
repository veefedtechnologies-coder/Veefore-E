import OpenAI from "openai";
import type { InsertContentRepurpose } from "@shared/schema";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface RepurposeInput {
  sourceContent: string;
  sourceLanguage: string;
  targetLanguage: string;
  contentType: 'caption' | 'hashtags' | 'script' | 'title' | 'description';
  platform: string;
  tone?: string;
  targetAudience?: string;
  culturalContext?: string;
}

export interface RepurposedContent {
  repurposedContent: string;
  culturalAdaptations: string[];
  toneAdjustments: any;
  qualityScore: number;
  alternativeVersions: string[];
  localizationNotes: string;
}

// Language and cultural context mappings
const LANGUAGE_CONTEXTS = {
  'es': {
    name: 'Spanish',
    cultural_notes: 'Use formal "usted" for business, informal "tú" for casual content. Include regional variations for Mexico, Spain, Argentina.',
    social_norms: 'Family-oriented culture, respect for hierarchy, religious considerations'
  },
  'fr': {
    name: 'French',
    cultural_notes: 'Formal vs informal "vous/tu" distinction important. French prefer sophisticated language.',
    social_norms: 'Appreciation for art, fashion, and cuisine. Avoid overly direct sales approaches'
  },
  'hi': {
    name: 'Hindi',
    cultural_notes: 'Use respectful language with "aap" for formal contexts. Include English words naturally.',
    social_norms: 'Strong family values, festivals are important, tech-savvy youth audience'
  },
  'ja': {
    name: 'Japanese',
    cultural_notes: 'Keigo (honorific language) for business, casual for youth content. Emoji usage is different.',
    social_norms: 'Respect, minimalism, seasonal awareness, work-life balance discussions'
  },
  'ar': {
    name: 'Arabic',
    cultural_notes: 'Right-to-left reading, formal classical vs dialectical Arabic considerations.',
    social_norms: 'Islamic cultural considerations, family-centered, hospitality important'
  },
  'de': {
    name: 'German',
    cultural_notes: 'Formal "Sie" vs informal "du". Germans prefer direct, factual communication.',
    social_norms: 'Punctuality, efficiency, environmental consciousness, quality over quantity'
  },
  'pt': {
    name: 'Portuguese',
    cultural_notes: 'Brazilian vs European Portuguese differences. Friendly, warm communication style.',
    social_norms: 'Social, music-loving culture, football references work well, beach lifestyle'
  },
  'ko': {
    name: 'Korean',
    cultural_notes: 'Formal vs informal speech levels critical. Age and social hierarchy matter.',
    social_norms: 'Beauty standards, K-pop culture, technology adoption, respect for elders'
  }
};

export class ContentRepurposeAI {
  async repurposeContent(input: RepurposeInput): Promise<RepurposedContent> {
    console.log(`[CONTENT REPURPOSE AI] Translating ${input.contentType} from ${input.sourceLanguage} to ${input.targetLanguage}`);

    try {
      const culturalContext = LANGUAGE_CONTEXTS[input.targetLanguage as keyof typeof LANGUAGE_CONTEXTS];
      const repurposePrompt = this.buildRepurposePrompt(input, culturalContext);
      
      // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert multilingual content strategist and cultural adaptation specialist. You understand how to adapt content across cultures while maintaining authenticity and effectiveness. Always output valid JSON.`
          },
          {
            role: "user",
            content: repurposePrompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3, // Lower temperature for more consistent translations
        max_tokens: 1500
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      console.log(`[CONTENT REPURPOSE AI] Successfully repurposed content with quality score: ${result.qualityScore || 'N/A'}`);
      
      return {
        repurposedContent: result.repurposedContent || '',
        culturalAdaptations: result.culturalAdaptations || [],
        toneAdjustments: result.toneAdjustments || {},
        qualityScore: result.qualityScore || 0,
        alternativeVersions: result.alternativeVersions || [],
        localizationNotes: result.localizationNotes || ''
      };

    } catch (error) {
      console.error('[CONTENT REPURPOSE AI] Repurposing failed:', error);
      throw new Error('Failed to repurpose content');
    }
  }

  private buildRepurposePrompt(input: RepurposeInput, culturalContext: any): string {
    return `
Translate and culturally adapt the following ${input.contentType} content:

SOURCE CONTENT: "${input.sourceContent}"
SOURCE LANGUAGE: ${input.sourceLanguage}
TARGET LANGUAGE: ${input.targetLanguage}
PLATFORM: ${input.platform}
CONTENT TYPE: ${input.contentType}
${input.tone ? `DESIRED TONE: ${input.tone}` : ''}
${input.targetAudience ? `TARGET AUDIENCE: ${input.targetAudience}` : ''}

CULTURAL CONTEXT FOR ${culturalContext?.name || input.targetLanguage}:
- Language Notes: ${culturalContext?.cultural_notes || 'Standard translation'}
- Social Norms: ${culturalContext?.social_norms || 'General audience'}

PLATFORM-SPECIFIC REQUIREMENTS:
${this.getPlatformRequirements(input.platform, input.contentType)}

Return JSON with this exact structure:
{
  "repurposedContent": "The translated and culturally adapted content",
  "culturalAdaptations": [
    "Specific cultural change made (e.g., formal/informal language choice)",
    "Reference adaptation (e.g., local celebrity instead of US celebrity)",
    "Cultural sensitivity adjustment"
  ],
  "toneAdjustments": {
    "original_tone": "detected tone from source",
    "adapted_tone": "how tone was adjusted for target culture",
    "formality_level": "formal/informal/mixed",
    "emotional_intensity": "high/medium/low"
  },
  "qualityScore": 85,
  "alternativeVersions": [
    "Alternative translation option 1",
    "Alternative translation option 2"
  ],
  "localizationNotes": "Notes about localization decisions made and why"
}

IMPORTANT GUIDELINES:
1. Don't just translate - LOCALIZE for the culture
2. Adapt references, idioms, and cultural concepts
3. Consider platform norms in the target market
4. Maintain the original intent and call-to-action
5. Score based on cultural appropriateness (1-100)
6. Provide alternatives for A/B testing
`;
  }

  private getPlatformRequirements(platform: string, contentType: string): string {
    const requirements = {
      instagram: {
        caption: 'Instagram captions can be longer, use relevant hashtags, encourage engagement with questions',
        hashtags: 'Use 5-15 relevant hashtags, mix popular and niche tags, research local trending tags',
        script: 'Keep it snappy for Reels, hook in first 3 seconds, vertical video format'
      },
      youtube: {
        title: 'YouTube titles should be SEO-optimized, 60 characters max, include keywords',
        description: 'First 125 characters are crucial, include timestamps and links',
        script: 'Can be longer, educational content performs well, clear intro/outro'
      },
      tiktok: {
        caption: 'Short and punchy, use trending sounds/hashtags, challenge participation',
        hashtags: 'Use trending hashtags, participate in challenges, location tags',
        script: 'Hook within first second, vertical format, trending audio'
      },
      twitter: {
        caption: '280 character limit, use threads for longer content, encourage retweets',
        hashtags: 'Max 2-3 hashtags, research trending topics'
      },
      linkedin: {
        caption: 'Professional tone, industry insights, thought leadership angle',
        script: 'Educational and professional, industry-specific language'
      }
    };

    return requirements[platform as keyof typeof requirements]?.[contentType as keyof any] || 
           'Standard social media best practices apply';
  }

  async bulkRepurpose(
    sourceContent: string,
    sourceLanguage: string,
    targetLanguages: string[],
    contentType: 'caption' | 'hashtags' | 'script' | 'title' | 'description',
    platform: string
  ): Promise<{ [language: string]: RepurposedContent }> {
    console.log(`[CONTENT REPURPOSE AI] Bulk repurposing to ${targetLanguages.length} languages`);

    const results: { [language: string]: RepurposedContent } = {};

    // Process languages in parallel for efficiency
    const repurposePromises = targetLanguages.map(async (targetLanguage) => {
      const input: RepurposeInput = {
        sourceContent,
        sourceLanguage,
        targetLanguage,
        contentType,
        platform
      };
      
      try {
        const result = await this.repurposeContent(input);
        return { language: targetLanguage, result };
      } catch (error) {
        console.error(`[CONTENT REPURPOSE AI] Failed to repurpose to ${targetLanguage}:`, error);
        return { language: targetLanguage, result: null };
      }
    });

    const completed = await Promise.all(repurposePromises);
    
    completed.forEach(({ language, result }) => {
      if (result) {
        results[language] = result;
      }
    });

    console.log(`[CONTENT REPURPOSE AI] Bulk repurpose completed: ${Object.keys(results).length}/${targetLanguages.length} successful`);
    return results;
  }

  async optimizeForPlatform(
    content: string,
    language: string,
    sourcePlatform: string,
    targetPlatform: string
  ): Promise<RepurposedContent> {
    console.log(`[CONTENT REPURPOSE AI] Optimizing content from ${sourcePlatform} to ${targetPlatform}`);

    const input: RepurposeInput = {
      sourceContent: content,
      sourceLanguage: language,
      targetLanguage: language, // Same language, different platform
      contentType: 'caption',
      platform: targetPlatform
    };

    const platformOptimizationPrompt = `
Adapt this content from ${sourcePlatform} to ${targetPlatform} while keeping the same language (${language}):

CONTENT: "${content}"

PLATFORM ADAPTATION REQUIREMENTS:
- From: ${sourcePlatform} format and style
- To: ${targetPlatform} format and style

${this.getPlatformRequirements(targetPlatform, 'caption')}

Focus on:
1. Platform-specific format requirements
2. Audience behavior differences
3. Optimal content length
4. Engagement mechanisms
5. Platform-specific features

Return the same JSON structure as translation, but focus on platform adaptation rather than language changes.
`;

    try {
      // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a social media platform specialist. Adapt content for optimal performance across different platforms."
          },
          {
            role: "user",
            content: platformOptimizationPrompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.4
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      return {
        repurposedContent: result.repurposedContent || content,
        culturalAdaptations: result.culturalAdaptations || [],
        toneAdjustments: result.toneAdjustments || {},
        qualityScore: result.qualityScore || 0,
        alternativeVersions: result.alternativeVersions || [],
        localizationNotes: result.localizationNotes || ''
      };

    } catch (error) {
      console.error('[CONTENT REPURPOSE AI] Platform optimization failed:', error);
      throw new Error('Failed to optimize content for platform');
    }
  }

  async detectLanguage(content: string): Promise<string> {
    try {
      // Simple language detection using OpenAI
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a language detection expert. Return only the ISO 639-1 language code (e.g., 'en', 'es', 'fr') for the given text."
          },
          {
            role: "user",
            content: `Detect the language of this text: "${content}"`
          }
        ],
        max_tokens: 10,
        temperature: 0
      });

      return response.choices[0].message.content?.trim().toLowerCase() || 'en';
    } catch (error) {
      console.error('[CONTENT REPURPOSE AI] Language detection failed:', error);
      return 'en'; // Default to English
    }
  }
}

export const contentRepurposeAI = new ContentRepurposeAI();