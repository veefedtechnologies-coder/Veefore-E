Volume 5 — Dashboard & Widget Specification
Version: 1.0
Objective
Define every reusable analytics widget available in Veefore, including its purpose, data requirements, interactions, states, and placement rules.
A widget is the smallest reusable analytics building block.
Chapter 1 — Widget Architecture
Every widget follows the same lifecycle:
Data Source
        ↓
Metric Engine
        ↓
Transformation Layer
        ↓
Visualization Layer
        ↓
Interaction Layer
        ↓
AI Layer
        ↓
Export Layer
Widgets never call platform APIs directly.
Chapter 2 — Universal Widget Specification
Every widget must be documented using this template.
Widget ID:
Widget Name:
Category:
Purpose:

Supported Metrics:

Supported Platforms:

Supported Filters:

Required Dimensions:

Optional Dimensions:

Visualization Type:

Default Size:

Resizable:

Drill Down:

Cross Filtering:

Supports Comparison:

Supports Forecast:

Supports Benchmarks:

Supports AI Summary:

Supports Export:

Loading State:

Empty State:

Error State:

Refresh Behaviour:

Accessibility:

Performance Budget:

Dependencies:

Related Widgets:

Version:
Every widget in the system must conform to this schema.
Chapter 3 — KPI Widget Family
The KPI family is used for headline metrics.
1. Standard KPI Card
Displays:
Current value
Previous value
Delta
Percentage change
Sparkline
Trend arrow
Last updated
Used for:
Followers
Reach
Engagement
Revenue
2. Forecast KPI
Adds:
Prediction
Confidence interval
Forecast graph
Growth probability
3. Benchmark KPI
Adds:
Industry average
Competitor average
Historical average
Target comparison
4. Goal KPI
Displays:
Goal
Current progress
Remaining amount
Estimated completion date
5. Health KPI
Uses a score (0–100) with status:
Excellent
Good
Fair
Poor
Critical
Examples:
Account Health
Audience Quality
Automation Health
Chapter 4 — Executive Widgets
Designed for business owners and managers.
Examples:
Executive Summary
AI-generated narrative with:
Highlights
Risks
Opportunities
Recommendations
Business Health
Overall business score with contributing factors.
Weekly Snapshot
Key changes over the selected period.
Goal Progress
Tracks progress toward strategic KPIs.
Forecast Panel
Projects future trends with confidence ranges.
Chapter 5 — Trend Widgets
Designed to show change over time.
Examples:
Line Trend
Multi-line Comparison
Area Trend
Stacked Area
Moving Average
Growth Velocity
Rolling Average
Seasonal Trend
Interactions:
Zoom
Hover
Compare
Annotate
Export
Chapter 6 — Distribution Widgets
Show composition.
Examples:
Donut
Pie
Treemap
Sunburst
Stacked Bar
100% Stacked Bar
Use cases:
Audience demographics
Device split
Platform mix
Content mix
Chapter 7 — Performance Widgets
Examples:
Top Posts
Lowest Posts
Best Reels
Worst Stories
Fastest Growing Campaign
Highest ROI Campaign
Most Saved Post
Most Shared Reel
Most Commented Post
These widgets support:
Sorting
Filters
Drill-down
Quick actions
Chapter 8 — Geographic Widgets
Examples:
World Map
Country Map
State Map
City Distribution
Heat Density
Regional Comparison
Audience Distribution
Reach Distribution
Chapter 9 — Time Widgets
Examples:
Hourly Heatmap
Daily Heatmap
Weekly Calendar
Monthly Calendar
Posting Calendar
Engagement Calendar
Activity Timeline
Publishing Timeline
These reveal temporal patterns rather than totals.
Chapter 10 — Funnel Widgets
Examples:
Reach → Profile Visit → Website Click → Lead → Conversion
Story View → Link Click → Purchase
Campaign Funnel
Follower Journey
Lead Funnel
Each stage includes:
Count
Conversion %
Drop-off
Benchmark
Chapter 11 — Cohort Widgets
Track user groups over time.
Examples:
Follower retention by acquisition month.
Campaign retention.
Returning viewers.
Repeat engagement.
Used primarily for long-term trend analysis.
Chapter 12 — Correlation Widgets
Help explain relationships.
Examples:
Posting frequency vs engagement.
Caption length vs saves.
Posting time vs reach.
Hashtag count vs impressions.
Video duration vs watch time.
These should clearly state that correlation does not imply causation.
Chapter 13 — AI Widgets
These are Veefore-specific differentiators.
AI Executive Summary
Natural-language overview.
Opportunity Detector
Identifies areas with high improvement potential.
Risk Detector
Flags concerning trends.
Content Coach
Analyzes top-performing content and recommends improvements.
Audience Shift
Explains changes in audience composition.
Trend Predictor
Forecasts emerging topics or growth patterns.
Each AI widget must:
Show evidence.
Provide a confidence score.
Link to supporting metrics.
Chapter 14 — Benchmark Widgets
Compare performance against:
Previous period
Previous year
Goals
Industry average
Competitors
Similar accounts (if data is available)
Examples:
Benchmark Scorecard
Competitive Ranking
Gap Analysis
Share of Voice
Chapter 15 — Alert Widgets
Surface important changes.
Examples:
Reach spike.
Engagement drop.
Publishing failure.
Campaign over budget.
Audience churn increase.
Competitor surge.
Each alert includes:
Severity
Cause
Suggested action
Dismiss/Snooze
Chapter 16 — Widget Interactions
Every widget should support:
Hover details
Drill-down
Cross-filtering
Fullscreen
Export (PNG, CSV, PDF where appropriate)
Pin to dashboard
Duplicate
Share
Add note
AI explanation
Interaction patterns must remain consistent across all widget types.
Chapter 17 — Widget Performance
Targets:
Lazy-load below-the-fold widgets.
Cache reusable data requests.
Re-render only affected widgets after filter changes.
Support virtualization for large datasets.
Keep interactions responsive on modern desktop and tablet devices.
Chapter 18 — Widget Marketplace (Future)
A future extension where users can:
Browse available widgets.
Install new widget packs.
Save custom widget templates.
Share widgets within organizations.
Build custom dashboards from reusable components.