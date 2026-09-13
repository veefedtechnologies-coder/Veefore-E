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
import { ctxDebugEnabled, appendCtxDebug } from '../routes/veegpt-context-debug';

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
  /** Total completion tokens — INCLUDES reasoning tokens. */
  completionTokens: number;
  totalTokens: number;
  cachedTokens: number;
  /**
   * Reasoning subset of `completionTokens` (OpenAI reasoning_tokens / Gemini
   * thoughtsTokenCount). Recorded for cost analysis; never added on top of the
   * completion count, which would double-charge it.
   */
  reasoningTokens: number;
  estimated: boolean;
  callType: 'json' | 'text' | 'stream' | 'vision';
}

interface AIUsageContext {
  feature: string;
  userId?: string;
  workspaceId?: string;
  collector?: AIUsageSample[];
  /**
   * Real money paid to NON-LLM providers during this operation (Tavily /
   * Firecrawl search, image generation, transcription). Token counts cannot see
   * these, so without this channel deep research would look almost free.
   */
  externalCostUSD?: { total: number };
  /**
   * Names of expensive tools that ACTUALLY ran during this operation.
   *
   * Which tools run is decided by the model mid-stream, so it cannot be known
   * when the operation is reserved. Reconciliation needs it because a tool's
   * cost is partly fan-out overhead (orchestration, retries, context growth)
   * that no single token count reflects.
   */
  toolsRun?: string[];
  /**
   * FAN-OUT BUDGET. `limit` is the maximum number of provider calls this one
   * operation may make; `count` is how many it has made.
   *
   * Deep research makes a dozen model calls plus paid search requests, and
   * autopilot more. Without a hard call ceiling, a bug or a hostile prompt that
   * makes the loop iterate turns one request into an unbounded provider bill —
   * and a per-request VGU cap alone does not stop the CALLS, only the charge.
   * `limit: 0` means unbounded.
   */
  providerCalls?: { count: number; limit: number };
  /**
   * Abort signal for the operation's wall-clock budget. Nested code that accepts
   * a signal should pass this through so a timeout actually stops work in flight
   * rather than merely abandoning the result.
   */
  abortSignal?: AbortSignal;
}

/** Thrown when an operation exceeds its permitted number of provider calls. */
export class ProviderCallBudgetError extends Error {
  readonly code = 'PROVIDER_CALL_BUDGET_EXCEEDED';
  constructor(
    readonly feature: string,
    readonly count: number,
    readonly limit: number
  ) {
    super(
      `AI operation "${feature}" exceeded its provider-call budget ` +
        `(${count} calls, limit ${limit}). Stopping to prevent an unbounded ` +
        `provider bill.`
    );
    this.name = 'ProviderCallBudgetError';
  }
}

/**
 * Count one provider call against the current operation's fan-out budget.
 *
 * @throws ProviderCallBudgetError when the budget is exhausted.
 *
 * Called BEFORE a call from the provider guard (so the call never happens) and
 * AFTER one from `recordAIUsage` (so paths the guard does not wrap — the
 * dispatchers, which record their own usage — are still bounded). Counting twice
 * for a guarded call would halve every budget, so the guard marks its calls and
 * `recordAIUsage` skips them.
 */
export function countProviderCall(alreadyCounted = false): void {
  const ctx = storage.getStore();
  const budget = ctx?.providerCalls;
  if (!budget || budget.limit <= 0) return;
  if (!alreadyCounted) budget.count++;
  if (budget.count > budget.limit) {
    throw new ProviderCallBudgetError(
      ctx?.feature || 'other',
      budget.count,
      budget.limit
    );
  }
}

/** The abort signal for the current AI operation, when one is set. */
export function currentAbortSignal(): AbortSignal | undefined {
  return storage.getStore()?.abortSignal;
}

/**
 * Record spend on a paid non-LLM service inside the current AI operation so
 * reconciliation charges it. No-op outside an AI context.
 */
export function recordExternalCostUSD(usd: number): void {
  const ctx = storage.getStore();
  if (!ctx?.externalCostUSD || !Number.isFinite(usd) || usd <= 0) return;
  ctx.externalCostUSD.total += usd;
}

/**
 * Record that an expensive tool ran, so reconciliation adds its fan-out
 * surcharge. No-op outside an AI context.
 */
export function recordToolRun(toolName: string): void {
  const ctx = storage.getStore();
  if (!ctx?.toolsRun || !toolName) return;
  ctx.toolsRun.push(toolName);
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
): Promise<{ result: T; usage: AIUsageSample[]; externalCostUSD: number }> {
  const collector: AIUsageSample[] = [];
  const externalCostUSD = { total: 0 };
  const result = await storage.run(
    { feature, userId: ctx?.userId, workspaceId: ctx?.workspaceId, collector, externalCostUSD },
    fn,
  );
  return { result, usage: collector, externalCostUSD: externalCostUSD.total };
}

/**
 * Like collectAIUsage, but the collector array and external-cost accumulator are
 * supplied by the caller so they remain readable even if `fn` THROWS.
 *
 * This is what reconciliation needs: when a provider fails or a stream is aborted
 * part-way, the tokens already consumed must still be charged. collectAIUsage
 * discards them because the throw unwinds before it returns.
 */
