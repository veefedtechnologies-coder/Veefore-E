/**
 * Sparkline — a compact, axis-less trend line for KPI cards. Decorative context
 * for the headline value (marked aria-hidden; the value itself is the a11y
 * source of truth).
 */

import { useMemo } from 'react'
import { Line, LineChart, ResponsiveContainer } from 'recharts'

import { CHART_PALETTE } from '../tokens'
import type { SparklinePoint } from '../types'

interface SparklineProps {
  data: SparklinePoint[]
  /** Line colour (hex). Defaults to the primary palette colour. */
  color?: string
  height?: number
  className?: string
}

export function Sparkline({ data, color = CHART_PALETTE[0], height = 40, className }: SparklineProps) {
  const points = useMemo(() => data.map((d, i) => ({ i, value: d.value })), [data])

  if (points.length < 2) return null

  return (
    <div className={className} style={{ height }} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
