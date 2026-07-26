import React from 'react'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * ProfileSkeleton — Page_Skeleton for `pages/Profile.tsx` (the `/profile`
 * route, rendered inside the `DashboardLayout` `<main className="… p-6 …">`
 * Suspense region).
 *
 * Reproduces the real profile page slot pixel-for-pixel: the
 * `max-w-4xl mx-auto p-6 space-y-8` wrapper containing three
 * `bg-white dark:bg-gray-800 rounded-2xl shadow-sm border ... p-8` cards:
 *   1. Identity card — avatar + name/email/badge lines + edit button.
 *   2. Account-info card — heading + 2x2 responsive label/input grid.
 *   3. Security / billing card — heading + two-column mixed content.
 *
 * This mirrors the legacy `SkeletonProfilePage` previously co-located in
 * `Profile.tsx`, rebuilt on the variant primitive (no inline `<style>` shimmer).
 * Pure and presentational — no data, no effects.
 *
 * Spec: pixel-perfect-skeleton-loading (R4.1, R5.1, R5.2, R5.3, R8.2, R8.3, R10.1).
 */
function ProfileSkeletonImpl() {
  return (
    <div data-testid="profile-skeleton" className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Identity card */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
        <div className="flex items-center space-x-6">
          <Skeleton variant="avatar" className="w-24 h-24 rounded-full" />
          <div className="flex-1 space-y-3">
            <Skeleton variant="text" className="h-8 w-48" />
            <Skeleton variant="text" className="h-4 w-64" />
            <div className="flex items-center space-x-4 mt-2">
              <Skeleton variant="pill" className="h-6 w-24 rounded-full" />
              <Skeleton variant="pill" className="h-6 w-24 rounded-full" />
            </div>
          </div>
          <Skeleton variant="button" className="h-10 w-28 rounded-lg" />
        </div>
      </div>

      {/* Account-info card */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
        <Skeleton variant="text" className="h-6 w-40 mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton variant="text" className="h-4 w-28" />
              <Skeleton variant="rectangle" className="h-10 w-full rounded-md" />
            </div>
          ))}
        </div>
      </div>

      {/* Security / billing card */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
        <Skeleton variant="text" className="h-6 w-36 mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left: toggle rows */}
          <div className="space-y-4">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
              >
                <div className="flex items-center space-x-3">
                  <Skeleton variant="rectangle" className="w-5 h-5 rounded" />
                  <div className="space-y-2">
                    <Skeleton variant="text" className="h-4 w-28" />
                    <Skeleton variant="text" className="h-3 w-20" />
                  </div>
                </div>
                <Skeleton variant="button" className="h-8 w-16 rounded-md" />
              </div>
            ))}
          </div>
          {/* Right: stat callouts */}
          <div className="space-y-4">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-600"
              >
                <Skeleton variant="text" className="h-4 w-28 mb-2" />
                <Skeleton variant="text" className="h-8 w-16 mb-2" />
                <Skeleton variant="text" className="h-3 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export const ProfileSkeleton = React.memo(ProfileSkeletonImpl)
ProfileSkeleton.displayName = 'ProfileSkeleton'
