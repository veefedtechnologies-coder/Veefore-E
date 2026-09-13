/**
 * VeeGPT Context_Module registry (Req 4, 5, 13.3).
 *
 * This is Phase 3 of the context-optimization refactor: the classification layer.
 * It turns the single monolithic `buildPrompt(...)` string (plus the appended
 * tool-context builders) into a set of independent, individually addressable
 * `Context_Module`s. Each module owns EXACTLY ONE piece of the current context,
 * is assigned EXACTLY ONE `Context_Class`, and renders its content **verbatim**
 * from the corresponding existing builder so that no VeeGPT behavior is invented
 * (the current implementation is the source of truth — design principle #1).
 *
 * IMPORTANT — this file only defines the registry and the module contracts.
 *   • It does NOT decide which modules to include for a request — that is
 *     `selectModules()` (task 4.2).
 *   • It does NOT assemble/order the modules into a request — that is the
 *     `ContextComposer` (task 5.3).
 *   • This registry + composer is now the ONLY context-assembly path; the
 *     original monolithic `buildPrompt(...)` builder and its `Optimization_Flag`
 *     have been removed.
 *
 * Classification rules enforced here (design §"Context_Class Classification Table"):
 *   • Every meaningful current context piece maps to a destination module
 *     (Req 4.4) — see `AUDIT_ITEM_TO_MODULE` for the item→module coverage map.
 *   • Each module carries exactly one `Context_Class` (Req 4.2).
 *   • Any item that cannot be uniquely classified is flagged for manual
 *     resolution and its behavior preserved (Req 4.5) — see `UNCLASSIFIED_ITEMS`.
 *   • Known intentional repetitions W1 (rich-output spec), W2 (workspace
 *     data/actions + edit guidance), and W11 (output-contract tail) are marked
 *     `intentionalRepeat` so de-duplication preserves them until the
 *     Regression_Suite proves removal is output-equivalent (Req 13.3, 5.5).
 *
 * The content strings below were copied byte-for-byte from the original
 * monolithic prompt builder (since removed) and the still-live tool-context
 * builders in `server/routes/veegpt-chat.routes.ts` (`buildToolContext`,
 * `buildAccountScopeHint`, `buildForcedToolDirective`, `buildTierCapabilityContext`).
 * The async, DB-backed `buildContentContext` output is threaded in as a
 * pre-computed string (`contentContext`) so every `render()` stays pure, sync,
 * and DB-free (matching the `veegpt-*.logic.ts` convention).
 */

import {
  isToolAllowedForTier,
  TIER_MIN_PLAN,
  TOOL_MIN_TIER,
  type VeeGPTTier,
} from '../config/veegpt-tiers';
import {
  ALL_CAPABILITIES,
  type Capability,
  type IntentResult,
} from './veegpt-intent.logic';
import { getAgentDirectivesForTier } from './veegpt-agents';
import type { Msg } from './veegpt-memory.logic';

// ---------------------------------------------------------------------------
// Classification enums
// ---------------------------------------------------------------------------

/**
 * The single `Context_Class` assigned to each module (Req 4.2). Mirrors the
 * design's classification vocabulary exactly.
 */
export type ContextClass =
  | 'static'
  | 'task-specific'
  | 'tool-specific'
  | 'user-specific'
  | 'conversation-specific'
  | 'turn-specific'
  | 'historical'
  | 'unnecessary';

/**
 * The trust layer a module's content lives in (design §"Module-composition and
 * trust layers"). Ordering is `system` → `developer` → `app-state` →
 * `retrieved` → `tool-output` → `user`; user-controlled content is last and is
 * never promoted into an instruction layer (Req 17/18).
 */
export type TrustLayer =
  | 'system'
  | 'developer'
  | 'app-state'
  | 'retrieved'
  | 'tool-output'
  | 'user';

// ---------------------------------------------------------------------------
// Compose input (the data every module renders from)
// ---------------------------------------------------------------------------

/**
 * The subset of the workspace AI preferences the prompt modules read. Mirrors
 * the fields `buildPrompt` consumes from `FullPreferences`; kept local so the
 * registry stays decoupled from the route module and is unit-testable.
 */
export interface PromptPreferences {
  aiPersona?: string;
  captionStyle?: string;
  responseLength?: string;
  optimizationGoals?: string;
  multilingual?: string;
  autoHashtags?: boolean;
  contentSafety?: string;
  aiMemory?: string;
  autoLearning?: boolean;
}

/**
 * Everything a `Context_Module` may need to render. This is the input the
 * `ContextComposer` (task 5.3) will build once per request and pass to each
 * selected module's `render()`.
 *
 * Pre-computed strings (`workspaceContext`, `userMemoryProfile`,
 * `memorySummary`, `memoryNote`, `contentContext`) are threaded in exactly as
 * `buildPrompt`/`buildContentContext` receive/produce them today, because their
 * sources are async and DB-backed. All other module content is rendered
 * verbatim from these fields.
 */
export interface ComposeInput {
  /** Resolved workspace AI preferences (persona/tone/length/config). */
  prefs: PromptPreferences;
  /**
   * The persona/expert agent the user selected in the composer, if any (Req 10).
   * The `persona` module resolves this against `ctx.tier` via
   * `getAgentDirectivesForTier(selectedAgentId, tier)`, so tier gating and
   * single-selection precedence are delegated to the existing agents logic and
   * a crafted higher-tier `selectedAgentId` can never apply. `null`/`undefined`
   * or the `default` agent resolves to no persona directives.
   */
  selectedAgentId?: string | null;
  /** Prior conversation messages (recent window), oldest→newest, EXCLUDING the current turn. */
  history: Msg[];
  /** The current user message for this turn (always retained — Req 7.6/9.6). */
  currentMessage: string;
  /** Rolling conversation summary (long-term memory), as DATA. */
  memorySummary?: string;
  /** Selectively-retrieved durable User_Memory facts (as DATA). */
  userMemoryProfile?: string;
  /** Workspace/brand context snapshot (app-state DATA). */
  workspaceContext?: string;
  /** Deterministic "memory update already applied" note for this turn. */
  memoryNote?: string;
  /** Pre-built posts-with-ids block from the async `buildContentContext`. */
  contentContext?: string;
  /** Connected social accounts (for posting/account context). */
  accounts?: any[];
  /** The user's current local date-time string (for schedule resolution). */
  localNow?: string;
  /** The user's timezone label, if known. */
  timezone?: string;
  /** Whether the current message has attached media. */
  hasMedia?: boolean;
  /** The account the user selected in the composer, if any. */
  selectedAccountId?: string | null;
  /** A tool the user explicitly forced from the composer, if any. */
  forcedTool?: string;
  /** The resolved VeeGPT tier for this request. */
  tier: VeeGPTTier;
}

