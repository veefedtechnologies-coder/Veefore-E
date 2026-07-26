/**
 * PlanPage — Hootsuite-style Plan workspace with collapsible sidebar.
 * Sidebar nav: Calendar | Scheduled Posts | Drafts | Published Posts | DM automations
 * Each post section has a premium, full-width, asymmetric layout.
 */

import React, { useState, Suspense, useMemo } from 'react'
import { useLocation } from 'wouter'
import {
  CalendarDays, FileEdit, LayoutGrid, MessageSquare,
  Plus, ChevronsLeft, Clock, Eye, CheckCircle2,
  TrendingUp, TrendingDown, Minus, AlertCircle,
  PenLine, Lightbulb, Instagram, Heart, MessageCircle, Share2,
  MoreHorizontal, Star, Bookmark, BarChart3, Zap, ArrowRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest, SUBSCRIPTION_QUERY_KEY } from '@/lib/queryClient'
import { PlanSkeleton } from '@/components/skeletons/pages'
import useSubscription from '@/hooks/useSubscription'
import { useToast } from '@/hooks/use-toast'

// ── Skeleton pulse primitive ───────────────────────────────────────────────

function Sk({ className }: { className?: string }) {
  // skeleton-guard-allow: local skeleton primitive used exclusively as page-level skeleton placeholders
  return <div className={cn('animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800', className)} />
}

// ── Section label skeleton (matches real SectionLabel: h-9 icon + text) ───

function SectionLabelSk() {
  return (
    <div className="flex items-center gap-3 mb-4">
      <Sk className="h-9 w-9 rounded-xl flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <Sk className="h-4 w-32" />
          <Sk className="h-4 w-6 rounded-full" />
        </div>
        <Sk className="h-3 w-48" />
      </div>
    </div>
  )
}

// ── Hero post card skeleton (matches HeroPostCard: h-28 thumb + text) ─────

function HeroCardSk() {
  return (
    <div className="flex gap-5 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
      <Sk className="h-28 w-28 rounded-2xl flex-shrink-0" />
      <div className="flex-1 space-y-2 py-1">
        <Sk className="h-4 w-full" />
        <Sk className="h-4 w-4/5" />
        <Sk className="h-4 w-3/5" />
        <div className="flex items-center gap-3 pt-2">
          <Sk className="h-4 w-16" />
          <Sk className="h-4 w-20" />
          <Sk className="h-4 w-10" />
        </div>
        <Sk className="h-3 w-28 mt-1" />
      </div>
    </div>
  )
}

// ── Compact row skeleton (matches CompactPostRow: h-10 thumb + 2 lines) ───

function CompactRowSk() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Sk className="h-10 w-10 rounded-lg flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Sk className="h-3.5 w-3/4" />
        <Sk className="h-3 w-1/2" />
      </div>
    </div>
  )
}

// ── Scheduled post card skeleton (matches ScheduledPostCard: h-20 thumb) ─

function ScheduledCardSk() {
  return (
    <div className="flex gap-4 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
      <Sk className="h-20 w-20 rounded-xl flex-shrink-0" />
      <div className="flex-1 space-y-2 py-1">
        <Sk className="h-4 w-full" />
        <Sk className="h-4 w-2/3" />
        <Sk className="h-7 w-40 rounded-lg" />
      </div>
    </div>
  )
}

// ── Draft post card skeleton (matches DraftPostCard: h-20 thumb) ──────────

function DraftCardSk() {
  return (
    <div className="flex gap-4 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
      <Sk className="h-20 w-20 rounded-xl flex-shrink-0" />
      <div className="flex-1 space-y-2 py-1">
        <div className="flex items-start justify-between gap-2">
          <Sk className="h-4 w-3/4" />
          <Sk className="h-5 w-12 rounded-full flex-shrink-0" />
        </div>
        <Sk className="h-4 w-1/2" />
        <Sk className="h-3 w-36" />
      </div>
    </div>
  )
}

// ── Page header skeleton (matches the title+subtitle+button row) ───────────

function PageHeaderSk({ btnWidth = 'w-32' }: { btnWidth?: string }) {
  return (
    <div className="flex items-center justify-between flex-shrink-0">
      <div className="space-y-2">
        <Sk className="h-7 w-48" />
        <Sk className="h-4 w-64" />
      </div>
      <Sk className={cn('h-10 rounded-xl', btnWidth)} />
    </div>
  )
}

// ── List container skeleton (matches the rounded-2xl border card) ─────────

function ListContainerSk({ rows = 4 }: { rows?: number }) {
  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden divide-y divide-gray-50 dark:divide-gray-800">
      {Array.from({ length: rows }).map((_, i) => <CompactRowSk key={i} />)}
    </div>
  )
}

// ── PUBLISHED POSTS skeleton ───────────────────────────────────────────────
// Mirrors: Header → SectionLabel+HeroCard → SectionLabel+2col list → SectionLabel+2col list → SectionLabel+2col list

