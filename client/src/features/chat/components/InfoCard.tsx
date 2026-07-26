/**
 * InfoCard — renders the non-mutating "assist" tool results inside an assistant
 * chat message: caption options, hashtag suggestions, analytics insight, growth
 * recommendations, best posting time, and trend research. One component with a
 * `kind` switch keeps the render path simple and consistent.
 */

import React, { useState } from 'react'
import {
  Copy, Check, Sparkles, Hash, TrendingUp, Clock, Lightbulb, ExternalLink,
} from 'lucide-react'

export interface InfoCardData {
  id?: string
  kind: 'captions' | 'hashtags' | 'insight' | 'recommendations' | 'best_time' | 'trends' | 'research' | 'deep_research' | string
  title?: string
  // captions
  options?: string[]
  // hashtags
  hashtags?: string[]
  // insight
  emoji?: string
  headline?: string
  tip?: string
  // recommendations
  recommendations?: Array<{ icon?: string; title: string; description: string; priority?: 'high' | 'medium' | 'low'; category?: string }>
  // best_time
  bestLabel?: string
  windowLabel?: string
  day?: string
  status?: string
  account?: string
  daily?: Array<{ day_name: string; best_hour: number; is_peak?: boolean }>
  // trends (legacy) / research
  summary?: string
  answer?: string
  keyPoints?: string[]
  trends?: Array<{ topic: string; status: string; note?: string }>
  citations?: Array<{ title?: string; url: string; domain?: string; date?: string }>
  // deep_research
  executiveSummary?: string
  keyFindings?: string[]
  opportunities?: string[]
  risks?: string[]
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable */ }
  }
  return (
    <button
      onClick={onCopy}
      className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied' : label}
    </button>
  )
}

const cardShell = 'w-full rounded-xl border border-gray-300 dark:border-white/10 bg-gray-100 dark:bg-slate-800/60 shadow-sm p-4'
const cardTitle = 'text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2 flex items-center gap-1.5'

