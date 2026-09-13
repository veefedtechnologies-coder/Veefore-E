# VeeGPT Context & Prompt Architecture Optimization — Final Technical Report

_Task 14.1 — Phase 10 deliverable. Requirements: 27.1, 27.2, 27.3, 27.4._

_Measurement source of truth: `tests/veegpt-baseline/baseline-benchmark.json` (flag OFF) and
`tests/veegpt-baseline/after-benchmark.json` (flag ON), captured 2026-08-13. Success in this report
is demonstrated by **token measurements and behavioral regression results**, not by code
compilation (Req 27.4)._

---

## 1. Executive summary

The refactor delivered a **zero-regression, flag-guarded** rework of how VeeGPT assembles context
and prompts for the model. Against a version-controlled 45-request benchmark (15 categories × 3
requests, each run 3×):

| Headline metric | Baseline (flag OFF) | After (flag ON) | Change |
|---|---:|---:|---:|
| **Mean input tokens** | 653.40 | 328.58 | **−49.71%** |
| Median input tokens | 644 | 271 | −57.92% |
| Worst-case (max) input tokens | 738 | 657 | −10.98% |
| Latency (ms, mean) | 533.59 | 533.59 | +0.00% |
| Tool-call accuracy | 100% | 100% | no regression |
| Answer-quality rubric | 100 | 100 | no regression |
| Memory retention | 100% | 100% | no regression |
| Context retention | 100% | 100% | no regression |

The After_Benchmark is **classified SUCCESS**: mean input tokens dropped ≥10% (−49.71%), latency
stayed within the +10% limit (+0%), and **no behavioral metric regressed** (0 behavioral
regressions recorded). The legacy `buildPrompt(...) + toolContext` path is never deleted and remains
the fallback for every optimization failure; `Optimization_Flag` defaults **off**.

---

## 2. The existing VeeGPT architecture (before)

VeeGPT assembled every request through a single monolithic prompt builder plus appended tool
context. Mapped verbatim in `audit-inventory.md`:

- **Master prompt assembler** — `server/routes/veegpt-chat.routes.ts` → `buildPrompt()`. Concatenates
  `agentBlock + systemBlock`, `knowledgeBlock`, `memoryBlock`, a `--- Conversation ---` transcript,
  a per-turn `noteBlock`, an `outputContract`, and a trailing `VeeGPT:` into **one prompt string**.
- **Context builders** — `buildContentContext()` (up to ~30 scheduled/draft posts with opaque ids),
  `buildToolContext()` (local time, connected accounts, media availability), `buildAccountScopeHint()`
  (analytics-access prose), `buildForcedToolDirective()` (forced-tool directive), and
  `buildTierCapabilityContext()` (tier restriction notes).
- **Conversation history** — `veegpt-memory.logic.ts` `planLongTermWindow()` (keep last
  `LONG_TERM_VERBATIM=20`, summarize overflow in `SUMMARY_BATCH=10` batches), `selectShallowWindow()`
  (`SHORT_TERM_VERBATIM=8`), and `renderTranscript()`.
- **Memory** — `Conversation_Memory` (rolling `memorySummary` on `ChatConversation`) and durable
  cross-conversation `User_Memory` (`veegpt-user-memory.logic.ts`: `mergeMemoryItems`, `detectTopic`,
  single-value-topic replacement, dedup, caps, `isMemoryFull`).
- **Personas** — `veegpt-agents.ts` (`VEEGPT_AGENTS`, tier-gated `getAgentDirectivesForTier`).
- **Triage / intent** — `veegpt-triage.logic.ts` `detectTrivialMessage()` (deterministic, LLM-free).
- **Tools** — `veegpt-tools.ts`, exposed as the **full tier-permitted set on every request**.
- **Model routing / gateway** — `ai-model-routing.ts`, `AIServiceManager.ts`, `LiteLLMGateway.ts`.
- **Streaming / ledger** — `useChatStream.ts` event contract; `veegpt-ledger.ts` usage-based charging.

### Major sources of token waste (before)

