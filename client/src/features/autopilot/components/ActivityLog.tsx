/**
 * ActivityLog
 *
 * Renders the Operating-Loop activity log — the mission's Audit_Records
 * newest-first (R16.4). Presentational: records are fetched by the dashboard and
 * refreshed live over the WebSocket channel (R16.5). Each row shows the stage +
 * action, an outcome-tinted dot, and a relative timestamp.
 *
 * Requirements: 16.4, 16.5
 */

import React from 'react'
import { Activity } from 'lucide-react'
import type { ActivityRecord } from '../api/autopilotApi'
import { activityLabel, formatTimestamp, outcomeTone } from './missionControl'

export interface ActivityLogProps {
  records: ActivityRecord[]
}

const toneDot: Record<ReturnType<typeof outcomeTone>, string> = {
  success: 'bg-green-500',
  failure: 'bg-red-500',
  blocked: 'bg-amber-500',
  neutral: 'bg-gray-400',
}

export const ActivityLog: React.FC<ActivityLogProps> = ({ records }) => {
  return (
    <section
      className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 p-5"
      aria-label="Activity log"
    >
      <div className="flex items-center gap-2 mb-4">
        <Activity className="h-4 w-4 text-gray-600 dark:text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Activity log</h2>
      </div>

      {records.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No activity yet. Auto Pilot will narrate its decisions here.
        </p>
      ) : (
        <ol className="space-y-3">
          {records.map((record) => (
            <li key={record.id} className="flex items-start gap-3">
              <span
                className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${toneDot[outcomeTone(record.outcome)]}`}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-900 dark:text-gray-100 break-words">
                  {activityLabel(record)}
                </p>
                {record.createdAt && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatTimestamp(record.createdAt)}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

export default ActivityLog
