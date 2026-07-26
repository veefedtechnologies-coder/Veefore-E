Volume 2 — Enterprise Metrics Architecture & Dictionary (Part 1)
Version: 1.0
Purpose: Define every metric in Veefore so all dashboards, reports, AI insights, and exports use one consistent source of truth.
Chapter 1 — Metrics Philosophy
Every metric in Veefore belongs to one of five categories.
Raw Metrics
     ↓
Calculated Metrics
     ↓
Composite Scores
     ↓
AI Metrics
     ↓
Business Metrics
Example:
Instagram returns:
Likes
Comments
Shares
Reach
These are Raw Metrics.
Veefore calculates:
Engagement Rate
Follower Growth
Share Rate
Save Rate
CTR
These are Calculated Metrics.
Veefore then creates:
Content Score

Creator Score

Account Health

Virality Score

Brand Health
These are Composite Scores.
AI generates:
Content Quality

Trend Match

Risk Score

Growth Opportunity

Audience Quality

Prediction Confidence
These are AI Metrics.
Business layer:
ROI

Revenue

Leads

CPA

ROAS

Customer Value

Conversion Funnel
This hierarchy is extremely important.
Chapter 2 — Universal Metric Structure
Every metric in Veefore follows exactly the same schema.
Metric Name

Metric ID

Description

Category

Platform Support

Availability

Refresh Rate

Historical Limit

Formula

Aggregation

Data Source

API Endpoint

Dimensions

Filters

Drill Down

Benchmarks

Industry Average

Good Range

Warning Range

Critical Range

Visualization

Tooltip

AI Explanation

Related Metrics

Export Name

Permission Required

Caching

Confidence Level

Limitations

Edge Cases

Version
Every single metric.
No exceptions.
Chapter 3 — Metric Categories
A. Account Metrics
Examples:
Account Status
Connected Since
Platform
Followers
Following
Posts
Videos
Stories
Reels
Bio Clicks
Profile Visits
Verification Status
Business Category
Response Time
Messages
DM Open Rate
Response SLA
B. Audience Metrics
Examples
Followers
Follower Growth
New Followers
Lost Followers
Net Growth
Audience Churn
Audience Retention
Returning Followers
Inactive Followers
Estimated Fake Followers
Audience Quality
Audience Loyalty
Audience Value
Audience Lifetime
Growth Velocity
Audience Saturation
Audience Concentration
C. Reach Metrics
Organic Reach
Paid Reach
Unique Reach
Total Reach
Hashtag Reach
Explore Reach
Search Reach
External Reach
Geographic Reach
Audience Reach
Referral Reach
Discovery Reach
Frequency
Reach Efficiency
Reach Velocity
Reach Quality
D. Impression Metrics
Impressions
Unique Impressions
Repeated Impressions
Average Frequency
Impression Growth
Impression Velocity
Visibility Score
Discovery Score
E. Engagement Metrics
Likes
Comments
Replies
Shares
Saves
Bookmarks
Mentions
Story Replies
Sticker Clicks
Link Clicks
Carousel Swipes
Profile Visits
Profile Actions
Email Clicks
Call Clicks
Direction Clicks
Website Clicks
Message Starts
Reaction Distribution
F. Video Metrics
Views
3-second Views
5-second Views
10-second Views
25%
50%
75%
95%
100%
Completion Rate
Average Watch Time
Total Watch Time
Replay Rate
Skip Rate
Drop-off Rate
Retention
Engaged Views
G. Story Metrics
Forward Taps
Back Taps
Exit Rate
Completion Rate
Replies
Sticker Engagement
Link Clicks
Quiz Responses
Poll Responses
H. Publishing Metrics
Scheduled Posts
Published Posts
Failed Posts
Delayed Posts
Average Publish Delay
Queue Length
Publishing Success Rate
Publishing SLA
API Failure Rate
Retry Count
Approval Time
Draft Age
I. Automation Metrics
Automations Created
Automations Running
Execution Count
Average Runtime
Success Rate
Failure Rate
Retry Rate
Credits Used
Time Saved
Automation ROI
J. Campaign Metrics
Campaign Reach
Campaign Engagement
Campaign Revenue
Campaign ROI
Campaign Cost
Campaign CTR
Campaign CPA
Campaign CPM
Campaign ROAS
Campaign Score
K. Revenue Metrics
Revenue
Affiliate Revenue
Sales
Conversions
Conversion Rate
Average Order Value
Customer Value
ROAS
ROI
Recurring Revenue
L. AI Metrics
AI Score
Content Score
Hook Score
Caption Score
Thumbnail Score
SEO Score
Trend Score
Virality Score
Emotion Score
Sentiment Score
Quality Score
Optimization Score
Posting Time Score
Forecast Confidence
Recommendation Confidence
Chapter 4 — Metric Naming Standards
Never allow multiple names for the same metric.
Wrong
Followers

Follower Count

