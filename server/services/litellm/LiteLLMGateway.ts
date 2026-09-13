/**
 * LiteLLMGateway
 * ----------------------------------------------------------------------------
 * A thin, OpenAI-SDK-based client that talks to a running **LiteLLM proxy**
 * (see Veefore-E/litellm/). The proxy exposes an OpenAI-compatible API and
 * routes every request to the right provider (OpenAI, Google Gemini, Anthropic,
 * GitHub Models, Perplexity, ...), handling retries and cross-provider
 * fallbacks itself. That means the whole app can speak ONE protocol
 * (chat/completions) and get multi-provider support "for free".
 *
 * This module is intentionally provider-agnostic: it never imports the Google
 * or Anthropic SDKs. It only knows how to (a) build an OpenAI client pointed at
 * the proxy and (b) map the app's internal model ids to LiteLLM `model_name`s
 * declared in litellm/config.yaml.
 *
 * Enablement is controlled by env:
 *   USE_LITELLM=true
 *   LITELLM_BASE_URL=http://localhost:4000/v1
 *   LITELLM_MASTER_KEY=sk-...   (matches the proxy's master_key)
 *
 * When USE_LITELLM is not "true" (or the base URL/key is missing) the gateway
 * reports `isEnabled() === false` and callers fall back to their existing
 * provider-specific logic — so this is a safe, incremental drop-in.
 */

import OpenAI from 'openai';

/** A user-uploaded attachment (image) for multimodal requests. */
export interface LiteLLMAttachment {
  /** MIME type, e.g. "image/png", "image/jpeg". */
  mimeType: string;
  /** Base64-encoded data (no `data:` prefix). */
  data: string;
  name?: string;
}

/** OpenAI-style tool definition (JSON Schema function). */
export interface LiteLLMTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Model groups (litellm/config.yaml model_name ids) that only accept the
 * DEFAULT temperature — OpenAI's GPT-5 reasoning family. For these we must omit
 * `temperature` from the request entirely; sending any value (even the app's
 * default) returns HTTP 400, and the proxy's `drop_params` does not strip it
 * because temperature is a supported param with a restricted value. Keep in
 * sync with client MODELS_WITHOUT_CREATIVITY in SettingsTabs.tsx.
 */
const TEMPERATURE_LOCKED_MODELS = new Set<string>([
  'openai-gpt-5-nano',
  'openai-gpt-5-mini',
  'openai-gpt-5',
  'openai-gpt-5.5',
  'openai-gpt-5.6-sol',
  'openai-gpt-5.6-luna',
  'openai-gpt-5.6-terra',
]);

/**
 * Gemini "thinking" models. Unlike GPT-5 these DO accept a custom temperature
 * (so the creativity slider still works) AND they stream real reasoning summary
 * text as `reasoning_content` when `reasoning_effort` is passed. Keep in sync
 * with litellm/config.yaml model_names.
 */
// Verified empirically via the proxy: only the 3.x flash + pro Gemini models
// actually stream `reasoning_content`. Older ones (2.0-flash, 2.5-flash-lite)
// and even 2.5-flash do NOT surface thinking, so they're excluded — we don't
// send reasoning_effort to them (avoids pointless latency) and never imply a
// thinking panel for them.
const GEMINI_THINKING_MODELS = new Set<string>([
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-3.1-pro',
  'gemini-pro-latest',
]);

/** Whether a resolved LiteLLM model_name accepts a custom temperature. */
export function supportsTemperature(litellmModel: string): boolean {
  // Only GPT-5 reasoning models reject custom temperature. Gemini thinking
  // models still honor it.
  return !TEMPERATURE_LOCKED_MODELS.has(litellmModel);
}

/**
 * Whether a model accepts the `reasoning_effort` param. Covers BOTH the GPT-5
 * family (temperature-locked reasoning models) AND Gemini thinking models.
 * Non-reasoning models reject the param, so it's only sent for these.
 */
export function isReasoningModel(litellmModel: string): boolean {
  return (
    TEMPERATURE_LOCKED_MODELS.has(litellmModel) ||
    GEMINI_THINKING_MODELS.has(litellmModel)
  );
}

/**
 * Whether a model streams real reasoning text (`reasoning_content`) we can show
 * as a live "thinking" panel. OpenAI GPT-5 does NOT (it hides chain-of-thought
 * over chat/completions); Gemini thinking models DO.
 */
