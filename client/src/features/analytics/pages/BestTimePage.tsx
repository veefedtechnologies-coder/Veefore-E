/**
 * BestTimePage — "Best Time to Post" analytics page.
 *
 * Three goal-based tabs, each showing a 7×24 heatmap + top slot cards:
 *   1. Max Reach       — when followers are most online (audience data from Meta)
 *   2. Boost Visibility — when your posts historically got the most impressions
 *   3. Drive Engagement — when your posts historically got the best engagement rate
 */

import { useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'wouter'
import { cn } from '@/lib/utils'
import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher'
import { SURFACE_CLASS } from '../design-system/tokens'
import { AnalyticsPageContainer } from '../components/AnalyticsPageContainer'
import { useAnalyticsActiveRoute } from '../hooks/useAnalyticsActiveRoute'
import { useBestTimeData, type SlotValue } from '../hooks/useBestTimeData'
import {
  PlatformFilterProvider,
  useOptionalPlatformFilter,
} from '../context/PlatformFilterContext'

// ── constants ─────────────────────────────────────────────────────────────────
const HOURS = Array.from({ length: 24 }, (_, i) => i)
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function fmtHour(h: number): string {
  if (h === 0) return '12am'
  if (h < 12) return `${h}am`
  if (h === 12) return '12pm'
  return `${h - 12}pm`
}

// ── tab definitions ────────────────────────────────────────────────────────────
type TabId = 'smart' | 'reach' | 'visibility' | 'engagement'

const TABS: Array<{
  id: TabId
  label: string
  goal: string
  desc: string
  metric: string
  unit: string
  accentClass: string
  accentHex: string
}> = [
  {
    id: 'smart',
    label: 'Smart Pick',
    goal: 'The single best time to post',
    desc: 'Our AI blends when your followers are online, your historical engagement, and reach into one recommendation — including the best day of the week.',
    metric: 'Combined opportunity score',
    unit: 'score',
    accentClass: 'bg-violet-500',
    accentHex: '#8b5cf6',
  },
  {
    id: 'reach',
    label: 'Max Reach',
    goal: 'Reach the most people',
    desc: 'Post when your followers are online to maximise how many see your content the moment it goes live.',
    metric: 'Average followers online',
    unit: 'followers',
    accentClass: 'bg-emerald-500',
    accentHex: '#10b981',
  },
  {
    id: 'visibility',
    label: 'Boost Visibility',
    goal: 'Get more eyes on your posts',
    desc: 'Based on your historical post performance — these slots consistently delivered the highest impressions.',
    metric: 'Average post impressions',
    unit: 'impressions',
    accentClass: 'bg-blue-500',
    accentHex: '#3b82f6',
  },
  {
    id: 'engagement',
    label: 'Drive Engagement',
    goal: 'Spark more likes & comments',
    desc: 'Based on your post history — these slots produced the strongest engagement rate (likes+comments ÷ reach).',
    metric: 'Average engagement rate',
    unit: '%',
    accentClass: 'bg-violet-500',
    accentHex: '#8b5cf6',
  },
]

// ── colour scale ───────────────────────────────────────────────────────────────
function heatColour(ratio: number, hex: string): string {
  if (ratio <= 0) return `${hex}0d`
  const opacity = Math.round(Math.min(1, 0.08 + ratio * 0.92) * 255).toString(16).padStart(2, '0')
  return `${hex}${opacity}`
}

// ── Portal tooltip ─────────────────────────────────────────────────────────────
interface TooltipState {
  visible: boolean
  x: number
  y: number
  day: string
  hour: number
  value: number
  unit: string
  formatVal: (v: number) => string
}

function HeatmapTooltip({ state }: { state: TooltipState }) {
  if (!state.visible) return null

  const content = (
    <div
      className="pointer-events-none fixed z-[9999] min-w-[140px] rounded-lg bg-gray-900 px-3 py-2.5 shadow-xl dark:bg-gray-100"
      style={{ left: state.x, top: state.y, transform: 'translate(-50%, -100%)' }}
    >
      {/* Arrow */}
      <div
        className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2"
        style={{ borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '6px solid #111827' }}
      />
      {/* Day + time */}
      <p className="text-[12px] font-semibold text-white dark:text-gray-900">
        {state.day}, {fmtHour(state.hour)}
      </p>
      {/* Value */}
      <p className="mt-0.5 text-[13px] font-bold text-emerald-400 dark:text-emerald-600">
        {state.formatVal(state.value)}{' '}
        <span className="text-[11px] font-normal text-gray-300 dark:text-gray-600">{state.unit}</span>
      </p>
    </div>
  )

  return createPortal(content, document.body)
}

// ── 7×24 heatmap ──────────────────────────────────────────────────────────────
function Heatmap({
  grid,
  hex,
  unit,
  formatVal,
}: {
  grid: Record<string, number>
  hex: string
  unit: string
  formatVal: (v: number) => string
}) {
  const allValues = Object.values(grid)
  const maxVal = allValues.length > 0 ? Math.max(...allValues) : 1

  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false, x: 0, y: 0, day: '', hour: 0, value: 0, unit, formatVal,
  })
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, dow: number, h: number, val: number) => {
      const rect = e.currentTarget.getBoundingClientRect()
      setTooltip({
        visible: true,
        x: rect.left + rect.width / 2,
        y: rect.top - 10,
        day: DAYS[dow],
        hour: h,
        value: val,
        unit,
        formatVal,
      })
    },
    [unit, formatVal]
  )

  const handleMouseLeave = useCallback(() => {
    setTooltip((prev) => ({ ...prev, visible: false }))
  }, [])

  return (
    <div ref={containerRef}>
      <HeatmapTooltip state={tooltip} />
      <div className="overflow-x-auto">
        <div
          className="min-w-[640px]"
          style={{ display: 'grid', gridTemplateColumns: '36px repeat(24, minmax(0, 1fr))', gap: 3 }}
        >
          {/* Header row */}
          <div />
          {HOURS.map((h) => (
            <div key={h} className="pb-1 text-center text-[9px] text-gray-400 dark:text-gray-500">
              {h % 3 === 0 ? fmtHour(h) : ''}
            </div>
          ))}

          {/* Data rows */}
          {DAYS.map((dayLabel, dow) => (
            <>
              <div
                key={`lbl-${dow}`}
                className="flex items-center justify-end pr-2 text-[11px] font-medium text-gray-500 dark:text-gray-400"
              >
                {dayLabel}
              </div>
              {HOURS.map((h) => {
                const val = grid[`${dow}_${h}`] ?? 0
                const ratio = maxVal > 0 ? val / maxVal : 0
                return (
                  <div
                    key={`${dow}_${h}`}
                    className="cursor-default rounded-sm transition-opacity hover:opacity-80"
                    style={{ height: 22, backgroundColor: heatColour(ratio, hex) }}
                    onMouseEnter={(e) => handleMouseEnter(e, dow, h, val)}
                    onMouseLeave={handleMouseLeave}
                  />
                )
              })}
            </>
          ))}
        </div>
      </div>

      {/* Colour legend */}
      <div className="mt-4 flex items-center gap-3">
        <span className="text-[11px] text-gray-400 dark:text-gray-500">Less</span>
        <div className="flex gap-0.5">
          {[0, 0.18, 0.36, 0.55, 0.75, 1].map((r) => (
            <div key={r} className="h-3 w-5 rounded-sm" style={{ backgroundColor: heatColour(r, hex) }} />
          ))}
        </div>
        <span className="text-[11px] text-gray-400 dark:text-gray-500">More</span>
      </div>
    </div>
  )
}

