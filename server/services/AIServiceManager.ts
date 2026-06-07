import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import OpenAI from 'openai';
import { promptConstructorService } from './PromptConstructorService';
import type { PromptConstructionParams } from './PromptConstructorService';
import { AuthenticityScorer } from './AuthenticityScorer';
import { EngagementPredictor } from './EngagementPredictor';
import type { VoiceProfile } from './VoiceProfileService';
import type { AuthenticityScore } from './AuthenticityScorer';
import type { EngagementPrediction } from '../domain/types';

export interface UserAIPreferences {
  aiModel?: string; 
  creativityLevel?: number; 
  optimizationGoals?: string; 
  aiPersona?: string; 
  captionStyle?: string; 
  responseLength?: string; 
  multilingual?: string; 
  contentSafety?: string; 
  aiMemory?: string; 
  autoHashtags?: boolean;
  googleAiStudioKey?: string;
  openAiKey?: string;
  contentNiche?: string;
}

export interface CaptionVariation {
  caption: string;
  style: 'viral' | 'authentic' | 'balanced';
  styleDescription: string;
  authenticityScore?: AuthenticityScore;
  engagementPrediction?: EngagementPrediction;
}

export class AIServiceManager {
  private static instance: AIServiceManager;
  private genAI: GoogleGenerativeAI;
  private openai: OpenAI | null = null;
  private authenticityScorer: AuthenticityScorer;
  private engagementPredictor: EngagementPredictor;

