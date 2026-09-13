/**
 * ApprovalCard
 *
 * Renders an Auto Pilot Approval_Card inside the VeeGPT chat (via the
 * `renderMessageCard` switch in `VeeGPT.tsx`) whenever an assistant message
 * carries an `autopilotCard` of kind `approval`. It shows the proposed item's
 * contents — a draft caption + hashtags, a planned Content_Slot, or a drafted
 * Engagement_Automation — and offers the three Copilot decisions:
 *
 *   • Approve → POST /approvals/:id/approve  (R4.6)
 *   • Edit    → POST /approvals/:id/edit     (re-validated vs guardrails, R4.3/R4.4)
 *   • Reject  → POST /approvals/:id/reject   (slot rescheduled so none publishes empty, R4.5)
 *
 * The card is self-contained: it owns its decision state via react-query
 * mutations and, on success, invalidates the mission-scoped Auto Pilot queries
 * so Mission Control reflects the decision. An edit that violates a guardrail
 * comes back as an error which is surfaced inline while the item stays pending
 * in its pre-edit state (R4.4).
 *
 * Requirements: 4.3, 4.5
 */

import React, { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Check, Loader2, Pencil, ThumbsDown, X } from 'lucide-react'
import { approveApproval, editApproval, rejectApproval } from '../api/autopilotApi'
import { approvalItemLabel } from './missionControl'

/** The `autopilotCard` payload an Approval_Card carries (kind `approval`). */
export interface ApprovalCardData {
  kind: 'approval'
  approvalId: string
  itemType: 'content-slot' | 'caption' | 'automation' | 'plan' | 'budget'
  itemRef?: string
  /** Optional narration shown above the card. */
  text?: string
  /** Draft caption for a caption/content-slot proposal. */
  caption?: string
  /** Draft hashtags. */
  hashtags?: string[]
  /** Media preview URL(s) for a content-slot proposal. */
  mediaUrls?: string[]
  mediaUrl?: string
  /** Content-slot planning fields. */
  format?: string
  theme?: string
  scheduledAt?: string
  /** Drafted automation fields. */
  automationType?: 'comment-only' | 'dm-only' | 'comment-to-dm'
  triggerKeyword?: string
  commentReply?: string
  dmMessage?: string
  /** Any additional card contents. */
  [key: string]: unknown
}

export interface ApprovalCardProps {
  card: ApprovalCardData
  /** Notified after a successful decision (optional). */
  onDecision?: (status: 'approved' | 'edited' | 'rejected') => void
}

type Decision = 'approved' | 'edited' | 'rejected'

const AUTOMATION_TYPE_LABEL: Record<string, string> = {
  'comment-only': 'Comment reply',
  'dm-only': 'Direct message',
  'comment-to-dm': 'Comment → DM',
}

function mediaList(card: ApprovalCardData): string[] {
  if (Array.isArray(card.mediaUrls) && card.mediaUrls.length) return card.mediaUrls
  if (typeof card.mediaUrl === 'string' && card.mediaUrl) return [card.mediaUrl]
  return []
}

