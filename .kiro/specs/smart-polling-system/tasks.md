# Implementation Plan: Smart Polling System

## Overview

This plan implements the Smart Polling System as an **enhancement layer** on top of the already-delivered `instagram-rate-limit-architecture` and `enterprise-insights-sync` foundations. Nothing in the foundation is redesigned or duplicated — new modules plug into the existing `GovernedHttpClient → UsageStore → TieredJobScheduler → MetricsQueueManager` flow.

Tasks are ordered strictly bottom-up by dependency so there is no orphaned code:

1. **Config extensions** first — everything reads numbers from `rateLimitConfig.smartPolling`.
2. **MetricRegistry** — the single tier source of truth (depends on config).
3. **Pure utils** — `deterministicJitter`, `insightMetricSelection` (depend on config).
4. **Scheduler extensions** — age cadence, demographics gate, new-post interval added to the existing `TieredJobScheduler`.
5. **New scheduler services** — story, business discovery.
6. **Automation hardening** — idempotency, audit, backpressure, tenant weighting.
7. **Wiring** — into `MetricsQueueManager.scheduleSmartPolling` and the webhook worker, where the new logic becomes live.

Implementation language is **TypeScript** (the design specifies typed interfaces throughout; no pseudocode). Property tests use the existing `fast-check@4.x` + `vitest@4.x` toolchain, matching the conventions in `server/services/__tests__/*.property.test.ts`.

## Tasks

- [x] 1. Extend `rateLimitConfig` with smart-polling values
  - [x] 1.1 Add the `SmartPollingConfig` interface, `PostAgeBucketConfig` interface, and defaults to `server/config/rateLimitConfig.ts`
    - Add `smartPolling: SmartPollingConfig` to the `RateLimitConfig` interface (additive — existing fields unchanged)
    - Add fields: `metricTierBaseIntervalsMs` (Record<1|2|3|4, number>), `postAgeBuckets` (PostAgeBucketConfig[]), `ceilingScalingFactor` ({HIGH, LOW}), `jitterSpreadFraction`, `followerDemographicsThreshold`, `newPostDetectionMs` ({highCeiling, lowCeiling}), `storyRecurringIntervalMs`, `storyFinalFetchLeadMs`, `storyLifetimeMs`, `backpressure.*`, `audit.*`, `businessDiscovery.*`, `tenantPriority.*`
    - Populate `DEFAULT_CONFIG.smartPolling` with documented defaults (per-tier intervals T1<T2<T3<T4; strictly-increasing post-age buckets; ceiling factors HIGH=1.0/LOW=2.0; jitter default 0.25; demographics threshold 100; etc.)
    - Add a doc comment with source and ISO-8601 last-verified date on each new value
    - _Requirements: 14.1, 14.2, 14.6_

  - [x] 1.2 Add `ENV_OVERRIDES` entries and range validation in `buildRateLimitConfig`
    - Add one `EnvOverride` entry per new smart-polling value (e.g. `SP_JITTER_SPREAD_FRACTION`, `SP_FOLLOWER_DEMOGRAPHICS_THRESHOLD`, `SP_STORY_RECURRING_MS`, `SP_BP_TRIGGER_QUEUE_DEPTH`, `SP_AUDIT_RETENTION_SECONDS`, `SP_BUSINESS_DISCOVERY_ENABLED`, ...), including a `parseBool` parser for boolean flags
    - Add a range-validation step that rejects out-of-range overrides (jitter spread outside [0.10, 0.25]; backpressure clear threshold not strictly below its trigger), logs the failing key, and retains the prior valid value
    - _Requirements: 14.3, 14.5_

  - [x] 1.3 Write property test for config range validation
    - **Property 22: Invalid config overrides retain the last valid value**
    - **Validates: Requirements 14.5**
    - Test file: `server/config/__tests__/rateLimitConfig.smartPolling.property.test.ts`

  - [x] 1.4 Write smoke/type tests for config presence
    - Assert `config.smartPolling` exposes every required value (Req 14.1)
    - Assert the build fails on a missing/mistyped config field (Req 14.2) and that new values carry ISO-8601 last-verified doc comments (Req 14.6)
    - _Requirements: 14.1, 14.2, 14.6_

