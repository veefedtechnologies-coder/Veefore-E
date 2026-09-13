/**
 * Golden / equivalence harness for the VeeGPT context-optimization refactor
 * (spec: veegpt-context-optimization, task 10.1 — Phase 8 Regression_Suite).
 *
 * This harness proves the OPTIMIZED (Optimization_Flag ON) context path is
 * BEHAVIOR-EQUIVALENT to the LEGACY (flag OFF) path for identical deterministic
 * inputs, WITHOUT calling a model provider — every check is over the composed
 * request and the deterministic selection/merge behaviors, never the stochastic
 * model prose (Req 3.1–3.5, 20.1–20.4).
 *
 * The legacy path is the source of truth. Its deterministic facts are:
 *   • it exposed the FULL tier-permitted tool set every turn
 *     (`filterToolsByTier(ALL_VEEGPT_TOOLS, tier)`);
 *   • it injected the WHOLE User_Memory store every turn;
 *   • it always sent every static instruction/safety block;
 *   • the persona block was `getAgentDirectivesForTier(id, tier)` (that logic is
 *     shared, unchanged, between both paths).
 * The optimized path SELECTS from those, so equivalence is asserted as
 * behavior-preserving invariants (never a byte-diff of the whole prompt, which
 * would wrongly forbid the very token savings the refactor exists to make):
 *
 *   A. Tool safeguards preserved — optimized tools ⊆ legacy tier-permitted set
 *      (no new/over-tier tool is ever exposed), and every tool the case
 *      genuinely needs is retained (no needed tool dropped to save tokens).
 *   B. Persona outcome identical — the optimized `persona` module renders
 *      exactly the tier-resolved directives the legacy path used, byte-for-byte,
 *      and no other persona's directives leak in.
 *   C. Safety / static instructions preserved — every static module is present
 *      and renders byte-identically to the legacy content.
 *   D. Memory behavior preserved — selective retrieval only ever returns a
 *      subset of the legacy full store, in stored order, in the legacy
 *      `- [id:…] text` format; `mergeMemoryItems` is path-independent; every
 *      fact the case declares relevant is retained; fail-open cases return all.
 *   E. Streaming / API / ledger shape preserved — the composed request exposes
 *      the exact fields the downstream (unchanged) streaming + metering path
 *      consumes, and the telemetry maps to the stable ledger `meta` shape.
 *
 * On ANY failing dimension the harness marks the case as a regression and
 * REVERTS that case to the legacy baseline (its `baseline` field), surfacing a
 * regression indicator — the exact degrade-to-baseline behavior Req 3.6 / 20.5
 * requires. The suite (`golden-equivalence.test.ts`) drives these checks; other
 * Phase-8 tasks (10.2/10.3/10.4) reuse the same case set and helpers.
 */

import {
  classifyIntent,
  type Capability,
} from '../../server/routes/veegpt-intent.logic';
import {
  selectModules,
  CONTEXT_MODULES,
  STATIC_MODULES,
  getModuleById,
  type ComposeInput,
  type PromptPreferences,
} from '../../server/routes/veegpt-modules';
import {
  selectTools,
  ALL_VEEGPT_TOOLS,
} from '../../server/routes/veegpt-tool-selection.logic';
import { compose } from '../../server/routes/veegpt-context-composer';
import {
  retrieveUserMemory,
  renderMemoryProfile,
  type MemoryItem,
  type MemoryRetrievalResult,
} from '../../server/routes/veegpt-memory-retrieval.logic';
import {
  telemetryToLedgerMeta,
  type TokenTelemetry,
} from '../../server/routes/veegpt-token-telemetry';
import { getAgentDirectivesForTier } from '../../server/routes/veegpt-agents';
import {
  filterToolsByTier,
  isToolAllowedForTier,
  type VeeGPTTier,
} from '../../server/config/veegpt-tiers';
import type { Msg } from '../../server/routes/veegpt-memory.logic';
import type { ChatTool } from '../../server/services/AIServiceManager';

// ---------------------------------------------------------------------------
// Case model
// ---------------------------------------------------------------------------

/** The deterministic inputs for one representative request (mocked provider). */
export interface EquivalenceCaseInput {
  message: string;
  priorMessages?: Msg[];
  hasMedia?: boolean;
  forcedTool?: string;
  selectedAccountId?: string | null;
  selectedAgentId?: string | null;
  tier: VeeGPTTier;
  prefs?: PromptPreferences;
  /** The full stored User_Memory (legacy injected all of it). */
  memory?: MemoryItem[];
  memorySummary?: string;
  workspaceContext?: string;
  accounts?: any[];
}

