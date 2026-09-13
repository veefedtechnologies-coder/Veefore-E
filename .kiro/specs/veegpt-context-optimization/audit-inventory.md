# VeeGPT Context Optimization — Pre-Change Implementation Audit Inventory

> **Requirement 1 artifact.** This is the mandatory pre-change audit inventory that must exist and
> be marked **COMPLETE** before any refactor task begins (Req 1.1, 1.3, 1.4). Every existing
> instruction and context source is mapped to a real file path + symbol/line reference (Req 1.2).
> Areas with no corresponding implementation are recorded explicitly as **"not present"** (Req 1.3).
> Any behavior that cannot be mapped is recorded as **"unresolved — behavior retained unchanged"**
> (Req 1.5).
>
> **Source of truth:** the current implementation. Nothing in this inventory authorizes a behavior
> change; it only records what exists today.
>
> Line numbers are anchored to the state of the codebase at audit time and expressed as
> `~L<n>` because subsequent edits may shift them; the symbol name is the authoritative anchor.

## Status

**AUDIT STATUS: COMPLETE**

Every area required by Req 1.1 below has at least one mapped entry, or is explicitly recorded as
"not present" / "unresolved". This artifact is the hard gate for Phase 1 (task 2 checkpoint).

## Req 1.1 Area Coverage Checklist

| # | Req 1.1 Area | Status | Section |
|---|---|---|---|
| 1 | Prompt builders | mapped | §1 |
| 2 | Context builders | mapped | §2 |
| 3 | Conversation history handling | mapped | §3 |
| 4 | Conversation_Memory | mapped | §4 |
| 5 | User_Memory | mapped | §5 |
| 6 | Persona / agent system | mapped | §6 |
| 7 | Intent_Router | mapped | §7 |
| 8 | Reasoning instructions | mapped | §8 |
| 9 | Tool definitions and execution | mapped | §9 |
| 10 | Tool results | mapped | §10 |
| 11 | Workspace / brand / account context | mapped | §11 |
| 12 | Model_Router | mapped | §12 |
| 13 | Streaming | mapped | §13 |
| 14 | Token_Ledger | mapped | §14 |
| 15 | Error / retry handling | mapped | §15 |
| 16 | Caching | mapped (ordering-only today) | §16 |
| 17 | Provider APIs | mapped | §17 |
| 18 | Existing tests | mapped | §18 |
| 19 | Configuration / environment variables | mapped (context-opt config **not present** yet) | §19 |
| 20 | Database models for conversations and memory | mapped | §20 |
| 21 | Frontend assumptions about VeeGPT responses | mapped | §21 |

---

## §1 Prompt builders

| Item | Location | Notes |
|---|---|---|
| Master prompt assembler | `server/routes/veegpt-chat.routes.ts` → `buildPrompt()` ~L634 | Concatenates `agentBlock + systemBlock`, `knowledgeBlock`, `memoryBlock`, `--- Conversation ---`, `transcript`, `noteBlock`, `outputContract`, trailing `VeeGPT:` into ONE prompt string. Final return ~L836. |
| Response-length directive | `veegpt-chat.routes.ts` → `responseLengthDirective()` ~L617 | Maps `prefs.responseLength` (`short`/`medium`/`long`/default) to a concrete length instruction. |
| AI-config directives array | `veegpt-chat.routes.ts` → `directives[]` inside `buildPrompt` ~L643–L700 | Persona/voice (`aiPersona`), writing tone (`captionStyle`), response length, `optimizationGoals`, `multilingual`, `autoHashtags`, `contentSafety` (strict/off), `aiMemory` memory-handling text (long-term), `autoLearning`. |
| ACTIVE EXPERT MODE block | `veegpt-chat.routes.ts` → `agentBlock` inside `buildPrompt` ~L703–L712 | Leads the prompt when `agentDirectives` is present; states persona governs HOW, platform rules still apply. |
| Core system block | `veegpt-chat.routes.ts` → `systemBlock` inside `buildPrompt` ~L714–L775 | Core VeeGPT identity, rich-output block spec, ANSWERING STYLE, FORMATTING, WORKSPACE DATA & ACTIONS, multitasking rules, then `directives.join('\n')`. |
| Streaming prompt entry (create+stream) | `veegpt-chat.routes.ts` → streaming send-message handler that calls `buildPrompt(...)` ~L2949 (via inner builder ~L2811 params) and ~L5263 / ~L5753 call sites | Two call sites: existing-conversation send and new-conversation create+stream. |

