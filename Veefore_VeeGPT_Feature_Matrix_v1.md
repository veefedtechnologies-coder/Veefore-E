# Veefore VeeGPT — Feature Matrix & Tiering (v1)

> How VeeGPT works, every capability it has, and exactly what each plan tier
> (Basic / Full / Advanced) unlocks.
>
> Source of truth for the VeeGPT tier gating. Plan → tier mapping mirrors
> `Veefore_Subscription_Plans_v1.md` and `server/config/plan-config.ts`
> (`features.veeGPTLevel`).

---

## 1. What VeeGPT is

VeeGPT is Veefore's in-app AI assistant. It is a **streaming chat** that can
hold a normal conversation AND take real actions in the user's workspace by
calling tools mid-reply (create/schedule posts, read analytics, research the
web, remember facts, etc.).

- **Transport:** one HTTP `POST` per message; the reply streams back as NDJSON
  (newline-delimited JSON events), not WebSocket.
- **Entry routes** (`server/routes/veegpt-chat.routes.ts`):
  - `POST /api/chat/conversations` — start a new chat + first message
  - `POST /api/chat/conversations/:conversationId/messages` — follow-up message
  - `GET  /api/chat/agents` — list selectable personas
- **Client:** `client/src/pages/VeeGPT.tsx` (composer, agent dropdown, account
  selector, forced-tool "+" menu, media upload) and
  `client/src/features/chat/hooks/useChatStream.ts` (reads the NDJSON stream,
  renders text + cards, updates the live credit balance).
- **Streamed event types:** `conversation`, `userMessage`, `status`,
  `aiMessageStart`, `chunk`, `toolCall` / `listCard` / `editCard` / `infoCard`,
  `complete`, `error`, `conversationTitle`.

---

## 2. Models & providers

Routing is decided in **one** place: `server/services/ai-model-routing.ts`
(`resolveRoute`). Dispatch happens in `server/services/AIServiceManager.ts`.

| Provider | Env | Use |
|---|---|---|
| Google Gemini | `GOOGLE_API_KEY` | Default hybrid chat; the only provider that reads video / PDF / HEIC |
| OpenAI | `OPENAI_API_KEY` | GPT-4.x and GPT-5.x families |
| GitHub Models | — | **RETIRED** (HTTP 410 `github_models_retirement_brownout`). Stored `github-*` ids are permanently mapped to the identical OpenAI model. |

### No fallback chains

The model the user selects in **Settings → AI Configuration** is the model that
runs. There are no retry chains: a failure surfaces as a real error instead of
silently walking to another provider. Exactly two things can change the model,
and both are deterministic and decided *before* any request is made:

1. **Capability.** No OpenAI chat model can read video, and OpenAI chat models
   cannot read PDFs or HEIC. Those requests go to Gemini regardless of the
   selection, reported to the caller via `overriddenFor`.
2. **Plan entitlement** (see §6b). A selection above the plan's model class is
   served by the best allowed class, and the user is told in the chat.

### Cost classes

Every selectable model has a cost **class**, defined once in
`shared/veegpt-model-classes.ts` so the server's pricing and the Settings badge
can never disagree. Classes come from real output-token prices:

| Class | Examples | Cost per reply | Cost basis |
|---|---|---|---|
| 🟢 **Light** | `veegpt-hybrid`, Gemini Flash-Lite, GPT-5 nano, GPT-4o mini, GPT-4.1 nano | **1 unit** | baseline (~₹0.09/turn) |
| 🔵 **Standard** | Gemini Flash (2.5 / 3.5 / 3.6), GPT-5 mini, GPT-4.1 mini, Claude Sonnet | **3 units** | ~4× light on output tokens |
| 🟣 **Premium** | GPT-4o, GPT-4.1, GPT-5 / 5.5 / 5.6, Gemini Pro, Gemini 3.1 Pro | **12 units** | ~17× light (charged 12× on purpose) |

An **unrecognised** model id is classed **premium**. Guessing "cheap" for an
unknown model is the one mistake that costs real money, and new frontier models
are exactly what appears without a pricing entry.

> `openai-gpt-4.1` is **premium**, not a sibling of `gpt-4.1-mini`: at $2/$8 per
> 1M tokens it is within ~20% of GPT-4o. Grouping it with the mini would
> undercharge it 4×.

