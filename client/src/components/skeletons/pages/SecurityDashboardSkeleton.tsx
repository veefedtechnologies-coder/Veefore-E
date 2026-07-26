import React from 'react'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * SecurityDashboardSkeleton — Page_Skeleton for `pages/SecurityDashboard.tsx`
 * (the `/security-dashboard` route).
 *
 * This route renders `SecurityDashboard` directly inside its own Suspense
 * boundary (no shared `DashboardLayout`), and the page itself owns the full
 * screen, so this skeleton reproduces the whole page slot pixel-for-pixel: the
 * `min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900
 * dark:to-slate-800 p-6` page, the `max-w-7xl mx-auto space-y-6` inner wrapper,
 * a header row (title/subtitle + live-status badge), the overview metrics grid
 * (`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4` of 4 stat cards), the
 * 5-column tab strip, and a two-column overview body
 * (`grid grid-cols-1 lg:grid-cols-2 gap-6`) of detail cards.
 *
 * Pure and presentational — no data, no effects.
 *
 * Spec: pixel-perfect-skeleton-loading (R4.1, R5.1, R5.2, R5.3, R8.2, R8.3, R10.1).
 */

/** A small metric card: label line + large value. */
function MetricCardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
      <Skeleton variant="text" className="h-4 w-24 mb-3" />
      <Skeleton variant="text" className="h-8 w-16 mb-2" />
      <Skeleton variant="text" className="h-3 w-20" />
    </div>
  )
}

/** A detail card with a header and a list of rows (used in the overview body). */
function DetailCardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 shadow-sm">
      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Skeleton variant="rectangle" className="w-5 h-5 rounded" />
          <Skeleton variant="text" className="h-5 w-48" />
        </div>
      </div>
      <div className="p-6 space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center justify-between">
            <Skeleton variant="text" className="h-4 w-40" />
            <div className="flex items-center gap-2">
              <Skeleton variant="rectangle" className="w-24 h-2 rounded-full" />
              <Skeleton variant="text" className="h-4 w-8" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SecurityDashboardSkeletonImpl() {
  return (
    <div
      data-testid="security-dashboard-skeleton"
      className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-6"
    >
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton variant="rectangle" className="h-8 w-8 rounded" />
            <div className="space-y-2">
              <Skeleton variant="text" className="h-8 w-72" />
              <Skeleton variant="text" className="h-4 w-80 max-w-full" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Skeleton variant="pill" className="h-7 w-40 rounded-full" />
            <Skeleton variant="text" className="h-4 w-32 hidden sm:block" />
          </div>
        </div>

        {/* Overview metrics grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <MetricCardSkeleton key={i} />
          ))}
        </div>

        {/* Tab strip (5 columns) */}
        <div className="grid w-full grid-cols-5 gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="button" className="h-10 w-full rounded-md" />
          ))}
        </div>

        {/* Overview body — two detail cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DetailCardSkeleton />
          <DetailCardSkeleton />
        </div>
      </div>
    </div>
  )
}

export const SecurityDashboardSkeleton = React.memo(SecurityDashboardSkeletonImpl)
SecurityDashboardSkeleton.displayName = 'SecurityDashboardSkeleton'
