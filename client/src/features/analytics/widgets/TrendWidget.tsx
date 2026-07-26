/**
 * TrendWidget — change-over-time visualization (line/area, multi-series with
 * comparison overlays) inside the standard widget frame (05-widget-library.md
 * Ch 5 Trend Widgets). Presentation-only.
 */

import { TimeSeriesChart } from '../design-system/components/TimeSeriesChart'
import type { ChartDataPoint, ChartSeries } from '../design-system'
import { WidgetFrame } from './WidgetFrame'
import type { WidgetBaseProps } from './types'

interface TrendWidgetProps extends WidgetBaseProps {
  data?: ChartDataPoint[]
  series?: ChartSeries[]
  variant?: 'line' | 'area' | 'bar'
  height?: number
  showLegend?: boolean
}

export function TrendWidget({
  data = [],
  series = [],
  variant = 'line',
  height = 260,
  showLegend = true,
  ...frame
}: TrendWidgetProps) {
  const state = frame.state ?? (data.length > 0 && series.length > 0 ? 'ready' : 'empty')

  return (
    <WidgetFrame {...frame} state={state} bodyMinHeight={height} loadingFallback={undefined}>
      <TimeSeriesChart
        data={data}
        series={series}
        variant={variant}
        height={height}
        showLegend={showLegend}
        ariaLabel={`${frame.title} trend`}
      />
    </WidgetFrame>
  )
}
