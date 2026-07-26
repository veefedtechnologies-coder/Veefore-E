/**
 * EditConfirmCard — an inline confirmation for a proposed EDIT to existing
 * content (reschedule / cancel / update caption). The change is NOT applied
 * until the user confirms. Shows the full current post + current → proposed.
 */

import React from 'react'
import { Calendar, Loader2, Check, X, Pencil, CalendarX, Trash2, Copy } from 'lucide-react'
import { PostDetails, PostSummary } from './PostDetails'

export type EditCard = {
  action: 'reschedule_post' | 'cancel_scheduled_post' | 'update_post_caption' | 'delete_post' | 'duplicate_post'
  contentId: string
  title?: string
  post?: PostSummary
  current?: Record<string, any>
  proposed?: Record<string, any>
  status: 'idle' | 'working' | 'done' | 'error'
  resultText?: string
}

export interface EditConfirmCardProps {
  card: EditCard
  onConfirm: () => void
  onCancel: () => void
}

/** A full ISO/UTC timestamp (e.g. "2026-06-29T17:00:00.000Z") → local string. */
function fmtIso(iso?: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

/** A LOCAL wall-clock string "YYYY-MM-DDTHH:mm" (no timezone) → local string. */
function fmtLocalWall(s?: string | null): string | null {
  if (!s) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(s))
  if (!m) return fmtIso(s)
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))
  return d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

const meta = {
  reschedule_post: { label: 'Reschedule post', icon: Calendar, verb: 'Confirm reschedule' },
  cancel_scheduled_post: { label: 'Cancel scheduled post', icon: CalendarX, verb: 'Confirm cancel' },
  update_post_caption: { label: 'Update caption', icon: Pencil, verb: 'Confirm change' },
  delete_post: { label: 'Delete post', icon: Trash2, verb: 'Confirm delete' },
  duplicate_post: { label: 'Duplicate post', icon: Copy, verb: 'Confirm duplicate' },
} as const

export const EditConfirmCard: React.FC<EditConfirmCardProps> = ({ card, onConfirm, onCancel }) => {
  const working = card.status === 'working'
  const done = card.status === 'done'
  const errored = card.status === 'error'
  const m = meta[card.action] || meta.update_post_caption
  const Icon = m.icon

  return (
    <div className="mt-2 w-full rounded-2xl border border-gray-300 dark:border-white/10 bg-gray-100 dark:bg-slate-800/60 shadow-sm overflow-hidden">
      <div className="p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Icon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span className="text-sm font-medium text-black dark:text-gray-100">{m.label}</span>
        </div>

        {/* The post being edited, with all its details. */}
        {card.post && <PostDetails post={card.post} />}

        {/* The proposed change. */}
        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-white/10">
          {card.action === 'reschedule_post' && (
            <div className="text-xs text-black dark:text-gray-200 space-y-1">
              {fmtIso(card.current?.scheduledAt) && (
                <div><span className="text-gray-400">From:</span> <span className="line-through opacity-70">{fmtIso(card.current?.scheduledAt)}</span></div>
              )}
              <div><span className="text-gray-400">To:</span> <span className="font-medium text-blue-700 dark:text-blue-300">{fmtLocalWall(card.proposed?.scheduledLocal)}</span></div>
            </div>
          )}
          {card.action === 'cancel_scheduled_post' && (
            <p className="text-xs text-black dark:text-gray-200">
              This will unschedule it{fmtIso(card.current?.scheduledAt) ? ` (was set for ${fmtIso(card.current?.scheduledAt)})` : ''} and move it to drafts. It will not publish.
            </p>
          )}
          {card.action === 'update_post_caption' && (
            <div className="text-xs">
              <div className="text-gray-400 mb-0.5">New caption</div>
              <div className="text-black dark:text-gray-100 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">{card.proposed?.caption}</div>
            </div>
          )}
          {card.action === 'delete_post' && (
            <p className="text-xs text-red-600 dark:text-red-400">
              This will permanently delete the post. This cannot be undone.
            </p>
          )}
          {card.action === 'duplicate_post' && (
            <p className="text-xs text-black dark:text-gray-200">
              This will create a copy as a new {card.proposed?.type || 'post'} draft{card.current?.type && card.proposed?.type && card.current.type !== card.proposed.type ? ` (changed from ${card.current.type})` : ''}. The original stays unchanged.
            </p>
          )}
        </div>
      </div>

      {done ? (
        <div className={`px-3 py-2 border-t border-gray-100 dark:border-white/10 text-xs inline-flex items-center gap-1.5 ${/cancel|no changes/i.test(card.resultText || '') ? 'text-gray-500 dark:text-gray-400' : 'text-green-600 dark:text-green-400'}`}>
          {/cancel|no changes/i.test(card.resultText || '') ? <X className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />} {card.resultText || 'Done'}
        </div>
      ) : errored ? (
        <div className="px-3 py-2 border-t border-gray-100 dark:border-white/10 flex items-center justify-between">
          <span className="text-xs text-red-500">{card.resultText || 'Something went wrong'}</span>
          <button onClick={onConfirm} className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">Retry</button>
        </div>
      ) : (
        <div className="px-3 py-2 border-t border-gray-100 dark:border-white/10 flex items-center justify-end gap-2">
          <button onClick={onCancel} disabled={working} className="px-3 py-1.5 rounded-lg text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 inline-flex items-center gap-1 disabled:opacity-50">
            <X className="w-3.5 h-3.5" /> Cancel
          </button>
          <button onClick={onConfirm} disabled={working} className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 inline-flex items-center gap-1.5 disabled:opacity-60">
            {working ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {working ? 'Applying…' : m.verb}
          </button>
        </div>
      )}
    </div>
  )
}
