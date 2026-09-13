# VeeGPT — FINAL PRODUCTION IMPLEMENTATION SPECIFICATION
## Enterprise-Grade AI Usage, Rate Limiting, Cost Control & Model Governance

## STATUS

This is the FINAL implementation specification.

The existing VeeGPT usage-control system has already been implemented. Do not rebuild it unnecessarily.

Your task is to inspect the current implementation and **upgrade, correct, complete, and harden it until every requirement in this specification is satisfied.**

There must be no "future phase", "later", "eventually", "TODO", or intentionally incomplete production-control mechanism remaining after this task.

If an existing implementation already satisfies a requirement, preserve it.

If it partially satisfies a requirement, fix it.

If it conflicts with this specification, this specification takes precedence.

---

# 1. PRIMARY OBJECTIVE

Build a production-grade VeeGPT consumption-control system that:

- protects Veefore from uncontrolled AI costs
- gives different plans different usage capacity
- gives different models different consumption costs
- gives expensive models substantially tighter controls
- allows users to experience premium AI before upgrading
- maintains excellent usability
- encourages plan upgrades naturally
- prevents frontend/API bypasses
- handles concurrent requests safely
- handles streaming safely
- handles background jobs safely
- handles provider failures safely
- survives Redis failures safely
- maintains a durable MongoDB usage ledger
- accurately reconciles actual AI usage
- supports Business pooled usage
- supports existing credit packs
- supports model and feature-specific controls
- provides transparent usage information
- provides admin-level cost visibility
- provides emergency cost controls
- is fully tested

The system must be economically safe even under heavy legitimate usage.

---

# 2. CORE CONCEPT

Do NOT use "messages" as the primary usage unit.

Use:

## VGU — VeeGPT Usage Units

VGU is an internal normalized consumption unit.

It represents AI resource consumption, not messages.

A simple lightweight request may consume approximately 1 VGU.

A large request can consume many VGU.

A premium request consumes substantially more VGU.

A deep-research operation can consume significantly more than a normal conversation.

---

# 3. THREE SEPARATE ECONOMIC CONCEPTS

Keep these completely separate.

### A. Provider Cost

Actual money Veefore pays to:

- OpenAI
- Google
- Anthropic
- other AI providers
- search providers
- other AI infrastructure

### B. VGU

Internal normalized usage measurement.

### C. User Credits

Commercial credit/top-up mechanism already used by Veefore.

Never mix these concepts.

A VGU must not directly mean ₹X forever.

Provider pricing can change.

---

# 4. FINAL PLAN LIMITS

Use the following initial production limits.

| Plan | 5-Hour VGU | Monthly VGU |
|---|---:|---:|
| Free | 15 | 100 |
| Creator | 100 | 1,200 |
| Pro | 300 | 5,000 |
| Business | 800 | 12,000 |

These values must exist in centralized configuration/database configuration.

Never hard-code them inside controllers.

The system must use these values immediately.

Do not leave them as placeholders.

---

# 5. WHAT THE LIMITS MEAN

The 5-hour limit is a rolling burst-protection budget.

The monthly limit is the primary economic allowance.

The 5-hour budget must NOT be purchasable.

The monthly budget may be extended using Veefore's existing credit-pack/top-up mechanism.

Top-ups must never bypass:

- model access
- model-specific restrictions
- feature restrictions
- concurrency limits
- abuse protection

---

# 6. MODEL TIERS

Every available model must belong to exactly one internal tier.

## CHEAP

Initial VGU multiplier:

### 1×

Examples:

- Gemini Flash-Lite
- GPT-5 nano

---

## MEDIUM

Initial multiplier:

### 3×

Examples:

- Gemini Flash
- GPT-5 mini

---

## PREMIUM

Initial multiplier:

### 12×

Examples:

- GPT-4o
- GPT-5
- Gemini Pro-class models

---

## ULTRA

Initial multiplier:

### 20×

Use this tier for exceptionally expensive/reasoning-heavy models.

If no current model qualifies, keep the tier available in the registry but do not expose it.

All multipliers must be configurable.

Do not spread model pricing logic throughout the application.

---

