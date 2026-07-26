# Veefore — Priority Polling, Metric Schedule & Enterprise Implementation Guide

**Audience:** Kiro (Opus 4.6)
**Depends on:** `veefore-instagram-architecture-spec.md` — the foundational document covering the rate-limit formulas (Platform Rate Limit vs. Business Use Case formula), the usage-header tracking layer, webhook/queue separation for comments and mentions, and the four-tier account-headroom policy (Normal / Caution / Restricted / Critical). Everything in this document assumes that foundation already exists and builds directly on top of it.

**This document merges what were previously two separate documents into one**, because they were never meant to be read independently — one explained *why* a metric gets a given priority, the other gave the *actual numbers and code*, and reading either alone left half the picture missing. Every cadence below is now stated next to its reasoning, and every BullMQ pattern is now stated next to the conceptual mechanism it implements.

---

## Part 1 — Metric Classification: Why Some Data Gets Polled Often and Some Doesn't

### 1.1 The two questions that determine priority, independent of account size

Two axes determine a metric's polling priority, and they are genuinely independent of each other:

1. **Volatility** — how fast does this value actually change? Polling a number that hasn't moved in six hours is wasted budget regardless of how important that number is.
2. **Visibility** — is a user looking at this right now, or could they reasonably check at any moment? A number nobody is looking at can tolerate staleness that a number on an open dashboard cannot.

A metric is high-priority only if it scores high on *both* axes. A metric that's highly visible but barely changes (follower count, viewed on a profile screen) needs a long interval and a confident "last updated" label, not frequent polling. A metric that changes fast but nobody is watching in real time (engagement accumulating quietly on a post from three weeks ago) doesn't need frequent polling either. The only metrics that genuinely earn a tight interval are ones that are both volatile and currently being watched.

### 1.2 The four-quadrant classification — every metric gets assigned to one cell

| | High visibility (user actively viewing) | Low visibility (background / not currently viewed) |
|---|---|---|
| **High volatility** (changes within minutes/hours) | **Tier 1 — Real-time priority.** New comments on a post the user has open, DM threads, a scheduled post's publish status while the user is on the calendar screen. | **Tier 3 — Scheduled, moderate frequency.** New-comment counts on posts not currently open, recent-post insights in their first 24–48 hours (when insights are still settling). |
| **Low volatility** (changes over days/weeks) | **Tier 2 — Refresh-on-view, then cache.** Follower count on a profile screen, aggregate engagement rate on a dashboard the user just opened. | **Tier 4 — Background, low frequency.** Historical post insights older than a few days, long-term growth trend lines, anything feeding a monthly report. |

Every data type Veefore touches — comments, DMs, follower count, reach, views, saved, shares, story metrics, mention notifications, scheduled-post status — gets explicitly assigned to one of these four cells before any scheduling code is written. Maintain this as one documented table in the codebase, not scattered implicitly across polling-interval constants — adding a new metric later should mean adding one row to a table, not guessing at a new interval from scratch.

### 1.3 What each tier means operationally

- **Tier 1** is not polled at all where a webhook exists (comments, mentions). Where no webhook exists but visibility is genuinely real-time (a user staring at the calendar screen waiting for a scheduled post to confirm it published), this is the only tier permitted to poll on a short interval, and even then, only for the specific account-and-resource the user is actively viewing — never as a background sweep across all accounts.
- **Tier 2** uses a "refresh on view, then hold" pattern: when a user opens a screen showing this data, trigger one refresh if the cached value is older than a reasonable threshold (say, an hour), then don't refresh again until they leave and return, or a longer background interval elapses. The trigger is the user's action of looking, not a clock.
- **Tier 3** runs on an impression-scaled cadence (larger, more active accounts can tolerate more frequent polling — see the foundational document's Section 3.4), narrows automatically for posts in their first 24–48 hours (Instagram's own insight values are known to fluctuate and stabilize during that window), and widens once a post ages past that window.
- **Tier 4** runs at the lowest priority and widest interval in the entire system, explicitly permitted to be deferred indefinitely under load without any user-facing consequence, since by definition nobody is watching it in the moment.

---

