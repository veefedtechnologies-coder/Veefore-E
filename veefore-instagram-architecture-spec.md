# Veefore — Instagram Integration Architecture Specification

**Audience:** Kiro (Opus 4.6), implementing Veefore's Instagram data layer
**Purpose:** Define the exact mechanics of rate-limit measurement, backfill volume, polling cadence, and UX behavior so the system is correct, scalable, and never feels laggy or broken to the end user.

This document assumes no prior context. Every number and mechanism is explained, not asserted. Read it fully before writing code — sections depend on each other.

---

## 0. The two formulas you are actually building against

Meta does not apply one universal rate limit. There are two different systems, and which one applies depends on the endpoint category. Getting this distinction wrong is the single most common design mistake in social media tooling, so it is stated first and in full.

### 0.1 Platform Rate Limits (app-level, simple multiplier)

Used for plain Graph API calls made with an app or user access token.

```
Calls within one hour = 200 × Number of Users
```

"Number of Users" here means unique daily (or weekly/monthly, if usage is uneven) active users of *your app* — not the Instagram account's followers. This formula barely matters for Veefore's Instagram data calls; it matters more for general Graph API usage. Mentioned for completeness — do not confuse it with the BUC formula below, which is the one that actually governs Instagram Platform endpoints.

### 0.2 Business Use Case (BUC) Rate Limits — this is the one that governs Instagram

Calls to Instagram Platform endpoints (media, comments, insights, mentions — i.e. almost everything Veefore does on the read side) follow this formula instead:

```
Calls within 24 hours = 4,800 × Number of Impressions
```

Where "Number of Impressions" is the number of times any content from that specific connected Instagram account has entered a person's screen in the last 24 hours.

**This is per-account, not per-user-of-Veefore, and not a flat number.** Two consequences that must shape the entire architecture:

- A high-follower, high-engagement account generates large impression counts, which means a *large* call budget. A 1,000-impression day yields up to 4.8 million calls in the next 24 hours.
- A small, new, or quiet account generates very few impressions, which means a *small* call budget — a 10-impression day yields only 48 calls in 24 hours, and the minimum impression value Meta will use in the formula is 10 (so 48 calls/day is close to the practical floor for any connected account).

**The "200 calls/hour" figure you have seen quoted everywhere is real, but it is a simplified, commonly-cited approximation of the base case — not the literal ceiling for every account.** The actual ceiling moves with engagement. Build the system around the real formula, not the popularized shorthand, or you will either over-throttle large accounts unnecessarily or under-protect small ones — which is exactly backwards from where the real risk sits (see 0.3).

### 0.3 The actual risk profile — corrected

Re-stating this clearly because it inverts the intuitive assumption stated in earlier conversation: **the dangerous accounts are not the big ones. They are the small ones.**

A large account with heavy automation and lots of incoming comments has a correspondingly large impression-driven budget to absorb that activity. A brand-new Veefore user who just connected a small Instagram account has almost no impressions yet, and therefore almost no budget — and that account is precisely the one most likely to be polled aggressively by a naive system (because a new user is actively checking their new dashboard, refreshing, exploring features).

**Design implication:** the system must measure each account's actual headroom continuously and govern its own behavior account-by-account, never apply one global polling policy to all accounts uniformly. Section 2 specifies exactly how this measurement happens.

---

## 1. How the system knows the percentage used, per account, in real time

This is the part that was missing before, and it is the foundation everything else sits on. Build this first, test it in total isolation, before any feature code touches it.

### 1.1 The mechanism: every Graph API response already tells you

Meta does not make you calculate usage yourself. Every API response — once enough calls have accumulated against an endpoint — includes a response header containing the live answer, already calculated by Meta, as a percentage.

The relevant header for Instagram Platform / BUC-governed calls is `X-Business-Use-Case-Usage`. Shape:

```json
x-business-use-case-usage: {
  "17841400000000123": [
    {
      "type": "instagram",
      "call_count": 62,
      "total_cputime": 18,
      "total_time": 22,
      "estimated_time_to_regain_access": 0
    }
  ]
}
```

Field meanings, exactly as Meta defines them:

