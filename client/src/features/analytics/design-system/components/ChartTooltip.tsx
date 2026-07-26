/**
 * ChartTooltip — themed, unit-aware tooltip content for analytics charts.
 * Formats each series value by its unit (04-dashboard-architecture.md Ch 6).
 */

import { formatMetricValue } from '../format'
import type { ChartSeries } from '../types'

interface TooltipEntry {
  dataKey?: string | number
  name?: string
  value?: number | string
  color?: string
}

interface ChartTooltipProps {
  active?: boolean
  label?: string | number
  payload?: TooltipEntry[]
  series: ChartSeries[]
}

export function ChartTooltip({ active, label, payload, series }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  const unitByKey = new Map(series.map((s) => [s.key, s.unit]))

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-md dark:border-gray-700 dark:bg-gray-800">
      {label !== undefined && (
        <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
      )}
      <ul className="space-y-0.5">
        {payload.map((entry, i) => {
          const key = String(entry.dataKey ?? '')
          const unit = unitByKey.get(key) ?? 'count'
          const value = typeof entry.value === 'number' ? entry.value : Number(entry.value)
          return (
            <li key={`${key}-${i}`} className="flex items-center gap-2 text-sm">
              <span
                className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: entry.color }}
                aria-hidden="true"
              />
              <span className="text-gray-600 dark:text-gray-300">{entry.name}</span>
              <span className="ml-auto font-medium text-gray-900 dark:text-gray-100">
                {formatMetricValue(Number.isFinite(value) ? value : null, unit)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
