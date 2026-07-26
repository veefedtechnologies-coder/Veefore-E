import React from 'react'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * ConversationListItemSkeleton — placeholder for a single chat/conversation
 * list row (see the conversation list in
 * `features/chat/components/ConversationSidebar.tsx`).
 *
 * Mirrors the real list-row slot pixel-for-pixel: the
 * `flex items-center space-x-3 px-3 py-2.5 rounded-lg` row with a small leading
 * avatar/icon block and two stacked text lines (title + preview). Pure and
 * presentational — no data, no effects.
 *
 * Spec: pixel-perfect-skeleton-loading (R4.2, R5.1, R5.2, R5.4, R10.2, R10.5).
 */
function ConversationListItemSkeletonImpl() {
  return (
    <div
      data-testid="conversation-list-item-skeleton"
      className="flex items-center space-x-3 px-3 py-2.5 rounded-lg"
    >
      {/* Leading avatar / icon */}
      <Skeleton variant="avatar" className="w-8 h-8 rounded-full flex-shrink-0" />

      {/* Two stacked text lines: title + preview */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <Skeleton variant="text" className="h-4 w-3/4" />
        <Skeleton variant="text" className="h-3 w-1/2" />
      </div>
    </div>
  )
}

export const ConversationListItemSkeleton = React.memo(
  ConversationListItemSkeletonImpl,
)
ConversationListItemSkeleton.displayName = 'ConversationListItemSkeleton'
