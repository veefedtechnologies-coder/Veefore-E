import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import OpenAI from 'openai';
import { promptConstructorService } from './PromptConstructorService';
import type { PromptConstructionParams } from './PromptConstructorService';
import { CapabilityGuard } from '../../src/shared/platform-registry/index';
import type { PlatformId } from '../../src/shared/platform-registry/types';
import { AuthenticityScorer } from './AuthenticityScorer';
import { EngagementPredictor } from './EngagementPredictor';
import { contentSafetyService } from './ContentSafetyService';
import type { VoiceProfile } from './VoiceProfileService';
import type { AuthenticityScore } from './AuthenticityScorer';
import type { EngagementPrediction } from '../domain/types';
import type { ContentSafetyResult } from './ContentSafetyService';
import { recordAIUsage, fromOpenAIUsage, fromGeminiUsage } from './aiUsageTracker';
import {
  accumulateToolCallDeltas,
  finalizeToolCalls,
  type StreamingToolCall,
  type ParsedToolCall,
} from './toolCallAccumulator';

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
  brandValues?: string[];
  prohibitedTopics?: string[];
  /**
   * Active platform context for AI insight generation.
   * When set, `generateText` and `generateTextStream` prepend a platform-aware
   * system prefix built by `PromptConstructorService.buildInsightPrompt()`.
   * - `'instagram'`: Instagram-only recommendations
   * - `'facebook'`: Facebook-only recommendations
   * - `'all'`: structured response with per-platform sections + cross-platform block
   * When omitted, behaviour is unchanged (backward-compatible).
   * Requirements: 8.1, 8.2, 8.3, 8.5, 8.6, 8.7
   */
  platformContext?: 'instagram' | 'facebook' | 'all';
  /**
   * Allow-list of capability keys (metric IDs or feature names) the AI may
   * reference.  Any recommendation that requires a capability outside this list
   * is omitted before sending to the model.
   * Requirements: 8.5
   */
  availableCapabilities?: string[];
}

/** A user-uploaded attachment (image or PDF) for multimodal analysis. */
export interface AIAttachment {
  /** MIME type, e.g. "image/png", "image/jpeg", "application/pdf". */
  mimeType: string;
  /** Base64-encoded file data (no data: prefix). */
  data: string;
  /** Original filename (for context/logging). */
  name?: string;
}

/** An OpenAI-style tool the chat model may call. */
export interface ChatTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema
  };
}

/**
 * Convert an OpenAI/JSON-Schema tool parameter object into a schema Gemini's
 * function calling accepts. Gemini rejects some JSON-Schema keywords
 * (`additionalProperties`) and does not accept union types expressed as a type
 * array (e.g. `type: ['string','null']`); it wants a single type string. We
 * recursively strip/normalize those so the same tool definitions work on both
 * OpenAI-compatible providers AND Gemini.
 */
function sanitizeSchemaForGemini(schema: any): any {
  if (Array.isArray(schema)) return schema.map(sanitizeSchemaForGemini);
  if (!schema || typeof schema !== 'object') return schema;
  const out: any = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'additionalProperties') continue; // unsupported by Gemini
    if (key === 'type' && Array.isArray(value)) {
      // Union type → pick the first non-null type (Gemini wants a single type).
      out.type = (value as string[]).find((t) => t !== 'null') || 'string';
      continue;
    }
    if (key === 'properties' && value && typeof value === 'object') {
      const props: any = {};
      for (const [pk, pv] of Object.entries(value as Record<string, unknown>)) props[pk] = sanitizeSchemaForGemini(pv);
      out.properties = props;
      continue;
    }
    if (key === 'items') { out.items = sanitizeSchemaForGemini(value); continue; }
    out[key] = value;
  }
  return out;
}

/** Structured event yielded by the tool-aware chat stream. */
export type ChatStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'toolCall'; name: string; args: Record<string, unknown>; id?: string };

export interface CaptionVariation {
  caption: string;
  style: 'viral' | 'authentic' | 'balanced';
  styleDescription: string;
  authenticityScore?: AuthenticityScore;
  engagementPrediction?: EngagementPrediction;
  safetyResult?: ContentSafetyResult;
}

export class AIServiceManager {
  private static instance: AIServiceManager;
  private genAI: GoogleGenerativeAI;
  private openai: OpenAI | null = null;
  private githubModels: OpenAI | null = null;
  private authenticityScorer: AuthenticityScorer;
  private engagementPredictor: EngagementPredictor;

