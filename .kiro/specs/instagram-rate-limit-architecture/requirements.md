# Requirements Document

## Introduction

This feature transforms Veefore's Instagram API integration from a simplified flat-rate budget model (200 calls/hour per account) into a production-grade, impression-scaled rate-limit architecture governed by Meta's Business Use Case (BUC) formula. The system tracks real-time per-account usage via response headers, enforces tiered job scheduling, implements impression-scaled polling cadence, separates webhook reception from processing, and delivers an honest, stale-while-revalidate UX that never exposes raw API errors to users.

## Glossary

- **Governed_HTTP_Client**: The single HTTP client wrapper through which ALL outbound calls to graph.facebook.com and graph.instagram.com must flow. No feature module may bypass it.
- **BUC_Rate_Limit**: Meta's Business Use Case rate limit formula: 4,800 × daily impressions per connected Instagram account within a 24-hour rolling window.
- **Usage_Header**: The `X-Business-Use-Case-Usage` response header returned by Meta on Instagram Platform API responses, containing per-account percentage-based usage metrics.
- **App_Usage_Header**: The `X-App-Usage` response header returned by Meta on Platform Rate Limit governed calls, containing app-level usage percentages.
- **Usage_Store**: Redis-based per-account storage holding real-time usage percentages and metadata (call_count_pct, cputime_pct, time_pct, estimated_time_to_regain_access, rolling_impressions_estimate, last_updated_at).
- **Job_Scheduler**: The tiered scheduling system that checks per-account usage before dispatching background work, applying Normal/Caution/Restricted/Critical tier policies.
- **Webhook_Receiver**: A lightweight process that receives Meta webhook POST payloads, validates them, enqueues them, and returns HTTP 200 immediately.
- **Webhook_Worker**: A separate process consuming the webhook event queue, evaluating automation rules, and making API calls (replies) through the Governed_HTTP_Client.
- **Impression_Estimate**: A rolling estimate of each account's daily impressions, derived from the account-level insights endpoint, used to contextualize percentage-based usage.
- **Tier_Policy**: The four-level usage classification (Normal 0-60%, Caution 60-80%, Restricted 80-95%, Critical 95%+) that governs what work may execute for a given account.
- **Backfill_Queue**: A low-priority background queue that fetches historical post data older than the initial 20-25 posts, respecting tier policies and never dropping deferred work.
- **Stale_While_Revalidate**: The UX rendering pattern where cached data is displayed immediately while a background refresh attempts to update it, preventing loading spinners.

## Requirements

### Requirement 1: Governed HTTP Client Wrapper

**User Story:** As a platform engineer, I want all Instagram API calls routed through a single governed HTTP client wrapper, so that usage headers are captured from every response without exception and no feature module can accidentally bypass rate-limit governance.

#### Acceptance Criteria

1. THE Governed_HTTP_Client SHALL be the sole mechanism for making outbound HTTP requests to graph.facebook.com and graph.instagram.com across the entire codebase.
2. WHEN a response is received from Meta's API, THE Governed_HTTP_Client SHALL parse the `X-Business-Use-Case-Usage` header and extract call_count, total_cputime, total_time, and estimated_time_to_regain_access for each account ID present in the header (up to 32 accounts per response).
3. WHEN a response is received from Meta's API, THE Governed_HTTP_Client SHALL parse the `X-App-Usage` header if present and extract call_count, total_cputime, and total_time at the app level.
4. WHEN a usage header is successfully parsed, THE Governed_HTTP_Client SHALL write the extracted metrics to the Usage_Store keyed by Instagram account ID.
5. IF a response contains no usage header, THEN THE Governed_HTTP_Client SHALL retain the previous Usage_Store values for that account without overwriting them and SHALL NOT treat missing headers as zero usage.
6. WHEN a response indicates an HTTP error (4xx or 5xx), THE Governed_HTTP_Client SHALL still attempt to parse any usage headers present in the error response before propagating the error.
7. THE Governed_HTTP_Client SHALL support both GET and POST request methods with configurable timeout (loaded from centralized configuration), retry logic with exponential backoff, and request deduplication.
8. THE Governed_HTTP_Client SHALL enforce architectural isolation such that no direct axios/fetch call to Meta endpoints can exist outside the wrapper — validated by lint rules or import restrictions.
9. WHEN a Meta API error code 80002 (BUC throttle) or HTTP 429 is received, THE Governed_HTTP_Client SHALL update the Usage_Store to reflect Critical tier for that account and set estimated_minutes_to_regain_access from the response.

