/**
 * VeeGPT `ContextComposer` (spec: veegpt-context-optimization, Req 5, 17, 18).
 *
 * Phase 4 of the context-optimization refactor: the assembly layer. Given the
 * `Context_Module`s selected for a request (`selectModules`, task 4.2) and the
 * tools exposed for the turn, `compose(...)` renders each module, orders the
 * rendered content by trust layer, and emits the final model request — either a
 * single concatenated prompt string (the byte-compatible-ordering form used
 * today by `buildPrompt`) or a role-separated message array (only for providers
 * verified to accept it — Req 15). It also records `Token_Telemetry` for the
 * composed request.
 *
 * DESIGN CONSTRAINTS:
 * - **Pure & side-effect-free.** `compose` reads only its arguments and the
 *   module `render()` outputs; it never touches the network, a DB, or global
 *   state, matching the `veegpt-*.logic.ts` convention. Telemetry is *built*
 *   here (a value) but *emitted* by the caller via the existing observability
 *   path (`recordTokenTelemetry`), so no new datastore is introduced.
 * - **Trust ordering (Req 17.1/17.2).** Content is ordered
 *   `system → developer → app-state → retrieved → tool-output → user`. This is
 *   both the static→dynamic→volatile prompt-cache ordering AND the trust
 *   ordering for prompt-injection safety: higher-authority content is earlier;
 *   user-controlled content is last and is NEVER promoted into an instruction
 *   layer. Each module already carries exactly one `trustLayer`; the composer
 *   only orders them and never reclassifies.
 * - **User content stays in the user layer (Req 17.2/17.4/18.3).** In the
 *   message-array form, only `user`-trust-layer content is placed in `user`/
 *   `assistant` roles; every other layer (including memory and the rolling
 *   summary, which are DATA — Req 18.1/18.3) goes into a non-user role and is
 *   never treated as an authoritative instruction.
 * - **No behavior invented.** The composer renders modules verbatim (their
 *   content was lifted byte-for-byte from `buildPrompt`) and never rewrites,
 *   summarizes, or reorders within a layer — registry order is preserved inside
 *   each layer so the concatenation follows `buildPrompt`'s ordering.
 */

import type { ChatTool } from '../services/AIServiceManager';
import {
  getContextConfig,
  type CachingMode,
} from '../config/veegpt-context.config';
import {
  buildTokenTelemetry,
  type PerCategoryTokens,
  type TokenTelemetry,
} from './veegpt-token-telemetry';
import type {
  ComposeInput,
  ContextModule,
  TrustLayer,
} from './veegpt-modules';
import type { Msg } from './veegpt-memory.logic';
import {
  planHistoryCompaction,
  type HistoryCompactionPlan,
} from './veegpt-history-compaction.logic';

// ---------------------------------------------------------------------------
// Trust-layer ordering (Req 17.1) — static → dynamic → volatile
// ---------------------------------------------------------------------------

/**
 * Rank of each trust layer in the composed request. Lower rank = higher
 * authority = earlier in the prompt (and the byte-stable static prefix for
 * provider prompt caching). This is the single source of truth for ordering;
 * `TRUST_LAYER_ORDER` mirrors the design's ordering exactly.
 */
const TRUST_LAYER_ORDER: readonly TrustLayer[] = [
  'system',
  'developer',
  'app-state',
  'retrieved',
  'tool-output',
  'user',
];

const TRUST_LAYER_RANK: Readonly<Record<TrustLayer, number>> =
  TRUST_LAYER_ORDER.reduce(
    (acc, layer, index) => {
      acc[layer] = index;
      return acc;
    },
    {} as Record<TrustLayer, number>
  );

/** The only trust layer whose content is user-controlled (lowest authority). */
const USER_TRUST_LAYER: TrustLayer = 'user';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A role-separated chat message (OpenAI-style), used only for verified models. */
export interface ComposedMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** A rendered module segment (module content + where it sits in the request). */
export interface ComposedSegment {
  moduleId: string;
  trustLayer: TrustLayer;
  contextClass: ContextModule['contextClass'];
  /** `true` for static core modules present on every request (Req 5.4). */
  always: boolean;
  /**
   * `true` when this segment comes from a module marked as a KNOWN intentional
   * repetition (W1 rich-output, W2 workspace-actions-guidance, W11
   * output-contract). `dedupeContext` NEVER drops such a segment (Req 13.3).
   */
  intentionalRepeat: boolean;
  content: string;
}

