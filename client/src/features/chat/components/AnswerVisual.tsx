/**
 * AnswerVisual — premium non-chart visual blocks for VeeGPT answers.
 *
 * VeeGPT emits a fenced ```viz block with JSON and we render a polished
 * component. This gives answers the richer "beautiful representation" quality of
 * ChatGPT/Claude beyond plain prose and graphs.
 *
 * Deliberately UNANIMATED — see the note in AnswerChart. Streaming remounts this
 * on nearly every chunk, so entrance animations replay endlessly and judder. The
 * `pre` renderer holds reserved space until the block is complete instead.
 *
 * Supported types:
 *   stats     → KPI cards with optional delta/trend
 *   progress  → labelled progress/score bars
 *   steps     → numbered roadmap / timeline
 *   compare   → side-by-side option columns with pros/cons
 *   checklist → actionable checklist
 */

import React from 'react'
import { TrendingUp, TrendingDown, Minus, Check, X } from 'lucide-react'
import { parseSpecJson } from './parseSpecJson'

type StatItem = { label: string; value: string | number; delta?: string; trend?: 'up' | 'down' | 'flat'; hint?: string }
type ProgressItem = { label: string; value: number; max?: number; note?: string }
type StepItem = { title: string; detail?: string; meta?: string }
type CompareCol = { title: string; subtitle?: string; pros?: string[]; cons?: string[]; points?: string[] }
type CheckItem = { text: string; done?: boolean }

export interface VizSpec {
  type?: 'stats' | 'progress' | 'steps' | 'compare' | 'checklist'
  title?: string
  subtitle?: string
  items?: Array<StatItem | ProgressItem | StepItem | CheckItem>
  columns?: CompareCol[]
}

/** Type synonyms the model reaches for, mapped to the types we actually render. */
const TYPE_ALIASES: Record<string, NonNullable<VizSpec['type']>> = {
  stats: 'stats', stat: 'stats', kpi: 'stats', kpis: 'stats', metrics: 'stats', snapshot: 'stats',
  progress: 'progress', scores: 'progress', score: 'progress', bars: 'progress', gauge: 'progress',
  steps: 'steps', step: 'steps', timeline: 'steps', roadmap: 'steps', plan: 'steps', phases: 'steps',
  compare: 'compare', comparison: 'compare', vs: 'compare', tradeoffs: 'compare',
  checklist: 'checklist', check: 'checklist', todo: 'checklist', todos: 'checklist',
  tasks: 'checklist', actions: 'checklist',
}

/**
 * Parse the fenced block's JSON into a renderable spec.
 *
 * Tolerant on purpose: the model writes this JSON freehand, so we accept type
 * synonyms, `data`/`rows`/`columns` as the item list, plain strings instead of
 * objects, and `items` used where `columns` belongs. Returning null here makes
 * the block invisible, so we only do it when there is genuinely nothing to draw
 * (which is also the "still streaming, JSON incomplete" case).
 */
/** Cache keyed on raw text — see the note in AnswerChart: this also gives the
 *  spec a STABLE reference so React.memo below can short-circuit re-renders. */
const vizCache = new Map<string, VizSpec | null>()

export function parseVizSpec(raw: string): VizSpec | null {
  const key = (raw || '').trim()
  if (vizCache.has(key)) return vizCache.get(key)!
  const result = buildVizSpec(key)
  if (vizCache.size > 300) vizCache.clear()
  vizCache.set(key, result)
  return result
}