Total Followers
Correct
Followers
Internally
followers_total
Database
followers_total
API
followers_total
Frontend
followers_total
AI
followers_total
Consistency avoids bugs and confusion.
Chapter 5 — Metric IDs
Every metric receives a permanent ID.
Examples
MTR-000001

Followers
MTR-000002

Reach
MTR-000003

Impressions
This allows:
Versioning
Auditing
Deprecation
Backward compatibility

> TODO (ASI-001, see OPEN_SPEC_ITEMS.md): The ID anchors above conflict with
> Chapter 12, which assigns MTR-000002 to "Follower Growth". Confirm the
> canonical ID for each metric and reconcile Ch 5 and Ch 12. Implementation
> currently treats Ch 12 as authoritative (ids centralized in metric-ids.ts).

Chapter 6 — Refresh Frequencies
Not all data updates equally.
Define expected freshness:
Frequency	Examples
Real-time (seconds)	Publishing status, automation execution
Near real-time (1–5 min)	Live engagement where platform APIs permit
Hourly	Audience growth, content performance summaries
Daily	Historical trends, benchmark calculations
Weekly	Competitive summaries, long-term AI models
On-demand	Report generation, exports, custom queries
The UI should always show the last successful refresh time.
Chapter 7 — Data Quality Levels
Every metric should expose a confidence or quality indicator.
Verified — Directly returned by the platform API.
Calculated — Derived deterministically from verified data.
Estimated — Model-based estimate because the platform does not expose the metric.
Predicted — Forecast produced by AI.
This distinction builds user trust and prevents confusion.
Chapter 8 — Metric Relationships
Metrics should not exist in isolation.
For example:
Engagement Rate depends on:
Engagements
Reach (or Followers, depending on the selected formula)
Virality Score may combine:
Share Rate
Save Rate
Reach Velocity
Engagement Velocity
These dependencies should be documented so every report and AI explanation references the same calculation chain.



Volume 2 — Enterprise Metrics Dictionary (Part 2)
Metric Definition Standards
Chapter 9 — Individual Metric Specification Template
Every metric in Veefore must follow this exact specification.
Metric ID:
Metric Name:
Display Name:
Category:
Subcategory:

Business Purpose:

Definition:

Supported Platforms:

Raw / Calculated / AI / Composite / Business:

Formula:

Aggregation Type:

Dimensions:

Supported Filters:

Data Source:

Platform API Endpoint:

Historical Availability:

Refresh Frequency:

Minimum Granularity:

Maximum Granularity:

Benchmark:

Industry Average:

Excellent Range:

Good Range:

Average Range:

Poor Range:

Critical Range:

Visualization Types:

Drill Down Destination:

Related Metrics:

AI Interpretation Rules:

Common User Questions:

Export Field Name:

Permission Required:

Cache Duration:

Estimated Data Size:

Confidence Level:

Limitations:

Known API Restrictions:

Edge Cases:

Version:
Every metric in Veefore must follow this format.
No shortcuts.

> TODO (ASI-003, see OPEN_SPEC_ITEMS.md): The benchmark fields above (Industry
> Average, Excellent/Good/Average/Poor/Critical ranges) have no numeric ranges
> defined for any metric. Provide per-metric (ideally per-platform) ranges so
> values can be rated. Until then no benchmark numbers are invented; the engine's
> rateValue() supports ranges as soon as they are documented. Blocks Phase 5/6.

Chapter 10 — Universal Time Dimensions
Every metric should support multiple time granularities.
Examples
Real-Time

↓

1 Minute

↓

5 Minutes

↓

15 Minutes

↓

30 Minutes

↓

Hourly

↓

Daily

↓

Weekly

↓

Monthly

↓

Quarterly

↓

Yearly

↓

