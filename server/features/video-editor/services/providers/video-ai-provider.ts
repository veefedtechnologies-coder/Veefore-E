/**
 * `VideoAIProvider` — the provider-neutral generative-video interface (Req 7.6)
 * plus the shared request/response types, cost-estimation shape, integration
 * status, and a base adapter that enforces the No-Mock integration rule.
 *
 * The Generative_Editor talks to Gemini Omni, Veo, or any future generative
 * video model ONLY through this interface, so provider limits and identities are
 * never hardcoded into orchestration code — they come from the
 * `Provider_Capability_Registry` capability metadata (Req 7.1, 7.3).
 *
 * Three contracts are enforced structurally here:
 *
 *   • Req 7.6 — every provider exposes capability reporting, cost estimation,
 *     generation, and editing behind one neutral interface.
 *
 *   • Req 7.7 — a provider is classified "integrated" ONLY after it returns a
 *     successful result for a valid request to one of those operations. The base
 *     adapter starts every provider as NOT integrated and flips the flag solely
 *     from inside a real, successful call path (`markIntegrated`). Nothing here
 *     fabricates success, hardcodes `integrated: true`, or returns a placeholder
 *     video — a failed or unsupported call leaves the provider un-integrated and
 *     surfaces a real error (No-Mock rule, Req 23).
 *
 *   • Req 7.8 — provider API calls run server-side through the injected
 *     {@link VideoProviderTransport} (which uses `AIServiceManager`/the Gemini
 *     SDK). Provider API keys live in the Node process environment and are never
 *     transmitted to the browser.
 *
 * The capability record shape is reused from `provider-capability-registry.logic`
 * so no capability type is duplicated.
 */

import type { VideoModelCapabilities } from '../provider-capability-registry.logic';

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/** The provider-neutral operations a {@link VideoAIProvider} may support (Req 7.6). */
export type VideoProviderOperation =
  | 'getCapabilities'
  | 'estimateCost'
  | 'generate'
  | 'edit'
  | 'analyze';

// ---------------------------------------------------------------------------
// Cost estimation (Req 7.6)
// ---------------------------------------------------------------------------

/**
 * A cost estimate for a generative video request. `costInr` is the measured
 * provider cost that flows into metering via `runMetered`'s
 * `additionalProviderCostInr` channel (video is billed by output seconds, not
 * tokens — see design "Research Notes").
 */
export interface CostEstimate {
  provider: string;
  model: string;
  /** Billable output duration in seconds the estimate is based on. */
  outputSeconds: number;
  /** Estimated provider cost in INR (output seconds × per-second rate). */
  costInr: number;
  currency: 'INR';
}

/** Minimal shape a cost estimate is computed from. */
export interface VideoRequest {
  /** Desired output duration in seconds (must be > 0 for a real estimate). */
  outputSeconds: number;
  /** Requested output resolution, e.g. '1080x1920' (optional). */
  outputResolution?: string;
  /** Operation kind hint, e.g. 'generative_edit' (optional). */
  operationType?: string;
}

// ---------------------------------------------------------------------------
// Generation / edit requests & results (Req 7.6)
// ---------------------------------------------------------------------------

/**
 * A generation request. `instruction` is the provider-safe COMPILED instruction
 * produced by the prompt compiler — never the user's raw prompt (Req 9.7). An
 * optional seed image may be provided for image→video generation.
 */
export interface VideoGenerationRequest {
  /** Provider-safe compiled instruction (never the raw user prompt, Req 9.7). */
  instruction: string;
  /** Desired output duration in seconds. */
  outputSeconds: number;
  /** Requested output resolution, e.g. '1080x1920' (optional). */
  outputResolution?: string;
  /** Optional base64 seed image (no data: prefix) for image→video generation. */
  seedImageBase64?: string;
  /** MIME type of the seed image, e.g. 'image/png'. */
  seedImageMimeType?: string;
}

/**
 * An edit request over an existing input segment. Exactly one input source
 * (base64 bytes or a server-side URI) must be supplied by the caller.
 */
