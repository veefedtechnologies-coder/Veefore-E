import React from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * BestTimeSkeleton — Page_Skeleton for the full Best Time route
 * (`/best-time` → `pages/BestTimeDetail.tsx`).
 *
 * Rendered as the `<React.Suspense>` fallback inside the route's
 * `<main className="flex-1 overflow-y-auto p-6 …">` region (task 9.1); it does
 * NOT re-create the sidebar / header / `<main>` wrapper.
 *
 * Conditional-rendering parity (R9, the key concern): the page has distinct
 * loading / empty ("Analyzing Your Audience") / populated states. During page
 * load the data condition is `unknown`, so this skeleton mirrors ONLY the
 * POPULATED layout — the header, the peak-engagement billboard + the two
 * stat cards, and the daily-breakdown card. It deliberately does NOT mirror the
 * empty "Analyzing Your Audience" card (R9.2). On resolve the real
 * `BestTimeDetail` owns the hand-off and picks populated/empty itself (R9.3).
 *
 * Layout parity (zero layout shift, R8.2): reproduces the page's outer
 * `w-full space-y-8` container, the `flex … justify-between … pb-6 border-b`
 * header, the `grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8` billboard row
 * (8-col main card + 4-col stat stack), and the divided daily-breakdown card.
 *
 * Pure and presentational — no data, no effects.
 *
 * Spec: pixel-perfect-skeleton-loading (R4.1, R5.1, R5.2, R5.3, R8.2, R8.3, R10.1).
 */

/** One stat tile mirroring the "Posts Analyzed" / "AI Confidence" cards. */
function BestTimeStatCardSkeleton() {
  return (
    <Card className="border-gray-200/50 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm shadow-md">
      <CardContent className="p-6 flex items-start gap-4">
        <Skeleton variant="rectangle" className="w-12 h-12 rounded-xl flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" className="h-4 w-28" />
          <Skeleton variant="text" className="h-8 w-20" />
          <Skeleton variant="text" className="h-3 w-24" />
        </div>
      </CardContent>
    </Card>
  )
}

/** One daily-breakdown row: day label + time pill + progress bar + score. */
function DailyBreakdownRowSkeleton() {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 md:p-6">
      <div className="w-32 flex-shrink-0">
        <Skeleton variant="text" className="h-5 w-20" />
      </div>
      <div className="w-24 flex-shrink-0">
        <Skeleton variant="rectangle" className="h-8 w-20 rounded-lg" />
      </div>
      <div className="flex-1 flex items-center gap-4">
        <Skeleton variant="rectangle" className="flex-1 h-3 rounded-full" />
        <Skeleton variant="text" className="h-4 w-12" />
      </div>
    </div>
  )
}

function BestTimeSkeletonImpl() {
  return (
    <div data-testid="best-time-skeleton" className="w-full space-y-8">
      {/* Header — matches the flex row + bottom border */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-gray-200 dark:border-gray-800">
        <div className="space-y-3">
          {/* AI Recommendation Engine badge */}
          <Skeleton variant="pill" className="h-6 w-56 rounded-full" />
          {/* Title */}
          <Skeleton variant="text" className="h-10 md:h-11 w-72 max-w-full" />
          {/* Subtitle */}
          <Skeleton variant="text" className="h-5 w-96 max-w-full" />
        </div>
        {/* Schedule a Post button */}
        <Skeleton variant="button" className="h-12 w-44 rounded-xl" />
      </div>

      {/* Primary billboard row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
        {/* Main peak-engagement card (8 cols) */}
        <div className="lg:col-span-8">
          <Card className="h-full border-gray-200/50 dark:border-gray-700/50 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm shadow-xl border-0 relative overflow-hidden">
            <CardContent className="p-8 md:p-10 relative z-10 h-full flex flex-col justify-center space-y-6">
              {/* Peak Engagement Window label */}
              <Skeleton variant="text" className="h-4 w-48" />
              <div className="flex flex-col md:flex-row md:items-center gap-8 md:gap-12">
                <div className="flex-shrink-0 space-y-2">
                  {/* Big hour label */}
                  <Skeleton variant="rectangle" className="h-16 md:h-20 w-40" />
                  {/* Billboard day */}
                  <Skeleton variant="text" className="h-7 w-32" />
                </div>
                <div className="hidden md:block w-px h-24 bg-gray-200 dark:bg-gray-700" />
                <div className="flex-1 space-y-4">
                  <Skeleton variant="text" className="h-6 w-full max-w-md" />
                  <Skeleton variant="text" className="h-6 w-3/4" />
                  <Skeleton variant="pill" className="h-10 w-52 rounded-xl" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stat stack (4 cols) — 2 tiles */}
        <div className="lg:col-span-4 grid grid-cols-2 lg:grid-cols-1 gap-4">
          <BestTimeStatCardSkeleton />
          <BestTimeStatCardSkeleton />
        </div>
      </div>

      {/* Daily Breakdown card */}
      <Card className="border-0 shadow-xl bg-white dark:bg-gray-800 overflow-hidden">
        <CardHeader className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700/50 space-y-2">
          <Skeleton variant="text" className="h-6 w-44" />
          <Skeleton variant="text" className="h-4 w-80 max-w-full" />
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {/* Seven days of the week — fixed, structurally known count */}
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <DailyBreakdownRowSkeleton key={i} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export const BestTimeSkeleton = React.memo(BestTimeSkeletonImpl)
BestTimeSkeleton.displayName = 'BestTimeSkeleton'