# 7. ACTUAL TOKEN ACCOUNTING

The final VGU calculation must account for actual provider usage whenever available.

Track:

- input tokens
- output tokens
- reasoning tokens
- cached input tokens
- total tokens
- model
- provider
- tool calls
- context size

The calculation should conceptually be:

Actual resource consumption
×
model cost weighting
×
feature/tool weighting
=
actual VGU

The initial model multipliers above are the baseline.

Do not pretend that every request to a model has identical cost.

---

# 8. ESTIMATION + RESERVATION + RECONCILIATION

Every AI request follows:

```text
Estimate
↓
Eligibility check
↓
Atomic reservation
↓
Provider call
↓
Actual usage
↓
Reconciliation
```

Never:

```text
Provider call
↓
Charge user
```

because concurrent requests can overspend the quota.

---

# 9. ATOMIC RESERVATION

Reservation MUST be atomic.

Do not use:

```text
GET counter
calculate
SET counter
```

for quota enforcement.

Use Redis atomic operations, Lua scripts, transactions, or an equivalent concurrency-safe mechanism.

Example:

User has:

100 VGU remaining.

Five simultaneous requests each require:

30 VGU.

Only three may reserve successfully.

The remaining two must fail gracefully.

The user must never receive 150 VGU worth of execution from a 100 VGU allowance.

---

# 10. RESERVATION LIFECYCLE

Every reservation must have:

- reservationId
- requestId
- userId
- workspaceId
- billingPeriodId
- estimatedVGU
- timestamp
- expiration
- status

Statuses:

```text
RESERVED
COMPLETED
RECONCILED
RELEASED
EXPIRED
FAILED
```

Reservations must expire automatically if the process crashes.

No quota may remain permanently locked because a worker died.

---

# 11. IDEMPOTENCY

Every request requires a unique requestId.

Repeated execution of the same request must not double-charge usage.

Retries must be idempotent.

A provider timeout must not automatically result in uncontrolled duplicate AI calls.

Streaming retries must also be handled safely.

---

# 12. 5-HOUR WINDOW

Implement a true rolling five-hour window.

At time T:

5-hour usage =
all applicable consumption from:

T - 5 hours

through:

T

Old usage automatically leaves the window.

Do not use:

"reset at midnight"

or:

"reset at 5 PM."

It must be a rolling window.

---

# 13. MONTHLY BILLING PERIOD

Monthly quota follows the user's actual subscription billing period.

Do not blindly reset every account on the 1st if the billing system uses different renewal dates.

Every usage event must contain:

billingPeriodId

Usage must belong to exactly one billing period.

---

# 14. PLAN CHANGE HANDLING

Implement correct behavior for:

Free → Creator
Creator → Pro
Pro → Business
Business → Pro
Pro → Creator
Creator → Free

Rules:

### Upgrade

New entitlement becomes active according to the existing subscription system.

Do not accidentally multiply old allowance.

### Scheduled downgrade

Existing higher-plan access remains until the downgrade takes effect.

### Immediate cancellation

Use the subscription system's actual entitlement state.

Never trust the frontend.

All changes must be auditable.

---

# 15. MODEL ACCESS MATRIX

Implement the following:

| Model Tier | Free | Creator | Pro | Business |
|---|---|---|---|---|
| Cheap | Full | Full | Full | Full |
| Medium | Limited | Full | Full | Full |
| Premium | 5 previews/month | Controlled | High | High |
| Ultra | No | No/very limited | Controlled | High |

The exact model-to-plan configuration must be centralized.

---

# 16. FREE PREMIUM PREVIEW

Free users receive:

### 5 Premium model requests per billing period.

These requests must still consume:

- VGU
- 5-hour capacity
- monthly capacity
- concurrency
- model-specific allowance

They are not a quota bypass.

After five:

```text
Premium preview allowance reached.
```

Offer:

### Continue with Fast

or:

### Upgrade to Creator

---

# 17. PREMIUM MODEL LIMIT

Premium models must have a separate model-specific budget.

Example:

Creator:

```text
overall VGU: 1,200
premium allocation: configurable
```

Pro:

