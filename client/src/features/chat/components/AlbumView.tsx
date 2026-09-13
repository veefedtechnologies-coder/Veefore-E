/**
 * AlbumView
 *
 * A premium gallery + creation surface for every image VeeGPT has generated or
 * edited. Inspired by ChatGPT's Images tab, taken further:
 *   • A "Create an image" composer + one-tap style templates (hands off to chat).
 *   • Hover actions (Share, Edit) on every tile.
 *   • A massive, immersive preview with a left film-strip to slide between
 *     images and a bottom "Describe edits" composer to iterate in place.
 *
 * Actual generation/editing is delegated to the existing VeeGPT chat pipeline
 * via onCreateImage / onEditImage (so it uses the exact same tools + streaming).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Images,
  Sparkles,
  Wand2,
  Download,
  MessageSquareText,
  X,
  ChevronLeft,
  ChevronRight,
  Share2,
  Pencil,
  ArrowUp,
  Check,
  Link2,
} from 'lucide-react'
import { apiRequest } from '@/lib/queryClient'

export interface AlbumImage {
  url: string
  mimeType: string
  origin: 'generated' | 'edited'
  prompt: string
  conversationId: number
  conversationTitle: string
  createdAt: string
}

interface AlbumViewProps {
  workspaceId?: string
  onOpenConversation?: (conversationId: number) => void
  /** Start a brand-new chat that generates an image from `prompt`. */
  onCreateImage?: (prompt: string) => void
  /** Send an edit instruction into the image's source conversation. */
  onEditImage?: (image: AlbumImage, instruction: string) => void
  /** Fires when the full-screen image preview opens/closes (so the parent can
   *  collapse the VeeGPT sidebar to the slim rail while previewing). */
  onPreviewOpenChange?: (open: boolean) => void
  /** The image URL currently open in the preview (or null) — for persistence. */
  onPreviewImageChange?: (url: string | null) => void
  /** On mount, reopen the preview for this image URL (restore after refresh). */
  initialPreviewUrl?: string | null
}

type Filter = 'all' | 'generated' | 'edited'

/** One-tap style starters — clicking pre-fills the composer (user can tweak). */
const TEMPLATES: { label: string; emoji: string; prompt: string }[] = [
  { label: 'Caricature', emoji: '🎨', prompt: 'Create a fun, exaggerated caricature illustration of ' },
  { label: 'Anime', emoji: '🌀', prompt: 'Generate a vibrant anime-style portrait of ' },
  { label: 'Product shot', emoji: '📦', prompt: 'Create a clean studio product photo of ' },
  { label: 'Poster', emoji: '🪧', prompt: 'Design a bold marketing poster for ' },
  { label: 'Logo', emoji: '✦', prompt: 'Design a minimal, modern logo for ' },
  { label: 'Cinematic', emoji: '🎬', prompt: 'Create a cinematic, moody photograph of ' },
  { label: '3D render', emoji: '🧊', prompt: 'Generate a glossy 3D render of ' },
  { label: 'Watercolor', emoji: '🖌️', prompt: 'Paint a soft watercolor illustration of ' },
]

function dateBucket(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Earlier'
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const t = d.getTime()
  const DAY = 86400000
  if (t >= startOfToday) return 'Today'
  if (t >= startOfToday - DAY) return 'Yesterday'
  if (t >= startOfToday - 7 * DAY) return 'This week'
  if (t >= startOfToday - 30 * DAY) return 'This month'
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}
const BUCKET_ORDER = ['Today', 'Yesterday', 'This week', 'This month']

async function downloadImage(url: string, filename: string) {
  try {
    const res = await fetch(url, { credentials: 'include' })
    const blob = await res.blob()
    const objUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(objUrl), 2000)
  } catch {
    window.open(url, '_blank')
  }
}