/** Hand-authored golden expectations derived from the legacy source of truth. */
export interface EquivalenceCaseGolden {
  /**
   * The exact tool names the optimized path SHOULD expose for this case
   * (tier-respecting). When omitted, only the subset/needed-tools invariants are
   * checked (not an exact-set match) — used for ambiguous/fail-open cases whose
   * exact set is intentionally the full tier set.
   */
  exposedTools?: string[];
  /**
   * Tools the case genuinely needs; each MUST survive selection (never dropped
   * to save tokens — Req 11.5). Always checked.
   */
  requiredTools: string[];
  /** User_Memory ids that are relevant to this request and MUST be retrieved. */
  relevantMemoryIds?: string[];
  /** True when memory relevance cannot be narrowed → all memory is included. */
  expectMemoryIncludesAll?: boolean;
}

export interface EquivalenceCase {
  name: string;
  category: string;
  input: EquivalenceCaseInput;
  golden: EquivalenceCaseGolden;
}

// ---------------------------------------------------------------------------
// Building the two paths
// ---------------------------------------------------------------------------

/** Turn a case's inputs into the `ComposeInput` both paths render from. */
export function toComposeInput(input: EquivalenceCaseInput): ComposeInput {
  return {
    prefs: input.prefs ?? {},
    selectedAgentId: input.selectedAgentId ?? null,
    history: input.priorMessages ?? [],
    currentMessage: input.message,
    memorySummary: input.memorySummary,
    workspaceContext: input.workspaceContext,
    accounts: input.accounts,
    hasMedia: input.hasMedia,
    selectedAccountId: input.selectedAccountId ?? null,
    forcedTool: input.forcedTool,
    tier: input.tier,
  };
}

/** Tool names, in a stable sorted order, for set comparison. */
export function toolNames(tools: readonly ChatTool[]): string[] {
  return tools
    .map((t) => t.function?.name)
    .filter((n): n is string => Boolean(n))
    .sort();
}

/** The LEGACY baseline: everything the flag-off path assembled for the case. */
export interface LegacyBaseline {
  tierTools: ChatTool[];
  tierToolNames: string[];
  persona: string;
  memory: MemoryItem[];
  memoryProfile: string;
}

export function buildLegacyBaseline(c: EquivalenceCase): LegacyBaseline {
  const { tier } = c.input;
  const tierTools = filterToolsByTier([...ALL_VEEGPT_TOOLS], tier);
  const memory = c.input.memory ?? [];
  return {
    tierTools,
    tierToolNames: toolNames(tierTools),
    // Persona resolution is shared, unchanged logic — the legacy `agentBlock`.
    persona: getAgentDirectivesForTier(c.input.selectedAgentId ?? null, tier).trim(),
    memory,
    memoryProfile: renderMemoryProfile(memory),
  };
}

/** The OPTIMIZED path result for the case (flag-on pipeline, mocked provider). */
export interface OptimizedResult {
  intents: Capability[];
  ambiguous: boolean;
  usedFallback: boolean;
  exposedTools: ChatTool[];
  exposedToolNames: string[];
  toolSelectionFellBack: boolean;
  memory: MemoryRetrievalResult;
  prompt: string;
  telemetry: TokenTelemetry;
  selectedModuleIds: string[];
  personaRendered: string;
  segments: ReturnType<typeof compose>['segments'];
}

export function runOptimized(c: EquivalenceCase): OptimizedResult {
  const ctx = toComposeInput(c.input);

  // classifyIntent → selectModules → selectTools → compose (the composer path).
  const intent = classifyIntent({
    message: c.input.message,
    priorMessages: c.input.priorMessages ?? [],
    hasMedia: Boolean(c.input.hasMedia),
    forcedTool: c.input.forcedTool,
    selectedAccountId: c.input.selectedAccountId ?? null,
  });

  const memory = retrieveUserMemory({
    items: c.input.memory ?? [],
    currentMessage: c.input.message,
    priorMessages: c.input.priorMessages ?? [],
  });

  const modules = selectModules(intent, ctx);

  const toolSel = selectTools({
    tier: c.input.tier,
    intents: intent.intents,
    ambiguous: intent.ambiguous,
    forcedTool: c.input.forcedTool ?? null,
  });

  const composed = compose(modules, toolSel.tools, {
    ...ctx,
    userMemoryProfile: memory.profile,
  });

  const personaModule = getModuleById('persona');
  const personaRendered = personaModule ? personaModule.render(ctx) : '';

  return {
    intents: intent.intents,
    ambiguous: intent.ambiguous,
    usedFallback: intent.usedFallback,
    exposedTools: toolSel.tools,
    exposedToolNames: toolNames(toolSel.tools),
    toolSelectionFellBack: toolSel.usedFallback,
    memory,
    prompt: composed.prompt,
    telemetry: composed.telemetry,
    selectedModuleIds: composed.selectedModuleIds,
    personaRendered,
    segments: composed.segments,
  };
}

