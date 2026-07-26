import React from 'react'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * PostCardSkeleton — placeholder for a scheduled/draft/published post card (see
 * the post cards in `pages/ScheduledPostsPage.tsx`,
 * `pages/DraftsPage.tsx`, and `pages/PublishedPostsPage.tsx`).
 *
 * Mirrors the real post-card slot pixel-for-pixel: the
 * `flex flex-col bg-white dark:bg-gray-800/80 rounded-2xl border shadow-sm`
 * surface, the `aspect-[4/5]` media thumbnail header, a body (`p-5`) with two
 * text lines (title + meta), and an action dock (`p-4`) with a button. Pure and
 * presentational — no data, no effects.
 *
 * Spec: pixel-perfect-skeleton-loading (R4.2, R5.1, R5.2, R5.4, R10.2, R10.5).
 */
function PostCardSkeletonImpl() {
  return (
    <div
      data-testid="post-card-skeleton"
      className="flex flex-col bg-white dark:bg-gray-800/80 rounded-2xl border border-gray-200/60 dark:border-gray-700/60 shadow-sm overflow-hidden"
    >
      {/* Media thumbnail header — matches the real aspect-[4/5] media slot */}
      <Skeleton
        variant="rectangle"
        className="aspect-[4/5] w-full rounded-none border-b border-gray-100 dark:border-gray-800"
      />

      {/* Content body: title + meta line */}
      <div className="p-5 flex flex-col flex-1">
        <Skeleton variant="text" className="h-5 w-3/4 mb-2" />
        <div className="mt-auto pt-4">
          <Skeleton variant="text" className="h-3 w-2/5" />
        </div>
      </div>

      {/* Action dock */}
      <div className="p-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-800">
        <Skeleton variant="button" className="h-8 w-full rounded-lg" />
      </div>
    </div>
  )
}

export const PostCardSkeleton = React.memo(PostCardSkeletonImpl)
PostCardSkeleton.displayName = 'PostCardSkeleton'