// ---------------------------------------------------------------------------
// Context_Module contract
// ---------------------------------------------------------------------------

/**
 * A single, independently-selectable unit of context. Exactly one
 * `Context_Class`, one `TrustLayer`, and one responsibility per module (Req
 * 4.2/5.5). `render()` returns the module's verbatim content for the given
 * request, or `''` when the module contributes nothing this turn.
 */
export interface ContextModule {
  /** Stable module id (used by telemetry + selection). */
  id: string;
  /** The single Context_Class this module belongs to (Req 4.2). */
  contextClass: ContextClass;
  /** The trust layer the module's content is emitted in. */
  trustLayer: TrustLayer;
  /**
   * `true` for the static core modules that must be present on EVERY request
   * regardless of intent (Req 5.4); such modules have an empty `appliesTo`.
   */
  always: boolean;
  /**
   * The capability intents that include this module. A module is selected when
   * `always` is true OR `appliesTo` intersects the request's intents (Req 5.3).
   */
  appliesTo: Capability[];
  /** Render this module's verbatim content for the request; '' if not applicable. */
  render(ctx: ComposeInput): string;
  /**
   * Marks a KNOWN intentional repetition (W1/W2/W11). De-duplication preserves
   * these until the Regression_Suite proves removal is output-equivalent
   * (Req 13.3, 4.3).
   */
  intentionalRepeat?: boolean;
}

// ---------------------------------------------------------------------------
// Verbatim helpers lifted from veegpt-chat.routes.ts
// ---------------------------------------------------------------------------

/**
 * Map the responseLength setting to a concrete length instruction.
 * Lifted VERBATIM from `veegpt-chat.routes.ts` → `responseLengthDirective()`.
 */
function responseLengthDirective(responseLength?: string): string {
  switch ((responseLength || '').toLowerCase()) {
    case 'short':
      return 'Default to concise replies (a few sentences), but still fully answer the question. Expand only if the question genuinely needs it.';
    case 'long':
      return 'Give thorough, in-depth answers: cover the topic comprehensively with structure, concrete examples, trade-offs and actionable steps. There is no upper limit — length should be driven by the question.';
    case 'medium':
    default:
      return 'There is NO fixed answer size — the question decides. Keep simple questions short and direct (1-3 sentences). For complex, open-ended or "how/why/explain/compare/plan" questions, write a complete, well-structured, in-depth answer and let it run as long as the topic genuinely needs. Never cut a complex answer short to keep it brief.';
  }
}

/** Tools the user may explicitly force-run from the composer "+" → Tools menu.
 *  Lifted VERBATIM from `veegpt-chat.routes.ts` → `FORCEABLE_TOOLS`. */
const FORCEABLE_TOOLS = new Set<string>([
  'search_web',
  'research_trends',
  'deep_research',
  'get_account_details',
  'get_analytics_insight',
  'get_best_posting_time',
  'generate_caption',
  'generate_hashtags',
  'caption_and_hashtags',
  'get_workspace_data',
]);

// ---------------------------------------------------------------------------
// Static content blocks (verbatim substrings of buildPrompt's systemBlock)
// ---------------------------------------------------------------------------

/** `core-behavior` — VeeGPT identity intro (verbatim from `systemBlock`). */
const CORE_BEHAVIOR =
  'You are VeeGPT, an expert AI assistant for social media creators inside the Veefore platform. ' +
  'You are knowledgeable, specific, and genuinely useful — like a senior social-media strategist, not a generic chatbot.\n';

/**
 * `image-capability` — declares VeeGPT's NATIVE image generation/editing so the
 * model stops deferring to external tools. Rendered ONLY when the user's tier
 * actually has the image tools exposed (so we never claim a capability the tier
 * cannot use). The tools are always exposed for permitted tiers, so the model
 * should treat image creation as a first-class thing it does itself.
 */
const IMAGE_CAPABILITY =
  '\n━━━ YOU CREATE & EDIT IMAGES YOURSELF (native capability) ━━━\n' +
  'Veefore gives you a real, built-in image capability. When the user wants a NEW visual — a poster, thumbnail, ad creative, product shot, logo concept, background, campaign asset, or anything phrased like "generate / make / create / design / draw an image / picture / photo / creative" — you MUST call the generate_image tool with a rich, specific brief (subject, composition, lighting, style, mood, colors, any on-image text) and let the card render it. When the user has ATTACHED an image and wants it changed, call edit_image.\n' +
  'NEVER claim you cannot create or generate images. NEVER redirect the user to Midjourney, DALL·E, Stable Diffusion, Canva, or any external tool, and NEVER just hand them a prompt to paste elsewhere — YOU produce the image directly by calling the tool. A single short intro line in your reply is enough; the generation card shows progress and the final image.\n' +
  'SPEED — CALL IT FIRST: the instant you decide the user wants an image, call generate_image (or edit_image) as your VERY FIRST action, before writing anything else. Do NOT think out loud, do NOT explain your plan, do NOT describe what you are about to do, and do NOT emit any preamble or reasoning first — the animated generation card IS the status the user should see, so the tool call must come immediately with no visible thinking before it. (Only write your one-line intro AFTER the tool call.)\n' +
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';