## §2 Context builders (appended tool context)

| Item | Location | Notes |
|---|---|---|
| Content/id list (posts with ids) | `veegpt-chat.routes.ts` → `buildContentContext()` ~L857 | Read-only; up to ~30 scheduled+draft posts with opaque ids so edits resolve in one pass. |
| Posting/tool context | `veegpt-chat.routes.ts` → `buildToolContext()` ~L1008 | Local time, connected accounts, media availability; guides scheduling/posting. |
| Account scope hint | `veegpt-chat.routes.ts` → `buildAccountScopeHint()` ~L1062 | Analytics-access prose for the selected account. |
| Forced-tool directive | `veegpt-chat.routes.ts` → `buildForcedToolDirective()` ~L1121 | Emits directive when user forces a tool from the composer; tier-aware (`tier` param). |
| Tier-capability context | `veegpt-chat.routes.ts` → `buildTierCapabilityContext()` ~L1168 | Restriction notes for non-advanced tiers; returns `''` for `advanced`. |
| Fresh profile hint | `veegpt-chat.routes.ts` → `getFreshProfileHint()` ~L2309; prepended into `toolContext` ~L5243, ~L5735 | Authoritative niche/profile block; asks rather than assumes when niche unset. |

## §3 Conversation history handling

| Item | Location | Notes |
|---|---|---|
| Long-term window planner | `server/routes/veegpt-memory.logic.ts` → `planLongTermWindow()` ~L52 | Keeps `LONG_TERM_VERBATIM=20` recent; summarizes overflow in `SUMMARY_BATCH=10` batches. |
| Short-term window selector | `veegpt-memory.logic.ts` → `selectShallowWindow()` ~L20 | `off` → current message only; `short-term` → last `SHORT_TERM_VERBATIM=8`. |
| Transcript renderer (memory) | `veegpt-memory.logic.ts` → `renderTranscript()` ~L77 | `User:` / `VeeGPT:` line block. |
| Transcript renderer (prompt) | `veegpt-chat.routes.ts` → inline `transcript` map inside `buildPrompt` ~L820 | Same `User:`/`VeeGPT:` shape, built directly in the prompt assembler. |
| Window constants | `veegpt-memory.logic.ts` ~L12–L14 | `LONG_TERM_VERBATIM=20`, `SHORT_TERM_VERBATIM=8`, `SUMMARY_BATCH=10`. |

## §4 Conversation_Memory (rolling summary)

| Item | Location | Notes |
|---|---|---|
| Rolling summary field | `server/models/Chat/ChatConversation.ts` → `memorySummary` (interface ~L47, schema ~L69), `summarizedMessageCount` (interface ~L49, schema ~L71) | Running summary of older messages + count folded in. |
| Summary injection in prompt | `veegpt-chat.routes.ts` → `memoryBlock` inside `buildPrompt` ~L779 | `--- Summary of earlier conversation (long-term memory) ---`. |
| Summary regeneration | Background `veegpt.memory_summary` model call (invoked after reply persistence) | **Unresolved — behavior retained unchanged**: the exact background summarization trigger is a model call whose scheduling is retained as-is; not modified by this refactor. Anchor: `MemoryMode` handling in `veegpt-memory.logic.ts` + summary persistence in the send-message handlers. |
| Memory mode type | `veegpt-memory.logic.ts` → `MemoryMode` ~L11 | `off` / `short-term` / `long-term` / undefined. |

## §5 User_Memory (cross-conversation durable facts)

