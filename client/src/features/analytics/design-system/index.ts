/**
 * Veefore Analytics Design System — public API (Phase 3).
 *
 * The dedicated, reusable analytics component library: KPI cards, charts,
 * tables, filters, modals, and skeletons, plus tokens, formatting, and types
 * (docs.analytics/analytics/04-dashboard-architecture.md). Every analytics
 * surface composes these primitives — no page builds custom analytics UI
 * (CODING_RULES Rule 4 & Rule 5).
 */

// Foundation
export * from './types'
export * from './tokens'
export * from './format'
export * from './dateRanges'

// KPI
export { KpiCard } from './components/KpiCard'
export { KpiCardGrid } from './components/KpiCardGrid'
export { TrendIndicator } from './components/TrendIndicator'
export { DataQualityBadge } from './components/DataQualityBadge'
export { RatingBadge } from './components/RatingBadge'
export { Sparkline } from './components/Sparkline'
export { PlatformBreakdownRows } from './components/PlatformBreakdownRows'
export { MetricUnavailableLabel } from './components/MetricUnavailableLabel'
export type { MetricUnavailableLabelProps } from './components/MetricUnavailableLabel'
export { DataUnavailableLabel } from './components/DataUnavailableLabel'
export type { DataUnavailableLabelProps } from './components/DataUnavailableLabel'

// Charts
export { ChartContainer } from './components/ChartContainer'
export { ChartTooltip } from './components/ChartTooltip'
export { TimeSeriesChart } from './components/TimeSeriesChart'
export { CategoryBarChart } from './components/CategoryBarChart'
export { useChartTheme } from './components/useChartTheme'

// Tables
export { DataTable } from './components/DataTable'

// Filters
export { FilterBar } from './components/FilterBar'
export { FilterSelect } from './components/FilterSelect'
export { FilterMultiSelect } from './components/FilterMultiSelect'
export { FilterChips, type FilterChip } from './components/FilterChips'
export { DateRangeSelect, type CustomDateRange } from './components/DateRangeSelect'

// Modals
export { AnalyticsModal } from './components/AnalyticsModal'

// Skeletons
export { KpiCardSkeleton } from './skeletons/KpiCardSkeleton'
export { ChartSkeleton } from './skeletons/ChartSkeleton'
export { TableSkeleton } from './skeletons/TableSkeleton'
export { FilterBarSkeleton } from './skeletons/FilterBarSkeleton'