1. **Every static instruction sent on every turn.** Core identity, formatting rules, rich-output
   spec, answering-style, workspace-actions guidance, reasoning instructions, and all AI-config
   directives were re-serialized verbatim for even a one-word "thanks."
2. **All tools exposed every request.** The full tier set (up to **18 tools** in the benchmark)
   with complete JSON schemas rode along regardless of intent — the single largest per-request cost.
3. **Duplicated context.** The same information appeared across system instructions, memory,
   summary, recent messages, workspace context, and tool descriptions.
4. **Unbounded/loosely-bounded history growth** as conversations lengthened.
5. **Unreduced tool results** re-entering the next request with full, largely irrelevant payloads.
6. **No static-prefix stability**, so provider prompt-caching could not engage.

---

## 3. The new context architecture (after)

The optimized path is a thin, flag-guarded branch in `veegpt-chat.routes.ts`
(`if (contextOptEnabled()) composeWithComposer(...) else buildPrompt(...)`) — exactly one path runs
per request, and any unexpected error in the optimized path degrades to legacy for that request with
a regression indicator emitted.

New/changed files delivered by the refactor:

| File | Role |
|---|---|
| `server/config/veegpt-context.config.ts` | Centralized `VeegptContextConfig`, `contextOptEnabled()`, `getContextConfig()`; all thresholds env-overridable; safe defaults with `enabled=false`. |
| `server/routes/veegpt-modules.ts` | `ContextModule` registry + `selectModules()`; content lifted **verbatim** from the legacy builders, one Context_Class per item. |
| `server/routes/veegpt-intent.logic.ts` | `classifyIntent()` — deterministic, LLM-free, no extra model call; fails open to ALL intents when ambiguous/error. |
| `server/routes/veegpt-context-composer.ts` | `compose()` — orders modules by trust layer, dedupes, keeps static prefix stable, records telemetry. |
| `server/routes/veegpt-conversation-state.logic.ts` | Conversation_State extraction/merge; treats state as DATA that never overrides safety/core instructions. |
| `server/routes/veegpt-history-compaction.logic.ts` | Bounded history compaction (recent-N + rolling summary + state) independent of turn count. |
| `server/routes/veegpt-memory-retrieval.logic.ts` | Selective, fail-open memory retrieval across four independent scopes. |
| `server/routes/veegpt-tool-selection.logic.ts` | `selectTools()` — tier filter first, then intent-mapped union; never token-driven dropping. |
| `server/routes/veegpt-tool-result.logic.ts` | `reduceToolResult()` — reduce to required fields, always retain follow-up ids and reasoning/execution-required info. |
| `server/routes/veegpt-token-telemetry.ts` | `Token_Telemetry` recorder — per-category tokens + flags, no full prompts/user content logged. |
| `server/routes/veegpt-prompt-assembly.ts` | Prompt assembly helpers for the composed output. |

### What moved into modules (static)

Instruction content that previously lived inline in `buildPrompt` was lifted **verbatim** into the
`Context_Module` registry, each assigned exactly one Context_Class: `core-behavior`, `safety-policy`,
`reasoning-formatting`, `rich-output` (+ its intentional-repeat tail), `ai-config-directives`,
`memory-guidance`, `user-memory`, `workspace-context`, `conversation-summary`, `recent-conversation`,
`current-request`, `turn-note`, `workspace-actions-guidance`, `content-ids`, `posting-context`,
`account-scope`, `forced-tool`, and `tier-capability`. Static (`always`) modules are guaranteed
present on every request; the persona module reuses `getAgentDirectivesForTier()` so tier gating and
single-selection precedence match today exactly.

### What became dynamic

- **Module inclusion** — `selectModules(intent, ctx)` always includes static modules, then includes
  any module whose `appliesTo` intersects the classified intents. Empty/ambiguous selection **fails
  open to the complete registry** (static modules guaranteed).
- **Tool exposure** — `selectTools()` applies `filterToolsByTier` first, then exposes exactly the
  intent-mapped union of tier-permitted tools. This is the dominant driver of the savings.