| Item | Location | Notes |
|---|---|---|
| Merge with caps/dedup | `server/routes/veegpt-user-memory.logic.ts` → `mergeMemoryItems()` ~L75 | Single-value-topic replacement, dedup, oldest-first eviction on `MAX_ITEMS`/`MAX_CHARS`. |
| Single-value topic detection | `veegpt-user-memory.logic.ts` → `detectTopic()` ~L41, `SINGLE_VALUE_TOPICS` | Drives topic replacement. |
| Memory-full check | `veegpt-user-memory.logic.ts` → `isMemoryFull()` ~L138 | True at `MAX_ITEMS`/`MAX_CHARS`. |
| Save-intent detection | `veegpt-user-memory.logic.ts` → `hasSaveIntent()` ~L204, `extractSaveIntentFact()` ~L220 | Detects "remember/save/note this" and extracts the fact. |
| Item clamp | `veegpt-user-memory.logic.ts` → `clampItemText()` ~L50 | Enforces `MAX_ITEM_CHARS`. |
| Usage computation | `veegpt-user-memory.logic.ts` → `computeUsage()` ~L182 | Percent used across chars/items. |
| Limits | `server/models/Chat/UserMemory.ts` → `MEMORY_LIMITS` (imported ~L8, re-exported ~L196) | `MAX_ITEMS`, `MAX_CHARS`, `MAX_ITEM_CHARS`. |
| In-band memory guidance | `veegpt-chat.routes.ts` → `knowledgeBlock` inside `buildPrompt` ~L791–L807 | Acknowledgement / contradiction (`update_memory`) / forget / duplicate-cleanup / ask-when-unsure rules. |
| Memory tools | `server/routes/veegpt-tools.ts` → `VEEGPT_MEMORY_TOOLS_ALL` ~L321 | `remember_fact`, `update_memory`, `forget_memory`. |

## §6 Persona / agent system

| Item | Location | Notes |
|---|---|---|
| Agent registry | `server/routes/veegpt-agents.ts` → `VEEGPT_AGENTS` ~L34 | `default`/`strategist`/`creator`/`analyst`/`researcher`, each with `minTier` + `directives`. |
| Tier-gated directives | `veegpt-agents.ts` → `getAgentDirectivesForTier()` ~L125 | Returns `''` if persona not allowed for tier; else the agent's directives. |
| Tier gating helpers | `veegpt-agents.ts` → `isAgentAllowedForTier()` ~L107, `agentsForTier()` ~L112, `getAgentById()` ~L101 | Single-selection precedence; falls back to `default`. |
| Client-safe view | `veegpt-agents.ts` → `agentPublicView()` ~L96 | Strips `directives`. |
| Application into prompt | `veegpt-chat.routes.ts` → `agentBlock` in `buildPrompt` ~L703; passed as `advanced?.agentDirectives` ~L2953 | ACTIVE EXPERT MODE leads the prompt. |

## §7 Intent_Router (triage)

| Item | Location | Notes |
|---|---|---|
| Trivial-message detector | `server/routes/veegpt-triage.logic.ts` → `detectTrivialMessage()` ~L87 | Deterministic, LLM-free; greeting/thanks/farewell → canned reply; returns `null` when media present. |
| Normalizer | `veegpt-triage.logic.ts` → `normalizeTrivial()` (used ~L90) | Text normalization for trivial matching. |
| Capability-level intent classifier | **not present** | No capability-level intent router exists today; `detectTrivialMessage` is the ONLY deterministic router. This is created by task 5.1 (`veegpt-intent.logic.ts`). |
| Cheap post-agent triage flag | `veegpt-chat.routes.ts` → `req.body.includeWorkspaceContext` handling ~L5090–L5133 | Existing lightweight gate that decides whether the workspace-context block is injected. |

## §8 Reasoning / formatting / rich-output instructions

| Item | Location | Notes |
|---|---|---|
| Rich-output block spec (head) | `veegpt-chat.routes.ts` → `systemBlock` rich-output section in `buildPrompt` ~L720–L745 | ```` ```chart ```` (bar/line/area/pie) and ```` ```viz ```` (stats/steps/progress/compare/checklist) specs + HARD RULES. |
| Output contract (tail) | `veegpt-chat.routes.ts` → `outputContract` in `buildPrompt` ~L822–L833 | Compact restatement of Markdown + chart/viz rules placed AFTER transcript for tail-weighting. |
| Answering-style / formatting rules | `veegpt-chat.routes.ts` → `systemBlock` ANSWERING STYLE + FORMATTING ~L747–L768 | Adaptive depth, headings, tables, bullets, callouts, personal/account answering. |
| Reasoning-model handling | `server/services/litellm/LiteLLMGateway.ts` → `isReasoningModel()` ~L96, `emitsReasoningContent()` ~L108, `GEMINI_THINKING_MODELS` ~L76, `TEMPERATURE_LOCKED_MODELS` ~L55 | Governs reasoning panel + `reasoning_effort`. |
| Intentional repetition | Rich-output head (~L720) vs tail contract (~L822); WORKSPACE prose (~L762). | Recorded per design W1/W2/W11 as `intentionalRepeat` — retained until Regression_Suite proves removal is output-equivalent (Req 13.3, 4.3). |

