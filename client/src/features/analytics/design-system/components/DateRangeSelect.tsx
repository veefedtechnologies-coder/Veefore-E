/**
 * DateRangeSelect — calendar-based date-range picker for the global filter bar
 * (03-design-system.md Ch 3), modelled on Hootsuite's picker.
 *
 * A trigger button opens a popover with three parts:
 *   1. Predefined ranges (to-date, previous period, rolling windows).
 *   2. A dual-month calendar for choosing an arbitrary custom range (which
 *      switches the active preset to `custom`).
 *   3. A comparison selector (none / previous period / custom) so KPIs render
 *      genuine period-over-period deltas.
 *
 * Fully self-contained (no calendar dependency): the grid and range-selection
 * logic are implemented here so we add no new packages.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import useSubscription from '@/hooks/useSubscription'

import {
  DATE_RANGE_OPTIONS,
  type ComparisonConfig,
  type ComparisonMode,
  type DateRangePreset,
} from '../dateRanges'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Worst-case span (in days from today) each preset can reach back to. Used to
 * hide presets that exceed the plan's analytics history window. `custom` is
 * always offered but its calendar is bounded by the plan's earliest date.
 */
const PRESET_MAX_DAYS: Partial<Record<DateRangePreset, number>> = {
  today: 1,
  yesterday: 2,
  last_7d: 7,
  last_30d: 30,
  last_90d: 90,
  last_12m: 365,
  month_to_date: 31,
  quarter_to_date: 92,
  year_to_date: 366,
  last_month: 62,
  last_quarter: 184,
  last_year: 730,
}

/** A user-picked custom window as `yyyy-mm-dd` strings (local calendar dates). */
export interface CustomDateRange {
  from?: string
  to?: string
}