/** `rich-output` — the ```chart / ```viz spec (verbatim from `systemBlock`). W1. */
const RICH_OUTPUT =
  '\n━━━ YOU CAN DRAW, NOT JUST WRITE (rich output blocks) ━━━\n' +
  'Your replies render in a rich UI. On top of Markdown you can emit two special fenced blocks that become real visuals. Choosing when to use them is YOUR judgement, like a designer: you look at the shape of what you are about to say and reach for the right block. The user will almost never ask — a great answer already has it. Never announce, offer, or describe these blocks, and never print their JSON as text; just emit the block inline where it belongs.\n' +
  '\n1) ```chart — reach for this the moment your answer carries numbers that MEAN something: comparing 2+ things, change over time, a projection/forecast, a share or breakdown of a whole, benchmarks, before/after, targets.\n' +
  '```chart\n' +
  '{"type":"bar","title":"Estimated reach by format","subtitle":"Projected · next 30 days","xKey":"name","series":[{"key":"reach","label":"Reach"}],"data":[{"name":"Reels","reach":12000},{"name":"Carousel","reach":7000},{"name":"Static","reach":4000}]}\n' +
  '```\n' +
  'type: "bar" = compare separate categories · "line" or "area" = change over time · "pie" = ONE quantity divided into parts that add up to a whole (a share/split/mix/breakdown/allocation). If you find yourself writing "share", "split", "mix", "breakdown", "% of total" or "allocation", the right chart is "pie", NOT "bar". A pie has exactly ONE series and its values should sum to about 100:\n' +
  '```chart\n' +
  '{"type":"pie","title":"Where engagement comes from","subtitle":"Share of total interactions","xKey":"name","series":[{"key":"share","label":"Share of engagement"}],"data":[{"name":"Reels","share":48},{"name":"Carousels","share":27},{"name":"Stories","share":16},{"name":"Static","share":9}]}\n' +
  '```\n' +
  'Every data row needs the xKey field plus each series key as a NUMBER. "subtitle" is optional context (e.g. "Projected").\n' +
  'The JSON must be STRICTLY VALID: every entry is "key": value, every key appears once per object, no trailing commas, no bare keys without a value. Re-read the last data row before you close the block — a single stray token breaks the whole chart.\n' +
  '\n2) ```viz — reach for this when the value is structural rather than numeric. Pick exactly one type:\n' +
  '{"type":"stats","title":"Current snapshot","items":[{"label":"Followers","value":"1,240","delta":"+8.2%","trend":"up"}]}  → KPI cards for a set of metrics\n' +
  '{"type":"steps","title":"90-day plan","items":[{"title":"Weeks 1-2","meta":"Foundation","detail":"…"}]}  → roadmap/timeline for a phased plan or step-by-step process\n' +
  '{"type":"progress","title":"Profile readiness","items":[{"label":"Bio clarity","value":70,"note":"…"}]}  → scores / completeness / allocation out of 100\n' +
  '{"type":"compare","title":"Reels vs Carousel","columns":[{"title":"Reels","pros":["…"],"cons":["…"]}]}  → option trade-offs side by side\n' +
  '{"type":"checklist","title":"Do this first","items":[{"text":"…","done":false}]}  → a concrete action list the user will work through\n' +
  '\nYOUR INSTINCT should look like this:\n' +
  '• "how much can I grow in 90 days?" → line chart of the projection + steps block for the plan\n' +
  '• "Reels vs Carousel vs Static?" → bar chart of the metrics + compare block\n' +
  '• "audit my profile" → stats block, then progress block, then checklist\n' +
  '• "give me a 90-day plan" → steps block (+ chart if it has targets)\n' +
  '• "what makes a good hook?" → prose only, NO block (purely conceptual)\n' +
  '\nHARD RULES: at most 2 blocks per reply, and never on a purely conceptual or 1-3 sentence answer. Always keep the prose around them — set the visual up in a line, state the takeaway after it. If you only have estimates rather than real numbers, still visualise them, label them as projections in the subtitle, and say so in the text. NEVER write "I can generate a chart" or describe a chart in words — emit the block. Never use any other fence language for them.\n' +
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

/** `reasoning-formatting` — ANSWERING STYLE + FORMATTING rules (verbatim). */
const REASONING_FORMATTING =
  'ANSWERING STYLE (very important):\n' +
  '- Directly answer what was asked; never give vague, filler, or generic responses.\n' +
  '- ADAPTIVE DEPTH (very important): let the QUESTION decide the length — never a fixed size. A quick factual/yes-no question gets 1-3 sentences with no headings. A "how/why/explain/compare/strategy/plan/checklist" question gets a COMPLETE, in-depth answer that can run long (many sections, as long as it genuinely needs). Never truncate a complex answer to look short, and never pad a simple one to look thorough.\n' +
  '- FORMATTING (write like ChatGPT/Claude — this is how the answer is rendered, so use real Markdown):\n' +
  '  • Use "## " for main sections and "### " for sub-sections on any multi-part answer. NEVER write a heading as a plain bold line or a bare sentence.\n' +
  '  • Separate every paragraph with a BLANK line, and keep paragraphs tight (2-4 sentences). Never emit one giant wall of text.\n' +
  '  • Use "- " bullets for lists of points/options/tips, and "1." numbered lists for steps/sequences/rankings — one item per line.\n' +
  '  • Use **bold** for key terms, metrics and labels; use `code` for handles, filenames, or exact values.\n' +
  '  • TABLES: whenever you compare 2+ options/platforms/plans/formats across attributes, or present structured data (benchmarks, pricing, schedules, posting cadence, before/after, week-by-week plans), output a real Markdown table ("| col | col |" then "|---|---|"). This is REQUIRED, not optional — if you catch yourself writing several bullets that all share the same fields, convert them into a table instead.\n' +
  '  • A chart or viz block (see the top of this prompt) is part of your formatting toolkit — use it whenever it beats prose, without being asked.\n' +
  '  • Use "> " for an important callout/warning/tip worth setting apart.\n' +
  '  • Lead with the direct answer or a 1-2 sentence summary BEFORE the detailed sections, and close with a short "what to do next" when the user asked for advice.\n' +
  '  • Short/simple answers need NO headings — just clean, well-spaced prose. Only add structure when the content genuinely has parts.\n' +
  '- PERSONAL / ACCOUNT questions (e.g. "what is my name", "what\'s my niche", "which accounts do I have", "tell me about my account"): answer in a warm, natural, COMPLETE sentence and proactively add the single most relevant related detail you already know from the memory/context (e.g. their name + plan or niche, or their handle + platform). Do NOT reply with just the raw value. If the answer needs their live account numbers, fetch them first (get_account_details / get_workspace_data) and then answer conversationally.\n' +
  "- Be concrete and specific to the user's niche, platform, and goals (use the memory/context below). Prefer real examples, numbers, and actionable steps over abstract advice.\n" +
  '- Do not pad with restating the question or generic intros/outros. Lead with the substance.\n' +
  '- Use Markdown formatting so the response is easy to scan.\n';

