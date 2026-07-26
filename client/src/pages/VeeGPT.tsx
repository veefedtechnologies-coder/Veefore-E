/**
 * VeeGPT Page
 *
 * Thin page wrapper (~150 lines) orchestrating extracted chat components.
 * All heavy logic has been moved to:
 *   - useChatStream hook  → HTTP streaming + chat state management
 *   - ChatInterface          → Message display + input area
 *   - ConversationSidebar   → Conversation list + navigation
 *
 * Task 6.6 - Requirements: 2.2, 14.1, 14.2, 14.5
 */

import React, { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { SEO, seoConfig, generateStructuredData } from '@/lib/seo-optimization'
import {
  Mic, Send, Lightbulb, TrendingUp, Camera,
  Target, Rocket, Edit3, Calendar, X, Download, Play, Wrench
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiRequest } from '@/lib/queryClient'
import { setVeegptLayoutCookie } from '@/lib/bootstrap'
import { useUser } from '@/hooks/useUser'

import { ChatInterface } from '@/features/chat/components/ChatInterface'
import { ConversationSidebar } from '@/features/chat/components/ConversationSidebar'
import { useChatStream } from '@/features/chat/hooks/useChatStream'
import { useSpeechToText } from '@/features/chat/hooks/useSpeechToText'
import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher'
import { useSocialAccounts } from '@/hooks/useSocialAccounts'
import { PostConfirmCard } from '@/features/chat/components/PostConfirmCard'
import { PostListCard } from '@/features/chat/components/PostListCard'
import { EditConfirmCard } from '@/features/chat/components/EditConfirmCard'
import { InfoCard } from '@/features/chat/components/InfoCard'
import { SearchChatsModal } from '@/features/chat/components/SearchChatsModal'
import { VeeGPTSelectors, accountOptionId } from '@/features/chat/components/VeeGPTSelectors'
import { useVeeGPTAgents } from '@/features/chat/hooks/useVeeGPTAgents'
import { ComposerPlusMenu } from '@/features/chat/components/ComposerPlusMenu'
import { getComposerTool } from '@/features/chat/composerTools'

// ─── Local time helpers (for tool-calling: the model needs the user's current
// local date/time to resolve relative times like "tomorrow 5pm" correctly). ──
function localNowStr(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function localTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || '' } catch { return '' }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ChatConversation = {
  id: number
  userId: string
  workspaceId: string
  title: string
  messageCount: number
  lastMessageAt: Date
  createdAt: Date
  updatedAt: Date
}

type ChatMessage = {
  id: number
  conversationId: number
  role: 'user' | 'assistant'
  content: string
  attachments?: { name?: string; mimeType: string; url?: string }[]
  tokensUsed: number
  createdAt: Date | string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const QUICK_PROMPTS = [
  { icon: Lightbulb, text: 'Inspire me!' },
  { icon: TrendingUp, text: "What's trending in my industry?" },
  { icon: Camera, text: 'Caption an image' },
  { icon: Target, text: 'I need a campaign idea' },
  { icon: Rocket, text: 'How can I boost engagement?' },
  { icon: Edit3, text: 'Draft a TikTok script' },
  { icon: Edit3, text: 'Write an Instagram post' },
  { icon: Calendar, text: 'Draft a posting schedule for next month' },
]

// Cache helpers (localStorage, 24-hour expiry)
const CACHE_KEY = 'veegpt-state'
const getCachedState = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Date.now() - parsed.timestamp < 86_400_000) return parsed
    }
  } catch (_) {}
  return null
}
const setCachedState = (conversationId: number | null, hasSentFirstMessage: boolean) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ conversationId, hasSentFirstMessage, timestamp: Date.now() })) } catch (_) {}
}
const clearCachedState = () => {
  try { localStorage.removeItem(CACHE_KEY) } catch (_) {}
}

// ─── Default export ───────────────────────────────────────────────────────────

export default function VeeGPT() {
  return (
    <>
      <SEO {...seoConfig.veeGPT} structuredData={generateStructuredData.softwareApplication()} />
      <VeeGPTContent />
    </>
  )
}

// ─── Page Orchestrator ────────────────────────────────────────────────────────