```text
overall VGU: 5,000
premium allocation: configurable
```

Business:

```text
overall VGU: 12,000
premium allocation: configurable
```

Do not allow a user to consume the entire monthly allowance on the most expensive model unless the configured economics explicitly allow it.

---

# 18. ULTRA MODEL LIMIT

Ultra models are protected separately.

Default:

Free: unavailable

Creator: unavailable

Pro: limited

Business: higher allowance

Ultra usage consumes the highest VGU multiplier.

---

# 19. FEATURE COSTS

Feature usage must be separately classified.

At minimum support:

- normal chat
- content generation
- strategy
- competitor analysis
- social listening
- web search
- image analysis
- video analysis
- deep research
- Autopilot
- agent workflows

Each feature can have:

- base VGU
- model multiplier
- tool multiplier
- maximum VGU/request
- monthly feature cap
- concurrency limit

---

# 20. WEB SEARCH

Web search adds consumption on top of the model request.

Initial tool multiplier:

### +4 VGU equivalent

But actual tool/provider cost must be recorded separately.

If the provider exposes actual search/tool cost, reconcile against actual usage.

---

# 21. IMAGE / VIDEO ANALYSIS

Image/video analysis must add additional consumption.

Initial baseline:

### +3 VGU

Actual provider/token/vision cost must still be recorded.

Do not assume every image or video has identical cost.

Large inputs must be accounted for.

---

# 22. DEEP RESEARCH

Deep Research is a high-risk cost feature.

Do NOT treat it as permanently:

"40 VGU exactly."

Instead:

### Initial estimated base:

40 VGU

Then add:

- model usage
- search/tool calls
- number of model calls
- input tokens
- output tokens
- reasoning tokens
- context
- other provider costs

The final VGU is based on actual consumption.

Before execution, show an estimate where appropriate:

> Estimated VeeGPT usage: ~40–100 VGU

The actual amount is reconciled after completion.

Deep Research also has:

- maximum VGU per job
- monthly feature allowance
- maximum concurrent research jobs
- maximum provider calls
- timeout
- retry limit

A single research job must never be able to consume an uncontrolled amount.

---

# 23. AUTOPILOT

Autopilot is a high-risk AI cost source.

Implement:

- plan-specific Autopilot allowance
- maximum VGU/job
- maximum model calls/job
- maximum execution duration
- concurrency limit
- retry limit
- monthly Autopilot budget

Autopilot cannot continue indefinitely.

If the job reaches its VGU ceiling:

stop safely and report:

> Autopilot reached its AI capacity for this task.

Never allow an agent loop to generate unlimited provider calls.

---

# 24. BACKGROUND AI JOBS

Every background AI job must contain:

- userId
- workspaceId
- subscriptionId
- plan
- billingPeriodId
- feature
- jobId
- requestId

Background jobs must use exactly the same VGU engine as synchronous requests.

There must be no second quota system for workers.

---

# 25. AI ENDPOINT INVENTORY

Scan the complete codebase for every:

- OpenAI SDK call
- Gemini SDK call
- Anthropic SDK call
- LiteLLM call
- provider HTTP request
- streaming request
- AI worker
- queue job
- scheduled AI task
- Autopilot operation
- research operation
- content-generation operation
- image operation
- video operation
- summarization
- embedding
- transcription
- TTS

Every AI-producing operation must be accounted for.

If one bypass exists, the implementation is NOT complete.

---

# 26. SERVER-SIDE SECURITY

Never trust client-provided:

- plan
- model entitlement
- VGU
- userId
- workspaceId
- subscription
- credit balance

Resolve these from trusted server-side data.

Frontend restrictions are UX only.

The backend is authoritative.

---

# 27. DIRECT MODEL BYPASS

A user must not be able to send:

```text
model = expensive-model
```

directly to an endpoint and bypass model access rules.

The backend must resolve:

User
→ Workspace
→ Subscription
→ Plan
→ Entitlement
→ Model Registry
→ Usage Eligibility

before execution.

---

# 28. SILENT FALLBACK IS FORBIDDEN

If the user explicitly selects Premium:

Premium runs while the user has sufficient entitlement and capacity.

