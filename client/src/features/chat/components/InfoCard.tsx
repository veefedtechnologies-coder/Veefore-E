/**
 * InfoCard — renders the non-mutating "assist" tool results inside an assistant
 * chat message: caption options, hashtag suggestions, analytics insight, growth
 * recommendations, best posting time, and trend research. One component with a
 * `kind` switch keeps the render path simple and consistent.
 */

import React, { useState } from 'react'
import {
  Copy, Check, Sparkles, Hash, TrendingUp, Clock, Lightbulb, ExternalLink, Maximize2, Search,
  Download, FileText, FileSpreadsheet, Presentation, Loader2, Eye,
} from 'lucide-react'
import { downloadDocument, type DocumentCard as DocumentCardSpec } from './documentGenerators'
import { ImageGenerationCard } from './ImageGenerationCard'
import { VideoEditorChatCard } from './VideoEditorChatCard'
import { MediaLightbox } from './MediaLightbox'

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
  // image (generate_image / edit_image)
  url?: string
  operation?: string
  mimeType?: string
  aspectRatio?: string
  stage?: string
  error?: string
  // media_choices (show_media_options) — a visual picker of conversation images
  items?: Array<{ ordinal: number; url: string; mimeType?: string; label?: string; recent?: boolean }>
  // document (generate_document)
  docType?: 'pdf' | 'docx' | 'xlsx' | 'pptx'
  subtitle?: string
  highlights?: Array<{ label: string; value: string; sublabel?: string }>
  spec?: {
    sections?: Array<{ heading?: string; body?: string; bullets?: string[] }>
    sheets?: Array<{ name?: string; columns: string[]; rows: Array<Array<string | number>> }>
    slides?: Array<{ title?: string; bullets?: string[]; body?: string }>
  }
  // deep_research
  /** Full long-form Markdown report (rendered in the full-screen viewer). */
  reportMarkdown?: string
  executiveSummary?: string
  keyFindings?: string[]
  opportunities?: string[]
  risks?: string[]
  /** Persisted research-activity summary (searches run + sources + timeline). */
  research?: {
    searches?: number
    sourceCount?: number
    steps?: Array<{ kind: string; label: string; detail?: string }>
  }
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

const cardShell = 'w-full rounded-xl border border-gray-300 dark:border-white/10 bg-gray-100 dark:bg-slate-800/60 shadow-sm p-4 animate-in fade-in slide-in-from-bottom-2 duration-500 ease-out'
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

const DOC_META: Record<string, { label: string; ext: string; Icon: React.ComponentType<{ className?: string }>; color: string }> = {
  pdf: { label: 'PDF', ext: 'pdf', Icon: FileText, color: 'text-red-500' },
  docx: { label: 'Word', ext: 'docx', Icon: FileText, color: 'text-blue-500' },
  xlsx: { label: 'Excel', ext: 'xlsx', Icon: FileSpreadsheet, color: 'text-green-600' },
  pptx: { label: 'PowerPoint', ext: 'pptx', Icon: Presentation, color: 'text-orange-500' },
}

function docPreview(card: InfoCardData): string {
  const s = card.spec || {}
  if (card.docType === 'xlsx' && s.sheets?.length) {
    const rows = s.sheets.reduce((n, sh) => n + (sh.rows?.length || 0), 0)
    const cols = s.sheets[0]?.columns?.length || 0
    return `${s.sheets.length} sheet${s.sheets.length > 1 ? 's' : ''} · ${rows} row${rows !== 1 ? 's' : ''}${cols ? ` · ${cols} column${cols !== 1 ? 's' : ''}` : ''}`
  }
  if (card.docType === 'pptx') {
    const n = s.slides?.length || s.sections?.length || 0
    return n ? `${n} slide${n !== 1 ? 's' : ''}` : ''
  }
  const n = s.sections?.length || 0
  return n ? `${n} section${n !== 1 ? 's' : ''}` : ''
}

