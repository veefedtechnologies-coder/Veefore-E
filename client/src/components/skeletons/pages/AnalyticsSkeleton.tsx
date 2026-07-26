import React from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { clampListCount } from '@/components/skeletons/render-state'

/**
 * AnalyticsSkeleton — Page_Skeleton for the `/analytics` route, which renders
 * `<AnalyticsDashboard />` (`components/analytics/analytics-dashboard.tsx`)
 * inside the `DashboardLayout` `<main>` Suspense boundary.
 *
 * Layout parity (zero layout shift, R8.2): mirrors the real dashboard's
 * `space-y-6` wrapper, the four-up overview metric cards
 * (`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6`), and the two-column
 * lower grid (`grid grid-cols-1 lg:grid-cols-2 gap-6`) holding the
 * "Social performance score" card (header + score + embedded `h-32` chart) and
 * the "Your social impact at a glance" card (header + list of platform rows).
 *
 * Conditional-rendering parity (R9): all sections are static (always present)
 * on this page → rendered as the populated variant. The platform rows are a
 * variable list → clamped to [3, 10] via `clampListCount`.
 *
 * Pure and presentational — no data, no effects.
 *
 * Spec: pixel-perfect-skeleton-loading (R4.1, R5.1, R5.2, R5.3, R8.2, R8.3, R10.1).
 */

/** Mirrors a single overview metric card (`Card > CardContent p-6`). */
function OverviewMetricCardSkeleton() {
  return (
    <Card className="border-gray-200 dark:border-gray-700">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton variant="text" className="h-4 w-28" />
            <Skeleton variant="text" className="h-8 w-20" />
            <Skeleton variant="text" className="h-4 w-16" />
          </div>
          {/* w-12 h-12 icon tile */}
          <Skeleton variant="rectangle" className="w-12 h-12 rounded-lg flex-shrink-0" />
        </div>
      </CardContent>
    </Card>
  )
}

/** Mirrors the "Social performance score" card (header + score + h-32 chart). */
function PerformanceScoreCardSkeleton() {
  return (
    <Card className="border-gray-200 dark:border-gray-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <Skeleton variant="text" className="h-6 w-52" />
          <Skeleton variant="button" className="h-8 w-44 rounded-md" />
        </div>
        <div className="space-y-2 mt-2">
          <Skeleton variant="text" className="h-4 w-full" />
          <Skeleton variant="text" className="h-4 w-5/6" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Score figure row */}
          <div className="flex items-baseline space-x-4">
            <Skeleton variant="text" className="h-10 w-16" />
            <Skeleton variant="text" className="h-5 w-14" />
            <Skeleton variant="text" className="h-4 w-10" />
          </div>
          {/* Doing great! blurb */}
          <div className="space-y-2">
            <Skeleton variant="text" className="h-5 w-32" />
            <Skeleton variant="text" className="h-4 w-72 max-w-full" />
          </div>
          {/* Score history chart — reserves the same h-32 plot area */}
          <Skeleton variant="chart" className="h-32 w-full rounded-md" />
        </div>
      </CardContent>
    </Card>
  )
}

/** Mirrors the "Your social impact at a glance" card (header + platform rows). */
function SocialImpactCardSkeleton() {
  const rows = clampListCount(4, { default: 4 })
  return (
    <Card className="border-gray-200 dark:border-gray-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <Skeleton variant="text" className="h-6 w-60" />
          <div className="flex items-center space-x-2">
            <Skeleton variant="rectangle" className="w-6 h-6 rounded" />
            <Skeleton variant="rectangle" className="w-6 h-6 rounded" />
          </div>
        </div>
        <div className="space-y-2 mt-2">
          <Skeleton variant="text" className="h-4 w-full" />
          <Skeleton variant="text" className="h-4 w-2/3" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {Array.from({ length: rows }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
            >
              <div className="flex items-center space-x-3">
                <Skeleton variant="rectangle" className="w-4 h-4 rounded" />
                <div className="space-y-2">
                  <Skeleton variant="text" className="h-4 w-24" />
                  <Skeleton variant="text" className="h-3 w-20" />
                </div>
              </div>
              <Skeleton variant="text" className="h-4 w-12" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function AnalyticsSkeletonImpl() {
  return (
    <div data-testid="analytics-skeleton" className="space-y-6">
      {/* Overview metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[0, 1, 2, 3].map((i) => (
          <OverviewMetricCardSkeleton key={i} />
        ))}
      </div>

      {/* Two-column lower grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PerformanceScoreCardSkeleton />
        <SocialImpactCardSkeleton />
      </div>
    </div>
  )
}

export const AnalyticsSkeleton = React.memo(AnalyticsSkeletonImpl)
AnalyticsSkeleton.displayName = 'AnalyticsSkeleton'
