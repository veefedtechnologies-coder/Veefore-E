import React from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { PostCardSkeleton } from '@/components/skeletons'
import { clampListCount } from '@/components/skeletons/render-state'

/**
 * PublishedPostsSkeleton — Page_Skeleton for `pages/PublishedPostsPage.tsx`.
 *
 * Reproduces the real page's outer slot pixel-for-pixel: the
 * `min-h-full pb-16` wrapper, the premium emerald gradient header band
 * (`mb-8 pb-8 border-b`) with a back-button + "Published" title + "N Live"
 * pill + subtitle, the `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8` content
 * container, the centered filter-pill segmented control
 * (`min-w-[400px]` rounded-full bar with All/Post/Reel/Story), and the
 * `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6` post-card
 * grid built from `PostCardSkeleton`. The card count is clamped to [3, 10] via
 * `clampListCount`. Pure and presentational — no data, no effects.
 *
 * Spec: pixel-perfect-skeleton-loading (R4.1, R5.1, R5.2, R5.3, R8.2, R8.3, R10.1).
 */
function PublishedPostsSkeletonImpl() {
  const count = clampListCount(8, { default: 8 })

  return (
    <div data-testid="published-posts-skeleton" className="min-h-full pb-16">
      {/* Premium header band */}
      <div className="relative mb-8 pb-8 border-b border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center space-x-2 pt-6">
            <Skeleton variant="button" className="w-9 h-9 rounded-md flex-shrink-0" />
            <div>
              <div className="flex items-center space-x-3">
                <Skeleton variant="text" className="h-9 w-48" />
                <Skeleton variant="pill" className="h-6 w-20 rounded-full" />
              </div>
              <Skeleton variant="text" className="h-4 w-80 mt-2" />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Filter segmented control */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex items-center p-2 space-x-2 bg-white/30 dark:bg-gray-900/30 backdrop-blur-xl border border-white/40 dark:border-gray-700/50 rounded-full shadow-lg min-w-[400px] justify-between">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} variant="pill" className="flex-1 h-9 rounded-full" />
            ))}
          </div>
        </div>

        {/* Post-card grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: count }).map((_, i) => (
            <PostCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  )
}

export const PublishedPostsSkeleton = React.memo(PublishedPostsSkeletonImpl)
PublishedPostsSkeleton.displayName = 'PublishedPostsSkeleton'
