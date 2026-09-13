/**
 * Token_Telemetry recorder (spec: veegpt-context-optimization, Req 16).
 *
 * Records, per VeeGPT request, WHERE the input tokens went — the token count of
 * each context category (static/dynamic instructions, memory, summary, recent
 * history, tool definitions, tool results, user input), the totals, the
 * provider cache metrics when the provider supplies them, and the metadata a
 * developer needs to understand the composition decision (model/provider,
 * request type, selected modules, exposed tools, and the
 * compaction/memory/cache/fallback flags).
 *
 * DESIGN CONSTRAINTS (Req 16.3–16.5, brief):
 * - **No new datastore.** Telemetry is additive metadata. It is emitted through
 *   the EXISTING observability path: a privacy-safe object suitable for the
 *   ledger event `meta` field (`telemetryToLedgerMeta`) plus a metadata-only
 *   debug log (`recordTokenTelemetry`). Nothing here writes a collection.
 * - **Flag-agnostic.** These helpers describe a composed request in the abstract
 *   and work for BOTH the legacy `buildPrompt` path and the optimized composer
 *   path, so a baseline can be measured before any behavior changes.
 * - **Privacy first.** Only token COUNTS and metadata are recorded — never full
 *   prompts or full user content. Category inputs are measured and discarded;
 *   the text itself never leaves this module.
 *
 * Token counts reuse the shared `estimateTokens` (~4 chars/token) heuristic so
 * category estimates are consistent with the rest of the usage tracker; when a
 * provider reports real usage the caller can override the totals.
 */

import { estimateTokens } from '../services/aiUsageTracker';
import logger from '../config/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The context categories whose token cost is tracked independently (Req 16.1). */
export interface PerCategoryTokens {
  /** Static instruction modules (core behavior, safety/policy, formatting). */
  staticInstr: number;
  /** Dynamic instruction modules (persona, task-/tool-specific guidance). */
  dynamicInstr: number;
  /** Retrieved User_Memory facts injected as data. */
  memory: number;
  /** Rolling conversation summary. */
  summary: number;
  /** Verbatim recent-message window. */
  recentHistory: number;
  /** Tool JSON schemas / definitions exposed to the model. */
  toolDefs: number;
  /** Tool-result payloads re-entering the request. */
  toolResults: number;
  /** The current user message and attachments text. */
  userInput: number;
}

const CATEGORY_KEYS: (keyof PerCategoryTokens)[] = [
  'staticInstr',
  'dynamicInstr',
  'memory',
  'summary',
  'recentHistory',
  'toolDefs',
  'toolResults',
  'userInput',
];

/**
 * A per-request telemetry record (Req 16.1–16.3). Cache metrics are optional
 * because they are only present when the provider reports them.
 */
export interface TokenTelemetry {
  perCategoryTokens: PerCategoryTokens;
  totalInputTokens: number;
  outputTokens: number;
  /** Prompt tokens served from the provider prompt cache, when supplied. */
  cachedInputTokens?: number;
  /** Provider cache-read metric, when supplied. */
  cacheRead?: number;
  /** Provider cache-write metric, when supplied. */
  cacheWrite?: number;
  model: string;
  provider: string;
  requestType: string;
  selectedModules: string[];
  exposedTools: string[];
  compactionOccurred: boolean;
  memoryRetrieved: boolean;
  cacheUsed: boolean;
  usedFallback: boolean;
}

/**
 * A category value may be supplied as raw text (measured here), a list of text
 * fragments (summed), or a precomputed token count. Passing text keeps callers
 * simple; passing a number lets a caller reuse provider-reported counts.
 */
export type CategoryInput = string | string[] | number | null | undefined;

export interface TokenTelemetryInput {
  categories: Partial<Record<keyof PerCategoryTokens, CategoryInput>>;
  /**
   * Total input tokens. When omitted, the sum of the per-category counts is
   * used; when the provider reports real prompt tokens, pass them here to
   * override the estimate.
   */
  totalInputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  cacheRead?: number;
  cacheWrite?: number;
  model?: string;
  provider?: string;
  requestType?: string;
  selectedModules?: string[];
  exposedTools?: string[];
  compactionOccurred?: boolean;
  memoryRetrieved?: boolean;
  cacheUsed?: boolean;
  usedFallback?: boolean;
}

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