/**
 * Extra composition inputs the modules don't carry: the target-model verdict
 * (Req 15), telemetry metadata, and any provider-reported overrides. All
 * optional so the composer stays usable for a baseline measurement of the
 * legacy path before any behavior changes.
 */
export interface ComposeOptions {
  /**
   * `true` ONLY when the target provider/model is verified to accept a
   * role-separated message array (Req 15). When false/omitted the composer
   * emits the concatenated prompt string so no provider is broken.
   */
  useMessageArray?: boolean;
  /** Model/provider/request metadata for `Token_Telemetry` (Req 16). */
  model?: string;
  provider?: string;
  requestType?: string;
  /**
   * Tool-result payloads re-entering the request on a grounded second pass, if
   * the caller has them at compose time (measured for telemetry only).
   */
  toolResults?: string | string[];
  /** Provider-reported real usage overrides (else estimated from content). */
  totalInputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  cacheRead?: number;
  cacheWrite?: number;
  /** Request-shape flags recorded in telemetry. */
  compactionOccurred?: boolean;
  memoryRetrieved?: boolean;
  cacheUsed?: boolean;
  usedFallback?: boolean;
  /**
   * Provider prompt-caching mode for this request (Req 14). Defaults to the
   * centralized `getContextConfig().caching` when omitted (never hard-coded —
   * Req 22.3):
   *   • `'auto'` — perform static-prefix ordering ONLY and rely on the
   *     provider's *automatic* prompt caching (which keys off an identical
   *     leading prefix). No provider-specific mechanism is enabled because the
   *     project's SDK/gateway cannot express one today (Req 14.3).
   *   • `'off'` — no caching behavior at all. Ordering is STILL applied (it is
   *     also the trust/injection ordering), but nothing is signalled and the
   *     request is composed/sent unchanged.
   * Either way the composed `prompt`/`messages` bytes are IDENTICAL — the mode
   * only affects the reported `cacheable` metadata, keeping the path no-op-safe
   * (Req 14.4 / 19.5).
   */
  caching?: CachingMode;
}

/** The assembled model request (design §ContextComposer → `ComposedRequest`). */
export interface ComposedRequest {
  /**
   * The concatenated prompt string, ordered static→dynamic→volatile. Always
   * populated (the safe default form). When `useMessageArray` is set this is
   * still produced as the fallback the caller can revert to per model (Req 15.2).
   */
  prompt: string;
  /**
   * The role-separated message array, present ONLY when `useMessageArray` was
   * requested (i.e. a verified model). `undefined` otherwise so the caller
   * knows to send `prompt` instead.
   */
  messages?: ComposedMessage[];
  /** The tools exposed for this turn, passed through unchanged. */
  tools: ChatTool[];
  /** Per-request token accounting + composition metadata (Req 16). */
  telemetry: TokenTelemetry;
  /** Ids of the modules that contributed content, in composed order. */
  selectedModuleIds: string[];
  /** The rendered segments, in composed order (for tests/telemetry/debug). */
  segments: ComposedSegment[];
  /**
   * Prompt-caching metadata for this request (Req 14). The composer NEVER
   * enables a provider-specific caching mechanism (the SDK/gateway cannot
   * express one — Req 14.3) and NEVER alters the composed bytes based on this,
   * so the whole caching path is no-op-safe (Req 14.4 / 19.5).
   */
  cacheable: {
    /**
     * The byte length of the leading static prefix — the contiguous run of
     * static core modules (`always === true`) at the head of the concatenated
     * prompt, which is byte-identical across consecutive turns of the same
     * conversation (unchanged static inputs) and is therefore the largest
     * cache-stable `Static_Prefix` the composer can guarantee (Req 14.1/14.2).
     */
    staticPrefixLen: number;
    /**
     * The resolved caching mode for this request (`'auto'` = ordering-only +
     * provider automatic caching; `'off'` = no caching behavior).
     */
    mode: CachingMode;
    /**
     * `true` when static-prefix ordering is relied upon for the provider's
     * automatic caching (`mode === 'auto'`); `false` when caching is off. This
     * is the value the caller records as `cacheUsed` in `Token_Telemetry`; it
     * NEVER changes the composed request.
     */
    enabled: boolean;
  };
}