function VeeGPTContent() {
  const { userData, loading: userLoading, user: firebaseUser } = useUser()
  const queryClient = useQueryClient()

  // Normalize user data across Firebase / API sources
  const displayUserData = userData || (firebaseUser ? {
    displayName: firebaseUser.displayName,
    email: firebaseUser.email,
    avatar: firebaseUser.photoURL,
    plan: 'Free',
  } : null)
  const finalUserData = displayUserData ? {
    displayName: displayUserData.displayName || (displayUserData as any).username,
    email: displayUserData.email,
    avatar: displayUserData.avatar || (displayUserData as any).photoURL,
    plan: displayUserData.plan || 'Free',
  } : null

  // ── Local page state ──────────────────────────────────────────────────────
  const [refreshKey, setRefreshKey] = useState(0)
  const [inputText, setInputText] = useState('')
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null)
  const [hasSentFirstMessage, setHasSentFirstMessage] = useState(false)
  const [hasUserStartedNewChat, setHasUserStartedNewChat] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isInitializing, setIsInitializing] = useState(true)
  const [optimisticMessages, setOptimisticMessages] = useState<ChatMessage[]>([])
  // ChatGPT-style search-chats modal + the message to scroll-to/highlight on open.
  const [searchModalOpen, setSearchModalOpen] = useState(false)
  // True while a brand-new chat's first message is being created (before its
  // conversation id exists). Locks the welcome composer so one send can't spawn
  // two conversations, without blocking sends to OTHER chats (multi-tasking).
  const [newChatPending, setNewChatPending] = useState(false)
  // Synchronous mirror of newChatPending: blocks a rapid double Enter/click from
  // creating two conversations before React state updates (state lags a tick).
  const creatingChatRef = useRef(false)
  const [highlightMessageId, setHighlightMessageId] = useState<number | null>(null)
  const [highlightQuery, setHighlightQuery] = useState<string>('')
  // Whether the AI post agent is mid-flow (drives display so its optimistic
  // shimmer + inline confirm card aren't clobbered by the messages refetch).
  const [postAgentActive, setPostAgentActive] = useState(false)
  // Pending file attachments (images/PDFs) for the next message. We keep the raw
  // File plus a preview; they're base64-encoded and sent with the message.
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  // Generated poster frames for pending video files (keyed by name+size).
  const [pendingVideoPosters, setPendingVideoPosters] = useState<Record<string, string>>({})
  // Fullscreen media viewer (lightbox) for clicking a pending attachment chip.
  const [lightbox, setLightbox] = useState<{ url: string; mimeType: string; name?: string } | null>(null)
  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])
  const fileKey = (f: File) => `${f.name}:${f.size}`
  // STABLE object URLs per file. Recreating these every render makes the
  // <img>/<video> src change constantly so it never paints — cache them.
  const previewUrlCacheRef = useRef<Map<string, string>>(new Map())
  const getPreviewUrl = (f: File): string | undefined => {
    if (!(f.type.startsWith('image/') || f.type.startsWith('video/'))) return undefined
    const key = fileKey(f)
    const cache = previewUrlCacheRef.current
    if (!cache.has(key)) cache.set(key, URL.createObjectURL(f))
    return cache.get(key)
  }
  const attachmentPreviews = pendingFiles.map((f) => ({
    name: f.name,
    mimeType: f.type,
    previewUrl: getPreviewUrl(f),
    posterUrl: f.type.startsWith('video/') ? pendingVideoPosters[fileKey(f)] : undefined,
  }))
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Generate poster frames for any pending video files so the input preview
  // shows a still thumbnail (not a chip) before sending.
  useEffect(() => {
    pendingFiles.forEach((f) => {
      if (!f.type.startsWith('video/')) return
      const key = fileKey(f)
      if (pendingVideoPosters[key]) return
      videoPosterFromFile(f).then((poster) => {
        if (poster) setPendingVideoPosters((prev) => (prev[key] ? prev : { ...prev, [key]: poster }))
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFiles])

  // ── Chat streaming hook (HTTP streaming, not WebSocket) ───────────────────
  const {
    isGenerating,
    aiStatus,
    streamingContent,
    streamingConvId,
    generatingConvIds,
    subscribeToConversation,
    sendMessage: wsSendMessage,
    createAndStream,
    regenerate,
    stopGeneration,
    clearStreamingContent,
    isGeneratingRef,
  } = useChatStream()

  // Voice dictation for the welcome-screen composer (browser-native Web Speech
  // API → OS mic-permission prompt; no getUserMedia hack).
  const welcomeDictateBaseRef = useRef('')
  const welcomeVoice = useSpeechToText({
    onStart: () => { welcomeDictateBaseRef.current = (inputText || '').trim() },
    onText: (transcript) => {
      const base = welcomeDictateBaseRef.current
      setInputText((base ? base + ' ' : '') + transcript)
    },
  })

  // The workspace the user is actively viewing — VeeGPT scopes its context
  // (accounts, analytics, recommendations) to THIS workspace.
  const { currentWorkspaceId } = useCurrentWorkspace()
  const { validAccounts } = useSocialAccounts(currentWorkspaceId || undefined)

  // ── Advanced VeeGPT composer selectors ────────────────────────────────────
  // Which agent (persona) answers, and which connected social account VeeGPT is
  // focused on. When an account is selected, the backend fetches that account's
  // full data ON DEMAND (via the get_account_details tool) instead of stuffing
  // it into every prompt.
  const { agents: veegptAgents } = useVeeGPTAgents()
  const [selectedAgentId, setSelectedAgentId] = useState<string>('default')
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  // A tool the user explicitly armed from the composer "+" → Tools menu. When set,
  // VeeGPT is forced to run that tool on the next message; cleared after sending.
  const [selectedTool, setSelectedTool] = useState<string | null>(null)
  // If the selected account disappears (disconnected / workspace switch), reset.
  useEffect(() => {
    if (selectedAccountId && !validAccounts.some((a: any) => accountOptionId(a) === selectedAccountId)) {
      setSelectedAccountId(null)
    }
  }, [validAccounts, selectedAccountId])
  // Reset the account focus when switching workspaces (accounts differ per ws).
  useEffect(() => { setSelectedAccountId(null) }, [currentWorkspaceId])

  // Debounce refreshKey when user data changes
  useEffect(() => {
    if (finalUserData) {
      const t = setTimeout(() => setRefreshKey(k => k + 1), 100)
      return () => clearTimeout(t)
    }
  }, [finalUserData])

  // ── Data fetching ─────────────────────────────────────────────────────────
  const { data: conversations = [], isLoading: conversationsLoading } = useQuery<ChatConversation[]>({
    queryKey: ['/api/chat/conversations'],
    // Scope the list to the workspace the user is actively viewing. The query
    // key is kept workspace-agnostic on purpose (so the many optimistic
    // setQueryData/invalidate calls elsewhere keep targeting one cache); a
    // dedicated effect below refetches when the workspace changes.
    queryFn: () => apiRequest('/api/chat/conversations?workspaceId=' + encodeURIComponent(currentWorkspaceId || '')),
  })

  // Persist a lightweight "has conversations" hint so the VeeGPT Page_Skeleton
  // (Suspense fallback, rendered before this bundle mounts) can predict whether
  // the conversation sidebar will show on the welcome screen — without it the
  // skeleton cannot tell a brand-new user (no sidebar) from a returning user on
  // the new-chat page (sidebar present). Survives `startNewChat` (unlike the
  // chat-state cache) so the prediction stays correct.
  useEffect(() => {
    if (conversationsLoading) return
    try {
      localStorage.setItem('veegpt-has-conversations', conversations.length > 0 ? '1' : '0')
    } catch (_) {}
  }, [conversationsLoading, conversations.length])

  // ── Workspace switch ────────────────────────────────────────────────────────
  // When the user switches VeeFore workspace/account, conversations are scoped
  // to that workspace server-side. Refetch the (workspace-agnostic-keyed) list
  // and reset to a fresh new-chat view so a conversation from the previous
  // workspace isn't left open in the main panel.
  //
  // `currentWorkspaceId` resolves asynchronously (null → real id), so we must
  // distinguish three cases: first observation (scope the list but DON'T wipe a
  // conversation restored from cache), null→real (scope the list, no reset), and
  // a genuine real→real switch (scope + full reset).
  const prevWorkspaceIdRef = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    const prev = prevWorkspaceIdRef.current
    const curr = currentWorkspaceId || null
    prevWorkspaceIdRef.current = curr
    if (prev === curr) return
    if (prev === undefined) {
      // First observation. If a workspace is already known, scope the list.
      if (curr) queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations'], exact: true })
      return
    }
    // A genuine real→real workspace switch resets the open conversation; a
    // late null→real resolution only re-scopes the list.
    if (prev && curr) {
      setCurrentConversationId(null)
      setHasSentFirstMessage(false)
      setInputText('')
      clearStreamingContent()
      setOptimisticMessages([])
      clearCachedState()
      postConvIdRef.current = null
      postAgentMsgsRef.current = []
      postMediaUrlsRef.current = []
      postHasVideoRef.current = false
      setPostAgentActive(false)
    }
    queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations'], exact: true })
  }, [currentWorkspaceId])

  const { data: messages = [], isLoading: messagesLoading } = useQuery<ChatMessage[]>({
    queryKey: ['/api/chat/conversations', currentConversationId, 'messages'],
    queryFn: () => apiRequest(`/api/chat/conversations/${currentConversationId}/messages`),
    enabled: !!currentConversationId,
    // Don't refetch on focus/mount/reconnect — the messages cache is kept in
    // sync via HTTP streaming + optimistic writes. Aggressive refetching
    // briefly empties the list and makes the just-sent message flicker.
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    staleTime: 30_000,
  })

  // ── Display messages composition ─────────────────────────────────────────
  let displayMessages: ChatMessage[] = [...messages]
  // While the post agent is active we render its optimistic thread (live shimmer
  // + inline confirm card) so the server messages refetch can't clobber it.
  if (optimisticMessages.length > 0 && (postAgentActive || !currentConversationId || messages.length === 0)) {
    if (postAgentActive && messages.length > 0) {
      // Continuing inside an existing conversation: keep the persisted history
      // and append the optimistic agent messages on top (don't hide history).
      const existingIds = new Set(messages.map((m) => m.id))
      displayMessages = [...messages, ...optimisticMessages.filter((m) => !existingIds.has(m.id))]
    } else {
      displayMessages = [...optimisticMessages]
    }
  }

  // After a routeToChat handoff the post agent is no longer active, but a stray
  // empty assistant placeholder from its optimistic thread can linger for a
  // frame and render a SECOND "Analyzing…/Thinking" block beneath the real
  // streamed reply. Drop empty optimistic assistant placeholders once the post
  // agent is done — the streaming hook's own indicator covers the gap.
  if (!postAgentActive) {
    displayMessages = displayMessages.filter(
      (m) => !(m.role === 'assistant' && (!m.content || !m.content.trim()) && streamingContent[m.id] === undefined),
    )
  }

  // Clear optimistic messages once real messages load — but NOT while the post
  // agent is mid-flow (its UI lives entirely in optimistic messages).
  useEffect(() => {
    if (!postAgentActive && currentConversationId && messages.length > 0 && optimisticMessages.length > 0) {
      setOptimisticMessages([])
    }
  }, [postAgentActive, currentConversationId, messages.length, optimisticMessages.length])

  // Clear a streaming buffer ONCE its persisted content has landed in the cache.
  // Skip while THIS conversation is still generating — otherwise a regenerate
  // (which streams into a message that already has old content) would be cleared
  // mid-stream and the live text would jump to the bottom placeholder.
  useEffect(() => {
    if (currentConversationId && messages.length > 0 && !generatingConvIds[currentConversationId]) {
      Object.keys(streamingContent).forEach(id => {
        const numId = parseInt(id)
        const real = messages.find(m => m.id === numId)
        if (real?.content?.trim()) clearStreamingContent(numId)
      })
    }
  }, [currentConversationId, messages, streamingContent, clearStreamingContent, generatingConvIds])

  // Inject streaming placeholders into the display list — ONLY for messages that
  // definitively belong to the conversation on screen (exact match; an unknown or
  // other-conversation stream is never injected), so an in-flight reply in another
  // chat can't bleed into this one during multi-tasking.
  Object.keys(streamingContent).forEach(id => {
    const numId = parseInt(id)
    if (streamingConvId[numId] !== currentConversationId) return
    if (!displayMessages.some(m => m.id === numId)) {
      displayMessages.push({ id: numId, conversationId: currentConversationId || 0, role: 'assistant', content: '', tokensUsed: 0, createdAt: new Date() })
    }
  })

  // ── Final dedup invariant (production safety net) ──────────────────────────
  // VeeGPT composes the visible thread from TWO optimistic systems (the
  // post-agent's `optimisticMessages` and the streaming hook's React Query
  // cache) plus the persisted DB records. Because the optimistic user bubble and
  // its persisted record now share the SAME id (the client generates the id and
  // the server honors it in /conversations/log), id-based dedup collapses them
  // into one. This pass enforces that invariant unconditionally: each message id
  // renders exactly once, preferring the entry that actually has content (the
  // persisted/streamed record) over an empty optimistic placeholder.
  {
    const byId = new Map<number, ChatMessage>()
    for (const m of displayMessages) {
      const existing = byId.get(m.id)
      if (!existing) { byId.set(m.id, m); continue }
      // Same id seen twice → keep the one with real content (or the streaming
      // target if this id is actively streaming), so we never drop the live reply.
      const existingHasContent = !!existing.content?.trim()
      const currentHasContent = !!m.content?.trim()
      if (!existingHasContent && currentHasContent) byId.set(m.id, m)
    }
    displayMessages = Array.from(byId.values())
  }

  // Hard conversation-scope guard: only ever render messages that belong to the
  // conversation on screen (or not-yet-persisted optimistic ones with no convId).
  // This guarantees a reply from another chat can never visually bleed in, even
  // if a cache write slipped through during concurrent multi-tasking streams.
  if (currentConversationId) {
    displayMessages = displayMessages.filter(
      (m) => !m.conversationId || m.conversationId === currentConversationId,
    )
  }

  // The generating state for the CURRENTLY VIEWED conversation only. This is what
  // enables multi-tasking: a chat that isn't streaming shows Send (you can fire
  // a new message) even while another chat is still streaming in the background.
  const viewGenerating = currentConversationId
    ? !!generatingConvIds[currentConversationId]
    : (isGenerating || newChatPending)

  // ── Mutations ─────────────────────────────────────────────────────────────
  const stopGenerationMutation = useMutation({
    mutationFn: (vars: { convId: number; messageId?: number; content?: string }) =>
      apiRequest(`/api/chat/conversations/${vars.convId}/stop`, {
        method: 'POST',
        body: JSON.stringify({ messageId: vars.messageId, content: vars.content }),
      }),
    onSuccess: () => {
      // Do NOT refetch messages here — the client already froze the revealed
      // partial into the cache and the server persisted exactly that partial, so
      // a refetch is unnecessary and could race the server write.
      queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations'] })
    },
  })

  // ── Attachment handlers ───────────────────────────────────────────────────
  const MAX_FILES = 5
  const ALLOWED = [
    'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'application/pdf',
    'video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v',
  ]
  const addAttachments = (files: FileList | File[]) => {
    const incoming = Array.from(files).filter((f) => ALLOWED.includes(f.type))
    setPendingFiles((prev) => {
      const merged = [...prev]
      for (const f of incoming) {
        if (merged.length >= MAX_FILES) break
        // Avoid obvious dupes by name+size.
        if (!merged.some((m) => m.name === f.name && m.size === f.size)) merged.push(f)
      }
      return merged
    })
  }
  const removeAttachment = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index))
  }
  /** Read a File into { mimeType, data(base64), name }. */
  const fileToAttachment = (file: File): Promise<{ mimeType: string; data: string; name: string }> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = String(reader.result || '')
        const comma = result.indexOf(',')
        resolve({ mimeType: file.type, data: comma !== -1 ? result.slice(comma + 1) : result, name: file.name })
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

  /** Capture a static poster frame (data URL) from a video File so chat shows a
   *  still thumbnail instead of a playable-looking clip. Falls back to null.
   *  Robust across browsers (incl. Safari): mounts an off-screen video, waits
   *  for a decodable frame, seeks, then draws to a canvas. */
  const videoPosterFromFile = (file: File): Promise<string | null> =>
    new Promise((resolve) => {
      let url: string | null = null
      let done = false
      const video = document.createElement('video')
      const cleanup = () => {
        try { video.removeAttribute('src'); video.load() } catch {}
        try { if (video.parentNode) video.parentNode.removeChild(video) } catch {}
        if (url) { try { URL.revokeObjectURL(url) } catch {} ; url = null }
      }
      const finish = (result: string | null) => {
        if (done) return
        done = true
        cleanup()
        resolve(result)
      }
      try {
        url = URL.createObjectURL(file)
        video.muted = true
        ;(video as any).playsInline = true
        video.preload = 'auto'
        video.crossOrigin = 'anonymous'
        // Off-screen but in the DOM — Safari needs an attached element to decode.
        video.style.position = 'fixed'
        video.style.left = '-10000px'
        video.style.top = '0'
        video.style.width = '2px'
        video.style.height = '2px'
        video.style.opacity = '0'
        video.style.pointerEvents = 'none'
        document.body.appendChild(video)
        video.src = url

        const capture = () => {
          try {
            const w = video.videoWidth || 320
            const h = video.videoHeight || 320
            if (!w || !h) return // no decoded frame yet
            const canvas = document.createElement('canvas')
            canvas.width = w
            canvas.height = h
            const ctx = canvas.getContext('2d')
            if (!ctx) return finish(null)
            ctx.drawImage(video, 0, 0, w, h)
            const data = canvas.toDataURL('image/jpeg', 0.7)
            // A fully-black/empty frame is ~tiny; if so, treat as failure.
            finish(data && data.length > 1000 ? data : null)
          } catch { finish(null) }
        }

        // Prefer requestVideoFrameCallback — it fires ONLY when a real frame is
        // actually painted, which is the reliable signal across codecs/browsers
        // that drawImage will produce a non-black thumbnail. We let the video
        // play (muted) for a frame, grab it, then pause.
        const anyVideo = video as any
        const grabViaRVFC = () => {
          try {
            anyVideo.requestVideoFrameCallback(() => {
              capture()
              try { video.pause() } catch {}
            })
          } catch {
            // Older browsers: fall back to a timed capture after play starts.
            setTimeout(() => { if (!done) capture() }, 250)
          }
        }

        video.onloadedmetadata = () => {
          // Seek slightly past the start so we skip a black leading keyframe.
          const t = Math.min(0.1, (video.duration || 1) / 2)
          try { video.currentTime = t } catch {}
          if (typeof anyVideo.requestVideoFrameCallback === 'function') grabViaRVFC()
        }
        // Once a real frame is decoded after seeking, capture it.
        video.onseeked = () => {
          if (typeof anyVideo.requestVideoFrameCallback === 'function') grabViaRVFC()
          else capture()
        }
        video.onerror = () => finish(null)
        // Kick decoding (muted playback is allowed and forces a frame to render).
        video.play().then(() => {
          if (typeof anyVideo.requestVideoFrameCallback === 'function') grabViaRVFC()
        }).catch(() => {
          // Autoplay blocked — seek will still fire onseeked above.
        })
        setTimeout(() => finish(null), 6000)
      } catch { finish(null) }
    })

  // ── Handlers ──────────────────────────────────────────────────────────────

  // While we prepare a post (parse → upload image → generate caption/hashtags), we
  // show a shimmering assistant message in the chat.
  const [preparingMessageId, setPreparingMessageId] = useState<number | null>(null)
  const [preparingStatus, setPreparingStatus] = useState<string>('')
  const postConvIdRef = useRef<number | null>(null)
  // Last plain-text message sent, for one-tap Retry after a provider failure.
  const lastUserTextRef = useRef<string>('')

  // ── Post Agent (AI-driven, no composer) ───────────────────────────────────
  // The agent reasons in chat: it asks for what it needs and, when ready, shows
  // an inline one-tap confirm card. We keep the running agent conversation, the
  // uploaded media URLs, and the current ready-plan here.
  // (postAgentActive is declared above with the main page state.)
  const postAgentMsgsRef = useRef<{ role: 'user' | 'assistant'; content: string }[]>([])
  const postMediaUrlsRef = useRef<string[]>([])
  // Whether any uploaded media in this post is a video (→ reel).
  const postHasVideoRef = useRef<boolean>(false)
  // Per-message persisted cards (keyed by assistant message id) so the inline
  // confirm card survives refresh and renders from chat history.
  const [postCardByMsg, setPostCardByMsg] = useState<Record<number, { plan: any; mediaUrls: string[]; status: 'idle' | 'working' | 'done' | 'error'; resultText?: string }>>({})
  // Maps an optimistic assistant message id → the real persisted server message
  // id, so confirm/cancel can update the correct stored card (avoids 404s).
  const postCardServerIdRef = useRef<Record<number, number>>({})
  // Live edit-card state keyed by `${messageId}:${cardId}` (status while applying/after).
  const [editCardByMsg, setEditCardByMsg] = useState<Record<string, { status: 'idle' | 'working' | 'done' | 'error'; resultText?: string }>>({})

  /** Confirm or cancel ONE inline edit card → applies the change server-side. */
  const applyEdit = async (msgId: number, cardId: string | undefined, action: 'confirm' | 'cancel') => {
    const key = `${msgId}:${cardId || ''}`
    setEditCardByMsg((prev) => ({ ...prev, [key]: { status: 'working' } }))
    try {
      const r = await apiRequest(`/api/chat/messages/${msgId}/apply-edit`, {
        method: 'POST',
        body: JSON.stringify({ action, cardId, workspaceId: currentWorkspaceId, localNow: localNowStr() }),
      })
      setEditCardByMsg((prev) => ({ ...prev, [key]: { status: (r?.status as any) || 'done', resultText: r?.resultText } }))
      if (currentConversationId) queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations', currentConversationId, 'messages'] })
    } catch (e: any) {
      setEditCardByMsg((prev) => ({ ...prev, [key]: { status: 'error', resultText: e?.message || 'Could not apply the change' } }))
    }
  }

  const handleSendMessage = async () => {
    const content = inputText.trim()
    const filesToSend = pendingFiles
    if (!content && filesToSend.length === 0) return

    // Consult the AI post-agent if there's ANY posting signal (broad gate) or
    // if we're already mid-flow. The LLM is the primary decider — it returns
    // none/ask/ready. The strict regex is only used as a fallback when the AI
    // is unreachable.
    const hasMediaPending = filesToSend.some((f) => f.type.startsWith('image/') || f.type.startsWith('video/'))

    // Re-entrancy lock for NEW-chat creation only: a single send action must not
    // spawn two conversations (double Enter/click before state updates). This is
    // NOT a global "is generating" block — sends to existing/idle chats are still
    // allowed concurrently, so multi-tasking works.
    const willCreateNewChat = !currentConversationId && !postAgentActive && !hasMediaPending
    if (willCreateNewChat) {
      if (creatingChatRef.current) return
      creatingChatRef.current = true
      setNewChatPending(true)
    }
    // ─── ROUTING (deterministic, not regex) ──────────────────────────────────
    // • Media attached OR already mid post-flow → use the PROVEN post-agent
    //   media flow (hosted upload, poster frames, confirm card, publish).
    //   Attaching media is a hard, near-certain posting signal — not keyword
    //   guessing — and the post-agent path handles media reliably.
    // • Otherwise → the unified tool-calling streaming chat (single rendering
    //   system, LLM-driven intent, no duplicate bubbles). For plain text the
    //   model still raises a schedule_post tool call when the user wants to post
    //   and asks for media when it's missing.
    const enterPostAgent = postAgentActive || hasMediaPending
    if (enterPostAgent) {
      const mediaFiles = filesToSend.filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'))
      const hasVideo = mediaFiles.some((f) => f.type.startsWith('video/'))
      // Local preview URLs so a thumbnail shows the INSTANT the message sends
      // (before the hosted URL arrives). Swapped for hosted URLs after upload.
      const localAttachments = filesToSend.map((f) => ({
        name: f.name,
        mimeType: f.type,
        url: (f.type.startsWith('image/') || f.type.startsWith('video/')) ? URL.createObjectURL(f) : undefined,
      })).filter((a) => a.url) as { name: string; mimeType: string; url: string; posterUrl?: string }[]

      setInputText('')
      if (textareaRef.current) textareaRef.current.value = ''
      setPendingFiles([])
      setHasSentFirstMessage(true)
      setPostAgentActive(true)

      // ONE client-generated id shared by the optimistic bubble, the cache entry,
      // and the persisted server record — so they all collapse to a single bubble
      // (no duplicates) and the media renders straight from the messages cache,
      // ChatGPT-style (survives refresh; never disappears/reappears).
      const userMsgId = Date.now()
      const prepId = userMsgId + 1
      const convId = postConvIdRef.current || currentConversationId

      // Show the user's message + a shimmering assistant placeholder during the
      // brief upload window. (postAgentActive keeps this optimistic thread
      // visible without the messages refetch clobbering it.)
      setOptimisticMessages((prev) => ([
        ...prev,
        { id: userMsgId, conversationId: convId || 0, role: 'user', content: content || ' ', attachments: localAttachments.length ? (localAttachments as any) : undefined, tokensUsed: 0, createdAt: new Date() },
        { id: prepId, conversationId: convId || 0, role: 'assistant', content: '', tokensUsed: 0, createdAt: new Date() },
      ]))
      setPreparingMessageId(prepId)
      setPreparingStatus(hasVideo ? 'Uploading your video…' : mediaFiles.length ? 'Uploading your image…' : 'Thinking…')

      // Generate static poster frames for video attachments → patch the bubble.
      filesToSend.forEach((f, idx) => {
        if (!f.type.startsWith('video/')) return
        videoPosterFromFile(f).then((poster) => {
          if (!poster) return
          setOptimisticMessages((prev) => prev.map((m) => {
            if (m.id !== userMsgId || !m.attachments) return m
            const next = m.attachments.map((a, i) => (i === idx ? { ...a, posterUrl: poster } : a))
            return { ...m, attachments: next as any }
          }))
        })
      })

      try {
        // Upload media → hosted URLs.
        if (mediaFiles.length) {
          const uploadOne = async (f: File): Promise<string | null> => {
            for (let attempt = 0; attempt < 2; attempt++) {
              try {
                const form = new FormData()
                form.append('image', f) // handler accepts images + videos
                const up = await apiRequest('/api/video/upload-image', { method: 'POST', body: form })
                const url = up?.imageUrl || up?.url || up?.videoUrl
                if (url) return url.startsWith('http') ? url : `${window.location.origin}${url}`
              } catch (err) {
                console.error('[VeeGPT] media upload attempt failed', attempt, err)
              }
            }
            return null
          }
          const uploaded = (await Promise.all(mediaFiles.map(uploadOne))).filter(Boolean) as string[]
          postMediaUrlsRef.current = uploaded
          if (hasVideo && uploaded.length) postHasVideoRef.current = true

          // Upload failed entirely → tell the user (keep the bubble), don't stream.
          if (!uploaded.length) {
            setPreparingMessageId(null)
            const kind = hasVideo ? 'video' : 'image'
            const errText = `I couldn't upload that ${kind} — it may be too large or an unsupported format. Could you try attaching it again?`
            if (convId) {
              // Existing conversation: write the bubble + error into the cache so
              // they render from the canonical thread (optimistic isn't shown for
              // a persisted conversation).
              queryClient.setQueryData(['/api/chat/conversations', convId, 'messages'], (old: any) => {
                const list = Array.isArray(old) ? old : []
                const next = list.some((m: any) => m.id === userMsgId) ? list : [...list, { id: userMsgId, conversationId: convId, role: 'user', content: content || ' ', attachments: localAttachments.length ? localAttachments : undefined, tokensUsed: 0, createdAt: new Date().toISOString() }]
                return [...next, { id: prepId, conversationId: convId, role: 'assistant', content: errText, tokensUsed: 0, createdAt: new Date().toISOString() }]
              })
              setOptimisticMessages((prev) => prev.filter((m) => m.id !== prepId && m.id !== userMsgId))
              setPostAgentActive(false)
            } else {
              // No conversation yet: keep the optimistic thread visible with the error.
              setOptimisticMessages((prev) => prev.map((m) => (m.id === prepId ? { ...m, content: errText } : m)))
            }
            return
          }
        }

        // Build the optimistic attachments WITH hosted URLs (+ preserved posters)
        // for the streaming hook so the bubble is identical before/after handoff.
        const posterByIdx: Record<number, string | undefined> = {}
        setOptimisticMessages((prev) => {
          const u = prev.find((m) => m.id === userMsgId)
          u?.attachments?.forEach((a: any, i) => { posterByIdx[i] = a.posterUrl })
          return prev
        })
        const hostedAttachments = mediaFiles.map((f, i) => ({
          name: f.name, mimeType: f.type, url: postMediaUrlsRef.current[i], posterUrl: posterByIdx[i],
        })).filter((a) => a.url)

        const nowDate = new Date()
        const pad = (n: number) => String(n).padStart(2, '0')
        const localNow = `${nowDate.getFullYear()}-${pad(nowDate.getMonth() + 1)}-${pad(nowDate.getDate())}T${pad(nowDate.getHours())}:${pad(nowDate.getMinutes())}`
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

        setPreparingMessageId(null)

        if (convId) {
          // EXISTING conversation: seed the user bubble (hosted media) into the
          // canonical messages cache, then drop the optimistic thread. The cache
          // now owns the bubble (no gap), and the streaming hook renders the
          // assistant reply + any confirm card into the same cache.
          if (currentConversationId !== convId) setCurrentConversationId(convId)
          queryClient.setQueryData(['/api/chat/conversations', convId, 'messages'], (old: any) => {
            const list = Array.isArray(old) ? old : []
            if (list.some((m: any) => m.id === userMsgId)) return list
            return [...list, { id: userMsgId, conversationId: convId, role: 'user', content: content || ' ', attachments: hostedAttachments.length ? hostedAttachments : undefined, tokensUsed: 0, createdAt: new Date().toISOString() }]
          })
          setOptimisticMessages((prev) => prev.filter((m) => m.id !== prepId && m.id !== userMsgId))
          setPostAgentActive(false)
          await wsSendMessage(convId, content, currentWorkspaceId || undefined, [], {
            seedOptimistic: false,
            includeWorkspaceContext: true,
            enableTools: true,
            localNow,
            timezone,
            userMessageId: userMsgId,
            mediaUrls: postMediaUrlsRef.current,
          })
        } else {
          // NEW conversation: keep the optimistic user bubble visible (no convId
          // yet) and stream. createAndStream seeds the cache (same userMsgId) on
          // the conversation event; the server persists the hosted media on that
          // record so it survives refresh. Clear optimistic once we have the id.
          setOptimisticMessages((prev) => prev.filter((m) => m.id !== prepId))
          const result = await createAndStream(content, currentWorkspaceId || undefined, [], {
            enableTools: true,
            localNow,
            timezone,
            userMessageId: userMsgId,
            optimisticAttachments: hostedAttachments as any,
            mediaUrls: postMediaUrlsRef.current,
            onConversation: (cid) => { setCurrentConversationId(cid); setOptimisticMessages([]) },
          })
          if (result?.conversationId) {
            // Don't switch the view on completion (onConversation already did at
            // creation) — only track the id for the post flow and refresh the list.
            postConvIdRef.current = result.conversationId
            queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations'], exact: true })
          }
        }
      } catch (e) {
        console.error('[VeeGPT] media post flow error', e)
        setPreparingMessageId(null)
        setOptimisticMessages((prev) => prev.map((m) => (m.id === prepId ? { ...m, content: 'I hit a snag — please try again in a moment.' } : m)))
        setPostAgentActive(false)
      } finally {
        setPostAgentActive(false)
        postMediaUrlsRef.current = []
        postHasVideoRef.current = false
      }
      return
    }

    setInputText('')
    if (textareaRef.current) textareaRef.current.value = ''
    setPendingFiles([])

    // Remember the last plain-text message so a failed (rate-limited) turn can
    // be retried with one tap.
    lastUserTextRef.current = content

    isGeneratingRef.current = true

    try {
      // Encode attachments to base64 for transport.
      const attachments = await Promise.all(filesToSend.map(fileToAttachment))
      const attachMeta = filesToSend.map((f) => ({ name: f.name, mimeType: f.type }))
      const displayContent = content || ' '
      if (!currentConversationId) {
        // New conversation: optimistically show the user's message, then create
        // + stream the reply over a single HTTP request.
        setOptimisticMessages([{ id: Date.now(), conversationId: 0, role: 'user', content: displayContent, attachments: attachMeta.length ? attachMeta : undefined, tokensUsed: 0, createdAt: new Date() }])
        setHasSentFirstMessage(true)
        const result = await createAndStream(content, currentWorkspaceId || undefined, attachments, {
          enableTools: true, localNow: localNowStr(), timezone: localTimezone(), hasMedia: attachments.length > 0,
          selectedAccountId, selectedAgentId, forcedTool: selectedTool,
          // Switch to the real conversation the MOMENT it's created (mid-stream),
          // so the messages query enables and inline cards render as they arrive
          // — not only after the whole stream finishes.
          onConversation: (cid) => { setCurrentConversationId(cid); setOptimisticMessages([]); creatingChatRef.current = false; setNewChatPending(false) },
        })
        if (result?.conversationId) {
          // NOTE: do NOT set currentConversationId here. onConversation already
          // switched to this chat at creation time. Re-setting it when the stream
          // FINISHES is what caused two bugs: (1) completing a reply yanked the
          // user back to this chat if they'd navigated away, and (2) if the user
          // opened a new chat while this was finishing, the late switch made the
          // next "hi" get sent into THIS conversation instead of a new one.
          queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations'], exact: true })
        }
      } else {
        await wsSendMessage(currentConversationId, content, currentWorkspaceId || undefined, attachments, { enableTools: true, localNow: localNowStr(), timezone: localTimezone(), hasMedia: attachments.length > 0, selectedAccountId, selectedAgentId, forcedTool: selectedTool })
      }
    } catch (err) {
      setHasSentFirstMessage(false)
      setOptimisticMessages([])
      setInputText(content)
      if (textareaRef.current) textareaRef.current.value = content
    } finally {
      // Always release the new-chat creation lock so the composer never gets
      // stuck disabled (covers the rare path where onConversation never fired).
      if (creatingChatRef.current) { creatingChatRef.current = false; setNewChatPending(false) }
    }
  }

  // ── Post agent: confirm (one-tap) → resolve AI fields, then create + schedule
  //    via the proven content endpoints, and confirm in chat. Operates on a
  //    specific message's card so it works for both the live card and a card
  //    rehydrated from history after refresh. ─────────────────────────────────
  const setCardState = (msgId: number, patch: Partial<{ plan: any; mediaUrls: string[]; status: 'idle' | 'working' | 'done' | 'error'; resultText?: string }>) => {
    setPostCardByMsg((prev) => ({ ...prev, [msgId]: { ...(prev[msgId] || { plan: null, mediaUrls: [], status: 'idle' }), ...patch } }))
  }

  const confirmPost = async (msgId: number, plan: any, mediaUrls: string[]) => {
    if (!plan) return
    console.log('[VeeGPT] confirmPost', { msgId, hasPlan: !!plan, mediaUrls })
    if (!mediaUrls.length) {
      setCardState(msgId, { plan, mediaUrls, status: 'error', resultText: 'No image found — attach one and try again.' })
      setOptimisticMessages((prev) => [...prev, { id: Date.now(), conversationId: 0, role: 'assistant', content: 'I couldn\'t find the media for this post — it may not have uploaded. Please start again and re-attach your image or video.', tokensUsed: 0, createdAt: new Date() } as any])
      return
    }
    // Always carry plan + mediaUrls so the card keeps rendering. (Cards rendered
    // from persisted history have no live state yet; without this, setCardState
    // would seed plan:null and the card would disappear when status flips.)
    setCardState(msgId, { plan, mediaUrls, status: 'working' })
    try {
      // 1) Resolve AI caption/hashtags if the plan asked for it (server-side).
      let caption = (plan.caption || '').toString()
      let hashtags: string[] = Array.isArray(plan.hashtags) ? plan.hashtags : []
      if (plan.generateCaption || plan.generateHashtags) {
        try {
          const r = await apiRequest('/api/chat/post-agent/execute', {
            method: 'POST',
            body: JSON.stringify({ workspaceId: currentWorkspaceId, plan, mediaUrls }),
          })
          if (r?.caption) caption = r.caption
          if (Array.isArray(r?.hashtags) && r.hashtags.length) hashtags = r.hashtags
        } catch {}
      }

      // 2) Create the content (same endpoint the manual flow uses).
      const acct = validAccounts.find((a: any) => (a.id || a._id || a.accountId) === plan.accountId) || validAccounts[0]
      // Detect video media so we save the right content type (Instagram treats
      // a single video as a reel). Honor an explicit 'story' choice.
      const isVideo = mediaUrls.some((u) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u)) || postHasVideoRef.current
      let contentType = plan.type || 'post'
      if (isVideo && contentType !== 'story') contentType = 'reel'
      const created = await apiRequest(`/api/content/workspace/${currentWorkspaceId}`, {
        method: 'POST',
        body: JSON.stringify({
          type: contentType,
          title: (caption || 'New Post').slice(0, 50),
          description: caption,
          platform: acct?.platform || 'instagram',
          contentData: {
            text: caption,
            mediaUrls,
            hashtags,
            mentions: plan.mentions || [],
            collaborators: plan.collaborators || [],
            accountId: acct?.id || acct?._id || acct?.accountId || plan.accountId,
            username: acct?.username || null,
            profilePictureUrl: acct?.profilePictureUrl || null,
          },
        }),
      })
      const contentId = created?.data?.id || created?.data?._id || created?.id || created?._id
      if (!contentId) throw new Error('Could not create the post')

      // 3) Schedule or publish.
      let whenText = 'now'
      if (plan.schedule && plan.scheduledLocal) {
        const dt = new Date(plan.scheduledLocal)
        await apiRequest(`/api/content/${contentId}/schedule`, {
          method: 'POST',
          body: JSON.stringify({ scheduledAt: dt.toISOString(), platform: acct?.platform || 'instagram' }),
        })
        whenText = dt.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
      } else {
        await apiRequest(`/api/content/${contentId}/publish`, { method: 'POST' })
      }
      // Refresh the best-time recommendation immediately instead of waiting out its
      // staleTime. Predicate covers both the analytics hook's key and the calendar's key.
      queryClient.invalidateQueries({
        predicate: (q) => typeof q.queryKey[0] === 'string' && (q.queryKey[0] as string).startsWith('/api/v1/analytics/best-time')
      })

      const doneText = plan.schedule ? `Scheduled for ${whenText}` : 'Published'
      setCardState(msgId, { plan, mediaUrls, status: 'done', resultText: doneText })
      // Persist the card's done state so it stays confirmed after refresh.
      const serverId = postCardServerIdRef.current[msgId] || msgId
      apiRequest(`/api/chat/messages/${serverId}/post-card`, { method: 'POST', body: JSON.stringify({ status: 'done', resultText: doneText, plan }) }).catch(() => {})

      // Confirm in chat + persist a follow-up assistant message.
      const confirmMsg = plan.schedule
        ? `Done — your ${plan.type || 'post'} is scheduled for ${whenText}. You'll find it under Plan → Posts → Scheduled. ✅`
        : `Done — your ${plan.type || 'post'} is live. 🎉`
      postAgentMsgsRef.current.push({ role: 'assistant', content: confirmMsg })

      // SEAMLESS HANDOFF (no flash): before leaving the post-agent's optimistic
      // view, merge the CURRENT optimistic thread + this confirm message into the
      // canonical messages cache. This way, when we flip postAgentActive=false,
      // the cache already holds the full conversation (with the done card and the
      // confirmation) — there is no empty frame and no "clear then repopulate"
      // flicker while the network refetch is in flight.
      const convForRefetch = postConvIdRef.current || currentConversationId
      if (convForRefetch) {
        const doneCardMsgId = msgId
        queryClient.setQueryData(['/api/chat/conversations', convForRefetch, 'messages'], (old: any) => {
          const persisted: any[] = Array.isArray(old) ? old : []
          const seen = new Set(persisted.map((m: any) => m.id))
          // Bring over any optimistic-only turns (ask/reply/ready card) not yet
          // in the cache, stamping the card message with its done state.
          const fromOptimistic = optimisticMessages
            .filter((m) => !seen.has(m.id))
            .map((m) => (m.id === doneCardMsgId
              ? { ...m, postCard: { plan, mediaUrls, status: 'done', resultText: doneText } }
              : m))
          // Ensure the done card is reflected even if it was already persisted.
          const merged = [...persisted, ...fromOptimistic].map((m: any) =>
            m.id === doneCardMsgId ? { ...m, postCard: { plan, mediaUrls, status: 'done', resultText: doneText } } : m)
          return [...merged, { id: Date.now() + 1, conversationId: convForRefetch, role: 'assistant', content: confirmMsg, tokensUsed: 0, createdAt: new Date() }]
        })
      }

      // Persist the follow-up assistant message (best-effort; the cache already
      // shows it). Refetch the conversation list for the sidebar.
      apiRequest('/api/chat/conversations/log', { method: 'POST', body: JSON.stringify({ workspaceId: currentWorkspaceId, conversationId: postConvIdRef.current || undefined, messages: [{ role: 'assistant', content: confirmMsg }] }) })
        .then((r: any) => { if (r?.conversation?.id) postConvIdRef.current = r.conversation.id; queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations'], exact: true }) })
        .catch(() => {})

      // Now leave the post-agent view. The cache already holds the full thread,
      // so this is a seamless swap (no flash). Clear optimistic AFTER seeding.
      setPostAgentActive(false)
      postAgentMsgsRef.current = []
      postMediaUrlsRef.current = []
      postHasVideoRef.current = false
      if (convForRefetch) setOptimisticMessages([])
    } catch (e: any) {
      console.error('[VeeGPT] confirmPost failed', e)
      setCardState(msgId, { plan, mediaUrls, status: 'error', resultText: e?.message || 'Could not complete the post' })
      setOptimisticMessages((prev) => [...prev, { id: Date.now(), conversationId: 0, role: 'assistant', content: `I couldn't complete that — ${e?.message || 'something went wrong'}. You can tap Retry on the card.`, tokensUsed: 0, createdAt: new Date() } as any])
    }
  }

  const cancelPost = (msgId: number, opts?: { reason?: string; chatMessage?: string; expired?: boolean; plan?: any; mediaUrls?: string[] }) => {
    setPostAgentActive(false)
    postAgentMsgsRef.current = []
    postMediaUrlsRef.current = []
    postHasVideoRef.current = false
    const resultText = opts?.reason || 'Cancelled'
    // Preserve the plan + media so the card stays visible showing a "Cancelled"
    // state (don't let setCardState reset plan to null, which would hide it).
    const patch: any = { status: 'done', resultText }
    if (opts?.plan) patch.plan = opts.plan
    if (opts?.mediaUrls) patch.mediaUrls = opts.mediaUrls
    setCardState(msgId, patch)
    const serverId = postCardServerIdRef.current[msgId] || msgId
    apiRequest(`/api/chat/messages/${serverId}/post-card`, { method: 'POST', body: JSON.stringify({ status: 'done', resultText }) }).catch(() => {})
    const chatMessage = opts?.chatMessage || 'No problem — I\'ve cancelled that. Let me know if you\'d like to try again.'
    // Write the cancellation reply into the canonical messages cache (not just
    // optimisticMessages) so it survives leaving the post-agent view, and refetch
    // the full persisted thread so the conversation doesn't appear to "clear".
    const convForCancel = postConvIdRef.current || currentConversationId
    if (convForCancel) {
      queryClient.setQueryData(['/api/chat/conversations', convForCancel, 'messages'], (old: any) => {
        const list = Array.isArray(old) ? old : []
        return [...list, { id: Date.now() + 1, conversationId: convForCancel, role: 'assistant', content: chatMessage, tokensUsed: 0, createdAt: new Date() }]
      })
      setOptimisticMessages([])
      apiRequest('/api/chat/conversations/log', { method: 'POST', body: JSON.stringify({ workspaceId: currentWorkspaceId, conversationId: convForCancel, messages: [{ role: 'assistant', content: chatMessage }] }) })
        .then((r: any) => {
          if (r?.conversation?.id) postConvIdRef.current = r.conversation.id
          queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations'], exact: true })
          queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations', convForCancel, 'messages'] })
        })
        .catch(() => {})
      return
    }
    setOptimisticMessages((prev) => [...prev, { id: Date.now(), conversationId: 0, role: 'assistant', content: chatMessage, tokensUsed: 0, createdAt: new Date() } as any])
    // Persist the explanatory assistant message so it survives refresh. Append
    // it to the conversation the card lives in (postConvIdRef OR the currently
    // open conversation) — never let conversationId be undefined, which would
    // create a brand-new duplicate conversation.
    if (opts?.expired) {
      const convId = postConvIdRef.current || currentConversationId
      if (convId) {
        // Show the cancellation reply IMMEDIATELY by injecting it into the
        // messages cache for the open conversation (optimistic messages aren't
        // rendered for a persisted conversation, so without this it would only
        // appear after a refresh).
        queryClient.setQueryData(['/api/chat/conversations', convId, 'messages'], (old: any) => {
          const list = Array.isArray(old) ? old : []
          return [...list, { id: Date.now() + 1, conversationId: convId, role: 'assistant', content: chatMessage, tokensUsed: 0, createdAt: new Date() }]
        })
        apiRequest('/api/chat/conversations/log', { method: 'POST', body: JSON.stringify({ workspaceId: currentWorkspaceId, conversationId: convId, messages: [{ role: 'assistant', content: chatMessage }] }) })
          .then((r: any) => {
            if (r?.conversation?.id) postConvIdRef.current = r.conversation.id
            queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations'], exact: true })
            queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations', convId, 'messages'] })
          })
          .catch(() => {})
      }
    }
  }

  // Parse a "YYYY-MM-DDTHH:mm" LOCAL schedule string to a Date (local time).
  const parseScheduledLocal = (s?: string | null): Date | null => {
    if (!s) return null
    const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(s))
    if (!m) return null
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))
  }

  // Auto-cancel a SCHEDULE card (never a post-now card) once its scheduled time
  // passes while it's still awaiting confirmation. Checks live + persisted cards
  // on an interval, and explains to the user why it was cancelled.
  useEffect(() => {
    const checkExpired = () => {
      const now = Date.now()
      // Live in-memory cards.
      const candidates: { msgId: number; plan: any; mediaUrls: string[] }[] = []
      Object.entries(postCardByMsg).forEach(([id, card]) => {
        if (card?.plan?.schedule && card.plan.scheduledLocal && (card.status === 'idle' || !card.status)) {
          candidates.push({ msgId: Number(id), plan: card.plan, mediaUrls: card.mediaUrls || [] })
        }
      })
      // Persisted cards from history that aren't already in the live map.
      ;(messages as any[]).forEach((m) => {
        const pc = (m as any).postCard
        if (pc?.plan?.schedule && pc.plan.scheduledLocal && (pc.status === 'idle' || !pc.status) && !postCardByMsg[m.id]) {
          candidates.push({ msgId: m.id, plan: pc.plan, mediaUrls: pc.mediaUrls || [] })
        }
      })
      for (const { msgId, plan, mediaUrls } of candidates) {
        const when = parseScheduledLocal(plan.scheduledLocal)
        if (when && when.getTime() <= now) {
          const whenText = when.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
          cancelPost(msgId, {
            reason: 'Auto-cancelled — time passed',
            chatMessage: `I automatically cancelled this — the scheduled time (${whenText}) passed before you confirmed it, so it can't be scheduled anymore. Just tell me a new time and I'll set it up again.`,
            expired: true,
            plan,
            mediaUrls,
          })
        }
      }
    }
    checkExpired()
    const t = setInterval(checkExpired, 30_000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postCardByMsg, messages])

  const handleStopGeneration = async () => {
    // Stop ONLY the conversation on screen — other chats streaming in the
    // background (multi-tasking) keep going. stopGeneration returns the revealed
    // partial(s) so we can persist EXACTLY what the user saw.
    const stopped = stopGeneration(currentConversationId ?? undefined)
    if (currentConversationId) {
      const mine = stopped.find((s) => s.conversationId === currentConversationId)
      try {
        await stopGenerationMutation.mutateAsync({
          convId: currentConversationId,
          messageId: mine?.messageId,
          content: mine?.text,
        })
      } catch (_) {}
    }
  }

  // Retry the last message after a provider failure (e.g. rate limit). Re-streams
  // the last user text into the current conversation; the failed assistant
  // placeholder stays in history but a fresh reply is generated.
  const handleRetry = async () => {
    const text = lastUserTextRef.current?.trim()
    if (!text || isGenerating) return
    try {
      if (currentConversationId) {
        await wsSendMessage(currentConversationId, text, currentWorkspaceId || undefined, [], {
          skipUserMessage: true, // the user message is already in the thread
          includeWorkspaceContext: true,
          enableTools: true,
          localNow: localNowStr(),
          timezone: localTimezone(),
        })
      } else {
        await createAndStream(text, currentWorkspaceId || undefined, [], {
          enableTools: true, localNow: localNowStr(), timezone: localTimezone(),
          onConversation: (cid) => { setCurrentConversationId(cid) },
        })
      }
    } catch (e) {
      console.error('[VeeGPT] retry failed', e)
    }
  }

  // Regenerate an assistant reply (ChatGPT-style). Re-answers the same user
  // prompt and streams into the SAME message (server appends a 1/2, 2/2 variant),
  // so the reply stays exactly where it is on the page.
  const handleRegenerate = async (assistantMsg: ChatMessage) => {
    if (!currentConversationId) return
    if (currentConversationId && generatingConvIds[currentConversationId]) return
    const list = messages as ChatMessage[]
    const idx = list.findIndex((m) => m.id === assistantMsg.id)
    let userText = ''
    for (let i = idx - 1; i >= 0; i--) {
      if (list[i].role === 'user' && list[i].content?.trim()) { userText = list[i].content; break }
    }
    if (!userText) userText = lastUserTextRef.current || ''
    if (!userText.trim()) return
    try {
      await regenerate(currentConversationId, assistantMsg.id, userText, {
        workspaceId: currentWorkspaceId || undefined,
        enableTools: true,
        localNow: localNowStr(),
        timezone: localTimezone(),
      })
    } catch (e) {
      console.error('[VeeGPT] regenerate failed', e)
    }
  }

  // Switch which regenerated variant is shown. Optimistically mirrors the chosen
  // variant's content/cards into the cached message, then persists server-side.
  const handleSwitchVariant = (assistantMsg: ChatMessage, index: number) => {
    if (!currentConversationId) return
    const variants = (assistantMsg as any).variants as any[] | undefined
    if (!Array.isArray(variants) || index < 0 || index >= variants.length) return
    const v = variants[index]
    queryClient.setQueryData(['/api/chat/conversations', currentConversationId, 'messages'], (old: any) => {
      const l = Array.isArray(old) ? old : []
      return l.map((m: any) => (m.id === assistantMsg.id
        ? { ...m, activeVariant: index, content: v.content, postCard: v.postCard, listCard: v.listCard, editCards: v.editCards, infoCards: v.infoCards }
        : m))
    })
    apiRequest(`/api/chat/messages/${assistantMsg.id}/active-variant`, {
      method: 'POST',
      body: JSON.stringify({ index }),
    }).catch(() => {})
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const startNewChat = () => {
    setCurrentConversationId(null)
    setHasSentFirstMessage(false)
    setHasUserStartedNewChat(true)
    setInputText('')
    clearStreamingContent()
    setOptimisticMessages([])
    clearCachedState()
    // Reset the post-agent flow refs too. Without this, postConvIdRef still
    // holds the PREVIOUS conversation id, so the next message would be appended
    // to the old chat instead of starting a fresh one.
    postConvIdRef.current = null
    postAgentMsgsRef.current = []
    postMediaUrlsRef.current = []
    postHasVideoRef.current = false
    setPostAgentActive(false)
  }

  const selectConversation = (id: number) => {
    setCurrentConversationId(id)
    setHasSentFirstMessage(true)
    subscribeToConversation(id)
    // NOTE: don't wipe streaming buffers here. An in-flight reply belongs to its
    // own conversation (tracked by the hook) and is gated to display only in that
    // chat, so switching away/back must not clear it — that was what made a
    // pending reply vanish or jump to the chat you switched to.
    setOptimisticMessages([])
    // Sync the post-agent refs to the selected conversation so the next message
    // targets THIS chat (not whatever was last active in the post flow).
    postConvIdRef.current = id
    postAgentMsgsRef.current = []
    postMediaUrlsRef.current = []
    postHasVideoRef.current = false
    setPostAgentActive(false)
  }

  // Open a conversation from the search modal; scroll-to + highlight the matched
  // message for ~10 seconds (cleared by a timer).
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openConversationFromSearch = (id: number, matchedMessageId?: number | null, query?: string) => {
    selectConversation(id)
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
    setHighlightQuery(query?.trim() || '')
    if (matchedMessageId) {
      setHighlightMessageId(matchedMessageId)
      highlightTimerRef.current = setTimeout(() => {
        setHighlightMessageId(null)
        setHighlightQuery('')
      }, 10000)
    } else {
      setHighlightMessageId(null)
    }
  }

  // ── Cache / init ──────────────────────────────────────────────────────────
  useEffect(() => {
    const cached = getCachedState()
    if (cached) {
      setCurrentConversationId(cached.conversationId)
      setHasSentFirstMessage(cached.hasSentFirstMessage)
      setIsInitializing(false)
    } else {
      const t = setTimeout(() => setIsInitializing(false), 100)
      return () => clearTimeout(t)
    }
  }, [])

  useEffect(() => {
    if (!isInitializing) setCachedState(currentConversationId, hasSentFirstMessage)
  }, [currentConversationId, hasSentFirstMessage, isInitializing])

  // Auto-select first conversation on first load if no cache
  useEffect(() => {
    if (conversations.length > 0 && !currentConversationId && !hasUserStartedNewChat && !hasSentFirstMessage) {
      if (!getCachedState()) {
        setHasSentFirstMessage(true)
        setCurrentConversationId(conversations[0].id)
      }
    }
  }, [conversations, currentConversationId, hasUserStartedNewChat, hasSentFirstMessage])

  // ── Render helpers ────────────────────────────────────────────────────────

  // Synchronous landing prediction (computed once at mount from the persisted
  // cache + "has conversations" hint, the same signals the Page_Skeleton uses).
  // The welcome / new-chat screen is purely STATIC UI (title + input + prompt
  // pills) with no data behind it, so when we can tell the user is landing
  // there we render it INSTANTLY instead of waiting on the conversations query.
  // Only the sidebar (conversation list) and the chat message area actually
  // load data, so those are the only regions allowed a loading state.
  const initialPredictionRef = useRef<'welcome' | 'chat'>()
  const hasConvHintRef = useRef<boolean>(false)
  if (initialPredictionRef.current === undefined) {
    const cached = getCachedState()
    let hasConvHint = false
    try { hasConvHint = localStorage.getItem('veegpt-has-conversations') === '1' } catch (_) {}
    hasConvHintRef.current = hasConvHint
    // chat iff a conversation is cached, or (no cache) the user has conversations
    // and will auto-select the first one; otherwise the static welcome screen.
    initialPredictionRef.current =
      cached?.conversationId != null || (cached == null && hasConvHint) ? 'chat' : 'welcome'
  }

  // Show the sidebar when we actually have conversations, or while the query is
  // in flight ONLY if the persisted hint says conversations exist. A brand-new
  // user (no hint) therefore never sees the sidebar flash in/out during load.
  const shouldShowSidebar =
    conversations.length > 0 || (conversationsLoading && hasConvHintRef.current)

  const resolvedWelcome =
    !isInitializing &&
    !conversationsLoading &&
    !currentConversationId &&
    (!hasSentFirstMessage || hasUserStartedNewChat) &&
    optimisticMessages.length === 0
  // Show the static welcome screen immediately while data is still loading when
  // we predict the user is landing there (no flash, no skeleton for static UI).
  const predictedWelcomeWhileLoading =
    (isInitializing || conversationsLoading) &&
    !currentConversationId &&
    optimisticMessages.length === 0 &&
    initialPredictionRef.current === 'welcome'
  const showWelcomeScreen = resolvedWelcome || predictedWelcomeWhileLoading

  // Mirror the resolved layout (welcome-vs-chat + whether the sidebar shows)
  // into the `vf_vg` cookie so the SERVER renders the SSR shell overlay with the
  // EXACT same VeeGPT layout on the next load — no variant-mismatch flicker when
  // the overlay dissolves (the server can't read this page's localStorage state).
  useEffect(() => {
    setVeegptLayoutCookie(showWelcomeScreen ? 'welcome' : 'chat', shouldShowSidebar)
  }, [showWelcomeScreen, shouldShowSidebar])

  // Dissolve the server-painted shell overlay ONLY once the live view has
  // SETTLED — not on mount. On a warm refresh the VeeGPT chunk + seeded data are
  // ready instantly, so dissolving on mount revealed the page WHILE it was still
  // initializing (isInitializing flips after ~100ms and the auto-select effect
  // can switch welcome→chat) → a flicker in plain view. On a cold load the chunk
  // downloads slowly so the settling happened under the overlay (clean) — which
  // is why only warm refreshes flickered. Waiting for the settled state makes the
  // overlay cover the ENTIRE transition and dissolve straight onto the final view.
  // The double rAF lets any pending state flush + paint before the dissolve; the
  // 5s safety net in SHELL_REMOVE_SCRIPT covers the unlikely case settle never
  // resolves.
  const shellDissolvedRef = useRef(false)
  useEffect(() => {
    if (shellDissolvedRef.current) return
    const settled = !isInitializing && !conversationsLoading && !!finalUserData
    if (!settled) return
    shellDissolvedRef.current = true
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try { (window as any).__vfRemoveShell?.('veegpt-settled') } catch { /* ignore */ }
      })
    })
    return () => cancelAnimationFrame(id)
  }, [isInitializing, conversationsLoading, finalUserData, showWelcomeScreen, currentConversationId])

  // ── Background decoration (shared between both views) ─────────────────────
  // Matches the app theme: clean light gradient in light mode, deep black/slate
  // surface with subtle blue accents in dark mode (consistent with the dashboard).
  const Background = () => (
    <div className="absolute inset-0 pointer-events-none z-0">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-white to-blue-50/60 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900" />
      {/* Soft brand glow accents */}
      <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-blue-500/5 dark:bg-blue-500/10 blur-3xl" />
      <div className="absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-blue-600/5 dark:bg-blue-600/10 blur-3xl" />
      {/* Subtle floating particles */}
      <div className="absolute inset-0 opacity-30">
        {Array.from({ length: 15 }, (_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-blue-400/60 dark:bg-blue-400/40 rounded-full animate-slow-float"
            style={{ left: `${(i * 7.3) % 100}%`, top: `${(i * 6.1) % 100}%`, animationDelay: `${i * 3}s`, animationDuration: `${18 + (i % 5) * 2}s` }}
          />
        ))}
      </div>
    </div>
  )

  // ── Welcome Screen ────────────────────────────────────────────────────────
  // Shared fullscreen media viewer (lightbox). Rendered in BOTH the welcome
  // screen and the chat screen so clicking a pending attachment chip works
  // regardless of which screen is active.
  const searchModal = (
    <SearchChatsModal
      open={searchModalOpen}
      onClose={() => setSearchModalOpen(false)}
      conversations={conversations as any}
      workspaceId={currentWorkspaceId}
      onOpenConversation={(id, matchedMessageId, query) => openConversationFromSearch(id, matchedMessageId, query)}
      onNewChat={startNewChat}
    />
  )

  const lightboxModal = lightbox && (    <div
      className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => setLightbox(null)}
    >
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <span className="text-sm text-white/80 truncate max-w-[60%]">{lightbox.name || 'Attachment'}</span>
        <div className="flex items-center gap-2">
          <a
            href={lightbox.url}
            download={lightbox.name || true}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            title="Download"
          >
            <Download className="w-5 h-5" />
          </a>
          <button
            onClick={() => setLightbox(null)}
            className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div className="max-w-[90vw] max-h-[85vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {lightbox.mimeType?.startsWith('image/') ? (
          <img src={lightbox.url} alt={lightbox.name || 'image'} className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg" />
        ) : lightbox.mimeType?.startsWith('video/') ? (
          <video src={lightbox.url} className="max-w-[90vw] max-h-[85vh] rounded-lg" controls autoPlay playsInline />
        ) : (
          <div className="text-white/80 text-sm bg-white/10 rounded-lg px-6 py-10 text-center">
            <p className="mb-3">Preview isn't available for this file type.</p>
            <a href={lightbox.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-blue-300 hover:text-blue-200">
              <Download className="w-4 h-4" /> Open in new tab
            </a>
          </div>
        )}
      </div>
    </div>
  )

  if (showWelcomeScreen) {
    return (
      <div className="h-full w-full bg-gray-50 dark:bg-slate-900 flex relative overflow-hidden">
        <Background />
        <div className="relative z-10 w-full h-full flex">
          {shouldShowSidebar && (
            <ConversationSidebar
              conversations={conversations as any}
              conversationsLoading={conversationsLoading}
              currentConversationId={currentConversationId}
              sidebarCollapsed={sidebarCollapsed}
              setSidebarCollapsed={setSidebarCollapsed}
              onSelectConversation={selectConversation}
              onStartNewChat={startNewChat}
              onOpenSearch={() => setSearchModalOpen(true)}
              userData={finalUserData}
              userLoading={userLoading}
              refreshKey={refreshKey}
            />
          )}

          {/* Welcome content */}
          <div className="flex-1 flex flex-col items-center justify-center px-4">
            <div className="w-full max-w-3xl">
              <div className="text-center mb-9">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/25 mb-5">
                  <img src="/veefore-logo.png" alt="VeeFore" className="w-8 h-8 brightness-0 invert" />
                </div>
                <h1 className="text-[2.5rem] leading-tight font-semibold tracking-tight text-gray-900 dark:text-gray-50">
                  How can <span className="bg-gradient-to-r from-blue-500 to-blue-600 bg-clip-text text-transparent">VeeGPT</span> help?
                  <span className="align-middle ml-3 px-2.5 py-1 bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-300 text-xs font-semibold rounded-full ring-1 ring-blue-200/60 dark:ring-blue-500/30">Beta</span>
                </h1>
                <p className="mt-3 text-[15px] text-gray-500 dark:text-gray-400">Your AI co-pilot for content, growth, and research.</p>
              </div>

              {/* Main input */}
              <div className="group bg-white dark:bg-slate-800/70 dark:backdrop-blur-sm rounded-[20px] shadow-[0_2px_16px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.3)] mb-7 border border-gray-200/80 dark:border-white/10 transition-all duration-200 focus-within:border-blue-400/60 dark:focus-within:border-blue-400/40 focus-within:shadow-[0_4px_24px_rgba(59,130,246,0.12)]">
                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={e => {
                    setInputText(e.target.value)
                    e.target.style.height = 'auto'
                    e.target.style.height = Math.max(48, e.target.scrollHeight) + 'px'
                  }}
                  onKeyDown={handleKeyPress}
                  onPaste={(e) => {
                    const items = e.clipboardData?.items
                    if (!items) return
                    const files: File[] = []
                    for (let i = 0; i < items.length; i++) {
                      const it = items[i]
                      if (it.kind === 'file' && it.type.startsWith('image/')) {
                        const f = it.getAsFile()
                        if (f) files.push(f)
                      }
                    }
                    if (files.length) {
                      e.preventDefault()
                      addAttachments(files)
                    }
                  }}
                  placeholder="Ask VeeGPT a question"
                  className="w-full px-5 py-3 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 bg-transparent border-0 resize-none focus:outline-none focus:ring-0"
                  style={{ fontSize: '16px', height: '48px', lineHeight: '24px', border: 'none', boxShadow: 'none', wordBreak: 'break-all', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}
                  rows={1}
                />

                {/* Pending attachment chips */}
                {attachmentPreviews.length > 0 && (
                  <div className="flex flex-wrap gap-2 px-5 pb-2">
                    {attachmentPreviews.map((att, i) => {
                      const isImage = att.mimeType?.startsWith('image/')
                      const isVideo = att.mimeType?.startsWith('video/')
                      return (
                        <div key={i} className="relative group">
                          <div className="w-16 h-16 rounded-lg overflow-hidden border border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-slate-700 flex items-center justify-center" title={att.name}>
                            {isImage && att.previewUrl ? (
                              <img
                                src={att.previewUrl}
                                alt={att.name}
                                onClick={() => { const u = att.previewUrl; if (u) setLightbox({ url: u, mimeType: att.mimeType, name: att.name }) }}
                                className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                              />
                            ) : isVideo ? (
                              <div
                                onClick={() => { const u = att.previewUrl; if (u) setLightbox({ url: u, mimeType: att.mimeType, name: att.name }) }}
                                className="relative w-full h-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity"
                                title={att.name}
                              >
                                {att.posterUrl ? (
                                  <img src={att.posterUrl} alt={att.name} className="absolute inset-0 w-full h-full object-cover" />
                                ) : null}
                                {/* Static play badge — never autoplays. Click opens the modal. */}
                                <div className="relative w-7 h-7 rounded-full bg-black/50 flex items-center justify-center pointer-events-none">
                                  <Play className="w-3.5 h-3.5 text-white" fill="currentColor" />
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center justify-center gap-1">
                                <span className="text-[10px] font-bold text-red-600 dark:text-red-300">PDF</span>
                                <span className="text-[8px] text-gray-500 px-1 truncate max-w-[56px]">{att.name}</span>
                              </div>
                            )}
                          </div>
                          <button onClick={() => removeAttachment(i)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-700 text-white flex items-center justify-center shadow hover:bg-gray-900" title="Remove">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="flex items-center justify-between px-5 pb-4">
                  <div className="flex items-center gap-1">
                    <ComposerPlusMenu
                      onAddFiles={addAttachments}
                      selectedTool={selectedTool}
                      onSelectTool={setSelectedTool}
                    />
                    {welcomeVoice.supported && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={welcomeVoice.toggle}
                        title={welcomeVoice.listening ? 'Stop voice input' : 'Speak your message'}
                        aria-label={welcomeVoice.listening ? 'Stop voice input' : 'Speak your message'}
                        className={welcomeVoice.listening ? 'text-red-500 animate-pulse' : 'text-gray-600 dark:text-gray-400'}
                      >
                        <Mic className="w-4 h-4" />
                      </Button>
                    )}
                    <VeeGPTSelectors
                      compact
                      agents={veegptAgents}
                      selectedAgentId={selectedAgentId}
                      onSelectAgent={setSelectedAgentId}
                      accounts={validAccounts as any}
                      selectedAccountId={selectedAccountId}
                      onSelectAccount={setSelectedAccountId}
                    />
                    {selectedTool && (
                      <button
                        type="button"
                        onClick={() => setSelectedTool(null)}
                        title="Remove selected tool"
                        className="flex items-center gap-1 rounded-full border border-blue-300 dark:border-blue-400/40 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 px-2.5 py-1 text-xs font-medium"
                      >
                        <Wrench className="w-3 h-3" />
                        {getComposerTool(selectedTool)?.label || 'Tool'}
                        <X className="w-3 h-3 opacity-70" />
                      </button>
                    )}
                  </div>
                  <Button
                    onClick={handleSendMessage}
                    disabled={(!inputText.trim() && attachmentPreviews.length === 0) || newChatPending}
                    className={`p-2 rounded-lg transition-all duration-300 ${(inputText.trim() || attachmentPreviews.length) ? 'bg-gradient-to-r from-blue-500 to-blue-600 hover:brightness-110 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-400 dark:text-gray-500'}`}
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Quick prompts */}
              <div className="space-y-2.5">
                {[QUICK_PROMPTS.slice(0, 4), QUICK_PROMPTS.slice(4, 7), QUICK_PROMPTS.slice(7)].map((row, ri) => (
                  <div key={ri} className="flex flex-wrap gap-2.5 justify-center">
                    {row.map((p, pi) => (
                      <button
                        key={pi}
                        onClick={() => setInputText(p.text)}
                        className="group flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800/60 border border-gray-200/80 dark:border-white/10 rounded-full text-gray-700 dark:text-gray-200 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-blue-50/50 dark:hover:bg-slate-700/70 hover:border-blue-300/70 dark:hover:border-blue-400/40 hover:shadow-[0_3px_10px_rgba(59,130,246,0.10)] hover:-translate-y-0.5 transition-all duration-200 whitespace-nowrap"
                      >
                        <p.icon className="w-4 h-4 flex-shrink-0 text-blue-500 dark:text-blue-400 group-hover:scale-110 transition-transform" />
                        <span className="text-sm font-medium">{p.text}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>

              <div className="text-center mt-9">
                <p className="text-xs text-gray-400 dark:text-gray-500">VeeGPT can make mistakes. Check important info.</p>
              </div>
            </div>
          </div>
        </div>
        {lightboxModal}
        {searchModal}
      </div>
    )
  }

  // ── Chat Interface ────────────────────────────────────────────────────────
  return (
    <div className="h-full w-full bg-gray-50 dark:bg-slate-900 flex relative overflow-hidden">
      <Background />
      <div className="relative z-10 w-full h-full flex">
        {shouldShowSidebar && (
          <ConversationSidebar
            conversations={conversations as any}
            conversationsLoading={conversationsLoading}
            currentConversationId={currentConversationId}
            sidebarCollapsed={sidebarCollapsed}
            setSidebarCollapsed={setSidebarCollapsed}
            onSelectConversation={selectConversation}
            onStartNewChat={startNewChat}
            onOpenSearch={() => setSearchModalOpen(true)}
            userData={finalUserData}
            userLoading={userLoading}
            refreshKey={refreshKey}
          />
        )}

        <ChatInterface
          messages={displayMessages as any}
          messagesLoading={messagesLoading}
          isGenerating={viewGenerating}
          aiStatus={aiStatus}
          inputText={inputText}
          streamingContent={streamingContent}
          title={(conversations as ChatConversation[]).find(c => c.id === currentConversationId)?.title}
          onNewChat={startNewChat}
          onInputChange={setInputText}
          onSendMessage={handleSendMessage}
          onStopGeneration={handleStopGeneration}
          onKeyPress={handleKeyPress}
          onRetry={handleRetry}
          onRegenerate={handleRegenerate}
          onSwitchVariant={handleSwitchVariant}
          attachments={attachmentPreviews}
          onAddAttachments={addAttachments}
          onRemoveAttachment={removeAttachment}
          agents={veegptAgents}
          selectedAgentId={selectedAgentId}
          onSelectAgent={setSelectedAgentId}
          accounts={validAccounts as any}
          selectedAccountId={selectedAccountId}
          onSelectAccount={setSelectedAccountId}
          selectedTool={selectedTool}
          onSelectTool={setSelectedTool}
          preparingMessageId={preparingMessageId}
          preparingStatus={preparingStatus}
          highlightMessageId={highlightMessageId}
          highlightQuery={highlightQuery}
          renderMessageCard={(message: any) => {
            // Read-only list of posts (scheduled/draft/published) as cards.
            const listCard = message.listCard
            // Edit-confirmation cards (multi-tool array, or legacy single).
            const editCards: any[] = Array.isArray(message.editCards) && message.editCards.length
              ? message.editCards
              : (message.editCard ? [{ id: undefined, ...message.editCard }] : [])
            // Info/assist cards (captions, hashtags, insight, recommendations, best_time, trends).
            const infoCards: any[] = Array.isArray(message.infoCards) ? message.infoCards : []
            // Post compose/schedule confirm card.
            const live = postCardByMsg[message.id]
            const persisted = message.postCard
            const card = live || persisted

            if (!listCard && !editCards.length && !infoCards.length && (!card || !card.plan)) return null

            const acct = card?.plan
              ? (validAccounts.find((a: any) => (a.id || a._id || a.accountId) === card.plan.accountId) || validAccounts[0])
              : null
            return (
              <div className="flex flex-col items-start gap-2 max-w-4xl w-full">
                {listCard && <PostListCard kind={listCard.kind} title={listCard.title} items={listCard.items || []} />}
                {infoCards.map((ic, i) => (
                  <InfoCard key={ic.id || `info_${i}`} card={ic} />
                ))}
                {editCards.map((ec, i) => {
                  const liveEdit = editCardByMsg[`${message.id}:${ec.id || ''}`]
                  const merged = { ...ec, ...(liveEdit || {}) }
                  return (
                    <EditConfirmCard
                      key={ec.id || i}
                      card={merged as any}
                      onConfirm={() => applyEdit(message.id, ec.id, 'confirm')}
                      onCancel={() => applyEdit(message.id, ec.id, 'cancel')}
                    />
                  )
                })}
                {card && card.plan && (
                  <PostConfirmCard
                    plan={card.plan}
                    mediaUrls={card.mediaUrls || []}
                    accountUsername={acct?.username}
                    status={card.status || 'idle'}
                    resultText={card.resultText}
                    onConfirm={() => confirmPost(message.id, card.plan, card.mediaUrls || [])}
                    onCancel={() => cancelPost(message.id, { plan: card.plan, mediaUrls: card.mediaUrls || [] })}
                  />
                )}
              </div>
            )
          }}
        />
      </div>
      {lightboxModal}
        {searchModal}
    </div>
  )
}