---

## 3. Credit metering

Engine: `server/features/subscription/services/AICreditMeteringService.ts`
(`runMetered`) — reserves the feature ceiling, settles down to measured token
cost, refunds fully on failure/abort (Stop button).

- **Plain VeeGPT conversation is FREE** — `CREDIT_COSTS.veeGPTMessage = 0`.
- Only some tools settle credits (see the matrix). Credit costs
  (`CREDIT_MODEL` in `server/config/plan-config.ts`, in credits):

| Feature | Floor | Ceiling |
|---|---|---|
| captionGeneration | 0.5 | 2 |
| hashtagGeneration | 0.3 | 1 |
| aiRewrite | 0.5 | 2 |
| aiGrowthRecommendation | 1 | 3 |
| aiContentPlan | 1 | 3 |
| aiAnalyticsInsight | 0.5 | 2 |
| aiBusinessInsight | 1 | 3 |
| imageGeneration | 8 | 14 |

- **VeeGPT chat is not capped by a conversation count**, and it costs no AI
  credits. It is bounded by the **weighted unit budget** in §6b — a separate,
  non-purchasable fair-use allowance. Credits and units are deliberately
  different currencies:
  - **Credits** are a purchasable balance for discrete billable artifacts
    (captions, hashtags, images) at ~₹0.60 each, settled through a Mongo
    reserve→settle transaction.
  - **Units** are a fair-use rate limit for conversation, counted in Redis. They
    cannot be bought for the 5-hour window (that window is what flattens spiky
    load), and a heavy chat user can never exhaust the credits they need for
    captions and images.
- **Do not confuse this with `aiConversationsPerMonth`.** That limit
  (Free 30 · Creator 300 · Pro 3,000 · Business 30,000 · Enterprise unlimited)
  is an **Instagram automation** cap — the number of AI-drafted DM replies the
  automation engine sends per cycle (see `Veefore_Subscription_Plans_v1.md` →
  Automation section, and `EntitlementService.AutomationType.aiConversations`).
  It has nothing to do with how many times a user can chat with VeeGPT.

---

## 4. Full capability catalog (every tool & how it works)

Tools are defined in `server/routes/veegpt-tools.ts`, assembled per-request in
`veegpt-chat.routes.ts`, and dispatched via `buildInfoCard` /
`toolCallAccumulator.ts`. Tools are only offered when `enableTools === true`
and there are no image attachments in the turn.

### 4.1 Conversation (no tool)
Plain natural-language answers: ideas, brainstorming, writing help, questions,
explanations. Streams as typed text. Free.

### 4.2 Memory — `remember_fact`, `update_memory`, `forget_memory`
Long-term, cross-chat memory of user facts (niche, preferences, brand voice).
Backed by the `UserMemory` model + `veegpt-user-memory.logic.ts`. Offered when
workspace memory mode is `long-term` (default on). Free (no credit cost).

### 4.3 Read workspace — `get_workspace_data`
Read-only live workspace data: scheduled / published / draft posts, counts,
connected accounts, overview. Rendered as list/info cards. Free.

### 4.4 Content helpers — `generate_caption`, `generate_hashtags`
- `generate_caption`: up to 3 caption options for a topic; grounds in attached
  media when present. Metered as `captionGeneration`.
- `generate_hashtags`: 5–30 relevant hashtags. Metered as `hashtagGeneration`.
Both are listed as Free AI features in the plan doc → included in **Basic**.

### 4.5 Best time — `get_best_posting_time`
Computes the best posting window from real engagement signals
(`bestTimeService`). "Best Time to Post" is a Free publishing feature → Basic.

### 4.6 Agentic create — `schedule_post`
Creates/schedules a post from chat (type, account, caption, hashtags, schedule
time). Renders a confirm card; on confirm runs the real publish/schedule flow.
Requires ≥1 connected account. **Full+.**

### 4.7 Agentic edit — `reschedule_post`, `cancel_scheduled_post`,
`update_post_caption`, `delete_post`, `duplicate_post`
Mutate existing workspace content via confirm cards. **Full+.**

### 4.8 On-demand account analytics — `get_account_details`
Live selected-account analytics: followers, engagement, reach, impressions,
audience demographics, top posts. History depth is already plan-capped by the
analytics history limit. **Full+.**