## §9 Tool definitions and execution

| Item | Location | Notes |
|---|---|---|
| Chat tools | `server/routes/veegpt-tools.ts` → `VEEGPT_CHAT_TOOLS` ~L51 | `schedule_post`. |
| Insight tools | `veegpt-tools.ts` → `VEEGPT_INSIGHT_TOOLS` ~L219 | Caption/hashtags/insight tools needing account/analytics. |
| Memory tools | `veegpt-tools.ts` → `VEEGPT_MEMORY_TOOLS_ALL` ~L321 | `remember_fact`/`update_memory`/`forget_memory`. |
| Data tools | `veegpt-tools.ts` → `VEEGPT_DATA_TOOLS` ~L359 | `get_workspace_data` (read-only). |
| Account tools | `veegpt-tools.ts` → `VEEGPT_ACCOUNT_TOOLS` ~L421 | `get_account_details` (selected account). |
| Edit tools | `veegpt-tools.ts` → `VEEGPT_EDIT_TOOLS` ~L539 | `reschedule_post`/`cancel_scheduled_post`/`update_post_caption`/`delete_post`/`duplicate_post`. |
| Tier filter | `server/config/veegpt-tiers.ts` → `filterToolsByTier()` ~L69, `isToolAllowedForTier()` ~L59, `TOOL_MIN_TIER` ~L22 | Applied before exposure. |
| Tier resolution | `veegpt-tiers.ts` → `resolveVeeGPTTier()` ~L83 | `basic`/`full`/`advanced`; defaults `basic` on error. |
| Tool execution loop | `veegpt-chat.routes.ts` → edit executor ~L1480–L1692, workspace-data executor ~L1362–L1455, deep-research executor ~L2063–L2168, media analysis ~L1750 | Executes tools, renders cards, second grounded pass. |
| Leaked-tool-call recovery | `veegpt-chat.routes.ts` → `recoverLeakedToolCalls()` ~L935 | Text-mode fallback for models that emit tool calls as text. |
| Streaming tool-call accumulation | `server/services/toolCallAccumulator.ts` → `accumulateToolCallDeltas()` ~L33, `finalizeToolCalls()` ~L66 | Reassembles streamed tool-call deltas. |

## §10 Tool results

| Item | Location | Notes |
|---|---|---|
| Workspace-data result cards | `veegpt-chat.routes.ts` workspace-data executor ~L1362–L1455 | Builds `listCard` + `summaryText` + `items` (scheduled/draft/published/overview). |
| Edit-action results | `veegpt-chat.routes.ts` edit executor ~L1480–L1692 | Returns confirmation-card payloads; edits are staged, not applied. |
| Tool-result reduction | **not present** | No payload-size reduction exists today; `reduceToolResult()` is created by task 8.3 (`veegpt-tool-result.logic.ts`). Current behavior: full payloads re-enter context. |

## §11 Workspace / brand / account context

| Item | Location | Notes |
|---|---|---|
| Workspace-context accessor | `server/services/WorkspaceContextAccessor.ts` → `getWorkspaceContextForPrompt()`, `getIdentityContextForPrompt()`, `getStoredWorkspaceContext()`, `refreshWorkspaceContext()` (imported `veegpt-chat.routes.ts` ~L76) | Full workspace block or lightweight identity-only block. |
| Context builder | `server/services/WorkspaceContextService.ts` → `buildWorkspaceContext()` (dynamic import ~L6577) | Builds the snapshot persisted into the memory doc. |
| Injection decision | `veegpt-chat.routes.ts` ~L5119–L5133 | `includeWorkspaceContext !== false`; identity-only when an account is selected. |
| AI preferences resolution | `veegpt-chat.routes.ts` → `getWorkspaceAIPreferences()` ~L359 | Resolves model/keys/persona/config; used to build `prefs` (`FullPreferences`). |
| Stored context on memory doc | `server/models/Chat/UserMemory.ts` → `workspaceContext`/`workspaceContextUpdatedAt` (read ~L6182–L6195) | Cached snapshot counted toward usage. |

