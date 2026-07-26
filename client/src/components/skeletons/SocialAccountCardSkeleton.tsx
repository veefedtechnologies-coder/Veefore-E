import React from 'react'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * SocialAccountCardSkeleton — placeholder for a single social-account /
 * integration card (see the co-located `SocialAccountCardSkeleton` inside
 * `components/dashboard/social-accounts.tsx`).
 *
 * Mirrors the real card slot pixel-for-pixel: the rounded-xl gradient surface
 * with `p-4`, the header (avatar + name/handle lines + status pill), and the
 * 2x2 stat grid of mini metric tiles. Pure and presentational — no data, no
 * effects.
 *
 * Spec: pixel-perfect-skeleton-loading (R4.2, R5.1, R5.2, R5.4, R10.2–R10.4).
 */
function SocialAccountCardSkeletonImpl() {
  return (
    <div
      data-testid="social-account-card-skeleton"
      className="p-4 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-800 dark:to-slate-700"
    >
      {/* Header: avatar + name/handle + status pill */}
      <div className="flex items-center space-x-3 mb-4">
        <Skeleton variant="avatar" className="w-12 h-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" className="h-4 w-24" />
          <Skeleton variant="text" className="h-3 w-16" />
        </div>
        <Skeleton variant="pill" className="h-6 w-16 rounded-full" />
      </div>

      {/* 2x2 mini-stat grid */}
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-3 rounded-lg bg-white dark:bg-gray-700/50">
            <Skeleton variant="text" className="h-6 w-16 mb-1" />
            <Skeleton variant="text" className="h-3 w-12" />
          </div>
        ))}
      </div>
    </div>
  )
}

export const SocialAccountCardSkeleton = React.memo(SocialAccountCardSkeletonImpl)
SocialAccountCardSkeleton.displayName = 'SocialAccountCardSkeleton'
