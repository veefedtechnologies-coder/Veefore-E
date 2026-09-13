/**
 * AnswerChart — premium, animated charts inside a VeeGPT answer.
 *
 * VeeGPT emits a fenced ```chart block containing JSON and we render it as a
 * polished Recharts visual (bar / line / area / pie) with gradient fills,
 * rounded geometry, a custom card tooltip and humanized ticks.
 *
 * Deliberately UNANIMATED. Streaming re-renders the message on every chunk and
 * remounts this component, so any entrance/draw animation replays from zero over
 * and over and reads as juddering. Instead the `pre` renderer in ChatInterface
 * holds a placeholder of the same height until the fenced block is complete, so
 * the finished chart drops straight into space already reserved for it.
 *
 * Expected JSON (all optional except `type` + `data`):
 * {
 *   "type": "bar" | "line" | "area" | "pie",
 *   "title": "Reach by format",
 *   "subtitle": "Last 30 days · estimated",
 *   "xKey": "name",
 *   "series": [{ "key": "reach", "label": "Reach" }],
 *   "data": [{ "name": "Reels", "reach": 12000 }]
 * }
 */

import React from 'react'
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { parseSpecJson } from './parseSpecJson'

// Brand-forward palette (blue-led, with distinct, calm accents).
const PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16']

// First-paint size for ResponsiveContainer, so the SVG is drawn immediately
// instead of after the ResizeObserver's first callback (a blank flash frame).
// The real width is applied on the same frame the observer reports it.
const INITIAL_DIM = { width: 640, height: 260 }

type Series = { key: string; label?: string; color?: string }

export interface ChartSpec {
  type?: 'bar' | 'line' | 'area' | 'pie'
  title?: string
  subtitle?: string
  xKey?: string
  series?: Array<string | Series>
  data?: Array<Record<string, any>>
}

/** Chart-type synonyms the model reaches for; all map onto a type we render. */
const TYPE_ALIASES: Record<string, ChartSpec['type']> = {
  bar: 'bar', column: 'bar', bars: 'bar', histogram: 'bar',
  line: 'line', lines: 'line', trend: 'line',
  area: 'area', areas: 'area',
  pie: 'pie', donut: 'pie', doughnut: 'pie', share: 'pie', split: 'pie',
}

/**
 * Parse the fenced block's JSON into a renderable spec.
 *
 * Deliberately tolerant: the model writes this JSON freehand, so we accept the
 * common shape variations (type synonyms, `rows`/`values` instead of `data`,
 * `labels` + `values` arrays, `series: [{ name, data }]`) rather than dropping
 * the visual. Returns null ONLY when there is genuinely nothing to draw — which
 * is also the "still streaming, JSON incomplete" case.
 */
/**
 * Cache keyed on the raw block text.
 *
 * Two reasons, both load-bearing:
 *  1. No re-parsing on repeat renders.
 *  2. REFERENTIAL STABILITY — the same raw text yields the same spec OBJECT, so
 *     React.memo's shallow compare on <AnswerChart spec={...}/> actually holds
 *     and Recharts is never asked to redraw for an identical spec.
 */
const chartCache = new Map<string, ChartSpec | null>()

export function parseChartSpec(raw: string): ChartSpec | null {
  const key = (raw || '').trim()
  if (chartCache.has(key)) return chartCache.get(key)!
  const result = buildChartSpec(key)
  if (chartCache.size > 300) chartCache.clear()
  chartCache.set(key, result)
  return result
}

