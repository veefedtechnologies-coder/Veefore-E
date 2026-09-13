/**
 * ai-model-routing — ONE place that decides which model serves a request.
 *
 * POLICY: no fallback. The model the user picked in Settings → AI Configuration
 * is the model that runs. If it fails, the request fails and the caller surfaces
 * a real error. Previously every call walked a chain (LiteLLM → GitHub → OpenAI →
 * five Gemini models, each retried 3× with backoff), so a bad first provider cost
 * seven round trips and several seconds before the user saw a single token.
 *
 * THE ONE EXCEPTION IS CAPABILITY, NOT AVAILABILITY. A model that physically
 * cannot do the job is not a fallback candidate — e.g. no OpenAI chat model can
 * read video, so video analysis routes to Gemini regardless of the selection. The
 * substitution is deterministic (always the same target), reported to the caller
 * via `overriddenFor`, and never triggered by an error.
 */

export type NativeProvider = 'gemini' | 'openai' | 'github';

/** What a request needs the model to be able to do. */
export type Capability = 'text' | 'vision' | 'video' | 'document' | 'heic';

export interface ModelSpec {
  /** Provider used when the LiteLLM gateway is disabled. */
  provider: NativeProvider;
  /** Provider-native model id. */
  native: string;
  /** Can read images. */
  vision: boolean;
  /** Can read video. Gemini only, today. */
  video: boolean;
  /**
   * Can read PDFs. Separate from `vision`: OpenAI chat models see images but
   * CANNOT read a PDF, so lumping the two together silently sent PDFs to a
   * model that ignores them.
   */
  document: boolean;
  /**
   * Can read Apple HEIC/HEIF. Gemini accepts these via inlineData; OpenAI chat
   * models reject them, so HEIC is its own capability rather than plain `vision`.
   */
  heic: boolean;
  /**
   * Accepts a custom `temperature`. GPT-5 reasoning models reject anything but
   * the default and answer `400 Unsupported value: 'temperature'`, which took
   * down every generateJSON call (research synthesis, post-intent) once the
   * fallback chain stopped hiding it. Default true; only the GPT-5 family is
   * locked.
   */
  temperature?: boolean;
}

/**
 * Every model id the AI Configuration screen can store.
 *
 * `native` deliberately points at Gemini's rolling `-latest` aliases: the pinned
 * `gemini-2.x-*` ids now 404 for new API keys (see resolveLiveGeminiModel).
 */
