/**
 * CalendarView — Hootsuite-style weekly content calendar.
 * Shows scheduled, draft, and veefore-published posts (including failed/partial).
 * Does NOT show imported posts.
 */

import React, { useState, useMemo } from 'react'
import { useLocation } from 'wouter'
import {
  ChevronLeft, ChevronRight, Settings, Share2,
  SlidersHorizontal, List, LayoutGrid, CalendarDays,
  Plus, Check, Clock, FileEdit, Instagram, Sparkles,
  XCircle, AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'
import useSubscription from '@/hooks/useSubscription'

// ── Hook: best-time API (the real algorithm) ──────────────────────────────
// Uses /api/v1/analytics/best-time which returns audience + post-performance grids.
// weeklyGrid keys are "DOW_HOUR" where DOW 0=Sun … 6=Sat, hour 0–23.

interface BestTimeSlot { dow: number; hour: number; count: number }
interface SmartDailyBest {
  dow: number; dayName: string; hour: number; hourLabel: string; score: number; dayScore: number
}
interface BestTimeResponse {
  weeklyGrid: Record<string, number>
  topDays: BestTimeSlot[]
  smart?: {
    dailyBest: SmartDailyBest[]
    bestSlot: { dow: number; dayName: string; hour: number; hourLabel: string; score: number } | null
    confidenceLevel: string
  }
  hasData: boolean
  hasPostData: boolean
}

function useBestTimeForCalendar(workspaceId?: string | null) {
  return useQuery<BestTimeResponse>({
    queryKey: ['/api/v1/analytics/best-time/calendar', workspaceId],
    queryFn: () => apiRequest(`/api/v1/analytics/best-time?workspaceId=${workspaceId}`),
    enabled: !!workspaceId,
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

// ── DEV FLAG removed — real data only ─────────────────────────────────────

// ── Social events keyed by MM-DD ──────────────────────────────────────────

const SOCIAL_EVENTS: Record<string, { title: string; bg: string; text: string }> = {
  '01-01': { title: "New Year's Day",             bg: 'bg-blue-500',    text: 'text-white' },
  '02-14': { title: "Valentine's Day",            bg: 'bg-pink-500',    text: 'text-white' },
  '03-08': { title: "International Women's Day",  bg: 'bg-purple-500',  text: 'text-white' },
  '04-22': { title: 'Earth Day',                  bg: 'bg-green-500',   text: 'text-white' },
  '05-01': { title: "International Workers' Day", bg: 'bg-orange-500',  text: 'text-white' },
  '06-05': { title: 'World Environment Day',      bg: 'bg-emerald-500', text: 'text-white' },
  '06-15': { title: "Father's Day",               bg: 'bg-blue-600',    text: 'text-white' },
  '07-01': { title: 'Social Media Day',           bg: 'bg-indigo-500',  text: 'text-white' },
  '07-17': { title: 'World Emoji Day',            bg: 'bg-yellow-400',  text: 'text-gray-900' },
  '07-18': { title: 'Nelson Mandela Day',         bg: 'bg-teal-600',    text: 'text-white' },
  '07-30': { title: 'Social Media Giving Day',    bg: 'bg-blue-500',    text: 'text-white' },
  '08-12': { title: 'International Youth Day',    bg: 'bg-green-500',   text: 'text-white' },
  '09-21': { title: 'Day of Peace',               bg: 'bg-blue-400',    text: 'text-white' },
  '10-10': { title: 'World Mental Health Day',    bg: 'bg-green-600',   text: 'text-white' },
  '10-31': { title: 'Halloween',                  bg: 'bg-orange-600',  text: 'text-white' },
  '11-27': { title: 'Thanksgiving',               bg: 'bg-amber-600',   text: 'text-white' },
  '12-25': { title: 'Christmas Day',              bg: 'bg-red-500',     text: 'text-white' },
  '12-31': { title: "New Year's Eve",             bg: 'bg-violet-500',  text: 'text-white' },
}

const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Statuses that show in the calendar — everything Veefore manages
const CALENDAR_STATUSES = new Set([
  'scheduled', 'queued', 'publishing', 'processing',
  'published', 'partially_published', 'failed', 'retrying',
  'draft',
])

// ── Helpers ────────────────────────────────────────────────────────────────

function getWeekStart(from: Date): Date {
  const d = new Date(from)
  d.setDate(d.getDate() - d.getDay())
  d.setHours(0, 0, 0, 0)
  return d
}

function formatWeekRange(start: Date, end: Date): string {
  const s = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const e = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${s} – ${e}`
}

function mmdd(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

// ── Status config ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { Icon: any; bg: string; text: string; label: string; dot: string }> = {
  published:           { Icon: Check,          bg: 'bg-emerald-50 dark:bg-emerald-900/25', text: 'text-emerald-700 dark:text-emerald-400', label: 'Published',  dot: 'bg-emerald-500' },
  scheduled:           { Icon: Clock,          bg: 'bg-blue-50 dark:bg-blue-900/25',       text: 'text-blue-700 dark:text-blue-400',       label: 'Scheduled',  dot: 'bg-blue-500'    },
  draft:               { Icon: FileEdit,       bg: 'bg-gray-100 dark:bg-gray-700',         text: 'text-gray-500 dark:text-gray-400',       label: 'Draft',      dot: 'bg-gray-400'    },
  failed:              { Icon: XCircle,        bg: 'bg-red-50 dark:bg-red-900/25',         text: 'text-red-600 dark:text-red-400',         label: 'Failed',     dot: 'bg-red-500'     },
  partially_published: { Icon: AlertTriangle,  bg: 'bg-amber-50 dark:bg-amber-900/25',     text: 'text-amber-700 dark:text-amber-400',     label: 'Partial',    dot: 'bg-amber-500'   },
  queued:              { Icon: Clock,          bg: 'bg-violet-50 dark:bg-violet-900/25',   text: 'text-violet-700 dark:text-violet-400',   label: 'Queued',     dot: 'bg-violet-500'  },
  publishing:          { Icon: Clock,          bg: 'bg-blue-50 dark:bg-blue-900/25',       text: 'text-blue-700 dark:text-blue-400',       label: 'Publishing', dot: 'bg-blue-400'    },
  processing:          { Icon: Clock,          bg: 'bg-blue-50 dark:bg-blue-900/25',       text: 'text-blue-700 dark:text-blue-400',       label: 'Processing', dot: 'bg-blue-400'    },
  retrying:            { Icon: AlertTriangle,  bg: 'bg-amber-50 dark:bg-amber-900/25',     text: 'text-amber-700 dark:text-amber-400',     label: 'Retrying',   dot: 'bg-amber-400'   },
}

// ── Post card ──────────────────────────────────────────────────────────────

function PostCard({ post, onClick }: { post: any; onClick?: () => void }) {
  const thumb = post.mediaUrls?.[0] || post.contentData?.thumbnail_url || post.contentData?.media_url || null
  const caption = post.title || post.contentData?.caption || post.description || ''

  // Pick the most relevant timestamp for display
  const timeIso = post.scheduledAt || post.publishedAt || post.failedAt || null
  const time = timeIso ? fmtTime(timeIso) : null

  const cfg = STATUS_CONFIG[post.status] ?? STATUS_CONFIG.draft
  const { Icon: StatusIcon } = cfg

  return (
    <div
      onClick={onClick}
      className="group rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm hover:border-gray-200 dark:hover:border-gray-600 hover:shadow-md transition-all cursor-pointer"
    >
      {/* Thumbnail or placeholder */}
      {thumb ? (
        <div className="relative">
          <img src={thumb} alt="" className="w-full h-[100px] object-cover" />
          <div className="absolute bottom-2 left-2 h-6 w-6 rounded-full bg-gradient-to-br from-pink-500 via-rose-500 to-orange-400 flex items-center justify-center shadow">
            <Instagram className="h-3 w-3 text-white" />
          </div>
        </div>
      ) : (
        <div className="w-full h-[60px] bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-750 flex items-center justify-center">
          <Instagram className="h-5 w-5 text-gray-200 dark:text-gray-600" />
        </div>
      )}

      {/* Body */}
      <div className="px-3 py-2.5 space-y-2">
        {/* Caption */}
        {caption ? (
          <p className="text-xs font-medium text-gray-800 dark:text-gray-200 line-clamp-2 leading-snug">
            {caption}
          </p>
        ) : (
          <p className="text-xs text-gray-400 dark:text-gray-500 italic leading-snug">Untitled post</p>
        )}

        {/* Time */}
        {time && (
          <div className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500">
            <Clock className="h-3 w-3 flex-shrink-0" />
            <span className="font-medium">{time}</span>
          </div>
        )}

        {/* Status badge */}
        <div className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-1', cfg.bg)}>
          <span className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', cfg.dot)} />
          <StatusIcon className={cn('h-3 w-3', cfg.text)} />
          <span className={cn('text-[11px] font-bold leading-none', cfg.text)}>{cfg.label}</span>
        </div>

        {/* Error reason for failed posts */}
        {(post.status === 'failed' || post.status === 'partially_published') && post.lastError && (
          <p className="text-[10px] text-red-500 dark:text-red-400 line-clamp-2 leading-snug border-t border-red-100 dark:border-red-900/30 pt-1.5">
            {post.lastError}
          </p>
        )}
      </div>
    </div>
  )
}

// ── AI recommended time card ───────────────────────────────────────────────

function RecommendedCard({ time, reason, onClick }: { time: string; reason: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl border border-violet-200 dark:border-violet-800/60 bg-gradient-to-br from-violet-50 to-indigo-50/60 dark:from-violet-950/30 dark:to-indigo-950/20 px-3 py-3 shadow-sm hover:border-violet-300 dark:hover:border-violet-700 hover:shadow-md transition-all group"
    >
      <div className="flex items-start gap-2.5">
        <div className="h-7 w-7 rounded-lg bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center flex-shrink-0 group-hover:bg-violet-200 dark:group-hover:bg-violet-800/60 transition-colors">
          <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold text-violet-500 dark:text-violet-400 uppercase tracking-wider leading-none mb-1.5">Best time to post</p>
          <p className="text-sm font-bold text-violet-800 dark:text-violet-200 leading-none">{time}</p>
          <p className="text-xs text-violet-500 dark:text-violet-400 mt-1.5 leading-snug">{reason}</p>
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-1 text-[11px] font-semibold text-violet-600 dark:text-violet-400 group-hover:text-violet-700 dark:group-hover:text-violet-300 transition-colors">
        <Plus className="h-3 w-3" />
        Schedule at this time
      </div>
    </button>
  )
}

// ── Drop zone ─────────────────────────────────────────────────────────────

function DropZone({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full py-4 border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-xl text-gray-300 dark:text-gray-700 hover:border-blue-200 dark:hover:border-blue-800 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 hover:text-blue-400 dark:hover:text-blue-500 transition-colors flex flex-col items-center justify-center gap-1 group"
    >
      <Plus className="h-4 w-4" />
      <span className="text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity">Add post</span>
    </button>
  )
}

// ── Main CalendarView ──────────────────────────────────────────────────────

export function CalendarView() {
  const [, setLocation] = useLocation()
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()))
  const [view, setView] = useState<'list' | 'grid' | 'month'>('grid')

  const { currentWorkspaceId } = useCurrentWorkspace()
  const { limits } = useSubscription()
  // Drafts are a Creator+ feature — don't fetch or show them on the calendar for Free.
  const canUseDrafts = limits?.features?.draftPosts === true

  // Best-time data from the real algorithm (audience online + post performance)
  const { data: bestTimeData } = useBestTimeForCalendar(currentWorkspaceId)

  const weekEnd = useMemo(() => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 6)
    d.setHours(23, 59, 59, 999)
    return d
  }, [weekStart])

  const days = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      return d
    }), [weekStart])

  // Fetch all workspace content then filter on the client
  // We need scheduled, drafts, AND published/failed posts that came through Veefore
  const { data: postsData } = useQuery({
    queryKey: ['/api/content/calendar-all', currentWorkspaceId],
    queryFn: () => apiRequest(`/api/content/workspace/${currentWorkspaceId}?page=1&limit=200&excludeImported=true`),
    enabled: !!currentWorkspaceId,
    staleTime: 60_000,
  })
  const { data: scheduledData } = useQuery({
    queryKey: ['/api/content/calendar-scheduled', currentWorkspaceId],
    queryFn: () => apiRequest(`/api/content/workspace/${currentWorkspaceId}/scheduled?limit=100`),
    enabled: !!currentWorkspaceId,
    staleTime: 60_000,
  })
  const { data: draftsData } = useQuery({
    queryKey: ['/api/content/calendar-drafts', currentWorkspaceId],
    queryFn: () => apiRequest(`/api/content/workspace/${currentWorkspaceId}/drafts?limit=50`),
    enabled: !!currentWorkspaceId && canUseDrafts,
    staleTime: 60_000,
  })

  // Merge and deduplicate by _id; keep only calendar-relevant statuses
  const allPosts: any[] = useMemo(() => {
    const norm = (d: any, overrideStatus?: string) => {
      const arr = d?.data ?? d ?? []
      return (Array.isArray(arr) ? arr : []).map((p: any) => ({
        ...p,
        status: overrideStatus ?? p.status ?? 'draft',
      }))
    }

    const combined = [
      ...norm(postsData),
      ...norm(scheduledData, 'scheduled'),
      ...norm(draftsData, 'draft'),
    ]

    const seen = new Set<string>()
    return combined.filter(p => {
      const id = String(p._id ?? p.id ?? '')
      if (!id || seen.has(id)) return false
      seen.add(id)
      return CALENDAR_STATUSES.has(p.status)
    })
  }, [postsData, scheduledData, draftsData])

  // AI best-time per day — from the unified Smart engine (audience + engagement + reach).
  // Keyed by DOW (0=Sun … 6=Sat) to match the calendar's day columns directly.
  const bestTimeByDay = useMemo(() => {
    const daily = bestTimeData?.smart?.dailyBest
    if (!Array.isArray(daily)) return {} as Record<number, { hour: number; time: string; reason: string }>
    const bestDow = bestTimeData?.smart?.bestSlot?.dow
    const map: Record<number, { hour: number; time: string; reason: string }> = {}
    for (const d of daily) {
      if (!d || d.dayScore <= 0) continue // no signal for this day → no recommendation
      map[d.dow] = {
        hour: d.hour,
        time: d.hourLabel,
        reason: d.dow === bestDow
          ? 'Best day of the week'
          : d.dayScore >= 70 ? 'High-opportunity window'
          : d.dayScore >= 40 ? 'Good time to post'
          : 'Worth a try',
      }
    }
    return map
  }, [bestTimeData])

  const getPostsForDay = (d: Date) =>
    allPosts.filter(p => {
      // Use the most relevant date for placement
      const dateStr = p.scheduledAt || p.publishedAt || p.failedAt || p.createdAt
      if (!dateStr) return false
      return new Date(dateStr).toDateString() === d.toDateString()
    })

  const getAiTimeForDay = (dayIndex: number) => {
    // dayIndex is the calendar column's DOW (0=Sun … 6=Sat) — same convention as smart data.
    return bestTimeByDay[dayIndex] ?? null
  }

  const isToday = (d: Date) => d.toDateString() === new Date().toDateString()
  const isPast = (d: Date) => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return d < today
  }

  const goToday = () => setWeekStart(getWeekStart(new Date()))
  const prevWeek = () => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n })
  const nextWeek = () => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n })

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-gray-900">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Calendar</h1>
        <div className="flex items-center gap-2">
          <button className="p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-400 transition-colors">
            <Settings className="h-4 w-4" />
          </button>
          <button className="p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-400 transition-colors">
            <Share2 className="h-4 w-4" />
          </button>
          <div className="h-5 w-px bg-gray-200 dark:bg-gray-700 mx-1" />
          <button
            onClick={() => setLocation('/create')}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-semibold transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create a post
          </button>
        </div>
      </div>

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-2.5 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <button onClick={prevWeek} className="p-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-500 transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={goToday}
            className="px-3 py-1 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700 transition-colors"
          >
            Today
          </button>
          <button onClick={nextWeek} className="p-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-500 transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400 ml-1">
            {formatWeekRange(weekStart, weekEnd)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            {([
              { id: 'list' as const, icon: List },
              { id: 'grid' as const, icon: LayoutGrid },
              { id: 'month' as const, icon: CalendarDays },
            ]).map(({ id, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={cn(
                  'p-2 transition-colors',
                  view === id
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                    : 'text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors font-medium">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
          </button>
        </div>
      </div>


      {/* ── Calendar grid ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto min-h-0">

        {/* Day header row */}
        <div className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 z-10">
          {days.map((d, i) => {
            const today = isToday(d)
            return (
              <div
                key={i}
                className={cn(
                  'py-3 text-center border-r border-gray-100 dark:border-gray-800 last:border-r-0',
                  today && 'bg-blue-50/50 dark:bg-blue-900/10'
                )}
              >
                <p className={cn(
                  'text-[11px] font-semibold uppercase tracking-wide mb-2',
                  today ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'
                )}>
                  {WEEK_DAYS[i]}
                </p>
                <div className={cn(
                  'h-8 w-8 mx-auto rounded-full flex items-center justify-center text-sm font-bold transition-colors',
                  today
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer'
                )}>
                  {d.getDate()}
                </div>
              </div>
            )
          })}
        </div>

        {/* Day content columns */}
        <div className="grid grid-cols-7 min-h-[600px]">
          {days.map((d, i) => {
            const socialEvent = SOCIAL_EVENTS[mmdd(d)]
            const posts = getPostsForDay(d)
            const aiTime = getAiTimeForDay(i)
            const today = isToday(d)
            const past = isPast(d) && !today

            return (
              <div
                key={i}
                className={cn(
                  'p-2 space-y-2 border-r border-gray-100 dark:border-gray-800 last:border-r-0 min-h-[600px]',
                  today && 'bg-blue-50/20 dark:bg-blue-900/5',
                  past && 'bg-gray-50/60 dark:bg-gray-900/40'
                )}
              >
                {/* Social media event banner */}
                {socialEvent && (
                  <div className={cn(
                    'rounded-lg px-2.5 py-1.5 text-xs font-bold truncate',
                    socialEvent.bg, socialEvent.text
                  )}>
                    {socialEvent.title}
                  </div>
                )}

                {/* Post cards */}
                {posts.map((post, pi) => (
                  <PostCard
                    key={post._id ?? post.id ?? pi}
                    post={post}
                    onClick={() => {
                      if (post.status === 'draft' || post.status === 'scheduled') {
                        setLocation(`/create?edit=${post._id ?? post.id}`)
                      }
                    }}
                  />
                ))}

                {/* AI recommended time card — always visible when data available */}
                {aiTime && (
                  <RecommendedCard
                    time={aiTime.time}
                    reason={aiTime.reason}
                    onClick={() => {
                      const dt = new Date(d)
                      dt.setHours(aiTime.hour, 0, 0, 0)
                      setLocation(`/create?scheduledAt=${encodeURIComponent(dt.toISOString())}`)
                    }}
                  />
                )}

                {/* Drop zone — empty future day with no AI time */}
                {posts.length === 0 && !aiTime && !past && (
                  <DropZone onClick={() => setLocation('/create')} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