### 4.9 Web research — `search_web`, `research_trends`
Live web search / niche trend research via the self-owned research engine
(`server/services/research/webResearch.service.ts` — Tavily + Firecrawl + LLM).
Returns a prose answer + a research card (key points, trends, citations).
**Full+.**

### 4.10 Deep research — `deep_research`
Multi-step research **report** (executive summary, key findings, trends,
opportunities, risks, sources). Heavier/slower than `search_web`. **Advanced.**

### 4.11 Analytics insight & recommendations — `get_analytics_insight`
Two modes:
- `recommendations` → prioritized growth recommendations from real data.
- `insight` → a performance insight headline + tip.
Basic recommendations exist at Free; the richer **AI Growth Recommendations**
and **AI Analytics Insights** are Pro+ AI features. → insight/growth via VeeGPT
is **Advanced**.

### 4.12 Content planning & business insights (Pro+ AI features)
`aiContentPlan`, `aiBusinessInsight` — surfaced via VeeGPT on **Advanced**.

### 4.13 VeeGPT Autopilot (roadmap)
Goal-driven autonomous agent (see `.kiro/specs/veegpt-auto-pilot/` and
`autopilot-intelligence/`). Not yet a live gated feature; reserved for
**Advanced** when it ships.

### 4.14 Agents / personas
`server/routes/veegpt-agents.ts` (default, strategist, creator, analyst,
researcher). Personas steer tone/behavior. Availability by tier is a product
choice (see §6).

---

## 5. Tiers

Plan → tier (`features.veeGPTLevel`):

| Plan | Tier |
|---|---|
| Free | **Basic** |
| Creator | **Full** |
| Pro | **Advanced** |
| Business | **Advanced** |
| Enterprise | **Advanced** (custom) |

Tiers are cumulative: **Full = Basic + more**, **Advanced = Full + more**.

### 🟢 Basic VeeGPT (Free) — "a smart chat helper"
A capable conversational assistant plus the free content helpers.
- Natural-language chat (ideas, answers, writing help, brainstorming)
- Long-term memory
- `get_workspace_data` (read-only workspace overview)
- `generate_caption`, `generate_hashtags` (credit-metered)
- `get_best_posting_time`
- Models: 🟢 **Light** class only (Gemini Flash-Lite, GPT-5 nano, GPT-4o mini),
  plus **5 premium replies per month** so the best model can be experienced
  before it is paid for.
- VeeGPT chat: no conversation-count limit and no credit cost. Bounded by
  **15 units / 5h and 100 units / month** (§6b) — that is 100 light replies, the
  same as the previous message cap. The "30 AI conversations/month" figure
  belongs to Instagram DM automation, not VeeGPT chat.
- **Not included:** agentic create/edit actions, on-demand account analytics,
  web/deep research, analytics insights & growth recommendations, content
  planning, business insights, autopilot.

### 🔵 Full VeeGPT (Creator) — "agentic workspace assistant"
Everything in Basic, plus VeeGPT can act on the workspace and research the web.
- `schedule_post` (create/schedule from chat)
- Edit tools: `reschedule_post`, `cancel_scheduled_post`,
  `update_post_caption`, `delete_post`, `duplicate_post`
- `get_account_details` (on-demand account analytics)
- Web research: `search_web`, `research_trends`
- Standard growth recommendations (`get_analytics_insight` → recommendations)
- AI Rewrite
- Models: 🟢 Light + 🔵 **Standard** class (Gemini Flash, GPT-5 mini, GPT-4.1
  mini), plus **10 premium replies per month**.
- VeeGPT chat: no conversation-count limit and no credit cost. Bounded by
  **100 units / 5h and 1,200 units / month** (§6b) — 1,200 light replies, the same
  as the previous message cap. The automation `aiConversationsPerMonth` cap for
  this plan is 300 — unrelated to VeeGPT chat.

### 🟣 Advanced VeeGPT (Pro / Business) — "strategist"
Everything in Full, plus deep intelligence and higher answer quality.
- `deep_research` (multi-step research reports)
- AI Analytics Insights (`get_analytics_insight` → insight)
- AI Content Planning, AI Business Insights
- Models: full 🟣 **Premium** access (GPT-4o, GPT-5.x, Gemini Pro), sub-capped at
  300 premium replies/month (Pro) and 800 (Business) so a single user cannot
  monopolise the most expensive model
