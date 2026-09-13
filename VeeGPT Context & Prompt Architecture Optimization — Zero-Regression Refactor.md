# VeeGPT Context & Prompt Architecture Optimization — Zero-Regression Refactor

## Objective

Refactor the existing VeeGPT prompt/context architecture to **substantially reduce input-token consumption and unnecessary repeated context** while preserving **100% of VeeGPT's existing capabilities, behavior, tool-calling accuracy, memory behavior, reasoning quality, personas, safety rules, formatting behavior, and application functionality**.

This is **NOT a prompt-shortening task**.

Do not blindly reduce, rewrite, summarize, delete, or compress the existing VeeGPT prompt.

The objective is to change the **architecture that assembles and sends context to the model**, so VeeGPT receives the same necessary intelligence at the right time instead of receiving everything on every turn.

---

# CRITICAL RULE

Before changing ANYTHING:

**Inspect and understand the complete existing VeeGPT implementation.**

Do not assume how VeeGPT works.

Inspect:

- Entire VeeGPT service
- All model/provider integrations
- Complete current system/developer prompts
- Prompt builders
- Context builders
- Conversation history handling
- Memory implementation
- User memory
- Conversation memory
- Persona system
- Intent detection
- Reasoning instructions
- Tool-selection logic
- Tool definitions/schemas
- Tool execution
- Tool results
- RAG/retrieval if present
- Social/account context
- Workspace/brand context
- User preferences
- Authentication/account context relevant to VeeGPT
- Model routing
- Fallback models
- Streaming
- Token counting
- Usage tracking
- Credit/metering logic
- Error handling
- Retry handling
- Caching
- Provider-specific APIs
- Existing tests
- Existing environment variables/configuration
- Any frontend assumptions about VeeGPT responses
- Any database models related to conversations/memory
- Any background jobs related to VeeGPT
- Any existing prompt/version system

Search the entire repository rather than inspecting only the obvious VeeGPT file.

Do not implement architectural changes until the current execution flow is understood.

---

# PRIMARY SUCCESS CRITERIA

The refactor must achieve all of the following:

1. Significantly reduce average input tokens per VeeGPT request.
2. Prevent conversation context from growing linearly forever.
3. Avoid repeatedly sending irrelevant instructions.
4. Preserve all existing VeeGPT capabilities.
5. Preserve existing tool-calling behavior.
6. Preserve existing memory behavior.
7. Preserve personas and response styles.
8. Preserve reasoning/decision-making behavior.
9. Preserve safety and policy instructions.
10. Preserve model routing and fallback behavior.
11. Preserve streaming behavior.
12. Preserve existing API contracts.
13. Preserve existing UI behavior.
14. Preserve credit/token accounting correctness.
15. Avoid introducing hidden context loss.
16. Avoid introducing race conditions.
17. Avoid duplicate context.
18. Avoid prompt injection vulnerabilities caused by the refactor.
19. Make the architecture observable and measurable.
20. Make it possible to roll back the optimization safely.

---

# IMPORTANT: DO NOT CREATE A "SHORTER MASTER PROMPT"

Do NOT replace the current large prompt with another giant prompt.

Do NOT simply:

- delete instructions
- summarize the entire prompt
- paraphrase everything
- reduce wording
- remove examples
- remove tool instructions
- remove persona instructions
- remove reasoning instructions
- remove memory instructions
- reduce the number of previous messages arbitrarily

That approach is unacceptable.

Instead, determine:

### What is static?

Instructions that rarely/never change.

### What is task-specific?

Instructions only relevant to particular requests.

### What is tool-specific?

Instructions needed only when particular tools are available or being used.

### What is user-specific?

User/account/workspace/brand information.

### What is conversation-specific?

Information relevant to the current conversation.

### What is turn-specific?

Information needed only for the current request.

### What is historical?

Information that can be safely compressed into structured state or summaries.

### What is unnecessary?

Context that provides no value for the current request.

Then architect the system accordingly.

---

# TARGET ARCHITECTURE

Design the final system around dynamically composed context.

Conceptually:

User Request
    ↓
Context / Intent Analysis
    ↓
Determine Required Capabilities
    ↓
Determine Required Tools
    ↓
Determine Required Memory
    ↓
Determine Required Persona/Behavior Modules
    ↓
Retrieve Only Relevant Context
    ↓
Compose Model Request
    ↓
