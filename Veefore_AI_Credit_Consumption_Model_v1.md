# Veefore AI Credit Consumption Model (v1)

> **Status:** IMPLEMENTED — July 19, 2026.
> **Scope:** dynamic AI credit allocation, display, reservation, settlement, automation charging, and background Performance Overview metering for the approved Free-plan model.

---

## 1. What you asked for (my understanding)

1. **Free plan = exactly 50 AI credits / month**, correctly allocated, correctly shown to the user, and correctly spent.
2. **We must always be in profit** — a credit charge must never cost us less than what the AI operation actually costs us.
3. **VeeGPT chat itself does NOT spend credits.** Chatting with VeeGPT is free.
   - **Exception:** when VeeGPT (or the Create Post flow) actually **generates a caption or hashtags**, *that* generation spends credits.
   - So credit spend for VeeGPT is limited to its **caption** and **hashtag** sub-actions only.
4. **AI Auto DM and AI Comment automation spend `0.3` credits per DM / per comment** (fixed rate you specified).
5. **AI Banner, AI Recommendations, and every other AI feature also spend credits** — but the amount must be **balanced and task-based, NOT a baseless flat "1 credit for everything."** A cheap task costs little; a heavier task costs more.

> **Correction (important):** The **"AI Banner Generator"** in the plans is **NOT** an image generator. It is the **Performance Overview insight banner** — the dark "Monthly Performance" card that shows an AI-written headline + tip (e.g. *"This month saw a steady follower count, with a significant surge in comments…"*). It is produced by `generateAnalyticsInsight()` — a **cheap text LLM call** (Gemini / GPT-4o-mini), and it **auto-regenerates in the background whenever the user's Instagram data changes** (signature-cached for 4h, run by `insightsWorker`). This is a very different cost and trigger profile from image generation, and this doc has been corrected to reflect it.
6. **Costs must be DYNAMIC** — calculated from the *actual work done* (tokens, output size, model used, number of images), not a hardcoded fixed integer per feature.

---

## 2. What already exists in the code (so we build on it, not around it)

| Thing | Location | State |
|---|---|---|
| Plan definitions (Free = 50 credits) | `server/config/plan-config.ts` → `PLAN_CONFIG.free.limits.aiCreditsPerMonth = 50` | ✅ correct |
| Flat credit costs (caption=1, hashtag=1, banner=2, …) | `server/config/plan-config.ts` → `CREDIT_COSTS` | ⚠️ flat / baseless — to be replaced |
| Credit balance store | `AICredits` collection (`monthlyCredits`, `purchasedCredits`, `rolloverCredits`, `usedThisCycle`, `remainingCredits`) | ✅ good |
| Atomic deduction | `AICreditsRepository.deductCredits()` (conditional aggregation-pipeline update) | ✅ canonical spend path for reservations and settlement |
| Credit gate middleware | `requireCredits(amount)` in `entitlement.middleware.ts` | ✅ fast preflight; `AICreditMeteringService` performs the authoritative atomic reservation |
| **Per-token usage ledger** | `server/services/aiUsageTracker.ts` → `AIUsageEvent` (real prompt/completion/cached tokens per feature+model) | ✅ **this is the key — it already measures real cost** |
| Legacy credit system | `server/services/AICreditService.ts` → deducts from `User.credits` | ⚠️ parallel/duplicate — to be retired |
| VeeGPT credit spend | `veegpt-chat.routes.ts` | ❌ deducts nothing today |

**Conclusion:** we already *measure* the real cost of every AI call. We just aren't *charging* against it. The dynamic model connects the two.

---

## 3. Core design principles

1. **A credit represents real cost, not a vibe.** Every charge is derived from the operation's measured cost.
2. **Dynamic = measured after the fact.** We reserve an upper-bound before the call, then settle the *actual* charge from the real token/image usage the tracker records.
3. **Floors and normal reservation ceilings on every operation.** A floor prevents undercharging (protects profit + stops spam). The configured ceiling is deducted atomically before generation as the normal upper-bound reservation; measured usage usually settles below it. If provider cost unexpectedly exceeds it, the profit-safe overage is charged rather than silently clamped.
4. **Profit is structurally protected:** `creditCharge × creditCostBudget ≥ actualProviderCost × marginTarget`. The measured charge is never capped below this formula.
5. **One system only.** All spend flows through the new `EntitlementService` + `AICredits`. The legacy `AICreditService`/`User.credits` path is retired.

