/**
 * AI Usage Tracker
 *
 * Captures EVERY LLM call's token usage at the single chokepoint that all AI
 * traffic flows through: the provider SDK calls inside AIServiceManager.
 *
 * - Real token counts are read from the provider response when available
 *   (OpenAI/GitHub `usage`, Gemini `usageMetadata`). When a provider streams and
 *   does not return usage, we fall back to a character-based estimate (~4 chars
 *   per token) and mark the row `estimated: true` so cost analysis is honest.
 * - Each call is tagged with a feature label via AsyncLocalStorage, so we never
 *   have to thread a feature argument through dozens of call sites. Route
 *   handlers wrap their work in `withAIFeature(feature, ctx, fn)`.
 *
 * This makes the data complete: if a code path hits a provider, it is recorded.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import mongoose, { Schema, Document } from 'mongoose';

// ─── Feature labels ─────────────────────────────────────────────────────────
// Add new features here so the dashboard can group/label them. Unknown features
// still record under their raw string.
export type AIFeature =
  | 'veegpt.chat'              // main VeeGPT streamed chat reply
  | 'veegpt.title'            // background conversation title generation
  | 'veegpt.memory_detect'    // LLM "is this a durable fact?" + extract
  | 'veegpt.memory_summary'   // rolling long-term memory summarization
  | 'veegpt.memory_update'    // periodic memory mining from a conversation
  | 'veegpt.post_agent'       // scheduling/posting intent + plan
  | 'veegpt.post_caption'     // caption generation for a post
  | 'veegpt.post_hashtags'    // hashtag generation for a post
  | 'veegpt.media_analysis'   // image/video vision analysis
  | 'veegpt.parse_intent'     // legacy deterministic-assist parse
  | 'caption.generation'      // standalone caption generator feature
  | 'caption.regenerate'      // caption regeneration
  | 'hashtag.generation'      // standalone hashtag generator
  | 'growth.recommendations'  // growth recommendation cards
  | 'growth.insight'          // performance insight headline
  | 'social_listening.extract'// social listening AI extraction (synchronous path)
  | 'social_listening.batch_submitted' // social listening: OpenAI Batch API job submitted
  | 'social_listening.batch_finalized' // social listening: Batch API results collected + saved
  | 'thumbnail.generation'    // thumbnail/banner AI (text strategy)
  | 'image.generation'        // AI image/banner generation
  | 'video.generation'        // video script/gen AI
  | 'video.script'            // video script generation
  | 'content.brief'           // creative brief generation
  | 'content.repurpose'       // repurpose content across platforms
  | 'trend.intelligence'      // trend analysis
  | 'competitor.analysis'     // competitor analysis
  | 'other';

export interface AIUsageSample {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens: number;
  estimated: boolean;
  callType: 'json' | 'text' | 'stream' | 'vision';
}

interface AIUsageContext {
  feature: string;
  userId?: string;
  workspaceId?: string;
  collector?: AIUsageSample[];
}

const storage = new AsyncLocalStorage<AIUsageContext>();

/** Run `fn` with an AI-feature context so any nested AI calls get tagged. */
export function withAIFeature<T>(
  feature: AIFeature | string,
  ctx: { userId?: string; workspaceId?: string } | undefined,
  fn: () => T,
): T {
  const parent = storage.getStore();
  return storage.run({
    ...parent,
    feature,
    userId: ctx?.userId ?? parent?.userId,
    workspaceId: ctx?.workspaceId ?? parent?.workspaceId,
  }, fn);
}

/**
 * Execute an AI operation while collecting every nested provider call in
 * memory. Collection is synchronous with recordAIUsage, while Mongo logging
 * remains fire-and-forget. Nested withAIFeature calls preserve this collector.
 */
export async function collectAIUsage<T>(
  feature: AIFeature | string,
  ctx: { userId?: string; workspaceId?: string } | undefined,
  fn: () => Promise<T>,
): Promise<{ result: T; usage: AIUsageSample[] }> {
  const collector: AIUsageSample[] = [];
  const result = await storage.run(
    { feature, userId: ctx?.userId, workspaceId: ctx?.workspaceId, collector },
    fn,
  );
  return { result, usage: collector };
}

/** Current feature context (if any). */
export function currentAIContext(): AIUsageContext | undefined {
  return storage.getStore();
}

/**
 * Express middleware that tags EVERY AI call made while handling this route with
 * a feature label. AsyncLocalStorage context established here propagates through
 * the entire async handler chain, so nested AIServiceManager calls are recorded
 * under `feature` without threading an argument through every function.
 *
 * Usage:  router.post('/captions', requireAuth, aiFeatureMiddleware('caption.generation'), handler)
 */
