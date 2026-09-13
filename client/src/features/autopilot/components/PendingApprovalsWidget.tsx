/**
 * PendingApprovalsWidget
 *
 * Shows the count and contents of every pending Approval_Card for the mission
 * (R16.4). Presentational — the list is fetched by the dashboard and refreshed
 * live over the WebSocket channel (R16.5). Each entry links to the VeeGPT chat
 * where the full ApprovalCard (Task 19.5) renders its approve/edit/reject
 * actions; this widget is the at-a-glance control surface.
 *
 * Requirements: 16.4, 16.5
 */

import React from 'react'
import { ClipboardCheck } from 'lucide-react'
import type { PendingApproval } from '../api/autopilotApi'
import { approvalItemLabel, formatTimestamp } from './missionControl'

export interface PendingApprovalsWidgetProps {
  approvals: PendingApproval[]
}

export const PendingApprovalsWidget: React.FC<PendingApprovalsWidgetProps> = ({ approvals }) => {
  const count = approvals.length

  return (
    <section
      className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 p-5"
      aria-label="Pending approvals"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Pending approvals
          </h2>
        </div>
        <span
          className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300"
          aria-label={`${count} pending approval${count === 1 ? '' : 's'}`}
        >
          {count}
        </span>
      </div>

      {count === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Nothing waiting on you right now.
        </p>
      ) : (
        <ul className="space-y-2">
          {approvals.map((approval) => (
            <li
              key={approval.id}
              className="flex items-center justify-between rounded-lg border border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-white/5 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {approvalItemLabel(approval)}
                </p>
                {approval.createdAt && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Requested {formatTimestamp(approval.createdAt)}
                  </p>
                )}
              </div>
              <span className="ml-3 flex-shrink-0 text-xs font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
                Awaiting
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default PendingApprovalsWidget
