# Changelog

## Version 1.0

Created

- Product Foundation
- Metrics Dictionary
- Design System

---

## Version 1.1

Added

- Competitor Dashboard

Updated

- Audience Metrics

Fixed

- Engagement Formula

---

## Version 1.2

Added

- AI Forecast

Improved

- Dashboard Performance

Deprecated

- Old KPI Layout

---

## Version 1.3

Added

- Analytics Workspace Foundation (Phase 1): enterprise analytics shell, config-driven sidebar navigation, breadcrumb, workspace context, responsive layout, and client-side routing for all `/analytics/*` sections.
- Reusable analytics state components (loading, empty, error, no-workspace, coming-soon).

Changed

- `/analytics` now renders the new enterprise Analytics workspace (`client/src/features/analytics`). The legacy mock dashboard (`components/analytics/analytics-dashboard.tsx`) remains on disk (replace-alongside) and will be retired as later phases port its functionality.

---

## Version 1.4

Added

- Metric Engine (Phase 2): backend metric definition + calculation layer at `server/features/analytics/metrics`.
  - Metric models (Universal Metric Structure), permanent Metric IDs (`MTR-NNNNNN`), and a metric registry (single source of truth for ~43 metrics across account, audience, reach, impression, engagement, video, publishing, and composite categories).
  - Pure, tested calculation functions for all documented calculated-metric formulas, plus a composite-score framework (normalization + weighted aggregation).
  - `MetricEngine` that computes raw/calculated metric values with full provenance (data-quality label + lineage) and never fabricates values (returns `null` when not derivable).
  - 46 unit tests (calculations, composite, engine, registry integrity).

Flagged (pending documentation)

- Metric ID anchors conflict between dictionary Ch 5 (examples) and Ch 12 (definitions); Ch 12 treated as authoritative, all IDs centralized in `metric-ids.ts` for easy re-mapping.
- Composite score component weights and numeric benchmark ranges are not specified in the docs and are therefore not invented; the engine supports them once defined.

---

## Version 1.5

Added

- Analytics Design System (Phase 3): the dedicated, reusable analytics component library at `client/src/features/analytics/design-system`.
  - Foundation: design tokens (chart palette, rating/quality/trend semantics, surfaces, focus ring, axis colours), unit-aware formatting utilities, shared types, and date-range presets.
  - KPI: `KpiCard` (+ grid) with trend indicator, sparkline, data-quality badge, benchmark rating badge, and full states (normal/hover/selected/loading/error/no-data).
  - Charts: `ChartContainer` wrapper plus theme-aware `TimeSeriesChart` (line/area) and `CategoryBarChart` with unit-aware tooltips.
  - Tables: accessible `DataTable` (sticky header, sortable columns — client or controlled, loading/empty states, row drill-down).
  - Filters: `FilterBar`, `FilterSelect`, `FilterMultiSelect`, `FilterChips`, `DateRangeSelect`.
  - Modals: `AnalyticsModal` (sizes, header/body/footer) on the shared Dialog primitive.
  - Skeletons: KPI card, chart, table, and filter-bar loading placeholders.
  - 14 unit tests for the pure formatting utilities.

Notes

- Components are presentation-only and display backend-provided values (CODING_RULES Rule 9); they do not compute metrics.
- Benchmark rating and composite/health widgets remain gated on OPEN_SPEC_ITEMS ASI-002/ASI-003.

---

## Version 1.6

Added

- Dashboard Framework (Phase 4): the standardized dashboard composition and navigation layer at `client/src/features/analytics/dashboard`.
  - `Dashboard` — renders content slots in the fixed documented order (Filters → AI Summary → KPIs → Primary Charts → Secondary Charts → Tables → Recommendations → Alerts → Export), composed over the page header/breadcrumb container.
  - `DashboardGrid` / `DashboardGridItem` — responsive 12-column grid (single column below `lg`) with static, compiler-safe column spans.
  - `DashboardSection` — accessible region wrapper with consistent spacing.
  - Drill-down navigation: `useAnalyticsNavigation` (client-side navigate, path builder, content drill-down) and `DrillDownLink` (accessible anchor with modifier-click support) for progressive exploration.

Notes

- Framework only; individual dashboards are built in Phase 6. Slots manage their own loading/empty/error states (Rule 13); the framework never reorders sections (Rule 6).
- Dashboard personalization (rearrange/resize/pin/save layouts) and table virtualization remain scheduled for later phases.

---

## Version 1.7

Added

- Widget Library (Phase 5): reusable analytics widgets at `client/src/features/analytics/widgets`, built on the design system (Phase 3) and dashboard framework (Phase 4).
  - Framework: `WidgetFrame` (consistent header, data-quality badge, actions menu, and all documented states — loading/refreshing/empty/error/partial) and `WidgetActionsMenu` (refresh/export/AI-explain/fullscreen/drill-down).
  - KPI family: `ForecastKpiWidget`, `BenchmarkKpiWidget`, `GoalKpiWidget`, `HealthKpiWidget` (standard KPI = design-system `KpiCard`), plus `ConfidenceBadge`.
  - Charts/distribution: `TrendWidget` (line/area), `DistributionWidget` (donut + legend).
  - Performance/time/funnel: `TopPerformersWidget`, `HeatmapWidget`, `FunnelWidget`.
  - AI: `AISummaryWidget`, `AIInsightWidget` — both show confidence and link to supporting evidence (Rule 16).
  - Alerts: `AlertWidget`, `AlertsWidget` (severity + cause + suggested action, colour paired with icon/text).
  - 4 unit tests for the pure display utilities (progress fraction, heatmap intensity).

Notes

- Widgets are presentation-only and consume contract-shaped data (Rule 9); real data binding arrives with the dashboard/data-contract phases.
- Health/benchmark widgets render backend-provided scores/bands but their thresholds/weights remain gated on OPEN_SPEC_ITEMS ASI-002/ASI-003.

---

## Version 1.8

Added

- Dashboard Specifications (Phase 6, in progress): concrete dashboards at `client/src/features/analytics/dashboards`.
  - `OverviewDashboard` — the flagship home dashboard assembled per 06-dashboard-specifications.md Ch 2 using the dashboard framework (Phase 4) and widget library (Phase 5): filters, AI executive summary, 12-KPI strip, performance timeline, audience/content snapshots, competitor snapshot table, recommendations, and alerts — all in the fixed documented order (Rule 6).
  - `useDashboardData` — the single data seam every dashboard reads from; a typed stub until the dashboard API/contracts land (Phases 8–9), so widgets render empty states with no fabricated values (Rule 16).
  - `/analytics` (Overview) now renders `OverviewDashboard`; the Phase-1 Overview scaffold was removed (superseded).

Notes

- The remaining dashboards (Executive, Audience, Reach, Engagement, Content, Publishing, Competitors, Campaigns, AI Insights, Reports) follow the same pattern and currently route to the foundation placeholder; recommended to build them together with the data layer to avoid shipping empty shells.