// ---------------------------------------------------------------------------
// Ordering + rendering
// ---------------------------------------------------------------------------

/**
 * Stable-sort the modules by trust-layer rank. Within a layer, registry order
 * is preserved (a stable sort keyed only by rank), so the concatenation follows
 * `buildPrompt`'s ordering. Never mutates the input array.
 */
function orderByTrustLayer(modules: ContextModule[]): ContextModule[] {
  return modules
    .map((module, index) => ({ module, index }))
    .sort((a, b) => {
      const rankDelta =
        TRUST_LAYER_RANK[a.module.trustLayer] -
        TRUST_LAYER_RANK[b.module.trustLayer];
      // Fall back to original index to keep the sort stable within a layer.
      return rankDelta !== 0 ? rankDelta : a.index - b.index;
    })
    .map((entry) => entry.module);
}

/**
 * Render every module and drop the ones that contribute nothing this turn
 * (`render()` returned '' or whitespace-only). Content is kept verbatim — the
 * composer never trims or rewrites a module's rendered bytes.
 */
function renderSegments(
  modules: ContextModule[],
  input: ComposeInput
): ComposedSegment[] {
  const segments: ComposedSegment[] = [];
  for (const module of orderByTrustLayer(modules)) {
    const content = module.render(input);
    if (!content || !content.trim()) continue;
    segments.push({
      moduleId: module.id,
      trustLayer: module.trustLayer,
      contextClass: module.contextClass,
      always: module.always,
      intentionalRepeat: Boolean(module.intentionalRepeat),
      content,
    });
  }
  return segments;
}

// ---------------------------------------------------------------------------
// De-duplication (Req 13) — each information unit appears once
// ---------------------------------------------------------------------------

/**
 * Normalize a segment's content into a comparison key for duplicate detection.
 * Only outer whitespace is trimmed — internal bytes are compared exactly so two
 * genuinely different instructions that merely share leading/trailing blank
 * lines are never conflated. This keeps de-duplication CONSERVATIVE:
 * correctness wins over token savings (design principle), so we only collapse
 * units that are the same information, not units that merely look similar.
 */
function dedupeKey(content: string): string {
  return content.trim();
}

/**
 * `dedupeContext()` (Req 13) — remove information duplicated across the rendered
 * context sources so the same unit is not sent multiple times in one request.
 *
 * The composer's rendered `ComposedSegment`s ARE the addressable information
 * units: each segment is one source's contribution (system/developer
 * instructions, memory, summary, recent messages, tool/workspace context, user
 * profile, retrieved documents, …). This function scans them in composed order
 * and, when the SAME unit (by `dedupeKey`) has already been included by an
 * earlier segment, drops the later duplicate (Req 13.1/13.2) — each
 * non-`intentionalRepeat` unit therefore appears exactly once.
 *
 * HARD GUARANTEE (Req 13.3): a segment whose module is a KNOWN intentional
 * repetition (W1 `rich-output`, W2 `workspace-actions-guidance`, W11
 * `output-contract`) is ALWAYS kept verbatim and is never dropped, regardless of
 * whether its content also appears elsewhere. Such repetitions exist for
 * lightweight-model reliability and may only be retired once the
 * `Regression_Suite` proves removal is output-equivalent (task 11.3); this pure
 * function never makes that call on its own.
 *
 * Pure: returns a NEW array in the same order; never mutates the input segments
 * and never rewrites a kept segment's content (units are dropped whole, never
 * partially trimmed — mid-segment editing is reserved for measurement-driven
 * tuning in task 11.3).
 */
export function dedupeContext(segments: ComposedSegment[]): ComposedSegment[] {
  const safe = Array.isArray(segments) ? segments : [];
  const seen = new Set<string>();
  const kept: ComposedSegment[] = [];

  for (const segment of safe) {
    const key = dedupeKey(segment.content);

    // Intentional repetitions are preserved unconditionally (Req 13.3). We still
    // register their unit so a LATER non-intentional segment that merely repeats
    // the same information is de-duplicated (the intentional copy is the one
    // that stays), but we never drop the intentional segment itself.
    if (segment.intentionalRepeat) {
      kept.push(segment);
      if (key) seen.add(key);
      continue;
    }

    // Empty/whitespace-only content carries no information unit; keep as-is
    // (renderSegments already excludes truly empty segments, this is defensive).
    if (!key) {
      kept.push(segment);
      continue;
    }

    // A non-intentional unit already included by an earlier segment → drop it.
    if (seen.has(key)) continue;

    seen.add(key);
    kept.push(segment);
  }

  return kept;
}