## Part 2 — Every Metric, Named, Scheduled, and Justified

This is the literal, complete answer to "how and when do they poll followers, reach, insights, demographics, and everything else" — each row stating the endpoint, the tier it belongs to (from Part 1), the cadence, and why.

### 2.1 Account-level metrics — polled via `GET /{ig-user-id}/insights`

| Metric | What it is | Tier | Cadence | Why |
|---|---|---|---|---|
| `reach` | Unique accounts that saw any content in the period | 3 | Every 2–4 hours, large accounts; every 6–8 hours, small accounts | Moves continuously through the day but not minute-to-minute; checking more often produces no visible dashboard change |
| `views` | Total times content was displayed (the current metric — see 2.1.1 below for why this replaced `impressions`) | 3 | Same cadence as `reach`, fetched in the same call | Shares the same endpoint and period as reach — always request together, never as separate calls |
| `profile_views` | Number of profile visits | 4 | Every 4–6 hours | Lower inherent volatility than reach/views; checking once or twice a day is normal usage |
| `follower_count` | Current follower total | 2 | Hourly, large/active accounts; every 4–6 hours, small/new accounts | Low volatility, high visibility — refresh-on-view plus a background floor, not continuous polling |
| `follower_demographics` (age/gender breakdown) | Aggregate audience composition | 4 | Once every 24 hours, never more | Population-level breakdown that changes slowly by nature, and **only returned for accounts with 100+ followers** — accounts below that threshold should skip this metric entirely, since polling it returns nothing and wastes a call |
| `online_followers` | When followers are typically active | 4 | Once every 24 hours | Slow-moving behavioral pattern, not a live counter |
| `email_contacts` / `phone_call_clicks` / `text_message_clicks` / `get_directions_clicks` (Business/Creator profile action taps) | Profile action button taps | 4 | Every 6–12 hours | Low volume and low volatility for the vast majority of accounts; bundle into the same low-frequency sweep as profile_views |

#### 2.1.1 Correction: `impressions` is deprecated — use `views` for current content

Meta's own current documentation states this directly: for media created after July 2, 2024, `impressions` is deprecated as of v22.0 and was fully deprecated for all API versions on April 21, 2025 — a date that has already passed. **Any new post created going forward must not request `impressions`; it will error.** The replacement metric is `views` — total number of times the media has been played/seen on Instagram. Older media created before July 2, 2024 will continue to return `impressions` correctly under older API versions, so a backfill job touching historical posts may still legitimately request it for that specific older content, but all new scheduling logic should default to `views`.

### 2.2 Media-level (post) metrics — polled via `GET /{ig-media-id}/insights`

| Post age | Tier | Cadence | Why |
|---|---|---|---|
| 0–48 hours old | 3 | Every 2–4 hours | Instagram's own insight values fluctuate and stabilize during this window — high volatility while fresh |
| 2–7 days old | 3 → 4 transition | Once every 12 hours | Still settling slightly but far less than the first 48 hours |
| 7–30 days old | 4 | Once every 24 hours | Mostly stable; daily is enough to catch slow accumulation |
| 30+ days old | 4 | Once every 7 days, low priority, deferrable indefinitely under load | No user is watching a month-old post's numbers tick up in real time |

**Metrics to actually request in this call, confirmed against Meta's current media-insights reference:** `reach`, `views`, `likes`, `comments`, `saved`, `shares`, and `total_interactions` are all valid, current fields on `FEED` and `REELS` media objects. `saved` and `shares` are not a separate feature or a separate call — they live in exactly the same `/insights` endpoint and same field list as reach and views, and therefore inherit the same age-based cadence in the table above. There is no reason to ever fetch them on a different schedule than the rest of a post's insight bundle.

**Critical implementation detail:** never issue one `/insights` call per post in a loop. Use field expansion on the media list endpoint to retrieve media fields and their insights in a single combined request, now including the previously-missing fields explicitly:

```
GET /{ig-user-id}/media
  ?fields=id,caption,media_type,timestamp,like_count,comments_count,insights.metric(views,reach,saved,shares,total_interactions){data}
  &limit=25
```

