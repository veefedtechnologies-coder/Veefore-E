import React from 'react'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * KpiCardSkeleton — placeholder for a single dashboard KPI / quick-action
 * metric card (see `components/dashboard/quick-actions.tsx`).
 *
 * Mirrors the real card slot pixel-for-pixel: the same
 * `p-8 rounded-2xl min-h-[200px] flex flex-col items-center justify-center`
 * outer container, the `w-24 h-24 rounded-2xl` icon block (with `mb-8`), and a
 * single centered title line. Pure and presentational — no data, no effects.
 *
 * Spec: pixel-perfect-skeleton-loading (R4.2, R5.1, R5.2, R5.4, R10.2–R10.4).
 */
function KpiCardSkeletonImpl() {
  return (
    <div
      data-testid="kpi-card-skeleton"
      className="bg-transparent p-8 rounded-2xl min-h-[200px] flex flex-col items-center justify-center"
    >
      {/* Icon block — matches the real w-24 h-24 rounded-2xl icon tile + mb-8 */}
      <div className="mb-8 flex justify-center">
        <Skeleton variant="rectangle" className="w-24 h-24 rounded-2xl" />
      </div>

      {/* Title — matches the centered single-line h3 */}
      <div className="text-center">
        <Skeleton variant="text" className="h-6 w-32 rounded-lg mx-auto" />
      </div>
    </div>
  )
}

export const KpiCardSkeleton = React.memo(KpiCardSkeletonImpl)
KpiCardSkeleton.displayName = 'KpiCardSkeleton'