export interface VideoEditRequest {
  /** Provider-safe compiled instruction (never the raw user prompt, Req 9.7). */
  instruction: string;
  /** Base64-encoded input video segment (no data: prefix). */
  inputVideoBase64?: string;
  /** MIME type of the input video, e.g. 'video/mp4'. */
  inputVideoMimeType?: string;
  /** Alternatively, a server-side/object-storage URI to the input segment. */
  inputUri?: string;
  /** The affected source range this edit targets, in milliseconds (optional). */
  affectedRangeMs?: { startMs: number; endMs: number };
  /** Requested output resolution, e.g. '1080x1920' (optional). */
  outputResolution?: string;
  /** Explicit preservation constraints echoed for the provider (Req 9.8). */
  preservationConstraints?: string[];
}

/** A real generative video output produced by a provider. Never a placeholder. */
export interface VideoOutput {
  /** Base64-encoded output video bytes (no data: prefix), when returned inline. */
  videoBase64?: string;
  /** Object-storage/temporary URI to the output, when returned by reference. */
  uri?: string;
  /** MIME type of the produced video, e.g. 'video/mp4'. */
  mimeType: string;
  /** Actual measured output duration in seconds (fuels metering + QC). */
  outputSeconds: number;
}

export interface VideoGenerationResult {
  provider: string;
  model: string;
  output: VideoOutput;
  /** The raw provider response, retained for provenance/audit. */
  raw?: unknown;
}

export interface VideoEditResult {
  provider: string;
  model: string;
  output: VideoOutput;
  /** The raw provider response, retained for provenance/audit. */
  raw?: unknown;
}

/** Optional analysis request/result for providers that expose analysis. */
export interface VideoAnalysisRequest {
  inputVideoBase64?: string;
  inputVideoMimeType?: string;
  inputUri?: string;
  instruction: string;
}

export interface VideoAnalysisResult {
  provider: string;
  model: string;
  /** Provider-produced analysis text/JSON. */
  analysis: string;
  raw?: unknown;
}

// ---------------------------------------------------------------------------
// Integration status (Req 7.7)
// ---------------------------------------------------------------------------

/**
 * A provider's integration status. `integrated` is `false` until the provider
 * returns a successful result for a valid request to one of its operations
 * (Req 7.7) — it is NEVER hardcoded true and NEVER set from a fabricated or
 * placeholder response.
 */
export interface ProviderIntegrationStatus {
  provider: string;
  model: string;
  /** True iff a real, successful operation call has completed (Req 7.7). */
  integrated: boolean;
  /** The operations that have each returned a real successful result. */
  integratedOperations: VideoProviderOperation[];
  /** Epoch millis of the most recent successful call, or null if none yet. */
  lastSuccessAt: number | null;
  /** Message from the most recent failed call, or null. */
  lastError: string | null;
}

// ---------------------------------------------------------------------------
// Server-side transport (Req 7.8)
// ---------------------------------------------------------------------------

/** A real provider call routed through the transport (server-side only). */
export interface TransportRequest {
  provider: string;
  model: string;
  /** Provider-safe compiled instruction. */
  instruction: string;
  outputSeconds: number;
  outputResolution?: string;
  /** Optional input media (edit) or seed image (generate), base64 (no prefix). */
  inputBase64?: string;
  inputMimeType?: string;
  inputUri?: string;
}

/** A real provider result. `videoBase64`/`uri` present ONLY on genuine success. */
export interface TransportResult {
  output: VideoOutput;
  raw?: unknown;
}

/**
 * Executes generative video calls SERVER-SIDE (Req 7.8). The default
 * implementation ({@link createGeminiVideoTransport}) routes through
 * `AIServiceManager`/the Gemini SDK; tests inject a transport so the pure
 * integration/estimation logic can be exercised without network access.
 *
 * A transport MUST throw on any failure (unsupported model/operation, network,
 * safety, quota) and MUST return a result with real output bytes/URI on success
 * — it must never return a fabricated or placeholder video (No-Mock, Req 23).
 */
export interface VideoProviderTransport {
  generateVideo(req: TransportRequest, signal?: AbortSignal): Promise<TransportResult>;
  editVideo(req: TransportRequest, signal?: AbortSignal): Promise<TransportResult>;
  analyzeVideo?(req: TransportRequest, signal?: AbortSignal): Promise<VideoAnalysisResult>;
}

// ---------------------------------------------------------------------------
// Interface (Req 7.6)
// ---------------------------------------------------------------------------

/**
 * Provider-neutral generative-video interface (Req 7.6). Concrete adapters
 * (`GeminiOmniAdapter`, `VeoAdapter`) implement it; the Generative_Editor and
 * Model_Router depend only on this shape.
 */
