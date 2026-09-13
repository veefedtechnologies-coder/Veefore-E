/**
 * MediaLightbox — the ONE fullscreen media viewer used across VeeGPT (chat
 * attachments, the schedule/post-confirm card, image cards, …) so every image
 * and video gets the same proper preview: contained/zoom-safe image, a real
 * `<video controls>` player, PDF inline, a download/open action, Esc-to-close,
 * and backdrop-click-to-close. Rendered in a portal so it overlays everything
 * regardless of where it's mounted.
 */

import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Download, X } from 'lucide-react'

export interface MediaLightboxProps {
  /** Hosted media URL (image/video/pdf). */
  url: string
  /** MIME type; when absent the type is inferred from the URL extension. */
  mimeType?: string
  /** Optional filename shown in the top bar and used for download. */
  name?: string
  onClose: () => void
}

/** Infer a coarse media kind from mime type first, then the URL extension. */
function kindOf(url: string, mimeType?: string): 'image' | 'video' | 'pdf' | 'other' {
  const m = (mimeType || '').toLowerCase()
  if (m.startsWith('image/')) return 'image'
  if (m.startsWith('video/')) return 'video'
  if (m === 'application/pdf') return 'pdf'
  const u = (url || '').split('?')[0].split('#')[0].toLowerCase()
  if (/\.(png|jpe?g|gif|webp|heic|heif|bmp|svg)$/.test(u)) return 'image'
  if (/\.(mp4|mov|webm|m4v|avi|mkv|3gp)$/.test(u)) return 'video'
  if (/\.pdf$/.test(u)) return 'pdf'
  return 'other'
}

/** Append `download=1` so the proxy serves the bytes as an attachment. */
function downloadHref(url: string): string {
  if (!url) return url
  if (/[?&]download=1\b/.test(url)) return url
  return url + (url.includes('?') ? '&' : '?') + 'download=1'
}

export const MediaLightbox: React.FC<MediaLightboxProps> = ({ url, mimeType, name, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!url) return null
  const kind = kindOf(url, mimeType)

  const node = (
    <div
      className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Top bar: filename + download + close */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3"
        onClick={e => e.stopPropagation()}
      >
        <span className="text-sm text-white/80 truncate max-w-[60%]">{name || 'Media'}</span>
        <div className="flex items-center gap-2">
          <a
            href={downloadHref(url)}
            download={name || true}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            title="Download / open"
          >
            <Download className="w-5 h-5" />
          </a>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        className="max-w-[90vw] max-h-[85vh] flex items-center justify-center"
        onClick={e => e.stopPropagation()}
      >
        {kind === 'image' ? (
          <img
            src={url}
            alt={name || 'image'}
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg"
          />
        ) : kind === 'video' ? (
          <video
            src={url}
            className="max-w-[90vw] max-h-[85vh] rounded-lg"
            controls
            autoPlay
            playsInline
          />
        ) : kind === 'pdf' ? (
          <iframe
            src={url}
            title={name || 'pdf'}
            className="w-[90vw] h-[85vh] rounded-lg bg-white"
          />
        ) : (
          <div className="text-white/80 text-sm bg-white/10 rounded-lg px-6 py-10 text-center">
            <p className="mb-3">Preview isn't available for this file type.</p>
            <a
              href={downloadHref(url)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-blue-300 hover:text-blue-200"
            >
              <Download className="w-4 h-4" /> Open in new tab
            </a>
          </div>
        )}
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(node, document.body) : node
}

export default MediaLightbox