export async function collectAIUsageInto<T>(
  feature: AIFeature | string,
  ctx: { userId?: string; workspaceId?: string } | undefined,
  sink: {
    usage: AIUsageSample[];
    externalCostUSD: { total: number };
    toolsRun?: string[];
    providerCalls?: { count: number; limit: number };
    abortSignal?: AbortSignal;
  },
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(
    {
      feature,
      userId: ctx?.userId,
      workspaceId: ctx?.workspaceId,
      collector: sink.usage,
      externalCostUSD: sink.externalCostUSD,
      toolsRun: sink.toolsRun,
      providerCalls: sink.providerCalls,
      abortSignal: sink.abortSignal,
    },
    fn,
  );
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
  /** Reasoning subset of completionTokens. Recorded for cost analysis only. */
  reasoningTokens: number;
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
  reasoningTokens: { type: Number, default: 0 },
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
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    cachedTokens?: number;
    /** Reasoning subset of completionTokens (not additive). */
    reasoningTokens?: number;
  } | null;
  /** Raw text used to estimate tokens when usage is missing. */
  promptText?: string;
  completionText?: string;
  /**
   * Set by the provider guard, which already counted this call against the
   * fan-out budget before making it. Prevents double-counting.
   */
  guardCounted?: boolean;
}

/**
 * Record a single AI call's token usage. Never throws — usage tracking must
 * never break an AI feature. Fire-and-forget DB write.
 */
export function recordAIUsage(args: RecordArgs): void {
  /**
   * Set when the fan-out budget is blown. Thrown AFTER the recording work, so
   * the call that broke the budget is still charged — otherwise exceeding the
   * budget would make a call free.
   */
  let budgetOverrun: ProviderCallBudgetError | undefined;
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
    // Reasoning is a subset of completion, so it can never exceed it.
    const reasoning = Math.max(
      0,
      Math.min(args.usage?.reasoningTokens ?? 0, completion)
    );

    const sample: AIUsageSample = {
      provider: args.provider,
      model: args.model,
      promptTokens: prompt,
      reasoningTokens: reasoning,
      completionTokens: completion,
      totalTokens: total,
      cachedTokens: cached,
      estimated,
      callType: args.callType,
    };

    // Dynamic credit settlement reads this immediately after the operation;
    // no database timing race is involved.
    ctx?.collector?.push(sample);

    // Verification aid (off unless VEEGPT_CTX_DEBUG=true): persist the REAL,
    // provider-reported token counts for this call — prompt (input), completion
    // (output), the reasoning subset of the output, cached, and total — so the
    // exact numbers can be inspected in a file instead of racing past in logs.
    // Purely additive and self-guarded; never affects metering.
    if (ctxDebugEnabled()) {
      appendCtxDebug({
        kind: 'usage',
        feature,
        provider: sample.provider,
        model: sample.model,
        callType: sample.callType,
        estimated: sample.estimated,
        inputTokens: sample.promptTokens,
        outputTokens: sample.completionTokens,
        reasoningTokens: sample.reasoningTokens,
        cachedTokens: sample.cachedTokens,
        totalTokens: sample.totalTokens,
        userId: ctx?.userId,
        workspaceId: ctx?.workspaceId,
      });
    }
    // Charge the fan-out budget. Recorded BEFORE the possible throw below, so a
    // call that already happened is always paid for.
    budgetOverrun = takeProviderCallBudget(ctx, args.guardCounted === true);

    // Fire-and-forget durable usage analytics.
    void AIUsageEvent.create({
      feature,
      ...sample,
      userId: ctx?.userId,
      workspaceId: ctx?.workspaceId,
      createdAt: new Date(),
    }).catch(() => { /* swallow: tracking must never break a feature */ });
  } catch {
    /* swallow: usage tracking must never break a feature */
  }
  // The ONE case where this function deliberately throws. An operation that has
  // exceeded its provider-call ceiling must stop, or a runaway loop keeps paying.
  if (budgetOverrun) throw budgetOverrun;
}

/** Increment the fan-out counter, returning an error when it is exhausted. */
function takeProviderCallBudget(
  ctx: AIUsageContext | undefined,
  alreadyCounted: boolean
): ProviderCallBudgetError | undefined {
  const budget = ctx?.providerCalls;
  if (!budget || budget.limit <= 0) return undefined;
  if (!alreadyCounted) budget.count++;
  if (budget.count > budget.limit) {
    return new ProviderCallBudgetError(
      ctx?.feature || 'other',
      budget.count,
      budget.limit
    );
  }
  return undefined;
}

/** Normalize an OpenAI/GitHub `usage` object to our shape.
 *
 * Captures cached prompt tokens from `prompt_tokens_details.cached_tokens`
 * (OpenAI/Azure prompt caching) AND reasoning tokens from
 * `completion_tokens_details.reasoning_tokens`.
 *
 * Reasoning tokens matter for cost: OpenAI bills them at the OUTPUT rate, and a
 * GPT-5 request can spend several times more on reasoning than on the visible
 * answer. They are reported INSIDE `completion_tokens`, so they are tracked
 * separately for visibility but must NOT be added to the billable output count —
 * that would double-charge them. */
export function fromOpenAIUsage(usage: any): RecordArgs['usage'] {
  if (!usage) return null;
  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
    cachedTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? 0,
  };
}

/** Normalize a Gemini `usageMetadata` object to our shape.
 *
 * `cachedContentTokenCount` reflects Gemini context-cache hits.
 * `thoughtsTokenCount` is Gemini's equivalent of reasoning tokens and, like
 * OpenAI's, is already included in the candidate (output) count. */
export function fromGeminiUsage(meta: any): RecordArgs['usage'] {
  if (!meta) return null;
  return {
    promptTokens: meta.promptTokenCount,
    completionTokens: meta.candidatesTokenCount,
    totalTokens: meta.totalTokenCount,
    cachedTokens: meta.cachedContentTokenCount ?? 0,
    reasoningTokens: meta.thoughtsTokenCount ?? 0,
  };
}