export interface VideoAIProvider {
  /** Provider identifier (matches the capability record), e.g. 'gemini'. */
  readonly provider: string;
  /** Model identifier (matches the capability record), e.g. 'omni-1'. */
  readonly model: string;

  /** Capability reporting — the provider's `VideoModelCapabilities` (Req 7.1, 7.6). */
  getCapabilities(): VideoModelCapabilities;

  /** Cost estimation from a request's output seconds × per-second rate (Req 7.6). */
  estimateCost(req: VideoRequest): Promise<CostEstimate>;

  /** Generate a video server-side; marks the provider integrated on success (Req 7.6, 7.7, 7.8). */
  generate(req: VideoGenerationRequest, signal?: AbortSignal): Promise<VideoGenerationResult>;

  /** Edit an input segment server-side; marks integrated on success (Req 7.6, 7.7, 7.8). */
  edit(req: VideoEditRequest, signal?: AbortSignal): Promise<VideoEditResult>;

  /** Optional analysis operation for providers that expose it. */
  analyze?(req: VideoAnalysisRequest, signal?: AbortSignal): Promise<VideoAnalysisResult>;

  /** The current integration status (Req 7.7). */
  getIntegrationStatus(): ProviderIntegrationStatus;

  /** Convenience: whether the provider has been proven integrated (Req 7.7). */
  isIntegrated(): boolean;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Raised for an invalid request BEFORE any provider call is attempted. */
export class VideoProviderRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VideoProviderRequestError';
  }
}

/** Raised when a real provider call fails; the provider stays un-integrated. */
export class VideoProviderCallError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly model: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'VideoProviderCallError';
  }
}

// ---------------------------------------------------------------------------
// Base adapter — enforces the No-Mock integration rule (Req 7.7)
// ---------------------------------------------------------------------------

/**
 * Shared adapter base for concrete providers. It:
 *  - holds the immutable capability record (single source, Req 7.3),
 *  - computes cost estimates deterministically from that record (Req 7.6),
 *  - tracks integration status, flipping `integrated` to true ONLY from
 *    {@link markIntegrated}, which subclasses call solely after a REAL,
 *    successful provider call returns real output (Req 7.7),
 *  - validates every generation/edit request before the transport is touched,
 *    so an invalid request never counts as an integration attempt.
 *
 * The class never marks itself integrated on construction and never returns a
 * placeholder video — subclasses call the injected transport for the real work.
 */
export abstract class BaseVideoAIProvider implements VideoAIProvider {
  readonly provider: string;
  readonly model: string;

  private integrated = false;
  private readonly integratedOps = new Set<VideoProviderOperation>();
  private lastSuccessAt: number | null = null;
  private lastError: string | null = null;

  protected constructor(
    protected readonly capabilities: VideoModelCapabilities,
    protected readonly transport: VideoProviderTransport,
  ) {
    this.provider = capabilities.provider;
    this.model = capabilities.model;
  }

  getCapabilities(): VideoModelCapabilities {
    return this.capabilities;
  }

