import React from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  KpiCardSkeleton,
  PerformanceScoreSkeleton,
  BestTimeWidgetSkeleton,
  SocialAccountCardSkeleton,
} from '@/components/skeletons'

/**
 * DashboardSkeleton — Page_Skeleton for the authenticated home dashboard
 * (the `/` route in `AuthenticatedApp.tsx`).
 *
 * Composed to occupy the EXACT same slot as the real dashboard content that is
 * wrapped in `<React.Suspense>` inside the `<main className="… p-6 …">` region
 * (so this skeleton is rendered as that Suspense fallback — task 9.1). It does
 * NOT re-create the sidebar / header / `<main>` wrapper, which live outside the
 * Suspense boundary.
 *
 * Layout parity (zero layout shift, R8.2):
 *   - QuickActions KPI grid: `mb-8` → `mb-16` → `grid grid-cols-2 md:grid-cols-4
 *     gap-10 px-3 sm:px-4 lg:px-6`, four `KpiCardSkeleton` cells.
 *   - Two-column body: `grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8`, each column
 *     a `space-y-6` stack — mirroring the real `<PerformanceScore/>`, `<GetStarted/>`
 *     (left) and `<BestTimeWidget/>`, `<Recommendations/>`, `<SocialAccounts/>`
 *     (right) ordering.
 *
 * Conditional-rendering parity (R9, the key concern):
 *   - The KPI grid, performance score and get-started sections are static
 *     (always present) → rendered as the populated variant.
 *   - Best-time, recommendations and social-accounts are data-gated and their
 *     condition is `unknown` during page load → only the POPULATED variant is
 *     rendered (never the "Gathering Data" / empty / retry variants), per the
 *     conditional-knowledge model. On resolve the real components own the
 *     hand-off and pick populated/empty/error themselves (R9.2, R9.3).
 *
 * Pure and presentational — no data, no effects.
 *
 * Spec: pixel-perfect-skeleton-loading (R4.1, R5.1, R5.2, R5.3, R8.2, R8.3, R10.1).
 */

/** Mirrors `components/dashboard/get-started.tsx` (static, always present). */
function GetStartedSkeleton() {
  return (
    <Card className="border-gray-200/50 dark:border-gray-700/50 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm shadow-xl transition-all duration-300 border-0">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-6">
        <Skeleton variant="text" className="h-6 w-56" />
        <Skeleton variant="rectangle" className="w-9 h-9 rounded-xl" />
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Four task rows — icon tile + two text lines */}
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-start space-x-4 p-4 rounded-2xl bg-gradient-to-r from-gray-50 to-green-50/30 dark:from-gray-700 dark:to-green-900/30"
          >
            <Skeleton variant="rectangle" className="w-12 h-12 rounded-2xl flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton variant="text" className="h-5 w-44" />
              <Skeleton variant="text" className="h-4 w-64 max-w-full" />
            </div>
          </div>
        ))}

        {/* Kickstart gradient banner */}
        <div className="mt-8 p-6 bg-gradient-to-br from-blue-500 via-purple-500 to-indigo-600 dark:from-blue-600 dark:via-purple-600 dark:to-indigo-700 rounded-3xl">
          <div className="space-y-3">
            <Skeleton variant="text" className="h-6 w-64 bg-white/20" />
            <Skeleton variant="text" className="h-4 w-full max-w-md bg-white/20" />
            <Skeleton variant="button" className="h-11 w-36 rounded-md bg-white/20 mt-3" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Mirrors the populated `Recommendations` card (`components/dashboard/recommendations.tsx`).
 * Data-gated → unknown during load → populated variant only (3 rows, R9.2, R9.8).
 */
function RecommendationsSectionSkeleton() {
  return (
    <Card className="border-gray-200/50 dark:border-gray-700/50 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm shadow-xl transition-all duration-300 border-0">
      <CardHeader>
        <Skeleton variant="text" className="h-6 w-48" />
      </CardHeader>
      <CardContent className="space-y-6">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex items-start space-x-5 p-4 rounded-2xl bg-gradient-to-r from-gray-50 to-blue-50/30 dark:from-gray-700 dark:to-blue-900/30"
          >
            <Skeleton variant="rectangle" className="w-12 h-12 flex-shrink-0 rounded-2xl" />
            <div className="flex-1 space-y-2">
              <Skeleton variant="text" className="h-5 w-40" />
              <Skeleton variant="text" className="h-4 w-full" />
              <Skeleton variant="text" className="h-4 w-4/5" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

/**
 * Mirrors the populated `SocialAccounts` card (`components/dashboard/social-accounts.tsx`):
 * the gradient header (title + actions + account tabs) plus a single populated
 * account card built from the shared `SocialAccountCardSkeleton`.
 * Data-gated → unknown during load → populated variant only (R9.2).
 */
function SocialAccountsSectionSkeleton() {
  return (
    <Card className="bg-white dark:bg-gray-800 shadow-lg border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
      <CardContent className="p-0">
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-slate-50 to-gray-50 dark:from-gray-800 dark:to-gray-700 border-b border-gray-100 dark:border-gray-600">
          <div className="flex items-center justify-between mb-4">
            <div className="space-y-2">
              <Skeleton variant="text" className="h-6 w-36" />
              <Skeleton variant="text" className="h-4 w-48" />
            </div>
            <div className="flex space-x-2">
              <Skeleton variant="button" className="h-8 w-28 rounded-lg" />
              <Skeleton variant="button" className="h-8 w-32 rounded-lg" />
            </div>
          </div>
          {/* Account selector tabs */}
          <div className="flex space-x-2 overflow-x-auto">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} variant="rectangle" className="h-12 w-12 rounded-xl flex-shrink-0" />
            ))}
          </div>
        </div>

        {/* Body — single populated account card */}
        <div className="p-6">
          <SocialAccountCardSkeleton />
        </div>
      </CardContent>
    </Card>
  )
}

function DashboardSkeletonImpl() {
  return (
    <div data-testid="dashboard-skeleton">
      {/* QuickActions KPI grid — matches `<div className="mb-8"><QuickActions/></div>` */}
      <div className="mb-8">
        <div className="mb-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 px-3 sm:px-4 lg:px-6">
            {[0, 1, 2, 3].map((i) => (
              <KpiCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>

      {/* Two-column body — matches `grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8` */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8">
        {/* Left column */}
        <div className="space-y-6">
          <PerformanceScoreSkeleton />
          <GetStartedSkeleton />
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <BestTimeWidgetSkeleton />
          <RecommendationsSectionSkeleton />
          <SocialAccountsSectionSkeleton />
        </div>
      </div>
    </div>
  )
}

export const DashboardSkeleton = React.memo(DashboardSkeletonImpl)
DashboardSkeleton.displayName = 'DashboardSkeleton'
