import React from 'react'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * VideoGeneratorSkeleton — Page_Skeleton for `pages/VideoGeneratorAdvanced.tsx`
 * (the `/video-generator` route).
 *
 * The route renders the page inside a sidebar shell with a bare
 * `<main className="flex-1 overflow-y-auto">` Suspense region, so this skeleton
 * reproduces ONLY that main region — the initial `prompt` step
 * (`features/video-generator/components/VideoPromptStep.tsx`), which is the
 * first thing a user sees. It does NOT re-create the sidebar, which lives
 * outside the Suspense boundary.
 *
 * Layout parity (zero layout shift, R8.2):
 *   - Main content area: `flex-1 flex flex-col px-8 py-16` (mirrors the prompt
 *     step's outer wrapper).
 *   - Centered greeting block (`text-center mb-16`): a 4xl heading line + a
 *     subtitle line.
 *   - Suggestion card cluster: `max-w-4xl w-full mb-16` → a
 *     `grid grid-cols-12 grid-rows-2 gap-3 h-48` mixed grid of cards (matching
 *     the real Gemini-style suggestion layout's column spans).
 *   - Bottom input area: `w-full max-w-3xl` rounded composer block.
 *
 * Pure and presentational — no data, no effects.
 *
 * Spec: pixel-perfect-skeleton-loading (R4.1, R5.1, R5.2, R5.3, R8.2, R8.3, R10.1).
 */
function VideoGeneratorSkeletonImpl() {
  return (
    <div
      data-testid="video-generator-skeleton"
      className="flex-1 flex flex-col px-8 py-16"
    >
      {/* Centered greeting + suggestion cluster */}
      <div className="flex-1 flex flex-col items-center justify-center">
        {/* Greeting */}
        <div className="text-center mb-16 space-y-4 flex flex-col items-center">
          <Skeleton variant="text" className="h-10 w-72" />
          <Skeleton variant="text" className="h-6 w-80 max-w-full" />
        </div>

        {/* Suggestion cards — mixed 12-col x 2-row grid (h-48) */}
        <div className="max-w-4xl w-full mb-16">
          <div className="grid grid-cols-12 grid-rows-2 gap-3 h-48">
            <Skeleton variant="card" className="col-span-7 row-span-1 h-full w-full rounded-2xl" />
            <Skeleton variant="card" className="col-span-5 row-span-2 h-full w-full rounded-2xl" />
            <Skeleton variant="card" className="col-span-4 row-span-1 h-full w-full rounded-2xl" />
            <Skeleton variant="card" className="col-span-3 row-span-1 h-full w-full rounded-2xl" />
          </div>
        </div>

        {/* Bottom composer input */}
        <div className="w-full max-w-3xl">
          <Skeleton variant="rectangle" className="h-28 w-full rounded-3xl" />
        </div>
      </div>
    </div>
  )
}

export const VideoGeneratorSkeleton = React.memo(VideoGeneratorSkeletonImpl)
VideoGeneratorSkeleton.displayName = 'VideoGeneratorSkeleton'