const REGISTRY: Record<string, ModelSpec> = {
  // ── Gemini ────────────────────────────────────────────────────────────────
  'veegpt-hybrid': {
    provider: 'gemini',
    native: 'gemini-flash-lite-latest',
    vision: true,
    video: true,
    heic: true,
    document: true,
  },
  'google-ai-studio': {
    provider: 'gemini',
    native: 'gemini-flash-lite-latest',
    vision: true,
    video: true,
    heic: true,
    document: true,
  },
  'gemini-1.5-flash': {
    provider: 'gemini',
    native: 'gemini-flash-lite-latest',
    vision: true,
    video: true,
    heic: true,
    document: true,
  },
  'gemini-2.0-flash-exp': {
    provider: 'gemini',
    native: 'gemini-flash-latest',
    vision: true,
    video: true,
    heic: true,
    document: true,
  },
  'gemini-2.5-flash-lite': {
    provider: 'gemini',
    native: 'gemini-flash-lite-latest',
    vision: true,
    video: true,
    heic: true,
    document: true,
  },
  'gemini-2.5-flash': {
    provider: 'gemini',
    native: 'gemini-flash-latest',
    vision: true,
    video: true,
    heic: true,
    document: true,
  },
  'gemini-2.5-pro': {
    provider: 'gemini',
    native: 'gemini-pro-latest',
    vision: true,
    video: true,
    heic: true,
    document: true,
  },
  'gemini-flash-lite-latest': {
    provider: 'gemini',
    native: 'gemini-flash-lite-latest',
    vision: true,
    video: true,
    heic: true,
    document: true,
  },
  'gemini-flash-latest': {
    provider: 'gemini',
    native: 'gemini-flash-latest',
    vision: true,
    video: true,
    heic: true,
    document: true,
  },
  'gemini-pro-latest': {
    provider: 'gemini',
    native: 'gemini-pro-latest',
    vision: true,
    video: true,
    heic: true,
    document: true,
  },
  'gemini-3.5-flash': {
    provider: 'gemini',
    native: 'gemini-3.5-flash',
    vision: true,
    video: true,
    heic: true,
    document: true,
  },
  'gemini-3.6-flash': {
    provider: 'gemini',
    native: 'gemini-3.6-flash',
    vision: true,
    video: true,
    heic: true,
    document: true,
  },
  'gemini-3.1-pro': {
    provider: 'gemini',
    native: 'gemini-3.1-pro-preview',
    vision: true,
    video: true,
    heic: true,
    document: true,
  },

  // ── OpenAI (images yes, video no) ─────────────────────────────────────────
  'openai-gpt4o': {
    provider: 'openai',
    native: 'gpt-4o',
    vision: true,
    video: false,
    heic: false,
    document: false,
  },
  'openai-gpt-4o-mini': {
    provider: 'openai',
    native: 'gpt-4o-mini',
    vision: true,
    video: false,
    heic: false,
    document: false,
  },
  'openai-gpt-4.1': {
    provider: 'openai',
    native: 'gpt-4.1',
    vision: true,
    video: false,
    heic: false,
    document: false,
  },
  'openai-gpt-4.1-mini': {
    provider: 'openai',
    native: 'gpt-4.1-mini',
    vision: true,
    video: false,
    heic: false,
    document: false,
  },
  'openai-gpt-4.1-nano': {
    provider: 'openai',
    native: 'gpt-4.1-nano',
    vision: true,
    video: false,
    heic: false,
    document: false,
  },
  'openai-gpt-5-nano': {
    provider: 'openai',
    native: 'gpt-5-nano',
    vision: true,
    video: false,
    heic: false,
    document: false,
    temperature: false,
  },
  'openai-gpt-5-mini': {
    provider: 'openai',
    native: 'gpt-5-mini',
    vision: true,
    video: false,
    heic: false,
    document: false,
    temperature: false,
  },
  'openai-gpt-5': {
    provider: 'openai',
    native: 'gpt-5',
    vision: true,
    video: false,
    heic: false,
    document: false,
    temperature: false,
  },
  'openai-gpt-5.5': {
    provider: 'openai',
    native: 'gpt-5.5',
    vision: true,
    video: false,
    heic: false,
    document: false,
    temperature: false,
  },
  'openai-gpt-5.6-sol': {
    provider: 'openai',
    native: 'gpt-5.6-sol',
    vision: true,
    video: false,
    heic: false,
    document: false,
    temperature: false,
  },
  'openai-gpt-5.6-luna': {
    provider: 'openai',
    native: 'gpt-5.6-luna',
    vision: true,
    video: false,
    heic: false,
    document: false,
    temperature: false,
  },
  'openai-gpt-5.6-terra': {
    provider: 'openai',
    native: 'gpt-5.6-terra',
    vision: true,
    video: false,
    heic: false,
    document: false,
    temperature: false,
  },

  // ── GitHub Models (no vision on the free tier) ────────────────────────────
  'github-gpt-4o-mini': {
    provider: 'github',
    native: 'openai/gpt-4o-mini',
    vision: false,
    video: false,
    heic: false,
    document: false,
  },
  'github-gpt-4.1-mini': {
    provider: 'github',
    native: 'openai/gpt-4.1-mini',
    vision: false,
    video: false,
    heic: false,
    document: false,
  },

  // ── Anthropic / Perplexity: reachable through the gateway only ────────────
  'claude-3-5-sonnet': {
    provider: 'openai',
    native: 'claude-3-5-sonnet',
    vision: true,
    video: false,
    heic: false,
    document: false,
  },
  'claude-3-5-haiku': {
    provider: 'openai',
    native: 'claude-3-5-haiku',
    vision: true,
    video: false,
    heic: false,
    document: false,
  },
  'perplexity-sonar': {
    provider: 'openai',
    native: 'perplexity-sonar',
    vision: false,
    video: false,
    heic: false,
    document: false,
  },
};

export const DEFAULT_MODEL = 'veegpt-hybrid';

/**
 * Every model id this router knows about. Used by tests to assert that the
 * VeeGPT model-tier map (shared/veegpt-model-tiers.ts) covers the registry
 * exactly — a model added here without a class would be priced by the premium
 * fallback and mislabelled in Settings.
 */
export function listRegisteredModels(): string[] {
  return Object.keys(REGISTRY);
}

/**
 * The PROVIDER-native model id behind an app-level model id, or undefined when
 * the id is unknown.
 *
 * This exists because the app and the providers use different names for the same
 * model: AI Configuration stores `openai-gpt4o`, OpenAI bills `gpt-4o`. The
 * pricing registry is keyed by provider ids (that is what an invoice shows), so
 * it resolves app ids through here rather than keeping a second copy of the
 * mapping — a copy would drift, and a drifted mapping means the wrong price.
 */
export function nativeModelFor(aiModel?: string): string | undefined {
  const spec = REGISTRY[canonicalModelId(aiModel)];
  return spec?.native || undefined;
}

