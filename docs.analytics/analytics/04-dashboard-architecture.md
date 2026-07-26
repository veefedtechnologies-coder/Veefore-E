Volume 4 — Analytics Design System & Component Library
Version: 1.0
Objective
Create a reusable analytics design system so every dashboard, report, chart, filter, and widget in Veefore shares the same visual language, interaction patterns, accessibility standards, and implementation approach.
This is not a general app design system. It is dedicated to the Analytics workspace.
Chapter 1 — Design Principles
Every component should be:
Modular
Reusable
Theme-aware (light/dark)
Responsive
Accessible (WCAG 2.2 AA)
Performant
Keyboard navigable
Consistent
Extensible
No page should create custom analytics components unless they are first added to this library.
Chapter 2 — Component Categories
The library is organized into these groups:
Foundation
Typography
Spacing
Grid
Colors
Icons
Motion
Elevation
Borders
Layout
Analytics Shell
Sidebar
Top Navigation
Dashboard Grid
Split Panels
Tabs
Accordions
Drawers
KPI Components
KPI Card
Comparison KPI
Trend KPI
Forecast KPI
Benchmark KPI
Progress KPI
Charts
Chart Container
Line Chart
Area Chart
Bar Chart
Stacked Bar
Pie / Donut
Radar
Scatter
Bubble
Heatmap
Calendar Heatmap
Funnel
Treemap
Sankey
Cohort
Retention Curve
Geo Map
Word Cloud
Data Display
Tables
Metric Lists
Comparison Tables
Pivot Tables
Timeline
Activity Feed
Filters
Date Picker
Platform Selector
Account Selector
Multi-select
Search Filter
Saved Filters
Filter Chips
AI Components
AI Executive Summary
AI Insight Card
Recommendation Card
Forecast Card
Opportunity Card
Risk Card
Confidence Badge
Status Components
Alert Banner
Success Notice
Warning Notice
Empty State
Error State
Loading Skeleton
Refresh Indicator
Actions
Export Menu
Share Dialog
Save View
Schedule Report
Compare Period
Drill-down Button
Chapter 3 — KPI Card Standard
Every KPI card should expose:
Metric title
Current value
Previous value
Absolute change
Percentage change
Trend arrow
Mini sparkline
Benchmark badge
AI status
Last refresh time
Drill-down action
Favorite / Pin action
States:
Normal
Hover
Selected
Loading
Error
No data
Chapter 4 — Chart Container
Every chart lives inside a standard container with:
Title
Description
Metric selector
Time selector
Comparison toggle
Export
Fullscreen
Refresh
AI explain
Last updated
Loading state
Empty state
The chart itself should never be rendered without this wrapper.
Chapter 5 — Filter Bar
The global filter bar includes:
Workspace
Platform
Account
Date range
Comparison period
Campaign
Content type
Tags
Geography
Audience
Saved views
Rules:
Global filters update all widgets.
Local filters affect only one widget.
Active filters are always visible.
Users can clear all filters in one action.
Chapter 6 — AI Components
Every AI insight card contains:
Insight title
Plain-language explanation
Confidence score
Supporting metrics
Suggested actions
Impact estimate
Timestamp
"Learn more" action
Do not present AI recommendations without supporting evidence.
Chapter 7 — Table Standards
Enterprise tables should support:
Sticky header
Sticky first column
Column resize
Column reorder
Hide/show columns
Sorting
Multi-sort
Search
Filters
Virtual scrolling
Keyboard navigation
Export selected rows
Chapter 8 — Empty States
Never show a blank page.
Depending on context, provide:
Setup instructions
Sample visualization
Educational tips
Benchmark examples
Suggested next actions
Retry button
Chapter 9 — Motion Guidelines
Animations should be purposeful:
KPI value transitions
Chart redraws
Filter changes
Expand/collapse
Drawer open/close
Avoid distracting or decorative motion.
Chapter 10 — Accessibility
Every component must:
Support keyboard navigation.
Have proper ARIA labels.
Meet contrast requirements.
Not rely on color alone.
Respect reduced-motion preferences.
Provide meaningful focus states.