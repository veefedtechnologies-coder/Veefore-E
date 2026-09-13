# Implementation Plan: VeeGPT Context & Prompt Architecture Optimization

## Overview

This plan delivers a **zero-regression, flag-guarded refactor** of how VeeGPT assembles and
delivers context to the model, following the design's 10-phase sequence: audit → instrument/baseline
→ classify → dynamic composition → conversation compaction → tool filtering → caching → regression
testing → optimization → hardening → final report.

Guardrails enforced by task ordering:

- The **audit inventory artifact** (Req 1) is the first task and a hard gate before any refactor-
  touching work.
- **Instrumentation + Baseline_Benchmark capture** (Req 2, 16, 25) precede every behavior-changing
  task.
- The legacy `buildPrompt(...) + toolContext` path stays fully intact; the `Optimization_Flag`
  defaults **off**, and a **flag-off byte-equivalence gate** (Property 14) must pass before the
  optimized path is ever enabled.
- **Correctness wins over tokens**: selection/reduction fail open; no token-driven dropping of
  needed tools or required tool-result fields.
- Each new pure-logic module ships with its unit + property-based tests (fast-check, min 100
  iterations) in the same or adjacent task, tagged to its property number.

Language: **TypeScript** (matches the existing `server/routes/veegpt-*.logic.ts` and
`tests/*.test.ts` conventions; no pseudocode in the design).

Implementation follows this instruction: convert the feature design into a series of prompts for a
code-generation LLM that will implement each step with incremental progress, each building on the
previous and ending with wiring things together, with no orphaned code.

## Tasks

- [x] 1. Phase 1 — Mandatory pre-change audit (hard gate)
  - [x] 1.1 Create the audit inventory artifact
    - Create `.kiro/specs/veegpt-context-optimization/audit-inventory.md` seeded from the design's
      "Existing Architecture Audit" section
    - Map every instruction and context source to a real file path + symbol/line for ALL Req 1.1
      areas: prompt builders (`buildPrompt`), context builders (`buildContentContext`,
      `buildToolContext`, `buildAccountScopeHint`, `buildForcedToolDirective`,
      `buildTierCapabilityContext`), conversation history, `veegpt-memory.logic.ts`,
      `veegpt-user-memory.logic.ts`, personas (`veegpt-agents.ts`), triage
      (`veegpt-triage.logic.ts`), reasoning/formatting/rich-output blocks, tools (`veegpt-tools.ts`),
      tool execution + results, workspace/brand/account context, `ai-model-routing.ts`,
      `AIServiceManager.ts`, `LiteLLMGateway.ts`, streaming (`useChatStream.ts` contract),
      `veegpt-ledger.ts`, error/retry, caching, provider APIs, existing tests, config/env,
      `server/models/Chat` models, and frontend assumptions
    - Record any area not present explicitly as "not present"; record any unmappable behavior as
      "unresolved — behavior retained unchanged"
    - _Requirements: 1.1, 1.2, 1.5_

  - [x] 1.2 Write audit-completeness gate test
    - Add a smoke test under `tests/veegpt-context/` that fails if any Req 1.1 area is missing from
      `audit-inventory.md` or the artifact is not marked complete
    - _Requirements: 1.3, 1.4_

- [x] 2. Checkpoint — Audit gate
  - Confirm `audit-inventory.md` is complete (every area mapped or explicitly recorded). No refactor
    task in later phases may begin until this passes. Ensure all tests pass, ask the user if
    questions arise.