- The outer key (`17841400000000123`) is the Instagram account ID this usage block describes. The header can return up to 32 such objects in a single response if multiple accounts were touched.
- `call_count` — a whole number, the **percentage** of the account's allowed calls used in the current rolling one-hour window. Not a raw count. If you want the raw count, you would need to separately know the account's current 24-hour impression-derived ceiling (4,800 × impressions) and multiply — but for governance purposes, the percentage alone is sufficient and is what you should act on.
- `total_cputime` / `total_time` — percentage of allotted CPU time / wall time consumed. These can throttle you even if `call_count` looks fine, so they must be tracked too, not ignored.
- `estimated_time_to_regain_access` — minutes until you're no longer throttled. Only populated once you're actually being throttled; zero otherwise.

**For app/user-token calls governed by Platform Rate Limits instead, the equivalent header is `X-App-Usage`, with the same `call_count` / `total_cputime` / `total_time` fields but no per-account breakdown** (since Platform limits are app-level, not per-account). Parse whichever header is present on a given response; do not assume only one will ever appear.

### 1.2 What "implement it" actually means — the three required layers

**Layer 1 — Capture (mandatory, no exceptions).**
One single HTTP client wrapper handles every outbound call to `graph.facebook.com` and `graph.instagram.com`. No feature module (scheduler, analytics job, comment-automation worker, DM worker) is permitted to construct its own HTTP client or bypass this wrapper. The wrapper's job, on every response regardless of success or failure: parse whichever usage header is present, extract the fields above, and write them to storage. This must be architecturally enforced (e.g. the wrapper is the only thing with network egress permission, or all feature code is code-reviewed against direct fetch calls), not just a convention developers are trusted to follow — a single bypassed call defeats the entire system's visibility.

**Layer 2 — Storage (per-account, fast, short-lived).**
Store, keyed by Instagram account ID:

```
{
  account_id,
  call_count_pct,
  total_cputime_pct,
  total_time_pct,
  estimated_minutes_to_regain_access,
  last_updated_at,
  rolling_impressions_estimate   // see 1.3
}
```

Use Redis or an equivalent in-memory store — this gets overwritten on nearly every API call for that account, so write latency matters, and a long-term durable store is the wrong tool. Set a short freshness window (a few minutes) on `last_updated_at`; if a value is older than that, treat it as **stale-but-usable**, not as zero usage — see 1.4 for why this distinction is critical.

**Layer 3 — Decision (read before every non-urgent call).**
Before any job that is not user-blocking fires for a given account, it queries Layer 2 for that account's current `call_count_pct` and applies the tiered policy in Section 3. Urgent, user-visible work (a scheduled post publishing right now, a DM reply) does not wait on this check in the same way — see Section 3.3 for the exact priority logic.

### 1.3 Estimating the actual ceiling, not just the percentage

The header gives you a percentage of *some* ceiling, but the ceiling itself (4,800 × impressions) is not directly handed to you per call — Meta computes it internally and just reports the percentage against it. For Veefore's own internal capacity planning and for the "small account" protection in 0.3, also maintain a rolling estimate of each account's daily impressions, derived from the account-level insights you are already pulling (the `impressions` / `views` metric from `GET /<IG_USER_ID>/insights`). Store this alongside the usage record. This lets the system distinguish "this account is at 70% of a huge ceiling, totally fine" from "this account is at 70% of a tiny ceiling, be careful" — both report the same percentage from Meta, but they require different system behavior, particularly for how aggressively you schedule the *next* poll for that account (Section 3.4).

### 1.4 Handling missing or stale headers correctly

Headers only appear once "enough" calls have accumulated against an endpoint — early in a session, or for a quiet account, you may get responses with no usage header at all. **A missing header must be treated as "no new information, keep the last known value" — never as "usage is zero."** Treating a missing header as zero is the exact bug that would cause the system to wrongly believe a freshly-quiet account has full headroom immediately after a burst of activity, and fire a wave of deferred jobs right when the account is actually still near its ceiling. Layer 2's storage should simply not be overwritten when a call returns no header — leave the previous value in place and let `last_updated_at` age normally.

---

## 2. Webhooks: the mechanism that makes comment/DM automation safe at any volume

