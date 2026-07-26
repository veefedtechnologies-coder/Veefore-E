# Design Document

## Overview

This design implements an enterprise-grade Instagram insights sync system that wires the existing `getBatchMediaInsights` into `SocialAccountService.syncAccount`, adds a two-phase sync strategy (backfill vs incremental), fixes the engagement rate formula, introduces post-age-aware re-fetch policies, and adds a Redis-based API budget tracker with graceful fallback. The system achieves accurate per-post metrics using at most 4 API calls per polling cycle within Meta's 200 calls/user/hour budget.

## Architecture

### Component Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                         Sync Pipeline                             │
│                                                                    │
│  ┌─────────────────┐    ┌──────────────────┐    ┌──────────────┐ │
│  │ SocialAccount   │───▶│  SyncOrchestrator │───▶│ ContentModel │ │
│  │ Service         │    │  (Phase Logic)    │    │ (MongoDB)    │ │
│  └─────────────────┘    └──────────────────┘    └──────────────┘ │
│          │                       │                                 │
│          ▼                       ▼                                 │
│  ┌─────────────────┐    ┌──────────────────┐                     │
│  │ ApiBudgetTracker│    │ InstagramApi     │                     │
│  │ (Redis Counter) │    │ Service (Batch)  │                     │
│  └─────────────────┘    └──────────────────┘                     │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **BullMQ/Manual Trigger** → `syncAccount(accountId, options)`
2. **Phase Detection** → Query ContentModel for existing documents → decide Backfill vs Incremental
3. **Budget Check** → `ApiBudgetTracker.getRemainingBudget(accountId)` → determine which calls to make
4. **API Calls** (max 4):
   - Call 1: `getUserProfile` → profile snapshot
   - Call 2: `getAccountInsights` → account-level reach/views (skipped if budget low)
   - Call 3: `getUserMedia(limit)` → media list (50 for backfill, 10 for incremental)
   - Call 4: `getBatchMediaInsights(filteredMedia)` → per-post reach/saves/shares (skipped if budget low)
5. **Persist** → Update ContentModel with per-post metrics + `lastInsightsFetchedAt`
6. **Aggregate** → Calculate engagement rate from posts WITH metrics only
7. **Budget Increment** → `ApiBudgetTracker.recordCalls(accountId, callCount)`

## Components and Interfaces

### ApiBudgetTracker

New service responsible for tracking API call consumption per Instagram account per hour.

```typescript
// server/services/ApiBudgetTracker.ts
export class ApiBudgetTracker {
  static readonly MAX_CALLS_PER_HOUR = 200;
  static readonly SOFT_LIMIT = 180;  // Skip non-critical calls
  static readonly HARD_LIMIT = 195;  // Only token refresh allowed

  /** Get Redis key for the current hour bucket */
  static getKey(instagramAccountId: string): string;

  /** Record N API calls made for this account */
  static async recordCalls(instagramAccountId: string, count: number): Promise<void>;

  /** Get remaining calls available this hour (200 - used) */
  static async getRemainingBudget(instagramAccountId: string): Promise<number>;

  /** Check if a call can be made given current budget */
  static async canMakeCall(instagramAccountId: string, isCritical: boolean): Promise<boolean>;
}
```

### SyncOrchestrator (within SocialAccountService.syncAccount)

Updated sync logic that orchestrates phase detection, budget awareness, and batch insights.

```typescript
interface SyncContext {
  isBackfill: boolean;
  mediaLimit: number;         // 50 or 10
  skipInsights: boolean;      // true when budget < 20
  skipAccountInsights: boolean; // true when budget < 20
  budgetRemaining: number;
}
```

### ContentModel (updated interface)

```typescript
export interface IContent extends Document {
  // ... existing fields ...
  lastInsightsFetchedAt?: Date;  // NEW: timestamp of last insights fetch
}
```

### InstagramApiService.getBatchMediaInsights (existing, no changes)