VeeGPT Model
    ↓
Tool Calls if required
    ↓
Tool Results
    ↓
Final Response
    ↓
Update Conversation State / Memory

The exact implementation must be based on the existing codebase.

Do not blindly copy this conceptual architecture if the existing architecture suggests a safer implementation.

---

# 1. BUILD A CONTEXT COMPOSITION SYSTEM

Create or refactor the prompt/context builder so that it can compose the final model request from independent modules.

Potential conceptual modules include:

- Core VeeGPT behavior
- Safety/policy
- General reasoning behavior
- Persona
- Intent-specific instructions
- Tool-specific instructions
- User memory
- Workspace context
- Brand context
- Platform context
- Conversation summary
- Recent conversation
- Retrieved knowledge
- Current request
- Current task state
- Tool results

The exact module boundaries must be determined by analyzing the existing VeeGPT prompt.

Do not unnecessarily create dozens of tiny modules.

Avoid over-engineering.

---

# 2. PRESERVE THE SEMANTIC CONTENT OF THE EXISTING PROMPT

The current VeeGPT prompt contains important behavior.

Before refactoring it, build an internal inventory of its responsibilities.

For every meaningful instruction, classify it.

For example:

| Existing instruction | Classification |
|---|---|
| Core behavior | Static |
| Tool selection rule | Tool/agent behavior |
| Analytics instructions | Analytics module |
| Scheduler instructions | Scheduler module |
| User preferences | User memory |
| Conversation history | Conversation state |
| Persona | Persona module |
| Output format | Task/module specific |
| Safety requirement | Static |
| Brand context | Dynamic context |

The exact classification must come from the repository.

Do not assume the examples above represent the actual implementation.

Every important existing behavior must have a destination in the new architecture.

---

# 3. DYNAMICALLY LOAD ONLY RELEVANT INSTRUCTIONS

VeeGPT must not receive detailed instructions for capabilities that are irrelevant to the current request.

For example, if the user asks a simple content-generation question, there should be no reason to inject large instructions describing unrelated functionality such as:

- Social listening
- Analytics
- Scheduler
- DM automation
- Competitor analysis
- Monetization
- Other unrelated tools

However:

**Do not rely on simplistic keyword matching alone.**

The selection mechanism must be robust enough to handle:

- ambiguous requests
- multi-intent requests
- follow-up requests
- requests requiring multiple tools
- references to previous messages
- indirect tool requirements
- compound tasks

If an existing intent detection/router exists, analyze whether it can safely drive module selection.

If a lightweight routing step is needed, implement it carefully.

Do not introduce another expensive LLM call unless the token/cost tradeoff is clearly justified.

---

# 4. CONVERSATION HISTORY OPTIMIZATION

The current VeeGPT implementation may send an increasing amount of previous conversation history.

Refactor this carefully.

Do NOT simply reduce:

"20 messages → 5 messages"

without understanding what information could be lost.

Implement an appropriate combination of:

- recent-message window
- conversation summary
- structured conversation state
- important decisions
- user requirements
- unresolved tasks
- relevant historical facts
- tool-derived state

Older conversation should be compressed when appropriate.

The system must preserve information that can affect future responses.

For example, if the user previously established:

- brand information
- campaign objective
- target audience
- content constraints
- selected strategy
- tool output
- decisions
- preferences
- pending actions

the information should not disappear merely because the original messages are no longer in the recent window.

---

# 5. STRUCTURED CONVERSATION STATE

Where appropriate, represent durable conversational information structurally instead of repeatedly sending raw messages.

Possible structure:

- objective
- current task
- user requirements
- decisions
- constraints
- entities
- selected options
- pending actions
- important facts
- tool-derived state

Do NOT store everything.

Only store information that has demonstrated future relevance.

Do not turn the database into an uncontrolled memory dump.

---

# 6. MEMORY OPTIMIZATION

Audit the existing memory implementation.

Separate:

### Long-term user memory

Facts that should persist across conversations.

### Conversation memory

Facts relevant to the current conversation.

### Short-term context

Recent messages required for immediate coherence.

### Retrieved knowledge

Information retrieved only when needed.

Do not repeatedly inject the complete memory store into every request.

Memory retrieval must be selective.

If vector search/retrieval exists, inspect whether it is being used efficiently.

If structured memory is more appropriate for some information, use structured memory.

