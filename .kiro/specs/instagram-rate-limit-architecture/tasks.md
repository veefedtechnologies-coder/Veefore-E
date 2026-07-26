# Implementation Plan: Instagram Rate-Limit Architecture

## Overview

This plan implements the full Instagram rate-limit architecture by building components bottom-up: centralized config first (all components depend on it), then the Usage Store, then the Governed HTTP Client and Tiered Job Scheduler, then webhook separation, polling cadence, backfill, and finally frontend UX enhancements. Each task builds on previous outputs so there is no orphaned code.

## Tasks

- [x] 1. Create centralized rate-limit configuration module
  - [x] 1.1 Create `server/config/rateLimitConfig.ts` with typed `RateLimitConfig` interface and default values
    - Define the full `RateLimitConfig` TypeScript interface with all fields: BUC multiplier (4800), platform rate limit multiplier (200), publish limit per day (25), messaging ceiling, tier thresholds (60/80/95), polling cadence for high/low ceiling, queue config, TTLs, backfill counts, timeout/retry values, and error message map
    - Export a typed default config object with documentation comments explaining source, meaning, and last-verified date of each value
    - Support environment-based overrides via `process.env` without code changes (dev vs production)
    - Log a warning at startup if any value appears to be at its default rather than explicitly set
    - _Requirements: 10.1, 10.2, 10.3, 10.5, 10.6, 10.7, 10.8_

  - [x] 1.2 Write unit tests for `rateLimitConfig.ts`
    - Test that the exported config satisfies the TypeScript interface (compile-time)
    - Test environment override loading
    - Test startup warning emission when defaults are used
    - _Requirements: 10.6, 10.7, 10.8_

