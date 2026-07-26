import React from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { clampListCount } from '@/components/skeletons/render-state'

/**
 * A single column card placeholder mirroring the `ScheduledPosts` / `Drafts` /
 * `PublishedPosts` dashboard column cards rendered on the `/posts` route and
 * the Plan "Posts" tab. Matches their
 * `Card (rounded-lg border bg-white dark:bg-gray-800)` surface, the
 * `CardHeader (pb-4)` title + subtitle + "View all" button row, and a
 * `CardContent (space-y-4)` list of post-row items
 * (`flex items-center space-x-4 p-4 rounded-lg bg-gray-50`).
 */
function PostsColumnCardSkeleton() {
  const rows = clampListCount(3, { default: 3 })
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
      {/* CardHeader: title/subtitle + action button */}
      <div className="flex flex-row items-center justify-between space-y-0 p-6 pb-4">
        <div className="space-y-2">
          <Skeleton variant="text" className="h-5 w-32" />
          <Skeleton variant="text" className="h-3 w-24" />
        </div>
        <Skeleton variant="button" className="h-8 w-36 rounded-lg" />
      </div>
      {/* CardContent: list of post rows */}
      <div className="p-6 pt-0 space-y-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center space-x-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50"
          >
            <Skeleton variant="rectangle" className="w-16 h-16 rounded-lg flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton variant="text" className="h-4 w-3/4" />
              <div className="flex items-center space-x-2">
                <Skeleton variant="text" className="h-3 w-20" />
                <Skeleton variant="text" className="h-3 w-24" />
              </div>
            </div>
            <Skeleton variant="button" className="h-8 w-20 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * PostsSkeleton — Page_Skeleton for the `/posts` route (and the Plan "Posts"
 * tab), which renders `ScheduledPosts`, `Drafts`, and `PublishedPosts` column
 * cards.
 *
 * Reproduces the real slot pixel-for-pixel: the `space-y-6` page wrapper, the
 * `flex flex-col space-y-4` block with a `text-2xl` "Posts & Drafts" heading,
 * and the `grid-cols-1 lg:grid-cols-3 gap-6` three-column grid of column-card
 * placeholders. Pure and presentational — no data, no effects.
 *
 * Spec: pixel-perfect-skeleton-loading (R4.1, R5.1, R5.2, R5.3, R8.2, R8.3, R10.1).
 */
function PostsSkeletonImpl() {
  return (
    <div data-testid="posts-skeleton" className="space-y-6">
      <div className="flex flex-col space-y-4">
        {/* "Posts & Drafts" heading */}
        <Skeleton variant="text" className="h-8 w-56" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <PostsColumnCardSkeleton />
          <PostsColumnCardSkeleton />
          <PostsColumnCardSkeleton />
        </div>
      </div>
    </div>
  )
}

export const PostsSkeleton = React.memo(PostsSkeletonImpl)
PostsSkeleton.displayName = 'PostsSkeleton'