If Premium is unavailable because of quota:

DO NOT silently switch to Fast.

Return a structured response.

Example:

```json
{
  "code": "MODEL_QUOTA_EXHAUSTED",
  "suggestedModel": "fast",
  "upgradeAvailable": true,
  "retryAt": "..."
}
```

Frontend then asks:

> Premium AI capacity reached. Continue with VeeGPT Fast?

Only switch after user approval.

---

# 29. AUTO MODEL MODE

If the user selects:

### Auto

VeeGPT may route automatically.

Example:

Simple task
→ Cheap

Medium task
→ Medium

Complex task
→ Premium

Very complex task
→ Ultra if plan allows it.

The router should optimize:

- quality
- cost
- latency
- remaining user capacity

Do not always choose the most expensive model.

---

# 30. USER-SELECTED MODEL

If the user explicitly selects a model:

Respect it if:

- plan permits it
- model allocation permits it
- 5-hour quota permits it
- monthly quota permits it
- feature permits it
- concurrency permits it

Otherwise explain why it cannot run.

Never silently downgrade.

---

# 31. RATE LIMITING

VGU quotas are separate from request rate limits.

Implement:

### Requests/minute

Example initial:

Free: 10/min
Creator: 20/min
Pro: 40/min
Business: 80/min

### Concurrent AI requests

Example initial:

Free: 1
Creator: 2
Pro: 4
Business: 10

These are configurable.

Do not let high VGU allowances create unlimited simultaneous provider calls.

---

# 32. ABUSE PROTECTION

Detect:

- abnormal request frequency
- repeated identical requests
- excessive failures
- abnormal context sizes
- abnormal premium usage
- abnormal concurrent requests
- automated traffic
- suspicious account behavior

Do not automatically punish users from one signal.

Use a combination of signals.

---

# 33. REDIS FAILURE

Redis is the hot-path quota enforcement layer.

MongoDB is the durable ledger.

If Redis is unavailable:

DO NOT fall back to unlimited execution.

For high-cost models:

### Fail closed.

For low-risk cheap operations:

a controlled temporary fallback is permitted only if explicitly bounded.

Never allow Redis outage to create unlimited premium AI usage.

---

# 34. MONGODB FAILURE

If the durable ledger is temporarily unavailable:

Do not lose the usage event.

Use a durable retry/outbox mechanism or equivalent.

Do not silently execute large volumes of expensive AI requests with no auditable record.

---

# 35. PROVIDER FAILURE

Handle:

- timeout
- 4xx
- 5xx
- rate limit
- partial response
- connection failure
- streaming interruption

Reservations must be reconciled.

Provider failure must not permanently consume the user's entire reservation unless actual usage occurred.

---

# 36. STREAMING

Streaming must support:

- partial output
- client disconnect
- provider disconnect
- timeout
- cancellation
- successful completion

Actual usage must still be recorded.

Reservations must always reach a terminal state.

---

# 37. RETRIES

Retries must be bounded.

Never blindly retry expensive AI requests indefinitely.

Implement:

- maximum retry count
- exponential backoff
- provider-aware retry rules
- idempotency
- reservation handling

Each retry must be economically accounted for.

---

# 38. BUSINESS POOL

Business monthly allowance:

### 12,000 VGU shared.

Default seat safety cap:

### 40% of pool.

For 12,000:

one seat normally cannot consume more than:

### 4,800 VGU.

The cap is configurable.

The administrator can change it.

The shared pool remains the primary Business quota.

---

# 39. BUSINESS CONCURRENCY

Business receives higher concurrency but remains bounded.

Initial:

10 simultaneous AI operations/workspace.

This must be configurable.

---

# 40. TOP-UP SYSTEM

Use existing Veefore credit packs for monthly additional capacity.

Top-ups:

- increase available monthly economic capacity
- do not increase 5-hour burst capacity
- do not unlock restricted models
- do not bypass feature caps
- do not bypass concurrency
- do not bypass abuse protection

If Premium is unavailable because of model-specific entitlement, buying generic credits must not magically unlock Premium.

---

# 41. USAGE EXPIRATION

