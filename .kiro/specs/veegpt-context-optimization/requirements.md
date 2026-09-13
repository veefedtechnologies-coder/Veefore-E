# Requirements Document

## Introduction

This feature is a **zero-regression refactor** of the architecture that assembles and sends
context and prompts to the VeeGPT model. Today, VeeGPT builds one large prompt on every turn
(see `buildPrompt()` in `server/routes/veegpt-chat.routes.ts`) that concatenates a large static
behavior block, persona/agent directives, workspace + user memory, a rolling conversation
summary, the verbatim transcript, per-turn notes, and a repeated output contract — plus separate
tool-context builders (posting context, account scope, content/id lookup, tier-capability notes).
The objective is to change **how context is assembled and delivered** so that VeeGPT receives the
same necessary intelligence at the right time, instead of receiving everything on every turn, in
order to **substantially reduce input-token consumption and repeated context**.

This is **NOT prompt shortening**. The existing prompt content and VeeGPT behavior are the source
of truth. Every optimization requirement in this document is paired with an explicit preservation
requirement. The overriding rule is: **when saving tokens conflicts with preserving correctness,
correctness wins.** No VeeGPT capability — tool-calling accuracy, memory behavior, reasoning
quality, personas, safety rules, formatting/rich-output blocks, streaming, model routing/fallback,
credit/token accounting, API contracts, or UI behavior — may regress.

The work is sequenced in phases (audit → instrument/baseline → classify → dynamic composition →
conversation compaction → tool filtering → caching → regression tests → optimization → hardening),
must be observable and measurable, must degrade gracefully, must remain backward compatible with
existing conversations/memory/tools/APIs/frontend, and must be safely reversible via a feature flag.

## Glossary

- **VeeGPT**: The existing AI assistant for social-media creators inside the Veefore platform, whose chat, streaming, tool-calling, memory, personas, and model routing behavior is defined by the current implementation and is the authoritative source of truth for this refactor.
- **Context_System**: The subsystem being introduced/refactored that assembles the model request (system/developer instructions, memory, conversation history, tool definitions, tool results, and user input) and delivers it to the model provider. It encompasses the refactored prompt/context builders.
- **Prompt_Builder**: The existing prompt-assembly logic (currently `buildPrompt()` and the associated `buildToolContext`, `buildContentContext`, `buildAccountScopeHint`, `buildForcedToolDirective`, `buildTierCapabilityContext` in `server/routes/veegpt-chat.routes.ts`) responsible for producing the final text/messages sent to the model.
- **Context_Module**: An independently-composable unit of context (for example: core behavior, safety/policy, reasoning behavior, persona, intent-specific instructions, tool-specific instructions, user memory, workspace/brand context, conversation summary, recent conversation, tool results, current request).
- **Context_Class**: A classification assigned to every meaningful piece of existing context: `static`, `task-specific`, `tool-specific`, `user-specific`, `conversation-specific`, `turn-specific`, `historical`, or `unnecessary`.
- **Intent_Router**: The deterministic routing/triage logic (currently `server/routes/veegpt-triage.logic.ts`) that classifies a request and drives selection of modules, tools, and context, without an unjustified additional model call.
- **Conversation_Memory**: The per-conversation memory layer (currently `server/routes/veegpt-memory.logic.ts`) implementing the recent verbatim window and rolling summary.
- **Conversation_State**: A structured representation of durable conversational information (objective, requirements, decisions, constraints, entities, selected options, pending actions, important facts, tool-derived state) used to preserve information beyond the recent window.
- **User_Memory**: The cross-conversation memory layer (currently `server/routes/veegpt-user-memory.logic.ts` and the `UserMemory` model) storing durable facts about the user under storage caps.
- **Tool_Registry**: The VeeGPT tool definitions, schemas, tiering, and grouping (currently `server/routes/veegpt-tools.ts`, `server/config/veegpt-tiers.ts`) exposed to the model.
- **Model_Router**: The model routing and fallback logic (currently `server/services/ai-model-routing.ts`, `server/services/AIServiceManager.ts`, `server/services/litellm/LiteLLMGateway.ts`) that selects and invokes a provider/model.
- **Token_Ledger**: The credit/token accounting subsystem (currently `server/services/veegpt-ledger.ts` and related metering) that records actual provider token usage and reconciles charges.
- **Token_Telemetry**: The internal observability that records, per request, the token consumption of each context category, selected modules, selected tools, model/provider, and cache metrics.
- **Baseline_Benchmark**: A recorded set of representative VeeGPT requests and their measured metrics (input tokens, output tokens, latency, tool-call accuracy, answer quality, memory retention, context retention) captured BEFORE any behavior change.
- **Regression_Suite**: The mandatory automated test suite that verifies preservation of VeeGPT behavior across conversation, memory, tools, personas, safety, output/streaming, and providers/fallback.
- **Optimization_Flag**: The centralized feature flag/configuration that enables or disables the optimized context path and allows safe rollback to the current behavior.
- **Developer**: An engineer implementing, testing, operating, or auditing the Context_System.
- **Static_Prefix**: The longest stable, byte-identical leading portion of a model request that can be reused across turns for provider prompt-caching.

