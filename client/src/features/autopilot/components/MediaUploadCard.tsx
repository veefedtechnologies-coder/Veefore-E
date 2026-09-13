/**
 * MediaUploadCard
 *
 * The big, in-chat media step Auto Pilot shows after a mission is created. It
 * lets the user stock the Media_Pool their mission draws from — flexibly: add
 * one item or many (each item becomes a post), up to {@link MAX_ITEMS}. Every
 * item shows as a large thumbnail; an empty tile opens the file picker
 * (multi-select). Users choose how posts are ordered:
 *
 *   • "Let AI arrange" — Auto Pilot decides the best release order.
 *   • "I'll arrange"   — the user sets the order; each tile shows its release
 *     position (1 = goes out first) and can be moved earlier/later.
 *
 * Uploads/deletes go through the existing pool endpoints (Task 7.2):
 *   POST /missions/:id/media, GET /missions/:id/media, DELETE /media/:itemId.
 *
 * Requirements: 6.1, 6.5, 6.6, 7.8
 */

import React, { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Hand,
  ImageIcon,
  Loader2,
  Plus,
  Trash2,
  Video,
  Wand2,
} from 'lucide-react'
import {
  deleteMedia,
  listMedia,
  uploadMedia,
  type MediaPoolItem,
} from '../api/autopilotApi'

export const MAX_ITEMS = 30

export interface MediaUploadCardProps {
  missionId: string
  /** Mission content preference — tunes the copy (AI-first vs user-first). */
  contentSource?: 'user-first' | 'ai-first'
}

const poolKey = (missionId: string) =>
  ['/api/v1/autopilot/missions', missionId, 'media'] as const

type ArrangeMode = 'ai' | 'manual'

