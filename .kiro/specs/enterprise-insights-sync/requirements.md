# Requirements Document

## Introduction

Enterprise-grade Instagram Insights Sync System that wires the existing `getBatchMediaInsights` function into the sync pipeline, implements a two-phase sync strategy (backfill + incremental), fixes engagement rate calculations, adds post-age-aware re-fetch policies, and introduces a Redis-based API call budget tracker with graceful degradation when Redis is unavailable. The goal is to match how enterprise SaaS tools (Hootsuite, Buffer, Later) handle Instagram Graph API data: proper batch API calls, tiered freshness policies, and store-once/query-locally patterns — all within Meta's 200 calls/user/hour API budget.

## Glossary

- **Sync_System**: The server-side orchestration that fetches Instagram data via the Graph API and persists it locally in MongoDB, encompassing `SocialAccountService.syncAccount` and its dependent services.
- **Batch_Insights_Fetcher**: The existing `InstagramApiService.getBatchMediaInsights` static method that fetches per-post insights (reach, saves, shares) for up to 50 media items in a single Facebook Batch API call.
- **Content_Model**: The MongoDB model (`ContentModel`) that stores individual Instagram posts with their metrics (likes, comments, shares, saves, reach, views).
- **Budget_Tracker**: A Redis-based per-user-per-hour API call counter that enforces Meta's 200 calls/user/hour rate limit across all features (sync, publishing, automation).
- **Backfill_Sync**: The initial full sync performed on first account connection, fetching up to 50 posts with complete batch insights.
- **Incremental_Sync**: The recurring poll-cycle sync that fetches only the 10 most recent posts and applies age-based filtering before fetching insights.
- **Freshness_Window**: The 72-hour period after a post is published during which its insights are considered volatile and worth re-fetching.
- **Stabilized_Post**: A post older than 72 hours whose metrics have converged and no longer require per-cycle insights re-fetching.
- **API_Budget**: Meta's rate limit of 200 API calls per user per hour, shared across all application features.
- **Polling_Cycle**: A single execution of the sync pipeline triggered either by BullMQ schedule (every 80 minutes) or by manual user refresh.

## Requirements

### Requirement 1: Wire Batch Media Insights Into Sync Pipeline

**User Story:** As a user viewing my analytics dashboard, I want per-post metrics (shares, saves, reach) to be populated from the Instagram API, so that I can see accurate performance data for each post.

#### Acceptance Criteria

1. WHEN a Polling_Cycle executes with media fetching enabled, THE Sync_System SHALL call Batch_Insights_Fetcher with the fetched media list to retrieve per-post insights in a single batch API call.
2. WHEN Batch_Insights_Fetcher returns insights for a media item, THE Sync_System SHALL update the corresponding Content_Model document's metrics.shares, metrics.saves, and metrics.reach fields with the returned values.
3. IF Batch_Insights_Fetcher fails or returns an error, THEN THE Sync_System SHALL continue the sync using only the data available from the media list endpoint (likes and comments) without terminating the sync.
4. WHEN per-post insights are stored, THE Sync_System SHALL include those values in the aggregated totals (totalShares, totalSaves, totalReach) persisted to the SocialAccount document.

### Requirement 2: Two-Phase Sync Strategy

**User Story:** As a user connecting my Instagram account for the first time, I want a comprehensive initial data load followed by efficient incremental updates, so that I have historical context without excessive ongoing API usage.

#### Acceptance Criteria

1. WHEN an Instagram account is synced for the first time (no prior Content_Model documents exist for that account), THE Sync_System SHALL perform a Backfill_Sync that fetches up to 50 posts with full batch insights.
2. WHEN an Instagram account has existing Content_Model documents from a prior sync, THE Sync_System SHALL perform an Incremental_Sync that fetches the 10 most recent posts.
3. WHEN a user triggers a force refresh, THE Sync_System SHALL perform a Backfill_Sync regardless of existing data.
4. THE Sync_System SHALL determine the sync phase by querying Content_Model for documents matching the account's workspaceId and accountId.

### Requirement 3: Post-Age-Aware Insights Re-Fetch Policy

**User Story:** As a system operator, I want the sync to skip insights fetching for posts whose metrics have stabilized, so that API budget is conserved for posts that still have changing metrics.