---

## Version 1.9

Added

- Data & Event Architecture (Phase 7): the normalized-event + rollup pipeline at `server/features/analytics/{events,aggregation,pipeline}` (ADR-004; 07-data-event-architecture.md).
  - Events: `AnalyticsEvent` envelope, `domain.action.object` name catalog + format validator, `normalizeEvent` (defaults + UTC timestamps), stable de-dupe keys, and `validateEvent` (schema, timestamp skew, ownership, payload).
  - Aggregation: `rollupEvents` producing multi-granularity rollups (hourly/daily/weekly/monthly/lifetime) with per-metric reduction driven by the Phase 2 metric registry (followers=latest, likes=sum, …) and UTC-aligned period bucketing.
  - Pipeline: `AnalyticsPipeline` orchestrating normalize → validate → de-duplicate → persist → aggregate over injected storage/logging ports (`EventStore`, `RollupStore`, `PipelineLogger`).
  - 17 unit tests (events, aggregation, pipeline) using in-memory fakes.

Notes

- Pure logic + ports; MongoDB implementations of the ports are wired in Phase 10. No platform APIs are called in the pipeline (connectors remain upstream, Rule 10).

---

## Version 2.0

Added

- Backend Analytics API (Phase 8): dashboard-oriented endpoints at `server/features/analytics/api` (ADR-003; 08-backend-api-architecture.md).
  - Contracts: the shared response envelope (`meta`/`summary`/`kpis`/`widgets`/`alerts`/`recommendations`/`forecast`) and KPI/alert/recommendation contracts (09-data-contracts.md).
  - Query model: consistent zod-validated query (date range, comparison, platforms, accounts, granularity, pagination).
  - `DashboardService` — assembles a dashboard envelope by reading rollups (via `RollupReadStore`) and computing KPI values + deltas with the Phase 2 metric engine (backend-only computation, Rule 9). Empty read store → well-formed empty envelope (`partialData: true`), never fabricated (Rule 16).
  - Caching: `AnalyticsCache` port + `InMemoryTtlCache` with workspace-prefixed keys and post-sync invalidation (Ch 6).
  - Routes: `GET /api/v1/analytics/dashboards/:dashboardId`, versioned, authenticated (`requireAuth`) and authorized (`validateWorkspaceAccess`), cache-aware, structured errors with correlation ids. Mounted additively in `server/routes/v1/analytics.routes.ts`.
  - Background jobs: `runAnalyticsJob` dispatcher with `aggregation_refresh` (ingest + aggregate via the pipeline, then invalidate cache) and `cache_invalidation` handlers; forecast/report/benchmark handlers land in their phases.
  - 10 unit tests (query, cache, dashboard service, jobs); 73 analytics server tests passing overall.

Notes

- Read store defaults to empty until the MongoDB implementation lands in Phase 10; the endpoint is live and returns a valid (empty) envelope now. The client data seam (`useDashboardData`) targets this endpoint in Phase 9.

---

## Version 2.1

Added

- Data Contracts (Phase 9): the frontend is now wired to the dashboard API (09-data-contracts.md).
  - Client contract mirror (`dashboards/contracts.ts`) of the server response envelope (meta/summary/kpis/widgets/alerts/recommendations).
  - `useDashboardData` now fetches `GET /api/v1/analytics/dashboards/:dashboardId` via React Query + the shared authenticated `apiRequest`, scoped to the current workspace and filters, and maps the response to a normalized status (loading/ready/partial/empty/error) with refresh support.
  - `resolveDateRange` converts date-range presets into concrete analysis + comparison windows (UTC) for the query.
  - `OverviewDashboard` now consumes live data: KPI cards render from the backend KPI contracts (values, deltas, trend, data-quality all backend-computed, Rule 9); filters (date range, platforms) drive the request; last-refresh and retry are wired through widgets.
  - 4 unit tests for date-range resolution; 22 client analytics tests passing.

Notes

- The endpoint currently returns an empty envelope until the MongoDB rollup store lands (Phase 10); the Overview therefore shows populated structure with empty widget states — the full data path (event → rollup → API → contract → widget) is otherwise complete end to end.

---

## Version 2.2

Added

- Database Architecture (Phase 10): MongoDB collections, indexes, and port wiring at `server/features/analytics/db` (10-database-architecture.md; ADR-002/004).
  - `AnalyticsEvent` model — normalized event store with a unique `dedupeKey` index (idempotent ingestion) and workspace/platform/account/time/event-name indexes.
  - `MetricRollup` model — multi-granularity rollups with a unique (workspace, platform, account, granularity, periodStart) index for idempotent upserts, plus a workspace/granularity/period read index.
  - Port implementations: `MongoEventStore` (race-safe upsert dedup), `MongoRollupStore` (idempotent upsert), `MongoRollupReadStore` (workspace/granularity/range reads).
  - Wiring: the analytics ingestion pipeline and dashboard service are now bound to the Mongo stores; `GET /api/v1/analytics/dashboards/:dashboardId` reads real rollups (Mongo-backed service mounted at the route layer to avoid an api↔db import cycle).

Notes

- Rollup upsert REPLACES a bucket's values, so aggregation jobs must recompute a bucket from its full event set (documented recompute model, ADR-004) — not partial batches.
- DB adapters are thin I/O over Mongoose and are covered by type-checking; full integration tests require a Mongo test harness (not configured for this module). Analytics suite: 95 tests passing.
- The full path is now live end to end: event → normalize/validate → rollup → Mongo → dashboard API + metric engine → contract → widgets. Data appears once connectors emit analytics events into the pipeline.

---

## Version 2.3

Added

- AI Intelligence Engine (Phase 11): deterministic, evidence-based intelligence at `server/features/analytics/ai` (11-ai-intelligence-engine.md).
  - Confidence system deriving Very High/High/Medium/Low from sample size, model fit, and data provenance — never arbitrary (Ch 13).
  - Forecasting via ordinary least-squares linear regression with 95% prediction intervals, confidence, and stated assumptions; clearly labelled predictions, not facts (Ch 6, 15).
  - Signal detection: trend (direction, slope, % change) and z-score anomaly detection (Ch 2).
  - Root-cause analysis ranking same-direction contributing factors with an explicit correlation-not-causation caveat (Ch 4, 15).
  - Recommendation engine turning confident trends into actionable, evidence-backed recommendations (Ch 5).
  - Executive summary assembling a grounded narrative (biggest win, biggest concern, suggested priority) with confidence + supporting metrics (Ch 3).
  - `AIIntelligenceEngine` orchestrator over metric series; consumes metrics only, never platform APIs (Ch 1). 13 unit tests; full analytics suite 108 passing.

Notes

- The engine is deterministic and testable (no LLM), so it can never invent figures (Rule 16); a natural-language LLM layer can wrap it later. It powers the dashboard `summary`/`recommendations`/`forecast` envelope fields once wired into the dashboard service.
- Composite/health scoring and benchmark ratings remain gated on OPEN_SPEC_ITEMS ASI-002/ASI-003.

