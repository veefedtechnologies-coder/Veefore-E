Volume 10 — Analytics Database & Storage Architecture (MongoDB)
Version: 1.0
Database
MongoDB Atlas
Objective
Design a scalable analytics data model that supports:
Multi-workspace
Multi-platform
Time-series analytics
AI insights
Dashboard queries
Historical reporting
Forecasting
Millions of events
without requiring a major redesign later.
Chapter 1 — Database Philosophy
Separate data into logical domains.
Authentication
↓

Workspace

↓

Connected Accounts

↓

Content

↓

Raw Platform Data

↓

Analytics Events

↓

Aggregated Metrics

↓

AI Intelligence

↓

Reports

↓

Audit Logs
Never mix operational application data with analytical rollups.
Chapter 2 — Core Collections
Workspaces
Stores:
Workspace metadata
Plan
Timezone
Preferences
Retention policy
Connected Accounts
Stores
Instagram
Facebook
YouTube
LinkedIn
Threads
TikTok
Pinterest
Google Business
Including:
Tokens
Permissions
Sync status
Last sync
Health
Content
Stores
Posts
Stories
Reels
Videos
Carousels
Drafts
Campaign links
Publishing metadata
Platform IDs
Analytics Events
Every normalized event.
Examples:
Follower gained
Follower lost
Post published
Comment received
Story viewed
Automation executed
Hourly Rollups
Aggregated metrics.
One document per
Workspace
Platform
Account
Hour
Daily Rollups
Same pattern.
Optimized for dashboards.
Monthly Rollups
Optimized for reports.
AI Insights
Stores
Executive summaries
Predictions
Recommendations
Risk detection
Opportunity detection
Confidence
Evidence references
Avoid storing stale insights indefinitely; regenerate when underlying metrics change.
Reports
Generated
PDF
CSV
Excel
Metadata
Status
Schedule
Audit Logs
Exports
Permissions
Deletes
API keys
Workspace changes
Chapter 3 — Time-Series Strategy
Analytics is inherently time-based.
Collections holding event or rollup data should be organized to support efficient time-range queries.
Rollups should exist at multiple granularities:
Hourly
Daily
Weekly (optional if derived)
Monthly
Lifetime summaries
Choose the appropriate level based on the dashboard request.
Chapter 4 — Document Relationships
Hierarchy:
Workspace

↓

Platform

↓

Connected Account

↓

Campaign

↓

Content

↓

Analytics Event

↓

Rollup

↓

AI Insight
Every document should reference the identifiers needed to trace its lineage.
Chapter 5 — Metric Storage
Avoid storing redundant values.
Example:
Store:
Followers
Likes
Comments
Shares
Saves
Reach
Impressions
Compute when appropriate:
Engagement Rate
Follower Growth %
Reach Efficiency
Content Score
Virality Score
Audience Quality
Forecast
Persist only expensive aggregations or AI outputs that would be costly to regenerate.
Chapter 6 — Indexing Strategy
Indexes should prioritize:
Workspace
Platform
Connected account
Time
Campaign
Content
Event type
Monitor index usage and remove unused indexes to control storage overhead.
Chapter 7 — Archiving
Historical analytics grows quickly.
Policies should define:
Active analytical window.
Long-term archive.
Report retention.
Audit retention.
Archived data should remain recoverable for reporting when required.
Chapter 8 — Query Optimization
Dashboards should query rollups whenever possible.
Detailed investigations can query raw events.
Avoid scanning raw event collections for common dashboard requests.
Chapter 9 — AI Data Storage
Store:
Insight metadata.
Supporting metric references.
Confidence.
Generation timestamp.
Prompt/version identifiers (for reproducibility if needed).
Do not duplicate the underlying analytics data inside AI documents.
Chapter 10 — Multi-Tenant Isolation
Every analytics document should belong to a single workspace or organization.
Isolation must be enforced in backend services, not just by frontend filtering.
Chapter 11 — Backup & Recovery
Document:
Backup cadence.
Point-in-time recovery strategy.
Disaster recovery objectives.
Validation of backup restores.
Analytics history is valuable and should be recoverable.
Chapter 12 — Data Lifecycle
Each data type should define:
Creation.
Updates.
Archival.
Deletion.
Restoration (where supported).
Deletion of a connected account should specify whether historical analytics remain available or are removed according to user settings and applicable regulations.
Chapter 13 — Future Expansion
The storage model should allow future additions such as:
New social platforms.
Custom metrics.
Customer-defined dashboards.
AI memory for long-term trend analysis.
Data warehouse replication if scale eventually requires it.