## Requirements

### Requirement 1: Mandatory Pre-Change Implementation Audit

**User Story:** As a developer, I want a complete audit of the existing VeeGPT implementation before any change, so that the current behavior is treated as the source of truth and no capability is lost through assumption.

#### Acceptance Criteria

1. WHERE the refactor is performed, THE Context_System SHALL require a written audit artifact to exist and be marked complete before any refactor task begins, and the audit SHALL cover each of the following areas: prompt builders, context builders, conversation history handling, Conversation_Memory, User_Memory, persona/agent system, Intent_Router, reasoning instructions, tool definitions and execution, tool results, workspace/brand/account context, Model_Router, streaming, Token_Ledger, error/retry handling, caching, provider APIs, existing tests, configuration/environment variables, database models for conversations and memory, and frontend assumptions about VeeGPT responses.
2. THE audit SHALL produce an inventory in which every existing instruction and context source in the areas listed in criterion 1 is mapped to at least one identifiable location in the current codebase, expressed as a file path and symbol or line reference.
3. IF any area listed in criterion 1 has no corresponding entry in the audit inventory, THEN THE Context_System SHALL treat the audit as incomplete and SHALL block all refactor tasks until the missing entry is added or the area is explicitly recorded as not present.
4. THE Context_System SHALL NOT apply any change to prompt or context assembly before the audit inventory is marked complete per criteria 2 and 3.
5. IF an existing behavior cannot be mapped to a codebase location or cannot be described in the inventory, THEN THE Context_System SHALL retain that behavior unchanged and SHALL record it as unresolved in the inventory until a codebase location and description are added.

### Requirement 2: Baseline Instrumentation and Benchmarking Before Behavior Change

**User Story:** As a developer, I want token consumption and behavior measured before any optimization, so that improvements and regressions can be proven with data rather than assumption.

#### Acceptance Criteria

1. THE Context_System SHALL capture and persist a Baseline_Benchmark from a fixed, version-controlled request set BEFORE any behavior-changing optimization is enabled.
2. THE Baseline_Benchmark request set SHALL include at least 3 distinct requests for each of the following categories: simple chat, follow-up questions, content creation, analytics, social listening, scheduling, automation, multi-tool requests, memory-dependent requests, long conversations, ambiguous requests, persona-dependent requests, tool failures, provider fallback, and complex reasoning tasks.
3. FOR each Baseline_Benchmark request, THE Context_System SHALL execute the request at least 3 times and record, as the mean across runs, the following metrics: input tokens, output tokens, latency in milliseconds, tool-call accuracy as a percentage of expected tool calls made, final-answer quality as a rubric score from 0 to 100, memory retention as a percentage of expected memory items correctly recalled, and context retention as a percentage of expected context items correctly retained.
4. WHEN an optimization is applied, THE Context_System SHALL re-run the identical Baseline_Benchmark request set using the same run count and record the same metrics as an After_Benchmark for comparison.
5. THE Context_System SHALL classify the optimization as successful ONLY WHEN the mean input-token consumption across the request set decreases by at least 10 percent relative to the Baseline_Benchmark AND no behavioral metric regresses, where regression is defined as tool-call accuracy, final-answer quality, memory retention, or context retention falling below its Baseline_Benchmark value, or latency exceeding its Baseline_Benchmark value by more than 10 percent.
6. IF any behavioral metric regresses as defined in criterion 5 OR the input-token reduction target is not met, THEN THE Context_System SHALL classify the optimization as failed and retain the Baseline_Benchmark as the reference for the next attempt.

### Requirement 3: Zero-Regression Behavioral Preservation Invariant

**User Story:** As a product owner, I want an explicit guarantee that VeeGPT behavior is fully preserved, so that token savings never come at the cost of correctness.

#### Acceptance Criteria

