import React from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { clampListCount } from '@/components/skeletons/render-state'

export interface TestFixturesSkeletonProps {
  /**
   * Number of social-account rows to render. Clamped to [3, 10] (default 4) so
   * the placeholder never implies the exact final account count (R9.8).
   */
  rows?: number
}

/**
 * TestFixturesSkeleton — Page_Skeleton for `pages/TestFixtures.tsx` (the
 * `/test-fixtures` route, rendered inside the `DashboardLayout`
 * `<main className="… p-6 …">` Suspense region).
 *
 * Reproduces the real page slot pixel-for-pixel: the
 * `bg-white dark:bg-gray-800 shadow-lg border ...` card with a "Test Fixtures"
 * title header, an action button row (add / remove / refresh), two short info
 * text lines, and a `space-y-2` list of social-account rows (handle/platform on
 * the left, status + select on the right) inside `p-3 border rounded-md` tiles.
 *
 * The account list is the only data-dependent region; it is `unknown` during
 * load so only the populated row variant is rendered (R9.2). Pure and
 * presentational — no data, no effects.
 *
 * Spec: pixel-perfect-skeleton-loading (R4.1, R5.1, R5.2, R5.3, R8.2, R8.3, R9.8, R10.1).
 */
function TestFixturesSkeletonImpl({ rows }: TestFixturesSkeletonProps) {
  const rowCount = clampListCount(rows, { default: 4 })

  return (
    <div
      data-testid="test-fixtures-skeleton"
      className="bg-white dark:bg-gray-800 shadow-lg border border-gray-200/50 dark:border-gray-700/50 rounded-lg"
    >
      {/* Header */}
      <div className="p-6 pb-0">
        <Skeleton variant="text" className="h-6 w-36" />
      </div>

      <div className="p-6">
        {/* Action button row */}
        <div className="flex items-center space-x-3 mb-4">
          <Skeleton variant="button" className="h-10 w-72 rounded-md" />
          <Skeleton variant="button" className="h-10 w-44 rounded-md" />
          <Skeleton variant="button" className="h-10 w-28 rounded-md" />
        </div>

        {/* Info lines */}
        <Skeleton variant="text" className="h-4 w-80 max-w-full mb-2" />
        <Skeleton variant="text" className="h-4 w-56 mb-4" />

        {/* Account rows */}
        <div className="space-y-2">
          {Array.from({ length: rowCount }).map((_, i) => (
            <div key={i} className="p-3 border rounded-md dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div className="space-y-1.5">
                  <Skeleton variant="text" className="h-4 w-28" />
                  <Skeleton variant="text" className="h-3 w-40" />
                </div>
                <div className="flex items-center space-x-2">
                  <Skeleton variant="text" className="h-3 w-12" />
                  <Skeleton variant="rectangle" className="h-7 w-20 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export const TestFixturesSkeleton = React.memo(TestFixturesSkeletonImpl)
TestFixturesSkeleton.displayName = 'TestFixturesSkeleton'
