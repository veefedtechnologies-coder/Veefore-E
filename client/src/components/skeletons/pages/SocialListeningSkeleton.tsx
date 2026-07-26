import React from 'react'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * SocialListeningSkeleton — Page_Skeleton for `pages/SocialListeningPage.tsx`
 * (the `/social-listening` route, rendered inside the `DashboardLayout`
 * `<main className="… p-6 …">` Suspense region).
 *
 * Reproduces the real page slot pixel-for-pixel: the
 * `flex-1 min-h-screen bg-gray-50 dark:bg-gray-900` page, the sticky header
 * bar (brand mark + title, a search input, and a "Sync Live Data" action), and
 * the main `px-5 lg:px-8 py-6` content body laid out as the page's
 * `grid grid-cols-1 xl:grid-cols-12 gap-6` split:
 *   - MAIN column (`xl:col-span-8`): a bento KPI cluster (hero sentiment tile +
 *     stacked metric/mention cards), a tall topic-velocity chart card
 *     (`h-[380px]`) and a mood-history chart card (`h-[300px]`).
 *   - Intelligence rail (`xl:col-span-4`): stacked sentiment/alert/mention
 *     cards.
 *
 * Conditional-rendering parity (R9.2): every section here is data-gated and
 * `unknown` during load, so only the POPULATED variant is rendered — never the
 * "no results" empty states or the in-flight search-loading status. The real
 * page owns the hand-off to empty/error once its queries resolve.
 *
 * Pure and presentational — no data, no effects.
 *
 * Spec: pixel-perfect-skeleton-loading (R4.1, R5.1, R5.2, R5.3, R8.2, R8.3, R10.1).
 */

/** A single stat / mention card: label + value + trailing icon tile. */
function StatCardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 p-5 flex items-center justify-between shadow-sm ${className}`}
    >
      <div className="space-y-2">
        <Skeleton variant="text" className="h-3 w-24" />
        <Skeleton variant="text" className="h-8 w-20" />
        <Skeleton variant="text" className="h-3 w-28" />
      </div>
      <Skeleton variant="rectangle" className="w-11 h-11 rounded-xl flex-shrink-0" />
    </div>
  )
}

/** A chart card with a fixed-height plot area (matches the page's chart cards). */
function ListeningChartCardSkeleton({ height }: { height: string }) {
  return (
    <div
      className={`rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 shadow-sm flex flex-col ${height}`}
    >
      {/* Card header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-800/70">
        <Skeleton variant="rectangle" className="w-9 h-9 rounded-xl flex-shrink-0" />
        <div className="space-y-2">
          <Skeleton variant="text" className="h-4 w-44" />
          <Skeleton variant="text" className="h-3 w-56 max-w-full" />
        </div>
      </div>
      {/* Plot area */}
      <div className="flex-1 p-5">
        <Skeleton variant="chart" className="h-full w-full rounded-md" />
      </div>
    </div>
  )
}

function SocialListeningSkeletonImpl() {
  return (
    <div
      data-testid="social-listening-skeleton"
      className="flex-1 min-h-screen bg-gray-50 dark:bg-gray-900"
    >
      {/* Header bar */}
      <div className="border-b border-gray-200/70 dark:border-gray-800/70 bg-white dark:bg-gray-800">
        <div className="px-5 lg:px-8 py-3 flex flex-wrap items-center gap-x-4 gap-y-3">
          {/* Brand + title */}
          <div className="flex items-center gap-2.5 mr-auto">
            <Skeleton variant="rectangle" className="w-9 h-9 rounded-lg flex-shrink-0" />
            <div className="space-y-1.5">
              <Skeleton variant="text" className="h-5 w-40" />
              <Skeleton variant="text" className="h-3 w-28" />
            </div>
          </div>
          {/* Search input */}
          <Skeleton variant="rectangle" className="flex-1 min-w-[200px] sm:max-w-md h-10 rounded-lg" />
          {/* Sync action */}
          <Skeleton variant="button" className="h-10 w-40 rounded-lg flex-shrink-0" />
        </div>
      </div>

      {/* Main content body */}
      <div className="px-5 lg:px-8 py-6">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* MAIN COLUMN */}
          <div className="xl:col-span-8 space-y-6">
            {/* Bento KPI cluster: hero tile (row-span-2) + stacked metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:row-span-2 rounded-2xl border border-blue-200/60 dark:border-blue-500/20 bg-gradient-to-br from-blue-50 to-sky-50/50 dark:from-blue-950/40 dark:to-gray-800 p-5 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Skeleton variant="rectangle" className="w-9 h-9 rounded-xl" />
                    <Skeleton variant="text" className="h-3 w-28" />
                  </div>
                  <Skeleton variant="text" className="h-10 w-32" />
                  <Skeleton variant="text" className="h-3 w-24" />
                </div>
                <Skeleton variant="rectangle" className="h-2.5 w-full rounded-full mt-5" />
              </div>
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton className="sm:col-span-2" />
            </div>

            {/* Topic velocity matrix chart */}
            <ListeningChartCardSkeleton height="h-[380px]" />

            {/* Mood history chart */}
            <ListeningChartCardSkeleton height="h-[300px]" />
          </div>

          {/* INTELLIGENCE RAIL */}
          <div className="xl:col-span-4 space-y-6">
            {/* Sentiment summary card */}
            <StatCardSkeleton />

            {/* Alerts / mention cards list */}
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 shadow-sm">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-800/70">
                <Skeleton variant="rectangle" className="w-9 h-9 rounded-xl" />
                <Skeleton variant="text" className="h-4 w-32" />
              </div>
              <div className="p-5 space-y-4">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-xl border border-gray-100 dark:border-gray-800 p-4"
                  >
                    <Skeleton variant="rectangle" className="w-10 h-10 rounded-lg flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton variant="text" className="h-4 w-3/4" />
                      <Skeleton variant="text" className="h-3 w-full" />
                      <Skeleton variant="text" className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export const SocialListeningSkeleton = React.memo(SocialListeningSkeletonImpl)
SocialListeningSkeleton.displayName = 'SocialListeningSkeleton'