### Requirement 2: Per-Account Usage Storage

**User Story:** As the rate-limit system, I want per-account usage percentages stored in Redis with fast read/write access, so that any component can query real-time headroom before making API calls and the system scales to hundreds of connected accounts.

#### Acceptance Criteria

1. THE Usage_Store SHALL persist the following fields per Instagram account ID: call_count_pct, total_cputime_pct, total_time_pct, estimated_minutes_to_regain_access, rolling_impressions_estimate, and last_updated_at.
2. WHEN the Governed_HTTP_Client writes new usage data, THE Usage_Store SHALL overwrite only the fields present in the parsed header and update last_updated_at to the current timestamp.
3. WHILE a stored usage record has a last_updated_at older than 5 minutes, THE Usage_Store SHALL mark it as stale-but-usable rather than treating it as zero usage.
4. IF Redis is unavailable, THEN THE Usage_Store SHALL degrade gracefully by returning the last known cached value from local memory or by treating usage as unknown (defaulting to Caution tier behavior).
5. THE Usage_Store SHALL set a configurable TTL (default 2 hours) on each account's usage record to prevent indefinitely stale data from persisting.
6. WHEN queried, THE Usage_Store SHALL return the maximum of call_count_pct, total_cputime_pct, and total_time_pct as the effective usage percentage for tier determination.
7. THE Usage_Store SHALL support concurrent reads and writes from multiple worker processes without data corruption, using atomic Redis operations.
8. THE Usage_Store SHALL emit structured log entries on every tier transition (e.g., Normal→Caution) for observability.

### Requirement 3: Rolling Impressions Estimate

**User Story:** As a platform engineer, I want each account's daily impressions estimated and stored, so that the system can distinguish between accounts with large versus small rate-limit ceilings.

#### Acceptance Criteria

1. WHEN account-level insights are fetched for an Instagram account, THE Usage_Store SHALL update the rolling_impressions_estimate field with the most recent daily impressions value.
2. THE Usage_Store SHALL use the rolling_impressions_estimate to classify accounts as high-ceiling (above a configurable threshold) or low-ceiling (below it).
3. WHILE an account has no impressions data (newly connected), THE Usage_Store SHALL assume the minimum ceiling (10 impressions = 48,000 calls/day baseline) and treat the account as low-ceiling.
4. THE rolling_impressions_estimate SHALL be used by the Job_Scheduler to differentiate scheduling behavior between large and small accounts at the same usage percentage.

### Requirement 4: Tiered Job Scheduler

**User Story:** As the system, I want background jobs governed by a four-tier policy based on real-time per-account usage, so that critical user-facing operations are preserved while non-urgent work is deferred during high-usage periods and no job is ever silently dropped.

#### Acceptance Criteria

