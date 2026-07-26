# Requirements Document

## Introduction

The Smart Polling System is an enhancement layer that sits on top of two already-implemented and fully delivered specs in this codebase:

- **`instagram-rate-limit-architecture`** — provides the `Governed_HTTP_Client`, the per-account `Usage_Store` (real-time usage %, tier classification Normal/Caution/Restricted/Critical, ceiling classification HIGH/LOW, rolling impressions estimate), the `Tiered_Job_Scheduler` (impression-scaled polling cadence + deferred-job re-dispatch), webhook receiver/worker separation, the centralized `rateLimitConfig.ts` module, and the stale-while-revalidate frontend hooks.
- **`enterprise-insights-sync`** — provides batch insights via Meta field expansion, the two-phase backfill/incremental sync, post-age-aware re-fetch policy, the engagement-rate fix, and the API budget tracker.

This document captures only the **net-new and corrected (delta)** capabilities that those two specs do not already deliver. It does not re-specify any foundation listed above; that foundation is treated as an existing dependency to be extended, not duplicated.

The delta this spec covers:

1. A single documented in-code **metric classification registry** assigning every Instagram data type to one of four volatility × visibility quadrant tiers, with cadence selection driven by that table.
2. Correcting the deprecated **`impressions` metric** to **`views`** for all current-content polling, while preserving `impressions` only for legacy pre-2024-07-02 backfill media.
3. Bundling **`saved` and `shares`** into the same media-insights field-expansion request as `reach`/`views`/`total_interactions`.
4. **Age-based post-insight cadence** that narrows for fresh posts and widens as posts age, scaled by ceiling classification.
5. **Story-insights hard-deadline handling**, including a guaranteed final-fetch job before the 24-hour expiry and explicit "not enough viewers" (error code 10) handling.
6. A **follower-demographics threshold gate** and low-frequency Tier 4 handling of `online_followers` and business action clicks.
7. **Deterministic jitter and load spreading** for every recurring poll job, derived from a stable hash of the account ID.
8. **New-post detection** polling for posts published directly on Instagram (outside Veefore).
9. **Business Discovery** (competitor lookups) as a conditional/optional Tier 4 capability.
10. **Enterprise hardening**: idempotency keys on retryable jobs, an audit trail for automated actions, graceful internal degradation under queue/Redis backpressure, optional tenant priority weighting, and runtime-configurable values through the existing `rateLimitConfig` pattern.

### Out of Scope

The following are explicitly out of scope for this spec, either because they are already delivered by the dependency specs or because they do not apply to this application:

- **The raw Platform Rate Limit "200 × users" formula.** App-level and per-account governance is already delivered by the `instagram-rate-limit-architecture` spec's `Governed_HTTP_Client` and `Usage_Store`. This spec does not re-derive or re-implement rate-limit measurement.
- **BullMQ Pro per-key rate limiting.** This application runs on open-source BullMQ, which provides only a global per-worker limiter. Per-account governance remains at the application-logic level (the existing `Usage_Store` tier check inside the worker), and this spec does not introduce BullMQ Pro.
- **The `Governed_HTTP_Client`, `Usage_Store`, `Tiered_Job_Scheduler`, webhook receiver/worker separation, and centralized configuration foundation** delivered by `instagram-rate-limit-architecture`. These are referenced as dependencies and extended, never duplicated.
- **Batch insights field expansion, two-phase sync, budget tracking, and the engagement-rate fix** delivered by `enterprise-insights-sync`. This spec corrects the metric *fields* requested (views vs impressions, adding saved/shares) but does not re-implement the batch mechanism itself.

## Glossary

