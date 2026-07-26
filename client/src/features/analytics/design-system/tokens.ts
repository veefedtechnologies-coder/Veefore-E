/**
 * Veefore Analytics Design System — Tokens (Phase 3).
 *
 * The dedicated visual language for the Analytics workspace
 * (04-dashboard-architecture.md Ch 1). Centralizes colours, the chart palette,
 * and semantic class maps so no component hardcodes styling values
 * (CODING_RULES Rule 5 & Rule 7). All values are theme-aware via Tailwind
 * `dark:` variants, except chart series colours which must be concrete hex
 * values for SVG rendering (chosen to read well on both light and dark).
 */

import type { DataQuality, RatingBand, TrendDirection } from './types'

/**
 * Categorical chart palette — accessible, distinct hues that work on light and
 * dark backgrounds. Series without an explicit colour cycle through these.
 */
export const CHART_PALETTE: readonly string[] = [
  '#3b82f6', // blue-500
  '#8b5cf6', // violet-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#ef4444', // red-500
  '#84cc16', // lime-500
]

/** Resolve a series colour by explicit value or palette index. */
export function seriesColor(explicit: string | undefined, index: number): string {
  return explicit ?? CHART_PALETTE[index % CHART_PALETTE.length]
}

/** Trend direction → text colour classes (semantic, not hardcoded per component). */
export const TREND_COLOR: Record<TrendDirection, string> = {
  up: 'text-emerald-600 dark:text-emerald-400',
  down: 'text-red-600 dark:text-red-400',
  flat: 'text-gray-500 dark:text-gray-400',
}

/**
 * Rating band → badge classes. Ordered best→worst; used by benchmark badges and
 * health indicators once benchmark ranges are defined (see OPEN_SPEC_ITEMS
 * ASI-003).
 */
export const RATING_BADGE: Record<RatingBand, string> = {
  excellent: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  good: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  average: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  poor: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  critical: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

/** Human-readable label per rating band. */
export const RATING_LABEL: Record<RatingBand, string> = {
  excellent: 'Excellent',
  good: 'Good',
  average: 'Average',
  poor: 'Poor',
  critical: 'Critical',
}

/**
 * Data-quality → badge metadata. Distinguishing verified facts from estimates
 * and predictions is required for trust (CODING_RULES Rule 16;
 * 07-data-event-architecture.md Ch 9).
 */
export const QUALITY_META: Record<
  DataQuality,
  { label: string; description: string; className: string }
> = {
  verified: {
    label: 'Verified',
    description: 'Reported directly by the platform.',
    className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  calculated: {
    label: 'Calculated',
    description: 'Derived deterministically from verified data.',
    className: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  estimated: {
    label: 'Estimated',
    description: 'Modelled because the platform does not expose it directly.',
    className: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
  predicted: {
    label: 'Predicted',
    description: 'AI forecast — not an observed value.',
    className: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  },
}

/** Shared surface (card/panel) classes for analytics components. */
export const SURFACE_CLASS =
  'rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'

/** Shared focus-ring classes for interactive analytics elements. */
export const FOCUS_RING_CLASS =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-gray-800'

/** Axis/grid colours for charts, split by theme (SVG needs concrete values). */
export const CHART_AXIS = {
  light: { grid: '#e5e7eb', text: '#6b7280' },
  dark: { grid: '#374151', text: '#9ca3af' },
} as const