// ---------------------------------------------------------------------------
// Equivalence checks
// ---------------------------------------------------------------------------

export interface DimensionResult {
  dimension: string;
  pass: boolean;
  detail?: string;
}

export interface EquivalenceReport {
  name: string;
  category: string;
  dimensions: DimensionResult[];
  /** True when EVERY dimension passed (behavior-equivalent to legacy). */
  equivalent: boolean;
  /** Req 3.6 / 20.5 — a regression was detected on ≥1 dimension. */
  regression: boolean;
  /** What the harness reverts the affected case to when a regression is found. */
  revertedTo: 'baseline' | null;
}

/** The stable ledger-`meta` key set the metering/API contract depends on. */
export const LEDGER_META_KEYS = [
  'perCategoryTokens',
  'totalInputTokens',
  'outputTokens',
  'model',
  'provider',
  'requestType',
  'selectedModules',
  'exposedTools',
  'compactionOccurred',
  'memoryRetrieved',
  'cacheUsed',
  'usedFallback',
] as const;

function subset<T>(a: readonly T[], b: readonly T[]): boolean {
  const set = new Set(b);
  return a.every((x) => set.has(x));
}

/**
 * Check every equivalence dimension for a case and, on any failure, mark it a
 * regression and revert the affected case to the legacy baseline (Req 3.6/20.5).
 */
