/**
 * DashboardBuilderPage — a build-your-own analytics dashboard.
 *
 * Lets the user compose their own view by choosing which KPIs and which widgets
 * to display. It reuses the standardized dashboard framework (Phase 4), the
 * widget library (Phase 5), and the single live data seam (Phase 9) — nothing
 * bespoke is calculated on the client (CODING_RULES Rule 9) and no values are
 * fabricated: every KPI/widget it can show is backed by the `custom` dashboard
 * contract; unselected items are simply hidden (Rule 16).
 *
 * The layout is display-only composition (Rule 4/5): the choice of what to show
 * is the user's; the data and computation come from the backend. Selections
 * persist per workspace in `localStorage`.
 *
 * Phase 6 extension: wraps the page tree with PlatformFilterProvider and renders
 * a PlatformFilter control immediately after the time-range filter when both
 * Instagram and Facebook are connected (Requirements 6.1, 6.2).
 */

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'

import { LayoutGrid } from 'lucide-react'

import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher'
import { cn } from '@/lib/utils'
import useSubscription from '@/hooks/useSubscription'

import { Dashboard, DashboardGrid, DashboardGridItem } from '../dashboard'
import {
  DateRangeSelect,
  FilterBar,
  FilterMultiSelect,
  KpiCard,
  KpiCardGrid,
  DEFAULT_DATE_RANGE,
  resolveDateRange,
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
import { AnalyticsNoWorkspace, AnalyticsEmptyState } from '../components/AnalyticsStates'
import { AnalyticsPageContainer } from '../components/AnalyticsPageContainer'
import { useAnalyticsActiveRoute } from '../hooks/useAnalyticsActiveRoute'
import { PLATFORM_OPTIONS } from './overview.config'
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

// ---------------------------------------------------------------------------
// Platform filter chips — consistent with Dashboard and DashboardPage
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

/** Inline chip-strip rendered immediately after time-range filter (Requirements 6.1, 6.2). */
function BuilderPlatformFilterControl({
  selection,
  onSelect,
}: {
  selection: PlatformSelection
  onSelect: (s: PlatformSelection) => void
}) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label="Platform filter">
      {PLATFORM_FILTER_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onSelect(opt.value)}
          aria-pressed={selection === opt.value}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
            selection === opt.value
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
          )}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  )
}


/** The composable widget sections a user can toggle on/off in the builder. */
type BuilderWidgetId = 'aiSummary' | 'timeline' | 'audience' | 'topContent' | 'recommendations' | 'alerts'

/** Widget catalog (labels are configuration, not data — Rule 7). */
const WIDGET_OPTIONS: { value: BuilderWidgetId; label: string }[] = [
  { value: 'aiSummary', label: 'AI Executive Summary' },
  { value: 'timeline', label: 'Performance timeline' },
  { value: 'audience', label: 'Audience by country' },
  { value: 'topContent', label: 'Top performing content' },
  { value: 'recommendations', label: 'Recommended actions' },
  { value: 'alerts', label: 'Recent alerts' },
]
const ALL_WIDGET_IDS: BuilderWidgetId[] = WIDGET_OPTIONS.map((o) => o.value)

/** The user's saved composition. `kpis: null` means "show all available KPIs". */
interface BuilderConfig {
  kpis: string[] | null
  widgets: BuilderWidgetId[]
}

const DEFAULT_CONFIG: BuilderConfig = { kpis: null, widgets: ALL_WIDGET_IDS }