- [x] 2. Implement the Metric Classification Registry
  - [x] 2.1 Create `server/config/metricRegistry.ts`
    - Define `ClassificationTier` enum, `Volatility`/`Visibility`/`DataMechanism` types, `MetricDataType` union, and `MetricRegistryEntry` interface
    - Define the frozen `MetricRegistry.ENTRIES` table (one row per data type) per the Data Models section, with comments/dms/mentions as webhook-only
    - Implement `get`, `isWebhookOnly` (Req 1.5), `baseIntervalMs(dataType, config)` reading `config.smartPolling.metricTierBaseIntervalsMs[tier]` (Req 1.4), and `validate()` that throws on missing/duplicate data types and on equal-(volatility,visibility)-but-different-tier violations (Req 1.2, 1.8)
    - Call `MetricRegistry.validate()` at module load, mirroring `validateRateLimitConfigAtStartup`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.8_

  - [x] 2.2 Write property tests for the registry
    - **Property 1: Registry assigns exactly one tier per data type** — **Validates: Requirements 1.1, 1.8**
    - **Property 2: Equal volatility and visibility imply equal tier** — **Validates: Requirements 1.2**
    - **Property 3: Cadence base interval is keyed by the metric's tier** — **Validates: Requirements 1.4**
    - **Property 4: Webhook-only data types are never polled** — **Validates: Requirements 1.5**
    - Test file: `server/config/__tests__/metricRegistry.property.test.ts`

- [x] 3. Implement pure utility modules
  - [x] 3.1 Create `server/utils/deterministicJitter.ts`
    - Implement `stableHash(input)` (non-crypto FNV-1a / djb2) and `computeJitterOffset(accountId, jobType, baseIntervalMs, spreadFraction)`
    - Offset ∈ [0, spreadFraction × baseIntervalMs], derived solely from a stable hash of `accountId|jobType` (no persisted state); return 0 when baseIntervalMs ≤ 0
    - _Requirements: 7.1, 7.2, 7.3, 7.6_

  - [x] 3.2 Write property test for deterministic jitter
    - **Property 11: Deterministic jitter determinism and bounds**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.6**
    - Test file: `server/utils/__tests__/deterministicJitter.property.test.ts`

  - [x] 3.3 Create `server/services/insightMetricSelection.ts`
    - Export `VIEWS_CUTOVER_UTC`, `CURRENT_CONTENT_INSIGHT_EXPANSION` (`insights.metric(views,reach,saved,shares,total_interactions)`), and `LEGACY_BACKFILL_INSIGHT_EXPANSION`
    - Implement `selectInsightMetrics(mediaPublishedAt)` returning `views` for content on/after 2024-07-02, `impressions` only for strictly-earlier legacy media
    - Update the current-content field-expansion strings in `rateLimitConfig`/the request builder so `impressions` is replaced by `views` (Req 2.2)
    - Add the single-request deprecation fallback hook (retry once substituting `views`, record substitution, do not fail the job — Req 2.6) and `saved`/`shares` omit-on-unavailable handling (Req 3.4) at the media-insights caller
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2_

  - [x] 3.4 Write property tests for insight metric selection
    - **Property 5: Views-versus-impressions date boundary** — **Validates: Requirements 2.1, 2.3, 2.4**
    - **Property 6: Media insights are bundled into a single request** — **Validates: Requirements 3.1, 3.2, 3.3**
    - Test file: `server/services/__tests__/insightMetricSelection.property.test.ts`

  - [x] 3.5 Write unit/example tests for metric correction edge cases
    - Field-expansion string assertion contains `views` and never `impressions` for current content (Req 2.2)
    - Rolling impressions estimate derived from `views` (Req 2.5); deprecation-retry substitutes `views` and does not fail the job (Req 2.6)
    - Partial media response omitting `saved`/`shares` records returned metrics, omits only the missing field, no separate retry (Req 3.4)
    - _Requirements: 2.2, 2.5, 2.6, 3.4_

