/**
 * BenchmarkKpiWidget — a KPI compared against benchmarks (industry, competitor,
 * historical, target) (05-widget-library.md Ch 3.3 & Ch 14). Comparison values
 * are backend-provided; concrete industry benchmark ranges remain pending spec
 * (OPEN_SPEC_ITEMS ASI-003), so this renders whatever comparisons it is given.
 */

import { formatMetricValue } from '../design-system/format'
import type { MetricUnit, RatingBand } from '../design-system'
import { RatingBadge } from '../design-system/components/RatingBadge'
import { WidgetFrame } from './WidgetFrame'
import type { BenchmarkComparison, WidgetBaseProps } from './types'

interface BenchmarkKpiWidgetProps extends WidgetBaseProps {
  value?: number | null
  unit?: MetricUnit
  comparisons?: BenchmarkComparison[]
  rating?: RatingBand
}

export function BenchmarkKpiWidget({
  value,
  unit = 'count',
  comparisons = [],
  rating,
  ...frame
}: BenchmarkKpiWidgetProps) {
  const hasValue = value !== null && value !== undefined
  const state = frame.state ?? (hasValue ? 'ready' : 'empty')

  return (
    <WidgetFrame {...frame} state={state} bodyMinHeight={120}>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {hasValue ? formatMetricValue(value, unit) : 'No data'}
          </p>
          {rating && <RatingBadge rating={rating} />}
        </div>
        {comparisons.length > 0 && (
          <dl className="space-y-1.5">
            {comparisons.map((c) => (
              <div key={c.label} className="flex items-center justify-between text-sm">
                <dt className="text-gray-500 dark:text-gray-400">{c.label}</dt>
                <dd className="font-medium text-gray-800 dark:text-gray-200">
                  {formatMetricValue(c.value, unit)}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </WidgetFrame>
  )
}