function storageKeyFor(workspaceId: string | null | undefined): string | null {
  return workspaceId ? `veefore.analytics.builder.${workspaceId}` : null
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

function DashboardBuilderPageInner() {
  const { breadcrumbs } = useAnalyticsActiveRoute()
  const { currentWorkspace, currentWorkspaceId, isLoading: workspaceLoading } = useCurrentWorkspace()
  const { selection, setSelection, showFilter } = usePlatformFilter()

  const [dateRange, setDateRange] = useState<DateRangePreset>(DEFAULT_DATE_RANGE)
  const [platforms, setPlatforms] = useState<string[]>([])
  const [config, setConfig] = useState<BuilderConfig>(DEFAULT_CONFIG)
  const loadedRef = useRef(false)

  // Load the saved composition once the workspace is known.
  useEffect(() => {
    const key = storageKeyFor(currentWorkspaceId)
    if (!key || loadedRef.current) return
    loadedRef.current = true
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return
      const parsed = JSON.parse(raw) as Partial<BuilderConfig>
      setConfig({
        kpis: Array.isArray(parsed.kpis) ? parsed.kpis : null,
        widgets: Array.isArray(parsed.widgets)
          ? parsed.widgets.filter((w): w is BuilderWidgetId => ALL_WIDGET_IDS.includes(w as BuilderWidgetId))
          : ALL_WIDGET_IDS,
      })
    } catch {
      /* ignore malformed saved config */
    }
  }, [currentWorkspaceId])

  // Persist the composition whenever it changes (after the initial load).
  useEffect(() => {
    const key = storageKeyFor(currentWorkspaceId)
    if (!key || !loadedRef.current) return
    try {
      localStorage.setItem(key, JSON.stringify(config))
    } catch {
      /* storage may be unavailable (private mode) — non-fatal */
    }
  }, [currentWorkspaceId, config])

  const range = useMemo(() => resolveDateRange(dateRange), [dateRange])

  // Thread the platform filter selection through to the backend query so all
  // visible analytics components enter loading state when selection changes
  // (Requirements 6.1, 6.2).
  const platformsParam = useMemo<string[]>(() => {
    if (selection === 'all') return platforms
    return [selection]
  }, [selection, platforms])

  const { status, data, lastRefresh, refetch } = useDashboardData('custom', {
    from: range.from,
    to: range.to,
    compareFrom: range.compareFrom,
    compareTo: range.compareTo,
    platforms: platformsParam,
  })

  const widgetState = status === 'loading' ? 'loading' : status === 'error' ? 'error' : 'empty'

  const kpiCatalog = useMemo(
    () => (data?.kpis ?? []).map((k) => ({ value: k.key, label: k.title })),
    [data]
  )
  const allKpiKeys = useMemo(() => kpiCatalog.map((o) => o.value), [kpiCatalog])
  const selectedKpiKeys = config.kpis ?? allKpiKeys

  const visibleKpis = useMemo(
    () => (data?.kpis ?? []).filter((k) => selectedKpiKeys.includes(k.key)),
    [data, selectedKpiKeys]
  )
  const showWidget = (id: BuilderWidgetId) => config.widgets.includes(id)

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
      <AnalyticsPageContainer
        title="Dashboard Builder"
        description="Build your own dashboard — pick the KPIs and widgets you want to see."
        breadcrumbs={breadcrumbs}
      >
        <AnalyticsNoWorkspace />
      </AnalyticsPageContainer>
    )
  }

  const timeseries = getTimeseriesWidget(data)
  const distribution = getDistributionWidget(data)
  const topList = getTopListWidget(data)
  const recommendations = getRecommendationInsights(data)

  const nothingSelected = selectedKpiKeys.length === 0 && config.widgets.length === 0
  const showKpiStrip = config.kpis === null || config.kpis.length > 0

  return (
    <Dashboard
      title="Dashboard Builder"
      description="Build your own dashboard — pick the KPIs and widgets you want to see."
      breadcrumbs={breadcrumbs}
      workspaceName={currentWorkspace?.name}
      filters={
        <div className="space-y-3">
          <FilterBar activeCount={platforms.length} chips={filterChips} onClearAll={() => setPlatforms([])}>
            <DateRangeSelect value={dateRange} onChange={setDateRange} />
            {/* Platform filter chips — rendered immediately after time-range filter,
                only when both Instagram and Facebook are connected (Requirements 6.1, 6.2) */}
            {showFilter && (
              <BuilderPlatformFilterControl selection={selection} onSelect={setSelection} />
            )}
            <FilterMultiSelect
              label="Platforms"
              options={PLATFORM_OPTIONS}
              value={platforms}
              onChange={setPlatforms}
            />
          </FilterBar>
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-gray-200 bg-gray-50/60 p-3 dark:border-gray-700 dark:bg-gray-800/40">
            <span className="mr-1 text-sm font-medium text-gray-700 dark:text-gray-200">Customize:</span>
            <FilterMultiSelect
              label="KPIs"
              options={kpiCatalog}
              value={selectedKpiKeys}
              onChange={(next) => setConfig((c) => ({ ...c, kpis: next }))}
            />
            <FilterMultiSelect
              label="Widgets"
              options={WIDGET_OPTIONS}
              value={config.widgets}
              onChange={(next) => setConfig((c) => ({ ...c, widgets: next as BuilderWidgetId[] }))}
            />
            <button
              type="button"
              onClick={() => setConfig({ kpis: null, widgets: ALL_WIDGET_IDS })}
              className="h-9 rounded-md px-3 text-sm text-gray-600 underline-offset-2 hover:underline dark:text-gray-300"
            >
              Reset
            </button>
          </div>
        </div>
      }
      aiSummary={
        nothingSelected ? (
          <AnalyticsEmptyState
            title="Your dashboard is empty"
            message="Use the Customize controls above to add KPIs and widgets to your dashboard."
          />
        ) : showWidget('aiSummary') ? (
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
        ) : undefined
      }
      kpis={
        showKpiStrip && !nothingSelected ? (
          <KpiCardGrid>
            {visibleKpis.length > 0
              ? visibleKpis.map((k) => <KpiCard key={k.key} data={kpiFromContract(k)} />)
              : Array.from({ length: 4 }).map((_, i) => (
                  <KpiCard key={i} data={{ title: 'Loading', value: null, unit: 'count' }} isLoading />
                ))}
          </KpiCardGrid>
        ) : undefined
      }
      primaryCharts={
        showWidget('timeline') ? (
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
        ) : undefined
      }
      secondaryCharts={
        showWidget('audience') || showWidget('topContent') ? (
          <DashboardGrid>
            {showWidget('audience') && (
              <DashboardGridItem span={showWidget('topContent') ? 4 : 12}>
                <DistributionWidget
                  title={distribution?.title ?? 'Audience by country'}
                  state={distribution ? 'ready' : widgetState}
                  data={distribution?.slices}
                  unit={distribution?.unit}
                  onRetry={refetch}
                />
              </DashboardGridItem>
            )}
            {showWidget('topContent') && (
              <DashboardGridItem span={showWidget('audience') ? 8 : 12}>
                <TopPerformersWidget
                  title={topList?.title ?? 'Top performing content'}
                  state={topList ? 'ready' : widgetState}
                  items={topList?.items}
                  onRetry={refetch}
                />
              </DashboardGridItem>
            )}
          </DashboardGrid>
        ) : undefined
      }
      tables={undefined}
      recommendations={
        showWidget('recommendations') ? (
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
        showWidget('alerts') ? (
          <AlertsWidget title="Recent alerts" state={widgetState} lastUpdated={lastRefresh} onRetry={refetch} />
        ) : undefined
      }
    />
  )
}

