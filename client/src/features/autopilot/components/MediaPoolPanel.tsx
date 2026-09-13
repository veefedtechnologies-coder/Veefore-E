/**
 * MediaPoolPanel
 *
 * The Media_Pool management surface for a mission's workspace (R6.1, R6.6). It
 * lets the user upload reusable media, see the current pool, and remove items —
 * so Auto Pilot can draw from an accumulating pool instead of demanding a large
 * upfront upload. Rendered on the Mission Control view.
 *
 * Backed by the pool endpoints (Task 7.2) via react-query:
 *   • GET    /missions/:id/media  → list the reusable pool
 *   • POST   /missions/:id/media  → upload (≤100MB image/video; server validates)
 *   • DELETE /media/:itemId       → remove an item
 *
 * Uploads and deletes optimistically invalidate the pool query so the grid
 * reflects the change within seconds (R6.1). Validation failures from the
 * server (oversize / unsupported format, R6.5) are surfaced inline.
 *
 * Requirements: 6.1, 6.6
 */

import React, { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, ImageIcon, Loader2, Trash2, Upload, Video } from 'lucide-react'
import { deleteMedia, listMedia, uploadMedia, type MediaPoolItem } from '../api/autopilotApi'

export interface MediaPoolPanelProps {
  /** The mission whose workspace pool is shown. */
  missionId: string
}

const poolKey = (missionId: string) =>
  ['/api/v1/autopilot/missions', missionId, 'media'] as const

/** Human-readable file size (e.g. 2.4 MB). */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export const MediaPoolPanel: React.FC<MediaPoolPanelProps> = ({ missionId }) => {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [error, setError] = useState<string | null>(null)

  const poolQuery = useQuery({
    queryKey: poolKey(missionId),
    queryFn: () => listMedia(missionId),
    enabled: !!missionId,
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: poolKey(missionId) })

  const upload = useMutation({
    mutationFn: (file: File) => uploadMedia(missionId, file),
    onSuccess: () => {
      setError(null)
      void invalidate()
    },
    onError: (e: Error) => setError(e.message),
  })

  const remove = useMutation({
    mutationFn: (itemId: string) => deleteMedia(itemId),
    onSuccess: () => {
      setError(null)
      void invalidate()
    },
    onError: (e: Error) => setError(e.message),
  })

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) upload.mutate(file)
    e.target.value = ''
  }

  const items: MediaPoolItem[] = poolQuery.data ?? []

  return (
    <section
      className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 p-5"
      aria-label="Media pool"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Media pool</h2>
          <span className="text-xs text-gray-500 dark:text-gray-400">({items.length})</span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={onFile}
          aria-label="Upload media to pool"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={upload.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Upload
        </button>
      </div>

      {error && (
        <div
          className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {poolQuery.isLoading ? (
        <div className="flex items-center justify-center py-10 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No media yet. Upload photos or videos for Auto Pilot to reuse across posts.
        </p>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="group relative overflow-hidden rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5"
            >
              <div className="aspect-square w-full flex items-center justify-center">
                {item.mediaType === 'video' ? (
                  <video src={item.mediaUrl} className="h-full w-full object-cover" muted />
                ) : (
                  <img
                    src={item.mediaUrl}
                    alt="Pool media"
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <div className="flex items-center justify-between px-2 py-1.5 text-xs text-gray-500 dark:text-gray-400">
                <span className="inline-flex items-center gap-1">
                  {item.mediaType === 'video' ? (
                    <Video className="h-3 w-3" />
                  ) : (
                    <ImageIcon className="h-3 w-3" />
                  )}
                  {formatBytes(item.sizeBytes)}
                </span>
                <button
                  type="button"
                  onClick={() => remove.mutate(item.id)}
                  disabled={remove.isPending}
                  className="text-red-500 hover:text-red-600 disabled:opacity-50"
                  aria-label="Remove media"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default MediaPoolPanel