1. WHILE an account is in Normal tier (0-60% usage), THE Job_Scheduler SHALL permit all job types: analytics refresh, backfill, polling, automation replies, scheduled posts, and user-initiated work.
2. WHILE an account is in Caution tier (60-80% usage), THE Job_Scheduler SHALL permit comment/DM automation replies, scheduled posts due now, and user-initiated work, and SHALL defer backfill and non-urgent analytics refresh.
3. WHILE an account is in Restricted tier (80-95% usage), THE Job_Scheduler SHALL permit only work tied to something the user is actively viewing, and SHALL defer all other work to a retry queue.
4. WHILE an account is in Critical tier (95%+ usage), THE Job_Scheduler SHALL permit only publishing a post that is due at the current moment, and SHALL defer everything else.
5. WHEN a job is deferred, THE Job_Scheduler SHALL place it in a durable retry queue with exponential backoff, and SHALL re-attempt the job once the account drops below 80% usage.
6. THE Job_Scheduler SHALL query the Usage_Store as the first step before dequeuing work for any account, not after attempting a failed call — checking first avoids wasting a call attempt.
7. IF a deferred job has been retried more than a configurable maximum number of times, THEN THE Job_Scheduler SHALL emit an alert to the monitoring system rather than silently dropping the job.
8. THE tier thresholds (60%, 80%, 95%) SHALL be loaded from the centralized configuration and SHALL NOT be hardcoded as literals in business logic.
9. THE Job_Scheduler SHALL process jobs for different accounts independently so that one account in Critical tier does not block or delay jobs for other accounts in Normal tier.
10. WHEN a tier transition occurs for an account, THE Job_Scheduler SHALL notify the UX layer via WebSocket so the frontend can update status indicators in real time.

### Requirement 5: Impression-Scaled Polling Cadence

**User Story:** As the system, I want polling frequency to scale with each account's impression-derived ceiling, so that large accounts are polled more frequently while small accounts are protected by polling less — and all intervals are dynamically configurable.

#### Acceptance Criteria

1. WHILE an account is classified as high-ceiling, THE Job_Scheduler SHALL schedule account-level insights refresh approximately every 60 minutes and post-level insights for recent posts every 2-4 hours.
2. WHILE an account is classified as low-ceiling, THE Job_Scheduler SHALL schedule account-level insights refresh every 3-6 hours and post-level insights for recent posts every 4-6 hours.
3. THE Job_Scheduler SHALL schedule new post detection polling every 1-4 hours, scaled by account ceiling classification.
4. THE Job_Scheduler SHALL schedule follower count polling hourly for high-ceiling accounts and every 4-6 hours for low-ceiling accounts.
5. THE Job_Scheduler SHALL schedule older post insights (beyond 7 days) at most once daily at low priority.
6. THE polling cadence thresholds (what constitutes high-ceiling vs low-ceiling, and all interval values) SHALL be loaded from the centralized configuration module at runtime and SHALL NOT be hardcoded.
7. WHEN the centralized configuration is updated, THE Job_Scheduler SHALL adopt new cadence values within one polling cycle without requiring a restart.
8. THE Job_Scheduler SHALL never poll for comments, mentions, or story expiry events — these data types SHALL only be received via webhooks.

### Requirement 6: Initial Backfill Strategy

**User Story:** As a user who just connected my Instagram account, I want my dashboard populated quickly with recent data using efficient API calls, so that the app feels immediately useful without exhausting my API budget.

#### Acceptance Criteria

1. WHEN a new Instagram account completes OAuth connection, THE system SHALL fetch profile and account metadata as the first call.
2. WHEN a new account is connected, THE system SHALL fetch the most recent 20-25 posts with their insights using Meta's field-expansion syntax in a single combined API request rather than N+1 separate calls.
3. THE system SHALL use the field-expansion format requesting id, caption, media_type, timestamp, like_count, comments_count, and insights.metric(impressions,reach,saved) in one request.
4. WHEN the initial 20-25 posts are fetched, THE system SHALL enqueue all older posts into the Backfill_Queue at low priority.
5. WHILE the Backfill_Queue is processing, THE Job_Scheduler SHALL respect the tier policy — running backfill only during Normal tier and deferring during Caution and above.
6. IF the connected account has a low-ceiling classification, THEN THE system SHALL limit the initial fetch to 15-20 posts to conserve budget.
7. THE initial fetch count (20-25 posts, 15-20 for low-ceiling) SHALL be loaded from the centralized configuration and SHALL NOT be hardcoded.
8. WHEN the initial backfill completes, THE system SHALL trigger a WebSocket event to the frontend so the dashboard transitions from syncing state to populated state in real time.

