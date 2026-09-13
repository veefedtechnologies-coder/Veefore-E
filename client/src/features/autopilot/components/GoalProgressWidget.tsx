/**
 * GoalProgressWidget
 *
 * Shows the Mission's current progress value toward the Goal's target metric as
 * a labelled progress bar + numbers (R16.4). Presentational: it derives the
 * value/percent from the mission via the pure {@link missionControl} helpers, so
 * it re-renders correctly whenever the mission query is refreshed (including the
 * live MEASURE updates — R16.5).
 *
 * Requirements: 16.4, 16.5
 */

import React from 'react'
import { Target } from 'lucide-react'
import type { MissionDetail } from '../api/autopilotApi'
import { currentProgressValue, formatMetric, goalProgressPercent } from './missionControl'

export interface GoalProgressWidgetProps {
  mission: MissionDetail
}

export const GoalProgressWidget: React.FC<GoalProgressWidgetProps> = ({ mission }) => {
  const percent = goalProgressPercent(mission)
  const current = currentProgressValue(mission)
  const target = mission.goal?.targetValue ?? 0
  const metric = formatMetric(mission.goal?.metric)

  return (
    <section
      className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 p-5"
      aria-label="Goal progress"
    >
      <div className="flex items-center gap-2 mb-4">
        <Target className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Goal progress</h2>
      </div>

      <div className="flex items-baseline justify-between mb-2">
        <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {current.toLocaleString()}
        </span>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          / {target.toLocaleString()} {metric.toLowerCase()}
        </span>
      </div>

      <div
        className="h-2.5 w-full rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${metric} progress`}
      >
        <div
          className="h-full rounded-full bg-blue-600 dark:bg-blue-500 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>

      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        {percent}% toward your {metric.toLowerCase()} goal
      </p>
    </section>
  )
}

export default GoalProgressWidget