## §12 Model_Router

| Item | Location | Notes |
|---|---|---|
| Route resolver | `server/services/ai-model-routing.ts` → `resolveRoute()` ~L424 | No availability fallback; deterministic capability substitution to Gemini for video/pdf/heic. |
| Registry | `ai-model-routing.ts` → `REGISTRY` ~L58, `listRegisteredModels()` ~L324, `getModelSpec()` ~L397 | All known model ids/specs. |
| Gateway bypass | `ai-model-routing.ts` → `mustBypassGateway()` ~L466 | video/document/heic/pdf → native Gemini SDK. |
| Temperature support | `ai-model-routing.ts` → `supportsCustomTemperature()` ~L401, `nativeModelFor()` ~L338 | GPT-5 reasoning models reject custom temperature. |
| Model-tier map | `shared/veegpt-model-tiers.ts` | Prices/classifies registry models. |

## §13 Streaming

| Item | Location | Notes |
|---|---|---|
| NDJSON event writer | `veegpt-chat.routes.ts` → `writeEvent()` ~L843 | Writes one newline-delimited JSON event; swallows closed-response errors. |
| Event contract (server→client) | `veegpt-chat.routes.ts` streaming handlers | Emits `conversation`, `userMessage`, `status`, `aiMessageStart`, `chunk` (cumulative), `reasoning`, `researchProgress`, `modelNotice`, `complete`, `error`, plus tool cards (`postCard`/`listCard`/`editCard(s)`/`infoCard(s)`). |
| Research progress state | `veegpt-chat.routes.ts` → `RESEARCH_PROGRESS_KEY` / Redis set ~L292, del ~L304 | Backs the streaming research banner. |
| Provider stream method | `server/services/AIServiceManager.ts` → `generateChatStreamWithTools()` ~L952 | Consumes the prompt string + tools, streams deltas. |

## §14 Token_Ledger

| Item | Location | Notes |
|---|---|---|
| Usage event schema | `server/services/veegpt-ledger.ts` → `IVeegptUsageEvent` ~L48, `VeegptUsageEventSchema` ~L83, model export ~L128 | Carries `inputTokens`/`outputTokens`/`reasoningTokens`/`cachedTokens` ~L61–L64; charges from actual usage. |
| Usage sanitize/persist | `veegpt-ledger.ts` → `sanitize()` ~L177, `updateOne` upserts ~L202/~L306 | Idempotent by `reservationId`/`requestId`. |
| Usage recording | `server/services/AIServiceManager.ts` → `recordAIUsage` (imported ~L19; called at every provider path, e.g. ~L493, ~L909, ~L1014) | `fromOpenAIUsage`/`fromGeminiUsage` normalizers. |
| Pricing registry | `server/config/veegpt-pricing.registry.ts` | Per-model pricing. |
| Metering wrapper | `withVGU` / `meterAI` / `aiUsageTracker` (reservation engine `server/services/veegpt-reservation.engine.ts`) | Wraps the request; reconciles charges. |

## §15 Error / retry handling

| Item | Location | Notes |
|---|---|---|
| Retry policy | `server/services/veegpt-retry.ts` → `withProviderRetry()` ~L225, `classifyFailure()` ~L82, `isRetryable()` ~L60, `backoffDelayMs()` ~L183 | Retries only rate_limit/server_error/connection/timeout; NEVER client_error/content_policy/quota/aborted; shares one reservation. |
| Provider retry-after | `veegpt-retry.ts` → `providerRetryAfterMs()` ~L150 | Honors provider `Retry-After`. |
| Per-call error swallowing | `veegpt-chat.routes.ts` numerous `.catch(() => …)` / `try/catch` (e.g. `buildContentContext` ~L897, executors ~L1455/~L1689) | Non-fatal degradation to empty/graceful results. |
| Deep-research refusal text | `veegpt-chat.routes.ts` → `deepResearchRefusalText()` ~L443 | Quota refusal rendered as a readable answer, not a crash. |
| Repair service | `server/services/veegpt-repair.service.ts` | **Unresolved — behavior retained unchanged**: post-hoc repair utility; its exact invocation path is retained as-is, not modified by this refactor. |