/**
 * Permanently RETIRED model ids → the live model that replaces them.
 *
 * This is not a fallback. A fallback reacts to a failure; this is a static fact
 * about a provider that no longer exists, resolved before any request is made.
 *
 * GitHub Models now answers every request with HTTP 410
 * `github_models_retirement_brownout`. Its `openai/gpt-4o-mini` was literally
 * OpenAI's gpt-4o-mini behind a different host, so pointing the id at OpenAI
 * preserves exactly what the user chose. Without this, a workspace still pinned
 * to a `github-*` model would fail EVERY request — the old code hid that by
 * walking a chain, which is precisely what we removed.
 */
const RETIRED_MODEL_ALIASES: Record<string, string> = {
  'github-gpt-4o-mini': 'openai-gpt-4o-mini',
  'github-gpt-4.1-mini': 'openai-gpt-4.1-mini',
};

/**
 * Deterministic capability substitute for media (video/PDF/HEIC/vision) a
 * text-only or image-only model can't read — only Gemini does, so it's the one
 * target.
 *
 * IMPORTANT: this MUST be a CURRENT model id. Google retires whole generations
 * for new keys — as of late 2025 `gemini-2.5-flash` returns 404 "no longer
 * available to new users — use gemini-3.6-flash". A retired id 404s on the very
 * first call, which cascades into the fallback chain and rate-limits the key
 * (that was the real cause of the PDF/video failures, NOT billing). Keep this
 * pointed at a live, balanced flash. Env-overridable via GEMINI_MEDIA_MODEL so a
 * future retirement is a config change, not a code change.
 */
const MEDIA_MODEL = process.env.GEMINI_MEDIA_MODEL || 'gemini-3.6-flash';

/** An unknown id still reaches the gateway (it passes model names through), but we
 *  must not ASSUME it can read media — so media requests get substituted. */
const UNKNOWN_SPEC: ModelSpec = {
  provider: 'openai',
  native: '',
  vision: false,
  heic: false,
  video: false,
  document: false,
};

export interface Route {
  /** App-level model id to send to the LiteLLM gateway. */
  appModel: string;
  provider: NativeProvider;
  /** Provider-native model id, for the direct-SDK path. */
  native: string;
  /** Set when capability forced a different model than the user selected. */
  overriddenFor?: Capability;
  /** The user's original selection, for logging. */
  requested: string;
}

/** Resolve retired ids to their live replacement before anything else. */
export function canonicalModelId(aiModel?: string): string {
  const id = aiModel || DEFAULT_MODEL;
  return RETIRED_MODEL_ALIASES[id] || id;
}

export function getModelSpec(aiModel?: string): ModelSpec {
  return REGISTRY[canonicalModelId(aiModel)] || UNKNOWN_SPEC;
}

/** Whether this model accepts a custom temperature (GPT-5 reasoning models do not). */
export function supportsCustomTemperature(aiModel?: string): boolean {
  return getModelSpec(aiModel).temperature !== false;
}

/** Does the selected model support this capability itself? */
export function supportsCapability(
  aiModel: string | undefined,
  need: Capability
): boolean {
  const spec = getModelSpec(aiModel);
  if (need === 'video') return spec.video;
  if (need === 'document') return spec.document;
  if (need === 'heic') return spec.heic;
  if (need === 'vision') return spec.vision;
  return true;
}

/**
 * Resolve the ONE model that will serve this request.
 *
 * Substitutes only when the selected model cannot do the job at all. Never
 * substitutes because of an error, a quota, or a timeout.
 */
export function resolveRoute(
  aiModel: string | undefined,
  need: Capability = 'text'
): Route {
  const asked = aiModel || DEFAULT_MODEL;
  const requested = canonicalModelId(asked);
  if (requested !== asked) {
    console.log(
      `[ai-routing] "${asked}" is retired — permanently mapped to ${requested}`
    );
  }

  if (!supportsCapability(requested, need)) {
    console.log(
      `[ai-routing] "${requested}" cannot handle ${need} — using ${MEDIA_MODEL} for this request only`
    );
    return {
      appModel: MEDIA_MODEL,
      provider: 'gemini',
      // Send the STABLE id straight through (do NOT resolve to a registry
      // `native`, which points at the overloaded `gemini-flash-latest` alias).
      native: MEDIA_MODEL,
      overriddenFor: need,
      requested,
    };
  }

  const spec = getModelSpec(requested);
  return {
    appModel: requested,
    // An unknown id has no native mapping; the gateway handles it. If the
    // gateway is off there is nothing sensible to call, which callers check.
    provider: spec.provider,
    native: spec.native || requested,
    requested,
  };
}

/**
 * Video and PDF must bypass the LiteLLM gateway: its OpenAI-compatible content
 * builder inlines images only and silently drops everything else, so those go
 * straight to the native Gemini SDK.
 */
export function mustBypassGateway(need: Capability, hasPdf = false): boolean {
  return need === 'video' || need === 'document' || need === 'heic' || hasPdf;
}