1. WHERE the Optimization_Flag is enabled, WHEN VeeGPT processes a request, THE Context_System SHALL produce behavior — across tool-calling, memory, persona and response-style, reasoning, safety and policy, formatting and rich-output-block, streaming, Model_Router routing and fallback, Token_Ledger accounting, API contracts, and UI behavior — that is equivalent to the Baseline_Benchmark for identical inputs, where equivalence is verified by the Regression_Suite achieving a 100% pass rate (zero failing cases).
2. IF an optimization would reduce input tokens but cause any behavior in the preserved set defined in criterion 1 to differ from the Baseline_Benchmark as detected by the Regression_Suite, THEN THE Context_System SHALL retain the Baseline_Benchmark behavior and forgo that token reduction.
3. THE Context_System SHALL NOT remove, summarize away, or omit any existing instruction whose omission causes at least one Regression_Suite case to change its pass/fail result relative to the Baseline_Benchmark.
4. THE Context_System SHALL deliver the semantic content of every preserved instruction, whether that instruction is sent every turn or loaded conditionally, such that the Regression_Suite output-equivalence checks for that instruction pass against the Baseline_Benchmark.
5. THE Regression_Suite SHALL include at least one test case for each preserved behavior category listed in criterion 1, so that equivalence to the Baseline_Benchmark is measurable for every category.
6. IF the Regression_Suite reports one or more failing cases while the Optimization_Flag is enabled, THEN THE Context_System SHALL revert to Baseline_Benchmark behavior for the affected cases and provide an indication that a regression was detected.

### Requirement 4: Context Classification

**User Story:** As a developer, I want every meaningful piece of the current context classified, so that the architecture can decide what is sent always, what is conditional, and what can be represented as state.

#### Acceptance Criteria

1. WHEN the audit of the existing implementation is complete, THE Context_System SHALL assign exactly one Context_Class from the set {`static`, `task-specific`, `tool-specific`, `user-specific`, `conversation-specific`, `turn-specific`, `historical`, `unnecessary`} to every instruction and context source recorded in the audit.
2. THE Context_System SHALL derive each Context_Class assignment from the audited existing implementation and SHALL NOT base any assignment on assumed or undocumented VeeGPT behavior.
3. WHERE an instruction is classified as `unnecessary`, THE Context_System SHALL retain the instruction in the active configuration until the Regression_Suite confirms that removing it produces outputs identical to the pre-removal baseline across all Regression_Suite cases.
4. THE Context_System SHALL record, for each classified item, exactly one destination Context_Module in the refactored architecture, and WHEN no existing Context_Module is appropriate for a classified item, THE Context_System SHALL create a new Context_Module for that item rather than forcing the item into an unrelated Context_Module, so that no audited item is left without a destination.
5. IF a classified item cannot be assigned exactly one Context_Class or cannot be mapped to a destination Context_Module, whether existing or newly created, THEN THE Context_System SHALL flag the item for manual resolution and SHALL preserve the item's current behavior until the flag is resolved.
6. WHERE an instruction is classified as `unnecessary` and the Regression_Suite has not confirmed its removal, THE Context_System SHALL remove the instruction only after a configured retention timeout elapses or an explicit alternative review mechanism approves the removal, so that `unnecessary` instructions are not retained indefinitely.

### Requirement 5: Dynamic Context Composition

**User Story:** As a developer, I want the model request composed from independent modules based on the current request, so that VeeGPT stops receiving detailed instructions for capabilities irrelevant to the turn.

#### Acceptance Criteria

1. THE Context_System SHALL compose the final model request from independent Context_Modules rather than from a single fixed concatenated prompt.
2. IF a request is classified as not requiring a given capability, THEN THE Context_System SHALL exclude that capability's task-specific and tool-specific Context_Modules from the composed request.
3. WHEN a request is classified as requiring a given capability, THE Context_System SHALL include every task-specific and tool-specific Context_Module needed to preserve that capability's current behavior.
4. THE Context_System SHALL always include the Context_Modules classified as `static`, including core VeeGPT behavior and safety/policy instructions, in every composed request.
5. THE Context_System SHALL define each Context_Module to correspond to exactly one capability, task, or tool, such that no two Context_Modules contain the same instructions.
6. IF, after a request has been successfully classified, Context_Module selection cannot be uniquely determined or selects no capability-specific modules, THEN THE Context_System SHALL compose the request using the complete set of Context_Modules required to preserve current behavior, SHALL always include the `static` Context_Modules covering core VeeGPT behavior and safety/policy instructions as a hard constraint in the fallback composition, and SHALL record that the fallback was applied, while absence of any request classification is handled by the Intent_Router-failure fallback defined in Requirement 6.

### Requirement 6: Intent-Driven Module and Tool Selection

**User Story:** As a developer, I want module and tool selection driven by robust intent analysis that reuses existing logic, so that selection is accurate without adding cost.