Lifetime
Users should be able to switch between these granularities where supported by the platform and data retention policies.
Chapter 11 — Universal Dimensions
Every metric should be sliceable by dimensions.
Platform
Instagram
Facebook
LinkedIn
Threads
YouTube
TikTok
Pinterest
Google Business
Account
Single Account
Multiple Accounts
Workspace
Organization
Geography
Country
State
City
Region
Timezone
Audience
Age
Gender (if available)
Language
Follower Tier
Returning/New
Active/Inactive
Content
Post
Reel
Story
Video
Carousel
Image
Live
Short
Long Form
Campaign
Campaign
Tags
Creator
Approval Flow
Brand
Client
Publishing
Published
Scheduled
Draft
Failed
Retry
Expired
Device
Desktop
Android
iOS
Tablet
Browser
Chapter 12 — Account Metrics
Metric
Followers
ID
MTR-000001
Business Purpose
Measures audience size.
Category
Account
Type
Raw Metric
Formula
Platform API value.
Aggregation
Latest Value.
Refresh
Hourly.
History
Lifetime.
Visualization
KPI
Trend
Area Chart
Line Chart
Related
Follower Growth
Audience Size
Reach
AI Insight
Growth slowing?
Growth accelerating?
Plateau detected?
Metric
Follower Growth
ID
MTR-000002
Category
Calculated
Formula
(Current Followers - Previous Followers)
Supports
Daily
Weekly
Monthly
Quarterly
Yearly
Lifetime
Visualizations
Growth Line
Heatmap
Growth Calendar
Forecast
AI
Predict next 90 days.
Detect abnormal spikes.
Detect follower loss.
Metric
Follower Growth Rate
Formula
(Net New Followers / Previous Followers) × 100
Purpose
Growth efficiency.
Metric
Net Followers
Formula
New Followers - Lost Followers
Metric
Audience Churn
Formula
Lost Followers / Previous Followers
Metric
Audience Retention
Formula
100 - Churn %
Metric
Audience Loyalty Score
Composite
Combines
Retention
Returning viewers
Repeat engagement
Shares
Saves
DM interactions
Metric
Profile Visits
Platform
Instagram
Facebook
LinkedIn
YouTube (where available)
Purpose
Measures profile discovery.
Metric
Website Clicks
Purpose
Traffic generation.
Related
CTR
Conversions
Revenue
Metric
Email Clicks
Business accounts only.
Metric
Call Button Clicks
Business profiles.
Metric
Direction Clicks
Local businesses.
Metric
Message Starts
Instagram
Facebook
WhatsApp (if integrated)
Purpose
Lead generation.
Chapter 13 — Reach Metrics
Reach
Raw Metric
Unique Reach
Calculated
Organic Reach
Raw
Paid Reach
Raw
Explore Reach
Instagram only
Search Reach
Platform supported
Hashtag Reach
Platform supported
Profile Reach
Raw
External Reach
Calculated
Includes
Website
Search
Embedded posts
Referral
Reach Velocity
Formula
Reach gained per hour
Reach Efficiency
Formula
Reach / Followers
Reach Quality Score
Composite
Factors
Audience quality
Retention
Engagement
CTR
Chapter 14 — Impression Metrics
Impressions
Unique Impressions
Repeat Impressions
Impression Velocity
Impression Frequency
Average Frequency
Visibility Score
Discovery Score
Exposure Score
Scroll Stop %
All documented with the same template.
Chapter 15 — Engagement Metrics
One of the biggest categories.
Likes
Comments
Replies
Shares
Saves
Bookmarks
Mentions
Tags
Story Replies
Sticker Taps
Link Clicks
Profile Clicks
Website Clicks
Email Clicks
Call Clicks
Directions Clicks
DM Starts
Average Engagement
Median Engagement
Weighted Engagement
Engagement Rate by Reach
Engagement Rate by Followers
Engagement Rate by Impressions
Engagement Velocity
Engagement Depth
Engagement Consistency
Interaction Mix
Conversation Rate
Amplification Rate
Applause Rate
Virality Ratio
Chapter 16 — Video Metrics
Views
3 Second
5 Second
10 Second
25%
50%
75%
95%
100%
Completion
Replay Rate
Loop Rate
Average Watch Time
Total Watch Time
Watch Time %
Audience Retention
Retention Curve
Retention Score
Drop-off Points
Exit Timestamp
Skip Rate
View Velocity
Engaged Views
Sound On %
Mute %
Pause %
Playback Speed
These should only be included when the underlying platform exposes them or when Veefore can derive them reliably. Unsupported metrics should be omitted or clearly labeled as estimates.
Chapter 17 — Story Metrics
Forward Taps
Back Taps
Replies
Exits
Completion Rate
Sticker Taps
Link Clicks
Quiz Responses
Poll Responses
Reaction Distribution
Sticker CTR
Story Retention
Story Engagement
Story Quality Score
Chapter 18 — Publishing Metrics
Publishing Success Rate
Publishing Failure Rate
Retry Rate
Approval Time
Queue Time
Average Delay
API Errors
Publishing SLA
Publishing Health
Calendar Consistency
Missed Schedule
Publishing Streak
Time Saved
Automation Usage
Chapter 19 — Composite Scores
These are Veefore-owned metrics built from multiple underlying signals.
Examples include:
Content Quality Score
Account Health Score
Audience Quality Score
Engagement Quality Score
Brand Health Score
Posting Consistency Score
Campaign Health Score
Automation Health Score
Creator Score
Growth Score
Trend Alignment Score
AI Optimization Score
Platform Health Score
Each composite score must define:
Component metrics and weights.
Score range (e.g., 0–100).
Interpretation guidelines.
Confidence level.
Conditions under which the score should not be displayed.

> TODO (ASI-002, see OPEN_SPEC_ITEMS.md): The required component metrics and
> weights are not yet specified for any composite score. Define them per composite
> (components, weights, range, interpretation bands, confidence, display
> conditions). Until then weights are not invented; the engine computes composites
> only with a caller-supplied weight config (composite.ts). Blocks Phase 5/6/11.