---

## Version 2.4

Added

- Remaining dashboards (Phase 6 completion): all 11 documented dashboards are now built and routable (06-dashboard-specifications.md).
  - Config-driven renderer `DashboardPage` powers every section dashboard from a declarative `DashboardPageConfig` (DRY — one component, Rule 3/4), assembling the fixed documented section order (Rule 6) and reading live data via the Phase 9 seam.
  - Configs added for Executive, Audience, Reach, Engagement, Content, Publishing, Competitors, Campaigns, AI Insights, and Reports.
  - Navigation: each section dashboard is reachable via an injected "Overview" landing route (`/analytics/<section>`); Executive uses the existing `/analytics/executive`. Deep-dive items remain placeholder pages for later.
  - Routing: `AnalyticsApp` maps dashboard paths to `DashboardPage` (Overview keeps its bespoke component).
  - Backend: `dashboard-specs` registers all 11 dashboard ids with registry-defined KPI keys (business/AI/reports dashboards intentionally have no KPI strip until their metrics are defined — OPEN_SPEC_ITEMS). Every KPI key is validated against the metric registry by a new integrity test.
  - Tests: dashboard-spec integrity (KPI keys are registered; every dashboard builds a valid envelope). Analytics suite: 110 passing.

Notes

- Dashboards render live data where the backend provides it (Overview/Executive/Audience/Reach/Engagement/Content/Publishing) and documented empty states elsewhere; no values are fabricated (Rule 16). Data populates once connectors emit events into the pipeline.

---

## Version 2.5

Changed

- Simplified the Analytics sidebar to a lean, flat list of only the dashboards that are actually implemented and metric-backed: Overview, Executive, Audience, Reach, Engagement, Content, Publishing.
- Removed the large tree of "coming soon" deep-dive sub-items (Growth/Demographics/Geography/…) and sections that are either not yet data-backed or already exist elsewhere in the app: Accounts, Growth, AI Insights, Content Intelligence, Competitors, Social Listening, ROI & Revenue, Campaigns, Reports, Dashboard Builder, Alerts, Settings.
- Sidebar is now a flat, icon-led link list (no collapsible groups, no placeholder pages); every entry routes to a working dashboard (CODING_RULES Rule 16).
- Trimmed dashboard configs and server dashboard-specs to the seven implemented dashboards accordingly.

Notes

- Removed dashboards/sections can be reintroduced when their metrics/data exist (see OPEN_SPEC_ITEMS for the gating items). Existing app features (Social Listening, Automation, Accounts) are intentionally not duplicated inside Analytics.

---

## Version 2.6

Added

- Real data in the analytics dashboards via a legacy data bridge (`server/features/analytics/bridge`).
  - `LegacyRollupReadStore` serves the new dashboard API from the app's EXISTING analytics data (`AnalyticsService.getAggregatedMetrics` / `getDailyMetrics`), mapping legacy fields → canonical metric keys, so KPIs (Followers, Reach, Engagement Rate, Likes/Comments/Shares, Follower Growth, Published Posts, etc.) show real numbers today.
  - Dashboard API now returns a `timeseries` widget (daily points) so the primary performance chart renders real data; added `SeriesReadStore`, `TimeseriesWidgetData`, and `seriesKeys` to dashboard specs.
  - The `/api/v1/analytics/dashboards/:id` route is served by the legacy-backed dashboard service; the Overview and all section dashboards consume KPIs + the timeline chart from the live contract.
  - New test: the dashboard service emits a timeseries widget from a series provider.

Notes

- This is an interim bridge to the app's current analytics store; when platform connectors emit events into the new pipeline, switch the route to the Mongo rollup store with no client/API changes.
- Metrics the legacy store does not track (impressions, profile visits, saves, completion rate, publishing failures, etc.) render "—" rather than fabricated values (CODING_RULES Rule 16). Values appear for workspaces whose connected accounts have synced analytics.

---

## Version 2.7

Added

- More real data across the analytics dashboards, wiring the remaining populated widgets end-to-end:
  - **AI Executive Summary + Recommended actions** now come from the deterministic AI engine (Phase 11) run over the workspace's own daily series. `DashboardService` calls `aiIntelligenceEngine.analyze()` and returns a grounded `summary` + `recommendations`; the client renders recommendations as `AIInsightWidget` cards (each with its confidence + supporting metric IDs, Rule 16) instead of an empty placeholder.
  - **Audience by country** (`distribution` widget) served from the latest analytics snapshot (`AnalyticsService.getLatestAnalytics` → `audienceCountry`) via a new `AudienceProvider`.
  - **Top performing content** (`toplist` widget) served from the `Content` collection (top published posts by reach + engagement) via a new `ContentProvider`.
  - Aggregated **impressions** now feed `impressions_total` from published-content metrics.

Changed

- Added `DistributionWidgetData` / `TopListWidgetData` contracts, `audienceWidget` / `topContentWidget` spec flags (Overview: both; Audience: distribution; Executive/Engagement/Content: top content), and `AudienceProvider` / `ContentProvider` ports.
- `LegacyRollupReadStore` now implements the audience + content providers; `legacyDashboardService` composes all four seams.
- Client `contracts.ts` gained `getDistributionWidget`, `getTopListWidget`, and `getRecommendationInsights` helpers; `OverviewDashboard` and the config-driven `DashboardPage` render distribution/top-list/recommendations from live contract data, falling back to empty states when a widget has no data.

Notes

- Metrics still not tracked by the legacy store (profile visits, website clicks, saves, completion rate, publishing failures) continue to render "—" (Rule 16). No values are fabricated; empty widgets keep their documented empty states.
- All 111 analytics tests pass; no TypeScript errors in `features/analytics`.

---

## Version 2.8

Fixed

- **Published Posts KPI was massively inflated** (e.g. 364 for a workspace with ~10 posts). The legacy aggregation summed the per-day snapshot `posts` counter across every day in the window, double-counting the cumulative total. `LegacyRollupReadStore` now derives `published_posts` from a real `Content` document count (published posts in the selected window, falling back to total published when `publishedAt` is absent).

Changed

- Top performing content no longer requires non-zero synced metrics to appear — real published posts now surface (ranked by reach + engagement, then recency), so the widget reflects the workspace's actual content instead of showing empty when metrics haven't synced yet.

Notes

- Impressions, profile visits, website clicks, saves, and publishing success/failure remain "—" until the platform sync populates those fields — still not fabricated (Rule 16).

---

## Version 2.9

Fixed

- **Engagement Rate showed 0%** even though individual posts had real interactions. The daily analytics snapshot doesn't aggregate per-post engagement, so `LegacyRollupReadStore` now sums real `likes`/`comments`/`shares`/`saves` (and impressions + reach) from the `Content` collection over the window. `total_engagements` and `engagement_rate_by_reach` now compute from real data.
- **Publishing Success Rate showed "No data".** The bridge now provides `failed_posts` (count of `failed` content in the window) alongside `published_posts`, so the metric engine computes the real success rate.

