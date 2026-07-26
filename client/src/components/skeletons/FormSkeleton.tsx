import React from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { clampListCount } from '@/components/skeletons/render-state'

export interface FormSkeletonProps {
  /**
   * Number of label+input field rows to render. Clamped to [3, 10] (default 4)
   * so the placeholder never implies the exact final field count (R9.8).
   */
  fields?: number
}

/**
 * FormSkeleton — placeholder for settings/profile forms (see
 * `features/settings/components/ProfileSettings.tsx`).
 *
 * Mirrors the real form section slot pixel-for-pixel: the
 * `bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border ... space-y-6`
 * card, a section heading line, a two-column responsive grid of
 * label (`h-4`) + input (`h-11 rounded-xl`) field pairs, and a right-aligned
 * submit button. Pure and presentational — no data, no effects.
 *
 * Spec: pixel-perfect-skeleton-loading (R4.2, R5.1, R5.2, R5.4, R9.8,
 * R10.2–R10.4).
 */
function FormSkeletonImpl({ fields }: FormSkeletonProps) {
  const fieldCount = clampListCount(fields, { default: 4 })

  return (
    <div
      data-testid="form-skeleton"
      className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-6"
    >
      {/* Section heading */}
      <Skeleton variant="text" className="h-6 w-40" />

      {/* Field grid: label + input pairs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Array.from({ length: fieldCount }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton variant="text" className="h-4 w-28" />
            <Skeleton variant="rectangle" className="h-11 w-full rounded-xl" />
          </div>
        ))}
      </div>

      {/* Submit button */}
      <div className="flex justify-end pt-4">
        <Skeleton variant="button" className="h-10 w-36 rounded-xl" />
      </div>
    </div>
  )
}

export const FormSkeleton = React.memo(FormSkeletonImpl)
FormSkeleton.displayName = 'FormSkeleton'