```typescript
static async getBatchMediaInsights(
  mediaItems: InstagramMediaItem[],
  token: string
): Promise<Record<string, InstagramMediaInsights>>;
```

## Data Models

### ContentModel Schema Addition

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `lastInsightsFetchedAt` | Date | null | Timestamp when per-post insights were last fetched from Meta API |

Index addition: `{ workspaceId: 1, accountId: 1, publishedAt: -1 }` for efficient age-based queries.

### Redis Budget Tracker Key Schema

| Key Pattern | Value | TTL |
|-------------|-------|-----|
| `api_budget:{instagramAccountId}:{hourBucket}` | Integer (call count) | 3600s |

Where `hourBucket = Math.floor(Date.now() / 3_600_000)`.

## Detailed Design

### 1. Sync Phase Detection

```typescript
// Inside syncAccount, after fetching the account document:
const { ContentModel } = await import('../models/Content/Content');
const existingPostsCount = await ContentModel.countDocuments({
  workspaceId: account.workspaceId,
  accountId: account.accountId || accountId,
  isImported: true
});

const isBackfill = existingPostsCount === 0 || options?.forceRefresh;
const mediaLimit = isBackfill ? 50 : 10;
```

### 2. Post-Age Filtering for Batch Insights

```typescript
const FRESHNESS_WINDOW_MS = 72 * 60 * 60 * 1000; // 72 hours

function filterMediaForInsights(
  mediaItems: InstagramMediaItem[],
  isBackfill: boolean
): InstagramMediaItem[] {
  if (isBackfill) return mediaItems; // Fetch all during backfill
  
  const now = Date.now();
  return mediaItems.filter(media => {
    const publishedAt = new Date(media.timestamp).getTime();
    const age = now - publishedAt;
    return age < FRESHNESS_WINDOW_MS;
  });
}
```

### 3. API Budget Tracker Implementation

```typescript
// server/services/ApiBudgetTracker.ts
import { redisConnection, isRedisAvailable } from '../queues/metricsQueue';

export class ApiBudgetTracker {
  static readonly MAX_CALLS_PER_HOUR = 200;
  static readonly SOFT_LIMIT = 180;
  static readonly HARD_LIMIT = 195;
  private static readonly TTL_SECONDS = 3600;

  static getKey(instagramAccountId: string): string {
    const hourBucket = Math.floor(Date.now() / (3600 * 1000));
    return `api_budget:${instagramAccountId}:${hourBucket}`;
  }

  static async recordCalls(instagramAccountId: string, count: number): Promise<void> {
    if (!isRedisAvailable() || !redisConnection) return;
    const key = this.getKey(instagramAccountId);
    await redisConnection.incrby(key, count);
    await redisConnection.expire(key, this.TTL_SECONDS);
  }

  static async getRemainingBudget(instagramAccountId: string): Promise<number> {
    if (!isRedisAvailable() || !redisConnection) return this.MAX_CALLS_PER_HOUR;
    const key = this.getKey(instagramAccountId);
    const current = await redisConnection.get(key);
    return this.MAX_CALLS_PER_HOUR - (parseInt(current || '0', 10));
  }

  static async canMakeCall(instagramAccountId: string, isCritical: boolean): Promise<boolean> {
    const remaining = await this.getRemainingBudget(instagramAccountId);
    if (isCritical) return remaining > (this.MAX_CALLS_PER_HOUR - this.HARD_LIMIT);
    return remaining > (this.MAX_CALLS_PER_HOUR - this.SOFT_LIMIT);
  }
}
```

### 4. Updated syncAccount Flow

