/**
 * ContentBriefCard
 *
 * Renders an Auto Pilot Content_Brief inside the VeeGPT chat (via the
 * `renderMessageCard` switch in `VeeGPT.tsx`) whenever an assistant message
 * carries an `autopilotCard` of kind `content-brief`. It shows the just-in-time
 * creative package — concept, hook, shot list, step-by-step instructions, and a
 * suggested caption — that Auto Pilot sends ahead of a slot needing user media
 * (R7.1), then lets the user deliver that media straight from the card.
 *
 * Delivery is two steps against the existing endpoints (R7.8): upload the file
 * to the Media_Pool (POST /missions/:id/media) and attach the resulting pool
 * item to the brief's slot (POST /briefs/:id/deliver). On success the card
 * shows a delivered state and refreshes the mission-scoped Auto Pilot queries.
 *
 * Requirements: 7.8
 */

import React, { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Check, Clapperboard, Loader2, Upload } from 'lucide-react'
import { deliverBrief, uploadMedia } from '../api/autopilotApi'

/** The `autopilotCard` payload a Content_Brief carries (kind `content-brief`). */
export interface ContentBriefCardData {
  kind: 'content-brief'
  /** The brief id (so the client can deliver media against it). */
  briefId: string
  /** The mission whose pool the delivered media is uploaded to. */
  missionId: string
  /** The slot the delivered media attaches to. */
  slotId?: string
  concept?: string
  hook?: string
  shotList?: string[]
  instructions?: string
  suggestedCaption?: string
  language?: string
  /** Optional narration shown above the card. */
  text?: string
  [key: string]: unknown
}

export interface ContentBriefCardProps {
  card: ContentBriefCardData
  /** Notified after the media is delivered (optional). */
  onDelivered?: () => void
}

export const ContentBriefCard: React.FC<ContentBriefCardProps> = ({ card, onDelivered }) => {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [delivered, setDelivered] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const shotList = Array.isArray(card.shotList) ? card.shotList : []

  const deliver = useMutation({
    mutationFn: async (file: File) => {
      // R7.8: add the media to the pool, then attach it to the brief's slot.
      const item = await uploadMedia(card.missionId, file)
      await deliverBrief(card.briefId, { mediaPoolItemId: item.id })
    },
    onSuccess: () => {
      setDelivered(true)
      setError(null)
      void queryClient.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) && q.queryKey[0] === '/api/v1/autopilot/missions',
      })
      onDelivered?.()
    },
    onError: (e: Error) => setError(e.message),
  })

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) deliver.mutate(file)
    // Reset so re-selecting the same file re-triggers change.
    e.target.value = ''
  }

  return (
    <div
      className="w-full max-w-2xl rounded-xl border border-purple-200 dark:border-purple-900/40 bg-purple-50/60 dark:bg-purple-900/10 p-4 animate-in fade-in slide-in-from-bottom-2 duration-500 ease-out"
      aria-label="Content brief"
    >
      <div className="flex items-center gap-2 mb-3">
        <Clapperboard className="h-4 w-4 text-purple-600 dark:text-purple-400" />
        <span className="inline-flex items-center rounded-full bg-purple-100 dark:bg-purple-900/30 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-300">
          Content brief
        </span>
      </div>

      {card.text && (
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">{card.text}</p>
      )}

      <div className="space-y-3 text-sm">
        {card.concept && (
          <Section label="Concept">
            <p className="text-gray-800 dark:text-gray-200">{card.concept}</p>
          </Section>
        )}
        {card.hook && (
          <Section label="Hook">
            <p className="text-gray-800 dark:text-gray-200">{card.hook}</p>
          </Section>
        )}
        {shotList.length > 0 && (
          <Section label="Shot list">
            <ol className="list-decimal pl-5 space-y-1 text-gray-800 dark:text-gray-200">
              {shotList.map((shot, i) => (
                <li key={i}>{shot}</li>
              ))}
            </ol>
          </Section>
        )}
        {card.instructions && (
          <Section label="Instructions">
            <p className="whitespace-pre-wrap text-gray-800 dark:text-gray-200">{card.instructions}</p>
          </Section>
        )}
        {card.suggestedCaption && (
          <Section label="Suggested caption">
            <p className="whitespace-pre-wrap rounded-lg bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 p-2 text-gray-800 dark:text-gray-200">
              {card.suggestedCaption}
            </p>
          </Section>
        )}
      </div>

      {/* Error */}
      {error && (
        <div
          className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Delivery action (R7.8) */}
      <div className="mt-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={onFile}
          aria-label="Deliver media for this brief"
        />
        {delivered ? (
          <div
            className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400"
            role="status"
          >
            <Check className="h-4 w-4" />
            Media delivered
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={deliver.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {deliver.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {deliver.isPending ? 'Delivering…' : 'Deliver media'}
          </button>
        )}
      </div>
    </div>
  )
}

const Section: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
      {label}
    </p>
    {children}
  </div>
)

export default ContentBriefCard