### Requirement 7: Webhook Receiver and Worker Separation

**User Story:** As the system, I want webhook reception and processing separated into distinct processes connected by a durable queue, so that a viral comment spike on one account cannot degrade the receiver's responsiveness and the system scales horizontally.

#### Acceptance Criteria

1. WHEN Meta sends a webhook POST, THE Webhook_Receiver SHALL validate the payload signature, enqueue the event, and return HTTP 200 within 50ms.
2. THE Webhook_Receiver SHALL perform no business logic, no database lookups, and no outbound API calls inline during webhook handling.
3. THE Webhook_Worker SHALL consume events from the queue, look up the relevant Veefore user and account, evaluate automation rules, and initiate reply calls through the Governed_HTTP_Client.
4. WHEN the Webhook_Worker determines a reply should be sent, THE Webhook_Worker SHALL check the Usage_Store for the target account before making the reply API call.
5. WHILE the webhook event queue depth exceeds a configurable threshold, THE system SHALL scale the worker pool horizontally without affecting the Webhook_Receiver process.
6. THE system SHALL never poll for comments, mentions, or story expiry events — these SHALL be received exclusively via webhooks.
7. THE Webhook_Receiver SHALL be stateless and horizontally scalable — multiple instances can run behind a load balancer without coordination.
8. THE webhook queue SHALL be durable (BullMQ with Redis persistence) so that events are not lost during worker restarts or crashes.
9. WHEN a webhook event fails processing in the worker, THE system SHALL retry with exponential backoff up to a configurable maximum before moving the event to a dead-letter queue for manual review.

### Requirement 8: Stale-While-Revalidate UX Pattern

**User Story:** As a user viewing my analytics dashboard, I want data to display instantly from cache while refreshing in the background, so that the app never shows loading spinners, empty states, or raw errors during normal operation — it always feels responsive and working.

#### Acceptance Criteria

1. WHEN a user opens any analytics screen, THE system SHALL render cached data immediately without blocking on a background refresh — the user SHALL see content within 200ms of navigation.
2. WHEN a background refresh succeeds, THE system SHALL update the displayed data in place with a subtle transition rather than a jarring re-render or full page reload.
3. IF a background refresh is deferred due to the account being in Caution or higher tier, THEN THE system SHALL continue displaying cached data without showing an error, empty state, or loading spinner.
4. THE system SHALL display a "last updated" timestamp on every screen showing polled data, formatted as plain-language relative time (e.g., "Updated 12 minutes ago") and SHALL update this timestamp without requiring page refresh.
5. THE system SHALL never display a raw Meta API error code, HTTP status code, or Meta error string to the user under any circumstance.
6. WHEN an operation is deferred due to rate limiting, THE system SHALL display a specific, plain-language message indicating when the operation will retry (e.g., "Analytics for [account] will refresh again in about 20 minutes").
7. IF a user-initiated action cannot be performed due to Critical tier, THEN THE system SHALL explain the situation without technical jargon and provide an estimated wait time based on estimated_minutes_to_regain_access.
8. THE system SHALL translate Meta error code 80002 (BUC throttle), HTTP 429, and all other API errors into one of the predefined calm, user-friendly messages — the mapping from error codes to messages SHALL be maintained in the centralized configuration.
9. WHEN cached data exists but is older than a configurable staleness threshold, THE system SHALL display the data with a visual indicator (e.g., slightly dimmed or with an "updating..." badge) so the user knows a refresh is pending.

### Requirement 9: New Account Onboarding Transparency

**User Story:** As a user who just connected a small or new Instagram account, I want clear communication about refresh frequency expectations, so that I understand slower polling is normal behavior and not a bug.

#### Acceptance Criteria