## §16 Caching

| Item | Location | Notes |
|---|---|---|
| Static-prefix ordering | `veegpt-chat.routes.ts` → PROMPT-CACHE-FRIENDLY ORDERING comment + return in `buildPrompt` ~L808–L836 | Orders static → dynamic → volatile (note/message last) to maximize a cacheable identical prefix. |
| Explicit prompt caching | **not present** | `LiteLLMGateway` (OpenAI SDK against proxy) and native paths set NO `cache_control` breakpoints. Only provider *automatic* prefix caching is available today. `include_usage` returns `cachedTokens` when the provider supplies it (`stream_options` ~L320/~L374). |

## §17 Provider APIs

| Item | Location | Notes |
|---|---|---|
| Service manager | `server/services/AIServiceManager.ts` → `class AIServiceManager` ~L192, singleton `instance` ~L194 | Native Gemini/OpenAI/GitHub + gateway; `generateChatStreamWithTools()` ~L952. |
| LiteLLM gateway | `server/services/litellm/LiteLLMGateway.ts` → `chatStreamWithTools()` ~L349 | `tool_choice:'auto'` ~L362, `stream_options:{include_usage:true}` ~L320/~L374; omits temperature for locked models ~L365. |
| Temperature/reasoning gating | `LiteLLMGateway.ts` → `TEMPERATURE_LOCKED_MODELS` ~L55, `GEMINI_THINKING_MODELS` ~L76, `supportsTemperature`/`isReasoningModel`/`emitsReasoningContent` ~L87/~L96/~L108 | Provider-specific behavior preserved. |

## §18 Existing tests

| Item | Location | Notes |
|---|---|---|
| Tool-call accumulator tests | `tests/veegpt-tool-accumulator.test.ts` | Covers `accumulateToolCallDeltas`/`finalizeToolCalls`. |
| Conversation-memory logic tests | `tests/veegpt-memory.logic.test.ts` | Covers window planning / transcript. |
| Memory integration tests | `tests/veegpt-memory.integration.test.ts` (open editor) | End-to-end memory behavior. |
| User-memory logic tests | `tests/veegpt-user-memory.logic.test.ts` (open editor) | Covers merge/dedup/caps/save-intent. |
| Token capture tests | `tests/veegpt-token-capture.test.ts` | Provider token accounting. |
| Abuse tests | `tests/veegpt-abuse.test.ts` | Guardrails. |
| VGU verify scripts | `server/scripts/verify-vgu-*.ts` | Reservation/security/load/coverage/external-cost checks (env-driven). |
| Context-optimization tests | **not present** | `tests/veegpt-context/` and `tests/veegpt-baseline/` are created by tasks 1.2, 3.3, 3.4, 4.4+. |

## §19 Configuration / environment variables

| Item | Location | Notes |
|---|---|---|
| VGU budget/limit env vars | `process.env.VEEGPT_*` (e.g. `VEEGPT_MONTHLY_VGU_*`, `VEEGPT_5H_VGU_*`, `VEEGPT_CONCURRENCY_*`, `VEEGPT_RPM_*`, `VEEGPT_SEARCH_COST_*`, `VEEGPT_TIER_VGU_*`) — used across `server/scripts/verify-vgu-*.ts` and reservation/pricing services | Existing `VEEGPT_*` env convention to reuse. |
| Env samples | `.env`, `.env.example`, `litellm/.env.litellm` | Provider keys + gateway config. |
| Context-optimization config | **not present** | `server/config/veegpt-context.config.ts` (`Optimization_Flag` `VEEGPT_CONTEXT_OPT`, `VEEGPT_CTX_*`) is created by task 3.1. No context-opt flag exists today; the legacy path is the only path. |

## §20 Database models for conversations and memory

