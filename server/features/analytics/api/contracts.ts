/**
 * Veefore Analytics — Dashboard API Contracts (Phase 8).
 *
 * The response envelope and widget contracts returned by the dashboard-oriented
 * APIs (08-backend-api-architecture.md Ch 4; 09-data-contracts.md). One
 * optimized response per dashboard page (ADR-003). These server types are the
 * source of truth; the client mirrors them in Phase 9.
 */

import type { DataQuality, MetricUnit } from '../metrics'

/** API contract version (09-data-contracts.md Ch 12). */
export const ANALYTICS_CONTRACT_VERSION = 'v1'

/** Trend direction for a KPI delta. */
export type ContractTrend = 'up' | 'down' | 'flat'

/** Response metadata block (09-data-contracts.md Ch 2). */
export interface DashboardMeta {
  requestId: string
  dashboardId: string
  apiVersion: string
  generatedAt: string
  /** Data freshness timestamp (most recent rollup), when known. */
  lastRefresh?: string
  workspaceId: string
  platforms: string[]
  comparison?: { from: string; to: string } | null
  /** True when a comparison window was requested (compareFrom/compareTo). */
  comparisonRequested?: boolean
  /** True when the comparison window actually has data (else it predates the
   * platform's retention and no period-over-period delta can be shown). */
  comparisonAvailable?: boolean
  /** True when some widgets/data are unavailable (09-data-contracts.md Ch 10). */
  partialData: boolean
  warnings: string[]
}

/** KPI contract (09-data-contracts.md Ch 4). All numeric fields backend-computed. */
export interface KpiContract {
  metricId: string
  key: string
  title: string
  value: number | null
  previousValue: number | null
  change: number | null
  changePercent: number | null
  trend: ContractTrend
  unit: MetricUnit
  dataQuality: DataQuality
  higherIsBetter: boolean
  /** Per-platform breakdown values when multiple platforms are connected.
   * Only populated in "All Platforms" mode to show Instagram vs Facebook contributions. */
  platformBreakdown?: Array<{ platform: string; value: number | null }>
}

/** A generic widget contract (09-data-contracts.md Ch 3). */
export interface WidgetContract {
  widgetId: string
  widgetType: string
  title: string
  metricIds: string[]
  lastUpdated?: string
  /** Widget-type-specific payload (chart series, table rows, etc.). */
  data: unknown
}

/** A named series in a chart widget. */
export interface ChartSeriesContract {
  key: string
  name: string
  unit: MetricUnit
}

/** Payload for a `timeseries` widget: labelled points + series definitions. */
export interface TimeseriesWidgetData {
  series: ChartSeriesContract[]
  points: Array<Record<string, string | number>>
}

/** Payload for a `distribution` widget (donut): labelled slices. */
export interface DistributionWidgetData {
  unit: MetricUnit
  slices: Array<{ label: string; value: number }>
}

/** Parsed gender-age entry (Meta format "F_18-24" split for display). */
export interface GenderAgeSlice {
  label: string   // e.g. "F 18-24"
  gender: 'F' | 'M' | 'U'
  ageRange: string // e.g. "18-24"
  value: number
}

/** Payload for the audience demographics widget (country + city + gender-age + active time). */
export interface AudienceDemographicsWidgetData {
  country: Array<{ label: string; value: number }>
  city: Array<{ label: string; value: number }>
  genderAge: GenderAgeSlice[]
  /** Hour-keyed active time: key = hour string "0"–"23", value = relative count.
   * Empty when Meta doesn't return data (small accounts / low activity). */
  activeTime: Record<string, number>
}

/** Payload for a `toplist` widget: ranked items. */
export interface TopListWidgetData {
  unit: MetricUnit
  items: Array<{ id: string; label: string; value: number; secondary?: string }>
}

/** Alert contract (09-data-contracts.md Ch 8). */
export interface AlertContract {
  alertId: string
  category: string
  severity: 'info' | 'success' | 'warning' | 'critical'
  title: string
  cause?: string
  suggestedAction?: string
  createdAt: string
}

/** A contextual action link in a recommendation. */
export interface RecommendationAction {
  /** Button label */
  label: string
  /** App-internal path (e.g. '/analytics/best-time') */
  path: string
}

/** Recommendation contract (09-data-contracts.md Ch 9). */
export interface RecommendationContract {
  recommendationId: string
  title: string
  explanation: string
  confidence: 'very_high' | 'high' | 'medium' | 'low'
  supportingMetricIds: string[]
  /** Contextual action buttons (links to relevant pages). */
  actions?: RecommendationAction[]
}

/**
 * The dashboard response envelope, identical in shape across all dashboards
 * (09-data-contracts.md Ch 1).
 */
export interface DashboardResponse {
  meta: DashboardMeta
  summary: { text: string; confidence: RecommendationContract['confidence'] } | null
  kpis: KpiContract[]
  widgets: WidgetContract[]
  alerts: AlertContract[]
  recommendations: RecommendationContract[]
  forecast: Record<string, unknown> | null
}