export function aiFeatureMiddleware(feature: AIFeature | string) {
  return (req: any, _res: any, next: () => void) => {
    const userId = req?.user?.id;
    const workspaceId = req?.body?.workspaceId || req?.query?.workspaceId || req?.user?.workspaceId;
    const parent = storage.getStore();
    storage.run({
      ...parent,
      feature,
      userId: userId ?? parent?.userId,
      workspaceId: workspaceId ?? parent?.workspaceId,
    }, () => next());
  };
}


// ─── Mongoose model ─────────────────────────────────────────────────────────
export interface IAIUsageEvent extends Document {
  feature: string;
  provider: 'openai' | 'github' | 'gemini' | string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Prompt tokens served from the provider's prompt cache (billed ~10%). 0 when
   * the provider reports no cache hit or doesn't support caching. */
  cachedTokens: number;
  /** true when token counts are character-estimated rather than provider-reported. */
  estimated: boolean;
  callType: 'json' | 'text' | 'stream' | 'vision';
  userId?: string;
  workspaceId?: string;
  createdAt: Date;
}

const AIUsageEventSchema = new Schema<IAIUsageEvent>({
  feature: { type: String, required: true, index: true },
  provider: { type: String, required: true },
  model: { type: String, required: true },
  promptTokens: { type: Number, default: 0 },
  completionTokens: { type: Number, default: 0 },
  totalTokens: { type: Number, default: 0 },
  cachedTokens: { type: Number, default: 0 },
  estimated: { type: Boolean, default: false },
  callType: { type: String, default: 'text' },
  userId: { type: String, index: true },
  workspaceId: { type: String, index: true },
  createdAt: { type: Date, default: Date.now, index: true },
});

export const AIUsageEvent =
  (mongoose.models.AIUsageEvent as mongoose.Model<IAIUsageEvent>) ||
  mongoose.model<IAIUsageEvent>('AIUsageEvent', AIUsageEventSchema);

// ─── Token estimation (fallback when provider gives no usage) ────────────────
/** Rough token estimate for English text using the ~4-chars-per-token heuristic. */
export function estimateTokens(text: string | undefined | null): number {
  if (!text) return 0;
  return Math.ceil(String(text).length / 4);
}

// ─── Recording ───────────────────────────────────────────────────────────────
interface RecordArgs {
  provider: string;
  model: string;
  callType: IAIUsageEvent['callType'];
  /** Provider-reported usage, if available. */
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number; cachedTokens?: number } | null;
  /** Raw text used to estimate tokens when usage is missing. */
  promptText?: string;
  completionText?: string;
}

/**
 * Record a single AI call's token usage. Never throws — usage tracking must
 * never break an AI feature. Fire-and-forget DB write.
 */
export function recordAIUsage(args: RecordArgs): void {
  try {
    const ctx = storage.getStore();
    const feature = ctx?.feature || 'other';

    let prompt = args.usage?.promptTokens;
    let completion = args.usage?.completionTokens;
    let estimated = false;

    if (prompt == null || completion == null) {
      estimated = true;
      prompt = prompt ?? estimateTokens(args.promptText);
      completion = completion ?? estimateTokens(args.completionText);
    }
    const total = args.usage?.totalTokens ?? (prompt + completion);
    const cached = Math.max(0, Math.min(args.usage?.cachedTokens ?? 0, prompt));

    const sample: AIUsageSample = {
      provider: args.provider,
      model: args.model,
      promptTokens: prompt,
      completionTokens: completion,
      totalTokens: total,
      cachedTokens: cached,
      estimated,
      callType: args.callType,
    };

    // Dynamic credit settlement reads this immediately after the operation;
    // no database timing race is involved.
    ctx?.collector?.push(sample);

    // Fire-and-forget durable usage analytics.
    void AIUsageEvent.create({
      feature,
      ...sample,
      userId: ctx?.userId,
      workspaceId: ctx?.workspaceId,
      createdAt: new Date(),
    }).catch(() => { /* swallow: tracking must never break a feature */ });
  } catch {
    /* swallow */
  }
}

/** Normalize an OpenAI/GitHub `usage` object to our shape. Captures cached
 * prompt tokens from `prompt_tokens_details.cached_tokens` (OpenAI/Azure prompt
 * caching) so the dashboard can show cache-hit rate. */
export function fromOpenAIUsage(usage: any): RecordArgs['usage'] {
  if (!usage) return null;
  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
    cachedTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
  };
}

/** Normalize a Gemini `usageMetadata` object to our shape. `cachedContentTokenCount`
 * reflects Gemini context-cache hits when used. */
export function fromGeminiUsage(meta: any): RecordArgs['usage'] {
  if (!meta) return null;
  return {
    promptTokens: meta.promptTokenCount,
    completionTokens: meta.candidatesTokenCount,
    totalTokens: meta.totalTokenCount,
    cachedTokens: meta.cachedContentTokenCount ?? 0,
  };
}
