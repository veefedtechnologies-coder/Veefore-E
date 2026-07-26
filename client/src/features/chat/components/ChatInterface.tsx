import React, { useRef, useEffect, useState, useMemo } from 'react'
import { 
  Mic,
  Send,
  ArrowDown,
  PenSquare,
  X,
  Download,
  RotateCcw,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useSpeechToText } from '../hooks/useSpeechToText'
import { VeeGPTSelectors, type SocialAccountOption } from './VeeGPTSelectors'
import type { VeeGPTAgentOption } from '../hooks/useVeeGPTAgents'
import { ComposerPlusMenu } from './ComposerPlusMenu'
import { getComposerTool } from '../composerTools'
import { Wrench } from 'lucide-react'

// Types
type ChatMessage = {
  id: number
  conversationId: number
  role: 'user' | 'assistant'
  content: string
  attachments?: { name?: string; mimeType: string; url?: string; posterUrl?: string }[]
  postCard?: { plan: any; mediaUrls: string[]; status: 'idle' | 'working' | 'done' | 'error'; resultText?: string }
  listCard?: { kind: string; title?: string; items: any[] }
  editCard?: { action: string; contentId: string; title?: string; current?: any; proposed?: any; status: 'idle' | 'working' | 'done' | 'error'; resultText?: string }
  editCards?: Array<{ id?: string; action: string; contentId: string; title?: string; post?: any; current?: any; proposed?: any; status: 'idle' | 'working' | 'done' | 'error'; resultText?: string }>
  retryable?: boolean
  /** Regenerated alternatives (ChatGPT 1/2, 2/2). */
  variants?: Array<{ content: string; postCard?: any; listCard?: any; editCards?: any[]; infoCards?: any[] }>
  activeVariant?: number
  tokensUsed: number
  createdAt: Date | string
}

interface ChatInterfaceProps {
  messages: ChatMessage[]
  messagesLoading: boolean
  isGenerating: boolean
  aiStatus: string | null
  inputText: string
  streamingContent: { [key: number]: string }
  /** Title of the active conversation (shown in the header). */
  title?: string
  /** Start a new chat from the header button. */
  onNewChat?: () => void
  onInputChange: (text: string) => void
  onSendMessage: () => void
  onStopGeneration: () => void
  onKeyPress: (e: React.KeyboardEvent) => void
  /** Selected attachments (images/PDFs) pending send. */
  attachments?: AttachmentPreview[]
  /** Add files chosen from the file picker. */
  onAddAttachments?: (files: FileList | File[]) => void
  /** Remove a pending attachment by index. */
  onRemoveAttachment?: (index: number) => void
  /** Id of an optimistic assistant message that is "preparing" something
   *  (e.g. building a post): render a shimmer status instead of its content. */
  preparingMessageId?: number | null
  /** Status text shown (shimmering) for the preparing message. */
  preparingStatus?: string
  /** When set (from "Search chats"), scroll to + briefly highlight this message. */
  highlightMessageId?: number | null
  /** The search term to highlight within the matched message. */
  highlightQuery?: string
  /** Optional node rendered at the end of the message list (e.g. an inline
   *  post-confirmation card driven by the AI agent). */
  footerSlot?: React.ReactNode
  /** Render an inline card under a specific assistant message (used to
   *  rehydrate a persisted post-confirm card from chat history). */
  renderMessageCard?: (message: ChatMessage) => React.ReactNode
  /** Retry a failed (e.g. rate-limited) assistant message — re-sends the last
   *  user message. */
  onRetry?: () => void
  /** Regenerate an assistant reply in place (appends a 1/2, 2/2 variant). */
  onRegenerate?: (message: ChatMessage) => void
  /** Switch which regenerated variant of a message is shown. */
  onSwitchVariant?: (message: ChatMessage, index: number) => void
  /** Advanced composer selectors — VeeGPT agent (persona) + social account focus. */
  agents?: VeeGPTAgentOption[]
  selectedAgentId?: string
  onSelectAgent?: (id: string) => void
  accounts?: SocialAccountOption[]
  selectedAccountId?: string | null
  onSelectAccount?: (id: string | null) => void
  /** Armed composer tool (forces that tool on the next send), or null. */
  selectedTool?: string | null
  onSelectTool?: (id: string | null) => void
}

/** A pending attachment shown as a chip below the input. */
export type AttachmentPreview = {
  name: string
  mimeType: string
  /** object URL for image preview (optional). */
  previewUrl?: string
  /** poster data URL for video preview (optional). */
  posterUrl?: string
}