---

## 4. The economic anchor (how a "credit" is priced)

We define one internal constant:

```
CREDIT_COST_BUDGET = ₹0.60   // the MAX real AI provider cost we allow 1 credit to absorb
```

Meaning: 1 credit is allowed to "cover" up to ₹0.60 of real provider spend. Because most text operations cost us **far less than ₹0.60**, those operations are almost pure margin and are priced by *perceived value* (their floor), not by cost. Only genuinely expensive operations (images) approach or exceed the budget, and for those the dynamic formula raises the credit charge to stay profitable.

**Retail sanity check:** Creator plan = 500 credits for ₹799 ⇒ ₹1.60 retail per credit vs ₹0.60 max cost per credit ⇒ **≥62% gross margin** even in the worst case, and ~99% margin on typical text ops.

> These are approximate current provider prices (Gemini Flash-Lite, GPT-4o-mini, GPT-4o, DALL·E 3, GPT-3.5). They are **read from a config table** so we can update them when providers change pricing — the model recalculates automatically.

### Reference provider costs used (approx, INR)

| Provider / model | Real cost | Used by |
|---|---|---|
| Gemini 2.5 Flash-Lite | ~₹0.008 / 1K output tok | captions, hashtags, **insight banner**, recommendations (primary) |
| GPT-4o-mini (fallback) | ~₹0.05 / 1K output tok | same, when Gemini unavailable |
| GPT-4o | ~₹0.85 / 1K output tok | video script, thumbnails (heavy paths only) |
| GPT-3.5-turbo | ~₹0.0006 / intent call | automation intent classification |
| DALL·E 3 — standard / HD 1024² | ~₹3.4 / ~₹6.7 per image | **separate** AI Image feature in Create Post (NOT the plan's "AI Banner Generator") |

> Note: text generation is the dominant path. Almost every plan feature (captions, hashtags, the insight banner, recommendations, insights) is **cheap text** on Gemini/GPT-4o-mini. The only genuinely expensive path is DALL·E image generation, which is a **separate** Create-Post feature, not the Performance banner.

---

## 5. The dynamic cost formula

For every AI operation we compute:

```
providerCost  = Σ over each LLM/image call in the operation:
                  (promptTokens × modelInPrice)
                + (completionTokens × modelOutPrice)
                + (cachedTokens × modelInPrice × 0.10)     // cached prompt tokens ~10% price
                + (imageCount × imageUnitCost)

rawCredits    = (providerCost × MARGIN_TARGET) / CREDIT_COST_BUDGET

creditCharge  = max( roundUpToStep(rawCredits, 0.1), OP_FLOOR )
reservation   = OP_NORMAL_CEILING
```

- `MARGIN_TARGET = 1.5` (we want to recover 1.5× our cost at minimum on the marginal charge).
- `roundUpToStep(x, 0.1)` always rounds upward so cost recovery is not weakened.
- `OP_FLOOR` sets the minimum anti-spam/value charge.
- `OP_NORMAL_CEILING` is the amount atomically reserved before generation. It is the expected maximum, not an undercharging cap; a measured overage is recovered in full.
- `providerCost` comes straight from the `AIUsageEvent` the tracker already writes, so the charge reflects **the actual generation**, not an estimate.

**Why this is dynamic:** two caption generations can cost different amounts — a short one-line caption costs the floor; a long multi-variant caption with image analysis costs more. Same feature, different charge, driven by real work. The listed ceiling is the normal reservation, not a profitability-breaking hard cap.

---

## 6. Per-operation credit table

Amounts below are the **floor / typical / ceiling**. Typical = what a normal single use costs; it slides with real usage.

### 6.1 Create-Post & VeeGPT content generation (spend credits)

| Operation | Where it triggers | Model | Floor | Typical | Ceiling | Dynamic driver |
|---|---|---|---|---|---|---|
| **Caption generation** | Create Post flow **and** VeeGPT `post_caption` | Gemini / 4o-mini | **0.5** | 0.5 – 1.0 | **2.0** | # variants, output length, image analysis add-on |
| **Hashtag generation** | Create Post flow **and** VeeGPT `post_hashtags` | Gemini / 4o-mini | **0.3** | 0.3 – 0.6 | **1.0** | # hashtags, output length |
| **Media/vision analysis** (when caption reads an uploaded image/video) | Create Post / VeeGPT | Vision | +0.5 | +0.5 | +1.0 | # images, video frames |
| **AI Rewrite / adapt caption** | Rewrite action (Creator+) | Gemini / 4o-mini | **0.5** | 0.5 – 1.0 | **2.0** | input length, output length |

> **VeeGPT chat = 0 credits.** Only the `post_caption` and `post_hashtags` sub-actions above are charged. Memory, titles, intent parsing, plain conversation = free.

### 6.2 AI Automation (spend credits — fixed rate you specified)

| Operation | Trigger | Charge | Notes |
|---|---|---|---|
| **AI Auto DM** | Each AI-handled DM sent | **0.3** (fixed) | Charged only when the DM path uses AI (AI intent match or AI-generated reply). Pure static-template replies with no AI = **0 credits**. |
| **AI Comment reply** | Each AI-handled comment reply | **0.3** (fixed) | Same rule as above. |

> These two are intentionally **flat at 0.3** per your instruction. They bypass the dynamic formula (the underlying AI call is a tiny intent classification, so 0.3 is comfortably profitable).

### 6.3 AI Insights & Recommendations (spend credits — balanced, plan-gated)

| Operation | Plan gate | Model | Floor | Typical | Ceiling | Dynamic driver |
|---|---|---|---|---|---|---|
| **Basic recommendations** | Free | Gemini / 4o-mini | **1.0** | 1.0 | **3.0 reservation** | bounded to 2 concise recommendations |
| **AI recommendations** | Creator | Gemini / 4o-mini | **1.0** | 1.0–2.0 | **3.0 reservation** | bounded to 3 recommendations |
| **Advanced growth recommendations** | Pro+ | Gemini / 4o-mini (large prompt) | **1.0** | 2.0 | **3.0 reservation** | full dataset, up to 5 recommendations |
| **Analytics insight** | Pro+ | Gemini / 4o-mini | **0.5** | 1.0 | **2.0** | metrics volume, output length |
| **Business insight** | Business+ | Gemini / 4o-mini | **1.0** | 2.0 | **3.0** | dataset breadth |
| **Content plan** | Pro+ | Gemini / 4o-mini | **1.0** | 2.0 | **3.0** | # days / # posts planned |

> **Growth recommendations & analytics insight are also background/cached** (same `insightsWorker` + signature-cache as the banner). They follow the **same charging rules as §6.4**: charged only on a real regeneration (not on view), capped per month, attributed to the workspace owner, never charged on failure. Amounts were lowered from the earlier draft because these are cheap text ops, not heavy compute.

### 6.4 Performance Overview insight banner — the corrected "AI Banner Generator"

This is the auto-generated **Monthly/Weekly/Today Performance** insight card. It is cheap text, and — critically — it is **triggered by the system** (background `insightsWorker`) when the user's data changes, not by a user click.

| Operation | Model | Floor | Typical | Ceiling | Dynamic driver |
|---|---|---|---|---|---|
| **Insight banner regeneration** | Gemini / 4o-mini | **0.2** | 0.3 | **0.5** | dataset size, output length |

**Charging rules (to prevent silent drain & spam):**
1. **Charged per REAL regeneration only** — i.e. only when the worker actually calls the AI (cache miss / data signature changed / forced refresh). Simply *viewing* a cached banner = **0 credits**.
2. **Naturally rate-limited** — the banner is signature-cached for 4h with a 10-min failure cooldown, so it regenerates only a handful of times per month per workspace even for active accounts.
3. **Monthly auto-generation safety cap** — background regenerations are capped at **20 / month / workspace**. The slot is reserved before the provider call. Beyond the cap, generation is skipped and a separate persistent last-known banner is served **without charging**, so automatic activity cannot silently drain the Free 50-credit budget.
4. **Attributed to the workspace owner.** Never charged for a failed generation.

> Real cost of one banner ≈ ₹0.01 (text). At 0.2–0.5 credits it is trivially profitable while still honoring your instruction that the banner "uses credits."

### 6.5 Other AI media (separate features)

| Operation | Model | Floor | Typical | Ceiling | Dynamic driver |
|---|---|---|---|---|---|
| **AI Image generation** (Create Post — separate from banner) | DALL·E 3 std/HD + gpt-4o | **8.0** | 8.0 | 14.0 | resolution/quality, +bundled caption/hashtag |
| **Video script** | gpt-4o | **2.0** | 3.0 | 5.0 | script length |

> The **AI Image generation** row is the *only* expensive operation (DALL·E ₹3.4–6.7/image). It is a **distinct** Create-Post feature — **not** the Performance banner. Its high floor (8+) is what keeps image generation profitable. If image generation is not part of the Free-plan feature set, this simply never applies to free users.

---

## 7. How the money is actually taken: Reserve → Settle

Because the charge is dynamic (known only *after* generation), we use a two-step pattern:

1. **Reserve (before the call):** atomically deduct the operation's normal ceiling from canonical `AICredits`. Concurrent requests therefore cannot all pass a read-only check and spend the same balance.
2. **Generate:** run the AI operation inside `collectAIUsage()`; direct OpenAI calls explicitly record provider-reported usage.
3. **Settle (after the call):** compute the measured charge via §5. If it is below the reservation, atomically refund the difference. If measured provider cost exceeds the normal reservation, recover the profit-safe overage instead of clamping it.
4. **Success boundary:** an operation is successful only when its required output is semantically usable (for example, non-empty captions, enough valid hashtags, or a non-empty insight) and any required product persistence has completed. Provider HTTP success alone is not enough.
5. **Failure = full refund:** thrown provider failures, invalid/empty output, failed external sends, and required persistence failures all trigger an idempotent full refund. Optional telemetry, audit, cache invalidation, and history logging are best-effort after success and cannot turn a completed action into a charged failure.
6. **Durable recovery:** every reservation, overage, measured adjustment, and full refund has a stable mutation key. If a database/network response is uncertain, retries inspect those keys and apply each debit/refund at most once. Unfinished refunds remain `refund_pending` and are retried whenever the account is accessed; a refund recovered after a monthly reset is preserved as purchased balance.
7. **External side effects:** for AI-assisted Instagram automation, the successful Instagram send is the billing boundary. A false/thrown send refunds `0.3`; completion/audit/logging failures after Instagram accepted the send are best-effort and do not refund or retry the delivered message.

This guarantees: (a) a user can never overspend, (b) credits are retained only for semantically successful actions, (c) failed actions are refunded exactly once even after uncertain responses, and (d) the charge is the true dynamic cost.

---

## 8. Fractional credits (0.3, 0.5 …) — storage & display

- Charges are fractional, so every settlement is **rounded to 2 decimals** and stored as a MongoDB `Number`; all writes remain atomic.
- The canonical `remainingCredits` field is the available balance. `monthlyCredits` remains the original plan allocation (50 for Free), while `usedThisCycle` records spend; this avoids the previous double-subtraction/display bug.
- **Display:** `/api/subscription/me` returns `aiCredits {remaining, monthly, purchased, usedThisCycle, nextResetAt}`. The billing usage panel displays the authoritative cycle spend and remaining amount, including purchased-credit usage correctly.

---

## 9. Free-plan profit analysis (worst case, 50 credits)

| If a free user spends ALL 50 credits on… | Credits each | # ops | Our real cost | Notes |
|---|---|---|---|---|
| Captions only | 0.5 | 100 | ~₹0.50 total | ~99% margin |
| Hashtags only | 0.3 | ~166 | ~₹0.30 total | ~99% margin |
| AI DMs/comments | 0.3 | ~166 | ~₹0.10 total | ~99% margin |
| Insight banners | 0.3 | ~166 | ~₹1.7 total | auto + capped at 20/mo → in practice ~6 credits/mo |
| Mixed real usage | — | — | **< ₹2 / month** | typical free user |

**Corrected worst case:** because the "AI Banner Generator" is cheap **text** (not a ₹6.7 image), the entire Free plan now runs on near-free text operations. A free user burning all 50 credits costs us **well under ₹2/month**, and the background insight banner is capped so it can't silently drain the quota. **Every path is deeply profitable.** ✅

> The only operation that could ever cost us more than it charges is **DALL·E image generation (§6.5)** — which is why its floor is 8+ and why it is a separate, plan-gated feature rather than part of the Free "AI Banner Generator."

---

## 10. Approved implementation decisions

1. **Economics:** `CREDIT_COST_BUDGET = ₹0.60/credit`; `MARGIN_TARGET = 1.5`.
2. **Performance Overview banner:** **0.2–0.5 credits per real regeneration**, never per view, with a **20/month/workspace** automatic-charge cap.
3. **AI automation:** **0.3 credits** per successfully sent AI-assisted DM/comment; static-template matching without AI costs 0.
4. **AI Image generation:** kept separate from the banner and standardized to DALL·E 3 standard 1024×1024; dynamic charge starts at 8 credits.
5. **Fractional storage:** canonical 2-decimal credit values, atomically written and rounded after settlement.
6. **Single balance:** `AICredits` / `EntitlementService` is authoritative. The legacy `AICreditService` remains only as a compatibility facade and now delegates to the canonical balance; it no longer reads or writes `User.credits`.

---

## 11. As-built implementation

- [x] Dynamic `CREDIT_MODEL` with per-operation floors/ceilings, provider price table, ₹0.60 budget, and 1.5× margin target.
- [x] Synchronous in-memory usage collection added to `aiUsageTracker`; provider analytics remain durable/fire-and-forget.
- [x] `AICreditMeteringService` atomically reserves the normal ceiling before generation, validates semantic success inside the metered unit, refunds failures, settles to measured usage, preserves versioned idempotent debit/refund transaction states, recovers uncertain and `refund_pending` mutations, invalidates balance cache best-effort, and reserves automatic insight slots before provider calls.
- [x] Required post-generation persistence participates in the success boundary: Create Post image storage and insight hot/last-known cache persistence refund on failure; optional audit/history logging cannot invalidate an otherwise successful user-visible action.
- [x] Free users initialize with exactly 50 credits; legacy 100-credit Free documents reconcile to 50; Free accounts lazily reset monthly even without a Subscription document.
- [x] Caption and hashtag generation settle dynamically in Create Post and return `creditsUsed` + `remainingCredits`.
- [x] Plain VeeGPT chat costs 0; only `generate_caption` and `generate_hashtags` settle credits.
- [x] Performance Overview is Free-access, generated as `growth.insight` text, and charged only on real regeneration. Hot-cache and persistent last-known reads cost 0; after 20 automatic generations the provider call is skipped.
- [x] Basic recommendations are available to Free (2 items), standard recommendations to Creator (3), and advanced growth recommendations to Pro+ (up to 5); all dedicated-route generations use canonical metering.
- [x] AI-assisted comment/DM sends reserve 0.3 against the workspace owner before the Instagram side-effect; successful sends retain the charge, failed sends refund it exactly once, and static rules cost 0.
- [x] DALL·E Create Post image generation is explicitly separate from the Performance Overview banner and uses canonical credits.
- [x] Subscription UI displays the fractional remaining amount, e.g. `AI Credits (47.4 left)`, against the unchanged plan allocation.
- [x] Legacy compatibility methods delegate to canonical `AICredits`; `User.credits` is no longer used by `AICreditService`.

---

**Implementation completed. The Performance Overview card shown in the reference image is the feature named “AI Banner Generator” in the Free plan.**