function fmtHour(h: number): string {
  const hr = ((h % 12) || 12)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${hr} ${ampm}`
}

const priorityColor: Record<string, string> = {
  high: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400',
  medium: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400',
  low: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
}

export const InfoCard: React.FC<{ card: InfoCardData }> = ({ card }) => {
  if (!card) return null

  if (card.kind === 'captions' && card.options?.length) {
    return (
      <div className={cardShell}>
        <div className={cardTitle}><Sparkles className="w-3.5 h-3.5" /> {card.title || 'Caption options'}</div>
        <div className="space-y-2">
          {card.options.map((opt, i) => (
            <div key={i} className="rounded-lg border border-gray-200 dark:border-white/5 bg-white dark:bg-slate-900/40 p-2.5">
              <p className="text-sm text-black dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{opt}</p>
              <div className="mt-1.5 flex justify-end"><CopyButton text={opt} /></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (card.kind === 'hashtags' && card.hashtags?.length) {
    const all = card.hashtags.map((h) => `#${h}`).join(' ')
    return (
      <div className={cardShell}>
        <div className={cardTitle}><Hash className="w-3.5 h-3.5" /> {card.title || 'Hashtags'}</div>
        <div className="flex flex-wrap gap-1.5">
          {card.hashtags.map((h, i) => (
            <span key={i} className="px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-xs font-medium">
              #{h}
            </span>
          ))}
        </div>
        <div className="mt-2.5 flex justify-end"><CopyButton text={all} label="Copy all" /></div>
      </div>
    )
  }

  if (card.kind === 'insight') {
    return (
      <div className={cardShell}>
        <div className={cardTitle}><TrendingUp className="w-3.5 h-3.5" /> {card.title || 'Performance insight'}</div>
        {card.headline && (
          <p className="text-sm font-semibold text-black dark:text-gray-100 mb-1.5">
            {card.emoji ? `${card.emoji} ` : ''}{card.headline}
          </p>
        )}
        {card.tip && <p className="text-sm text-black dark:text-gray-200 leading-relaxed">{card.tip}</p>}
      </div>
    )
  }

  if (card.kind === 'recommendations' && card.recommendations?.length) {
    return (
      <div className={cardShell}>
        <div className={cardTitle}><Lightbulb className="w-3.5 h-3.5" /> {card.title || 'Growth recommendations'}</div>
        <div className="space-y-2.5">
          {card.recommendations.map((r, i) => (
            <div key={i} className="rounded-lg border border-gray-200 dark:border-white/5 bg-white dark:bg-slate-900/40 p-2.5">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-sm font-semibold text-black dark:text-gray-100">{r.title}</span>
                {r.priority && (
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${priorityColor[r.priority] || priorityColor.low}`}>
                    {r.priority}
                  </span>
                )}
              </div>
              <p className="text-sm text-black dark:text-gray-200 leading-relaxed">{r.description}</p>
              {r.category && <span className="mt-1 inline-block text-[11px] text-gray-400 dark:text-gray-500">{r.category}</span>}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (card.kind === 'best_time') {
    return (
      <div className={cardShell}>
        <div className={cardTitle}><Clock className="w-3.5 h-3.5" /> {card.title || 'Best time to post'}</div>
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-2xl font-bold text-black dark:text-gray-100">{card.bestLabel || '—'}</span>
          {card.day && <span className="text-sm text-gray-500 dark:text-gray-400">on {card.day}</span>}
        </div>
        {card.windowLabel && <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Peak window: {card.windowLabel}{card.account ? ` · @${card.account}` : ''}</p>}
        {card.daily?.length ? (
          <div className="grid grid-cols-7 gap-1 mt-2">
            {card.daily.map((d, i) => (
              <div key={i} className={`text-center rounded-md py-1 ${d.is_peak ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-gray-50 dark:bg-slate-900/40'}`}>
                <div className="text-[10px] text-gray-400 dark:text-gray-500">{(d.day_name || '').slice(0, 3)}</div>
                <div className={`text-[11px] font-medium ${d.is_peak ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300'}`}>{fmtHour(d.best_hour)}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  if (card.kind === 'research' || card.kind === 'trends') {
    const body = card.answer || card.summary
    const trendColor: Record<string, string> = {
      emerging: 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400',
      rising: 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400',
      trending: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
      saturated: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400',
      declining: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
    }
    return (
      <div className={cardShell}>
        <div className={cardTitle}><TrendingUp className="w-3.5 h-3.5" /> {card.title || 'Research'}</div>
        {body && <p className="text-sm text-black dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{body}</p>}

        {card.trends?.length ? (
          <div className="mt-2.5 space-y-1.5">
            {card.trends.map((t, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${trendColor[t.status] || trendColor.trending}`}>{t.status}</span>
                <span className="text-sm text-black dark:text-gray-200"><span className="font-medium">{t.topic}</span>{t.note ? ` — ${t.note}` : ''}</span>
              </div>
            ))}
          </div>
        ) : null}

        {card.keyPoints?.length ? (
          <ul className="mt-2.5 space-y-1">
            {card.keyPoints.map((p, i) => (
              <li key={i} className="text-sm text-black dark:text-gray-200 flex gap-2">
                <span className="text-blue-500 shrink-0">•</span><span>{p}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {card.citations?.length ? (
          <div className="mt-2.5 space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Sources</div>
            {card.citations.map((c, i) => (
              <a key={i} href={c.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline truncate">
                <ExternalLink className="w-3 h-3 shrink-0" />
                <span className="truncate">{c.title || c.domain || c.url}</span>
                {c.domain && <span className="text-gray-400 dark:text-gray-500 shrink-0">· {c.domain}</span>}
              </a>
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  if (card.kind === 'deep_research') {
    const trendColor: Record<string, string> = {
      emerging: 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400',
      rising: 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400',
      trending: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
      saturated: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400',
      declining: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
    }
    const Section = ({ label, items, marker }: { label: string; items?: string[]; marker: string }) =>
      items?.length ? (
        <div className="mt-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">{label}</div>
          <ul className="space-y-1">
            {items.map((it, i) => (
              <li key={i} className="text-sm text-black dark:text-gray-200 flex gap-2"><span className="shrink-0">{marker}</span><span>{it}</span></li>
            ))}
          </ul>
        </div>
      ) : null
    return (
      <div className={cardShell}>
        <div className={cardTitle}><Lightbulb className="w-3.5 h-3.5" /> {card.title || 'Research report'}</div>
        {card.executiveSummary && (
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">Executive summary</div>
            <p className="text-sm text-black dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{card.executiveSummary}</p>
          </div>
        )}
        <Section label="Key findings" items={card.keyFindings} marker="•" />
        {card.trends?.length ? (
          <div className="mt-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">Trends</div>
            <div className="space-y-1.5">
              {card.trends.map((t, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${trendColor[t.status] || trendColor.trending}`}>{t.status}</span>
                  <span className="text-sm text-black dark:text-gray-200"><span className="font-medium">{t.topic}</span>{t.note ? ` — ${t.note}` : ''}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <Section label="Opportunities" items={card.opportunities} marker="✅" />
        <Section label="Risks" items={card.risks} marker="⚠️" />
        {card.citations?.length ? (
          <div className="mt-3 space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Sources</div>
            {card.citations.map((c, i) => (
              <a key={i} href={c.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline truncate">
                <ExternalLink className="w-3 h-3 shrink-0" />
                <span className="truncate">{c.title || c.domain || c.url}</span>
                {c.domain && <span className="text-gray-400 dark:text-gray-500 shrink-0">· {c.domain}</span>}
              </a>
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  return null
}

export default InfoCard
