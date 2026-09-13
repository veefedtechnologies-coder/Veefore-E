/**
 * ImageGenerationCard — the in-chat surface for an AI-generated / edited image
 * (the `image` InfoCard kind).
 *
 *  - "generating": a borderless rounded frame with a flowing animated dot-grid
 *    and rotating status text that references the user's request (e.g.
 *    "Composing your sneaker ad…"). Editing shows edit-specific wording. The
 *    text reflects Veefore's OWN pipeline — it never fabricates model progress.
 *  - completed: the image (borderless, rounded), a smooth blur-to-sharp reveal,
 *    click to open in an in-app lightbox (same page — never a new tab), and a
 *    light Download action.
 *
 * Blue accent (never purple). Respects prefers-reduced-motion.
 */

import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, X, AlertCircle } from 'lucide-react'

import {
  GenerativeDotGridSurface,
  useRotatingStage,
} from './GenerativeDotGridSurface'

/**
 * Build the rotating pipeline-stage messages. When we know the subject (what the
 * user asked for) we weave it in so the card reads like it understood the wish.
 * These describe OUR pipeline — never the model's internal steps (spec §14).
 */
function buildStages(isEdit: boolean, subject?: string): string[] {
  const s = (subject || '').trim()
  const of = s ? ` your ${s}` : ' your image'
  const the = s ? ` your ${s}` : ' the image'
  if (isEdit) {
    return [
      'Analyzing' + of,
      'Understanding your changes',
      'Applying the edit',
      'Adjusting the lighting',
      'Blending the details',
      'Refining the edges',
      'Polishing the result',
      'Almost there',
    ]
  }
  return [
    'Reading your brief',
    'Understanding' + of,
    'Building the visual direction',
    'Composing' + the,
    'Setting the lighting',
    'Rendering' + the,
    'Adding the fine details',
    'Refining' + the,
    'Polishing the final look',
    'Almost there',
  ]
}

export interface ImageCardData {
  id?: string
  kind: string
  operation?: 'generation' | 'editing' | 'variation' | string
  title?: string
  /** Short subject of the request (for the live rotating text). */
  subject?: string
  /** Hosted image URL (present when completed). */
  url?: string
  mimeType?: string
  aspectRatio?: string
  /** Optional live status for a streaming/in-progress card. */
  status?: 'generating' | 'completed' | 'error' | 'cancelled' | string
  stage?: string
  error?: string
  creditsUsed?: number
  /** Asset id for the proxy endpoint (used to download via authenticated path). */
  assetId?: string
}

/** Map an aspect-ratio string to a CSS aspect-ratio for the frame. */
function frameAspect(ratio?: string): string {
  if (!ratio) return '1 / 1'
  const m = /^(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)$/.exec(ratio)
  return m ? `${m[1]} / ${m[2]}` : '1 / 1'
}

async function downloadImage(url: string, name: string) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const objUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objUrl
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(objUrl), 4000)
  } catch {
    /* ignore — download is best-effort */
  }
}