- [x] 4. Checkpoint - Ensure config, registry, and util tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Extend `TieredJobScheduler` with smart-polling cadence logic
  - [x] 5.1 Add age-based post-insight cadence to `server/services/TieredJobScheduler.ts`
    - Implement `getPostInsightCadence(accountId, postPublishedAt)` (reads ceiling from `UsageStore`, numbers from config)
    - Implement pure `selectAgeBucket(postAgeMs, buckets)` and `computePostInterval(postAgeMs, classification, config)` = `bucketBaseInterval × ceilingScalingFactor[classification]`
    - Recompute the bucket each cycle and reschedule to the new interval within one cycle on boundary crossing; ensure `saved`/`shares` ride the same media-insights cadence (Req 3.3)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 3.3_

  - [x] 5.2 Write property test for age-based cadence
    - **Property 7: Age-bucket interval ordering and ceiling scaling**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
    - Test file: `server/services/__tests__/postInsightCadence.property.test.ts`

  - [x] 5.3 Add the follower-demographics gate and Tier 4 low-frequency handling to `TieredJobScheduler`
    - Implement `shouldScheduleFollowerDemographics(accountId, lastFollowerCount)` and pure `demographicsGateOpen(lastFollowerCount, threshold)` (threshold from config, Req 6.5)
    - Gate so demographics dispatch at most once per rolling 24h via a per-account Redis `lastDispatchedAt` marker; re-enable on upward threshold crossing (Req 6.7)
    - Dispatch `online_followers` and business-action-click metrics (Tier 4) at most once per rolling 24h per account using the same marker (Req 6.3, 6.4)
    - Handle follower_demographics Meta error code 10: record insufficient data, mark complete, no retry, not logged as error (Req 6.6)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [x] 5.4 Write property test for the demographics gate
    - **Property 10: Follower-demographics threshold gate**
    - **Validates: Requirements 6.1, 6.5, 6.7**
    - Test file: `server/services/__tests__/followerDemographicsGate.property.test.ts`

  - [x] 5.5 Add new-post detection interval and the registered-post set to `TieredJobScheduler`
    - Implement pure `newPostDetectionInterval(classification, config)` (2–4h HIGH, 6–8h LOW from config; Req 8.1, 8.2, 8.4)
    - Implement an idempotent per-account "registered post ids" set so re-detecting an already-registered post creates no duplicate (Req 8.7); register discovered unknown posts for age-based polling per Req 4 (Req 8.5)
    - Skip detection for posts published through Veefore (register them directly for insight polling — Req 8.3)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.7_

  - [x] 5.6 Write property tests for new-post detection
    - **Property 12: New-post detection interval scales with ceiling** — **Validates: Requirements 8.1, 8.2**
    - **Property 13: New-post registration is duplicate-free** — **Validates: Requirements 8.7**
    - Test file: `server/services/__tests__/newPostDetection.property.test.ts`

- [x] 6. Checkpoint - Ensure scheduler extension tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement new scheduler services
  - [x] 7.1 Create `server/services/StoryInsightsScheduler.ts`
    - Use a dedicated BullMQ queue following the `metricsQueue` patterns; define `StoryInsightsJobData`
    - Implement `onStoryDetected` (recurring job every `storyRecurringIntervalMs` + one final-fetch job using the BullMQ `delay` option — Req 5.1, 5.2)
    - Implement pure `computeFinalFetchDelayMs(publishTimeMs, now, config)` = `(publishTimeMs + storyLifetimeMs − storyFinalFetchLeadMs) − now` and pure `canRetryBeforeExpiry(publishTimeMs, nextAttemptAtMs, config)`
    - Implement `runFinalFetch`: non-Critical overrides headroom deferral (Req 5.3); Critical defers per tier (Req 5.4); Critical-past-expiry records not-captured and stops (Req 5.5); error code 10 marks complete, no retry, no error log (Req 5.6); other failures use full-jitter backoff bounded before expiry (Req 5.7); success cancels recurring polling (Req 5.9); webhook does not replace the safety net (Req 5.8)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9_

  - [x] 7.2 Write property tests for story scheduling
    - **Property 8: Story final-fetch delay arithmetic** — **Validates: Requirements 5.2**
    - **Property 9: Story retry stays before expiry** — **Validates: Requirements 5.7**
    - Test file: `server/services/__tests__/StoryInsightsScheduler.property.test.ts`

  - [x] 7.3 Write unit/example tests for story behavior
    - Recurring schedule (Req 5.1); non-Critical override / Critical defer / Critical-past-expiry stop (Req 5.3–5.5); error code 10 handling (Req 5.6); webhook-does-not-replace (Req 5.8); success-stops-polling (Req 5.9)
    - _Requirements: 5.1, 5.3, 5.4, 5.5, 5.6, 5.8, 5.9_

  - [x] 7.4 Create `server/services/BusinessDiscoveryScheduler.ts` (feature-flagged)
    - Implement `scheduleForAccount(accountId, competitorUsernames)` gated on `config.smartPolling.businessDiscovery.enabled` (Req 9.1, 9.4)
    - Tier 4 deferrable without bound under load (Req 9.1); ≤ once/24h per competitor (Req 9.2); cap at `maxCompetitorsPerAccount` (Req 9.3); route through `GovernedHttpClient` (Req 9.5); not-found/inaccessible records failed lookup, marks complete, no retry (Req 9.6)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 7.5 Write property test for business discovery
    - **Property 14: Business Discovery respects the competitor cap**
    - **Validates: Requirements 9.1, 9.3, 9.4**
    - Test file: `server/services/__tests__/BusinessDiscoveryScheduler.property.test.ts`

