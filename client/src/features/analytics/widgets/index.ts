/**
 * Veefore Analytics — Widget Library public API (Phase 5).
 *
 * Reusable analytics widgets built on the design system (Phase 3) and dashboard
 * framework (Phase 4). Every widget uses the shared {@link WidgetFrame} for
 * consistent header, states, and interactions (05-widget-library.md). Widgets
 * are presentation-only and receive contract-shaped data (CODING_RULES Rule 9).
 */

// Types & utils
export type {
  WidgetState,
  WidgetBaseProps,
  ConfidenceLevel,
  AlertSeverity,
  ForecastData,
  BenchmarkComparison,
  GoalData,
  TopPerformerItem,
  FunnelStage,
  HeatmapCell,
  AIInsight,
  AlertItem,
} from './types'
export { progressFraction, heatmapIntensity, CONFIDENCE_LABEL, CONFIDENCE_SHORT } from './utils'

// Frame & shared atoms
export { WidgetFrame } from './WidgetFrame'
export { WidgetActionsMenu } from './WidgetActionsMenu'
export { ConfidenceBadge } from './ConfidenceBadge'

// KPI family (standard KPI is the design-system KpiCard)
export { KpiCard as StandardKpiWidget } from '../design-system'
export { ForecastKpiWidget } from './ForecastKpiWidget'
export { BenchmarkKpiWidget } from './BenchmarkKpiWidget'
export { GoalKpiWidget } from './GoalKpiWidget'
export { HealthKpiWidget } from './HealthKpiWidget'

// Charts / distribution
export { TrendWidget } from './TrendWidget'
export { DistributionWidget, type DistributionSlice } from './DistributionWidget'

// Performance / time / funnel
export { TopPerformersWidget } from './TopPerformersWidget'
export { HeatmapWidget } from './HeatmapWidget'
export { FunnelWidget } from './FunnelWidget'

// AI
export { AISummaryWidget } from './AISummaryWidget'
export { AIInsightWidget } from './AIInsightWidget'

// Alerts
export { AlertWidget } from './AlertWidget'
export { AlertsWidget } from './AlertsWidget'