Changed

- Removed the **Competitor snapshot** table from the Overview dashboard — the app has no competitor data feed in the analytics context, so it was a permanently-empty panel (CODING_RULES Rule 16; only surface what's backed by real data).
- Removed **Profile Visits** and **Website Clicks** from the Overview KPI strip — no field for them exists anywhere in the current data model (legacy `Analytics`, `SocialAccount`, or `Content`), so they could never populate. They remain documented in the metrics dictionary and can be re-added once the platform sync captures them.
- Aligned the Overview loading-skeleton KPI list (`overview.config.ts`) with the seven real KPIs (removed aspirational placeholders: conversions, revenue, response time, automation success, campaign ROI).
- Consolidated the content aggregation into a single `aggregatePublishedContent` pass (count + engagement + reach + impressions) with a window-then-all-time fallback.

Notes

- Remaining metrics without a data source (profile visits, website clicks, completion rate, average watch time) are simply not shown rather than displayed empty — nothing is fabricated (Rule 16).
- All 111 analytics tests pass; no TypeScript errors in `features/analytics`. Requires a server restart to take effect.

---

## Version 3.0

Added

- **AI Insights dashboard** re-added to the Analytics sidebar (`/analytics/insights`, Sparkles icon). Unlike the other removed sections, this one is fully backed by real data via the Phase 11 AI intelligence engine, so its widgets work with live data:
  - AI Executive Summary (grounded in the workspace's own daily series, with confidence).
  - Recommended actions rendered as `AIInsightWidget` cards (each with confidence + supporting metric IDs, Rule 16).
  - KPI strip (Followers, Reach, Engagement Rate, Total Engagements), performance timeline, audience-by-country distribution, top performing content, and alerts — all from the live dashboard contract.
- Wired end-to-end: nav item (`config/navigation.ts`), client config + path map (`dashboards/configs.ts`), and server dashboard spec (`api/dashboard-specs.ts` — `seriesKeys`, `audienceWidget`, `topContentWidget`). No API changes were needed; the config-driven `DashboardPage` renders it.

Notes

- Only the AI Insights section was restored because it is the one previously-removed item genuinely backed by real data and rich in working widgets. Sections without a data source or that duplicate existing app features (Competitors, Campaigns, Reports, ROI, Social Listening, Accounts, Dashboard Builder, Settings) remain out per CODING_RULES Rule 16.
- All 111 analytics tests pass; no TypeScript errors in `features/analytics`.

---

## Version 3.1

Fixed

- **Reach dashboard only populated the Reach card.** Organic Reach, Paid Reach, and "Reach by source" require a paid/organic split (ads data) the app doesn't collect, and Average Frequency needs impressions we don't have — so they were permanently empty. Reworked the Reach dashboard to the metrics that are actually backed:
  - **Reach** (verified), **Reach Efficiency** (reach ÷ followers), and **Reach Velocity** (reach gained ÷ hours) — all compute from real data and now show values.
  - Kept **Impressions** (fills when the platform sync captures post impressions).
  - Removed Organic Reach, Paid Reach, Average Frequency, and the "Reach by source" distribution (no data source; CODING_RULES Rule 16).

Changed

- Updated the Reach dashboard spec (`api/dashboard-specs.ts`) and client config (`dashboards/configs.ts`) accordingly; description now reflects "how far content travels and how efficiently it reaches people" instead of an organic/paid framing we can't back.

Notes

- All 111 analytics tests pass; no TypeScript errors in `features/analytics`. Requires a server restart to take effect.

---

## Version 3.2

Fixed

- **Reach KPI (413) and the "Reach over time" chart (510) disagreed.** They were reading two different Instagram reach fields: the KPI used the 28-day reach snapshot (`reachDays28`), while the chart summed the per-day account `reach` snapshot (which also double-counts when a day has multiple syncs). A chart point exceeding the period total looked broken.
- The bridge now builds the daily reach series and the Reach KPI from the **same** source: a per-day aggregation of `reachDays28` (deduped with `$last` per day; falls back to the account `reach` snapshot). The KPI is the latest point of the exact series the chart plots, so the two can never disagree — for any date range.

Changed

- `LegacyRollupReadStore` reads the daily series directly from the `Analytics` collection (snapshot fields deduped per day with `$last`, flow fields summed) instead of the shared `getDailyMetrics` (which summed the reach snapshot and inflated it). Reach in `getRollups` is now derived from that series' latest value.

Notes

- This also makes the Overview performance chart's reach line consistent with the Overview Reach KPI.
- All 111 analytics tests pass; no TypeScript errors in `features/analytics`. Requires a server restart to take effect.

---

## Version 3.3

Fixed

- **Time filter didn't change Reach or Followers.**
  - **Reach** was pinned to the 28-day snapshot (a regression), so a 7-day filter still showed the 28-day number. Reach now picks the Instagram reach snapshot that matches the selected window — day (≤1.5d), week (≤7.5d), 28-day (≤31d), or total (longer) — for both the KPI and the "Reach over time" chart, so it responds to the filter and the KPI still equals the chart's latest point.
  - **Followers** used the global latest count, so its value and delta never reflected the window. The bridge now reads the follower count **as of the window end** from the daily follower snapshots (`InstagramFollowerSnapshot`), so the period-over-period delta changes with the range (7-day growth vs 30-day growth), and the followers chart is built from the same snapshot history.

Changed

- `LegacyRollupReadStore` now sources followers from `InstagramFollowerSnapshot` (per-account daily history, keyed by `instagramUserId` so it survives reconnects), falling back to the account's current follower count when no snapshot exists. Added `followersAsOf`, `getFollowerDailyMap`, `getIgAccounts`, and window-aware reach field selection (`reachFieldFor`/`reachOf`).

Notes on Instagram follower history (answer to "does Instagram give followers over a period?")

- Instagram's Graph API does **not** return an arbitrary historical follower total. It provides the **current** total (`followers_count`) plus a **daily net-new-followers** insight (`follower_count`, last 30 days only).
- Tools like Hootsuite build a follower trend by **snapshotting the total every day** and storing it — exactly what this app already does via `InstagramFollowerSnapshot`. So follower-over-time works for the period we have snapshots; it cannot be back-filled before snapshotting began (Instagram has no such history to fetch).
- All 111 analytics tests pass; no TypeScript errors in `features/analytics`. Requires a server restart to take effect.

---

## Version 3.4

Fixed / improved

- **Followers period-awareness.** The follower baseline now uses whichever source has data closest to (but not after) the window boundary — the daily `Analytics` followers (the same history that makes Reach respond to the filter) or the per-account `InstagramFollowerSnapshot` history — instead of snapshots only. This gives longer, more accurate history so the period-over-period follower delta actually differs between 7d / 30d / 90d where the data exists.
- **No misleading follower deltas.** When a window has no follower reading on/before its start, the baseline is omitted (no fabricated `0` baseline), so the KPI shows the current count without an invented "+100%" style change (CODING_RULES Rule 16).
- **Net Followers now populates.** `net_followers` falls back to the period delta (`current − previous` followers) when Instagram's gross new/lost split isn't stored — this is the true net change, not a fabricated split — so the Audience dashboard's Net Followers and Follower Growth Rate now reflect the selected period.

Notes / expectation

- The **follower total is point-in-time**: every preset range ends "now", so the headline number (e.g. 454) is the same across ranges by design — exactly like Hootsuite. What changes with the time filter is the **growth** (the delta / net followers / growth rate) and the followers chart's span.
- For ranges longer than the available follower history, growth can't be shown accurately (the data doesn't exist yet); it fills in as daily snapshots accumulate.
- 113 analytics tests pass (added 2 for the `net_followers` fallback); no TypeScript errors in `features/analytics`. Requires a server restart to take effect.

---

## Version 3.5

Changed

- **Followers now use the end-of-window value from genuine data only.** The follower count comes from `Analytics.followers` — the value the sync captures **directly from Instagram** (`followers_count`) each day — taken as the last real reading **inside the selected window**. The derived `InstagramFollowerSnapshot` collection is no longer used by analytics, so nothing is interpolated or carried in from a separate snapshot store (addresses "make sure data is genuine, not from any snapshot").
- Removed the snapshot-backed helpers (`followersAsOf`, `getFollowerDailyMap`, `getIgAccounts`) and the `InstagramFollowerSnapshot` / `SocialAccountRepository` imports from the bridge. Follower KPI, delta, and the followers chart line all derive from the genuine daily `Analytics.followers` capture.

Behavior

- Windows that **end in the past** (e.g. "Yesterday") now show that day's genuine follower count — so the total does change for those ranges.
- Windows that **end today** (Last 7 / 30 / 90 days) all show today's genuine count for the headline total, because that is the real follower number as of the window end — there is only one current total, and showing a different one per range would be fabricated. What changes across these ranges is the **growth/delta** and the **chart span**, both from genuine data.
- When a window has no genuine follower reading, the follower KPI is omitted rather than showing a fabricated value or delta (CODING_RULES Rule 16).

Notes

- Instagram's API does not expose historical follower **totals**; the genuine daily captures in `Analytics.followers` are the real source of truth we have. Growth for ranges older than our captured history can't be shown until more genuine daily data accumulates.
- 113 analytics tests pass; no TypeScript errors in `features/analytics`. Requires a server restart to take effect.

---

## Version 3.6

Changed

- Made the follower period-over-period delta robust: the baseline is now the last genuine `Analytics.followers` reading **on/before the window boundary** (via `followersAsOf`), instead of only readings that fall strictly inside the comparison window. This lets the delta resolve even when the sync skipped days, while staying genuine (Analytics capture only, no snapshot collection, no interpolation).

Notes

- If the follower total/delta still looks the same across ranges, it means the stored genuine follower captures don't vary across those dates yet (the account's follower count has been stable in the captured data, or history is shorter than the range). This is a data-availability reality, not a filter bug — Reach, which does vary in the data, responds to the range.