- **History and memory** — compacted/retrieved per request rather than dumped wholesale.
- **Tool results** — reduced to required fields before re-entering the next request.

### Trust-layer ordering & caching

`compose()` orders modules **static → dynamic → volatile** by trust layer
(system → developer → app-state → retrieved → tool-output → user), keeping user content in the user
layer only (injection strings never promoted — Property 15). This ordering makes the leading bytes a
maximal `Static_Prefix` that is **byte-identical across consecutive turns** (Property 13), so
provider automatic caching (`caching:'auto'`) can engage; if caching is unavailable the request is
composed/sent unchanged (no-op safe).

---

## 4. Strategy details

**Conversation-history strategy.** History tokens are bounded by `historyTokenBudget` (default
24000, env-overridable) **independent of turn count** — recent-N window + rolling summary +
Conversation_State. On overflow, the oldest turns are compacted into summary/state
(brand/objective/audience/constraints/strategy/tool-derived/decisions/preferences/pending actions)
**before** removal. On summarization failure the current request + full recent window are retained;
the current turn is never dropped (Properties 7, 8).

**Memory strategy.** User_Memory, Conversation_Memory, the short-term window, and retrieved knowledge
are four independently addressable scopes. A deterministic filter (`detectTopic` + recency) retrieves
only items relevant to the current request, preserving `mergeMemoryItems`, single-value-topic
replacement, dedup, caps, and acknowledgement/contradiction/update rules unchanged. When relevance
cannot be determined within `memoryRetrievalBudgetMs` (default 150ms), **ALL memory is included —
fail open toward completeness** (Property 9).

**Tool-selection strategy.** `filterToolsByTier` runs first; the exposed set is the union of
tier-permitted tools mapped to the identified intents. An explicitly forced tool is always exposed
(Property 5); if selection fails or the model lacks selective exposure, the path falls back to the
full tier set (Property 6). **No tool is ever dropped to save tokens** (Property 4).

**Caching strategy.** Ordering-only, provider-automatic. The composer maximizes and stabilizes the
static prefix; it enables no provider-specific mechanism the SDK cannot express and is no-op safe
when caching is unavailable (Property 13).

---

## 5. Before/after token measurements & savings breakdown (Req 27.2)

All figures are mean input tokens per request across 3 runs, from the version-controlled benchmark
artifacts.

### Aggregate

| Statistic (input tokens) | Before | After | Reduction |
|---|---:|---:|---:|
| **Average (mean of 45 requests)** | 653.40 | 328.58 | **−49.71%** |
| **Median** | 644 | 271 | −57.92% |
| **Worst-case (highest request)** | 738 | 657 | −10.98% |

### Per-request reduction distribution

- **Best-case reduction:** −70.82% (`ambiguous-1`, 634 → 185, 1 tool exposed).
- **Median reduction:** −58.56%.
- **Worst-case reduction:** −3.09% (`simple-chat-3`, 647 → 627). The low-reduction cases are exactly
  the **ambiguous fallback** requests (6 of 45: `simple-chat-1/3`, `follow-up-3`, `analytics-1`,
  `ambiguous-2`, `provider-fallback-2`) where intent is ambiguous, so the system **fails open and
  exposes all 18 tools** — the correctness-over-tokens guarantee in action. Even these still save
  ~3% from de-duplication/ordering.

### Where the savings came from

1. **Selective tool exposure (dominant).** When intent is clear, exposure drops from 18 tools to the
   intent-mapped union (often 1–3), which produces the −50% to −71% reductions. Compare:
   - `scheduling-1`: 638 → 189 (−70.38%), 1 tool.
   - `follow-up-1`: 669 → 251 (−62.48%), 2 tools.
   - vs. ambiguous fallback `ambiguous-2`: 630 → 610 (−3.17%), 18 tools.
2. **Dynamic module selection.** Only intent-relevant modules render; static modules always remain.
3. **De-duplication** across instructions/memory/summary/messages/tool descriptions (`dedupeContext`),
   preserving `intentionalRepeat` units W1/W2/W11.