This collapses what would otherwise be N+1 round trips into one HTTP request per batch of up to 25 posts.

### 2.3 Comments, mentions, story expiry — webhook only, zero polling, ever

These three data types have Meta-provided webhooks. **There is no cadence to set for them because they are never polled.** If a cron job or repeatable BullMQ job exists anywhere in the codebase for "check for new comments," that is a bug — delete it and verify the webhook subscription is actually active for that account instead.

### 2.4 New post detection — the one genuinely awkward gap

No webhook exists for "a new post was published" unless it was published *through* Veefore itself (in which case you already know about it and don't need to poll at all). This only matters for posts published directly on Instagram, outside Veefore.

| Tier | Cadence | Justification |
|---|---|---|
| 3/4 boundary | Every 2–4 hours, large/active accounts; every 6–8 hours, small accounts | The one place in the system polling for the *existence* of new data rather than refreshing known data — keep it infrequent, since there is no UX reason a user needs to learn about their own externally-published post within minutes |

### 2.5 Story insights — narrow window, hard deadline, special handling required

| Metric | Tier | Cadence | Critical constraints |
|---|---|---|---|
| `story_insights` (`reach`, `views`/`replies`/`navigation` with breakdowns, `total_interactions`) | 1 (time-boxed) | Every 2–3 hours while the story is active | **Stories expire after 24 hours and their insights become permanently unavailable once expired** — confirmed directly in Meta's documentation. This is not a "lower priority over time" metric like posts; it is a hard deadline. The polling job for a given story must guarantee at least one successful fetch before the 24-hour mark. |

**Two corrections to fold in here, both confirmed against Meta's current reference docs:**

1. **Low-viewer-count stories will return what looks like an error but isn't one.** Meta's own documented behavior: story media metrics with values less than 5 return an error code 10 with the message "Not enough viewers for the media to show insights." The polling worker must treat this specific error code as an expected, normal outcome for low-reach stories — not retry it as a transient failure, and not log it as an actual error. It should simply be recorded as "insufficient data" and the job marked complete, not failed.
2. **The webhook does not replace the need for a guaranteed final poll.** Meta explicitly recommends subscribing to `story_insights` via webhook to get data before expiry, but webhooks can be missed, delayed, or arrive during a period when the account is already throttled. The recurring poll plus a guaranteed final-fetch job (Section 4.5 below) exist specifically as the safety net under the webhook, not as a replacement for it.

### 2.6 Business Discovery (competitor/public account lookups, if Veefore offers this feature)

| Tier | Cadence | Justification |
|---|---|---|
| 4 | Once every 24 hours per tracked competitor account, never more | Counts against the same per-user-token budget as everything else; competitor benchmarking is inherently a slow-moving comparison, not a live feed |

---

## Part 3 — Distributing Poll Jobs Across Time: The Exact Mechanism

Knowing *when* each metric should poll (Part 2) doesn't by itself prevent every account's job from firing at the same instant. This section is the actual formula and queueing pattern that makes "don't call everything at once" real rather than a sentence.

### 3.1 Why naive scheduling fails at scale, concretely

If every account's "poll follower count hourly" job is scheduled to fire at the top of the hour, then at minute zero of every hour, every single connected account's follower-count job fires simultaneously. This is the thundering herd problem, and it is the default behavior of almost every naive cron-based scheduler. The danger isn't only Meta's rate limits; it's Veefore's own backend, Redis instance, and database being asked to process thousands of simultaneous jobs at the same instant, every hour, forever.

### 3.2 The jitter formula — apply this to every recurring job, not just retries

Instead of scheduling a job for exactly `interval`, schedule it for `interval + random(-spread, +spread)`, where `spread` is a meaningful fraction of the interval itself (commonly 10–25%). For an hourly job: instead of every account firing at exactly :00, each account's actual fire time is randomized within roughly a 10–15 minute window around the hour mark. The effect: instead of one instantaneous spike of N simultaneous jobs, a smooth, continuous trickle spread across that window — same total work done per hour, radically different load shape.

This jitter principle applies in two distinct places:

1. **Initial scheduling** — a job's first-ever fire time should be jittered, not aligned to a clean boundary like the top of the hour.
2. **Retry/backoff after a failure or throttle** — using *full jitter* (a random value between zero and the full backoff window) rather than a fixed delay plus a small offset, since full jitter has been shown to outperform fixed-offset jitter at spreading retry load.

### 3.3 Deterministic spreading via hashing — the more robust version of 3.2

Pure randomness works but means an account's fire time isn't stable across restarts. A more robust approach: derive the jitter deterministically from a stable property of the account itself, typically by hashing the account ID and using the hash to compute an offset within the spread window. The same account always lands at the same offset within its window — spread is preserved permanently, and the system's load shape is reproducible and debuggable rather than depending on fresh randomness every time.

### 3.4 Per-tenant queues feeding a fairness-aware dispatcher

Time-spreading solves *when* a job is scheduled to fire. It does not solve *what happens when many jobs are ready to fire near-simultaneously anyway* (which will still happen at scale, just less severely). For that, the job system itself needs structure:

- **Each connected Instagram account gets its own logical queue** of pending polling work, rather than every account's jobs being dumped into one undifferentiated global queue — so one account's job volume can never crowd out another's.
- **A higher-level dispatcher tracks, across all per-account queues, which has the earliest-available job and which tier that job belongs to**, and assigns available workers accordingly — pulling from whichever account-queue has the highest-priority ready work, not a fixed round-robin that ignores priority.
- **Workers must auto-scale and must not be statically bound to specific accounts.** A worker pool that picks up "whatever account-queue currently has the most urgent ready work" is what allows the system to keep working under uneven, unpredictable load across thousands of accounts of wildly different sizes.
- **This is the direct mechanism for cross-account fairness, not just within-account prioritization.** Without per-account queues, a small number of extremely active accounts could starve smaller, quieter accounts of worker time simply by having more jobs ready more often.

### 3.5 Putting 3.1 through 3.4 together — what actually happens, end to end

1. Every recurring polling job for every account has its base interval determined by the Part 1 tier and Part 2 cadence it belongs to.
2. That interval is jittered (3.2/3.3) so the *scheduled* fire time is spread, not clustered.
3. When a job becomes ready, it lands in that specific account's own queue (3.4), not a shared global queue.
4. A fairness-aware dispatcher decides which ready job, across all accounts' queues, gets the next available worker — respecting both tier priority and basic cross-account fairness.
5. Before the worker actually executes the call, it checks the account's live usage percentage from the foundational document's usage-tracking layer, and the four-tier headroom policy makes the final go/no-go decision.

These five steps solve five different problems. None substitutes for another — removing any one re-introduces exactly the failure mode it was added to prevent.

---

## Part 4 — Implementing This in BullMQ: The Actual Code Patterns

Everything below uses real, current BullMQ APIs (verified against BullMQ 5.x documentation), directly implementing the mechanisms described conceptually in Parts 1–3. Where a real BullMQ field exists for something described above (jitter, priority, repeatable jobs), this section names that exact field rather than a hand-rolled equivalent.

### 4.1 Queue structure — one queue per tier, not one queue per account

Do not create a literal separate BullMQ `Queue` instance per Instagram account — with potentially thousands of connected accounts, thousands of live Queue/Worker instances is operationally unworkable. Instead, **create one BullMQ queue per Part 1 tier**, and achieve the per-account isolation described in Section 3.4 through job-level fields (`jobId` uniqueness) rather than separate queue instances.

```javascript
// src/queues/index.ts
import { Queue } from 'bullmq';
import { redisConnection } from '../redis';

const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,
    jitter: 0.3, // built-in BullMQ field, 0–1 scale — this is the literal implementation of Section 3.2's full-jitter retry principle, no custom randomization needed
  },
  removeOnComplete: { count: 500, age: 24 * 60 * 60 },
  removeOnFail: { count: 2000, age: 7 * 24 * 60 * 60 },
};

// One queue per Part 1 tier
export const tier1Queue = new Queue('ig-tier1-realtime', { connection: redisConnection, defaultJobOptions });
export const tier2Queue = new Queue('ig-tier2-refresh-on-view', { connection: redisConnection, defaultJobOptions });
export const tier3Queue = new Queue('ig-tier3-scheduled', { connection: redisConnection, defaultJobOptions });
export const tier4Queue = new Queue('ig-tier4-background', { connection: redisConnection, defaultJobOptions });
export const storyInsightsQueue = new Queue('ig-story-insights', { connection: redisConnection, defaultJobOptions }); // separate queue — see 4.5, the hard-deadline case needs different handling than the rest of Tier 1
```

### 4.2 Per-account scheduling via `jobId`, not separate queues — implementing Section 3.3's deterministic hashing

```javascript
// src/scheduling/scheduleAccountPolling.ts
import { tier3Queue } from '../queues';
import { hashAccountId } from '../utils/hashing';

export async function scheduleAccountReachPolling(accountId: string, tierIntervalMs: number) {
  // Deterministic jitter (Section 3.3): derive a stable offset from the account
  // ID itself, so the same account always lands at the same point in its window
  // across restarts, rather than re-randomizing every time this function runs.
  const spreadWindowMs = tierIntervalMs * 0.15; // 15% spread, per Section 3.2
  const deterministicOffset = hashAccountId(accountId) % spreadWindowMs;

  await tier3Queue.add(
    'poll-reach-views',
    { accountId, metricGroup: 'reach_views' }, // 'views', not 'impressions' — see Section 2.1.1
    {
      repeat: { every: tierIntervalMs },
      jobId: `reach-views:${accountId}`, // uniqueness scoped per account, not per queue — this is the application-level mechanism implementing Section 3.4's per-account isolation
      delay: deterministicOffset, // applied once, on first scheduling
    },
  );
}
```

`hashAccountId` only needs to be a simple, stable hash function (a basic string hash mod the window is sufficient — cryptographic strength is not required, only stable distribution).

### 4.3 Worker setup — concurrency, rate limiting, and the account-headroom check, implementing Section 3.5's step 5

```javascript
// src/workers/tier3Worker.ts
import { Worker } from 'bullmq';
import { redisConnection } from '../redis';
import { fetchAccountUsage } from '../usage/usageStore'; // from the foundational document's usage-tracking layer
import { fetchReachViews } from '../instagram/client';

const tier3Worker = new Worker(
  'ig-tier3-scheduled',
  async (job) => {
    const { accountId, metricGroup } = job.data;

    // Check stored usage BEFORE making the call — implementing the
    // foundational document's "check first, not after" principle directly.
    const usage = await fetchAccountUsage(accountId);

    if (usage.call_count_pct >= 95) {
      throw new Error('DEFERRED_CRITICAL_TIER'); // Critical tier — defer, do not attempt
    }
    if (usage.call_count_pct >= 80 && metricGroup !== 'urgent') {
      throw new Error('DEFERRED_RESTRICTED_TIER');
    }

    const result = await fetchReachViews(accountId);
    return result;
  },
  {
    connection: redisConnection,
    concurrency: 20, // tune based on observed load — jobs this worker process handles in parallel
    limiter: {
      max: 100,   // BullMQ's built-in global rate limiter for this worker — see 4.6 for why this is necessary alongside the per-account check above
      duration: 60000,
    },
  },
);

tier3Worker.on('failed', (job, err) => {
  if (err.message.startsWith('DEFERRED_')) {
    // This is not a real failure — re-add with a delay rather than counting
    // against attempts, since this isn't an error condition, it's the
    // four-tier policy correctly doing its job.
  }
});
```

**Honest limitation worth flagging:** BullMQ's open-source `limiter` option is a *global* rate limit for the worker as a whole — it does not natively support a separate limit per account out of the box (true per-key rate limiting is a BullMQ Pro feature). The per-account governance described throughout this document is therefore implemented at the *application logic level*, inside the processor function (the `fetchAccountUsage` check above), not through BullMQ's built-in limiter. Both mechanisms are still needed simultaneously — they protect different things (Section 4.6 explains exactly why).

### 4.4 Priority — using BullMQ's real `priority` field, mapped directly to Part 1's tiers

```javascript
// Tier 1, genuinely urgent — e.g. a user is actively viewing the calendar
// screen waiting on a scheduled post's status:
await tier1Queue.add(
  'check-publish-status',
  { accountId, mediaContainerId },
  {
    priority: 1, // BullMQ: 1 is highest priority, lower number always wins over higher
    jobId: `publish-status:${mediaContainerId}`,
  },
);

// Tier 4, routine background backfill, lowest priority:
await tier4Queue.add(
  'backfill-historical-insights',
  { accountId, mediaId },
  {
    priority: 2097152, // BullMQ's documented max value — effectively "process this last"
  },
);
```

Per BullMQ's own documented behavior, jobs without an explicit priority default to highest priority — so **every job added to these queues must have an explicit priority set**, or background backfill jobs will silently compete equally with real-time checks, defeating the entire point of the tiering in Part 1.

### 4.5 Story insights — the hard-deadline case, implementing Section 2.5's corrections directly

Because story insights disappear entirely after 24 hours, frequent polling alone isn't sufficient — a guaranteed last-chance fetch must be scheduled relative to the story's known expiry, plus explicit handling of the "not enough viewers" case from Section 2.5:

```javascript
import { storyInsightsQueue } from '../queues';

export async function scheduleStoryInsightsPolling(accountId: string, storyId: string, postedAt: Date) {
  const expiresAt = new Date(postedAt.getTime() + 24 * 60 * 60 * 1000);

  // Recurring checks every 2-3 hours while active
  await storyInsightsQueue.add(
    'poll-story-insights',
    { accountId, storyId },
    { repeat: { every: 2.5 * 60 * 60 * 1000 }, jobId: `story:${storyId}` },
  );

  // Guaranteed final fetch, scheduled 30 minutes before expiry — the safety
  // net ensuring data is captured even if the recurring job above was
  // deferred at every prior attempt due to account-level throttling.
  await storyInsightsQueue.add(
    'final-story-insights-fetch',
    { accountId, storyId },
    {
      delay: expiresAt.getTime() - Date.now() - 30 * 60 * 1000,
      priority: 1, // allowed to override normal headroom deferral — see note below
      jobId: `story-final:${storyId}`,
    },
  );
}

// In the story-insights worker's processor:
async function processStoryInsights(job) {
  try {
    return await fetchStoryInsights(job.data.storyId);
  } catch (err) {
    if (err.code === 10) {
      // "Not enough viewers for the media to show insights" — Section 2.5's
      // documented expected behavior for low-reach stories. This is not a
      // failure: mark the job complete with a null/insufficient-data result,
      // do not retry, do not log as an error.
      return { insufficientData: true };
    }
    throw err; // genuine errors still propagate normally
  }
}
```

**Architectural exception worth flagging:** the final-fetch job is the one case in the entire system permitted to override the account-headroom deferral logic, *if* the account is not already in the absolute Critical (95%+) tier — because deferring it means permanent data loss, not just staleness, a meaningfully different cost than every other deferred job in this system.

### 4.6 Why a backend-level worker rate limit matters even though Meta's limit is the "real" one

The `limiter` field in Section 4.3 is not redundant with Meta's own rate limit — it protects a different resource. Meta's BUC limit protects Meta's servers from any single account's traffic; BullMQ's worker-level limiter protects **Veefore's own Redis instance and downstream systems** from being overwhelmed if, say, 5,000 jobs all become ready at once due to a scheduling anomaly. Both limits should exist simultaneously and independently — removing either one re-exposes a different failure mode.

### 4.7 Observability — querying what BullMQ already tracks

```javascript
import { tier3Queue } from '../queues';

export async function getQueueHealthSnapshot() {
  const counts = await tier3Queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'prioritized');
  return counts;
  // Feed this into whatever dashboard/alerting Veefore's own team uses — a
  // sustained climb in `waiting` or `delayed` for a given tier is the earliest
  // signal that account-level deferrals are happening more than expected.
  // This is exactly the internal metric Part 6's enterprise observability
  // requirement calls for.
}
```

---

## Part 5 — UX: Why "Looks Broken or Fake" Happens, and the Exact Fixes

The foundational document established stale-while-revalidate and "last updated" timestamps as principles. This section gets specific about the failure modes that make a technically-correct analytics product *feel* broken — because feeling broken is a UX bug regardless of whether the backend is working correctly.

### 5.1 The core failure mode: inconsistent freshness across one screen

If a dashboard shows reach as "updated 2 minutes ago" right next to follower count showing "updated 6 hours ago," a user's instinctive reaction is that something is wrong — even though both numbers are correctly reflecting their own tier's legitimate cadence from Part 1/2. The fix is not artificial uniformity (which means either over-polling the slow metric or under-polling the fast one) — the fix is making the *reason* for the difference visible and ordinary-feeling, not hidden and suspicious-feeling.

Concretely: group metrics on a screen by their actual tier, and label tiers distinctly. A small, calm distinction — real-time-feeling metrics shown with a live-updating indicator, slower metrics carrying a simple timestamp — teaches the user this is by design, the same way every mature analytics product already does.

### 5.2 Never show a number transitioning through zero or a placeholder during a refresh

A metric briefly flashing to "0" or "—" while a background refresh is in flight, before the real number renders, is enough to make an otherwise well-engineered system look broken on every page load. The fix, directly enforcing stale-while-revalidate at the rendering layer: the previous known value remains on screen, unchanged, until a new value is actually ready to replace it. There is no intermediate state where the UI shows "no data" for a metric that has previously had data.

### 5.3 Skeleton states are for first-ever load only, never for refresh

A loading skeleton is appropriate exactly once: the very first time a user views a given account's data and nothing has been cached yet. It is not appropriate for every subsequent refresh of an already-loaded screen — doing so recreates the exact problem in 5.2. Distinguish these two states explicitly in frontend logic: `noDataYet` (show skeleton) versus `dataExistsButRefreshing` (show existing data, optionally with a small, non-blocking indicator).

### 5.4 Optimistic UI for user-initiated actions — what makes automation feel instant

When a user manually triggers something — schedules a post, turns on an automation rule, replies to a comment from within Veefore — the UI should reflect that action immediately, before the backend call has even completed, then reconcile silently if the eventual server response differs. If the call later fails, surface that specifically and roll back the optimistic state — but the default, success-path experience must feel immediate, since for the vast majority of calls it will in fact succeed.

### 5.5 The "honest confidence" tone for every freshness indicator

Every timestamp, every "refreshing" state, every deferred-feature message should read as a deliberate, normal feature of a sophisticated product — never as an excuse or a technical confession. "Updated 12 minutes ago" is confident. "Sorry, data may be delayed" is not. A Tier 1 metric showing a small live-pulse indicator should look like a deliberate design choice signaling "this is live," not a debug artifact.

---

## Part 6 — Enterprise-Readiness: What an MVP Has That an Enterprise Platform Doesn't

Parts 1–5 make the system correct and pleasant at moderate scale. This section addresses what "scalable and ready to become the next enterprise" requires beyond that — categories of engineering work a working MVP typically skips entirely, not just more of the same work done harder.

### 6.1 Multi-tenant isolation, made explicit rather than incidental

Section 3.4's per-account queues already provide meaningful isolation. Enterprise-readiness requires going further: no single connected account, no single Veefore customer, and no single automation rule can degrade the experience for any other tenant, under any failure mode — not just under normal load. A poorly-configured automation rule that loops or fires excessively on one account must be contained (rate-limited at the Veefore application level, independent of Meta's own limits) before it can consume a disproportionate share of shared infrastructure.