- VeeGPT Autopilot (when shipped)
- VeeGPT chat: no conversation-count limit and no credit cost. Bounded by
  **300 units / 5h and 5,000 units / month** (Pro), **800 / 12,000 pooled**
  (Business, ≤40% per seat) — see §6b. The automation `aiConversationsPerMonth`
  caps for these plans are 3,000 (Pro) / 30,000 (Business) / unlimited
  (Enterprise) — unrelated to VeeGPT chat.

---

## 6. Feature matrix (capability × tier)

| Capability | Tool(s) | Basic (Free) | Full (Creator) | Advanced (Pro/Business) |
|---|---|:--:|:--:|:--:|
| Conversational chat | — | ✅ | ✅ | ✅ |
| Long-term memory | remember/update/forget | ✅ | ✅ | ✅ |
| Read workspace data | get_workspace_data | ✅ | ✅ | ✅ |
| Caption generation | generate_caption | ✅ | ✅ | ✅ |
| Hashtag generation | generate_hashtags | ✅ | ✅ | ✅ |
| Best time to post | get_best_posting_time | ✅ | ✅ | ✅ |
| Create/schedule post | schedule_post | ❌ | ✅ | ✅ |
| Edit/reschedule/cancel/delete/duplicate | edit tools | ❌ | ✅ | ✅ |
| On-demand account analytics | get_account_details | ❌ | ✅ | ✅ |
| Web search | search_web | ❌ | ✅ | ✅ |
| Trend research | research_trends | ❌ | ✅ | ✅ |
| Growth recommendations | get_analytics_insight (recs) | ❌ | ✅ | ✅ |
| AI Rewrite | (post flow) | ❌ | ✅ | ✅ |
| Deep research report | deep_research | ❌ | ❌ | ✅ |
| Analytics insight | get_analytics_insight (insight) | ❌ | ❌ | ✅ |
| Content planning | aiContentPlan | ❌ | ❌ | ✅ |
| Business insights | aiBusinessInsight | ❌ | ❌ | ✅ |
| Autopilot (roadmap) | — | ❌ | ❌ | ✅ |
| Highest model class | — | 🟢 Light | 🔵 Standard | 🟣 Premium |
| Premium replies / month | — | 5 (taste) | 10 (taste) | 300 Pro / 800 Business |
| Units / 5h · month | — | 15 · 100 | 100 · 1,200 | 300 · 5,000 (Pro) |

Legend: ✅ included · ❌ locked (shows upgrade affordance).

> Note: VeeGPT chat has **no conversation-count limit** and costs no AI credits.
> It is bounded by the weighted **unit** budget in §6b. The per-plan
> `aiConversationsPerMonth` numbers (30 / 300 / 3,000 / 30,000) are an
> **Instagram automation** cap and have nothing to do with VeeGPT chat — see §3.

---

## 6a. Rate limiting (abuse / burst protection)

A **per-minute, per-user** burst limit is the anti-abuse layer that complements
the unit budget (§6b) and tiering (tools). It only stops runaway scripts /
accidental loops / cost spikes; a real person (who reads each streamed reply)
never reaches it.

- Middleware: `server/middleware/veegpt-rate-limit.ts` (`veegptChatRateLimiter`),
  applied to `POST /conversations` and `POST /conversations/:id/messages`.
- Per-user (not per-IP), plan resolved from the Subscription document via
  `EntitlementService.getPlan` (NOT the stale `req.user.plan`), 60s fixed window,
  Redis-backed with in-memory fallback, and **fails open** on any error.
- Defaults (messages/min), overridable per plan via `VEEGPT_RPM_<PLAN>` env:

  | Plan | Messages / min |
  |---|---|
  | Free | 10 |
  | Creator | 20 |
  | Pro | 40 |
  | Business | 80 |
  | Enterprise | 200 |

  Development uses very high limits so local testing is never throttled. On a
  block the server returns HTTP 429 `{ message, retryAfter }`; the client
  (`useChatStream`) shows a friendly "sending too quickly" notice.

---

## 6b. Fair-use budget — weighted UNITS (5h window + monthly ceiling)

### Why not message counts

