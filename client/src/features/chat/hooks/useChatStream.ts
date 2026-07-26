/**
 * useChatStream Hook (HTTP streaming)
 *
 * Streams the AI reply over plain HTTP — the same approach ChatGPT/Claude/OpenAI use:
 * the assistant tokens arrive as the body of the POST request that sends the
 * user's message. This removes all WebSocket fragility (connect/subscribe race,
 * mid-stream reconnect, replay doubling, proxy/tunnel upgrade failures).
 *
 * The server responds with newline-delimited JSON (NDJSON) events:
 *   {"type":"conversation",...}  (new chat only)
 *   {"type":"userMessage",...}
 *   {"type":"status","status":"..."}
 *   {"type":"aiMessageStart","messageId":N}
 *   {"type":"chunk","content":"<cumulative text>","messageId":N}
 *   {"type":"complete","messageId":N,"finalContent":"..."}
 *   {"type":"error","error":"..."}
 *
 * We read it with a fetch ReadableStream reader and update React Query cache /
 * streaming state as events arrive.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { syncAICreditsFromResponse } from '@/lib/queryClient'
import { ChatMessage, WebSocketMessage, StreamingContent } from '../types/chat.types'

export interface UseChatStreamOptions {
  maxReconnectAttempts?: number
  reconnectDelay?: number
  connectionTimeout?: number
  isDevelopment?: boolean
}

export interface ChatStreamState {
  connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'error'
  aiStatus: string | null
  isGenerating: boolean
  isContentStreaming: boolean
  streamingContent: StreamingContent
  /** Map of streaming messageId → the conversation it belongs to. */
  streamingConvId: { [id: number]: number }
  /** Per-conversation "is generating" flags (drives multi-tasking Stop/Send UI). */
  generatingConvIds: { [id: number]: boolean }
  reconnectAttempts: number
}

/** An attachment (image/PDF) sent with a message: base64 data + mime type. */
export interface ChatAttachment {
  mimeType: string
  data: string
  name?: string
}

/** A rich optimistic attachment shown on the user bubble the instant it sends
 *  (local preview / poster for video) — replaced by the hosted URL the server
 *  echoes back on the `userMessage` event. */
export interface OptimisticAttachment {
  name?: string
  mimeType: string
  url?: string
  posterUrl?: string
}

export interface UseChatStreamReturn extends ChatStreamState {
  subscribeToConversation: (conversationId: number) => void
  unsubscribeFromConversation: () => void
  reconnect: () => void
  disconnect: () => void
  /** Send a message; streams the assistant reply over HTTP. */
  sendMessage: (conversationId: number, content: string, workspaceId?: string, attachments?: ChatAttachment[], opts?: { skipUserMessage?: boolean; includeWorkspaceContext?: boolean; enableTools?: boolean; localNow?: string; timezone?: string; hasMedia?: boolean; mediaUrls?: string[]; userMessageId?: number; optimisticAttachments?: OptimisticAttachment[]; seedOptimistic?: boolean; selectedAccountId?: string | null; selectedAgentId?: string; forcedTool?: string | null }) => Promise<any>
  /**
   * Stream a brand-new conversation's first message. The POST returns the
   * conversation + user message then streams the reply on the same request.
   */
  createAndStream: (content: string, workspaceId?: string, attachments?: ChatAttachment[], opts?: { enableTools?: boolean; localNow?: string; timezone?: string; hasMedia?: boolean; mediaUrls?: string[]; userMessageId?: number; optimisticAttachments?: OptimisticAttachment[]; onConversation?: (conversationId: number) => void; selectedAccountId?: string | null; selectedAgentId?: string; forcedTool?: string | null }) => Promise<{ conversationId: number } | null>
  stopGeneration: (conversationId?: number) => Array<{ conversationId: number; messageId: number; text: string }>
  /** Regenerate an assistant reply in place; appends a variant (1/2, 2/2). */
  regenerate: (conversationId: number, messageId: number, userText: string, opts?: { workspaceId?: string; enableTools?: boolean; localNow?: string; timezone?: string }) => Promise<{ success: boolean } | null>
  clearStreamingContent: (messageId?: number) => void
  isGeneratingRef: React.MutableRefObject<boolean>
}

async function getAuthToken(): Promise<string> {
  const { getAuth } = await import('firebase/auth')
  const user = getAuth().currentUser
  if (!user) throw new Error('Please sign in to continue')
  return user.getIdToken()
}