// ---------------------------------------------------------------------------
// Emission — concatenated prompt (default) and role-separated messages
// ---------------------------------------------------------------------------

/**
 * Join the rendered segments into a single concatenated prompt string, ordered
 * static→dynamic→volatile. Segments are joined with a blank-line separator so
 * boundaries between modules read cleanly; each segment's own content is
 * emitted verbatim.
 */
function buildConcatenatedPrompt(segments: ComposedSegment[]): string {
  return segments.map((s) => s.content).join('\n\n');
}

/**
 * Build the role-separated message array (Req 15) with a strict trust boundary
 * (Req 17.1/17.2): every non-`user` layer is concatenated into a single leading
 * `system` message (trusted instructions + application-state DATA + retrieved
 * DATA), and ONLY `user`-trust-layer content becomes `user`/`assistant`
 * messages. User-controlled content is therefore never promoted above the role
 * it occupies today, and memory/summary DATA never enters a user role or an
 * authoritative instruction it could use to override safety (Req 18.3).
 *
 * User-layer content is sourced from the request's `history` (each turn keeps
 * its own `user`/`assistant` role) and the current user message, matching the
 * `recent-conversation` and `current-request` modules exactly, so no user
 * content is invented or relocated.
 */
function buildMessages(
  segments: ComposedSegment[],
  input: ComposeInput
): ComposedMessage[] {
  const messages: ComposedMessage[] = [];

  // 1) One system message: all trusted/data layers, in composed order.
  const systemContent = segments
    .filter((s) => s.trustLayer !== USER_TRUST_LAYER)
    .map((s) => s.content)
    .join('\n\n');
  if (systemContent.trim()) {
    messages.push({ role: 'system', content: systemContent });
  }

  // 2) Recent conversation history — each turn keeps its own role (user layer).
  const history: Msg[] = Array.isArray(input.history) ? input.history : [];
  for (const turn of history) {
    const content = typeof turn?.content === 'string' ? turn.content : '';
    if (!content.trim()) continue;
    messages.push({
      role: turn.role === 'assistant' ? 'assistant' : 'user',
      content,
    });
  }

  // 3) The current user message (always retained — user layer).
  if (input.currentMessage && input.currentMessage.trim()) {
    messages.push({ role: 'user', content: input.currentMessage });
  }

  return messages;
}

/**
 * Byte length of the leading static prefix: the contiguous run of static core
 * modules (`always === true`) at the head of the composed segments, joined the
 * same way the concatenated prompt joins them.
 *
 * This is MAXIMAL and byte-stable by construction (Req 14.1/14.2): trust-layer
 * ordering places all `always` static modules (the only `system`-layer modules)
 * first, and their rendered content does not depend on per-turn/volatile input
 * (identity, formatting, rich-output, output-contract are constants; the
 * safety-policy depends only on the conversation-stable `contentSafety` pref),
 * so the run is byte-identical across consecutive turns of the same
 * conversation. Volatile per-turn content (turn note, current message) sorts
 * strictly after these, so it never enters the prefix. The prefix stops at the
 * first non-`always` segment — persona and app-state are excluded on purpose
 * because they can change within a conversation, which keeps the reported
 * prefix truly stable rather than optimistically long. If the very first
 * segment is not a static module (should not happen given trust ordering) the
 * prefix is empty.
 */
function staticPrefixLength(segments: ComposedSegment[]): number {
  const leadingStatic: string[] = [];
  for (const segment of segments) {
    if (!segment.always) break;
    leadingStatic.push(segment.content);
  }
  return buildConcatenatedPrompt(
    leadingStatic.map((content) => ({ content }) as ComposedSegment)
  ).length;
}

// ---------------------------------------------------------------------------
// Telemetry categorization
// ---------------------------------------------------------------------------