  /**
   * Cost estimate = requested output seconds × the capability record's
   * `costPerOutputSecondInr`, clamped to the record's output-duration bounds so
   * an estimate reflects what the provider can actually produce (Req 7.6).
   * Estimation is a real, successful operation, so a valid estimate marks the
   * `estimateCost` operation integrated (Req 7.7).
   */
  async estimateCost(req: VideoRequest): Promise<CostEstimate> {
    const seconds = Number(req?.outputSeconds);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      throw new VideoProviderRequestError(
        `estimateCost requires a positive outputSeconds; received ${String(req?.outputSeconds)}`,
      );
    }
    const bounds = this.capabilities.outputSeconds;
    const billableSeconds = Math.min(Math.max(seconds, bounds.min), bounds.max);
    const costInr = Number(
      (billableSeconds * this.capabilities.costPerOutputSecondInr).toFixed(6),
    );
    const estimate: CostEstimate = {
      provider: this.provider,
      model: this.model,
      outputSeconds: billableSeconds,
      costInr,
      currency: 'INR',
    };
    // A valid estimate is a genuine successful operation result (Req 7.7).
    this.markIntegrated('estimateCost');
    return estimate;
  }

  abstract generate(
    req: VideoGenerationRequest,
    signal?: AbortSignal,
  ): Promise<VideoGenerationResult>;

  abstract edit(req: VideoEditRequest, signal?: AbortSignal): Promise<VideoEditResult>;

  getIntegrationStatus(): ProviderIntegrationStatus {
    return {
      provider: this.provider,
      model: this.model,
      integrated: this.integrated,
      integratedOperations: [...this.integratedOps],
      lastSuccessAt: this.lastSuccessAt,
      lastError: this.lastError,
    };
  }

  isIntegrated(): boolean {
    return this.integrated;
  }

  /**
   * Record a REAL successful operation. This is the ONLY place `integrated`
   * becomes true (Req 7.7); subclasses call it only after the transport returns
   * genuine output. Never called on construction or from a fabricated response.
   */
  protected markIntegrated(op: VideoProviderOperation): void {
    this.integrated = true;
    this.integratedOps.add(op);
    this.lastSuccessAt = Date.now();
    this.lastError = null;
  }

  /** Record a real failure; leaves `integrated` unchanged (does not fabricate). */
  protected recordFailure(err: unknown): void {
    this.lastError = err instanceof Error ? err.message : String(err);
  }

  /**
   * Assert a produced output is real (has bytes or a URI, a mime type, and a
   * positive duration). Guards against ever treating an empty/placeholder
   * response as a success that would (wrongly) flip integration (No-Mock).
   */
  protected assertRealOutput(output: VideoOutput | undefined | null): asserts output is VideoOutput {
    const hasPayload =
      !!output && (!!output.videoBase64 || !!output.uri);
    const hasMeta =
      !!output &&
      typeof output.mimeType === 'string' &&
      output.mimeType.length > 0 &&
      Number.isFinite(output.outputSeconds) &&
      output.outputSeconds > 0;
    if (!hasPayload || !hasMeta) {
      throw new VideoProviderCallError(
        'Provider returned no usable video output; refusing to classify as a successful (integrated) call',
        this.provider,
        this.model,
      );
    }
  }

  /** Validate a generation request before any transport call (No-Mock guard). */
  protected validateGenerate(req: VideoGenerationRequest): void {
    if (!req || typeof req.instruction !== 'string' || req.instruction.trim().length === 0) {
      throw new VideoProviderRequestError('generate requires a non-empty compiled instruction');
    }
    if (!this.capabilities.outputModalities.includes('video')) {
      throw new VideoProviderRequestError(
        `${this.provider}/${this.model} does not declare a 'video' output modality`,
      );
    }
    this.assertSecondsWithinBounds(req.outputSeconds, this.capabilities.outputSeconds, 'outputSeconds');
    this.assertResolutionSupported(req.outputResolution);
  }

  /** Validate an edit request before any transport call (No-Mock guard). */
  protected validateEdit(req: VideoEditRequest): void {
    if (!req || typeof req.instruction !== 'string' || req.instruction.trim().length === 0) {
      throw new VideoProviderRequestError('edit requires a non-empty compiled instruction');
    }
    const hasInput = !!(req.inputVideoBase64 || req.inputUri);
    if (!hasInput) {
      throw new VideoProviderRequestError('edit requires an input segment (inputVideoBase64 or inputUri)');
    }
    if (req.affectedRangeMs) {
      const { startMs, endMs } = req.affectedRangeMs;
      const durationSeconds = (endMs - startMs) / 1000;
      this.assertSecondsWithinBounds(
        durationSeconds,
        this.capabilities.editableInputSeconds,
        'affectedRange duration',
      );
    }
    this.assertResolutionSupported(req.outputResolution);
  }

  private assertSecondsWithinBounds(
    seconds: number,
    bounds: { min: number; max: number },
    label: string,
  ): void {
    if (!Number.isFinite(seconds) || seconds <= 0) {
      throw new VideoProviderRequestError(`${label} must be a positive number of seconds`);
    }
    if (seconds < bounds.min || seconds > bounds.max) {
      throw new VideoProviderRequestError(
        `${label} (${seconds}s) is outside ${this.provider}/${this.model} bounds [${bounds.min}, ${bounds.max}]s`,
      );
    }
  }

  private assertResolutionSupported(resolution?: string): void {
    if (resolution && !this.capabilities.outputResolutions.includes(resolution)) {
      throw new VideoProviderRequestError(
        `resolution '${resolution}' is not supported by ${this.provider}/${this.model}`,
      );
    }
  }
}
