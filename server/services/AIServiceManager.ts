import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import OpenAI from 'openai';

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
}

export class AIServiceManager {
  private static instance: AIServiceManager;
  private genAI: GoogleGenerativeAI;
  private openai: OpenAI | null = null;

  private constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
  }

  public static getInstance(): AIServiceManager {
    if (!AIServiceManager.instance) {
      AIServiceManager.instance = new AIServiceManager();
    }
    return AIServiceManager.instance;
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
