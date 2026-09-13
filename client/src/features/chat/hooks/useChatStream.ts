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

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { syncAICreditsFromResponse } from '@/lib/queryClient';
import { ChatMessage, WebSocketMessage, StreamingContent, ResearchProgressState } from '../types/chat.types';
import { isSameLiveVideoEditorCard } from '../components/video-editor-card.logic';

/**
 * Human-readable "time until capacity returns" for a large retry window (the
 * 5-hour session or the monthly period). Mirrors the composer hint's format so
 * both the proactive notice and the hard refusal read the same: "4h 20m",
 * "45 min", "3 days".
 */
function formatRetryWindow(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  if (s >= 36 * 3600) {
    const d = Math.round(s / 86400);
    return `${d} day${d === 1 ? '' : 's'}`;
  }
  if (s >= 3600) {
    // Round to whole minutes FIRST, then split into h/m so a 59.x-minute
    // remainder rounds up to "5h", never "4h 60m".
    const totalMin = Math.round(s / 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const m = Math.max(1, Math.round(s / 60));
  return `${m} min`;
}

export interface UseChatStreamOptions {
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  connectionTimeout?: number;
  isDevelopment?: boolean;
}

export interface ChatStreamState {
  connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'error';
  aiStatus: string | null;
  isGenerating: boolean;
  isContentStreaming: boolean;
  streamingContent: StreamingContent;
  /** Per-message accumulated real "thinking" text (Gemini reasoning summaries). */
  reasoningContent: { [id: number]: string };
  /** Per-message live deep-research progress (streaming banner). */
  researchProgress: { [id: number]: ResearchProgressState };
  /**
   * Set when the server answered on a different model than the one selected in
   * AI Configuration, because the selection is above the user's plan. Cleared
   * when the next message is sent. A substitution is ALWAYS surfaced — silently
   * swapping models is the behaviour this app deliberately removed.
   */
  modelNotice: ModelNotice | null;
  /** Dismiss the model-substitution notice. */
  clearModelNotice: () => void;
  /** Map of streaming messageId → the conversation it belongs to. */
  streamingConvId: { [id: number]: number };
  /** Per-conversation "is generating" flags (drives multi-tasking Stop/Send UI). */
  generatingConvIds: { [id: number]: boolean };
  reconnectAttempts: number;
}

/**
 * The server served a different model than the user selected, because their plan
 * doesn't include that class (or their monthly premium allowance is spent).
 */
export interface ModelNotice {
  /** The model id the user has selected in AI Configuration. */
  requested: string;
  /** The model id that actually answered. */
  served: string;
  /** Cost class of the model that answered. */
  servedClass: 'light' | 'standard' | 'premium';
  /** Plain-language explanation, ready to display. */
  reason: string;
  /** True when the user is on a plan that can be upgraded. */
  upgrade: boolean;
}

/** An attachment (image/PDF) sent with a message: base64 data + mime type. */
export interface ChatAttachment {
  mimeType: string;
  data: string;
  name?: string;
}

/** A rich optimistic attachment shown on the user bubble the instant it sends
 *  (local preview / poster for video) — replaced by the hosted URL the server
 *  echoes back on the `userMessage` event. */
export interface OptimisticAttachment {
  name?: string;
  mimeType: string;
  url?: string;
  posterUrl?: string;
}

export interface UseChatStreamReturn extends ChatStreamState {
  subscribeToConversation: (conversationId: number) => void;
  unsubscribeFromConversation: () => void;
  reconnect: () => void;
  disconnect: () => void;
  /** Send a message; streams the assistant reply over HTTP. */
  sendMessage: (
    conversationId: number,
    content: string,
    workspaceId?: string,
    attachments?: ChatAttachment[],
    opts?: {
      skipUserMessage?: boolean;
      includeWorkspaceContext?: boolean;
      enableTools?: boolean;
      localNow?: string;
      timezone?: string;
      hasMedia?: boolean;
      mediaUrls?: string[];
      userMessageId?: number;
      optimisticAttachments?: OptimisticAttachment[];
      seedOptimistic?: boolean;
      selectedAccountId?: string | null;
      selectedAgentId?: string;
      forcedTool?: string | null;
      /** Opaque S3 storage keys (upload-first); preferred over base64. */
      attachmentIds?: string[];
    }
  ) => Promise<any>;
  /**
   * Stream a brand-new conversation's first message. The POST returns the
   * conversation + user message then streams the reply on the same request.
   */
  createAndStream: (
    content: string,
    workspaceId?: string,
    attachments?: ChatAttachment[],
    opts?: {
      enableTools?: boolean;
      localNow?: string;
      timezone?: string;
      hasMedia?: boolean;
      mediaUrls?: string[];
      userMessageId?: number;
      optimisticAttachments?: OptimisticAttachment[];
      onConversation?: (conversationId: number) => void;
      selectedAccountId?: string | null;
      selectedAgentId?: string;
      forcedTool?: string | null;
      /** Opaque S3 storage keys (upload-first); preferred over base64. */
      attachmentIds?: string[];
    }
  ) => Promise<{ conversationId: number } | null>;
  stopGeneration: (
    conversationId?: number
  ) => Array<{ conversationId: number; messageId: number; text: string }>;
  /** Regenerate an assistant reply in place; appends a variant (1/2, 2/2). */
  regenerate: (
    conversationId: number,
    messageId: number,
    userText: string,
    opts?: { workspaceId?: string; enableTools?: boolean; localNow?: string; timezone?: string }
  ) => Promise<{ success: boolean } | null>;
  clearStreamingContent: (messageId?: number) => void;
  isGeneratingRef: React.MutableRefObject<boolean>;
}

async function getAuthToken(): Promise<string> {
  const { getAuth } = await import('firebase/auth');
  const user = getAuth().currentUser;
  if (!user) throw new Error('Please sign in to continue');
  return user.getIdToken();
}

export const useChatStream = (_options: UseChatStreamOptions = {}): UseChatStreamReturn => {
  const queryClient = useQueryClient();

  const isGeneratingRef = useRef<boolean>(false);
  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentConversationIdRef = useRef<number | null>(null);
  // One AbortController PER conversation, so Stop (and unmount) can abort exactly
  // the right in-flight stream without touching other conversations that are
  // streaming concurrently (multi-tasking-safe).
  const abortControllersRef = useRef<Map<number, AbortController>>(new Map());
  // Which conversation each streaming message belongs to. Captured when the
  // message starts so it ALWAYS finalizes into its own conversation, even if the
  // user navigates to a different chat mid-stream.
  const msgConvRef = useRef<{ [id: number]: number }>({});

  // Smooth reveal: the model returns text in big bursts, so we animate the
  // visible text toward the latest received ("target") text at a steady pace —
  // like ChatGPT — instead of dumping whole bursts at once.
  const targetRef = useRef<{ [id: number]: string }>({}); // latest full text received per message
  const shownLenRef = useRef<{ [id: number]: number }>({}); // chars currently revealed per message
  // Same smooth-reveal model for the model's "thinking" (reasoning) text, so it
  // types out char-by-char like the answer instead of dumping in big chunks.
  const reasoningTargetRef = useRef<{ [id: number]: string }>({}); // latest full reasoning received
  const reasoningShownRef = useRef<{ [id: number]: number }>({}); // reasoning chars currently revealed
  const completedRef = useRef<{ [id: number]: { finalText: string; convId: number } | null }>({}); // set when final content arrived
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  // Tool-call results (e.g. schedule_post → a post-confirm card) keyed by the
  // assistant message id, applied to the message when it finalizes so the inline
  // confirm card renders from the same single streamed message (no extra system).
  const pendingPostCardRef = useRef<{ [id: number]: any }>({});
  // Read-only list cards (posts) + edit-confirm cards keyed by message id,
  // attached when the message finalizes so they render from the single message.
  const pendingListCardRef = useRef<{ [id: number]: any }>({});
  // Multiple edit-confirm cards per message (multi-tool turns).
  const pendingEditCardsRef = useRef<{ [id: number]: any[] }>({});
  // Info/assist cards (captions, hashtags, insight, recommendations, best_time,
  // trends) per message — multiple may arrive in one turn.
  const pendingInfoCardsRef = useRef<{ [id: number]: any[] }>({});
  // Whether a finalized assistant message is a retryable error (provider down).
  const pendingRetryableRef = useRef<{ [id: number]: boolean }>({});
  // Non-normal completion state ('failed' | 'stopped') attached on complete so
  // the header shows the real state instead of "Response ready" (survives refresh
  // because the server persists it too).
  const pendingDeliveryStatusRef = useRef<{ [id: number]: 'failed' | 'stopped' }>({});
  // The model's reasoning/thinking summary, attached on complete so the Thoughts
  // panel is baked into the cached message (survives refresh + stop/abort).
  const pendingReasoningRef = useRef<{ [id: number]: string }>({});
  // Variant set (ChatGPT 1/2, 2/2) attached on a regenerate's complete event.
  const pendingVariantsRef = useRef<{ [id: number]: { variants: any[]; activeVariant: number } }>(
    {}
  );

  const [connectionStatus] = useState<'connected' | 'connecting' | 'disconnected' | 'error'>(
    'connected'
  );
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  // Per-message live "thinking" text streamed from reasoning-capable models
  // (Gemini). Rendered as a collapsible Thinking panel above the answer.
  const [reasoningContent, setReasoningContent] = useState<{
    [id: number]: string;
  }>({});
  // Per-message live deep-research progress — drives the streaming research banner.
  const [researchProgress, setResearchProgress] = useState<{
    [id: number]: ResearchProgressState;
  }>({});
  // Set when the answer came from a different model than the user selected
  // (plan entitlement). Surfaced as a dismissible note above the composer.
  const [modelNotice, setModelNotice] = useState<ModelNotice | null>(null);
  const clearModelNotice = useCallback(() => setModelNotice(null), []);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isContentStreaming, setIsContentStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState<StreamingContent>({});
  // Mirror of msgConvRef as state so the UI can scope the live stream display to
  // the conversation a message belongs to (no cross-conversation bleed).
  const [streamingConvId, setStreamingConvId] = useState<{ [id: number]: number }>({});
  // Per-conversation "is generating" flags. This is what lets the UI support
  // multi-tasking: only the conversation that is actually streaming shows the
  // Stop button, every other (idle) conversation can accept a new message.
  const [generatingConvIds, setGeneratingConvIds] = useState<{ [id: number]: boolean }>({});
  const [reconnectAttempts] = useState(0);

  const streamingContentRef = useRef<StreamingContent>({});
  useEffect(() => {
    streamingContentRef.current = streamingContent;
  }, [streamingContent]);

  /** Flip a conversation's "generating" flag (drives the per-chat Stop/Send UI). */
  const markGenerating = useCallback((convId: number, on: boolean) => {
    if (!convId) return;
    setGeneratingConvIds(prev => {
      if (!!prev[convId] === on) return prev;
      const next = { ...prev };
      if (on) next[convId] = true;
      else delete next[convId];
      return next;
    });
  }, []);

  const messagesKey = (convId: number) => ['/api/chat/conversations', convId, 'messages'];

  // Commit gate, ~30/sec. MUST sit safely BELOW a whole number of display frames.
  //
  // At 33ms it landed right on the 2-frame boundary of a 60Hz display (2 × 16.67 =
  // 33.33ms). The check `elapsed < 33` then passed or failed depending on
  // sub-millisecond noise, so the cadence alternated between 33ms and 50ms — the
  // text advanced in uneven jumps, which is exactly what reads as jitter.
  //
  // 28ms clears the 2-frame mark on 60Hz and the 4-frame mark on 120Hz, so the
  // commit lands on the SAME frame boundary every time on either display: a rock
  // steady ~33ms cadence.
  const COMMIT_INTERVAL_MS = 28;

  /** Finalize a message: persist final text to cache, clear streaming buffers. */
  const finalizeMessageRef = useRef<
    ((convId: number, messageId: number, finalText: string) => void) | null
  >(null);

  /**
   * Steady character-reveal loop (~ChatGPT cadence). Advances each message's
   * shown length toward its target by a rate proportional to the backlog, so it
   * always catches up but never dumps a whole burst instantly. Finalizes a
   * message once it's fully revealed AND its final content has arrived.
   */
  const ensureRevealLoop = useCallback(() => {
    if (rafRef.current != null) return;
    lastTickRef.current = performance.now();

    const tick = () => {
      // COMMIT RATE CAP. The loop is driven by rAF (~60Hz) but committing React
      // state 60x/sec means 60 renders + 60 layout/paint passes of the whole chat
      // per second, which is what makes streaming feel heavy. Text reveal reads as
      // perfectly continuous at ~30Hz — the eye tracks the growing text, not
      // individual frames — so we do half the work for no perceptible difference.
      // rAF still drives it, so we stay aligned to the browser's frame clock and
      // never tear.
      const nowRaw = performance.now();
      if (nowRaw - lastTickRef.current < COMMIT_INTERVAL_MS) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const now = nowRaw;
      const dt = Math.min(100, now - lastTickRef.current);
      lastTickRef.current = now;

      let anyPending = false;
      let anyReasoningPending = false;
      const updates: StreamingContent = {};

      // Smoothly reveal buffered reasoning ("thinking") text char-by-char.
      const reasoningUpdates: { [id: number]: string } = {};
      for (const idStr of Object.keys(reasoningTargetRef.current)) {
        const id = Number(idStr);
        const target = reasoningTargetRef.current[id] ?? '';
        const shown = reasoningShownRef.current[id] ?? 0;
        if (shown < target.length) {
          const backlog = target.length - shown;
          // Reasoning is secondary and (with Gemini) fully arrives BEFORE the
          // answer, so reveal it MUCH faster than the answer with aggressive
          // backlog catch-up — a quick typewriter that stays ahead of the reply
          // instead of lagging behind it. ~400 cps baseline + 400% of backlog/s.
          const charsThisFrame = Math.max(3, Math.ceil((400 + backlog * 4) * (dt / 1000)));
          const nextLen = Math.min(target.length, shown + charsThisFrame);
          reasoningShownRef.current[id] = nextLen;
          reasoningUpdates[id] = target.slice(0, nextLen);
          if (nextLen < target.length) anyReasoningPending = true;
        }
      }
      if (Object.keys(reasoningUpdates).length > 0) {
        setReasoningContent(prev => ({ ...prev, ...reasoningUpdates }));
      }

      for (const idStr of Object.keys(targetRef.current)) {
        const id = Number(idStr);
        const target = targetRef.current[id] ?? '';
        const shown = shownLenRef.current[id] ?? 0;
        if (shown < target.length) {
          const backlog = target.length - shown;
          // Reveal speed: ~ baseline chars/sec plus a fraction of the backlog so
          // big bursts catch up smoothly. ~80 cps baseline, +12% of backlog/sec.
          const charsThisFrame = Math.max(1, Math.ceil((80 + backlog * 1.2) * (dt / 1000)));
          const nextLen = Math.min(target.length, shown + charsThisFrame);
          shownLenRef.current[id] = nextLen;
          updates[id] = target.slice(0, nextLen);
          if (nextLen < target.length) anyPending = true;
        }

        // Fully revealed + final content received → finalize.
        const done = completedRef.current[id];
        if (done && (shownLenRef.current[id] ?? 0) >= target.length) {
          // Finalize into the message's OWN conversation, established from the
          // server's authoritative `complete`/`aiMessageStart` events. NEVER fall
          // back to "whatever chat is on screen" — that fallback is exactly what
          // let a reply land in the wrong conversation during multi-tasking.
          const ownConv = done.convId || msgConvRef.current[id] || 0;
          if (ownConv) finalizeMessageRef.current?.(ownConv, id, done.finalText);
          delete targetRef.current[id];
          delete shownLenRef.current[id];
          delete completedRef.current[id];
          // Reasoning for this message is done streaming too — drop its buffers.
          delete reasoningTargetRef.current[id];
          delete reasoningShownRef.current[id];
        } else if (done) {
          anyPending = true;
        }
      }

      if (Object.keys(updates).length > 0) {
        setStreamingContent(prev => ({ ...prev, ...updates }));
      }

      // Keep the loop alive while the answer is still revealing/finalizing OR the
      // reasoning text still has buffered characters left to type out.
      if (
        anyPending ||
        anyReasoningPending ||
        Object.keys(targetRef.current).length > 0
      ) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // Finalize: write the persisted final text into the messages cache, clear the
  // streaming placeholder, and reset generation state.
  const finalizeMessage = useCallback(
    (convId: number, messageId: number, finalText: string) => {
      if (convId) {
        const postCard = pendingPostCardRef.current[messageId];
        const listCard = pendingListCardRef.current[messageId];
        const editCards = pendingEditCardsRef.current[messageId];
        const infoCards = pendingInfoCardsRef.current[messageId];
        const retryable = pendingRetryableRef.current[messageId];
        const deliveryStatus = pendingDeliveryStatusRef.current[messageId];
        const variantInfo = pendingVariantsRef.current[messageId];
        const reasoning = pendingReasoningRef.current[messageId];
        queryClient.setQueryData(messagesKey(convId), (old: ChatMessage[] = []) =>
          old.map(m =>
            m.id === messageId
              ? {
                  ...m,
                  content: finalText,
                  // Clear the transient live image card — the final image card
                  // (in infoCards) or the error text replaces it now.
                  liveImageCard: undefined,
                  // Clear the transient live video-editor card — the final
                  // video_editor info-card (in infoCards) or the error text
                  // replaces it now.
                  liveVideoEditorCard: undefined,
                  ...(postCard ? { postCard } : {}),
                  ...(listCard ? { listCard } : {}),
                  ...(editCards?.length ? { editCards } : {}),
                  ...(infoCards?.length ? { infoCards } : {}),
                  ...(retryable ? { retryable: true } : {}),
                  // A normal complete clears any earlier failed/stopped flag.
                  deliveryStatus: deliveryStatus ?? undefined,
                  ...(reasoning ? { reasoning } : {}),
                  ...(variantInfo
                    ? { variants: variantInfo.variants, activeVariant: variantInfo.activeVariant }
                    : {}),
                }
              : m
          )
        );
        delete pendingPostCardRef.current[messageId];
        delete pendingListCardRef.current[messageId];
        delete pendingEditCardsRef.current[messageId];
        delete pendingInfoCardsRef.current[messageId];
        delete pendingRetryableRef.current[messageId];
        delete pendingDeliveryStatusRef.current[messageId];
        delete pendingReasoningRef.current[messageId];
        delete pendingVariantsRef.current[messageId];
      }
      setStreamingContent(prev => {
        const next = { ...prev };
        delete next[messageId];
        return next;
      });
      delete msgConvRef.current[messageId];
      setStreamingConvId(prev => {
        const next = { ...prev };
        delete next[messageId];
        return next;
      });
      setIsGenerating(false);
      setIsContentStreaming(false);
      isGeneratingRef.current = false;
      setAiStatus(null);
      markGenerating(convId, false);
      queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations'], exact: true });
    },
    [queryClient, markGenerating]
  );

  useEffect(() => {
    finalizeMessageRef.current = finalizeMessage;
  }, [finalizeMessage]);

  /** Apply a single NDJSON stream event to cache / streaming state. */
  const handleEvent = useCallback(
    (streamConvId: number, data: WebSocketMessage & { conversation?: any }) => {
      // Metered tool cards include the post-deduction balance in this same HTTP
      // stream, so the header can update immediately without a WebSocket.
      syncAICreditsFromResponse(data);
      // ALWAYS trust the conversationId the server stamps on the event when present.
      // With concurrent streams (multi-tasking) a single closure convId is fragile;
      // routing every cache write by the event's own conversationId guarantees a
      // reply can never land in (or bleed into) another conversation.
      const convId = ((data as any).conversationId as number) || streamConvId;
      // NDJSON event router. `reasoning` carries live model thinking (Gemini).
      switch (data.type) {
        case 'reasoning': {
          // Real model thinking (Gemini). Accumulate per message so the UI can
          // render a live "Thinking" panel. Never mixed into the answer text.
          const rid = (data as any).messageId as number | undefined;
          const rdelta = ((data as any).delta as string) || '';
          if (rid && rdelta) {
            // Buffer the reasoning as the reveal "target" and let the RAF loop
            // type it out smoothly (char-by-char) instead of dumping each chunk.
            reasoningTargetRef.current[rid] = (reasoningTargetRef.current[rid] || '') + rdelta;
            if (reasoningShownRef.current[rid] == null) reasoningShownRef.current[rid] = 0;
            // Also keep a running copy for finalize/stop, so if the user aborts
            // mid-thinking the reasoning already shown is baked into the cached
            // message and never disappears.
            pendingReasoningRef.current[rid] = reasoningTargetRef.current[rid];
            ensureRevealLoop();
          }
          break;
        }

        case 'modelNotice': {
          // The plan's model class differed from the stored selection. Show it —
          // never let a model substitution happen invisibly.
          const n = (data as any).notice as ModelNotice | undefined;
          if (n?.reason) setModelNotice(n);
          break;
        }

        case 'researchProgress': {
          // Live deep-research activity → accumulate into the message's banner.
          const pid = (data as any).messageId as number | undefined;
          const p = (data as any).progress as
            | import('../types/chat.types').ResearchProgressEvent
            | undefined;
          if (pid && p) {
            setResearchProgress(prev => {
              const cur: ResearchProgressState =
                prev[pid] || {
                  active: true,
                  phase: 'planning',
                  steps: [],
                  sources: [],
                  sourceCount: 0,
                  searchCount: 0,
                };
              // Merge newly-discovered sources first so we know the running total.
              const sources = cur.sources.slice();
              if (Array.isArray(p.newSources)) {
                for (const s of p.newSources) {
                  if (!sources.some(x => x.url === s.url)) sources.push(s);
                }
              }
              // Cumulative total of unique sources read SO FAR (server-authoritative,
              // falls back to our merged count).
              const cumulative = typeof p.sourceCount === 'number' ? p.sourceCount : sources.length;

              const steps = cur.steps.slice();
              if (p.kind === 'reading') {
                // Each reading step shows the CUMULATIVE sources-read total at that
                // point (20 → 40 → 60). Consecutive reading events collapse into one
                // step whose count updates to the latest cumulative; because the
                // snapshot is stored ON the step, earlier steps keep their own value
                // and never retroactively jump to the final total.
                const last = steps[steps.length - 1];
                if (last?.kind === 'reading') {
                  steps[steps.length - 1] = { ...last, count: cumulative };
                } else {
                  steps.push({ kind: p.kind, label: p.label, detail: p.detail, count: cumulative });
                }
              } else {
                steps.push({ kind: p.kind, label: p.label, detail: p.detail, queries: p.queries });
              }
              return {
                ...prev,
                [pid]: {
                  active: p.kind !== 'done',
                  phase: p.kind,
                  steps,
                  sources,
                  sourceCount: cumulative,
                  searchCount:
                    cur.searchCount +
                    (p.kind === 'searching' ? (p.queries?.length || 1) : 0),
                },
              };
            });
          }
          break;
        }

        case 'status':
          setAiStatus(data.status || data.content || null);
          if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
          statusTimeoutRef.current = setTimeout(() => setAiStatus(null), 10000);
          break;

        case 'userMessage':
          if (data.message) {
            queryClient.setQueryData(messagesKey(convId), (old: ChatMessage[] = []) => {
              const incoming = data.message!;
              const incomingHasAttach = !!(incoming as any).attachments?.length;
              // If an entry with the SAME id already exists (the optimistic bubble
              // used the client-supplied id the server honored), reconcile in place:
              // adopt the server's hosted-URL attachments but keep any locally
              // generated video poster so the still thumbnail doesn't flicker.
              const sameIdIdx = old.findIndex(m => m.id === incoming.id);
              if (sameIdIdx !== -1) {
                const prev = old[sameIdIdx] as any;
                const mergedAttachments = incomingHasAttach
                  ? (incoming as any).attachments.map((a: any, i: number) => ({
                      ...a,
                      posterUrl: a.posterUrl || prev.attachments?.[i]?.posterUrl,
                    }))
                  : prev.attachments;
                const next = [...old];
                next[sameIdIdx] = { ...prev, ...incoming, attachments: mergedAttachments };
                return next;
              }
              // Otherwise replace any optimistic temp user message (temp id > 1e12)
              // matching by content or by also carrying attachments.
              const withoutOptimistic = old.filter(m => {
                const isTempUser = m.role === 'user' && m.id > 1e12;
                if (!isTempUser) return true;
                const contentMatch = m.content === incoming.content;
                const attachMatch = incomingHasAttach && !!(m as any).attachments?.length;
                return !(contentMatch || attachMatch);
              });
              return [...withoutOptimistic, incoming];
            });
          }
          break;

        case 'aiMessageStart':
          if (data.messageId) {
            setIsGenerating(true);
            isGeneratingRef.current = true;
            markGenerating(convId, true);
            msgConvRef.current[data.messageId] = convId;
            setStreamingConvId(prev => ({ ...prev, [data.messageId!]: convId }));
            setStreamingContent(prev => ({ ...prev, [data.messageId!]: '' }));
            queryClient.setQueryData(messagesKey(convId), (old: ChatMessage[] = []) => {
              if (old.some(m => m.id === data.messageId)) return old;
              return [
                ...old,
                {
                  id: data.messageId!,
                  conversationId: convId,
                  role: 'assistant',
                  content: '',
                  tokensUsed: 0,
                  createdAt: new Date().toISOString(),
                } as ChatMessage,
              ];
            });
          }
          break;

        case 'chunk':
          // Server sends cumulative text → set as the reveal target; the RAF loop
          // animates the visible text toward it at a steady, ChatGPT-like pace.
          if (data.messageId && data.content !== undefined) {
            setAiStatus(null);
            setIsContentStreaming(true);
            setIsGenerating(true);
            isGeneratingRef.current = true;
            if (msgConvRef.current[data.messageId] == null) {
              msgConvRef.current[data.messageId] = convId;
              setStreamingConvId(prev => ({ ...prev, [data.messageId!]: convId }));
            }
            if (statusTimeoutRef.current) {
              clearTimeout(statusTimeoutRef.current);
              statusTimeoutRef.current = null;
            }
            targetRef.current[data.messageId] = data.content || '';
            if (shownLenRef.current[data.messageId] == null)
              shownLenRef.current[data.messageId] = 0;
            ensureRevealLoop();
          }
          break;

        case 'toolCall':
          // The model decided to perform an action (e.g. schedule_post) mid-chat.
          // Stash the resulting plan as a post-confirm card AND write it into the
          // cache immediately so it appears in the same frame as the other cards
          // (avoids the post card "popping in" later than edit/list cards → jitter).
          if (data.messageId && (data as any).plan) {
            const card = {
              plan: (data as any).plan,
              mediaUrls: (data as any).mediaUrls || [],
              status: 'idle',
            };
            pendingPostCardRef.current[data.messageId] = card;
            queryClient.setQueryData(messagesKey(convId), (old: ChatMessage[] = []) =>
              old.map(m => (m.id === data.messageId ? { ...m, postCard: card } : m))
            );
          }
          break;

        case 'listCard':
          // A read-only list of the user's posts (scheduled/draft/published) to
          // render as cards. Write it into the cache IMMEDIATELY (don't wait for
          // the text reveal to finish) so the cards appear as soon as they're ready.
          if (data.messageId && (data as any).listCard) {
            pendingListCardRef.current[data.messageId] = (data as any).listCard;
            queryClient.setQueryData(messagesKey(convId), (old: ChatMessage[] = []) =>
              old.map(m =>
                m.id === data.messageId ? { ...m, listCard: (data as any).listCard } : m
              )
            );
          }
          break;

        case 'editCard':
          // A proposed edit awaiting confirmation. Multiple may arrive in one turn
          // (multi-tool). Accumulate into an array and show immediately.
          if (data.messageId && (data as any).editCard) {
            const arr = pendingEditCardsRef.current[data.messageId] || [];
            arr.push((data as any).editCard);
            pendingEditCardsRef.current[data.messageId] = arr;
            const snapshot = [...arr];
            queryClient.setQueryData(messagesKey(convId), (old: ChatMessage[] = []) =>
              old.map(m => (m.id === data.messageId ? { ...m, editCards: snapshot } : m))
            );
          }
          break;

        case 'infoCard':
          // An info/assist card (captions, hashtags, insight, recommendations,
          // research). Buffer it ONLY — do NOT write to cache now. The card is
          // attached in finalizeMessage() once the streamed text has finished
          // revealing, so the card appears AFTER the response (not before it).
          if (data.messageId && (data as any).infoCard) {
            const arr = pendingInfoCardsRef.current[data.messageId] || [];
            arr.push((data as any).infoCard);
            pendingInfoCardsRef.current[data.messageId] = arr;
          }
          break;

        case 'imageProgress':
          // A LIVE image-generation card. Unlike infoCard, this writes to the
          // cache immediately so the animated generation surface shows WHILE the
          // provider call runs. finalizeMessage() clears it and swaps in the
          // final image card (or the error text) once the turn completes.
          if (data.messageId) {
            const live = {
              kind: 'image',
              status: (data as any).status || 'generating',
              operation: (data as any).operation || 'generation',
              subject: (data as any).subject || '',
            };
            queryClient.setQueryData(messagesKey(convId), (old: ChatMessage[] = []) =>
              old.map(m =>
                m.id === data.messageId ? { ...m, liveImageCard: live } : m
              )
            );
          }
          break;

        case 'videoEditorProgress':
          // A LIVE, progress-only video-editor card. The SERVER drives the edit
          // turn (Intent_Router → version → Editing_Planner → deterministic
          // execution) and streams stage-derived progress (phase/percent/plan)
          // here; the card renders it live. finalizeMessage() clears it and swaps
          // in the final video_editor info-card (which carries the rendered
          // artifact / versionId) once the turn completes. The card never runs
          // its own editor chat — every turn flows through the MAIN composer.
          if (data.messageId) {
            queryClient.setQueryData(messagesKey(convId), (old: ChatMessage[] = []) => {
              let changed = false
              const next = old.map(m => {
                if (m.id !== data.messageId) return m
                const prev = (m as any).liveVideoEditorCard || {}
                const liveVe = {
                  kind: 'video_editor' as const,
                  status: (data as any).status || prev.status || 'preparing',
                  subject: (data as any).subject ?? prev.subject ?? '',
                  phase: (data as any).phase ?? prev.phase,
                  percent:
                    typeof (data as any).percent === 'number'
                      ? (data as any).percent
                      : prev.percent,
                  // The plan arrives on every progress event and its step
                  // statuses ADVANCE as the server retires each step, so always
                  // take the newest one; fall back to the last known plan on an
                  // event that carries none.
                  plan: (data as any).plan ?? prev.plan,
                  // Index into that SAME plan array of the step being worked on.
                  // The card derives both its checklist highlight and its overlay
                  // "Step N of M" counter from it. `undefined` is meaningful (no
                  // step executing / turn over), so it is taken as sent rather
                  // than falling back to the previous value.
                  activeStepIndex:
                    typeof (data as any).activeStepIndex === 'number'
                      ? (data as any).activeStepIndex
                      : undefined,
                }
                // The driver re-emits the current phase/status/percent whenever it
                // ticks or honestly skips a step, so identical snapshots arrive
                // routinely. Merging those churns React state (and restarts card
                // animations) for no visible change, so drop them — every rendered
                // field is compared, so a real advance is never lost.
                if (isSameLiveVideoEditorCard(prev, liveVe)) return m
                changed = true
                return { ...m, liveVideoEditorCard: liveVe }
              })
              return changed ? next : old
            })
          }
          break;

        case 'complete':
          if (data.messageId) {
            const finalText =
              data.finalContent ?? streamingContentRef.current[data.messageId] ?? '';
            if (msgConvRef.current[data.messageId] == null) {
              msgConvRef.current[data.messageId] = convId;
              setStreamingConvId(prev => ({ ...prev, [data.messageId!]: convId }));
            }
            // A post-confirm card may arrive on the complete event (tool call).
            if ((data as any).postCard) {
              pendingPostCardRef.current[data.messageId] = (data as any).postCard;
            }
            if ((data as any).listCard) {
              pendingListCardRef.current[data.messageId] = (data as any).listCard;
            }
            if ((data as any).editCards) {
              pendingEditCardsRef.current[data.messageId] = (data as any).editCards;
            }
            if ((data as any).infoCards) {
              pendingInfoCardsRef.current[data.messageId] = (data as any).infoCards;
            }
            if ((data as any).retryable) {
              pendingRetryableRef.current[data.messageId] = true;
            }
            if ((data as any).deliveryStatus) {
              pendingDeliveryStatusRef.current[data.messageId] = (data as any).deliveryStatus;
            }
            if (typeof (data as any).reasoning === 'string' && (data as any).reasoning.trim()) {
              pendingReasoningRef.current[data.messageId] = (data as any).reasoning;
            }
            if ((data as any).variants) {
              pendingVariantsRef.current[data.messageId] = {
                variants: (data as any).variants,
                activeVariant: (data as any).activeVariant ?? (data as any).variants.length - 1,
              };
            }
            // Mark as complete; the reveal loop finalizes once it has shown all
            // the text, so the bubble never jumps to the full response.
            targetRef.current[data.messageId] = finalText;
            if (shownLenRef.current[data.messageId] == null)
              shownLenRef.current[data.messageId] = 0;
            completedRef.current[data.messageId] = { finalText, convId };
            ensureRevealLoop();
          } else {
            setIsGenerating(false);
            setIsContentStreaming(false);
            isGeneratingRef.current = false;
            setAiStatus(null);
            queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations'], exact: true });
          }
          break;

        case 'error': {
          console.error('[useChatStream] Stream error:', data.error);
          // Flag the in-flight assistant message as failed so its header shows
          // "Response failed" instead of "Response ready". The server persists
          // the same flag, so it also survives a refresh.
          const failedId = (data as any).messageId as number | undefined;
          if (convId && failedId) {
            queryClient.setQueryData(messagesKey(convId), (old: ChatMessage[] = []) =>
              old.map(m =>
                m.id === failedId
                  ? {
                      ...m,
                      deliveryStatus: 'failed' as const,
                      liveImageCard: undefined,
                      liveVideoEditorCard: undefined,
                    }
                  : m
              )
            );
          }
          setIsGenerating(false);
          setIsContentStreaming(false);
          isGeneratingRef.current = false;
          setAiStatus(null);
          markGenerating(convId, false);
          break;
        }
      }
    },
    [queryClient, markGenerating]
  );

  /**
   * POST to `url` and consume the NDJSON streaming response, dispatching each
   * event. `onConversation` is called for the new-chat `conversation` event.
   */
  const consumeStream = useCallback(
    async (
      url: string,
      body: any,
      convIdResolver: (conversation?: any) => number,
      onConversation?: (conversation: any) => void,
      knownConvId?: number
    ): Promise<void> => {
      const token = await getAuthToken();
      const controller = new AbortController();
      // Register the controller as soon as we know the conversation. For an
      // existing chat we know it up front; for a brand-new chat we register it when
      // the `conversation` event arrives (below).
      if (knownConvId) abortControllersRef.current.set(knownConvId, controller);

      setIsGenerating(true);
      isGeneratingRef.current = true;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        // Surface a friendly message for the VeeGPT burst rate limit (429) instead
        // of a raw "HTTP 429". The server sends { message, retryAfter } as JSON.
        if (response.status === 429) {
          let friendly =
            'You are sending messages too quickly. Please wait a few seconds and try again.';
          let retryAfter = 0;
          let upgrade = false;
          let scope: string | undefined;
          let code: string | undefined;
          let suggestedTier: string | undefined;
          try {
            const data = await response.json();
            if (data?.message) friendly = data.message;
            if (Number.isFinite(data?.retryAfter)) retryAfter = Number(data.retryAfter);
            if (data?.upgrade === true || data?.upgradeAvailable === true) upgrade = true;
            if (typeof data?.scope === 'string') scope = data.scope;
            if (typeof data?.code === 'string') code = data.code;
            if (typeof data?.suggestedTier === 'string') suggestedTier = data.suggestedTier;
          } catch {
            /* ignore parse errors — use the default message */
          }
          // Tell the user exactly when capacity comes back. A tiny per-minute
          // burst gets a "(retry in Ns)" hint; the 5-hour session and the
          // monthly windows get a human phrase ("More unlocks in 4h 20m." /
          // "Resets in 3 days."), so both limits always show time remaining.
          let messageWithReset = friendly;
          if (retryAfter > 0 && retryAfter <= 120) {
            messageWithReset = `${friendly} (retry in ${retryAfter}s)`;
          } else if (retryAfter > 120) {
            const human = formatRetryWindow(retryAfter);
            const resetPhrase =
              scope === 'monthly' ? `Resets in ${human}.` : `More unlocks in ${human}.`;
            messageWithReset = `${friendly} ${resetPhrase}`;
          }
          const rlErr = new Error(messageWithReset) as Error & {
            rateLimited?: boolean;
            upgrade?: boolean;
            scope?: string;
            retryAfter?: number;
            code?: string;
            canContinueWithFast?: boolean;
          };
          // Tag the error so the page can show a visible limit notice (with an
          // Upgrade CTA when the server flagged the plan as upgradeable).
          rlErr.rateLimited = true;
          rlErr.upgrade = upgrade;
          rlErr.scope = scope;
          rlErr.retryAfter = retryAfter;
          // Structured-refusal fields (spec §28, §43). `code` names the exact
          // reason; `suggestedTier === 'cheap'` is the server's signal that this
          // refusal CAN be solved by continuing on the Light model — the only
          // case where "Continue with Fast" is offered. A burst/monthly refusal
          // carries no suggestedTier, because no model choice would help.
          rlErr.code = code;
          rlErr.canContinueWithFast = suggestedTier === 'cheap';
          throw rlErr;
        }
        // Any OTHER non-OK status (401/403/404/500/…): read the server's real
        // error body so the failure is diagnosable and can be shown to the user,
        // instead of a generic "HTTP 500" that gets swallowed silently.
        let serverMsg = '';
        try {
          const ct = response.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            const data = await response.json();
            serverMsg = data?.error || data?.message || '';
          } else {
            serverMsg = (await response.text())?.slice(0, 300) || '';
          }
        } catch {
          /* body unreadable — fall back to the status text */
        }
        const httpErr = new Error(
          serverMsg || `Request failed (HTTP ${response.status} ${response.statusText}).`
        ) as Error & { status?: number };
        httpErr.status = response.status;
        throw httpErr;
      }

      let convId = convIdResolver();
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Process complete newline-delimited JSON lines.
          let nlIndex: number;
          while ((nlIndex = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, nlIndex).trim();
            buffer = buffer.slice(nlIndex + 1);
            if (!line) continue;
            let evt: any;
            try {
              evt = JSON.parse(line);
            } catch {
              continue;
            }

            if (evt.type === 'conversation' && evt.conversation) {
              convId = evt.conversation.id;
              currentConversationIdRef.current = convId;
              // Register this stream's controller under its real conversation id.
              abortControllersRef.current.set(convId, controller);
              markGenerating(convId, true);
              onConversation?.(evt.conversation);
              continue;
            }
            if (evt.type === 'conversationTitle' && evt.conversationId) {
              // Patch the title in-place in the sidebar cache — a smooth swap with
              // no refetch flicker (avoids the "raw message → proper title" jump
              // looking janky).
              queryClient.setQueryData(['/api/chat/conversations'], (old: any) =>
                Array.isArray(old)
                  ? old.map((c: any) =>
                      c.id === evt.conversationId ? { ...c, title: evt.title } : c
                    )
                  : old
              );
              continue;
            }
            handleEvent(convId, evt);
          }
        }
        // Flush any trailing buffered line.
        const tail = buffer.trim();
        if (tail) {
          try {
            handleEvent(convId, JSON.parse(tail));
          } catch {
            /* ignore */
          }
        }
      } finally {
        reader.releaseLock();
        // Only remove the controller if it's still the one we registered (a newer
        // send to the same conversation may have replaced it).
        if (convId && abortControllersRef.current.get(convId) === controller) {
          abortControllersRef.current.delete(convId);
        }
        if (knownConvId && abortControllersRef.current.get(knownConvId) === controller) {
          abortControllersRef.current.delete(knownConvId);
        }
      }
    },
    [handleEvent, queryClient, markGenerating]
  );

  /** Send a follow-up message to an existing conversation and stream the reply. */
  const sendMessage = useCallback(
    async (
      conversationId: number,
      content: string,
      workspaceId?: string,
      attachments?: ChatAttachment[],
      opts?: {
        skipUserMessage?: boolean;
        includeWorkspaceContext?: boolean;
        enableTools?: boolean;
        localNow?: string;
        timezone?: string;
        hasMedia?: boolean;
        mediaUrls?: string[];
        userMessageId?: number;
        optimisticAttachments?: OptimisticAttachment[];
        seedOptimistic?: boolean;
        selectedAccountId?: string | null;
        selectedAgentId?: string;
        forcedTool?: string | null;
        /** Opaque S3 storage keys (upload-first); preferred over base64. */
        attachmentIds?: string[];
        /**
         * Explicit "Continue with Fast" (spec §43). Runs THIS message on the
         * Light model regardless of the stored AI Configuration selection, after
         * the user chose to when their selected model was refused for quota. The
         * stored selection is untouched, so the next message uses it again.
         */
        continueWithFast?: boolean;
      }
    ): Promise<any> => {
      currentConversationIdRef.current = conversationId;
      setIsContentStreaming(false);
      // Show the pending AI indicator immediately (before the network round-trip).
      setIsGenerating(true);
      isGeneratingRef.current = true;
      markGenerating(conversationId, true);
      setAiStatus('Thinking…');

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
          : (attachments || []).map(a => ({ name: a.name, mimeType: a.mimeType }));
        const optimisticContent = content.trim() || ' ';
        // Use the client-supplied id (same id the server will honor) so the
        // optimistic bubble and the persisted record collapse into ONE.
        const optimisticId = opts?.userMessageId ?? Date.now();
        queryClient.setQueryData(messagesKey(conversationId), (old: ChatMessage[] = []) => {
          // Don't double-insert if the page already seeded this id during upload.
          if (old.some(m => m.id === optimisticId)) return old;
          return [
            ...old,
            {
              id: optimisticId,
              conversationId,
              role: 'user',
              content: optimisticContent,
              attachments: optimisticAttachments.length ? optimisticAttachments : undefined,
              tokensUsed: 0,
              createdAt: new Date().toISOString(),
            } as ChatMessage,
          ];
        });
      }

      try {
        await consumeStream(
          `/api/chat/conversations/${conversationId}/messages`,
          {
            content,
            workspaceId,
            attachments,
            // Opaque storage keys (files uploaded to S3 first). The server's
            // resolveStorageKeyAttachments turns these into model input — inline
            // for small files, Gemini Files API for large video/PDF — the same
            // path the mobile app uses. Preferred over base64 `attachments`.
            attachmentIds: opts?.attachmentIds,
            skipUserMessage: opts?.skipUserMessage === true,
            includeWorkspaceContext: opts?.includeWorkspaceContext !== false,
            enableTools: opts?.enableTools === true,
            localNow: opts?.localNow,
            timezone: opts?.timezone,
            hasMedia: opts?.hasMedia === true,
            mediaUrls: opts?.mediaUrls,
            userMessageId: opts?.userMessageId,
            selectedAccountId: opts?.selectedAccountId ?? null,
            selectedAgentId: opts?.selectedAgentId,
            forcedTool: opts?.forcedTool ?? null,
            continueWithFast: opts?.continueWithFast === true,
          },
          () => conversationId,
          undefined,
          conversationId
        );
        return { success: true };
      } catch (error: any) {
        // A deliberate Stop aborts the fetch — that's not a failure, so don't
        // surface it (prevents the composer from resetting the just-sent message).
        if (error?.name === 'AbortError') return { success: true, aborted: true };
        console.error('[useChatStream] sendMessage error:', error);
        setIsGenerating(false);
        isGeneratingRef.current = false;
        markGenerating(conversationId, false);
        throw error;
      }
    },
    [consumeStream, queryClient, markGenerating]
  );

  /** Create a new conversation and stream its first reply over the same request. */
  const createAndStream = useCallback(
    async (
      content: string,
      workspaceId?: string,
      attachments?: ChatAttachment[],
      opts?: {
        enableTools?: boolean;
        localNow?: string;
        timezone?: string;
        hasMedia?: boolean;
        mediaUrls?: string[];
        userMessageId?: number;
        optimisticAttachments?: OptimisticAttachment[];
        onConversation?: (conversationId: number) => void;
        selectedAccountId?: string | null;
        selectedAgentId?: string;
        forcedTool?: string | null;
        /** Opaque S3 storage keys (upload-first); preferred over base64. */
        attachmentIds?: string[];
        /** Explicit "Continue with Fast" for the first message (spec §43). */
        continueWithFast?: boolean;
      }
    ): Promise<{ conversationId: number } | null> => {
      setIsContentStreaming(false);
      // Show the pending AI indicator immediately (before the network round-trip).
      setIsGenerating(true);
      isGeneratingRef.current = true;
      setAiStatus('Thinking…');
      let newConvId: number | null = null;
      // Rich optimistic attachments (media path) shown the instant the conversation
      // view switches in — reconciled with the server's hosted URLs on userMessage.
      const optimisticAttachments = opts?.optimisticAttachments?.length
        ? opts.optimisticAttachments
        : (attachments || []).map(a => ({ name: a.name, mimeType: a.mimeType }));
      const optimisticId = opts?.userMessageId ?? Date.now();
      try {
        await consumeStream(
          '/api/chat/conversations',
          {
            content,
            workspaceId,
            attachments,
            attachmentIds: opts?.attachmentIds,
            enableTools: opts?.enableTools === true,
            localNow: opts?.localNow,
            timezone: opts?.timezone,
            hasMedia: opts?.hasMedia === true,
            mediaUrls: opts?.mediaUrls,
            userMessageId: opts?.userMessageId,
            selectedAccountId: opts?.selectedAccountId ?? null,
            selectedAgentId: opts?.selectedAgentId,
            forcedTool: opts?.forcedTool ?? null,
            continueWithFast: opts?.continueWithFast === true,
          },
          () => newConvId ?? 0,
          conversation => {
            newConvId = conversation.id;
            // Seed the messages cache with the optimistic user bubble so the chat
            // view shows the just-sent message (with its media preview) instantly.
            queryClient.setQueryData(messagesKey(conversation.id), [
              {
                id: optimisticId,
                conversationId: conversation.id,
                role: 'user',
                content: content.trim() || ' ',
                attachments: optimisticAttachments.length ? optimisticAttachments : undefined,
                tokensUsed: 0,
                createdAt: new Date().toISOString(),
              } as ChatMessage,
            ]);
            // Show the new conversation in the sidebar IMMEDIATELY (don't wait for
            // the reply to finish). Prepend it to the conversations list cache.
            queryClient.setQueryData(['/api/chat/conversations'], (old: any) => {
              const list = Array.isArray(old) ? old : [];
              if (list.some((c: any) => c.id === conversation.id)) return list;
              return [conversation, ...list];
            });
            // Tell the page the conversation id IMMEDIATELY (mid-stream) so it can
            // enable the messages query and render cards (listCard/editCard/postCard)
            // as they arrive — instead of only after the whole stream finishes.
            try {
              opts?.onConversation?.(conversation.id);
            } catch {
              /* noop */
            }
          }
        );
        return newConvId != null ? { conversationId: newConvId } : null;
      } catch (error: any) {
        // A deliberate Stop aborts the fetch — treat it as a normal stop, not a
        // failure, so the page doesn't reset the just-created conversation.
        if (error?.name === 'AbortError') {
          return newConvId != null ? { conversationId: newConvId } : null;
        }
        console.error('[useChatStream] createAndStream error:', error);
        setIsGenerating(false);
        isGeneratingRef.current = false;
        throw error;
      }
    },
    [consumeStream, queryClient]
  );

  /**
   * Regenerate an existing assistant reply (ChatGPT-style). Re-answers the same
   * user prompt and streams INTO the existing message id; the server appends the
   * result as a new variant (1/2, 2/2) so the reply stays in the same position.
   */
  const regenerate = useCallback(
    async (
      conversationId: number,
      messageId: number,
      userText: string,
      opts?: { workspaceId?: string; enableTools?: boolean; localNow?: string; timezone?: string }
    ): Promise<{ success: boolean } | null> => {
      currentConversationIdRef.current = conversationId;
      setIsGenerating(true);
      isGeneratingRef.current = true;
      markGenerating(conversationId, true);
      setAiStatus('Thinking…');
      // Optimistically mark THIS message as streaming so the regeneration shows its
      // shimmer IN PLACE immediately — without this there's a brief window before
      // aiMessageStart arrives where the bottom "Analyzing…" placeholder flashes.
      msgConvRef.current[messageId] = conversationId;
      setStreamingConvId(prev => ({ ...prev, [messageId]: conversationId }));
      setStreamingContent(prev => ({ ...prev, [messageId]: '' }));
      try {
        await consumeStream(
          `/api/chat/conversations/${conversationId}/messages`,
          {
            content: userText,
            regenerateMessageId: messageId,
            workspaceId: opts?.workspaceId,
            includeWorkspaceContext: true,
            enableTools: opts?.enableTools !== false,
            localNow: opts?.localNow,
            timezone: opts?.timezone,
          },
          () => conversationId,
          undefined,
          conversationId
        );
        return { success: true };
      } catch (error: any) {
        if (error?.name === 'AbortError') return { success: true };
        console.error('[useChatStream] regenerate error:', error);
        setIsGenerating(false);
        isGeneratingRef.current = false;
        markGenerating(conversationId, false);
        throw error;
      }
    },
    [consumeStream, markGenerating]
  );

  /**
   * Stop generation. When `targetConvId` is given, ONLY that conversation's
   * stream is aborted and only its messages/flags are cleared — other
   * conversations that are streaming concurrently keep going (multi-tasking).
   * With no argument it stops every active stream (e.g. on disconnect).
   */
  const stopGeneration = useCallback(
    (targetConvId?: number) => {
      if (targetConvId != null) {
        const ctrl = abortControllersRef.current.get(targetConvId);
        if (ctrl) {
          ctrl.abort();
          abortControllersRef.current.delete(targetConvId);
        }
      } else {
        abortControllersRef.current.forEach(c => c.abort());
        abortControllersRef.current.clear();
      }

      // Truncate to ONLY what's been revealed so far (drop the unseen buffered
      // remainder) so Stop genuinely stops — the model often finishes server-side
      // before the slow client reveal catches up, and we must not dump the full
      // text. Computed synchronously from refs so we can return it to the caller.
      const belongsToTarget = (id: number) =>
        targetConvId == null || msgConvRef.current[id] === targetConvId;
      const stopped: Array<{ conversationId: number; messageId: number; text: string }> = [];
      const truncated: { [id: number]: string } = {};
      for (const idStr of Object.keys(targetRef.current)) {
        const id = Number(idStr);
        if (!belongsToTarget(id)) continue;
        const shown = shownLenRef.current[id] ?? 0;
        const partial = (targetRef.current[id] || '').slice(0, shown);
        truncated[id] = partial;
        const conv = msgConvRef.current[id];
        if (conv) stopped.push({ conversationId: conv, messageId: id, text: partial });
        delete targetRef.current[id];
        delete completedRef.current[id];
        // Stop typing out any buffered "thinking" for this message too.
        delete reasoningTargetRef.current[id];
        delete reasoningShownRef.current[id];
      }
      setStreamingContent(prev => ({ ...prev, ...truncated }));
      // Freeze the revealed partial AND the thinking-so-far into the cache so both
      // stick (survive the clear-streaming effect). Without baking the reasoning
      // in here, a stop mid-thinking would drop the Thoughts panel the moment the
      // live buffer is cleared — the user would be left with only their message.
      for (const s of stopped) {
        const frozenReasoning = pendingReasoningRef.current[s.messageId];
        queryClient.setQueryData(messagesKey(s.conversationId), (old: ChatMessage[] = []) =>
          old.map(m =>
            m.id === s.messageId
              ? {
                  ...m,
                  content: s.text,
                  // Flag it as user-stopped so the header shows "Stopped" (the
                  // /stop endpoint persists the same flag for refresh survival).
                  deliveryStatus: 'stopped' as const,
                  ...(frozenReasoning ? { reasoning: frozenReasoning } : {}),
                }
              : m
          )
        );
      }

      // Clear the per-conversation generating flag(s).
      if (targetConvId != null) {
        markGenerating(targetConvId, false);
      } else {
        setGeneratingConvIds({});
      }

      // Keep the global "any active" flag accurate: only fully clear it when no
      // streams remain. The per-conversation flags drive the composer UI; this
      // global is just for the welcome screen / retry gate.
      const anyActive = abortControllersRef.current.size > 0;
      if (!anyActive) {
        if (rafRef.current != null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        setIsGenerating(false);
        setIsContentStreaming(false);
        isGeneratingRef.current = false;
      }
      return stopped;
    },
    [markGenerating, queryClient]
  );

  const clearStreamingContent = useCallback((messageId?: number) => {
    if (messageId !== undefined) {
      // Per-message clear: the message has been persisted, so drop its tracking.
      setStreamingContent(prev => {
        const next = { ...prev };
        delete next[messageId];
        return next;
      });
      delete msgConvRef.current[messageId];
      setStreamingConvId(prev => {
        const next = { ...prev };
        delete next[messageId];
        return next;
      });
    } else {
      // Bulk clear (e.g. New Chat): only hide the visible streaming text. Do NOT
      // wipe msgConvRef/streamingConvId — an in-flight reply must still finalize
      // into its own conversation even if a new chat is started meanwhile.
      setStreamingContent({});
    }
  }, []);

  // No-op connection management (kept for API compatibility with callers).
  const subscribeToConversation = useCallback((conversationId: number) => {
    currentConversationIdRef.current = conversationId;
  }, []);
  const unsubscribeFromConversation = useCallback(() => {
    currentConversationIdRef.current = null;
  }, []);
  const reconnect = useCallback(() => {}, []);
  const disconnect = useCallback(() => {
    abortControllersRef.current.forEach(c => c.abort());
    abortControllersRef.current.clear();
  }, []);

  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
      abortControllersRef.current.forEach(c => c.abort());
      abortControllersRef.current.clear();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return {
    connectionStatus,
    aiStatus,
    isGenerating,
    isContentStreaming,
    streamingContent,
    reasoningContent,
    modelNotice,
    clearModelNotice,
    researchProgress,
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
  };
};