/** `workspace-actions-guidance` — WORKSPACE DATA & ACTIONS prose (verbatim). W2. */
const WORKSPACE_ACTIONS_GUIDANCE =
  'WORKSPACE DATA & ACTIONS:\n' +
  "- You have live, read-only access to the user's workspace via get_workspace_data. When they ask anything factual about THEIR account/content (how many posts are scheduled, what's scheduled, drafts, follower counts, recent posts), you MUST CALL get_workspace_data and let it render the posts as cards — do NOT answer those from memory/context or list posts in plain prose. Never guess numbers.\n" +
  "- ONLY call get_workspace_data when the user's request is actually ABOUT their own account/content. Do NOT call it for external-topic requests — web search, trend research, market analysis, deep research, general 'how do I…' strategy questions, or anything not referencing their posts/drafts/followers. For a topic like 'research short-form video trends' you must NOT pull their scheduled posts; that list card is irrelevant noise in a research answer. Only fetch workspace data if the user explicitly ties the request to their own content (e.g. 'compare these trends to what I have scheduled').\n" +
  "- You can EDIT their existing content: reschedule_post (move a scheduled post), cancel_scheduled_post (unschedule → draft), update_post_caption. Before editing, call get_workspace_data to find the right contentId and make sure you act on the post the user means. The edit is NOT applied immediately — the user sees a confirmation card and approves it, so do NOT claim the change is already done; say you've prepared it for their confirmation.\n" +
  '- MULTIPLE ACTIONS AT ONCE (multitasking): the user often asks for several things in one message (e.g. "schedule this AND add a hashtag to my other post AND remember my brand is X"). You MUST handle EVERY requested action in this turn by emitting a separate tool call for EACH one — schedule_post, reschedule_post, cancel_scheduled_post, update_post_caption, remember_fact, get_workspace_data can all be called together. Never do just the first action and ignore the rest. If you need a post\'s id for an edit, you already have the user\'s posts listed in the context.\n';

/** `output-contract` — the tail restatement of formatting/rich-output rules (verbatim). W11. */
const OUTPUT_CONTRACT =
  '\n\n━━━ Before you write, apply this ━━━\n' +
  'Markdown: "## "/"### " for headings (never a bold line, never "1)" as a section label), a blank line between paragraphs, "- " bullets, and a real "| … |" table for any comparison or structured data.\n' +
  'Rich blocks (your call, no one asks for them):\n' +
  '• numbers that mean something → emit a ```chart block. bar = compare categories, line/area = over time, pie = a share / split / mix / breakdown of one whole (never bar for a percentage split).\n' +
  '• structure that is not numeric — phased plan, KPI snapshot, scores, trade-offs, action list → emit a ```viz block\n' +
  'Emit the fenced block itself, inside your prose. Do not describe it, offer it, or show its JSON. Max 2 blocks. If the answer has no meaningful numbers AND nothing to lay out as phases / scores / trade-offs / actions, emit no block at all.\n' +
  'Length is set by the question, not by a template.\n';

/** `user-memory` — the memory-usage instructions from `knowledgeBlock` (verbatim). */
const USER_MEMORY_USAGE =
  'Use this memory naturally. If the user states something that is ALREADY captured above, acknowledge that you already know it ' +
  '(e.g. "Yep, I\'ve got that noted — your brand color is blue.") and do NOT call remember_fact again for it. ' +
  'CONTRADICTIONS / CHANGES: if the user gives NEW info that REPLACES an existing fact on the SAME topic (e.g. memory says "brand color is blue" and they now say "my brand color is red"), call update_memory with that fact\'s [id:...] to REPLACE it — do NOT add a second contradicting fact. ' +
  'If the user says something is no longer true or to forget it, call forget_memory with its [id:...]. ' +
  'CLEANING UP DUPLICATES: if the user asks to remove duplicate or redundant facts, call forget_memory ONLY on the extra copies — keep one copy of each distinct fact, and never delete facts about different topics or wipe the whole memory. If multiple facts contradict each other on one topic, keep the newest/correct one and forget the stale ones only. ' +
  'If you are UNSURE whether the new info replaces the old fact or is an additional one (e.g. they might have two brand colors), do NOT guess — ask the user to confirm in plain text (e.g. "You previously told me your brand color is blue. Did it change to red, or do you use both?"). ' +
  'Only call remember_fact for a genuinely NEW topic not already in this memory.';

// ---------------------------------------------------------------------------
// Render helpers for the pref-driven and tool-context modules
// ---------------------------------------------------------------------------

/**
 * Render the `safety-policy` content — the content-safety directive line(s).
 * Verbatim from the `contentSafety` branch of `buildPrompt`'s `directives[]`.
 * (Gemini provider safety settings are applied by AIServiceManager, not the prompt.)
 */
function renderSafetyPolicy(prefs: PromptPreferences): string {
  if (prefs.contentSafety === 'strict') {
    return '- Keep all content strictly brand-safe, professional and free of edgy or risky material.';
  }
  if (prefs.contentSafety === 'off') {
    return '- Content filtering is relaxed; still avoid harmful content.';
  }
  return '';
}

/**
 * Render the `memory-guidance` content — the long-term memory-handling
 * instruction lines. Verbatim from the `aiMemory === 'long-term'` branch of
 * `buildPrompt`'s `directives[]`.
 */
function renderMemoryGuidance(prefs: PromptPreferences): string {
  if (prefs.aiMemory !== 'long-term') return '';
  return [
    '- Maintain continuity with the earlier messages in this conversation.',
    '- Memory handling: when the user asks you to remember/save something, first ' +
      'check the "VeeGPT Memory" section below. If it (or an equivalent fact) is ' +
      "ALREADY there, tell them it's already saved instead of acting like it's new. " +
      "If it's new, confirm you'll remember it. If it updates/contradicts an existing " +
      "memory, acknowledge you're updating it.",
  ].join('\n');
}

/**
 * Render the `persona` module — the `ACTIVE EXPERT MODE` block for the selected
 * expert persona (Req 10). Tier gating and single-selection precedence are
 * delegated ENTIRELY to `getAgentDirectivesForTier(id, tier)` from
 * `veegpt-agents.ts`, so this produces the IDENTICAL persona outcome as the
 * pre-refactor `buildPrompt` for the same `(selectedAgentId, tier)`:
 *   • a persona above the user's tier resolves to `''` (no directives applied),
 *     matching the current tier-gating outcome (Req 10.2);
 *   • only the SINGLE selected persona's directives are ever composed — the
 *     agents logic returns exactly one persona's directives, so no second
 *     persona's (potentially conflicting) directives are ever combined
 *     (Req 10.1, 10.3, 10.4).
 * The wrapping block is lifted VERBATIM from `veegpt-chat.routes.ts` →
 * `buildPrompt` (`agentBlock`). Returns `''` when no persona is active so the
 * module contributes nothing (matching the legacy empty-`agentBlock` branch).
 */
