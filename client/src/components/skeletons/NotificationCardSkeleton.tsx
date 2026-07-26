import React from 'react'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * NotificationCardSkeleton — placeholder for a single notification list item
 * (icon + text), per the design's Component_Skeleton table.
 *
 * Mirrors a standard notification row slot: a leading circular icon, a title
 * line + a wider message line, and a trailing relative-time pill, inside a
 * `p-4 rounded-xl` row. Pure and presentational — no data, no effects.
 *
 * Spec: pixel-perfect-skeleton-loading (R4.2, R5.1, R5.2, R5.4, R10.2–R10.4).
 */
function NotificationCardSkeletonImpl() {
  return (
    <div
      data-testid="notification-card-skeleton"
      className="flex items-start space-x-3 p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700"
    >
      {/* Leading icon */}
      <Skeleton variant="circle" className="w-10 h-10 rounded-full flex-shrink-0" />

      {/* Title + message lines */}
      <div className="flex-1 space-y-2 pt-0.5">
        <Skeleton variant="text" className="h-4 w-3/4" />
        <Skeleton variant="text" className="h-3 w-full" />
      </div>

      {/* Trailing timestamp */}
      <Skeleton variant="text" className="h-3 w-12 flex-shrink-0" />
    </div>
  )
}

export const NotificationCardSkeleton = React.memo(NotificationCardSkeletonImpl)
NotificationCardSkeleton.displayName = 'NotificationCardSkeleton'