/** Downloadable document result (generate_document tool). Click to view in-app. */
const DocumentCardBlock: React.FC<{ card: InfoCardData; onOpen?: (card: InfoCardData) => void }> = ({ card, onOpen }) => {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)
  const meta = DOC_META[card.docType || 'pdf'] || DOC_META.pdf
  const Icon = meta.Icon
  const preview = docPreview(card)
  const onDownload = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setErr(false)
    setBusy(true)
    try {
      await downloadDocument(card as unknown as DocumentCardSpec)
    } catch {
      setErr(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div
      className={`${cardShell} cursor-pointer transition-shadow hover:shadow-md`}
      onClick={() => onOpen?.(card)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpen?.(card) }}
    >
      <div className="flex items-start gap-3">
        <div className={`shrink-0 flex h-11 w-11 items-center justify-center rounded-xl bg-white dark:bg-slate-900/60 border border-gray-200 dark:border-white/10 ${meta.color}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-black dark:text-gray-100">{card.title || 'Document'}</span>
            <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-gray-200 text-gray-600 dark:bg-slate-700 dark:text-gray-300">{meta.label}</span>
          </div>
          {(card.subtitle || card.summary) && (
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{card.subtitle || card.summary}</p>
          )}
          {preview && <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">{preview}</p>}
          <div className="mt-2.5 flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); onOpen?.(card) }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              <Eye className="h-3.5 w-3.5" />
              View
            </button>
            <button
              onClick={onDownload}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-white/15 px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200/60 dark:hover:bg-white/10 disabled:opacity-60 transition-colors"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {busy ? 'Preparing…' : meta.ext.toUpperCase()}
            </button>
          </div>
          {err && <p className="mt-1.5 text-[11px] text-red-500">Couldn’t generate the file. Please try again.</p>}
        </div>
      </div>
    </div>
  )
}

/** A visual picker of the conversation's images (show_media_options). */
const MediaChoicesBlock: React.FC<{
  card: InfoCardData
  /** Selecting a picture sends a message so VeeGPT schedules that image. */
  onSelectMedia?: (ordinal: number, label?: string) => void
  /** The ordinal already chosen (persisted by the page) — locks the picker. */
  selectedOrdinal?: number
  /** True once the picker is used/superseded: no more selecting. */
  locked?: boolean
}> = ({ card, onSelectMedia, selectedOrdinal, locked }) => {
  const [preview, setPreview] = useState<{ url: string; mimeType?: string } | null>(null)
  const allItems = (card.items || []).filter((it) => it && it.url)
  if (!allItems.length) return null

  const isVideo = (it: { url: string; mimeType?: string }) =>
    (it.mimeType || '').startsWith('video/') || /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(it.url)

  const isLocked = !!locked || selectedOrdinal != null
  // Once an image is chosen, collapse the picker to JUST that image (the others
  // are no longer relevant); if locked without a choice, keep all but faded.
  const items =
    selectedOrdinal != null
      ? allItems.filter((it) => it.ordinal === selectedOrdinal)
      : allItems

  return (
    <div className={cardShell}>
      <div className={cardTitle}>
        <Sparkles className="w-3.5 h-3.5" />
        {selectedOrdinal != null ? 'Selected image' : card.title || 'Choose an image'}
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {items.map((it) => {
          const isChosen = selectedOrdinal === it.ordinal
          const dimmed = isLocked && !isChosen
          const clickable = !isLocked
          return (
            <div
              key={it.ordinal}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              aria-disabled={!clickable}
              onClick={() => {
                if (!clickable) return
                onSelectMedia?.(it.ordinal, it.label)
              }}
              onKeyDown={(e) => {
                if (!clickable) return
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelectMedia?.(it.ordinal, it.label)
                }
              }}
              className={`relative aspect-square rounded-lg overflow-hidden border bg-gray-100 dark:bg-slate-800 group transition-all ${
                isChosen
                  ? 'border-blue-500 ring-2 ring-blue-500'
                  : 'border-gray-200 dark:border-white/10'
              } ${clickable ? 'cursor-pointer hover:border-blue-400' : 'cursor-default'} ${
                dimmed ? 'opacity-40' : ''
              }`}
              title={
                clickable
                  ? `${it.label || 'Image'} — click to schedule this one`
                  : it.label || 'Image'
              }
            >
              {isVideo(it) ? (
                <video src={`${it.url}#t=0.1`} className="w-full h-full object-cover" muted playsInline preload="metadata" />
              ) : (
                <img src={it.url} alt={it.label || `Image ${it.ordinal}`} className="w-full h-full object-cover" />
              )}
              {/* Number badge (matches the number the user tells VeeGPT). */}
              <span className="absolute top-1 left-1 min-w-[18px] h-[18px] px-1 rounded-full bg-black/70 text-white text-[10px] font-semibold flex items-center justify-center">
                {it.ordinal}
              </span>
              {/* Small preview button — opens the lightbox without selecting. */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setPreview({ url: it.url, mimeType: it.mimeType })
                }}
                className="absolute top-1 right-1 p-1 rounded-md bg-black/55 text-white/90 hover:bg-black/75 hover:text-white transition-colors"
                title="Preview"
                aria-label="Preview image"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
              {/* Origin label so the user knows edited vs uploaded vs generated. */}
              {it.label && (
                <span className="absolute bottom-1 left-1 right-1 text-[9px] text-white bg-black/60 rounded px-1 py-0.5 text-center truncate">
                  {isChosen ? `Scheduling · ${it.label}` : it.label}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
        {selectedOrdinal != null
          ? `Scheduling image ${selectedOrdinal}. This selection is locked.`
          : isLocked
            ? 'This picker is no longer active.'
            : 'Click a picture to schedule it, or tap the eye to preview. The most recent is used by default.'}
      </p>
      {preview && (
        <MediaLightbox url={preview.url} mimeType={preview.mimeType} onClose={() => setPreview(null)} />
      )}
    </div>
  )
}