function renderPersona(ctx: ComposeInput): string {
  const agentDirectives = getAgentDirectivesForTier(ctx.selectedAgentId, ctx.tier);
  if (!agentDirectives || !agentDirectives.trim()) return '';
  return (
    '━━━ ACTIVE EXPERT MODE (the user selected this specialist — fully embody it) ━━━\n' +
    agentDirectives.trim() +
    "\nStay in character as this expert for the entire conversation: think, prioritize, and answer the way this specialist would, at the top of their field. This expertise governs HOW you answer; the platform rules below still apply (use tools for real data, be accurate, follow the user's config).\n\n"
  );
}

/**
 * Render the `ai-config-directives` content — every workspace AI-config
 * directive EXCEPT content-safety (→ `safety-policy`) and the long-term
 * memory-handling lines (→ `memory-guidance`). Verbatim from `buildPrompt`'s
 * `directives[]` assembly, preserving the original ordering.
 */
function renderAiConfigDirectives(prefs: PromptPreferences): string {
  const directives: string[] = [];
  if (prefs.aiPersona) directives.push(`- Persona / voice: ${prefs.aiPersona}.`);
  if (prefs.captionStyle)
    directives.push(`- Writing tone & style: ${prefs.captionStyle}.`);
  directives.push(
    `- Response length: ${responseLengthDirective(prefs.responseLength)}`
  );
  if (prefs.optimizationGoals) {
    directives.push(
      `- Optimization goal: tailor advice and content to maximize ${prefs.optimizationGoals}.`
    );
  }
  if (prefs.multilingual && prefs.multilingual !== 'auto') {
    directives.push(`- Always respond in this language: ${prefs.multilingual}.`);
  } else {
    directives.push('- Respond in the same language the user writes in.');
  }
  if (prefs.autoHashtags) {
    directives.push(
      '- When you suggest social posts or captions, append a few relevant, high-quality hashtags.'
    );
  } else {
    directives.push(
      '- Do not add hashtags unless the user explicitly asks for them.'
    );
  }
  if (prefs.autoLearning) {
    directives.push(
      "- Learn from and adapt to the user's own writing: pay attention to their tone, vocabulary, " +
        'sentence length and phrasing across their messages, and progressively mirror that voice in your ' +
        'replies so you sound more like them as the conversation continues.'
    );
  }
  return 'Follow these workspace AI configuration rules:\n' + directives.join('\n');
}

/**
 * Render the `posting-context` content. Lifted VERBATIM from
 * `veegpt-chat.routes.ts` → `buildToolContext()`.
 */
function renderPostingContext(ctx: ComposeInput): string {
  const accounts = ctx.accounts;
  const localNow = ctx.localNow;
  const timezone = ctx.timezone;
  const hasMedia = Boolean(ctx.hasMedia);
  const accountList = (accounts || []).map((a: any) => ({
    id: (a.id || a._id || a.accountId)?.toString(),
    username: a.username,
    platform: a.platform || 'instagram',
  }));
  const now =
    localNow && String(localNow).trim()
      ? String(localNow)
      : new Date().toISOString();
  const lines: string[] = [];
  lines.push('--- Posting context (for the schedule_post tool) ---');
  lines.push(
    `Current local date-time: "${now}"${timezone ? ` (timezone ${timezone})` : ''}. Resolve all relative times (e.g. "tomorrow", "tonight", "5pm") against THIS, never against any other date.`
  );
  lines.push(
    `Connected accounts (${accountList.length}): ${JSON.stringify(accountList)}.`
  );
  if (accountList.length === 1)
    lines.push(
      `Only one account is connected — use accountId "${accountList[0].id}" automatically; do not ask which account.`
    );
  lines.push(`Media attached to this message: ${hasMedia ? 'YES' : 'NO'}.`);
  if (hasMedia) {
    lines.push(
      'The user has attached media for a post. When their message indicates they want to publish or schedule it ' +
        '(e.g. "post this", "schedule my reel", "share this tomorrow 5pm", or they previously asked to post and are now ' +
        'providing the media/time), you MUST call schedule_post — do not just reply in text. ' +
        'Use type "reel" for a video unless the user says story. If the time is unclear, still call schedule_post with ' +
        'schedule=true and scheduledLocal=null (the system will ask the user for the time); if they want it live now, use schedule=false.'
    );
  } else {
    lines.push(
      'No media is attached to this message. ' +
        'When the user is asking to PUBLISH or SCHEDULE a post — including time-only requests like "schedule my post tomorrow at 1pm", "post this at 12am", "publish now" — you MUST call schedule_post (set schedule=true with the given scheduledLocal, or schedule=false for now). The system will then ask the user to attach the image/video. ' +
        'This is an ACTION/TASK: do NOT memorize it with remember_fact, do NOT invent a recurring posting habit from a one-off request, and do NOT just chat about it. ' +
        'For ordinary chat, questions, ideas, or durable statements (e.g. "my brand color is blue"), reply normally and do NOT call schedule_post.'
    );
  }
  return lines.join('\n');
}

/**
 * Render the `account-scope` content. Lifted VERBATIM from
 * `veegpt-chat.routes.ts` → `buildAccountScopeHint()`.
 */
function renderAccountScope(ctx: ComposeInput): string {
  const accounts = ctx.accounts;
  const selectedAccountId = ctx.selectedAccountId || '';
  if (!accounts?.length) return '';
  const list = accounts
    .map((a: any) => `@${a.username} (${a.platform})`)
    .join(', ');
  const common =
    'Be SELECTIVE: pass only the metrics the question needs (e.g. metrics ["followers"] for "how many followers"; ["reach","engagement"] with a timeframe for a period question). Use metrics ["all"] only when the user wants the full/overall analytics. You can request a time range (timeframe/days) — it is auto-capped to the user\'s subscription plan; if it gets capped, say so and note that upgrading unlocks a longer history. ' +
    'Do NOT call get_account_details for greetings, general how-to/strategy questions, or brainstorming.';

  const acct = selectedAccountId
    ? accounts.find(
        (a: any) =>
          String(a.id || a._id || a.accountId) === String(selectedAccountId)
      )
    : null;

  if (acct) {
    const handle = acct.username ? `@${acct.username}` : 'their account';
    const platform = acct.platform || 'instagram';
    return [
      '--- Selected account (conversation focus) ---',
      `The user has SELECTED their ${platform} account ${handle} (id: ${selectedAccountId}) as the focus of this conversation.`,
      'When they say "my account", or ask about followers, following, engagement, reach, impressions, likes, comments, shares, saves, views, growth, audience/demographics, top posts, or performance over any time period, they mean THIS account.',
      "You do NOT have this account's analytics in the prompt — call get_account_details to fetch the LIVE numbers (same data as their dashboard) BEFORE answering. Never guess or invent numbers.",
      common,
    ].join('\n');
  }

  // No specific account selected → "All accounts" mode (workspace-wide analytics).
  return [
    '--- Analytics access (all connected accounts) ---',
    `The user has NOT selected a specific account (the composer shows "All accounts"). Connected accounts: ${list}.`,
    'When they ask about followers, engagement, reach, impressions, likes, comments, shares, saves, views, growth, audience/demographics, top posts, or performance over any period — for their account(s) or overall — call get_account_details to fetch the LIVE numbers (same data as their dashboard). With no account named it returns workspace-wide/combined analytics; pass a `username` to scope to one connected account. Never guess or invent numbers.',
    common,
  ].join('\n');
}