### 6.2 Tiered service levels as a first-class architectural concept

If Veefore intends to serve both small creators and large agencies/enterprises on the same platform, the priority and fairness mechanisms in Part 3 should support an explicit tier weighting, not just strict equality. A higher-paying enterprise tenant's queue can reasonably receive a larger proportional share of worker attention during contention, without starving smaller tenants entirely — a deliberate business and architecture decision made explicit, the same way other multi-tenant platforms expose tenant-level priority weighting as a configurable property rather than hardcoding uniform treatment.

### 6.3 Observability: you cannot operate what you cannot see

An enterprise-grade system requires real-time visibility into the mechanisms described in this document — not just logs to grep through after something breaks. At minimum: per-account usage-percentage trends over time (not just the instantaneous value), per-tier polling success/deferral rates, queue depth per account and system-wide (Section 4.7), and alerting when any account approaches its Restricted or Critical tier repeatedly, since repeated near-limit behavior on one account is a signal worth surfacing to Veefore's own team, not silently absorbing.

### 6.4 Graceful degradation as a designed state, not an accident

Every component in this architecture — the usage-tracking layer, the webhook queue, the per-account job queues, the dispatcher — should have an explicit, designed behavior for what happens when it is itself under stress or partially failing, not just for when the *external* Meta API is the thing failing. If internal queue infrastructure becomes backed up, the system should shed load predictably (defer the lowest-tier work first, mirroring the external-rate-limit tiering logic) rather than failing unpredictably across all tiers simultaneously.

