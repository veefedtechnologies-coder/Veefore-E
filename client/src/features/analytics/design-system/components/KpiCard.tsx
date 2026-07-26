/**
 * KpiCard — the standard headline-metric card of the Analytics Design System
 * (04-dashboard-architecture.md Ch 3). Shows title, current value, trend vs. the
 * compared period, an optional sparkline, benchmark rating, data-quality label,
 * and last-updated time.
 *
 * When `platformBreakdown` is provided and the active platform selection is
 * `'all'`, the card renders per-platform sub-rows below the combined total.
 * Rows where `supportLevel === 'NONE'` show a "Not supported on [Platform]"
 * label via MetricUnavailableLabel — never silently skipped (Requirement 6.5).
 * Rows with `unavailableReason` set render a "Data unavailable" label with a
 * reason tooltip — the platform section stays visible on partial failures
 * (Requirement 6.8).
 * When `isApproximateCombined` is true, the combined total is labelled
 * "Approximate Combined" (Requirement 5.4).
 *
 * In single-platform mode: when `metricKey` is provided and
 * `CapabilityGuard.getMetricSupport(platform, metricKey) === 'NONE'`, the
 * card's value area is replaced with a MetricUnavailableLabel — never zero
 * or blank (Requirement 6.5).
 *
 * States: normal, hover, selected, loading, error, no-data (Ch 3, Rule 13).
 * Clicking drills into the metric's dedicated page (06-dashboard-specifications
 * Ch 13). All values are backend-provided — never computed here (Rule 9).
 *
 * Requirements: 5.4, 5.5, 5.6, 6.5, 6.8
 */

import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

import { formatLastUpdated, formatMetricValue } from '../format'
import { FOCUS_RING_CLASS, SURFACE_CLASS } from '../tokens'
import type { KpiData } from '../types'
import { DataQualityBadge } from './DataQualityBadge'
import { RatingBadge } from './RatingBadge'
import { Sparkline } from './Sparkline'
import { TrendIndicator } from './TrendIndicator'
import { KpiCardSkeleton } from '../skeletons/KpiCardSkeleton'
import type { PlatformContribution } from '../../widgets/types'
import { useOptionalPlatformFilter } from '../../context/PlatformFilterContext'
import { PlatformBreakdownRows } from './PlatformBreakdownRows'
import { MetricUnavailableLabel } from './MetricUnavailableLabel'
import { CapabilityGuard } from '@platform-registry/index'
import type { PlatformId } from '@platform-registry/types'

interface KpiCardProps {
  data: KpiData
  isLoading?: boolean
  isError?: boolean
  /** When true, shows "Comparison unavailable" in the change slot instead of blank.
   * Set when the comparison period predates the platform's ~24-month data window. */
  comparisonUnavailable?: boolean
  /** Drill-down handler; when provided the card becomes an interactive button. */
  onClick?: () => void
  onRetry?: () => void
  isSelected?: boolean
  className?: string
  /**
   * The normalized metric key for this card (e.g. `'saves'`, `'facebook_reactions'`).
   * When provided and the active platform selection is a single platform,
   * `CapabilityGuard.getMetricSupport(platform, metricKey)` is consulted before
   * rendering the value. If the result is `'NONE'`, a MetricUnavailableLabel is
   * shown instead of the metric value (Requirement 6.5).
   */
  metricKey?: string
  /**
   * Per-platform contribution rows. When present and the active platform
   * selection is `'all'`, sub-rows are rendered below the combined total.
   * Rows where `supportLevel === 'NONE'` display a "Not supported on [Platform]"
   * label (Requirement 6.5).
   * Requirements: 5.4, 5.5
   */
  platformBreakdown?: PlatformContribution[]
  /**
   * When true, the combined total label reads "Approximate Combined" instead
   * of a plain numeric sum, used for non-additive metrics (Requirement 5.4).
   */
  isApproximateCombined?: boolean
}