- **Metric_Registry**: A single documented in-code table that maps every Instagram data type Veefore touches to exactly one classification tier (Tier 1 real-time, Tier 2 refresh-on-view, Tier 3 scheduled, Tier 4 background), based on its volatility and visibility. Adding a new metric requires adding one row.
- **Classification_Tier**: One of four values — Tier 1 (real-time priority), Tier 2 (refresh-on-view), Tier 3 (scheduled moderate frequency), Tier 4 (background low frequency) — assigned to each metric in the Metric_Registry.
- **Ceiling_Classification**: The existing HIGH/LOW account classification from the `Usage_Store`, derived from the rolling impressions estimate. Reused here to scale cadence.
- **Tiered_Job_Scheduler**: The existing scheduler from `instagram-rate-limit-architecture` that gates jobs by account usage tier and computes polling cadence. Extended by this spec, not replaced.
- **Usage_Store**: The existing per-account Redis usage store from `instagram-rate-limit-architecture`, holding usage percentages, tier, ceiling classification, and rolling impressions estimate.
- **Rate_Limit_Config**: The existing centralized `rateLimitConfig.ts` module. Extended here with new runtime-configurable values (registry tiers, age buckets, jitter spread, demographics threshold).
- **Post_Age**: The elapsed time since a media object was published, used to select a post-insight refresh interval bucket.
- **Story_Insights_Job**: A recurring poll job for an active story's insights, paired with a guaranteed final-fetch job before the story's 24-hour expiry.
- **Final_Fetch_Job**: A single guaranteed job scheduled near a story's 24-hour expiry to capture story insights before they become permanently unavailable.
- **Deterministic_Jitter**: A stable per-account time offset computed by hashing the account ID, applied to a recurring job's first-fire time to spread load across a window.
- **New_Post_Detection_Job**: A poll job that detects posts published directly on Instagram outside Veefore, for which no webhook exists.
- **Business_Discovery_Job**: An optional Tier 4 poll job that fetches public metrics for tracked competitor accounts.
- **Idempotency_Key**: A stable key carried by a retryable job that uniquely identifies its intended side effect, checked before execution to prevent duplicate actions.
- **Audit_Record**: A persisted record of an automated action capturing which rule matched, the input, what was sent, and the outcome.
- **Views_Metric**: Meta's current media metric (`views`) that replaced the deprecated `impressions` metric for media created after 2024-07-02.

## Requirements

### Requirement 1: Metric Classification Registry

**User Story:** As a platform engineer, I want every Instagram data type assigned to one classification tier in a single documented in-code table, so that cadence selection is driven by one source of truth and adding a new metric means adding one row rather than guessing a new interval.

#### Acceptance Criteria

1. THE Metric_Registry SHALL assign exactly one Classification_Tier (Tier 1, Tier 2, Tier 3, or Tier 4) to each of the following data types: comments, direct messages, follower_count, reach, views, profile_views, saved, shares, story insights, mentions, scheduled-post status, follower_demographics, online_followers, business action clicks, new-post detection, and business discovery.
2. THE Metric_Registry SHALL record both a volatility rating and a visibility rating for each metric, and any two metrics sharing the same volatility rating and the same visibility rating SHALL be assigned the same Classification_Tier.
3. THE Metric_Registry SHALL be defined as a single in-code table rather than as interval constants scattered across multiple modules.
4. WHEN a metric is scheduled, THE Tiered_Job_Scheduler SHALL select that metric's polling cadence from the per-tier base interval in the Rate_Limit_Config keyed by the metric's assigned Classification_Tier, without modification to any scheduling-logic module.
5. THE Metric_Registry SHALL classify comments, mentions, and story expiry events as webhook-driven data types that are never polled.
6. WHILE a user has an active-view session on a specific account and resource whose metric is assigned to Tier 1 and for which no webhook exists, THE Tiered_Job_Scheduler SHALL permit polling of that specific account and resource at the Tier 1 base interval from the Rate_Limit_Config, and SHALL NOT poll that Tier 1 metric for accounts or resources that are not under an active-view session.
7. WHILE internal load is below the configured backpressure threshold, THE Tiered_Job_Scheduler SHALL place no upper bound on how long a Tier 4 metric's polling work may be deferred.
8. WHEN the Metric_Registry is loaded at startup, THE system SHALL reject the registry and fail startup validation if any listed data type has zero tier assignments or more than one tier assignment.

### Requirement 2: Migrate Deprecated `impressions` Metric to `views`

