# Smart Polling System — How and When It Fires

This document explains exactly how Veefore's smart polling decides **what** to
fetch, **how often**, and **for which account**. Every number here is read from
`server/config/rateLimitConfig.ts` (`DEFAULT_CONFIG.smartPolling` and
`DEFAULT_CONFIG.polling`) — the single source of truth. To change a cadence,
change the config (or set the matching `SP_*` / `RATE_LIMIT_*` env var) and
restart the server. No interval literals live in scheduling code.

> Last verified against config: 2025-01-15.

---

## 1. The big picture

Smart polling runs on top of the existing
`GovernedHttpClient → UsageStore → TieredJobScheduler → MetricsQueueManager`
foundation. Every API call is routed through `GovernedHttpClient`, so it counts
against the account's Meta rate-limit budget.

The scheduler answers three questions per account, every cycle:

1. **Ceiling classification** — is this account HIGH or LOW ceiling? (drives how
   aggressively we poll)
2. **Per-data-type cadence** — how often does each metric refresh?
3. **Per-post cadence** — for post insights, how old is the post? (older posts
   refresh slower)

Plus two delivery rules:

- **Webhook-only data is never polled** (comments, DMs, mentions).
- **Stories get a guaranteed poll safety net** even though they also arrive via
  webhook.

---

## 2. Ceiling classification (HIGH vs LOW)

An account is **HIGH ceiling** when its daily impressions are **≥ 1000**
(`highCeilingImpressionThreshold: 1000`). Otherwise it is **LOW ceiling**.

- HIGH-ceiling accounts have more rate-limit headroom (BUC = 4,800 × daily
  impressions) → polled more frequently.
- LOW-ceiling accounts are protected with longer intervals so a small account
  never burns its budget.

The `ceilingScalingFactor` multiplies post-insight age-bucket intervals:

| Classification | Factor |
|----------------|--------|
| HIGH           | 1.0    |
| LOW            | 2.0 (polled half as often) |

---

## 3. Per-data-type cadence (account-level jobs)

`scheduleSmartPolling` (in `server/queues/metricsQueue.ts`) creates **four
separate repeatable BullMQ jobs** per connected account, each with its own
interval. This replaced the old single `all` job that fetched everything at one
fixed interval.

| Job (`cadenceType`)  | What it fetches                          | HIGH ceiling | LOW ceiling |
|----------------------|------------------------------------------|--------------|-------------|
| `accountInsights`    | reach, profile views (account-level)     | every 1h     | every 4h    |
| `postInsightsRecent` | per-post insights (views/reach/saved/shares/interactions) | every 3h\* | every 5h\* |
| `newPostDetection`   | media list only — detect new posts       | every 2h     | every 6h    |
| `followerCount`      | follower count (profile call)            | every 1h     | every 5h    |

\* `postInsightsRecent` interval is **overridden by the age-bucket cadence** of
the account's newest post (see §4). The PollingCadence value (3h/5h) is only the
fallback when the age-aware calculation is unavailable.

If the `TieredJobScheduler` is unavailable, a single consolidated fallback job
(`cadenceType: 'all'`) runs at an activity-derived interval instead.

**API cost per job** (kept deliberately small):
- `accountInsights` → ~2 calls
- `postInsightsRecent` → ~3 calls (profile + media list + batch insights)
- `newPostDetection` → ~2 calls (profile + media list)
- `followerCount` → 1 call

### Metric → tier base intervals

Every metric is classified into one of four tiers in
`server/config/metricRegistry.ts`. The tier's base interval comes from
`metricTierBaseIntervalsMs`:

| Tier | Base interval | Example metrics |
|------|---------------|-----------------|
| 1    | 5 min         | comments, dms, mentions, story_insights |
| 2    | 1 hour        | follower_count, reach, views, profile_views, saved, shares |
| 3    | 3 hours       | scheduled_post_status, new_post_detection |
| 4    | 24 hours      | follower_demographics, online_followers, business_action_clicks, business_discovery |

---

## 4. Per-post insight cadence (age buckets)

Post insights are **not** fetched at a flat interval. Each post is refreshed
based on its **age** — the older a post, the less often it changes, so we poll
it less. Interval = `bucketBaseInterval × ceilingScalingFactor`.

| Post age          | Base interval | HIGH (×1.0) | LOW (×2.0) |
|-------------------|---------------|-------------|------------|
| 0 – 48h           | 1h            | every 1h    | every 2h   |
| 48h – 7 days      | 6h            | every 6h    | every 12h  |
| 7 – 30 days       | 24h           | every 24h   | every 2 days |
| > 30 days         | 7 days        | every 7d    | every 14d  |

- A post that crosses a bucket boundary is rescheduled to the new (slower)
  bucket within one polling cycle (`selectAgeBucket` recomputes age each run).
- **Hard cutoff:** posts older than **6 months** (`maxInsightsAgeMs`) are never
  insight-polled, regardless of bucket — old posts rarely change and aren't
  worth the budget.
- `saved` and `shares` are **not** separate jobs — they ride in the same bundled
  media-insights field-expansion request, so they inherit the post's cadence.

