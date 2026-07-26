/**
 * DistributionWidget — composition/share visualization as a donut with a value
 * legend (05-widget-library.md Ch 6 Distribution Widgets). Used for audience
 * demographics, device split, content mix, etc. Presentation-only.
 */

import { useMemo } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

import { formatMetricValue } from '../design-system/format'
import { seriesColor } from '../design-system/tokens'
import type { MetricUnit } from '../design-system'
import { ChartTooltip } from '../design-system/components/ChartTooltip'
import { WidgetFrame } from './WidgetFrame'
import type { WidgetBaseProps } from './types'

export interface DistributionSlice {
  label: string
  value: number
  color?: string
}

interface DistributionWidgetProps extends WidgetBaseProps {
  data?: DistributionSlice[]
  unit?: MetricUnit
  height?: number
}

export function DistributionWidget({
  data = [],
  unit = 'count',
  height = 240,
  ...frame
}: DistributionWidgetProps) {
  const state = frame.state ?? (data.length > 0 ? 'ready' : 'empty')

  const total = useMemo(() => data.reduce((sum, d) => sum + (d.value || 0), 0), [data])
  const tooltipSeries = useMemo(
    () => data.map((d) => ({ key: d.label, name: d.label, unit })),
    [data, unit]
  )

  return (
    <WidgetFrame {...frame} state={state} bodyMinHeight={height}>
      <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-2">
        <div role="img" aria-label={`${frame.title} distribution`} style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="label"
                innerRadius="60%"
                outerRadius="90%"
                paddingAngle={1}
                isAnimationActive={false}
              >
                {data.map((slice, i) => (
                  <Cell key={slice.label} fill={seriesColor(slice.color, i)} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => (
                  <ChartTooltip active={active} payload={payload as never} series={tooltipSeries} />
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <ul className="space-y-1.5">
          {data.map((slice, i) => {
            const share = total > 0 ? Math.round((slice.value / total) * 100) : 0
            return (
              <li key={slice.label} className="flex items-center gap-2 text-sm">
                <span
                  className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: seriesColor(slice.color, i) }}
                  aria-hidden="true"
                />
                <span className="flex-1 truncate text-gray-600 dark:text-gray-300">{slice.label}</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {formatMetricValue(slice.value, unit)}
                </span>
                <span className="w-10 text-right text-gray-400 dark:text-gray-500">{share}%</span>
              </li>
            )
          })}
        </ul>
      </div>
    </WidgetFrame>
  )
}