### 6.5 Idempotency everywhere a job might be retried

Because this architecture explicitly retries deferred and failed work, every job must be safe to execute more than once without causing duplicate side effects — a comment-reply automation that retries after a transient failure must not risk sending the same reply twice if the original call actually succeeded but the success response was lost. Each job should carry an idempotency key, and any user-facing action checks that key before executing, not just before logging.

### 6.6 Configuration over hardcoding

Tier thresholds (the 60/80/95% boundaries), jitter spread percentages, per-tier base intervals, and tenant-priority weights should all be runtime-configurable, not compiled-in constants — tuning these values based on real production behavior, without a deployment, is exactly the operational flexibility an enterprise-scale system needs and an MVP typically lacks.

### 6.7 Audit trail for automation actions specifically

Because comment and DM automation take actions on a user's behalf against a third-party platform, every automated action should be logged with enough detail to answer "why did the system do this, and when" after the fact — which rule matched, what the input was, what was sent, and the outcome. This is both an operational necessity for debugging at scale and, for enterprise customers specifically, frequently a compliance and trust requirement.

---

## Summary — Build Order

1. **Part 1's classification table first** — every other section references it.
2. **Part 2's metric-and-cadence table second** — this is what actually gets typed into scheduling code, with the `views`-not-`impressions` and `saved`/`shares`-bundled-with-the-rest corrections already applied.
3. **Part 3's jitter-and-queue mechanism third** — the actual scheduling substrate everything runs on.
4. **Part 4's BullMQ code fourth** — the literal implementation of Parts 1–3, including the honest caveat about open-source BullMQ's lack of native per-key rate limiting, and the story-insights hard-deadline pattern with its specific error-code-10 handling.
5. **Part 5's UX fixes layered directly onto rendering logic as features are built**, not as a pass at the end.
6. **Part 6 treated as an ongoing discipline applied to every component as it's built**, not a separate phase to return to later — retrofitting idempotency or observability onto an already-built system is dramatically more expensive than building them in from the start.

## Quick-reference table

| Data type | Webhook or poll? | Cadence (if polled) |
|---|---|---|
| Comments, mentions | Webhook | Never polled |
| Story expiry event | Webhook | Never polled |
| Story insights (while active) | Poll | Every 2–3 hrs + guaranteed final fetch before 24-hr expiry; error code 10 ("not enough viewers") is expected, not a failure |
| New post detection | Poll | 2–4 hrs (large) / 6–8 hrs (small) |
| Reach, views (not impressions — deprecated) | Poll | 2–4 hrs (large) / 6–8 hrs (small) |
| Profile views | Poll | 4–6 hrs |
| Follower count | Poll | Hourly (large) / 4–6 hrs (small) |
| Follower demographics | Poll | 24 hrs, only if 100+ followers |
| Business action clicks | Poll | 6–12 hrs |
| Post insights (incl. saved, shares), 0–48 hrs old | Poll | 2–4 hrs |
| Post insights, 2–7 days old | Poll | 12 hrs |
| Post insights, 7–30 days old | Poll | 24 hrs |
| Post insights, 30+ days old | Poll | 7 days, deferrable |
| Business Discovery (competitors) | Poll | 24 hrs |
