/**
 * GoalKpiWidget — tracks progress toward a goal: current, goal, remaining, and
 * estimated completion (05-widget-library.md Ch 3.4). The progress bar fill is a
 * display fraction of two backend-provided numbers (Rule 9 — not an analytics
 * calculation); `remaining` and `estimatedCompletion` come from the backend.
 */

import { Progress } from '@/components/ui/progress'

import { formatMetricValue } from '../design-system/format'
import { WidgetFrame } from './WidgetFrame'
import { progressFraction } from './utils'
import type { GoalData, WidgetBaseProps } from './types'

interface GoalKpiWidgetProps extends WidgetBaseProps {
  goal?: GoalData
}

export function GoalKpiWidget({ goal, ...frame }: GoalKpiWidgetProps) {
  const state = frame.state ?? (goal ? 'ready' : 'empty')
  const unit = goal?.unit ?? 'count'
  const pct = goal ? Math.round(progressFraction(goal.current, goal.goal) * 100) : 0

  return (
    <WidgetFrame {...frame} state={state} bodyMinHeight={120}>
      {goal && (
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-2">
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {formatMetricValue(goal.current, unit)}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              of {formatMetricValue(goal.goal, unit)}
            </p>
          </div>

          <Progress value={pct} aria-label={`${pct}% of goal reached`} />

          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>{pct}% complete</span>
            {goal.remaining !== undefined && (
              <span>{formatMetricValue(goal.remaining, unit)} to go</span>
            )}
          </div>

          {goal.estimatedCompletion && (
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              Est. completion: {goal.estimatedCompletion}
            </p>
          )}
        </div>
      )}
    </WidgetFrame>
  )
}
