/**
 * HealthKpiWidget — a 0–100 composite health score with a status band
 * (05-widget-library.md Ch 3.5: Excellent/Good/Fair/Poor/Critical). The score
 * and band are backend-provided; composite weights and band thresholds are
 * pending specification (OPEN_SPEC_ITEMS ASI-002), so this widget only displays
 * values it is given and never fabricates a score.
 */

import { cn } from '@/lib/utils'

import { RATING_BADGE, RATING_LABEL } from '../design-system/tokens'
import type { RatingBand } from '../design-system'
import { WidgetFrame } from './WidgetFrame'
import type { WidgetBaseProps } from './types'

interface HealthKpiWidgetProps extends WidgetBaseProps {
  score?: number | null
  band?: RatingBand
  /** Optional contributing factors. */
  factors?: { label: string; value: string }[]
}

export function HealthKpiWidget({ score, band, factors = [], ...frame }: HealthKpiWidgetProps) {
  const hasScore = score !== null && score !== undefined
  const state = frame.state ?? (hasScore ? 'ready' : 'empty')

  return (
    <WidgetFrame {...frame} state={state} bodyMinHeight={120}>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              {hasScore ? Math.round(score as number) : '—'}
            </span>
            <span className="text-sm text-gray-400 dark:text-gray-500">/ 100</span>
          </div>
          {band && (
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                RATING_BADGE[band]
              )}
            >
              {RATING_LABEL[band]}
            </span>
          )}
        </div>

        {factors.length > 0 && (
          <dl className="space-y-1.5 border-t border-gray-100 pt-3 dark:border-gray-700/60">
            {factors.map((f) => (
              <div key={f.label} className="flex items-center justify-between text-sm">
                <dt className="text-gray-500 dark:text-gray-400">{f.label}</dt>
                <dd className="font-medium text-gray-800 dark:text-gray-200">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </WidgetFrame>
  )
}