#### Acceptance Criteria

1. WHEN a request is received, THE Context_System SHALL drive Context_Module and tool selection from the Intent_Router result, selecting the modules and tools mapped to every intent the Intent_Router identifies for that request.
2. WHEN classifying a request, THE Intent_Router SHALL derive its classification from the current request together with prior messages in the conversation, and SHALL produce one or more intent classifications that cover ambiguous requests, multi-intent requests, follow-up requests, requests referencing previous messages, indirect tool requirements, and compound tasks.
3. THE Context_System SHALL derive module and tool selection primarily from the Intent_Router classification, MAY combine the Intent_Router classification with additional selection mechanisms as a hybrid approach, and SHALL NOT use keyword matching as the sole selection mechanism.
4. WHERE the existing application logic already determines intent for a request, THE Context_System SHALL reuse that result for both module selection and tool selection and SHALL recompute the classification at most once per request.
5. THE Context_System SHALL NOT introduce an additional model call for routing, intent detection, summarization, memory extraction, or tool selection unless that call is measured to reduce per-request input tokens and latency without reducing selection accuracy relative to the current behavior.
6. IF the Intent_Router returns no classification or raises an error, THEN THE Context_System SHALL fall back to the existing safe selection behavior that preserves current capabilities and SHALL record that the fallback was applied.

### Requirement 7: Conversation History Optimization

**User Story:** As a user in a long conversation, I want older messages compacted intelligently, so that context stops growing linearly while my earlier information is still honored.

#### Acceptance Criteria

1. THE Context_System SHALL bound the input tokens attributable to conversation history to a configured maximum that does not increase as the number of turns in the conversation increases.
2. THE Context_System SHALL represent conversation history using a combination of a most-recent-N-message window, where N is a configured value, a conversation summary, and Conversation_State.
3. WHEN older messages are compacted out of the recent-message window, THE Context_System SHALL record, in the conversation summary or Conversation_State, information that can affect future responses, including brand information, campaign objectives, target audience, content constraints, selected strategy, tool-derived output, decisions, preferences, and pending actions.
4. WHEN the input tokens attributable to conversation history would exceed the configured maximum defined in criterion 1, THE Context_System SHALL compact older messages, and SHALL NOT remove any message from the recent-message window without first recording, in the conversation summary or Conversation_State, the information that message contributes per criterion 3.
5. WHEN VeeGPT answers a follow-up question that references an earlier message, THE Context_System SHALL supply the summary or Conversation_State entries covering that earlier message so that the answer references the same earlier information as the Baseline_Benchmark answer for the identical input sequence.
6. IF conversation summarization fails, THEN THE Context_System SHALL retain the user's current request and the full recent-message window in the composed request, SHALL retain all messages in the recent-message window regardless of whether the window exceeds its configured size, including the case of a brand-new conversation with no prior history, and SHALL NOT drop the current turn.

### Requirement 8: Structured Conversation State

**User Story:** As a user, I want durable conversation facts represented as structured state, so that VeeGPT remembers decisions without re-sending raw messages every turn.

#### Acceptance Criteria

1. WHERE conversational information falls into one of the categories defined in criterion 2, THE Context_System SHALL represent that information as Conversation_State and SHALL NOT re-send the raw messages that established it on subsequent turns.
2. THE Conversation_State SHALL be limited to information belonging to one or more of the following categories: objective, current task, user requirements, decisions, constraints, entities, selected options, pending actions, facts referenced by a later turn, and tool-derived state.
3. IF conversation content does not belong to any category defined in criterion 2, THEN THE Context_System SHALL NOT persist that content into Conversation_State.
4. WHEN an item is added to or updated in Conversation_State, THE Context_System SHALL record it in structured form keyed by its category defined in criterion 2.
5. WHERE Conversation_State contains an instruction-like statement, THE Context_System SHALL assign it exactly one of the following labels: user preference, user request, factual state, application state, or system instruction.
6. IF an instruction-like statement cannot be assigned exactly one label defined in criterion 5, THEN THE Context_System SHALL exclude it from Conversation_State and SHALL retain the raw message as the source of that information.

### Requirement 9: Memory Optimization With Selective Retrieval

**User Story:** As a developer, I want memory separated by scope and retrieved selectively, so that the complete memory store is not injected into every request.

#### Acceptance Criteria

