import React from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { FormSkeleton } from '@/components/skeletons'

/**
 * SettingsSkeleton — Page_Skeleton for `pages/Settings.tsx` /
 * `features/settings/SettingsLayout.tsx` (the `/settings` route, rendered
 * inside a sidebar shell with a bare `<div className="flex-1 overflow-y-auto">`
 * Suspense region).
 *
 * Reproduces the SettingsLayout slot pixel-for-pixel: the
 * `min-h-screen bg-gray-50 dark:bg-gray-900` page, the
 * `max-w-[1400px] mx-auto px-4 sm:px-6 py-8` inner wrapper, the header row
 * (icon tile + title/subtitle on the left, search box on the right), and the
 * `grid grid-cols-1 lg:grid-cols-12 gap-8` body split into a `lg:col-span-3`
 * navigation card (grouped nav items) and a `lg:col-span-9` content area
 * holding the active settings form (composed from the shared `FormSkeleton`).
 *
 * Pure and presentational — no data, no effects.
 *
 * Spec: pixel-perfect-skeleton-loading (R4.1, R5.1, R5.2, R5.3, R8.2, R8.3, R10.1).
 */
function SettingsSkeletonImpl() {
  return (
    <div data-testid="settings-skeleton" className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Skeleton variant="rectangle" className="hidden sm:block w-12 h-12 rounded-xl" />
            <div className="space-y-2">
              <Skeleton variant="text" className="h-8 w-40" />
              <Skeleton variant="text" className="h-4 w-72 max-w-full" />
            </div>
          </div>
          {/* Search bar */}
          <Skeleton variant="rectangle" className="w-full md:w-72 h-11 rounded-xl" />
        </div>

        {/* Body grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Sidebar navigation card */}
          <div className="lg:col-span-3">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 space-y-6">
              {[0, 1, 2].map((group) => (
                <div key={group} className="space-y-2">
                  {/* Group label */}
                  <Skeleton variant="text" className="h-3 w-20 mx-3" />
                  {/* Nav items */}
                  <div className="space-y-1">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                        <Skeleton variant="rectangle" className="w-4 h-4 rounded" />
                        <Skeleton variant="text" className="h-4 w-28" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Content area — active settings form */}
          <div className="lg:col-span-9">
            <FormSkeleton fields={6} />
          </div>
        </div>
      </div>
    </div>
  )
}

export const SettingsSkeleton = React.memo(SettingsSkeletonImpl)
SettingsSkeleton.displayName = 'SettingsSkeleton'
