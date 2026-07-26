# Implementation Plan: Enterprise Insights Sync

## Overview

Implementation of the enterprise-grade Instagram insights sync system. Tasks are ordered by dependency: schema changes first, then new services, then wiring into the sync pipeline, then testing.

## Tasks

- [x] 1. Add `lastInsightsFetchedAt` field to ContentModel
  - Add `lastInsightsFetchedAt?: Date` to the `IContent` interface in `server/models/Content/Content.ts`
  - Add `lastInsightsFetchedAt: { type: Date, default: null }` field to the ContentSchema definition
  - Add a compound index `{ workspaceId: 1, accountId: 1, publishedAt: -1 }` for efficient age-based queries
  - Add an index on `{ 'contentData.id': 1 }` to speed up findOneAndUpdate lookups during batch insight persistence

- [x] 2. Create ApiBudgetTracker service
  - Create `server/services/ApiBudgetTracker.ts` with the `ApiBudgetTracker` class
  - Implement `getKey(instagramAccountId)` generating hourly bucket keys: `api_budget:{accountId}:{hourBucket}`
  - Implement `recordCalls(instagramAccountId, count)` using Redis INCRBY with EXPIRE (3600s TTL)
  - Implement `getRemainingBudget(instagramAccountId)` returning `200 - currentCount` (returns 200 when Redis unavailable)
  - Implement `canMakeCall(instagramAccountId, isCritical)` with soft limit (180) and hard limit (195) thresholds
  - Import `redisConnection` and `isRedisAvailable` from `../queues/metricsQueue`, guard all Redis operations with availability checks

- [x] 3. Implement sync phase detection in syncAccount
  - Add phase detection logic that counts existing imported ContentModel documents for the account
  - Set `mediaLimit = 50` when existingPostsCount is 0 (backfill) or when forceRefresh is true
  - Set `mediaLimit = 10` for incremental syncs (existingPostsCount > 0, not force refresh)
  - Replace the existing hardcoded `minPosts` logic (currently `forceRefresh ? 100 : 10`) with phase-based limit

- [x] 4. Wire getBatchMediaInsights into syncAccount
  - Import `InstagramApiService` from `../services/instagramApi` in SocialAccountService
  - Implement `filterMediaForInsights` function that filters posts by 72h freshness window (bypass for backfill)
  - Call `InstagramApiService.getBatchMediaInsights(filteredMedia, accessToken)` with filtered media items
  - Wrap batch insights call in try/catch so sync continues if it fails (log warning, proceed with likes/comments only)
  - Update ContentModel persistence loop to merge batch insight results (shares, saves, reach) into each post's metrics
  - Set `lastInsightsFetchedAt = new Date()` on documents that received batch insights

- [x] 5. Integrate budget tracking into sync pipeline
  - Import `ApiBudgetTracker` at the top of SocialAccountService
  - At start of syncAccount, call `ApiBudgetTracker.getRemainingBudget(account.accountId)` to determine budget state
  - If remaining budget < 20, set `skipInsights = true` (skip account insights and batch post insights, make only 2 calls)
  - Track actual API call count during sync with a local counter
  - After all API calls, call `ApiBudgetTracker.recordCalls(account.accountId, apiCallCount)` to update Redis counter

- [x] 6. Fix engagement rate calculation
  - After persisting media, query ContentModel for posts with at least one non-zero metric
  - Replace current engagement calculation that uses media_count or total DB count as denominator
  - Use new formula: `(totalEngagements / (followers × postsWithMetricsCount)) × 100`
  - Handle edge cases: return 0 when postsWithMetricsCount is 0 or followers is 0
  - Update aggregated totals (totalShares, totalSaves) to include batch insight values instead of hardcoded 0s

- [x] 7. Ensure no-Redis fallback works correctly
  - Verify ApiBudgetTracker.getRemainingBudget returns 200 when isRedisAvailable() is false
  - Verify ApiBudgetTracker.recordCalls is a no-op when Redis unavailable
  - Ensure sync pipeline does not throw when Redis unavailable (all budget calls guarded by availability check)
  - Add log message: `[SYNC] ⚠️ Redis unavailable, budget tracking disabled — using direct sync`

- [x] 8. Remove individual per-post insight calls from sync path
  - Remove the `Promise.all(response.data.map(getMediaInsights))` pattern from media fetching in syncAccount
  - Ensure getUserMedia in sync path returns only basic media list (likes/comments from list endpoint)
  - Use `InstagramApiService.getUserMedia` (static, no per-post calls) instead of `InstagramService.getUserMedia` (which internally calls per-post insights)

- [x] 9. Write property-based tests for core logic
  - Write property test for `filterMediaForInsights`: any media set with random timestamps, only items within 72h returned during incremental; all returned during backfill
  - Write property test for engagement rate: for any (totalEngagements ≥ 0, followers > 0, postsWithMetrics ≥ 0), verify formula correctness and media_count irrelevance
  - Write property test for sync phase detection: for any (existingCount, forceRefresh) pair, verify mediaLimit is correct
  - Write property test for budget threshold behavior: for any remaining budget R in [0, 200], verify correct tier

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2", "3", "8"] },
    { "id": 1, "tasks": ["4", "5", "6", "7"] },
    { "id": 2, "tasks": ["9"] }
  ]
}
```

Tasks 1, 2, 3, 8 can be done in parallel (wave 1). Tasks 4, 5, 6, 7 depend on the earlier tasks (wave 2). Task 9 depends on all implementation being complete (wave 3).

## Notes

- `InstagramApiService.getBatchMediaInsights` already exists and is fully implemented — it just needs to be called during sync.
- The existing `isRedisAvailable()` function in `metricsQueue.ts` provides the Redis status check needed for fallback logic.
- The `InstagramService.getUserMedia` method (instance method) internally calls per-post insights — this is why Task 8 switches to the static `InstagramApiService.getUserMedia` which returns raw media list without per-post calls.
- No client-side changes are needed; the dashboard already reads from MongoDB.