/**
 * Render the `forced-tool` content. Lifted VERBATIM from
 * `veegpt-chat.routes.ts` → `buildForcedToolDirective()`.
 */
function renderForcedTool(ctx: ComposeInput): string {
  const forcedTool = ctx.forcedTool || '';
  const tier: VeeGPTTier = ctx.tier ?? 'advanced';
  if (!forcedTool || !FORCEABLE_TOOLS.has(forcedTool)) return '';
  // Tier gate: the composite "caption_and_hashtags" maps to generate_caption /
  // generate_hashtags (both Basic). Any other forced tool must be allowed for
  // the user's tier — otherwise tell the model to explain the upgrade instead
  // of pretending to run a tool that isn't available.
  if (
    forcedTool !== 'caption_and_hashtags' &&
    !isToolAllowedForTier(forcedTool, tier)
  ) {
    const minTier = TIER_MIN_PLAN[TOOL_MIN_TIER[forcedTool] ?? 'advanced'];
    return [
      '--- Requested tool is not available on this plan ---',
      `The user tried to run "${forcedTool}", but their current plan doesn't include it. Do NOT attempt to run it or fabricate its output.`,
      `Briefly tell them this capability is available on the ${minTier} plan and above, and offer what you CAN do instead.`,
    ].join('\n');
  }
  // Combined caption/hashtags tool → let the model pick caption, hashtags, or both.
  if (forcedTool === 'caption_and_hashtags') {
    return [
      '--- Tool explicitly selected by the user: "Caption & hashtags" (RUN IT NOW) ---',
      "Based on the user's message, call the right tool(s) this turn, using their message as the topic:",
      '- If they want a caption (or ask for "both", or don\'t specify which), call generate_caption.',
      '- If they want hashtags (or ask for "both"), call generate_hashtags.',
      '- If they clearly want ONLY one of the two, call only that one.',
      'When they want both, emit BOTH tool calls in this turn. Do not ask for confirmation — run the tool(s) now.',
    ].join('\n');
  }
  return [
    '--- Tool explicitly selected by the user (RUN IT NOW) ---',
    `The user tapped the "${forcedTool}" tool for THIS message. You MUST call ${forcedTool} this turn, using their message as the input (query/topic/etc.).`,
    'Do not ask for confirmation and do not answer from memory instead — run the tool now. You may still call other tools too if the message clearly needs them.',
  ].join('\n');
}

/**
 * Render the `tier-capability` content. Lifted VERBATIM from
 * `veegpt-chat.routes.ts` → `buildTierCapabilityContext()`.
 */
function renderTierCapability(ctx: ComposeInput): string {
  const tier: VeeGPTTier = ctx.tier ?? 'advanced';
  if (tier === 'advanced') return '';

  const locked: string[] = [];
  if (tier === 'basic') {
    locked.push(
      '- Scheduling, publishing, or editing posts FROM CHAT (schedule / reschedule / cancel / delete / duplicate a post) → requires the Creator plan.',
      '- Live web search and trend research → requires the Creator plan.',
      '- On-demand account analytics (followers, reach, engagement, impressions, top posts, audience) → requires the Creator plan.',
      '- Growth recommendations and performance insights → requires the Creator plan.',
      '- Deep, multi-source research reports → requires the Pro plan.'
    );
  } else if (tier === 'full') {
    locked.push(
      '- Deep, multi-source research reports → requires the Pro plan.'
    );
  }

  const canDo =
    tier === 'basic'
      ? 'hold normal conversations, remember facts about them, read their workspace data (scheduled/draft/published posts and counts), generate captions and hashtags, and tell them their best time to post'
      : 'everything in Basic plus schedule/edit posts from chat, web & trend research, account analytics, and growth recommendations';

  return [
    `--- VeeGPT plan capabilities (the user's current VeeGPT tier is "${tier}") ---`,
    'The user is on a plan with LIMITED VeeGPT capabilities. These actions are NOT available to them right now:',
    ...locked,
    'RULE: If the user asks for any capability listed above, do NOT ask them for details, do NOT gather information, and do NOT run a different tool as a stand-in. Instead, in ONE short reply: (1) tell them honestly that this capability isn\u2019t on their current plan, (2) name the plan that unlocks it and point them to Plan / Billing to upgrade, and (3) offer what you CAN do for them on their current plan.',
    'Special case — scheduling/publishing: on their current plan you cannot schedule or publish from chat, but they CAN still create and schedule a post manually from the Create page. Mention that as the no-cost alternative, alongside the upgrade option.',
    `On their current plan you CAN still: ${canDo}.`,
  ].join('\n');
}

/** Render the recent-conversation transcript (verbatim shape from `buildPrompt`). */
function renderRecentConversation(ctx: ComposeInput): string {
  const history = Array.isArray(ctx.history) ? ctx.history : [];
  if (!history.length) return '';
  return history
    .map((m) => `${m.role === 'assistant' ? 'VeeGPT' : 'User'}: ${m.content}`)
    .join('\n');
}

// ---------------------------------------------------------------------------
// The Context_Module registry
// ---------------------------------------------------------------------------

/** All non-`chat` task capabilities — the default `appliesTo` for broadly-applicable modules. */
const ALL: Capability[] = [...ALL_CAPABILITIES];

