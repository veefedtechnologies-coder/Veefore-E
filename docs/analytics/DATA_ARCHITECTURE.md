# Veefore Analytics Data Architecture — Single Source of Truth Map

## Overview

All Instagram analytics data originates from ONE Meta API sync (`syncAccount`)
and is deliberately stored in multiple collections. Each collection serves a
distinct read pattern. This is NOT accidental duplication — each store exists
because it answers a different question efficiently.

---

## Collections and Their Purpose

### 1. `socialaccounts` — Live Current State
**Written by:** `SocialAccountService.syncAccount()` on every poll cycle  
**Stores:** `followersCount`, `totalLikes`, `totalComments`, `totalReach`,
`accountReach`, `totalViews`, `totalSaves`, `totalShares`, `engagementRate`,
audience demographics  
**Read by:**
- Home dashboard social account card (`/api/social-accounts`)
- Smart polling tier decisions (`UsageStore`)
- `getPerformanceSummary()` for follower totals
- `getFollowerAnalytics()` for current follower count fallback

**Rule:** Always reflects the LATEST state from Meta. Updated every poll cycle.

---

### 2. `analyticsdailymetrics` — Authoritative Per-Day History Store
**Written by:** BullMQ `analyticsHistoryWorker` ONLY (never by syncAccount directly)  
**Stores two metric groups:**
- `metricGroup: 'insights'` → `{ reach, likes, comments, shares, saves, views, profile_views, website_clicks }` per day
- `metricGroup: 'follows_and_unfollows'` → `{ gained, lost }` per day  

**Read by:**
- `LegacyRollupReadStore` → Analytics dashboards (Audience, Reach, Engagement, etc.)
- `getFollowerAnalytics()` → Home dashboard follower growth metrics
- `getFollowsRange()` / `getInsightsRange()` → Reports, date-range analytics

**Rule:** Immutable once a day is complete. NEVER re-fetched for past days. This is
the single authoritative source for ALL historical analytics. When this data is
present, it ALWAYS wins over the Analytics or Metrics collections.

---

### 3. `instagramfollowersnapshots` — Daily Absolute Follower Count
**Written by:** `SocialAccountService.syncAccount()` (upsert-by-date)  
**Stores:** `{ accountId, instagramUserId, followerCount, snapshotDate }` — one row per account per day  
**Read by:**
- `LegacyRollupReadStore.currentFollowers()` — PRIMARY source for current follower count
- `LegacyRollupReadStore.followersAsOf(date)` — historical follower total lookup
- `LegacyRollupReadStore.getFollowerSnapshotDaily()` — daily series chart
- `getFollowerAnalytics().currentFollowers` — home dashboard follower total

**Rule:** ONE row per account per day. The `instagramUserId` key means data survives
disconnect/reconnect (same account, same history). This is the authoritative source
for "how many followers did we have on date X?"

---

### 4. `analytics` (legacy) — Daily Account-Level Snapshot
**Written by:** `SocialAccountService.syncAccount()` → `analyticsService.recordMetrics()`  
**Stores:** `{ followers, reach, reachDay, reachWeek, reachDays28, views, likes, comments, engagement }` per workspace per day  
**Read by:**
- `AnalyticsRepository.getAnalyticsByDateRange()` → `/api/analytics/historical` endpoint → home dashboard `useHistoricalData` hook
- `AnalyticsService.getPerformanceSummary()` → home dashboard Performance Overview KPIs
- `LegacyRollupReadStore` as FALLBACK when `analyticsdailymetrics` not yet populated

**Rule:** Used by the home dashboard Performance Overview tab (followers/reach per period).
When `analyticsdailymetrics` has data for a date range, that takes precedence in
`LegacyRollupReadStore`. The `analytics` collection is the fallback.

---

### 5. `contents` — Per-Post Metrics
**Written by:** `SocialAccountService.syncAccount()` — one document per Instagram post  
**Stores:** `metrics.{ likes, comments, shares, saves, reach, impressions, views }` per post  
**Read by:**
- `LegacyRollupReadStore.aggregatePublishedContent()` — sums for reach/engagement KPIs
- Home dashboard top performer, content quality
- Reports export
- Post analytics page

**Rule:** The ONLY place per-post granular metrics live. `SocialAccount.total*` fields
are simply the sum of all `Content.metrics` — not a separate data source.

---

### 6. `metrics` — Historical Daily Snapshots (Legacy, MVPs)
**Written by:** `SocialAccountService.syncAccount()` — one row per account per day  
**Stores:** Wide snapshot of all account metrics at a point in time  
**Read by:**
- `/api/workspaces/:id/metrics` endpoint — home dashboard polling status card
- `/api/workspaces/:id/metrics/account/:accountId` — account-level detail

**Rule:** 90-day TTL (auto-expires). Used by the account polling status card for
yesterday-vs-today change calculations. The `LegacyRollupReadStore` analytics
pipeline does NOT use this collection.

---

## Data Flow on Each Sync Cycle

```
Meta API (one call set per sync)
│
├─ followers_count
│   ├─► SocialAccount.followersCount          (live current)
│   ├─► Analytics.followers                   (daily snapshot, home dashboard)
│   ├─► InstagramFollowerSnapshot.followerCount (daily snapshot, analytics)
│   └─► Metrics.followers                     (legacy endpoint)
│
├─ reach / reach_day / reach_week / reach_days_28
│   ├─► SocialAccount.totalReach / accountReach  (live current)
│   ├─► Analytics.reach / reachDay / reachDays28  (home dashboard periods)
│   └─► Metrics.reach                             (legacy endpoint)
│
├─ per-post: likes, comments, saves, reach, views
│   ├─► Content.metrics (per post)               (post analytics, KPIs)
│   └─► SocialAccount.totalLikes/etc.             (live sums for account card)
│
└─ BullMQ worker (separate, async, immutable per day):
    ├─► AnalyticsDailyMetric (insights)           (ALL analytics dashboards)
    └─► AnalyticsDailyMetric (follows_and_unfollows) (follower flow)
```

## Priority Rules (Which Source Wins)

| Metric | Primary Source | Fallback |
|--------|---------------|---------|
| Current followers | `InstagramFollowerSnapshot` (latest) | `SocialAccount.followersCount` |
| Historical follower total | `InstagramFollowerSnapshot` (by date) | Reconstructed from `AnalyticsDailyMetric` |
| Follower gained/lost | `AnalyticsDailyMetric` (follows_and_unfollows) | Snapshot delta |
| Reach / engagement KPIs | `AnalyticsDailyMetric` (insights) | `Analytics` collection |
| Post metrics | `Content.metrics` | n/a |
| Account-level totals | `SocialAccount.total*` | n/a |
| Home dashboard periods | `Analytics` collection | n/a |

## What This Means in Practice

- **No collection is redundant** — each answers a different query shape
- **Reads never go back to Meta** — all reads are DB-only (Redis → MongoDB)
- **`AnalyticsDailyMetric` is the authoritative analytics history** — all analytics
  dashboards (Audience, Reach, Engagement, Content) use this as primary source
- **`Analytics` collection powers the home dashboard** — Performance Overview,
  useHistoricalData hook
- **`InstagramFollowerSnapshot` is the single follower count truth** — both home
  and analytics show the same number because both read from this collection
