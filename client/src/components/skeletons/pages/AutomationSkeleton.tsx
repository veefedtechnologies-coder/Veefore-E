import React from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { clampListCount } from '@/components/skeletons/render-state'

/**
 * AutomationSkeleton — Page_Skeleton for the `/automation` route, which renders
 * `<AutomationStepByStep />` → `<AutomationBuilder />`
 * (`features/automation/components/AutomationBuilder.tsx`) inside the
 * `flex-1 overflow-y-auto` `<main>` Suspense boundary (the app's `w-24` icon
 * rail lives outside this slot).
 *
 * Layout parity (zero layout shift, R8.2): mirrors the builder's
 * `automation-builder` view — the `mb-12` progress-steps row
 * (`flex items-center justify-between max-w-5xl mx-auto` of `w-14 h-14`
 * numbered step circles joined by `h-1` connector bars) and the
 * `max-w-7xl mx-auto` step-content card
 * (`bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8`) with its step heading,
 * a grid of trigger/action config cards, a stats row, a table-like list of
 * existing automations, and the footer navigation buttons.
 *
 * Conditional-rendering parity (R9): the trigger/action/automation-list items
 * are variable lists → clamped to [3, 10] via `clampListCount`; everything is
 * rendered as the populated variant during load.
 *
 * Pure and presentational — no data, no effects.
 *
 * Spec: pixel-perfect-skeleton-loading (R4.1, R5.1, R5.2, R5.3, R8.2, R8.3, R10.1).
 */

/** A single trigger / action configuration card. */
function AutomationConfigCardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-5 space-y-4">
      <div className="flex items-center space-x-3">
        <Skeleton variant="rectangle" className="w-10 h-10 rounded-lg flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" className="h-4 w-32" />
          <Skeleton variant="text" className="h-3 w-44 max-w-full" />
        </div>
      </div>
      <Skeleton variant="rectangle" className="h-10 w-full rounded-lg" />
    </div>
  )
}

/** A single stats tile. */
function AutomationStatTileSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-3">
      <Skeleton variant="text" className="h-4 w-24" />
      <Skeleton variant="text" className="h-8 w-16" />
    </div>
  )
}

/** A single existing-automation list row (mirrors a workflow table row). */
function AutomationListRowSkeleton() {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 last:border-0">
      <div className="flex items-center space-x-4 flex-1">
        <Skeleton variant="rectangle" className="w-10 h-10 rounded-lg flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" className="h-4 w-40" />
          <Skeleton variant="text" className="h-3 w-28" />
        </div>
      </div>
      <Skeleton variant="pill" className="h-6 w-16 rounded-full" />
      <Skeleton variant="button" className="h-8 w-20 rounded-lg ml-4" />
    </div>
  )
}

function AutomationSkeletonImpl() {
  const steps = 4
  const configCards = clampListCount(4, { default: 4 })
  const stats = clampListCount(3, { default: 3 })
  const rows = clampListCount(4, { default: 4 })

  return (
    <div data-testid="automation-skeleton" className="automation-builder">
      {/* Progress steps */}
      <div className="mb-12">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          {Array.from({ length: steps }).map((_, i) => (
            <div key={i} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <Skeleton variant="rectangle" className="w-14 h-14 rounded-full" />
                <div className="mt-3 text-center space-y-1.5">
                  <Skeleton variant="text" className="h-4 w-20" />
                  <Skeleton variant="text" className="h-3 w-24" />
                </div>
              </div>
              {i < steps - 1 && (
                <Skeleton variant="rectangle" className="flex-1 h-1 mx-6 mt-[-25px] rounded-full" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step content card */}
      <div className="max-w-7xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 space-y-8">
          {/* Step heading */}
          <Skeleton variant="text" className="h-8 w-72 max-w-full" />

          {/* Trigger / action config cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Array.from({ length: configCards }).map((_, i) => (
              <AutomationConfigCardSkeleton key={i} />
            ))}
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Array.from({ length: stats }).map((_, i) => (
              <AutomationStatTileSkeleton key={i} />
            ))}
          </div>

          {/* Existing automations table/list */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              <Skeleton variant="text" className="h-4 w-40" />
            </div>
            {Array.from({ length: rows }).map((_, i) => (
              <AutomationListRowSkeleton key={i} />
            ))}
          </div>

          {/* Footer navigation */}
          <div className="flex justify-between">
            <Skeleton variant="button" className="h-12 w-28 rounded-lg" />
            <Skeleton variant="button" className="h-12 w-28 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  )
}

export const AutomationSkeleton = React.memo(AutomationSkeletonImpl)
AutomationSkeleton.displayName = 'AutomationSkeleton'