/**
 * Map a rendered segment to the `Token_Telemetry` category its tokens count
 * against (Req 16.1). Instruction layers split into static vs dynamic; memory,
 * summary, recent history, and user input are called out individually; the
 * remaining trusted app-state/tool-context modules count as dynamic
 * instructions (they are per-turn, non-static context).
 */
function telemetryCategoryFor(
  segment: ComposedSegment
): keyof PerCategoryTokens {
  if (segment.contextClass === 'static') return 'staticInstr';
  switch (segment.moduleId) {
    case 'user-memory':
      return 'memory';
    case 'conversation-summary':
      return 'summary';
    case 'recent-conversation':
      return 'recentHistory';
    case 'current-request':
      return 'userInput';
    default:
      return 'dynamicInstr';
  }
}

/** Serialize a tool definition for token estimation (schemas exposed to model). */
function toolDefText(tools: ChatTool[]): string[] {
  return tools.map((tool) => {
    try {
      return JSON.stringify(tool);
    } catch {
      return `${tool?.function?.name ?? ''} ${tool?.function?.description ?? ''}`;
    }
  });
}

// ---------------------------------------------------------------------------
// Bounded conversation history (Req 7) — recent-N window + summary + state
// ---------------------------------------------------------------------------

/** A `ComposeInput` whose recent window has been bounded, plus the plan used. */
export interface BoundedHistoryResult {
  /**
   * A NEW `ComposeInput` identical to the caller's except `history` has been
   * bounded to `historyTokenBudget`. The current user message is untouched and
   * always retained (Req 7.6/9.6).
   */
  input: ComposeInput;
  /** The compaction plan (retained window, overflow, extracted state, flags). */
  plan: HistoryCompactionPlan;
}

/**
 * Bound the conversation-history tokens of a `ComposeInput` to the configured
 * `historyTokenBudget` (Req 7.1/7.4) BEFORE composing, using the pure
 * `planHistoryCompaction` planner and the centralized config (Req 22.3 — the
 * threshold is read from `getContextConfig()`, never hard-coded here).
 *
 * The returned `input` has its `history` replaced with the bounded recent
 * window; the returned `plan` carries the overflow messages plus the durable
 * `Conversation_State` candidates the caller MUST record (via
 * `mergeConversationState`) and summarize BEFORE those messages are dropped
 * (Req 7.3/7.4). When summarization is unavailable the plan fails open and the
 * full window is retained (Req 7.6/19.3).
 *
 * Pure: never mutates the caller's `input`; returns a shallow copy.
 */
export function boundHistory(
  input: ComposeInput,
  opts: {
    /** Override the configured budget (defaults to `getContextConfig()`). */
    historyTokenBudget?: number;
    /** Whether summarization succeeded/was available for this turn. */
    summarizationAvailable?: boolean;
  } = {}
): BoundedHistoryResult {
  const budget =
    opts.historyTokenBudget ?? getContextConfig().historyTokenBudget;
  const plan = planHistoryCompaction({
    recentWindow: Array.isArray(input.history) ? input.history : [],
    historyTokenBudget: budget,
    summarizationAvailable: opts.summarizationAvailable,
  });
  return { input: { ...input, history: plan.history }, plan };
}

// ---------------------------------------------------------------------------
// compose — the public entry point
// ---------------------------------------------------------------------------

/**
 * Compose the final model request from the selected `Context_Module`s and the
 * exposed tools.
 *
 * Ordering: modules are ordered by trust layer (system → developer → app-state
 * → retrieved → tool-output → user); registry order is preserved within a layer.
 * User content is kept in the user layer only and is never promoted (Req 17.2).
 *
 * De-duplication (Req 13): after rendering, `dedupeContext` removes information
 * repeated across sources so each unit is sent once, while ALWAYS preserving
 * `intentionalRepeat` segments (W1/W2/W11) verbatim (Req 13.3).
 *
 * Output form: a concatenated prompt string is always produced (the safe,
 * byte-compatible-ordering default). When `options.useMessageArray` is set
 * (verified model only — Req 15) a role-separated message array is ALSO produced
 * with user content confined to `user`/`assistant` roles; the caller can revert
 * to `prompt` for any model that cannot accept the array (Req 15.2).
 *
 * Caching (Req 14): the static→dynamic→volatile ordering makes the leading
 * bytes the largest achievable `Static_Prefix`, byte-identical across
 * consecutive turns; `cacheable.staticPrefixLen` reports its length. The
 * resolved caching mode (`options.caching` or `getContextConfig().caching`) is
 * surfaced on `cacheable` but NEVER changes the composed bytes: `'auto'` relies
 * on the provider's automatic caching (no SDK-inexpressible mechanism is
 * enabled — Req 14.3) and `'off'` composes/sends unchanged. Both are
 * no-op-safe (Req 14.4 / 19.5).
 *
 * Telemetry: a `Token_Telemetry` record is built for the composed request
 * (Req 16) — counts and metadata only, never full prompts or user content. It
 * is returned as a value; the caller emits it via `recordTokenTelemetry`.
 *
 * Pure: reads only its arguments, the module render outputs, and the centralized
 * config (for the default caching mode); no I/O, no mutation of the inputs.
 */