/** Non-negative integer coercion; anything invalid collapses to 0. */
function nn(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/**
 * Token count of one category input. Text and text arrays are estimated with
 * the shared heuristic; a number is trusted as an already-computed count. The
 * measured text is never retained.
 */
export function tokensOf(value: CategoryInput): number {
  if (value == null) return 0;
  if (typeof value === 'number') return nn(value);
  if (Array.isArray(value)) {
    let total = 0;
    for (const part of value) total += estimateTokens(part);
    return total;
  }
  return estimateTokens(value);
}

/**
 * Build a `TokenTelemetry` record from the pieces of a composed request. Pure
 * and side-effect-free: it measures token counts and assembles metadata, but
 * neither logs nor persists. Works for the legacy and optimized paths alike.
 */
export function buildTokenTelemetry(input: TokenTelemetryInput): TokenTelemetry {
  const perCategoryTokens = {} as PerCategoryTokens;
  for (const key of CATEGORY_KEYS) {
    perCategoryTokens[key] = tokensOf(input.categories[key]);
  }

  const categorySum = CATEGORY_KEYS.reduce(
    (sum, key) => sum + perCategoryTokens[key],
    0
  );

  const telemetry: TokenTelemetry = {
    perCategoryTokens,
    totalInputTokens:
      input.totalInputTokens != null ? nn(input.totalInputTokens) : categorySum,
    outputTokens: nn(input.outputTokens ?? 0),
    model: input.model ?? 'unknown',
    provider: input.provider ?? 'unknown',
    requestType: input.requestType ?? 'unknown',
    selectedModules: input.selectedModules ?? [],
    exposedTools: input.exposedTools ?? [],
    compactionOccurred: input.compactionOccurred ?? false,
    memoryRetrieved: input.memoryRetrieved ?? false,
    cacheUsed: input.cacheUsed ?? false,
    usedFallback: input.usedFallback ?? false,
  };

  // Cache metrics only appear when the provider actually supplied them (Req 16.1).
  if (input.cachedInputTokens != null) {
    telemetry.cachedInputTokens = nn(input.cachedInputTokens);
  }
  if (input.cacheRead != null) telemetry.cacheRead = nn(input.cacheRead);
  if (input.cacheWrite != null) telemetry.cacheWrite = nn(input.cacheWrite);

  return telemetry;
}

// ---------------------------------------------------------------------------
// Emission (existing observability path — no new datastore)
// ---------------------------------------------------------------------------

/**
 * Convert a telemetry record into a privacy-safe object for the ledger event
 * `meta` field. Contains ONLY counts and metadata — never prompt or user
 * content (Req 16.4). This is how telemetry rides the existing metering/ledger
 * path without a new store: a caller merges the returned object into the
 * `meta` it already hands to `withVGU`.
 */
export function telemetryToLedgerMeta(
  telemetry: TokenTelemetry
): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    contextTelemetry: {
      perCategoryTokens: telemetry.perCategoryTokens,
      totalInputTokens: telemetry.totalInputTokens,
      outputTokens: telemetry.outputTokens,
      model: telemetry.model,
      provider: telemetry.provider,
      requestType: telemetry.requestType,
      selectedModules: telemetry.selectedModules,
      exposedTools: telemetry.exposedTools,
      compactionOccurred: telemetry.compactionOccurred,
      memoryRetrieved: telemetry.memoryRetrieved,
      cacheUsed: telemetry.cacheUsed,
      usedFallback: telemetry.usedFallback,
    },
  };

  const cache = telemetryToLedgerMetaCache(telemetry);
  if (cache) {
    (meta.contextTelemetry as Record<string, unknown>).cache = cache;
  }

  return meta;
}

/** Collect the cache metrics that the provider supplied, or undefined if none. */
function telemetryToLedgerMetaCache(
  telemetry: TokenTelemetry
): Record<string, number> | undefined {
  const cache: Record<string, number> = {};
  if (telemetry.cachedInputTokens != null) {
    cache.cachedInputTokens = telemetry.cachedInputTokens;
  }
  if (telemetry.cacheRead != null) cache.cacheRead = telemetry.cacheRead;
  if (telemetry.cacheWrite != null) cache.cacheWrite = telemetry.cacheWrite;
  return Object.keys(cache).length > 0 ? cache : undefined;
}

/**
 * Emit telemetry to the existing observability path and return the ledger
 * `meta` payload so the caller can attach it to the metered operation.
 *
 * Emits a metadata-only debug log (Req 16.3 — developer-retrievable). The log
 * carries counts and selection metadata but NO prompt or user content
 * (Req 16.4). Never throws — telemetry must never break a request.
 */
export function recordTokenTelemetry(
  telemetry: TokenTelemetry,
  ctx?: { userId?: string; workspaceId?: string; requestId?: string }
): Record<string, unknown> {
  const meta = telemetryToLedgerMeta(telemetry);

  try {
    logger.debug('veegpt context token telemetry', {
      component: 'veegpt-token-telemetry',
      userId: ctx?.userId,
      workspaceId: ctx?.workspaceId,
      requestId: ctx?.requestId,
      // Spread the same privacy-safe payload used for the ledger meta.
      ...(meta.contextTelemetry as Record<string, unknown>),
    });
  } catch {
    // Observability must never break the request path.
  }

  return meta;
}