---

# 7. PERSONA OPTIMIZATION

VeeGPT may have multiple personas or behavioral modes.

Do not remove them.

Do not merge them blindly.

Determine:

- which persona instructions are globally required
- which are conditional
- which are task-specific
- which overlap
- which can be represented more efficiently

Only inject the applicable persona instructions for the current task.

If multiple personas can apply simultaneously, preserve the current precedence behavior.

Do not create contradictory persona instructions.

---

# 8. TOOL CONTEXT OPTIMIZATION

Audit every VeeGPT tool.

Do not automatically send the full description/schema/instructions for every tool on every request if the model/provider architecture allows selective tool exposure.

Create a safe mechanism for determining relevant tools.

Potential flow:

Request
→ determine capability
→ determine tools
→ expose only applicable tools

But preserve:

- tool parameters
- validation
- permissions
- authentication
- workspace restrictions
- platform restrictions
- error handling
- tool execution
- retries
- confirmation requirements
- destructive-action safeguards

Do not optimize tokens by hiding tools that the model may legitimately need.

For compound requests, multiple relevant tools must remain available.

---

# 9. TOOL RESULTS MUST ALSO BE OPTIMIZED

Do not focus only on the system prompt.

Audit tool outputs.

A tool may return huge payloads that are then passed into the next model request.

Optimize tool results where safely possible.

For example:

- return only required fields
- paginate large datasets
- summarize large results
- filter irrelevant records
- preserve identifiers needed for follow-up actions
- avoid duplicated metadata

But never remove information that is required for accurate reasoning or tool execution.

---

# 10. DUPLICATE-CONTEXT DETECTION

Explicitly identify repeated information.

Look for duplication between:

- system prompt
- developer prompt
- memory
- conversation summary
- recent messages
- tool descriptions
- tool results
- workspace context
- user profile
- retrieved documents

The same information should not be injected multiple times unless there is a strong reason.

---

# 11. STATIC PREFIX / PROMPT CACHING

Identify the largest stable prefix of VeeGPT's request.

Where supported by the active provider/model:

- use prompt caching/cached input mechanisms
- keep stable content stable
- avoid changing static prefixes unnecessarily
- separate dynamic context from stable context
- preserve provider-specific caching requirements

Do not implement provider-specific caching assumptions without checking the actual SDK/API currently used by the project.

VeeGPT may use multiple providers/models.

The architecture must gracefully handle provider differences.

---

# 12. MODEL ROUTING COMPATIBILITY

VeeGPT may use different models for different tasks.

The refactor must not assume one model.

Verify compatibility with every currently supported provider/model.

The context architecture should be model-aware when necessary.

Do not introduce unsupported features into providers that don't support them.

---

# 13. TOKEN BUDGETING

Introduce observability around token usage.

For every VeeGPT request, track internally:

- static instruction tokens
- dynamic instruction tokens
- memory tokens
- conversation-summary tokens
- recent-history tokens
- tool-definition tokens
- tool-result tokens
- user-input tokens
- total input tokens
- output tokens
- cached input tokens where available
- cache-read/cache-write metrics where available
- model/provider
- request type
- selected modules
- selected tools

Do not expose sensitive internal data to users.

Use this data to identify the biggest sources of token consumption.

---

# 14. BEFORE/AFTER BENCHMARKING

Before modifying behavior, create a baseline.

Capture representative VeeGPT requests covering:

- simple chat
- follow-up questions
- content creation
- analytics
- social listening
- scheduling
- automation
- multi-tool requests
- memory-dependent requests
- long conversations
- ambiguous requests
- persona-dependent requests
- tool failures
- provider fallback
- complex reasoning tasks

Measure:

- input tokens
- output tokens
- latency
- tool-call accuracy
- final answer quality
- memory retention
- context retention

After implementation, run the same benchmark.

The optimization is successful only if token consumption materially decreases **without meaningful behavioral regression**.

---

# 15. BUILD REGRESSION TESTS

This is mandatory.

Create tests around existing VeeGPT behavior.

At minimum test:

### Conversation

- follow-up questions
- references to earlier messages
- long conversations
- summarized conversations

### Memory

- memory retrieval
- memory not relevant to request
- memory updates
- conflicting memory
- stale memory

### Tools

- correct tool selection
- no unnecessary tool calls
- multiple tools
- tool failures
- invalid tool parameters
- permission restrictions