// Shared markdown renderers — sized for comfortable in-chat reading (not document-sized headings)
const markdownComponents = {
  h1: ({children}: any) => <h1 className="font-bold mt-4 mb-2 text-black dark:text-gray-100 leading-snug text-xl">{children}</h1>,
  h2: ({children}: any) => <h2 className="font-bold mt-4 mb-2 text-black dark:text-gray-100 leading-snug text-lg">{children}</h2>,
  h3: ({children}: any) => <h3 className="font-semibold mt-3 mb-1.5 text-black dark:text-gray-100 leading-snug text-base">{children}</h3>,
  h4: ({children}: any) => <h4 className="font-semibold mt-3 mb-1.5 text-black dark:text-gray-100 leading-snug text-sm">{children}</h4>,
  p: ({children}: any) => <p className="mb-2.5 leading-relaxed text-black dark:text-gray-200 text-[15px]">{children}</p>,
  strong: ({children}: any) => <strong className="font-semibold text-black dark:text-gray-100">{children}</strong>,
  ul: ({children}: any) => <ul className="mb-2.5">{children}</ul>,
  ol: ({children}: any) => <ol className="mb-2.5">{children}</ol>,
  li: ({children}: any) => <li className="leading-relaxed text-black dark:text-gray-200 text-[15px]">{children}</li>,
  code: ({children}: any) => <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded font-mono text-black dark:text-gray-100 text-[13px]">{children}</code>,
  pre: ({children}: any) => <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg overflow-x-auto mb-3 text-black dark:text-gray-100 text-[13px]">{children}</pre>,
}

/** Wrap every case-insensitive occurrence of `term` inside React children with a
 *  <mark> so "Search chats" can highlight just the matched word(s). Non-string
 *  children (already-rendered elements) are passed through untouched, so nested
 *  formatting (bold/links) still highlights via its own renderer. */
function highlightChildren(children: React.ReactNode, term: string): React.ReactNode {
  if (!term) return children
  const lowerTerm = term.toLowerCase()
  const walk = (node: React.ReactNode, keyPrefix: string): React.ReactNode => {
    if (typeof node === 'string') {
      const text = node
      const lower = text.toLowerCase()
      if (!lower.includes(lowerTerm)) return text
      const parts: React.ReactNode[] = []
      let i = 0
      let k = 0
      while (i < text.length) {
        const idx = lower.indexOf(lowerTerm, i)
        if (idx === -1) { parts.push(text.slice(i)); break }
        if (idx > i) parts.push(text.slice(i, idx))
        parts.push(<mark key={`${keyPrefix}-${k++}`} className="veegpt-mark">{text.slice(idx, idx + term.length)}</mark>)
        i = idx + term.length
      }
      return parts
    }
    if (Array.isArray(node)) {
      return node.map((n, ix) => <React.Fragment key={`${keyPrefix}-${ix}`}>{walk(n, `${keyPrefix}-${ix}`)}</React.Fragment>)
    }
    return node
  }
  return walk(children, 'hl')
}

/** Build markdown renderers that highlight `term`; falls back to the shared
 *  renderers when there's no term. */
function buildHighlightComponents(term: string) {
  if (!term) return markdownComponents
  const H = (children: any) => highlightChildren(children, term)
  return {
    ...markdownComponents,
    h1: ({children}: any) => <h1 className="font-bold mt-4 mb-2 text-black dark:text-gray-100 leading-snug text-xl">{H(children)}</h1>,
    h2: ({children}: any) => <h2 className="font-bold mt-4 mb-2 text-black dark:text-gray-100 leading-snug text-lg">{H(children)}</h2>,
    h3: ({children}: any) => <h3 className="font-semibold mt-3 mb-1.5 text-black dark:text-gray-100 leading-snug text-base">{H(children)}</h3>,
    h4: ({children}: any) => <h4 className="font-semibold mt-3 mb-1.5 text-black dark:text-gray-100 leading-snug text-sm">{H(children)}</h4>,
    p: ({children}: any) => <p className="mb-2.5 leading-relaxed text-black dark:text-gray-200 text-[15px]">{H(children)}</p>,
    strong: ({children}: any) => <strong className="font-semibold text-black dark:text-gray-100">{H(children)}</strong>,
    li: ({children}: any) => <li className="leading-relaxed text-black dark:text-gray-200 text-[15px]">{H(children)}</li>,
    code: ({children}: any) => <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded font-mono text-black dark:text-gray-100 text-[13px]">{H(children)}</code>,
  }
}

