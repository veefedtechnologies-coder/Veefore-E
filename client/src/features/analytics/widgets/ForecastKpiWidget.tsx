/**
 * ForecastKpiWidget — a KPI with a prediction, confidence interval, and mini
 * forecast graph (05-widget-library.md Ch 3.2). The forecast is a prediction,
 * clearly labelled and confidence-scored (CODING_RULES Rule 16).
 */

import { formatMetricValue } from '../design-system/format'
import { Sparkline } from '../design-system/components/Sparkline'
import type { MetricUnit } from '../design-system'
import { WidgetFrame } from './WidgetFrame'
import { ConfidenceBadge } from './ConfidenceBadge'
import type { ForecastData, WidgetBaseProps } from './types'

interface ForecastKpiWidgetProps extends WidgetBaseProps {
  forecast?: ForecastData
  unit?: MetricUnit
}

export function ForecastKpiWidget({ forecast, unit = 'count', ...frame }: ForecastKpiWidgetProps) {
  const state = frame.state ?? (forecast ? 'ready' : 'empty')

  return (
    <WidgetFrame {...frame} state={state} bodyMinHeight={120}>
      {forecast && (
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {formatMetricValue(forecast.value, unit)}
              </p>
              {forecast.lower !== undefined && forecast.upper !== undefined && (
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  Range {formatMetricValue(forecast.lower, unit)} – {formatMetricValue(forecast.upper, unit)}
                </p>
              )}
            </div>
            <ConfidenceBadge confidence={forecast.confidence} />
          </div>
          {forecast.series && forecast.series.length > 1 && (
            <Sparkline data={forecast.series} height={48} />
          )}
          <p className="text-[11px] uppercase tracking-wide text-violet-500 dark:text-violet-400">
            Predicted
          </p>
        </div>
      )}
    </WidgetFrame>
  )
}