- [x] 2. Implement per-account Usage Store
  - [x] 2.1 Create `server/services/UsageStore.ts` replacing `ApiBudgetTracker`
    - Implement `UsageTier` enum (NORMAL, CAUTION, RESTRICTED, CRITICAL) and `CeilingClassification` enum (HIGH, LOW)
    - Implement `AccountUsageRecord` interface and the full `UsageStore` class with Redis hash storage keyed by `usage:{accountId}`
    - Implement `updateUsage()` — overwrites only fields present in parsed header, updates `lastUpdatedAt`
    - Implement `getEffectiveUsage()` — returns max(callCountPct, totalCputimePct, totalTimePct) as effective percentage
    - Implement `getTier()` — determines tier from effective percentage using config thresholds
    - Implement staleness logic: records older than 5 minutes marked stale-but-usable, not treated as zero
    - Implement TTL (default 2 hours) on each account's usage record
    - Implement atomic Redis operations for concurrent read/write safety
    - Implement local memory fallback when Redis unavailable, defaulting to Caution tier
    - Implement structured log on every tier transition (e.g., Normal→Caution)
    - Implement `escalateToCritical()` for error code 80002 / HTTP 429 handling
    - Wire `RealtimeService` (Socket.IO) to broadcast tier changes via WebSocket
    - Export pure static functions: `computeEffectivePercentage`, `determineTier`, `classifyCeiling` for testability
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.1, 3.2, 3.3, 4.10_

  - [x] 2.2 Write property tests for Usage Store (Properties 1, 2, 3, 4, 11)
    - **Property 1: Usage Header Parsing Round-Trip** — parsing header + write + read yields same values
    - **Property 2: Missing Header Preserves State** — no-header response leaves store unchanged
    - **Property 3: Throttle Codes Escalate to Critical** — 80002/429 → Critical tier with correct minutes
    - **Property 4: Effective Usage is Maximum of Three Metrics** — max(call, cpu, time) = effective
    - **Property 11: Ceiling Classification is Consistent** — above threshold → HIGH, below/null → LOW
    - Test file: `server/services/__tests__/UsageStore.property.test.ts`
    - Use `fast-check` with minimum 100 iterations per property
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.9, 2.1, 2.3, 2.6, 3.2, 3.3**

  - [x] 2.3 Write unit tests for Usage Store
    - Test TTL expiry behavior
    - Test Redis fallback to local memory cache
    - Test partial field updates (only overwrite what's present)
    - Test tier boundary examples: 59% → NORMAL, 60% → CAUTION, 79% → CAUTION, 80% → RESTRICTED, 94% → RESTRICTED, 95% → CRITICAL
    - Test staleness marking when lastUpdatedAt > 5 minutes old
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6_

- [x] 3. Checkpoint - Ensure config and Usage Store tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement Governed HTTP Client
  - [x] 4.1 Create `server/services/GovernedHttpClient.ts` replacing `makeApiRequest`
    - Implement `GovernedHttpClient` class with configurable timeout, retry with exponential backoff + jitter, and request deduplication
    - Implement `parseBusinessUseCaseHeader()` — parse `X-Business-Use-Case-Usage` JSON header, extract up to 32 account entries with callCountPct, totalCputimePct, totalTimePct, estimatedMinutesToRegainAccess
    - Implement `parseAppUsageHeader()` — parse `X-App-Usage` header for app-level metrics
    - On every response (success or error): parse whichever usage header is present, write to `UsageStore`
    - If no usage header in response, do NOT overwrite store (preserve previous values)
    - On HTTP 429 or error code 80002: call `UsageStore.escalateToCritical()` before propagating error
    - Support GET and POST methods with typed `GovernedRequestOptions`
    - Load timeout, maxRetries, deduplicationWindowMs from `RateLimitConfig`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.9_

  - [x] 4.2 Integrate `GovernedHttpClient` into `InstagramApiService`
    - Refactor `server/services/instagramApi.ts` so that `makeApiRequest` delegates to `GovernedHttpClient.request()`
    - Map existing parameters (url, token, method) to `GovernedRequestOptions`
    - Remove direct axios/fetch calls to Meta endpoints from `instagramApi.ts`
    - Ensure all existing callers (metrics worker, comment automation, DM worker, publish flows) automatically gain governance
    - _Requirements: 1.1, 1.8_

  - [x] 4.3 Add ESLint rule or import restriction to enforce architectural isolation
    - Create a lint rule or test that scans for direct `axios`/`fetch` calls to `graph.facebook.com` or `graph.instagram.com` outside `GovernedHttpClient.ts`
    - Ensure no feature module can bypass the governed wrapper
    - _Requirements: 1.8_

  - [x]* 4.4 Write property tests for Governed HTTP Client (Properties 1, 9)
    - **Property 1: Usage Header Parsing Round-Trip** — valid headers parse correctly across all value ranges
    - **Property 9: Webhook Signature Validation** — HMAC-SHA256 correctly accepts valid / rejects invalid signatures
    - Test file: `server/services/__tests__/GovernedHttpClient.property.test.ts`
    - Use `fast-check` with minimum 100 iterations per property
    - **Validates: Requirements 1.2, 1.3, 7.1**

  - [x]* 4.5 Write unit tests for Governed HTTP Client
    - Test timeout behavior
    - Test retry logic with exponential backoff
    - Test deduplication window (duplicate requests within window rejected)
    - Test header parsing for edge cases (empty header, malformed JSON, partial fields)
    - Test error propagation with usage header parsing on error responses
    - _Requirements: 1.5, 1.6, 1.7_

- [x] 5. Implement Tiered Job Scheduler
  - [x] 5.1 Create `server/services/TieredJobScheduler.ts` with tier-aware gating
    - Implement `JobType` enum: ANALYTICS_REFRESH, BACKFILL, POLLING, AUTOMATION_REPLY, SCHEDULED_POST, USER_INITIATED, ACTIVE_VIEW
    - Implement tier policy matrix: Normal allows all, Caution allows automation/posts/user-initiated/active-view, Restricted allows only active-view, Critical allows only due-now scheduled posts
    - Implement `canDispatch(accountId, jobType)` — queries UsageStore first, applies tier policy
    - Implement `dispatchOrDefer(job)` — dispatches if permitted, else enqueues to deferred queue with exponential backoff
    - Implement deferred job queue with BullMQ (durable, Redis-persisted), tracking retry count, original scheduled time, priority
    - Implement `reEvaluateDeferredJobs(accountId)` — re-dispatches when usage drops below 80%, respecting priority order and FIFO within same priority
    - Emit monitoring alert when deferred job exceeds max retries or 24 hours without execution
    - Ensure per-account independence: one account in Critical does not block others
    - Load all tier thresholds from `RateLimitConfig` (no hardcoded literals)
    - Expose `getDeferredJobCount(accountId)` for monitoring
    - Export pure static `isJobPermitted()` and `computePollingCadence()` for testability
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 11.1, 11.2, 11.3, 11.4, 11.5_

  - [x] 5.2 Integrate `TieredJobScheduler` into existing `MetricsWorker` and `MetricsQueueManager`
    - Add pre-check call to `TieredJobScheduler.canDispatch()` in `metricsWorker.ts` before executing any job
    - Update `MetricsQueueManager.scheduleMetricsFetch` and `scheduleSmartPolling` to use `TieredJobScheduler.getPollingCadence()`
    - Wire tier change notifications through `RealtimeService` WebSocket to frontend
    - _Requirements: 4.6, 4.10, 5.7_

  - [x] 5.3 Write property tests for Tiered Job Scheduler (Properties 5, 6, 7, 8)
    - **Property 5: Tier Determines Job Permission** — percentage + job type → correct permit/deny per policy matrix
    - **Property 6: Account Isolation** — dispatch decisions depend only on target account's usage
    - **Property 7: Polling Cadence Scales with Ceiling** — high-ceiling intervals ≤ low-ceiling intervals for same data type
    - **Property 8: Deferred Jobs Re-dispatch on Usage Drop** — usage drop below 80% → deferred jobs dispatched in priority/FIFO order
    - Test file: `server/services/__tests__/TieredJobScheduler.property.test.ts`
    - Use `fast-check` with minimum 100 iterations per property
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.9, 5.1, 5.2, 11.2, 11.5, 12.3**

  - [x] 5.4 Write unit tests for Tiered Job Scheduler
    - Test specific tier boundary transitions (59% → Normal, 60% → Caution, etc.)
    - Test deferred job retry counting and max retry alert emission
    - Test priority ordering on re-dispatch
    - Test 24-hour alert emission for stuck deferred jobs
    - _Requirements: 4.5, 4.7, 11.4_

- [x] 6. Checkpoint - Ensure all core engine tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement Webhook Receiver/Worker separation
  - [x] 7.1 Refactor `server/routes/webhooks.ts` to enqueue-only
    - Remove inline `processWebhookEntry` logic from the POST handler
    - Validate signature, enqueue each entry to `webhook-events` BullMQ queue, return HTTP 200 immediately (target < 50ms)
    - No business logic, no DB lookups, no outbound API calls inline
    - Ensure receiver is stateless and horizontally scalable
    - _Requirements: 7.1, 7.2, 7.7_

  - [x] 7.2 Create `server/workers/webhookWorker.ts` as dedicated webhook event worker
    - Consume events from `webhook-events` queue
    - Look up relevant Veefore user/account, evaluate automation rules
    - Before issuing reply calls: check `UsageStore` for target account tier
    - Issue reply calls through `GovernedHttpClient` (never bypass)
    - Implement per-account concurrency limits via BullMQ group feature (one account's flood doesn't starve others)
    - Implement exponential backoff retry on failure, dead-letter queue after max retries
    - _Requirements: 7.3, 7.4, 7.5, 7.8, 7.9, 12.1, 12.2, 12.3, 12.4, 12.6_

  - [x] 7.3 Create `server/queues/webhookQueue.ts` for durable webhook event queue
    - Set up BullMQ queue `webhook-events` with Redis persistence
    - Configure per-account concurrency limits
    - Configure alert threshold for queue depth monitoring
    - Emit monitoring alert when queue depth exceeds configurable threshold
    - _Requirements: 7.5, 7.8, 12.5, 12.6, 12.7_

  - [x] 7.4 Write unit tests for webhook receiver and worker
    - Test receiver response timing (< 50ms target)
    - Test enqueue verification (all entries enqueued)
    - Test signature validation (reject invalid)
    - Test worker respects tier policy before replying
    - Test per-account isolation under flood
    - Test dead-letter queue after max retries
    - _Requirements: 7.1, 7.2, 7.4, 7.9, 12.1, 12.4_

- [x] 8. Implement impression-scaled polling cadence
  - [x] 8.1 Add polling cadence logic to `TieredJobScheduler`
    - Implement `getPollingCadence(accountId)` using `UsageStore.getCeilingClassification()`
    - High-ceiling: account insights ~60min, post insights recent 2-4h, new post detection 1-4h, follower hourly
    - Low-ceiling: account insights 3-6h, post insights recent 4-6h, new post detection 1-4h (longer end), follower 4-6h
    - Older post insights: once daily at most, low priority
    - Load all intervals from `RateLimitConfig.polling`
    - Adopt new cadence values within one polling cycle when config updates (no restart required)
    - Never poll for comments, mentions, or story expiry (webhook-only)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [x] 8.2 Update `MetricsQueueManager` to use dynamic polling cadence
    - Replace fixed scheduling intervals with calls to `TieredJobScheduler.getPollingCadence()`
    - Schedule repeated jobs with intervals from cadence config per account
    - Ensure rolling impressions estimate from `UsageStore` drives classification
    - _Requirements: 5.1, 5.2, 5.6, 3.4_

  - [x] 8.3 Write unit tests for polling cadence
    - Test high-ceiling account gets shorter intervals
    - Test low-ceiling account gets longer intervals
    - Test config update adoption without restart
    - Test no-poll enforcement for webhook-only data types
    - _Requirements: 5.1, 5.2, 5.7, 5.8_

- [x] 9. Implement initial backfill strategy
  - [x] 9.1 Create backfill logic for new OAuth connections
    - On new account connection: fetch profile/metadata first (Step 1)
    - Fetch most recent 20-25 posts with insights using field-expansion syntax in a single combined API request (not N+1 calls)
    - Use format: `?fields=id,caption,media_type,timestamp,like_count,comments_count,insights.metric(impressions,reach,saved){data}&limit=25`
    - For low-ceiling accounts: limit initial fetch to 15-20 posts (configurable from `RateLimitConfig`)
    - Enqueue all older posts into `backfill-jobs` BullMQ queue at low priority
    - Trigger WebSocket event `sync-complete` when initial posts loaded
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

  - [x] 9.2 Implement backfill queue worker respecting tier policy
    - Process backfill jobs only during Normal tier, defer during Caution and above
    - Use `TieredJobScheduler.dispatchOrDefer()` for each backfill job
    - Ensure backfill never starves user-facing or automation work
    - _Requirements: 6.4, 6.5, 4.2_

  - [x] 9.3 Write unit tests for backfill strategy
    - Test field-expansion request format
    - Test low-ceiling account gets reduced initial fetch count
    - Test backfill jobs deferred when not in Normal tier
    - Test WebSocket event emission on completion
    - _Requirements: 6.2, 6.3, 6.6, 6.8_

- [x] 10. Checkpoint - Ensure backend integration tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement rolling impressions estimate
  - [x] 11.1 Add impressions tracking to the account insights sync flow
    - When account-level insights are fetched, extract daily impressions value
    - Call `UsageStore.updateImpressionsEstimate(accountId, impressions)` to persist
    - Update `ceilingClassification` (HIGH/LOW) based on configured threshold
    - For newly connected accounts with no impressions: assume minimum ceiling (10 impressions → LOW)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 11.2 Write unit tests for impressions estimate
    - Test classification updates when impressions cross threshold
    - Test null/new account defaults to LOW
    - Test integration with scheduler polling cadence differentiation
    - _Requirements: 3.2, 3.3, 3.4_

- [x] 12. Implement error message mapping for UX
  - [x] 12.1 Create error-to-message mapping in `rateLimitConfig.ts`
    - Add `errorMessageMap` to config: map Meta error code 80002 → calm message, HTTP 429 → calm message, other common codes → plain-language messages
    - Implement `mapMetaErrorToUserMessage(errorCode)` utility function
    - Ensure no message contains numeric error codes, HTTP status codes, or Meta raw strings
    - _Requirements: 8.5, 8.8_

  - [x] 12.2 Write property test for error mapping (Property 10)
    - **Property 10: Error Code Mapping Produces User-Friendly Messages** — all mapped codes produce non-empty, plain-language messages without numeric codes or Meta strings
    - Test file: `server/services/__tests__/errorMapping.property.test.ts`
    - Use `fast-check` with minimum 100 iterations
    - **Validates: Requirements 8.5, 8.8**

- [x] 13. Implement frontend Stale-While-Revalidate UX enhancements
  - [x] 13.1 Create `useGovernedQuery` hook with tier awareness
    - Create `client/src/hooks/useGovernedQuery.ts` wrapping React Query with `GovernedQueryMeta` (lastUpdatedAt, tier, isStale, nextRefreshEstimate)
    - Render cached data immediately (< 200ms) without blocking on background refresh
    - When background refresh succeeds, update data in-place with subtle transition
    - When refresh deferred (Caution+), continue showing cached data — no error, no spinner
    - Display "last updated" as plain-language relative time (e.g., "Updated 12 minutes ago")
    - When cached data exceeds staleness threshold, show visual indicator ("updating..." badge)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.9_

  - [x] 13.2 Add WebSocket tier status listener to dashboard
    - Enhance existing `instagram-webhook-listener.tsx` or create new hook listening for:
      - `tier-change` → { accountId, oldTier, newTier, estimatedMinutesToRecover }
      - `sync-complete` → { accountId, postsLoaded }
      - `deferred-operation` → { accountId, operation, estimatedRetryMinutes }
    - Update UI indicators in real time when tier changes
    - _Requirements: 4.10, 6.8, 8.6_

  - [x] 13.3 Display tier status and deferred operation messaging
    - When operation deferred due to rate limiting: show plain-language message with estimated retry time (e.g., "Analytics for [account] will refresh again in about 20 minutes")
    - When Critical tier prevents user action: explain without jargon, provide estimated wait time from `estimatedMinutesToRegainAccess`
    - Never display raw Meta error codes or HTTP status to user
    - _Requirements: 8.5, 8.6, 8.7, 8.8_

  - [x] 13.4 Add new account onboarding transparency
    - When newly connected account is low-ceiling: show brief onboarding message that refresh frequency scales with account activity
    - Show syncing indicator during initial backfill
    - Dismiss syncing indicator when initial posts loaded (`sync-complete` event)
    - Use plain, non-technical language — no API limits, rate limits, or impressions formulas mentioned
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 13.5 Write unit tests for frontend UX components
    - Test `useGovernedQuery` renders cached data without spinner
    - Test "last updated" timestamp formatting
    - Test tier indicator updates on WebSocket events
    - Test onboarding message display for low-ceiling accounts
    - Test error message display (no raw codes visible)
    - _Requirements: 8.1, 8.4, 8.5, 9.1, 9.4_

- [x] 14. Remove deprecated `ApiBudgetTracker` and clean up
  - [x] 14.1 Remove `server/services/ApiBudgetTracker.ts` and all references
    - Delete `ApiBudgetTracker.ts`
    - Remove all imports and usages across the codebase
    - Update any configuration that referenced the old 200-call/hour model
    - Verify no dead code remains referencing the old system
    - _Requirements: 1.1 (sole mechanism), 10.3 (single change location)_

  - [x] 14.2 Write integration test for full API call lifecycle
    - Test: API call → header parse → store update → tier change → WebSocket event → frontend update
    - Test: webhook receive → enqueue → worker processes → reply via governed client
    - Test: deferred job lifecycle (defer → usage drops → re-dispatch)
    - _Requirements: 1.2, 1.4, 4.5, 4.10, 7.3_

- [x] 15. Final checkpoint - Ensure all tests pass and architecture is enforced
  - Ensure all tests pass, ask the user if questions arise.
  - Verify lint rule catches any direct Meta API calls outside GovernedHttpClient
  - Verify no hardcoded rate-limit literals exist outside rateLimitConfig.ts

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The existing `fast-check@4.8.0` and `vitest@4.1.8` are used for all testing
- `ApiBudgetTracker.ts` is removed only after the new system is fully operational (task 14)
- All config values loaded from `rateLimitConfig.ts` — no hardcoded Meta numbers in business logic

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3"] },
    { "id": 3, "tasks": ["4.1", "5.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "4.4", "4.5", "5.2", "5.3", "5.4"] },
    { "id": 5, "tasks": ["7.1", "7.2", "7.3", "8.1", "11.1"] },
    { "id": 6, "tasks": ["7.4", "8.2", "8.3", "9.1", "11.2", "12.1"] },
    { "id": 7, "tasks": ["9.2", "9.3", "12.2"] },
    { "id": 8, "tasks": ["13.1", "13.2"] },
    { "id": 9, "tasks": ["13.3", "13.4", "13.5"] },
    { "id": 10, "tasks": ["14.1"] },
    { "id": 11, "tasks": ["14.2"] }
  ]
}
```