4. **Bounded history compaction** (visible in `long-conversation-*`: 738 → 349, 733 → 315, 732 → 364).
5. **Static-prefix ordering** enabling provider caching (opportunistic, not double-counted here).

Latency was unaffected (533.59ms → 533.59ms, +0%) because composition is deterministic and adds no
model call.

---

## 6. Tests added (Req 27.3)

### Property-based tests (fast-check, ≥100 iterations each) — 16 properties

| # | Property | Test file | Validates |
|---|---|---|---|
| 1 | Static modules always present | `tests/veegpt-context/module-selection.property.test.ts` | 5.4, 6.6, 19.1 |
| 2 | Intent-mapped modules included | `tests/veegpt-context/select-modules-property2.test.ts` | 5.3, 6.1 |
| 3 | Module selection fails open to complete set | `tests/veegpt-context/module-selection-property3.test.ts` | 5.6, 6.6, 19.1 |
| 4 | Exposed tools bounded by tier = intent-mapped union | `tests/veegpt-context/tool-selection-tier-bound-property4.test.ts` | 11.1, 11.3, 11.4, 11.5 |
| 5 | Forced tier-permitted tool always exposed | `tests/veegpt-context/forced-tool-exposed-property5.test.ts` | 11.6 |
| 6 | Tool selection fails open to full tier set | `tests/veegpt-context/tool-selection-fail-open-property6.test.ts` | 11.7, 19.6 |
| 7 | History tokens bounded independent of turn count | `tests/veegpt-context/history-token-bound-property7.test.ts` | 7.1, 7.4 |
| 8 | Current user message always retained | `tests/veegpt-context/current-message-retained-property8.test.ts` | 7.6, 9.5, 9.6, 19.3 |
| 9 | Memory relevance fails open toward completeness | `tests/veegpt-context/memory-fail-open-property9.test.ts` | 9.7 |
| 10 | Persona composition matches tier-resolved selection | `tests/veegpt-context/persona-composition-property10.test.ts` | 10.1–10.4 |
| 11 | Reduced tool results retain all required info | `tests/veegpt-context/tool-result-required-retained-property11.test.ts` | 12.2, 12.3, 12.4 |
| 12 | Duplicate context appears once | `tests/veegpt-context/duplicate-context-once-property12.test.ts` | 13.2, 13.3 |
| 13 | Static prefix maximal & byte-identical across turns | `tests/veegpt-context/static-prefix-stable-property13.test.ts` | 14.1, 14.2 |
| 14 | Flag-off composition byte-identical to legacy prompt | `tests/veegpt-context/flag-off-byte-equivalence-property14.test.ts` | 3.1, 22.5, 22.7 |
| 15 | User content never promoted to a trusted layer | `tests/veegpt-context/user-content-trust-property15.test.ts` | 17.2, 17.4, 18.3 |
| 16 | Conversation_State is well-formed | `tests/veegpt-context/conversation-state-wellformed-property16.test.ts` | 8.1, 8.3, 8.5, 8.6 |

### Unit / integration / harness tests

- `audit-completeness.test.ts` — audit-inventory completeness gate (Req 1.3, 1.4).
- `context-composer.test.ts` — composer ordering, trust layers, telemetry.
- `golden-equivalence.test.ts` + `golden-equivalence.harness.ts` — flag-on vs flag-off behavioral
  equivalence on deterministic inputs (Req 3, 20).
- `req23-category-coverage.test.ts` — Req 23 conversation/memory/tools/personas/safety/output coverage.
- `provider-compatibility.test.ts` — compose-and-accept for every `ai-model-routing.REGISTRY` model.
- `token-ledger-correctness.integration.test.ts` — charging still from actual provider usage (Req 24).
- `per-component-degradation.test.ts` — independent graceful degradation per failure point (Req 19).
- `developer-telemetry-surface.test.ts` — telemetry retrievable without logging prompts/user content.
- `rollback-drill.test.ts` — flag toggle cleanly restores legacy, one path per request.
- Baseline harness: `tests/veegpt-baseline/` (`request-set.ts`, `harness.ts`, `scoring.ts`,
  `mock-provider.ts`, `capture-baseline.ts`, `after-benchmark.ts`, `after-provider.ts`,
  `baseline-benchmark.test.ts`, `after-benchmark.test.ts`, `harness.test.ts`).

