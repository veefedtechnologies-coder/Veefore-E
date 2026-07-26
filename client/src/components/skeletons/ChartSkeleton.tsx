import React from 'react'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * ChartSkeleton — placeholder for an analytics chart card (see the chart cards
 * in `components/analytics/analytics-dashboard.tsx` and
 * `pages/PostAnalyticsPage.tsx`).
 *
 * Mirrors the real chart card slot pixel-for-pixel: the
 * `bg-white dark:bg-slate-800 rounded-xl p-6 border ...` surface, a section
 * heading line, and a fixed-height chart plot area (`h-[280px]`) rendered with
 * the `chart` variant so the placeholder reserves the exact vertical space the
 * real chart occupies (zero layout shift on hand-off). Pure and presentational
 * — no data, no effects.
 *
 * Spec: pixel-perfect-skeleton-loading (R4.2, R5.1, R5.2, R5.4, R10.2, R10.5).
 */
function ChartSkeletonImpl() {
  return (
    <div
      data-testid="chart-skeleton"
      className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
    >
      {/* Chart title */}
      <Skeleton variant="text" className="h-6 w-48 mb-6" />

      {/* Fixed-height plot area — reserves the same space as the real chart */}
      <Skeleton variant="chart" className="h-[280px] w-full rounded-md" />
    </div>
  )
}

export const ChartSkeleton = React.memo(ChartSkeletonImpl)
ChartSkeleton.displayName = 'ChartSkeleton'