function buildVizSpec(raw: string): VizSpec | null {
  const spec: any = parseSpecJson(raw)
  if (!spec || typeof spec !== 'object') return null

  const type = TYPE_ALIASES[String(spec.type || '').toLowerCase()]
  if (!type) return null
  spec.type = type

  // The item list under another name.
  if (!Array.isArray(spec.items)) {
    for (const alt of ['data', 'rows', 'entries', 'list', 'points']) {
      if (Array.isArray(spec[alt])) {
        spec.items = spec[alt]
        break
      }
    }
  }

  if (type === 'compare') {
    // Columns may arrive as `items`, or as an object keyed by option name.
    if (!Array.isArray(spec.columns)) {
      if (Array.isArray(spec.items)) spec.columns = spec.items
      else if (spec.options && typeof spec.options === 'object')
        spec.columns = Object.entries(spec.options).map(([title, v]: any) => ({ title, ...v }))
    }
    if (!Array.isArray(spec.columns) || !spec.columns.length) return null
    spec.columns = spec.columns.map((c: any, i: number) => ({
      ...c,
      title: c?.title || c?.label || c?.name || `Option ${i + 1}`,
    }))
    return spec as VizSpec
  }

  if (!Array.isArray(spec.items) || !spec.items.length) return null

  spec.items = spec.items.map((it: any, i: number) => {
    if (typeof it === 'string' || typeof it === 'number') {
      // A bare string means different things per type.
      if (type === 'checklist') return { text: String(it) }
      if (type === 'steps') return { title: String(it) }
      return { label: String(it), value: it }
    }
    const out: any = { ...it }
    if (type === 'checklist') out.text = out.text || out.label || out.title || `Item ${i + 1}`
    if (type === 'steps') out.title = out.title || out.label || out.name || `Step ${i + 1}`
    if (type === 'stats' || type === 'progress')
      out.label = out.label || out.title || out.name || `Item ${i + 1}`
    if (type === 'progress') {
      const n = Number(String(out.value ?? out.score ?? '').replace('%', ''))
      out.value = isFinite(n) ? n : 0
    }
    return out
  })

  return spec as VizSpec
}

const shell =
  'mb-4 mt-2 w-full rounded-2xl border border-gray-200/80 bg-gradient-to-b from-gray-50/60 to-white p-4 shadow-sm dark:border-white/10 dark:from-slate-800/40 dark:to-slate-900/40'

const Head: React.FC<{ title?: string; subtitle?: string }> = ({ title, subtitle }) =>
  title || subtitle ? (
    <div className="mb-3">
      {title && <div className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{title}</div>}
      {subtitle && <div className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{subtitle}</div>}
    </div>
  ) : null

const trendStyle: Record<string, string> = {
  up: 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40',
  down: 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/40',
  flat: 'text-gray-500 bg-gray-100 dark:text-gray-400 dark:bg-slate-800',
}