export const ApprovalCard: React.FC<ApprovalCardProps> = ({ card, onDecision }) => {
  const queryClient = useQueryClient()
  const [decision, setDecision] = useState<Decision | null>(null)
  const [editing, setEditing] = useState(false)
  const [draftCaption, setDraftCaption] = useState<string>(card.caption ?? '')
  const [error, setError] = useState<string | null>(null)

  // Refresh Mission Control (approvals / activity / progress) after a decision.
  const refresh = () => {
    void queryClient.invalidateQueries({
      predicate: (q) =>
        Array.isArray(q.queryKey) && q.queryKey[0] === '/api/v1/autopilot/missions',
    })
  }

  const settle = (status: Decision) => {
    setDecision(status)
    setEditing(false)
    setError(null)
    refresh()
    onDecision?.(status)
  }

  const approve = useMutation({
    mutationFn: () => approveApproval(card.approvalId),
    onSuccess: () => settle('approved'),
    onError: (e: Error) => setError(e.message),
  })

  const reject = useMutation({
    mutationFn: () => rejectApproval(card.approvalId),
    onSuccess: () => settle('rejected'),
    onError: (e: Error) => setError(e.message),
  })

  const saveEdit = useMutation({
    mutationFn: () =>
      editApproval(card.approvalId, { caption: draftCaption, content: draftCaption }),
    onSuccess: () => settle('edited'),
    onError: (e: Error) => setError(e.message),
  })

  const busy = approve.isPending || reject.isPending || saveEdit.isPending
  const media = mediaList(card)
  const hashtags = Array.isArray(card.hashtags) ? card.hashtags : []
  const canEdit = card.itemType === 'caption' || card.itemType === 'content-slot'

  return (
    <div
      className="w-full max-w-2xl rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-900/10 p-4 animate-in fade-in slide-in-from-bottom-2 duration-500 ease-out"
      aria-label={`Approval needed: ${approvalItemLabel(card)}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            Approval needed
          </span>
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {approvalItemLabel(card)}
          </span>
        </div>
      </div>

      {card.text && (
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">{card.text}</p>
      )}

      {/* Content-slot planning meta */}
      {card.itemType === 'content-slot' && (card.format || card.theme || card.scheduledAt) && (
        <div className="flex flex-wrap gap-2 mb-3 text-xs text-gray-600 dark:text-gray-400">
          {card.format && (
            <span className="rounded-md bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 px-2 py-1 capitalize">
              {card.format}
            </span>
          )}
          {card.theme && (
            <span className="rounded-md bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 px-2 py-1">
              {card.theme}
            </span>
          )}
          {card.scheduledAt && (
            <span className="rounded-md bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 px-2 py-1">
              {new Date(card.scheduledAt).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
          )}
        </div>
      )}

      {/* Media preview */}
      {media.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {media.map((url, i) => (
            <img
              key={`${url}_${i}`}
              src={url}
              alt={`Proposed media ${i + 1}`}
              className="h-20 w-20 rounded-lg object-cover border border-gray-200 dark:border-white/10"
            />
          ))}
        </div>
      )}

      {/* Caption (editable for caption/content-slot) */}
      {(card.caption || canEdit) && (
        <div className="mb-3">
          {editing ? (
            <textarea
              value={draftCaption}
              onChange={(e) => setDraftCaption(e.target.value)}
              rows={4}
              maxLength={2200}
              className="w-full rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 p-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
              aria-label="Edit caption"
            />
          ) : (
            card.caption && (
              <p className="whitespace-pre-wrap rounded-lg bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 p-3 text-sm text-gray-800 dark:text-gray-200">
                {card.caption}
              </p>
            )
          )}
        </div>
      )}

      {/* Hashtags */}
      {hashtags.length > 0 && !editing && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {hashtags.map((tag, i) => (
            <span
              key={`${tag}_${i}`}
              className="text-xs text-blue-600 dark:text-blue-400"
            >
              {tag.startsWith('#') ? tag : `#${tag}`}
            </span>
          ))}
        </div>
      )}

      {/* Automation details */}
      {card.itemType === 'automation' && (
        <div className="mb-3 space-y-1 rounded-lg bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 p-3 text-sm">
          {card.automationType && (
            <p className="text-gray-800 dark:text-gray-200">
              <span className="font-medium">Type: </span>
              {AUTOMATION_TYPE_LABEL[card.automationType] ?? card.automationType}
            </p>
          )}
          {card.triggerKeyword && (
            <p className="text-gray-800 dark:text-gray-200">
              <span className="font-medium">Trigger: </span>
              <code className="rounded bg-gray-100 dark:bg-white/10 px-1">{card.triggerKeyword}</code>
            </p>
          )}
          {card.commentReply && (
            <p className="text-gray-600 dark:text-gray-400">
              <span className="font-medium">Comment reply: </span>
              {card.commentReply}
            </p>
          )}
          {card.dmMessage && (
            <p className="text-gray-600 dark:text-gray-400">
              <span className="font-medium">DM: </span>
              {card.dmMessage}
            </p>
          )}
        </div>
      )}

      {/* Error (e.g. guardrail-violating edit — R4.4) */}
      {error && (
        <div
          className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300 mb-3"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Decision surface */}
      {decision ? (
        <div
          className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300"
          role="status"
        >
          <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
          <span className="capitalize">{decision}</span>
        </div>
      ) : editing ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => saveEdit.mutate()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {saveEdit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save & re-check
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false)
              setDraftCaption(card.caption ?? '')
              setError(null)
            }}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-white/10 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => approve.mutate()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {approve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Approve
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setEditing(true)
                setError(null)
              }}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-white/10 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-50"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </button>
          )}
          <button
            type="button"
            onClick={() => reject.mutate()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 dark:border-red-900/40 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
          >
            {reject.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsDown className="h-4 w-4" />}
            Reject
          </button>
        </div>
      )}
    </div>
  )
}

export default ApprovalCard