---

## Version 3.7

Fixed

- **Regression: the follower total could show blank/wrong for accounts without daily follower history.** v3.5 removed the account-level fallback, but some workspaces have their real follower count only on `SocialAccount.followersCount` (the live number the sync writes from Instagram), not in the daily `Analytics.followers` series. Restored it as the **current-value fallback** — used only when the window ends ~now and no daily history exists — so the headline total shows the genuine current number instead of "No data". This is the live Instagram count, not the derived snapshot collection.
- **Deltas now appear for ranges longer than the captured history.** `followersAsOf` falls back to the earliest genuine reading (the count when tracking began) when a range reaches back before our data starts, so e.g. a 30-day range shows real growth-since-tracking-began instead of no delta.

Verified against real data (read-only `scripts/check-follower-history.mjs`)

- Follower history is genuine but **short** (~2 weeks) and low-variance: one workspace went 2→3 followers (Jun 18→20 then flat), another has no daily follower series at all (its total lives on the account record).
- Consequence: the follower **total is a single current number** and legitimately does not differ across now-ending ranges. What changes with the range is the **growth** — now shown correctly where genuine history exists (e.g. 7-day delta +0, 30-day delta +1 / +50% for the 2→3 workspace).

Notes

- 113 analytics tests pass; no TypeScript errors in `features/analytics`. Requires a server restart to take effect.

---

## Version 3.8

Fixed

- **Absurd follower growth (e.g. +15033%, "Net Followers 451") on long ranges.** Root cause found via the real data: the bchg account's daily follower series has an early **bad/initial capture** (Jun 17 = `3`, while the real count is ~454). v3.7's "earliest reading" fallback used that `3` as the 12-month baseline → `454 − 3 = 451` → +15033%.
- Removed that fallback: `followersAsOf` now only uses a genuine reading **on/before** the window boundary and returns null otherwise. Consequences:
  - **Last 7 days** stays correct (baseline lands on a real Jun 24 reading → +0.22%, Net Followers 1).
  - **Last 30 / 90 days / 12 months** now honestly show **no growth delta / "No data"** for Net Followers & Growth Rate, because we genuinely don't have follower history that far back — instead of a fabricated-looking huge percentage (CODING_RULES Rule 16).
- The follower **total** still comes from genuine data (latest daily `Analytics.followers`, or the live `SocialAccount.followersCount`), so it stays correct (454).

Reality (confirmed against the DB)

- The follower **total is a single current number** and does not differ across today-ending ranges — that is correct, not a bug. What varies per range is **growth**, which now shows real, sane values where genuine history exists (7-day) and "No data" where it doesn't (longer ranges), rather than an impossible percentage.

Notes

- 113 analytics tests pass; no TypeScript errors in `features/analytics`. Requires a server restart to take effect.

---

## Version 3.9

Added

- **Followers Gained & Lost (genuine, per-range).** The bridge derives `new_followers` (gained) and `lost_followers` (lost) from day-over-day changes in the genuine daily `Analytics.followers` series, within the selected window. This feeds the Audience dashboard's New Followers, Lost Followers, Net Followers, Follower Growth Rate, Audience Churn, and Audience Retention cards — all real and changing with the range. Instagram doesn't expose the gross new-vs-unfollow split, so this is the honest derivation from the real follower totals we capture (not the snapshot collection, not fabricated).
- **Glitch guard in the derivation:** a daily reading below 10% of the window's max follower count is treated as a bad capture and dropped, so an early bad reading (e.g. `3` for a ~454-follower account) can't turn a data-correction into a huge "gained" number.

Fixed (upstream sync)