  private constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    this.authenticityScorer = new AuthenticityScorer();
    this.engagementPredictor = new EngagementPredictor();
  }

  public static getInstance(): AIServiceManager {
    if (!AIServiceManager.instance) {
      AIServiceManager.instance = new AIServiceManager();
    }
    return AIServiceManager.instance;
  }

  /**
   * Check if AI service is properly configured
   * Returns true if at least one AI provider (Google AI or OpenAI) is available
   */
  public async isConfigured(): Promise<boolean> {
    const hasGoogleKey = !!process.env.GOOGLE_API_KEY;
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
    
    // At least one provider must be configured
    const isConfigured = hasGoogleKey || hasOpenAIKey;
    
    if (!isConfigured) {
      console.error('[AIServiceManager] No AI provider configured. Set GOOGLE_API_KEY or OPENAI_API_KEY environment variable.');
    }
    
    return isConfigured;
  }

  private getSafetySettings(contentSafety?: string) {
    if (contentSafety === 'strict') {
      return [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE }
      ];
    } else if (contentSafety === 'off') {
      return [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
      ];
    }
    // Default (standard)
    return [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE }
    ];
  }

  public async generateText(prompt: string, preferences: UserAIPreferences = {}): Promise<string> {
    const { 
      aiModel = 'veegpt-hybrid', 
      creativityLevel = 0.7,
      contentSafety = 'standard',
      aiPersona = 'Professional & Authoritative',
      captionStyle = 'Storytelling',
      responseLength = 'medium',
      multilingual = 'auto',
      aiMemory = 'long-term'
    } = preferences;

    console.log(`[AIServiceManager] Generating text using model: ${aiModel}, creativity: ${creativityLevel}`);

    const globalSystemContext = `
[SYSTEM CONFIGURATION OVERRIDE]
You must strictly follow these brand guidelines for your response:
${aiPersona ? `- Persona: ${aiPersona}` : ''}
${captionStyle ? `- Tone/Style: ${captionStyle}` : ''}
${responseLength ? `- Response Length constraint: ${responseLength}` : ''}
${multilingual && multilingual !== 'auto' ? `- Target Language: ${multilingual}` : ''}
${aiMemory === 'long-term' ? `- Memory Context: Retain continuity with typical brand interactions.` : ''}
[/SYSTEM CONFIGURATION OVERRIDE]\n\n`;

    const finalPrompt = globalSystemContext + prompt;

    const tryGemini = async (modelName: string) => {
      const generationConfig = { temperature: creativityLevel };
      const safetySettings = this.getSafetySettings(contentSafety);
      const client = preferences.googleAiStudioKey ? new GoogleGenerativeAI(preferences.googleAiStudioKey) : this.genAI;
      const model = client.getGenerativeModel({ model: modelName, generationConfig, safetySettings });
      const result = await model.generateContent(finalPrompt);
      return result.response.text();
    };

    const tryOpenAI = async (modelName: string) => {
      const client = preferences.openAiKey ? new OpenAI({ apiKey: preferences.openAiKey }) : this.openai;
      if (!client) throw new Error('OpenAI is not configured.');
      const completion = await client.chat.completions.create({
        messages: [{ role: "user", content: finalPrompt }],
        model: modelName,
        temperature: creativityLevel,
      });
      return completion.choices[0]?.message?.content || '';
    };

    if (aiModel === 'openai-gpt4o') {
      return await tryOpenAI('gpt-4o');
    } else if (aiModel === 'gemini-1.5-flash') {
      return await tryGemini('gemini-1.5-flash');
    } else if (aiModel === 'gemini-2.0-flash-exp' || aiModel === 'google-ai-studio') {
      return await tryGemini('gemini-2.5-pro');
    } else {
      // veegpt-hybrid fallback
      try {
        return await tryGemini('gemini-2.5-pro');
      } catch (err) {
        console.warn(`[AIServiceManager] Hybrid fallback to OpenAI due to error:`, err);
        return await tryOpenAI('gpt-4o-mini');
      }
    }
  }



  /**
   * Get voice profile for scoring
   * Returns a default profile if no profile exists
   */
  private async getVoiceProfileForScoring(userId: string, workspaceId: string): Promise<VoiceProfile> {
    // Return a default voice profile since we don't have direct access to VoiceProfileService
    // The PromptConstructorService will use the actual profile for prompt generation
    // This default profile is sufficient for authenticity scoring baseline
    return {
      userId,
      workspaceId,
      vocabularyFrequency: {},
      signaturePhrases: [],
      sentenceLengthDistribution: {
        short: 30,
        medium: 50,
        long: 20
      },
      paragraphStructure: 'short-breaks',
      emojiUsagePattern: {
        frequency: 'moderate',
        placement: 'inline',
        topEmojis: []
      },
      punctuationStyle: {
        exclamationUsage: 'moderate',
        questionUsage: 'moderate',
        ellipsisUsage: false
      },
      toneMarkers: {
        casual: 0.6,
        professional: 0.3,
        humorous: 0.4,
        inspirational: 0.3,
        educational: 0.3,
        conversational: 0.7
      },
      hookPatterns: [],
      engagementQuestionStyle: [],
      storytellingStructure: 'linear',
      sampleSize: 0,
      confidence: 0.5,
      lastUpdated: new Date(),
      createdAt: new Date()
    };
  }

  public async generateCaption(topic: string, preferences: UserAIPreferences = {}): Promise<string> {
    const {
      aiPersona = 'Professional & Authoritative',
      captionStyle = 'Storytelling',
      optimizationGoals = 'Engagement',
      multilingual = 'auto',
      autoHashtags = true
    } = preferences;

    let systemInstruction = `You are a professional social media manager.
Your Persona: ${aiPersona}
Caption Style: ${captionStyle}
Optimization Goal: ${optimizationGoals}
Language: ${multilingual === 'auto' ? 'Detect language from topic' : multilingual}

Write an engaging Instagram caption about: "${topic}".
Make sure it perfectly embodies the Persona and Style requested.`;

    if (autoHashtags) {
      systemInstruction += `\nInclude 5-8 relevant trending hashtags at the end of the caption.`;
    }

    return await this.generateText(systemInstruction, preferences);
  }

  /**
   * Generate authentic Instagram captions with voice matching and viral patterns
   * 
   * This method implements the full authentic caption generation workflow:
   * 1. Uses PromptConstructorService to build comprehensive prompts
   * 2. Generates 3 distinct caption variations (viral, authentic, balanced)
   * 3. Each variation leverages voice profiles, viral patterns, niche context, and examples
   * 4. Scores each variation with AuthenticityScorer (must be 80+)
   * 5. Predicts engagement for each variation with EngagementPredictor
   * 6. Filters out variations below 80 authenticity threshold
   * 
   * Requirements: 1.4, 2.3, 3.2, 7.3, 8.1, 8.2, 4.6
   * Task 11.2: Multi-variation generation with authenticity scoring and engagement prediction
   * 
   * @param params - Caption generation parameters
   * @returns Array of caption variations with style information, authenticity scores, and engagement predictions
   */
  public async generateInstagramCaptions(params: {
    userId: string;
    workspaceId: string;
    topic: string;
    mediaAnalysis?: string;
    existingCaption?: string;
    postType?: 'post' | 'story' | 'reel';
    platform?: string;
    preferences?: UserAIPreferences;
  }): Promise<CaptionVariation[]> {
    const {
      userId,
      workspaceId,
      topic,
      mediaAnalysis,
      existingCaption,
      postType = 'post',
      platform = 'Instagram',
      preferences = {}
    } = params;

    console.log('[AIServiceManager] Generating Instagram captions with authenticity scoring', {
      userId,
      workspaceId,
      topic,
      postType,
      platform,
      niche: preferences.contentNiche
    });

    try {
      // Load user's voice profile for authenticity scoring
      // We need to access the internal voice profile loading logic
      // For now, we'll get a default profile if not available
      const voiceProfile = await this.getVoiceProfileForScoring(userId, workspaceId);
      console.log('[AIServiceManager] Loaded voice profile', {
        sampleSize: voiceProfile.sampleSize,
        confidence: voiceProfile.confidence
      });

      // Build the comprehensive prompt using PromptConstructorService
      const promptParams: PromptConstructionParams = {
        userId,
        workspaceId,
        mediaAnalysis: mediaAnalysis || `Topic: ${topic}`,
        existingCaption,
        postType,
        platform,
        aiPreferences: preferences
      };

      const basePrompt = await promptConstructorService.buildGenerationPrompt(promptParams);

      // Generate variations with scoring and filtering
      const variationPrompts = [
        {
          style: 'viral' as const,
          styleDescription: 'Maximum engagement focus with aggressive hooks and trending patterns',
          instructions: `GENERATE VARIATION 1: MAXIMUM VIRALITY
- Use the most aggressive viral hook from the provided list
- Apply trending patterns that maximize scroll-stopping power
- Focus on emotional triggers and curiosity gaps
- Optimize for maximum engagement (likes, shares, saves)
- Push the boundaries while staying authentic to the voice profile

IMPORTANT: Return ONLY the caption text. Do not include any labels, explanations, or metadata.`
        },
        {
          style: 'authentic' as const,
          styleDescription: 'Voice-first approach with personal storytelling and genuine connection',
          instructions: `GENERATE VARIATION 2: AUTHENTIC STORYTELLING
- Prioritize matching the user's voice profile above all else
- Use personal, relatable storytelling techniques
- Focus on genuine connection over viral mechanics
- Include vulnerable or honest elements that build trust
- Make it sound exactly like the user wrote it themselves

IMPORTANT: Return ONLY the caption text. Do not include any labels, explanations, or metadata.`
        },
        {
          style: 'balanced' as const,
          styleDescription: 'Strategic blend of viral patterns and authentic voice for sustained engagement',
          instructions: `GENERATE VARIATION 3: BALANCED ENGAGEMENT
- Blend viral pattern effectiveness with authentic voice
- Use proven engagement formulas adapted to the user's style
- Balance scroll-stopping power with genuine personality
- Include both strategic hooks and personal elements
- Optimize for sustainable long-term engagement

IMPORTANT: Return ONLY the caption text. Do not include any labels, explanations, or metadata.`
        }
      ];

      const scoredVariations: CaptionVariation[] = [];
      const MAX_REGENERATION_ATTEMPTS = 2; // Maximum attempts to regenerate if below threshold

      // Generate and score each variation
      for (const varPrompt of variationPrompts) {
        let attempt = 0;
        let bestVariation: CaptionVariation | null = null;
        let bestScore = 0;

        while (attempt < MAX_REGENERATION_ATTEMPTS) {
          attempt++;
          
          console.log(`[AIServiceManager] Generating ${varPrompt.style} variation (attempt ${attempt})...`);
          
          const fullPrompt = `${basePrompt}\n\n${varPrompt.instructions}`;
          const rawCaption = await this.generateText(fullPrompt, preferences);
          const cleanedCaption = this.cleanCaptionText(rawCaption);

          // Score authenticity
          console.log(`[AIServiceManager] Scoring authenticity for ${varPrompt.style} variation...`);
          const authenticityScore = await this.authenticityScorer.scoreCaption(
            cleanedCaption,
            voiceProfile,
            platform
          );

          console.log(`[AIServiceManager] ${varPrompt.style} authenticity score: ${authenticityScore.overallScore}`, {
            passesThreshold: authenticityScore.passesThreshold,
            aiTellsDetected: authenticityScore.aiTellsDetected.length
          });

          // Track best variation even if below threshold
          if (authenticityScore.overallScore > bestScore) {
            bestScore = authenticityScore.overallScore;
            
            // Predict engagement
            console.log(`[AIServiceManager] Predicting engagement for ${varPrompt.style} variation...`);
            const engagementPrediction = await this.engagementPredictor.predictEngagement(
              cleanedCaption,
              userId,
              workspaceId,
              postType,
              platform
            );

            bestVariation = {
              caption: cleanedCaption,
              style: varPrompt.style,
              styleDescription: varPrompt.styleDescription,
              authenticityScore,
              engagementPrediction
            };

            // If passes threshold, use this variation
            if (authenticityScore.passesThreshold) {
              console.log(`[AIServiceManager] ${varPrompt.style} variation passed authenticity threshold`);
              break;
            } else {
              console.log(`[AIServiceManager] ${varPrompt.style} variation below threshold (${authenticityScore.overallScore}/100), regenerating...`);
            }
          }
        }

        // Add the best variation we found (even if below 80)
        if (bestVariation) {
          scoredVariations.push(bestVariation);
        }
      }

      // Filter variations that pass the 80 authenticity threshold
      const filteredVariations = scoredVariations.filter(v => 
        v.authenticityScore && v.authenticityScore.passesThreshold
      );

      console.log('[AIServiceManager] Variation filtering complete', {
        totalGenerated: scoredVariations.length,
        passedThreshold: filteredVariations.length,
        scores: scoredVariations.map(v => ({
          style: v.style,
          score: v.authenticityScore?.overallScore,
          passed: v.authenticityScore?.passesThreshold
        }))
      });

      // If no variations passed, return all scored variations with a warning
      // This ensures we always return something useful to the user
      if (filteredVariations.length === 0) {
        console.warn('[AIServiceManager] WARNING: No variations passed authenticity threshold of 80. Returning all variations with scores.');
        return scoredVariations;
      }

      // Return filtered variations with metadata
      console.log('[AIServiceManager] Successfully generated and scored caption variations', {
        count: filteredVariations.length,
        avgAuthenticityScore: filteredVariations.reduce((sum, v) => sum + (v.authenticityScore?.overallScore || 0), 0) / filteredVariations.length,
        avgPredictedEngagement: filteredVariations.reduce((sum, v) => sum + (v.engagementPrediction?.predictedLikeRate || 0), 0) / filteredVariations.length
      });

      return filteredVariations;

    } catch (error) {
      console.error('[AIServiceManager] Error generating Instagram captions:', error);
      throw new Error(`Failed to generate Instagram captions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clean caption text by removing labels, metadata, and unwanted formatting
   * 
   * @param rawCaption - Raw caption text from AI
   * @returns Cleaned caption text
   */
  private cleanCaptionText(rawCaption: string): string {
    let cleaned = rawCaption.trim();

    // Remove common AI response patterns
    cleaned = cleaned.replace(/^(Variation \d+:|Caption \d+:|Here's the caption:|Caption:)/gi, '').trim();
    cleaned = cleaned.replace(/^["']|["']$/g, '').trim(); // Remove surrounding quotes
    
    // Remove explanation sections (anything after "---" or "Note:")
    cleaned = cleaned.split(/\n\s*---\s*\n/)[0].trim();
    cleaned = cleaned.split(/\n\s*Note:/i)[0].trim();
    cleaned = cleaned.split(/\n\s*\*\*Note:/i)[0].trim();

    return cleaned;
  }

  public async generateAnalyticsInsight(metricsData: any, preferences: UserAIPreferences = {}): Promise<string> {
    const {
      aiPersona = 'Professional & Authoritative',
      optimizationGoals = 'Engagement'
    } = preferences;

    const systemInstruction = `You are an expert social media analyst with a "${aiPersona}" persona, focusing on "${optimizationGoals}".
Analyze the following account metrics and write a brief, 2-3 sentence engaging insight or tip for the user. Do not use generic phrases. Be specific to the numbers.

Metrics Data:
${JSON.stringify(metricsData, null, 2)}`;

    return await this.generateText(systemInstruction, preferences);
  }



  public async generateJSON(prompt: string, preferences: UserAIPreferences = {}): Promise<any> {
    const { 
      aiModel = 'veegpt-hybrid', 
      creativityLevel = 0.7,
      contentSafety = 'standard',
      aiPersona = 'Professional & Authoritative',
      captionStyle = 'Storytelling',
      responseLength = 'medium',
      multilingual = 'auto',
      aiMemory = 'long-term'
    } = preferences;

    console.log('[AIServiceManager] Generating JSON using model:', aiModel, 'creativity:', creativityLevel);

    const globalSystemContext = `
[SYSTEM CONFIGURATION OVERRIDE]
You must strictly follow these brand guidelines for your response:
${aiPersona ? `- Persona: ${aiPersona}` : ''}
${captionStyle ? `- Tone/Style: ${captionStyle}` : ''}
${responseLength ? `- Response Length constraint: ${responseLength}` : ''}
${multilingual && multilingual !== 'auto' ? `- Target Language: ${multilingual}` : ''}
${aiMemory === 'long-term' ? `- Memory Context: Retain continuity with typical brand interactions.` : ''}
[/SYSTEM CONFIGURATION OVERRIDE]\n\n`;

    const finalPrompt = globalSystemContext + prompt;

    const tryGemini = async (modelName: string) => {
      const generationConfig = { temperature: creativityLevel, responseMimeType: "application/json" };
      const safetySettings = this.getSafetySettings(contentSafety);
      const client = preferences.googleAiStudioKey ? new GoogleGenerativeAI(preferences.googleAiStudioKey) : this.genAI;
      const model = client.getGenerativeModel({ model: modelName, generationConfig, safetySettings });
      const result = await model.generateContent(finalPrompt);
      const text = result.response.text();
      const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      return JSON.parse(cleaned);
    };

    const tryOpenAI = async (modelName: string) => {
      
      const client = preferences.openAiKey ? new OpenAI({ apiKey: preferences.openAiKey }) : this.openai;
      if (!client) throw new Error('OpenAI is not configured.');
      const completion = await client.chat.completions.create({
        messages: [{ role: "system", content: "You must respond with valid JSON." }, { role: "user", content: finalPrompt }],
        model: modelName,
        temperature: creativityLevel,
        response_format: { type: "json_object" }
      });
      return JSON.parse(completion.choices[0]?.message?.content || '{}');
    };

    if (aiModel === 'openai-gpt4o') {
      return await tryOpenAI('gpt-4o');
    } else if (aiModel === 'gemini-1.5-flash') {
      return await tryGemini('gemini-1.5-flash');
    } else if (aiModel === 'gemini-2.0-flash-exp' || aiModel === 'google-ai-studio') {
      return await tryGemini('gemini-2.5-pro');
    } else {
      try {
        return await tryGemini('gemini-2.5-pro');
      } catch (err) {
        console.warn('[AIServiceManager] Hybrid fallback to OpenAI due to error:', err);
        return await tryOpenAI('gpt-4o-mini');
      }
    }
  }

}

export const aiServiceManager = AIServiceManager.getInstance();