**User Story:** As a platform engineer, I want all current-content polling to request the `views` metric instead of the deprecated `impressions` metric, so that polling does not error on media created after the deprecation date.

#### Acceptance Criteria

1. WHEN the Tiered_Job_Scheduler requests media or account insights for content published on or after 2024-07-02 00:00:00 UTC, THE system SHALL request the Views_Metric and SHALL NOT request the `impressions` metric.
2. THE Rate_Limit_Config and every field-expansion request string used for current-content polling SHALL request `views` and SHALL NOT contain `impressions`.
3. WHERE a backfill job targets media published strictly before 2024-07-02 00:00:00 UTC, THE system SHALL be permitted to request the `impressions` metric for that specific legacy media.
4. WHEN a media object was published on or after 2024-07-02 00:00:00 UTC, THE system SHALL NOT request the `impressions` metric for that media object.
5. WHEN the rolling impressions estimate is updated in the Usage_Store, THE system SHALL derive the estimate from the Views_Metric for content published on or after 2024-07-02 00:00:00 UTC.
6. IF a current-content insights request returns a Meta error indicating the `impressions` metric is deprecated or unavailable, THEN THE system SHALL retry the request once with the Views_Metric substituted for `impressions`, SHALL record that the substitution occurred, and SHALL NOT mark the polling job as failed.

### Requirement 3: Bundle `saved` and `shares` Into the Media Insights Request

**User Story:** As a platform engineer, I want `saved` and `shares` retrieved in the same media-insights field-expansion request as the rest of a post's insights, so that they are never fetched on a separate schedule and add no extra API calls.

#### Acceptance Criteria

1. WHEN the system requests media-level insights for a media object, THE system SHALL request `reach`, `views`, `likes`, `comments`, `saved`, `shares`, and `total_interactions` together within a single field-expansion request, and SHALL issue exactly one such request per scheduled media-insight refresh for that media object.
2. THE system SHALL NOT schedule, dispatch, or enqueue any separate poll job or additional API request dedicated to retrieving `saved` or `shares`.
3. WHEN a media-insight refresh is scheduled for a media object, THE Tiered_Job_Scheduler SHALL apply the same age-based cadence interval defined in Requirement 4 (selected by Post_Age bucket and scaled by Ceiling_Classification) to `saved` and `shares` as it applies to `reach`, `views`, `likes`, `comments`, and `total_interactions`.
4. IF the media-insights response indicates that `saved` or `shares` is not available for the media object's type, THEN THE system SHALL record the metrics that were returned, omit only the unavailable field, mark the request complete, and SHALL NOT schedule a separate request or retry to fetch the unavailable field.

### Requirement 4: Age-Based Post-Insight Cadence

**User Story:** As a system operator, I want a post's insight refresh interval to narrow while the post is fresh and widen as it ages, so that volatile new-post metrics are captured frequently while stable old-post metrics conserve budget.

#### Acceptance Criteria

1. WHILE a post's Post_Age is greater than or equal to 0 hours and less than 48 hours, THE Tiered_Job_Scheduler SHALL schedule media-insight refresh at the 0-to-48-hour bucket base interval multiplied by the Ceiling_Classification scaling factor, both loaded from the Rate_Limit_Config.
2. WHILE a post's Post_Age is greater than or equal to 48 hours and less than 7 days, THE Tiered_Job_Scheduler SHALL schedule media-insight refresh at the 48-hour-to-7-day bucket base interval multiplied by the Ceiling_Classification scaling factor, where that bucket base interval is strictly greater than the 0-to-48-hour bucket base interval.
3. WHILE a post's Post_Age is greater than or equal to 7 days and less than or equal to 30 days, THE Tiered_Job_Scheduler SHALL schedule media-insight refresh at the 7-to-30-day bucket base interval multiplied by the Ceiling_Classification scaling factor, where that bucket base interval is strictly greater than the 48-hour-to-7-day bucket base interval.
4. WHILE a post's Post_Age is greater than 30 days, THE Tiered_Job_Scheduler SHALL schedule media-insight refresh at the over-30-day bucket base interval (strictly greater than the 7-to-30-day bucket base interval) and SHALL permit this work to be deferred without an upper bound on deferral time under load.
5. THE age-bucket boundaries, each bucket's base interval, and the Ceiling_Classification scaling factors SHALL be loaded from the Rate_Limit_Config and SHALL NOT be hardcoded in scheduling logic.
6. WHEN a post's Post_Age crosses an age-bucket boundary, THE Tiered_Job_Scheduler SHALL reschedule that post's media-insight refresh to the new bucket's interval within one polling cycle.

