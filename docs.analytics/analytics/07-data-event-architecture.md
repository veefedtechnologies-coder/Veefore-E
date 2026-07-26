Volume 7 — Data & Event Architecture
Version: 1.0
Purpose
Define the complete analytics data platform for Veefore.
This includes:
Event collection
Data ingestion
Data processing
Aggregation
Storage
Query layer
Data freshness
Identity resolution
Metric lineage
Retention
Data quality
Chapter 1 — Analytics Data Pipeline
Every metric follows the same lifecycle.
Social Platform APIs
        │
        ▼
Connector Layer
        │
        ▼
Normalization Layer
        │
        ▼
Raw Event Store
        │
        ▼
Validation Layer
        │
        ▼
Aggregation Jobs
        │
        ▼
Metric Engine
        │
        ▼
Analytics APIs
        │
        ▼
Dashboard / Reports / AI
No dashboard should query platform APIs directly.
Chapter 2 — Event Philosophy
Everything measurable is an event.
Examples:
Account connected
Sync started
Sync completed
New follower detected
Follower lost
Post published
Story published
Reel published
Comment received
DM received
Automation executed
Report exported
Dashboard opened
Filter changed
Even internal product interactions should be events (for product analytics), but keep them separate from customer social metrics.
Chapter 3 — Event Naming Convention
Use a consistent pattern:
domain.action.object
Examples:
instagram.followers.updated

instagram.post.created

youtube.video.synced

analytics.report.generated

campaign.completed

automation.execution.failed
Never invent ad-hoc names.
Chapter 4 — Event Schema
Every event should contain a common envelope.
event_id
event_name
event_version
event_timestamp
workspace_id
organization_id
user_id
platform
account_id
source
status
trace_id
payload
metadata
The payload contains event-specific fields.
Chapter 5 — Identity Resolution
One user may manage:
Multiple Instagram accounts
Multiple Facebook pages
Multiple YouTube channels
Multiple LinkedIn pages
Analytics must distinguish:
Organization
Workspace
Connected account
Platform account
Campaign
Content item
Every event should be traceable to the correct scope.
Chapter 6 — Data Freshness
Different datasets refresh at different cadences.
Suggested defaults:
Data Type	Refresh
Publishing status	Near real-time
Automation execution	Near real-time
Connected account health	Every few minutes
Engagement summaries	Hourly
Audience metrics	Hourly or daily depending on platform limits
AI insights	After fresh metric aggregation
Benchmarks	Daily
Forecasts	Daily or on-demand
Always expose the last successful refresh time in the UI.
Chapter 7 — Aggregation Strategy
Do not calculate expensive metrics on every request.
Instead maintain rollups such as:
Hourly
Daily
Weekly
Monthly
Lifetime
Queries should read from the appropriate aggregation layer whenever possible.
Chapter 8 — Metric Lineage
Every metric should be traceable.
Example:
Engagement Rate

↓

Engagements

↓

Likes
Comments
Shares
Saves

↓

Platform API Responses
This allows:
Easier debugging.
User trust.
AI explainability.
Consistent calculations.
Chapter 9 — Data Quality Levels
Every metric receives one of four quality labels:
Verified — Direct platform value.
Calculated — Deterministic calculation from verified data.
Estimated — Derived because the platform doesn't expose it directly.
Predicted — AI forecast.
The UI should clearly distinguish these categories.
Chapter 10 — Data Validation
Before events enter the metric engine:
Validate schema.
Validate timestamps.
Validate account ownership.
Remove duplicates.
Reject malformed payloads.
Log validation failures.
No invalid data should propagate into analytics.
Chapter 11 — Historical Retention
Define retention by data type.
Example approach:
Raw events: limited retention based on storage strategy.
Aggregated metrics: long-term retention for reporting.
AI insights: regenerate when underlying data changes instead of storing indefinitely.
Reports: retained according to workspace settings.
Document these policies so users understand what historical data is available.
Chapter 12 — Time Handling
Store timestamps in UTC.
Display in the user's preferred timezone.
Handle:
Daylight saving transitions.
Historical timezone changes where relevant.
Cross-timezone workspaces.
Chapter 13 — Data Corrections
Platform APIs sometimes backfill or revise metrics.
The system should support:
Re-syncs.
Backfills.
Recalculation of affected aggregates.
Audit logs of corrected values.
Avoid permanently overwriting historical values without traceability.
Chapter 14 — Observability
Track the health of the analytics platform itself.
Examples:
Sync success rate.
Sync latency.
Aggregation latency.
Failed jobs.
Queue length.
API rate-limit events.
Connector errors.
Report generation failures.
This operational telemetry should be visible to administrators, not end users.
Chapter 15 — Security & Privacy
Analytics data should respect:
Role-based access control.
Workspace isolation.
Audit logging.
Encryption in transit.
Encryption at rest.
Principle of least privilege.
Also document deletion behavior for disconnected accounts and deleted workspaces.