- **Bad follower captures are no longer persisted.** `AnalyticsService.recordMetrics` now guards followers like it already guards reach: if a fresh reading is an implausible near-total drop (>80%) from the last known-good count, it keeps the prior value instead of writing the artifact. This prevents future glitches like the Jun 17 `3` from entering the data. (Existing rows can be inspected with `scripts/check-follower-history.mjs`.)

Notes

- Example (bchg): New Followers 1 / Lost Followers 1 for 30 days; New Followers 1 / Lost Followers 0 for 7 days — real, glitch-free, range-dependent.
- 113 analytics tests pass; no new TypeScript errors introduced (pre-existing `AnalyticsService` strict-mode warnings on untouched methods remain; the app runs via `tsx`). Requires a server restart to take effect.

---

## Version 3.10

Root cause (the real one)

- The "+15033%" / wrong follower numbers were **not** a glitch — they were an **account-scoping bug**. The bchg workspace's `analytics` collection contains rows from **two** Instagram accounts: the active **arpit.10** (`17841406961110225`, ~454 followers) and a leftover **rahulc1020** (`17841474747481653`, **3 followers**, one day). The bridge aggregated by `workspaceId` only, so rahulc1020's 3 followers polluted the series → the "3 → 454" jump.

Fixed

- **Scope analytics to the active account(s).** `getDailyReachRows` and `followersAsOf` now filter `Analytics` by the workspace's active Instagram `accountId`s (`SocialAccountRepository.findActiveByWorkspace`). A disconnected/other account's rows no longer contribute to followers, reach, the daily series, the chart, gained/lost, or the AI summary.
- **Reverted the wrong "glitch guard"** in `AnalyticsService.recordMetrics` (it was based on the false glitch premise and would have suppressed genuine follower drops) and **removed the heuristic 10%-of-max filters** in the bridge. Correct scoping makes them unnecessary — the data is now genuinely single-account, no thresholds or fabrication.

Result

- Followers, follower growth, New/Lost/Net Followers, the followers chart, and the AI Executive Summary now reflect only the real active account (arpit.10 ~454, essentially flat) — the impossible +15033% is gone.
- New read-only diagnostic `scripts/check-account-scope.mjs <workspaceId>` shows the per-account analytics rows vs the active accounts.
- 113 analytics tests pass; both changed files are diagnostics-clean. Requires a server restart to take effect.

---

## Version 3.11

Fixed (followers now match the Home "Monthly Momentum")

- **Followers Gained / Lost / Net were undercounted** (showed 1/1/0) because they were derived from the sparse `Analytics.followers` series, which missed the real month-start baseline. They now come from **`InstagramFollowerSnapshot`** — the same genuine daily follower history the Home page uses — scoped to the active account, deduped to one reading per account per day, with zero/glitch readings dropped.
  - For the example account the month's real series is `452 → 453 → 452 → 451 → 455`, so analytics now shows **Net +3** (matches Home), from **Gained 5 / Lost 2**, and the follower total **455**.
- **Follower Growth Rate, Audience Churn, Audience Retention now populate** even when there's no prior-period data: the metric engine falls back to the start-of-period base (current − net) as the denominator (e.g. growth 3/452 ≈ 0.66%, churn 2/452 ≈ 0.44%) instead of "No data".
- The followers chart and AI Executive Summary read the same clean snapshot series, so the earlier `+15033%` artifact is gone.

Changed

- `LegacyRollupReadStore`: follower total, gained/lost, and the daily follower line all source from `InstagramFollowerSnapshot` (active-account-scoped); reach/engagement/views still come from the account-scoped `Analytics` series. Added `getFollowerSnapshotDaily`; `followerFlow` now takes a numeric series.
- Diagnostics added: `scripts/check-snapshot-followers.mjs <igUserId>`, `scripts/check-follower-daily.mjs <workspaceId> <accountId>`.

Notes

- 115 analytics tests pass (added 2 for the growth-rate/churn start-of-period base); diagnostics-clean. Requires a server restart to take effect.

---

## Version 3.12

Added

- **Followers Gained now comes from Instagram's live API.** New `InstagramApiService.getFollowerCountDaily(accountId, token, since, until)` fetches the genuine `follower_count` insight (daily new followers) straight from the Graph API. The analytics bridge uses it for **New Followers** on the current window (summed across active accounts), computes **Lost Followers = gained − net change**, and falls back to the snapshot-derived flow when the API returns nothing. Safe: wrapped in try/catch, never throws, and the route caches responses per range.
- **Custom date-range picker.** Selecting "Custom range" now reveals genuine From/To date inputs in the filter bar; `resolveDateRange` turns them into a real analysis window (+ an equal-length comparison window), so the dashboards query exactly the picked range. Wired into Overview and all section dashboards.

Changed

- `resolveDateRange(preset, now, custom?)` now accepts a custom `{from,to}` window; `DateRangeSelect` gained `customRange` / `onCustomRangeChange` props.

Honest limits (Meta API constraints, not our code)

- Instagram's `follower_count` insight is only available for **~the last 30 days** and only for accounts with **≥ 100 followers**. So:
  - 7-day / 30-day / custom ranges **within** the last 30 days get real per-day gains from the API.
  - **90-day and 12-month** ranges can only include the last 30 days of gains — Instagram does not return older follower data to anyone. Custom ranges older than 30 days likewise can't be filled.
- Instagram exposes gained (new follows), not a gross unfollow count, so **Lost** is derived from gained − net change.

Notes

- 115 analytics tests pass; changed files diagnostics-clean. Requires a server restart (and a live Instagram token) to see the API-sourced numbers.

---

## Version 3.13