---

## 7. Regression results (Req 27.3, 27.4)

- **Regression_Suite: 100% pass (zero failing cases)** — 294 context + baseline tests across
  `tests/veegpt-context/` and `tests/veegpt-baseline/`.
- **After_Benchmark classification: SUCCESS** (`after-benchmark.json`):
  - Input-token reduction ≥ 10%: **PASS** (−49.71%).
  - Latency not worse by > 10%: **PASS** (+0%).
  - No behavioral regression: **PASS** — tool-call accuracy, answer quality, memory retention, and
    context retention all held at 100 across all 45 requests. **0 behavioral regressions recorded.**

Success is demonstrated here by these token and behavioral measurements, not by code compilation
(Req 27.4).

---

## 8. Known limitations

1. **Representative-token benchmark model.** The benchmark uses a deterministic mock provider
   (`mock-provider.ts`) with a representative token-estimation model rather than live provider
   tokenizers/billing. Directional savings and behavioral equivalence are sound; absolute token
   counts should be re-confirmed against live provider usage before headline external claims.
2. **Message-array verified-model allowlist currently empty.** The composer can emit a role-separated
   message array only for verified models, but that allowlist is empty today, so all traffic uses the
   byte-compatible concatenated-string path. Extra structured-message savings remain unrealized until
   models are verified and added.
3. **Threshold tuning deferred pending live measurement.** Per `threshold-tuning.md`, **no** threshold
   was lowered, no `intentionalRepeat` unit dropped, and no `unnecessary` item retired — there are no
   `unnecessary`-classified modules today, and reductions are permitted only when the Regression_Suite
   still passes 100% against live measurements. Current defaults (`recentWindowLongTerm=20`,
   `recentWindowShortTerm=8`, `summaryBatch=10`, `historyTokenBudget=24000`, `memoryRetrievalLimit=50`,
   `memoryRetrievalBudgetMs=150`, `toolResultMaxTokens=2000`, `unnecessaryRetentionDays=30`) are
   retained as-is.
4. **Ambiguous-intent fallback cost.** Ambiguous requests correctly fail open to all 18 tools and see
   only ~3% reduction. This is a deliberate correctness-over-tokens tradeoff, not a defect.

---

## 9. Remaining optimization opportunities

1. **Sharpen intent classification** for the ambiguous-fallback cases (6/45) to safely narrow tool
   exposure without risking correctness — the largest remaining token lever.
2. **Enable the verified-model message-array path** to capture structured-message savings once models
   are validated and added to the allowlist.
3. **Realize provider caching credit.** Static-prefix stability is in place; measure and report actual
   cache-read/cache-write savings against a live provider.
4. **Apply measurement-driven threshold tuning** per `threshold-tuning.md` once live After_Benchmark
   data exists — one candidate at a time, accepted only if the Regression_Suite stays 100%.
5. **Deeper tool-result reduction** (pagination/summarization heuristics) for multi-tool and
   long-conversation flows, which retain the highest post-optimization token counts.
6. **Re-baseline on live provider tokenizers** to convert representative figures into billed-token
   figures.

---

## 10. Traceability

- Requirements: **27.1** (§2–§4 architecture, waste, module/dynamic/history/memory/tool/caching
  strategies), **27.2** (§5 average/median/worst-case before/after + savings breakdown), **27.3**
  (§6 tests, §7 regression results, §8 limitations, §9 opportunities), **27.4** (§1, §5, §7 success
  shown via token + behavioral measurements, not compilation).
- Artifacts: `tests/veegpt-baseline/baseline-benchmark.json`, `tests/veegpt-baseline/after-benchmark.json`,
  `tests/veegpt-baseline/after-benchmark.md`, `audit-inventory.md`, `threshold-tuning.md`.