```typescript
async syncAccount(accountId: string, options?) {
  const account = await this.getAccountById(accountId);
  const accessToken = getAccessTokenFromAccount(account);
  
  // Phase detection
  const existingPostsCount = await ContentModel.countDocuments({ ... });
  const isBackfill = existingPostsCount === 0 || options?.forceRefresh;
  const mediaLimit = isBackfill ? 50 : 10;
  
  // Budget check
  const budgetRemaining = await ApiBudgetTracker.getRemainingBudget(account.accountId);
  const skipInsights = budgetRemaining < 20;
  
  // API Calls (tracked)
  let apiCallCount = 0;
  
  // Call 1: Profile (always)
  const profile = await instagramService.getUserProfile(accessToken, account.accountId);
  apiCallCount++;
  
  // Call 2: Account insights (skip if budget low)
  let accountInsights = {};
  if (!skipInsights) {
    accountInsights = await instagramService.getAccountInsights(accessToken, account.accountId);
    apiCallCount++;
  }
  
  // Call 3: Media list
  const mediaList = await instagramService.getUserMedia(accessToken, mediaLimit, account.accountId);
  apiCallCount++;
  
  // Call 4: Batch insights (filtered by age, skip if budget low)
  let batchInsights = {};
  if (!skipInsights && mediaList.length > 0) {
    const mediaForInsights = filterMediaForInsights(mediaList, isBackfill);
    if (mediaForInsights.length > 0) {
      batchInsights = await InstagramApiService.getBatchMediaInsights(mediaForInsights, accessToken);
      apiCallCount++;
    }
  }
  
  // Record API usage
  await ApiBudgetTracker.recordCalls(account.accountId, apiCallCount);
  
  // Persist per-post metrics with batch insights
  for (const media of mediaList) {
    const insights = batchInsights[media.id] || {};
    await ContentModel.findOneAndUpdate(
      { workspaceId: account.workspaceId, 'contentData.id': media.id },
      {
        metrics: {
          likes: media.like_count || 0,
          comments: media.comments_count || 0,
          shares: insights.shares || 0,
          saves: insights.saves || 0,
          reach: insights.reach || 0,
          views: insights.video_views || 0,
        },
        lastInsightsFetchedAt: Object.keys(insights).length > 0 ? new Date() : undefined,
      },
      { upsert: true, new: true }
    );
  }
  
  // Corrected engagement rate
  const postsWithMetrics = await ContentModel.countDocuments({
    workspaceId: account.workspaceId,
    accountId: account.accountId,
    isImported: true,
    $or: [
      { 'metrics.likes': { $gt: 0 } },
      { 'metrics.comments': { $gt: 0 } },
      { 'metrics.shares': { $gt: 0 } },
      { 'metrics.saves': { $gt: 0 } }
    ]
  });
  
  const totalEngagements = totalLikes + totalComments + totalShares + totalSaves;
  const engagementRate = (postsWithMetrics > 0 && profile.followers_count > 0)
    ? (totalEngagements / (profile.followers_count * postsWithMetrics)) * 100
    : 0;
}
```

### 5. Engagement Rate Fix