export function emitsReasoningContent(litellmModel: string): boolean {
  return GEMINI_THINKING_MODELS.has(litellmModel);
}

/**
 * Whether to actually send `reasoning_effort` for this request. GPT-5 always
 * gets it (it controls latency). Gemini thinking models get it only when the
 * user hasn't turned off "Show detailed thinking" (showThinking !== false) —
 * otherwise we skip it so Gemini doesn't spend time surfacing thoughts.
 */
function shouldSendReasoningEffort(
  litellmModel: string,
  showThinking?: boolean
): boolean {
  if (TEMPERATURE_LOCKED_MODELS.has(litellmModel)) return true;
  if (GEMINI_THINKING_MODELS.has(litellmModel)) return showThinking !== false;
  return false;
}

export type LiteLLMRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * A chat message. `content` is normally a string, but may be an OpenAI-style
 * multimodal content-part array (text + image_url parts) so the tool-calling
 * path can send inline images (the proxy normalizes this for Gemini/Anthropic).
 */
export interface LiteLLMMessage {
  role: LiteLLMRole;
  content: string | Array<Record<string, any>>;
}

export interface LiteLLMChatOptions {
  /** App-internal model id (e.g. 'veegpt-hybrid') or a LiteLLM model_name. */
  model?: string;
  temperature?: number;
  maxTokens?: number;
  attachments?: LiteLLMAttachment[];
  /** Reasoning effort for reasoning models (GPT-5 + Gemini thinking). */
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
  /**
   * For Gemini thinking models: whether to request the reasoning summary.
   * Default true. When false, we don't send reasoning_effort to Gemini so it
   * skips surfacing thoughts (faster). Does not affect GPT-5 (its effort always
   * applies since it controls latency, not a visible panel).
   */
  showThinking?: boolean;
  signal?: AbortSignal;
  /**
   * Fired once the call finishes — INCLUDING on error or abort — with the
   * provider's raw OpenAI-shaped `usage` object (or null when the proxy sent
   * none) plus the prompt and the text produced so far.
   *
   * This is how metering gets real token counts for gateway traffic. Without it
   * every gateway call recorded ZERO usage, so the VGU reconciler saw no tokens
   * and floored the charge to 1 VGU — a costly model (e.g. gpt-5.6-sol) looked
   * free while a native-SDK call for the same model was billed correctly. The
   * gateway stays provider-agnostic: it hands back the raw usage and never
   * imports the usage tracker itself.
   */
  onUsage?: (info: {
    usage: any | null;
    promptText: string;
    completionText: string;
  }) => void;
}

/** Structured event yielded by the tool-aware stream. */
export type LiteLLMStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'reasoning'; delta: string }
  | { type: 'toolCall'; name: string; args: Record<string, unknown>; id?: string };

/**
 * Map an app-internal aiModel id to a LiteLLM `model_name` declared in
 * litellm/config.yaml. Unknown ids pass through unchanged so any model_name the
 * proxy knows about can be requested directly. `veegpt-hybrid` is the default.
 */
export function toLiteLLMModel(aiModel?: string): string {
  switch (aiModel) {
    case undefined:
    case '':
    case 'veegpt-hybrid':
      return 'veegpt-hybrid';
    case 'openai-gpt4o':
      return 'openai-gpt4o';
    // OpenAI cheapest → best (routed through LiteLLM). model_names match the
    // ids declared in litellm/config.yaml.
    case 'openai-gpt-4.1-nano':
      return 'openai-gpt-4.1-nano';
    case 'openai-gpt-4o-mini':
      return 'openai-gpt-4o-mini';
    case 'openai-gpt-4.1-mini':
      return 'openai-gpt-4.1-mini';
    case 'openai-gpt-4.1':
      return 'openai-gpt-4.1';
    case 'gemini-1.5-flash':
    case 'gemini-2.0-flash-exp':
      return 'gemini-2.0-flash';
    case 'google-ai-studio':
      return 'google-ai-studio';
    case 'github-gpt-4o-mini':
      return 'github-gpt-4o-mini';
    case 'github-gpt-4.1-mini':
      return 'github-gpt-4.1-mini';
    default:
      // Pass through: allows requesting any model_name the proxy declares,
      // e.g. 'claude-3-5-sonnet', 'gemini-2.5-flash', 'perplexity-sonar'.
      return aiModel;
  }
}

export class LiteLLMGateway {
  private static instance: LiteLLMGateway;
  private client: OpenAI | null = null;
  private enabled = false;