export const MediaUploadCard: React.FC<MediaUploadCardProps> = ({
  missionId,
  contentSource = 'user-first',
}) => {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [arrangeMode, setArrangeMode] = useState<ArrangeMode>('ai')
  // User-chosen release order (item ids). Items not listed fall back to load order.
  const [order, setOrder] = useState<string[]>([])
  // Optional per-upload intent + trigger keyword applied to the next file(s).
  const [pendingIntent, setPendingIntent] = useState('')
  const [pendingKeyword, setPendingKeyword] = useState('')

  const poolQuery = useQuery({
    queryKey: poolKey(missionId),
    queryFn: () => listMedia(missionId),
    enabled: !!missionId,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: poolKey(missionId) })

  const upload = useMutation({
    mutationFn: async ({
      files,
      meta,
    }: {
      files: File[]
      meta?: { userIntent?: string; userKeyword?: string }
    }) => {
      for (const file of files) await uploadMedia(missionId, file, meta)
    },
    onSuccess: () => {
      setError(null)
      setPendingIntent('')
      setPendingKeyword('')
      void invalidate()
    },
    onError: (e: Error) => setError(e.message),
  })

  const remove = useMutation({
    mutationFn: (itemId: string) => deleteMedia(itemId),
    onSuccess: (_res, itemId) => {
      setError(null)
      setOrder((prev) => prev.filter((id) => id !== itemId))
      void invalidate()
    },
    onError: (e: Error) => setError(e.message),
  })

  const items: MediaPoolItem[] = poolQuery.data ?? []

  // Ordered items: user-arranged ids first (in their order), then any new ones.
  const ordered = useMemo(() => {
    const byId = new Map(items.map((i) => [i.id, i]))
    const seen = new Set<string>()
    const out: MediaPoolItem[] = []
    if (arrangeMode === 'manual') {
      for (const id of order) {
        const it = byId.get(id)
        if (it) {
          out.push(it)
          seen.add(id)
        }
      }
    }
    for (const it of items) if (!seen.has(it.id)) out.push(it)
    return out
  }, [items, order, arrangeMode])

  const remaining = MAX_ITEMS - items.length

  const openPicker = () => {
    if (remaining <= 0) return
    fileInputRef.current?.click()
  }

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!picked.length) return
    const allowed = picked.slice(0, Math.max(0, remaining))
    if (picked.length > allowed.length) {
      setError(`You can add up to ${MAX_ITEMS} items — added the first ${allowed.length}.`)
    }
    if (allowed.length) {
      const meta = {
        ...(pendingIntent.trim() ? { userIntent: pendingIntent.trim() } : {}),
        ...(pendingKeyword.trim() ? { userKeyword: pendingKeyword.trim() } : {}),
      }
      upload.mutate({ files: allowed, meta })
    }
  }

  const move = (index: number, dir: -1 | 1) => {
    const ids = ordered.map((i) => i.id)
    const target = index + dir
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    setOrder(ids)
  }

  return (
    <div className="w-full rounded-3xl border border-gray-200/80 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-800">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Add your media
          </h3>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            {contentSource === 'ai-first'
              ? 'Optional — I can generate visuals, but your own media performs best. Each item becomes a post.'
              : 'Each item becomes a post. Add one or many — up to 30 at a time.'}
          </p>
        </div>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600 dark:bg-white/10 dark:text-gray-300">
          {items.length} / {MAX_ITEMS}
        </span>
      </div>

      {/* Arrangement toggle */}
      {items.length > 1 && (
        <div className="mb-4 inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1 dark:border-white/10 dark:bg-slate-900/50">
          <button
            type="button"
            onClick={() => setArrangeMode('ai')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              arrangeMode === 'ai'
                ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-blue-300'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            <Wand2 className="h-3.5 w-3.5" />
            Let AI arrange
          </button>
          <button
            type="button"
            onClick={() => {
              setArrangeMode('manual')
              if (order.length === 0) setOrder(items.map((i) => i.id))
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              arrangeMode === 'manual'
                ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-blue-300'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            <Hand className="h-3.5 w-3.5" />
            I’ll arrange
          </button>
        </div>
      )}

      {error && (
        <div
          className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-300"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Optional intent + trigger keyword applied to the next upload(s). This
          grounds the caption and drives the engagement automation for the item. */}
      {remaining > 0 && (
        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            type="text"
            value={pendingIntent}
            onChange={(e) => setPendingIntent(e.target.value)}
            maxLength={500}
            placeholder="What's this for? (e.g. promote the free meal-prep guide)"
            className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none dark:border-white/10 dark:bg-slate-900/50 dark:text-gray-100"
            aria-label="Media intent (optional)"
          />
          <input
            type="text"
            value={pendingKeyword}
            onChange={(e) => setPendingKeyword(e.target.value)}
            maxLength={60}
            placeholder="Trigger keyword (optional, e.g. PLAN)"
            className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none dark:border-white/10 dark:bg-slate-900/50 dark:text-gray-100"
            aria-label="Automation trigger keyword (optional)"
          />
        </div>
      )}

      {/* Grid of big thumbnails */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={onFiles}
        aria-label="Upload media"
      />

      {poolQuery.isLoading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {ordered.map((item, index) => (
            <div
              key={item.id}
              className="group relative aspect-square overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-slate-900/50"
            >
              {item.mediaType === 'video' ? (
                <video src={item.mediaUrl} className="h-full w-full object-cover" muted />
              ) : (
                <img src={item.mediaUrl} alt="Media" className="h-full w-full object-cover" />
              )}

              {/* Release-order badge */}
              <span className="absolute left-2 top-2 inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-black/70 px-1.5 text-xs font-bold text-white">
                {index + 1}
              </span>

              {/* Type icon */}
              <span className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white">
                {item.mediaType === 'video' ? (
                  <Video className="h-3.5 w-3.5" />
                ) : (
                  <ImageIcon className="h-3.5 w-3.5" />
                )}
              </span>

              {/* Trigger-keyword badge (when the user set one for this item) */}
              {item.userKeyword && (
                <span
                  className="absolute right-2 bottom-2 max-w-[70%] truncate rounded-full bg-blue-600/90 px-2 py-0.5 text-[10px] font-semibold text-white"
                  title={`Auto-reply trigger: ${item.userKeyword}`}
                >
                  #{item.userKeyword}
                </span>
              )}

              {/* Hover controls */}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                {arrangeMode === 'manual' ? (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      className="rounded-md bg-white/90 p-1 text-gray-700 disabled:opacity-40"
                      aria-label="Move earlier"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === ordered.length - 1}
                      className="rounded-md bg-white/90 p-1 text-gray-700 disabled:opacity-40"
                      aria-label="Move later"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={() => remove.mutate(item.id)}
                  disabled={remove.isPending}
                  className="rounded-md bg-white/90 p-1 text-red-500 disabled:opacity-40"
                  aria-label="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}

          {/* Add tile */}
          {remaining > 0 && (
            <button
              type="button"
              onClick={openPicker}
              disabled={upload.isPending}
              className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-gray-300 text-gray-400 transition-colors hover:border-blue-400 hover:text-blue-500 disabled:opacity-50 dark:border-white/15 dark:hover:border-blue-400/60"
            >
              {upload.isPending ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <>
                  <Plus className="h-7 w-7" />
                  <span className="text-xs font-medium">Add media</span>
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Footer note */}
      <div className="mt-4 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        {items.length === 0 ? (
          <span>Tap “Add media” to upload photos or videos. You can add more anytime.</span>
        ) : arrangeMode === 'ai' ? (
          <span className="inline-flex items-center gap-1.5">
            <Wand2 className="h-3.5 w-3.5 text-blue-500" />
            AI will schedule these {items.length} {items.length === 1 ? 'post' : 'posts'} in the best order.
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-green-500" />
            Your order is set — item 1 goes out first.
          </span>
        )}
      </div>
    </div>
  )
}

export default MediaUploadCard