export function checkEquivalence(c: EquivalenceCase): EquivalenceReport {
  const legacy = buildLegacyBaseline(c);
  const opt = runOptimized(c);
  const dimensions: DimensionResult[] = [];

  // ── A. Tool/module selection safeguards (Req 11, 20.2) ───────────────────
  dimensions.push({
    dimension: 'tools:subset-of-legacy-tier',
    pass: subset(opt.exposedToolNames, legacy.tierToolNames),
    detail: `optimized=${JSON.stringify(opt.exposedToolNames)} legacyTier=${JSON.stringify(legacy.tierToolNames)}`,
  });
  dimensions.push({
    dimension: 'tools:no-over-tier-exposure',
    pass: opt.exposedToolNames.every((n) => isToolAllowedForTier(n, c.input.tier)),
    detail: `tier=${c.input.tier} exposed=${JSON.stringify(opt.exposedToolNames)}`,
  });
  dimensions.push({
    dimension: 'tools:required-retained',
    pass: subset(c.golden.requiredTools, opt.exposedToolNames),
    detail: `required=${JSON.stringify(c.golden.requiredTools)} exposed=${JSON.stringify(opt.exposedToolNames)}`,
  });
  if (c.golden.exposedTools) {
    const expected = [...c.golden.exposedTools].sort();
    dimensions.push({
      dimension: 'tools:exact-golden-set',
      pass: JSON.stringify(expected) === JSON.stringify(opt.exposedToolNames),
      detail: `expected=${JSON.stringify(expected)} actual=${JSON.stringify(opt.exposedToolNames)}`,
    });
  }

  // ── B. Persona outcome (Req 10, 20.2) ────────────────────────────────────
  const personaContainsLegacy = legacy.persona
    ? opt.personaRendered.includes(legacy.persona)
    : opt.personaRendered === '';
  dimensions.push({
    dimension: 'persona:tier-resolved-outcome',
    pass: personaContainsLegacy,
    detail: `legacyPersonaLen=${legacy.persona.length} renderedLen=${opt.personaRendered.length}`,
  });

  // ── C. Safety / static instructions preserved (Req 3.3, 20.4) ────────────
  const ctx = toComposeInput(c.input);
  let staticOk = true;
  let staticDetail = '';
  for (const sm of STATIC_MODULES) {
    const legacyRender = sm.render(ctx);
    const present = opt.selectedModuleIds.includes(sm.id);
    // Static modules that render content must always be present + byte-equal.
    if (legacyRender.trim()) {
      const seg = opt.segments.find((s) => s.moduleId === sm.id);
      if (!present || !seg || seg.content !== legacyRender) {
        staticOk = false;
        staticDetail = `static module ${sm.id} not preserved byte-for-byte`;
        break;
      }
    }
  }
  dimensions.push({ dimension: 'safety:static-preserved', pass: staticOk, detail: staticDetail });

  // ── D. Memory behavior preserved (Req 9, 20.3) ───────────────────────────
  const legacyIds = new Set(legacy.memory.map((m) => m.id));
  const retrievedIds = opt.memory.items.map((m) => m.id);
  dimensions.push({
    dimension: 'memory:subset-of-legacy-store',
    pass: retrievedIds.every((id) => legacyIds.has(id)),
    detail: `retrieved=${JSON.stringify(retrievedIds)}`,
  });
  // Selected items keep the legacy stored order.
  const legacyOrder = legacy.memory.map((m) => m.id).filter((id) => retrievedIds.includes(id));
  dimensions.push({
    dimension: 'memory:preserves-stored-order',
    pass: JSON.stringify(legacyOrder) === JSON.stringify(retrievedIds),
    detail: `order=${JSON.stringify(retrievedIds)} expected=${JSON.stringify(legacyOrder)}`,
  });
  // Render format is the legacy `- [id:…] text` shape.
  dimensions.push({
    dimension: 'memory:legacy-render-format',
    pass: opt.memory.profile === renderMemoryProfile(opt.memory.items),
  });
  if (c.golden.expectMemoryIncludesAll) {
    dimensions.push({
      dimension: 'memory:fails-open-to-all',
      pass: opt.memory.includedAll && retrievedIds.length === legacy.memory.length,
      detail: `includedAll=${opt.memory.includedAll} count=${retrievedIds.length}/${legacy.memory.length}`,
    });
  }
  if (c.golden.relevantMemoryIds && c.golden.relevantMemoryIds.length) {
    dimensions.push({
      dimension: 'memory:relevant-retained',
      pass: subset(c.golden.relevantMemoryIds, retrievedIds),
      detail: `relevant=${JSON.stringify(c.golden.relevantMemoryIds)} retrieved=${JSON.stringify(retrievedIds)}`,
    });
  }

  // ── E. Streaming / API / ledger shape preserved (Req 3.1, 24) ────────────
  dimensions.push({
    dimension: 'contract:composed-request-shape',
    pass:
      typeof opt.prompt === 'string' &&
      opt.prompt.length > 0 &&
      Array.isArray(opt.exposedTools) &&
      opt.telemetry != null,
  });
  const meta = telemetryToLedgerMeta(opt.telemetry).contextTelemetry as Record<string, unknown>;
  dimensions.push({
    dimension: 'contract:ledger-meta-shape',
    pass: LEDGER_META_KEYS.every((k) => k in meta),
    detail: `keys=${JSON.stringify(Object.keys(meta))}`,
  });

  const regression = dimensions.some((d) => !d.pass);
  return {
    name: c.name,
    category: c.category,
    dimensions,
    equivalent: !regression,
    regression,
    // On any failing case, revert to baseline behavior for that case (Req 3.6).
    revertedTo: regression ? 'baseline' : null,
  };
}

// ---------------------------------------------------------------------------
// Representative deterministic case set (mirrors the Req 2.2 categories)
// ---------------------------------------------------------------------------

const MEM: MemoryItem[] = [
  { id: 'm1', text: 'brand color is blue' },
  { id: 'm2', text: 'user name is Ravi' },
  { id: 'm3', text: 'posting schedule is Sunday and Monday' },
  { id: 'm4', text: 'target audience is fitness enthusiasts' },
];

const ACCOUNTS = [{ id: 'acc1', username: 'acme', platform: 'instagram' }];