  private constructor() {
    const enabledFlag = String(process.env.USE_LITELLM || '').toLowerCase() === 'true';
    const baseURL = process.env.LITELLM_BASE_URL;
    // Prefer a scoped virtual key (LITELLM_API_KEY) for the app; fall back to
    // the master key. The master key is the admin/root credential and is best
    // reserved for managing the proxy, not for day-to-day request auth.
    const apiKey = process.env.LITELLM_API_KEY || process.env.LITELLM_MASTER_KEY;

    if (enabledFlag && baseURL && apiKey) {
      this.client = new OpenAI({ apiKey, baseURL });
      this.enabled = true;
      console.log(`[LiteLLMGateway] Enabled. Routing AI calls through proxy at ${baseURL}`);
    } else if (enabledFlag) {
      console.warn(
        '[LiteLLMGateway] USE_LITELLM=true but LITELLM_BASE_URL/LITELLM_MASTER_KEY missing — gateway disabled, using native providers.'
      );
    }
  }

  public static getInstance(): LiteLLMGateway {
    if (!LiteLLMGateway.instance) {
      LiteLLMGateway.instance = new LiteLLMGateway();
    }
    return LiteLLMGateway.instance;
  }

  /** True when the proxy is configured and this gateway should be used. */
  public isEnabled(): boolean {
    return this.enabled && this.client !== null;
  }

  /** Build OpenAI-format message content, inlining images as data URLs. */
  private buildUserContent(prompt: string, attachments?: LiteLLMAttachment[]): any {
    const images = (attachments || []).filter(a => a.mimeType.startsWith('image/'));
    if (images.length === 0) return prompt;
    return [
      { type: 'text', text: prompt },
      ...images.map(a => ({
        type: 'image_url' as const,
        image_url: { url: `data:${a.mimeType};base64,${a.data}` },
      })),
    ];
  }

  /** Non-streaming completion. Returns the assistant text. */
  public async chat(prompt: string, options: LiteLLMChatOptions = {}): Promise<string> {
    if (!this.client) throw new Error('LiteLLMGateway is not enabled.');
    const model = toLiteLLMModel(options.model);
    options.signal?.throwIfAborted?.();
    const completion = await this.client.chat.completions.create(
      {
        model,
        messages: [
          { role: 'user', content: this.buildUserContent(prompt, options.attachments) },
        ],
        // Omit temperature for temperature-locked models (GPT-5 family); they
        // reject any non-default value with a 400.
        ...(supportsTemperature(model) ? { temperature: options.temperature } : {}),
        // Reasoning effort for reasoning models (GPT-5 always; Gemini only when
        // "show thinking" is on).
        ...(shouldSendReasoningEffort(model, options.showThinking) &&
        options.reasoningEffort
          ? { reasoning_effort: options.reasoningEffort }
          : {}),
        max_tokens: options.maxTokens,
      } as any,
      options.signal ? { signal: options.signal } : undefined
    );
    const content = completion.choices[0]?.message?.content || '';
    options.onUsage?.({
      usage: (completion as any)?.usage ?? null,
      promptText: prompt,
      completionText: content,
    });
    return content;
  }

  /** Streaming completion. Yields text deltas as the model produces them. */
  public async *chatStream(
    prompt: string,
    options: LiteLLMChatOptions = {}
  ): AsyncGenerator<string, void, unknown> {
    if (!this.client) throw new Error('LiteLLMGateway is not enabled.');
    const model = toLiteLLMModel(options.model);
    options.signal?.throwIfAborted?.();
    const stream: any = await this.client.chat.completions.create(
      {
        model,
        messages: [
          { role: 'user', content: this.buildUserContent(prompt, options.attachments) },
        ],
        // Omit temperature for temperature-locked models (GPT-5 family).
        ...(supportsTemperature(model) ? { temperature: options.temperature } : {}),
        // Reasoning effort (GPT-5 always; Gemini only when "show thinking" is on).
        ...(shouldSendReasoningEffort(model, options.showThinking) &&
        options.reasoningEffort
          ? { reasoning_effort: options.reasoningEffort }
          : {}),
        max_tokens: options.maxTokens,
        stream: true,
        // Ask the proxy to emit a final usage chunk. Without this the stream
        // carries no token counts and metering floors the charge to 1 VGU.
        stream_options: { include_usage: true },
      } as any,
      options.signal ? { signal: options.signal } : undefined
    );
    // Capture real usage + accumulate text so `onUsage` can charge actual tokens
    // (and estimate from text if the proxy sent no usage chunk). The finally
    // runs even on abort/early-break, so partial usage is still reported.
    let usage: any = null;
    let acc = '';
    try {
      for await (const part of stream) {
        if ((part as any).usage) usage = (part as any).usage;
        const text = part.choices[0]?.delta?.content || '';
        if (text) {
          acc += text;
          yield text;
        }
      }
    } finally {
      options.onUsage?.({ usage, promptText: prompt, completionText: acc });
    }
  }

