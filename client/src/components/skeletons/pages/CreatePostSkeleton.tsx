import React from 'react'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * CreatePostSkeleton — Page_Skeleton for `components/create/create-post.tsx`
 * (the `/create` route).
 *
 * Reproduces the real page's outer slot pixel-for-pixel: the
 * `max-w-[1400px] mx-auto p-4 sm:p-8 min-h-screen` wrapper, the
 * `flex flex-col sm:flex-row sm:items-center justify-between mb-12 gap-6`
 * header (eyebrow + "Create Post" title + subtitle on the left, preview-toggle
 * + close controls on the right), and the default single-column form grid
 * (`grid-cols-1 max-w-4xl` with `space-y-12` sections): a destination/account
 * picker block, a media drop zone, a caption editor, and an action row. Pure
 * and presentational — no data, no effects.
 *
 * Spec: pixel-perfect-skeleton-loading (R4.1, R5.1, R5.2, R5.3, R8.2, R8.3, R10.1).
 */
function CreatePostSkeletonImpl() {
  return (
    <div
      data-testid="create-post-skeleton"
      className="max-w-[1400px] mx-auto p-4 sm:p-8 min-h-screen"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-12 gap-6">
        <div className="space-y-1">
          {/* Eyebrow row (dot + label) */}
          <div className="flex items-center gap-3 mb-2">
            <Skeleton variant="circle" className="h-2 w-2 rounded-full" />
            <Skeleton variant="text" className="h-4 w-28" />
          </div>
          {/* Title */}
          <Skeleton variant="text" className="h-9 w-56" />
          {/* Subtitle */}
          <Skeleton variant="text" className="h-4 w-full max-w-xl mt-2" />
        </div>

        {/* Right-side controls */}
        <div className="flex items-center gap-3">
          <Skeleton variant="button" className="hidden lg:block h-10 w-32 rounded-full" />
          <Skeleton variant="button" className="h-10 w-10 rounded-full" />
        </div>
      </div>

      {/* Single-column form grid */}
      <div className="grid gap-12 grid-cols-1 max-w-4xl">
        <div className="space-y-12">
          {/* Section 1: Destination / account picker */}
          <section className="space-y-4">
            <Skeleton variant="text" className="h-4 w-40" />
            <Skeleton variant="rectangle" className="h-16 w-full rounded-2xl" />
          </section>

          {/* Section 2: Media upload drop zone */}
          <section className="space-y-4">
            <Skeleton variant="text" className="h-4 w-32" />
            <Skeleton variant="rectangle" className="h-64 w-full rounded-2xl" />
          </section>

          {/* Section 3: Caption editor */}
          <section className="space-y-4">
            <Skeleton variant="text" className="h-4 w-36" />
            <Skeleton variant="rectangle" className="h-40 w-full rounded-2xl" />
          </section>

          {/* Section 4: Action row */}
          <section className="flex items-center justify-end gap-3">
            <Skeleton variant="button" className="h-11 w-32 rounded-full" />
            <Skeleton variant="button" className="h-11 w-40 rounded-full" />
          </section>
        </div>
      </div>
    </div>
  )
}

export const CreatePostSkeleton = React.memo(CreatePostSkeletonImpl)
CreatePostSkeleton.displayName = 'CreatePostSkeleton'
