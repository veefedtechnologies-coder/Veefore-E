/**
 * DashboardPage — config-driven renderer for section dashboards
 * (06-dashboard-specifications.md). Assembles the documented, fixed-order
 * sections (Rule 6) from a {@link DashboardPageConfig} using the dashboard
 * framework (Phase 4) and widget library (Phase 5), reading live data from the
 * shared seam (Phase 9). Widgets render empty states until data flows — no
 * values are fabricated (Rule 16).
 *
 * This one component powers every section dashboard, keeping them consistent and
 * DRY (CODING_RULES Rule 3 & 4).
 *
 * Phase 6 extension: wraps the page tree with PlatformFilterProvider and renders
 * a PlatformFilter control immediately after the time-range filter when both
 * Instagram and Facebook are connected (Requirements 6.1, 6.2).
 */

import { type ReactNode, useMemo, useState } from 'react'
import { Lock } from 'lucide-react'

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
import { AnalyticsNoWorkspace, AnalyticsUpgradeState } from '../components/AnalyticsStates'
import { AnalyticsPageContainer } from '../components/AnalyticsPageContainer'
import { useAnalyticsActiveRoute } from '../hooks/useAnalyticsActiveRoute'
import useSubscription from '@/hooks/useSubscription'
import { DASHBOARD_REQUIRED_FEATURE, FEATURE_MIN_PLAN } from '../config/entitlements'
import { FacebookReconnectBanner } from '../components/FacebookReconnectBanner'
import { PLATFORM_OPTIONS } from './overview.config'
import { useDashboardData } from './useDashboardData'
import {
  getDistributionWidget,
  getRecommendationInsights,
  getTimeseriesWidget,
  getTopListWidget,
  getAudienceDemographicsWidget,
  type KpiContract,
} from './contracts'
import type { DashboardPageConfig } from './configs'
import { AudienceDemographicsSection } from './AudienceDemographicsSection'
import {
  PlatformFilterProvider,
  usePlatformFilter,
  type PlatformSelection,
} from '../context/PlatformFilterContext'

// ---------------------------------------------------------------------------
// Platform filter chips — consistent with Dashboard (Requirements 6.1, 6.2)
// ---------------------------------------------------------------------------

const PLATFORM_FILTER_OPTIONS: Array<{
  value: PlatformSelection
  label: string
  icon: ReactNode
}> = [
  { value: 'all', label: 'All Platforms', icon: null },
  {
    value: 'instagram',
    label: 'Instagram',
    icon: (
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
      </svg>
    ),
  },
  {
    value: 'facebook',
    label: 'Facebook',
    icon: (
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    ),
  },
]

/**
 * Inline chip-strip: Instagram / Facebook / All Platforms.
 * Rendered only when `showFilter === true` (Requirements 6.1, 6.2).
 */