  private constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    // GitHub Models: a free, OpenAI-compatible inference API. We reuse the
    // OpenAI SDK pointed at GitHub's endpoint and authenticate with GITHUB_TOKEN.
    // Model IDs use the {publisher}/{model} form, e.g. "openai/gpt-4o-mini".
    if (process.env.GITHUB_TOKEN) {
      this.githubModels = new OpenAI({
        apiKey: process.env.GITHUB_TOKEN,
        baseURL: 'https://models.github.ai/inference',
      });
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
    const hasGithubToken = !!process.env.GITHUB_TOKEN;
    
    // At least one provider must be configured
    const isConfigured = hasGoogleKey || hasOpenAIKey || hasGithubToken;
    
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
    // Default (standard) - Use BLOCK_ONLY_HIGH for more permissive caption generation
    // This prevents false positives while still blocking genuinely harmful content
    return [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH }
    ];
  }

  /**
   * Retry a Gemini call when it fails with a transient error (HTTP 503
   * "model is overloaded / high demand", or 500/UNAVAILABLE). These are
   * temporary capacity issues on Google's side — not quota or auth — so a short
   * exponential backoff usually succeeds. Non-transient errors (quota 429, auth,
   * safety) are re-thrown immediately so the caller can fall through to another
   * model.
   */
  /**
   * Map a settings model id to a GitHub Models model id ({publisher}/{model}).
   * Returns null if the id isn't a GitHub Models selection.
   */
  private resolveGithubModel(aiModel?: string): string | null {
    switch (aiModel) {
      case 'github-gpt-4o-mini': return 'openai/gpt-4o-mini';
      case 'github-gpt-4.1-mini': return 'openai/gpt-4.1-mini';
      default: return null;
    }
  }

  /** Detect quota/rate-limit errors (HTTP 429). All Gemini free-tier models
   * share the same per-project daily/per-minute quota, so once one returns 429
   * the rest will too — callers use this to skip straight to a different
   * provider (OpenAI) instead of failing through every Gemini model.
   */
  private isQuotaError(error: any): boolean {
    const msg = String(error?.message || error || '');
    return msg.includes('429') ||
      msg.includes('Too Many Requests') ||
      msg.includes('quota') ||
      msg.includes('Quota') ||
      msg.includes('RESOURCE_EXHAUSTED');
  }

  private async withTransientRetry<T>(fn: () => Promise<T>, label: string, attempts = 3): Promise<T> {    let lastErr: any;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (error: any) {
        const msg = String(error?.message || '');
        const isTransient = msg.includes('503') || msg.includes('500') ||
          msg.includes('overloaded') || msg.includes('high demand') || msg.includes('UNAVAILABLE');
        lastErr = error;
        if (!isTransient || i === attempts - 1) throw error;
        const delay = 800 * Math.pow(2, i); // 0.8s, 1.6s
        console.warn(`[AIServiceManager] ${label} transient error (attempt ${i + 1}/${attempts}), retrying in ${delay}ms: ${msg.slice(0, 80)}`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastErr;
  }

  public async generateText(prompt: string, preferences: UserAIPreferences = {}, signal?: AbortSignal): Promise<string> {
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

    console.log(`[AIServiceManager] Generating text using model: ${aiModel}, creativity: ${creativityLevel}, safety: ${contentSafety}`);

    // Build platform-aware insight prefix when platformContext is supplied.
    // CapabilityGuard ensures only supported capabilities are referenced.
    // Requirements: 8.5, 8.6
    const platformPrefix = preferences.platformContext
      ? promptConstructorService.buildInsightPrompt({
          platformContext: preferences.platformContext,
          availableCapabilities: preferences.availableCapabilities,
          // Remaining fields are not used by buildInsightPrompt but satisfy the interface
          userId: '',
          workspaceId: '',
          postType: 'post',
          platform: preferences.platformContext === 'all' ? 'instagram' : preferences.platformContext,
          aiPreferences: preferences,
        })
      : '';

    const globalSystemContext = `
[SYSTEM CONFIGURATION OVERRIDE]
You must strictly follow these brand guidelines for your response:
${aiPersona ? `- Persona: ${aiPersona}` : ''}
${captionStyle ? `- Tone/Style: ${captionStyle}` : ''}
${responseLength ? `- Response Length constraint: ${responseLength}` : ''}
${multilingual && multilingual !== 'auto' ? `- Target Language: ${multilingual}` : ''}
${aiMemory === 'long-term' ? `- Memory Context: Retain continuity with typical brand interactions.` : ''}
[/SYSTEM CONFIGURATION OVERRIDE]\n\n`;

    // Prepend platform prefix before the user's prompt so the model always sees
    // the platform restrictions first.
    const finalPrompt = globalSystemContext + (platformPrefix ? platformPrefix + '\n\n' : '') + prompt;

    const tryGemini = async (modelName: string) => {
      try {
        console.log(`[AIServiceManager] Calling Google AI (${modelName}) with safety: ${contentSafety}`);
        const generationConfig = { temperature: creativityLevel };
        const safetySettings = this.getSafetySettings(contentSafety);
        console.log(`[AIServiceManager] Safety settings:`, safetySettings.map(s => `${s.category}: ${s.threshold}`));
        
        signal?.throwIfAborted?.();
        const client = preferences.googleAiStudioKey ? new GoogleGenerativeAI(preferences.googleAiStudioKey) : this.genAI;
        const model = client.getGenerativeModel({ model: modelName, generationConfig, safetySettings });
        const result = await this.withTransientRetry(
          () => model.generateContent(finalPrompt, signal ? { signal } : undefined),
          `Text ${modelName}`,
        );
        const text = result.response.text();
        recordAIUsage({ provider: 'gemini', model: modelName, callType: 'text', usage: fromGeminiUsage((result.response as any)?.usageMetadata), promptText: finalPrompt, completionText: text });
        
        console.log(`[AIServiceManager] Google AI generated text successfully (${text.length} chars)`);
        return text;
      } catch (error: any) {
        console.error(`[AIServiceManager] Google AI generation failed:`, {
          model: modelName,
          error: error.message,
          errorType: error.constructor.name,
          isSafetyBlock: error.message?.includes('SAFETY'),
          fullError: error
        });
        throw error;
      }
    };

    const tryOpenAI = async (modelName: string) => {
      try {
        console.log(`[AIServiceManager] Calling OpenAI (${modelName})`);
        const client = preferences.openAiKey ? new OpenAI({ apiKey: preferences.openAiKey }) : this.openai;
        if (!client) throw new Error('OpenAI is not configured.');
        signal?.throwIfAborted?.();
        const completion = await client.chat.completions.create({
          messages: [{ role: "user", content: finalPrompt }],
          model: modelName,
          temperature: creativityLevel,
        }, signal ? { signal } : undefined);
        const text = completion.choices[0]?.message?.content || '';
        recordAIUsage({ provider: 'openai', model: modelName, callType: 'text', usage: fromOpenAIUsage((completion as any)?.usage), promptText: finalPrompt, completionText: text });
        console.log(`[AIServiceManager] OpenAI generated text successfully (${text.length} chars)`);
        return text;
      } catch (error: any) {
        console.error(`[AIServiceManager] OpenAI generation failed:`, {
          model: modelName,
          error: error.message,
          errorType: error.constructor.name
        });
        throw error;
      }
    };

    const tryGithubText = async (modelName: string) => {
      if (!this.githubModels) throw new Error('GitHub Models is not configured (GITHUB_TOKEN missing).');
      console.log(`[AIServiceManager] Calling GitHub Models (${modelName})`);
      signal?.throwIfAborted?.();
      const completion = await this.githubModels.chat.completions.create({
        messages: [{ role: "user", content: finalPrompt }],
        model: modelName,
        temperature: creativityLevel,
      }, signal ? { signal } : undefined);
      const ghText = completion.choices[0]?.message?.content || '';
      recordAIUsage({ provider: 'github', model: modelName, callType: 'text', usage: fromOpenAIUsage((completion as any)?.usage), promptText: finalPrompt, completionText: ghText });
      return ghText;
    };

    try {
      const githubModel = this.resolveGithubModel(aiModel);
      if (githubModel) {
        try {
          return await tryGithubText(githubModel);
        } catch (err) {
          // GitHub free tier rate-limits (429) under burst load. Fall back to
          // OpenAI, and if THAT also fails (e.g. quota exhausted), fall through
          // to Gemini flash-lite (free quota) rather than throwing.
          console.warn(`[AIServiceManager] Text github (${githubModel}) failed, falling back:`, (err as Error).message);
          if (this.openai || preferences.openAiKey) {
            try {
              return await tryOpenAI('gpt-4o-mini');
            } catch (openErr) {
              console.warn('[AIServiceManager] Text OpenAI fallback failed, trying Gemini:', (openErr as Error).message);
            }
          }
          const geminiChain = ['gemini-2.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-2.5-flash', 'gemini-2.0-flash'];
          for (let i = 0; i < geminiChain.length; i++) {
            try {
              return await tryGemini(geminiChain[i]);
            } catch (gemErr) {
              console.warn(`[AIServiceManager] Text gemini ${geminiChain[i]} fallback failed${i < geminiChain.length - 1 ? ', trying next' : ''}:`, (gemErr as Error).message);
            }
          }
          throw err;
        }
      }

      if (aiModel === 'openai-gpt4o') {
        return await tryOpenAI('gpt-4o');
      } else if (aiModel === 'gemini-1.5-flash') {
        return await tryGemini('gemini-1.5-flash');
      } else if (aiModel === 'gemini-2.0-flash-exp') {
        return await tryGemini('gemini-2.0-flash');
      } else if (aiModel === 'google-ai-studio') {
        // "Google AI Studio API" → lead with models that have available free-tier
        // quota. gemini-2.5-flash / 2.0-flash / flash-latest are quota-exhausted
        // (429) or overloaded (503) on current free keys, so we lead with the
        // *-flash-lite models which DO have free quota, then fall through.
        const chain = ['gemini-2.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'];
        for (let i = 0; i < chain.length; i++) {
          try {
            return await tryGemini(chain[i]);
          } catch (err) {
            console.warn(`[AIServiceManager] Text google-ai-studio: ${chain[i]} failed${i < chain.length - 1 ? `, trying ${chain[i + 1]}` : ''}:`, (err as Error).message);
          }
        }
        return await tryOpenAI('gpt-4o-mini');
      } else {
        // veegpt-hybrid: lead with the *-flash-lite models which have available
        // free-tier quota (2.5-flash / 2.0-flash / pro are 429 quota-exhausted on
        // current free keys), then fall back to flash/pro, then OpenAI.
        const hybridChain = ['gemini-2.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'];
        for (let i = 0; i < hybridChain.length; i++) {
          try {
            return await tryGemini(hybridChain[i]);
          } catch (err) {
            console.warn(`[AIServiceManager] Text hybrid: ${hybridChain[i]} failed${i < hybridChain.length - 1 ? `, trying ${hybridChain[i + 1]}` : ', falling back to OpenAI'}:`, (err as Error).message);
          }
        }
        return await tryOpenAI('gpt-4o-mini');
      }
    } catch (error: any) {
      console.error(`[AIServiceManager] ALL generation attempts failed:`, {
        model: aiModel,
        error: error.message,
        stack: error.stack
      });
      throw new Error(`AI generation failed: ${error.message}`);
    }
  }

  /**
   * Streaming counterpart of generateText(). Yields text chunks (tokens) in real
   * time as the model produces them, using the providers' native streaming APIs
   * (Gemini generateContentStream / OpenAI & GitHub Models stream:true). Honors
   * the same workspace AI configuration (model, creativity/temperature, persona,
   * style, length, language, content-safety and custom provider keys) as
   * generateText, and falls back across providers the same way.
   */
  public async *generateTextStream(prompt: string, preferences: UserAIPreferences = {}, attachments: AIAttachment[] = [], signal?: AbortSignal): AsyncGenerator<string, void, unknown> {
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

    console.log(`[AIServiceManager] Streaming text using model: ${aiModel}, creativity: ${creativityLevel}, safety: ${contentSafety}`);

    // Build platform-aware insight prefix when platformContext is supplied.
    // Requirements: 8.5, 8.6
    const platformPrefix = preferences.platformContext
      ? promptConstructorService.buildInsightPrompt({
          platformContext: preferences.platformContext,
          availableCapabilities: preferences.availableCapabilities,
          userId: '',
          workspaceId: '',
          postType: 'post',
          platform: preferences.platformContext === 'all' ? 'instagram' : preferences.platformContext,
          aiPreferences: preferences,
        })
      : '';

    const globalSystemContext = `
[SYSTEM CONFIGURATION OVERRIDE]
You must strictly follow these brand guidelines for your response:
${aiPersona ? `- Persona: ${aiPersona}` : ''}
${captionStyle ? `- Tone/Style: ${captionStyle}` : ''}
${responseLength ? `- Response Length constraint: ${responseLength}` : ''}
${multilingual && multilingual !== 'auto' ? `- Target Language: ${multilingual}` : ''}
${aiMemory === 'long-term' ? `- Memory Context: Retain continuity with typical brand interactions.` : ''}
[/SYSTEM CONFIGURATION OVERRIDE]\n\n`;

    // Prepend platform prefix before the user's prompt.
    const finalPrompt = globalSystemContext + (platformPrefix ? platformPrefix + '\n\n' : '') + prompt;

    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
    // Gemini multimodal parts (supports images AND PDFs natively via inlineData).
    const geminiParts: any[] = hasAttachments
      ? [{ text: finalPrompt }, ...attachments.map((a) => ({ inlineData: { mimeType: a.mimeType, data: a.data } }))]
      : [finalPrompt as any];
    // OpenAI/GitHub multimodal content (images only; PDFs are not supported by
    // the chat-completions image_url API, so those are skipped there).
    const openAiImages = hasAttachments
      ? attachments.filter((a) => a.mimeType.startsWith('image/')).map((a) => ({
          type: 'image_url' as const,
          image_url: { url: `data:${a.mimeType};base64,${a.data}` },
        }))
      : [];
    const openAiContent: any = hasAttachments && openAiImages.length
      ? [{ type: 'text', text: finalPrompt }, ...openAiImages]
      : finalPrompt;

    const streamGemini = async function* (this: AIServiceManager, modelName: string): AsyncGenerator<string> {
      console.log(`[AIServiceManager] Streaming Google AI (${modelName})${hasAttachments ? ` with ${attachments.length} attachment(s)` : ''}`);
      const generationConfig = { temperature: creativityLevel };
      const safetySettings = this.getSafetySettings(contentSafety);
      const client = preferences.googleAiStudioKey ? new GoogleGenerativeAI(preferences.googleAiStudioKey) : this.genAI;
      const model = client.getGenerativeModel({ model: modelName, generationConfig, safetySettings });
      const result = await model.generateContentStream(hasAttachments ? geminiParts : finalPrompt);
      let acc = '';
      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) { acc += text; yield text; }
      }
      try {
        const agg = await result.response;
        recordAIUsage({ provider: 'gemini', model: modelName, callType: 'stream', usage: fromGeminiUsage((agg as any)?.usageMetadata), promptText: finalPrompt, completionText: acc });
      } catch {
        recordAIUsage({ provider: 'gemini', model: modelName, callType: 'stream', promptText: finalPrompt, completionText: acc });
      }
    }.bind(this);

    const streamOpenAI = async function* (this: AIServiceManager, modelName: string): AsyncGenerator<string> {
      console.log(`[AIServiceManager] Streaming OpenAI (${modelName})`);
      const client = preferences.openAiKey ? new OpenAI({ apiKey: preferences.openAiKey }) : this.openai;
      if (!client) throw new Error('OpenAI is not configured.');
      const stream = await client.chat.completions.create({
        messages: [{ role: 'user', content: openAiContent }],
        model: modelName,
        temperature: creativityLevel,
        stream: true,
        stream_options: { include_usage: true },
      }, signal ? { signal } : undefined);
      let acc = '';
      let usage: any = null;
      for await (const part of stream) {
        if ((part as any).usage) usage = (part as any).usage;
        const text = part.choices[0]?.delta?.content || '';
        if (text) { acc += text; yield text; }
      }
      recordAIUsage({ provider: 'openai', model: modelName, callType: 'stream', usage: fromOpenAIUsage(usage), promptText: typeof openAiContent === 'string' ? openAiContent : finalPrompt, completionText: acc });
    }.bind(this);

    const streamGithub = async function* (this: AIServiceManager, modelName: string): AsyncGenerator<string> {
      if (!this.githubModels) throw new Error('GitHub Models is not configured (GITHUB_TOKEN missing).');
      console.log(`[AIServiceManager] Streaming GitHub Models (${modelName})`);
      const stream = await this.githubModels.chat.completions.create({
        messages: [{ role: 'user', content: openAiContent }],
        model: modelName,
        temperature: creativityLevel,
        stream: true,
        stream_options: { include_usage: true },
      }, signal ? { signal } : undefined);
      let acc = '';
      let usage: any = null;
      for await (const part of stream) {
        if ((part as any).usage) usage = (part as any).usage;
        const text = part.choices[0]?.delta?.content || '';
        if (text) { acc += text; yield text; }
      }
      recordAIUsage({ provider: 'github', model: modelName, callType: 'stream', usage: fromOpenAIUsage(usage), promptText: typeof openAiContent === 'string' ? openAiContent : finalPrompt, completionText: acc });
    }.bind(this);

    // Try a chain of generators in order, falling back to the next only if the
    // current one fails before yielding anything. Once a stream has yielded at
    // least one chunk we commit to it (so we never duplicate partial output).
    const streamWithFallback = async function* (
      attempts: Array<{ label: string; gen: () => AsyncGenerator<string> }>,
    ): AsyncGenerator<string> {
      for (let i = 0; i < attempts.length; i++) {
        const { label, gen } = attempts[i];
        let yieldedAny = false;
        try {
          for await (const chunk of gen()) {
            yieldedAny = true;
            yield chunk;
          }
          return; // completed successfully
        } catch (err) {
          if (yieldedAny || i === attempts.length - 1) {
            console.error(`[AIServiceManager] Stream ${label} failed after partial/last attempt:`, (err as Error).message);
            throw err;
          }
          console.warn(`[AIServiceManager] Stream ${label} failed, falling back:`, (err as Error).message);
        }
      }
    };

    const githubModel = this.resolveGithubModel(aiModel);
    let attempts: Array<{ label: string; gen: () => AsyncGenerator<string> }>;

    // When the user attached files, prefer Gemini first — it natively analyzes
    // BOTH images and PDFs via inlineData. GitHub/OpenAI chat models can't read
    // PDFs (and GitHub free tier has no vision), so they're only a fallback for
    // image-only attachments. A PDF with no Gemini available will degrade to
    // text-only on those providers.
    const hasPdf = hasAttachments && attachments.some((a) => a.mimeType === 'application/pdf');
    if (hasAttachments) {
      attempts = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite']
        .map((m) => ({ label: `${m} (multimodal)`, gen: () => streamGemini(m) }));
      // Image-only attachments can also fall back to OpenAI vision.
      if (!hasPdf && (this.openai || preferences.openAiKey)) {
        attempts.push({ label: 'openai gpt-4o-mini (vision)', gen: () => streamOpenAI('gpt-4o-mini') });
      }
    } else if (githubModel) {
      attempts = [
        { label: `github ${githubModel}`, gen: () => streamGithub(githubModel) },
        { label: 'openai gpt-4o-mini', gen: () => streamOpenAI('gpt-4o-mini') },
        { label: 'gemini-2.5-flash-lite', gen: () => streamGemini('gemini-2.5-flash-lite') },
      ];
    } else if (aiModel === 'openai-gpt4o') {
      attempts = [{ label: 'openai gpt-4o', gen: () => streamOpenAI('gpt-4o') }];
    } else if (aiModel === 'gemini-1.5-flash') {
      attempts = [{ label: 'gemini-1.5-flash', gen: () => streamGemini('gemini-1.5-flash') }];
    } else if (aiModel === 'gemini-2.0-flash-exp') {
      attempts = [{ label: 'gemini-2.0-flash', gen: () => streamGemini('gemini-2.0-flash') }];
    } else if (aiModel === 'google-ai-studio') {
      attempts = ['gemini-2.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash']
        .map((m) => ({ label: m, gen: () => streamGemini(m) }));
      attempts.push({ label: 'openai gpt-4o-mini', gen: () => streamOpenAI('gpt-4o-mini') });
    } else {
      // veegpt-hybrid (default)
      attempts = ['gemini-2.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash']
        .map((m) => ({ label: m, gen: () => streamGemini(m) }));
      attempts.push({ label: 'openai gpt-4o-mini', gen: () => streamOpenAI('gpt-4o-mini') });
    }

    yield* streamWithFallback(attempts);
  }

  /**
   * Tool-aware chat streaming (industry-standard function-calling pattern).
   *
   * Streams the assistant reply as structured events. The model may interleave
   * normal text with ONE OR MORE tool calls — e.g. it can reply conversationally
   * AND emit a `schedule_post` call in the same turn. This is what lets VeeGPT
   * decide "the user wants to post" WITHOUT a separate regex/triage step: the
   * LLM raises its hand via a tool call as part of generating its answer.
   *
   * Targets OpenAI-compatible providers (OpenAI + GitHub Models) which support
   * the `tools` parameter. If those fail or aren't configured, it falls back to
   * plain text streaming (no tools) via the existing generateTextStream so chat
   * still works — it just won't emit tool calls on that fallback.
   */
  public async *generateChatStreamWithTools(
    prompt: string,
    tools: ChatTool[],
    preferences: UserAIPreferences = {},
    signal?: AbortSignal,
  ): AsyncGenerator<ChatStreamEvent, void, unknown> {
    const {
      aiModel = 'veegpt-hybrid',
      creativityLevel = 0.7,
      aiPersona = 'Professional & Authoritative',
      captionStyle = 'Storytelling',
      responseLength = 'medium',
      multilingual = 'auto',
      aiMemory = 'long-term',
    } = preferences;

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

    const githubModel = this.resolveGithubModel(aiModel);

    // Stream from one OpenAI-compatible client, surfacing text + tool calls.
    const streamToolsFrom = async function* (
      this: AIServiceManager,
      client: OpenAI,
      modelName: string,
      provider: 'openai' | 'github',
    ): AsyncGenerator<ChatStreamEvent> {
      const stream = await client.chat.completions.create({
        model: modelName,
        messages: [{ role: 'user', content: finalPrompt }],
        temperature: creativityLevel,
        tools: tools as any,
        tool_choice: 'auto',
        stream: true,
        stream_options: { include_usage: true },
      }, signal ? { signal } : undefined);
      let acc = '';
      let usage: any = null;
      const toolAcc = new Map<number, StreamingToolCall>();
      for await (const part of stream) {
        if ((part as any).usage) usage = (part as any).usage;
        const delta = part.choices?.[0]?.delta as any;
        const text = delta?.content || '';
        if (text) { acc += text; yield { type: 'text', delta: text }; }
        accumulateToolCallDeltas(toolAcc, delta?.tool_calls);
      }
      recordAIUsage({ provider, model: modelName, callType: 'stream', usage: fromOpenAIUsage(usage), promptText: finalPrompt, completionText: acc });
      // Emit completed tool calls AFTER the text (args are only whole at end).
      const finalized: ParsedToolCall[] = finalizeToolCalls(toolAcc);
      for (const tc of finalized) {
        yield { type: 'toolCall', name: tc.name, args: tc.args, id: tc.id };
      }
    }.bind(this);

    // Stream tool calls from a Gemini model via native function calling. Gemini
    // returns function calls as structured parts (not streamed text), so we
    // collect the full response then yield any text + tool calls. This is the
    // fallback when the OpenAI-compatible providers are quota-limited.
    const streamGeminiTools = async function* (
      this: AIServiceManager,
      modelName: string,
    ): AsyncGenerator<ChatStreamEvent> {
      const client = preferences.googleAiStudioKey ? new GoogleGenerativeAI(preferences.googleAiStudioKey) : this.genAI;
      // Convert OpenAI-style tools → Gemini functionDeclarations.
      const functionDeclarations = tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        parameters: sanitizeSchemaForGemini(t.function.parameters),
      }));
      const model = client.getGenerativeModel({
        model: modelName,
        generationConfig: { temperature: creativityLevel },
        safetySettings: this.getSafetySettings((preferences as any).contentSafety || 'standard'),
        tools: [{ functionDeclarations } as any],
      });
      const result = await this.withTransientRetry(() => model.generateContent(finalPrompt), `Tools ${modelName}`);
      const resp: any = result.response;
      // Usage tracking.
      try { recordAIUsage({ provider: 'gemini', model: modelName, callType: 'stream', usage: fromGeminiUsage(resp?.usageMetadata), promptText: finalPrompt, completionText: resp?.text?.() || '' }); } catch { /* noop */ }
      // Emit any prose first.
      let text = '';
      try { text = resp?.text?.() || ''; } catch { /* function-only response */ }
      if (text && text.trim()) yield { type: 'text', delta: text };
      // Then any function calls.
      let calls: any[] = [];
      try { calls = (typeof resp?.functionCalls === 'function' ? resp.functionCalls() : null) || []; } catch { calls = []; }
      for (const c of calls) {
        if (c?.name) yield { type: 'toolCall', name: c.name, args: (c.args && typeof c.args === 'object' ? c.args : {}) as Record<string, unknown> };
      }
    }.bind(this);

    // Provider order: GitHub model (if configured) → OpenAI gpt-4o-mini.
    const attempts: Array<{ label: string; gen: () => AsyncGenerator<ChatStreamEvent> }> = [];
    if (githubModel && this.githubModels) {
      const gh = this.githubModels;
      attempts.push({ label: `github ${githubModel} (tools)`, gen: () => streamToolsFrom(gh, githubModel, 'github') });
    }
    const openaiClient = preferences.openAiKey ? new OpenAI({ apiKey: preferences.openAiKey }) : this.openai;
    if (openaiClient) {
      attempts.push({ label: 'openai gpt-4o-mini (tools)', gen: () => streamToolsFrom(openaiClient, 'gpt-4o-mini', 'openai') });
    }
    // Gemini function-calling fallback — so tool calls STILL work when the
    // OpenAI-compatible providers are rate-limited/quota-exhausted (otherwise we
    // degraded to plain text and the model would hallucinate "scheduled"). Use
    // the SAME free-tier-friendly chain that plain chat uses (flash-lite models
    // have available free quota; gemini-2.0/2.5-flash are often quota-exhausted).
    if (process.env.GOOGLE_API_KEY || preferences.googleAiStudioKey) {
      for (const gm of ['gemini-2.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-2.5-flash', 'gemini-2.0-flash']) {
        attempts.push({ label: `${gm} (tools)`, gen: () => streamGeminiTools(gm) });
      }
    }

    let lastErr: any = null;
    for (let i = 0; i < attempts.length; i++) {
      let yieldedAny = false;
      try {
        for await (const ev of attempts[i].gen()) { yieldedAny = true; yield ev; }
        return; // success
      } catch (err) {
        lastErr = err;
        if (yieldedAny) {
          console.error(`[AIServiceManager] Tool stream ${attempts[i].label} failed mid-stream:`, (err as Error).message);
          throw err;
        }
        try { const { vlog } = await import('../utils/veegpt-debug-logger'); vlog('toolstream:attempt-failed', { label: attempts[i].label, error: (err as Error).message?.slice(0, 120) }); } catch { /* noop */ }
        console.warn(`[AIServiceManager] Tool stream ${attempts[i].label} failed, falling back:`, (err as Error).message);
      }
    }

    // FINAL FALLBACK: no tool-capable provider succeeded. We must NOT silently
    // degrade to a plain-text model here — without the tools, the model can't
    // emit a real tool call and instead writes the action as PROSE (e.g.
    // "[schedule_post(...)]" or "your post is scheduled"), which both leaks raw
    // tool syntax to the user AND falsely claims an action happened. Surface an
    // honest error instead so the caller shows a real failure, not a fake success.
    if (attempts.length === 0) {
      console.warn('[AIServiceManager] No tool-capable provider configured for tool stream.');
    } else if (lastErr) {
      console.warn('[AIServiceManager] All tool streams failed:', (lastErr as Error).message);
    }
    throw lastErr || new Error('No tool-capable AI provider is currently available.');
  }

  /**
   * Vision analysis of a post's media (image OR video) from its URL. Returns a
   * concise factual description the caption/hashtag generator can use so output
   * is actually grounded in what's shown — not just the text prompt.
   *
   * Honors the workspace AI config: it leads with the user's configured model
   * when that model is vision-capable, otherwise falls back across vision
   * models (Gemini handles both images and video via inlineData; OpenAI vision
   * handles images only). Best-effort: returns undefined if it can't analyze
   * (so callers degrade gracefully to text-only).
   */
  public async analyzeMedia(
    mediaUrl: string,
    mediaType: 'image' | 'video' | 'auto' = 'auto',
    preferences: UserAIPreferences = {},
  ): Promise<string | undefined> {
    if (!mediaUrl) return undefined;
    try {
      // 1) Download the media bytes.
      const resp = await fetch(mediaUrl);
      if (!resp.ok) {
        console.warn('[AIServiceManager] analyzeMedia: fetch failed', resp.status, mediaUrl);
        return undefined;
      }
      let mimeType = resp.headers.get('content-type')?.split(';')[0]?.trim() || '';
      const buf = Buffer.from(await resp.arrayBuffer());
      // Infer mime from extension if the server didn't send one.
      if (!mimeType) {
        const ext = (mediaUrl.split('?')[0].split('.').pop() || '').toLowerCase();
        const map: Record<string, string> = {
          jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
          mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', m4v: 'video/x-m4v',
        };
        mimeType = map[ext] || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg');
      }
      const isVideo = mediaType === 'video' || mimeType.startsWith('video/');

      // Gemini inlineData has a practical size ceiling (~20MB for the inline
      // request path). Skip video that's too large rather than erroring.
      const MAX_INLINE_BYTES = 18 * 1024 * 1024;
      if (buf.length > MAX_INLINE_BYTES) {
        console.warn('[AIServiceManager] analyzeMedia: media too large for inline analysis', buf.length);
        return undefined;
      }

      const base64 = buf.toString('base64');
      const instruction = isVideo
        ? 'You are analyzing a short social-media VIDEO. In 2-4 sentences, describe what actually happens: the subject(s), setting, key actions/scenes, mood, colors, and any visible text or branding. Be concrete and factual — this will ground a caption. Do NOT write a caption, only the description.'
        : 'You are analyzing a social-media IMAGE. In 2-4 sentences, describe exactly what is shown: the subject(s), setting, composition, mood, colors, and any visible text or branding. Be concrete and factual — this will ground a caption. Do NOT write a caption, only the description.';

      // 2) Vision call. Prefer the configured model if vision-capable; otherwise
      //    fall back across vision models. Gemini does images AND video.
      const tryGeminiVision = async (modelName: string): Promise<string> => {
        const client = preferences.googleAiStudioKey ? new GoogleGenerativeAI(preferences.googleAiStudioKey) : this.genAI;
        const model = client.getGenerativeModel({
          model: modelName,
          generationConfig: { temperature: 0.4 },
          safetySettings: this.getSafetySettings((preferences.contentSafety as string) || 'standard'),
        });
        const result = await model.generateContent([
          { text: instruction },
          { inlineData: { mimeType, data: base64 } },
        ]);
        const vText = result.response.text();
        recordAIUsage({ provider: 'gemini', model: modelName, callType: 'vision', usage: fromGeminiUsage((result.response as any)?.usageMetadata), promptText: instruction, completionText: vText });
        return vText;
      };

      const tryOpenAIVision = async (modelName: string): Promise<string> => {
        if (isVideo) throw new Error('OpenAI chat vision does not support video');
        const client = preferences.openAiKey ? new OpenAI({ apiKey: preferences.openAiKey }) : this.openai;
        if (!client) throw new Error('OpenAI is not configured.');
        const completion = await client.chat.completions.create({
          model: modelName,
          temperature: 0.4,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: instruction },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
            ] as any,
          }],
        });
        const ovText = completion.choices[0]?.message?.content || '';
        recordAIUsage({ provider: 'openai', model: modelName, callType: 'vision', usage: fromOpenAIUsage((completion as any)?.usage), promptText: instruction, completionText: ovText });
        return ovText;
      };

      // Build the attempt order from the configured model. Only Gemini can read
      // video, so video skips straight to the Gemini chain.
      const geminiChain = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite'];
      const configured = this.resolveGeminiVisionModel(preferences.aiModel);
      if (configured) {
        // Lead with the configured Gemini model, then the rest as fallback.
        for (const m of [configured, ...geminiChain.filter((x) => x !== configured)]) {
          try {
            const text = (await tryGeminiVision(m)).trim();
            if (text) { console.log(`[AIServiceManager] analyzeMedia via ${m}`); return text; }
          } catch (err) {
            console.warn(`[AIServiceManager] analyzeMedia gemini ${m} failed:`, (err as Error).message);
          }
        }
      } else {
        for (const m of geminiChain) {
          try {
            const text = (await tryGeminiVision(m)).trim();
            if (text) { console.log(`[AIServiceManager] analyzeMedia via ${m}`); return text; }
          } catch (err) {
            console.warn(`[AIServiceManager] analyzeMedia gemini ${m} failed:`, (err as Error).message);
          }
        }
      }

      // Image-only fallback to OpenAI vision.
      if (!isVideo) {
        try {
          const text = (await tryOpenAIVision('gpt-4o-mini')).trim();
          if (text) { console.log('[AIServiceManager] analyzeMedia via openai gpt-4o-mini'); return text; }
        } catch (err) {
          console.warn('[AIServiceManager] analyzeMedia openai failed:', (err as Error).message);
        }
      }

      return undefined;
    } catch (err) {
      console.error('[AIServiceManager] analyzeMedia error:', (err as Error).message);
      return undefined;
    }
  }

  /**
   * Map the workspace aiModel setting to a vision-capable Gemini model name,
   * or undefined when the configured model isn't a Gemini vision model (caller
   * then falls back across the default Gemini vision chain).
   */
  private resolveGeminiVisionModel(aiModel?: string): string | undefined {
    switch (aiModel) {
      case 'gemini-1.5-flash': return 'gemini-1.5-flash';
      case 'gemini-2.0-flash-exp': return 'gemini-2.0-flash';
      case 'google-ai-studio': return 'gemini-2.5-flash';
      case 'veegpt-hybrid': return 'gemini-2.5-flash';
      default: return undefined;
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
    /** When true, generate only ONE caption variation (fewer model calls — used
     *  by lightweight flows like the VeeGPT inline composer to avoid bursting
     *  the provider rate limit). Defaults to false (3 variations). */
    singleVariation?: boolean;
    /** Cancels generation (stops the provider calls) when the user aborts. */
    signal?: AbortSignal;
  }): Promise<CaptionVariation[]> {
    const {
      userId,
      workspaceId,
      topic,
      mediaAnalysis,
      existingCaption,
      postType = 'post',
      platform = 'Instagram',
      preferences = {},
      singleVariation = false,
      signal
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

      // Extract user's content & tone preferences with comprehensive support
      const userPersona = preferences.aiPersona || 'Professional & Authoritative';
      const userCaptionStyle = preferences.captionStyle || 'Storytelling';
      const creativityLevel = preferences.creativityLevel || 0.7;
      const optimizationGoals = preferences.optimizationGoals || 'Engagement';
      const multilingual = preferences.multilingual || 'auto';
      const contentSafety = preferences.contentSafety || 'standard';
      const aiModel = preferences.aiModel || 'veegpt-hybrid';
      const responseLength = preferences.responseLength || 'medium';
      
      // Build style-specific instructions that respect user preferences
      const getStyleInstructions = (baseStyle: string) => {
        let lengthGuidance = '';
        
        // Caption style length handling
        if (userCaptionStyle?.toLowerCase().includes('punchy') || userCaptionStyle?.toLowerCase().includes('short')) {
          lengthGuidance = '\n- CRITICAL: Keep caption VERY SHORT (1-3 sentences max, 50-100 characters ideal)\n- Every word must count - be extremely concise\n- No fluff or filler words\n- Punchy, impactful, direct';
        } else if (userCaptionStyle?.toLowerCase().includes('story') || userCaptionStyle?.toLowerCase().includes('detailed')) {
          lengthGuidance = '\n- Use longer storytelling format (3-5 sentences)\n- Include narrative elements and details';
        } else if (userCaptionStyle?.toLowerCase().includes('medium')) {
          lengthGuidance = '\n- Use medium length (2-4 sentences)\n- Balance detail with brevity';
        }
        
        // Persona and style guidance
        const personaGuidance = `\n- Persona/Voice: ${userPersona}\n- Caption Style: ${userCaptionStyle}`;
        
        // Optimization goal guidance
        let optimizationGuidance = '';
        if (optimizationGoals?.toLowerCase().includes('engagement')) {
          optimizationGuidance = '\n- FOCUS: Maximize likes, comments, shares, and saves\n- Use engagement-driving CTAs and questions';
        } else if (optimizationGoals?.toLowerCase().includes('reach')) {
          optimizationGuidance = '\n- FOCUS: Maximize impressions and discoverability\n- Use trending topics and broad appeal';
        } else if (optimizationGoals?.toLowerCase().includes('conversion')) {
          optimizationGuidance = '\n- FOCUS: Drive clicks and conversions\n- Include clear CTAs and value propositions';
        }
        
        // Multilingual handling
        let languageGuidance = '';
        if (multilingual && multilingual !== 'auto') {
          languageGuidance = `\n- Language: Write in ${multilingual}`;
        }
        
        // Content safety guidance
        let safetyGuidance = '';
        if (contentSafety === 'strict') {
          safetyGuidance = '\n- SAFETY: Avoid all potentially controversial topics\n- Use family-friendly language only';
        } else if (contentSafety === 'standard') {
          safetyGuidance = '\n- SAFETY: Avoid explicit content but allow mild edge\n- Keep it appropriate for general audiences';
        }
        
        return personaGuidance + lengthGuidance + optimizationGuidance + languageGuidance + safetyGuidance;
      };

      // Log preferences being used
      console.log('[AIServiceManager] Using AI preferences:', {
        aiModel,
        creativityLevel,
        optimizationGoals,
        userPersona,
        userCaptionStyle,
        multilingual,
        contentSafety,
        responseLength
      });

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
${getStyleInstructions('viral')}

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
${getStyleInstructions('authentic')}

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
${getStyleInstructions('balanced')}

IMPORTANT: Return ONLY the caption text. Do not include any labels, explanations, or metadata.`
        }
      ];

      // Lightweight flows (singleVariation) generate just ONE caption with no
      // regeneration retries — 1 model call instead of up to 6 — to avoid
      // bursting the provider rate limit. The full flow keeps all 3 variations.
      const activeVariationPrompts = singleVariation ? variationPrompts.slice(1, 2) : variationPrompts;

      const scoredVariations: CaptionVariation[] = [];
      const MAX_REGENERATION_ATTEMPTS = singleVariation ? 1 : 2; // Maximum attempts to regenerate if below threshold

      // Generate and score each variation
      for (const varPrompt of activeVariationPrompts) {
        signal?.throwIfAborted?.();
        let attempt = 0;
        let bestVariation: CaptionVariation | null = null;
        let bestScore = 0;

        while (attempt < MAX_REGENERATION_ATTEMPTS) {
          // Stop immediately if the user cancelled — don't fire further model
          // calls for a generation nobody is waiting for.
          signal?.throwIfAborted?.();
          attempt++;
          
          console.log(`[AIServiceManager] Generating ${varPrompt.style} variation (attempt ${attempt})...`);
          
          const fullPrompt = `${basePrompt}\n\n${varPrompt.instructions}`;
          const rawCaption = await this.generateText(fullPrompt, preferences, signal);
          const cleanedCaption = this.cleanCaptionText(rawCaption);

          // TASK 22.1: Apply content safety filters BEFORE authenticity scoring
          console.log(`[AIServiceManager] Checking content safety for ${varPrompt.style} variation...`);
          const safetyLevel = (preferences.contentSafety as 'off' | 'standard' | 'strict') || 'standard';
          const safetyResult = contentSafetyService.filterCaption(
            cleanedCaption,
            safetyLevel,
            preferences.brandValues as string[] | undefined,
            preferences.prohibitedTopics as string[] | undefined
          );

          console.log(`[AIServiceManager] ${varPrompt.style} safety score: ${safetyResult.safetyScore}`, {
            isSafe: safetyResult.isSafe,
            issueCount: safetyResult.issues.length,
            flags: safetyResult.flags
          });

          // If caption fails safety check, log violations and skip to next attempt
          if (!safetyResult.isSafe) {
            console.warn(`[AIServiceManager] ${varPrompt.style} variation failed safety check (score: ${safetyResult.safetyScore}/100)`, {
              issues: safetyResult.issues,
              flags: safetyResult.flags
            });
            
            // Continue to next attempt instead of using unsafe content
            continue;
          }

          // Use filtered caption for authenticity scoring
          const captionToScore = safetyResult.filteredCaption;

          // Score authenticity
          console.log(`[AIServiceManager] Scoring authenticity for ${varPrompt.style} variation...`);
          const authenticityScore = await this.authenticityScorer.scoreCaption(
            captionToScore,
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
              captionToScore,
              userId,
              workspaceId,
              postType,
              platform
            );

            bestVariation = {
              caption: captionToScore,
              style: varPrompt.style,
              styleDescription: varPrompt.styleDescription,
              authenticityScore,
              engagementPrediction,
              safetyResult // Include safety result in variation
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
          authenticityScore: v.authenticityScore?.overallScore,
          safetyScore: v.safetyResult?.safetyScore,
          passed: v.authenticityScore?.passesThreshold
        }))
      });

      // TASK 22.1: If all variations fail safety check, regenerate with stricter prompts
      if (scoredVariations.length === 0) {
        console.warn('[AIServiceManager] WARNING: All variations failed safety checks. Attempting regeneration with stricter safety instructions...');
        
        // Add stricter safety instructions to the prompt
        const stricterPrompt = `${basePrompt}\n\n[CRITICAL SAFETY OVERRIDE]
You MUST generate content that is:
- Free from profanity, hate speech, and discriminatory language
- Free from spam patterns and misleading claims
- Free from personal information and sensitive data
- Brand-safe and appropriate for all audiences
- Authentic and engaging without controversial topics

If you cannot generate safe content for this topic, respond with a professional, neutral caption that maintains the brand voice while avoiding any safety issues.
[/CRITICAL SAFETY OVERRIDE]`;

        // Try one more time with stricter safety instructions
        for (const varPrompt of variationPrompts) {
          console.log(`[AIServiceManager] Regenerating ${varPrompt.style} variation with stricter safety instructions...`);
          
          const fullPrompt = `${stricterPrompt}\n\n${varPrompt.instructions}`;
          const rawCaption = await this.generateText(fullPrompt, { ...preferences, contentSafety: 'strict' });
          const cleanedCaption = this.cleanCaptionText(rawCaption);

          // Check safety again
          const safetyResult = contentSafetyService.filterCaption(
            cleanedCaption,
            'strict',
            preferences.brandValues as string[] | undefined,
            preferences.prohibitedTopics as string[] | undefined
          );

          if (safetyResult.isSafe) {
            // Score authenticity
            const authenticityScore = await this.authenticityScorer.scoreCaption(
              safetyResult.filteredCaption,
              voiceProfile,
              platform
            );

            // Predict engagement
            const engagementPrediction = await this.engagementPredictor.predictEngagement(
              safetyResult.filteredCaption,
              userId,
              workspaceId,
              postType,
              platform
            );

            scoredVariations.push({
              caption: safetyResult.filteredCaption,
              style: varPrompt.style,
              styleDescription: `${varPrompt.styleDescription} (Regenerated with strict safety)`,
              authenticityScore,
              engagementPrediction,
              safetyResult
            });
          }
        }

        // Re-filter after regeneration
        const refilteredVariations = scoredVariations.filter(v => 
          v.authenticityScore && v.authenticityScore.passesThreshold
        );

        if (refilteredVariations.length > 0) {
          console.log('[AIServiceManager] Successfully regenerated safe variations', {
            count: refilteredVariations.length
          });
          return refilteredVariations;
        } else if (scoredVariations.length > 0) {
          console.warn('[AIServiceManager] Regenerated variations exist but none passed authenticity threshold. Returning all variations.');
          return scoredVariations;
        } else {
          throw new Error('Unable to generate safe caption variations. All attempts failed safety checks.');
        }
      }

      // If no variations passed, return all scored variations with a warning
      // This ensures we always return something useful to the user
      if (filteredVariations.length === 0) {
        console.warn('[AIServiceManager] WARNING: No variations passed authenticity threshold of 80. Returning all variations with scores.');
        return scoredVariations;
      }

      // Log safety violations for monitoring
      for (const variation of filteredVariations) {
        if (variation.safetyResult && variation.safetyResult.issues.length > 0) {
          console.log('[AIServiceManager] Safety issues logged for monitoring', {
            style: variation.style,
            issues: variation.safetyResult.issues,
            flags: variation.safetyResult.flags,
            safetyScore: variation.safetyResult.safetyScore
          });
        }
      }

      // Return filtered variations with metadata
      console.log('[AIServiceManager] Successfully generated and scored caption variations', {
        count: filteredVariations.length,
        avgAuthenticityScore: filteredVariations.reduce((sum, v) => sum + (v.authenticityScore?.overallScore || 0), 0) / filteredVariations.length,
        avgSafetyScore: filteredVariations.reduce((sum, v) => sum + (v.safetyResult?.safetyScore || 100), 0) / filteredVariations.length,
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

  /**
   * Generate a fully AI-driven Performance Overview banner.
   *
   * Unlike the previous version (which returned a single string built from only
   * persona + optimization goal), this analyses the COMPLETE set of metrics we
   * have in the database (totals, period deltas, growth rates, follower trend,
   * audience demographics, best posting times, recent content, etc.) and honours
   * EVERY field in the user's AI Configuration:
   *   - aiModel            → which model/provider runs the analysis
   *   - creativityLevel    → temperature
   *   - aiPersona          → voice of the analyst
   *   - captionStyle       → tone / phrasing
   *   - optimizationGoals  → what the advice should optimise for
   *   - responseLength     → how long the tip is allowed to be
   *   - multilingual       → output language
   *   - contentSafety      → safety thresholds (applied in generateText/JSON)
   *   - aiMemory           → whether to reference ongoing brand journey
   *
   * Returns a structured object so the banner headline AND the tip are both
   * real, data-grounded AI output (no hardcoded template strings).
   */
  /**
   * Analyze a content image OR video using AI vision to extract quality signals
   * for the Growth Recommendations engine. Images use the two-step vision
   * pipeline (Gemini inlineData → structured JSON). Videos use Gemini's native
   * video analysis capability via analyzeMedia.
   *
   * Returns null (non-fatally) if vision is unavailable or the URL is invalid.
   */
  public async analyzeContentImage(
    mediaUrl: string,
    postContext: {
      engagement?: number;
      likes?: number;
      comments?: number;
      reach?: number;
      type?: string;
      caption?: string;
    } = {}
  ): Promise<{
    visualQuality: 'high' | 'medium' | 'low';
    composition: string;
    textOverlay: boolean;
    colorVibrancy: 'vibrant' | 'muted' | 'neutral';
    subjects: string[];
    contentTheme: string;
    improvements: string[];
    strengths: string[];
  } | null> {
    if (!mediaUrl || typeof mediaUrl !== 'string') return null;
    if (!mediaUrl.startsWith('http://') && !mediaUrl.startsWith('https://')) return null;

    try {
      // Detect whether this is a video (reel) based on URL extension or post type
      const isVideo = ['reel', 'video', 'REEL', 'VIDEO'].includes(postContext.type || '')
        || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(mediaUrl);

      const mediaType: 'image' | 'video' = isVideo ? 'video' : 'image';

      // Step 1: Get a factual description using the existing vision pipeline
      // (Gemini inlineData handles both images and videos natively)
      const description = await this.analyzeMedia(mediaUrl, mediaType, {});
      if (!description) return null;

      const typeLabel = isVideo ? 'Reel/video' : 'Image post';

      // Step 2: Use the description + post metrics to produce structured quality analysis
      const structuredPrompt = `You are a social media content quality analyst. Based on this ${typeLabel} description and post performance data, produce a quality assessment.

${typeLabel} description: "${description}"

Post performance:
- Type: ${postContext.type || (isVideo ? 'reel' : 'image')}
- Caption: ${postContext.caption ? postContext.caption.slice(0, 100) : 'none'}
- Engagement: ${postContext.engagement || 0} (likes: ${postContext.likes || 0}, comments: ${postContext.comments || 0})
- Reach: ${postContext.reach || 0}

Respond with ONLY this JSON:
{
  "visualQuality": "high"|"medium"|"low",
  "composition": "one sentence describing visual composition or video flow",
  "textOverlay": true|false,
  "colorVibrancy": "vibrant"|"muted"|"neutral",
  "subjects": ["main", "subjects", "or", "scenes"],
  "contentTheme": "theme in 1-3 words",
  "improvements": ["specific improvement 1", "specific improvement 2"],
  "strengths": ["specific strength 1", "specific strength 2"]
}`;

      const result = await this.generateJSON(structuredPrompt, {}, { preferGemini: true });
      if (!result || typeof result !== 'object') return null;
      if (!['high', 'medium', 'low'].includes(result.visualQuality)) return null;

      return {
        visualQuality: result.visualQuality,
        composition: typeof result.composition === 'string' ? result.composition : '',
        textOverlay: !!result.textOverlay,
        colorVibrancy: ['vibrant', 'muted', 'neutral'].includes(result.colorVibrancy) ? result.colorVibrancy : 'neutral',
        subjects: Array.isArray(result.subjects) ? result.subjects.slice(0, 5) : [],
        contentTheme: typeof result.contentTheme === 'string' ? result.contentTheme : '',
        improvements: Array.isArray(result.improvements) ? result.improvements.slice(0, 2) : [],
        strengths: Array.isArray(result.strengths) ? result.strengths.slice(0, 2) : [],
      };
    } catch (e: any) {
      console.warn('[AIServiceManager] analyzeContentImage failed:', e?.message);
      return null;
    }
  }

  public async generateAnalyticsInsight(
    metricsData: any,
    preferences: UserAIPreferences = {},
    signal?: AbortSignal
  ): Promise<{ title: string; emoji: string; headline: string; tip: string }> {
    const {
      aiModel = 'veegpt-hybrid',
      creativityLevel = 0.7,
      aiPersona = 'Professional & Authoritative',
      optimizationGoals = 'Engagement',
      captionStyle = 'Storytelling',
      responseLength = 'medium',
      multilingual = 'auto',
      aiMemory = 'long-term'
    } = preferences;

    const period = metricsData?.period || 'month';
    const periodLabel = period === 'day' ? 'today' : period === 'week' ? 'this week' : 'this month';

    // The Core Intelligence settings (model + creativity) directly drive the
    // analysis: `aiModel` selects the provider/model inside generateJSON and
    // `creativityLevel` becomes the generation temperature. We log them so the
    // chosen configuration is verifiable end-to-end.
    console.log(`[AIServiceManager] Analytics insight using model=${aiModel}, creativity=${creativityLevel}, goal=${optimizationGoals}`);

    // Translate the Primary Optimization Goal into concrete analytical focus so
    // the advice actually changes based on what the user selected in Settings.
    const goalKey = String(optimizationGoals).toLowerCase();
    let goalGuide: string;
    if (goalKey.includes('conversion') || goalKey.includes('click')) {
      goalGuide = 'Optimise for CLICKS & CONVERSIONS: prioritise CTAs, link-driving content, profile visits and actions that turn reach into conversions.';
    } else if (goalKey.includes('brand') || goalKey.includes('reach') || goalKey.includes('aware')) {
      goalGuide = 'Optimise for BROAD REACH & SHAREABILITY: prioritise impressions, shares, saves, discoverability and content that expands the audience.';
    } else {
      goalGuide = 'Optimise for ENGAGEMENT & COMMENTS: prioritise likes, comments, replies, conversation starters and community interaction.';
    }

    // Translate the configured response length into a concrete sentence budget
    // so the tip respects the user's DM/response-length preference.
    const lengthGuide =
      responseLength === 'short'
        ? 'Keep the tip to a single punchy sentence.'
        : responseLength === 'long'
        ? 'The tip can be 3-4 detailed sentences.'
        : 'Keep the tip to 2-3 concise sentences.';

    const languageGuide =
      multilingual && multilingual !== 'auto'
        ? `Write BOTH the headline and the tip in ${multilingual}.`
        : 'Write in the same language the brand/account appears to use (default English).';

    const memoryGuide =
      aiMemory === 'long-term'
        ? 'Frame the advice as the next step in an ongoing growth journey, acknowledging momentum or setbacks vs. previous periods.'
        : 'Focus only on the current snapshot without referencing long-term history.';

    const nicheGuide = (preferences as any).contentNiche
      ? `This account operates in the "${(preferences as any).contentNiche}" niche — make the headline and tip relevant to that niche's content, audience and norms.`
      : '';

    const systemInstruction = `You are an elite social-media growth analyst speaking with a "${aiPersona}" persona and a "${captionStyle}" tone. Your single objective is to help the user "${optimizationGoals}".

${goalGuide}

${nicheGuide}

You are analysing performance for ONE specific time window: ${periodLabel.toUpperCase()}. Every statement you make MUST be about ${periodLabel} only.

The dataset's "followerTrend" already contains the follower change FOR THIS PERIOD (followerGrowth, followerGrowthPercentage, direction). The "dailyTrend" array is scoped to this window, and "growth"/"growthRate" describe change within this window. Lifetime totals (followers, reach, posts) are context only — do NOT present a lifetime total as if it were the change for ${periodLabel}.

Study the period-scoped data — this window's gains/losses, growth rates, follower direction, engagement, reach, audience demographics and best active times — then produce a banner that is UNIQUE to ${periodLabel}.

Rules:
- The headline and tip MUST reflect ${periodLabel}'s OWN growth or decline. A Today banner, a This Week banner and a This Month banner must read differently because their underlying numbers differ.
- Lead with the period's direction: if followerTrend.direction is "up" celebrate the gain; if "down" be honest about the decline for ${periodLabel} and give a recovery move; if "flat" focus on the strongest other signal.
- Be SPECIFIC. Quote the actual numbers, percentages and trends from the data for THIS period. Never use vague filler like "keep it up" or "great job".
- The "headline" is one energetic sentence (max ~18 words) summarising the single most important story for ${periodLabel}. It may start with one relevant emoji.
- The "tip" is the most valuable, actionable recommendation that moves the needle on "${optimizationGoals}", grounded in this period's specific numbers. ${lengthGuide}
- "title" is a short 2-3 word banner label that fits the period (e.g. "Today's Pulse", "Weekly Momentum", "Monthly Journey"). "emoji" is one emoji that fits the mood of this period's data.
- ${memoryGuide}
- ${languageGuide}

Full analytics dataset (JSON) — scoped to ${periodLabel}:
${JSON.stringify(metricsData, null, 2)}

Respond with ONLY a JSON object of this exact shape:
{"title": string, "emoji": string, "headline": string, "tip": string}`;

    try {
      const result = await this.generateJSON(systemInstruction, preferences, { signal });
      const headline = typeof result?.headline === 'string' ? result.headline.trim() : '';
      const tip = typeof result?.tip === 'string' ? result.tip.trim() : '';
      // A banner is only valid if the AI produced a real headline AND tip. If
      // not, throw so the worker records a failure instead of caching a partial
      // result that would force the client to show hardcoded template text.
      if (!headline || !tip) {
        throw new Error('AI returned an incomplete banner (missing headline or tip)');
      }
      return {
        title: typeof result?.title === 'string' && result.title.trim() ? result.title.trim() : 'Performance Insight',
        emoji: typeof result?.emoji === 'string' && result.emoji.trim() ? result.emoji.trim() : '📊',
        headline,
        tip
      };
    } catch (error: any) {
      // Do NOT fabricate a banner. Propagate the failure so the caller (worker)
      // marks it failed and the UI either keeps the previous cached banner or
      // hides the banner entirely — never shows fake/template numbers.
      console.error('[AIServiceManager] generateAnalyticsInsight failed:', error?.message);
      throw error;
    }
  }

  /**
   * Generate AI-driven, data-grounded GROWTH RECOMMENDATIONS for the dashboard
   * "Your recommendations" section.
   *
   * This is a flagship feature: VeeFore promises to grow a user's reach and
   * engagement, so these recommendations must be genuinely useful, specific to
   * THIS account's real data, and prioritised by expected impact. The caller is
   * responsible for assembling the complete account dataset (profile, follower
   * trend, post-level performance, posting frequency/cadence, best active times,
   * audience demographics, engagement/reach metrics, top & worst posts, format
   * mix, etc.) and passing it in via `accountData`.
   *
   * Honours the full AI Configuration: aiModel (provider routing),
   * creativityLevel (temperature), optimizationGoals (engagement/conversion/
   * reach focus), aiPersona + captionStyle (voice), multilingual (language),
   * contentSafety (safety thresholds) and the custom API keys.
   *
   * @returns Array of recommendation cards: { icon, title, description, priority, category }
   */
  public async generateGrowthRecommendations(
    accountData: any,
    preferences: UserAIPreferences = {},
    signal?: AbortSignal
  ): Promise<Array<{ icon: string; title: string; description: string; priority: 'high' | 'medium' | 'low'; category: string }>> {
    const {
      aiModel = 'veegpt-hybrid',
      creativityLevel = 0.7,
      aiPersona = 'Professional & Authoritative',
      optimizationGoals = 'Engagement',
      captionStyle = 'Storytelling',
      multilingual = 'auto'
    } = preferences;
    const contentNiche = (preferences as any).contentNiche;
    const recommendationLimit = Math.max(
      1,
      Math.min(5, Number((preferences as any).recommendationLimit) || 5),
    );

    console.log(`[AIServiceManager] Growth recommendations using model=${aiModel}, creativity=${creativityLevel}, goal=${optimizationGoals}, niche=${contentNiche || 'n/a'}`);

    const goalKey = String(optimizationGoals).toLowerCase();
    let goalGuide: string;
    if (goalKey.includes('conversion') || goalKey.includes('click')) {
      goalGuide = 'PRIMARY GOAL: maximise clicks & conversions — profile visits, link clicks, and actions that turn reach into outcomes.';
    } else if (goalKey.includes('brand') || goalKey.includes('reach') || goalKey.includes('aware')) {
      goalGuide = 'PRIMARY GOAL: maximise reach & shareability — impressions, shares, saves, discoverability and audience expansion.';
    } else {
      goalGuide = 'PRIMARY GOAL: maximise engagement & comments — likes, comments, replies, saves and community interaction.';
    }

    const languageGuide =
      multilingual && multilingual !== 'auto'
        ? `Write every title and description in ${multilingual}.`
        : 'Write in clear, simple English.';

    const nicheGuide = contentNiche
      ? `The account operates in the "${contentNiche}" niche. Tailor every recommendation to what works specifically in the ${contentNiche} space — reference niche-relevant content formats, topics, posting norms and audience expectations.`
      : '';

    // Allowed icon keys must match what the frontend can render.
    const allowedIcons = [
      'clock',        // posting time / cadence
      'calendar',     // posting frequency / consistency
      'image',        // visual / format quality
      'video',        // reels / video strategy
      'hashtag',      // discoverability / hashtags
      'search',       // SEO / discoverability
      'users',        // audience / community
      'heart',        // engagement
      'message',      // comments / replies / DMs
      'trending',     // trending / reach
      'target',       // CTA / conversion
      'sparkles'      // content quality / creativity
    ];

    const mediaAnalysisSection = accountData?.mediaAnalysis?.allAnalyses?.length > 0
      ? `\n\nMEDIA VISION ANALYSIS (from AI vision of actual post content):
${accountData.mediaAnalysis.summary}

Top-performing IMAGES analyzed (${accountData.mediaAnalysis.topImages?.length || 0}):
${JSON.stringify(accountData.mediaAnalysis.topImages || [], null, 2)}

Top-performing REELS/VIDEOS analyzed (${accountData.mediaAnalysis.topVideos?.length || 0}):
${JSON.stringify(accountData.mediaAnalysis.topVideos || [], null, 2)}

Worst-performing IMAGES analyzed (${accountData.mediaAnalysis.worstImages?.length || 0}):
${JSON.stringify(accountData.mediaAnalysis.worstImages || [], null, 2)}

Worst-performing REELS/VIDEOS analyzed (${accountData.mediaAnalysis.worstVideos?.length || 0}):
${JSON.stringify(accountData.mediaAnalysis.worstVideos || [], null, 2)}

Use these AI vision insights to give concrete, visual content quality recommendations:
- Compare what makes top performers visually different from worst performers
- If top videos outperform top images, recommend doubling down on Reels
- If images have low visual quality or weak composition, give specific improvement actions
- Reference actual visual patterns found (e.g. "your best reels use text overlays and vibrant colors, while your worst images are muted and lack clear subjects")`
      : '';

    const followerFlowSection = accountData?.followerFlowLast28Days
      ? `\n\nFOLLOWER FLOW (last 28 days from Meta follows_and_unfollows data):\n- Total gained: ${accountData.followerFlowLast28Days.totalGained}\n- Total lost: ${accountData.followerFlowLast28Days.totalLost}\n- Net: ${accountData.followerFlowLast28Days.netChange}\n- Churn rate: ${accountData.followerFlowLast28Days.churnRate}%\nThis is real Meta API data — use churn rate to give specific audience retention advice.`
      : '';

    const bestTimeSection = accountData?.bestTimeToPost
      ? `\n\nBEST TIME TO POST (from audience activity analysis):\n- Best slot: ${accountData.bestTimeToPost.bestDayName} at ${accountData.bestTimeToPost.bestHourLabel}\n- Confidence: ${accountData.bestTimeToPost.confidenceLevel} (${accountData.bestTimeToPost.confidence}/100)\n- Top 3 slots: ${(accountData.bestTimeToPost.topSlots || []).map((s: any) => `${s.dayName} ${s.hourLabel}`).join(', ')}`
      : '';

    const systemInstruction = `You are VeeFore's elite Instagram growth strategist with a "${aiPersona}" persona and a "${captionStyle}" communication style. Your sole mission is to give this specific account the highest-leverage actions to GROW REACH AND ENGAGEMENT. Treat this as mission-critical — the user pays VeeFore precisely to grow.

${goalGuide}

${nicheGuide}

You are given the COMPLETE real dataset for this account below: profile stats, follower trend (gains/losses by day/week/month from Meta API), engagement & reach metrics, posting frequency/cadence, best active times, audience demographics, post-level performance (top performers, underperformers, format mix, recency), real follower churn data, and AI vision analysis of their top-performing content images.

Analytical method:
1. Diagnose the single biggest bottleneck limiting reach/engagement from the data (e.g. low posting frequency, posting at the wrong time, weak hooks, format mix, low save/share rate, declining reach-per-post, follower churn, visual quality issues).
2. Identify the strongest lever the data shows (e.g. a format or time window that already overperforms) and tell them to double down.
3. If mediaAnalysis is present, include at least one recommendation about visual content quality grounded in what the AI vision detected.
4. Produce exactly ${recommendationLimit} recommendation${recommendationLimit === 1 ? '' : 's'}, ordered by expected impact (highest first).

Rules for each recommendation:
- Be SPECIFIC and ACTIONABLE. Reference the account's real numbers (e.g. "You post only 0.4x/week — accounts your size that post 4-5x/week see 3x the reach"). Quote actual figures, times, formats, percentages from the data.
- The "title" is a short, punchy action label (3-5 words).
- The "description" is 1-2 sentences explaining WHAT to do and WHY, grounded in this account's data and tied to growing reach/engagement.
- "priority" is one of: "high", "medium", "low" (order the array high → low).
- "category" is a short tag (e.g. "Posting Cadence", "Timing", "Content Format", "Engagement", "Discoverability", "Audience", "Visual Quality").
- "icon" MUST be exactly one of: ${allowedIcons.join(', ')}. Pick the most fitting one.
- If posting frequency is low or zero, ALWAYS include a high-priority cadence recommendation with a concrete weekly target.
- If the account has little/no data yet, give the best starter actions to begin generating reach (still specific, not generic).
- ${languageGuide}

Complete account dataset (JSON):
${JSON.stringify(accountData, null, 2)}
${mediaAnalysisSection}
${followerFlowSection}
${bestTimeSection}

Respond with ONLY a JSON object of this exact shape:
{"recommendations": [{"icon": string, "title": string, "description": string, "priority": "high"|"medium"|"low", "category": string}]}`;

    try {
      const result = await this.generateJSON(systemInstruction, preferences, { signal });
      const list = Array.isArray(result?.recommendations) ? result.recommendations : [];
      const priorityRank = { high: 0, medium: 1, low: 2 } as Record<string, number>;

      // All tracked metric/capability keys we gate recommendations against.
      const ALL_TRACKED_METRICS = [
        'followers_total', 'reach_total', 'impressions_total',
        'total_engagements', 'likes', 'comments', 'shares',
        'saves', 'video_views', 'profile_visits', 'website_clicks',
        'published_posts', 'facebook_reactions', 'facebook_page_views',
      ];

      const cleaned = list
        .filter((r: any) => r && typeof r.title === 'string' && typeof r.description === 'string')
        .map((r: any) => ({
          icon: allowedIcons.includes(r.icon) ? r.icon : 'sparkles',
          title: String(r.title).trim(),
          description: String(r.description).trim(),
          priority: (['high', 'medium', 'low'].includes(r.priority) ? r.priority : 'medium') as 'high' | 'medium' | 'low',
          category: typeof r.category === 'string' ? r.category.trim() : 'Growth'
        }))
        // CapabilityGuard post-filter (Requirement 8.5):
        // If a platformContext is set, drop any recommendation whose description
        // or title references a metric key that has MetricSupportLevel = 'NONE'
        // for that platform.  Never include with a caveat — omit entirely.
        .filter((r: any) => {
          const ctx = preferences.platformContext;
          if (!ctx || ctx === 'all') return true; // no filtering needed
          const platform = ctx as PlatformId;
          const combinedText = `${r.title} ${r.description}`.toLowerCase();
          // If the recommendation text references a NONE-support metric, drop it.
          return !ALL_TRACKED_METRICS.some(
            (key) =>
              CapabilityGuard.getMetricSupport(platform, key) === 'NONE' &&
              combinedText.includes(key.replace(/_/g, ' ')),
          );
        })
        .sort((a: any, b: any) => (priorityRank[a.priority] ?? 1) - (priorityRank[b.priority] ?? 1))
        .slice(0, recommendationLimit);

      if (cleaned.length === 0) {
        throw new Error('AI returned no usable recommendations');
      }
      return cleaned;
    } catch (error: any) {
      console.error('[AIServiceManager] generateGrowthRecommendations failed:', error?.message);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Platform-context insight generation (Requirements 8.5, 8.6, 8.7)
  // ---------------------------------------------------------------------------

  /**
   * Generate AI insights with full platform-context awareness.
   *
   * Unlike `generateText`, this method understands the `platformContext` at the
   * semantic level:
   *  - For `'instagram'` or `'facebook'`: generates a single-platform insight
   *    block after consulting `CapabilityGuard` to strip unsupported capabilities.
   *  - For `'all'`: runs per-platform generation in parallel via
   *    `Promise.allSettled`.  If one platform fails, the successful platform's
   *    block is returned together with a clearly labeled unavailability notice
   *    for the failed platform — the method NEVER fails the whole request because
   *    one platform is down (Requirement 8.7).
   *
   * CapabilityGuard check (Requirement 8.5):
   * Before the prompt reaches the model, every metric/capability key that has
   * `MetricSupportLevel = 'NONE'` on the target platform is removed from the
   * `availableCapabilities` list so the model never receives a recommendation
   * template that references an unsupported capability.
   *
   * @param prompt - The base insight prompt (already assembled by the caller)
   * @param preferences - Workspace AI preferences including `platformContext`
   * @returns Generated insight text
   */
  public async generateInsightWithPlatformContext(
    prompt: string,
    preferences: UserAIPreferences = {},
  ): Promise<string> {
    const { platformContext } = preferences;

    // No platform context — behave exactly like generateText (backward-compat).
    if (!platformContext || platformContext !== 'all') {
      // For single-platform or undefined: filter availableCapabilities via
      // CapabilityGuard before forwarding to generateText (Requirement 8.5).
      const filteredPrefs = this._filterCapabilitiesForPlatform(preferences);
      return this.generateText(prompt, filteredPrefs);
    }

    // platformContext === 'all' — run both platforms in parallel (Requirement 8.7).
    const instagramPrefs = this._filterCapabilitiesForPlatform({
      ...preferences,
      platformContext: 'instagram',
    });
    const facebookPrefs = this._filterCapabilitiesForPlatform({
      ...preferences,
      platformContext: 'facebook',
    });

    // Each platform gets its own prompt with the appropriate platform prefix.
    const [igResult, fbResult] = await Promise.allSettled([
      this.generateText(prompt, instagramPrefs),
      this.generateText(prompt, facebookPrefs),
    ]);

    const igOk = igResult.status === 'fulfilled';
    const fbOk = fbResult.status === 'fulfilled';

    if (igOk && fbOk) {
      // Both succeeded — combine the two blocks.
      return `## Instagram Insights\n\n${igResult.value}\n\n---\n\n## Facebook Insights\n\n${fbResult.value}`;
    }

    if (igOk && !fbOk) {
      // Instagram succeeded, Facebook failed.
      console.warn('[AIServiceManager] generateInsightWithPlatformContext: Facebook block failed:', (fbResult as PromiseRejectedResult).reason?.message);
      return `## Instagram Insights\n\n${igResult.value}\n\n---\n\n## Facebook Insights\n\n⚠️ Facebook insights are temporarily unavailable. Please try again in a moment.`;
    }

    if (!igOk && fbOk) {
      // Facebook succeeded, Instagram failed.
      console.warn('[AIServiceManager] generateInsightWithPlatformContext: Instagram block failed:', (igResult as PromiseRejectedResult).reason?.message);
      return `## Instagram Insights\n\n⚠️ Instagram insights are temporarily unavailable. Please try again in a moment.\n\n---\n\n## Facebook Insights\n\n${fbResult.value}`;
    }

    // Both failed — propagate the Instagram error (arbitrary choice; both are equivalent).
    console.error('[AIServiceManager] generateInsightWithPlatformContext: both platform blocks failed');
    throw (igResult as PromiseRejectedResult).reason ?? new Error('AI insight generation failed for all platforms');
  }

  /**
   * Filter `preferences.availableCapabilities` to only include keys that are
   * NOT `MetricSupportLevel = 'NONE'` for the given `platformContext`.
   *
   * This implements the CapabilityGuard check from Requirement 8.5:
   * "Before including any recommendation, check
   *  CapabilityGuard.getMetricSupport(platform, capabilityKey) !== 'NONE';
   *  omit the recommendation if capability is not supported."
   *
   * Returns a shallow copy of `preferences` with the filtered list.
   */
  private _filterCapabilitiesForPlatform(preferences: UserAIPreferences): UserAIPreferences {
    const { platformContext, availableCapabilities } = preferences;

    // Nothing to filter if no platform or no explicit capabilities list.
    if (!platformContext || platformContext === 'all' || !availableCapabilities?.length) {
      return preferences;
    }

    const platform = platformContext as PlatformId;
    const filtered = availableCapabilities.filter(
      (key) => CapabilityGuard.getMetricSupport(platform, key) !== 'NONE',
    );

    return { ...preferences, availableCapabilities: filtered };
  }


  public async generateJSON(prompt: string, preferences: UserAIPreferences = {}, options: { preferGemini?: boolean; signal?: AbortSignal } = {}): Promise<any> {
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
      options.signal?.throwIfAborted?.();
      const generationConfig = { temperature: creativityLevel, responseMimeType: "application/json" };
      const safetySettings = this.getSafetySettings(contentSafety);
      const client = preferences.googleAiStudioKey ? new GoogleGenerativeAI(preferences.googleAiStudioKey) : this.genAI;
      const model = client.getGenerativeModel({ model: modelName, generationConfig, safetySettings });
      const result = await this.withTransientRetry(
        () => model.generateContent(finalPrompt, options.signal ? { signal: options.signal } : undefined),
        `JSON ${modelName}`,
      );
      const text = result.response.text();
      recordAIUsage({ provider: 'gemini', model: modelName, callType: 'json', usage: fromGeminiUsage((result.response as any)?.usageMetadata), promptText: finalPrompt, completionText: text });
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
      }, options.signal ? { signal: options.signal } : undefined);
      const jText = completion.choices[0]?.message?.content || '{}';
      recordAIUsage({ provider: 'openai', model: modelName, callType: 'json', usage: fromOpenAIUsage((completion as any)?.usage), promptText: finalPrompt, completionText: jText });
      return JSON.parse(jText);
    };

    const tryGithub = async (modelName: string) => {
      if (!this.githubModels) throw new Error('GitHub Models is not configured (GITHUB_TOKEN missing).');
      const completion = await this.githubModels.chat.completions.create({
        messages: [{ role: "system", content: "You must respond with valid JSON." }, { role: "user", content: finalPrompt }],
        model: modelName,
        temperature: creativityLevel,
        response_format: { type: "json_object" }
      }, options.signal ? { signal: options.signal } : undefined);
      const gjText = completion.choices[0]?.message?.content || '{}';
      recordAIUsage({ provider: 'github', model: modelName, callType: 'json', usage: fromOpenAIUsage((completion as any)?.usage), promptText: finalPrompt, completionText: gjText });
      return JSON.parse(gjText);
    };

    const githubModel = this.resolveGithubModel(aiModel);

    // preferGemini: lightweight, latency- and quota-sensitive callers (e.g. the
    // VeeGPT post-intent parse) lead with the Gemini flash-lite chain, which has
    // generous free-tier quota and is ISOLATED from the GitHub Models per-minute
    // rate limit that heavier flows (caption generation) burn through. Falls back
    // to GitHub then OpenAI only if every Gemini model fails.
    if (options.preferGemini) {
      const chain = ['gemini-2.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-2.5-flash', 'gemini-2.0-flash'];
      for (let i = 0; i < chain.length; i++) {
        try {
          return await tryGemini(chain[i]);
        } catch (err) {
          // Different Gemini models can have SEPARATE quota buckets (e.g.
          // 2.5-flash-lite exhausted while flash-lite-latest still has quota),
          // so keep trying the rest of the chain even on a quota error rather
          // than bailing early.
          console.warn(`[AIServiceManager] JSON preferGemini ${chain[i]} failed:`, (err as Error).message);
        }
      }
      try {
        if (githubModel) return await tryGithub(githubModel);
      } catch (err) {
        console.warn('[AIServiceManager] JSON preferGemini github fallback failed:', (err as Error).message);
      }
      if (this.openai || preferences.openAiKey) return await tryOpenAI('gpt-4o-mini');
      // Last resort: one more Gemini attempt so we throw a meaningful error.
      return await tryGemini('gemini-2.5-flash-lite');
    }

    if (githubModel) {
      try {
        return await tryGithub(githubModel);
      } catch (err) {
        // Free GitHub Models tier can rate-limit; fall back across the full
        // Gemini flash-lite chain (which has free-tier quota — the SAME chain
        // plain chat uses, so research/JSON works whenever chat does), then
        // OpenAI as a last resort.
        console.warn(`[AIServiceManager] JSON github (${githubModel}) failed, falling back:`, (err as Error).message);
        const fallbackChain = ['gemini-2.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-2.5-flash', 'gemini-2.0-flash'];
        for (let i = 0; i < fallbackChain.length; i++) {
          try {
            return await tryGemini(fallbackChain[i]);
          } catch (gemErr) {
            // Different Gemini models have separate quota buckets — keep trying
            // the rest of the chain even on a quota error.
            console.warn(`[AIServiceManager] JSON gemini fallback ${fallbackChain[i]} failed:`, (gemErr as Error).message);
          }
        }
        if (this.openai || preferences.openAiKey) return await tryOpenAI('gpt-4o-mini');
        throw err;
      }
    }

    if (aiModel === 'openai-gpt4o') {
      return await tryOpenAI('gpt-4o');
    } else if (aiModel === 'gemini-1.5-flash') {
      return await tryGemini('gemini-1.5-flash');
    } else if (aiModel === 'gemini-2.0-flash-exp') {
      return await tryGemini('gemini-2.0-flash');
    } else if (aiModel === 'google-ai-studio') {
      // "Google AI Studio API" → lead with models that have available free-tier
      // quota. The *-flash-lite models DO have free quota; gemini-2.5-flash /
      // 2.0-flash / flash-latest are 429 quota-exhausted on current free keys.
      const chain = ['gemini-2.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'];
      for (let i = 0; i < chain.length; i++) {
        try {
          return await tryGemini(chain[i]);
        } catch (err) {
          // Gemini models can have SEPARATE quota buckets — keep trying the rest
          // of the chain even on a quota error (a lite model being exhausted
          // doesn't mean flash-lite-latest is).
          console.warn(`[AIServiceManager] JSON google-ai-studio: ${chain[i]} failed${i < chain.length - 1 ? `, trying ${chain[i + 1]}` : ''}:`, (err as Error).message);
        }
      }
      return await tryOpenAI('gpt-4o-mini');
    } else {
      // veegpt-hybrid: lead with the *-flash-lite models which have available
      // free-tier quota (2.5-flash / 2.0-flash / pro are 429 quota-exhausted on
      // current free keys), then fall back to flash/pro, then OpenAI.
      const hybridChain = ['gemini-2.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'];
      for (let i = 0; i < hybridChain.length; i++) {
        try {
          return await tryGemini(hybridChain[i]);
        } catch (err) {
          // Gemini models can have SEPARATE quota buckets — keep trying the
          // rest of the chain even on a quota error before falling to OpenAI.
          console.warn(`[AIServiceManager] JSON hybrid: ${hybridChain[i]} failed${i < hybridChain.length - 1 ? `, trying ${hybridChain[i + 1]}` : ', falling back to OpenAI'}:`, (err as Error).message);
        }
      }
      return await tryOpenAI('gpt-4o-mini');
    }
  }

}

export const aiServiceManager = AIServiceManager.getInstance();
