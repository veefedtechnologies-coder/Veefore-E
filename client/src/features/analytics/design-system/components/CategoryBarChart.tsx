/**
 * CategoryBarChart — bar chart for categorical comparisons (e.g. reach by
 * source, engagement by content type). 04-dashboard-architecture.md Ch 2;
 * 05-widget-library.md Ch 6 Distribution Widgets. Presentation-only.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { compactNumber } from '../format'
import { seriesColor } from '../tokens'
import type { ChartDataPoint, ChartSeries } from '../types'
import { ChartTooltip } from './ChartTooltip'
import { useChartTheme } from './useChartTheme'

interface CategoryBarChartProps {
  data: ChartDataPoint[]
  series: ChartSeries[]
  /** Stack bars instead of grouping them. */
  stacked?: boolean
  /** Horizontal bars (useful for long category labels). */
  layout?: 'horizontal' | 'vertical'
  height?: number
  showLegend?: boolean
  ariaLabel?: string
}

export function CategoryBarChart({
  data,
  series,
  stacked = false,
  layout = 'horizontal',
  height = 288,
  showLegend = true,
  ariaLabel,
}: CategoryBarChartProps) {
  const { axis } = useChartTheme()
  const tickStyle = { fontSize: 12, fill: axis.text }
  const isVertical = layout === 'vertical'
  const label = ariaLabel ?? `Bar chart of ${series.map((s) => s.name).join(', ')}`

  return (
    <div role="img" aria-label={label} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout={layout}
          margin={{ top: 8, right: 12, bottom: 0, left: isVertical ? 12 : 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={axis.grid} vertical={isVertical} horizontal={!isVertical} />
          {isVertical ? (
            <>
              <XAxis type="number" tick={tickStyle} axisLine={false} tickLine={false} tickFormatter={(v: number) => compactNumber(v)} />
              <YAxis type="category" dataKey="label" tick={tickStyle} axisLine={false} tickLine={false} width={96} />
            </>
          ) : (
            <>
              <XAxis dataKey="label" tick={tickStyle} axisLine={false} tickLine={false} minTickGap={16} />
              <YAxis tick={tickStyle} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => compactNumber(v)} />
            </>
          )}
          <Tooltip
            cursor={{ fill: axis.grid, fillOpacity: 0.3 }}
            content={({ active, label: l, payload }) => (
              <ChartTooltip active={active} label={l} payload={payload as never} series={series} />
            )}
          />
          {showLegend && series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />}
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              fill={seriesColor(s.color, i)}
              radius={isVertical ? [0, 4, 4, 0] : [4, 4, 0, 0]}
              stackId={stacked ? 'stack' : undefined}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