// ── helpers ───────────────────────────────────────────────────────────────────
/**
 * Compute the next calendar date (from now) that falls on the given
 * day-of-week (0=Sun…6=Sat) at the given hour (0–23), minute 0.
 * If that slot is in the past today, advance to next week.
 */
function nextOccurrence(dow: number, hour: number): Date {
  const now = new Date()
  const result = new Date(now)
  result.setMinutes(0, 0, 0)
  result.setHours(hour)
  // Advance to the target day-of-week
  const diff = (dow - result.getDay() + 7) % 7
  result.setDate(result.getDate() + diff)
  // If this slot is in the past (same day but hour already passed), go next week
  if (result <= now) result.setDate(result.getDate() + 7)
  return result
}

function fmtScheduleDate(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

// ── top slot cards ─────────────────────────────────────────────────────────────
function TopSlotCards({
  slots,
  unit,
  accentClass,
  accentHex,
  formatVal,
}: {
  slots: SlotValue[]
  unit: string
  accentClass: string
  accentHex: string
  formatVal: (v: number) => string
}) {
  const [, setLocation] = useLocation()
  if (slots.length === 0) return null

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {slots.map((slot, idx) => {
        const next = nextOccurrence(slot.dow, slot.hour)
        const scheduledAtParam = next.toISOString()
        const dateLabel = fmtScheduleDate(next)

        return (
          <div
            key={`${slot.dow}_${slot.hour}`}
            className={cn(SURFACE_CLASS, 'flex flex-col gap-3 p-4')}
          >
            {/* Rank + Day/Time */}
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
                style={{ backgroundColor: idx === 0 ? accentHex : `${accentHex}${idx === 1 ? 'cc' : '88'}` }}
              >
                {idx + 1}
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 leading-tight">
                  {DAYS[slot.dow]} · {fmtHour(slot.hour)}
                </p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-tight mt-0.5">
                  {formatVal(slot.count)} {unit}
                </p>
              </div>
            </div>

            {/* Next occurrence label */}
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              Next: <span className="font-medium text-gray-600 dark:text-gray-300">{dateLabel}</span>
            </p>

            {/* Schedule CTA */}
            <button
              onClick={() => setLocation(`/create?scheduledAt=${encodeURIComponent(scheduledAtParam)}`)}
              className="mt-auto flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 active:scale-[0.98]"
              style={{ backgroundColor: accentHex }}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Schedule for {dateLabel}
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ── empty state ────────────────────────────────────────────────────────────────
function EmptyState({ message }: { message: string }) {
  return (
    <div className={cn(SURFACE_CLASS, 'flex flex-col items-center gap-3 p-10 text-center')}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-50 dark:bg-gray-800">
        <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>
    </div>
  )
}

// ── skeleton ───────────────────────────────────────────────────────────────────
function SkeletonHeatmap() {
  return (
    <div className={cn(SURFACE_CLASS, 'p-6 space-y-3')}>
      <div className="h-5 w-56 animate-pulse rounded bg-gray-100 dark:bg-gray-700" />
      <div className="mt-5 grid gap-1" style={{ gridTemplateColumns: 'auto repeat(24, minmax(0, 1fr))' }}>
        {Array.from({ length: 7 }).map((_, r) => (
          <>
            <div key={`lbl-${r}`} className="h-6 w-8 animate-pulse rounded bg-gray-100 dark:bg-gray-700" />
            {Array.from({ length: 24 }).map((_, c) => (
              <div key={`c-${r}-${c}`} className="h-6 animate-pulse rounded-sm bg-gray-100 dark:bg-gray-700" />
            ))}
          </>
        ))}
      </div>
    </div>
  )
}

// ── 24-hour bar chart ─────────────────────────────────────────────────────────
/**
 * Collapse a 7×24 weekly grid into a 24-slot hourly average by summing all
 * days for each hour and dividing by how many days had data.
 */
function collapseToHourly(grid: Record<string, number>): Record<string, number> {
  const sums: Record<number, number> = {}
  const counts: Record<number, number> = {}
  for (const [key, val] of Object.entries(grid)) {
    if (val <= 0) continue
    const hour = parseInt(key.split('_')[1], 10)
    if (!Number.isFinite(hour)) continue
    sums[hour] = (sums[hour] ?? 0) + val
    counts[hour] = (counts[hour] ?? 0) + 1
  }
  const result: Record<string, number> = {}
  for (let h = 0; h < 24; h++) {
    result[String(h)] = counts[h] ? Math.round(sums[h] / counts[h]) : 0
  }
  return result
}

function HourlyBars({
  hourlyData,
  accentHex,
  label,
  formatVal,
  unit,
}: {
  hourlyData: Record<string, number>
  accentHex: string
  label: string
  formatVal: (v: number) => string
  unit: string
}) {
  const maxVal = Math.max(...HOURS.map((h) => hourlyData[String(h)] ?? 0), 1)
  const top5 = [...HOURS]
    .sort((a, b) => (hourlyData[String(b)] ?? 0) - (hourlyData[String(a)] ?? 0))
    .slice(0, 5)
  const top5Set = new Set(top5)

  return (
    <div className={cn(SURFACE_CLASS, 'p-5')}>
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Overall hourly pattern</h2>
        <span className="text-[11px] text-gray-400 dark:text-gray-500">All days combined</span>
      </div>
      <p className="mb-5 text-[11px] text-gray-400 dark:text-gray-500">{label}</p>
      <div className="flex items-end gap-0.5" style={{ height: 120 }}>
        {HOURS.map((h) => {
          const val = hourlyData[String(h)] ?? 0
          const heightPct = val / maxVal
          const isPeak = top5Set.has(h)
          // Use the tab accent colour for peak bars, a faded version for others
          const barColor = isPeak ? accentHex : `${accentHex}33`
          return (
            <div key={h} className="group relative flex flex-1 flex-col items-center">
              <div className="pointer-events-none absolute -top-8 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-gray-900 px-2.5 py-1.5 text-center shadow-xl group-hover:block dark:bg-gray-100">
                <p className="text-[11px] font-semibold text-white dark:text-gray-900">{fmtHour(h)}</p>
                <p className="text-[12px] font-bold" style={{ color: accentHex }}>
                  {formatVal(val)} <span className="text-[10px] font-normal text-gray-300 dark:text-gray-500">{unit}</span>
                </p>
              </div>
              <div
                style={{ height: `${Math.max(3, heightPct * 108)}px`, backgroundColor: barColor }}
                className="w-full rounded-t-sm transition-all"
              />
            </div>
          )
        })}
      </div>
      <div className="mt-1 flex">
        {HOURS.map((h) => (
          <div key={h} className="flex-1 text-center">
            {h % 4 === 0 && <span className="text-[9px] text-gray-400 dark:text-gray-500">{fmtHour(h)}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Smart panel (unified recommendation) ────────────────────────────────────────
const SMART_HEX = '#8b5cf6'

function SmartPanel({ smart }: { smart: import('../hooks/useBestTimeData').SmartBestTime }) {
  const [, setLocation] = useLocation()

  if (!smart || !smart.bestSlot) {
    return (
      <EmptyState message="We're still learning your audience. Once you've published a few posts and your audience activity syncs, your personalised best time will appear here." />
    )
  }

  const { bestSlot, bestDay, dailyBest, topSlots, confidence, confidenceLevel, signals, meta, nextOccurrence: nextOcc } = smart

  // Signal chips
  const activeSignals = [
    signals.audience && { label: 'Audience online', hex: '#10b981' },
    signals.engagement && { label: 'Engagement history', hex: '#8b5cf6' },
    signals.reach && { label: 'Reach history', hex: '#3b82f6' },
  ].filter(Boolean) as Array<{ label: string; hex: string }>

  const scheduleBest = () => {
    // Prefer the engine's own forward-scanned next occurrence (accounts for the
    // 5% sensitivity threshold); fall back to a plain next-calendar-occurrence.
    const iso = nextOcc?.date ?? nextOccurrence(bestSlot.dow, bestSlot.hour).toISOString()
    setLocation(`/create?scheduledAt=${encodeURIComponent(iso)}`)
  }

  const nextOccDate = nextOcc ? new Date(nextOcc.date) : null
  const nextOccLabel = nextOccDate ? fmtScheduleDate(nextOccDate) : null

  const maxDay = Math.max(...dailyBest.map((d) => d.dayScore), 1)

  return (
    <div className="space-y-5">
      {/* ── Hero recommendation ─────────────────────────────────────────── */}
      <div className={cn(SURFACE_CLASS, 'overflow-hidden')}>
        <div className="grid gap-0 md:grid-cols-[1.4fr_1fr]">
          {/* Left: the pick */}
          <div className="p-6 md:p-7">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-md" style={{ backgroundColor: `${SMART_HEX}1a` }}>
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke={SMART_HEX} strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </span>
              <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: SMART_HEX }}>
                Your best time to post
              </p>
            </div>

            <div className="mt-3 flex items-end gap-3">
              <h2 className="text-4xl font-black leading-none text-gray-900 dark:text-gray-100">
                {bestSlot.hourLabel}
              </h2>
              <span className="pb-1 text-lg font-semibold text-gray-500 dark:text-gray-400">
                {bestSlot.dayName}
              </span>
            </div>

            <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
              Posting on <span className="font-semibold text-gray-800 dark:text-gray-200">{bestSlot.dayName}</span> around{' '}
              <span className="font-semibold text-gray-800 dark:text-gray-200">{bestSlot.hourLabel}</span> gives you the
              strongest mix of audience presence and proven performance.
            </p>

            {/* Next upcoming opportunity — forward-scanned, not just historical */}
            {nextOccDate && nextOccLabel && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: SMART_HEX }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: SMART_HEX }} />
                Next high-yield window: {nextOccLabel} at {nextOcc!.hourLabel}
              </p>
            )}

            {/* Signal chips */}
            <div className="mt-4 flex flex-wrap gap-2">
              {activeSignals.map((s) => (
                <span
                  key={s.label}
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
                  style={{ backgroundColor: `${s.hex}14`, color: s.hex }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.hex }} />
                  {s.label}
                </span>
              ))}
            </div>

            <button
              onClick={scheduleBest}
              className="mt-5 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 active:scale-[0.98]"
              style={{ backgroundColor: SMART_HEX }}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Schedule a post for {bestSlot.dayName}
            </button>
          </div>

          {/* Right: confidence + best day */}
          <div className="border-t border-gray-100 dark:border-gray-800 bg-gray-50/60 p-6 dark:bg-gray-800/30 md:border-l md:border-t-0">
            {/* Confidence */}
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Confidence</p>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">{confidence}%</span>
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={{ backgroundColor: `${SMART_HEX}14`, color: SMART_HEX }}
              >
                {confidenceLevel}
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div className="h-full rounded-full" style={{ width: `${confidence}%`, backgroundColor: SMART_HEX }} />
            </div>

            {/* Best day */}
            {bestDay && (
              <div className="mt-5">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Best day of the week</p>
                <p className="mt-1 text-lg font-bold text-gray-900 dark:text-gray-100">{bestDay.dayName}</p>
                <p className="text-[12px] text-gray-500 dark:text-gray-400">Peaks around {bestDay.hourLabel}</p>
              </div>
            )}

            {/* Data provenance */}
            <p className="mt-5 text-[11px] text-gray-400 dark:text-gray-500">
              Based on {meta.usablePosts} of {meta.postsAnalyzed} post{meta.postsAnalyzed === 1 ? '' : 's'} analyzed
              {meta.usablePosts < meta.postsAnalyzed ? ' (low-signal posts filtered out)' : ''}
              {meta.audienceSlots > 0 ? ' + live audience activity' : ''}.
            </p>
          </div>
        </div>
      </div>

      {/* ── Best hour per day ────────────────────────────────────────────── */}
      <div className={cn(SURFACE_CLASS, 'p-5')}>
        <h2 className="mb-1 text-sm font-semibold text-gray-800 dark:text-gray-100">Best hour for each day</h2>
        <p className="mb-4 text-[11px] text-gray-400 dark:text-gray-500">
          Bar length shows how strong each day is overall. The time is that day's peak slot.
        </p>
        <div className="space-y-2.5">
          {dailyBest.map((d) => {
            const isBest = bestDay?.dow === d.dow
            return (
              <button
                key={d.dow}
                onClick={() => {
                  const next = nextOccurrence(d.dow, d.hour)
                  setLocation(`/create?scheduledAt=${encodeURIComponent(next.toISOString())}`)
                }}
                className="group flex w-full items-center gap-3 text-left"
              >
                <span className={cn('w-9 shrink-0 text-[12px] font-medium', isBest ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400')}>
                  {DAYS[d.dow]}
                </span>
                <div className="relative h-7 flex-1 overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800">
                  <div
                    className="absolute inset-y-0 left-0 rounded-md transition-all group-hover:opacity-90"
                    style={{ width: `${Math.max(4, (d.dayScore / maxDay) * 100)}%`, backgroundColor: isBest ? SMART_HEX : `${SMART_HEX}55` }}
                  />
                  <span className="absolute inset-y-0 right-2 flex items-center text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                    {d.dayScore > 0 ? d.hourLabel : '—'}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Top slots ────────────────────────────────────────────────────── */}
      {topSlots.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-100">Top times this week</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {topSlots.map((slot, idx) => {
              const next = nextOccurrence(slot.dow, slot.hour)
              const dateLabel = fmtScheduleDate(next)
              return (
                <div key={`${slot.dow}_${slot.hour}`} className={cn(SURFACE_CLASS, 'flex flex-col gap-3 p-4')}>
                  <div className="flex items-center gap-2.5">
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
                      style={{ backgroundColor: idx === 0 ? SMART_HEX : `${SMART_HEX}${idx === 1 ? 'cc' : '88'}` }}
                    >
                      {idx + 1}
                    </span>
                    <div>
                      <p className="text-sm font-semibold leading-tight text-gray-800 dark:text-gray-100">
                        {slot.dayName.slice(0, 3)} · {slot.hourLabel}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-tight text-gray-400 dark:text-gray-500">
                        Score {slot.score}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setLocation(`/create?scheduledAt=${encodeURIComponent(next.toISOString())}`)}
                    className="mt-auto flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 active:scale-[0.98]"
                    style={{ backgroundColor: SMART_HEX }}
                  >
                    Schedule {dateLabel}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Combined heatmap ─────────────────────────────────────────────── */}
      {Object.keys(smart.combinedGrid).length > 0 && (
        <div className={cn(SURFACE_CLASS, 'p-5')}>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Combined opportunity heatmap</h2>
            <span className="text-[11px] text-gray-400 dark:text-gray-500">Darker = better time · hover for details</span>
          </div>
          <Heatmap grid={smart.combinedGrid} hex={SMART_HEX} unit="score" formatVal={(v) => String(v)} />
        </div>
      )}
    </div>
  )
}

// ── main page ──────────────────────────────────────────────────────────────────
function BestTimePageInner() {
  const { breadcrumbs } = useAnalyticsActiveRoute()
  const { currentWorkspace } = useCurrentWorkspace()
  // Use optional platform filter — safe when rendered outside PlatformFilterProvider
  // (e.g. in Storybook / tests). Falls back to 'all' when context is absent.
  const platformFilter = useOptionalPlatformFilter()
  const platformSelection = platformFilter?.selection ?? 'all'
  const { data, isLoading } = useBestTimeData({ platforms: platformSelection })
  const [activeTab, setActiveTab] = useState<TabId>('smart')

  if (isLoading) {
    return (
      <AnalyticsPageContainer
        title="Best Time to Post"
        description="Discover when to post for maximum impact."
        breadcrumbs={breadcrumbs}
        workspaceName={currentWorkspace?.name}
      >
        <div className="space-y-4">
          <div className="flex gap-2">
            {TABS.map((t) => (
              <div key={t.id} className="h-9 w-32 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700" />
            ))}
          </div>
          <SkeletonHeatmap />
        </div>
      </AnalyticsPageContainer>
    )
  }

  const tab = TABS.find((t) => t.id === activeTab)!

  const grid =
    activeTab === 'reach'
      ? (data?.weeklyGrid ?? {})
      : activeTab === 'visibility'
        ? (data?.reachGrid ?? {})
        : (data?.engGrid ?? {})

  const slots =
    activeTab === 'reach'
      ? (data?.topDays ?? [])
      : activeTab === 'visibility'
        ? (data?.topReachSlots ?? [])
        : (data?.topEngSlots ?? [])

  const formatVal = activeTab === 'engagement'
    ? (v: number) => `${v}%`
    : (v: number) => v.toLocaleString()

  const noAudienceData = !data?.hasData
  const noPostData = !data?.hasPostData
  const tabHasData = activeTab === 'reach'
    ? !noAudienceData
    : !noPostData && Object.keys(grid).length > 0

  return (
    <AnalyticsPageContainer
      title="Best Time to Post"
      description="Find the best windows to post — based on your real audience and post history."
      breadcrumbs={breadcrumbs}
      workspaceName={currentWorkspace?.name}
    >
      <div className="space-y-5">
        {/* ── Tab bar ──────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                activeTab === t.id
                  ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Goal banner (non-smart tabs only) ────────────────────────── */}
        {activeTab !== 'smart' && (
          <div className={cn(SURFACE_CLASS, 'px-5 py-4')}>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Goal</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-800 dark:text-gray-100">{tab.goal}</p>
            <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400">{tab.desc}</p>
          </div>
        )}

        {/* ── SMART tab: unified recommendation ────────────────────────── */}
        {activeTab === 'smart' && <SmartPanel smart={data!.smart} />}

        {/* ── Heatmap card (reach / visibility / engagement) ───────────── */}
        {activeTab !== 'smart' && (!tabHasData ? (
          <EmptyState
            message={
              activeTab === 'reach'
                ? 'Audience activity data is collecting. Reconnect your Instagram account to populate this.'
                : 'Not enough post history yet. This chart will fill in as you publish more content.'
            }
          />
        ) : (
          <div className={cn(SURFACE_CLASS, 'p-5')}>
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                {tab.metric} — last 30 days
              </h2>
              <span className="text-[11px] text-gray-400 dark:text-gray-500">
                Local time · hover for details
              </span>
            </div>
            <Heatmap
              grid={grid}
              hex={tab.accentHex}
              unit={tab.unit}
              formatVal={formatVal}
            />
          </div>
        ))}

        {/* ── Top slots ────────────────────────────────────────────────── */}
        {activeTab !== 'smart' && tabHasData && slots.length > 0 && (
          <div>
            <h2 className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-100">
              Best days and times to post
            </h2>
            <TopSlotCards
              slots={slots}
              unit={tab.unit}
              accentClass={tab.accentClass}
              accentHex={tab.accentHex}
              formatVal={formatVal}
            />
          </div>
        )}

        {/* ── 24h bar chart ───────────────────────────────────────────── */}
        {activeTab !== 'smart' && tabHasData && (
          <HourlyBars
            hourlyData={
              activeTab === 'reach'
                ? (data?.activeTime ?? {})
                : collapseToHourly(grid)
            }
            accentHex={tab.accentHex}
            label={
              activeTab === 'reach'
                ? 'Average follower activity collapsed across all days of the week.'
                : activeTab === 'visibility'
                  ? 'Average post impressions per hour, collapsed across all days.'
                  : 'Average engagement rate per hour, collapsed across all days.'
            }
            formatVal={formatVal}
            unit={tab.unit}
          />
        )}
      </div>
    </AnalyticsPageContainer>
  )
}

/**
 * Public export — wraps BestTimePageInner with PlatformFilterProvider so that
 * the platform selection propagates into useBestTimeData.
 * Requirements: 6.1, 6.2, 6.4
 */
export function BestTimePage() {
  return (
    <PlatformFilterProvider>
      <BestTimePageInner />
    </PlatformFilterProvider>
  )
}