This section directly answers the "high-engagement account generates a comment flood" concern. The short version: **the comment flood never touches your rate-limit budget at the point of arrival, because you do not poll for comments — ever.** It only becomes a rate-limit concern at the point you *reply*, which is a separate, much higher-ceiling bucket (see 2.4).

### 2.1 What has webhooks vs. what doesn't (do not guess — this list is exhaustive for Veefore's purposes)

**Has webhooks (push-based, zero polling cost to receive):**
- Comments on the account's media
- Mentions of the account
- Story expiry events

**Does not have webhooks (must be polled, by Meta's own design, not an oversight):**
- New post creation/detection
- Follower count changes
- Most account-level insight metrics (reach, profile views, engagement aggregates)

This split is fixed by Meta, not a Veefore design choice. The architecture must accept it rather than trying to force real-time behavior onto things that are inherently poll-only (see Section 5 for how the UX layer communicates this honestly).

### 2.2 Required webhook architecture — receiver and worker must be separate processes

The single most important structural rule: **the process that receives the webhook HTTP POST from Meta must do nothing except validate the payload and enqueue it, then return 200 immediately.**

```
Meta → [Webhook Receiver] → enqueue → [Message Queue] → [Worker Pool] → actual processing
```

Why this specific separation, stated precisely: if the receiver tries to do real work inline — look up which Veefore user owns this account, evaluate automation rules, decide on a reply, call back out to Instagram to post that reply — then a genuine viral spike in comments on one account will pile concurrent inline work onto the receiver itself. The receiver becomes the bottleneck, response times to Meta's webhook delivery degrade, and in the worst case Meta's own retry/backoff logic on *its* side starts treating your endpoint as unhealthy.

With the queue in between: the receiver's job is trivial and fast regardless of volume (parse, validate, enqueue, return 200 — sub-millisecond work). A worker pool consumes the queue at whatever rate the workers are scaled to, completely decoupled from the rate at which events are arriving. A 10,000-comment spike on one viral post becomes queue depth, not an outage. You scale workers horizontally to drain the queue faster if sustained volume requires it; you do not need to scale the receiver at all, because its job never gets harder regardless of load.

### 2.3 What workers actually do, and how they interact with Section 1

A worker pulls one event off the queue, looks up the relevant Veefore user/account, evaluates whether any automation rule matches (e.g. "reply to comments containing this keyword"), and if so, **checks Section 1's stored usage percentage for that account before making the reply call.** This is the connective tissue between Section 2 and Section 1 — webhook *receipt* costs nothing against the budget, but webhook *reaction* (the actual reply call) does, and that reply call goes through the same governed HTTP client wrapper as everything else, so it is captured and counted exactly like any other call.

### 2.4 Why replies have more headroom than you'd expect

Comment and DM reply endpoints are governed by their own, separately-documented, much more generous per-second/per-hour ceilings (hundreds of calls per second range for messaging sends, and a separate hundreds-per-hour ceiling specifically for private replies to comments) — these are not drawn from the same 4,800×impressions pool as general read calls. This is good news for exactly the scenario you are worried about: a comment flood that triggers many automated replies is, in practice, unlikely to be the thing that exhausts an account's budget, *provided* the replies are flowing through the queue-and-worker design above rather than being attempted synchronously and in a burst. Do not hardcode the exact numeric ceilings for these messaging endpoints into the codebase (see Section 6 on centralizing constants) — they are documented by Meta per endpoint and should be looked up live or configured from one central, documented location, not memorized into business logic.

---

## 3. The job scheduler: exact tiered policy, and how priority is enforced

### 3.1 The four tiers, restated with exact trigger and exact behavior

| Tier | Trigger (`call_count_pct` for that account) | What runs | What is deferred |
|---|---|---|---|
| Normal | 0–60% | Everything: scheduled analytics refresh, backfill, polling, automations | Nothing |
| Caution | 60–80% | Comment/DM automation replies, scheduled posts due now, anything user-initiated | Backfill, non-urgent analytics refresh |
| Restricted | 80–95% | Only work tied to something the user is actively watching happen right now | Everything else, explicitly queued (not dropped) for retry once the account drops back below 80% |
| Critical | 95%+ | Only publishing a post that is due *right now* | Everything else, queued |

"Queued, not dropped" is a deliberate distinction. A deferred job must re-enter a retry queue with a backoff, not silently vanish — otherwise a backfill job that got deferred during a busy hour simply never completes, and nobody notices until a user asks why their older posts have no analytics.

### 3.2 Where the check happens, mechanically

The job scheduler (whatever queue/cron system is running Veefore's background jobs) must call into Layer 2's storage (Section 1.2) as the very first step before dequeuing the actual work for a given account — not after attempting the call and catching a failure. Checking first is strictly better than checking after a failed call: it avoids wasting a call attempt that you could have predicted would fail, and it avoids the latency of a round trip to Meta only to be told no.

### 3.3 Priority enforcement — what "comment/DM automation gets priority" means concretely

This is not a vague aspiration; it is enforced by which tier a given job type is permitted to run in. Re-reading the table in 3.1: comment/DM automation replies are explicitly permitted through the Caution tier (60–80%), while backfill and non-urgent analytics refresh are not. This means that as an account's usage climbs, the *first* things automatically sacrificed are the things the user isn't actively looking at, and the *last* things sacrificed are the things that feel broken if they don't happen (a reply that never sends, a scheduled post that doesn't go out).

### 3.4 Per-account polling cadence — tied to the impression estimate from 1.3, not a flat schedule

A flat "poll every account every N minutes" schedule is the wrong design given Section 0.3's risk profile. Instead, cadence should scale with the account's estimated daily ceiling:

- **Large/high-impression accounts** (large estimated ceiling, currently low percentage used): can tolerate more frequent polling without meaningful risk. A reasonable default: account-level insights refreshed roughly hourly, post-level insights refreshed on a similar or slightly longer cadence.
- **Small/low-impression accounts** (small estimated ceiling): must be polled more conservatively. A reasonable default: account-level insights refreshed every several hours rather than hourly, specifically to preserve headroom for the moments that actually matter — the user opening the app, or an automation needing to fire.

This is the direct mechanism that protects new/small accounts (Section 0.3's actual risk) without wastefully under-polling large accounts that have abundant headroom to spare. The exact thresholds (what counts as "large" vs "small" impressions) should be configurable, not hardcoded — start conservative, observe real usage patterns once live, and tune.

---

## 4. Backfill and ongoing polling — exact data volumes, not just "tier it"

This section gives concrete numbers, because "fetch what's needed" is not an instruction a developer can implement without a specific decision being made somewhere.

### 4.1 Initial OAuth connection — what to fetch, in what order, and why

**Step 1 — Profile and account metadata.** One call. Cheap, immediate, needed to render anything at all.

**Step 2 — Most recent 20–25 posts, with insights, fetched as a *single combined call using field expansion*, not as N+1 separate calls.**

The naive approach — fetch the media list, then loop through each post issuing a separate `/insights` call per post — multiplies your call count by the number of posts for no benefit. The correct approach uses Meta's field-expansion syntax to request media fields and their insights in the same request:

```
GET /{ig-user-id}/media
  ?fields=id,caption,media_type,timestamp,like_count,comments_count,insights.metric(impressions,reach,saved){data}
  &limit=25
```

This single call returns up to 25 posts *and* their insight metrics together. It still counts as multiple calls against the account's budget internally (per Meta's own counting rules — see the earlier discussion on batch/multi-ID counting: each underlying object counted is still a call), but it collapses what would otherwise be 26 separate round trips (1 list + 25 individual insight calls) into one HTTP request, which matters enormously for latency and for not creating 25 sequential points of failure.

**Why 20–25 and not "everything":** this is the number that makes a freshly-connected account's dashboard feel complete and current without consuming a large fraction of that account's hourly budget in the first minute of using Veefore — particularly important for a small/new account (Section 0.3) which may have a very small total ceiling. Fetching a full multi-year history in the same burst risks exhausting that account's entire near-term budget before the user has done anything else with the app.

**Step 3 — Everything older than the most recent 20–25 posts goes into a background backfill queue, not the initial connection flow.** This queue processes at low priority, respecting the same tiered policy from Section 3 — it runs during Normal tier, defers during Caution and above, and simply takes longer to complete for an account that's busy with other activity. There is no user-facing deadline for this queue to finish; it exists so that scrolling further back in analytics eventually populates, not so that everything is available instantly.

### 4.2 Steady-state polling — exact cadence by data type

| Data type | Mechanism | Default cadence | Notes |
|---|---|---|---|
| Comments, mentions | Webhook | Real-time (event-driven) | Never polled |
| Story expiry | Webhook | Real-time (event-driven) | Never polled |
| New post detection | Poll | Every 1–4 hours, scaled by account size per Section 3.4 | No webhook exists for this |
| Follower count | Poll | Hourly for large accounts; every 4–6 hours for small accounts | No webhook exists for this |
| Account-level insights (reach, impressions, engagement) | Poll | Hourly for large accounts; every 3–6 hours for small accounts | Drives the impression estimate in Section 1.3 |
| Post-level insights, recent posts (last ~7 days) | Poll | Every 2–4 hours | Insights stabilize after the first day or two; aggressive polling of brand-new posts has diminishing returns |
| Post-level insights, older posts | Poll | Once daily at most, low priority | Historical insights change slowly; no justification for frequent re-fetching |

These are starting defaults, not immutable constants — they should be configurable per the centralization principle in Section 6, and tuned once real usage data shows where actual bottlenecks occur.

### 4.3 Why this is more disciplined than what most competitors visibly do

The job ahead is not to publish a competitor's internal cadence (none of Hootsuite, Sprout Social, Buffer, or Later publish this — it is proprietary infrastructure, not public documentation). The job is to be the system that explicitly reasons about impression-scaled ceilings, tiers its own behavior continuously against real measured headroom, and never applies a flat schedule irrespective of account size. That discipline — measuring before acting, scaling cadence to actual headroom rather than a fixed clock, treating webhook-eligible data as never-polled — is what "more advanced engineering than the apparent default" looks like in practice, not a specific secret number.

---

## 5. UX requirements — equal priority to backend correctness, not an afterthought

The principle underlying this entire section: **users do not experience accuracy, they experience latency and honesty.** A dashboard that loads instantly with slightly-stale numbers that then quietly settle to current values feels premium. A dashboard that blocks and spins while waiting for a perfectly fresh number feels broken, even though it is technically more "correct" in that instant. Every UI decision below follows from this.

### 5.1 Stale-while-revalidate is the default rendering pattern for every analytics view, not an edge case

When a user opens any analytics screen: render whatever is currently cached for that account immediately, with no loading spinner blocking the view, while a background refresh (subject to Section 3's tiering — it may or may not actually fire depending on current headroom) attempts to update the cache. If the refresh succeeds, the numbers update in place, ideally with a subtle transition rather than a jarring re-render. If the refresh is deferred because the account is in a Caution/Restricted tier, the cached numbers simply remain on screen — the user is never shown an empty state, an error, or a stuck spinner just because a background refresh didn't happen this cycle.

This is not optional polish — it is the mechanism that makes Section 3's deferral policy invisible to the user rather than something they perceive as the app being broken or slow.

### 5.2 Always show a "last updated" timestamp — this is what makes deferred refreshes honest rather than deceptive

Every screen showing data that came from a poll (which is most analytics, follower counts, and growth metrics — see Section 4.1's table) must display when that data was last refreshed. This single, small UI element does enormous work: it sets the correct expectation that this is not a live feed, it makes a several-hour-old number for a small account feel like expected, labeled behavior rather than a bug, and it removes any need for the backend to fake real-time-ness it cannot actually deliver for data types that have no webhook (Section 2.1).

Do not phrase this apologetically or technically ("data may be delayed due to API constraints") — phrase it plainly and confidently ("Updated 12 minutes ago"), the same way any mature analytics product communicates freshness.

### 5.3 Comment/DM automation should *actually* feel instant, because the architecture makes that true

Because Section 2's webhook-and-queue design means reactions to comments/DMs are event-driven rather than poll-driven, the *typical* case genuinely is near-instant — there is no inherent delay baked into the architecture, only queue depth during genuine spikes. The UX should reflect this confidently: an automation log or activity feed showing replies as they happen, without artificial loading states that imply more latency than actually exists. Reserve any "processing" indicator for the actual edge case — a queue genuinely backed up during a real spike — rather than showing it by default for ordinary traffic.

### 5.4 When something is genuinely deferred, say so specifically — never fail silently and never show a generic error

If an account is in Restricted or Critical tier and a feature the user is actively trying to use cannot run right now, the UI must say so in plain, specific language: "Analytics for [account] will refresh again in about 20 minutes" is correct. A spinner that never resolves, a generic "Something went wrong," or no feedback at all are all incorrect — each one leaves the user unable to tell the difference between "the app is broken" and "the app is correctly protecting your account's API budget right now."

### 5.5 Never surface a raw Meta API error to the user

Error codes like 80002 (Instagram BUC throttle) or a raw 429 are backend signals, not user-facing content. The UI layer must always translate these into one of the calm, specific messages above — the user should never see anything resembling an HTTP status code or a Meta error string.

### 5.6 New/small accounts deserve explicit onboarding honesty

Given Section 0.3's risk profile, a newly connected small account may have visibly slower analytics refresh cadence than a large account. This should be set as an expectation during onboarding rather than discovered as a confusing inconsistency later — something as simple as a brief note that refresh frequency scales with account activity is enough to prevent a new user from interpreting normal, correct throttling behavior as the app underperforming.

---

## 6. Engineering hygiene — what makes this bulletproof rather than merely correct on day one

### 6.1 Centralize every Meta-published number in one place, named and documented

The 200/hour figure, the 4,800 multiplier, the per-day publish limit, the various messaging endpoint ceilings — none of these should appear as a bare literal scattered across multiple files. Meta has changed several of these values across API versions already (the publish-per-day cap specifically has differed across documentation versions). One named, documented configuration location means one update when Meta changes a number, not a repo-wide search.

### 6.2 Query live limits where an endpoint exists for it, rather than trusting a hardcoded assumption

Where Meta exposes a live endpoint to check current limit usage (e.g. the content-publishing-limit check), prefer querying it over assuming a hardcoded number is still correct. This is a small amount of extra engineering effort that removes an entire category of "this broke because Meta quietly changed a number" failures.

### 6.3 Build and load-test Section 1 (usage tracking) and Section 2 (webhook queue) independently before wiring them together

Both are foundational; both need to be correct and tested in isolation before Section 3's scheduler is built on top of them. Wiring everything together first and discovering a bug in the usage-tracking layer afterward means debugging through three layers of integration to find a problem that should have been caught in a unit test.

### 6.4 Explicitly simulate both edge cases described in this document before considering the system production-ready

1. **Comment flood on one account** — confirm the queue absorbs a large burst without any measurable effect on other accounts' processing, and without the receiver itself slowing down.
2. **Newly connected, low-impression account** — confirm the tiered, impression-scaled cadence (Section 3.4) correctly throttles that specific account's own polling before it exhausts its (small) daily ceiling, while *not* incorrectly applying that same conservative cadence to a large account in the same system.

These two scenarios are the direct, testable versions of the two concerns that motivated this entire document. Passing both is the actual definition of "bulletproof" for this system — not the absence of errors in a quiet test environment, but correct, measured, honest behavior under both kinds of real-world pressure.

---

## Summary of what must exist before this system is considered done

- A single governed HTTP client wrapper; no feature code makes Instagram API calls outside it.
- Per-account, real-time-ish usage storage, fed by parsing response headers on every call, tolerant of missing headers without misreading them as zero usage.
- A rolling per-account impression estimate, used to distinguish "70% of a huge ceiling" from "70% of a tiny ceiling."
- Webhook receiver and worker pool as physically separate processes connected by a queue, for comments, mentions, and story expiry.
- A scheduler that checks stored usage before dequeuing non-urgent work, applying the four-tier policy, with deferred work re-queued rather than dropped.
- Impression-scaled polling cadence per account, not a flat global schedule.
- Initial backfill capped at the most recent 20–25 posts via field-expansion combined calls, with everything older queued at low priority.
- Stale-while-revalidate as the default rendering pattern for every analytics view, with a visible "last updated" timestamp everywhere data is polled rather than pushed.
- Plain-language, specific user-facing messaging for any genuinely deferred feature — never a raw error, never a silent failure, never an indefinite spinner.
- Every Meta-published numeric limit centralized in one documented location, queried live where a live-check endpoint exists.