### Requirement 5: Story Insights Hard-Deadline Handling

**User Story:** As a user, I want my story insights captured before stories expire at 24 hours, so that story performance data is preserved even when the account is under rate-limit pressure.

#### Acceptance Criteria

1. WHILE a story is active, THE Tiered_Job_Scheduler SHALL schedule a recurring Story_Insights_Job at an interval loaded from the Rate_Limit_Config (default 2 to 3 hours).
2. WHEN a story is detected, THE Tiered_Job_Scheduler SHALL schedule a Final_Fetch_Job to run at the story's publish time plus 24 hours minus a pre-expiry lead time loaded from the Rate_Limit_Config (default 30 minutes).
3. WHILE the target account is not in Critical tier, THE Final_Fetch_Job SHALL be permitted to override headroom-based deferral and execute.
4. WHILE the target account is in Critical tier, THE Final_Fetch_Job SHALL be deferred in accordance with the existing tier policy.
5. IF a Critical-tier deferral causes the Final_Fetch_Job to remain unexecuted at the story's 24-hour expiry, THEN THE system SHALL record that the story insights were not captured before expiry and SHALL NOT schedule further fetch attempts for that story.
6. IF a story-insights response returns Meta error code 10 indicating fewer than 5 viewers, THEN THE system SHALL record the result as insufficient data, THE system SHALL mark the job complete, THE system SHALL NOT retry the job, and THE system SHALL NOT log the result as an error.
7. IF a Final_Fetch_Job fails for a reason other than Meta error code 10 before the story's 24-hour expiry, THEN THE system SHALL retry the Final_Fetch_Job using full-jitter backoff up to the configured maximum retries, provided each retry is scheduled to complete before the 24-hour expiry.
8. WHEN a story-insights webhook event is received, THE system SHALL continue to run the recurring Story_Insights_Job and the Final_Fetch_Job as the safety net rather than treating the webhook as a replacement for them.
9. WHEN the Final_Fetch_Job completes successfully, THE system SHALL NOT schedule further story-insights polling for that story.

### Requirement 6: Follower Demographics and Low-Frequency Account Metrics

**User Story:** As a system operator, I want follower demographics fetched only when they will return data and other low-frequency account metrics polled sparingly, so that API budget is not wasted on calls that return nothing or change slowly.

#### Acceptance Criteria

1. IF a connected account's most recent recorded follower_count is strictly less than the configured follower-demographics threshold, THEN THE Tiered_Job_Scheduler SHALL NOT schedule or dispatch any follower_demographics call for that account.
2. WHERE a connected account's most recent recorded follower_count is greater than or equal to the configured follower-demographics threshold, THE Tiered_Job_Scheduler SHALL dispatch follower_demographics no more than once per rolling 24-hour window per account.
3. THE Tiered_Job_Scheduler SHALL classify online_followers as a Tier 4 metric and SHALL dispatch it no more than once per rolling 24-hour window per account.
4. THE Tiered_Job_Scheduler SHALL classify the business action clicks (email_contacts, phone_call_clicks, text_message_clicks, get_directions_clicks) as Tier 4 metrics and SHALL dispatch them at a low-frequency interval loaded from the Rate_Limit_Config (default no more than once per rolling 24-hour window per account).
5. THE follower-demographics follower-count threshold (a non-negative integer, default 100) SHALL be loaded from the Rate_Limit_Config and SHALL NOT be hardcoded in scheduling logic.
6. IF a follower_demographics response returns Meta error code 10 (audience too small / insufficient data), THEN THE system SHALL record the result as insufficient data, mark the job complete, and SHALL NOT retry the job or log it as an error.
7. WHEN an account's most recent recorded follower_count transitions from below the configured follower-demographics threshold to greater than or equal to it, THE Tiered_Job_Scheduler SHALL begin scheduling follower_demographics for that account on the next polling cycle.

