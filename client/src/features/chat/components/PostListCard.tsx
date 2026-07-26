/**
 * PostListCard — renders a list of the user's posts (scheduled / draft /
 * published) as compact cards inside an assistant chat message, instead of
 * plain text. Each post shows its full details (media, caption, hashtags,
 * mentions, collaborators, status + time) via the shared PostDetails renderer.
 */

import React from 'react'
import { PostDetails, PostSummary } from './PostDetails'

export interface PostListCardProps {
  kind: string
  title?: string
  items: PostSummary[]
}

export const PostListCard: React.FC<PostListCardProps> = ({ title, items }) => {
  if (!items?.length) return null
  return (
    <div className="mt-2 w-full space-y-2">
      {title && (
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 px-1">
          {title} · {items.length}
        </div>
      )}
      {items.map((it, i) => (
        <div key={it.id || i} className="rounded-xl border border-gray-300 dark:border-white/10 bg-gray-100 dark:bg-slate-800/60 shadow-sm p-3">
          <PostDetails post={it} compact />
        </div>
      ))}
    </div>
  )
}