5-hour usage expires naturally from the rolling window.

Monthly usage remains associated with its billing period.

Unused monthly allowance does not carry forward unless the existing commercial subscription explicitly promises rollover.

Do not accidentally create unlimited accumulation.

---

# 42. USER UX

Normal users should NOT constantly see:

"37/1200 VGU."

Instead use simple language.

### Normal

No warning.

### 70%

"You're using VeeGPT heavily this month."

### 85%

"You're getting close to your VeeGPT allowance."

### 95%

"You're almost at your monthly VeeGPT limit."

### 100%

"Your monthly VeeGPT allowance has been reached."

Provide:

- reset date
- upgrade
- applicable top-up

---

# 43. MODEL LIMIT UX

When Premium is exhausted:

> Premium AI capacity reached.

> You can continue with VeeGPT Fast, or upgrade for more Premium AI capacity.

Buttons:

**Continue with Fast**

**Upgrade**

When the 5-hour limit is exhausted:

> You've reached your short-term VeeGPT capacity.

> Your capacity will become available again at [time].

When monthly capacity is exhausted:

> You've reached your monthly VeeGPT allowance.

---

# 44. SETTINGS / BILLING PAGE

Show detailed usage:

### Monthly VeeGPT

used / total

### 5-hour capacity

used / total

### Premium AI

used / allowance

### Deep Research

used / allowance

### Autopilot

used / allowance

### Reset

exact timestamp

### Plan

current subscription

### Upgrade

recommended next plan

Do not expose unnecessarily technical provider pricing.

---

# 45. ADMIN USAGE DASHBOARD

Create internal analytics showing:

## Plan

- users
- VGU
- provider cost
- revenue
- estimated gross margin
- P50
- P90
- P95
- P99

## Model

- requests
- tokens
- VGU
- provider cost
- cost/request
- failure rate

## Feature

- requests
- VGU
- provider cost
- revenue association

## Workspace

- usage
- cost
- highest consumers

---

# 46. COST MONITORING

Track:

```text
providerCost
VGU
subscriptionRevenue
creditRevenue
AI gross contribution
```

Calculate:

```text
AI Gross Contribution =
Subscription + Credit Revenue - AI Provider Cost
```

Do not confuse this with company net profit.

---

# 47. MODEL PRICING REGISTRY

Maintain pricing configuration containing:

- provider
- model
- version
- input price
- output price
- reasoning price
- cached input price
- effectiveFrom
- effectiveTo
- currency

Never hard-code provider pricing in route logic.

Historical usage must retain the pricing version that applied at execution time.

---

# 48. EMERGENCY CONTROLS

Admin must be able to immediately:

- disable a model
- disable Premium
- disable Ultra
- disable Deep Research
- disable Autopilot
- reduce concurrency
- reduce model multiplier
- reduce feature multiplier
- disable a provider

These controls must not require application redeployment.

Every emergency change must be audited.

---

# 49. ADMIN AUTHORIZATION

Only authorized administrators may change:

- quotas
- multipliers
- pricing
- model availability
- emergency controls

Use existing RBAC.

Every change must record:

- administrator
- previous value
- new value
- timestamp
- reason

---

# 50. AUDIT LEDGER

Every AI operation must have a durable usage event.

Required:

```text
requestId
reservationId
userId
workspaceId
subscriptionId
billingPeriodId
plan
provider
model
modelVersion
modelTier
feature
inputTokens
outputTokens
reasoningTokens
cachedTokens
estimatedVGU
actualVGU
estimatedProviderCost
actualProviderCost
status
timestamp
```

Do not store sensitive prompt content unless explicitly necessary.

---

# 51. DATA INTEGRITY

Usage accounting must satisfy:

```text
actualVGU >= 0
reservedVGU >= 0
remainingVGU >= 0
```

No double charging.

No negative counters.

No duplicate reconciliation.

No lost reservation.

No orphaned reservation.

---

# 52. IDEMPOTENT RECONCILIATION

Calling reconciliation twice for the same request must produce the same final result as calling it once.

Example:

```text
request A
reservation 20 VGU

actual = 15 VGU

reconcile
→ release 5

reconcile again
→ no additional change
```

