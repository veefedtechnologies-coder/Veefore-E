/**
 * HeatmapWidget — reveals temporal patterns (e.g. best posting time) as a
 * colour-intensity grid (05-widget-library.md Ch 9 Time Widgets). Intensity is a
 * pure display scaling of backend-provided values (Rule 9). Cells expose values
 * via title/aria for accessibility.
 */

import { useMemo } from 'react'

import { formatMetricValue } from '../design-system/format'
import type { MetricUnit } from '../design-system'
import { WidgetFrame } from './WidgetFrame'
import { heatmapIntensity } from './utils'
import type { HeatmapCell, WidgetBaseProps } from './types'

interface HeatmapWidgetProps extends WidgetBaseProps {
  cells?: HeatmapCell[]
  /** Column headers (e.g. hours). */
  xLabels: string[]
  /** Row headers (e.g. days of week). */
  yLabels: string[]
  unit?: MetricUnit
  /** Base RGB for the intensity ramp. Defaults to blue-500. */
  baseRgb?: [number, number, number]
}

export function HeatmapWidget({
  cells = [],
  xLabels,
  yLabels,
  unit = 'count',
  baseRgb = [59, 130, 246],
  ...frame
}: HeatmapWidgetProps) {
  const state = frame.state ?? (cells.length > 0 ? 'ready' : 'empty')

  const { lookup, max } = useMemo(() => {
    const map = new Map<string, number>()
    let m = 0
    for (const c of cells) {
      map.set(`${c.x}:${c.y}`, c.value)
      if (c.value > m) m = c.value
    }
    return { lookup: map, max: m }
  }, [cells])

  const [r, g, b] = baseRgb

  return (
    <WidgetFrame {...frame} state={state} bodyMinHeight={200}>
      <div className="overflow-x-auto">
        <div
          role="img"
          aria-label={`${frame.title} heatmap`}
          className="inline-grid gap-1"
          style={{ gridTemplateColumns: `auto repeat(${xLabels.length}, minmax(1.25rem, 1fr))` }}
        >
          {/* Header row */}
          <span />
          {xLabels.map((x) => (
            <span key={`h-${x}`} className="text-center text-[10px] text-gray-400 dark:text-gray-500">
              {x}
            </span>
          ))}

          {/* Data rows */}
          {yLabels.map((yLabel, y) => (
            <RowFragment
              key={yLabel}
              yLabel={yLabel}
              y={y}
              xLabels={xLabels}
              lookup={lookup}
              max={max}
              unit={unit}
              rgb={[r, g, b]}
            />
          ))}
        </div>
      </div>
    </WidgetFrame>
  )
}

function RowFragment({
  yLabel,
  y,
  xLabels,
  lookup,
  max,
  unit,
  rgb,
}: {
  yLabel: string
  y: number
  xLabels: string[]
  lookup: Map<string, number>
  max: number
  unit: MetricUnit
  rgb: [number, number, number]
}) {
  const [r, g, b] = rgb
  return (
    <>
      <span className="pr-2 text-right text-[10px] leading-5 text-gray-400 dark:text-gray-500">
        {yLabel}
      </span>
      {xLabels.map((xLabel, x) => {
        const value = lookup.get(`${x}:${y}`) ?? 0
        const intensity = heatmapIntensity(value, max)
        const opacity = value > 0 ? 0.12 + intensity * 0.88 : 0.04
        return (
          <div
            key={`${x}:${y}`}
            className="h-5 rounded-sm"
            style={{ backgroundColor: `rgba(${r}, ${g}, ${b}, ${opacity})` }}
            title={`${yLabel} ${xLabel}: ${formatMetricValue(value, unit)}`}
            aria-label={`${yLabel} ${xLabel}: ${formatMetricValue(value, unit)}`}
          />
        )
      })}
    </>
  )
}
