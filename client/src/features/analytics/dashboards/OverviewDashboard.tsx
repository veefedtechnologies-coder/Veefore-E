/**
 * OverviewDashboard — the Analytics home ("How is my business performing
 * today?"), assembled per 06-dashboard-specifications.md Ch 2 using the dashboard
 * framework (Phase 4) and widget library (Phase 5).
 *
 * Sections follow the fixed documented order (Rule 6). Data is read live from the
 * backend via the shared seam (`useDashboardData`, Phase 9); KPI values and
 * deltas are computed on the backend (Rule 9). Until the rollup store lands
 * (Phase 10) the API returns an empty envelope, so widgets render empty states —
 * no values are fabricated (Rule 16).
 *
 * Phase 5 extension: wraps the tree with PlatformFilterProvider, renders a
 * platform filter control when both Instagram and Facebook are connected, and
 * shows a non-blocking inline warning banner when the backend signals partial
 * data availability (Requirements 5.1, 5.2, 5.3, 5.7, 5.8).
 */

import { type ReactNode, useMemo, useState } from 'react'
import { AlertTriangle, Instagram, Facebook, Lock } from 'lucide-react'

import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher'
import { cn } from '@/lib/utils'

import { Dashboard, DashboardGrid, DashboardGridItem } from '../dashboard'
import {
  DateRangeSelect,
  FilterBar,
  FilterMultiSelect,
  KpiCard,
  KpiCardGrid,
  DEFAULT_DATE_RANGE,
  resolveDateRange,
  type ComparisonConfig,
  type CustomDateRange,
  type DateRangePreset,
  type KpiData,
} from '../design-system'
import {
  AISummaryWidget,
  AIInsightWidget,
  AlertsWidget,
  DistributionWidget,
  TopPerformersWidget,
  TrendWidget,
  WidgetFrame,
} from '../widgets'
import { AnalyticsNoWorkspace } from '../components/AnalyticsStates'
import { AnalyticsPageContainer } from '../components/AnalyticsPageContainer'
import { useAnalyticsActiveRoute } from '../hooks/useAnalyticsActiveRoute'
import { FacebookReconnectBanner } from '../components/FacebookReconnectBanner'
import { OVERVIEW_KPIS, PLATFORM_OPTIONS } from './overview.config'
import { useDashboardData } from './useDashboardData'
import {
  getDistributionWidget,
  getRecommendationInsights,
  getTimeseriesWidget,
  getTopListWidget,
  type KpiContract,
} from './contracts'
import {
  PlatformFilterProvider,
  usePlatformFilter,
  type PlatformSelection,
} from '../context/PlatformFilterContext'
import { CapabilityGuard } from '@platform-registry/index'
import type { PlatformContribution } from '../widgets/types'

/** Map a backend KPI contract to the design-system KpiCard data shape (display only). */
function kpiFromContract(k: KpiContract): KpiData {
  return {
    metricId: k.metricId,
    title: k.title,
    value: k.value,
    previousValue: k.previousValue,
    change: k.change,
    changePercent: k.changePercent,
    trend: k.trend,
    unit: k.unit,
    dataQuality: k.dataQuality,
    higherIsBetter: k.higherIsBetter,
  }
}

// ---------------------------------------------------------------------------
// Platform filter chips UI
// ---------------------------------------------------------------------------

const PLATFORM_FILTER_OPTIONS: Array<{
  value: PlatformSelection
  label: string
  icon: ReactNode
}> = [
  {
    value: 'all',
    label: 'All Platforms',
    icon: null,
  },
  {
    value: 'instagram',
    label: 'Instagram',
    icon: <Instagram className="h-3.5 w-3.5" aria-hidden="true" />,
  },
  {
    value: 'facebook',
    label: 'Facebook',
    icon: <Facebook className="h-3.5 w-3.5" aria-hidden="true" />,
  },
]

/** Inline chip-strip that lets the user pick Instagram / Facebook / All Platforms.
 *  Rendered only when `showFilter === true` (Requirements 5.1, 5.2, 5.3). */
