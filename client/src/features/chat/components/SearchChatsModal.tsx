/**
 * SearchChatsModal — ChatGPT-style "Search chats" command palette.
 *
 * Opened from the sidebar "Search chats" button. Two modes:
 *  - Empty query: shows a "New chat" action + the user's conversations grouped
 *    into Today / Yesterday / Previous 7 Days / Older.
 *  - With a query: hits GET /api/chat/search and lists matching conversations
 *    with a snippet of the matching message; the query term is highlighted.
 *
 * Selecting a result navigates to that conversation and (when the match is a
 * specific message) tells the parent to scroll-to + highlight it for ~10s.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X, PenSquare, MessageSquare } from 'lucide-react'
import { apiRequest } from '@/lib/queryClient'
import { ChatConversation } from '../types/chat.types'

export interface SearchResult {
  conversationId: number
  title: string
  lastMessageAt?: string | Date | null
  snippet?: string | null
  matchedMessageId?: number | null
  titleMatch?: boolean
}

interface SearchChatsModalProps {
  open: boolean
  onClose: () => void
  conversations: ChatConversation[]
  workspaceId?: string | null
  /** Open a conversation; optionally scroll-to/highlight a matched message. */
  onOpenConversation: (conversationId: number, matchedMessageId?: number | null, query?: string) => void
  onNewChat: () => void
}

/** Highlight occurrences of `term` inside `text` with a soft yellow mark. */
function Highlighted({ text, term }: { text: string; term: string }) {
  if (!term) return <>{text}</>
  const parts: React.ReactNode[] = []
  const lower = text.toLowerCase()
  const t = term.toLowerCase()
  let i = 0
  let key = 0
  while (i < text.length) {
    const idx = lower.indexOf(t, i)
    if (idx === -1) { parts.push(text.slice(i)); break }
    if (idx > i) parts.push(text.slice(i, idx))
    parts.push(
      <mark key={key++} className="bg-yellow-200 dark:bg-yellow-500/30 text-black dark:text-yellow-100 rounded-[2px] px-0.5">
        {text.slice(idx, idx + term.length)}
      </mark>
    )
    i = idx + term.length
  }
  return <>{parts}</>
}

/** Group conversations by date buckets for the empty-query state. */
function groupByDate(convs: ChatConversation[]) {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000
  const sevenDaysAgo = startOfToday - 7 * 24 * 60 * 60 * 1000

  const buckets: { label: string; items: ChatConversation[] }[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Previous 7 Days', items: [] },
    { label: 'Older', items: [] },
  ]
  for (const c of convs) {
    const t = new Date((c as any).lastMessageAt || (c as any).updatedAt || (c as any).createdAt || 0).getTime()
    if (t >= startOfToday) buckets[0].items.push(c)
    else if (t >= startOfYesterday) buckets[1].items.push(c)
    else if (t >= sevenDaysAgo) buckets[2].items.push(c)
    else buckets[3].items.push(c)
  }
  return buckets.filter((b) => b.items.length > 0)
}

export const SearchChatsModal: React.FC<SearchChatsModalProps> = ({
  open,
  onClose,
  conversations,
  workspaceId,
  onOpenConversation,
  onNewChat,
}) => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset + focus when opened.
  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setTimeout(() => inputRef.current?.focus(), 40)
    }
  }, [open])

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Debounced server search when the query changes.
  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (!q) { setResults([]); setLoading(false); return }
    setLoading(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      // Instant client-side title matches from the conversations we already have,
      // so title hits show even before (or regardless of) the server response.
      const lower = q.toLowerCase()
      const titleHits: SearchResult[] = (conversations || [])
        .filter((c) => (c.title || '').toLowerCase().includes(lower))
        .map((c) => ({ conversationId: c.id, title: c.title, titleMatch: true }))
      setResults(titleHits)
      try {
        const r = await apiRequest(`/api/chat/search?q=${encodeURIComponent(q)}&workspaceId=${encodeURIComponent(workspaceId || '')}`)
        const serverResults: SearchResult[] = Array.isArray(r?.results) ? r.results : []
        // Merge: server results (which include content/card snippets) win per
        // conversation; fall back to client title hits for anything the server missed.
        const byId = new Map<number, SearchResult>()
        for (const t of titleHits) byId.set(t.conversationId, t)
        for (const s of serverResults) byId.set(s.conversationId, s)
        setResults(Array.from(byId.values()))
      } catch {
        // Keep the client-side title hits if the server call fails.
        setResults(titleHits)
      } finally {
        setLoading(false)
      }
    }, 220)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, open, workspaceId, conversations])

  const grouped = useMemo(() => groupByDate(conversations || []), [conversations])

  if (!open) return null

  const selectConversation = (r: SearchResult) => {
    onOpenConversation(r.conversationId, r.matchedMessageId, query.trim())
    onClose()
  }

  const hasQuery = query.trim().length > 0

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-start justify-center pt-[12vh] px-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-gray-200/80 dark:border-white/10 overflow-hidden animate-in zoom-in-95 fade-in duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input header */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100 dark:border-white/10">
          <Search className="w-5 h-5 text-gray-400 dark:text-gray-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats…"
            className="flex-1 bg-transparent outline-none text-[15px] text-black dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
          />
          <button onClick={onClose} className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto sidebar-scroll py-2">
          {!hasQuery ? (
            <>
              {/* New chat action */}
              <button
                onClick={() => { onNewChat(); onClose() }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-black dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
              >
                <PenSquare className="w-[18px] h-[18px] text-blue-500 dark:text-blue-400" />
                <span className="font-medium">New chat</span>
              </button>

              {grouped.map((bucket) => (
                <div key={bucket.label} className="mt-1.5">
                  <div className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    {bucket.label}
                  </div>
                  {bucket.items.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => selectConversation({ conversationId: c.id, title: c.title })}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-black dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left"
                    >
                      <MessageSquare className="w-[18px] h-[18px] text-gray-400 dark:text-gray-500 shrink-0" />
                      <span className="truncate">{c.title}</span>
                    </button>
                  ))}
                </div>
              ))}
              {grouped.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">No conversations yet.</div>
              )}
            </>
          ) : loading && results.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">Searching…</div>
          ) : results.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">No results for “{query.trim()}”.</div>
          ) : (
            results.map((r) => (
              <button
                key={r.conversationId}
                onClick={() => selectConversation(r)}
                className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left"
              >
                <MessageSquare className="w-[18px] h-[18px] text-gray-400 dark:text-gray-500 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-black dark:text-gray-100 truncate">
                    <Highlighted text={r.title} term={query.trim()} />
                  </div>
                  {r.snippet && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                      <Highlighted text={r.snippet} term={query.trim()} />
                    </div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default SearchChatsModal