function AnalyticsPlatformFilterControl({
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

/** Map a backend KPI contract to the KpiCard data shape (display only, Rule 9). */
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

interface DashboardPageProps {
  config: DashboardPageConfig
}

// ---------------------------------------------------------------------------
// Inner component — consumes PlatformFilterContext (must be inside Provider)
// ---------------------------------------------------------------------------

function DashboardPageInner({ config }: DashboardPageProps) {
  const { breadcrumbs } = useAnalyticsActiveRoute()
  const { currentWorkspace, isLoading: workspaceLoading } = useCurrentWorkspace()
  const { selection, setSelection, showFilter } = usePlatformFilter()

  const [dateRange, setDateRange] = useState<DateRangePreset>(DEFAULT_DATE_RANGE)
  const [customRange, setCustomRange] = useState<CustomDateRange>({})
  const [comparison, setComparison] = useState<ComparisonConfig>({ mode: 'previous' })
  const [platforms, setPlatforms] = useState<string[]>([])

  const range = useMemo(
    () => resolveDateRange(dateRange, new Date(), customRange, comparison),
    [dateRange, customRange, comparison]
  )

  // Thread the platform filter selection through to the backend query.
  // When the user switches platform, useDashboardData re-fetches → all
  // visible analytics components enter loading state within 3 seconds
  // (Requirements 6.1, 6.2).
  const platformsParam = useMemo<string[]>(() => {
    if (selection === 'all') return platforms
    return [selection]
  }, [selection, platforms])

  const { status, data, lastRefresh, refetch } = useDashboardData(config.dashboardId, {
    from: range.from,
    to: range.to,
    compareFrom: range.compareFrom,
    compareTo: range.compareTo,
    platforms: platformsParam,
  })

  const showComparisonNotice = useMemo(() => {
    if (comparison.mode === 'none') return false
    if (!range.compareFrom) return false
    const limit = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000)
    return new Date(range.compareFrom) < limit
  }, [comparison.mode, range.compareFrom])

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

  if (!workspaceLoading && !currentWorkspace) {
    return (
      <AnalyticsPageContainer title={config.title} description={config.description} breadcrumbs={breadcrumbs}>
        <AnalyticsNoWorkspace />
      </AnalyticsPageContainer>
    )
  }

  const kpis = data?.kpis ?? []
  const hasKpiStrip = config.kpis.length > 0 || kpis.length > 0
  const timeseries = getTimeseriesWidget(data)
  const distribution = getDistributionWidget(data)
  const topList = getTopListWidget(data)
  const recommendations = getRecommendationInsights(data)
  const demographics = getAudienceDemographicsWidget(data)
  const alerts = data?.alerts ?? []

  return (
    <Dashboard
      title={config.title}
      description={config.description}
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
          {/* Platform filter chips — rendered immediately after time-range filter,
              only when both Instagram and Facebook are connected (Requirements 6.1, 6.2) */}
          {showFilter && (
            <AnalyticsPlatformFilterControl selection={selection} onSelect={setSelection} />
          )}
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
        ) : config.showRecommendations ? (
          <WidgetFrame
            title="AI Executive Summary"
            state={widgetState}
            onRetry={refetch}
            emptyMessage="Your AI executive summary will appear here once analytics data is available."
            bodyMinHeight={96}
          />
        ) : undefined
      }
      kpis={
        hasKpiStrip ? (
          <div className="space-y-4">
            {/* Section heading — contextual intro above KPIs */}
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {config.sectionTitle}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-xl">
                {config.sectionSubtitle}
              </p>
            </div>
            {/* Inline Facebook reconnect prompt — shown only when a Facebook
                account has connectionStatus === 'REQUIRES_RECONNECT'.
                Displays below the section heading and above KPI cards;
                never hides or replaces any metric card (Requirements 2.11, 5.7). */}
            <FacebookReconnectBanner />
            <KpiCardGrid>
              {kpis.length > 0
                ? kpis.map((kpi) => <KpiCard key={kpi.key} data={kpiFromContract(kpi)} comparisonUnavailable={showComparisonNotice} />)
                : config.kpis.map((kpi) => (
                    <KpiCard
                      key={kpi.id}
                      comparisonUnavailable={showComparisonNotice}
                      data={{ title: kpi.title, value: null, unit: kpi.unit, higherIsBetter: kpi.higherIsBetter }}
                      isLoading={widgetState === 'loading'}
                    />
                  ))}
            </KpiCardGrid>
          </div>
        ) : undefined
      }
      primaryCharts={
        config.primaryChart ? (
          <TrendWidget
            title={config.primaryChart.title}
            subtitle={config.primaryChart.subtitle}
            state={timeseries ? 'ready' : widgetState}
            data={timeseries?.points}
            series={timeseries?.series}
            variant={config.chartVariant ?? 'area'}
            lastUpdated={lastRefresh}
            onRetry={refetch}
            height={300}
          />
        ) : undefined
      }
      secondaryCharts={
        config.distributions || config.topList || demographics ? (
          <div className="space-y-6">
            {demographics && (
              <AudienceDemographicsSection
                data={demographics}
                state={status === 'loading' ? 'loading' : 'ready'}
              />
            )}
            {(config.distributions || config.topList) && (
              <DashboardGrid>
                {config.distributions?.map((title, i) => (
                  <DashboardGridItem key={title} span={config.topList ? 4 : 6}>
                    <DistributionWidget
                      title={i === 0 ? distribution?.title ?? title : title}
                      state={i === 0 && distribution ? 'ready' : widgetState}
                      data={i === 0 ? distribution?.slices : undefined}
                      unit={i === 0 ? distribution?.unit : undefined}
                      onRetry={refetch}
                    />
                  </DashboardGridItem>
                ))}
                {config.topList && (
                  <DashboardGridItem span={config.distributions?.length ? 8 : 12}>
                    <TopPerformersWidget
                      title={topList?.title ?? config.topList}
                      state={topList ? 'ready' : widgetState}
                      items={topList?.items}
                      onRetry={refetch}
                    />
                  </DashboardGridItem>
                )}
              </DashboardGrid>
            )}
          </div>
        ) : undefined
      }
      tables={undefined}
      recommendations={
        config.showRecommendations ? (
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
        ) : undefined
      }
      alerts={
        config.showAlerts ? (
          <AlertsWidget
            title="Recent alerts"
            state={alerts.length > 0 ? 'ready' : widgetState}
            alerts={alerts.map((a) => ({
              id: a.alertId,
              category: a.category,
              severity: a.severity,
              title: a.title,
              cause: a.cause,
              suggestedAction: a.suggestedAction,
              createdAt: a.createdAt,
            }))}
            lastUpdated={lastRefresh}
            onRetry={refetch}
          />
        ) : undefined
      }
    />
  )
}

// ---------------------------------------------------------------------------
// Public export — wraps the inner page with PlatformFilterProvider so the
// context is available to all analytics components in the tree (Requirement 6.1).
// ---------------------------------------------------------------------------

export function DashboardPage({ config }: DashboardPageProps) {
  const { breadcrumbs } = useAnalyticsActiveRoute()
  const { limits, isLoading } = useSubscription()
  const required = DASHBOARD_REQUIRED_FEATURE[config.dashboardId]

  // Gate the dashboard when the plan doesn't include its feature. Optimistic
  // while the entitlement loads; the server enforces access authoritatively.
  if (required && !isLoading && limits && limits.features?.[required] !== true) {
    return (
      <AnalyticsPageContainer title={config.title} description={config.description} breadcrumbs={breadcrumbs}>
        <AnalyticsUpgradeState featureName={config.title} requiredPlan={FEATURE_MIN_PLAN[required]} />
      </AnalyticsPageContainer>
    )
  }

  return (
    <PlatformFilterProvider>
      <DashboardPageInner config={config} />
    </PlatformFilterProvider>
  )
}