function PlatformFilterControl({
  selection,
  onSelect,
}: {
  selection: PlatformSelection
  onSelect: (s: PlatformSelection) => void
}) {
  const { canCrossPlatform } = usePlatformFilter()
  return (
    <div className="flex items-center gap-2" role="group" aria-label="Platform filter">
      {PLATFORM_FILTER_OPTIONS.map((opt) => {
        // The combined "All Platforms" view is the paid cross-platform feature.
        const locked = opt.value === 'all' && !canCrossPlatform
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => (locked ? (window.location.href = '/settings/billing') : onSelect(opt.value))}
            aria-pressed={selection === opt.value}
            title={locked ? 'Combined cross-platform analytics is a Creator+ feature' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
              selection === opt.value
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
              locked && 'opacity-60'
            )}
          >
            {opt.icon}
            {opt.label}
            {locked && <Lock className="h-3 w-3" aria-hidden="true" />}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Non-blocking inline warning banner (Requirements 5.7, 5.8, 12.4)
// ---------------------------------------------------------------------------

/** Shows platform-unavailability warnings as a soft amber banner.
 *  Never hides, collapses, or replaces any metric card. */
function PlatformWarningBanner({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500 dark:text-amber-400" aria-hidden="true" />
      <ul className="space-y-0.5">
        {warnings.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Build per-platform breakdown for a KPI key (Requirements 5.4, 5.5, 5.6)
// ---------------------------------------------------------------------------

/**
 * Given a KPI metric key and the platforms currently connected, returns the
 * `PlatformContribution[]` array (one row per platform). Rows where the
 * registry declares support level `NONE` are now INCLUDED so they can be
 * shown as "Not supported on [Platform]" in the All Platforms breakdown
 * (Requirement 6.5). Uses backend-provided values when available.
 */
function buildPlatformBreakdown(
  metricKey: string,
  connectedPlatforms: string[],
  backendBreakdown?: Array<{ platform: string; value: number | null }>,
): PlatformContribution[] {
  const breakdown: PlatformContribution[] = []
  for (const platform of connectedPlatforms) {
    // Only instagram and facebook are supported by the registry.
    if (platform !== 'instagram' && platform !== 'facebook') continue
    const supportLevel = CapabilityGuard.getMetricSupport(platform, metricKey)
    // Use backend-provided value if available, otherwise null
    const backendRow = backendBreakdown?.find((r: { platform: string; value: number | null }) => r.platform === platform)
    const value = backendRow !== undefined ? backendRow.value : null
    breakdown.push({ platform, value, supportLevel })
  }
  return breakdown
}

// ---------------------------------------------------------------------------
// Inner component — consumes PlatformFilterContext (must be inside Provider)
// ---------------------------------------------------------------------------

function OverviewDashboardInner() {
  useAnalyticsActiveRoute()
  const { currentWorkspace, isLoading: workspaceLoading } = useCurrentWorkspace()
  const { selection, setSelection, showFilter, connectedPlatforms } = usePlatformFilter()

  // Local filter state (global filter store arrives in a later phase).
  const [dateRange, setDateRange] = useState<DateRangePreset>(DEFAULT_DATE_RANGE)
  const [customRange, setCustomRange] = useState<CustomDateRange>({})
  const [comparison, setComparison] = useState<ComparisonConfig>({ mode: 'previous' })
  const [platforms, setPlatforms] = useState<string[]>([])

  const range = useMemo(
    () => resolveDateRange(dateRange, new Date(), customRange, comparison),
    [dateRange, customRange, comparison]
  )

  // Thread the platform filter selection through to the backend query.
  // 'all' → omit platforms param (backend returns merged results);
  // 'instagram' / 'facebook' → pass as single-item array.
  const platformsParam = useMemo<string[]>(() => {
    if (selection === 'all') return platforms
    return [selection]
  }, [selection, platforms])

  const { status, data, lastRefresh, refetch } = useDashboardData('overview', {
    from: range.from,
    to: range.to,
    compareFrom: range.compareFrom,
    compareTo: range.compareTo,
    platforms: platformsParam,
  })

  // Show the comparison-unavailable notice when the comparison is active and
  // the previous period predates Instagram's ~24-month data retention.
  const showComparisonNotice = useMemo(() => {
    if (comparison.mode === 'none') return false
    if (!range.compareFrom) return false
    const limit = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000)
    return new Date(range.compareFrom) < limit
  }, [comparison.mode, range.compareFrom])

  // Collect warning messages from the backend response.
  // Requirement 5.7: show a non-blocking banner, never hide metric cards.
  const warnings = useMemo<string[]>(() => {
    const msgs: string[] = []
    if (data?.meta.warnings) msgs.push(...data.meta.warnings)
    // partialData without an explicit warning still deserves a generic notice.
    if (data?.meta.partialData && msgs.length === 0) {
      msgs.push('Some platform data is temporarily unavailable. Showing partial results.')
    }
    return msgs
  }, [data?.meta.warnings, data?.meta.partialData])

  // Map the dashboard data status to a per-widget state.
  const widgetState = status === 'loading' ? 'loading' : status === 'error' ? 'error' : 'empty'

  const filterChips = useMemo(
    () =>
      platforms.map((p) => ({
        id: p,
        label: PLATFORM_OPTIONS.find((o) => o.value === p)?.label ?? p,
        onRemove: () => setPlatforms((prev) => prev.filter((v) => v !== p)),
      })),
    [platforms]
  )

  // No workspace → scoped empty state (analytics is workspace-scoped).
  if (!workspaceLoading && !currentWorkspace) {
    return (
      <AnalyticsPageContainer
        title="Your performance overview"
        description=""
        breadcrumbs={[]}
      >
        <AnalyticsNoWorkspace />
      </AnalyticsPageContainer>
    )
  }

  const kpis = data?.kpis ?? []
  const timeseries = getTimeseriesWidget(data)
  const distribution = getDistributionWidget(data)
  const topList = getTopListWidget(data)
  const recommendations = getRecommendationInsights(data)

  return (
    <Dashboard
      title="Your performance overview"
      description=""
      breadcrumbs={[]}
      workspaceName={currentWorkspace?.name}
      filters={
        <FilterBar activeCount={platforms.length} chips={filterChips} onClearAll={() => setPlatforms([])}>
          <DateRangeSelect
            value={dateRange}
            onChange={setDateRange}
            customRange={customRange}
            onCustomRangeChange={setCustomRange}
            comparison={comparison}
            onComparisonChange={setComparison}
          />
          <FilterMultiSelect
            label="Platforms"
            options={PLATFORM_OPTIONS}
            value={platforms}
            onChange={setPlatforms}
          />
        </FilterBar>
      }
      aiSummary={
        data?.summary ? (
          <AISummaryWidget summary={data.summary.text} confidence={data.summary.confidence} />
        ) : (
          <WidgetFrame
            title="AI Executive Summary"
            state={widgetState}
            onRetry={refetch}
            emptyMessage="Your AI executive summary will appear here once analytics data is available."
            bodyMinHeight={96}
          />
        )
      }
      kpis={
        <div className="space-y-4">
          {/* Section heading — Hootsuite-style "at a glance" intro */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                What's happening with your account
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-xl">
                Track the performance of your connected accounts and discover what's driving your results.
              </p>
            </div>
            {/* Platform filter chips — shown only when both platforms are connected
                (Requirements 5.1, 5.2, 5.3) */}
            {showFilter && (
              <PlatformFilterControl selection={selection} onSelect={setSelection} />
            )}
          </div>

          {/* Non-blocking warning banner — never hides KPI cards (Requirements 5.7, 5.8) */}
          <PlatformWarningBanner warnings={warnings} />

          {/* Inline Facebook reconnect prompt — shown only when a Facebook
              account has connectionStatus === 'REQUIRES_RECONNECT'.
              Renders below the API-level warning banner and above KPI cards;
              never hides or replaces any metric card (Requirements 2.11, 5.7). */}
          <FacebookReconnectBanner />

          <KpiCardGrid>
            {kpis.length > 0
              ? kpis.map((k) => {
                  // Build per-platform breakdown rows using backend-provided values
                  // when available (All Platforms mode), or NONE rows for unsupported metrics.
                  const platformBreakdown = buildPlatformBreakdown(k.key, connectedPlatforms, k.platformBreakdown)
                  return (
                    <KpiCard
                      key={k.key}
                      data={kpiFromContract(k)}
                      metricKey={k.key}
                      comparisonUnavailable={showComparisonNotice}
                      {...(platformBreakdown.length > 0
                        ? { platformBreakdown, isApproximateCombined: selection === 'all' }
                        : {})}
                    />
                  )
                })
              : OVERVIEW_KPIS.map((kpi) => (
                  <KpiCard
                    key={kpi.id}
                    metricKey={kpi.id}
                    comparisonUnavailable={showComparisonNotice}
                    data={{ title: kpi.title, value: null, unit: kpi.unit, higherIsBetter: kpi.higherIsBetter }}
                    isLoading={widgetState === 'loading'}
                  />
                ))}
          </KpiCardGrid>
        </div>
      }
      primaryCharts={
        <TrendWidget
          title="Performance timeline"
          subtitle="Reach, engagement and followers over time"
          state={timeseries ? 'ready' : widgetState}
          data={timeseries?.points}
          series={timeseries?.series}
          variant="area"
          lastUpdated={lastRefresh}
          onRetry={refetch}
          height={300}
        />
      }
      secondaryCharts={
        <DashboardGrid>
          <DashboardGridItem span={4}>
            <DistributionWidget
              title={distribution?.title ?? 'Audience by country'}
              state={distribution ? 'ready' : widgetState}
              data={distribution?.slices}
              unit={distribution?.unit}
              onRetry={refetch}
            />
          </DashboardGridItem>
          <DashboardGridItem span={8}>
            <TopPerformersWidget
              title={topList?.title ?? 'Top performing content'}
              state={topList ? 'ready' : widgetState}
              items={topList?.items}
              onRetry={refetch}
            />
          </DashboardGridItem>
        </DashboardGrid>
      }
      tables={undefined}
      recommendations={
        recommendations.length > 0 ? (
          <div className="space-y-3">
            {recommendations.map((insight) => (
              <AIInsightWidget key={insight.id} insight={insight} />
            ))}
          </div>
        ) : (
          <WidgetFrame
            title="Recommended actions"
            state={widgetState}
            onRetry={refetch}
            emptyMessage="AI recommendations will appear here once analytics data is available."
            bodyMinHeight={96}
          />
        )
      }
      alerts={<AlertsWidget title="Recent alerts" state={widgetState} lastUpdated={lastRefresh} onRetry={refetch} />}
    />
  )
}

// ---------------------------------------------------------------------------
// Public export — wraps the inner dashboard with PlatformFilterProvider so
// the context is available to the entire dashboard tree (Requirement 5.3).
// ---------------------------------------------------------------------------

export function OverviewDashboard() {
  return (
    <PlatformFilterProvider>
      <OverviewDashboardInner />
    </PlatformFilterProvider>
  )
}