export function KpiCard({
  data,
  isLoading,
  isError,
  comparisonUnavailable,
  onClick,
  onRetry,
  isSelected,
  className,
  metricKey,
  platformBreakdown,
  isApproximateCombined,
}: KpiCardProps) {
  // Read the active platform filter from context (optional — safe when used
  // outside a PlatformFilterProvider, e.g. in tests or Storybook).
  // When no provider is present the hook returns null and we fall back to
  // 'all', which means breakdown rows will still render if provided. In a
  // real single-platform workspace the caller simply never passes
  // `platformBreakdown`, so this fallback is inert.
  const platformCtx = useOptionalPlatformFilter()
  const platformSelection = platformCtx?.selection ?? 'all'

  // ── Single-platform NONE check (Requirement 6.5) ─────────────────────────
  // When a specific platform is selected (not 'all') and a metricKey is
  // provided, consult CapabilityGuard to determine whether the metric is
  // supported. If the result is NONE, the card shows MetricUnavailableLabel
  // instead of the metric value — never a zero or blank.
  const singlePlatform =
    platformSelection !== 'all'
      ? (platformSelection as PlatformId)
      : null

  const isSinglePlatformNone =
    singlePlatform !== null &&
    metricKey !== undefined &&
    CapabilityGuard.getMetricSupport(singlePlatform, metricKey) === 'NONE'

  // Determine which platform sub-rows should be rendered.
  // Rules (Requirements 5.4, 5.5, 5.6, 6.5, 6.8):
  //   • Only rendered when `platformSelection === 'all'` and `platformBreakdown` is non-empty.
  //   • Rows where `supportLevel === 'NONE'` are now KEPT — PlatformBreakdownRows
  //     renders MetricUnavailableLabel for them (Requirement 6.5).
  //   • Rows with `unavailableReason` ARE kept: partial fetch failure — PlatformBreakdownRows
  //     renders DataUnavailableLabel with tooltip (Req 6.8).
  const visibleBreakdown =
    platformSelection === 'all' && platformBreakdown && platformBreakdown.length > 0
      ? platformBreakdown
      : []

  if (isLoading) return <KpiCardSkeleton className={className} />

  if (isError) {
    return (
      <div className={cn(SURFACE_CLASS, 'p-5', className)} role="alert">
        <p className="text-sm font-medium text-gray-600 dark:text-gray-300">{data.title}</p>
        <div className="mt-3 flex items-center gap-2 text-red-600 dark:text-red-400">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <span className="text-sm">Failed to load</span>
        </div>
        {onRetry && (
          <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    )
  }

  const {
    title,
    value,
    unit = 'count',
    change,
    changePercent,
    trend,
    sparkline,
    dataQuality,
    rating,
    lastUpdated,
    higherIsBetter = true,
  } = data

  const hasValue = value !== null && value !== undefined
  const updatedLabel = formatLastUpdated(lastUpdated)
  const interactive = typeof onClick === 'function'

  // Label shown above the combined-total value line.
  // When `isApproximateCombined` is true, the total is non-exact (e.g. reach
  // cannot be summed across platforms without double-counting), so we replace
  // the bare value with an "Approximate Combined" qualifier.
  const combinedLabel =
    visibleBreakdown.length > 0 && isApproximateCombined
      ? 'Approximate Combined'
      : null

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-gray-600 dark:text-gray-300">{title}</p>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          {rating && <RatingBadge rating={rating} />}
          {dataQuality && <DataQualityBadge quality={dataQuality} />}
        </div>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {combinedLabel && (
            <p className="mb-0.5 text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">
              {combinedLabel}
            </p>
          )}
          {/* Requirement 6.5: when the active single-platform selection has
              NONE support for this metric, render the unavailable label
              instead of a value — never show zero or blank. */}
          {isSinglePlatformNone ? (
            <MetricUnavailableLabel platform={singlePlatform!} className="mt-1" />
          ) : (
            <p className="truncate text-2xl font-bold text-gray-900 dark:text-gray-100">
              {hasValue ? formatMetricValue(value, unit) : 'No data'}
            </p>
          )}
          <div className="mt-1 h-5">
            {!isSinglePlatformNone && comparisonUnavailable ? (
              <span className="inline-flex items-center text-xs text-gray-400 dark:text-gray-500" title="Comparison period is older than Instagram's ~24-month data window">
                — No comparison data
              </span>
            ) : !isSinglePlatformNone && hasValue && (
              <TrendIndicator
                trend={trend}
                change={change}
                changePercent={changePercent}
                unit={unit}
                higherIsBetter={higherIsBetter}
              />
            )}
          </div>
        </div>
        {!isSinglePlatformNone && sparkline && sparkline.length > 1 && (
          <Sparkline data={sparkline} className="w-24 flex-shrink-0" />
        )}
      </div>

      {/* Platform breakdown sub-rows — only when 'All Platforms' is active.
          NONE rows now show MetricUnavailableLabel inside PlatformBreakdownRows
          (Requirements 5.4–5.6, 6.5). */}
      {visibleBreakdown.length > 0 && (
        <PlatformBreakdownRows rows={visibleBreakdown} unit={unit} />
      )}

      {updatedLabel && (
        <p className="mt-3 text-[11px] text-gray-400 dark:text-gray-500">Updated {updatedLabel}</p>
      )}
    </>
  )

  const base = cn(
    SURFACE_CLASS,
    'p-5 transition-shadow',
    isSelected && 'ring-2 ring-blue-500',
    className
  )

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`${title}${hasValue ? `: ${formatMetricValue(value, unit)}` : ''}. View details`}
        aria-pressed={isSelected}
        className={cn(base, 'text-left hover:shadow-md', FOCUS_RING_CLASS)}
      >
        {body}
      </button>
    )
  }

  return <div className={base}>{body}</div>
}