/** In-app lightbox — opens on the SAME page (portal), never a new tab. */
const Lightbox: React.FC<{ url: string; alt: string; assetId?: string; onClose: () => void }> = ({
  url,
  alt,
  assetId,
  onClose,
}) => {
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const handleDownload = async () => {
    if (downloading) return
    setDownloading(true)
    try {
      // Use the proxy download endpoint if we have an assetId, otherwise fetch directly
      const downloadUrl = assetId ? `/api/chat/image/${assetId}?download=1` : url
      const res = await fetch(downloadUrl)
      const blob = await res.blob()
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objUrl
      a.download = alt.replace(/[^\w-]+/g, '-').toLowerCase().slice(0, 50) + '.png'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(objUrl), 4000)
    } catch {
      /* ignore — download is best-effort */
    } finally {
      setDownloading(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 flex flex-col bg-black/85 backdrop-blur-sm animate-in fade-in duration-200"
      style={{ zIndex: 2147483000 }}
      onClick={onClose}
    >
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        onClick={e => e.stopPropagation()}
      >
        <span className="text-sm font-medium text-white/70 truncate max-w-[60%]">{alt}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            disabled={downloading}
            aria-label="Download image"
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/20 disabled:opacity-60"
          >
            <Download className={`h-4 w-4 ${downloading ? 'animate-bounce' : ''}`} />
            {downloading ? 'Saving…' : 'Download'}
          </button>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Image */}
      <div
        className="flex flex-1 items-center justify-center px-4 pb-4 min-h-0"
        onClick={e => e.stopPropagation()}
      >
        <img
          src={url}
          alt={alt}
          className="max-h-full max-w-full rounded-xl object-contain shadow-2xl animate-in zoom-in-95 fade-in duration-200"
          style={{ maxHeight: 'calc(100vh - 80px)', maxWidth: '92vw' }}
        />
      </div>
    </div>,
    document.body
  )
}

export const ImageGenerationCard: React.FC<{ card: ImageCardData }> = ({ card }) => {
  const [loaded, setLoaded] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  const isEdit = card.operation === 'editing'
  const generating = card.status === 'generating' || (!card.url && card.status !== 'error')
  const errored = card.status === 'error'
  const aspect = frameAspect(card.aspectRatio)
  const stagesRef = useRef<string[]>([])
  stagesRef.current = buildStages(isEdit, card.subject)
  const rotatingStage = useRotatingStage(generating && !errored, stagesRef.current)
  const stageText = card.stage || rotatingStage

  return (
    <div className="w-full max-w-[400px] animate-in fade-in slide-in-from-bottom-2 duration-500 ease-out">
      <div
        className="group relative w-full overflow-hidden rounded-2xl bg-gray-100 shadow-sm dark:bg-slate-800/60"
        style={{ aspectRatio: aspect }}
      >
        {errored ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <p className="text-xs text-gray-600 dark:text-gray-300">
              {card.error || 'Image couldn’t be generated.'}
            </p>
          </div>
        ) : card.url ? (
          <div
            role="button"
            tabIndex={0}
            onClick={() => setZoomed(true)}
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setZoomed(true)}
            className="absolute inset-0 cursor-zoom-in"
            aria-label="Open image"
          >
            <img
              src={card.url}
              alt={card.title || 'Generated image'}
              onLoad={() => setLoaded(true)}
              draggable={false}
              className={`h-full w-full object-cover transition-all duration-700 ease-out group-hover:scale-[1.015] ${
                loaded ? 'scale-100 blur-0 opacity-100' : 'scale-105 blur-md opacity-0'
              }`}
            />
            {!loaded && <div className="veegpt-img-shimmer absolute inset-0" aria-hidden />}
          </div>
        ) : (
          // Generating: the shared dot-grid surface (inline styles + a WAAPI
          // reveal, no SVG and no stylesheet dependency). The `image` variant is
          // the original wandering-blob motion.
          <GenerativeDotGridSurface variant="image" stageText={stageText} />
        )}
      </div>

      {/* Actions — only when complete. Download only; click image to enlarge. */}
      {card.url && !generating && !errored && (
        <div className="mt-2 flex items-center gap-4 px-0.5">
          <button
            onClick={() =>
              downloadImage(
                card.url!,
                `${(card.title || 'veefore-image').replace(/[^\w-]+/g, '-').toLowerCase()}.${card.mimeType?.includes('jpeg') ? 'jpg' : 'png'}`
              )
            }
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 transition-colors hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </button>
          <span className="text-[11px] text-gray-400 dark:text-gray-500">
            Click the image to enlarge
          </span>
        </div>
      )}

      {zoomed && card.url && (
        <Lightbox url={card.url} alt={card.title || 'Generated image'} assetId={card.assetId} onClose={() => setZoomed(false)} />
      )}
    </div>
  )
}

export default ImageGenerationCard