- [x] 3. Phase 2 — Instrumentation and baseline (before any behavior change)
  - [x] 3.1 Implement centralized config and Optimization_Flag
    - Create `server/config/veegpt-context.config.ts` with `VeegptContextConfig`,
      `contextOptEnabled()`, and `getContextConfig()` using the existing `VEEGPT_*` env convention
    - Provide safe defaults (`enabled=false`, `recentWindowLongTerm=20`, `recentWindowShortTerm=8`,
      `summaryBatch=10`, `historyTokenBudget`, `memoryRetrievalLimit`, `memoryRetrievalBudgetMs`,
      `toolResultMaxTokens`, `selectiveTools`, `caching='auto'`, `unnecessaryRetentionDays`);
      no threshold hard-coded elsewhere
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.6_

  - [x] 3.2 Implement Token_Telemetry recorder
    - Create `server/routes/veegpt-token-telemetry.ts` recording per-category tokens
      (static/dynamic instr, memory, summary, recent history, tool defs, tool results, user input),
      totals, cached/cache-read/cache-write (when provider supplies), model/provider, request type,
      selected modules, exposed tools, and the `compactionOccurred/memoryRetrieved/cacheUsed/
      usedFallback` flags; attach via the existing metering/ledger `meta`, add no new datastore
    - Flag-agnostic (records for both legacy and optimized paths)
    - _Requirements: 16.1, 16.2, 16.3_

  - [x] 3.3 Write unit tests for Token_Telemetry privacy
    - Assert telemetry records metadata + token counts and never logs full prompts or full user
      content by default, respecting existing privacy practices
    - _Requirements: 16.4, 16.5_

  - [x] 3.4 Build the Baseline benchmark harness and request set
    - Create `tests/veegpt-baseline/` with a version-controlled request set containing ≥3 requests
      for each of the 15 categories (simple chat, follow-up, content creation, analytics, social
      listening, scheduling, automation, multi-tool, memory-dependent, long conversation, ambiguous,
      persona-dependent, tool failure, provider fallback, complex reasoning)
    - Implement a harness that runs each request ≥3× and records mean input/output tokens, latency
      (ms), tool-call accuracy %, answer-quality rubric (0–100), memory retention %, context
      retention %
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.5 Capture the Baseline_Benchmark with the flag OFF
    - Run the harness against the legacy path and persist the `Baseline_Benchmark` results as the
      version-controlled reference for all later comparisons
    - _Requirements: 2.1, 25.1, 25.2_

- [x] 4. Phase 3 — Context classification and module registry (content lifted VERBATIM)
  - [x] 4.1 Implement the Context_Module registry
    - Create `server/routes/veegpt-modules.ts` defining `ContextModule` (id, contextClass,
      trustLayer, always, appliesTo, render, intentionalRepeat) and the registry with content lifted
      **verbatim** from the existing builders per the design's Context_Class table (`core-behavior`,
      `safety-policy`, `reasoning-formatting`, `rich-output` + intentional-repeat tail,
      `ai-config-directives`, `memory-guidance`, `user-memory`, `workspace-context`,
      `conversation-summary`, `recent-conversation`, `current-request`, `turn-note`,
      `workspace-actions-guidance`, `content-ids`, `posting-context`, `account-scope`,
      `forced-tool`, `tier-capability`)
    - Assign exactly one Context_Class per item; ensure every audited item has a destination module
      (create a new module rather than force-fit); flag unclassifiable items for manual resolution
      and preserve current behavior; mark W1/W2/W11 as `intentionalRepeat`
    - _Requirements: 4.1, 4.2, 4.4, 4.5, 5.5, 13.3_

  - [x] 4.2 Implement selectModules()
    - Add `selectModules(intent, ctx)` in `veegpt-modules.ts`: always include `always` (static)
      modules; include every module whose `appliesTo` intersects `intent.intents`; on empty/ambiguous
      selection return the complete registry with static modules guaranteed present
    - _Requirements: 5.1, 5.3, 5.4, 5.6, 6.1_

  - [x] 4.3 Implement tier-gated persona module
    - Render the `persona` module by reusing `getAgentDirectivesForTier(id, tier)` from
      `veegpt-agents.ts` so tier gating and single-selection precedence produce the identical
      outcome as today; never compose a second persona's directives
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 4.4 Write property test — Property 1
    - **Property 1: Static modules are always present**
    - **Validates: Requirements 5.4, 6.6, 19.1**
    - fast-check, min 100 iterations, tagged `// Feature: veegpt-context-optimization, Property 1`

  - [x] 4.5 Write property test — Property 2
    - **Property 2: Intent-mapped modules are included**
    - **Validates: Requirements 5.3, 6.1**
    - fast-check, min 100 iterations

  - [x] 4.6 Write property test — Property 3
    - **Property 3: Module selection fails open to the complete set**
    - **Validates: Requirements 5.6, 6.6, 19.1**
    - fast-check, min 100 iterations