1. THE Context_System SHALL treat long-term User_Memory, Conversation_Memory, short-term recent context, and retrieved knowledge as four independently addressable memory scopes, each of which can be included in or excluded from a composed request independently of the others.
2. WHEN composing a request, THE Context_System SHALL retrieve only the memory items relevant to the current request and SHALL NOT inject the complete memory store into the composed request.
3. WHEN the current request does not relate to a stored User_Memory fact, THE Context_System SHALL exclude that fact from the composed request.
4. THE Context_System SHALL preserve the existing memory behaviors — including save-intent detection, single-value-topic replacement, deduplication, storage caps, memory-full handling, and the existing acknowledgement, contradiction, and update rules — such that, for identical inputs, the memory-related outputs are equivalent to the pre-refactor outputs as verified by the Regression_Suite.
5. IF memory retrieval fails or does not complete within its configured time budget, THEN THE Context_System SHALL proceed with the memory already available, continue serving the request without terminating it, and retain the user's current message in the composed request.
6. THE Context_System SHALL retain the user's current message in the composed request regardless of memory-retrieval status, whether that status is success, failure, or timeout.
7. IF the relevance of memory items cannot be determined within the configured time budget, THEN THE Context_System SHALL include all memory in the composed request rather than excluding it, failing open toward completeness consistent with the principle that correctness wins over token savings.

### Requirement 10: Persona Optimization With Preserved Precedence

**User Story:** As a user who selects an expert persona, I want persona instructions loaded only when applicable, so that unused persona directives do not consume tokens while my selected persona still fully governs behavior.

#### Acceptance Criteria

1. WHEN composing the prompt for a request, THE Context_System SHALL include the persona/agent directives only for the persona applicable to that request, and SHALL exclude the directives of every non-applicable persona from the composed prompt.
2. IF a persona is unavailable to the user's subscription tier, THEN THE Context_System SHALL NOT apply that persona's directives and SHALL compose the prompt using the same tier-gating outcome produced before this refactor for the identical request.
3. WHERE more than one persona is eligible to apply to a single request, THE Context_System SHALL resolve them using the same persona precedence order in effect before this refactor, producing the identical selected-persona outcome for the identical request.
4. THE Context_System SHALL compose persona directives such that the applicable persona's directives are not accompanied by directives from any other persona that instruct a conflicting or opposite behavior for the same aspect (for example, tone, role, or output constraints).
5. WHILE a selected expert persona is active, THE Context_System SHALL order the composed instructions so that the selected persona's directives take precedence over general behavior directives, while platform, safety, and policy rules remain in effect and are not overridden by the persona.

### Requirement 11: Tool Context Optimization With Preserved Safeguards

**User Story:** As a developer, I want only relevant tools exposed per request, so that tool-definition tokens shrink while every safeguard remains intact.

#### Acceptance Criteria

1. WHERE the active provider/model supports selective tool exposure, WHEN composing a request, THE Context_System SHALL expose exactly the set of tools that the Intent_Router maps to the identified intents for that request and SHALL NOT expose any tool outside that mapped set.
2. FOR every exposed tool, THE Context_System SHALL preserve — at parity with the pre-refactor baseline — its parameters, validation, permissions, authentication, workspace restrictions, platform restrictions, error handling, execution, retries, confirmation requirements, and destructive-action safeguards.
3. WHEN a request is a compound or multi-intent request, THE Context_System SHALL expose the union of the tool sets mapped to each identified intent in the same turn.
4. THE Context_System SHALL apply the existing tier-based tool filtering before tool exposure, so that a tool unavailable to the user's tier is excluded from the exposed set.
5. IF a tool is selected by the Intent_Router and permitted by the user's tier, THEN THE Context_System SHALL NOT drop that tool from the exposed set in order to save tokens, even if retaining the tool causes the request to exceed a token budget or to fail, and THE Context_System SHALL NOT apply any token-driven tool-dropping behavior.
6. WHEN the user explicitly forces a tool from the composer, THE Context_System SHALL expose and run that tool according to the existing forced-tool behavior, even if the Intent_Router did not select that tool.
7. IF the tool-selection mechanism fails or the active provider/model does not support selective tool exposure, THEN THE Context_System SHALL fall back to exposing the full set of tools permitted by the user's tier.

### Requirement 12: Tool-Result Optimization

**User Story:** As a developer, I want large tool outputs reduced before they re-enter the model context, so that tool results stop inflating input tokens on subsequent turns.

#### Acceptance Criteria