const OriginBadge = ({ origin, className = '' }: { origin: AlbumImage['origin']; className?: string }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold backdrop-blur-sm ${
      origin === 'edited' ? 'bg-purple-500/85 text-white' : 'bg-blue-500/85 text-white'
    } ${className}`}
  >
    {origin === 'edited' ? <Wand2 className="h-2.5 w-2.5" /> : <Sparkles className="h-2.5 w-2.5" />}
    {origin === 'edited' ? 'Edited' : 'Generated'}
  </span>
)

export const AlbumView: React.FC<AlbumViewProps> = ({
  workspaceId,
  onOpenConversation,
  onCreateImage,
  onEditImage,
  onPreviewOpenChange,
  onPreviewImageChange,
  initialPreviewUrl,
}) => {
  const [filter, setFilter] = useState<Filter>('all')
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [prompt, setPrompt] = useState('')
  const [editText, setEditText] = useState('')
  const [copied, setCopied] = useState(false)
  const composerRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const wheelCooldownRef = useRef(0)

  const { data, isLoading } = useQuery<{ images: AlbumImage[] }>({
    queryKey: ['/api/chat/album', workspaceId || null],
    queryFn: () =>
      apiRequest(
        `/api/chat/album${workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''}`
      ),
    staleTime: 30_000,
  })

  const allImages = data?.images ?? []
  const filtered = useMemo(
    () => (filter === 'all' ? allImages : allImages.filter(i => i.origin === filter)),
    [allImages, filter]
  )

  const groups = useMemo(() => {
    const map = new Map<string, AlbumImage[]>()
    for (const img of filtered) {
      const b = dateBucket(img.createdAt)
      if (!map.has(b)) map.set(b, [])
      map.get(b)!.push(img)
    }
    const keys = Array.from(map.keys()).sort((a, b) => {
      const ia = BUCKET_ORDER.indexOf(a)
      const ib = BUCKET_ORDER.indexOf(b)
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
      return 0
    })
    return keys.map(k => ({ label: k, items: map.get(k)! }))
  }, [filtered])

  const counts = useMemo(
    () => ({
      all: allImages.length,
      generated: allImages.filter(i => i.origin === 'generated').length,
      edited: allImages.filter(i => i.origin === 'edited').length,
    }),
    [allImages]
  )

  const openAt = (img: AlbumImage) => {
    const idx = filtered.findIndex(i => i.url === img.url)
    setLightboxIndex(idx >= 0 ? idx : null)
    setEditText('')
  }
  const active = lightboxIndex != null ? filtered[lightboxIndex] : null
  const step = (dir: 1 | -1) =>
    setLightboxIndex(i => {
      if (i == null) return i
      const n = i + dir
      return n >= 0 && n < filtered.length ? n : i
    })

  // Keyboard nav in the lightbox.
  useEffect(() => {
    if (lightboxIndex == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIndex(null)
      else if (e.key === 'ArrowLeft') step(-1)
      else if (e.key === 'ArrowRight') step(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxIndex, filtered.length])

  // Tell the parent when the preview opens/closes (to collapse the sidebar) and
  // which image is open (persisted so a refresh reopens the exact same image).
  useEffect(() => {
    onPreviewOpenChange?.(lightboxIndex != null)
    onPreviewImageChange?.(lightboxIndex != null ? filtered[lightboxIndex]?.url ?? null : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxIndex])

  // Restore the previously-open preview after a refresh. Re-runs whenever the
  // image data changes (the list can arrive in two passes: unscoped, then
  // workspace-scoped) and only marks itself done once it actually opens the
  // image — so a scoped refetch that arrives late still reopens it.
  const restoredRef = useRef(false)
  useEffect(() => {
    if (restoredRef.current) return
    if (!initialPreviewUrl) {
      restoredRef.current = true
      return
    }
    if (filtered.length === 0) return
    const idx = filtered.findIndex(i => i.url === initialPreviewUrl)
    if (idx >= 0) {
      setLightboxIndex(idx)
      restoredRef.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, initialPreviewUrl])

  // Preload the active image and its neighbours so the preview shows instantly
  // and stepping through the coverflow never flashes a blank frame.
  useEffect(() => {
    if (lightboxIndex == null) return
    for (let d = 0; d <= 2; d++) {
      for (const j of [lightboxIndex - d, lightboxIndex + d]) {
        const url = filtered[j]?.url
        if (url) {
          const im = new Image()
          im.src = url
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxIndex, filtered.length])

  // While the preview is open: (1) a NON-PASSIVE wheel listener so we can
  // preventDefault — otherwise the wheel's default scroll leaks to the app behind
  // the overlay; (2) each gesture advances exactly ONE image (discrete, cooled
  // down); (3) lock the background scroll entirely as a belt-and-suspenders.
  useEffect(() => {
    if (lightboxIndex == null) return
    const el = overlayRef.current
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const now = Date.now()
      if (now - wheelCooldownRef.current < 300) return
      const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX
      if (Math.abs(delta) < 8) return
      wheelCooldownRef.current = now
      setLightboxIndex(i => {
        if (i == null) return i
        const n = i + (delta > 0 ? 1 : -1)
        return n >= 0 && n < filtered.length ? n : i
      })
    }
    el?.addEventListener('wheel', onWheel, { passive: false })
    const prevBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      el?.removeEventListener('wheel', onWheel)
      document.body.style.overflow = prevBodyOverflow
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxIndex, filtered.length])

  const submitCreate = () => {
    const p = prompt.trim()
    if (!p || !onCreateImage) return
    onCreateImage(p)
    setPrompt('')
  }
  const applyTemplate = (t: (typeof TEMPLATES)[number]) => {
    setPrompt(t.prompt)
    requestAnimationFrame(() => {
      composerRef.current?.focus()
      const el = composerRef.current
      if (el) el.setSelectionRange(el.value.length, el.value.length)
    })
  }
  const submitEdit = () => {
    const t = editText.trim()
    if (!t || !active || !onEditImage) return
    onEditImage(active, t)
    setEditText('')
    setLightboxIndex(null)
  }
  const share = async (img: AlbumImage) => {
    const abs = img.url.startsWith('http') ? img.url : window.location.origin + img.url
    try {
      if (navigator.share) {
        await navigator.share({ title: 'VeeGPT image', text: img.prompt || 'Made with VeeGPT', url: abs })
        return
      }
    } catch {
      /* user cancelled or unsupported — fall through to copy */
    }
    try {
      await navigator.clipboard.writeText(abs)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      window.open(abs, '_blank')
    }
  }

  const TABS: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'generated', label: 'Generated', count: counts.generated },
    { key: 'edited', label: 'Edited', count: counts.edited },
  ]

  return (
    <div className="flex-1 h-full min-h-0 flex flex-col overflow-hidden bg-white dark:bg-slate-900">
      {/* Scroll area holds the create surface + gallery. `min-h-0` lets this
          flex child actually shrink to the column height so it (not the page)
          owns the scroll; `overscroll-none` stops scroll chaining/bounce. */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-none">
        {/* Create surface */}
        <div className="border-b border-gray-200/70 dark:border-white/[0.06] bg-gradient-to-b from-blue-50/40 to-transparent dark:from-blue-500/[0.06]">
          <div className="mx-auto w-full max-w-5xl px-6 pt-8 pb-6">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-[0_6px_16px_-6px_rgba(37,99,235,0.7)]">
                <Images className="h-[18px] w-[18px]" />
              </span>
              <div>
                <h1 className="text-[18px] font-semibold tracking-tight text-gray-900 dark:text-white leading-tight">
                  Album
                </h1>
                <p className="text-[12px] text-gray-500 dark:text-gray-400 leading-tight">
                  Create, edit, and revisit everything VeeGPT makes for you
                </p>
              </div>
            </div>

            {/* Create composer */}
            <div className="group relative rounded-2xl border border-gray-200/80 dark:border-white/10 bg-white dark:bg-slate-800/60 shadow-[0_8px_30px_-14px_rgba(15,23,42,0.25)] focus-within:border-blue-400/70 dark:focus-within:border-blue-400/40 transition-colors">
              <div className="flex items-center gap-2 px-3.5 py-2.5">
                <Sparkles className="h-[18px] w-[18px] shrink-0 text-blue-500" />
                <input
                  ref={composerRef}
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      submitCreate()
                    }
                  }}
                  placeholder="Describe an image to create…"
                  className="min-w-0 flex-1 bg-transparent text-[14px] text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none"
                />
                <button
                  onClick={submitCreate}
                  disabled={!prompt.trim()}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-white transition-all enabled:hover:bg-gray-800 disabled:opacity-40 dark:bg-white dark:text-slate-900 dark:enabled:hover:bg-gray-100"
                  aria-label="Generate image"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Style templates */}
            <div className="mt-3 flex flex-wrap gap-2">
              {TEMPLATES.map(t => (
                <button
                  key={t.label}
                  onClick={() => applyTemplate(t)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gray-200/80 dark:border-white/10 bg-white/70 dark:bg-white/[0.04] px-3 py-1.5 text-[12.5px] font-medium text-gray-700 dark:text-gray-200 hover:border-blue-300/70 hover:bg-white dark:hover:bg-white/[0.08] transition-colors"
                >
                  <span className="text-[13px] leading-none">{t.emoji}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Gallery */}
        <div className="mx-auto w-full max-w-5xl px-6 py-6">
          <div className="mb-4 flex items-center gap-1.5">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  filter === t.key
                    ? 'bg-gray-900 text-white dark:bg-white dark:text-slate-900'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06]'
                }`}
              >
                {t.label}
                <span className={`text-[11px] ${filter === t.key ? 'opacity-70' : 'text-gray-400 dark:text-gray-500'}`}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>

          {isLoading ? (
            <AlbumSkeleton />
          ) : filtered.length === 0 ? (
            <EmptyState filter={filter} />
          ) : (
            <div className="space-y-8">
              {groups.map(group => (
                <section key={group.label}>
                  <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    {group.label}
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {group.items.map(img => (
                      <div
                        key={img.url}
                        className="group relative aspect-square overflow-hidden rounded-xl border border-gray-200/70 dark:border-white/10 bg-gray-100 dark:bg-white/[0.03] shadow-sm hover:shadow-[0_12px_32px_-14px_rgba(15,23,42,0.4)] transition-all duration-200"
                      >
                        <button onClick={() => openAt(img)} className="absolute inset-0 h-full w-full">
                          <img
                            src={img.url}
                            alt={img.prompt || 'VeeGPT image'}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.05]"
                          />
                        </button>
                        <div className="pointer-events-none absolute left-2 top-2">
                          <OriginBadge origin={img.origin} />
                        </div>
                        {/* Hover overlay: gradient + prompt + actions */}
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                        <div className="absolute right-2 top-2 flex gap-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                          <button
                            onClick={() => share(img)}
                            title="Share"
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm hover:bg-black/65 transition-colors"
                          >
                            <Share2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => { openAt(img); requestAnimationFrame(() => setEditText('')) }}
                            title="Edit"
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm hover:bg-black/65 transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {img.prompt && (
                          <div className="pointer-events-none absolute inset-x-0 bottom-0 p-2.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                            <p className="line-clamp-2 text-left text-[11px] font-medium leading-snug text-white/95">
                              {img.prompt}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Immersive preview — rendered in a PORTAL to document.body so its
          `fixed inset-0` is relative to the real viewport (the VeeGPT route
          shell applies transforms, which would otherwise contain `fixed` and
          leave a white strip). */}
      {active && createPortal(
        // Inset from the left by the collapsed sidebar width so the VeeGPT slim
        // rail stays visible beside the preview (like ChatGPT).
        <div
          ref={overlayRef}
          className="fixed inset-y-0 right-0 left-0 sm:left-[60px] z-[1000] flex overflow-hidden overscroll-none bg-gray-50/90 dark:bg-[#0b0b0f]/92 backdrop-blur-2xl shadow-[-10px_0_30px_-12px_rgba(15,23,42,0.25)] dark:shadow-[-12px_0_36px_-12px_rgba(0,0,0,0.6)] animate-in fade-in duration-200"
        >
          {/* Coverflow film-strip — a CONTROLLED slider (not native scroll): the
              active thumb stays centered, neighbours shrink + fade with distance,
              and a wheel/trackpad gesture advances exactly ONE image. */}
          <div
            className="relative hidden w-[104px] shrink-0 overflow-hidden sm:block"
            style={{
              WebkitMaskImage:
                'linear-gradient(to bottom, transparent 0, #000 20%, #000 80%, transparent 100%)',
              maskImage:
                'linear-gradient(to bottom, transparent 0, #000 20%, #000 80%, transparent 100%)',
            }}
          >
            <div
              className="absolute inset-x-0 flex flex-col items-center"
              style={{
                top: '50%',
                transform: `translateY(${-((lightboxIndex ?? 0) * 70 + 35)}px)`,
                transition: 'transform 0.38s cubic-bezier(0.22,0.61,0.36,1)',
              }}
            >
              {filtered.map((img, i) => {
                const dist = Math.abs(i - (lightboxIndex ?? 0))
                const scale = Math.max(0.5, 1 - dist * 0.16)
                const opacity = i === lightboxIndex ? 1 : Math.max(0.32, 1 - dist * 0.26)
                return (
                  <button
                    key={img.url}
                    onClick={() => { setLightboxIndex(i); setEditText('') }}
                    className="flex shrink-0 items-center justify-center"
                    style={{ height: 70, width: 64 }}
                    aria-label={`Image ${i + 1}`}
                  >
                    <span
                      className={`block h-[56px] w-[56px] overflow-hidden rounded-xl shadow-sm transition-all duration-300 ${
                        i === lightboxIndex
                          ? 'ring-2 ring-blue-500 dark:ring-white ring-offset-2 ring-offset-gray-50 dark:ring-offset-[#0b0b0f]'
                          : ''
                      }`}
                      style={{ transform: `scale(${scale})`, opacity }}
                    >
                      <img src={img.url} alt="" loading="eager" decoding="async" className="h-full w-full object-cover" />
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Main column */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Top bar (theme-aware) */}
            <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-1.5">
                <button
                  onClick={() => setLightboxIndex(null)}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-900/[0.06] hover:text-gray-900 dark:text-white/70 dark:hover:bg-white/15 dark:hover:text-white transition-colors"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
                <div className="ml-1 flex min-w-0 items-center gap-2">
                  <OriginBadge origin={active.origin} />
                  <span className="truncate text-[13px] text-gray-500 dark:text-white/60">
                    {active.conversationTitle}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => share(active)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-gray-700 hover:bg-gray-900/[0.06] dark:text-white/85 dark:hover:bg-white/15 transition-colors"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
                  {copied ? 'Copied' : 'Share'}
                </button>
                <button
                  onClick={() =>
                    downloadImage(
                      active.url,
                      `veegpt-${active.origin}-${Date.now()}.${(active.mimeType.split('/')[1] || 'png').replace('jpeg', 'jpg')}`
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-gray-700 hover:bg-gray-900/[0.06] dark:text-white/85 dark:hover:bg-white/15 transition-colors"
                >
                  <Download className="h-4 w-4" />
                  <span className="hidden md:inline">Download</span>
                </button>
                {onOpenConversation && (
                  <button
                    onClick={() => { onOpenConversation(active.conversationId); setLightboxIndex(null) }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-slate-900 dark:hover:bg-gray-100 transition-colors"
                  >
                    <MessageSquareText className="h-4 w-4" />
                    <span className="hidden md:inline">Open in chat</span>
                  </button>
                )}
              </div>
            </div>

            {/* Stage — scroll/trackpad over it to slide between images */}
            <div className="relative flex min-h-0 flex-1 items-center justify-center px-6">
              {lightboxIndex != null && lightboxIndex > 0 && (
                <button
                  onClick={() => step(-1)}
                  className="absolute left-4 top-1/2 z-10 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-gray-900/[0.06] text-gray-600 backdrop-blur-sm hover:bg-gray-900/10 hover:text-gray-900 dark:bg-white/10 dark:text-white/90 dark:hover:bg-white/20 dark:hover:text-white transition-all"
                  aria-label="Previous"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              <img
                key={active.url}
                src={active.url}
                alt={active.prompt || 'VeeGPT image'}
                loading="eager"
                decoding="async"
                className="max-h-full max-w-full rounded-2xl object-contain shadow-[0_20px_60px_-24px_rgba(15,23,42,0.45)] dark:shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] animate-in fade-in zoom-in-95 duration-300"
              />
              {lightboxIndex != null && lightboxIndex < filtered.length - 1 && (
                <button
                  onClick={() => step(1)}
                  className="absolute right-4 top-1/2 z-10 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-gray-900/[0.06] text-gray-600 backdrop-blur-sm hover:bg-gray-900/10 hover:text-gray-900 dark:bg-white/10 dark:text-white/90 dark:hover:bg-white/20 dark:hover:text-white transition-all"
                  aria-label="Next"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              )}
              {/* Position counter */}
              {filtered.length > 1 && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-gray-900/[0.06] px-2.5 py-1 text-[11px] font-medium text-gray-500 backdrop-blur-sm dark:bg-black/40 dark:text-white/80">
                  {(lightboxIndex ?? 0) + 1} / {filtered.length}
                </div>
              )}
            </div>

            {/* Prompt caption */}
            {active.prompt && (
              <div className="shrink-0 px-6 pt-3 text-center">
                <p className="mx-auto max-w-2xl text-[12.5px] leading-relaxed text-gray-500 dark:text-white/60 line-clamp-2">
                  {active.prompt}
                </p>
              </div>
            )}

            {/* Describe-edits composer */}
            <div className="shrink-0 px-4 py-4">
              <div className="mx-auto flex max-w-2xl items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3.5 py-2.5 shadow-[0_8px_30px_-14px_rgba(15,23,42,0.25)] focus-within:border-blue-400/70 dark:border-white/15 dark:bg-white/[0.06] dark:shadow-none dark:focus-within:border-blue-400/60 transition-colors">
                <Pencil className="h-[18px] w-[18px] shrink-0 text-gray-400 dark:text-white/50" />
                <input
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      submitEdit()
                    }
                  }}
                  placeholder="Describe an edit for this image…"
                  className="min-w-0 flex-1 bg-transparent text-[14px] text-gray-900 placeholder-gray-400 outline-none dark:text-white dark:placeholder-white/40"
                />
                <button
                  onClick={submitEdit}
                  disabled={!editText.trim()}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-white transition-all enabled:hover:bg-gray-800 disabled:opacity-40 dark:bg-white dark:text-slate-900 dark:enabled:hover:bg-gray-100"
                  aria-label="Apply edit"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              </div>
              {!onEditImage && (
                <p className="mt-2 text-center text-[11px] text-gray-400 dark:text-white/40">
                  Editing opens this image’s chat.
                </p>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Toast: link copied (when Web Share unavailable) */}
      {copied && !active && (
        <div className="fixed bottom-6 left-1/2 z-[1100] -translate-x-1/2 rounded-full bg-gray-900 px-4 py-2 text-[13px] font-medium text-white shadow-lg animate-in fade-in slide-in-from-bottom-2 dark:bg-white dark:text-slate-900">
          <span className="inline-flex items-center gap-1.5">
            <Link2 className="h-3.5 w-3.5" /> Link copied
          </span>
        </div>
      )}
    </div>
  )
}

const AlbumSkeleton = () => (
  <div className="space-y-8">
    {[0, 1].map(s => (
      <div key={s}>
        <div className="mb-3 h-3 w-24 rounded bg-gray-200 dark:bg-white/10" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => (
            // skeleton-guard-allow: decorative image-tile placeholder inside the AlbumView loading skeleton
            <div key={i} className="aspect-square rounded-xl bg-gray-200/80 dark:bg-white/[0.06] animate-pulse" />
          ))}
        </div>
      </div>
    ))}
  </div>
)

const EmptyState = ({ filter }: { filter: Filter }) => (
  <div className="flex flex-col items-center justify-center py-20 text-center">
    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-500/10 text-blue-500 dark:text-blue-400">
      <Images className="h-8 w-8" />
    </div>
    <h3 className="text-[15px] font-semibold text-gray-900 dark:text-white">
      {filter === 'all' ? 'No images yet' : `No ${filter} images yet`}
    </h3>
    <p className="mt-1.5 max-w-xs text-[13px] text-gray-500 dark:text-gray-400">
      Describe an image above or pick a style to get started — it’ll show up here, neatly organized.
    </p>
  </div>
)

export default AlbumView