- [x] 5. Phase 4 — Intent classifier, ContextComposer, and flag branch
  - [x] 5.1 Implement the IntentClassifier
    - Create `server/routes/veegpt-intent.logic.ts` with `classifyIntent(...)`: reuse
      `detectTrivialMessage` first, then a deterministic LLM-free classifier over current + prior
      messages producing one or more `Capability` intents (multi/compound/follow-up/indirect),
      computed at most once per request, adding no extra model call; hybrid allowed but keyword
      matching is never the sole mechanism; on throw/empty return
      `{ intents: ALL, ambiguous: true, usedFallback: true }`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 5.2 Write unit tests for the IntentClassifier
    - Cover ambiguous, multi-intent, follow-up/reference, indirect tool need, compound tasks, and
      the error/empty fallback path
    - _Requirements: 6.2, 6.6_

  - [x] 5.3 Implement the ContextComposer
    - Create `server/routes/veegpt-context-composer.ts` with `compose(modules, tools, input)`:
      order modules static→dynamic→volatile by trust layer (system → developer → app-state →
      retrieved → tool-output → user), keep user content in the user layer only, emit either a
      concatenated prompt string (byte-compatible with `buildPrompt` ordering) or a role-separated
      message array (only for verified models), and record `Token_Telemetry`
    - _Requirements: 5.1, 5.2, 17.1, 17.2, 17.3, 18.1, 18.3_

  - [x] 5.4 Add the thin flag branch to the chat route
    - In `server/routes/veegpt-chat.routes.ts` add `if (contextOptEnabled()) composeWithComposer(...)
      else buildPrompt(...)`; keep the legacy builders intact (not deleted); wrap the optimized path
      so any unexpected error degrades to the legacy path for that request with a regression
      indicator emitted; exactly one path runs per request
    - _Requirements: 22.4, 22.5, 22.7, 3.6_

  - [x] 5.5 Write property test — Property 14 (flag-off byte-equivalence gate)
    - **Property 14: Flag-off composition is identical to the pre-refactor prompt**
    - **Validates: Requirements 3.1, 22.5, 22.7**
    - Assert the produced request is byte-for-byte equal to legacy `buildPrompt(...) + toolContext`
      and the composer is not invoked when the flag is off; fast-check, min 100 iterations

  - [x] 5.6 Write property test — Property 15
    - **Property 15: User content is never promoted into a trusted layer**
    - **Validates: Requirements 17.2, 17.4, 18.3**
    - Include injection-like strings ("ignore previous instructions"); fast-check, min 100 iterations

  - [x] 5.7 Write property test — Property 10
    - **Property 10: Persona composition matches the tier-resolved selection exactly**
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4**
    - fast-check, min 100 iterations

- [x] 6. Checkpoint — Flag-off byte-equivalence gate
  - The flag-off byte-equivalence property (Property 14) and the trust-layer property (Property 15)
    MUST pass before the optimized path is enabled anywhere. Ensure all tests pass, ask the user if
    questions arise.