function PublishedSkeleton() {
  return (
    <div className="p-6 w-full flex flex-col gap-6">
      <PageHeaderSk btnWidth="w-36" />

      {/* Top Performing Post */}
      <div>
        <SectionLabelSk />
        <HeroCardSk />
      </div>

      {/* High Performance — 2-col compact list */}
      <div>
        <SectionLabelSk />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
          <ListContainerSk rows={3} />
          <ListContainerSk rows={3} />
        </div>
      </div>

      {/* Medium + Low side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div>
          <SectionLabelSk />
          <ListContainerSk rows={4} />
        </div>
        <div>
          <SectionLabelSk />
          <ListContainerSk rows={4} />
        </div>
      </div>

      {/* Most Recent */}
      <div>
        <SectionLabelSk />
        <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 divide-gray-50 dark:divide-gray-800">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={cn(i >= 2 ? 'border-t border-gray-50 dark:border-gray-800' : '', i % 2 === 0 && i + 1 < 8 ? 'lg:border-r border-gray-50 dark:border-gray-800' : '')}>
                <CompactRowSk />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── SCHEDULED POSTS skeleton ───────────────────────────────────────────────
// Mirrors: Header → SectionLabel+2col cards (Today) → SectionLabel+3col cards (This Week) → SectionLabel+compact list (Later)

function ScheduledSkeleton() {
  return (
    <div className="p-6 w-full space-y-6">
      <PageHeaderSk btnWidth="w-40" />

      {/* Publishing Today — 2-col hero cards */}
      <div>
        <SectionLabelSk />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <ScheduledCardSk />
          <ScheduledCardSk />
        </div>
      </div>

      {/* This Week — 3-col grid */}
      <div>
        <SectionLabelSk />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <ScheduledCardSk />
          <ScheduledCardSk />
          <ScheduledCardSk />
        </div>
      </div>

      {/* Coming Up Later — compact list */}
      <div>
        <SectionLabelSk />
        <ListContainerSk rows={4} />
      </div>
    </div>
  )
}

// ── DRAFTS skeleton ────────────────────────────────────────────────────────
// Mirrors: Header → SectionLabel+2col draft cards (Ready) → 2col (Needs Work + Ideas) → SectionLabel+compact list (Recently Edited)

function DraftsSkeleton() {
  return (
    <div className="p-6 w-full space-y-6">
      <PageHeaderSk btnWidth="w-28" />

      {/* Ready to Publish — 2-col draft cards */}
      <div>
        <SectionLabelSk />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <DraftCardSk />
          <DraftCardSk />
        </div>
      </div>

      {/* Needs Work + Ideas side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div>
          <SectionLabelSk />
          <ListContainerSk rows={3} />
        </div>
        <div>
          <SectionLabelSk />
          <ListContainerSk rows={2} />
        </div>
      </div>

      {/* Recently Edited — compact list */}
      <div>
        <SectionLabelSk />
        <ListContainerSk rows={4} />
      </div>
    </div>
  )
}

const CalendarView = React.lazy(() =>
  import('@/components/calendar/calendar-view').then(m => ({ default: m.CalendarView }))
)

// ── Types & helpers ────────────────────────────────────────────────────────

type NavId = 'calendar' | 'scheduled' | 'drafts' | 'published' | 'dm'

const NAV_ITEMS: { id: NavId; label: string; icon: React.FC<any> }[] = [
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'scheduled', label: 'Scheduled Posts', icon: Clock },
  { id: 'drafts', label: 'Drafts', icon: PenLine },
  { id: 'published', label: 'Published Posts', icon: CheckCircle2 },
  { id: 'dm', label: 'DM automations', icon: MessageSquare },
]

function fmtDate(iso?: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
}

function fmtShort(iso?: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Compute engagement rate from raw metrics. Returns null if no reach data. */
function calcEngRate(metrics?: any): number | null {
  if (!metrics) return null
  const reach = metrics.reach ?? 0
  if (reach <= 0) return null
  const total = (metrics.likes ?? 0) + (metrics.comments ?? 0) + (metrics.shares ?? 0) + (metrics.saves ?? 0)
  return Math.round((total / reach) * 1000) / 10 // one decimal place
}

/** Extract best thumbnail URL from post object */
function getThumb(post: any): string | null {
  return (
    post.mediaUrls?.[0] ||
    post.contentData?.thumbnail_url ||
    post.contentData?.media_url ||
    post.contentData?.image_url ||
    null
  )
}

/** Extract caption/title from post object */
function getCaption(post: any): string {
  return (
    post.title ||
    post.contentData?.caption ||
    post.description ||
    'Untitled post'
  )
}

// ── Data hook ─────────────────────────────────────────────────────────────

function useAllPosts(workspaceId?: string, includeDrafts: boolean = true) {
  const { data: scheduledData, isLoading: l1 } = useQuery({
    queryKey: ['/api/content/workspace', workspaceId, 'scheduled'],
    queryFn: () => apiRequest(`/api/content/workspace/${workspaceId}/scheduled?limit=100`),
    enabled: !!workspaceId,
    staleTime: 60_000,
  })
  const { data: draftsData, isLoading: l2 } = useQuery({
    queryKey: ['/api/content/workspace', workspaceId, 'drafts'],
    queryFn: () => apiRequest(`/api/content/workspace/${workspaceId}/drafts`),
    // Drafts are a Creator+ feature — never fetch them when not permitted so
    // Free users don't trigger a 403 or receive any draft data.
    enabled: !!workspaceId && includeDrafts,
    staleTime: 60_000,
  })
  const { data: publishedData, isLoading: l3 } = useQuery({
    queryKey: ['/api/content/workspace', workspaceId, 'published'],
    queryFn: () => apiRequest(`/api/content/workspace/${workspaceId}?page=1&limit=100&excludeImported=true`),
    enabled: !!workspaceId,
    staleTime: 60_000,
  })

  const posts = useMemo(() => {
    const norm = (d: any) => {
      const arr = d?.data ?? d ?? []
      return (Array.isArray(arr) ? arr : [])
    }
    return [
      ...norm(scheduledData).map((p: any) => ({ ...p, status: 'scheduled' })),
      ...norm(draftsData).map((p: any) => ({ ...p, status: 'draft' })),
      ...norm(publishedData).map((p: any) => ({ ...p, status: 'published' })),
    ]
  }, [scheduledData, draftsData, publishedData])

  return { posts, isLoading: l1 || l2 || l3 }
}

// ── Metric pill ────────────────────────────────────────────────────────────

function MetricPill({ icon: Icon, value, label, color = 'text-gray-500' }: {
  icon: React.FC<any>; value: string | number; label?: string; color?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', color)}>
      <Icon className="h-3 w-3" />
      {value}
      {label && <span className="text-gray-400 font-normal">{label}</span>}
    </span>
  )
}

// ── HERO POST CARD (large, full info) ─────────────────────────────────────

function HeroPostCard({ post, badge, badgeColor, rank }: {
  post: any; badge?: string; badgeColor?: string; rank?: number
}) {
  const thumb = getThumb(post)
  const caption = getCaption(post)
  const engRate = calcEngRate(post.metrics)
  const [, setLocation] = useLocation()

  return (
    <div
      onClick={() => setLocation(`/analytics/post/${post._id ?? post.id}`)}
      className="group relative flex gap-5 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-200 dark:hover:border-gray-700 hover:shadow-md transition-all cursor-pointer"
    >
      {rank && (
        <div className="absolute -top-3 -left-3 h-7 w-7 rounded-full bg-gray-900 dark:bg-white flex items-center justify-center text-white dark:text-gray-900 text-xs font-black shadow-lg z-10">
          #{rank}
        </div>
      )}
      {/* Thumbnail */}
      <div className="relative flex-shrink-0">
        {thumb ? (
          <img src={thumb} alt="" className="h-28 w-28 rounded-2xl object-cover" />
        ) : (
          <div className="h-28 w-28 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center">
            <Instagram className="h-8 w-8 text-gray-300 dark:text-gray-600" />
          </div>
        )}
        {badge && (
          <span className={cn('absolute -top-2 -right-2 rounded-full px-2 py-0.5 text-[9px] font-black text-white leading-none uppercase tracking-wide shadow', badgeColor ?? 'bg-gray-500')}>
            {badge}
          </span>
        )}
      </div>
      {/* Body */}
      <div className="min-w-0 flex-1 flex flex-col gap-2">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug line-clamp-3">{caption}</p>
        {/* Metrics row */}
        <div className="flex flex-wrap items-center gap-3 mt-auto">
          {engRate != null && (
            <span className={cn('text-sm font-bold', engRate >= 5 ? 'text-emerald-600' : engRate >= 2 ? 'text-amber-600' : 'text-red-500')}>
              {engRate}% eng.
            </span>
          )}
          {post.metrics?.reach != null && (
            <MetricPill icon={Eye} value={post.metrics.reach.toLocaleString()} label=" reach" color="text-gray-500" />
          )}
          {post.metrics?.likes != null && (
            <MetricPill icon={Heart} value={post.metrics.likes.toLocaleString()} color="text-rose-400" />
          )}
          {post.metrics?.comments != null && (
            <MetricPill icon={MessageCircle} value={post.metrics.comments} color="text-blue-400" />
          )}
          {post.metrics?.saves != null && (
            <MetricPill icon={Bookmark} value={post.metrics.saves} color="text-amber-500" />
          )}
        </div>
        <p className="text-xs text-gray-400">{fmtDate(post.publishedAt)}</p>
      </div>
      <button className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all self-start flex-shrink-0">
        <MoreHorizontal className="h-4 w-4" />
      </button>
    </div>
  )
}

// ── COMPACT POST ROW (for lists) ───────────────────────────────────────────

function CompactPostRow({ post, extra }: { post: any; extra?: React.ReactNode }) {
  const thumb = getThumb(post)
  const caption = getCaption(post)
  const [, setLocation] = useLocation()

  return (
    <div
      onClick={() => setLocation(`/analytics/post/${post._id ?? post.id}`)}
      className="group flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors cursor-pointer"
    >
      {thumb ? (
        <img src={thumb} alt="" className="h-10 w-10 rounded-lg object-cover flex-shrink-0" />
      ) : (
        <div className="h-10 w-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
          <Instagram className="h-4 w-4 text-gray-300 dark:text-gray-600" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{caption}</p>
        {extra}
      </div>
      <ArrowRight className="h-4 w-4 text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" />
    </div>
  )
}

// ── SCHEDULED POST CARD ────────────────────────────────────────────────────

function ScheduledPostCard({ post, compact = false }: { post: any; compact?: boolean }) {
  const thumb = getThumb(post)
  const caption = getCaption(post)
  const timeStr = fmtDate(post.scheduledAt)
  const [, setLocation] = useLocation()

  if (compact) {
    return (
      <div
        onClick={() => setLocation(`/create?edit=${post._id ?? post.id}`)}
        className="group flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors cursor-pointer"
      >
        {thumb ? (
          <img src={thumb} alt="" className="h-10 w-10 rounded-lg object-cover flex-shrink-0" />
        ) : (
          <div className="h-10 w-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
            <Instagram className="h-4 w-4 text-gray-300 dark:text-gray-600" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{caption}</p>
          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1"><Clock className="h-3 w-3" />{timeStr}</p>
        </div>
        <ArrowRight className="h-4 w-4 text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" />
      </div>
    )
  }

  return (
    <div
      onClick={() => setLocation(`/create?edit=${post._id ?? post.id}`)}
      className="group flex gap-4 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-200 hover:shadow-sm transition-all cursor-pointer"
    >
      {thumb ? (
        <img src={thumb} alt="" className="h-20 w-20 rounded-xl object-cover flex-shrink-0" />
      ) : (
        <div className="h-20 w-20 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center flex-shrink-0">
          <Instagram className="h-6 w-6 text-blue-300 dark:text-gray-600" />
        </div>
      )}
      <div className="min-w-0 flex-1 flex flex-col gap-1.5">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 line-clamp-2">{caption}</p>
        <span className="inline-flex items-center gap-1.5 w-fit text-xs font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1 rounded-lg">
          <Clock className="h-3 w-3" />{timeStr}
        </span>
      </div>
    </div>
  )
}

// ── DRAFT POST CARD ────────────────────────────────────────────────────────

function DraftPostCard({ post, compact = false }: { post: any; compact?: boolean }) {
  const thumb = getThumb(post)
  const caption = getCaption(post)
  const hasCaption = !!(post.title || post.contentData?.caption || post.description)
  const hasMedia = !!(post.mediaUrls?.length || post.contentData?.media_url)
  const [, setLocation] = useLocation()

  const readiness = hasCaption && hasMedia ? 'ready' : hasCaption || hasMedia ? 'partial' : 'idea'

  const readinessBadge = {
    ready: { label: 'Ready', color: 'bg-emerald-500' },
    partial: { label: 'WIP', color: 'bg-amber-400' },
    idea: { label: 'Idea', color: 'bg-purple-400' },
  }[readiness]

  if (compact) {
    return (
      <div
        onClick={() => setLocation(`/create?edit=${post._id ?? post.id}`)}
        className="group flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors cursor-pointer"
      >
        {thumb ? (
          <img src={thumb} alt="" className="h-10 w-10 rounded-lg object-cover flex-shrink-0" />
        ) : (
          <div className="h-10 w-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
            <PenLine className="h-4 w-4 text-gray-300 dark:text-gray-600" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{caption}</p>
          <p className="text-xs text-gray-400 mt-0.5">Edited {fmtShort(post.updatedAt ?? post.createdAt)}</p>
        </div>
        <span className={cn('rounded-full px-2 py-0.5 text-[9px] font-bold text-white uppercase tracking-wide flex-shrink-0', readinessBadge.color)}>
          {readinessBadge.label}
        </span>
      </div>
    )
  }

  return (
    <div
      onClick={() => setLocation(`/create?edit=${post._id ?? post.id}`)}
      className="group flex gap-4 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-200 hover:shadow-sm transition-all cursor-pointer"
    >
      {thumb ? (
        <img src={thumb} alt="" className="h-20 w-20 rounded-xl object-cover flex-shrink-0" />
      ) : (
        <div className="h-20 w-20 rounded-xl bg-gradient-to-br from-amber-50 to-orange-100 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center flex-shrink-0">
          <PenLine className="h-6 w-6 text-amber-300 dark:text-gray-600" />
        </div>
      )}
      <div className="min-w-0 flex-1 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 line-clamp-2">{caption}</p>
          <span className={cn('rounded-full px-2 py-0.5 text-[9px] font-black text-white uppercase tracking-wide flex-shrink-0 mt-0.5', readinessBadge.color)}>
            {readinessBadge.label}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {!hasCaption && <span className="flex items-center gap-1 text-xs text-amber-600"><AlertCircle className="h-3 w-3" />No caption</span>}
          {!hasMedia && <span className="flex items-center gap-1 text-xs text-amber-600"><AlertCircle className="h-3 w-3" />No media</span>}
          {readiness === 'ready' && (
            <button
              onClick={e => { e.stopPropagation(); setLocation(`/create?edit=${post._id ?? post.id}&action=schedule`) }}
              className="text-xs font-semibold text-emerald-600 hover:underline"
            >
              Schedule →
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400">Edited {fmtDate(post.updatedAt ?? post.createdAt)}</p>
      </div>
    </div>
  )
}

// ── Mock data for preview when real data is empty ─────────────────────────

// ── Empty state ────────────────────────────────────────────────────────────

function EmptyState({ title, description, cta, onClick, icon: Icon }: {
  title: string; description: string; cta: string; onClick: () => void; icon?: React.FC<any>
}) {
  const I = Icon ?? LayoutGrid
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center min-h-[calc(100vh-200px)]">
      <div className="h-16 w-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
        <I className="h-8 w-8 text-gray-300 dark:text-gray-600" />
      </div>
      <div>
        <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{title}</p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-2 max-w-sm leading-relaxed">{description}</p>
      </div>
      <button onClick={onClick} className="rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-5 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity mt-1">
        {cta}
      </button>
    </div>
  )
}

// ── Section header ─────────────────────────────────────────────────────────

function SectionLabel({ icon: Icon, iconBg, title, count, subtitle }: {
  icon: React.FC<any>; iconBg: string; title: string; count: number; subtitle?: string
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0', iconBg)}>
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">{title}</h3>
          {count > 0 && (
            <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-500">{count}</span>
          )}
        </div>
        {subtitle && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{subtitle}</p>}
      </div>
    </div>
  )
}

// ── PUBLISHED POSTS view ───────────────────────────────────────────────────

function PublishedView() {
  const [, setLocation] = useLocation()
  const { currentWorkspaceId } = useCurrentWorkspace()
  const { posts, isLoading } = useAllPosts(currentWorkspaceId, false)
  const published = useMemo(() => posts.filter(p => p.status === 'published'), [posts])

  const classified = useMemo(() => {
    const withEng = published.map(p => ({ ...p, _engRate: calcEngRate(p.metrics) }))
    const sorted = [...withEng].sort((a, b) => (b._engRate ?? -1) - (a._engRate ?? -1))
    const high = sorted.filter(p => p._engRate != null && p._engRate >= 5)
    const medium = sorted.filter(p => p._engRate != null && p._engRate >= 2 && p._engRate < 5)
    const low = sorted.filter(p => p._engRate != null && p._engRate < 2)
    const noData = withEng.filter(p => p._engRate == null)
    const recent = [...published].sort((a, b) =>
      new Date(b.publishedAt ?? b.createdAt ?? 0).getTime() - new Date(a.publishedAt ?? a.createdAt ?? 0).getTime()
    )
    return { high, medium, low, noData, recent }
  }, [published])

  if (isLoading) return <PublishedSkeleton />

  const topPost = classified.high[0] ?? classified.medium[0] ?? classified.recent[0]

  return (
    <div className="p-6 w-full flex flex-col gap-6">
      {/* Page header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Published Posts</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {published.length} posts published
            {classified.high.length > 0 && ` · ${classified.high.length} high performance`}
          </p>
        </div>
        <button onClick={() => setLocation('/create')} className="flex items-center gap-1.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity">
          <Plus className="h-4 w-4" />Create a post
        </button>
      </div>

      {published.length === 0 ? (
        <EmptyState
          title="No published posts yet"
          description="Your published Instagram posts will appear here, organised by performance."
          cta="Create your first post"
          onClick={() => setLocation('/create')}
          icon={CheckCircle2}
        />
      ) : (
        <div className="space-y-6">
          {/* ── Row 1: Top post full-width hero ── */}
          {topPost && (
            <div>
              <SectionLabel icon={Star} iconBg="bg-amber-50 dark:bg-amber-900/20 text-amber-500" title="Top Performing Post" count={1} subtitle="Your best content by engagement rate" />
              <HeroPostCard post={topPost} badge="BEST" badgeColor="bg-amber-500" rank={1} />
            </div>
          )}

          {/* ── Row 2: High performance list (if more than just the top) ── */}
          {classified.high.length > 1 && (
            <div>
              <SectionLabel icon={TrendingUp} iconBg="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600" title="High Performance" count={classified.high.length - 1} subtitle="Engagement rate 5%+ · your strongest content" />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                {classified.high.slice(1, 7).map((p, i) => (
                  <CompactPostRow key={p.id ?? i} post={p} extra={
                    <p className="text-xs font-semibold text-emerald-600 mt-0.5">{p._engRate}% eng · {fmtShort(p.publishedAt)}</p>
                  } />
                ))}
              </div>
            </div>
          )}

          {/* ── Row 3: Medium + Low (side by side, equal columns) ── */}
          {(classified.medium.length > 0 || classified.low.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Medium performance */}
              {classified.medium.length > 0 && (
                <div>
                  <SectionLabel icon={Minus} iconBg="bg-amber-50 dark:bg-amber-900/20 text-amber-500" title="Medium Performance" count={classified.medium.length} subtitle="Engagement rate 2–5%" />
                  <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden divide-y divide-gray-50 dark:divide-gray-800">
                    {classified.medium.slice(0, 6).map((p, i) => (
                      <CompactPostRow key={p.id ?? i} post={p} extra={
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs font-semibold text-amber-600">{p._engRate}% eng</span>
                          {p.metrics?.reach != null && <span className="text-xs text-gray-400">{p.metrics.reach.toLocaleString()} reach</span>}
                          <span className="text-xs text-gray-400 ml-auto">{fmtShort(p.publishedAt)}</span>
                        </div>
                      } />
                    ))}
                  </div>
                </div>
              )}

              {/* Low performance */}
              {classified.low.length > 0 && (
                <div>
                  <SectionLabel icon={TrendingDown} iconBg="bg-red-50 dark:bg-red-900/20 text-red-500" title="Needs Improvement" count={classified.low.length} subtitle="Engagement rate below 2%" />
                  <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden divide-y divide-gray-50 dark:divide-gray-800">
                    {classified.low.slice(0, 6).map((p, i) => (
                      <CompactPostRow key={p.id ?? i} post={p} extra={
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-red-500">{p._engRate}% eng</span>
                          <span className="text-[10px] text-gray-400">· Caption or timing may need a rethink</span>
                        </div>
                      } />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Row 4: Most Recent (full-width 2-col) ── */}
          <div>
            <SectionLabel icon={Eye} iconBg="bg-blue-50 dark:bg-blue-900/20 text-blue-500" title="Most Recent" count={Math.min(classified.recent.length, 8)} subtitle="Latest published content" />
            <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 divide-gray-50 dark:divide-gray-800">
                {classified.recent.slice(0, 8).map((p, i) => (
                  <div key={p.id ?? i} className={cn(
                    'border-gray-50 dark:border-gray-800',
                    i % 2 === 0 && i + 1 < Math.min(classified.recent.length, 8) ? 'lg:border-r' : '',
                    i >= 2 ? 'border-t' : ''
                  )}>
                    <CompactPostRow post={p} extra={
                      <div className="flex items-center gap-3 mt-0.5">
                        {p.metrics?.likes != null && <MetricPill icon={Heart} value={p.metrics.likes} color="text-rose-400" />}
                        {p.metrics?.comments != null && <MetricPill icon={MessageCircle} value={p.metrics.comments} color="text-blue-400" />}
                        {p.metrics?.saves != null && <MetricPill icon={Bookmark} value={p.metrics.saves} color="text-amber-500" />}
                        <span className="text-xs text-gray-400 ml-auto">{fmtShort(p.publishedAt)}</span>
                      </div>
                    } />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Row 5: Awaiting insights ── */}
          {classified.noData.length > 0 && (
            <div>
              <SectionLabel icon={BarChart3} iconBg="bg-gray-100 dark:bg-gray-800 text-gray-400" title="Awaiting Insights" count={classified.noData.length} subtitle="Instagram metrics not yet available" />
              <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden divide-y divide-gray-50 dark:divide-gray-800">
                {classified.noData.slice(0, 6).map((p, i) => (
                  <CompactPostRow key={p.id ?? i} post={p} extra={
                    <p className="text-xs text-gray-400 mt-0.5">Published {fmtShort(p.publishedAt)} · insights pending</p>
                  } />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Bulk scheduling (Creator+) ─────────────────────────────────────────────

interface BulkRow {
  id: string
  title: string
  scheduledAt: string // datetime-local value
  selected: boolean
}

interface BulkResult {
  contentId: string
  success: boolean
  error?: string
}

/**
 * Bulk-schedule modal — Creator+ only. Lists the workspace's unscheduled drafts
 * and lets the user assign a publish time to each selected draft, then submits
 * them in one request to POST /api/content/bulk-schedule (max 50 per batch).
 */
function BulkScheduleModal({ open, onClose, workspaceId }: {
  open: boolean; onClose: () => void; workspaceId?: string
}) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [rows, setRows] = useState<BulkRow[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [results, setResults] = useState<BulkResult[] | null>(null)

  const { data: draftsData, isLoading } = useQuery({
    queryKey: ['/api/content/workspace', workspaceId, 'drafts', 'bulk'],
    queryFn: () => apiRequest(`/api/content/workspace/${workspaceId}/drafts?limit=50`),
    enabled: !!workspaceId && open,
    staleTime: 30_000,
  })

  React.useEffect(() => {
    if (!open) return
    const arr = draftsData?.data ?? draftsData ?? []
    const list = Array.isArray(arr) ? arr : []
    setRows(list.map((p: any) => ({
      id: String(p._id ?? p.id),
      title: p.title || p.contentData?.text || p.description || 'Untitled draft',
      scheduledAt: '',
      selected: false,
    })))
    setResults(null)
  }, [open, draftsData])

  const selectedCount = rows.filter(r => r.selected).length

  const patchRow = (id: string, patch: Partial<BulkRow>) =>
    setRows(rs => rs.map(r => (r.id === id ? { ...r, ...patch } : r)))

  const handleSubmit = async () => {
    const chosen = rows.filter(r => r.selected)
    if (chosen.length === 0) {
      toast({ title: 'Select at least one draft', variant: 'destructive' })
      return
    }
    if (chosen.length > 50) {
      toast({ title: 'You can bulk-schedule at most 50 posts at once', variant: 'destructive' })
      return
    }
    const missing = chosen.filter(r => !r.scheduledAt)
    if (missing.length > 0) {
      toast({ title: 'Pick a date & time for every selected draft', variant: 'destructive' })
      return
    }

    const items = chosen.map(r => ({
      contentId: r.id,
      scheduledAt: new Date(r.scheduledAt).toISOString(),
    }))

    setSubmitting(true)
    try {
      const resp = await apiRequest('/api/content/bulk-schedule', {
        method: 'POST',
        body: JSON.stringify({ items }),
      })
      const data = resp?.data ?? resp
      setResults(data?.results ?? [])
      toast({
        title: `Scheduled ${data?.scheduled ?? 0} of ${items.length} posts`,
        description: data?.failed ? `${data.failed} failed — see details below.` : undefined,
      })
      // Refresh scheduled/draft/calendar lists and subscription usage.
      queryClient.invalidateQueries({ queryKey: ['/api/content/workspace', workspaceId] })
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === 'string' && (q.queryKey[0] as string).startsWith('/api/content/calendar') })
      queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_QUERY_KEY })
    } catch (err: any) {
      toast({ title: 'Bulk scheduling failed', description: err?.message, variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  const resultMap = new Map((results ?? []).map(r => [r.contentId, r]))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-white dark:bg-gray-900 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Bulk Schedule</h2>
            <p className="text-xs text-gray-500 mt-0.5">Assign a publish time to each draft. Up to 50 at once.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {isLoading ? (
            <p className="text-sm text-gray-500 py-8 text-center">Loading drafts…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">No drafts available to schedule. Create some drafts first.</p>
          ) : (
            rows.map(row => {
              const res = resultMap.get(row.id)
              return (
                <div key={row.id} className={cn(
                  'flex items-center gap-3 rounded-xl border p-3',
                  res?.success ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-900/10'
                    : res && !res.success ? 'border-red-200 bg-red-50/50 dark:border-red-900/40 dark:bg-red-900/10'
                    : 'border-gray-100 dark:border-gray-800'
                )}>
                  <input
                    type="checkbox"
                    checked={row.selected}
                    onChange={e => patchRow(row.id, { selected: e.target.checked })}
                    className="h-4 w-4 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{row.title}</p>
                    {res && !res.success && <p className="text-xs text-red-500 mt-0.5">{res.error}</p>}
                    {res?.success && <p className="text-xs text-emerald-600 mt-0.5">Scheduled ✓</p>}
                  </div>
                  <input
                    type="datetime-local"
                    value={row.scheduledAt}
                    disabled={!row.selected}
                    onChange={e => patchRow(row.id, { scheduledAt: e.target.value })}
                    className="text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-gray-700 dark:text-gray-200 disabled:opacity-40"
                  />
                </div>
              )
            })
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-gray-800">
          <span className="text-sm text-gray-500">{selectedCount} selected</span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
              Close
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || selectedCount === 0}
              className="rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2 text-sm font-semibold transition-colors"
            >
              {submitting ? 'Scheduling…' : `Schedule ${selectedCount || ''}`.trim()}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── SCHEDULED POSTS view ──────────────────────────────────────────────────

function ScheduledView() {
  const [, setLocation] = useLocation()
  const { currentWorkspaceId } = useCurrentWorkspace()
  const { limits } = useSubscription()
  const canBulkSchedule = limits?.features?.bulkScheduling === true
  const [bulkOpen, setBulkOpen] = useState(false)
  const { posts, isLoading } = useAllPosts(currentWorkspaceId, false)
  const scheduled = useMemo(() => posts.filter(p => p.status === 'scheduled'), [posts])

  const categorised = useMemo(() => {
    const refNow = new Date()
    const todayEnd = new Date(refNow); todayEnd.setHours(23, 59, 59, 999)
    const weekEnd = new Date(refNow); weekEnd.setDate(weekEnd.getDate() + 7)
    const sorted = [...scheduled].sort((a: any, b: any) => new Date(a.scheduledAt ?? 0).getTime() - new Date(b.scheduledAt ?? 0).getTime())
    const today = sorted.filter((p: any) => p.scheduledAt && new Date(p.scheduledAt) <= todayEnd)
    const thisWeek = sorted.filter((p: any) => p.scheduledAt && new Date(p.scheduledAt) > todayEnd && new Date(p.scheduledAt) <= weekEnd)
    const later = sorted.filter((p: any) => p.scheduledAt && new Date(p.scheduledAt) > weekEnd)
    return { today, thisWeek, later }
  }, [scheduled])

  if (isLoading) return <ScheduledSkeleton />

  return (
    <div className="p-6 w-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Scheduled Posts</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {scheduled.length > 0
              ? `${scheduled.length} posts queued${categorised.today.length > 0 ? ` · ${categorised.today.length} publishing today` : ''}`
              : 'No posts scheduled yet'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canBulkSchedule && (
            <button onClick={() => setBulkOpen(true)} className="flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2.5 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <CalendarDays className="h-4 w-4" />Bulk schedule
            </button>
          )}
          <button onClick={() => setLocation('/create')} className="flex items-center gap-1.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity">
            <Plus className="h-4 w-4" />Schedule a post
          </button>
        </div>
      </div>

      {canBulkSchedule && (
        <BulkScheduleModal open={bulkOpen} onClose={() => setBulkOpen(false)} workspaceId={currentWorkspaceId} />
      )}

      {scheduled.length === 0 ? (
        <EmptyState
          title="Nothing scheduled yet"
          description="Schedule your Instagram posts in advance so they go out at the right time automatically."
          cta="Schedule your first post"
          onClick={() => setLocation('/create')}
          icon={Clock}
        />
      ) : (
        <>
          {categorised.today.length > 0 && (
            <div>
              <SectionLabel icon={Zap} iconBg="bg-blue-50 dark:bg-blue-900/20 text-blue-600" title="Publishing Today" count={categorised.today.length} subtitle="Going live in the next 24 hours" />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {categorised.today.map((p: any, i: number) => (
                  <ScheduledPostCard key={p._id ?? p.id ?? i} post={p} />
                ))}
              </div>
            </div>
          )}

          {categorised.thisWeek.length > 0 && (
            <div>
              <SectionLabel icon={CalendarDays} iconBg="bg-violet-50 dark:bg-violet-900/20 text-violet-600" title="This Week" count={categorised.thisWeek.length} subtitle="Scheduled in the next 7 days" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {categorised.thisWeek.map((p: any, i: number) => (
                  <ScheduledPostCard key={p._id ?? p.id ?? i} post={p} />
                ))}
              </div>
            </div>
          )}

          {categorised.later.length > 0 && (
            <div>
              <SectionLabel icon={Eye} iconBg="bg-gray-100 dark:bg-gray-800 text-gray-500" title="Coming Up Later" count={categorised.later.length} subtitle="Planned beyond this week" />
              <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden divide-y divide-gray-50 dark:divide-gray-800">
                {categorised.later.map((p: any, i: number) => (
                  <ScheduledPostCard key={p._id ?? p.id ?? i} post={p} compact />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── DRAFTS view ────────────────────────────────────────────────────────────

function DraftsView() {
  const [, setLocation] = useLocation()
  const { currentWorkspaceId } = useCurrentWorkspace()
  const { posts, isLoading } = useAllPosts(currentWorkspaceId)
  const drafts = useMemo(() => posts.filter(p => p.status === 'draft'), [posts])

  const categorised = useMemo(() => {
    const ready: any[] = []
    const partial: any[] = []
    const ideas: any[] = []

    for (const p of drafts) {
      const hasCaption = !!(p.title || p.contentData?.caption || p.description)
      const hasMedia = !!(p.mediaUrls?.length || p.contentData?.media_url)
      if (hasCaption && hasMedia) ready.push(p)
      else if (hasCaption || hasMedia) partial.push(p)
      else ideas.push(p)
    }

    const recent = [...drafts]
      .sort((a: any, b: any) => new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() - new Date(a.updatedAt ?? a.createdAt ?? 0).getTime())

    return { ready, partial, ideas, recent }
  }, [drafts])

  if (isLoading) return <DraftsSkeleton />

  return (
    <div className="p-6 w-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Drafts</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {drafts.length > 0
              ? `${drafts.length} drafts${categorised.ready.length > 0 ? ` · ${categorised.ready.length} ready to publish` : ''}`
              : 'No drafts saved yet'}
          </p>
        </div>
        <button onClick={() => setLocation('/create')} className="flex items-center gap-1.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity">
          <Plus className="h-4 w-4" />New draft
        </button>
      </div>

      {drafts.length === 0 ? (
        <EmptyState
          title="No drafts yet"
          description="Start writing posts without publishing — save them as drafts and come back to them anytime."
          cta="Start a draft"
          onClick={() => setLocation('/create')}
          icon={PenLine}
        />
      ) : (
        <>
          {categorised.ready.length > 0 && (
            <div>
              <SectionLabel icon={CheckCircle2} iconBg="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600" title="Ready to Publish" count={categorised.ready.length} subtitle="Caption and media complete — just hit publish" />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {categorised.ready.slice(0, 4).map((p: any, i: number) => (
                  <DraftPostCard key={p._id ?? p.id ?? i} post={p} />
                ))}
              </div>
              {categorised.ready.length > 4 && (
                <div className="mt-2 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden divide-y divide-gray-50 dark:divide-gray-800">
                  {categorised.ready.slice(4).map((p: any, i: number) => (
                    <DraftPostCard key={p._id ?? p.id ?? i} post={p} compact />
                  ))}
                </div>
              )}
            </div>
          )}

          {(categorised.partial.length > 0 || categorised.ideas.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {categorised.partial.length > 0 && (
                <div>
                  <SectionLabel icon={AlertCircle} iconBg="bg-amber-50 dark:bg-amber-900/20 text-amber-500" title="Needs Work" count={categorised.partial.length} subtitle="Missing caption or media" />
                  <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden divide-y divide-gray-50 dark:divide-gray-800">
                    {categorised.partial.slice(0, 6).map((p: any, i: number) => (
                      <DraftPostCard key={p._id ?? p.id ?? i} post={p} compact />
                    ))}
                  </div>
                </div>
              )}

              {categorised.ideas.length > 0 && (
                <div>
                  <SectionLabel icon={Lightbulb} iconBg="bg-purple-50 dark:bg-purple-900/20 text-purple-500" title="Ideas" count={categorised.ideas.length} subtitle="Early-stage concepts to develop" />
                  <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden divide-y divide-gray-50 dark:divide-gray-800">
                    {categorised.ideas.map((p: any, i: number) => (
                      <DraftPostCard key={p._id ?? p.id ?? i} post={p} compact />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {categorised.recent.length > 0 && (
            <div>
              <SectionLabel icon={PenLine} iconBg="bg-gray-100 dark:bg-gray-800 text-gray-500" title="Recently Edited" count={Math.min(categorised.recent.length, 6)} subtitle="Latest activity" />
              <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden divide-y divide-gray-50 dark:divide-gray-800">
                {categorised.recent.slice(0, 6).map((p: any, i: number) => (
                  <CompactPostRow key={p._id ?? p.id ?? i} post={p} extra={
                    <p className="text-xs text-gray-400 mt-0.5">Edited {fmtDate(p.updatedAt ?? p.createdAt)}</p>
                  } />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── DM view ────────────────────────────────────────────────────────────────

function DMView() {
  const [, setLocation] = useLocation()
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 py-24 text-center px-8">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
        <MessageSquare className="h-8 w-8 text-gray-400" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">DM Automation</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
        Set up automated direct message sequences to engage your audience and drive conversations.
      </p>
      <button onClick={() => setLocation('/automation')}
        className="rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-5 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity">
        Set up automations
      </button>
    </div>
  )
}

// ── Main PlanPage ──────────────────────────────────────────────────────────

export function PlanPage() {
  const [, setLocation] = useLocation()
  const [activeNav, setActiveNav] = useState<NavId>('calendar')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const { limits } = useSubscription()

  // Drafts are a Creator+ feature. Hide the Drafts nav entry entirely for plans
  // that don't include it (Free). Default to hidden until the entitlement loads
  // so Free users never see a flash of the Drafts tab.
  const canUseDrafts = limits?.features?.draftPosts === true
  const navItems = useMemo(
    () => (canUseDrafts ? NAV_ITEMS : NAV_ITEMS.filter(item => item.id !== 'drafts')),
    [canUseDrafts]
  )

  // If entitlement loads while the user is on the Drafts tab (e.g. deep link or
  // a downgrade), bounce them to the Calendar.
  React.useEffect(() => {
    if (!canUseDrafts && activeNav === 'drafts') {
      setActiveNav('calendar')
    }
  }, [canUseDrafts, activeNav])

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* ── Plan sidebar ─────────────────────────────────────────────── */}
      <aside className={cn(
        'flex flex-col flex-shrink-0 bg-white dark:bg-gray-900 transition-all duration-300 ease-in-out sticky top-0 h-screen overflow-y-auto',
        'shadow-[1px_0_0_0_#e5e7eb] dark:shadow-[1px_0_0_0_#374151]',
        sidebarCollapsed ? 'w-14' : 'w-72'
      )}>
        {/* Header: Plan title + «/» toggle */}
        <div className={cn(
          'flex items-center border-b border-gray-200 dark:border-gray-800 flex-shrink-0',
          sidebarCollapsed ? 'justify-center px-0 py-5' : 'justify-between px-5 py-5'
        )}>
          {!sidebarCollapsed && (
            <span className="text-lg font-black tracking-tight text-gray-900 dark:text-gray-100">Plan</span>
          )}
          <button
            onClick={() => setSidebarCollapsed(v => !v)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="flex h-8 w-8 items-center justify-center rounded-md text-gray-950 hover:text-black dark:text-gray-200 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-all flex-shrink-0"
          >
            <ChevronsLeft className={cn('h-5 w-5 transition-transform duration-300 ease-in-out', sidebarCollapsed && 'rotate-180')} />
          </button>
        </div>

        {/* Nav content — fades when collapsed */}
        <div className={cn(
          'flex flex-col py-4 transition-opacity duration-200',
          sidebarCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
        )}>
          {/* New post CTA */}
          <div className="px-4 pb-4">
            <button onClick={() => setLocation('/create')}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 text-sm font-semibold transition-colors shadow-sm">
              <Plus className="h-4 w-4" />New post
            </button>
          </div>
          {/* Nav items */}
          <div className="px-3 space-y-0.5">
            {navItems.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setActiveNav(id)}
                className={cn(
                  'w-full flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium transition-colors text-left',
                  activeNav === id
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                    : 'text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800/60'
                )}>
                <Icon className={cn('h-5 w-5 flex-shrink-0', activeNav === id ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300')} />
                <span className="truncate">{label}</span>
                {activeNav === id && <span className="ml-auto h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* ── Content area ─────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 h-screen overflow-y-auto bg-gray-50/40 dark:bg-gray-950">
        {activeNav === 'calendar' && (
          <Suspense fallback={<PlanSkeleton />}><CalendarView /></Suspense>
        )}
        {activeNav === 'scheduled' && <ScheduledView />}
        {activeNav === 'drafts' && canUseDrafts && <DraftsView />}
        {activeNav === 'published' && <PublishedView />}
        {activeNav === 'dm' && <DMView />}
      </div>
    </div>
  )
}