### Requirement 7: Deterministic Jitter and Load Spreading

**User Story:** As a platform engineer, I want every recurring poll job's first-fire time spread deterministically across a window, so that accounts do not fire simultaneously and create a thundering-herd load spike.

#### Acceptance Criteria

1. WHEN a recurring poll job is first scheduled for an account, THE Tiered_Job_Scheduler SHALL apply a first-fire delay computed as a pure function of the account ID and job type, and SHALL fire subsequent occurrences at the base interval without re-applying the offset.
2. THE Deterministic_Jitter offset SHALL be a value between 0 milliseconds and (the configured spread fraction × the job's base interval), where the spread fraction is constrained to between 10% and 25% inclusive with a default of 25%.
3. WHEN the system restarts or the job is scheduled from a different worker instance, THE Deterministic_Jitter offset for a given account ID and job type SHALL be identical to the previously computed offset, without reading any persisted offset state.
4. WHEN a poll job is retried after a failure or throttle, THE system SHALL apply full-jitter backoff (a randomized delay between 0 milliseconds and the per-attempt exponential backoff ceiling) using BullMQ's built-in backoff jitter field.
5. THE jitter spread fraction SHALL be loaded from the Rate_Limit_Config and SHALL NOT be hardcoded in scheduling logic.
6. IF a job's base interval is missing, zero, or negative, THEN THE Tiered_Job_Scheduler SHALL apply a Deterministic_Jitter offset of 0 milliseconds.

### Requirement 8: New-Post Detection Polling

**User Story:** As a user, I want posts I publish directly on Instagram outside Veefore to be detected, so that my analytics include content Veefore did not publish, without needing a webhook that does not exist.

#### Acceptance Criteria

1. WHILE an account is classified as HIGH Ceiling_Classification, THE Tiered_Job_Scheduler SHALL schedule a New_Post_Detection_Job at an interval loaded from the Rate_Limit_Config (default 2 to 4 hours).
2. WHILE an account is classified as LOW Ceiling_Classification, THE Tiered_Job_Scheduler SHALL schedule a New_Post_Detection_Job at a wider interval loaded from the Rate_Limit_Config (default 6 to 8 hours).
3. WHEN a post is published through Veefore, THE system SHALL register that post for insight polling without scheduling a New_Post_Detection_Job for it.
4. THE New_Post_Detection_Job intervals SHALL be loaded from the Rate_Limit_Config and SHALL NOT be hardcoded in scheduling logic.
5. WHEN a New_Post_Detection_Job discovers a post not already known to Veefore, THE system SHALL register that post for age-based insight polling per Requirement 4.
6. WHEN a New_Post_Detection_Job is dispatched, THE system SHALL route the request through the Governed_HTTP_Client so it counts against the account's usage like any other governed call.
7. IF a New_Post_Detection_Job fails or is throttled, THEN THE system SHALL preserve the last-known detection state and SHALL NOT create duplicate registrations for posts already registered.

### Requirement 9: Business Discovery for Competitor Lookups

**User Story:** As a user comparing my performance against competitors, I want tracked competitor accounts polled at a low frequency, so that benchmarking data stays reasonably current without consuming significant budget.

#### Acceptance Criteria

1. WHERE the Business Discovery feature is enabled, THE Tiered_Job_Scheduler SHALL classify Business_Discovery_Job as a Tier 4 metric and SHALL permit its polling work to be deferred without an upper bound on deferral time under load.
2. WHERE the Business Discovery feature is enabled, THE Tiered_Job_Scheduler SHALL schedule a Business_Discovery_Job at most once per 24-hour period per tracked competitor account, at an interval loaded from the Rate_Limit_Config.
3. WHERE the Business Discovery feature is enabled, THE Tiered_Job_Scheduler SHALL schedule Business_Discovery_Jobs for no more than the maximum tracked-competitor-account count per connected account, where that maximum is loaded from the Rate_Limit_Config and is not hardcoded.
4. WHERE the Business Discovery feature is disabled, THE system SHALL NOT schedule any Business_Discovery_Job.
5. WHEN a Business_Discovery_Job is dispatched, THE system SHALL route the request through the Governed_HTTP_Client so that it counts against the account's usage in the same manner as any other governed call.
6. IF a dispatched Business_Discovery_Job returns an error indicating the competitor account is not found or not accessible, THEN THE system SHALL record the result as a failed lookup, mark the job complete, and SHALL NOT retry the job.

### Requirement 10: Idempotency for Retryable Jobs

**User Story:** As a user with comment and DM reply automation enabled, I want a retried reply job to never send the same reply twice, so that automation does not produce duplicate messages when a job is retried.

#### Acceptance Criteria

1. WHEN a retryable job that produces an external side effect is created, THE system SHALL assign it an Idempotency_Key derived deterministically so that every retry of that job carries an identical key uniquely identifying its intended side effect.
2. WHEN a job carrying an Idempotency_Key is executed, THE system SHALL atomically reserve that key and check whether its side effect has already completed before performing the side effect, such that two simultaneous executions of the same key cannot both perform the side effect.
3. IF an Idempotency_Key's side effect has already completed, THEN THE system SHALL skip re-executing the side effect, SHALL NOT send a duplicate message, and SHALL mark the job complete.
4. WHEN a side effect completes, THE system SHALL durably record the completion against its Idempotency_Key before marking the job complete, so the record survives retries and restarts.
5. IF the completion record for an Idempotency_Key cannot be read or written, THEN THE system SHALL leave the side effect un-performed, SHALL surface an error indication, and SHALL preserve the job for safe retry.
6. THE system SHALL apply Idempotency_Key checks to comment-reply and DM-reply automation jobs.

### Requirement 11: Audit Trail for Automated Actions

**User Story:** As an operator supporting enterprise customers, I want every automated action recorded with enough detail to explain why it happened, so that actions taken on a user's behalf can be reviewed after the fact for debugging and compliance.

#### Acceptance Criteria

1. WHEN an automation rule triggers an action, THE system SHALL persist exactly one Audit_Record capturing the rule that matched, the triggering input, the content that was sent, and the success outcome.
2. IF an automated action fails, THEN THE system SHALL persist exactly one Audit_Record capturing the rule that matched, the triggering input, and the failure outcome.
3. WHEN an Audit_Record is persisted, THE system SHALL include a UTC timestamp at second precision and the target account identifier.
4. THE system SHALL persist an Audit_Record for both successful and failed comment-reply and DM-reply automation actions.
5. IF persisting an Audit_Record fails, THEN THE system SHALL retry persistence up to the maximum retry count loaded from the Rate_Limit_Config and SHALL surface an error indication rather than silently discarding the record.
6. THE system SHALL retain each Audit_Record for the retention period loaded from the Rate_Limit_Config.

### Requirement 12: Graceful Internal Degradation Under Backpressure

**User Story:** As a system operator, I want the system to shed the lowest-priority work first when its own queue or Redis infrastructure is backed up, so that internal stress degrades predictably rather than failing across all tiers at once.

#### Acceptance Criteria

1. WHILE the internal queue depth (count of waiting jobs) or the measured Redis command latency (in milliseconds) exceeds the configured backpressure trigger threshold, THE Tiered_Job_Scheduler SHALL defer Tier 4 work before deferring any Tier 1, Tier 2, or Tier 3 work.
2. WHILE the internal queue depth or Redis command latency remains above the configured backpressure trigger threshold, THE Tiered_Job_Scheduler SHALL shed work in ascending Classification_Tier order (Tier 4 first, then Tier 3, then Tier 2, then Tier 1), mirroring the external usage-tier deferral logic.
3. THE backpressure trigger threshold (queue depth as a job count and Redis command latency in milliseconds) and the backpressure clear threshold SHALL be loaded from the Rate_Limit_Config and SHALL NOT be hardcoded in scheduling logic.
4. WHEN the internal queue depth and Redis command latency both fall below the configured backpressure clear threshold, THE Tiered_Job_Scheduler SHALL resume dispatching deferred work in descending Classification_Tier order (Tier 1 first, then Tier 2, then Tier 3, then Tier 4).
5. WHEN work is shed due to internal backpressure, THE system SHALL move it to the existing durable deferred queue so that it remains re-dispatchable and SHALL NOT drop or discard the job.
6. THE Tiered_Job_Scheduler SHALL sample the internal queue depth and Redis command latency at an evaluation interval loaded from the Rate_Limit_Config to determine the current backpressure state.
7. THE configured backpressure clear threshold SHALL be lower than the configured backpressure trigger threshold so that the backpressure state does not oscillate between active and cleared.
8. IF the Redis command latency cannot be measured because Redis is unreachable, THEN THE Tiered_Job_Scheduler SHALL treat backpressure as active and shed work in ascending Classification_Tier order until the Redis command latency can again be measured below the clear threshold.

### Requirement 13: Optional Tenant Priority Weighting

**User Story:** As a platform operator serving both small creators and large agencies, I want optional tenant priority weighting during contention, so that higher-priority tenants receive a larger proportional share of worker attention without starving smaller tenants.

#### Acceptance Criteria

1. WHILE the count of pending jobs exceeds available worker capacity (contention) and tenant priority weighting is enabled, THE Tiered_Job_Scheduler SHALL allocate dispatched jobs to each tenant in proportion to that tenant's configured weight, measured over a rolling 60-second window, within a tolerance of ±10 percentage points of the tenant's target proportional share.
2. WHILE contention persists and tenant priority weighting is enabled, THE Tiered_Job_Scheduler SHALL dispatch at least one job per rolling 60-second window for every tenant that has pending jobs.
3. WHERE tenant priority weighting is disabled, THE Tiered_Job_Scheduler SHALL allocate dispatched jobs to each tenant with pending jobs in equal shares.
4. THE tenant priority weights (integers between 1 and 1000 inclusive) SHALL be loaded from the Rate_Limit_Config and SHALL NOT be hardcoded.
5. IF a tenant's configured weight is missing or invalid, THEN THE Tiered_Job_Scheduler SHALL apply a default weight of 1 for that tenant and SHALL surface a configuration warning.

### Requirement 14: Runtime-Configurable Smart-Polling Values

**User Story:** As a platform engineer, I want the new smart-polling values centralized and runtime-configurable through the existing configuration pattern, so that tuning production behavior does not require a code change or deployment.

#### Acceptance Criteria

1. THE Rate_Limit_Config SHALL expose all of the following values: the Metric_Registry tier assignments, the post-age bucket boundaries and intervals, the Ceiling_Classification scaling factors, the jitter spread fraction, the per-tier base intervals, the follower_demographics threshold, the new-post detection intervals, the story-insights recurring interval and pre-expiry lead time, the backpressure trigger and clear thresholds and evaluation interval, the audit retention period and persistence retry count, and the tenant priority weights.
2. THE new configuration values SHALL be typed via the existing TypeScript configuration interface such that a missing or incorrectly typed value fails the build.
3. WHEN the Rate_Limit_Config is loaded, THE system SHALL apply environment-based overrides for the new values without requiring code changes, consistent with the existing Rate_Limit_Config pattern.
4. WHEN a new configuration value is updated, THE Tiered_Job_Scheduler SHALL adopt the updated value for jobs scheduled after the update no later than the affected metric's base polling interval, without requiring a restart.
5. IF a configuration override for a new value is missing, unparseable, or outside its allowed range, THEN THE system SHALL reject that override, retain the last valid value, and surface an error indication identifying which value failed.
6. THE Rate_Limit_Config SHALL include documentation comments explaining the source and meaning of each new value and a last-verified date in ISO 8601 (YYYY-MM-DD) format.