```typescript
// Old (broken): totalEngagements / (followers × media_count)
// media_count is all-time posts but we only have metrics for a subset

// New (correct): totalEngagements / (followers × postsWithMetrics)
// postsWithMetrics = ContentModel docs with at least one non-zero metric
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| `getBatchMediaInsights` throws/times out | Log warning, continue sync with likes/comments only from media list |
| `getAccountInsights` fails | Log warning, continue without reach/views/demographics |
| Redis unavailable at sync start | Bypass budget tracker, make all 4 API calls directly |
| Redis fails mid-operation | Catch error, log warning, continue without budget recording |
| Rate limit (429) from Meta | Existing retry logic in `makeApiRequest` handles with exponential backoff |
| Token expired during sync | Existing token refresh flow is triggered, sync fails gracefully |
| Budget exceeded (>195 calls) | Skip all non-essential calls; only permit token refresh |

## Testing Strategy

### Unit Tests
- `ApiBudgetTracker`: Test key generation, increment, TTL, threshold logic with Redis mock
- `filterMediaForInsights`: Test age filtering with various timestamps
- Engagement rate calculation: Test with edge cases (0 posts, 0 followers, normal data)

### Integration Tests
- Full sync pipeline with mocked Instagram API responses
- Phase detection (backfill vs incremental) with pre-seeded ContentModel data
- Redis fallback behavior (mock `isRedisAvailable()` returning false)

### Property-Based Tests
- See Correctness Properties section below

## Correctness Properties

### Property 1: Batch Insights Persistence

**Validates: Requirements 1.1, 1.2**

For any sync execution where media fetching is enabled and batch insights succeeds, every media item returned by `getBatchMediaInsights` SHALL have its corresponding ContentModel document updated with the returned reach, saves, and shares values.

**Test approach:** Property-based test. Generate random media lists with random insight values. After sync, verify ContentModel.metrics matches the batch response for each media ID.

### Property 2: Two-Phase Media Limit

**Validates: Requirements 2.1, 2.2**

For any account, if ContentModel contains zero imported documents for that account, the sync SHALL request 50 media items. If ContentModel contains one or more imported documents, the sync SHALL request 10 media items (unless forceRefresh is true).

**Test approach:** Property-based test. For any non-negative existing document count and forceRefresh boolean, verify the media limit is correct: `limit = (count === 0 || forceRefresh) ? 50 : 10`.

### Property 3: Age-Based Filtering Invariant

**Validates: Requirements 3.2, 3.3**

For any set of media items during an Incremental sync, the filtered set passed to `getBatchMediaInsights` SHALL contain ONLY items whose `timestamp` is within 72 hours of the current time.

**Test approach:** Property-based test. Generate media items with random timestamps (some within 72h, some older). Verify the filtering function returns exactly those within the window.

### Property 4: Engagement Rate Formula Correctness

**Validates: Requirements 4.1, 4.2, 4.3**

For any valid inputs (totalEngagements ≥ 0, followers > 0, postsWithMetrics ≥ 0):
- If postsWithMetrics > 0: `rate = (totalEngagements / (followers × postsWithMetrics)) × 100`
- If postsWithMetrics === 0: `rate = 0`

The result SHALL never use media_count (total profile posts) in the denominator.

**Test approach:** Property-based test. Generate random engagement values and verify the formula produces the expected result. Additionally verify that changing media_count does not affect the output.

### Property 5: Budget Counter Monotonicity

**Validates: Requirements 5.1, 5.2, 5.3**

For any sequence of N `recordCalls` invocations for the same user within the same hour, the counter value SHALL equal the sum of all recorded call counts.

**Test approach:** Property-based test (requires Redis mock). Record random sequences of call counts and verify the total equals the sum.

### Property 6: Budget Threshold Gating

**Validates: Requirements 5.4, 5.5, 7.2**

For any budget remaining value R:
- If R > 20: all 4 API calls are permitted
- If 5 < R ≤ 20: only 2 calls (profile + media list) are made
- If R ≤ 5: only token refresh is permitted

**Test approach:** Property-based test. For any integer R in [0, 200], verify the correct behavior tier.

### Property 7: Max API Calls Per Cycle

**Validates: Requirements 7.1, 7.3, 7.4**

For any sync execution (backfill or incremental), the total number of Meta Graph API calls made SHALL NOT exceed 4. No individual per-post insight calls (`getMediaInsights` for a single ID) SHALL be made during sync.

**Test approach:** Property-based test with call counting. Wrap API methods with counters, execute sync with various inputs, verify total ≤ 4 and individual insight calls = 0.

### Property 8: Graceful Redis Fallback

**Validates: Requirements 6.1, 6.2, 6.3**

When `isRedisAvailable()` returns false, the sync SHALL still produce a valid updated SocialAccount document with metrics. The Budget Tracker SHALL not be invoked and no Redis errors SHALL be thrown.

**Test approach:** Example-based test. Mock Redis as unavailable, run sync, verify account is updated and no Redis errors are thrown.
