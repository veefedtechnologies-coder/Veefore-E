import React from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { clampListCount } from '@/components/skeletons/render-state'

export interface TableSkeletonProps {
  /**
   * Number of body rows to render. Clamped to [3, 10] (default 5) so the
   * placeholder never implies the exact final row count (R9.8).
   */
  rows?: number
}

/**
 * TableSkeleton — placeholder for a data table (mirrors the legacy
 * `SkeletonTable` slot in `components/ui/skeleton.tsx`).
 *
 * Mirrors the real table slot pixel-for-pixel: the
 * `rounded-xl border bg-white dark:bg-gray-800 overflow-hidden` surface, a
 * shaded header row, and a clamped set of body rows (avatar + cell lines +
 * status pill) each with the same `px-6 py-4` padding and bottom border. Pure
 * and presentational — no data, no effects.
 *
 * Spec: pixel-perfect-skeleton-loading (R4.2, R5.1, R5.2, R5.4, R9.8, R10.2,
 * R10.5).
 */
function TableSkeletonImpl({ rows }: TableSkeletonProps) {
  const rowCount = clampListCount(rows, { default: 5 })

  return (
    <div
      data-testid="table-skeleton"
      className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden"
    >
      {/* Header row */}
      <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-6 py-3">
        <div className="flex items-center space-x-4">
          <Skeleton variant="text" className="h-4 w-8" />
          <Skeleton variant="text" className="h-4 w-32" />
          <Skeleton variant="text" className="h-4 w-24" />
          <Skeleton variant="text" className="h-4 w-20" />
          <Skeleton variant="text" className="h-4 w-16" />
        </div>
      </div>

      {/* Body rows (clamped) */}
      {Array.from({ length: rowCount }).map((_, i) => (
        <div
          key={i}
          className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 last:border-0"
        >
          <div className="flex items-center space-x-4">
            <Skeleton variant="text" className="h-4 w-8" />
            <div className="flex items-center space-x-3 flex-1">
              <Skeleton variant="avatar" className="h-10 w-10 rounded-full" />
              <Skeleton variant="text" className="h-4 w-32" />
            </div>
            <Skeleton variant="text" className="h-4 w-24" />
            <Skeleton variant="text" className="h-4 w-20" />
            <Skeleton variant="pill" className="h-6 w-16 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

export const TableSkeleton = React.memo(TableSkeletonImpl)
TableSkeleton.displayName = 'TableSkeleton'
