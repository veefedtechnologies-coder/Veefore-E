/**
 * VeeGPT context-optimization configuration — the single authoritative source
 * for every tunable value used by the context-assembly (composer) path.
 *
 * Design rules this file enforces (Requirement 22):
 *   • Every configurable value is centralized here (22.1) — no optimization
 *     threshold is hard-coded anywhere else in the codebase (22.3).
 *   • Every value has a safe default (22.2), chosen so that behavior does not
 *     change when the corresponding env var is unset.
 *   • No configurable value is introduced beyond what a requirement needs (22.6).
 *
 * All env vars follow the existing `VEEGPT_*` convention (see
 * veegpt-vgu.config.ts) so production can be retuned without a deploy.
 *
 * NOTHING that reads these thresholds may hard-code its own copy. Read it from
 * `getContextConfig()`.
 */

// ---------------------------------------------------------------------------
// Safe defaults
// ---------------------------------------------------------------------------

/**
 * The default recent-window / summary sizes mirror the current
 * `veegpt-memory.logic.ts` constants exactly (`LONG_TERM_VERBATIM=20`,
 * `SHORT_TERM_VERBATIM=8`, `SUMMARY_BATCH=10`) so that, when these env vars are
 * unset, the composer reproduces the pre-refactor windowing.
 */
const DEFAULTS = {
  /** = LONG_TERM_VERBATIM; no behavior change when unset. */
  recentWindowLongTerm: 20,
  /** = SHORT_TERM_VERBATIM. */
  recentWindowShortTerm: 8,
  /** = SUMMARY_BATCH (older messages summarized in batches of this size). */
  summaryBatch: 10,
  /**
   * Upper bound on input tokens attributable to conversation history (§7). Set
   * deliberately HIGH so the default bound does not shrink any existing
   * conversation; compaction only triggers past this ceiling.
   */
  historyTokenBudget: 24000,
  /** Max User_Memory items scanned/injected in one composed request (§9). */
  memoryRetrievalLimit: 50,
  /** Fail-open timeout for memory relevance selection, in ms (Req 9.5/9.7). */
  memoryRetrievalBudgetMs: 150,
  /** Tool-result reduction threshold, in tokens (§12). */
  toolResultMaxTokens: 2000,
  /** Selective tool exposure. Default ON when the optimization is enabled. */
  selectiveTools: true,
  /**
   * Provider prompt-caching mode (§14). 'auto' = static-prefix ordering only,
   * relying on provider automatic caching; 'off' = no caching behavior.
   */
  caching: 'auto' as CachingMode,
  /**
   * Retention timeout (days) before an `unnecessary`-classified instruction may
   * be removed without explicit regression confirmation (Req 4.6).
   */
  unnecessaryRetentionDays: 30,
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CachingMode = 'auto' | 'off';

export interface VeegptContextConfig {
  /** Most-recent verbatim window for long-term conversations. Default 20. */
  recentWindowLongTerm: number;
  /** Most-recent verbatim window for shallow conversations. Default 8. */
  recentWindowShortTerm: number;
  /** Batch size for summarizing older messages. Default 10. */
  summaryBatch: number;
  /** Max input tokens attributable to conversation history (§7). */
  historyTokenBudget: number;
  /** Max memory items scanned/injected per request (§9). */
  memoryRetrievalLimit: number;
  /** Fail-open memory-retrieval time budget in ms (Req 9.5/9.7). */
  memoryRetrievalBudgetMs: number;
  /** Tool-result reduction threshold in tokens (§12). */
  toolResultMaxTokens: number;
  /** Whether to expose only intent-selected tools. Default true. */
  selectiveTools: boolean;
  /** Provider prompt-caching mode (§14). */
  caching: CachingMode;
  /** Retention timeout (days) for `unnecessary` instructions (Req 4.6). */
  unnecessaryRetentionDays: number;
}

// ---------------------------------------------------------------------------
// Env readers (mirror the veegpt-vgu.config.ts convention)
// ---------------------------------------------------------------------------

/** Read a boolean env flag. Only "1"/"true"/"yes"/"on" (any case) are truthy. */
function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const v = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off', ''].includes(v)) return false;
  return fallback;
}