This must be enforced at the data layer.

---

# 53. USAGE CONSISTENCY

Redis counters and MongoDB ledger may temporarily differ during normal operation.

But the system must provide reconciliation.

Implement a reconciliation mechanism that can identify:

- Redis counter mismatch
- missing usage event
- duplicate usage event
- orphaned reservation
- stale reservation

The reconciliation process must repair counters safely.

---

# 54. NO MESSAGE-BASED LIMIT LOGIC

Remove old logic that says:

"user has X messages remaining"

as the actual enforcement mechanism.

The UI may still communicate approximate usage in friendly terms.

But backend enforcement must use VGU and entitlement rules.

---

# 55. MIGRATION

Do not delete existing usage data.

Preserve historical message usage.

Start VGU accounting at the migration point where historical token data is not available.

Do not invent historical VGU.

Existing subscription entitlements must be preserved according to the grandfathering rules.

---

# 56. LOGGING

Log enough to diagnose quota problems.

Every decision should be traceable through:

requestId.

Log:

- plan
- model
- feature
- estimated VGU
- reservation
- actual VGU
- quota result
- rejection reason
- provider result

Never log:

- API keys
- passwords
- sensitive credentials
- unnecessary private prompt contents

---

# 57. ALERTS

Create alerts for:

### Critical

- unexpected AI cost spike
- premium usage spike
- Redis quota failure
- reconciliation failure
- reservation leak
- quota bypass
- AI endpoint without enforcement

### Warning

- high VGU usage
- unusual model distribution
- abnormal user usage
- provider pricing mismatch

---

# 58. LOAD TESTING

Test at minimum:

- 100 simultaneous requests
- 500 simultaneous requests
- concurrent requests from one user
- concurrent requests across Business seats
- quota boundary races
- Redis latency
- provider latency
- provider failure
- reservation expiration

The system must never overspend quotas due to race conditions.

---

# 59. SECURITY TESTING

Attempt:

- modified model ID
- modified plan ID
- modified user ID
- modified workspace ID
- direct API calls
- old endpoints
- undocumented endpoints
- repeated request IDs
- concurrent duplicate requests
- expired subscription
- downgraded subscription
- premium endpoint from Free
- background-job abuse

All must be rejected or handled correctly.

---

# 60. ACCEPTANCE TEST: FREE

Verify:

- Free user can use Cheap
- Free user has limited Medium access
- Free user receives exactly 5 Premium previews/billing period
- Premium preview consumes VGU
- Premium preview consumes 5-hour capacity
- Premium preview consumes monthly capacity
- Premium cannot be bypassed through API
- after premium previews are exhausted, Fast remains usable
- after monthly VGU is exhausted, AI is stopped appropriately
- reset timestamps are correct

---

# 61. ACCEPTANCE TEST: CREATOR

Verify:

- 1,200 monthly VGU
- 100 rolling 5-hour VGU
- Premium has separate protection
- Deep Research has feature protection
- Fast remains usable after Premium exhaustion
- top-up works only within allowed rules
- upgrade to Pro works correctly

---

# 62. ACCEPTANCE TEST: PRO

Verify:

- 5,000 monthly VGU
- 300 rolling 5-hour VGU
- high Premium allowance
- controlled Ultra allowance
- research limits
- Autopilot limits
- concurrency
- top-ups
- downgrade behavior

---

# 63. ACCEPTANCE TEST: BUSINESS

Verify:

- 12,000 shared monthly pool
- 800 rolling 5-hour workspace capacity
- 40% default per-seat cap
- multiple seats share pool
- one seat cannot drain the entire pool
- admin can change seat cap
- Business concurrency works
- workspace-level usage analytics work

---

# 64. PRODUCTION SAFETY

Before declaring completion:

Run:

- unit tests
- integration tests
- concurrency tests
- quota boundary tests
- provider failure tests
- Redis failure tests
- Mongo failure tests
- security bypass tests
- streaming tests
- background worker tests
- subscription lifecycle tests
- load tests

Fix all Critical and High severity findings.

No known quota bypass may remain.

---