#### Acceptance Criteria

1. THE Content_Model SHALL include a `lastInsightsFetchedAt` timestamp field that records when insights were last retrieved for a given post.
2. WHEN performing an Incremental_Sync, THE Sync_System SHALL only request batch insights for posts published within the Freshness_Window (less than 72 hours old).
3. WHEN a post is older than 72 hours and has a non-null `lastInsightsFetchedAt` value, THE Sync_System SHALL skip insights fetching for that Stabilized_Post.
4. WHEN performing a Backfill_Sync (first connect or force refresh), THE Sync_System SHALL fetch insights for all posts regardless of age.

### Requirement 4: Fix Engagement Rate Calculation

**User Story:** As a user relying on my engagement rate metric, I want the calculation to use only posts for which actual metrics are available, so that the rate accurately reflects my content performance.

#### Acceptance Criteria

1. THE Sync_System SHALL calculate engagement rate using the formula: `(totalLikes + totalComments + totalShares + totalSaves) / (followersCount × postsWithMetricsCount) × 100` where `postsWithMetricsCount` is the number of Content_Model documents that have non-zero metric values.
2. THE Sync_System SHALL NOT use `media_count` (total lifetime posts on the profile) as the denominator when only a subset of posts have fetched metrics.
3. WHEN zero posts have metrics available, THE Sync_System SHALL set the engagement rate to 0.

### Requirement 5: Redis-Based API Call Budget Tracker

**User Story:** As a system operator, I want to track per-user API call consumption in real-time, so that no user exceeds Meta's 200 calls/hour limit and critical operations (publishing) are never blocked by analytics syncing.

#### Acceptance Criteria

1. THE Budget_Tracker SHALL maintain a per-user counter in Redis with a key format that includes the user's Instagram account ID and the current hour window.
2. WHEN any API call is made to Meta's Graph API on behalf of a user, THE Budget_Tracker SHALL increment that user's hourly counter.
3. THE Budget_Tracker SHALL set a TTL of 3600 seconds on each hourly counter key so that expired windows are automatically cleaned up.
4. WHEN a user's hourly counter exceeds 180 calls, THE Sync_System SHALL skip non-critical API calls (insights fetching) but still allow critical operations (publishing, token refresh).
5. WHEN a user's hourly counter exceeds 195 calls, THE Sync_System SHALL skip all non-essential API calls and only permit token refresh operations.
6. THE Budget_Tracker SHALL expose a method to query the current budget remaining for a given user.

### Requirement 6: Graceful No-Redis Fallback

**User Story:** As a developer running the application locally without Redis, I want the sync system to function correctly via direct API calls, so that development and manual refresh work without infrastructure dependencies.

#### Acceptance Criteria

1. WHEN Redis is unavailable, THE Sync_System SHALL execute the sync pipeline synchronously without queuing, performing API calls directly.
2. WHEN Redis is unavailable, THE Budget_Tracker SHALL be bypassed and the Sync_System SHALL proceed with the standard 4-call sync budget (profile + account insights + media list + batch post insights).
3. IF Redis becomes unavailable during a sync operation, THEN THE Sync_System SHALL log a warning and complete the current sync using direct API calls.
4. THE Sync_System SHALL detect Redis availability by checking the existing `isRedisAvailable()` function from the metricsQueue module.

### Requirement 7: API Budget Efficiency Per Polling Cycle

**User Story:** As a system operator, I want each polling cycle to use a predictable and minimal number of API calls, so that the budget is spent efficiently across all connected accounts.

#### Acceptance Criteria

1. THE Sync_System SHALL use a maximum of 4 API calls per standard Incremental_Sync Polling_Cycle: one for user profile, one for account insights, one for media list, and one for batch post insights.
2. WHEN the Budget_Tracker indicates fewer than 20 calls remain in the current hour, THE Sync_System SHALL reduce to 2 API calls per cycle (profile + media list only, skipping insights).
3. THE Sync_System SHALL NOT make individual per-post insight calls; all per-post insights SHALL be retrieved via a single Batch_Insights_Fetcher call.
4. WHEN a Backfill_Sync is performed, THE Sync_System SHALL use a maximum of 4 API calls (profile + account insights + media list + batch insights for up to 50 posts).