### Per-post due check (live worker)

The fetch worker (`filterMediaForInsights` in `SocialAccountService.ts`)
evaluates each post individually: a post is **due** when
`now − lastInsightsFetchedAt ≥ computePostInterval(postAge, ceiling, config)`.
A never-fetched post is always due. This is what makes age buckets actually
take effect at fetch time, instead of a flat 72h window.

> **Known limitation:** the incremental sync path only re-fetches the **newest
> 10 posts** (`mediaLimit = isBackfill ? 100 : 10`). Posts beyond the latest 10
> are not revisited by age bucket in the incremental path — only on a full
> backfill (initial connection, up to 100 posts). For an account that hasn't
> posted recently, the newest posts are still old, so their slow bucket cadence
> applies correctly; but very old posts deep in the history aren't re-polled
> incrementally.

---

## 5. New-post detection

The `newPostDetection` job fetches **only the media list** (no per-post
insights) to spot newly published posts. Interval scales by ceiling:

| Classification | Interval |
|----------------|----------|
| HIGH           | every 2h |
| LOW            | every 6h |

Newly discovered post ids are registered in an idempotent per-account Redis set
(`smartpoll:registeredposts:{accountId}`). Posts published through Veefore are
pre-registered, so re-detecting them is a no-op (no duplicate registration).
A newly discovered post is never-fetched, so the next `postInsightsRecent` run
picks it up for insights.

---

## 6. Stories (safety net)

Stories expire after 24h, so they get special handling rather than a fixed
repeatable job:

- **Recurring fetch:** every ~2.5h (`storyRecurringIntervalMs: 150 min`) while
  the story is live.
- **Final fetch:** 30 min before the 24h expiry (`storyFinalFetchLeadMs`) so we
  capture final insights before Instagram drops the story.

`story_insights` arrives via webhook **and** is polled as a guaranteed safety
net (classified Tier 1 with `mechanism: 'poll'`), so we never miss story data if
a webhook is dropped.

---

## 7. Tier 4 low-frequency metrics (once per 24h)

These account-level metrics are dispatched **at most once per rolling 24h
window** per account, tracked by a per-account Redis marker:

- `follower_demographics`
- `online_followers`
- `business_action_clicks` (bundles email_contacts, phone_call_clicks,
  text_message_clicks, get_directions_clicks)

**Follower-demographics gate:** demographics are only requested when the
account's most recent follower count is **≥ 100**
(`followerDemographicsThreshold`). Below that, Instagram returns insufficient
data. If Meta returns error code 10 (audience too small), the result is recorded
as "insufficient data," the job is marked complete, and it is **not** retried or
logged as an error. When followers rise back above 100, the gate reopens on the
next cycle.

---

## 8. Webhook-only data (never polled)

These never get a polling job — they arrive instantly via webhook:

- `comments`
- `dms` (direct messages)
- `mentions`

`story_insights` is the one exception that is both webhook-delivered and polled
(see §6). The scheduler explicitly refuses to schedule polling for the
webhook-only set (`WEBHOOK_ONLY_DATA_TYPES`).

---

## 9. Jitter (avoiding thundering herds)

When a repeatable job is **first created**, its first fire is offset by a
deterministic jitter in `[0, jitterSpreadFraction × interval]`, where
`jitterSpreadFraction = 0.25`. The offset is a stable hash of
`(accountId | cadenceType)`, so:

- Many accounts don't all fire at the same instant.
- The same account always gets the same offset (no drift).
- Subsequent occurrences fire at the exact base interval (offset applied once).

Retry backoff also uses full jitter (`exponential`, base 2000ms, `jitter: 1`).

---

## 10. Backpressure (internal load shedding)

A `BackpressureMonitor` samples queue depth and Redis latency every 5s
(`evaluationIntervalMs`). With hysteresis:

| Signal        | Trigger (active) | Clear (back to normal) |
|---------------|------------------|------------------------|
| Queue depth   | > 1000 jobs      | < 500 jobs             |
| Redis latency | > 250 ms         | < 100 ms               |

When **active**, the `TieredJobScheduler` sheds the lowest-priority work into the
durable deferred queue, in ascending Classification_Tier order:

- **Shed first:** Tier 4 (BACKFILL), then Tier 3 (POLLING, ANALYTICS_REFRESH).
- **Protected:** Tier 2 (AUTOMATION_REPLY) and Tier 1 (ACTIVE_VIEW,
  USER_INITIATED, due-now SCHEDULED_POST).
- **Resume order on recovery:** Tier 1 first, then descending.

This is purely additive — when no monitor is configured, dispatch behaves
exactly as before.

---

## 11. Usage-tier deferral (Meta rate-limit protection)

Independently of internal backpressure, every dispatch is gated by the account's
**usage tier**, computed from the more restrictive of:

1. **Account-level (BUC):** 4,800 × daily impressions per 24h (per account).
2. **App-level (AU):** 200 × app users per hour (shared across the whole app).

