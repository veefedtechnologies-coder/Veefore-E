import React from 'react'
import { TableSkeleton } from '@/components/skeletons'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * AdminPanelSkeleton — Page_Skeleton for `pages/AdminPanel.tsx` (the `/admin`
 * route, rendered from `App.tsx`'s protected-route switch).
 *
 * `AdminPanel` owns the full screen, so this skeleton reproduces the whole page
 * slot pixel-for-pixel: the
 * `min-h-screen bg-gradient-to-br from-slate-50 to-white dark:... p-8` page, the
 * `max-w-7xl mx-auto space-y-8` inner wrapper, a header row (title/subtitle +
 * two actions), the stats grid
 * (`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6` of 5 stat cards), and
 * the waitlist table card (header + filter row + table built from the shared
 * `TableSkeleton` + pagination row).
 *
 * This mirrors the legacy `AdminPanelSkeleton` previously co-located in
 * `AdminPanel.tsx`, rebuilt on the variant primitive + shared `TableSkeleton`
 * (no inline `<style>` shimmer). Pure and presentational — no data, no effects.
 *
 * Spec: pixel-perfect-skeleton-loading (R4.1, R5.1, R5.2, R5.3, R8.2, R8.3, R10.1).
 */
function AdminPanelSkeletonImpl() {
  return (
    <div
      data-testid="admin-panel-skeleton"
      className="min-h-screen bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-800 p-8"
    >
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton variant="text" className="h-10 w-48" />
            <Skeleton variant="text" className="h-4 w-64" />
          </div>
          <div className="flex items-center space-x-4">
            <Skeleton variant="button" className="h-9 w-24 rounded-md" />
            <Skeleton variant="button" className="h-9 w-28 rounded-md" />
          </div>
        </div>

        {/* Stats cards (5) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 p-6 shadow-sm"
            >
              <Skeleton variant="text" className="h-4 w-24 mb-4" />
              <Skeleton variant="text" className="h-8 w-16" />
            </div>
          ))}
        </div>

        {/* Table card */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 shadow-sm p-6">
          {/* Card title */}
          <div className="flex items-center space-x-2 mb-6">
            <Skeleton variant="rectangle" className="h-5 w-5 rounded" />
            <Skeleton variant="text" className="h-5 w-32" />
          </div>

          {/* Filters row */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <Skeleton variant="rectangle" className="h-10 flex-1 rounded-md" />
            <Skeleton variant="rectangle" className="h-10 w-[200px] rounded-md" />
          </div>

          {/* Table */}
          <TableSkeleton rows={5} />

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4">
            <Skeleton variant="text" className="h-4 w-48" />
            <div className="flex items-center space-x-2">
              <Skeleton variant="button" className="h-8 w-20 rounded" />
              <Skeleton variant="text" className="h-4 w-24" />
              <Skeleton variant="button" className="h-8 w-16 rounded" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export const AdminPanelSkeleton = React.memo(AdminPanelSkeletonImpl)
AdminPanelSkeleton.displayName = 'AdminPanelSkeleton'