function buildChartSpec(raw: string): ChartSpec | null {
  const spec: any = parseSpecJson(raw)
  if (!spec || typeof spec !== 'object') return null

  spec.type = TYPE_ALIASES[String(spec.type || '').toLowerCase()] || 'bar'

  // `data` under another name.
  if (!Array.isArray(spec.data)) {
    for (const alt of ['rows', 'items', 'dataset', 'points']) {
      if (Array.isArray(spec[alt])) {
        spec.data = spec[alt]
        break
      }
    }
  }

  // Chart.js-style `labels` + `values` / `datasets`.
  if (!Array.isArray(spec.data) && Array.isArray(spec.labels)) {
    const key = spec.xKey || 'name'
    const datasets = Array.isArray(spec.datasets) ? spec.datasets : null
    if (datasets?.length) {
      spec.data = spec.labels.map((l: any, i: number) => {
        const row: any = { [key]: l }
        datasets.forEach((ds: any, di: number) => {
          row[ds.label || ds.key || `series${di + 1}`] = Number(ds.data?.[i])
        })
        return row
      })
      spec.series = datasets.map((ds: any, di: number) => ({
        key: ds.label || ds.key || `series${di + 1}`,
      }))
    } else if (Array.isArray(spec.values)) {
      spec.data = spec.labels.map((l: any, i: number) => ({
        [key]: l,
        value: Number(spec.values[i]),
      }))
      spec.series = [{ key: 'value' }]
    }
    spec.xKey = key
  }

  // `series: [{ name, data: [...] }]` (ApexCharts style) → row-per-category.
  if (Array.isArray(spec.data) && spec.data.length && Array.isArray(spec.series)) {
    const first: any = spec.series[0]
    if (first && typeof first === 'object' && Array.isArray(first.data)) {
      const key = spec.xKey || 'name'
      const cats = spec.data.map((d: any) => (typeof d === 'object' ? d[key] : d))
      spec.data = cats.map((c: any, i: number) => {
        const row: any = { [key]: c }
        spec.series.forEach((s: any, si: number) => {
          row[s.key || s.name || `series${si + 1}`] = Number(s.data?.[i])
        })
        return row
      })
      spec.series = spec.series.map((s: any, si: number) => ({
        key: s.key || s.name || `series${si + 1}`,
        label: s.label || s.name,
      }))
      spec.xKey = key
    }
  }

  if (!Array.isArray(spec.data) || !spec.data.length) return null

  // Rows given as [label, value] pairs or as {label,value} → normalize.
  const key = spec.xKey || 'name'
  spec.data = spec.data.map((row: any) => {
    if (Array.isArray(row)) return { [key]: row[0], value: Number(row[1]) }
    if (row && typeof row === 'object') {
      const out: any = { ...row }
      // Coerce numeric-looking strings so the axes/tooltips work.
      for (const [k, v] of Object.entries(out)) {
        if (k === key) continue
        if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) out[k] = Number(v)
      }
      // A row keyed `label`/`category` instead of the declared xKey.
      if (out[key] == null) {
        for (const alt of ['name', 'label', 'category', 'x']) {
          if (out[alt] != null) {
            out[key] = out[alt]
            break
          }
        }
      }
      return out
    }
    return { [key]: String(row) }
  })
  spec.xKey = key

  // Must end up with at least one numeric field to plot.
  const hasNumber = spec.data.some((r: any) =>
    Object.entries(r).some(([k, v]) => k !== key && typeof v === 'number' && isFinite(v))
  )
  if (!hasNumber) return null

  return spec as ChartSpec
}

/** 12500 → "12.5k" so axes stay readable. */
function fmtTick(v: any): string {
  const n = Number(v)
  if (!isFinite(n)) return String(v ?? '')
  const abs = Math.abs(n)
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1).replace(/\.0$/, '')}B`
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}k`
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100)
}

const CardTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-gray-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur dark:border-white/10 dark:bg-slate-800/95">
      {label != null && label !== '' && (
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {label}
        </div>
      )}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-[12px] text-gray-700 dark:text-gray-200">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: p.color || p.fill || p.payload?.fill }}
          />
          <span className="text-gray-500 dark:text-gray-400">{p.name}</span>
          <span className="ml-auto font-semibold tabular-nums">
            {fmtTick(p.value)}
            {(() => {
              // Pie exposes the slice share either on the item or on its payload.
              const pct = typeof p.percent === 'number' ? p.percent : p.payload?.percent
              return typeof pct === 'number' ? ` · ${Math.round(pct * 100)}%` : null
            })()}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * Each slice's share written just OUTSIDE the ring, so the donut reads without
 * hovering and the artwork itself stays clean. Slices under 3% are skipped —
 * their labels would collide with their neighbours.
 */
function PieSliceLabel(props: any) {
  const { cx, cy, midAngle, outerRadius, percent } = props || {}
  if (![cx, cy, midAngle, outerRadius].every(v => typeof v === 'number')) return null
  if (!percent || percent < 0.03) return null
  const rad = -midAngle * (Math.PI / 180)
  const r = outerRadius + 16
  const x = cx + r * Math.cos(rad)
  const y = cy + r * Math.sin(rad)
  return (
    <text
      x={x}
      y={y}
      textAnchor={Math.abs(Math.cos(rad)) < 0.25 ? 'middle' : x > cx ? 'start' : 'end'}
      dominantBaseline="central"
      // Inline fill (not a Tailwind class) so it renders identically in light and
      // dark mode without depending on `fill-*` utilities being generated.
      fill="#64748b"
      style={{ fontSize: 12, fontWeight: 600 }}
    >
      {`${Math.round(percent * 100)}%`}
    </text>
  )
}