Fixed (correcting v3.12's wrong assumption)

- **90-day / 12-month follower gains were identical to 30-day** because `getFollowerCountDaily` clamped every request to a single 30-day window. That was wrong: Instagram limits **each request** to 30 days, but **retains the history far longer** (verified — Hootsuite shows 46 new followers over ~90 days vs 17 over ~30).
- `getFollowerCountDaily` now fetches the range in **consecutive 30-day chunks** and merges them by day (deduped), so New Followers reflects the full selected window: ~17 for 30 days, ~46 for 90 days, and the real total for 12 months. Failed/empty chunks are skipped; a 14-chunk cap bounds cost.
- Lost Followers continues to derive as `gained − net` (net = current − earliest genuine follower reading), so it also varies per range (e.g. 30d ≈ 14, 90d ≈ 43).

Notes

- Longer ranges make more API calls (90d ≈ 3, 12m ≈ 13); the dashboard route caches responses per range/TTL to avoid repeat cost. Calls are gated to the current (now-ending) window; comparison windows use stored data.
- 115 analytics tests pass; changed files diagnostics-clean. Requires a server restart + live Instagram token.

---

## Version 3.14

Researched + implemented the industry-standard follower-history approach

- **Confirmed via Meta docs + every major tool that Instagram caps `follower_count` at 30 days.** Sources: Meta developer docs, Meta developer community ("Returns a maximum of 30 days worth of data"), Catchr ("Data is only available for the last 30 days"), Minter.io ("a maximum of 30 days of data is available instead of 2 years"), Metricool ("data from the previous 30 days will be displayed… tracking starts from the moment you connect"), Dataslayer ("does not pull past historical data, but helps you accumulate it going forward"), and Hootsuite's own help ("As soon as you add a social account, Hootsuite starts collecting data… at least once a day"). Content was rephrased for compliance with licensing restrictions.
- **Implemented the same model:** new `InstagramFollowerDaily` collection stores per-day `newFollowers` (from `follower_count`). On each Audience load the store is refreshed from the API (backfilling the latest 30 days Meta allows) and analytics reads the **accumulated** store for the selected range — so 90-day / 12-month become genuinely accurate as history builds, exactly like Hootsuite. Falls back to the live API / snapshot flow when the store is empty.

Honest status

- **Today**, right after connecting, the store holds the 30 days Meta provides, so 30d/90d/12m still overlap. They diverge as days accumulate (30 days from now the 30-day view is fully independent; in a year the 12-month view is real). This is exactly how Hootsuite/Metricool behave on a fresh connect — no standard app can retrieve >30 days of follower history from Meta on day one.

Notes

- 115 analytics tests pass; changed files diagnostics-clean. Requires a server restart.

---

## Version 3.15

Followers gained/lost now from `follows_and_unfollows` (real ~24-month history) + calendar picker + comparison

- **Followers Gained / Lost now come from Instagram's `follows_and_unfollows` insight** (`metric_type=total_value`, `breakdown=follow_type`) instead of the 30-day-capped `follower_count`. Verified against the live API: this metric is retained far longer (365+ days, ~24 months) and exposes the true gross split — `FOLLOWER` → gained, `NON_FOLLOWER` → lost. This is what Hootsuite/Sprout use to show >30-day follower history immediately after connect.
  - New `InstagramApiService.getFollowsAndUnfollows(accountId, token, since, until)` fetches the window in consecutive 30-day chunks (Meta rejects any single request > 30 days) and sums each breakdown, up to a ~24-month cap. Never throws.
  - `LegacyRollupReadStore` now calls it for **any** window (including the comparison window — no `endsNow` gating), so New/Lost Followers genuinely change per selected range. Falls back to the snapshot-derived day-over-day flow when the API returns nothing.
  - Removed the now-redundant `follower_count` accumulation path: deleted `getInstagramGainedFollowers`, `refreshFollowerDaily`, `getStoredGainedFollowers`, and the `InstagramFollowerDaily` model/collection.
- **Calendar date-range picker (Hootsuite-style).** `DateRangeSelect` replaced its two native date inputs with a popover containing a preset list, a **dual-month calendar** for arbitrary custom ranges, and a comparison selector. Custom ranges can exceed 365 days (up to ~2 years). Self-contained — no new dependencies.
  - New presets added: Month to date, Quarter to date, Year to date, Last month, Last quarter, Last year (alongside the existing rolling windows).
- **Comparison option.** New `ComparisonConfig` (`none` / `previous` / `custom`) flows through `resolveDateRange(preset, now, custom?, comparison?)` into `compareFrom` / `compareTo`, so KPI deltas are genuine period-over-period comparisons (e.g. "Jun 1, 2024 – Jul 2, 2026 vs previous period"). Wired into Overview and all section dashboards; the trigger shows the active comparison label.

Notes

- 121 analytics tests pass (added 6 for comparison modes + the new calendar presets); changed files diagnostics-clean. Requires a server restart (route cache TTL 60s).

---

## Version 3.16

Historical analytics are now persisted PER-DAY + served through a Redis → MongoDB read-through cache with a BullMQ worker

- **The problem.** Follower Gained/Lost came from `follows_and_unfollows`, which costs a chunk of Meta Graph API calls **per window**. Every dashboard load and every range/comparison change re-fetched from Meta — slow, rate-limited, and wasteful, since historical data never changes.
- **Why per-day.** Verified live that Meta rejects `time_series` for this metric (`(#100) ... incompatible with the metric type (time_series)`) — it only returns a window TOTAL. So to make **any sub-range/overlap** answerable from the DB, each day is fetched as its own 1-day `total_value` window (`InstagramApiService.getFollowsAndUnfollowsDaily`, real data, never interpolated — Rule 16) and stored per-day. A range is then simply the SUM of its stored days.
- **Batched fetching.** The one-time per-day backfill uses the Meta Graph **Batch API** (`POST /{version}` with up to 50 GET sub-requests) for Facebook tokens — verified live (HTTP 200, genuine `total_value.breakdowns` per sub-request) — turning a ~730-day sync from ~730 round-trips into ~15. Instagram-native (IGAA) tokens fall back to sequential (graph.instagram.com has no batch endpoint). Batching changes only the transport, not the data.
- **Durable per-day store.** New `AnalyticsDailyMetric` collection: one document per `(accountId, metricGroup, date)` with `values {gained, lost}`, an `immutable` flag (day complete = never re-fetched), and a `fetchedAt` timestamp. Example: fetch **Apr 2025 → Apr 2026** and all 365 days are stored; later viewing **Jan → Mar 2026** needs **zero** Meta calls — it's summed from the DB.
- **Read path stays off Meta.** `getFollowsRange` (server/features/analytics/history) serves **Redis → MongoDB per-day sum**. It returns a value only when EVERY day in the window is covered (never an understated partial); when days are missing/stale it enqueues a **BullMQ** backfill and returns `null`, so the KPI falls back to the genuine snapshot-derived value while the worker populates the store.
- **Worker is the only Meta writer.** New `analytics-history-backfill` queue + `analyticsHistoryWorker` fetch only the MISSING days (immutable days already stored are skipped) and upsert them; today is always refreshed (≤ every 30 min). De-duplicated per `(account, window)`; low concurrency + retry/backoff. When Redis/BullMQ is unavailable (local dev), the read path backfills inline once as a fallback.
- **Proactive full-history prewarm (the Hootsuite model).** On the first dashboard load, the read path enqueues a backfill for the **entire ~24 months** (not just the viewed window). Because the worker skips already-stored days and the jobId rolls over daily, this is a one-time full sync plus a free daily incremental. After that initial sync, **every** date range/sub-range is an instant DB read — matching how Hootsuite feels (they pre-sync your full history on connect; picking a range is never a Meta call).
- **Backfill starts on OAuth connect.** The Instagram OAuth callback now fires `prewarmFollowsForWorkspace` (fire-and-forget) the moment an account connects, so the ~24-month sync begins before the user ever opens analytics. On **disconnect + reconnect**, nothing is re-fetched from scratch: the per-day store is keyed by the Instagram user id (survives reconnects and new `SocialAccount` docs), so the worker re-uses every stored day and only fetches days added since — genuine data, stored once, kept forever.
- **Token-refresh safe.** The backfill worker re-reads the account's CURRENT token from the DB at execution time (`getFreshTokenForAccount`) rather than trusting the token captured when the job was enqueued — so it automatically picks up whatever the scheduled `TokenRefreshService` rotated in (long-lived tokens are refreshed ~7 days before their 60-day expiry). If the token is fully expired / the account inactive (can't be refreshed → needs reconnect), the worker skips cleanly and analytics falls back to the genuine snapshot value; no crash, no retry storm.
- **Dashboard responses cached in Redis too.** New `RedisAnalyticsCache` (implements the `AnalyticsCache` port) caches the assembled response envelope across instances; the `/dashboards/:id` route uses it, falling back to fresh computation when Redis is down.