- [x] 7. Phase 5 — Conversation compaction, Conversation_State, memory
  - [x] 7.1 Add Conversation_State fields to the conversation model
    - Add optional `contextState` fields (version, objective, currentTask, requirements, decisions,
      constraints, entities, selectedOptions, pendingActions, facts, toolDerivedState, labels,
      summarizedMessageCount, updatedAt) to `ChatConversation` in `server/models/Chat`; no new
      collection, no migration (lazy optional fields), no new index; legacy docs read without error
    - _Requirements: 8.4, 21.1, 21.2, 21.3, 21.4, 20.6_

  - [x] 7.2 Implement Conversation_State extraction/merge logic
    - Create `server/routes/veegpt-conversation-state.logic.ts`: persist only the allowed categories
      (Req 8.2); assign exactly one label to instruction-like entries or exclude and keep the raw
      message; treat state as DATA that never overrides safety/core instructions
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 17.4, 18.2_

  - [x] 7.3 Implement bounded conversation-history compaction
    - In the composer + config, bound history tokens to `historyTokenBudget` independent of turn
      count using recent-N window + rolling summary + Conversation_State; on overflow, compact the
      oldest into summary/state (recording brand/objective/audience/constraints/strategy/tool-derived
      /decisions/preferences/pending actions) BEFORE removing from the window; on summarization
      failure retain the current request + full recent window (including brand-new conversations) and
      never drop the current turn
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 19.3_

  - [x] 7.4 Implement selective, fail-open memory retrieval
    - Treat User_Memory / Conversation_Memory / short-term window / retrieved knowledge as four
      independently addressable scopes; retrieve only items relevant to the current request via a
      deterministic filter (topic via `detectTopic` + recency); preserve `mergeMemoryItems`,
      single-value-topic replacement, dedup, caps, `isMemoryFull`, acknowledgement/contradiction/
      update rules unchanged; on failure/timeout proceed with available memory and keep the current
      message; when relevance cannot be determined in budget, include ALL memory (fail open)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [x] 7.5 Write property test — Property 7
    - **Property 7: Conversation-history tokens are bounded independent of turn count**
    - **Validates: Requirements 7.1, 7.4**
    - fast-check, min 100 iterations

  - [x] 7.6 Write property test — Property 8
    - **Property 8: The current user message is always retained**
    - **Validates: Requirements 7.6, 9.5, 9.6, 19.3**
    - fast-check, min 100 iterations

  - [x] 7.7 Write property test — Property 9
    - **Property 9: Memory relevance fails open toward completeness**
    - **Validates: Requirements 9.7**
    - fast-check, min 100 iterations

  - [x] 7.8 Write property test — Property 16
    - **Property 16: Conversation_State is well-formed**
    - **Validates: Requirements 8.1, 8.3, 8.5, 8.6**
    - fast-check, min 100 iterations

- [x] 8. Phase 6 — Selective tool exposure and tool-result reduction
  - [x] 8.1 Implement selectTools()
    - Create `server/routes/veegpt-tool-selection.logic.ts` with `selectTools(...)`: apply
      `filterToolsByTier` FIRST, then expose exactly the union of tier-permitted tools mapped to the
      identified intents; never drop an intent-selected, tier-permitted tool to save tokens
      (no token-driven dropping regardless of budget)
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [x] 8.2 Wire selective tools, forced-tool, and fallback into the optimized branch
    - In `veegpt-chat.routes.ts` optimized branch, always expose an explicitly forced tool via the
      existing `buildForcedToolDirective` behavior; if selection fails or the model lacks selective
      exposure, fall back to the full tier-permitted set; omit unsupported features per model
    - _Requirements: 11.6, 11.7, 15.2_

  - [x] 8.3 Implement and wire reduceToolResult()
    - Create `server/routes/veegpt-tool-result.logic.ts` with `reduceToolResult(payload,
      requiredFields, maxTokens)` and call it inside the existing tool loop before a large payload
      re-enters the next request: reduce to required fields, paginate/summarize datasets, filter
      irrelevant records, drop duplicated metadata; always retain follow-up identifiers; never
      remove reasoning-required or execution-required info (retain even above max; treat both as
      equally essential)
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [x] 8.4 Write property test — Property 4
    - **Property 4: Exposed tools are bounded by tier and equal the intent-mapped union**
    - **Validates: Requirements 11.1, 11.3, 11.4, 11.5**
    - fast-check, min 100 iterations

  - [x] 8.5 Write property test — Property 5
    - **Property 5: A forced, tier-permitted tool is always exposed**
    - **Validates: Requirements 11.6**
    - fast-check, min 100 iterations

  - [x] 8.6 Write property test — Property 6
    - **Property 6: Tool selection fails open to the full tier set**
    - **Validates: Requirements 11.7, 19.6**
    - fast-check, min 100 iterations

  - [x] 8.7 Write property test — Property 11
    - **Property 11: Reduced tool results retain all required information**
    - **Validates: Requirements 12.2, 12.3, 12.4**
    - fast-check, min 100 iterations