1. WHEN a newly connected account is classified as low-ceiling, THE system SHALL display a brief onboarding message explaining that refresh frequency scales with account activity.
2. THE system SHALL show a syncing indicator during initial backfill for new accounts, communicating that historical data is being populated in the background.
3. THE onboarding messaging SHALL use plain, non-technical language and SHALL NOT reference API limits, rate limits, or impressions formulas.
4. WHEN the initial 20-25 posts are loaded, THE system SHALL dismiss the syncing indicator and display the dashboard with available data.

### Requirement 10: Centralized Rate-Limit Configuration

**User Story:** As a platform engineer, I want all Meta-published rate-limit numbers, polling intervals, tier thresholds, and operational constants centralized in one documented configuration module, so that nothing is hardcoded and updates require a single change rather than a repo-wide search.

#### Acceptance Criteria

1. THE system SHALL store the BUC multiplier (4,800), the platform rate limit multiplier (200), per-day publish limits, and messaging endpoint ceilings in a single, named, exported configuration module.
2. THE system SHALL store all polling cadence intervals, tier thresholds (60%, 80%, 95%), backfill limits, queue configuration parameters, retry maximums, and TTL values in the same centralized configuration.
3. WHEN Meta publishes updated rate-limit numbers, THE system SHALL require modification of only the centralized configuration module to adopt the new values — no other file SHALL contain bare numeric literals for these values.
4. WHERE a live Meta endpoint exists to check current limit usage (e.g., content-publishing-limit), THE system SHALL query it at runtime rather than relying solely on configured values.
5. THE centralized configuration SHALL include documentation comments explaining the source, meaning, and last-verified date of each value.
6. THE centralized configuration SHALL be typed (TypeScript interface) so that missing or incorrectly typed values are caught at compile time.
7. THE centralized configuration SHALL support environment-based overrides (development vs production) without code changes.
8. THE system SHALL log a warning at startup if any configuration value appears to be at its default rather than explicitly set.

### Requirement 11: Deferred Work Reliability

**User Story:** As the system, I want deferred jobs to be reliably re-queued and never silently dropped, so that backfill and analytics refresh eventually complete for every account.

#### Acceptance Criteria

1. WHEN a job is deferred by the Job_Scheduler, THE system SHALL persist it in a durable queue (BullMQ with Redis persistence) with metadata including the original scheduled time, number of retries, and target account.
2. WHEN an account's usage drops below 80%, THE Job_Scheduler SHALL re-evaluate and dispatch pending deferred jobs for that account in priority order.
3. THE system SHALL track deferred job counts per account and expose this metric for monitoring and alerting.
4. IF a deferred job exceeds 24 hours without successful execution, THEN THE system SHALL emit an alert to the operations monitoring system.
5. THE system SHALL preserve job ordering within priority tiers — jobs deferred earlier SHALL be attempted before jobs deferred later at the same priority level.

### Requirement 12: Comment Flood Resilience

**User Story:** As the system, I want a viral comment spike on one account to be absorbed by queue depth without affecting other accounts or degrading the webhook receiver, so that the platform remains stable and scalable during traffic surges of any magnitude.

#### Acceptance Criteria

1. WHEN a burst of webhook events arrives for a single account, THE Webhook_Receiver SHALL continue returning HTTP 200 within 50ms for all events regardless of queue depth.
2. WHILE one account's webhook queue depth is high, THE Webhook_Worker pool SHALL continue processing events for other accounts without delay.
3. THE system SHALL isolate per-account webhook processing so that a flood on one account does not starve worker capacity for other accounts.
4. WHEN the Webhook_Worker issues reply calls for an account under high usage, THE Webhook_Worker SHALL respect the tier policy and defer replies if the account reaches Restricted or Critical tier.
5. THE system SHALL log queue depth metrics per account for observability and capacity planning.
6. THE system SHALL support configurable per-account concurrency limits on the worker pool to prevent one account from monopolizing all workers.
7. WHEN queue depth for any account exceeds a configurable alert threshold, THE system SHALL emit a monitoring alert for operational awareness.
