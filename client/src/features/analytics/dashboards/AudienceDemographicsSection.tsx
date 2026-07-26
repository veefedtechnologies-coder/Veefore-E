/**
 * AudienceDemographicsSection
 *
 * Layout:
 *   Row 1: [By Country] [By City/State]   (2-col)
 *   Row 2: [Gender & Age — one card, two labelled sections]  (full-width)
 */

import { cn } from '@/lib/utils'
import { SURFACE_CLASS } from '../design-system/tokens'
import type { AudienceDemographicsWidgetData, GenderAgeSlice } from './contracts'

interface Props {
  data: AudienceDemographicsWidgetData
  state?: 'ready' | 'loading' | 'empty'
  className?: string
}

// ── 24-hour heatmap ──────────────────────────────────────────────────────────
function ActiveTimeHeatmap({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).filter(([, v]) => v > 0)
  if (entries.length === 0) return null
  const maxVal = Math.max(...Object.values(data))

  const hours = Array.from({ length: 24 }, (_, i) => i)
  const label = (h: number) => {
    if (h === 0) return '12am'
    if (h < 12) return `${h}am`
    if (h === 12) return '12pm'
    return `${h - 12}pm`
  }

  return (
    <div className={cn(SURFACE_CLASS, 'p-5')}>
      <h3 className="mb-1 text-sm font-semibold text-gray-800 dark:text-gray-100">
        Most active hours
      </h3>
      <p className="mb-4 text-[11px] text-gray-400 dark:text-gray-500">
        When your audience is online (local time)
      </p>

      {/* Hour cells */}
      <div className="flex items-end gap-1">
        {hours.map((h) => {
          const val = data[String(h)] ?? 0
          const intensity = maxVal > 0 ? val / maxVal : 0
          // emerald gradient: faint → full
          const opacity = Math.max(0.08, intensity)
          return (
            <div key={h} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-sm"
                style={{
                  height: Math.max(6, Math.round(intensity * 48)),
                  backgroundColor: `rgba(16,185,129,${opacity})`,
                  transition: 'height 0.3s',
                }}
                title={`${label(h)}: ${val}`}
              />
              {h % 4 === 0 && (
                <span className="text-[9px] text-gray-400 dark:text-gray-500">{label(h)}</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Peak hours callout */}
      {(() => {
        const sorted = [...hours].sort((a, b) => (data[String(b)] ?? 0) - (data[String(a)] ?? 0))
        const top3 = sorted.slice(0, 3).sort((a, b) => a - b)
        return top3.length > 0 ? (
          <p className="mt-3 text-[11px] text-gray-400 dark:text-gray-500">
            Peak hours:{' '}
            <span className="font-medium text-emerald-600 dark:text-emerald-400">
              {top3.map(label).join(', ')}
            </span>
          </p>
        ) : null
      })()}
    </div>
  )
}

// ── Shared bar row ────────────────────────────────────────────────────────────
function BarRow({ label, value, pct, fill }: { label: string; value: number; pct: number; fill: string }) {
  return (
    <div className="flex items-center gap-2 py-[3px]">
      <span className="w-32 shrink-0 truncate text-[11px] text-gray-500 dark:text-gray-400" title={label}>
        {label}
      </span>
      <div className="relative flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700/60" style={{ height: 8 }}>
        <div style={{ width: `${pct}%`, backgroundColor: fill, height: '100%', borderRadius: 999 }} />
      </div>
      <span className="w-8 shrink-0 text-right text-[11px] font-semibold tabular-nums text-gray-700 dark:text-gray-200">
        {Math.round(pct)}%
      </span>
      <span className="w-6 shrink-0 text-right text-[10px] tabular-nums text-gray-400 dark:text-gray-500">
        {value}
      </span>
    </div>
  )
}

// ── Panel wrapper ─────────────────────────────────────────────────────────────
function Panel({ title, note, children, className }: {
  title: string; note?: string; children: React.ReactNode; className?: string
}) {
  return (
    <div className={cn(SURFACE_CLASS, 'p-5', className)}>
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
        {note && <span className="text-[11px] text-gray-400 dark:text-gray-500">{note}</span>}
      </div>
      {children}
    </div>
  )
}

// ── Section heading inside a card ─────────────────────────────────────────────
function SectionHeading({ label }: { label: string }) {
  return (
    <div className="mb-3 mt-6 flex items-center gap-2 first:mt-0">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {label}
      </span>
      <div className="flex-1 border-t border-gray-100 dark:border-gray-700/60" />
    </div>
  )
}

// ── Gender + Age combined card ────────────────────────────────────────────────
function GenderAgeCard({ slices }: { slices: GenderAgeSlice[] }) {
  const total = slices.reduce((s, r) => s + r.value, 0)
  if (total === 0) return null

  // ── Gender section ──
  const genders = [
    { key: 'F', label: 'Female',  fill: '#e879f9' },
    { key: 'M', label: 'Male',    fill: '#38bdf8' },
    { key: 'U', label: 'Unknown', fill: '#94a3b8' },
  ]
  const genderRows = genders.map(({ key, label, fill }) => ({
    label, fill,
    value: slices.filter((s) => s.gender === key).reduce((s, r) => s + r.value, 0),
  })).filter((g) => g.value > 0)

  // ── Age section ──
  const ageRanges = [...new Set(slices.map((s) => s.ageRange))].sort(
    (a, b) => parseInt(a) - parseInt(b)
  )
  const ageFills = ['#818cf8', '#6366f1', '#06b6d4', '#0891b2', '#0e7490', '#155e75', '#134e4a']

  return (
    <div className={cn(SURFACE_CLASS, 'p-5')}>
      {/* Gender sub-section */}
      <SectionHeading label="Gender" />

      {/* Stacked gender overview bar */}
      <div className="mb-4 flex h-4 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700/60">
        {genderRows.map((g) => (
          <div
            key={g.label}
            style={{ width: `${(g.value / total) * 100}%`, backgroundColor: g.fill, height: '100%' }}
            title={`${g.label}: ${Math.round((g.value / total) * 100)}%`}
          />
        ))}
      </div>

      <div className="grid gap-x-8 sm:grid-cols-2">
        <div>
          {genderRows.map((g) => (
            <BarRow key={g.label} label={g.label} value={g.value} pct={(g.value / total) * 100} fill={g.fill} />
          ))}
        </div>
        {/* Legend */}
        <div className="flex flex-wrap items-start gap-3 pt-1">
          {genderRows.map((g) => (
            <span key={g.label} className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: g.fill }} />
              {g.label}
            </span>
          ))}
        </div>
      </div>

      {/* Age sub-section */}
      <SectionHeading label="Age" />

      <div className="grid gap-x-8 sm:grid-cols-2">
        <div>
          {ageRanges.map((age, idx) => {
            const value = slices.filter((s) => s.ageRange === age).reduce((s, r) => s + r.value, 0)
            if (value === 0) return null
            return (
              <BarRow
                key={age} label={age} value={value}
                pct={(value / total) * 100}
                fill={ageFills[idx % ageFills.length]}
              />
            )
          })}
        </div>

        {/* Mini gender-per-age stacked bars */}
        <div className="space-y-2">
          {ageRanges.map((age) => {
            const f = slices.find((s) => s.gender === 'F' && s.ageRange === age)?.value ?? 0
            const m = slices.find((s) => s.gender === 'M' && s.ageRange === age)?.value ?? 0
            const u = slices.find((s) => s.gender === 'U' && s.ageRange === age)?.value ?? 0
            const rowTotal = f + m + u
            if (rowTotal === 0) return null
            return (
              <div key={age}>
                <div className="mb-0.5 flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400">
                  <span>{age}</span>
                  <span className="text-[9px] text-gray-400">
                    {f > 0 ? `F ${Math.round((f/rowTotal)*100)}%` : ''}{f > 0 && m > 0 ? ' · ' : ''}
                    {m > 0 ? `M ${Math.round((m/rowTotal)*100)}%` : ''}
                  </span>
                </div>
                <div className="flex h-4 overflow-hidden rounded-md bg-gray-100 dark:bg-gray-700/60">
                  {f > 0 && <div style={{ width: `${(f/rowTotal)*100}%`, backgroundColor: '#e879f9', height: '100%' }} />}
                  {m > 0 && <div style={{ width: `${(m/rowTotal)*100}%`, backgroundColor: '#38bdf8', height: '100%' }} />}
                  {u > 0 && <div style={{ width: `${(u/rowTotal)*100}%`, backgroundColor: '#94a3b8', height: '100%' }} />}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export function AudienceDemographicsSection({ data, state, className }: Props) {
  if (state === 'loading') {
    return (
      <div className={cn('space-y-4', className)}>
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2].map((i) => <div key={i} className={cn(SURFACE_CLASS, 'h-56 animate-pulse')} />)}
        </div>
        <div className={cn(SURFACE_CLASS, 'h-72 animate-pulse')} />
      </div>
    )
  }

  const { country, city, genderAge } = data
  const hasCountry   = country.length > 0
  const hasCity      = city.length > 0
  const hasGenderAge = genderAge.length > 0

  if (!hasCountry && !hasCity && !hasGenderAge) {
    return (
      <div className={cn(SURFACE_CLASS, 'p-8 text-center text-sm text-gray-400 dark:text-gray-500', className)}>
        Audience demographic data isn't available yet — it will appear after the next account sync.
      </div>
    )
  }

  const countryTotal = country.reduce((s, r) => s + r.value, 0)
  const cityTotal    = city.reduce((s, r) => s + r.value, 0)

  return (
    <div className={cn('space-y-4', className)}>
      {/* Row 1: Country + City */}
      {(hasCountry || hasCity) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {hasCountry && (
            <Panel title="By country" note={`Top ${country.length}`}>
              {country.map((s) => (
                <BarRow key={s.label} label={s.label} value={s.value}
                  pct={(s.value / countryTotal) * 100} fill="#38bdf8" />
              ))}
            </Panel>
          )}
          {hasCity && (
            <Panel title="By city / state" note={`Top ${Math.min(city.length, 10)}`}>
              {city.slice(0, 10).map((s) => (
                <BarRow key={s.label} label={s.label} value={s.value}
                  pct={(s.value / cityTotal) * 100} fill="#a78bfa" />
              ))}
            </Panel>
          )}
        </div>
      )}

      {/* Row 2: Gender & Age — one card, two labelled sections */}
      {hasGenderAge && <GenderAgeCard slices={genderAge} />}

      {/* Row 3: Active time heatmap — only when Meta provides data */}
      {data.activeTime && Object.values(data.activeTime).some((v) => v > 0) && (
        <ActiveTimeHeatmap data={data.activeTime} />
      )}
    </div>
  )
}