- [x] 8. Checkpoint - Ensure new scheduler service tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement automation hardening modules
  - [x] 9.1 Create `server/services/IdempotencyGuard.ts`
    - Implement static `buildKey({accountId, sourceId, ruleId})` (deterministic stable hash — Req 10.1)
    - Implement `reserve(key)` using atomic Redis `SET NX` + durable completion check returning `reserved`/`already_completed`/`unavailable` (Req 10.2, 10.3, 10.5), and `recordCompletion(key)` writing the durable record before job completion (Req 10.4)
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 9.2 Write property tests for idempotency
    - **Property 15: Idempotency key determinism** — **Validates: Requirements 10.1**
    - **Property 16: Idempotent side-effect performed at most once** — **Validates: Requirements 10.3**
    - Test file: `server/services/__tests__/IdempotencyGuard.property.test.ts`

  - [x] 9.3 Create `server/models/Automation/AutomationAuditRecord.ts`
    - Mongoose model following existing model patterns: `targetAccountId` (indexed), `ruleId`, `ruleName?`, `actionType`, `triggeringInput`, `contentSent?`, `outcome`, `failureReason?`, `occurredAt` (UTC, second precision)
    - Add a TTL index on `occurredAt` with `expireAfterSeconds = config.smartPolling.audit.retentionSeconds` (Req 11.6)
    - _Requirements: 11.3, 11.6_

  - [x] 9.4 Create `server/services/AuditTrailService.ts`
    - Implement `record(...)` persisting exactly one record per action (success or failure) capturing matched rule, triggering input, content sent, outcome, UTC second-precision `occurredAt`, and target account (Req 11.1, 11.2, 11.3, 11.4)
    - Retry persistence up to `config.smartPolling.audit.persistenceMaxRetries`, surfacing an error rather than silently discarding (Req 11.5)
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [x] 9.5 Write property test for the audit trail
    - **Property 17: Exactly one audit record per action with required fields**
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4**
    - Test file: `server/services/__tests__/AuditTrailService.property.test.ts`

  - [x] 9.6 Create `server/services/BackpressureMonitor.ts`
    - Implement `start`/`stop` sampling queue depth + Redis command latency every `evaluationIntervalMs` (Req 12.6) and `getState()`
    - Implement pure `nextState(prev, sample, config)` hysteresis: null Redis latency ⇒ active (Req 12.8); depth/latency > trigger ⇒ active; below all clear thresholds ⇒ cleared; otherwise retain previous (clear < trigger by config — Req 12.7)
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.6, 12.7, 12.8_

  - [x] 9.7 Write property tests for backpressure
    - **Property 18: Backpressure hysteresis does not oscillate** — **Validates: Requirements 12.7, 12.8**
    - **Property 19: Backpressure sheds ascending and resumes descending by tier** — **Validates: Requirements 12.1, 12.2, 12.4**
    - Test file: `server/services/__tests__/BackpressureMonitor.property.test.ts`

  - [x] 9.8 Create `server/services/TenantWeightedDispatcher.ts`
    - Implement `selectNextTenant(pending, windowCounts)`: enabled ⇒ proportional to normalized weights over a rolling window within ±10pp guaranteeing ≥1 job/tenant/window (Req 13.1, 13.2); disabled ⇒ equal shares (Req 13.3)
    - Implement pure static `resolveWeight(tenantId, weights)` returning a weight in [1,1000], defaulting missing/invalid to 1 with a configuration warning (Req 13.4, 13.5)
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

  - [x] 9.9 Write property tests for tenant weighting
    - **Property 20: Weighted fair dispatch under contention** — **Validates: Requirements 13.1, 13.2**
    - **Property 21: Equal shares when weighting disabled, valid weights when enabled** — **Validates: Requirements 13.3, 13.4, 13.5**
    - Test file: `server/services/__tests__/TenantWeightedDispatcher.property.test.ts`