Counting "messages" assumes every message costs the same. It does not:

| Action | Measured cost |
|---|---|
| Chat turn, light model (~4.4k in / 0.7k out) | **₹0.09** |
| The same turn on GPT-4o | **₹1.53** (17×) |
| One `deep_research` (12 LLM calls + paid Tavily, ~5 min) | **₹4–40** (45–450×) |

So the old "1,200 messages/month" Creator cap bounded nothing: it permitted
₹1,836 of GPT-4o (229% of the ₹799 plan price) or ₹48,000 of deep research.

### The unit

**1 unit = one light-model chat turn ≈ ₹0.10.** Everything is priced against it:

| What | Units |
|---|---|
| Chat turn — 🟢 Light model | 1 |
| Chat turn — 🔵 Standard model | 3 |
| Chat turn — 🟣 Premium model | 12 |
| `deep_research` | **+40** (flat, model-independent) |
| `search_web` / `research_trends` | +4 |
| `get_analytics_insight` | +2 |
| `get_account_details` | +1 |
| Each media attachment analysed | +3 |
| `POST /context/refresh` | 2 |
| `POST /post-agent/execute` | 3 |
| `POST /research/refresh` | 4 |

Deep research is charged **flat**, independent of the chat model, because its
cost is dominated by fan-out and the paid Tavily request rather than by the
model. Memory, `get_workspace_data`, and plain conversation add nothing.

### Per-plan budgets

| Plan | Units / 5h | Units / month | Premium replies / month | Max monthly inference cost |
|---|---|---|---|---|
| Free | 15 | 100 | **5** (taste) | ₹10 |
| Creator | 100 | 1,200 | **10** (taste) | ₹120 — 15% of ₹799 |
| Pro | 300 | 5,000 | 300 (sub-cap) | ₹500 — 25% of ₹1,999 |
| Business | 800 | 12,000 *(pooled, ≤40% per seat)* | 800 (sub-cap) | ₹1,200 — 24% of ₹4,999 |
| Enterprise | Unlimited | Unlimited | Unlimited | contract |

**The monthly unit number equals the OLD message cap on purpose.** Because one
light turn costs exactly one unit, a user on the default model sees precisely the
behaviour they had before — nothing regressed on rollout. The budget only bites
on expensive model choices and expensive tools, which is where the money goes.

The property that makes this safe: **maximum monthly inference cost per user is
now a known constant** (`monthlyUnits × ₹0.10`) instead of unbounded.

### Premium replies are metered on EVERY plan

The premium counter is not only the Free/Creator "taste" allowance — it is also
the abuse sub-cap for Pro and Business. Premium turns are counted even when the
plan's `maxClass` already *is* premium. Without this, Pro would pass the class
check, its 300-reply sub-cap would never fire, and one user could spend the
entire monthly budget on the most expensive model. Covered by a regression test.

When the premium allowance runs out, the reply is served by the plan's best
**non-premium** class (never premium, so it cannot loop straight back).

### Windows

- **Session** — a rolling window (default 5h, `VEEGPT_SESSION_WINDOW_HOURS`).
  Starts on the first message and refreshes when the Redis TTL expires, like
  Claude's usage windows.
- **Monthly** — keyed `YYYY-MM`, so it resets on the 1st with no cron.
- **Premium** — keyed `YYYY-MM`, resets with the month.

Redis keys: `veegpt:sess:{userId}`, `veegpt:mon:{userId}:{YYYY-MM}`,
`veegpt:prem:{userId}:{YYYY-MM}`, and `veegpt:wmon:{workspaceId}:{YYYY-MM}` for
the pooled Business budget.

Every number is env-overridable with no deploy: `VEEGPT_SESSION_CAP_<PLAN>`,
`VEEGPT_MONTHLY_CAP_<PLAN>`, `VEEGPT_PREMIUM_TURNS_<PLAN>` (`-1` = unlimited).

### Gate, charge, and the one-turn overshoot

- `veegptUsageQuota` (middleware) only checks that budget **remains** — it does
  not require the whole turn to fit. A turn already in flight always finishes,
  so a user with 2 units left can still complete a 12-unit premium reply and end
  slightly over. The overshoot is bounded by one turn; refusing mid-conversation
  because the *next* reply might be expensive is far worse UX. Claude and Copilot
  behave the same way.