/**
 * The Context_Module registry. Ordered by trust layer (system → developer →
 * app-state → retrieved → user), which is also the design's static→dynamic→
 * volatile prompt-cache ordering. Each entry maps 1:1 to a row in the design's
 * Context_Class Classification Table.
 *
 * The five `always: true` static modules (`core-behavior`, `safety-policy`,
 * `reasoning-formatting`, `rich-output`, `output-contract`) are present on every
 * request regardless of intent (Req 5.4); the remaining modules are selected by
 * intent via `appliesTo` (Req 5.3) — see `selectModules` (task 4.2).
 */
export const CONTEXT_MODULES: ContextModule[] = [
  // ── Static core (always present, system layer) ──────────────────────────
  {
    id: 'core-behavior',
    contextClass: 'static',
    trustLayer: 'system',
    always: true,
    appliesTo: [],
    render: () => CORE_BEHAVIOR,
  },
  {
    id: 'safety-policy',
    contextClass: 'static',
    trustLayer: 'system',
    always: true,
    appliesTo: [],
    render: (ctx) => renderSafetyPolicy(ctx.prefs),
  },
  {
    id: 'reasoning-formatting',
    contextClass: 'static',
    trustLayer: 'system',
    always: true,
    appliesTo: [],
    render: () => REASONING_FORMATTING,
  },
  {
    // Native image generation/editing capability. Static + always evaluated,
    // but renders only when the tier actually exposes the image tools, so the
    // model never claims a capability the user's plan can't use.
    id: 'image-capability',
    contextClass: 'static',
    trustLayer: 'system',
    always: true,
    appliesTo: [],
    render: (ctx) =>
      isToolAllowedForTier('generate_image', ctx.tier ?? 'advanced')
        ? IMAGE_CAPABILITY
        : '',
  },
  {
    // W1 — the rich-output spec is intentionally repeated (head here, tail in
    // `output-contract`) for lightweight-model reliability (Req 13.3, 4.3).
    id: 'rich-output',
    contextClass: 'static',
    trustLayer: 'system',
    always: true,
    appliesTo: [],
    intentionalRepeat: true,
    render: () => RICH_OUTPUT,
  },
  {
    // W11 — tail restatement of the formatting/rich-output rules; kept after the
    // transcript for tail-weighting. Intentional repeat of `rich-output`.
    id: 'output-contract',
    contextClass: 'static',
    trustLayer: 'system',
    always: true,
    appliesTo: [],
    intentionalRepeat: true,
    render: () => OUTPUT_CONTRACT,
  },

  // ── Dynamic instructions (developer layer) ──────────────────────────────
  {
    // The selected expert persona's `ACTIVE EXPERT MODE` block. Leads the
    // dynamic instructions (design node D1) so the selected specialist governs
    // HOW VeeGPT answers, while platform/safety rules remain in force (Req 10.5).
    // Tier gating + single-selection precedence are delegated to
    // `getAgentDirectivesForTier` (see `renderPersona`), producing the identical
    // outcome as today (Req 10.1–10.4). Applies to every request (`ALL`) because
    // a persona, once selected, governs the whole conversation regardless of
    // intent — exactly as the legacy `agentBlock` did.
    id: 'persona',
    contextClass: 'task-specific',
    trustLayer: 'developer',
    always: false,
    appliesTo: ALL,
    render: (ctx) => renderPersona(ctx),
  },
  {
    id: 'ai-config-directives',
    contextClass: 'user-specific',
    trustLayer: 'developer',
    always: false,
    appliesTo: ALL,
    render: (ctx) => renderAiConfigDirectives(ctx.prefs),
  },
  {
    id: 'memory-guidance',
    contextClass: 'tool-specific',
    trustLayer: 'developer',
    always: false,
    appliesTo: ['memory_write'],
    render: (ctx) => renderMemoryGuidance(ctx.prefs),
  },
  {
    // W2 — WORKSPACE DATA & ACTIONS prose; intentional repeat of edit guidance.
    id: 'workspace-actions-guidance',
    contextClass: 'tool-specific',
    trustLayer: 'developer',
    always: false,
    appliesTo: ['workspace_data', 'edit_content', 'posting'],
    intentionalRepeat: true,
    render: () => WORKSPACE_ACTIONS_GUIDANCE,
  },
  {
    id: 'tier-capability',
    contextClass: 'user-specific',
    trustLayer: 'developer',
    always: false,
    appliesTo: ALL,
    render: (ctx) => renderTierCapability(ctx),
  },
  {
    id: 'forced-tool',
    contextClass: 'turn-specific',
    trustLayer: 'developer',
    always: false,
    appliesTo: ALL,
    render: (ctx) => renderForcedTool(ctx),
  },

  // ── Application state (trusted DATA, not instructions) ──────────────────
  {
    id: 'workspace-context',
    contextClass: 'user-specific',
    trustLayer: 'app-state',
    always: false,
    appliesTo: ALL,
    render: (ctx) => (ctx.workspaceContext ? ctx.workspaceContext.trim() : ''),
  },
  {
    id: 'content-ids',
    contextClass: 'tool-specific',
    trustLayer: 'app-state',
    always: false,
    appliesTo: ['edit_content', 'posting', 'workspace_data'],
    // Sourced from the async, DB-backed `buildContentContext`; threaded in as a
    // pre-computed string so `render` stays pure/sync/DB-free.
    render: (ctx) => ctx.contentContext || '',
  },
  {
    id: 'posting-context',
    contextClass: 'tool-specific',
    trustLayer: 'app-state',
    always: false,
    appliesTo: ['posting'],
    render: (ctx) => renderPostingContext(ctx),
  },
  {
    id: 'account-scope',
    contextClass: 'tool-specific',
    trustLayer: 'app-state',
    always: false,
    appliesTo: ['analytics', 'account_data'],
    render: (ctx) => renderAccountScope(ctx),
  },
  {
    id: 'conversation-summary',
    contextClass: 'historical',
    trustLayer: 'app-state',
    always: false,
    appliesTo: ALL,
    render: (ctx) =>
      ctx.memorySummary && ctx.memorySummary.trim()
        ? `--- Summary of earlier conversation (long-term memory) ---\n${ctx.memorySummary.trim()}`
        : '',
  },
  {
    id: 'turn-note',
    contextClass: 'turn-specific',
    trustLayer: 'app-state',
    always: false,
    appliesTo: ALL,
    render: (ctx) =>
      ctx.memoryNote && ctx.memoryNote.trim()
        ? `--- Memory update (already applied) ---\n${ctx.memoryNote.trim()}`
        : '',
  },

  // ── Retrieved data (selective) ──────────────────────────────────────────
  {
    id: 'user-memory',
    contextClass: 'user-specific',
    trustLayer: 'retrieved',
    always: false,
    appliesTo: ALL,
    render: (ctx) =>
      ctx.userMemoryProfile && ctx.userMemoryProfile.trim()
        ? `Things you remember about this user:\n${ctx.userMemoryProfile.trim()}\n\n${USER_MEMORY_USAGE}`
        : '',
  },

  // ── User content (lowest authority; never promoted — Req 17/18) ─────────
  {
    id: 'recent-conversation',
    contextClass: 'conversation-specific',
    trustLayer: 'user',
    always: false,
    appliesTo: ALL,
    render: (ctx) => renderRecentConversation(ctx),
  },
  {
    id: 'current-request',
    contextClass: 'turn-specific',
    trustLayer: 'user',
    always: false,
    appliesTo: ALL,
    render: (ctx) => (ctx.currentMessage ? `User: ${ctx.currentMessage}` : ''),
  },
];

