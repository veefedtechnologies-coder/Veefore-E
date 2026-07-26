/**
 * Veefore Analytics — Client Dashboard Contracts (Phase 9).
 *
 * Client mirror of the server response envelope
 * (server/features/analytics/api/contracts.ts; 09-data-contracts.md). The client
 * cannot import server code, so these types are duplicated at the contract
 * boundary and kept in sync by the shared contract version.
 *
 * These are read-only shapes the frontend DISPLAYS — all values are computed on
 * the backend (CODING_RULES Rule 9).
 */

import type { ChartDataPoint, ChartSeries, DataQuality, MetricUnit, TrendDirection } from '../design-system'
import type { AIInsight, ConfidenceLevel, DistributionSlice, TopPerformerItem } from '../widgets'

/** Must match the server `ANALYTICS_CONTRACT_VERSION`. */
export const ANALYTICS_CONTRACT_VERSION = 'v1'

/** Response metadata (09-data-contracts.md Ch 2). */
export interface DashboardMeta {
  requestId: string
  dashboardId: string
  apiVersion: string
  generatedAt: string
  lastRefresh?: string
  workspaceId: string
  platforms: string[]
  comparison?: { from: string; to: string } | null
  comparisonRequested?: boolean
  comparisonAvailable?: boolean
  partialData: boolean
  warnings: string[]
}

/** KPI contract (09-data-contracts.md Ch 4). */
export interface KpiContract {
  metricId: string
  key: string
  title: string
  value: number | null
  previousValue: number | null
  change: number | null
  changePercent: number | null
  trend: TrendDirection
  unit: MetricUnit
  dataQuality: DataQuality
  higherIsBetter: boolean
  /** Per-platform breakdown values when multiple platforms are connected. */
  platformBreakdown?: Array<{ platform: string; value: number | null }>
}

/** Generic widget contract (09-data-contracts.md Ch 3). */
export interface WidgetContract {
  widgetId: string
  widgetType: string
  title: string
  metricIds: string[]
  lastUpdated?: string
  data: unknown
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

/** Recommendation contract (09-data-contracts.md Ch 9). */
export interface RecommendationContract {
  recommendationId: string
  title: string
  explanation: string
  confidence: ConfidenceLevel
  supportingMetricIds: string[]
  /** Contextual action buttons (links to relevant pages). */
  actions?: Array<{ label: string; path: string }>
}

/** The dashboard response envelope (09-data-contracts.md Ch 1). */
export interface DashboardResponse {
  meta: DashboardMeta
  summary: { text: string; confidence: ConfidenceLevel } | null
  kpis: KpiContract[]
  widgets: WidgetContract[]
  alerts: AlertContract[]
  recommendations: RecommendationContract[]
  forecast: Record<string, unknown> | null
}

/** Payload of a `timeseries` widget, shaped for direct use by TimeSeriesChart. */
export interface TimeseriesWidgetData {
  series: ChartSeries[]
  points: ChartDataPoint[]
}

/** Distribution (donut) widget payload, shaped for {@link DistributionWidget}. */
export interface DistributionWidgetData {
  title: string
  unit: MetricUnit
  slices: DistributionSlice[]
}

/** Top-list widget payload, shaped for {@link TopPerformersWidget}. */
export interface TopListWidgetData {
  title: string
  unit: MetricUnit
  items: TopPerformerItem[]
}

/** Audience demographics widget payload. */
export interface GenderAgeSlice {
  label: string
  gender: 'F' | 'M' | 'U'
  ageRange: string
  value: number
}

export interface AudienceDemographicsWidgetData {
  country: DistributionSlice[]
  city: DistributionSlice[]
  genderAge: GenderAgeSlice[]
  activeTime: Record<string, number>
}

/**
 * Extract the primary time-series widget's data from a dashboard response, or
 * `null` when there is none / no points.
 */
export function getTimeseriesWidget(res: DashboardResponse | undefined): TimeseriesWidgetData | null {
  const widget = res?.widgets.find((w) => w.widgetType === 'timeseries')
  if (!widget) return null
  const data = widget.data as TimeseriesWidgetData | undefined
  if (!data || !Array.isArray(data.points) || data.points.length === 0) return null
  return data
}

/**
 * Extract the first `distribution` widget (e.g. audience by country) from a
 * dashboard response, or `null` when there is none / no slices.
 */
export function getDistributionWidget(res: DashboardResponse | undefined): DistributionWidgetData | null {
  const widget = res?.widgets.find((w) => w.widgetType === 'distribution')
  if (!widget) return null
  const data = widget.data as { unit?: MetricUnit; slices?: DistributionSlice[] } | undefined
  if (!data || !Array.isArray(data.slices) || data.slices.length === 0) return null
  return { title: widget.title, unit: data.unit ?? 'count', slices: data.slices }
}

/**
 * Extract the first `toplist` widget (e.g. top performing content) from a
 * dashboard response, or `null` when there is none / no items.
 */
export function getTopListWidget(res: DashboardResponse | undefined): TopListWidgetData | null {
  const widget = res?.widgets.find((w) => w.widgetType === 'toplist')
  if (!widget) return null
  const data = widget.data as { unit?: MetricUnit; items?: TopPerformerItem[] } | undefined
  if (!data || !Array.isArray(data.items) || data.items.length === 0) return null
  return { title: widget.title, unit: data.unit ?? 'count', items: data.items }
}

/**
 * Map backend recommendation contracts to {@link AIInsight} cards for display.
 * Every insight carries its confidence + supporting metric IDs (Rule 16).
 */
export function getRecommendationInsights(res: DashboardResponse | undefined): AIInsight[] {
  return (res?.recommendations ?? []).map((r) => ({
    id: r.recommendationId,
    title: r.title,
    explanation: r.explanation,
    confidence: r.confidence,
    supportingMetricIds: r.supportingMetricIds,
    actions: r.actions,
  }))
}

/**
 * Extract the audience demographics widget, or null.
 */
export function getAudienceDemographicsWidget(res: DashboardResponse | undefined): AudienceDemographicsWidgetData | null {
  const widget = res?.widgets.find((w) => w.widgetType === 'audience_demographics')
  if (!widget) return null
  const data = widget.data as AudienceDemographicsWidgetData | undefined
  if (!data) return null
  return data
}