// ---------------------------------------------------------------------------
// Public export — wraps the inner page with PlatformFilterProvider so the
// context is available to all analytics components in the tree (Requirement 6.1).
// ---------------------------------------------------------------------------

export function DashboardBuilderPage() {
  return (
    <PlatformFilterProvider>
      <DashboardBuilderGate />
    </PlatformFilterProvider>
  )
}

/**
 * Custom Dashboards (the Dashboard Builder) are a Pro+ feature. Gate the page
 * with an upgrade prompt for lower plans; the server enforces this too via
 * dashboardEntitlementGuard() on the `custom` dashboard route.
 */
function DashboardBuilderGate() {
  const { breadcrumbs } = useAnalyticsActiveRoute()
  const { limits, isLoading } = useSubscription()
  const canUseBuilder = limits?.features?.customDashboards === true

  // While the entitlement resolves, render the builder optimistically for
  // paid users is risky; instead show nothing distracting until known.
  if (!isLoading && limits && !canUseBuilder) {
    return (
      <AnalyticsPageContainer title="Dashboard Builder" breadcrumbs={breadcrumbs}>
        <StateShellUpgrade />
      </AnalyticsPageContainer>
    )
  }

  return <DashboardBuilderPageInner />
}

/** Upgrade prompt shown when the plan doesn't include custom dashboards. */
function StateShellUpgrade() {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/40 px-6 py-16 text-center"
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
        <LayoutGrid className="h-7 w-7" aria-hidden="true" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Custom dashboards are a Pro feature</h3>
      <p className="mt-1 max-w-md text-sm text-gray-600 dark:text-gray-400">
        Build your own analytics view with the KPIs and widgets you care about. Upgrade to Pro to unlock the Dashboard Builder.
      </p>
      <button
        onClick={() => { window.location.href = '/settings/billing' }}
        className="mt-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 text-sm font-semibold transition-colors"
      >
        Upgrade to Pro
      </button>
    </div>
  )
}
