/**
 * PostDetails — shared renderer for a single post's full details (media
 * thumbnail, caption, hashtags, mentions, collaborators, status + time). Used by
 * both PostListCard and EditConfirmCard so a post looks the same everywhere.
 */

import React, { useState, useEffect } from 'react'
import { Calendar, CheckCircle2, FileText, Film, Image as ImageIcon, Users, AtSign, X } from 'lucide-react'

export type PostSummary = {
  id?: string
  title?: string
  type?: string
  platform?: string
  status?: string
  caption?: string
  hashtags?: string[]
  mentions?: string[]
  collaborators?: string[]
  mediaUrls?: string[]
  scheduledAt?: string
  publishedAt?: string
}

function fmtIso(iso?: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

const statusStyle: Record<string, string> = {
  scheduled: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300',
  draft: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300',
  published: 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300',
}

const isVideoUrl = (u: string) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u)

export const PostDetails: React.FC<{ post: PostSummary; compact?: boolean }> = ({ post, compact }) => {
  const status = (post.status || 'draft').toLowerCase()
  const media = post.mediaUrls?.[0]
  const isVideo = !!media && isVideoUrl(media)
  const typeIsVideo = (post.type || '').toLowerCase() === 'reel' || (post.type || '').toLowerCase() === 'video'
  const when = fmtIso(post.scheduledAt) || fmtIso(post.publishedAt)
  const [viewer, setViewer] = useState(false)
  useEffect(() => {
    if (!viewer) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setViewer(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewer])

  return (
    <div className="flex items-start gap-3">
      {/* Media thumbnail (clickable) or a type icon placeholder. */}
      {media ? (
        <button type="button" onClick={() => setViewer(true)} className="relative w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-black block cursor-pointer hover:opacity-90 transition-opacity" title="View media">
          {isVideo ? (
            <>
              <video src={`${media}#t=0.1`} className="w-full h-full object-cover" muted playsInline preload="metadata" />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-6 h-6 rounded-full bg-black/50 flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                </div>
              </div>
            </>
          ) : (
            <img src={media} alt="post media" className="w-full h-full object-cover" />
          )}
        </button>
      ) : (
        <div className="w-14 h-14 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0 text-gray-400">
          {typeIsVideo ? <Film className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium text-black dark:text-gray-100 truncate">{post.title || post.type || 'Post'}</span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] capitalize ${statusStyle[status] || 'bg-gray-100 dark:bg-white/5 text-gray-500'}`}>{status}</span>
          {post.platform && <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 capitalize">{post.platform}</span>}
          {post.type && <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 capitalize">{post.type}</span>}
        </div>

        {post.caption ? (
          <p className={`mt-1 text-xs text-black dark:text-gray-200 whitespace-pre-wrap break-words ${compact ? 'line-clamp-2' : 'max-h-40 overflow-y-auto'}`}>{post.caption}</p>
        ) : (
          <p className="mt-1 text-xs text-gray-400 italic">No caption</p>
        )}

        {!!post.hashtags?.length && (
          <div className="mt-1 flex flex-wrap gap-1">
            {post.hashtags.map((h, i) => (
              <span key={i} className="text-[11px] text-blue-600 dark:text-blue-400">{h.startsWith('#') ? h : `#${h}`}</span>
            ))}
          </div>
        )}
        {!!post.mentions?.length && (
          <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400 flex-wrap">
            <AtSign className="w-3 h-3" /> {post.mentions.map((mn) => `@${mn}`).join(', ')}
          </div>
        )}
        {!!post.collaborators?.length && (
          <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400 flex-wrap">
            <Users className="w-3 h-3" /> Collab: {post.collaborators.map((mn) => `@${mn}`).join(', ')}
          </div>
        )}
        {!!(post.mediaUrls && post.mediaUrls.length > 1) && (
          <div className="mt-1 text-[11px] text-gray-400">+{post.mediaUrls.length - 1} more media</div>
        )}

        {when && (
          <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
            {status === 'published' ? <CheckCircle2 className="w-3 h-3" /> : status === 'draft' ? <FileText className="w-3 h-3" /> : <Calendar className="w-3 h-3" />}
            {status === 'published' ? 'Published' : status === 'scheduled' ? 'Scheduled for' : ''} {when}
          </div>
        )}
      </div>

      {viewer && media && (
        <div className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setViewer(false)}>
          <button onClick={() => setViewer(false)} className="absolute top-3 right-3 p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10" title="Close (Esc)">
            <X className="w-5 h-5" />
          </button>
          <div className="max-w-[90vw] max-h-[85vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {isVideo ? (
              <video src={media} className="max-w-[90vw] max-h-[85vh] rounded-lg" controls autoPlay playsInline />
            ) : (
              <img src={media} alt="post media" className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg" />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