- Charging happens in `streamGeneration` (the single funnel for both chat
  routes), which is the only place that knows the model class and which tools
  ran. The turn is charged **up front**; tool surcharges are charged as each tool
  starts. **Pressing Stop still costs the turn** — otherwise aborting would be a
  free way to run the expensive part of a request.
- A **blocked** request consumes nothing.

### Durability

Redis alone is unsafe for a cost control: a flush would reset everyone's budget
and hand out free premium usage. Monthly totals are mirrored to Mongo
(`VeegptUsageMonth`, throttled to one write per user per minute) and Redis is
re-seeded from that mirror whenever a monthly key is missing. The mirror uses
`$max`, so a stored total can never move backwards. The 5-hour window is
deliberately *not* mirrored — losing it costs at most one window and self-heals.

Verified end-to-end against real Redis + Mongo by
`server/scripts/verify-veegpt-budget.ts` (17 checks, including the Redis-wipe
re-seed).

> That script lives under `server/` on purpose: the repo has **two** mongoose
> installs (root and `server/node_modules`), so a script at the repo root
> connects a different instance than the services use and every model query
> times out.

### Failure policy

Both middlewares **fail open** — an infra hiccup must never block a paying
user's chat. Every fail-open is logged at `warn` with `failOpen: true` so it is
visible in monitoring rather than silent.

### Surfacing it to the user

- **In chat:** deliberately vague. A soft "running low" hint appears only near
  the limit; exact counts are never shown mid-conversation.
- **In Settings → AI Configuration:** the real numbers — three meters (5h, month,
  premium replies) with remaining/limit and a refill time.
- `GET /api/chat/limits` returns `{ plan, session, monthly, premium, maxClass }`
  with `used / limit / remaining / resetAt` per window. Read-only; never mutates.
- On a block, HTTP **429** with `{ scope, message, retryAfter, resetAt, upgrade }`.
  The message is self-describing ("…resets in about 12 days.") and names the next
  plan explicitly, because the moment a user hits the wall is the moment the
  limit converts.

### Layer summary

Five complementary layers, outermost first: per-minute burst (floods) → 5h units
(the felt fair-use limit) → monthly units (hard ceiling) → premium sub-cap (stops
one user monopolising the most expensive model) → tier gating (which tools exist
at all). AI credits sit alongside, metering discrete artifacts.

---

## 7. Enforcement design

Four layers; the server is authoritative.

1. **Server tool-gating (primary).** In the two chat handlers
   (`veegpt-chat.routes.ts`, tool-assembly ~L2930 and ~L3198), resolve the
   user's `veeGPTLevel` and include only the tool arrays allowed for that tier:
   - Basic: memory + `get_workspace_data` + `generate_caption` +
     `generate_hashtags` + `get_best_posting_time`
   - Full: + `schedule_post`, edit tools, `get_account_details`, `search_web`,
     `research_trends`, growth recommendations
   - Advanced: + `deep_research`, analytics insight, content plan, business
     insight
   A forced tool (from the "+" menu) that the tier doesn't allow is dropped and
   the reply includes a short upgrade hint.

2. **Model class by plan — no grandfathering.** Every user is served by their
   plan's model class from day one. `resolveModelForPlan` runs at the top of
   `streamGeneration`; a stored selection above the plan steps **down** to the
   best allowed class rather than failing, so chat never breaks.

   | Plan | Highest class | Above that |
   |---|---|---|
   | Free | 🟢 Light | 5 premium replies/month, then light |
   | Creator | 🔵 Standard | 10 premium replies/month, then standard |
   | Pro / Business | 🟣 Premium | capped at 300 / 800 replies/month, then standard |

   A selection above the plan is **kept, not reset** — the choice activates the
   moment the user upgrades.

   **Substitutions are always visible.** A `modelNotice` stream event tells the
   user which model answered and why, rendered as a dismissible note above the
   composer with an Upgrade CTA. Silently swapping models is precisely the
   behaviour this codebase removed; this is an entitlement decision made before
   any request, not an error-driven fallback.

3. **Client affordance (UX).** In the VeeGPT composer, lock the forced-tool "+"
   items and any tier-limited agents the plan doesn't include, with an
   "Upgrade" prompt. In Settings → AI Configuration every model carries its
   class badge (Light / Standard / Premium), its unit cost, and — when above the
   plan — what will actually happen. All cosmetic; the server still enforces.

