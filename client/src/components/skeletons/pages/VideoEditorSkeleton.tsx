import React from 'react'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * VideoEditorSkeleton — Page_Skeleton for the Video Editor route
 * (`features/video-editor/components/VideoEditorPage.tsx`, the `/video-editor`
 * route).
 *
 * The route renders the page inside a sidebar shell with a bare
 * `<main className="flex-1 overflow-y-auto">` Suspense region, so this skeleton
 * reproduces ONLY that main region — the editor surface shell. It does NOT
 * re-create the sidebar, which lives outside the Suspense boundary.
 *
 * Layout parity (zero layout shift): mirrors the `VideoEditorPage` shell — a
 * left preview/version column and a right conversational-editing column, with a
 * bottom composer block. These regions are seams for the follow-up tasks
 * (conversational edit box + job/progress + version panels = 23.4, gating =
 * 23.3, credit-estimate UI = 23.5).
 *
 * Pure and presentational — no data, no effects.
 */
function VideoEditorSkeletonImpl() {
  return (
    <div
      data-testid="video-editor-skeleton"
      className="flex-1 flex flex-col px-6 py-6 gap-6 lg:flex-row"
    >
      {/* Preview + version panel column */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        <Skeleton variant="rectangle" className="w-full aspect-video rounded-2xl" />
        <div className="flex items-center gap-3">
          <Skeleton variant="card" className="h-20 w-32 rounded-xl" />
          <Skeleton variant="card" className="h-20 w-32 rounded-xl" />
          <Skeleton variant="card" className="h-20 w-32 rounded-xl" />
        </div>
      </div>

      {/* Conversational editing + job/progress column */}
      <div className="w-full lg:max-w-sm flex flex-col gap-4">
        <Skeleton variant="text" className="h-6 w-40" />
        <Skeleton variant="card" className="h-24 w-full rounded-2xl" />
        <Skeleton variant="card" className="h-24 w-full rounded-2xl" />
        <div className="mt-auto">
          <Skeleton variant="rectangle" className="h-24 w-full rounded-3xl" />
        </div>
      </div>
    </div>
  )
}

export const VideoEditorSkeleton = React.memo(VideoEditorSkeletonImpl)
VideoEditorSkeleton.displayName = 'VideoEditorSkeleton'
