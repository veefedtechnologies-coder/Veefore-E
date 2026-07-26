import React from 'react'
import { Skeleton } from '@/components/ui/skeleton'

const WEEK_COLUMNS = 7

/**
 * PlanSkeleton — Page_Skeleton for the Plan/Calendar route
 * (`components/calendar/calendar-view.tsx`, the `/plan` Calendar tab).
 *
 * Reproduces the real calendar's outer slot pixel-for-pixel: the
 * `w-full h-full` wrapper around the `bg-white dark:bg-gray-900 min-h-screen`
 * surface, the toolbar header (`flex items-center justify-between p-6 border-b`)
 * with prev/today/next navigation + the week-range label on the left and the
 * settings/share/filter + view-toggle controls on the right, the 7-column
 * day-of-week header row (`grid grid-cols-7` over a
 * `bg-gray-50 dark:bg-gray-800` band), and the 7-column calendar body
 * (`grid grid-cols-7 min-h-[600px]`) where each day cell holds a couple of
 * event-card placeholders. Pure and presentational — no data, no effects.
 *
 * Spec: pixel-perfect-skeleton-loading (R4.1, R5.1, R5.2, R5.3, R8.2, R8.3, R10.1).
 */
function PlanSkeletonImpl() {
  return (
    <div data-testid="plan-skeleton" className="w-full h-full">
      <div className="bg-white dark:bg-gray-900 min-h-screen">
        {/* Toolbar header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          {/* Left: navigation + week range */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Skeleton variant="button" className="w-9 h-9 rounded-md" />
              <Skeleton variant="text" className="h-6 w-16" />
              <Skeleton variant="button" className="w-9 h-9 rounded-md" />
            </div>
            <Skeleton variant="text" className="h-5 w-44" />
          </div>

          {/* Right: action + view-toggle controls */}
          <div className="flex items-center space-x-2">
            <Skeleton variant="button" className="h-9 w-9 rounded-md" />
            <Skeleton variant="button" className="h-9 w-9 rounded-md" />
            <Skeleton variant="button" className="h-9 w-24 rounded-md" />
            <div className="flex border border-gray-300 dark:border-gray-600 rounded-md">
              <Skeleton variant="button" className="h-9 w-9 rounded-none" />
              <Skeleton variant="button" className="h-9 w-9 rounded-none" />
              <Skeleton variant="button" className="h-9 w-9 rounded-none" />
            </div>
          </div>
        </div>

        {/* Calendar grid */}
        <div className="w-full">
          {/* Day-of-week header row */}
          <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <div className="grid grid-cols-7">
              {Array.from({ length: WEEK_COLUMNS }).map((_, i) => (
                <div
                  key={i}
                  className="text-center p-4 border-r border-gray-200 dark:border-gray-700 last:border-r-0"
                >
                  <Skeleton variant="text" className="h-4 w-8 mx-auto mb-2" />
                  <Skeleton variant="circle" className="w-10 h-10 mx-auto rounded-full" />
                </div>
              ))}
            </div>
          </div>

          {/* Calendar body cells */}
          <div className="grid grid-cols-7 min-h-[600px]">
            {Array.from({ length: WEEK_COLUMNS }).map((_, col) => (
              <div
                key={col}
                className="border-r border-gray-200 dark:border-gray-700 last:border-r-0 p-2 space-y-3"
              >
                {/* Two event-card placeholders per day cell */}
                {Array.from({ length: 2 }).map((_, row) => (
                  <div
                    key={row}
                    className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden shadow-sm"
                  >
                    <Skeleton variant="rectangle" className="w-full h-24 rounded-none" />
                    <div className="p-3 space-y-1">
                      <Skeleton variant="text" className="h-3 w-20" />
                      <Skeleton variant="text" className="h-3 w-16" />
                      <Skeleton variant="text" className="h-3 w-12" />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export const PlanSkeleton = React.memo(PlanSkeletonImpl)
PlanSkeleton.displayName = 'PlanSkeleton'
