/**
 * Veefore Analytics — Widget Library Types (Phase 5).
 *
 * A widget is the smallest reusable analytics building block
 * (05-widget-library.md Ch 1–2). These types describe the widget frame and the
 * data each widget family consumes. Widgets are presentation-only and receive
 * backend/contract-shaped data — they never call platform APIs or compute
 * analytics (CODING_RULES Rule 9; 05-widget-library.md Ch 1 lifecycle).
 */

import type { ReactNode } from 'react'
import type { DataQuality, MetricUnit, RatingBand, SparklinePoint } from '../design-system'
import type { DrillDownTarget } from '../dashboard'
import type { PlatformId, MetricSupportLevel } from '@platform-registry/types'

/** Widget lifecycle states (05-widget-library.md; CODING_RULES Rule 13). */
export type WidgetState = 'ready' | 'loading' | 'refreshing' | 'empty' | 'error' | 'partial'

/** AI/analytics confidence label (11-ai-intelligence-engine.md Ch 13). */
export type ConfidenceLevel = 'very_high' | 'high' | 'medium' | 'low'

/** Alert severity (05-widget-library.md Ch 15). */
export type AlertSeverity = 'info' | 'success' | 'warning' | 'critical'

/**
 * Props shared by every widget via the {@link WidgetFrame}. Action callbacks are
 * optional; the corresponding control only renders when a handler is provided.
 */
export interface WidgetBaseProps {
  title: string
  subtitle?: string
  state?: WidgetState
  /** ISO timestamp of last successful refresh. */
  lastUpdated?: string
  /** Provenance badge shown in the header. */
  dataQuality?: DataQuality
  /** Drill-down destination for the whole widget. */
  drillDown?: DrillDownTarget
  /** Export handler (CSV/PNG/PDF — wired in later phases). */
  onExport?: () => void
  /** "Explain with AI" handler (11-ai-intelligence-engine.md). */
  onExplain?: () => void
  /** Fullscreen handler. */
  onFullscreen?: () => void
  /** Refresh handler. */
  onRefresh?: () => void
  /** Retry handler shown in the error state. */
  onRetry?: () => void
  /** Message shown in the empty state. */
  emptyMessage?: string
  className?: string
}

/** Forecast KPI data (05-widget-library.md Ch 3.2). */
export interface ForecastData {
  value: number
  /** Prediction interval bounds. */
  lower?: number
  upper?: number
  confidence: ConfidenceLevel
  /** Optional historical + projected series for the mini graph. */
  series?: SparklinePoint[]
}

/** A single benchmark comparison row (05-widget-library.md Ch 3.3, Ch 14). */
export interface BenchmarkComparison {
  label: string
  value: number
}

/** Goal KPI data (05-widget-library.md Ch 3.4). */
export interface GoalData {
  current: number
  goal: number
  unit?: MetricUnit
  /** Amount remaining (backend-provided). */
  remaining?: number
  /** Estimated completion date (ISO or display string). */
  estimatedCompletion?: string
}

/** A ranked item in a performance widget (05-widget-library.md Ch 7). */
export interface TopPerformerItem {
  id: string
  label: string
  value: number
  unit?: MetricUnit
  /** Optional secondary metric line. */
  secondary?: string
  /** Optional thumbnail URL (image or video thumbnail). */
  thumbnailUrl?: string
  /** Media type: IMAGE | VIDEO | CAROUSEL_ALBUM */
  mediaType?: string
  /** Direct post permalink (e.g. Instagram URL). */
  permalink?: string
  /** Individual metric breakdown shown on expanded/card view. */
  metrics?: {
    reach?: number
    views?: number
    likes?: number
    comments?: number
    shares?: number
    saves?: number
    engagements?: number
  }
  /** Publish date ISO string. */
  publishedAt?: string
  /** Drill-down to the item's detail. */
  drillDown?: DrillDownTarget
}

/** A funnel stage (05-widget-library.md Ch 10). All values backend-provided. */
export interface FunnelStage {
  label: string
  count: number
  /** Conversion % from the first stage (backend-provided). */
  conversionPercent?: number
  /** Drop-off % from the previous stage (backend-provided). */
  dropOffPercent?: number
}

/** A heatmap cell (05-widget-library.md Ch 9 time widgets). */
export interface HeatmapCell {
  /** Column index (e.g. hour). */
  x: number
  /** Row index (e.g. day of week). */
  y: number
  value: number
}

/** An AI insight (09-data-contracts.md Ch 7; 11-ai-intelligence-engine.md). */
export interface AIInsight {
  id: string
  title: string
  explanation: string
  confidence: ConfidenceLevel
  /** Supporting metric IDs (evidence — required, Rule 16). */
  supportingMetricIds?: string[]
  /** Links to supporting charts/pages. */
  evidence?: { label: string; target: DrillDownTarget }[]
  /** Contextual action buttons with navigation paths. */
  actions?: Array<{ label: string; path: string }>
}

/** An alert (09-data-contracts.md Ch 8; 05-widget-library.md Ch 15). */
export interface AlertItem {
  id: string
  category: string
  severity: AlertSeverity
  title: string
  cause?: string
  suggestedAction?: string
  createdAt?: string
  drillDown?: DrillDownTarget
}

/** A ready-made action node for widget headers. */
export type WidgetHeaderAction = ReactNode

/** Rating band re-export for widget consumers. */
export type { RatingBand }

// ── Platform-aware KPI extension types ──

/** Per-platform contribution to a combined KPI value (Requirements 5.4, 5.5, 6.8). */
export interface PlatformContribution {
  platform: PlatformId
  value: number | null
  supportLevel: MetricSupportLevel
  /**
   * When set, the metric fetch for this platform/metric combination partially
   * failed. The row renders "Data unavailable" with this string as the tooltip
   * reason instead of the numeric value (Requirement 6.8, 9.7).
   *
   * Takes priority over `value` — if `unavailableReason` is set, `value` is
   * ignored and the unavailability label is shown.
   */
  unavailableReason?: string
}

/** Optional platform breakdown props for KPI card widgets (Requirements 5.4, 5.5). */
export interface KpiPlatformProps {
  /**
   * Per-platform breakdown rows shown below the combined total.
   * Rows where `supportLevel === 'NONE'` must be omitted by the renderer.
   */
  platformBreakdown?: PlatformContribution[]
  /**
   * When true, the combined total is labelled "Approximate Combined"
   * rather than a precise sum (e.g. when platforms measure the same
   * metric differently).
   */
  isApproximateCombined?: boolean
}