Notes

- 131 analytics tests pass (added history window/day math incl. the sub-range-is-DB-served case, plus workspace-isolation of the cache key); changed files diagnostics-clean. New collection is created on first use; requires a server restart. The first view of a large range triggers a background per-day backfill (one Meta call per missing day, well within Instagram's impression-based limit); every subsequent view — full or sub-range — is served from the DB.
- **Debug tracing.** New `logs/analytics-history-debug.log` (via `historyDebugLog.histLog`) records the whole pipeline so connect + reconnect behaviour is verifiable: `CONNECT_CALLBACK` / `CONNECT_PREWARM_*`, `QUEUE_ENQUEUED` (deduped), `WORKER_JOB_START/DONE/SKIP_NO_TOKEN/FAILED`, `BACKFILL_START/DONE` (shows `alreadyStoredImmutable`, `daysFetchedFromMeta`, `reusedFromDb` — so reconnect visibly SKIPS stored days), `READ_REDIS_HIT`, `READ_DB_COVERAGE`, and a per-range verdict `READ_RESULT` (`source: REDIS / DB (no Meta call) / FALLBACK`, `servedFromDb`, `metaCalledThisRequest`, `approxMonths`). Never logs tokens/secrets.

---

## Version 3.17

Complete analytics backfill — reach, impressions, engagement & profile actions now have the same 24-month history as followers

- **Extends the per-day store to the whole KPI family.** New `InstagramApiService.getDailyInsights` fetches `likes, comments, shares, saves, profile_views, website_clicks, views, reach` for a day in **one** Meta call (`metric_type=total_value`, verified live to return all eight together), batched (50 day-calls per HTTP request) exactly like followers. Stored per-day in `AnalyticsDailyMetric` under `metricGroup:'insights'` — immutable once complete, fetched once.
- **New read store** `insightsHistory.getInsightsRange` sums the per-day values for any window (Redis → MongoDB), returning a value only when every day is covered (else `null` → legacy fallback while the worker backfills). `LegacyRollupReadStore.getRollups` now sources **reach_total, impressions_total (views), likes/comments/shares/saves (→ total_engagements & engagement_rate_by_reach), profile_views, website_clicks** from it — so these KPIs are correct for **any** range (historical included) and the **comparison window** populates wherever data exists, fixing "no data / no comparison on some ranges".
- **Backfilled on connect + worker-driven**, same as followers: the OAuth prewarm now enqueues both a `follows_and_unfollows` and an `insights` job; the worker (`analyticsHistoryWorker`) handles both kinds. Job ids are namespaced by group so follows/insights never collide.
- **Cost (verified):** one Meta call returns all eight metrics for a day, so a fresh 24-month sync is ~730 day-calls → **~15 batched HTTP requests** (~1.5 min background), on top of the followers sync. Ongoing: ~1 insights call/day; reconnect fetches only the gap. Well within Instagram's impression-based rate budget.
- **Chart wired too.** `getDailySeries` (the primary time-series chart) now builds its reach / engagement / views lines from the per-day insights store via `getInsightsDaily`, unioning days so the chart spans the whole selected range (~24 months) — falling back to the recent `Analytics` snapshot per day only where the store isn't populated yet. Followers line still uses the snapshot history.
- **Debug tracing** extended: `INSIGHTS_BACKFILL_START/DONE`, `INSIGHTS_READ_DB_COVERAGE`, `INSIGHTS_READ_REDIS_HIT`, and per-range `INSIGHTS_READ_RESULT` (`source`, `servedFromDb`, `metaCalledThisRequest`, reach/views/engagements).

Notes

- 132 analytics tests pass; changed files diagnostics-clean; requires a server restart. KPIs, comparison, AND the time-series chart are now historical across all metrics.

---

## Version 3.18

Historical follower TOTAL (+ growth rate / churn / retention) reconstructed for any range

- **Symptom:** on the Audience dashboard for older ranges (e.g. "Last year"), New/Lost/Net Followers were correct but **Followers total, Follower Growth Rate, Audience Churn, Audience Retention showed "No data"** — because `followers_total` comes from the `InstagramFollowerSnapshot` table, which only has data since the account connected, and those three rates derive their base from `followers_total`.
- **Fix:** `LegacyRollupReadStore` now RECONSTRUCTS the historical follower total genuinely — `currentFollowers − Σ(net follows AFTER the window end)` — using the per-day follows store (2-year history). New `reconstructFollowersAsOf(workspaceId, asOf)` + shared `historyAccounts` helper. Applied only when the snapshot table has no reading for the window, so recent ranges are unchanged.
- **Result:** `followers_total` is populated for any range, which unblocks the engine's `follower_growth_rate` / `audience_churn` / `audience_retention` (they compute the base as `followers_total − net`). No fabrication — it's the live count walked back by the genuine gained/lost history (research doc §2.2).

Notes

- 132 analytics tests pass; diagnostics-clean; requires a server restart. Verified from the debug log that the insights backfill stored all 730 days (reach/engagement now DB-served on Overview); this entry fixes the follower-total family on Audience.

---

## Version 3.1

Added

- **Dashboard Builder** restored to the Analytics sidebar (`/analytics/builder`, LayoutGrid icon) as a real, data-backed feature — not a placeholder.
  - Users compose their own dashboard by choosing which **KPIs** and which **widgets** (AI Executive Summary, Performance timeline, Audience by country, Top performing content, Recommended actions, Recent alerts) to display. Selections persist per workspace in `localStorage`.
  - Backed by a new `custom` server dashboard spec (`api/dashboard-specs.ts`) exposing the full catalog of real, data-backed KPIs plus the timeseries/audience/top-content widgets. The builder reads it through the single live data seam (`useDashboardData('custom')`) — all values are backend-computed (Rule 9) and nothing is fabricated; unselected items are simply hidden (Rule 16).
  - Fully reuses the dashboard framework (Phase 4), widget library (Phase 5), and design-system filters (Phase 3) — no bespoke analytics UI (Rule 3/4). New client page `dashboards/DashboardBuilderPage.tsx`, wired via `config/navigation.ts` and `AnalyticsApp.tsx`.

Notes

- Metrics the current data model doesn't track still render "—" when selected (Rule 16); the builder only offers what the `custom` contract can populate.
- All 111 analytics tests pass; no TypeScript errors in `features/analytics`.
