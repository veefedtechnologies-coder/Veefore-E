import React from 'react'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * BestTimeWidgetSkeleton — placeholder for the dashboard "Optimal Posting Time"
 * widget (see `components/dashboard/best-time-widget.tsx`).
 *
 * This is the canonical conditional-rendering-parity case (Requirement 9). While
 * the underlying data is still `unknown`, the skeleton mirrors ONLY the
 * **populated data-card** variant — the main peak-engagement stat, the 2x
 * mini-stats grid, and the "View Full Breakdown" action button. It deliberately
 * does NOT mirror the "Gathering Data" / "No Data" empty card (R9.2). On resolve,
 * the real `BestTimeWidget` owns the hand-off and picks populated/empty itself
 * (R9.3, R9.6).
 *
 * Mirrors the real card slot pixel-for-pixel: the same glassmorphism
 * (`bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm`), `rounded-3xl` surface,
 * `p-6 pb-2` header row + `p-6 pt-2 space-y-6` content, the main stat block, the
 * `grid grid-cols-2 gap-3` mini-stats tiles, and the full-width action button —
 * so it occupies the identical slot with zero layout shift. Pure and
 * presentational — no data, no effects.
 *
 * Spec: pixel-perfect-skeleton-loading (R4.3, R5.1, R5.4, R9.2, R9.6).
 */
function BestTimeWidgetSkeletonImpl() {
  return (
    <div
      data-testid="best-time-widget-skeleton"
      className="relative overflow-hidden bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm shadow-xl border-0 rounded-3xl"
    >
      {/* Header — matches CardHeader (p-6 pb-2): title slot + AI badge */}
      <div className="flex flex-col space-y-1.5 p-6 pb-2">
        <div className="flex items-center justify-between">
          {/* Clock icon + "Optimal Posting Time" title slot */}
          <div className="flex items-center gap-2">
            <Skeleton variant="circle" className="w-4 h-4" />
            <Skeleton variant="text" className="h-5 w-40" />
          </div>
          {/* AI Model badge */}
          <Skeleton variant="pill" className="h-6 w-16 rounded-md" />
        </div>
      </div>

      {/* Content — matches CardContent (p-6 pt-2 space-y-6) */}
      <div className="p-6 pt-2 space-y-6">
        {/* Main Stat: label + peak-engagement value + window line */}
        <div className="flex items-end justify-between">
          <div>
            <Skeleton variant="text" className="h-4 w-28 mb-2" />
            <Skeleton variant="rectangle" className="h-10 md:h-12 w-32 mb-3" />
            <Skeleton variant="text" className="h-4 w-24" />
          </div>
        </div>

        {/* Mini Stats Grid — 2 tiles, matching the real bg + border + padding */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
            <Skeleton variant="text" className="h-3 w-20 mb-2" />
            <Skeleton variant="text" className="h-6 w-12 mb-2" />
            <Skeleton variant="text" className="h-2 w-16 mt-1" />
          </div>
          <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
            <Skeleton variant="text" className="h-3 w-16 mb-2" />
            <Skeleton variant="text" className="h-6 w-16 mb-2" />
            <Skeleton variant="text" className="h-2 w-20 mt-1" />
          </div>
        </div>

        {/* Action Button — full-width "View Full Breakdown" */}
        <Skeleton variant="button" className="h-10 w-full rounded-md" />
      </div>
    </div>
  )
}

export const BestTimeWidgetSkeleton = React.memo(BestTimeWidgetSkeletonImpl)
BestTimeWidgetSkeleton.displayName = 'BestTimeWidgetSkeleton'
