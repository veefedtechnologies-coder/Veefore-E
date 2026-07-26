/**
 * Veefore Analytics Design System — Shared Types (Phase 3).
 *
 * Presentation-layer types for the reusable analytics component library
 * (04-dashboard-architecture.md — Analytics Design System & Component Library).
 *
 * These mirror the backend metric model (server/features/analytics/metrics) and
 * will align with the dashboard data contracts (09-data-contracts.md, Phase 9).
 * They are intentionally duplicated on the client because the frontend cannot
 * import server code; the data-contract layer will formalize the boundary.
 *
 * IMPORTANT: per CODING_RULES Rule 9, these components DISPLAY values only. All
 * metric values, deltas, and percentages are computed on the backend and passed
 * in as props — never calculated here.
 */

/** Direction of a metric's change over the compared period. */
export type TrendDirection = 'up' | 'down' | 'flat'

/** Unit of a metric value (mirrors the backend MetricUnit). */
export type MetricUnit =
  | 'count'
  | 'percent'
  | 'ratio'
  | 'currency'
  | 'seconds'
  | 'score'
  | 'per_hour'

/** Data provenance label (mirrors the backend DataQuality). */
export type DataQuality = 'verified' | 'calculated' | 'estimated' | 'predicted'

/** Qualitative rating band vs. a benchmark (mirrors the backend RatingBand). */
export type RatingBand = 'excellent' | 'good' | 'average' | 'poor' | 'critical'

/** A single point in a sparkline series. */
export interface SparklinePoint {
  /** X label (e.g. date). Optional for sparklines. */
  label?: string
  value: number
}

/**
 * Everything a KPI card needs to render. All numeric fields are backend-provided
 * (data contract), never computed on the client.
 */
export interface KpiData {
  /** Metric ID (e.g. MTR-000001) for drill-down/traceability. */
  metricId?: string
  /** Metric title, e.g. "Followers". */
  title: string
  /** Current value, or `null` when unavailable. */
  value: number | null
  /** Previous-period value for comparison context. */
  previousValue?: number | null
  /** Absolute change vs. the compared period (backend-provided). */
  change?: number | null
  /** Percentage change vs. the compared period (backend-provided). */
  changePercent?: number | null
  /** Explicit trend direction; if omitted it is derived from the sign of change. */
  trend?: TrendDirection
  /** Value unit, used for formatting. */
  unit?: MetricUnit
  /** Optional sparkline series. */
  sparkline?: SparklinePoint[]
  /** Data provenance. */
  dataQuality?: DataQuality
  /** Rating vs. benchmark. */
  rating?: RatingBand
  /** ISO timestamp of the last successful refresh. */
  lastUpdated?: string
  /**
   * For metrics where a decrease is good (e.g. churn, failure rate), set false so
   * the trend colour/semantics invert. Defaults to true.
   */
  higherIsBetter?: boolean
}

/** A named data series for time-series / category charts. */
export interface ChartSeries {
  /** Stable key used to read the value from each data point. */
  key: string
  /** Human-readable series name shown in legend/tooltip. */
  name: string
  /** Optional explicit colour (hex). Falls back to the palette by index. */
  color?: string
  /** Unit for tooltip formatting. */
  unit?: MetricUnit
}

/** A single row of chart data: an x-axis label plus one value per series key. */
export interface ChartDataPoint {
  label: string
  [seriesKey: string]: string | number | null | undefined
}

/** Sort direction for tables. */
export type SortDirection = 'asc' | 'desc'

/** Current table sort state. */
export interface SortState {
  columnId: string
  direction: SortDirection
}

/** A table column definition. `T` is the row shape. */
export interface TableColumn<T> {
  /** Stable column id (also the sort key). */
  id: string
  /** Header label. */
  header: string
  /** Accessor returning the cell's raw value (used for default sorting). */
  accessor: (row: T) => string | number | null | undefined
  /** Optional custom cell renderer. */
  cell?: (row: T) => React.ReactNode
  /** Whether the column is sortable. Defaults to true. */
  sortable?: boolean
  /** Text alignment. Defaults to 'left'; numeric columns typically 'right'. */
  align?: 'left' | 'center' | 'right'
  /** Optional fixed width (Tailwind width class or CSS value). */
  width?: string
}

/** A selectable option for filters. */
export interface FilterOption {
  value: string
  label: string
}
