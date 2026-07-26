import React from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { PostCardSkeleton } from '@/components/skeletons'
import { clampListCount } from '@/components/skeletons/render-state'

/**
 * DraftsSkeleton — Page_Skeleton for `pages/DraftsPage.tsx`.
 *
 * Reproduces the real page's outer slot pixel-for-pixel: the
 * `min-h-full pb-16` wrapper, the premium gradient header band
 * (`mb-8 pb-8 border-b`) with a back-button + "Drafts" title + "N Saved" pill +
 * subtitle, the `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8` content container, and
 * the `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6`
 * post-card grid built from `PostCardSkeleton`. The card count is clamped to
 * [3, 10] via `clampListCount`. Pure and presentational — no data, no effects.
 *
 * Spec: pixel-perfect-skeleton-loading (R4.1, R5.1, R5.2, R5.3, R8.2, R8.3, R10.1).
 */
function DraftsSkeletonImpl() {
  const count = clampListCount(8, { default: 8 })

  return (
    <div data-testid="drafts-skeleton" className="min-h-full pb-16">
      {/* Premium header band */}
      <div className="relative mb-8 pb-8 border-b border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center space-x-2 pt-6">
            <Skeleton variant="button" className="w-9 h-9 rounded-md flex-shrink-0" />
            <div>
              <div className="flex items-center space-x-3">
                <Skeleton variant="text" className="h-9 w-40" />
                <Skeleton variant="pill" className="h-6 w-20 rounded-full" />
              </div>
              <Skeleton variant="text" className="h-4 w-80 mt-2" />
            </div>
          </div>
        </div>
      </div>

      {/* Post-card grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: count }).map((_, i) => (
            <PostCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  )
}

export const DraftsSkeleton = React.memo(DraftsSkeletonImpl)
DraftsSkeleton.displayName = 'DraftsSkeleton'