interface DateRangeSelectProps {
  value: DateRangePreset
  onChange: (value: DateRangePreset) => void
  /** Current custom range (used when `value === 'custom'`). */
  customRange?: CustomDateRange
  /** Called when the user edits the custom from/to range on the calendar. */
  onCustomRangeChange?: (range: CustomDateRange) => void
  /** Current comparison configuration. */
  comparison?: ComparisonConfig
  /** Called when the user changes comparison mode or its custom range. */
  onComparisonChange?: (comparison: ComparisonConfig) => void
  className?: string
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** `yyyy-mm-dd` from a Date using its local calendar fields. */
function toYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Parse a `yyyy-mm-dd` string into a local Date (midnight), or null. */
function fromYmd(s?: string): Date | null {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

/** Human label like "Jun 1, 2024". */
function fmt(s?: string): string {
  const d = fromYmd(s)
  if (!d) return ''
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`
}

/** All day-cells (including leading/trailing blanks) for a month grid. */
function monthGrid(year: number, month: number): Array<Date | null> {
  const first = new Date(year, month, 1)
  const startDow = first.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: Array<Date | null> = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

interface MonthProps {
  year: number
  month: number
  from: Date | null
  to: Date | null
  max: Date
  /** Earliest selectable date (plan history limit). Older cells are disabled. */
  min?: Date
  onPick: (d: Date) => void
}

/** A single month grid with in-range highlighting. */
function MonthCalendar({ year, month, from, to, max, min, onPick }: MonthProps) {
  const cells = useMemo(() => monthGrid(year, month), [year, month])
  const inRange = (d: Date) => from && to && d >= from && d <= to
  const isEnd = (d: Date) => (from && d.getTime() === from.getTime()) || (to && d.getTime() === to.getTime())

  return (
    <div className="w-56">
      <div className="mb-2 text-center text-sm font-medium text-gray-900 dark:text-gray-100">
        {MONTHS[month]} {year}
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] text-gray-400">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />
          const disabled = d > max || (min ? d < min : false)
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => onPick(d)}
              className={cn(
                'flex h-8 items-center justify-center rounded text-sm',
                disabled
                  ? 'cursor-not-allowed text-gray-300 dark:text-gray-600'
                  : 'text-gray-700 hover:bg-blue-100 dark:text-gray-200 dark:hover:bg-blue-900/40',
                inRange(d) && 'bg-blue-50 dark:bg-blue-900/30',
                isEnd(d) && 'bg-blue-600 font-semibold text-white hover:bg-blue-600 dark:bg-blue-500'
              )}
              aria-label={toYmd(d)}
            >
              {d.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const COMPARISON_LABEL: Record<ComparisonMode, string> = {
  none: 'No comparison',
  previous: 'Previous period',
  custom: 'Custom period',
}

export function DateRangeSelect({
  value,
  onChange,
  customRange,
  onCustomRangeChange,
  comparison = { mode: 'previous' },
  onComparisonChange,
  className,
}: DateRangeSelectProps) {
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<'primary' | 'comparison'>('primary')
  const today = useMemo(() => new Date(), [])
  const [view, setView] = useState(() => new Date(today.getFullYear(), today.getMonth() - 1, 1))
  const rootRef = useRef<HTMLDivElement>(null)

  // Plan-driven analytics history cap. limits.analyticsHistoryDays: -1 =
  // unlimited (Enterprise); a positive number caps how far back a user may look.
  const { limits } = useSubscription()
  const maxHistoryDays = limits?.analyticsHistoryDays
  const capped = typeof maxHistoryDays === 'number' && maxHistoryDays > 0
  const minDate = useMemo(
    () => (capped ? new Date(today.getTime() - (maxHistoryDays as number) * DAY_MS) : undefined),
    [capped, maxHistoryDays, today]
  )

  // Presets available under the current plan (custom is always offered but its
  // calendar is bounded by minDate).
  const availableOptions = useMemo(() => {
    if (!capped) return DATE_RANGE_OPTIONS
    return DATE_RANGE_OPTIONS.filter(
      (o) => o.value === 'custom' || (PRESET_MAX_DAYS[o.value as DateRangePreset] ?? Infinity) <= (maxHistoryDays as number)
    )
  }, [capped, maxHistoryDays])

  // The largest rolling preset that still fits the plan — used to auto-correct
  // a selection that exceeds the plan (e.g. after a downgrade or a deep link).
  const largestAllowedPreset = useMemo<DateRangePreset>(() => {
    const rolling: DateRangePreset[] = ['last_12m', 'last_90d', 'last_30d', 'last_7d', 'today']
    if (!capped) return 'last_30d'
    return rolling.find((p) => (PRESET_MAX_DAYS[p] ?? Infinity) <= (maxHistoryDays as number)) ?? 'today'
  }, [capped, maxHistoryDays])

  // If the current preset exceeds the plan, snap it back to the largest allowed.
  useEffect(() => {
    if (!capped || value === 'custom') return
    const span = PRESET_MAX_DAYS[value] ?? Infinity
    if (span > (maxHistoryDays as number)) {
      onChange(largestAllowedPreset)
    }
  }, [capped, value, maxHistoryDays, largestAllowedPreset, onChange])

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const presetLabel = DATE_RANGE_OPTIONS.find((o) => o.value === value)?.label ?? 'Date range'
  const triggerLabel =
    value === 'custom' && customRange?.from && customRange?.to
      ? `${fmt(customRange.from)} – ${fmt(customRange.to)}`
      : presetLabel

  const comparisonSummary =
    comparison.mode === 'none'
      ? null
      : comparison.mode === 'custom' && comparison.custom?.from && comparison.custom?.to
        ? `vs ${fmt(comparison.custom.from)} – ${fmt(comparison.custom.to)}`
        : 'vs previous period'

  // Active target window (for calendar highlighting).
  const activeWindow = target === 'primary' ? customRange : comparison.custom
  const from = fromYmd(activeWindow?.from)
  const to = fromYmd(activeWindow?.to)

  const pick = (d: Date) => {
    // Never allow a custom pick older than the plan's earliest date.
    if (minDate && d < minDate) return
    const ymd = toYmd(d)
    const cur = target === 'primary' ? customRange : comparison.custom
    // Start a new selection when empty or already complete.
    let next: CustomDateRange
    if (!cur?.from || (cur.from && cur.to)) {
      next = { from: ymd, to: undefined }
    } else if (ymd < cur.from) {
      next = { from: ymd, to: cur.from }
    } else {
      next = { from: cur.from, to: ymd }
    }

    if (target === 'primary') {
      onChange('custom')
      onCustomRangeChange?.(next)
    } else {
      onComparisonChange?.({ mode: 'custom', custom: next })
    }
  }

  const selectPreset = (preset: DateRangePreset) => {
    setTarget('primary')
    onChange(preset)
    if (preset !== 'custom') setOpen(false)
  }

  const setComparisonMode = (mode: ComparisonMode) => {
    if (mode === 'custom') setTarget('comparison')
    else setTarget('primary')
    onComparisonChange?.({ mode, custom: comparison.custom })
  }

  const rightMonth = new Date(view.getFullYear(), view.getMonth() + 1, 1)

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900',
          'hover:border-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500',
          'dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <CalendarDays className="h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
        <span className="whitespace-nowrap">{triggerLabel}</span>
        {comparisonSummary && (
          <span className="whitespace-nowrap text-xs text-gray-400">{comparisonSummary}</span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Select date range"
          className={cn(
            'absolute left-0 z-50 mt-2 flex rounded-lg border border-gray-200 bg-white shadow-xl',
            'dark:border-gray-700 dark:bg-gray-900'
          )}
        >
          {/* Preset list */}
          <ul className="w-40 flex-shrink-0 border-r border-gray-100 py-2 dark:border-gray-800">
            {availableOptions.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => selectPreset(o.value as DateRangePreset)}
                  className={cn(
                    'block w-full px-4 py-1.5 text-left text-sm',
                    value === o.value
                      ? 'bg-blue-50 font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                      : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800'
                  )}
                >
                  {o.label}
                </button>
              </li>
            ))}
            {capped && (
              <li className="px-4 pt-2 mt-1 border-t border-gray-100 dark:border-gray-800">
                <p className="text-[11px] leading-snug text-gray-400">
                  Your plan includes {maxHistoryDays} days of history.{' '}
                  <a href="/settings/billing" className="text-blue-600 dark:text-blue-400 hover:underline">Upgrade</a> for more.
                </p>
              </li>
            )}
          </ul>

          {/* Calendar + comparison */}
          <div className="p-4">
            {/* Editing-target toggle */}
            <div className="mb-3 flex items-center gap-2 text-xs">
              <span className="text-gray-400">Editing:</span>
              <button
                type="button"
                onClick={() => setTarget('primary')}
                className={cn(
                  'rounded px-2 py-1',
                  target === 'primary'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                )}
              >
                Range
              </button>
              <button
                type="button"
                disabled={comparison.mode !== 'custom'}
                onClick={() => setTarget('comparison')}
                className={cn(
                  'rounded px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40',
                  target === 'comparison'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                )}
              >
                Comparison
              </button>
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
                className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
                className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-2 flex gap-4">
              <MonthCalendar
                year={view.getFullYear()}
                month={view.getMonth()}
                from={from}
                to={to}
                max={today}
                min={minDate}
                onPick={pick}
              />
              <MonthCalendar
                year={rightMonth.getFullYear()}
                month={rightMonth.getMonth()}
                from={from}
                to={to}
                max={today}
                min={minDate}
                onPick={pick}
              />
            </div>

            {/* Comparison selector */}
            <div className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-800">
              <div className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">Compare to</div>
              <div className="flex gap-2">
                {(['none', 'previous', 'custom'] as ComparisonMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setComparisonMode(m)}
                    className={cn(
                      'rounded-md border px-3 py-1.5 text-sm',
                      comparison.mode === m
                        ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-900/30 dark:text-blue-300'
                        : 'border-gray-300 text-gray-600 hover:border-gray-400 dark:border-gray-600 dark:text-gray-300'
                    )}
                  >
                    {COMPARISON_LABEL[m]}
                  </button>
                ))}
              </div>
              {comparison.mode === 'custom' && (
                <p className="mt-2 text-xs text-gray-400">
                  Switch “Editing” to <span className="font-medium">Comparison</span> and pick the range on the
                  calendar.
                </p>
              )}
            </div>

            {/* Hootsuite-style retention note when range > 24 months */}
            {value === 'custom' && customRange?.from && new Date(customRange.from) < new Date(today.getTime() - 730 * 24 * 60 * 60 * 1000) && (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                <svg className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span>Selecting data older than <strong>24 months</strong> may slow loading and limit comparison data, depending on how long your account has been connected.</span>
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
