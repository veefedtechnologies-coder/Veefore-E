/**
 * Provider boundary guard — makes VGU coverage structural rather than per-file.
 *
 * THE PROBLEM
 * The codebase has ~20 live files that each construct their own OpenAI / Gemini
 * client and call the provider directly, bypassing AIServiceManager entirely.
 * Wiring each one by hand would (a) be enormous, and (b) fix nothing permanently:
 * the next file someone adds would bypass the engine again.
 *
 * THE APPROACH
 * Clients are created through `createOpenAI()` / `createGemini()` instead of the
 * raw SDK constructors. The returned client is a thin proxy that, on every
 * provider call:
 *
 *   1. asserts the call is happening inside a metered context, and
 *   2. records the provider-reported token usage into that context.
 *
 * (1) turns "some path might bypass the quota" into a hard, testable guarantee.
 * (2) means these legacy paths contribute real tokens to reconciliation, so their
 *     VGU reflects actual cost instead of only the pre-flight estimate.
 *
 * AIServiceManager deliberately does NOT use this layer: it already records its
 * own usage, so guarding it too would double-count every token.
 *
 * ENFORCEMENT MODES — `VGU_ENFORCEMENT`
 *   strict  throw on an unmetered call (use in CI and, once soaked, production)
 *   warn    log at error level and allow (default: safe to deploy immediately)
 *   off     allow silently (escape hatch only)
 */

import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  countProviderCall,
  currentAbortSignal,
  currentAIContext,
  fromGeminiUsage,
  fromOpenAIUsage,
  recordAIUsage,
} from './aiUsageTracker';
import logger from '../config/logger';

export type EnforcementMode = 'strict' | 'warn' | 'off';

export function enforcementMode(): EnforcementMode {
  const raw = (process.env.VGU_ENFORCEMENT || 'warn').toLowerCase();
  return raw === 'strict' || raw === 'off' ? raw : 'warn';
}

/** Thrown in strict mode when a provider call happens outside a metered context. */
export class UnmeteredAICallError extends Error {
  readonly code = 'UNMETERED_AI_CALL';
  constructor(operation: string, callSite?: string) {
    super(
      `AI provider call "${operation}" was made outside a metered context. ` +
        `Wrap the operation in withVGU() or apply the meterAI() middleware.` +
        (callSite ? ` Origin: ${callSite}` : '')
    );
    this.name = 'UnmeteredAICallError';
  }
}

/**
 * Attach the operation's abort signal to a provider request's options.
 *
 * WHY THE GUARD DOES THIS
 * `withVGU` gives every operation a wall-clock budget and publishes an
 * AbortSignal on the AI context. Without wiring it into the actual HTTP request,
 * a timeout only ABANDONS the result: the provider call keeps running and keeps
 * costing money, and any usage it reports afterwards arrives after the
 * reservation was already reconciled and is therefore lost.
 *
 * Injecting it here means every guarded call honours the budget without each of
 * the ~20 call sites having to remember to thread a signal through. Both SDKs
 * accept `signal` in their per-request options (OpenAI `RequestOptions`, Gemini
 * `SingleRequestOptions`).
 *
 * A signal the CALLER supplied always wins — a route that owns its own
 * cancellation (the chat stream's Stop button) must not have it overwritten.
 */
function withAbortSignal(options: unknown): unknown {
  const signal = currentAbortSignal();
  if (!signal) return options;
  if (options && typeof options === 'object') {
    if ((options as { signal?: unknown }).signal) return options;
    return { ...(options as Record<string, unknown>), signal };
  }
  return { signal };
}

/** Counters surfaced to the audit/alerting layer. */
const stats = {
  guardedCalls: 0,
  unmeteredCalls: 0,
  blockedCalls: 0,
};

export function providerGuardStats(): Readonly<typeof stats> {
  return { ...stats };
}

