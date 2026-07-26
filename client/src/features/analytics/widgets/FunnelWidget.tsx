/**
 * FunnelWidget — visualizes a conversion funnel: each stage shows its count,
 * conversion %, and drop-off (05-widget-library.md Ch 10 Funnel Widgets). Bar
 * widths scale to the first stage (display only); conversion/drop-off values are
 * backend-provided (Rule 9).
 */

import { useMemo } from 'react'

import { formatMetricValue, formatPercentChange } from '../design-system/format'
import { seriesColor } from '../design-system/tokens'
import type { MetricUnit } from '../design-system'
import { WidgetFrame } from './WidgetFrame'
import type { FunnelStage, WidgetBaseProps } from './types'

interface FunnelWidgetProps extends WidgetBaseProps {
  stages?: FunnelStage[]
  unit?: MetricUnit
}

export function FunnelWidget({ stages = [], unit = 'count', ...frame }: FunnelWidgetProps) {
  const state = frame.state ?? (stages.length > 0 ? 'ready' : 'empty')
  const topCount = useMemo(() => (stages.length > 0 ? Math.max(stages[0].count, 1) : 1), [stages])

  return (
    <WidgetFrame {...frame} state={state} bodyMinHeight={160}>
      <ol className="space-y-2">
        {stages.map((stage, i) => {
          const widthPct = Math.max(4, Math.round((stage.count / topCount) * 100))
          const color = seriesColor(undefined, 0)
          return (
            <li key={stage.label}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-gray-800 dark:text-gray-200">{stage.label}</span>
                <span className="text-gray-900 dark:text-gray-100">
                  {formatMetricValue(stage.count, unit)}
                  {stage.conversionPercent !== undefined && (
                    <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                      {Math.round(stage.conversionPercent)}%
                    </span>
                  )}
                </span>
              </div>
              <div className="h-6 w-full overflow-hidden rounded-md bg-gray-100 dark:bg-gray-700/50">
                <div
                  className="h-full rounded-md"
                  style={{ width: `${widthPct}%`, backgroundColor: color, opacity: 1 - i * 0.12 }}
                />
              </div>
              {stage.dropOffPercent !== undefined && i > 0 && (
                <p className="mt-0.5 text-right text-[11px] text-red-500 dark:text-red-400">
                  {formatPercentChange(-Math.abs(stage.dropOffPercent))} drop-off
                </p>
              )}
            </li>
          )
        })}
      </ol>
    </WidgetFrame>
  )
}