- [x] 9. Phase 7 — Static-prefix ordering and no-op-safe caching
  - [x] 9.1 Implement static-prefix ordering and no-op-safe caching path
    - In the composer, keep static→dynamic→volatile ordering so the leading bytes form the largest
      achievable `Static_Prefix`, byte-identical across consecutive turns of a conversation; volatile
      per-turn content (turn note, current message) stays last; `caching:'auto'` does ordering only
      and relies on provider automatic caching; enable no provider-specific mechanism the SDK cannot
      express; if caching is unavailable, compose/send unchanged (no-op safe)
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 19.5_

  - [x] 9.2 Write property test — Property 13
    - **Property 13: The static prefix is maximal and byte-identical across consecutive turns**
    - **Validates: Requirements 14.1, 14.2**
    - fast-check, min 100 iterations

- [x] 10. Phase 8 — Golden/equivalence Regression_Suite
  - [x] 10.1 Build the golden/equivalence harness
    - Under `tests/veegpt-context/`, assert the optimized (flag-on) path is behavior-equivalent to
      the legacy (flag-off) path for identical deterministic inputs (mocked provider): same
      tool/module selection, memory merges, persona outcome, streaming event contract, and API/ledger
      shape; assert on the composed request + deterministic behaviors, not stochastic model prose;
      on any failing case revert to baseline behavior for the affected case and surface a regression
      indicator
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 20.1, 20.2, 20.3, 20.4, 20.5_

  - [x] 10.2 Write Req 23 category coverage tests
    - Conversation (follow-ups, references, long, summarized); memory (retrieval, irrelevant,
      updates, conflicts, stale); tools (correct selection, no unnecessary calls, multiple, failures,
      invalid params, permissions); personas (correct, switching, conflict); safety intact; output
      (format, structured, streaming, citations); every provider/model + fallback
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5, 23.6, 23.7_

  - [x] 10.3 Write provider-compatibility integration tests
    - For every registered model in `ai-model-routing.REGISTRY`, compose-and-accept with a mocked
      gateway; verify reasoning/temperature-locked/non-tool-capable handling and fallback are
      preserved; unsupported features are omitted per model
    - _Requirements: 15.1, 15.2, 15.3, 15.4_

  - [x] 10.4 Write Token_Ledger correctness integration test
    - Reuse the existing ledger test path to confirm charging is still computed from actual provider
      usage and that no billing/auth/integration logic changed
    - _Requirements: 24.1, 24.3_

- [x] 11. Phase 9 — De-duplication and measurement-driven tuning
  - [x] 11.1 Implement dedupeContext()
    - In the composer, detect information duplicated across system/developer instructions, memory,
      summary, recent messages, tool descriptions, tool results, workspace context, user profile,
      and retrieved documents; include each unit once unless documented reason requires repetition;
      preserve `intentionalRepeat` units (W1/W2/W11) until regression proves removal is
      output-equivalent
    - _Requirements: 13.1, 13.2, 13.3_

  - [x] 11.2 Write property test — Property 12
    - **Property 12: Duplicate context appears once**
    - **Validates: Requirements 13.2, 13.3**
    - fast-check, min 100 iterations

  - [x] 11.3 Apply minimum-sufficient-context threshold tuning
    - Drive threshold/de-dup reductions (including retiring `unnecessary` items) ONLY from
      measurements: accept a reduction only if the Regression_Suite still passes 100%; scope
      reasoning instructions to tasks that need them and never remove them to save tokens; remove
      `unnecessary` items only after regression confirms equivalence or the retention timeout elapses
    - _Requirements: 4.3, 4.6, 9.x tuning, 26.1, 26.2, 26.3, 26.4_

  - [x] 11.4 Run the After_Benchmark and compare against baseline
    - Re-run the identical benchmark request set with the flag ON (same run count/metrics); classify
      success only when mean input tokens drop ≥10% AND no behavioral metric regresses and latency is
      not worse by >10%; otherwise classify failed and retain the baseline as reference
    - _Requirements: 2.4, 2.5, 2.6_