export function resetProviderGuardStats(): void {
  stats.guardedCalls = 0;
  stats.unmeteredCalls = 0;
  stats.blockedCalls = 0;
}

/** First stack frame outside this module — useful for locating an offender. */
function callSite(): string | undefined {
  const lines = (new Error().stack || '').split('\n').slice(2);
  const hit = lines.find(
    l => !l.includes('ai-provider-guard') && l.includes('server/')
  );
  return hit?.trim().slice(0, 160);
}

/**
 * Assert that a metered context exists. Returns true when the call may proceed.
 *
 * A context is "metered" when it was established by withVGU / collectAIUsageInto
 * (which install a collector) — not merely by a feature label, since a bare label
 * records tokens without reserving any quota.
 */
function assertMetered(operation: string): boolean {
  const ctx = currentAIContext();
  const metered = !!ctx?.collector;
  stats.guardedCalls++;
  if (metered) {
    // Charge the fan-out budget BEFORE the call, so an operation that has used
    // up its provider-call ceiling never reaches the network again. Throws
    // ProviderCallBudgetError when exhausted.
    countProviderCall();
    return true;
  }

  stats.unmeteredCalls++;
  const mode = enforcementMode();
  const site = callSite();

  if (mode === 'off') return true;

  logger.error('vgu-guard: unmetered AI provider call', {
    operation,
    feature: ctx?.feature ?? '(none)',
    mode,
    callSite: site,
    module: 'ai-provider-guard',
  });

  if (mode === 'strict') {
    stats.blockedCalls++;
    throw new UnmeteredAICallError(operation, site);
  }
  return true;
}

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------

interface OpenAIUsageShape {
  usage?: unknown;
  model?: string;
}

/**
 * A guarded OpenAI client. API-compatible with the SDK, so a call site only needs
 * its constructor swapped.
 */
export function createOpenAI(
  opts: ConstructorParameters<typeof OpenAI>[0] = {}
): OpenAI {
  const client = new OpenAI(opts);
  guardChatCompletions(client);
  guardImages(client);
  guardEmbeddings(client);
  guardAudio(client);
  return client;
}

function guardChatCompletions(client: OpenAI): void {
  const target = client.chat?.completions;
  if (!target?.create) return;
  const original = target.create.bind(target);
  (target as { create: unknown }).create = async (...args: unknown[]) => {
    assertMetered('openai.chat.completions.create');
    const body = args[0] as { model?: string; stream?: boolean } | undefined;
    const withSignal = [args[0], withAbortSignal(args[1]), ...args.slice(2)];
    const result = await original(...(withSignal as Parameters<typeof original>));
    // Streaming responses report usage only at the end of the stream, which this
    // wrapper cannot observe without consuming it. Those call sites keep their own
    // accounting; non-streaming calls are recorded here.
    if (!body?.stream) {
      recordFromOpenAI(result as OpenAIUsageShape, body?.model, 'text');
    }
    return result;
  };
}

function guardImages(client: OpenAI): void {
  const target = client.images;
  if (!target?.generate) return;
  const original = target.generate.bind(target);
  (target as { generate: unknown }).generate = async (...args: unknown[]) => {
    assertMetered('openai.images.generate');
    const withSignal = [args[0], withAbortSignal(args[1]), ...args.slice(2)];
    return original(...(withSignal as Parameters<typeof original>));
  };
}

function guardEmbeddings(client: OpenAI): void {
  const target = client.embeddings;
  if (!target?.create) return;
  const original = target.create.bind(target);
  (target as { create: unknown }).create = async (...args: unknown[]) => {
    assertMetered('openai.embeddings.create');
    const body = args[0] as { model?: string } | undefined;
    const withSignal = [args[0], withAbortSignal(args[1]), ...args.slice(2)];
    const result = await original(...(withSignal as Parameters<typeof original>));
    recordFromOpenAI(result as OpenAIUsageShape, body?.model, 'text');
    return result;
  };
}