### Personas

- correct persona
- persona switching
- conflicting persona requirements

### Safety

- existing safety behavior remains intact

### Output

- response format
- structured outputs
- streaming
- citations/references if currently supported

### Providers

- every currently supported model/provider
- fallback behavior

---

# 16. PROMPT INJECTION AND TRUST BOUNDARIES

The refactor must not accidentally make user-controlled content part of trusted system instructions.

Clearly separate:

- trusted system instructions
- developer instructions
- application state
- retrieved data
- tool output
- user content

Do not place user-controlled content into a higher-priority instruction layer.

Be particularly careful when generating conversation summaries or memory.

A malicious user message must not become a persistent trusted instruction simply because it was summarized into memory.

---

# 17. MEMORY/SUMMARY SAFETY

If an LLM is used to summarize conversation state, treat the summary as **data**, not as authoritative instructions.

Do not allow summaries to override core system behavior.

If structured state contains instructions, clearly distinguish:

- user preference
- user request
- factual state
- application state
- system instruction

---

# 18. FAILURE SAFETY

If dynamic module selection fails:

VeeGPT must still function safely.

Use a sensible fallback.

If memory retrieval fails:

Do not crash VeeGPT.

If conversation summarization fails:

Do not lose the user's current request.

If token estimation fails:

Do not block valid requests unnecessarily.

If provider caching is unavailable:

VeeGPT must continue normally.

If a tool router fails:

fall back according to the existing safe behavior.

The optimization must never become a single point of failure for VeeGPT.

---

# 19. DO NOT CHANGE BUSINESS LOGIC UNNECESSARILY

This task is primarily a context/prompt architecture optimization.

Do not modify unrelated:

- subscription logic
- credit logic
- billing
- authentication
- workspace permissions
- social integrations
- scheduling logic
- database behavior
- frontend behavior

unless a change is strictly required for the optimization.

If such a change is required, isolate it and document why.

---

# 20. DATABASE / SCHEMA CHANGES

Before creating new collections/tables/fields:

Inspect the existing database architecture.

Use the project's existing database technology and conventions.

Do not introduce another database.

Do not create duplicate memory systems.

If new persistent state is required, design it minimally.

Any schema change must include:

- migration strategy if required
- indexes
- backward compatibility
- cleanup strategy
- failure behavior

---

# 21. BACKWARD COMPATIBILITY

Existing conversations must continue working.

Existing memory must continue working.

Existing tools must continue working.

Existing API responses must remain compatible.

Existing frontend behavior must remain compatible.

Do not require users to start new conversations.

If old conversation data has a different format, build compatibility handling.

---

# 22. OBSERVABILITY

Add useful internal diagnostics.

For a VeeGPT request, it should be possible for developers to understand:

- which context modules were selected
- which tools were exposed
- how many tokens each context category consumed
- whether conversation compaction occurred
- whether memory was retrieved
- whether cache was used
- which model was selected

Do not log sensitive user content unnecessarily.

Prefer metadata and token counts over full prompt logging.

If prompts are logged for debugging, ensure existing privacy/security practices are respected.

---

# 23. CONFIGURATION

Do not hard-code optimization thresholds everywhere.

Centralize configurable values such as:

- recent-message limit
- summary trigger
- token budget
- memory retrieval limit
- tool exposure rules
- caching configuration
- compaction thresholds

Use the project's existing configuration/environment-variable architecture.

Provide safe defaults.

Do not introduce dozens of unnecessary environment variables.

---

# 24. DO NOT OVER-COMPACT

There is a dangerous optimization failure mode:

"fewer tokens = better."

That is false.

A 2,000-token prompt that loses critical context is worse than a 5,000-token prompt that produces correct results.

Optimize for:

**minimum sufficient context**

not:

**minimum possible context.**

---

# 25. QUALITY GATE

Before considering the work complete, demonstrate:

### Token efficiency

Show:

- average input tokens before
- average input tokens after
- median input tokens before
- median input tokens after
- worst-case input tokens before
- worst-case input tokens after

Break down where the savings came from.

### Behavior

Demonstrate that:

- tool selection remains correct
- memory remains correct
- long conversations remain coherent
- personas remain correct
- reasoning remains intact
- safety remains intact
- multi-tool workflows remain intact

### Reliability

Demonstrate:

- no new crashes
- no new race conditions
- no context corruption
- no broken streaming
- no broken provider fallback
- no broken existing APIs

---

# 26. USE REAL EXISTING VEEGPT PROMPTS AS SOURCE OF TRUTH

The current implementation is the source of truth.

Do not invent a new VeeGPT behavior specification from scratch.

Extract the existing behavior first.

Then refactor its delivery mechanism.

The goal is:

OLD:

"Send everything every time."

NEW:

"Send the same necessary information selectively and intelligently."

Not:

OLD:

"Detailed prompt"

NEW:

"Less detailed prompt with missing behavior."

---

# 27. IMPLEMENT IN PHASES

Do not make one giant risky rewrite.

Prefer:

### Phase 1 — Audit

Understand the current architecture.

### Phase 2 — Instrumentation

Measure current token consumption.

### Phase 3 — Context classification

Separate static/dynamic/task/tool/memory/history context.

### Phase 4 — Dynamic composition

Introduce selective context assembly.

### Phase 5 — Conversation compaction

Introduce summaries/structured state where appropriate.

### Phase 6 — Tool filtering

Expose relevant tools selectively.

### Phase 7 — Caching

Implement provider-supported caching.

### Phase 8 — Regression testing

Compare behavior.

### Phase 9 — Optimization

Remove duplication and tune thresholds based on actual measurements.

### Phase 10 — Production hardening

Add fallbacks, monitoring, and rollback capability.

Do not skip directly to Phase 9.

---

# 28. DO NOT ASK ME TO WRITE THE NEW PROMPT

You are responsible for determining how the existing prompt should be reorganized.

I am intentionally NOT providing a replacement VeeGPT prompt.

You must inspect the existing prompt and decide:

- which instructions stay together
- which become modules
- which remain globally active
- which become conditional
- which should be represented as state
- which should be represented as memory
- which belong to tool definitions
- which can be eliminated as duplicate
- which must never be removed

Do not ask me to manually rewrite the prompt unless you discover an actual product requirement that cannot be inferred from the current implementation.

---

# 29. IMPORTANT: PRESERVE REASONING

Do not optimize by removing reasoning-related instructions simply because they consume tokens.

Do not force hidden reasoning into user-visible output.

Do not weaken reasoning behavior.

If the existing architecture contains reasoning instructions, preserve their functional purpose while determining whether they can be scoped to relevant tasks.

---

# 30. IMPORTANT: PRESERVE INTENT DETECTION

Do not remove intent detection because it adds tokens.

Instead determine whether:

- it can be made cheaper
- it can be performed using existing application logic
- its result can be structured
- its result can drive context selection
- the same result can be reused for tool selection

Avoid performing the same classification multiple times in a single request.

---

# 31. IMPORTANT: AVOID "LLM CALL TO SAVE TOKENS" TRAP

Do not automatically add an extra LLM call for:

- summarization
- intent detection
- routing
- memory extraction
- tool selection

unless the overall cost/latency/quality tradeoff is proven beneficial.

Prefer deterministic application logic where appropriate.

If an additional model call is proposed, benchmark its:

- token cost
- latency
- reliability
- quality improvement

against the savings it creates.

---

# 32. FINAL IMPLEMENTATION REQUIREMENT

After implementation, provide a technical report containing:

1. Existing VeeGPT architecture
2. Major sources of token waste
3. New context architecture
4. What was moved into modules
5. What became dynamic
6. Conversation-history strategy
7. Memory strategy
8. Tool-selection strategy
9. Caching strategy
10. Token measurements before/after
11. Tests added
12. Regression results
13. Any known limitations
14. Any remaining optimization opportunities

Do not claim success based only on code compilation.

Success must be demonstrated through **token measurements + behavioral regression testing**.

---

# ABSOLUTE REQUIREMENT

The final implementation must be a **zero-regression optimization**.

Do not sacrifice even small or rarely used VeeGPT capabilities merely to reduce tokens.

If there is a conflict between:

1. saving tokens
2. preserving correctness

**correctness wins.**

But do not use that as an excuse to avoid optimization.

The engineering goal is to discover the minimum context required to preserve the full VeeGPT experience and stop repeatedly sending information that does not need to be present.

First inspect.  
Then measure.  
Then architect.  
Then implement incrementally.  
Then benchmark.  
Then optimize further.

Do not rewrite blindly.