const AnswerChartImpl: React.FC<{ spec: ChartSpec }> = ({ spec }) => {
  const data = spec.data || []
  const xKey = spec.xKey || 'name'
  const type = spec.type || 'bar'

  // Normalize series: explicit list, or infer every numeric field except xKey.
  const series: Series[] = (
    spec.series?.length
      ? spec.series.map(s => (typeof s === 'string' ? { key: s } : s))
      : Object.keys(data[0] || {})
          .filter(k => k !== xKey && typeof (data[0] as any)[k] === 'number')
          .map(k => ({ key: k }))
  ).filter(s => s.key)

  // NOTE: every hook must run before any early return — while a message streams,
  // `data` grows and `series` can go from empty to non-empty between renders. A
  // `return null` placed above this hook would change the hook count mid-life and
  // React would tear down the whole answer subtree ("rendered fewer hooks than
  // expected"), taking the rest of the message with it.
  const gid = React.useMemo(() => `g${Math.random().toString(36).slice(2, 8)}`, [])

  if (!series.length && type !== 'pie') return null

  const colorOf = (s: Series, i: number) => s.color || PALETTE[i % PALETTE.length]
  const tick = { fontSize: 11, fill: 'currentColor', opacity: 0.65 } as const
  const grid = 'currentColor'
  // NO draw animation. Recharts replays it from zero on every remount, and
  // streaming remounts this component on nearly every chunk — which read as
  // constant juddering. The chart is held back until its block is complete
  // (see the `pre` renderer in ChatInterface), so it needs no entrance.
  const anim = { isAnimationActive: false }
  // The tooltip must NOT animate: Recharts tweens its position on every
  // mousemove, which is the "jitter while sliding across the chart" effect.
  const tooltipProps = {
    content: <CardTooltip />,
    isAnimationActive: false,
    wrapperStyle: { outline: 'none', zIndex: 20 },
    // Let it hang outside the plot area vertically instead of being nudged
    // around each frame to stay inside it.
    allowEscapeViewBox: { x: false, y: true },
  } as const
  const showLegend = series.length > 1 || type === 'pie'

  // Pie needs its own numbers: the slice value key, the total (for the centre
  // readout) and each slice's share (for the legend), so the chart is readable
  // without hovering.
  const pieKey =
    series[0]?.key ||
    Object.keys(data[0] || {}).find(k => k !== xKey && typeof (data[0] as any)[k] === 'number') ||
    'value'
  const pieTotal = data.reduce((sum, d) => sum + (Number((d as any)[pieKey]) || 0), 0)
  const pieShare = (d: Record<string, any>) =>
    pieTotal > 0 ? Math.round(((Number(d[pieKey]) || 0) / pieTotal) * 100) : 0
  // Values that already sum to ~100 are percentages; anything else is a raw count.
  const pieIsPercent = pieTotal > 95 && pieTotal < 105

  const defs = (
    <defs>
      {series.map((s, i) => (
        <linearGradient key={s.key} id={`${gid}-${i}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colorOf(s, i)} stopOpacity={type === 'bar' ? 0.95 : 0.35} />
          <stop offset="100%" stopColor={colorOf(s, i)} stopOpacity={type === 'bar' ? 0.55 : 0.02} />
        </linearGradient>
      ))}
    </defs>
  )

  return (
    <figure
      // No `overflow-hidden`: it clipped the tooltip near the card edge, which
      // made Recharts re-position it every mousemove (the hover jitter).
      className="mb-4 mt-2 w-full rounded-2xl border border-gray-200/80 bg-gradient-to-b from-gray-50/60 to-white p-4 shadow-sm dark:border-white/10 dark:from-slate-800/40 dark:to-slate-900/40"
    >
      {(spec.title || spec.subtitle) && (
        <figcaption className="mb-3">
          {spec.title && (
            <div className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{spec.title}</div>
          )}
          {spec.subtitle && (
            <div className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{spec.subtitle}</div>
          )}
        </figcaption>
      )}

      {showLegend && type !== 'pie' && (
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {series.map((s, i) => (
            <span key={s.key + i} className="inline-flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-300">
              <span className="h-2 w-2 rounded-full" style={{ background: colorOf(s, i) }} />
              {s.label || s.key}
            </span>
          ))}
        </div>
      )}

      {type === 'pie' ? (
        // Donut with the share written on each slice, then a legend underneath.
        // NOTE: the chart MUST sit in a plain full-width block. Recharts'
        // ResponsiveContainer measures its parent, and inside a flex row it
        // measures 0 and draws nothing — which is exactly how the donut
        // disappeared when the legend was placed beside it.
        <>
          {/* Taller than the ring needs: the share labels sit outside it, so the
              extra room stops them being clipped at the top and bottom. */}
          <div className="h-[260px] w-full text-gray-400 dark:text-gray-500">
            <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIM}>
              <PieChart margin={{ top: 6, right: 6, bottom: 6, left: 6 }}>
                <Tooltip {...tooltipProps} />
                <Pie
                  data={data}
                  dataKey={pieKey}
                  nameKey={xKey}
                  innerRadius="46%"
                  outerRadius="68%"
                  paddingAngle={2}
                  stroke="none"
                  label={PieSliceLabel}
                  labelLine={false}
                  {...anim}
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Inline list-style reset: `.markdown-content ul` in index.css outranks
              Tailwind's `list-none`, so it would otherwise show stray bullets. */}
          <ul
            className="mt-1 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2"
            style={{ listStyle: 'none', marginLeft: 0, paddingLeft: 0 }}
          >
            {data.map((d, i) => (
              <li
                key={i}
                className="flex items-center gap-2 text-[12.5px]"
                style={{ marginBottom: 0 }}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: PALETTE[i % PALETTE.length] }}
                />
                <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-200">
                  {String((d as any)[xKey] ?? '')}
                </span>
                {!pieIsPercent && (
                  <span className="shrink-0 tabular-nums text-gray-500 dark:text-gray-400">
                    {fmtTick((d as any)[pieKey])}
                  </span>
                )}
                <span className="w-10 shrink-0 text-right font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                  {pieShare(d as any)}%
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
      <div className="h-[260px] w-full text-gray-400 dark:text-gray-500">
        <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIM}>
          {type === 'line' ? (
            <LineChart data={data} margin={{ top: 8, right: 12, left: -14, bottom: 0 }}>
              {defs}
              <CartesianGrid stroke={grid} strokeOpacity={0.14} strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey={xKey} tick={tick} tickLine={false} axisLine={false} dy={6} />
              <YAxis tick={tick} tickLine={false} axisLine={false} tickFormatter={fmtTick} width={44} />
              <Tooltip {...tooltipProps} cursor={{ stroke: 'currentColor', strokeOpacity: 0.15 }} />
              {series.map((s, i) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label || s.key}
                  stroke={colorOf(s, i)}
                  strokeWidth={2.5}
                  dot={{ r: 3, strokeWidth: 2, stroke: '#fff', fill: colorOf(s, i) }}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                  {...anim}
                />
              ))}
            </LineChart>
          ) : type === 'area' ? (
            <AreaChart data={data} margin={{ top: 8, right: 12, left: -14, bottom: 0 }}>
              {defs}
              <CartesianGrid stroke={grid} strokeOpacity={0.14} strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey={xKey} tick={tick} tickLine={false} axisLine={false} dy={6} />
              <YAxis tick={tick} tickLine={false} axisLine={false} tickFormatter={fmtTick} width={44} />
              <Tooltip {...tooltipProps} cursor={{ stroke: 'currentColor', strokeOpacity: 0.15 }} />
              {series.map((s, i) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label || s.key}
                  stroke={colorOf(s, i)}
                  strokeWidth={2.5}
                  fill={`url(#${gid}-${i})`}
                  {...anim}
                />
              ))}
            </AreaChart>
          ) : (
            <BarChart data={data} margin={{ top: 8, right: 12, left: -14, bottom: 0 }} barCategoryGap="28%">
              {defs}
              <CartesianGrid stroke={grid} strokeOpacity={0.14} strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey={xKey} tick={tick} tickLine={false} axisLine={false} dy={6} />
              <YAxis tick={tick} tickLine={false} axisLine={false} tickFormatter={fmtTick} width={44} />
              <Tooltip {...tooltipProps} cursor={{ fill: 'currentColor', fillOpacity: 0.05 }} />
              {series.map((s, i) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label || s.key}
                  fill={`url(#${gid}-${i})`}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={44}
                  {...anim}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      )}
    </figure>
  )
}

/**
 * Memoized: with parseChartSpec's stable spec reference, a re-render of the
 * surrounding message no longer redraws the chart.
 */
export const AnswerChart = React.memo(AnswerChartImpl)
AnswerChart.displayName = 'AnswerChart'

export default AnswerChart