1. IF a tool returns a payload whose token count exceeds a configured maximum, THEN THE Context_System SHALL reduce the payload passed into the next model request by returning only required fields, paginating or summarizing large datasets, filtering records not relevant to the current request, and removing duplicated metadata, until the payload is within the configured maximum.
2. WHEN reducing a tool result, THE Context_System SHALL retain the identifiers required for follow-up actions on that result.
3. THE Context_System SHALL NOT remove tool-result information required for accurate reasoning or for subsequent tool execution, verified by the Regression_Suite producing results equivalent to the Baseline_Benchmark for identical inputs.
4. IF reducing a tool result would remove information required for accurate reasoning or subsequent tool execution, THEN THE Context_System SHALL retain that information even if the payload remains above the configured maximum, SHALL treat information required for accurate reasoning and information required for subsequent tool execution as equally essential, SHALL retain both when both are required rather than prioritizing one over the other, and SHALL NOT remove any required information in order to stay within the configured maximum.

### Requirement 13: Duplicate-Context Detection

**User Story:** As a developer, I want repeated information detected and removed, so that the same content is not sent multiple times in one request.

#### Acceptance Criteria

1. WHEN composing a request, THE Context_System SHALL detect information duplicated across the system instructions, developer instructions, memory, conversation summary, recent messages, tool descriptions, tool results, workspace context, user profile, and retrieved documents.
2. IF the same information is present in more than one source of a composed request, THEN THE Context_System SHALL include that information only once, unless a documented reason requires the repetition.
3. WHERE the existing implementation intentionally repeats an instruction for behavioral reasons, THE Context_System SHALL preserve that repetition, and SHALL remove it only if the Regression_Suite shows that removing it produces results equivalent to the Baseline_Benchmark for identical inputs.

### Requirement 14: Static-Prefix and Provider Prompt Caching

**User Story:** As a developer, I want the stable prefix of the request kept cacheable, so that provider prompt-caching lowers cost without altering behavior.

#### Acceptance Criteria

1. WHEN composing a request, THE Context_System SHALL order the request so that static content precedes dynamic content and volatile content is placed last, so that the leading byte-identical portion forms the largest Static_Prefix achievable for that request.
2. WHERE the active provider/model supports prompt caching, THE Context_System SHALL use that provider's caching mechanism and SHALL keep the Static_Prefix byte-identical across consecutive turns of the same conversation.
3. THE Context_System SHALL enable a provider-specific caching mechanism only for a provider whose SDK/API used by the project is confirmed to support that mechanism.
4. IF prompt caching is unavailable for the selected model, THEN THE Context_System SHALL compose and send the request without caching and without altering the composed content.

### Requirement 15: Model Routing and Provider Compatibility

**User Story:** As a developer, I want the context architecture to work with every supported provider and model, so that no provider is broken by the refactor.

#### Acceptance Criteria

1. FOR every currently supported provider and model in the Model_Router, THE Context_System SHALL produce a composed request that the provider/model accepts without error.
2. IF a provider or model does not support a given request feature, THEN THE Context_System SHALL omit that feature from the composed request for that provider or model.
3. THE Context_System SHALL preserve the existing Model_Router routing and fallback behavior — including the existing behavior for reasoning models, temperature-locked models, and non-tool-capable model fallbacks — such that routing and fallback outcomes are equivalent to the Baseline_Benchmark for identical inputs.
4. WHEN the Model_Router falls back to a different model, THE Context_System SHALL compose a request valid for the fallback model while preserving the behavior verified by the Regression_Suite against the Baseline_Benchmark.

### Requirement 16: Token Budgeting and Observability

**User Story:** As a developer, I want per-request token telemetry, so that the biggest sources of token consumption are visible and the optimization is measurable.

#### Acceptance Criteria

1. FOR every VeeGPT request, THE Token_Telemetry SHALL record the token counts for static instructions, dynamic instructions, memory, conversation summary, recent history, tool definitions, tool results, and user input, plus total input tokens, output tokens, and cached-input and cache-read/cache-write metrics where the provider supplies them.
2. FOR every VeeGPT request, THE Token_Telemetry SHALL record the model/provider, request type, selected Context_Modules, and exposed tools.
3. FOR every VeeGPT request, THE Token_Telemetry SHALL record, in a form retrievable by a Developer, which Context_Modules were selected, which tools were exposed, whether conversation compaction occurred, whether memory was retrieved, whether caching was used, and which model was selected.
4. THE Token_Telemetry SHALL NOT log full user content or full prompts by default, and SHALL prefer metadata and token counts over full prompt logging.
5. WHERE prompts are logged for debugging, THE Token_Telemetry SHALL respect the existing privacy and security practices.

### Requirement 17: Prompt-Injection and Trust-Boundary Safety

**User Story:** As a security-conscious operator, I want user-controlled content kept out of trusted instruction layers, so that the refactor does not create prompt-injection vulnerabilities.

#### Acceptance Criteria