export const useChatStream = (
  _options: UseChatStreamOptions = {}
): UseChatStreamReturn => {
  const queryClient = useQueryClient()

  const isGeneratingRef = useRef<boolean>(false)
  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const currentConversationIdRef = useRef<number | null>(null)
  // One AbortController PER conversation, so Stop (and unmount) can abort exactly
  // the right in-flight stream without touching other conversations that are
  // streaming concurrently (multi-tasking-safe).
  const abortControllersRef = useRef<Map<number, AbortController>>(new Map())
  // Which conversation each streaming message belongs to. Captured when the
  // message starts so it ALWAYS finalizes into its own conversation, even if the
  // user navigates to a different chat mid-stream.
  const msgConvRef = useRef<{ [id: number]: number }>({})

  // Smooth reveal: the model returns text in big bursts, so we animate the
  // visible text toward the latest received ("target") text at a steady pace —
  // like ChatGPT — instead of dumping whole bursts at once.
  const targetRef = useRef<{ [id: number]: string }>({})        // latest full text received per message
  const shownLenRef = useRef<{ [id: number]: number }>({})      // chars currently revealed per message
  const completedRef = useRef<{ [id: number]: { finalText: string; convId: number } | null }>({}) // set when final content arrived
  const rafRef = useRef<number | null>(null)
  const lastTickRef = useRef<number>(0)
  // Tool-call results (e.g. schedule_post → a post-confirm card) keyed by the
  // assistant message id, applied to the message when it finalizes so the inline
  // confirm card renders from the same single streamed message (no extra system).
  const pendingPostCardRef = useRef<{ [id: number]: any }>({})
  // Read-only list cards (posts) + edit-confirm cards keyed by message id,
  // attached when the message finalizes so they render from the single message.
  const pendingListCardRef = useRef<{ [id: number]: any }>({})
  // Multiple edit-confirm cards per message (multi-tool turns).
  const pendingEditCardsRef = useRef<{ [id: number]: any[] }>({})
  // Info/assist cards (captions, hashtags, insight, recommendations, best_time,
  // trends) per message — multiple may arrive in one turn.
  const pendingInfoCardsRef = useRef<{ [id: number]: any[] }>({})
  // Whether a finalized assistant message is a retryable error (provider down).
  const pendingRetryableRef = useRef<{ [id: number]: boolean }>({})
  // Variant set (ChatGPT 1/2, 2/2) attached on a regenerate's complete event.
  const pendingVariantsRef = useRef<{ [id: number]: { variants: any[]; activeVariant: number } }>({})

  const [connectionStatus] = useState<'connected' | 'connecting' | 'disconnected' | 'error'>('connected')
  const [aiStatus, setAiStatus] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isContentStreaming, setIsContentStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState<StreamingContent>({})
  // Mirror of msgConvRef as state so the UI can scope the live stream display to
  // the conversation a message belongs to (no cross-conversation bleed).
  const [streamingConvId, setStreamingConvId] = useState<{ [id: number]: number }>({})
  // Per-conversation "is generating" flags. This is what lets the UI support
  // multi-tasking: only the conversation that is actually streaming shows the
  // Stop button, every other (idle) conversation can accept a new message.
  const [generatingConvIds, setGeneratingConvIds] = useState<{ [id: number]: boolean }>({})
  const [reconnectAttempts] = useState(0)

  const streamingContentRef = useRef<StreamingContent>({})
  useEffect(() => { streamingContentRef.current = streamingContent }, [streamingContent])

  /** Flip a conversation's "generating" flag (drives the per-chat Stop/Send UI). */
  const markGenerating = useCallback((convId: number, on: boolean) => {
    if (!convId) return
    setGeneratingConvIds(prev => {
      if (!!prev[convId] === on) return prev
      const next = { ...prev }
      if (on) next[convId] = true
      else delete next[convId]
      return next
    })
  }, [])

  const messagesKey = (convId: number) => ['/api/chat/conversations', convId, 'messages']

  /** Finalize a message: persist final text to cache, clear streaming buffers. */
  const finalizeMessageRef = useRef<((convId: number, messageId: number, finalText: string) => void) | null>(null)

  /**
   * Steady character-reveal loop (~ChatGPT cadence). Advances each message's
   * shown length toward its target by a rate proportional to the backlog, so it
   * always catches up but never dumps a whole burst instantly. Finalizes a
   * message once it's fully revealed AND its final content has arrived.
   */
  const ensureRevealLoop = useCallback(() => {
    if (rafRef.current != null) return
    lastTickRef.current = performance.now()

    const tick = () => {
      const now = performance.now()
      const dt = Math.min(100, now - lastTickRef.current)
      lastTickRef.current = now

      let anyPending = false
      const updates: StreamingContent = {}

      for (const idStr of Object.keys(targetRef.current)) {
        const id = Number(idStr)
        const target = targetRef.current[id] ?? ''
        const shown = shownLenRef.current[id] ?? 0
        if (shown < target.length) {
          const backlog = target.length - shown
          // Reveal speed: ~ baseline chars/sec plus a fraction of the backlog so
          // big bursts catch up smoothly. ~80 cps baseline, +12% of backlog/sec.
          const charsThisFrame = Math.max(1, Math.ceil((80 + backlog * 1.2) * (dt / 1000)))
          const nextLen = Math.min(target.length, shown + charsThisFrame)
          shownLenRef.current[id] = nextLen
          updates[id] = target.slice(0, nextLen)
          if (nextLen < target.length) anyPending = true
        }

        // Fully revealed + final content received → finalize.
        const done = completedRef.current[id]
        if (done && (shownLenRef.current[id] ?? 0) >= target.length) {
          // Finalize into the message's OWN conversation, established from the
          // server's authoritative `complete`/`aiMessageStart` events. NEVER fall
          // back to "whatever chat is on screen" — that fallback is exactly what
          // let a reply land in the wrong conversation during multi-tasking.
          const ownConv = done.convId || msgConvRef.current[id] || 0
          if (ownConv) finalizeMessageRef.current?.(ownConv, id, done.finalText)
          delete targetRef.current[id]
          delete shownLenRef.current[id]
          delete completedRef.current[id]
        } else if (done) {
          anyPending = true
        }
      }

      if (Object.keys(updates).length > 0) {
        setStreamingContent(prev => ({ ...prev, ...updates }))
      }

      if (anyPending || Object.keys(targetRef.current).length > 0) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        rafRef.current = null
      }
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [])

  // Finalize: write the persisted final text into the messages cache, clear the
  // streaming placeholder, and reset generation state.
  const finalizeMessage = useCallback((convId: number, messageId: number, finalText: string) => {
    if (convId) {
      const postCard = pendingPostCardRef.current[messageId]
      const listCard = pendingListCardRef.current[messageId]
      const editCards = pendingEditCardsRef.current[messageId]
      const infoCards = pendingInfoCardsRef.current[messageId]
      const retryable = pendingRetryableRef.current[messageId]
      const variantInfo = pendingVariantsRef.current[messageId]
      queryClient.setQueryData(messagesKey(convId), (old: ChatMessage[] = []) =>
        old.map(m => (m.id === messageId ? { ...m, content: finalText, ...(postCard ? { postCard } : {}), ...(listCard ? { listCard } : {}), ...(editCards?.length ? { editCards } : {}), ...(infoCards?.length ? { infoCards } : {}), ...(retryable ? { retryable: true } : {}), ...(variantInfo ? { variants: variantInfo.variants, activeVariant: variantInfo.activeVariant } : {}) } : m))
      )
      delete pendingPostCardRef.current[messageId]
      delete pendingListCardRef.current[messageId]
      delete pendingEditCardsRef.current[messageId]
      delete pendingInfoCardsRef.current[messageId]
      delete pendingRetryableRef.current[messageId]
      delete pendingVariantsRef.current[messageId]
    }
    setStreamingContent(prev => {
      const next = { ...prev }
      delete next[messageId]
      return next
    })
    delete msgConvRef.current[messageId]
    setStreamingConvId(prev => {
      const next = { ...prev }
      delete next[messageId]
      return next
    })
    setIsGenerating(false)
    setIsContentStreaming(false)
    isGeneratingRef.current = false
    setAiStatus(null)
    markGenerating(convId, false)
    queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations'], exact: true })
  }, [queryClient, markGenerating])

  useEffect(() => { finalizeMessageRef.current = finalizeMessage }, [finalizeMessage])

  /** Apply a single NDJSON stream event to cache / streaming state. */
  const handleEvent = useCallback((streamConvId: number, data: WebSocketMessage & { conversation?: any }) => {
    // Metered tool cards include the post-deduction balance in this same HTTP
    // stream, so the header can update immediately without a WebSocket.
    syncAICreditsFromResponse(data)
    // ALWAYS trust the conversationId the server stamps on the event when present.
    // With concurrent streams (multi-tasking) a single closure convId is fragile;
    // routing every cache write by the event's own conversationId guarantees a
    // reply can never land in (or bleed into) another conversation.
    const convId = ((data as any).conversationId as number) || streamConvId
    switch (data.type) {
      case 'status':
        setAiStatus(data.status || data.content || null)
        if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current)
        statusTimeoutRef.current = setTimeout(() => setAiStatus(null), 10000)
        break

      case 'userMessage':
        if (data.message) {
          queryClient.setQueryData(messagesKey(convId), (old: ChatMessage[] = []) => {
            const incoming = data.message!
            const incomingHasAttach = !!(incoming as any).attachments?.length
            // If an entry with the SAME id already exists (the optimistic bubble
            // used the client-supplied id the server honored), reconcile in place:
            // adopt the server's hosted-URL attachments but keep any locally
            // generated video poster so the still thumbnail doesn't flicker.
            const sameIdIdx = old.findIndex((m) => m.id === incoming.id)
            if (sameIdIdx !== -1) {
              const prev = old[sameIdIdx] as any
              const mergedAttachments = incomingHasAttach
                ? (incoming as any).attachments.map((a: any, i: number) => ({
                    ...a,
                    posterUrl: a.posterUrl || prev.attachments?.[i]?.posterUrl,
                  }))
                : prev.attachments
              const next = [...old]
              next[sameIdIdx] = { ...prev, ...incoming, attachments: mergedAttachments }
              return next
            }
            // Otherwise replace any optimistic temp user message (temp id > 1e12)
            // matching by content or by also carrying attachments.
            const withoutOptimistic = old.filter((m) => {
              const isTempUser = m.role === 'user' && m.id > 1e12
              if (!isTempUser) return true
              const contentMatch = m.content === incoming.content
              const attachMatch = incomingHasAttach && !!(m as any).attachments?.length
              return !(contentMatch || attachMatch)
            })
            return [...withoutOptimistic, incoming]
          })
        }
        break

      case 'aiMessageStart':
        if (data.messageId) {
          setIsGenerating(true)
          isGeneratingRef.current = true
          markGenerating(convId, true)
          msgConvRef.current[data.messageId] = convId
          setStreamingConvId(prev => ({ ...prev, [data.messageId!]: convId }))
          setStreamingContent(prev => ({ ...prev, [data.messageId!]: '' }))
          queryClient.setQueryData(messagesKey(convId), (old: ChatMessage[] = []) => {
            if (old.some(m => m.id === data.messageId)) return old
            return [...old, {
              id: data.messageId!, conversationId: convId, role: 'assistant',
              content: '', tokensUsed: 0, createdAt: new Date().toISOString(),
            } as ChatMessage]
          })
        }
        break

      case 'chunk':
        // Server sends cumulative text → set as the reveal target; the RAF loop
        // animates the visible text toward it at a steady, ChatGPT-like pace.
        if (data.messageId && data.content !== undefined) {
          setAiStatus(null)
          setIsContentStreaming(true)
          setIsGenerating(true)
          isGeneratingRef.current = true
          if (msgConvRef.current[data.messageId] == null) {
            msgConvRef.current[data.messageId] = convId
            setStreamingConvId(prev => ({ ...prev, [data.messageId!]: convId }))
          }
          if (statusTimeoutRef.current) { clearTimeout(statusTimeoutRef.current); statusTimeoutRef.current = null }
          targetRef.current[data.messageId] = data.content || ''
          if (shownLenRef.current[data.messageId] == null) shownLenRef.current[data.messageId] = 0
          ensureRevealLoop()
        }
        break

      case 'toolCall':
        // The model decided to perform an action (e.g. schedule_post) mid-chat.
        // Stash the resulting plan as a post-confirm card AND write it into the
        // cache immediately so it appears in the same frame as the other cards
        // (avoids the post card "popping in" later than edit/list cards → jitter).
        if (data.messageId && (data as any).plan) {
          const card = { plan: (data as any).plan, mediaUrls: (data as any).mediaUrls || [], status: 'idle' }
          pendingPostCardRef.current[data.messageId] = card
          queryClient.setQueryData(messagesKey(convId), (old: ChatMessage[] = []) =>
            old.map(m => (m.id === data.messageId ? { ...m, postCard: card } : m))
          )
        }
        break

      case 'listCard':
        // A read-only list of the user's posts (scheduled/draft/published) to
        // render as cards. Write it into the cache IMMEDIATELY (don't wait for
        // the text reveal to finish) so the cards appear as soon as they're ready.
        if (data.messageId && (data as any).listCard) {
          pendingListCardRef.current[data.messageId] = (data as any).listCard
          queryClient.setQueryData(messagesKey(convId), (old: ChatMessage[] = []) =>
            old.map(m => (m.id === data.messageId ? { ...m, listCard: (data as any).listCard } : m))
          )
        }
        break

      case 'editCard':
        // A proposed edit awaiting confirmation. Multiple may arrive in one turn
        // (multi-tool). Accumulate into an array and show immediately.
        if (data.messageId && (data as any).editCard) {
          const arr = pendingEditCardsRef.current[data.messageId] || []
          arr.push((data as any).editCard)
          pendingEditCardsRef.current[data.messageId] = arr
          const snapshot = [...arr]
          queryClient.setQueryData(messagesKey(convId), (old: ChatMessage[] = []) =>
            old.map(m => (m.id === data.messageId ? { ...m, editCards: snapshot } : m))
          )
        }
        break

      case 'infoCard':
        // An info/assist card (captions, hashtags, insight, recommendations,
        // research). Buffer it ONLY — do NOT write to cache now. The card is
        // attached in finalizeMessage() once the streamed text has finished
        // revealing, so the card appears AFTER the response (not before it).
        if (data.messageId && (data as any).infoCard) {
          const arr = pendingInfoCardsRef.current[data.messageId] || []
          arr.push((data as any).infoCard)
          pendingInfoCardsRef.current[data.messageId] = arr
        }
        break

      case 'complete':
        if (data.messageId) {
          const finalText = data.finalContent ?? streamingContentRef.current[data.messageId] ?? ''
          if (msgConvRef.current[data.messageId] == null) {
            msgConvRef.current[data.messageId] = convId
            setStreamingConvId(prev => ({ ...prev, [data.messageId!]: convId }))
          }
          // A post-confirm card may arrive on the complete event (tool call).
          if ((data as any).postCard) {
            pendingPostCardRef.current[data.messageId] = (data as any).postCard
          }
          if ((data as any).listCard) {
            pendingListCardRef.current[data.messageId] = (data as any).listCard
          }
          if ((data as any).editCards) {
            pendingEditCardsRef.current[data.messageId] = (data as any).editCards
          }
          if ((data as any).infoCards) {
            pendingInfoCardsRef.current[data.messageId] = (data as any).infoCards
          }
          if ((data as any).retryable) {
            pendingRetryableRef.current[data.messageId] = true
          }
          if ((data as any).variants) {
            pendingVariantsRef.current[data.messageId] = { variants: (data as any).variants, activeVariant: (data as any).activeVariant ?? ((data as any).variants.length - 1) }
          }
          // Mark as complete; the reveal loop finalizes once it has shown all
          // the text, so the bubble never jumps to the full response.
          targetRef.current[data.messageId] = finalText
          if (shownLenRef.current[data.messageId] == null) shownLenRef.current[data.messageId] = 0
          completedRef.current[data.messageId] = { finalText, convId }
          ensureRevealLoop()
        } else {
          setIsGenerating(false)
          setIsContentStreaming(false)
          isGeneratingRef.current = false
          setAiStatus(null)
          queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations'], exact: true })
        }
        break

      case 'error':
        console.error('[useChatStream] Stream error:', data.error)
        setIsGenerating(false)
        setIsContentStreaming(false)
        isGeneratingRef.current = false
        setAiStatus(null)
        markGenerating(convId, false)
        break
    }
  }, [queryClient, markGenerating])

  /**
   * POST to `url` and consume the NDJSON streaming response, dispatching each
   * event. `onConversation` is called for the new-chat `conversation` event.
   */
  const consumeStream = useCallback(async (
    url: string,
    body: any,
    convIdResolver: (conversation?: any) => number,
    onConversation?: (conversation: any) => void,
    knownConvId?: number,
  ): Promise<void> => {
    const token = await getAuthToken()
    const controller = new AbortController()
    // Register the controller as soon as we know the conversation. For an
    // existing chat we know it up front; for a brand-new chat we register it when
    // the `conversation` event arrives (below).
    if (knownConvId) abortControllersRef.current.set(knownConvId, controller)

    setIsGenerating(true)
    isGeneratingRef.current = true

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    let convId = convIdResolver()
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // Process complete newline-delimited JSON lines.
        let nlIndex: number
        while ((nlIndex = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, nlIndex).trim()
          buffer = buffer.slice(nlIndex + 1)
          if (!line) continue
          let evt: any
          try { evt = JSON.parse(line) } catch { continue }

          if (evt.type === 'conversation' && evt.conversation) {
            convId = evt.conversation.id
            currentConversationIdRef.current = convId
            // Register this stream's controller under its real conversation id.
            abortControllersRef.current.set(convId, controller)
            markGenerating(convId, true)
            onConversation?.(evt.conversation)
            continue
          }
          if (evt.type === 'conversationTitle' && evt.conversationId) {
            // Patch the title in-place in the sidebar cache — a smooth swap with
            // no refetch flicker (avoids the "raw message → proper title" jump
            // looking janky).
            queryClient.setQueryData(['/api/chat/conversations'], (old: any) =>
              Array.isArray(old)
                ? old.map((c: any) => (c.id === evt.conversationId ? { ...c, title: evt.title } : c))
                : old
            )
            continue
          }
          handleEvent(convId, evt)
        }
      }
      // Flush any trailing buffered line.
      const tail = buffer.trim()
      if (tail) {
        try { handleEvent(convId, JSON.parse(tail)) } catch { /* ignore */ }
      }
    } finally {
      reader.releaseLock()
      // Only remove the controller if it's still the one we registered (a newer
      // send to the same conversation may have replaced it).
      if (convId && abortControllersRef.current.get(convId) === controller) {
        abortControllersRef.current.delete(convId)
      }
      if (knownConvId && abortControllersRef.current.get(knownConvId) === controller) {
        abortControllersRef.current.delete(knownConvId)
      }
    }
  }, [handleEvent, queryClient, markGenerating])

  /** Send a follow-up message to an existing conversation and stream the reply. */
  const sendMessage = useCallback(async (conversationId: number, content: string, workspaceId?: string, attachments?: ChatAttachment[], opts?: { skipUserMessage?: boolean; includeWorkspaceContext?: boolean; enableTools?: boolean; localNow?: string; timezone?: string; hasMedia?: boolean; mediaUrls?: string[]; userMessageId?: number; optimisticAttachments?: OptimisticAttachment[]; seedOptimistic?: boolean; selectedAccountId?: string | null; selectedAgentId?: string; forcedTool?: string | null }): Promise<any> => {
    currentConversationIdRef.current = conversationId
    setIsContentStreaming(false)
    // Show the pending AI indicator immediately (before the network round-trip).
    setIsGenerating(true)
    isGeneratingRef.current = true
    markGenerating(conversationId, true)
    setAiStatus('Thinking…')

    // Optimistic user message (include attachment chips + a sensible label so
    // the bubble shows the files immediately, not after the server echoes back).
    //
    // When skipUserMessage is set (post-agent routeToChat handoff), the user
    // message was ALREADY persisted via /conversations/log and is (or will be)
    // in the messages cache via the query fetch + the server's userMessage event.
    // Adding another optimistic bubble here caused a transient DUPLICATE user
    // bubble during streaming that only collapsed to one after the userMessage
    // event reconciled it. So we skip the optimistic insert entirely in that mode.
    if (!opts?.skipUserMessage && opts?.seedOptimistic !== false) {
      // Rich optimistic attachments (local preview/poster) when provided (media
      // path), else lightweight chips from the base64 attachments (PDF path).
      const optimisticAttachments = opts?.optimisticAttachments?.length
        ? opts.optimisticAttachments
        : (attachments || []).map((a) => ({ name: a.name, mimeType: a.mimeType }))
      const optimisticContent = content.trim() || ' '
      // Use the client-supplied id (same id the server will honor) so the
      // optimistic bubble and the persisted record collapse into ONE.
      const optimisticId = opts?.userMessageId ?? Date.now()
      queryClient.setQueryData(messagesKey(conversationId), (old: ChatMessage[] = []) => {
        // Don't double-insert if the page already seeded this id during upload.
        if (old.some((m) => m.id === optimisticId)) return old
        return [
          ...old,
          { id: optimisticId, conversationId, role: 'user', content: optimisticContent, attachments: optimisticAttachments.length ? optimisticAttachments : undefined, tokensUsed: 0, createdAt: new Date().toISOString() } as ChatMessage,
        ]
      })
    }

    try {
      await consumeStream(
        `/api/chat/conversations/${conversationId}/messages`,
        { content, workspaceId, attachments, skipUserMessage: opts?.skipUserMessage === true, includeWorkspaceContext: opts?.includeWorkspaceContext !== false, enableTools: opts?.enableTools === true, localNow: opts?.localNow, timezone: opts?.timezone, hasMedia: opts?.hasMedia === true, mediaUrls: opts?.mediaUrls, userMessageId: opts?.userMessageId, selectedAccountId: opts?.selectedAccountId ?? null, selectedAgentId: opts?.selectedAgentId, forcedTool: opts?.forcedTool ?? null },
        () => conversationId,
        undefined,
        conversationId,
      )
      return { success: true }
    } catch (error: any) {
      // A deliberate Stop aborts the fetch — that's not a failure, so don't
      // surface it (prevents the composer from resetting the just-sent message).
      if (error?.name === 'AbortError') return { success: true, aborted: true }
      console.error('[useChatStream] sendMessage error:', error)
      setIsGenerating(false)
      isGeneratingRef.current = false
      markGenerating(conversationId, false)
      throw error
    }
  }, [consumeStream, queryClient, markGenerating])

  /** Create a new conversation and stream its first reply over the same request. */
  const createAndStream = useCallback(async (content: string, workspaceId?: string, attachments?: ChatAttachment[], opts?: { enableTools?: boolean; localNow?: string; timezone?: string; hasMedia?: boolean; mediaUrls?: string[]; userMessageId?: number; optimisticAttachments?: OptimisticAttachment[]; onConversation?: (conversationId: number) => void; selectedAccountId?: string | null; selectedAgentId?: string; forcedTool?: string | null }): Promise<{ conversationId: number } | null> => {
    setIsContentStreaming(false)
    // Show the pending AI indicator immediately (before the network round-trip).
    setIsGenerating(true)
    isGeneratingRef.current = true
    setAiStatus('Thinking…')
    let newConvId: number | null = null
    // Rich optimistic attachments (media path) shown the instant the conversation
    // view switches in — reconciled with the server's hosted URLs on userMessage.
    const optimisticAttachments = opts?.optimisticAttachments?.length
      ? opts.optimisticAttachments
      : (attachments || []).map((a) => ({ name: a.name, mimeType: a.mimeType }))
    const optimisticId = opts?.userMessageId ?? Date.now()
    try {
      await consumeStream(
        '/api/chat/conversations',
        { content, workspaceId, attachments, enableTools: opts?.enableTools === true, localNow: opts?.localNow, timezone: opts?.timezone, hasMedia: opts?.hasMedia === true, mediaUrls: opts?.mediaUrls, userMessageId: opts?.userMessageId, selectedAccountId: opts?.selectedAccountId ?? null, selectedAgentId: opts?.selectedAgentId, forcedTool: opts?.forcedTool ?? null },
        () => newConvId ?? 0,
        (conversation) => {
          newConvId = conversation.id
          // Seed the messages cache with the optimistic user bubble so the chat
          // view shows the just-sent message (with its media preview) instantly.
          queryClient.setQueryData(messagesKey(conversation.id), [
            { id: optimisticId, conversationId: conversation.id, role: 'user', content: content.trim() || ' ', attachments: optimisticAttachments.length ? optimisticAttachments : undefined, tokensUsed: 0, createdAt: new Date().toISOString() } as ChatMessage,
          ])
          // Show the new conversation in the sidebar IMMEDIATELY (don't wait for
          // the reply to finish). Prepend it to the conversations list cache.
          queryClient.setQueryData(['/api/chat/conversations'], (old: any) => {
            const list = Array.isArray(old) ? old : []
            if (list.some((c: any) => c.id === conversation.id)) return list
            return [conversation, ...list]
          })
          // Tell the page the conversation id IMMEDIATELY (mid-stream) so it can
          // enable the messages query and render cards (listCard/editCard/postCard)
          // as they arrive — instead of only after the whole stream finishes.
          try { opts?.onConversation?.(conversation.id) } catch { /* noop */ }
        },
      )
      return newConvId != null ? { conversationId: newConvId } : null
    } catch (error: any) {
      // A deliberate Stop aborts the fetch — treat it as a normal stop, not a
      // failure, so the page doesn't reset the just-created conversation.
      if (error?.name === 'AbortError') {
        return newConvId != null ? { conversationId: newConvId } : null
      }
      console.error('[useChatStream] createAndStream error:', error)
      setIsGenerating(false)
      isGeneratingRef.current = false
      throw error
    }
  }, [consumeStream, queryClient])

  /**
   * Regenerate an existing assistant reply (ChatGPT-style). Re-answers the same
   * user prompt and streams INTO the existing message id; the server appends the
   * result as a new variant (1/2, 2/2) so the reply stays in the same position.
   */
  const regenerate = useCallback(async (
    conversationId: number,
    messageId: number,
    userText: string,
    opts?: { workspaceId?: string; enableTools?: boolean; localNow?: string; timezone?: string },
  ): Promise<{ success: boolean } | null> => {
    currentConversationIdRef.current = conversationId
    setIsGenerating(true)
    isGeneratingRef.current = true
    markGenerating(conversationId, true)
    setAiStatus('Thinking…')
    // Optimistically mark THIS message as streaming so the regeneration shows its
    // shimmer IN PLACE immediately — without this there's a brief window before
    // aiMessageStart arrives where the bottom "Analyzing…" placeholder flashes.
    msgConvRef.current[messageId] = conversationId
    setStreamingConvId(prev => ({ ...prev, [messageId]: conversationId }))
    setStreamingContent(prev => ({ ...prev, [messageId]: '' }))
    try {
      await consumeStream(
        `/api/chat/conversations/${conversationId}/messages`,
        { content: userText, regenerateMessageId: messageId, workspaceId: opts?.workspaceId, includeWorkspaceContext: true, enableTools: opts?.enableTools !== false, localNow: opts?.localNow, timezone: opts?.timezone },
        () => conversationId,
        undefined,
        conversationId,
      )
      return { success: true }
    } catch (error: any) {
      if (error?.name === 'AbortError') return { success: true }
      console.error('[useChatStream] regenerate error:', error)
      setIsGenerating(false)
      isGeneratingRef.current = false
      markGenerating(conversationId, false)
      throw error
    }
  }, [consumeStream, markGenerating])

  /**
   * Stop generation. When `targetConvId` is given, ONLY that conversation's
   * stream is aborted and only its messages/flags are cleared — other
   * conversations that are streaming concurrently keep going (multi-tasking).
   * With no argument it stops every active stream (e.g. on disconnect).
   */
  const stopGeneration = useCallback((targetConvId?: number) => {
    if (targetConvId != null) {
      const ctrl = abortControllersRef.current.get(targetConvId)
      if (ctrl) { ctrl.abort(); abortControllersRef.current.delete(targetConvId) }
    } else {
      abortControllersRef.current.forEach((c) => c.abort())
      abortControllersRef.current.clear()
    }

    // Truncate to ONLY what's been revealed so far (drop the unseen buffered
    // remainder) so Stop genuinely stops — the model often finishes server-side
    // before the slow client reveal catches up, and we must not dump the full
    // text. Computed synchronously from refs so we can return it to the caller.
    const belongsToTarget = (id: number) =>
      targetConvId == null || msgConvRef.current[id] === targetConvId
    const stopped: Array<{ conversationId: number; messageId: number; text: string }> = []
    const truncated: { [id: number]: string } = {}
    for (const idStr of Object.keys(targetRef.current)) {
      const id = Number(idStr)
      if (!belongsToTarget(id)) continue
      const shown = shownLenRef.current[id] ?? 0
      const partial = (targetRef.current[id] || '').slice(0, shown)
      truncated[id] = partial
      const conv = msgConvRef.current[id]
      if (conv) stopped.push({ conversationId: conv, messageId: id, text: partial })
      delete targetRef.current[id]
      delete completedRef.current[id]
    }
    setStreamingContent(prev => ({ ...prev, ...truncated }))
    // Freeze the revealed partial into the cache so it sticks (survives the
    // clear-streaming effect) and we never need the server's full version.
    for (const s of stopped) {
      queryClient.setQueryData(messagesKey(s.conversationId), (old: ChatMessage[] = []) =>
        old.map(m => (m.id === s.messageId ? { ...m, content: s.text } : m)))
    }

    // Clear the per-conversation generating flag(s).
    if (targetConvId != null) {
      markGenerating(targetConvId, false)
    } else {
      setGeneratingConvIds({})
    }

    // Keep the global "any active" flag accurate: only fully clear it when no
    // streams remain. The per-conversation flags drive the composer UI; this
    // global is just for the welcome screen / retry gate.
    const anyActive = abortControllersRef.current.size > 0
    if (!anyActive) {
      if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      setIsGenerating(false)
      setIsContentStreaming(false)
      isGeneratingRef.current = false
    }
    return stopped
  }, [markGenerating, queryClient])

  const clearStreamingContent = useCallback((messageId?: number) => {
    if (messageId !== undefined) {
      // Per-message clear: the message has been persisted, so drop its tracking.
      setStreamingContent(prev => {
        const next = { ...prev }
        delete next[messageId]
        return next
      })
      delete msgConvRef.current[messageId]
      setStreamingConvId(prev => {
        const next = { ...prev }
        delete next[messageId]
        return next
      })
    } else {
      // Bulk clear (e.g. New Chat): only hide the visible streaming text. Do NOT
      // wipe msgConvRef/streamingConvId — an in-flight reply must still finalize
      // into its own conversation even if a new chat is started meanwhile.
      setStreamingContent({})
    }
  }, [])

  // No-op connection management (kept for API compatibility with callers).
  const subscribeToConversation = useCallback((conversationId: number) => {
    currentConversationIdRef.current = conversationId
  }, [])
  const unsubscribeFromConversation = useCallback(() => {
    currentConversationIdRef.current = null
  }, [])
  const reconnect = useCallback(() => {}, [])
  const disconnect = useCallback(() => {
    abortControllersRef.current.forEach((c) => c.abort())
    abortControllersRef.current.clear()
  }, [])

  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current)
      abortControllersRef.current.forEach((c) => c.abort())
      abortControllersRef.current.clear()
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return {
    connectionStatus,
    aiStatus,
    isGenerating,
    isContentStreaming,
    streamingContent,
    streamingConvId,
    generatingConvIds,
    reconnectAttempts,
    subscribeToConversation,
    unsubscribeFromConversation,
    reconnect,
    disconnect,
    sendMessage,
    createAndStream,
    regenerate,
    stopGeneration,
    clearStreamingContent,
    isGeneratingRef,
  }
}