# 65. FINAL CODE QUALITY REQUIREMENTS

The implementation must:

- use TypeScript types
- avoid duplicated business logic
- use clear service boundaries
- use centralized configuration
- have meaningful error codes
- have structured logging
- have comments only where useful
- avoid magic numbers
- avoid silent fallback
- avoid unbounded retries
- avoid unbounded AI loops
- avoid unnecessary MongoDB queries
- avoid unnecessary Redis operations
- preserve existing Veefore architecture

Do not create unnecessary microservices.

The current Node.js/Express + MongoDB + Redis architecture is sufficient.

---

# 66. FINAL PRODUCTION CHECK

Do not declare success because:

- the application starts
- TypeScript compiles
- tests pass superficially
- the frontend displays a usage bar

Declare success only when:

### Cost Protection
No uncontrolled AI spending path exists.

### Security
No client-side quota bypass exists.

### Concurrency
Atomic reservation prevents overspending.

### Accounting
Actual provider usage is reconciled.

### Reliability
Provider/Redis/Mongo failures are handled safely.

### Coverage
Every AI endpoint and worker is protected.

### UX
Users can continue using cheaper models when expensive capacity is exhausted.

### Billing
Plan changes and billing periods are correct.

### Business
Shared workspace quota and seat caps work.

### Observability
Usage and cost are auditable.

### Testing
Boundary, race, failure, security, and load tests pass.

---

# 67. FINAL IMPLEMENTATION INSTRUCTION

Perform this work in this exact order:

## PHASE 1 — Inspect

Read the complete existing implementation.

## PHASE 2 — Map

Create an inventory of every AI-producing operation.

## PHASE 3 — Compare

Compare the current system against this specification requirement-by-requirement.

## PHASE 4 — Fix

Implement every missing or incorrect requirement.

## PHASE 5 — Test

Run all tests and add missing tests.

## PHASE 6 — Attack

Attempt to bypass the system intentionally.

## PHASE 7 — Load test

Test concurrency and quota races.

## PHASE 8 — Verify

Confirm actual usage reconciliation.

## PHASE 9 — Verify economics

Calculate actual observed provider cost versus VGU consumption.

## PHASE 10 — Finalize

Remove all temporary TODOs and incomplete placeholders related to usage control.

---

# 68. FINAL DELIVERABLE

At completion provide:

### 1. Architecture summary

What exists now.

### 2. Files changed

Every changed file.

### 3. Database changes

Schemas/indexes/migrations.

### 4. Redis changes

Keys/scripts/TTL/atomic operations.

### 5. API changes

New/modified endpoints and error codes.

### 6. Model registry

Every model and tier.

### 7. Plan matrix

Final production limits.

### 8. Feature matrix

Feature costs and limits.

### 9. Security report

All bypass attempts and results.

### 10. Load-test report

Concurrency results.

### 11. Cost report

Observed provider costs and VGU distribution.

### 12. Test report

Tests passed/failed.

### 13. Known limitations

Only genuine external limitations.

Do NOT list things as "future improvements" if they are required by this specification.

---

# 69. FINAL STANDARD

The final VeeGPT system should behave like a mature AI SaaS product:

Users get enough capacity to genuinely enjoy VeeGPT.

Cheap models are inexpensive to use.

Medium models consume more capacity.

Premium models consume substantially more.

Very expensive models are tightly controlled.

Free users get a meaningful premium experience.

Paid users get substantially better capacity.

Heavy users naturally encounter upgrade/top-up opportunities.

Users are never silently downgraded.

The backend—not the frontend—controls access.

AI usage is reserved before execution.

Actual usage is reconciled after execution.

Every AI call is auditable.

Concurrent requests cannot bypass limits.

Background AI cannot bypass limits.

Redis failure cannot create unlimited AI spending.

Provider failures cannot create accounting chaos.

Business users share a controlled pool.

Admins can observe and control AI economics.

And most importantly:

**Veefore must never be exposed to an uncontrolled AI-cost liability simply because a user found an endpoint, model, feature, retry path, background worker, or concurrency race that bypasses the quota system.**

Do not stop until all requirements above are implemented, tested, and verified.