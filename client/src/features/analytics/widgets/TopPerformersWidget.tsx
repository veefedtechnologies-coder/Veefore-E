/**
 * TopPerformersWidget — ranked list of top-performing posts with media thumbnails,
 * type badges (Video/Image/Carousel), and a full metric row per post.
 * Presentation-only; all values come from the backend contract.
 */

import { useState } from 'react'
import { ExternalLink, Film, ImageIcon, Layers, Eye, Heart, MessageCircle, Repeat2, Bookmark } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMetricValue } from '../design-system/format'
import { SURFACE_CLASS } from '../design-system/tokens'
import { WidgetFrame } from './WidgetFrame'
import type { TopPerformerItem, WidgetBaseProps } from './types'

// ── helpers ─────────────────────────────────────────────────────────────────

function compact(n: number | undefined): string {
  if (!n) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ── media type badge ─────────────────────────────────────────────────────────

function MediaBadge({ type }: { type?: string }) {
  if (!type) return null
  const t = type.toUpperCase()
  if (t === 'VIDEO' || t === 'REELS') {
    return (
      <span className="absolute left-1.5 top-1.5 flex items-center gap-0.5 rounded bg-black/60 px-1 py-0.5 text-[9px] font-semibold text-white backdrop-blur-sm">
        <Film className="h-2.5 w-2.5" /> Reel
      </span>
    )
  }
  if (t === 'CAROUSEL_ALBUM') {
    return (
      <span className="absolute left-1.5 top-1.5 flex items-center gap-0.5 rounded bg-black/60 px-1 py-0.5 text-[9px] font-semibold text-white backdrop-blur-sm">
        <Layers className="h-2.5 w-2.5" /> Album
      </span>
    )
  }
  return null
}

// ── thumbnail ─────────────────────────────────────────────────────────────────

function Thumbnail({ url, type, label }: { url?: string; type?: string; label: string }) {
  const [err, setErr] = useState(false)
  const t = (type ?? '').toUpperCase()
  const isVideo = t === 'VIDEO' || t === 'REELS'

  if (!url || err) {
    // Placeholder with media-type icon
    return (
      <div className="relative flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700/60">
        {isVideo
          ? <Film className="h-6 w-6 text-gray-400" />
          : t === 'CAROUSEL_ALBUM'
            ? <Layers className="h-6 w-6 text-gray-400" />
            : <ImageIcon className="h-6 w-6 text-gray-400" />
        }
        <MediaBadge type={type} />
      </div>
    )
  }

  return (
    <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
      <img
        src={url}
        alt={label}
        className="h-full w-full object-cover"
        loading="lazy"
        onError={() => setErr(true)}
      />
      <MediaBadge type={type} />
    </div>
  )
}

// ── metric chip ───────────────────────────────────────────────────────────────

function Chip({ icon, value, label }: { icon: React.ReactNode; value: number | undefined; label: string }) {
  if (!value) return null
  return (
    <span className="flex items-center gap-0.5 text-[11px] text-gray-500 dark:text-gray-400" title={label}>
      {icon}
      <span className="tabular-nums">{compact(value)}</span>
    </span>
  )
}

// ── single post row ───────────────────────────────────────────────────────────

function PostRow({ item, rank }: { item: TopPerformerItem; rank: number }) {
  const m = item.metrics ?? {}

  return (
    <li className="group">
      <div
        className={cn(
          'flex items-start gap-3 rounded-xl p-3 transition-colors',
          'hover:bg-gray-50 dark:hover:bg-gray-700/30',
          'border border-transparent hover:border-gray-100 dark:hover:border-gray-700/50'
        )}
      >
        {/* Rank */}
        <span className="mt-0.5 w-5 flex-shrink-0 text-center text-[12px] font-bold text-gray-400 dark:text-gray-500">
          {rank}
        </span>

        {/* Thumbnail */}
        <Thumbnail url={item.thumbnailUrl} type={item.mediaType} label={item.label} />

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Title + date + external link */}
          <div className="flex items-start gap-1.5">
            <p className="line-clamp-2 flex-1 text-[13px] font-semibold leading-snug text-gray-900 dark:text-gray-100">
              {item.label}
            </p>
            {item.permalink && (
              <a
                href={item.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 flex-shrink-0 text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400"
                aria-label="View on Instagram"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>

          {/* Date */}
          {item.publishedAt && (
            <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
              {fmtDate(item.publishedAt)}
            </p>
          )}

          {/* Metrics row */}
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <Chip icon={<Eye className="h-3 w-3" />} value={m.views || m.reach} label="Views / Reach" />
            <Chip icon={<Heart className="h-3 w-3" />} value={m.likes} label="Likes" />
            <Chip icon={<MessageCircle className="h-3 w-3" />} value={m.comments} label="Comments" />
            <Chip icon={<Repeat2 className="h-3 w-3" />} value={m.shares} label="Shares" />
            <Chip icon={<Bookmark className="h-3 w-3" />} value={m.saves} label="Saves" />
          </div>
        </div>

        {/* Primary value — total engagements */}
        <div className="flex-shrink-0 text-right">
          <p className="text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">
            {compact(item.value)}
          </p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500">engagements</p>
        </div>
      </div>
    </li>
  )
}

// ── main widget ───────────────────────────────────────────────────────────────

interface TopPerformersWidgetProps extends WidgetBaseProps {
  items?: TopPerformerItem[]
  limit?: number
}

export function TopPerformersWidget({ items = [], limit = 10, ...frame }: TopPerformersWidgetProps) {
  const visible = items.slice(0, limit)
  const state = frame.state ?? (visible.length > 0 ? 'ready' : 'empty')

  return (
    <WidgetFrame
      {...frame}
      state={state}
      bodyMinHeight={160}
      emptyMessage={frame.emptyMessage ?? 'No published posts yet — publish some content to see your top performers here.'}
    >
      <ol className="space-y-0.5">
        {visible.map((item, index) => (
          <PostRow key={item.id} item={item} rank={index + 1} />
        ))}
      </ol>
    </WidgetFrame>
  )
}