export function compose(
  modules: ContextModule[],
  tools: ChatTool[],
  input: ComposeInput,
  options: ComposeOptions = {}
): ComposedRequest {
  const safeModules = Array.isArray(modules) ? modules : [];
  const safeTools = Array.isArray(tools) ? tools : [];

  // Render the selected modules, then de-duplicate information repeated across
  // sources (Req 13). `dedupeContext` preserves every `intentionalRepeat`
  // segment (W1/W2/W11) verbatim (Req 13.3) and drops only later duplicates of
  // an already-included non-intentional unit. All downstream emission
  // (prompt/messages/telemetry/static-prefix) uses the de-duplicated segments.
  const segments = dedupeContext(renderSegments(safeModules, input));
  const prompt = buildConcatenatedPrompt(segments);
  const messages = options.useMessageArray
    ? buildMessages(segments, input)
    : undefined;

  // ── Prompt caching (Req 14) — ordering-only, no-op-safe ──────────────────
  // Resolve the caching mode from the centralized config (Req 22.3) unless the
  // caller overrode it. The mode NEVER alters the composed `prompt`/`messages`
  // bytes above — the composer only orders content (static→dynamic→volatile) so
  // the largest possible `Static_Prefix` sits at the head, and relies on the
  // provider's *automatic* caching for `'auto'`. No provider-specific mechanism
  // is enabled because the project's SDK/gateway cannot express one today
  // (Req 14.3), so both modes are fully no-op-safe (Req 14.4 / 19.5).
  const cachingMode: CachingMode = options.caching ?? getContextConfig().caching;
  const cacheEnabled = cachingMode === 'auto';

  // ── Token_Telemetry (Req 16): counts + metadata only ─────────────────────
  const categories: Partial<Record<keyof PerCategoryTokens, string | string[]>> =
    {};
  for (const segment of segments) {
    const category = telemetryCategoryFor(segment);
    const existing = categories[category];
    if (existing == null) {
      categories[category] = segment.content;
    } else if (Array.isArray(existing)) {
      existing.push(segment.content);
    } else {
      categories[category] = [existing, segment.content];
    }
  }
  const toolDefs = toolDefText(safeTools);
  if (toolDefs.length) categories.toolDefs = toolDefs;
  if (options.toolResults != null) categories.toolResults = options.toolResults;

  const telemetry = buildTokenTelemetry({
    categories,
    totalInputTokens: options.totalInputTokens,
    outputTokens: options.outputTokens,
    cachedInputTokens: options.cachedInputTokens,
    cacheRead: options.cacheRead,
    cacheWrite: options.cacheWrite,
    model: options.model,
    provider: options.provider,
    requestType: options.requestType,
    selectedModules: segments.map((s) => s.moduleId),
    exposedTools: safeTools
      .map((t) => t?.function?.name)
      .filter((name): name is string => Boolean(name)),
    compactionOccurred: options.compactionOccurred,
    memoryRetrieved: options.memoryRetrieved,
    // Reflect whether static-prefix ordering is relied upon for provider
    // automatic caching this turn ('auto'); an explicit caller override wins.
    cacheUsed: options.cacheUsed ?? cacheEnabled,
    usedFallback: options.usedFallback,
  });

  return {
    prompt,
    messages,
    tools: safeTools,
    telemetry,
    selectedModuleIds: segments.map((s) => s.moduleId),
    segments,
    cacheable: {
      staticPrefixLen: staticPrefixLength(segments),
      mode: cachingMode,
      enabled: cacheEnabled,
    },
  };
}