4. **Per-minute burst rate limit.** Plan-aware per-user cap on chat sends — see
   §6a (`veegptChatRateLimiter`).

5. **Weighted unit budget.** 5h + monthly + premium sub-cap — see §6b
   (`veegptUsageQuota` gate, `chargeVeegptUnits` charge). Applied to both
   streaming chat routes **and** to `/context/refresh`, `/post-agent/execute`
   and `/research/refresh`, which previously made AI calls with no accounting at
   all.

Existing scaffolding to use:
- `server/config/plan-config.ts` → `features.veeGPTLevel` (`basic|full|advanced`)
- `server/middleware/ai-route-guards.ts` → `veeGPTBasicGuards`,
  `veeGPTFullGuards`, `veeGPTAdvancedGuards` (currently only Basic is attached)
- Tier order for comparisons: `basic < full < advanced`.

---

## 8. Plan-doc alignment (Analytics/AI sections)

- Free AI: "Basic VeeGPT", AI Caption/Hashtag/Banner Generator, Basic AI
  Recommendations → **Basic** (captions/hashtags included).
- Creator AI: "Full VeeGPT", AI Rewrite, AI Recommendations → **Full**.
- Pro AI: "Advanced VeeGPT", AI Growth Recommendations, AI Content Planning,
  AI Analytics Insights → **Advanced**.
- Business AI: "Advanced VeeGPT", AI Business Insights → **Advanced**.

---

## 9. Implementation status

### Tier gating — DONE
- [x] `veeGPTLevel` resolved in both chat handlers (`resolveVeeGPTTier`).
- [x] Tier → allowed-tool map (`server/config/veegpt-tiers.ts`, `TOOL_MIN_TIER`)
      filters tool assembly (`filterToolsByTier`).
- [x] Disallowed forced tools dropped with an upgrade hint
      (`buildForcedToolDirective`).
- [x] Client locks forced-tool "+" items / agents by tier with an upgrade CTA.

### Weighted unit budget — DONE
- [x] Cost classes in `shared/veegpt-model-classes.ts` (one map, server + client).
- [x] Rules (weights, action surcharges, per-plan budgets, entitlement decision)
      in `server/config/veegpt-usage.ts` — pure and unit-tested.
- [x] Counters (Redis + Mongo mirror, plan cache) in
      `server/services/veegpt-usage.service.ts`.
- [x] Gate middleware `veegptUsageQuota`; burst limiter `veegptChatRateLimiter`
      (`server/middleware/veegpt-rate-limit.ts`).
- [x] Charging in `streamGeneration`: model class + media up front, tool
      surcharges as each tool starts.
- [x] Premium sub-cap metered on **every** plan (regression-tested — the naive
      version silently never fired for Pro/Business).
- [x] Model class enforced per plan, **no grandfathering**; downgrade is visible
      via the `modelNotice` stream event.
- [x] `/context/refresh`, `/post-agent/execute`, `/research/refresh` now gated
      and charged (previously unaccounted AI calls).
- [x] `GET /api/chat/limits` returns session + monthly + premium + maxClass.
- [x] Settings → AI Configuration: class badge + unit cost + lock note per model,
      plus three live allowance meters.
- [x] Durability: Mongo mirror with `$max`, Redis re-seed on missing month.
- [x] Tests: `tests/veegpt-usage.test.ts` (28) and
      `server/scripts/verify-veegpt-budget.ts` (17 live checks).

### Deliberately NOT done
- [ ] **Weekly** premium cap — 5h + monthly is enough to start; add only if data
      shows whales slipping through.
- [ ] Blocking the *save* of an above-plan model. The selection is kept on
      purpose so it activates on upgrade; enforcement happens at generation time,
      where the server is authoritative.
- [ ] Charging VeeGPT chat to AI credits. Units and credits stay separate
      currencies — see §3.

### Reminder
The Free 30 / Creator 300 / Pro 3,000 / Business 30,000 figures are the
Instagram-automation `aiConversationsPerMonth` caps (enforced in the automation
worker via `EntitlementService.recordAutomationUsage` / `remainingAutomation`),
**not** VeeGPT chat limits.
