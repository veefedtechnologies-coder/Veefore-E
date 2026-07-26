import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ChartSkeleton } from '@/components/skeletons'

/**
 * PostAnalyticsSkeleton — Page_Skeleton for the `/analytics/post/:contentId`
 * route, which renders `<PostAnalyticsPage />` (`pages/PostAnalyticsPage.tsx`)
 * inside the `DashboardLayout` `<main>` Suspense boundary.
 *
 * Layout parity (zero layout shift, R8.2): mirrors the real page's outer
 * container (`p-4 sm:p-8 max-w-7xl mx-auto min-h-screen`), the header row
 * (back button + title/subtitle on the left, refresh button on the right), and
 * the `grid grid-cols-1 lg:grid-cols-3 gap-8` body — the left column holding
 * the sticky post-preview card (author row + `aspect-[4/5]` media + caption)
 * and the right column (`lg:col-span-2 space-y-8`) holding the performance
 * metrics section (heading + `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3
 * gap-4` of metric cards) and the historical growth chart.
 *
 * Conditional-rendering parity (R9): the metric cards and chart are the
 * canonical populated layout; the skeleton renders only the populated variant
 * during load and the real component owns the empty/unavailable hand-off.
 *
 * Pure and presentational — no data, no effects.
 *
 * Spec: pixel-perfect-skeleton-loading (R4.1, R5.1, R5.2, R5.3, R8.2, R8.3, R10.1).
 */

/** Mirrors a single `MetricCard` (`Card > CardContent p-6`). */
function PostMetricCardSkeleton() {
  return (
    <Card className="bg-white dark:bg-gray-800/80 border-gray-200/60 dark:border-gray-700/60 shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton variant="text" className="h-4 w-20" />
            <Skeleton variant="text" className="h-8 w-16" />
            <Skeleton variant="text" className="h-3 w-28" />
          </div>
          {/* p-3 rounded-xl icon tile */}
          <Skeleton variant="rectangle" className="w-12 h-12 rounded-xl flex-shrink-0" />
        </div>
      </CardContent>
    </Card>
  )
}

function PostAnalyticsSkeletonImpl() {
  return (
    <div
      data-testid="post-analytics-skeleton"
      className="p-4 sm:p-8 max-w-7xl mx-auto min-h-screen"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div className="flex items-center gap-4">
          <Skeleton variant="rectangle" className="w-10 h-10 rounded-full flex-shrink-0" />
          <div className="space-y-2">
            <Skeleton variant="text" className="h-7 w-44" />
            <Skeleton variant="text" className="h-4 w-56" />
          </div>
        </div>
        <Skeleton variant="button" className="h-10 w-36 rounded-md" />
      </div>

      {/* Body grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left column: post preview */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            {/* Author row */}
            <div className="p-4 border-b border-gray-100 dark:border-gray-700/50 flex items-center gap-3">
              <Skeleton variant="avatar" className="w-10 h-10 rounded-full flex-shrink-0" />
              <div className="space-y-2">
                <Skeleton variant="text" className="h-4 w-24" />
                <Skeleton variant="text" className="h-3 w-20" />
              </div>
            </div>
            {/* Media — same aspect-[4/5] block */}
            <Skeleton variant="rectangle" className="aspect-[4/5] w-full rounded-none" />
            {/* Caption */}
            <div className="p-4 bg-gray-50 dark:bg-gray-900/30 space-y-2">
              <Skeleton variant="text" className="h-4 w-full" />
              <Skeleton variant="text" className="h-4 w-2/3" />
            </div>
          </div>
        </div>

        {/* Right column: analytics data */}
        <div className="lg:col-span-2 space-y-8">
          {/* Performance metrics */}
          <div>
            <Skeleton variant="text" className="h-6 w-52 mb-4" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <PostMetricCardSkeleton key={i} />
              ))}
            </div>
          </div>

          {/* Historical growth chart */}
          <div>
            <Skeleton variant="text" className="h-6 w-56 mb-4" />
            <ChartSkeleton />
          </div>
        </div>
      </div>
    </div>
  )
}

export const PostAnalyticsSkeleton = React.memo(PostAnalyticsSkeletonImpl)
PostAnalyticsSkeleton.displayName = 'PostAnalyticsSkeleton'
