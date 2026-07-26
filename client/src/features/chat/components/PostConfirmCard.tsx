/**
 * PostConfirmCard — a compact, inline one-tap confirmation rendered INSIDE an
 * assistant chat message when the post agent is ready to schedule/publish. No
 * form: the AI already gathered everything; the user just reviews and confirms.
 */

import React, { useState, useEffect } from 'react'
import { Calendar, Send, Loader2, Check, X } from 'lucide-react'

export type PostPlan = {
  type?: 'post' | 'reel' | 'story'
  accountId?: string
  caption?: string
  generateCaption?: boolean
  generateHashtags?: boolean
  hashtags?: string[]
  mentions?: string[]
  collaborators?: string[]
  schedule?: boolean
  scheduledLocal?: string | null
  summary?: string
}

export interface PostConfirmCardProps {
  plan: PostPlan
  /** Hosted media URLs already uploaded for this post. */
  mediaUrls: string[]
  accountUsername?: string
  status: 'idle' | 'working' | 'done' | 'error'
  /** Result text once done (e.g. "Scheduled for …"). */
  resultText?: string
  onConfirm: () => void
  onCancel: () => void
}

function fmtWhen(plan: PostPlan): string {
  if (!plan.schedule) return 'Post now'
  if (!plan.scheduledLocal) return 'Scheduled'
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(plan.scheduledLocal)
  if (!m) return 'Scheduled'
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))
  return d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

export const PostConfirmCard: React.FC<PostConfirmCardProps> = ({
  plan, mediaUrls, accountUsername, status, resultText, onConfirm, onCancel,
}) => {
  const done = status === 'done'
  const working = status === 'working'
  const cancelled = done && /cancel/i.test(resultText || '')
  const media = mediaUrls[0]
  const isVideo = !!media && /\.(mp4|mov|webm|m4v)(\?|$)/i.test(media)
  const [viewerOpen, setViewerOpen] = useState(false)
  useEffect(() => {
    if (!viewerOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setViewerOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewerOpen])

  return (
    <div className={`mt-2 max-w-md rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800/60 overflow-hidden ${cancelled ? 'opacity-70' : ''}`}>
      <div className="p-3 flex gap-3">
        {media && (
          isVideo ? (
            <button
              type="button"
              onClick={() => setViewerOpen(true)}
              className="relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-black block cursor-pointer hover:opacity-90 transition-opacity"
              title="View video"
            >
              <video src={`${media}#t=0.1`} className="w-full h-full object-cover" muted playsInline preload="metadata" />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-6 h-6 rounded-full bg-black/50 flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                </div>
              </div>
            </button>
          ) : (
            <button type="button" onClick={() => setViewerOpen(true)} title="View image" className="flex-shrink-0">
              <img src={media} alt="post media" className="w-16 h-16 rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity" />
            </button>
          )
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-slate-700 text-[11px] capitalize text-gray-700 dark:text-gray-200">{plan.type || 'post'}</span>
            {accountUsername && <span className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-slate-700 text-[11px] text-gray-700 dark:text-gray-200">@{accountUsername}</span>}
            <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-500/10 text-[11px] text-blue-700 dark:text-blue-300 inline-flex items-center gap-1">
              {plan.schedule ? <><Calendar className="w-3 h-3" /> {fmtWhen(plan)}</> : 'Post now'}
            </span>
          </div>
          {plan.generateCaption && !plan.caption ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 italic">Caption will be generated on confirm</p>
          ) : plan.caption ? (
            <p className="text-xs text-gray-700 dark:text-gray-200 whitespace-pre-wrap break-words max-h-48 overflow-y-auto">{plan.caption}</p>
          ) : (
            <p className="text-xs text-gray-400">No caption</p>
          )}
          {!!(plan.hashtags && plan.hashtags.length) && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {plan.hashtags.map((h, i) => (
                <span key={i} className="text-[11px] text-blue-600 dark:text-blue-400">
                  {h.startsWith('#') ? h : `#${h}`}
                </span>
              ))}
            </div>
          )}
          {!!(plan.collaborators && plan.collaborators.length) && (
            <p className="text-[11px] text-gray-500 mt-1">Collab: {plan.collaborators.map((c) => `@${c}`).join(', ')}</p>
          )}
        </div>
      </div>

      {done ? (
        cancelled ? (
          <div className="px-3 py-2 border-t border-gray-100 dark:border-white/10 text-xs text-gray-500 dark:text-gray-400 inline-flex items-center gap-1.5">
            <X className="w-3.5 h-3.5" /> {resultText || 'Cancelled'}
          </div>
        ) : (
          <div className="px-3 py-2 border-t border-gray-100 dark:border-white/10 text-xs text-green-600 dark:text-green-400 inline-flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" /> {resultText || 'Done'}
          </div>
        )
      ) : status === 'error' ? (
        <div className="px-3 py-2 border-t border-gray-100 dark:border-white/10 flex items-center justify-between">
          <span className="text-xs text-red-500">{resultText || 'Something went wrong'}</span>
          <button onClick={onConfirm} className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">Retry</button>
        </div>
      ) : (
        <div className="px-3 py-2 border-t border-gray-100 dark:border-white/10 flex items-center justify-end gap-2">
          <button onClick={onCancel} disabled={working} className="px-3 py-1.5 rounded-lg text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 inline-flex items-center gap-1 disabled:opacity-50">
            <X className="w-3.5 h-3.5" /> Cancel
          </button>
          <button onClick={onConfirm} disabled={working} className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 inline-flex items-center gap-1.5 disabled:opacity-60">
            {working ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : plan.schedule ? <Calendar className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
            {working ? 'Working…' : plan.schedule ? 'Confirm & schedule' : 'Confirm & post'}
          </button>
        </div>
      )}

      {viewerOpen && media && (
        <div className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setViewerOpen(false)}>
          <button onClick={() => setViewerOpen(false)} className="absolute top-3 right-3 p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10" title="Close (Esc)">
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