| Item | Location | Notes |
|---|---|---|
| Conversation model | `server/models/Chat/ChatConversation.ts` → `memorySummary` (interface ~L47, schema ~L69), `summarizedMessageCount` (interface ~L49, schema ~L71), `isArchived`, `lastMessageAt`, `autopilotMissionId` mission link | Rolling summary lives here. |
| Durable Conversation_State | `server/models/Chat/ChatConversation.ts` → `IConversationState` ~L18, `IChatConversation.contextState` ~L52, schema sub-document ~L75; barrel exports `IConversationState`/`ConversationStateLabel` in `server/models/Chat/index.ts` ~L5–L6 | Present now (task 7.1 complete): optional sub-document with `objective`/`currentTask`/`requirements`/`decisions`/`constraints`/`entities`/`selectedOptions`/`pendingActions`/`facts`/`toolDerivedState`/`labels`/`summarizedMessageCount`/`updatedAt`; `required:false` + `default:undefined` so legacy docs read without error (Req 20.6/21.1–21.4). |
| Message model | `server/models/Chat/ChatMessage.ts` | Per-message documents. |
| User-memory model | `server/models/Chat/UserMemory.ts` → `MEMORY_LIMITS`, `IUserMemoryItem`, `workspaceContext`/`workspaceContextUpdatedAt` | Durable facts + cached workspace snapshot. |
| Model barrel | `server/models/Chat/index.ts` | Exports `ChatConversation`/`ChatMessage`/`UserMemory`. |
| Ledger model | `server/services/veegpt-ledger.ts` → `VeegptUsageEvent` ~L128 | Usage events (see §14). |

## §21 Frontend assumptions about VeeGPT responses

| Item | Location | Notes |
|---|---|---|
| Stream consumer | `client/src/features/chat/hooks/useChatStream.ts` | Consumes NDJSON events: `userMessage`, `status`, `aiMessageStart` ~L620, `chunk` (cumulative text), `reasoning`, `researchProgress` ~L516, `modelNotice` ~L508, `complete` ~L730, `error`. |
| Tool cards | `useChatStream.ts` → `pendingPostCardRef`/`pendingListCardRef`/`pendingEditCardsRef`/`pendingInfoCardsRef` ~L218–L226; case handlers `postCard`/`listCard` ~L686/`editCard`/`infoCard` ~L703/~L720 | Cards attached on finalize (~L416) so they render from the single streamed message. |
| Model-substitution notice | `useChatStream.ts` → `ModelNotice` ~L88, `modelNotice` state ~L252, `clearModelNotice` ~L253 | App deliberately never swaps models silently. |
| Chat types | `client/src/features/chat/types/chat.types.ts` → `ChatMessage`, `WebSocketMessage`, `StreamingContent`, `ResearchProgressState` (imported ~L25) | Contract types the UI depends on. |
| Chat page | `client/src/pages/VeeGPT.tsx` (open editor) | Renders the stream + cards. |

---

## Unresolved items (behavior retained unchanged — Req 1.5)

1. **Background rolling-summary regeneration trigger** (`veegpt.memory_summary` model call) — the
   precise scheduling/invocation is retained as-is; not altered by this refactor. (§4)
2. **`veegpt-repair.service.ts` invocation path** — retained unchanged; recorded here so its
   behavior is not assumed away. (§15)

These are retained verbatim until a fuller codebase location + description is added; the refactor
does not modify them.

## Items recorded as "not present" (Req 1.3)

- Capability-level Intent classifier (§7) — created by task 5.1.
- Tool-result payload reduction (§10) — created by task 8.3.
- Explicit provider prompt caching / `cache_control` (§16) — not supported by the integration today.
- Context-optimization tests `tests/veegpt-context/`, `tests/veegpt-baseline/` (§18) — created later.
- `server/config/veegpt-context.config.ts` + `VEEGPT_CONTEXT_OPT`/`VEEGPT_CTX_*` (§19) — created by task 3.1.

Each is an intentional gap that later tasks fill; none represents a current behavior that could be
lost by this refactor.

> Note: `ChatConversation.contextState` was previously listed here as "not present"; task 7.1 has
> since added those optional fields, so §20 now maps them to a real location and this entry is
> removed.