export const InfoCard: React.FC<{
  card: InfoCardData
  onOpenFull?: (card: InfoCardData) => void
  onOpenDocument?: (card: InfoCardData) => void
  /** Selecting a picture in a media_choices card schedules that image. */
  onSelectMedia?: (ordinal: number, label?: string) => void
  /** The ordinal already chosen from a media_choices card (locks the picker). */
  selectedOrdinal?: number
  /** When true the media_choices card is locked (single-use / superseded). */
  mediaLocked?: boolean
}> = ({ card, onOpenFull, onOpenDocument, onSelectMedia, selectedOrdinal, mediaLocked }) => {
  if (!card) return null

  if (card.kind === 'document') {
    return <DocumentCardBlock card={card} onOpen={onOpenDocument} />
  }

  if (card.kind === 'image') {
    return <ImageGenerationCard card={card as any} />
  }

  if (card.kind === 'video_editor') {
    return <VideoEditorChatCard card={card as any} />
  }

  if (card.kind === 'media_choices') {
    return (
      <MediaChoicesBlock
        card={card}
        onSelectMedia={onSelectMedia}
        selectedOrdinal={selectedOrdinal}
        locked={mediaLocked}
      />
    )
  }

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
    // CONDENSED preview only — the full report opens in the full-screen viewer.
    const research = card.research
    const summary = card.executiveSummary || ''
    const previewFindings = (card.keyFindings || []).slice(0, 3)
    return (
      <div className={cardShell}>
        <div className={cardTitle}><Lightbulb className="w-3.5 h-3.5" /> {card.title || 'Research report'}</div>

        {research && (research.sourceCount || research.searches || research.steps?.length) ? (
          <details className="group mb-2 rounded-lg border border-gray-200 dark:border-white/5 bg-white/60 dark:bg-slate-900/40">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
              <TrendingUp className="h-3 w-3 shrink-0" />
              <span>
                Researched {research.sourceCount || 0} {research.sourceCount === 1 ? 'source' : 'sources'}
                {research.searches ? ` · ${research.searches} ${research.searches === 1 ? 'search' : 'searches'}` : ''}
              </span>
              <span className="ml-auto text-gray-400 transition-transform group-open:rotate-90">›</span>
            </summary>
            {research.steps?.length ? (
              <ol className="space-y-1 px-2.5 pb-2 pt-0.5">
                {research.steps.map((s, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-green-500" />
                    <span>{s.label}{s.detail ? ` — ${s.detail}` : ''}</span>
                  </li>
                ))}
              </ol>
            ) : null}
          </details>
        ) : null}

        {summary && (
          <p className="text-sm text-black dark:text-gray-200 leading-relaxed line-clamp-3">{summary}</p>
        )}

        {previewFindings.length ? (
          <ul className="mt-2.5 space-y-1">
            {previewFindings.map((p, i) => (
              <li key={i} className="text-sm text-black dark:text-gray-200 flex gap-2">
                <span className="text-blue-500 shrink-0">•</span><span className="line-clamp-1">{p}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <button
          onClick={() => onOpenFull?.(card)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          Open full report
        </button>
      </div>
    )
  }

  return null
}

export default InfoCard