/**
 * Stabilize partial markdown while streaming. Mid-stream, an unclosed code fence
 * (```), inline-code backtick, or bold marker makes ReactMarkdown render the rest
 * of the text as a giant code block / bold run, which then collapses when the
 * closing marker arrives — the "long then short" reflow. We temporarily close any
 * dangling markers so each intermediate frame is valid, balanced markdown.
 */
function stabilizeStreamingMarkdown(text: string): string {
  if (!text) return text
  let result = text

  // Close an odd number of triple-backtick code fences.
  const fenceCount = (result.match(/```/g) || []).length
  if (fenceCount % 2 === 1) {
    result += '\n```'
  } else {
    // Only consider inline backticks when not inside an open fence.
    const inlineTicks = (result.match(/`/g) || []).length
    if (inlineTicks % 2 === 1) result += '`'
  }

  // Close a dangling bold marker (**) if there's an odd count.
  const boldCount = (result.match(/\*\*/g) || []).length
  if (boldCount % 2 === 1) result += '**'

  return result
}

/**
 * ChatInterface Component
 * 
 * Main chat UI component extracted from VeeGPT.tsx
 * Handles message display, input, and real-time streaming
 * 
 * Features:
 * - Message list with markdown rendering
 * - Real-time streaming content display
 * - Typing indicators and AI status
 * - Message input with send/stop controls
 * - Connection status indicators
 */
export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  messages,
  messagesLoading,
  isGenerating,
  aiStatus,
  inputText,
  streamingContent,
  title,
  onNewChat,
  onInputChange,
  onSendMessage,
  onStopGeneration,
  onKeyPress,
  attachments = [],
  onAddAttachments,
  onRemoveAttachment,
  preparingMessageId = null,
  preparingStatus,
  highlightMessageId = null,
  highlightQuery = '',
  footerSlot,
  renderMessageCard,
  onRetry,
  onRegenerate,
  onSwitchVariant,
  agents,
  selectedAgentId,
  onSelectAgent,
  accounts,
  selectedAccountId,
  onSelectAccount,
  selectedTool,
  onSelectTool,
}) => {
  const inputRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  // Refs to each message wrapper so "Search chats" can scroll a match into view.
  const messageRefs = useRef<Record<number, HTMLDivElement | null>>({})

  // Fullscreen media viewer (lightbox) for attachment click-to-view.
  const [lightbox, setLightbox] = useState<{ url: string; mimeType: string; name?: string } | null>(null)
  // Which message's content was just copied (shows a transient check icon).
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const copyMessage = async (m: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(m.content || '')
      setCopiedId(m.id)
      setTimeout(() => setCopiedId((cur) => (cur === m.id ? null : cur)), 1500)
    } catch { /* clipboard blocked */ }
  }
  // Id of the most recent assistant message — regenerate is offered only here
  // (re-answering the latest turn), which keeps history correct.
  const lastAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'assistant') return messages[i].id
    return null
  }, [messages])

  // Voice dictation (browser-native Web Speech API → OS permission prompt).
  const dictateBaseRef = useRef('')
  const speech = useSpeechToText({
    onStart: () => { dictateBaseRef.current = (inputText || '').trim() },
    onText: (transcript) => {
      const base = dictateBaseRef.current
      const combined = (base ? base + ' ' : '') + transcript
      if (inputRef.current) inputRef.current.innerText = combined
      onInputChange(combined)
    },
  })
  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

  // Keep the contentEditable input in sync when the parent clears inputText
  // (e.g. after sending). The div is uncontrolled, so we clear it imperatively.
  useEffect(() => {
    if (inputRef.current && inputText === '' && inputRef.current.innerText !== '') {
      inputRef.current.innerText = ''
    }
  }, [inputText])
  // "Stick to bottom" model (same approach ChatGPT/Claude use): we follow new
  // content only while the user wants to. Any upward scroll intent (wheel/touch)
  // disengages following; returning to the very bottom re-engages it. We never
  // yank the view based on proximity, so reading earlier messages is undisturbed.
  const stickToBottomRef = useRef(true)
  const touchStartYRef = useRef(0)
  const [showScrollButton, setShowScrollButton] = useState(false)

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const el = scrollContainerRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
    stickToBottomRef.current = true
    setShowScrollButton(false)
  }

  const handleScroll = () => {
    const el = scrollContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const atBottom = distanceFromBottom < 16
    // Re-engage following only once the user is genuinely back at the bottom.
    if (atBottom) stickToBottomRef.current = true
    setShowScrollButton(!atBottom)
  }

  const handleWheel = (e: React.WheelEvent) => {
    // Scrolling up = user wants to read; stop auto-following immediately.
    if (e.deltaY < 0) stickToBottomRef.current = false
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartYRef.current = e.touches[0].clientY
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    // Finger moving down on screen = content moves down = scrolling up.
    if (e.touches[0].clientY > touchStartYRef.current) stickToBottomRef.current = false
  }

  // Follow new content only while sticking to the bottom. Scroll ONLY the inner
  // container (scrollIntoView would bubble up and scroll the window).
  useEffect(() => {
    const el = scrollContainerRef.current
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight
  }, [messages, streamingContent])

  // When a match arrives from "Search chats", disengage auto-follow and scroll
  // the matched message into view. The term itself is highlighted via <mark>
  // in the markdown renderer (see highlightComponents below).
  useEffect(() => {
    if (highlightMessageId == null) return
    stickToBottomRef.current = false
    const t = setTimeout(() => {
      const node = messageRefs.current[highlightMessageId]
      if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 160)
    return () => clearTimeout(t)
  }, [highlightMessageId, messages])

  // Markdown renderers that highlight the active search term (only built when a
  // term is present so normal messages keep the shared, memoized renderers).
  const highlightComponents = useMemo(
    () => buildHighlightComponents((highlightQuery || '').trim()),
    [highlightQuery]
  )

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 relative">
      {/* Header bar (ChatGPT-style): conversation title + new chat action */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-gray-200 dark:border-white/10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm z-20 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <img src="/veefore-logo.png" alt="VeeFore" className="w-6 h-6 flex-shrink-0" />
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
            {title?.trim() || 'VeeGPT'}
          </span>
        </div>
        {onNewChat && (
          <button
            onClick={onNewChat}
            title="New chat"
            aria-label="New chat"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          >
            <PenSquare className="w-4 h-4" />
            <span className="hidden sm:inline">New chat</span>
          </button>
        )}
      </div>

      {/* Messages */}
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        className="flex-1 overflow-y-auto overflow-x-hidden p-6 bg-gradient-to-b from-gray-50/30 to-white dark:from-slate-900/40 dark:to-slate-900" 
        style={{ paddingBottom: '100px' }}
      >
        <div className="max-w-4xl mx-auto space-y-8 overflow-x-hidden">
          {messagesLoading && messages.length === 0 ? (
            // Intentionally render nothing in the message area while messages
            // load — bubble skeletons here look poor and never match the real
            // conversation. The blank canvas fills in once messages arrive.
            null
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                ref={(el) => { messageRefs.current[message.id] = el }}
                className={`flex flex-col space-y-2 scroll-mt-20 ${
                  message.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div 
                  className={`${
                    message.role === 'user' 
                      ? 'max-w-sm w-fit' 
                      : 'max-w-4xl w-full'
                  }`} 
                  style={{
                    minWidth: 0,
                    overflow: 'hidden'
                  }}
                >
                  {/* Message Header */}
                  {message.role === 'user' && (
                    <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 flex items-center">
                      <span>You</span>
                    </div>
                  )}
                  {message.role === 'assistant' && (() => {
                    const isThisStreaming = streamingContent[message.id] !== undefined && isGenerating
                    const isPreparing = preparingMessageId != null && message.id === preparingMessageId
                    // A regenerate streams into a message that already has content
                    // (or prior variants), unlike a fresh reply — show "Re-analyzing".
                    const isRegen = isThisStreaming && (!!message.content?.trim() || !!(message.variants && message.variants.length))
                    return (
                      <div className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-2 flex items-center">
                        <img src="/veefore-logo.png" alt="VeeFore" className="w-4 h-4" />
                        <span className="-ml-0.5 tracking-tight">
                          {(isThisStreaming || isPreparing) ? (isRegen ? "eegpt • Re-analyzing..." : "eegpt • Analyzing...") : "eegpt • Response Ready"}
                        </span>
                      </div>
                    )
                  })()}
                  
                  {/* Message Content */}
                  <div 
                    className={`px-4 py-3 rounded-2xl ${
                      message.role === 'user'
                        ? 'bg-gray-100 dark:bg-slate-800 text-black dark:text-gray-100 inline-block rounded-br-md'
                        : 'bg-transparent text-black dark:text-gray-100'
                    }`} 
                    style={{
                      wordWrap: 'break-word',
                      wordBreak: 'break-word',
                      overflowWrap: 'break-word',
                      maxWidth: '100%'
                    }}
                  >
                    {message.role === 'assistant' ? (
                      <div 
                        className="leading-relaxed"
                        style={{
                          wordWrap: 'break-word',
                          wordBreak: 'break-word',
                          overflowWrap: 'break-word',
                          maxWidth: '100%',
                          width: '100%'
                        }}
                      >
                        {(() => {
                          // Preparing state (e.g. building a post): show a
                          // shimmering status line, like the live "thinking"
                          // indicator, until the work finishes and the composer
                          // opens.
                          if (preparingMessageId != null && message.id === preparingMessageId) {
                            return (
                              <span className="shimmer-text text-[15px]">
                                {preparingStatus || 'Working on it…'}
                              </span>
                            )
                          }
                          // Single source of truth: while streaming use the live
                          // streamed text; once complete it falls back to the
                          // persisted content. Rendering through ONE branch (same
                          // component tree) means no remount/reflow "jerk" when the
                          // stream finishes.
                          const streaming = streamingContent[message.id]
                          const isStreamingThis = streaming !== undefined && isGenerating
                          // Stabilize partial markdown only while actively
                          // streaming; render the final content verbatim.
                          const text = streaming !== undefined
                            ? (isStreamingThis ? stabilizeStreamingMarkdown(streaming) : streaming)
                            : message.content

                          // Empty + generating → shimmer "thinking" indicator.
                          if (streaming !== undefined && streaming === '' && isGenerating) {
                            return (
                              <span className="shimmer-text text-[15px]">
                                {aiStatus || 'Thinking…'}
                              </span>
                            )
                          }

                          return (
                            <div className="markdown-content">
                              <ReactMarkdown remarkPlugins={[remarkGfm]} components={(highlightMessageId === message.id && (highlightQuery || '').trim()) ? highlightComponents : markdownComponents}>
                                {text}
                              </ReactMarkdown>
                            </div>
                          )
                        })()}
                      </div>
                    ) : (
                      <div 
                        className="leading-relaxed"
                        style={{
                          wordWrap: 'break-word',
                          wordBreak: 'break-word',
                          overflowWrap: 'break-word',
                          whiteSpace: 'pre-wrap',
                          maxWidth: '100%',
                          width: '100%'
                        }}
                      >
                        {message.attachments && message.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-2">
                            {message.attachments.map((att, ai) => (
                              att.url && att.mimeType?.startsWith('image/') ? (
                                <img
                                  key={ai}
                                  src={att.url}
                                  alt={att.name || 'attachment'}
                                  onClick={() => att.url && setLightbox({ url: att.url, mimeType: att.mimeType, name: att.name })}
                                  className="w-24 h-24 rounded-lg object-cover border border-gray-300/50 dark:border-white/10 cursor-pointer hover:opacity-90 transition-opacity"
                                />
                              ) : att.url && att.mimeType?.startsWith('video/') ? (
                                <div
                                  key={ai}
                                  onClick={() => att.url && setLightbox({ url: att.url, mimeType: att.mimeType, name: att.name })}
                                  className="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-300/50 dark:border-white/10 bg-black cursor-pointer hover:opacity-90 transition-opacity"
                                >
                                  {att.posterUrl ? (
                                    <img src={att.posterUrl} alt={att.name || 'video'} className="w-full h-full object-cover" />
                                  ) : (
                                    <video src={`${att.url}#t=0.1`} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                                  )}
                                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <div className="w-7 h-7 rounded-full bg-black/50 flex items-center justify-center">
                                      <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  key={ai}
                                  onClick={() => att.url && setLightbox({ url: att.url, mimeType: att.mimeType, name: att.name })}
                                  className={`flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/60 dark:bg-black/20 border border-gray-300/50 dark:border-white/10 ${att.url ? 'cursor-pointer hover:bg-white/80 dark:hover:bg-black/30 transition-colors' : ''}`}
                                >
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${att.mimeType === 'application/pdf' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300' : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300'}`}>
                                    {att.mimeType === 'application/pdf' ? 'PDF' : 'IMG'}
                                  </span>
                                  <span className="text-xs text-gray-700 dark:text-gray-200 truncate max-w-[140px]">{att.name || 'attachment'}</span>
                                </div>
                              )
                            ))}
                          </div>
                        )}
                        {message.content && message.content.trim() && (
                          <div className="text-black dark:text-gray-100 text-[15px]">
                            {(highlightMessageId === message.id && (highlightQuery || '').trim())
                              ? highlightChildren(message.content, (highlightQuery || '').trim())
                              : message.content}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Inline post-confirm card rehydrated from persisted history. */}
                  {message.role === 'assistant' && renderMessageCard && renderMessageCard(message)}

                  {/* Retry button for a failed/rate-limited assistant message. */}
                  {message.role === 'assistant' && (message as any).retryable && onRetry && !(streamingContent[message.id] !== undefined && isGenerating) && (
                    <button
                      onClick={onRetry}
                      disabled={isGenerating}
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 hover:bg-blue-50 dark:hover:bg-blue-500/10 disabled:opacity-50"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Retry
                    </button>
                  )}

                  {/* Action row (copy · regenerate · variant navigator) — shown on a
                      completed assistant reply, ChatGPT-style. */}
                  {message.role === 'assistant' && !(message as any).retryable && !((streamingContent[message.id] !== undefined && isGenerating) || (preparingMessageId != null && message.id === preparingMessageId)) && (
                    <div className="flex items-center gap-0.5 mt-1.5 -ml-1.5">
                      {/* Variant navigator (1/2, 2/2) when this reply was regenerated. */}
                      {Array.isArray(message.variants) && message.variants.length > 1 && (() => {
                        const total = message.variants!.length
                        const active = typeof message.activeVariant === 'number' ? message.activeVariant : total - 1
                        return (
                          <div className="flex items-center text-gray-400 dark:text-gray-500 mr-0.5 select-none">
                            <button
                              onClick={() => onSwitchVariant && active > 0 && onSwitchVariant(message, active - 1)}
                              disabled={active <= 0}
                              title="Previous response"
                              className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <span className="text-xs tabular-nums px-0.5">{active + 1}/{total}</span>
                            <button
                              onClick={() => onSwitchVariant && active < total - 1 && onSwitchVariant(message, active + 1)}
                              disabled={active >= total - 1}
                              title="Next response"
                              className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )
                      })()}

                      <button
                        onClick={() => copyMessage(message)}
                        title={copiedId === message.id ? 'Copied' : 'Copy'}
                        aria-label="Copy response"
                        className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                      >
                        {copiedId === message.id ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </button>

                      {onRegenerate && message.id === lastAssistantId && (
                        <button
                          onClick={() => onRegenerate(message)}
                          disabled={isGenerating}
                          title="Regenerate response"
                          aria-label="Regenerate response"
                          className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-40 transition-colors"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Message timestamp — value is the message's stored createdAt
                      (server-authoritative start time). For a regenerated reply
                      it uses the ACTIVE variant's own time, so switching 1/2 ↔ 2/2
                      shows when that version was generated. Hidden while streaming. */}
                  {(() => {
                    const vs = Array.isArray(message.variants) ? message.variants : null
                    const activeIdx = vs && vs.length ? (typeof message.activeVariant === 'number' ? message.activeVariant : vs.length - 1) : -1
                    const tsValue = (vs && activeIdx >= 0 && (vs[activeIdx] as any)?.createdAt) || message.createdAt
                    const hidden = message.role === 'assistant' && ((streamingContent[message.id] !== undefined && isGenerating) || (preparingMessageId != null && message.id === preparingMessageId))
                    if (!tsValue || hidden) return null
                    return (
                      <div className={`mt-2 text-xs text-gray-500 dark:text-gray-400 ${message.role === 'user' ? 'text-right' : 'text-left'}`}>
                        {new Date(tsValue).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )
                  })()}
                </div>
              </div>
            ))
          )}
          
          {/* Pending AI indicator — shown immediately when generation starts
              (before the first server event arrives) and until THIS conversation
              has a streaming assistant message. Scoped to the messages on screen
              (not a global streamingContent check) so it still appears when
              another conversation is streaming in the background (multi-tasking). */}
          {isGenerating && !messages.some(m => m.role === 'assistant' && streamingContent[m.id] !== undefined) && (
            <div className="flex flex-col space-y-2 items-start">
              <div className="max-w-4xl w-full">
                <div className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-2 flex items-center">
                  <img src="/veefore-logo.png" alt="VeeFore" className="w-4 h-4" />
                  <span className="-ml-0.5 tracking-tight">eegpt • Analyzing...</span>
                </div>
                <div className="bg-transparent px-4 py-3 rounded-2xl">
                  <div className="flex items-center">
                    <span className="shimmer-text text-[15px]">
                      {aiStatus || 'Thinking…'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {footerSlot}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Scroll-to-bottom button — appears when the user has scrolled up */}
      {showScrollButton && (
        <button
          onClick={() => scrollToBottom()}
          aria-label="Scroll to bottom"
          style={{
            position: 'absolute',
            bottom: '96px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1001,
          }}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-white/10 shadow-md text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      )}

      {/* Truly floating transparent input - absolute position within chat area */}
      <div style={{ 
        position: 'absolute',
        bottom: '34px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: '48rem',
        padding: '0 24px',
        pointerEvents: 'none',
        zIndex: 1000
      }}>
        {/* Pending attachment thumbnails (clickable to preview) */}
        {attachments.length > 0 && (
          <div style={{ pointerEvents: 'auto', display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
            {attachments.map((att, i) => {
              const isImage = att.mimeType?.startsWith('image/')
              const isVideo = att.mimeType?.startsWith('video/')
              const canPreview = isImage && !!att.previewUrl
              return (
                <div key={i} className="relative group">
                  <div
                    onClick={() => canPreview && att.previewUrl && setLightbox({ url: att.previewUrl, mimeType: att.mimeType, name: att.name })}
                    className={`w-16 h-16 rounded-lg overflow-hidden border border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-slate-800 flex items-center justify-center ${canPreview ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''}`}
                    title={att.name}
                  >
                    {isImage && att.previewUrl ? (
                      <img src={att.previewUrl} alt={att.name} className="w-full h-full object-cover" />
                    ) : isVideo ? (
                      <div className="relative w-full h-full bg-black">
                        {att.posterUrl ? (
                          <img src={att.posterUrl} alt={att.name} className="w-full h-full object-cover" />
                        ) : att.previewUrl ? (
                          <video src={att.previewUrl} className="w-full h-full object-cover" muted loop autoPlay playsInline preload="auto" />
                        ) : null}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-6 h-6 rounded-full bg-black/50 flex items-center justify-center">
                            <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-1">
                        <span className="text-[10px] font-bold text-red-600 dark:text-red-300">PDF</span>
                        <span className="text-[8px] text-gray-500 px-1 truncate max-w-[56px]">{att.name}</span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => onRemoveAttachment?.(i)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-700 text-white flex items-center justify-center shadow hover:bg-gray-900"
                    title="Remove"
                  >
                    <X style={{ width: 12, height: 12 }} />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Advanced selectors: VeeGPT agent (persona) + social account focus */}
        {agents && agents.length > 0 && onSelectAgent && onSelectAccount && (
          <div style={{ pointerEvents: 'auto', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <VeeGPTSelectors
              compact
              agents={agents}
              selectedAgentId={selectedAgentId || 'default'}
              onSelectAgent={onSelectAgent}
              accounts={accounts || []}
              selectedAccountId={selectedAccountId ?? null}
              onSelectAccount={onSelectAccount}
            />
            {selectedTool && onSelectTool && (
              <button
                type="button"
                onClick={() => onSelectTool(null)}
                title="Remove selected tool"
                className="flex items-center gap-1 rounded-full border border-blue-300 dark:border-blue-400/40 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 px-2.5 py-1 text-xs font-medium"
              >
                <Wrench className="w-3 h-3" />
                {getComposerTool(selectedTool)?.label || 'Tool'}
                <X className="w-3 h-3 opacity-70" />
              </button>
            )}
          </div>
        )}

        {/* Pill-shaped composer container */}
        <div className="veegpt-composer" style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
          padding: '12px 16px',
          borderRadius: '26px',
          transition: 'all 0.2s ease',
          pointerEvents: 'auto',
          minHeight: '52px'
        }}>
          <div style={{ marginTop: '2px' }}>
            <ComposerPlusMenu
              compact
              onAddFiles={(files) => onAddAttachments?.(files)}
              selectedTool={selectedTool ?? null}
              onSelectTool={(id) => onSelectTool?.(id)}
            />
          </div>
          
          <div style={{
            flex: 1,
            position: 'relative',
            display: 'flex',
            alignItems: 'flex-start',
            minHeight: '20px'
          }}>
            <div
              ref={inputRef}
              contentEditable
              suppressContentEditableWarning
              className="text-gray-900 dark:text-gray-100"
              onInput={(e) => {
                const text = e.currentTarget.innerText
                onInputChange(text)
              }}
              onPaste={(e) => {
                // If the clipboard has image files (e.g. a screenshot or copied
                // image), attach them like an upload instead of pasting binary.
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
                if (files.length && onAddAttachments) {
                  e.preventDefault()
                  onAddAttachments(files)
                }
              }}
              onKeyDown={onKeyPress}
              style={{
                width: '100%',
                minHeight: '20px',
                maxHeight: '120px',
                overflowY: 'auto',
                overflowX: 'hidden',
                outline: 'none',
                border: 'none',
                background: 'transparent',
                backgroundColor: 'transparent',
                fontSize: '16px',
                lineHeight: '24px',
                padding: '0',
                margin: '0',
                boxShadow: 'none',
                borderRadius: 0,
                WebkitAppearance: 'none',
                MozAppearance: 'none',
                appearance: 'none',
                position: 'relative',
                wordWrap: 'break-word',
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
                overflowWrap: 'break-word'
              }}
              data-placeholder={inputText.length === 0 ? "Message VeeGPT" : ""}
            />
          </div>
          
          {isGenerating ? (
            <button
              onClick={onStopGeneration}
              title="Stop generating"
              aria-label="Stop generating"
              className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-sm hover:brightness-110 active:scale-95 transition-all duration-200"
              style={{ marginTop: '0px', border: 'none', outline: 'none', cursor: 'pointer' }}
            >
              <span className="block w-2.5 h-2.5 rounded-[3px] bg-white" />
            </button>
          ) : (
            <button
              onClick={onSendMessage}
              disabled={!inputText.trim() && attachments.length === 0}
              style={{
                background: 'transparent',
                backgroundColor: 'transparent',
                border: 'none',
                outline: 'none',
                padding: '4px',
                cursor: (inputText.trim() || attachments.length) ? 'pointer' : 'not-allowed',
                color: (inputText.trim() || attachments.length) ? '#1f2937' : '#9ca3af',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: '2px'
              }}
            >
              <Send style={{ width: '20px', height: '20px' }} />
            </button>
          )}

          {speech.supported && (
            <button
              onClick={speech.toggle}
              title={speech.listening ? 'Stop voice input' : 'Speak your message'}
              aria-label={speech.listening ? 'Stop voice input' : 'Speak your message'}
              style={{
                background: speech.listening ? 'rgba(239,68,68,0.12)' : 'transparent',
                border: 'none',
                outline: 'none',
                padding: '4px',
                borderRadius: '9999px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              className={speech.listening ? 'animate-pulse' : ''}
            >
              <Mic style={{
                width: '20px',
                height: '20px',
                color: speech.listening ? '#ef4444' : '#6b7280'
              }} />
            </button>
          )}
        </div>
      </div>
      
      {/* Footer text positioned below the floating input */}
      <div style={{ 
        position: 'absolute',
        bottom: '10px',
        left: '50%',
        transform: 'translateX(-50%)',
        textAlign: 'center',
        pointerEvents: 'none',
        zIndex: 999
      }}>
        <div className="text-xs text-gray-500 dark:text-gray-400 px-3 py-1">
          VeeGPT can make mistakes. Check important info.
        </div>
      </div>

      {/* Fullscreen media viewer (lightbox) — opens on attachment click. */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          {/* Top bar: filename + download + close */}
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3" onClick={(e) => e.stopPropagation()}>
            <span className="text-sm text-white/80 truncate max-w-[60%]">{lightbox.name || 'Attachment'}</span>
            <div className="flex items-center gap-2">
              <a
                href={lightbox.url}
                download={lightbox.name || true}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                title="Download / open"
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

          {/* Content */}
          <div className="max-w-[90vw] max-h-[85vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {lightbox.mimeType?.startsWith('image/') ? (
              <img src={lightbox.url} alt={lightbox.name || 'image'} className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg" />
            ) : lightbox.mimeType?.startsWith('video/') ? (
              <video src={lightbox.url} className="max-w-[90vw] max-h-[85vh] rounded-lg" controls autoPlay playsInline />
            ) : lightbox.mimeType === 'application/pdf' ? (
              <iframe src={lightbox.url} title={lightbox.name || 'pdf'} className="w-[90vw] h-[85vh] rounded-lg bg-white" />
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
      )}
    </div>
  )
}