function guardAudio(client: OpenAI): void {
  const transcriptions = client.audio?.transcriptions;
  if (transcriptions?.create) {
    const original = transcriptions.create.bind(transcriptions);
    (transcriptions as { create: unknown }).create = async (
      ...args: unknown[]
    ) => {
      assertMetered('openai.audio.transcriptions.create');
      return original(
        ...([args[0], withAbortSignal(args[1]), ...args.slice(2)] as unknown as Parameters<
          typeof original
        >)
      );
    };
  }
  const speech = client.audio?.speech;
  if (speech?.create) {
    const original = speech.create.bind(speech);
    (speech as { create: unknown }).create = async (...args: unknown[]) => {
      assertMetered('openai.audio.speech.create');
      return original(
        ...([args[0], withAbortSignal(args[1]), ...args.slice(2)] as unknown as Parameters<
          typeof original
        >)
      );
    };
  }
}

function recordFromOpenAI(
  result: OpenAIUsageShape,
  requestedModel: string | undefined,
  callType: 'text' | 'json' | 'vision'
): void {
  try {
    const usage = fromOpenAIUsage((result as { usage?: unknown })?.usage);
    if (!usage) return;
    recordAIUsage({
      provider: 'openai',
      model: result.model || requestedModel || 'unknown',
      callType,
      usage,
      // Already counted against the fan-out budget in assertMetered.
      guardCounted: true,
    });
  } catch (err) {
    // Recording must never break a feature — EXCEPT the fan-out budget, whose
    // whole purpose is to stop the operation.
    if ((err as { code?: string })?.code === 'PROVIDER_CALL_BUDGET_EXCEEDED') throw err;
  }
}

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------

/**
 * A guarded GoogleGenerativeAI client. `getGenerativeModel` returns a model whose
 * generate calls are guarded and recorded.
 */
export function createGemini(apiKey: string): GoogleGenerativeAI {
  const client = new GoogleGenerativeAI(apiKey);
  const originalGet = client.getGenerativeModel.bind(client);
  (client as { getGenerativeModel: unknown }).getGenerativeModel = (
    ...args: unknown[]
  ) => {
    const model = originalGet(...(args as Parameters<typeof originalGet>));
    const modelId =
      (args[0] as { model?: string } | undefined)?.model || 'gemini-unknown';
    // Patch the instance's methods in place. Going via `unknown` because
    // GenerativeModel and an index-signature type do not structurally overlap.
    guardGeminiModel(model as unknown as Record<string, unknown>, modelId);
    return model;
  };
  return client;
}

function guardGeminiModel(model: Record<string, unknown>, modelId: string): void {
  const wrap = (name: string, record: boolean) => {
    const fn = model[name];
    if (typeof fn !== 'function') return;
    const original = (fn as (...a: unknown[]) => Promise<unknown>).bind(model);
    model[name] = async (...args: unknown[]) => {
      assertMetered(`gemini.${name}`);
      const withSignal = [args[0], withAbortSignal(args[1]), ...args.slice(2)];
      const result = await original(...withSignal);
      if (record) recordFromGemini(result, modelId);
      return result;
    };
  };
  wrap('generateContent', true);
  // Streaming usage arrives incrementally; those call sites keep their own
  // accounting rather than have this wrapper consume the stream.
  wrap('generateContentStream', false);
}

function recordFromGemini(result: unknown, modelId: string): void {
  try {
    const meta = (result as { response?: { usageMetadata?: unknown } })?.response
      ?.usageMetadata;
    const usage = fromGeminiUsage(meta);
    if (!usage) return;
    recordAIUsage({
      provider: 'gemini',
      model: modelId,
      callType: 'text',
      usage,
      guardCounted: true,
    });
  } catch (err) {
    if ((err as { code?: string })?.code === 'PROVIDER_CALL_BUDGET_EXCEEDED') throw err;
  }
}