1. THE Context_System SHALL maintain a separation between trusted system instructions, developer instructions, application state, retrieved data, tool output, and user content.
2. THE Context_System SHALL NOT place user-controlled content into a higher-priority instruction layer than it occupies in the current implementation.
3. WHEN the Context_System generates a conversation summary or memory from user content, THE Context_System SHALL treat that generated content as data and SHALL NOT allow it to override core system behavior.
4. THE Context_System SHALL NOT convert a user message into a persistent trusted instruction merely because that message was summarized into memory or Conversation_State.

### Requirement 18: Memory and Summary Safety Classification

**User Story:** As a developer, I want summarized and structured state clearly typed, so that factual state is never mistaken for authoritative instruction.

#### Acceptance Criteria

1. WHERE a summary is produced from conversation content, THE Context_System SHALL label the summary as data rather than as authoritative instruction.
2. THE Context_System SHALL distinguish, within stored state, user preference, user request, factual state, application state, and system instruction.
3. THE Context_System SHALL NOT allow a stored summary or structured-state entry to change VeeGPT's safety behavior, and SHALL treat any such entry as data that MAY inform non-safety core behavior but SHALL NOT override core system behavior as an authoritative instruction.

### Requirement 19: Failure-Safety and Graceful Degradation

**User Story:** As a user, I want VeeGPT to keep working even when an optimization component fails, so that the optimization never becomes a single point of failure.

#### Acceptance Criteria

1. IF dynamic Context_Module selection fails, THEN THE Context_System SHALL compose a safe request that preserves current capabilities.
2. IF memory retrieval fails, THEN THE Context_System SHALL continue serving the request without crashing.
3. IF conversation summarization fails, THEN THE Context_System SHALL preserve the user's current request.
4. IF token estimation fails, THEN THE Context_System SHALL NOT block otherwise-valid requests.
5. IF provider caching is unavailable, THEN THE Context_System SHALL continue normally.
6. IF the tool router fails, THEN THE Context_System SHALL fall back to the existing safe tool-exposure behavior.
7. THE Context_System SHALL degrade every optimization independently so that a failure in one optimization does not disable VeeGPT.

### Requirement 20: Backward Compatibility

**User Story:** As an existing user, I want my current conversations, memory, tools, and integrations to keep working, so that the refactor is invisible to me.

#### Acceptance Criteria

1. THE Context_System SHALL continue processing conversations created before this refactor without requiring users to start new conversations.
2. THE Context_System SHALL read and write existing User_Memory and Conversation_Memory such that memory behavior remains equivalent to the Baseline_Benchmark for identical inputs.
3. THE Context_System SHALL keep every existing tool invocable, preserving its pre-refactor invocation contract and result contract.
4. THE Context_System SHALL produce API responses that conform to the existing API response contracts, verified by the Regression_Suite.
5. THE Context_System SHALL emit the existing streaming event contract consumed by the client without changing event names, ordering guarantees, or payload shape.
6. IF existing conversation or memory data uses a format different from the format the refactored architecture expects, THEN THE Context_System SHALL read that existing format without error and without discarding the stored data.

### Requirement 21: Minimal Persistent State and Schema Changes

**User Story:** As a developer, I want any new persistent state designed minimally within existing conventions, so that the refactor does not introduce a duplicate or divergent data system.

#### Acceptance Criteria

1. WHERE new persistent state is required, THE Context_System SHALL store that state using the project's existing database technology and conventions.
2. THE Context_System SHALL NOT introduce an additional database or a duplicate memory system.
3. WHERE any schema change is introduced, including a minor change such as adding an optional field, THE Context_System SHALL define, for that change, a migration strategy where required, the required indexes, backward compatibility with existing records, a cleanup strategy, and the failure behavior when the change cannot be applied.
4. THE Context_System SHALL limit any new persistent state to the fields the optimization requires and SHALL NOT persist fields that no optimization requirement in this document depends on.

### Requirement 22: Centralized Configuration and Safe Rollback

**User Story:** As an operator, I want optimization thresholds centralized and the whole optimization reversible, so that the change can be tuned and rolled back safely.

#### Acceptance Criteria

1. THE Context_System SHALL centralize configurable values, including recent-message limit, summary trigger, token budget, memory-retrieval limit, tool-exposure rules, caching configuration, and compaction thresholds, using the project's existing configuration/environment-variable architecture.
2. THE Context_System SHALL provide safe defaults for every configurable value.
3. THE Context_System SHALL NOT hard-code optimization thresholds across multiple locations.
4. THE Context_System SHALL provide an Optimization_Flag that enables or disables the optimized context path.
5. WHEN the Optimization_Flag is disabled, THE Context_System SHALL restore the current (pre-refactor) context-assembly behavior.
6. THE Context_System SHALL NOT introduce configurable values beyond those required for the optimization.
7. THE Optimization_Flag SHALL act as a clean switch under which exactly one context-assembly behavior, either the optimized path or the pre-refactor path, is active for a request at a time, and THE Context_System SHALL NOT run the optimized path and the pre-refactor path simultaneously.