- [x] 12. Phase 10 — Production hardening
  - [x] 12.1 Wire per-component graceful degradation and regression indicators
    - Ensure each failure point degrades independently to current behavior per the design's error
      table (flag off, intent throw, module unresolved, memory fail/timeout, summarization fail,
      token-estimation fail, tool selection fail, caching unavailable, tool-result risk, state-write
      fail, unsupported model feature); record every fallback in telemetry (`usedFallback`) and emit
      a regression indicator when the optimized path degrades to legacy
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7, 3.6_

  - [x] 12.2 Add developer-retrievable telemetry surface
    - Make selected modules, exposed tools, compaction/memory/cache flags, and selected model
      retrievable by a developer without logging full prompts/user content
    - _Requirements: 16.3, 16.4_

  - [x] 12.3 Write the rollback drill test
    - Verify toggling `Optimization_Flag` cleanly restores the pre-refactor behavior with exactly one
      path active per request (no simultaneous execution)
    - _Requirements: 22.4, 22.5, 22.7_

- [x] 13. Checkpoint — Release gate
  - The optimized path is releasable ONLY when the Regression_Suite passes 100% (zero failing cases)
    against the Baseline_Benchmark AND the After_Benchmark shows ≥10% mean input-token reduction with
    no behavioral/latency regression. Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 3.1, 23.8, 2.5, 25.3_

- [x] 14. Final technical report
  - [x] 14.1 Produce the final technical report
    - Create `.kiro/specs/veegpt-context-optimization/final-report.md` describing the existing
      architecture, major token-waste sources, the new context architecture, what moved into modules,
      what became dynamic, and the history/memory/tool-selection/caching strategies; include
      average/median/worst-case input tokens before and after with a savings breakdown; include tests
      added, regression results, known limitations, and remaining opportunities; demonstrate success
      via token measurements + behavioral regression results (not code compilation)
    - _Requirements: 27.1, 27.2, 27.3, 27.4_

## Notes

- Tasks marked with `*` are optional test sub-tasks (unit, property-based, integration) and can be
  skipped for a faster MVP; core implementation tasks are never optional.
- Property-based tests use **fast-check** with a minimum of **100 iterations**, each tagged
  `// Feature: veegpt-context-optimization, Property N: <text>` and mapped 1:1 to a design property.
- The `Optimization_Flag` defaults **off**; the legacy `buildPrompt` path is never deleted and is the
  fallback for every optimization failure.
- Behavior-changing phases (4–9) run the Regression_Suite before proceeding (Req 25.3); the plan
  never skips to threshold optimization (Req 25.2).
- Each task references specific granular requirements for traceability; correctness always wins over
  token savings.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "3.1", "3.2", "5.1", "7.1"] },
    { "id": 1, "tasks": ["1.2", "3.3", "3.4", "4.1"] },
    { "id": 2, "tasks": ["3.5", "4.2", "4.3", "5.2", "7.2"] },
    { "id": 3, "tasks": ["4.4", "4.5", "4.6", "5.3"] },
    { "id": 4, "tasks": ["5.4", "5.6", "5.7", "7.3"] },
    { "id": 5, "tasks": ["5.5", "7.4", "8.1"] },
    { "id": 6, "tasks": ["8.2", "7.5", "7.6", "7.7", "7.8"] },
    { "id": 7, "tasks": ["8.3", "8.4", "8.5", "8.6"] },
    { "id": 8, "tasks": ["8.7", "9.1"] },
    { "id": 9, "tasks": ["9.2", "11.1"] },
    { "id": 10, "tasks": ["11.2", "11.3"] },
    { "id": 11, "tasks": ["11.4", "10.1"] },
    { "id": 12, "tasks": ["10.2", "10.3", "10.4"] },
    { "id": 13, "tasks": ["12.1"] },
    { "id": 14, "tasks": ["12.2", "12.3"] },
    { "id": 15, "tasks": ["14.1"] }
  ]
}
```