  /**
   * Tool-aware streaming. Yields interleaved text + toolCall events using the
   * OpenAI function-calling protocol. Because the proxy normalizes every
   * provider to the OpenAI schema, tool calling works uniformly across
   * OpenAI/Gemini/Anthropic without provider-specific translation.
   */
  public async *chatStreamWithTools(
    messages: LiteLLMMessage[],
    tools: LiteLLMTool[],
    options: LiteLLMChatOptions = {}
  ): AsyncGenerator<LiteLLMStreamEvent, void, unknown> {
    if (!this.client) throw new Error('LiteLLMGateway is not enabled.');
    const model = toLiteLLMModel(options.model);
    options.signal?.throwIfAborted?.();
    const stream: any = await this.client.chat.completions.create(
      {
        model,
        messages: messages as any,
        tools: tools as any,
        tool_choice: 'auto',
        // Omit temperature for temperature-locked models (GPT-5 family).
        ...(supportsTemperature(model) ? { temperature: options.temperature } : {}),
        // Reasoning effort (GPT-5 always; Gemini only when "show thinking" is on).
        ...(shouldSendReasoningEffort(model, options.showThinking) &&
        options.reasoningEffort
          ? { reasoning_effort: options.reasoningEffort }
          : {}),
        stream: true,
        // Ask the proxy to emit a final usage chunk. Without this the tool
        // stream carries no token counts and metering floors the charge to
        // 1 VGU — the exact bug that made ultra models look free.
        stream_options: { include_usage: true },
      } as any,
      options.signal ? { signal: options.signal } : undefined
    );

    // Accumulate streamed tool-call argument fragments by index.
    const toolAcc = new Map<number, { id?: string; name: string; args: string }>();
    // Capture real usage + visible text for metering (see onUsage). The prompt
    // for the estimate fallback is the concatenated message text.
    let usage: any = null;
    let acc = '';
    // Metering estimate fallback: flatten any multimodal content to its text
    // parts (image parts contribute no token estimate here — real usage comes
    // from the proxy's usage chunk).
    const promptText = messages
      .map((m) =>
        typeof m.content === 'string'
          ? m.content
          : (m.content || [])
              .map((p: any) => (p && p.type === 'text' ? p.text || '' : ''))
              .join(' ')
      )
      .join('\n');

    try {
      for await (const part of stream) {
        if ((part as any).usage) usage = (part as any).usage;
        const delta: any = part.choices[0]?.delta;
        if (!delta) continue;

        // Real thinking (Gemini): LiteLLM surfaces the model's reasoning summary
        // as `reasoning_content` deltas. Emit them as a distinct event so the UI
        // can show a live "thinking" panel (OpenAI GPT-5 never sends this).
        if (delta.reasoning_content) {
          yield { type: 'reasoning', delta: delta.reasoning_content };
        }

        if (delta.content) {
          acc += delta.content;
          yield { type: 'text', delta: delta.content };
        }

        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            const entry = toolAcc.get(idx) || { name: '', args: '' };
            if (tc.id) entry.id = tc.id;
            if (tc.function?.name) entry.name = tc.function.name;
            if (tc.function?.arguments) entry.args += tc.function.arguments;
            toolAcc.set(idx, entry);
          }
        }
      }
    } finally {
      // Runs even on abort/early-break so partial usage is still charged.
      options.onUsage?.({ usage, promptText, completionText: acc });
    }

    // Emit fully-assembled tool calls once the stream ends.
    for (const entry of toolAcc.values()) {
      if (!entry.name) continue;
      let args: Record<string, unknown> = {};
      try {
        args = entry.args ? JSON.parse(entry.args) : {};
      } catch {
        // Leave args empty if the model produced invalid JSON.
      }
      yield { type: 'toolCall', name: entry.name, args, id: entry.id };
    }
  }
}

/** Shared singleton. */
export const liteLLMGateway = LiteLLMGateway.getInstance();