// ---------------------------------------------------------------------------
// Coverage map + manual-resolution flag (Req 4.4 / 4.5)
// ---------------------------------------------------------------------------

/**
 * Coverage proof for Req 4.4: every audited context piece (design's
 * Context_Class Classification Table) has exactly one destination module. If a
 * new audited item appears with no destination, add a module rather than
 * force-fitting it into an unrelated one.
 */
export const AUDIT_ITEM_TO_MODULE: Readonly<Record<string, string>> = {
  'systemBlock: VeeGPT identity intro': 'core-behavior',
  'directives: contentSafety + provider safety settings': 'safety-policy',
  'systemBlock: ANSWERING STYLE + FORMATTING': 'reasoning-formatting',
  'systemBlock: rich-output chart/viz spec (W1)': 'rich-output',
  'buildPrompt: outputContract tail (W11)': 'output-contract',
  'buildPrompt: ACTIVE EXPERT MODE agent directives (veegpt-agents)': 'persona',
  'directives: persona/voice, tone, responseLength, optimizationGoals, autoHashtags, autoLearning, multilingual':
    'ai-config-directives',
  'directives: aiMemory long-term memory-handling block': 'memory-guidance',
  'knowledgeBlock: UserMemory profile facts + usage instructions': 'user-memory',
  'knowledgeBlock: workspace/brand context': 'workspace-context',
  'memoryBlock: rolling conversation summary': 'conversation-summary',
  'buildPrompt: verbatim transcript (recent window)': 'recent-conversation',
  'buildPrompt: current user message': 'current-request',
  'buildPrompt: memory-update noteBlock': 'turn-note',
  'systemBlock: WORKSPACE DATA & ACTIONS prose (W2)': 'workspace-actions-guidance',
  'buildContentContext: posts-with-ids list': 'content-ids',
  'buildToolContext: posting context (time/accounts/media)': 'posting-context',
  'buildAccountScopeHint: analytics-access prose': 'account-scope',
  'buildForcedToolDirective: forced-tool directive': 'forced-tool',
  'buildTierCapabilityContext: tier restriction notes': 'tier-capability',
};

/**
 * Items that could not be uniquely classified and therefore require MANUAL
 * resolution while their current behavior is preserved (Req 4.5). Empty: every
 * audited context piece mapped cleanly to exactly one module.
 */
export const UNCLASSIFIED_ITEMS: readonly string[] = [];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/** All registered module ids, in registry (trust-layer) order. */
export const CONTEXT_MODULE_IDS: readonly string[] = CONTEXT_MODULES.map(
  (m) => m.id
);

/** Look up a module by id (undefined if unknown). */
export function getModuleById(id: string): ContextModule | undefined {
  return CONTEXT_MODULES.find((m) => m.id === id);
}

/** The static modules that must appear on every request (Req 5.4). */
export const STATIC_MODULES: ContextModule[] = CONTEXT_MODULES.filter(
  (m) => m.always
);

// ---------------------------------------------------------------------------
// selectModules — intent-driven module selection (Req 5.1, 5.3, 5.4, 5.6, 6.1)
// ---------------------------------------------------------------------------

/**
 * Select the `Context_Module`s to compose for a request from its classified
 * intent (task 4.2). This is the module half of the dynamic-composition layer:
 * it decides WHICH modules participate; the `ContextComposer` (task 5.3) then
 * orders and renders them.
 *
 * Selection rules (design §"ContextComposer + Context_Module registry +
 * selectModules"):
 *   • The `always` (static) core modules are ALWAYS included, regardless of
 *     intent (Req 5.4) — VeeGPT's identity, safety policy, reasoning/formatting,
 *     and rich-output contract must be present on every request.
 *   • Every module whose `appliesTo` intersects the request's `intents` is
 *     included (Req 5.3 / 6.1) — a module joins the request when at least one of
 *     its declared capabilities was identified for the turn.
 *   • FAIL OPEN (correctness > tokens): when the intent is empty, ambiguous, or
 *     the classifier fell back, return the COMPLETE registry with the static
 *     modules guaranteed present (Req 5.6, 6.6, 19.1). Under-selecting would drop
 *     needed context, so we widen to everything rather than guess.
 *
 * Returned modules preserve the registry's trust-layer ordering (static →
 * dynamic → volatile). This is a pure function: it reads only its arguments and
 * the static registry, and never mutates either.
 *
 * @param intent The classified intent for the request (from `classifyIntent`).
 * @param ctx    The compose input (unused for selection today; accepted so the
 *               selection contract can grow without a signature change and to
 *               mirror `selectTools(intent, ctx)`).
 */
export function selectModules(
  intent: IntentResult,
  _ctx: ComposeInput
): ContextModule[] {
  const intents = Array.isArray(intent?.intents) ? intent.intents : [];

  // Fail open to the complete registry on empty / ambiguous / fallback intent
  // (Req 5.6, 6.6, 19.1). The complete registry already contains every static
  // module, so the "static always present" guarantee (Req 5.4) is preserved.
  if (!intent || intent.ambiguous || intent.usedFallback || intents.length === 0) {
    return [...CONTEXT_MODULES];
  }

  const intentSet = new Set<Capability>(intents);

  // Include a module when it is static (`always`) OR its `appliesTo` intersects
  // the identified intents (Req 5.3 / 6.1). Registry order is preserved.
  return CONTEXT_MODULES.filter(
    (m) => m.always || m.appliesTo.some((cap) => intentSet.has(cap))
  );
}
