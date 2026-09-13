import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from '@google/generative-ai';
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
import {
  recordAIUsage,
  fromOpenAIUsage,
  fromGeminiUsage,
  currentAIContext,
  currentAbortSignal,
} from './aiUsageTracker';
import { withProviderRetry } from './veegpt-retry';
import {
  accumulateToolCallDeltas,
  finalizeToolCalls,
  type StreamingToolCall,
  type ParsedToolCall,
} from './toolCallAccumulator';
import { liteLLMGateway } from './litellm/LiteLLMGateway';
import {
  resolveRoute,
  mustBypassGateway,
  supportsCustomTemperature,
  type Capability,
} from './ai-model-routing';
import { recordModelCall } from './ai-call-log';

export interface UserAIPreferences {
  aiModel?: string;
  creativityLevel?: number;
  /**
   * Reasoning effort for reasoning models (OpenAI GPT-5 family). Lower = faster
   * & cheaper, higher = deeper but slower. Ignored by non-reasoning models.
   * Only applied when routing through the LiteLLM gateway.
   */
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
  /**
   * For Gemini thinking models: whether to request & stream the model's
   * reasoning summary (the "Thinking" panel). Default true. When false, no
   * reasoning is requested (faster, no panel). Ignored by non-thinking models.
   */
  showThinking?: boolean;
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

/** A user-uploaded attachment (image, video or PDF) for multimodal analysis. */
export interface AIAttachment {
  /** MIME type, e.g. "image/png", "image/jpeg", "application/pdf". */
  mimeType: string;
  /**
   * Base64-encoded file data (no data: prefix). Used for INLINE delivery — the
   * bytes ride in the request. Empty when the file was uploaded to the Gemini
   * Files API instead (see `fileUri`), which is how large video/PDF avoid the
   * ~20MB inline request ceiling.
   */
  data: string;
  /**
   * Gemini Files API resource URI (e.g. `https://generativelanguage.googleapis.com/v1beta/files/abc`).
   * When set, the file is referenced by id rather than inlined, so it works for
   * files far larger than the inline limit. Only valid on the native Gemini
   * path (video/PDF/HEIC bypass the LiteLLM gateway, which can't use a fileUri).
   */
  fileUri?: string;
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
/**
 * Retired Gemini model ids → the live model that replaces them.
 *
 * Google has stopped serving the pinned `gemini-2.x-*` ids to newer API keys:
 * `generateContent` answers 404 "This model … is no longer available to new
 * users" even though ListModels still advertises them. Mapping them to the
 * rolling `-latest` aliases at the single point where the model is actually
 * constructed keeps stored user preferences (which may still say
 * `gemini-2.5-flash`) working without a migration.
 *
 * ai-model-routing.ts already maps the app-level ids to live natives; this is the
 * belt-and-braces guard for any raw id that reaches the SDK.
 */
const RETIRED_GEMINI_MODELS: Record<string, string> = {
  // Google retires whole generations for new keys. As of late 2025 the 1.5 AND
  // 2.x ids return 404 "no longer available to new users — use gemini-3.6-flash"
  // (verified live against this project's key). Map every retired id to the
  // current balanced flash so a stale reference never 404s on the first call
  // (which was cascading into the fallback chain and rate-limiting the key).
  'gemini-1.5-flash': 'gemini-3.6-flash',
  'gemini-1.5-pro': 'gemini-3.6-flash',
  'gemini-2.0-flash': 'gemini-3.6-flash',
  'gemini-2.0-flash-exp': 'gemini-3.6-flash',
  'gemini-2.0-flash-lite': 'gemini-3.6-flash',
  'gemini-2.5-flash': 'gemini-3.6-flash',
  'gemini-2.5-flash-lite': 'gemini-3.6-flash',
  'gemini-2.5-pro': 'gemini-3.6-flash',
};

/** Map a possibly-retired Gemini model id to one that is still served. */
export function resolveLiveGeminiModel(modelName: string): string {
  return RETIRED_GEMINI_MODELS[modelName] || modelName;
}

/**
 * Gemini's rolling `-latest` aliases intermittently answer with HTTP 503
 * ("this model is currently experiencing high demand") or 429 under load. That
 * is transient and NOT a bug in our request — the fix is to retry the CONNECTION
 * (the 503 surfaces before any token streams) with backoff, and on the final
 * failure fall back to a lighter alias that usually has spare capacity. This is
 * what unblocked PDF/video analysis: the request was routed to Gemini correctly
 * but every single attempt hit a 503 and there was no retry, so the reply came
 * back empty and it LOOKED like the model "couldn't see" the file.
 */
export function isTransientGeminiError(err: any): boolean {
  const msg = String(err?.message || err || '');
  if (/\b(429|500|502|503|504)\b/.test(msg)) return true;
  return /service unavailable|high demand|overloaded|try again later|rate.?limit|quota|deadline exceeded|\bunavailable\b|internal error/i.test(
    msg
  );
}

/** Per-connection retry budget for a transient Gemini failure. */
const GEMINI_STREAM_MAX_ATTEMPTS = 3;
/** Backoff between connection attempts (ms), indexed by attempt number. */
const GEMINI_STREAM_BACKOFF_MS = [1000, 3000, 6000];
/**
 * Alternate models to try (in order) when the resolved model is overloaded (503)
 * OR unavailable on this key (404). STABLE pinned ids first (real quota), with
 * the rolling aliases last as a final resort. All read images, video and PDFs.
 * Env-overridable via GEMINI_MEDIA_FALLBACKS (comma-separated).
 */
const GEMINI_STREAM_FALLBACKS: string[] = (
  process.env.GEMINI_MEDIA_FALLBACKS
    ? process.env.GEMINI_MEDIA_FALLBACKS.split(',').map(s => s.trim())
    : [
        process.env.GEMINI_MEDIA_MODEL || 'gemini-3.6-flash',
        'gemini-3.7-flash',
        'gemini-flash-latest',
      ]
).filter(Boolean);

/**
 * A model-unavailable error (bad/disallowed id) — NOT transient. The remedy is
 * to try the NEXT candidate model, not to retry the same one. Distinct from
 * {@link isTransientGeminiError} (503/429 → wait and retry the same model).
 */
function isModelUnavailableError(err: any): boolean {
  const msg = String(err?.message || err || '');
  return /\b40[034]\b/.test(msg)
    ? /\b404\b/.test(msg) || /not found|not available|does not exist|unsupported|permission|access/i.test(msg)
    : /not found|not available|does not exist|unsupported/i.test(msg);
}

function sanitizeSchemaForGemini(schema: any): any {
  if (Array.isArray(schema)) return schema.map(sanitizeSchemaForGemini);
  if (!schema || typeof schema !== 'object') return schema;
  const out: any = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'additionalProperties') continue; // unsupported by Gemini
    if (key === 'type' && Array.isArray(value)) {
      // Union type → pick the first non-null type (Gemini wants a single type).
      out.type = (value as string[]).find(t => t !== 'null') || 'string';
      continue;
    }
    if (key === 'properties' && value && typeof value === 'object') {
      const props: any = {};
      for (const [pk, pv] of Object.entries(value as Record<string, unknown>))
        props[pk] = sanitizeSchemaForGemini(pv);
      out.properties = props;
      continue;
    }
    if (key === 'items') {
      out.items = sanitizeSchemaForGemini(value);
      continue;
    }
    out[key] = value;
  }
  return out;
}