| Job type           | Normal | Caution | Restricted | Critical |
|--------------------|:------:|:-------:|:----------:|:--------:|
| ANALYTICS_REFRESH  | ✅     | ❌      | ❌         | ❌       |
| BACKFILL           | ✅     | ❌      | ❌         | ❌       |
| POLLING            | ✅     | ❌      | ❌         | ❌       |
| AUTOMATION_REPLY   | ✅     | ✅      | ❌         | ❌       |
| SCHEDULED_POST     | ✅     | ✅      | ❌         | ✅ (due) |
| USER_INITIATED     | ✅     | ✅      | ❌         | ❌       |
| ACTIVE_VIEW        | ✅     | ✅      | ✅         | ❌       |

Tier thresholds (% of budget used): Caution 60%, Restricted 80%, Critical 95%.
Deferred jobs persist in a durable BullMQ queue and re-dispatch when usage drops.

---

## 12. Tenant priority weighting (optional)

Disabled by default (`tenantPriority.enabled: false`) — all tenants get equal
shares. When enabled, a `TenantWeightedDispatcher` selects the next tenant under
contention using per-tenant weights (1–1000) over a rolling fairness window
(60s). Invalid/missing weights default to 1 with a warning.

---

## 13. Audit trail

Every smart-polling decision/dispatch can be recorded by `AuditTrailService`,
retained for **90 days** (`audit.retentionSeconds`) via a Mongo TTL index, with
up to 3 persistence retries on write failure.

---

## 14. Worked example: a LOW-ceiling account with old posts

Account `@rahulc1020` — LOW ceiling, 25 posts, newest post ~48 days old.

- **accountInsights** → every 4h
- **followerCount** → every 5h
- **newPostDetection** → every 6h
- **postInsightsRecent** → newest post is 48 days old → falls in the 7–30d…
  actually >30d bucket → base 7d × LOW factor 2.0 = **every 14 days**

So for this account, the dashboard correctly shows post insights refreshing
roughly every 14 days, not every few hours — because there's no recent content
to poll aggressively. If the user posts something new, that post enters the
0–48h bucket and refreshes every 2h (LOW) until it ages out.

---

## 15. Overriding cadences (env vars)

All smart-polling values are overridable at runtime via env vars (validated,
out-of-range values are rejected and the prior valid value is kept). Examples:

| Env var | Overrides |
|---------|-----------|
| `SP_TIER1_BASE_INTERVAL_MS` … `SP_TIER4_BASE_INTERVAL_MS` | per-tier base intervals |
| `SP_MAX_INSIGHTS_AGE_MS` | 6-month insight cutoff |
| `SP_CEILING_FACTOR_HIGH` / `SP_CEILING_FACTOR_LOW` | age-bucket scaling factors |
| `SP_JITTER_SPREAD_FRACTION` | jitter spread (clamped to [0.10, 0.25]) |
| `SP_FOLLOWER_DEMOGRAPHICS_THRESHOLD` | demographics gate (default 100) |
| `SP_NEW_POST_DETECTION_HIGH_MS` / `SP_NEW_POST_DETECTION_LOW_MS` | new-post detection intervals |
| `SP_STORY_RECURRING_MS` / `SP_STORY_FINAL_LEAD_MS` / `SP_STORY_LIFETIME_MS` | story scheduling |
| `SP_BP_TRIGGER_QUEUE_DEPTH` / `SP_BP_TRIGGER_REDIS_LATENCY_MS` / `SP_BP_CLEAR_*` | backpressure thresholds |
| `SP_AUDIT_RETENTION_SECONDS` / `SP_AUDIT_PERSISTENCE_MAX_RETRIES` | audit retention/retries |
| `SP_BUSINESS_DISCOVERY_ENABLED` / `SP_BUSINESS_DISCOVERY_INTERVAL_MS` | business discovery |
| `RATE_LIMIT_POLL_LC_*` / `RATE_LIMIT_POLL_HC_*` | per-data-type PollingCadence (low/high ceiling) |
| `RATE_LIMIT_HIGH_CEILING_THRESHOLD` | HIGH/LOW classification threshold (default 1000) |

---

## 16. Quick reference — "when does X fire?"

| Data | Cadence |
|------|---------|
| Comments / DMs / Mentions | Instant (webhook only, never polled) |
| Story insights | Webhook + poll every ~2.5h, final fetch 30 min before 24h expiry |
| Follower count | HIGH 1h / LOW 5h |
| Account insights (reach, profile views) | HIGH 1h / LOW 4h |
| New post detection | HIGH 2h / LOW 6h |
| Post insights (0–48h) | HIGH 1h / LOW 2h |
| Post insights (48h–7d) | HIGH 6h / LOW 12h |
| Post insights (7–30d) | HIGH 24h / LOW 2d |
| Post insights (>30d) | HIGH 7d / LOW 14d |
| Post insights (>6 months) | Never (hard cutoff) |
| Demographics / online followers / business actions | Once per 24h (demographics gated at ≥100 followers) |
| Business discovery | Disabled by default; once per 24h per competitor when enabled |
