/**
 * TimeSeriesChart — the core trend visualization (line or area) for analytics
 * (04-dashboard-architecture.md Ch 2 Charts; 05-widget-library.md Ch 5 Trend
 * Widgets). Theme-aware, unit-aware tooltip, multi-series with comparison
 * overlays. Presentation-only: receives contract-shaped data.
 *
 * Render inside a {@link ChartContainer}, which supplies the frame and states.
 */

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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

interface TimeSeriesChartProps {
  data: ChartDataPoint[]
  series: ChartSeries[]
  variant?: 'line' | 'area' | 'bar'
  height?: number
  showLegend?: boolean
  showGrid?: boolean
  /** Accessible description of what the chart shows. */
  ariaLabel?: string
}

export function TimeSeriesChart({
  data,
  series,
  variant = 'line',
  height = 288,
  showLegend = true,
  showGrid = true,
  ariaLabel,
}: TimeSeriesChartProps) {
  const { axis } = useChartTheme()

  const tickStyle = { fontSize: 12, fill: axis.text }
  const label =
    ariaLabel ?? `Time series chart of ${series.map((s) => s.name).join(', ')}`

  // Bar charts use BarChart root; line/area use their respective roots.
  if (variant === 'bar') {
    return (
      <div role="img" aria-label={label} style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barGap={2} barCategoryGap="30%">
            {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={axis.grid} vertical={false} />}
            <XAxis dataKey="label" tick={tickStyle} axisLine={false} tickLine={false} minTickGap={24} />
            <YAxis
              tick={tickStyle}
              axisLine={false}
              tickLine={false}
              width={44}
              allowDecimals={false}
              tickFormatter={(v: number) => compactNumber(v)}
            />
            <Tooltip
              content={({ active, label: l, payload }) => (
                <ChartTooltip active={active} label={l} payload={payload as never} series={series} />
              )}
              cursor={{ fill: axis.grid, opacity: 0.5 }}
            />
            {showLegend && series.length > 1 && (
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="square" />
            )}
            {series.map((s, i) => {
              const color = seriesColor(s.color, i)
              return (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.name}
                  fill={color}
                  fillOpacity={0.85}
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                  maxBarSize={40}
                />
              )
            })}
          </BarChart>
        </ResponsiveContainer>
      </div>
    )
  }

  const ChartRoot = variant === 'area' ? AreaChart : LineChart

  return (
    <div role="img" aria-label={label} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ChartRoot data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={axis.grid} vertical={false} />}
          <XAxis dataKey="label" tick={tickStyle} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis
            tick={tickStyle}
            axisLine={false}
            tickLine={false}
            width={44}
            tickFormatter={(v: number) => compactNumber(v)}
          />
          <Tooltip
            content={({ active, label: l, payload }) => (
              <ChartTooltip active={active} label={l} payload={payload as never} series={series} />
            )}
          />
          {showLegend && series.length > 1 && (
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
          )}
          {series.map((s, i) => {
            const color = seriesColor(s.color, i)
            return variant === 'area' ? (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={color}
                fill={color}
                fillOpacity={0.15}
                strokeWidth={2}
                isAnimationActive={false}
                connectNulls
              />
            ) : (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
                connectNulls
              />
            )
          })}
        </ChartRoot>
      </ResponsiveContainer>
    </div>
  )
}