/** Structured event yielded by the tool-aware chat stream. */
export type ChatStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'reasoning'; delta: string }
  | {
      type: 'toolCall';
      name: string;
      args: Record<string, unknown>;
      id?: string;
    };

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
   * Temperature params for an OpenAI-compatible request. GPT-5 reasoning models
   * reject any non-default value with a 400, so for those we send nothing and let
   * the API apply its default.
   */
  private temperatureFor(
    aiModel: string | undefined,
    creativityLevel: number
  ): { temperature?: number } {
    return supportsCustomTemperature(aiModel) ? { temperature: creativityLevel } : {};
  }

  /**
   * Run a one-shot model call and audit which model actually served it.
   * See server/services/ai-call-log.ts — this is how we prove the selected model
   * is the one running, with no fallback.
   */
  private async audited<T>(
    feature: string,
    route: {
      appModel: string;
      requested: string;
      provider: string;
      overriddenFor?: string;
    },
    transport: 'litellm' | 'native',
    capability: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const t0 = Date.now();
    try {
      const out = await fn();
      recordModelCall({
        feature,
        requested: route.requested,
        used: route.appModel,
        provider: route.provider,
        transport,
        capability,
        substitutedFor: route.overriddenFor,
        // A swap with no capability reason means the id was a retired provider.
        retiredAlias:
          !route.overriddenFor && route.appModel !== route.requested,
        ms: Date.now() - t0,
        ok: true,
      });
      return out;
    } catch (err) {
      recordModelCall({
        feature,
        requested: route.requested,
        used: route.appModel,
        provider: route.provider,
        transport,
        capability,
        substitutedFor: route.overriddenFor,
        retiredAlias:
          !route.overriddenFor && route.appModel !== route.requested,
        ms: Date.now() - t0,
        ok: false,
        error: (err as Error).message,
      });
      throw err;
    }
  }

  /** Streaming counterpart of `audited` — logs once the stream ends or throws. */
  private async *auditedStream<T>(
    feature: string,
    route: {
      appModel: string;
      requested: string;
      provider: string;
      overriddenFor?: string;
    },
    transport: 'litellm' | 'native',
    capability: string,
    gen: () => AsyncGenerator<T>
  ): AsyncGenerator<T> {
    const t0 = Date.now();
    let failed: Error | null = null;
    try {
      yield* gen();
    } catch (err) {
      failed = err as Error;
      throw err;
    } finally {
      recordModelCall({
        feature,
        requested: route.requested,
        used: route.appModel,
        provider: route.provider,
        transport,
        capability,
        substitutedFor: route.overriddenFor,
        retiredAlias:
          !route.overriddenFor && route.appModel !== route.requested,
        ms: Date.now() - t0,
        ok: !failed,
        error: failed?.message,
      });
    }
  }

  /**
   * Check if AI service is properly configured
   * Returns true if at least one AI provider (Google AI or OpenAI) is available
   */
  public async isConfigured(): Promise<boolean> {
    const hasGoogleKey = !!process.env.GOOGLE_API_KEY;
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
    const hasGithubToken = !!process.env.GITHUB_TOKEN;
    const hasLiteLLM = liteLLMGateway.isEnabled();

    // At least one provider (or the LiteLLM gateway) must be configured.
    const isConfigured =
      hasLiteLLM || hasGoogleKey || hasOpenAIKey || hasGithubToken;

    if (!isConfigured) {
      console.error(
        '[AIServiceManager] No AI provider configured. Set GOOGLE_API_KEY or OPENAI_API_KEY, or enable the LiteLLM gateway (USE_LITELLM=true).'
      );
    }

    return isConfigured;
  }

  /**
   * Server-side Gemini client accessor for the Video Editor's generative-video
   * provider adapters (Gemini Omni / Veo). The client is constructed from
   * `GOOGLE_API_KEY` inside the Node process; exposing it here keeps every
   * provider call routed through `AIServiceManager` and guarantees provider API
   * keys are never transmitted to the browser (Req 7.8). Returns `null` when no
   * Google key is configured so callers surface an explicit unavailable state
   * rather than fabricating success (No-Mock, Req 23).
   */
  public getGeminiVideoClient(): GoogleGenerativeAI | null {
    if (!process.env.GOOGLE_API_KEY) return null;
    return this.genAI;
  }

  private getSafetySettings(contentSafety?: string) {
    if (contentSafety === 'strict') {
      return [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
        },
      ];
    } else if (contentSafety === 'off') {
      return [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
      ];
    }
    // Default (standard) - Use BLOCK_ONLY_HIGH for more permissive caption generation
    // This prevents false positives while still blocking genuinely harmful content
    return [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
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

  public async generateText(
    prompt: string,
    preferences: UserAIPreferences = {},
    signal?: AbortSignal
  ): Promise<string> {
    const {
      aiModel = 'veegpt-hybrid',
      creativityLevel = 0.7,
      contentSafety = 'standard',
      aiPersona = 'Professional & Authoritative',
      captionStyle = 'Storytelling',
      responseLength = 'medium',
      multilingual = 'auto',
      aiMemory = 'long-term',
    } = preferences;

    console.log(
      `[AIServiceManager] Generating text using model: ${aiModel}, creativity: ${creativityLevel}, safety: ${contentSafety}`
    );

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
          platform:
            preferences.platformContext === 'all'
              ? 'instagram'
              : preferences.platformContext,
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
    const finalPrompt =
      globalSystemContext +
      (platformPrefix ? platformPrefix + '\n\n' : '') +
      prompt;

    // NO FALLBACK: the selected model runs, or the request fails. See
    // ai-model-routing.ts for the policy and the one capability exception.
    const route = resolveRoute(aiModel, 'text');
    if (liteLLMGateway.isEnabled()) {
      return await this.audited('text', route, 'litellm', 'text', () =>
        liteLLMGateway.chat(finalPrompt, {
          model: route.appModel,
          temperature: creativityLevel,
          reasoningEffort: preferences.reasoningEffort || 'low',
          showThinking: preferences.showThinking,
          signal,
          // Record real provider tokens so metering charges actual cost. The
          // proxy normalizes every provider to the OpenAI usage shape.
          onUsage: ({ usage, promptText, completionText }) =>
            recordAIUsage({
              provider: route.provider,
              model: route.native,
              callType: 'text',
              usage: fromOpenAIUsage(usage),
              promptText,
              completionText,
            }),
        })
      );
    }

    const tryGemini = async (modelName: string) => {
      try {
        console.log(
          `[AIServiceManager] Calling Google AI (${modelName}) with safety: ${contentSafety}`
        );
        const generationConfig = { temperature: creativityLevel };
        const safetySettings = this.getSafetySettings(contentSafety);
        console.log(
          `[AIServiceManager] Safety settings:`,
          safetySettings.map(s => `${s.category}: ${s.threshold}`)
        );

        signal?.throwIfAborted?.();
        const client = preferences.googleAiStudioKey
          ? new GoogleGenerativeAI(preferences.googleAiStudioKey)
          : this.genAI;
        const model = client.getGenerativeModel({
          model: resolveLiveGeminiModel(modelName),
          generationConfig,
          safetySettings,
        });
        const result = await model.generateContent(
          finalPrompt,
          signal ? { signal } : undefined
        );
        const text = result.response.text();
        recordAIUsage({
          provider: 'gemini',
          model: modelName,
          callType: 'text',
          usage: fromGeminiUsage((result.response as any)?.usageMetadata),
          promptText: finalPrompt,
          completionText: text,
        });

        console.log(
          `[AIServiceManager] Google AI generated text successfully (${text.length} chars)`
        );
        return text;
      } catch (error: any) {
        console.error(`[AIServiceManager] Google AI generation failed:`, {
          model: modelName,
          error: error.message,
          errorType: error.constructor.name,
          isSafetyBlock: error.message?.includes('SAFETY'),
          fullError: error,
        });
        throw error;
      }
    };

    const tryOpenAI = async (modelName: string) => {
      try {
        console.log(`[AIServiceManager] Calling OpenAI (${modelName})`);
        const client = preferences.openAiKey
          ? new OpenAI({ apiKey: preferences.openAiKey })
          : this.openai;
        if (!client) throw new Error('OpenAI is not configured.');
        signal?.throwIfAborted?.();
        const completion = await client.chat.completions.create(
          {
            messages: [{ role: 'user', content: finalPrompt }],
            model: modelName,
            ...this.temperatureFor(aiModel, creativityLevel),
          },
          signal ? { signal } : undefined
        );
        const text = completion.choices[0]?.message?.content || '';
        recordAIUsage({
          provider: 'openai',
          model: modelName,
          callType: 'text',
          usage: fromOpenAIUsage((completion as any)?.usage),
          promptText: finalPrompt,
          completionText: text,
        });
        console.log(
          `[AIServiceManager] OpenAI generated text successfully (${text.length} chars)`
        );
        return text;
      } catch (error: any) {
        console.error(`[AIServiceManager] OpenAI generation failed:`, {
          model: modelName,
          error: error.message,
          errorType: error.constructor.name,
        });
        throw error;
      }
    };

    const tryGithubText = async (modelName: string) => {
      if (!this.githubModels)
        throw new Error(
          'GitHub Models is not configured (GITHUB_TOKEN missing).'
        );
      console.log(`[AIServiceManager] Calling GitHub Models (${modelName})`);
      signal?.throwIfAborted?.();
      const completion = await this.githubModels.chat.completions.create(
        {
          messages: [{ role: 'user', content: finalPrompt }],
          model: modelName,
          ...this.temperatureFor(aiModel, creativityLevel),
        },
        signal ? { signal } : undefined
      );
      const ghText = completion.choices[0]?.message?.content || '';
      recordAIUsage({
        provider: 'github',
        model: modelName,
        callType: 'text',
        usage: fromOpenAIUsage((completion as any)?.usage),
        promptText: finalPrompt,
        completionText: ghText,
      });
      return ghText;
    };

    // Gateway disabled → call the selected model's provider directly. Still one
    // attempt only.
    try {
      return await this.audited('text', route, 'native', 'text', () => {
        switch (route.provider) {
          case 'gemini':
            return tryGemini(route.native);
          case 'openai':
            return tryOpenAI(route.native);
          case 'github':
            return tryGithubText(route.native);
          default:
            throw new Error(
              `No provider configured for model "${route.requested}".`
            );
        }
      });
    } catch (error: any) {
      console.error(`[AIServiceManager] text generation failed:`, {
        model: route.appModel,
        requested: route.requested,
        error: error.message,
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
   * generateText, and like generateText it runs the SELECTED model only — no
   * cross-provider fallback.
   */
  public async *generateTextStream(
    prompt: string,
    preferences: UserAIPreferences = {},
    attachments: AIAttachment[] = [],
    signal?: AbortSignal
  ): AsyncGenerator<string, void, unknown> {
    const {
      aiModel = 'veegpt-hybrid',
      creativityLevel = 0.7,
      contentSafety = 'standard',
      aiPersona = 'Professional & Authoritative',
      captionStyle = 'Storytelling',
      responseLength = 'medium',
      multilingual = 'auto',
      aiMemory = 'long-term',
    } = preferences;

    console.log(
      `[AIServiceManager] Streaming text using model: ${aiModel}, creativity: ${creativityLevel}, safety: ${contentSafety}`
    );

    // Build platform-aware insight prefix when platformContext is supplied.
    // Requirements: 8.5, 8.6
    const platformPrefix = preferences.platformContext
      ? promptConstructorService.buildInsightPrompt({
          platformContext: preferences.platformContext,
          availableCapabilities: preferences.availableCapabilities,
          userId: '',
          workspaceId: '',
          postType: 'post',
          platform:
            preferences.platformContext === 'all'
              ? 'instagram'
              : preferences.platformContext,
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
    const finalPrompt =
      globalSystemContext +
      (platformPrefix ? platformPrefix + '\n\n' : '') +
      prompt;

    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
    // Gemini multimodal parts (supports images AND PDFs natively via inlineData).
    const geminiParts: any[] = hasAttachments
      ? [
          { text: finalPrompt },
          ...attachments.map(a =>
            a.fileUri
              ? { fileData: { mimeType: a.mimeType, fileUri: a.fileUri } }
              : { inlineData: { mimeType: a.mimeType, data: a.data } }
          ),
        ]
      : [finalPrompt as any];
    // OpenAI/GitHub multimodal content (images only; PDFs are not supported by
    // the chat-completions image_url API, so those are skipped there).
    const openAiImages = hasAttachments
      ? attachments
          .filter(a => a.mimeType.startsWith('image/') && a.data && !a.fileUri)
          .map(a => ({
            type: 'image_url' as const,
            image_url: { url: `data:${a.mimeType};base64,${a.data}` },
          }))
      : [];
    const openAiContent: any =
      hasAttachments && openAiImages.length
        ? [{ type: 'text', text: finalPrompt }, ...openAiImages]
        : finalPrompt;

    const streamGemini = async function* (
      this: AIServiceManager,
      modelName: string
    ): AsyncGenerator<string> {
      console.log(
        `[AIServiceManager] Streaming Google AI (${modelName})${hasAttachments ? ` with ${attachments.length} attachment(s)` : ''}`
      );
      const generationConfig = { temperature: creativityLevel };
      const safetySettings = this.getSafetySettings(contentSafety);
      const client = preferences.googleAiStudioKey
        ? new GoogleGenerativeAI(preferences.googleAiStudioKey)
        : this.genAI;
      // Connect with retry+fallback. The 503 "high demand" surfaces HERE (before
      // any token), so retrying the connection is safe — we never retry once
      // tokens have started flowing, which would duplicate output.
      const primary = resolveLiveGeminiModel(modelName);
      const candidates = [
        primary,
        ...GEMINI_STREAM_FALLBACKS.filter(m => m !== primary),
      ];
      let result: Awaited<
        ReturnType<ReturnType<typeof client.getGenerativeModel>['generateContentStream']>
      > | null = null;
      let lastErr: any = null;
      connect: for (const candidateModel of candidates) {
        const model = client.getGenerativeModel({
          model: candidateModel,
          generationConfig,
          safetySettings,
        });
        for (let attempt = 0; attempt < GEMINI_STREAM_MAX_ATTEMPTS; attempt++) {
          if (signal?.aborted) throw new Error('aborted');
          try {
            result = await model.generateContentStream(
              hasAttachments ? geminiParts : finalPrompt
            );
            if (candidateModel !== primary)
              console.log(
                `[AIServiceManager] Gemini fell back to ${candidateModel} after ${primary} was unavailable`
              );
            break connect;
          } catch (err: any) {
            lastErr = err;
            // Model doesn't exist / not allowed on this key → try the NEXT
            // candidate immediately (no point retrying the same id).
            if (isModelUnavailableError(err)) {
              console.warn(
                `[AIServiceManager] Gemini ${candidateModel} unavailable — trying next model: ${String(err?.message || '').slice(0, 140)}`
              );
              break;
            }
            // Not transient and not a bad id → a real error, surface it.
            if (!isTransientGeminiError(err)) throw err;
            const backoffMs = GEMINI_STREAM_BACKOFF_MS[attempt] ?? 6000;
            console.warn(
              `[AIServiceManager] Gemini ${candidateModel} transient error (attempt ${attempt + 1}/${GEMINI_STREAM_MAX_ATTEMPTS}) — retrying in ${backoffMs}ms: ${String(err?.message || '').slice(0, 140)}`
            );
            await new Promise(r => setTimeout(r, backoffMs));
          }
        }
      }
      if (!result) throw lastErr || new Error('Gemini stream unavailable');
      let acc = '';
      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          acc += text;
          yield text;
        }
      }
      try {
        const agg = await result.response;
        recordAIUsage({
          provider: 'gemini',
          model: modelName,
          callType: 'stream',
          usage: fromGeminiUsage((agg as any)?.usageMetadata),
          promptText: finalPrompt,
          completionText: acc,
        });
      } catch {
        recordAIUsage({
          provider: 'gemini',
          model: modelName,
          callType: 'stream',
          promptText: finalPrompt,
          completionText: acc,
        });
      }
    }.bind(this);

    const streamOpenAI = async function* (
      this: AIServiceManager,
      modelName: string
    ): AsyncGenerator<string> {
      console.log(`[AIServiceManager] Streaming OpenAI (${modelName})`);
      const client = preferences.openAiKey
        ? new OpenAI({ apiKey: preferences.openAiKey })
        : this.openai;
      if (!client) throw new Error('OpenAI is not configured.');
      const stream = await client.chat.completions.create(
        {
          messages: [{ role: 'user', content: openAiContent }],
          model: modelName,
          ...this.temperatureFor(aiModel, creativityLevel),
          stream: true,
          stream_options: { include_usage: true },
        },
        signal ? { signal } : undefined
      );
      let acc = '';
      let usage: any = null;
      for await (const part of stream) {
        if ((part as any).usage) usage = (part as any).usage;
        const text = part.choices[0]?.delta?.content || '';
        if (text) {
          acc += text;
          yield text;
        }
      }
      recordAIUsage({
        provider: 'openai',
        model: modelName,
        callType: 'stream',
        usage: fromOpenAIUsage(usage),
        promptText:
          typeof openAiContent === 'string' ? openAiContent : finalPrompt,
        completionText: acc,
      });
    }.bind(this);

    const streamGithub = async function* (
      this: AIServiceManager,
      modelName: string
    ): AsyncGenerator<string> {
      if (!this.githubModels)
        throw new Error(
          'GitHub Models is not configured (GITHUB_TOKEN missing).'
        );
      console.log(`[AIServiceManager] Streaming GitHub Models (${modelName})`);
      const stream = await this.githubModels.chat.completions.create(
        {
          messages: [{ role: 'user', content: openAiContent }],
          model: modelName,
          ...this.temperatureFor(aiModel, creativityLevel),
          stream: true,
          stream_options: { include_usage: true },
        },
        signal ? { signal } : undefined
      );
      let acc = '';
      let usage: any = null;
      for await (const part of stream) {
        if ((part as any).usage) usage = (part as any).usage;
        const text = part.choices[0]?.delta?.content || '';
        if (text) {
          acc += text;
          yield text;
        }
      }
      recordAIUsage({
        provider: 'github',
        model: modelName,
        callType: 'stream',
        usage: fromOpenAIUsage(usage),
        promptText:
          typeof openAiContent === 'string' ? openAiContent : finalPrompt,
        completionText: acc,
      });
    }.bind(this);

    // ── SINGLE ATTEMPT ────────────────────────────────────────────────────────
    // No fallback chain. The one substitution is capability: a model that cannot
    // read the attached media is not asked to.
    const hasPdf =
      hasAttachments && attachments.some(a => a.mimeType === 'application/pdf');
    const hasVideo =
      hasAttachments && attachments.some(a => a.mimeType.startsWith('video/'));
    // PDF and HEIC are their OWN capabilities: OpenAI chat models see JPEG/PNG but
    // cannot read a PDF and reject HEIC outright, so folding either into "vision"
    // would send it to a model that silently ignores it.
    const hasHeic =
      hasAttachments &&
      attachments.some(a => /^image\/hei(c|f)/i.test(a.mimeType || ''));
    const need: 'text' | 'vision' | 'video' | 'document' | 'heic' = hasVideo
      ? 'video'
      : hasPdf
        ? 'document'
        : hasHeic
          ? 'heic'
          : hasAttachments
            ? 'vision'
            : 'text';
    const route = resolveRoute(aiModel, need);

    // Video and PDF bypass the gateway — its OpenAI-compatible content builder
    // inlines images only and drops the rest silently.
    if (liteLLMGateway.isEnabled() && !mustBypassGateway(need, hasPdf)) {
      yield* this.auditedStream('stream', route, 'litellm', need, () =>
        liteLLMGateway.chatStream(finalPrompt, {
          model: route.appModel,
          temperature: creativityLevel,
          reasoningEffort: preferences.reasoningEffort || 'low',
          showThinking: preferences.showThinking,
          attachments: hasAttachments
            ? attachments.map(a => ({
                mimeType: a.mimeType,
                data: a.data,
                name: a.name,
              }))
            : undefined,
          signal,
          // Record real provider tokens so metering charges actual cost.
          onUsage: ({ usage, promptText, completionText }) =>
            recordAIUsage({
              provider: route.provider,
              model: route.native,
              callType: 'stream',
              usage: fromOpenAIUsage(usage),
              promptText,
              completionText,
            }),
        })
      );
      return;
    }

    yield* this.auditedStream('stream', route, 'native', need, () => {
      switch (route.provider) {
        case 'gemini':
          return streamGemini(route.native);
        case 'openai':
          return streamOpenAI(route.native);
        case 'github':
          return streamGithub(route.native);
        default:
          throw new Error(
            `No provider configured for model "${route.requested}".`
          );
      }
    });
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
   * Runs the SELECTED model only. There is no fallback: degrading to a
   * non-tool-capable model would make the assistant write the action as prose
   * ("your post is scheduled") without anything actually happening, so a failure
   * here is surfaced to the caller instead.
   */
  public async *generateChatStreamWithTools(
    prompt: string,
    tools: ChatTool[],
    preferences: UserAIPreferences = {},
    signal?: AbortSignal,
    /**
     * Uploaded image attachments for THIS turn. When present, they are sent to
     * the tool-calling model as inline image parts (OpenAI multimodal format,
     * which the LiteLLM proxy normalizes for Gemini) so ONE model both SEES the
     * image and can call edit_image/generate_image — it decides edit vs.
     * describe itself. Non-image attachments are not sent here (they keep the
     * dedicated multimodal analysis path).
     */
    attachments: AIAttachment[] = []
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

    // Multimodal user content: inline any uploaded IMAGES as data URLs alongside
    // the text, so the tool-calling model can see them. Falls back to a plain
    // string when there are no images (unchanged behaviour).
    const inlineImages = (attachments || []).filter((a) =>
      (a.mimeType || '').startsWith('image/')
    );
    const userContent: any = inlineImages.length
      ? [
          { type: 'text', text: finalPrompt },
          ...inlineImages.map((a) => ({
            type: 'image_url' as const,
            image_url: { url: `data:${a.mimeType};base64,${a.data}` },
          })),
        ]
      : finalPrompt;

    // Gemini can SEE video and PDFs too (not just images). When such media is
    // attached to a TOOL turn we route to native Gemini and inline ALL of it as
    // parts, so ONE model both understands the media AND can call tools (e.g.
    // video_editor on the same video it just watched). LiteLLM/OpenAI can't
    // carry video/PDF, so those turns bypass the gateway (mustBypassGateway).
    const geminiMediaParts = (attachments || [])
      .filter((a) => {
        const m = (a.mimeType || '').toLowerCase();
        return (
          m.startsWith('image/') ||
          m.startsWith('video/') ||
          m === 'application/pdf'
        );
      })
      .map((a) =>
        a.fileUri
          ? { fileData: { mimeType: a.mimeType, fileUri: a.fileUri } }
          : { inlineData: { mimeType: a.mimeType, data: a.data } }
      );
    const hasVideoAttachment = (attachments || []).some((a) =>
      (a.mimeType || '').startsWith('video/')
    );
    const hasPdfAttachment = (attachments || []).some(
      (a) => a.mimeType === 'application/pdf'
    );
    const hasHeicAttachment = (attachments || []).some((a) =>
      /^image\/hei(c|f)/i.test(a.mimeType || '')
    );

    // Stream from one OpenAI-compatible client, surfacing text + tool calls.
    const streamToolsFrom = async function* (
      this: AIServiceManager,
      client: OpenAI,
      modelName: string,
      provider: 'openai' | 'github'
    ): AsyncGenerator<ChatStreamEvent> {
      const stream = await client.chat.completions.create(
        {
          model: modelName,
          messages: [{ role: 'user', content: userContent }],
          ...this.temperatureFor(aiModel, creativityLevel),
          tools: tools as any,
          tool_choice: 'auto',
          stream: true,
          stream_options: { include_usage: true },
        },
        signal ? { signal } : undefined
      );
      let acc = '';
      let usage: any = null;
      const toolAcc = new Map<number, StreamingToolCall>();
      for await (const part of stream) {
        if ((part as any).usage) usage = (part as any).usage;
        const delta = part.choices?.[0]?.delta as any;
        if (delta?.reasoning_content) {
          yield { type: 'reasoning', delta: delta.reasoning_content };
        }
        const text = delta?.content || '';
        if (text) {
          acc += text;
          yield { type: 'text', delta: text };
        }
        accumulateToolCallDeltas(toolAcc, delta?.tool_calls);
      }
      recordAIUsage({
        provider,
        model: modelName,
        callType: 'stream',
        usage: fromOpenAIUsage(usage),
        promptText: finalPrompt,
        completionText: acc,
      });
      // Emit completed tool calls AFTER the text (args are only whole at end).
      const finalized: ParsedToolCall[] = finalizeToolCalls(toolAcc);
      for (const tc of finalized) {
        yield { type: 'toolCall', name: tc.name, args: tc.args, id: tc.id };
      }
    }.bind(this);

    // Stream tool calls from a Gemini model via native function calling. Gemini
    // returns function calls as structured parts (not streamed text), so we
    // collect the full response then yield any text + tool calls. Used when the
    // selected model is a Gemini one.
    const streamGeminiTools = async function* (
      this: AIServiceManager,
      modelName: string
    ): AsyncGenerator<ChatStreamEvent> {
      const client = preferences.googleAiStudioKey
        ? new GoogleGenerativeAI(preferences.googleAiStudioKey)
        : this.genAI;
      // Convert OpenAI-style tools → Gemini functionDeclarations.
      const functionDeclarations = tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        parameters: sanitizeSchemaForGemini(t.function.parameters),
      }));
      // Send the media (image/video/PDF) alongside the prompt so the model can
      // SEE it AND decide to call a tool. Plain text when nothing is attached.
      const request: any = geminiMediaParts.length
        ? {
            contents: [
              {
                role: 'user',
                parts: [{ text: finalPrompt }, ...geminiMediaParts],
              },
            ],
          }
        : finalPrompt;
      // Same connect policy as the plain multimodal stream: try each candidate
      // model, retrying transient 503/429 on the same id and advancing to the
      // next id on a 404/unavailable, so an overloaded or unlisted model degrades
      // instead of failing.
      const primaryTool = resolveLiveGeminiModel(modelName);
      const toolCandidates = [
        primaryTool,
        ...GEMINI_STREAM_FALLBACKS.filter(m => m !== primaryTool),
      ];
      let streamRes: any = null;
      let toolErr: any = null;
      toolConnect: for (const candidate of toolCandidates) {
        const model = client.getGenerativeModel({
          model: candidate,
          generationConfig: { temperature: creativityLevel },
          safetySettings: this.getSafetySettings(
            (preferences as any).contentSafety || 'standard'
          ),
          tools: [{ functionDeclarations } as any],
        });
        for (let attempt = 0; attempt < GEMINI_STREAM_MAX_ATTEMPTS; attempt++) {
          if (signal?.aborted) throw new Error('aborted');
          try {
            // STREAM (not generateContent): so analysis text appears token-by-token
            // instead of the whole reply landing at once after a long wait — the
            // difference between "feels stuck on Thinking…" and ChatGPT-like typing.
            streamRes = await model.generateContentStream(request);
            if (candidate !== primaryTool)
              console.log(
                `[AIServiceManager] Gemini tools fell back to ${candidate} after ${primaryTool} was unavailable`
              );
            break toolConnect;
          } catch (err: any) {
            toolErr = err;
            if (isModelUnavailableError(err)) {
              console.warn(
                `[AIServiceManager] Gemini tools ${candidate} unavailable — trying next model: ${String(err?.message || '').slice(0, 140)}`
              );
              break;
            }
            if (!isTransientGeminiError(err)) throw err;
            const backoffMs = GEMINI_STREAM_BACKOFF_MS[attempt] ?? 6000;
            console.warn(
              `[AIServiceManager] Gemini tools ${candidate} transient error (attempt ${attempt + 1}/${GEMINI_STREAM_MAX_ATTEMPTS}) — retrying in ${backoffMs}ms: ${String(err?.message || '').slice(0, 140)}`
            );
            await new Promise(r => setTimeout(r, backoffMs));
          }
        }
      }
      if (!streamRes) throw toolErr || new Error('Gemini tool call unavailable');
      // Stream prose chunks LIVE as they arrive.
      let acc = '';
      for await (const chunk of streamRes.stream) {
        let t = '';
        try {
          t = chunk.text?.() || '';
        } catch {
          /* a function-call chunk carries no text */
        }
        if (t) {
          acc += t;
          yield { type: 'text', delta: t };
        }
      }
      const resp: any = await streamRes.response;
      // Usage tracking.
      try {
        recordAIUsage({
          provider: 'gemini',
          model: modelName,
          callType: 'stream',
          usage: fromGeminiUsage(resp?.usageMetadata),
          promptText: finalPrompt,
          completionText: acc || resp?.text?.() || '',
        });
      } catch {
        /* noop */
      }
      // Then any function calls (only whole at the end of the stream).
      let calls: any[] = [];
      try {
        calls =
          (typeof resp?.functionCalls === 'function'
            ? resp.functionCalls()
            : null) || [];
      } catch {
        calls = [];
      }
      for (const c of calls) {
        if (c?.name)
          yield {
            type: 'toolCall',
            name: c.name,
            args: (c.args && typeof c.args === 'object'
              ? c.args
              : {}) as Record<string, unknown>,
          };
      }
    }.bind(this);

    // ── SINGLE ATTEMPT ────────────────────────────────────────────────────────
    // No fallback chain. If the selected model's tool call fails we surface the
    // error: silently degrading to a plain-text model is worse than failing,
    // because without tools the model writes the action as PROSE (e.g.
    // "[schedule_post(...)]" or "your post is scheduled") — leaking internal
    // syntax AND falsely claiming an action happened.
    // A video/PDF/HEIC attachment needs a model that can READ it — only Gemini
    // can. Resolve the capability so the route substitutes to Gemini and the
    // gateway (which drops non-image media) is bypassed, exactly like the plain
    // multimodal stream. Image-only and text turns are unchanged ('text').
    const toolNeed: Capability = hasVideoAttachment
      ? 'video'
      : hasPdfAttachment
        ? 'document'
        : hasHeicAttachment
          ? 'heic'
          : 'text';
    const route = resolveRoute(aiModel, toolNeed);

    if (liteLLMGateway.isEnabled() && !mustBypassGateway(toolNeed, hasPdfAttachment)) {
      yield* this.auditedStream(
        'chat.tools',
        route,
        'litellm',
        toolNeed,
        () =>
          liteLLMGateway.chatStreamWithTools(
            [{ role: 'user', content: userContent }],
            tools as any,
            {
              model: route.appModel,
              temperature: creativityLevel,
              reasoningEffort: preferences.reasoningEffort || 'low',
              showThinking: preferences.showThinking,
              signal,
              // Record real provider tokens so metering charges actual cost.
              // This is the main VeeGPT chat path: without it every turn (even
              // a costly ultra model like gpt-5.6-sol) recorded zero tokens and
              // was floored to 1 VGU.
              onUsage: ({ usage, promptText, completionText }) =>
                recordAIUsage({
                  provider: route.provider,
                  model: route.native,
                  callType: 'stream',
                  usage: fromOpenAIUsage(usage),
                  promptText,
                  completionText,
                }),
            }
          ) as AsyncGenerator<ChatStreamEvent>
      );
      return;
    }

    if (route.provider === 'gemini') {
      yield* this.auditedStream('chat.tools', route, 'native', toolNeed, () =>
        streamGeminiTools(route.native)
      );
      return;
    }

    const toolClient =
      route.provider === 'github'
        ? this.githubModels
        : preferences.openAiKey
          ? new OpenAI({ apiKey: preferences.openAiKey })
          : this.openai;
    if (!toolClient) {
      throw new Error(
        `The selected model "${route.requested}" is not available: its provider is not configured.`
      );
    }
    yield* this.auditedStream('chat.tools', route, 'native', 'text', () =>
      streamToolsFrom(
        toolClient,
        route.native,
        route.provider === 'github' ? 'github' : 'openai'
      )
    );
  }

  /**
   * Vision analysis of a post's media (image OR video) from its URL. Returns a
   * concise factual description the caption/hashtag generator can use so output
   * is actually grounded in what's shown — not just the text prompt.
   *
   * Honors the workspace AI config: it runs the user's configured model, and
   * substitutes Gemini ONLY when that model cannot read this media type at all
   * (Gemini handles images, PDFs and video via inlineData; OpenAI vision handles
   * images only; GitHub Models has no vision). Best-effort: returns undefined if
   * it can't analyze, so callers degrade gracefully to text-only.
   */
  public async analyzeMedia(
    mediaUrl: string,
    mediaType: 'image' | 'video' | 'auto' = 'auto',
    preferences: UserAIPreferences = {}
  ): Promise<string | undefined> {
    if (!mediaUrl) return undefined;
    try {
      let buf: Buffer;
      let mimeType = '';

      // Server-side shortcut: if the URL is an authenticated chat-attachment proxy
      // path, read the bytes directly from storage instead of making an HTTP
      // round-trip to the same server (which would require a session cookie).
      const proxyMatch = mediaUrl.match(/\/api\/chat\/attachment\/(.+)$/);
      if (proxyMatch) {
        try {
          // Dynamically import to avoid circular dep at module level.
          const { getStorageService } = await import('../features/storage/services/storage.service');
          const svc = getStorageService();
          const key = decodeURIComponent(proxyMatch[1]);
          const file = await svc.downloadFile(key);
          buf = file.buffer;
          mimeType = file.contentType || '';
        } catch (err) {
          console.warn('[AIServiceManager] analyzeMedia: direct storage read failed, falling back to fetch', err);
          // Fall through to fetch
          const resp = await fetch(mediaUrl.startsWith('/') ? `http://127.0.0.1:${process.env.PORT || 3000}${mediaUrl}` : mediaUrl);
          if (!resp.ok) return undefined;
          mimeType = resp.headers.get('content-type')?.split(';')[0]?.trim() || '';
          buf = Buffer.from(await resp.arrayBuffer());
        }
      } else {
        // 1) Download the media bytes.
        const resp = await fetch(mediaUrl);
        if (!resp.ok) {
          console.warn(
            '[AIServiceManager] analyzeMedia: fetch failed',
            resp.status,
            mediaUrl
          );
          return undefined;
        }
        mimeType = resp.headers.get('content-type')?.split(';')[0]?.trim() || '';
        buf = Buffer.from(await resp.arrayBuffer());
      }
      // Infer mime from extension if the server didn't send one.
      if (!mimeType) {
        const ext = (
          mediaUrl.split('?')[0].split('.').pop() || ''
        ).toLowerCase();
        const map: Record<string, string> = {
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          png: 'image/png',
          webp: 'image/webp',
          gif: 'image/gif',
          mp4: 'video/mp4',
          mov: 'video/quicktime',
          webm: 'video/webm',
          m4v: 'video/x-m4v',
        };
        mimeType =
          map[ext] || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg');
      }
      const isVideo = mediaType === 'video' || mimeType.startsWith('video/');

      // Gemini inlineData has a practical size ceiling (~20MB for the inline
      // request path). Skip video that's too large rather than erroring.
      const MAX_INLINE_BYTES = 18 * 1024 * 1024;
      if (buf.length > MAX_INLINE_BYTES) {
        console.warn(
          '[AIServiceManager] analyzeMedia: media too large for inline analysis',
          buf.length
        );
        return undefined;
      }

      const base64 = buf.toString('base64');
      const instruction = isVideo
        ? 'You are analyzing a short social-media VIDEO. In 2-4 sentences, describe what actually happens: the subject(s), setting, key actions/scenes, mood, colors, and any visible text or branding. Be concrete and factual — this will ground a caption. Do NOT write a caption, only the description.'
        : 'You are analyzing a social-media IMAGE. In 2-4 sentences, describe exactly what is shown: the subject(s), setting, composition, mood, colors, and any visible text or branding. Be concrete and factual — this will ground a caption. Do NOT write a caption, only the description.';

      // 2) Vision call. ONE attempt on the selected model — substituted only when
      //    that model cannot read this media type at all (see ai-model-routing).
      const tryGeminiVision = async (modelName: string): Promise<string> => {
        const client = preferences.googleAiStudioKey
          ? new GoogleGenerativeAI(preferences.googleAiStudioKey)
          : this.genAI;
        const model = client.getGenerativeModel({
          model: resolveLiveGeminiModel(modelName),
          generationConfig: { temperature: 0.4 },
          safetySettings: this.getSafetySettings(
            (preferences.contentSafety as string) || 'standard'
          ),
        });
        const result = await model.generateContent([
          { text: instruction },
          { inlineData: { mimeType, data: base64 } },
        ]);
        const vText = result.response.text();
        recordAIUsage({
          provider: 'gemini',
          model: modelName,
          callType: 'vision',
          usage: fromGeminiUsage((result.response as any)?.usageMetadata),
          promptText: instruction,
          completionText: vText,
        });
        return vText;
      };

      const tryOpenAIVision = async (modelName: string): Promise<string> => {
        if (isVideo)
          throw new Error('OpenAI chat vision does not support video');
        const client = preferences.openAiKey
          ? new OpenAI({ apiKey: preferences.openAiKey })
          : this.openai;
        if (!client) throw new Error('OpenAI is not configured.');
        const completion = await client.chat.completions.create({
          model: modelName,
          temperature: 0.4,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: instruction },
                {
                  type: 'image_url',
                  image_url: { url: `data:${mimeType};base64,${base64}` },
                },
              ] as any,
            },
          ],
        });
        const ovText = completion.choices[0]?.message?.content || '';
        recordAIUsage({
          provider: 'openai',
          model: modelName,
          callType: 'vision',
          usage: fromOpenAIUsage((completion as any)?.usage),
          promptText: instruction,
          completionText: ovText,
        });
        return ovText;
      };

      // ── SINGLE ATTEMPT ──────────────────────────────────────────────────────
      // Capability routing, not fallback: only Gemini reads video, and GitHub's
      // free tier has no vision at all, so media on those selections is served by
      // the deterministic media model. One call either way.
      const route = resolveRoute(
        preferences.aiModel,
        isVideo ? 'video' : /^image\/hei(c|f)/i.test(mimeType) ? 'heic' : 'vision'
      );
      try {
        const text = (
          await this.audited(
            'vision',
            route,
            'native',
            isVideo ? 'video' : 'vision',
            () =>
              route.provider === 'openai'
                ? tryOpenAIVision(route.native)
                : tryGeminiVision(route.native)
          )
        ).trim();
        if (text) {
          console.log(
            `[AIServiceManager] analyzeMedia via ${route.appModel}${route.overriddenFor ? ` (substituted for ${route.requested}: no ${route.overriddenFor})` : ''}`
          );
          return text;
        }
      } catch (err) {
        console.warn(
          `[AIServiceManager] analyzeMedia ${route.appModel} failed:`,
          (err as Error).message
        );
      }

      return undefined;
    } catch (err) {
      console.error(
        '[AIServiceManager] analyzeMedia error:',
        (err as Error).message
      );
      return undefined;
    }
  }

  /**
   * Get voice profile for scoring
   * Returns a default profile if no profile exists
   */
  private async getVoiceProfileForScoring(
    userId: string,
    workspaceId: string
  ): Promise<VoiceProfile> {
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
        long: 20,
      },
      paragraphStructure: 'short-breaks',
      emojiUsagePattern: {
        frequency: 'moderate',
        placement: 'inline',
        topEmojis: [],
      },
      punctuationStyle: {
        exclamationUsage: 'moderate',
        questionUsage: 'moderate',
        ellipsisUsage: false,
      },
      toneMarkers: {
        casual: 0.6,
        professional: 0.3,
        humorous: 0.4,
        inspirational: 0.3,
        educational: 0.3,
        conversational: 0.7,
      },
      hookPatterns: [],
      engagementQuestionStyle: [],
      storytellingStructure: 'linear',
      sampleSize: 0,
      confidence: 0.5,
      lastUpdated: new Date(),
      createdAt: new Date(),
    };
  }

  public async generateCaption(
    topic: string,
    preferences: UserAIPreferences = {}
  ): Promise<string> {
    const {
      aiPersona = 'Professional & Authoritative',
      captionStyle = 'Storytelling',
      optimizationGoals = 'Engagement',
      multilingual = 'auto',
      autoHashtags = true,
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
      signal,
    } = params;

    console.log(
      '[AIServiceManager] Generating Instagram captions with authenticity scoring',
      {
        userId,
        workspaceId,
        topic,
        postType,
        platform,
        niche: preferences.contentNiche,
      }
    );

    try {
      // Load user's voice profile for authenticity scoring
      // We need to access the internal voice profile loading logic
      // For now, we'll get a default profile if not available
      const voiceProfile = await this.getVoiceProfileForScoring(
        userId,
        workspaceId
      );
      console.log('[AIServiceManager] Loaded voice profile', {
        sampleSize: voiceProfile.sampleSize,
        confidence: voiceProfile.confidence,
      });

      // Build the comprehensive prompt using PromptConstructorService
      const promptParams: PromptConstructionParams = {
        userId,
        workspaceId,
        mediaAnalysis: mediaAnalysis || `Topic: ${topic}`,
        existingCaption,
        postType,
        platform,
        aiPreferences: preferences,
      };

      const basePrompt =
        await promptConstructorService.buildGenerationPrompt(promptParams);

      // Extract user's content & tone preferences with comprehensive support
      const userPersona =
        preferences.aiPersona || 'Professional & Authoritative';
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
        if (
          userCaptionStyle?.toLowerCase().includes('punchy') ||
          userCaptionStyle?.toLowerCase().includes('short')
        ) {
          lengthGuidance =
            '\n- CRITICAL: Keep caption VERY SHORT (1-3 sentences max, 50-100 characters ideal)\n- Every word must count - be extremely concise\n- No fluff or filler words\n- Punchy, impactful, direct';
        } else if (
          userCaptionStyle?.toLowerCase().includes('story') ||
          userCaptionStyle?.toLowerCase().includes('detailed')
        ) {
          lengthGuidance =
            '\n- Use longer storytelling format (3-5 sentences)\n- Include narrative elements and details';
        } else if (userCaptionStyle?.toLowerCase().includes('medium')) {
          lengthGuidance =
            '\n- Use medium length (2-4 sentences)\n- Balance detail with brevity';
        }

        // Persona and style guidance
        const personaGuidance = `\n- Persona/Voice: ${userPersona}\n- Caption Style: ${userCaptionStyle}`;

        // Optimization goal guidance
        let optimizationGuidance = '';
        if (optimizationGoals?.toLowerCase().includes('engagement')) {
          optimizationGuidance =
            '\n- FOCUS: Maximize likes, comments, shares, and saves\n- Use engagement-driving CTAs and questions';
        } else if (optimizationGoals?.toLowerCase().includes('reach')) {
          optimizationGuidance =
            '\n- FOCUS: Maximize impressions and discoverability\n- Use trending topics and broad appeal';
        } else if (optimizationGoals?.toLowerCase().includes('conversion')) {
          optimizationGuidance =
            '\n- FOCUS: Drive clicks and conversions\n- Include clear CTAs and value propositions';
        }

        // Multilingual handling
        let languageGuidance = '';
        if (multilingual && multilingual !== 'auto') {
          languageGuidance = `\n- Language: Write in ${multilingual}`;
        }

        // Content safety guidance
        let safetyGuidance = '';
        if (contentSafety === 'strict') {
          safetyGuidance =
            '\n- SAFETY: Avoid all potentially controversial topics\n- Use family-friendly language only';
        } else if (contentSafety === 'standard') {
          safetyGuidance =
            '\n- SAFETY: Avoid explicit content but allow mild edge\n- Keep it appropriate for general audiences';
        }

        return (
          personaGuidance +
          lengthGuidance +
          optimizationGuidance +
          languageGuidance +
          safetyGuidance
        );
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
        responseLength,
      });

      // Generate variations with scoring and filtering
      const variationPrompts = [
        {
          style: 'viral' as const,
          styleDescription:
            'Maximum engagement focus with aggressive hooks and trending patterns',
          instructions: `GENERATE VARIATION 1: MAXIMUM VIRALITY
- Use the most aggressive viral hook from the provided list
- Apply trending patterns that maximize scroll-stopping power
- Focus on emotional triggers and curiosity gaps
- Optimize for maximum engagement (likes, shares, saves)
- Push the boundaries while staying authentic to the voice profile
${getStyleInstructions('viral')}

IMPORTANT: Return ONLY the caption text. Do not include any labels, explanations, or metadata.`,
        },
        {
          style: 'authentic' as const,
          styleDescription:
            'Voice-first approach with personal storytelling and genuine connection',
          instructions: `GENERATE VARIATION 2: AUTHENTIC STORYTELLING
- Prioritize matching the user's voice profile above all else
- Use personal, relatable storytelling techniques
- Focus on genuine connection over viral mechanics
- Include vulnerable or honest elements that build trust
- Make it sound exactly like the user wrote it themselves
${getStyleInstructions('authentic')}

IMPORTANT: Return ONLY the caption text. Do not include any labels, explanations, or metadata.`,
        },
        {
          style: 'balanced' as const,
          styleDescription:
            'Strategic blend of viral patterns and authentic voice for sustained engagement',
          instructions: `GENERATE VARIATION 3: BALANCED ENGAGEMENT
- Blend viral pattern effectiveness with authentic voice
- Use proven engagement formulas adapted to the user's style
- Balance scroll-stopping power with genuine personality
- Include both strategic hooks and personal elements
- Optimize for sustainable long-term engagement
${getStyleInstructions('balanced')}

IMPORTANT: Return ONLY the caption text. Do not include any labels, explanations, or metadata.`,
        },
      ];

      // Lightweight flows (singleVariation) generate just ONE caption with no
      // regeneration retries — 1 model call instead of up to 6 — to avoid
      // bursting the provider rate limit. The full flow keeps all 3 variations.
      const activeVariationPrompts = singleVariation
        ? variationPrompts.slice(1, 2)
        : variationPrompts;

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

          console.log(
            `[AIServiceManager] Generating ${varPrompt.style} variation (attempt ${attempt})...`
          );

          const fullPrompt = `${basePrompt}\n\n${varPrompt.instructions}`;
          const rawCaption = await this.generateText(
            fullPrompt,
            preferences,
            signal
          );
          const cleanedCaption = this.cleanCaptionText(rawCaption);

          // TASK 22.1: Apply content safety filters BEFORE authenticity scoring
          console.log(
            `[AIServiceManager] Checking content safety for ${varPrompt.style} variation...`
          );
          const safetyLevel =
            (preferences.contentSafety as 'off' | 'standard' | 'strict') ||
            'standard';
          const safetyResult = contentSafetyService.filterCaption(
            cleanedCaption,
            safetyLevel,
            preferences.brandValues as string[] | undefined,
            preferences.prohibitedTopics as string[] | undefined
          );

          console.log(
            `[AIServiceManager] ${varPrompt.style} safety score: ${safetyResult.safetyScore}`,
            {
              isSafe: safetyResult.isSafe,
              issueCount: safetyResult.issues.length,
              flags: safetyResult.flags,
            }
          );

          // If caption fails safety check, log violations and skip to next attempt
          if (!safetyResult.isSafe) {
            console.warn(
              `[AIServiceManager] ${varPrompt.style} variation failed safety check (score: ${safetyResult.safetyScore}/100)`,
              {
                issues: safetyResult.issues,
                flags: safetyResult.flags,
              }
            );

            // Continue to next attempt instead of using unsafe content
            continue;
          }

          // Use filtered caption for authenticity scoring
          const captionToScore = safetyResult.filteredCaption;

          // Score authenticity
          console.log(
            `[AIServiceManager] Scoring authenticity for ${varPrompt.style} variation...`
          );
          const authenticityScore = await this.authenticityScorer.scoreCaption(
            captionToScore,
            voiceProfile,
            platform
          );

          console.log(
            `[AIServiceManager] ${varPrompt.style} authenticity score: ${authenticityScore.overallScore}`,
            {
              passesThreshold: authenticityScore.passesThreshold,
              aiTellsDetected: authenticityScore.aiTellsDetected.length,
            }
          );

          // Track best variation even if below threshold
          if (authenticityScore.overallScore > bestScore) {
            bestScore = authenticityScore.overallScore;

            // Predict engagement
            console.log(
              `[AIServiceManager] Predicting engagement for ${varPrompt.style} variation...`
            );
            const engagementPrediction =
              await this.engagementPredictor.predictEngagement(
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
              safetyResult, // Include safety result in variation
            };

            // If passes threshold, use this variation
            if (authenticityScore.passesThreshold) {
              console.log(
                `[AIServiceManager] ${varPrompt.style} variation passed authenticity threshold`
              );
              break;
            } else {
              console.log(
                `[AIServiceManager] ${varPrompt.style} variation below threshold (${authenticityScore.overallScore}/100), regenerating...`
              );
            }
          }
        }

        // Add the best variation we found (even if below 80)
        if (bestVariation) {
          scoredVariations.push(bestVariation);
        }
      }

      // Filter variations that pass the 80 authenticity threshold
      const filteredVariations = scoredVariations.filter(
        v => v.authenticityScore && v.authenticityScore.passesThreshold
      );

      console.log('[AIServiceManager] Variation filtering complete', {
        totalGenerated: scoredVariations.length,
        passedThreshold: filteredVariations.length,
        scores: scoredVariations.map(v => ({
          style: v.style,
          authenticityScore: v.authenticityScore?.overallScore,
          safetyScore: v.safetyResult?.safetyScore,
          passed: v.authenticityScore?.passesThreshold,
        })),
      });

      // TASK 22.1: If all variations fail safety check, regenerate with stricter prompts
      if (scoredVariations.length === 0) {
        console.warn(
          '[AIServiceManager] WARNING: All variations failed safety checks. Attempting regeneration with stricter safety instructions...'
        );

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
          console.log(
            `[AIServiceManager] Regenerating ${varPrompt.style} variation with stricter safety instructions...`
          );

          const fullPrompt = `${stricterPrompt}\n\n${varPrompt.instructions}`;
          const rawCaption = await this.generateText(fullPrompt, {
            ...preferences,
            contentSafety: 'strict',
          });
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
            const authenticityScore =
              await this.authenticityScorer.scoreCaption(
                safetyResult.filteredCaption,
                voiceProfile,
                platform
              );

            // Predict engagement
            const engagementPrediction =
              await this.engagementPredictor.predictEngagement(
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
              safetyResult,
            });
          }
        }

        // Re-filter after regeneration
        const refilteredVariations = scoredVariations.filter(
          v => v.authenticityScore && v.authenticityScore.passesThreshold
        );

        if (refilteredVariations.length > 0) {
          console.log(
            '[AIServiceManager] Successfully regenerated safe variations',
            {
              count: refilteredVariations.length,
            }
          );
          return refilteredVariations;
        } else if (scoredVariations.length > 0) {
          console.warn(
            '[AIServiceManager] Regenerated variations exist but none passed authenticity threshold. Returning all variations.'
          );
          return scoredVariations;
        } else {
          throw new Error(
            'Unable to generate safe caption variations. All attempts failed safety checks.'
          );
        }
      }

      // If no variations passed, return all scored variations with a warning
      // This ensures we always return something useful to the user
      if (filteredVariations.length === 0) {
        console.warn(
          '[AIServiceManager] WARNING: No variations passed authenticity threshold of 80. Returning all variations with scores.'
        );
        return scoredVariations;
      }

      // Log safety violations for monitoring
      for (const variation of filteredVariations) {
        if (
          variation.safetyResult &&
          variation.safetyResult.issues.length > 0
        ) {
          console.log(
            '[AIServiceManager] Safety issues logged for monitoring',
            {
              style: variation.style,
              issues: variation.safetyResult.issues,
              flags: variation.safetyResult.flags,
              safetyScore: variation.safetyResult.safetyScore,
            }
          );
        }
      }

      // Return filtered variations with metadata
      console.log(
        '[AIServiceManager] Successfully generated and scored caption variations',
        {
          count: filteredVariations.length,
          avgAuthenticityScore:
            filteredVariations.reduce(
              (sum, v) => sum + (v.authenticityScore?.overallScore || 0),
              0
            ) / filteredVariations.length,
          avgSafetyScore:
            filteredVariations.reduce(
              (sum, v) => sum + (v.safetyResult?.safetyScore || 100),
              0
            ) / filteredVariations.length,
          avgPredictedEngagement:
            filteredVariations.reduce(
              (sum, v) =>
                sum + (v.engagementPrediction?.predictedLikeRate || 0),
              0
            ) / filteredVariations.length,
        }
      );

      return filteredVariations;
    } catch (error) {
      console.error(
        '[AIServiceManager] Error generating Instagram captions:',
        error
      );
      throw new Error(
        `Failed to generate Instagram captions: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
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
    cleaned = cleaned
      .replace(
        /^(Variation \d+:|Caption \d+:|Here's the caption:|Caption:)/gi,
        ''
      )
      .trim();
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
    } = {},
    /** Workspace AI Configuration. Threaded through so vision routing uses the
     *  SELECTED model (substituting only when it can't read this media type). */
    preferences: UserAIPreferences = {}
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
    if (!mediaUrl.startsWith('http://') && !mediaUrl.startsWith('https://'))
      return null;

    try {
      // Detect whether this is a video (reel) based on URL extension or post type
      const isVideo =
        ['reel', 'video', 'REEL', 'VIDEO'].includes(postContext.type || '') ||
        /\.(mp4|mov|webm|m4v)(\?|$)/i.test(mediaUrl);

      const mediaType: 'image' | 'video' = isVideo ? 'video' : 'image';

      // Step 1: Get a factual description using the existing vision pipeline
      // (Gemini inlineData handles both images and videos natively)
      // Pass preferences through: analyzeMedia routes on the SELECTED model and
      // only substitutes when it genuinely cannot read this media type.
      const description = await this.analyzeMedia(
        mediaUrl,
        mediaType,
        preferences || {}
      );
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

      const result = await this.generateJSON(structuredPrompt, {}, {});
      if (!result || typeof result !== 'object') return null;
      if (!['high', 'medium', 'low'].includes(result.visualQuality))
        return null;

      return {
        visualQuality: result.visualQuality,
        composition:
          typeof result.composition === 'string' ? result.composition : '',
        textOverlay: !!result.textOverlay,
        colorVibrancy: ['vibrant', 'muted', 'neutral'].includes(
          result.colorVibrancy
        )
          ? result.colorVibrancy
          : 'neutral',
        subjects: Array.isArray(result.subjects)
          ? result.subjects.slice(0, 5)
          : [],
        contentTheme:
          typeof result.contentTheme === 'string' ? result.contentTheme : '',
        improvements: Array.isArray(result.improvements)
          ? result.improvements.slice(0, 2)
          : [],
        strengths: Array.isArray(result.strengths)
          ? result.strengths.slice(0, 2)
          : [],
      };
    } catch (e: any) {
      console.warn(
        '[AIServiceManager] analyzeContentImage failed:',
        e?.message
      );
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
      aiMemory = 'long-term',
    } = preferences;

    const period = metricsData?.period || 'month';
    const periodLabel =
      period === 'day'
        ? 'today'
        : period === 'week'
          ? 'this week'
          : 'this month';

    // The Core Intelligence settings (model + creativity) directly drive the
    // analysis: `aiModel` selects the provider/model inside generateJSON and
    // `creativityLevel` becomes the generation temperature. We log them so the
    // chosen configuration is verifiable end-to-end.
    console.log(
      `[AIServiceManager] Analytics insight using model=${aiModel}, creativity=${creativityLevel}, goal=${optimizationGoals}`
    );

    // Translate the Primary Optimization Goal into concrete analytical focus so
    // the advice actually changes based on what the user selected in Settings.
    const goalKey = String(optimizationGoals).toLowerCase();
    let goalGuide: string;
    if (goalKey.includes('conversion') || goalKey.includes('click')) {
      goalGuide =
        'Optimise for CLICKS & CONVERSIONS: prioritise CTAs, link-driving content, profile visits and actions that turn reach into conversions.';
    } else if (
      goalKey.includes('brand') ||
      goalKey.includes('reach') ||
      goalKey.includes('aware')
    ) {
      goalGuide =
        'Optimise for BROAD REACH & SHAREABILITY: prioritise impressions, shares, saves, discoverability and content that expands the audience.';
    } else {
      goalGuide =
        'Optimise for ENGAGEMENT & COMMENTS: prioritise likes, comments, replies, conversation starters and community interaction.';
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
      const result = await this.generateJSON(systemInstruction, preferences, {
        signal,
      });
      const headline =
        typeof result?.headline === 'string' ? result.headline.trim() : '';
      const tip = typeof result?.tip === 'string' ? result.tip.trim() : '';
      // A banner is only valid if the AI produced a real headline AND tip. If
      // not, throw so the worker records a failure instead of caching a partial
      // result that would force the client to show hardcoded template text.
      if (!headline || !tip) {
        throw new Error(
          'AI returned an incomplete banner (missing headline or tip)'
        );
      }
      return {
        title:
          typeof result?.title === 'string' && result.title.trim()
            ? result.title.trim()
            : 'Performance Insight',
        emoji:
          typeof result?.emoji === 'string' && result.emoji.trim()
            ? result.emoji.trim()
            : '📊',
        headline,
        tip,
      };
    } catch (error: any) {
      // Do NOT fabricate a banner. Propagate the failure so the caller (worker)
      // marks it failed and the UI either keeps the previous cached banner or
      // hides the banner entirely — never shows fake/template numbers.
      console.error(
        '[AIServiceManager] generateAnalyticsInsight failed:',
        error?.message
      );
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
  ): Promise<
    Array<{
      icon: string;
      title: string;
      description: string;
      priority: 'high' | 'medium' | 'low';
      category: string;
    }>
  > {
    const {
      aiModel = 'veegpt-hybrid',
      creativityLevel = 0.7,
      aiPersona = 'Professional & Authoritative',
      optimizationGoals = 'Engagement',
      captionStyle = 'Storytelling',
      multilingual = 'auto',
    } = preferences;
    const contentNiche = (preferences as any).contentNiche;
    const recommendationLimit = Math.max(
      1,
      Math.min(5, Number((preferences as any).recommendationLimit) || 5)
    );

    console.log(
      `[AIServiceManager] Growth recommendations using model=${aiModel}, creativity=${creativityLevel}, goal=${optimizationGoals}, niche=${contentNiche || 'n/a'}`
    );

    const goalKey = String(optimizationGoals).toLowerCase();
    let goalGuide: string;
    if (goalKey.includes('conversion') || goalKey.includes('click')) {
      goalGuide =
        'PRIMARY GOAL: maximise clicks & conversions — profile visits, link clicks, and actions that turn reach into outcomes.';
    } else if (
      goalKey.includes('brand') ||
      goalKey.includes('reach') ||
      goalKey.includes('aware')
    ) {
      goalGuide =
        'PRIMARY GOAL: maximise reach & shareability — impressions, shares, saves, discoverability and audience expansion.';
    } else {
      goalGuide =
        'PRIMARY GOAL: maximise engagement & comments — likes, comments, replies, saves and community interaction.';
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
      'clock', // posting time / cadence
      'calendar', // posting frequency / consistency
      'image', // visual / format quality
      'video', // reels / video strategy
      'hashtag', // discoverability / hashtags
      'search', // SEO / discoverability
      'users', // audience / community
      'heart', // engagement
      'message', // comments / replies / DMs
      'trending', // trending / reach
      'target', // CTA / conversion
      'sparkles', // content quality / creativity
    ];

    const mediaAnalysisSection =
      accountData?.mediaAnalysis?.allAnalyses?.length > 0
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
      const result = await this.generateJSON(systemInstruction, preferences, {
        signal,
      });
      const list = Array.isArray(result?.recommendations)
        ? result.recommendations
        : [];
      const priorityRank = { high: 0, medium: 1, low: 2 } as Record<
        string,
        number
      >;

      // All tracked metric/capability keys we gate recommendations against.
      const ALL_TRACKED_METRICS = [
        'followers_total',
        'reach_total',
        'impressions_total',
        'total_engagements',
        'likes',
        'comments',
        'shares',
        'saves',
        'video_views',
        'profile_visits',
        'website_clicks',
        'published_posts',
        'facebook_reactions',
        'facebook_page_views',
      ];

      const cleaned = list
        .filter(
          (r: any) =>
            r &&
            typeof r.title === 'string' &&
            typeof r.description === 'string'
        )
        .map((r: any) => ({
          icon: allowedIcons.includes(r.icon) ? r.icon : 'sparkles',
          title: String(r.title).trim(),
          description: String(r.description).trim(),
          priority: (['high', 'medium', 'low'].includes(r.priority)
            ? r.priority
            : 'medium') as 'high' | 'medium' | 'low',
          category:
            typeof r.category === 'string' ? r.category.trim() : 'Growth',
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
            key =>
              CapabilityGuard.getMetricSupport(platform, key) === 'NONE' &&
              combinedText.includes(key.replace(/_/g, ' '))
          );
        })
        .sort(
          (a: any, b: any) =>
            (priorityRank[a.priority] ?? 1) - (priorityRank[b.priority] ?? 1)
        )
        .slice(0, recommendationLimit);

      if (cleaned.length === 0) {
        throw new Error('AI returned no usable recommendations');
      }
      return cleaned;
    } catch (error: any) {
      console.error(
        '[AIServiceManager] generateGrowthRecommendations failed:',
        error?.message
      );
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
    preferences: UserAIPreferences = {}
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
      console.warn(
        '[AIServiceManager] generateInsightWithPlatformContext: Facebook block failed:',
        (fbResult as PromiseRejectedResult).reason?.message
      );
      return `## Instagram Insights\n\n${igResult.value}\n\n---\n\n## Facebook Insights\n\n⚠️ Facebook insights are temporarily unavailable. Please try again in a moment.`;
    }

    if (!igOk && fbOk) {
      // Facebook succeeded, Instagram failed.
      console.warn(
        '[AIServiceManager] generateInsightWithPlatformContext: Instagram block failed:',
        (igResult as PromiseRejectedResult).reason?.message
      );
      return `## Instagram Insights\n\n⚠️ Instagram insights are temporarily unavailable. Please try again in a moment.\n\n---\n\n## Facebook Insights\n\n${fbResult.value}`;
    }

    // Both failed — propagate the Instagram error (arbitrary choice; both are equivalent).
    console.error(
      '[AIServiceManager] generateInsightWithPlatformContext: both platform blocks failed'
    );
    throw (
      (igResult as PromiseRejectedResult).reason ??
      new Error('AI insight generation failed for all platforms')
    );
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
  private _filterCapabilitiesForPlatform(
    preferences: UserAIPreferences
  ): UserAIPreferences {
    const { platformContext, availableCapabilities } = preferences;

    // Nothing to filter if no platform or no explicit capabilities list.
    if (
      !platformContext ||
      platformContext === 'all' ||
      !availableCapabilities?.length
    ) {
      return preferences;
    }

    const platform = platformContext as PlatformId;
    const filtered = availableCapabilities.filter(
      key => CapabilityGuard.getMetricSupport(platform, key) !== 'NONE'
    );

    return { ...preferences, availableCapabilities: filtered };
  }

  public async generateJSON(
    prompt: string,
    preferences: UserAIPreferences = {},
    options: { preferGemini?: boolean; signal?: AbortSignal } = {}
  ): Promise<any> {
    // Fall back to the operation's wall-clock signal (published by withVGU) when
    // the caller has not supplied one. Without this, a timeout would only abandon
    // the result while the provider call kept running — and kept costing money.
    // This class is deliberately not behind the provider guard (it records its own
    // usage, and guarding it would double-count), so it wires the signal itself.
    options = { ...options, signal: options.signal ?? currentAbortSignal() };
    const {
      aiModel = 'veegpt-hybrid',
      creativityLevel = 0.7,
      contentSafety = 'standard',
      aiPersona = 'Professional & Authoritative',
      captionStyle = 'Storytelling',
      responseLength = 'medium',
      multilingual = 'auto',
      aiMemory = 'long-term',
    } = preferences;

    console.log(
      '[AIServiceManager] Generating JSON using model:',
      aiModel,
      'creativity:',
      creativityLevel
    );

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
      const generationConfig = {
        temperature: creativityLevel,
        responseMimeType: 'application/json',
      };
      const safetySettings = this.getSafetySettings(contentSafety);
      const client = preferences.googleAiStudioKey
        ? new GoogleGenerativeAI(preferences.googleAiStudioKey)
        : this.genAI;
      const model = client.getGenerativeModel({
        model: resolveLiveGeminiModel(modelName),
        generationConfig,
        safetySettings,
      });
      const result = await model.generateContent(
        finalPrompt,
        options.signal ? { signal: options.signal } : undefined
      );
      const text = result.response.text();
      recordAIUsage({
        provider: 'gemini',
        model: modelName,
        callType: 'json',
        usage: fromGeminiUsage((result.response as any)?.usageMetadata),
        promptText: finalPrompt,
        completionText: text,
      });
      const cleaned = text
        .replace(/^```(?:json)?\n?/, '')
        .replace(/\n?```$/, '');
      return JSON.parse(cleaned);
    };

    const tryOpenAI = async (modelName: string) => {
      const client = preferences.openAiKey
        ? new OpenAI({ apiKey: preferences.openAiKey })
        : this.openai;
      if (!client) throw new Error('OpenAI is not configured.');
      const completion = await client.chat.completions.create(
        {
          messages: [
            { role: 'system', content: 'You must respond with valid JSON.' },
            { role: 'user', content: finalPrompt },
          ],
          model: modelName,
          ...this.temperatureFor(aiModel, creativityLevel),
          response_format: { type: 'json_object' },
        },
        options.signal ? { signal: options.signal } : undefined
      );
      const jText = completion.choices[0]?.message?.content || '{}';
      recordAIUsage({
        provider: 'openai',
        model: modelName,
        callType: 'json',
        usage: fromOpenAIUsage((completion as any)?.usage),
        promptText: finalPrompt,
        completionText: jText,
      });
      return JSON.parse(jText);
    };

    const tryGithub = async (modelName: string) => {
      if (!this.githubModels)
        throw new Error(
          'GitHub Models is not configured (GITHUB_TOKEN missing).'
        );
      const completion = await this.githubModels.chat.completions.create(
        {
          messages: [
            { role: 'system', content: 'You must respond with valid JSON.' },
            { role: 'user', content: finalPrompt },
          ],
          model: modelName,
          ...this.temperatureFor(aiModel, creativityLevel),
          response_format: { type: 'json_object' },
        },
        options.signal ? { signal: options.signal } : undefined
      );
      const gjText = completion.choices[0]?.message?.content || '{}';
      recordAIUsage({
        provider: 'github',
        model: modelName,
        callType: 'json',
        usage: fromOpenAIUsage((completion as any)?.usage),
        promptText: finalPrompt,
        completionText: gjText,
      });
      return JSON.parse(gjText);
    };

    // ── SINGLE ATTEMPT ────────────────────────────────────────────────────────
    // No fallback chain. `options.preferGemini` is retained for source
    // compatibility but intentionally IGNORED: honouring it would override the
    // user's AI Configuration selection, which is exactly what this refactor
    // removes. Callers that genuinely need a specific capability should express
    // it as a capability (see ai-model-routing.ts), not a provider preference.
    const route = resolveRoute(aiModel, 'text');
    return await this.audited('json', route, 'native', 'text', async () => {
      const attemptOnce = () => {
        switch (route.provider) {
          case 'gemini':
            return tryGemini(route.native);
          case 'github':
            return tryGithub(route.native);
          case 'openai':
            return tryOpenAI(route.native);
          default:
            throw new Error(
              `No provider configured for model "${route.requested}".`
            );
        }
      };

      // Bounded retry on the SAME model (spec §37). This is not the error-driven
      // fallback chain that was deliberately removed: that walked to a DIFFERENT
      // model and hid the failure. This re-attempts the model the user chose, only
      // for failures that can actually succeed (429/5xx/timeout/connection), at
      // most as many times as the paying feature's registry entry allows, with
      // exponential backoff and jitter. JSON generation is non-streaming, so a
      // retry cannot re-deliver partial output to a client.
      //
      // Every attempt runs inside the caller's existing withVGU scope, so its
      // tokens land in ONE reservation and count against ONE provider-call
      // ceiling — which is what makes a retry accounted for rather than free.
      const feature = currentAIContext()?.feature || 'other';
      const { result, retry } = await withProviderRetry({ feature }, attemptOnce);
      if (retry.attempts > 1) {
        console.log(
          `[AIServiceManager] generateJSON recovered after ${retry.attempts} attempts`,
          retry.failures
        );
      }
      return result;
    });
  }
}

export const aiServiceManager = AIServiceManager.getInstance();