- [x] 10. Checkpoint - Ensure automation hardening tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Wire smart-polling modules into the live flow
  - [x] 11.1 Wire deterministic jitter and age-based cadence into `MetricsQueueManager.scheduleSmartPolling`
    - Compute `computeJitterOffset` and pass it as the BullMQ `delay` only when first creating a repeatable job (existing "add jobs that don't already exist" branch), keeping the deterministic `jobId` so later occurrences fire at the base interval with no re-applied offset (Req 7.1)
    - Drive post-insight job intervals from `getPostInsightCadence` and the bundled `CURRENT_CONTENT_INSIGHT_EXPANSION`; add `backoff: { type: 'exponential', jitter }` for retry full-jitter (Req 7.4); read spread fraction from config (Req 7.5)
    - _Requirements: 7.1, 7.4, 7.5, 4.1, 4.6, 3.1_

  - [x] 11.2 Wire new-post detection and story scheduling into `MetricsQueueManager`
    - Route new-post detection requests through `GovernedHttpClient` so they count against usage (Req 8.6); schedule detection jobs at `newPostDetectionInterval`
    - Invoke `StoryInsightsScheduler.onStoryDetected` on story detection so recurring + final-fetch jobs are scheduled (Req 5.1)
    - _Requirements: 8.5, 8.6, 5.1_

  - [x] 11.3 Wire backpressure and tenant weighting into `TieredJobScheduler.canDispatch`/`dispatchOrDefer`
    - Consult `BackpressureMonitor.getState()`; when active, shed work in ascending tier order (Tier 4 first) into the existing durable deferred queue (never dropped); when cleared, resume in descending tier order via `reEvaluateDeferredJobs` (Req 12.1, 12.2, 12.4, 12.5)
    - Consult `TenantWeightedDispatcher.selectNextTenant` during contention (Req 13.1–13.3)
    - _Requirements: 12.1, 12.2, 12.4, 12.5, 13.1, 13.2, 13.3_

  - [x] 11.4 Wire `IdempotencyGuard` and `AuditTrailService` into the webhook worker
    - Wrap comment-reply and DM-reply side-effects in `reserve`/`recordCompletion`; on `unavailable`, leave the side-effect un-performed, surface an error, and preserve the job for retry (Req 10.5, 10.6)
    - Call `AuditTrailService.record` after each automated comment/DM reply, for both success and failure (Req 11.4)
    - _Requirements: 10.6, 11.4_

  - [x] 11.5 Write integration tests for the wired flow
    - Idempotency: two concurrent `reserve` calls on the same key — exactly one `reserved` (Req 10.2); completion recorded before job completion (Req 10.4); store-unavailable preserves job (Req 10.5)
    - New-post detection and Business Discovery routed through `GovernedHttpClient` and counted against usage (Req 8.6, 9.5)
    - Backpressure-shed work lands in the durable deferred queue, never dropped (Req 12.5); sampling at `evaluationIntervalMs` (Req 12.6)
    - Config env-override applied without code change (Req 14.3) and adopted within the base interval without restart (Req 14.4)
    - _Requirements: 10.2, 10.4, 10.5, 8.6, 9.5, 12.5, 12.6, 14.3, 14.4_

- [x] 12. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (tests) and can be skipped for a faster MVP; core implementation tasks are never optional.
- Each task references specific requirement sub-clauses for traceability and, where applicable, the exact design property it validates.
- Property tests use `fast-check@4.x` + `vitest@4.x` with ≥100 iterations, tagged `Feature: smart-polling-system, Property {N}: {title}`, matching existing `server/services/__tests__/*.property.test.ts` conventions, and run via `vitest run` (single execution, no watch mode).
- All new numeric values live in `rateLimitConfig.smartPolling`; tier assignments live only in `MetricRegistry.ENTRIES` — no scattered literals.
- This plan only extends the existing foundation; existing files (`rateLimitConfig.ts`, `TieredJobScheduler.ts`, `metricsQueue.ts`) are modified additively and the webhook worker is extended, not rewritten.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "1.4", "2.1", "3.1", "3.3"] },
    { "id": 3, "tasks": ["2.2", "3.2", "3.4", "3.5", "5.1"] },
    { "id": 4, "tasks": ["5.2", "5.3"] },
    { "id": 5, "tasks": ["5.4", "5.5"] },
    { "id": 6, "tasks": ["5.6", "7.1", "7.4", "9.1", "9.3", "9.6", "9.8"] },
    { "id": 7, "tasks": ["7.2", "7.3", "7.5", "9.2", "9.4", "9.7", "9.9"] },
    { "id": 8, "tasks": ["9.5", "11.1", "11.3"] },
    { "id": 9, "tasks": ["11.2"] },
    { "id": 10, "tasks": ["11.4"] },
    { "id": 11, "tasks": ["11.5"] }
  ]
}
```