const AnswerVisualImpl: React.FC<{ spec: VizSpec }> = ({ spec }) => {
  const { type } = spec

  if (type === 'stats') {
    const items = (spec.items || []) as StatItem[]
    return (
      <figure className={shell}>
        <Head title={spec.title} subtitle={spec.subtitle} />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((it, i) => {
            const t = it.trend || (it.delta?.trim().startsWith('-') ? 'down' : it.delta ? 'up' : 'flat')
            const Icon = t === 'up' ? TrendingUp : t === 'down' ? TrendingDown : Minus
            return (
              <div
                key={i}
                className="rounded-xl border border-gray-200 bg-white p-3 dark:border-white/10 dark:bg-slate-900/50"
              >
                <div className="truncate text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {it.label}
                </div>
                <div className="mt-1 text-[20px] font-bold leading-tight tabular-nums text-gray-900 dark:text-gray-50">
                  {it.value}
                </div>
                {it.delta && (
                  <span className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${trendStyle[t]}`}>
                    <Icon className="h-3 w-3" /> {it.delta}
                  </span>
                )}
                {it.hint && <div className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">{it.hint}</div>}
              </div>
            )
          })}
        </div>
      </figure>
    )
  }

  if (type === 'progress') {
    const items = (spec.items || []) as ProgressItem[]
    return (
      <figure className={shell}>
        <Head title={spec.title} subtitle={spec.subtitle} />
        <div className="space-y-3">
          {items.map((it, i) => {
            const max = it.max && it.max > 0 ? it.max : 100
            const pct = Math.max(0, Math.min(100, (Number(it.value) / max) * 100))
            return (
              <div key={i}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-[12px]">
                  <span className="font-medium text-gray-700 dark:text-gray-200">{it.label}</span>
                  <span className="tabular-nums text-gray-500 dark:text-gray-400">
                    {it.value}
                    {it.max ? ` / ${it.max}` : '%'}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-400"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {it.note && <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{it.note}</div>}
              </div>
            )
          })}
        </div>
      </figure>
    )
  }

  if (type === 'steps') {
    const items = (spec.items || []) as StepItem[]
    return (
      <figure className={shell}>
        <Head title={spec.title} subtitle={spec.subtitle} />
        <ol className="relative space-y-4 before:absolute before:left-[13px] before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-gradient-to-b before:from-blue-300 before:to-transparent dark:before:from-blue-500/40">
          {items.map((it, i) => (
            <li
              key={i}
              className="relative flex gap-3"
            >
              <span className="z-10 flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white shadow-sm ring-4 ring-white dark:ring-slate-900">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[14px] font-semibold text-gray-900 dark:text-gray-100">{it.title}</span>
                  {it.meta && (
                    <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-slate-800 dark:text-gray-400">
                      {it.meta}
                    </span>
                  )}
                </div>
                {it.detail && (
                  <p className="mt-0.5 text-[13px] leading-[1.6] text-gray-600 dark:text-gray-300">{it.detail}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </figure>
    )
  }

  if (type === 'compare') {
    const cols = spec.columns || []
    return (
      <figure className={shell}>
        <Head title={spec.title} subtitle={spec.subtitle} />
        <div className={`grid gap-2.5 ${cols.length >= 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
          {cols.map((c, i) => (
            <div
              key={i}
              className="rounded-xl border border-gray-200 bg-white p-3 dark:border-white/10 dark:bg-slate-900/50"
            >
              <div className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{c.title}</div>
              {c.subtitle && <div className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{c.subtitle}</div>}
              {c.points?.length ? (
                <ul className="mt-2 space-y-1">
                  {c.points.map((p, k) => (
                    <li key={k} className="flex gap-1.5 text-[12.5px] leading-[1.55] text-gray-700 dark:text-gray-300">
                      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-gray-400" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {c.pros?.length ? (
                <ul className="mt-2 space-y-1">
                  {c.pros.map((p, k) => (
                    <li key={k} className="flex gap-1.5 text-[12.5px] leading-[1.55] text-gray-700 dark:text-gray-300">
                      <Check className="mt-[3px] h-3.5 w-3.5 shrink-0 text-emerald-500" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {c.cons?.length ? (
                <ul className="mt-1.5 space-y-1">
                  {c.cons.map((p, k) => (
                    <li key={k} className="flex gap-1.5 text-[12.5px] leading-[1.55] text-gray-700 dark:text-gray-300">
                      <X className="mt-[3px] h-3.5 w-3.5 shrink-0 text-red-400" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      </figure>
    )
  }

  if (type === 'checklist') {
    const items = (spec.items || []) as CheckItem[]
    return (
      <figure className={shell}>
        <Head title={spec.title} subtitle={spec.subtitle} />
        <ul className="space-y-1.5">
          {items.map((it, i) => (
            <li
              key={i}
              className="flex items-start gap-2"
            >
              <span
                className={`mt-[2px] flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  it.done
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : 'border-gray-300 bg-white dark:border-white/20 dark:bg-slate-900'
                }`}
              >
                {it.done && <Check className="h-3 w-3" />}
              </span>
              <span className="text-[14px] leading-[1.6] text-gray-700 dark:text-gray-200">{it.text}</span>
            </li>
          ))}
        </ul>
      </figure>
    )
  }

  return null
}

export const AnswerVisual = React.memo(AnswerVisualImpl)
AnswerVisual.displayName = 'AnswerVisual'

export default AnswerVisual
