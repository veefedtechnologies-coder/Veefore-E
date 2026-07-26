Volume 9 — Dashboard Data Contracts
Version: 1.0
Purpose
Define the exact data contract between the backend and frontend for every analytics dashboard.
This volume specifies:
Response structure
Widget mapping
Required fields
Optional fields
Loading priorities
Partial-data behavior
Error behavior
Versioning
The frontend should be able to build every analytics page using only these contracts.
Chapter 1 — API Response Philosophy
Every dashboard response follows the same envelope.
{
  "meta": {
    "requestId": "...",
    "generatedAt": "...",
    "lastRefresh": "...",
    "workspaceId": "...",
    "platforms": [],
    "comparison": {},
    "partialData": false,
    "warnings": []
  },
  "summary": {},
  "widgets": [],
  "alerts": [],
  "recommendations": [],
  "forecast": {}
}
This structure remains consistent across all dashboards.
Chapter 2 — Metadata Block
The metadata object contains:
Request ID
Workspace ID
Dashboard version
Data freshness timestamp
Active filters
Comparison period
Partial data flag
API version
Data quality status
The frontend uses this information for banners, refresh indicators, and diagnostics.
Chapter 3 — Widget Contract
Every widget response shares a common shape.
Fields include:
Widget ID
Widget type
Title
Subtitle
Metric IDs
Current values
Previous values
Benchmark values
Forecast values (if applicable)
Loading state
Error state
Last updated
Drill-down target
AI explanation reference
This allows the frontend to render different widgets consistently.
Chapter 4 — KPI Contract
Each KPI response should include:
Current value
Previous value
Absolute change
Percentage change
Trend direction
Sparkline data
Benchmark
Goal progress (optional)
Forecast (optional)
Confidence level
Last updated
The frontend should never calculate these values itself.
Chapter 5 — Chart Contract
Charts receive:
Series definitions
Labels
Units
Time granularity
Data points
Comparison series
Thresholds
Annotations
Benchmarks
Forecast overlay (optional)
Charts remain presentation-agnostic so the frontend can choose the appropriate visualization.
Chapter 6 — Table Contract
Every analytics table includes:
Column definitions
Row data
Pagination metadata
Sort options
Available filters
Hidden columns
Export fields
Support large datasets through server-side pagination.
Chapter 7 — AI Insight Contract
Every AI insight returns:
Insight ID
Title
Explanation
Confidence score
Severity
Supporting metric IDs
Supporting widget IDs
Suggested actions
Related dashboard links
Timestamp
AI never returns unsupported claims without linking to evidence.
Chapter 8 — Alert Contract
Each alert includes:
Alert ID
Category
Severity
Trigger
Description
Suggested action
Related dashboard
Status
Created time
Resolved time (if applicable)
Chapter 9 — Recommendation Contract
Recommendations include:
Recommendation ID
Title
Explanation
Estimated impact
Difficulty
Confidence
Supporting evidence
Recommended next action
These contracts are shared across AI Insights, Executive Summary, and Content Coaching.
Chapter 10 — Partial Data Handling
Dashboards must remain usable even when some data is unavailable.
Examples:
A platform sync is delayed.
A permission is missing.
A connector is temporarily unavailable.
The response should identify which widgets are affected so the frontend can show partial results instead of failing the whole page.
Chapter 11 — Loading Priorities
Return data in priority order.
Priority 1:
KPI strip
Executive summary
Priority 2:
Primary charts
Priority 3:
Tables
Supporting widgets
Priority 4:
AI recommendations
Forecasts
This enables progressive rendering.
Chapter 12 — Versioning
Every contract should include:
Contract version
Dashboard version
Widget version
Older clients should continue functioning during gradual upgrades.
Chapter 13 — Backward Compatibility
Rules:
Never remove existing fields without a new version.
New optional fields are acceptable.
Required field changes require versioning.
Document deprecated fields before removal.