/** Read a positive integer override; non-numeric or non-positive → fallback. */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** Read the caching mode; anything other than 'off' resolves to the fallback. */
function envCaching(name: string, fallback: CachingMode): CachingMode {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const v = raw.trim().toLowerCase();
  if (v === 'off') return 'off';
  if (v === 'auto') return 'auto';
  return fallback;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve the full, env-overridable context configuration. Every value has a
 * safe default and is read from here — no threshold is hard-coded elsewhere
 * (Req 22.1/22.2/22.3).
 *
 * Env overrides:
 *   VEEGPT_CTX_RECENT_LONG_TERM         → recentWindowLongTerm
 *   VEEGPT_CTX_RECENT_SHORT_TERM        → recentWindowShortTerm
 *   VEEGPT_CTX_SUMMARY_BATCH            → summaryBatch
 *   VEEGPT_CTX_HISTORY_TOKENS           → historyTokenBudget
 *   VEEGPT_CTX_MEMORY_LIMIT             → memoryRetrievalLimit
 *   VEEGPT_CTX_MEMORY_BUDGET_MS         → memoryRetrievalBudgetMs
 *   VEEGPT_CTX_TOOL_RESULT_TOKENS       → toolResultMaxTokens
 *   VEEGPT_CTX_SELECTIVE_TOOLS          → selectiveTools
 *   VEEGPT_CTX_CACHING                  → caching ('auto' | 'off')
 *   VEEGPT_CTX_UNNECESSARY_RETENTION_DAYS → unnecessaryRetentionDays
 */
export function getContextConfig(): VeegptContextConfig {
  return {
    recentWindowLongTerm: envInt(
      'VEEGPT_CTX_RECENT_LONG_TERM',
      DEFAULTS.recentWindowLongTerm,
    ),
    recentWindowShortTerm: envInt(
      'VEEGPT_CTX_RECENT_SHORT_TERM',
      DEFAULTS.recentWindowShortTerm,
    ),
    summaryBatch: envInt('VEEGPT_CTX_SUMMARY_BATCH', DEFAULTS.summaryBatch),
    historyTokenBudget: envInt(
      'VEEGPT_CTX_HISTORY_TOKENS',
      DEFAULTS.historyTokenBudget,
    ),
    memoryRetrievalLimit: envInt(
      'VEEGPT_CTX_MEMORY_LIMIT',
      DEFAULTS.memoryRetrievalLimit,
    ),
    memoryRetrievalBudgetMs: envInt(
      'VEEGPT_CTX_MEMORY_BUDGET_MS',
      DEFAULTS.memoryRetrievalBudgetMs,
    ),
    toolResultMaxTokens: envInt(
      'VEEGPT_CTX_TOOL_RESULT_TOKENS',
      DEFAULTS.toolResultMaxTokens,
    ),
    // `selectiveTools` only ever applies while the optimization is enabled; when
    // enabled it defaults ON, and can be forced off via env.
    selectiveTools: envBool(
      'VEEGPT_CTX_SELECTIVE_TOOLS',
      DEFAULTS.selectiveTools,
    ),
    caching: envCaching('VEEGPT_CTX_CACHING', DEFAULTS.caching),
    unnecessaryRetentionDays: envInt(
      'VEEGPT_CTX_UNNECESSARY_RETENTION_DAYS',
      DEFAULTS.unnecessaryRetentionDays,
    ),
  };
}

/** The safe defaults, exported for tests and documentation. */
export const VEEGPT_CONTEXT_DEFAULTS: Readonly<VeegptContextConfig> = DEFAULTS;