### Requirement 23: Mandatory Regression Test Suite

**User Story:** As a developer, I want an automated regression suite covering existing VeeGPT behavior, so that any behavioral change is caught before release.

#### Acceptance Criteria

1. THE Regression_Suite SHALL test conversation behavior, including follow-up questions, references to earlier messages, long conversations, and summarized conversations.
2. THE Regression_Suite SHALL test memory behavior, including memory retrieval, memory not relevant to the request, memory updates, conflicting memory, and stale memory.
3. THE Regression_Suite SHALL test tool behavior, including correct tool selection, absence of unnecessary tool calls, multiple tools, tool failures, invalid tool parameters, and permission restrictions.
4. THE Regression_Suite SHALL test persona behavior, including correct persona, persona switching, and conflicting persona requirements.
5. THE Regression_Suite SHALL test that existing safety behavior remains intact.
6. THE Regression_Suite SHALL test output behavior, including response format, structured outputs, streaming, and citations/references where currently supported.
7. THE Regression_Suite SHALL test every currently supported model/provider and the fallback behavior.
8. THE Context_System SHALL be considered releasable only when the Regression_Suite passes without behavioral regression against the Baseline_Benchmark.

### Requirement 24: Scope Isolation of Unrelated Business Logic

**User Story:** As a product owner, I want unrelated systems left unchanged, so that a context optimization does not risk billing, auth, or integrations.

#### Acceptance Criteria

1. THE Context_System SHALL NOT modify subscription logic, credit logic, billing, authentication, workspace permissions, social integrations, scheduling logic, database behavior, or frontend behavior, unless a change is strictly required for the optimization.
2. WHERE a change to an otherwise-unrelated system is strictly required, THE Context_System SHALL isolate that change and document why it is required.
3. THE Context_System SHALL preserve Token_Ledger accounting correctness, computing charges from actual provider token usage as in the current implementation.

### Requirement 25: Phased Delivery

**User Story:** As a developer, I want the refactor delivered in phases, so that risk is contained and no giant rewrite is attempted.

#### Acceptance Criteria

1. THE Context_System SHALL be delivered in phases ordered as audit, instrumentation, context classification, dynamic composition, conversation compaction, tool filtering, caching, regression testing, optimization, and production hardening.
2. THE Context_System SHALL NOT skip directly to threshold optimization before the audit, instrumentation, classification, composition, and regression-testing phases are complete.
3. WHERE a phase changes behavior, THE Context_System SHALL run the Regression_Suite for that phase before proceeding to the next phase.

### Requirement 26: Minimum-Sufficient-Context Guarantee

**User Story:** As a product owner, I want the system optimized for minimum sufficient context rather than minimum possible context, so that over-compaction cannot degrade answers.

#### Acceptance Criteria

1. THE Context_System SHALL retain the smallest amount of context for which the Regression_Suite still passes against the Baseline_Benchmark, rather than the smallest amount of context achievable.
2. IF a candidate reduction would produce fewer tokens but cause any Regression_Suite case to change its pass/fail result relative to the Baseline_Benchmark, THEN THE Context_System SHALL retain the context needed to keep that case passing.
3. THE Context_System SHALL retain reasoning-related instructions only for the tasks for which the Regression_Suite requires them, scoping them to need rather than retaining them for all tasks, and SHALL NOT remove them solely to save tokens for any task that requires them.
4. THE Context_System SHALL NOT place hidden reasoning content into user-visible output.

### Requirement 27: Final Technical Report

**User Story:** As a stakeholder, I want a final report with before/after measurements, so that success is demonstrated by data and behavior rather than by code compilation.

#### Acceptance Criteria

1. THE Context_System SHALL produce a final technical report describing the existing VeeGPT architecture, major sources of token waste, the new context architecture, what was moved into modules, what became dynamic, the conversation-history strategy, the memory strategy, the tool-selection strategy, and the caching strategy.
2. THE final technical report SHALL include average, median, and worst-case input tokens before and after, and SHALL break down where the savings came from.
3. THE final technical report SHALL include the tests added, the regression results, known limitations, and remaining optimization opportunities.
4. THE Context_System SHALL demonstrate success through token measurements and behavioral regression results, and SHALL NOT claim success based only on code compilation.