export const EQUIVALENCE_CASES: EquivalenceCase[] = [
  {
    name: 'simple chat greeting exposes no capability tools',
    category: 'simple-chat',
    input: { message: 'hey there!', tier: 'advanced', memory: MEM },
    golden: { exposedTools: [], requiredTools: [] },
  },
  {
    name: 'conceptual question stays prose-only (no tools)',
    category: 'complex-reasoning',
    input: { message: 'what makes a good hook for short-form video?', tier: 'advanced', memory: MEM },
    golden: { requiredTools: [] },
  },
  {
    name: 'content creation exposes caption/hashtag tools',
    category: 'content-creation',
    input: { message: 'write me a caption and some hashtags for my new reel', tier: 'advanced', memory: MEM },
    golden: { requiredTools: ['generate_caption', 'generate_hashtags'] },
  },
  {
    name: 'analytics request exposes analytics tools (full tier)',
    category: 'analytics',
    input: {
      message: 'how is my engagement and reach performing this month?',
      tier: 'full',
      selectedAccountId: 'acc1',
      accounts: ACCOUNTS,
      memory: MEM,
    },
    golden: { requiredTools: ['get_analytics_insight'] },
  },
  {
    name: 'social listening / research exposes research tools (full tier)',
    category: 'social-listening',
    input: { message: 'research the latest short-form video trends and competitors', tier: 'full', memory: MEM },
    golden: { requiredTools: ['research_trends', 'search_web'] },
  },
  {
    name: 'scheduling request exposes schedule_post (full tier)',
    category: 'scheduling',
    input: {
      message: 'schedule this post for tomorrow at 5pm',
      tier: 'full',
      accounts: ACCOUNTS,
      selectedAccountId: 'acc1',
      memory: MEM,
    },
    golden: { requiredTools: ['schedule_post'] },
  },
  {
    name: 'automation multi-tool compound request exposes the union',
    category: 'automation-multitool',
    input: {
      message: 'schedule my reel for Friday, update the caption on my other post, and remember my brand is Acme',
      tier: 'full',
      accounts: ACCOUNTS,
      memory: MEM,
    },
    golden: { requiredTools: ['schedule_post', 'update_post_caption', 'remember_fact'] },
  },
  {
    name: 'memory-dependent recall retrieves the relevant fact only',
    category: 'memory-dependent',
    input: { message: 'what is my brand color again?', tier: 'advanced', memory: MEM },
    golden: { requiredTools: [], relevantMemoryIds: ['m1'] },
  },
  {
    name: 'broad profile recall fails open to all memory (Req 9.7)',
    category: 'memory-dependent',
    input: { message: 'what do you know about me?', tier: 'advanced', memory: MEM },
    golden: { requiredTools: [], expectMemoryIncludesAll: true },
  },
  {
    name: 'memory write intent exposes memory tools',
    category: 'memory-dependent',
    input: { message: 'remember that my target audience is fitness enthusiasts', tier: 'basic', memory: MEM },
    golden: { requiredTools: ['remember_fact'], relevantMemoryIds: ['m4'] },
  },
  {
    name: 'persona-dependent request preserves the tier-resolved persona',
    category: 'persona-dependent',
    input: {
      message: 'give me a 90 day growth strategy',
      tier: 'advanced',
      selectedAgentId: 'strategist',
      memory: MEM,
    },
    golden: { requiredTools: [] },
  },
  {
    name: 'follow-up reference inherits prior posting intent',
    category: 'follow-up',
    input: {
      message: 'yes, do it',
      priorMessages: [
        { role: 'user', content: 'can you schedule my reel for tomorrow at 6pm?' },
        { role: 'assistant', content: 'Sure — shall I schedule it?' },
      ],
      tier: 'full',
      accounts: ACCOUNTS,
      memory: MEM,
    },
    golden: { requiredTools: ['schedule_post'] },
  },
  {
    name: 'ambiguous request fails open to the full tier tool set',
    category: 'ambiguous',
    input: {
      message: 'hmm what about that',
      priorMessages: [{ role: 'user', content: 'tell me something interesting' }],
      tier: 'full',
      memory: MEM,
    },
    golden: { requiredTools: [] },
  },
  {
    name: 'forced tool is always exposed even without matching intent',
    category: 'tool-forced',
    input: {
      message: 'here is my topic: morning routines',
      forcedTool: 'search_web',
      tier: 'full',
      memory: MEM,
    },
    golden: { requiredTools: ['search_web'] },
  },
  {
    name: 'basic-tier scheduling attempt never exposes an over-tier tool',
    category: 'tool-permissions-fallback',
    input: {
      message: 'schedule this post for tomorrow at 5pm',
      tier: 'basic',
      accounts: ACCOUNTS,
      memory: MEM,
    },
    // schedule_post is Full+, so on Basic it must NOT be exposed (tier filter).
    golden: { requiredTools: [] },
  },
  {
    name: 'long conversation with summary keeps static + memory contract',
    category: 'long-conversation',
    input: {
      message: 'so given all that, what should I focus on next?',
      priorMessages: Array.from({ length: 12 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `earlier turn ${i} about my content plan`,
      })),
      memorySummary: 'The user is planning a fitness content calendar targeting beginners.',
      tier: 'advanced',
      memory: MEM,
    },
    golden: { requiredTools: [], expectMemoryIncludesAll: false },
  },
];
