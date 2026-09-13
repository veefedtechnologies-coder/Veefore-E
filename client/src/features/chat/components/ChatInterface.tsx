import React, { useRef, useEffect, useLayoutEffect, useState, useMemo } from 'react';
import {
  Mic,
  Send,
  ArrowDown,
  PenSquare,
  X,
  RotateCcw,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { useSpeechToText } from '../hooks/useSpeechToText';
import { VeeGPTSelectors, type SocialAccountOption } from './VeeGPTSelectors';
import type { VeeGPTAgentOption } from '../hooks/useVeeGPTAgents';
import { ComposerPlusMenu } from './ComposerPlusMenu';
import { getComposerTool } from '../composerTools';
import { Wrench } from 'lucide-react';
import { DeepResearchBanner } from './DeepResearchBanner';
import { StreamingMarkdown } from './StreamingMarkdown';
import { MediaLightbox } from './MediaLightbox';
import {
  markdownComponents,
  buildHighlightComponents,
  highlightChildren,
} from './markdownComponents';
import type { ResearchProgressState } from '../types/chat.types';

// Types
type ChatMessage = {
  id: number;
  conversationId: number;
  role: 'user' | 'assistant';
  content: string;
  attachments?: { name?: string; mimeType: string; url?: string; posterUrl?: string }[];
  postCard?: {
    plan: any;
    mediaUrls: string[];
    status: 'idle' | 'working' | 'done' | 'error';
    resultText?: string;
  };
  listCard?: { kind: string; title?: string; items: any[] };
  editCard?: {
    action: string;
    contentId: string;
    title?: string;
    current?: any;
    proposed?: any;
    status: 'idle' | 'working' | 'done' | 'error';
    resultText?: string;
  };
  editCards?: Array<{
    id?: string;
    action: string;
    contentId: string;
    title?: string;
    post?: any;
    current?: any;
    proposed?: any;
    status: 'idle' | 'working' | 'done' | 'error';
    resultText?: string;
  }>;
  retryable?: boolean;
  /** Regenerated alternatives (ChatGPT 1/2, 2/2). */
  variants?: Array<{
    content: string;
    postCard?: any;
    listCard?: any;
    editCards?: any[];
    infoCards?: any[];
  }>;
  activeVariant?: number;
  tokensUsed: number;
  createdAt: Date | string;
};

interface ChatInterfaceProps {
  messages: ChatMessage[];
  messagesLoading: boolean;
  isGenerating: boolean;
  aiStatus: string | null;
  inputText: string;
  streamingContent: { [key: number]: string };
  /** Per-message live "thinking" text (Gemini reasoning summaries). */
  reasoningContent?: { [key: number]: string };
  /** Per-message live deep-research progress (streaming banner). */
  researchProgress?: { [key: number]: ResearchProgressState };
  /** Id of an assistant reply that is still being generated SERVER-SIDE while the
   *  client isn't streaming it (the user navigated away mid-generation and came
   *  back). Rendered with a "working" indicator so the thread isn't blank. */
  pendingReplyId?: number | null;
  /** During the brief post-reconnect grace window, suppress the generic "Working
   *  on it…" placeholder so a resumed image card / research banner doesn't flash
   *  in after it. Cleared once the resume probes resolve. */
  suppressPendingIndicator?: boolean;
  /** Title of the active conversation (shown in the header). */
  title?: string;
  /** Start a new chat from the header button. */
  onNewChat?: () => void;
  onInputChange: (text: string) => void;
  onSendMessage: () => void;
  onStopGeneration: () => void;
  onKeyPress: (e: React.KeyboardEvent) => void;
  /** Selected attachments (images/PDFs) pending send. */
  attachments?: AttachmentPreview[];
  /** Add files chosen from the file picker. */
  onAddAttachments?: (files: FileList | File[]) => void;
  /** Remove a pending attachment by index. */
  onRemoveAttachment?: (index: number) => void;
  /** Why the last file pick was rejected (unsupported type, too large, too many).
   *  Shown inline above the composer — silently dropping files is what made an
   *  unsupported upload look like the chat had died. */
  attachmentError?: string | null;
  onDismissAttachmentError?: () => void;
  /** Id of an optimistic assistant message that is "preparing" something
   *  (e.g. building a post): render a shimmer status instead of its content. */
  preparingMessageId?: number | null;
  /** Status text shown (shimmering) for the preparing message. */
  preparingStatus?: string;
  /** When set (from "Search chats"), scroll to + briefly highlight this message. */
  highlightMessageId?: number | null;
  /** The search term to highlight within the matched message. */
  highlightQuery?: string;
  /** Optional node rendered at the end of the message list (e.g. an inline
   *  post-confirmation card driven by the AI agent). */
  footerSlot?: React.ReactNode;
  /** Render an inline card under a specific assistant message (used to
   *  rehydrate a persisted post-confirm card from chat history). */
  renderMessageCard?: (message: ChatMessage) => React.ReactNode;
  /** Retry a failed (e.g. rate-limited) assistant message — re-sends the last
   *  user message. */
  onRetry?: () => void;
  /** Regenerate an assistant reply in place (appends a 1/2, 2/2 variant). */
  onRegenerate?: (message: ChatMessage) => void;
  /** Switch which regenerated variant of a message is shown. */
  onSwitchVariant?: (message: ChatMessage, index: number) => void;
  /** Advanced composer selectors — VeeGPT agent (persona) + social account focus. */
  agents?: VeeGPTAgentOption[];
  selectedAgentId?: string;
  onSelectAgent?: (id: string) => void;
  accounts?: SocialAccountOption[];
  selectedAccountId?: string | null;
  onSelectAccount?: (id: string | null) => void;
  /** Armed composer tool (forces that tool on the next send), or null. */
  selectedTool?: string | null;
  onSelectTool?: (id: string | null) => void;
  /** Optional node rendered just above the composer (e.g. a low-usage hint). */
  usageHint?: React.ReactNode;
  /** When set, a full-screen report viewer overlays the chat body + composer
   *  (the header + sidebar stay visible). Driven by opening a research report. */
  reportOverlay?: React.ReactNode;
}

/** A pending attachment shown as a chip below the input. */
export type AttachmentPreview = {
  name: string;
  mimeType: string;
  /** object URL for image preview (optional). */
  previewUrl?: string;
  /** poster data URL for video preview (optional). */
  posterUrl?: string;
};

// ── Shared markdown renderers (ChatGPT/Claude-style answer typography) ───────
// Every block element is styled explicitly: Tailwind's preflight resets list
// markers and heading sizes, so without these bullets/numbers simply don't show
// and the whole answer collapses into flat paragraphs.
/**
 * Reduce a model reasoning summary to clean, readable plain text for the
 * "Thinking" panel. Reasoning arrives with markdown markers (e.g.
 * `**Seeking Instagram Strategies**`, headings, bullets) that look like stray
 * `**`/`#` when rendered raw. We strip the emphasis/heading/code markers while
 * preserving line breaks and turning list bullets into a clean "• ".
 */
function stripThinkingMarkdown(text: string): string {
  if (!text) return text;
  return text
    .replace(/```[\s\S]*?```/g, '') // fenced code blocks
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/^\s{0,3}#{1,6}\s+/gm, '') // ATX headings
    .replace(/\*\*([^*]+)\*\*/g, '$1') // **bold**
    .replace(/__([^_]+)__/g, '$1') // __bold__
    .replace(/\*([^*]+)\*/g, '$1') // *italic*
    .replace(/(^|[\s(])_([^_]+)_(?=[\s.,;:!?)]|$)/g, '$1$2') // _italic_
    .replace(/^\s*[-*+]\s+/gm, '• ') // list bullets → •
    .replace(/\n{3,}/g, '\n\n') // collapse extra blank lines
    .trim();
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
  reasoningContent = {},
  researchProgress = {},
  pendingReplyId = null,
  suppressPendingIndicator = false,
  title,
  onNewChat,
  onInputChange,
  onSendMessage,
  onStopGeneration,
  onKeyPress,
  attachments = [],
  onAddAttachments,
  onRemoveAttachment,
  attachmentError,
  onDismissAttachmentError,
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
  usageHint,
  reportOverlay,
}) => {
  const inputRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // The floating composer overlays the messages, so we measure its live height
  // and reserve exactly that much space at the bottom of the scroll area — this
  // guarantees the last message is never hidden behind the composer, even when
  // it grows (attachments, selectors, multi-line input).
  const composerWrapRef = useRef<HTMLDivElement>(null);
  const [composerHeight, setComposerHeight] = useState(96);
  // Refs to each message wrapper so "Search chats" can scroll a match into view.
  const messageRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // Fullscreen media viewer (lightbox) for attachment click-to-view.
  const [lightbox, setLightbox] = useState<{ url: string; mimeType: string; name?: string } | null>(
    null
  );
  // Which message's content was just copied (shows a transient check icon).
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const copyMessage = async (m: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(m.content || '');
      setCopiedId(m.id);
      setTimeout(() => setCopiedId(cur => (cur === m.id ? null : cur)), 1500);
    } catch {
      /* clipboard blocked */
    }
  };
  // Id of the most recent assistant message — regenerate is offered only here
  // (re-answering the latest turn), which keeps history correct.
  const lastAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--)
      if (messages[i].role === 'assistant') return messages[i].id;
    return null;
  }, [messages]);

  // Voice dictation (browser-native Web Speech API → OS permission prompt).
  const dictateBaseRef = useRef('');
  const speech = useSpeechToText({
    onStart: () => {
      dictateBaseRef.current = (inputText || '').trim();
    },
    onText: transcript => {
      const base = dictateBaseRef.current;
      const combined = (base ? base + ' ' : '') + transcript;
      if (inputRef.current) inputRef.current.innerText = combined;
      onInputChange(combined);
    },
  });
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  // Keep the contentEditable input in sync when the parent changes inputText
  // out-of-band — after sending (cleared to '') or when a draft is restored
  // following a usage-limit refusal. The div is uncontrolled, so we only sync
  // when it isn't the focused element; otherwise we'd stomp the caret mid-type.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    // Clearing to empty (after a send, or a reset) must ALWAYS win — even while
    // the field is focused — otherwise the just-sent text lingers in the
    // composer. Only the non-empty out-of-band sync (draft restore) skips while
    // focused, to avoid stomping the caret mid-type.
    if (inputText === '') {
      if (el.innerText !== '') el.innerText = '';
      return;
    }
    if (el === document.activeElement) return;
    if (el.innerText !== inputText) {
      el.innerText = inputText;
    }
  }, [inputText]);
  // "Stick to bottom" model (same approach ChatGPT/Claude use): we follow new
  // content only while the user wants to. Any upward scroll intent (wheel/touch)
  // disengages following; returning to the very bottom re-engages it. We never
  // yank the view based on proximity, so reading earlier messages is undisturbed.
  const stickToBottomRef = useRef(true);
  const touchStartYRef = useRef(0);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    stickToBottomRef.current = true;
    setShowScrollButton(false);
  };

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom < 16;
    // Re-engage following only once the user is genuinely back at the bottom.
    if (atBottom) stickToBottomRef.current = true;
    // Only set state on an actual CHANGE. While auto-following, scroll events fire
    // every frame; an unconditional setState here re-rendered the whole chat 60
    // times a second on top of the streaming updates.
    setShowScrollButton(prev => (prev === !atBottom ? prev : !atBottom));
  };

  const handleWheel = (e: React.WheelEvent) => {
    // Scrolling up = user wants to read; stop auto-following immediately.
    if (e.deltaY < 0) stickToBottomRef.current = false;
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    // Finger moving down on screen = content moves down = scrolling up.
    if (e.touches[0].clientY > touchStartYRef.current) stickToBottomRef.current = false;
  };

  // Follow new content only while sticking to the bottom. Scroll ONLY the inner
  // container (scrollIntoView would bubble up and scroll the window).
  //
  // useLayoutEffect, NOT useEffect: a passive effect runs AFTER the browser has
  // painted, so each streaming frame painted the taller content at the old scroll
  // position and then snapped down — one visible jump per frame. Running before
  // paint means the growth and the scroll land in the same frame.
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || !stickToBottomRef.current) return;
    // Only correct the position when it's actually off the bottom. Writing
    // scrollTop every frame even when already pinned can cause sub-pixel
    // micro-jitter at the bottom, so we skip no-op writes.
    const target = el.scrollHeight - el.clientHeight;
    if (Math.abs(el.scrollTop - target) > 1) el.scrollTop = target;
    // `composerHeight` is a dependency: when the composer grows/shrinks the
    // reserved paddingBottom changes scrollHeight, so a pinned view must re-pin
    // in the same frame or it drifts off the bottom (looked like jitter).
  }, [messages, streamingContent, composerHeight]);

  // Track the floating composer's height so the message list reserves matching
  // bottom padding (no message ever hides behind the composer as it grows).
  useLayoutEffect(() => {
    const el = composerWrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    // Only commit a new height on a real (>=1px) change. offsetHeight is
    // integer-rounded, but guarding here avoids any redundant setState →
    // re-render churn that could feed back into the scroll position.
    const update = () =>
      setComposerHeight(prev => {
        const next = el.offsetHeight;
        return Math.abs(next - prev) >= 1 ? next : prev;
      });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // When a match arrives from "Search chats", disengage auto-follow and scroll
  // the matched message into view. The term itself is highlighted via <mark>
  // in the markdown renderer (see highlightComponents below).
  useEffect(() => {
    if (highlightMessageId == null) return;
    stickToBottomRef.current = false;
    const t = setTimeout(() => {
      const node = messageRefs.current[highlightMessageId];
      if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 160);
    return () => clearTimeout(t);
  }, [highlightMessageId, messages]);

  // Markdown renderers that highlight the active search term (only built when a
  // term is present so normal messages keep the shared, memoized renderers).
  const highlightComponents = useMemo(
    () => buildHighlightComponents((highlightQuery || '').trim()),
    [highlightQuery]
  );

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 relative">
      {/* Header bar (ChatGPT-style): conversation title + new chat action */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-gray-200/70 dark:border-white/[0.06] bg-gray-50/30 dark:bg-slate-900 z-20 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
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

      {/* Full-screen research report viewer: overlays the WHOLE chat column
          (its own header replaces the chat header); the app sidebar stays. */}
      {reportOverlay && (
        <div
          className="absolute inset-0 bg-white dark:bg-slate-900 animate-in fade-in duration-200"
          style={{ zIndex: 1100 }}
        >
          {reportOverlay}
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        className="flex-1 overflow-y-auto overflow-x-hidden p-6 bg-gradient-to-b from-gray-50/30 to-white dark:from-slate-900/40 dark:to-slate-900"
        style={{
          // Reserve room for the floating composer (+ its footer text) so the
          // last message is always fully visible above it.
          paddingBottom: `${composerHeight + 56}px`,
          // Turn OFF the browser's scroll anchoring. As the streaming message
          // grows, the browser tries to preserve the visual position of an anchor
          // node by adjusting scrollTop — at the same time our follow effect is
          // writing scrollTop itself. The two compete every frame and the content
          // visibly twitches. We own the scroll position here, so opt out.
          overflowAnchor: 'none',
          // Keep scrolling CONTAINED to this list AND suppress the elastic
          // rubber-band bounce at the top/bottom (that boundary bounce is what
          // "jittered" when you kept scrolling past the end). `none` also stops
          // the gesture from chaining up to the page/VeeGPT surface.
          overscrollBehavior: 'none',
        }}
      >
        <div className="max-w-4xl mx-auto space-y-8 overflow-x-hidden">
          {messagesLoading && messages.length === 0
            ? // Intentionally render nothing in the message area while messages
              // load — bubble skeletons here look poor and never match the real
              // conversation. The blank canvas fills in once messages arrive.
              null
            : messages.map(message => (
                <div
                  key={message.id}
                  ref={el => {
                    messageRefs.current[message.id] = el;
                  }}
                  className={`flex flex-col space-y-2 scroll-mt-20 ${
                    message.role === 'user'
                      ? // Only the JUST-SENT bubble (client temp id) animates in —
                        // persisted/historical messages must not re-animate on load,
                        // scroll, or the optimistic→persisted swap (that was the flicker).
                        `items-end ${message.id > 1e12 ? 'veegpt-msg-in' : ''}`
                      : 'items-start'
                  }`}
                  // Layout containment scopes reflow to this message's own box. As
                  // the last message grows a few characters per frame, the browser
                  // would otherwise re-lay-out every message in the conversation.
                  // `paint` is deliberately NOT included — it would clip the chart
                  // tooltips.
                  style={{ contain: 'layout style' }}
                >
                  <div
                    className={`${message.role === 'user' ? 'max-w-sm w-fit' : 'max-w-4xl w-full'}`}
                    style={{
                      minWidth: 0,
                      // `overflow: hidden` here clipped chart tooltips, so Recharts
                      // re-solved their position on every mousemove (hover jitter).
                      // User bubbles still clip; assistant content manages its own
                      // overflow (tables scroll, text wraps).
                      overflow: message.role === 'user' ? 'hidden' : 'visible',
                    }}
                  >
                    {/* Message Header */}
                    {message.role === 'user' && (
                      <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 flex items-center">
                        <span>You</span>
                      </div>
                    )}
                    {message.role === 'assistant' &&
                      (() => {
                        const isThisStreaming =
                          streamingContent[message.id] !== undefined && isGenerating;
                        const isPreparing =
                          preparingMessageId != null && message.id === preparingMessageId;
                        // A regenerate streams into a message that already has content
                        // (or prior variants), unlike a fresh reply — show "Re-analyzing".
                        const isRegen =
                          isThisStreaming &&
                          (!!message.content?.trim() ||
                            !!(message.variants && message.variants.length));
                        // A pending-reconnect reply is still generating server-side
                        // even though we're not streaming it locally — keep the
                        // "Analyzing" status over its resumed partial text.
                        const isPendingResume = message.id === pendingReplyId;
                        const busy = isThisStreaming || isPreparing || isPendingResume;
                        // When a turn didn't finish normally, surface the REAL
                        // state instead of a misleading "Response ready". Only
                        // applies once we've stopped generating (busy wins).
                        const failed = !busy && message.deliveryStatus === 'failed';
                        const stopped = !busy && message.deliveryStatus === 'stopped';
                        const status = busy
                          ? isRegen
                            ? 'Re-analyzing'
                            : 'Analyzing'
                          : failed
                            ? 'Response failed'
                            : stopped
                              ? 'Stopped'
                              : 'Response ready';
                        return (
                          <div className="mb-2 flex items-center gap-1.5">
                            <span className="text-[13px] font-semibold tracking-tight text-gray-900 dark:text-white">
                              VeeGPT
                            </span>
                            <span className="text-gray-300 dark:text-gray-600">·</span>
                            <span
                              className={`text-xs font-medium ${
                                busy
                                  ? 'text-blue-600 dark:text-blue-400 animate-pulse'
                                  : failed
                                    ? 'text-red-500 dark:text-red-400'
                                    : stopped
                                      ? 'text-amber-500 dark:text-amber-400'
                                      : 'text-gray-400 dark:text-gray-500'
                              }`}
                            >
                              {status}
                              {busy ? '…' : ''}
                            </span>
                          </div>
                        );
                      })()}

                    {/* Message Content */}
                    <div
                      className={`px-4 py-3 rounded-2xl ${
                        message.role === 'user'
                          ? 'bg-blue-50 dark:bg-blue-500/15 text-gray-900 dark:text-gray-50 inline-block rounded-br-md border border-blue-100/80 dark:border-blue-400/20 shadow-[0_2px_10px_-5px_rgba(59,130,246,0.25)] dark:shadow-none'
                          : 'bg-transparent text-black dark:text-gray-100'
                      }`}
                      style={{
                        wordWrap: 'break-word',
                        wordBreak: 'break-word',
                        overflowWrap: 'break-word',
                        maxWidth: '100%',
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
                            width: '100%',
                          }}
                        >
                          {/* Unified "thinking" indicator — ONE continuous element
                              from the first moment of generation through the real
                              reasoning stream, so there's never a hardcoded shimmer
                              that then gets replaced by a differently-styled panel.
                              Phase 1 (no reasoning yet): a small shimmering
                              "Thinking…" line. Phase 2 (reasoning streaming): the
                              same line gains a chevron + a boxless, markdown-stripped
                              reasoning body. Phase 3 (answer streaming/done): the
                              label settles to a collapsed "Thoughts". The label size
                              and position never change, so there is no visual jump. */}
                          {(() => {
                            const streamingVal = streamingContent[message.id];
                            const isStreamingThis = streamingVal !== undefined && isGenerating;
                            const answerStarted = !!(streamingVal && streamingVal.trim());
                            // Prefer the LIVE reasoning while streaming; otherwise
                            // fall back to the reasoning PERSISTED on the message so
                            // the Thoughts panel survives refresh AND a stop/abort
                            // (the thinking is never lost just because generation
                            // ended early).
                            const reasoning =
                              reasoningContent[message.id] ?? (message as any).reasoning ?? undefined;
                            const isPreparingThis =
                              preparingMessageId != null && message.id === preparingMessageId;
                            if (isPreparingThis) return null;

                            // IMAGE GENERATION turns: never show a detailed
                            // "Thinking/Thoughts" panel — the animated generation
                            // card is the only status the user should see. Applies
                            // both live (liveImageCard) and once the image lands.
                            const isImageTurn =
                              !!(message as any).liveImageCard ||
                              (Array.isArray((message as any).infoCards) &&
                                (message as any).infoCards.some((c: any) => c?.kind === 'image'));
                            if (isImageTurn) return null;

                            // DEEP RESEARCH: while the multi-agent research runs,
                            // show the rich live banner (activity feed + sources +
                            // search count) in place of the plain "Thinking…" line.
                            // Once it finishes, the banner hides and the report +
                            // collapsible research card take over.
                            const research = researchProgress[message.id];
                            if (research && research.active) {
                              return (
                                <div className="mb-3">
                                  <DeepResearchBanner state={research} />
                                </div>
                              );
                            }

                            // RETURNING mid-generation: this reply is still being
                            // produced server-side but the client isn't streaming
                            // it (the user left and came back). Show a working
                            // shimmer so the thread isn't blank; the parent polls
                            // and the real answer replaces this when it lands.
                            const isPendingReply =
                              pendingReplyId != null &&
                              message.id === pendingReplyId &&
                              !isStreamingThis &&
                              !answerStarted;
                            if (
                              isPendingReply &&
                              !reasoning &&
                              !message.content?.trim() &&
                              // Hold during the reconnect grace window so a resumed
                              // card/banner can arrive first (no "Working on it…" flash).
                              !suppressPendingIndicator
                            ) {
                              return (
                                <div className="mb-3 flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                                  <ChevronRight className="h-3 w-3 shrink-0 invisible" />
                                  <span className="shimmer-text">Working on it…</span>
                                </div>
                              );
                            }

                            // MODELS WITHOUT reasoning summaries (e.g. GPT-5 family):
                            // there's no thinking body to show, so this is just a
                            // live STATUS line — it reflects the real tool/thinking
                            // status (aiStatus, e.g. "Searching the web…") and
                            // updates as that changes. It disappears the instant the
                            // answer text starts, so "Thinking…" never lingers over a
                            // streaming GPT answer.
                            if (!reasoning) {
                              if (!(isStreamingThis && !answerStarted)) return null;
                              return (
                                <div className="mb-3 flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                                  <ChevronRight className="h-3 w-3 shrink-0 invisible" />
                                  <span className="shimmer-text">{aiStatus || 'Thinking…'}</span>
                                </div>
                              );
                            }

                            // MODELS WITH reasoning summaries (Gemini): keep the panel
                            // EXPANDED for the whole generation so the reasoning types
                            // out live above the answer (Claude/o1 style); collapse to
                            // a quiet "Thoughts" once done. The label reflects the live
                            // status (tool label when a tool runs, else "Thinking…").
                            const active = isStreamingThis;
                            return (
                              <details className="group mb-3" open={active}>
                                <summary className="flex list-none items-center gap-1.5 cursor-pointer select-none text-xs font-medium text-gray-500 dark:text-gray-400 [&::-webkit-details-marker]:hidden">
                                  <ChevronRight className="h-3 w-3 shrink-0 transition-transform duration-200 group-open:rotate-90" />
                                  <span className={active ? 'shimmer-text' : ''}>
                                    {active ? aiStatus || 'Thinking…' : 'Thoughts'}
                                  </span>
                                </summary>
                                <div className="mt-1.5 ml-1.5 max-h-72 overflow-auto whitespace-pre-wrap border-l-2 border-gray-200 pl-3 text-[13px] leading-relaxed text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                  {stripThinkingMarkdown(reasoning)}
                                </div>
                              </details>
                            );
                          })()}
                          {(() => {
                            // Preparing state (e.g. building a post): show a
                            // shimmering status line, like the live "thinking"
                            // indicator, until the work finishes and the composer
                            // opens.
                            if (preparingMessageId != null && message.id === preparingMessageId) {
                              return (
                                <div className="mb-3 flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                                  <ChevronRight className="h-3 w-3 shrink-0 invisible" />
                                  <span className="shimmer-text">{preparingStatus || 'Working on it…'}</span>
                                </div>
                              );
                            }
                            // Single source of truth: while streaming use the live
                            // streamed text; once complete it falls back to the
                            // persisted content. Rendering through ONE branch (same
                            // component tree) means no remount/reflow "jerk" when the
                            // stream finishes.
                            const streaming = streamingContent[message.id];
                            const isStreamingThis = streaming !== undefined && isGenerating;
                            // StreamingMarkdown handles partial-markdown
                            // stabilization AND splits completed blocks off into a
                            // memoized region, so a live answer doesn't re-parse
                            // itself end-to-end on every frame.
                            const text =
                              streaming !== undefined ? streaming : message.content;

                            // Empty + generating → the unified "thinking"
                            // indicator ABOVE owns this state (single continuous
                            // element for both the pre-reasoning shimmer and the
                            // real reasoning stream). Render nothing here so there
                            // is never a second, differently-styled shimmer.
                            if (streaming !== undefined && streaming === '' && isGenerating) {
                              return null;
                            }

                            return (
                              <div className="markdown-content">
                                <StreamingMarkdown
                                  text={text}
                                  live={isStreamingThis}
                                  components={
                                    highlightMessageId === message.id &&
                                    (highlightQuery || '').trim()
                                      ? highlightComponents
                                      : markdownComponents
                                  }
                                />
                              </div>
                            );
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
                            width: '100%',
                          }}
                        >
                          {message.attachments && message.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-2">
                              {message.attachments.map((rawAtt, ai) => {
                                // A persisted attachment sent via the storage-key
                                // path carries `deliveryId` (the S3 key) instead of
                                // a hosted `url`. Resolve it to the authenticated
                                // proxy path so the existing url-based rendering and
                                // the lightbox work unchanged (same-origin, cookie
                                // auth — the proxy 302s to a signed URL / streams).
                                const deliveryId = (rawAtt as any).deliveryId;
                                const att =
                                  rawAtt.url || !deliveryId
                                    ? rawAtt
                                    : {
                                        ...rawAtt,
                                        url: `/api/chat/attachment/${encodeURIComponent(String(deliveryId))}`,
                                      };
                                return att.url && att.mimeType?.startsWith('image/') ? (
                                  // Hosted image with URL → real clickable thumbnail
                                  <img
                                    key={ai}
                                    src={att.url}
                                    alt={att.name || 'attachment'}
                                    onClick={() =>
                                      att.url &&
                                      setLightbox({
                                        url: att.url,
                                        mimeType: att.mimeType,
                                        name: att.name,
                                      })
                                    }
                                    className="w-28 h-28 rounded-xl object-cover border border-gray-300/50 dark:border-white/10 cursor-pointer hover:opacity-90 transition-opacity shadow-sm"
                                  />
                                ) : !att.url && att.mimeType?.startsWith('image/') ? (
                                  // User-uploaded image: no hosted URL on persisted msg (base64 is sent but not stored).
                                  // Render an image-icon tile — not a text chip — so it clearly looks like a photo.
                                  <div
                                    key={ai}
                                    className="w-28 h-28 rounded-xl border border-gray-300/50 dark:border-white/10 bg-gray-100 dark:bg-slate-700/60 flex flex-col items-center justify-center gap-1.5 shadow-sm select-none"
                                    title={att.name || 'Image'}
                                  >
                                    <svg className="w-9 h-9 text-gray-400 dark:text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                                      <rect x="3" y="3" width="18" height="18" rx="3" />
                                      <circle cx="8.5" cy="8.5" r="1.5" />
                                      <path d="m21 15-5-5L5 21" />
                                    </svg>
                                    <span className="text-[10px] text-gray-500 dark:text-gray-400 text-center px-1.5 truncate max-w-[104px] leading-tight">
                                      {att.name ? att.name.replace(/\.[^/.]+$/, '') : 'Image'}
                                    </span>
                                  </div>
                                ) : att.url && att.mimeType?.startsWith('video/') ? (
                                  <div
                                    key={ai}
                                    onClick={() =>
                                      att.url &&
                                      setLightbox({
                                        url: att.url,
                                        mimeType: att.mimeType,
                                        name: att.name,
                                      })
                                    }
                                    className="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-300/50 dark:border-white/10 bg-black cursor-pointer hover:opacity-90 transition-opacity"
                                  >
                                    {att.posterUrl ? (
                                      <img
                                        src={att.posterUrl}
                                        alt={att.name || 'video'}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <video
                                        src={`${att.url}#t=0.1`}
                                        className="w-full h-full object-cover"
                                        muted
                                        playsInline
                                        preload="metadata"
                                      />
                                    )}
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                      <div className="w-7 h-7 rounded-full bg-black/50 flex items-center justify-center">
                                        <svg
                                          className="w-3.5 h-3.5 text-white"
                                          viewBox="0 0 24 24"
                                          fill="currentColor"
                                        >
                                          <path d="M8 5v14l11-7z" />
                                        </svg>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div
                                    key={ai}
                                    onClick={() =>
                                      att.url &&
                                      setLightbox({
                                        url: att.url,
                                        mimeType: att.mimeType,
                                        name: att.name,
                                      })
                                    }
                                    className={`flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/60 dark:bg-black/20 border border-gray-300/50 dark:border-white/10 ${att.url ? 'cursor-pointer hover:bg-white/80 dark:hover:bg-black/30 transition-colors' : ''}`}
                                  >
                                    <span
                                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${att.mimeType === 'application/pdf' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300' : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300'}`}
                                    >
                                      {att.mimeType === 'application/pdf' ? 'PDF' : 'IMG'}
                                    </span>
                                    <span className="text-xs text-gray-700 dark:text-gray-200 truncate max-w-[140px]">
                                      {att.name || 'attachment'}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {message.content && message.content.trim() && (
                            <div className="text-black dark:text-gray-100 text-[15px]">
                              {highlightMessageId === message.id && (highlightQuery || '').trim()
                                ? highlightChildren(message.content, (highlightQuery || '').trim())
                                : message.content}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Inline post-confirm card rehydrated from persisted history. */}
                    {message.role === 'assistant' &&
                      renderMessageCard &&
                      renderMessageCard(message)}

                    {/* Retry button for a failed/rate-limited assistant message. */}
                    {message.role === 'assistant' &&
                      (message as any).retryable &&
                      onRetry &&
                      message.id !== pendingReplyId &&
                      !(streamingContent[message.id] !== undefined && isGenerating) && (
                        <button
                          onClick={onRetry}
                          disabled={isGenerating}
                          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 hover:bg-blue-50 dark:hover:bg-blue-500/10 disabled:opacity-50"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Retry
                        </button>
                      )}

                    {/* Action row (copy · regenerate · variant navigator) — shown ONLY
                      on a fully-completed assistant reply (has real output, not a
                      pending-reconnect placeholder, not mid-generation), ChatGPT-style. */}
                    {message.role === 'assistant' &&
                      !(message as any).retryable &&
                      message.id !== pendingReplyId &&
                      !(message as any).liveImageCard &&
                      (!!message.content?.trim() ||
                        !!(message as any).listCard ||
                        !!(message as any).editCards?.length ||
                        !!(message as any).infoCards?.length ||
                        !!(message as any).postCard ||
                        !!(message as any).autopilotCard) &&
                      !(
                        (streamingContent[message.id] !== undefined && isGenerating) ||
                        (preparingMessageId != null && message.id === preparingMessageId)
                      ) && (
                        <div className="flex items-center gap-0.5 mt-1.5 -ml-1.5">
                          {/* Variant navigator (1/2, 2/2) when this reply was regenerated. */}
                          {Array.isArray(message.variants) &&
                            message.variants.length > 1 &&
                            (() => {
                              const total = message.variants!.length;
                              const active =
                                typeof message.activeVariant === 'number'
                                  ? message.activeVariant
                                  : total - 1;
                              return (
                                <div className="flex items-center text-gray-400 dark:text-gray-500 mr-0.5 select-none">
                                  <button
                                    onClick={() =>
                                      onSwitchVariant &&
                                      active > 0 &&
                                      onSwitchVariant(message, active - 1)
                                    }
                                    disabled={active <= 0}
                                    title="Previous response"
                                    className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                                  >
                                    <ChevronLeft className="w-3.5 h-3.5" />
                                  </button>
                                  <span className="text-xs tabular-nums px-0.5">
                                    {active + 1}/{total}
                                  </span>
                                  <button
                                    onClick={() =>
                                      onSwitchVariant &&
                                      active < total - 1 &&
                                      onSwitchVariant(message, active + 1)
                                    }
                                    disabled={active >= total - 1}
                                    title="Next response"
                                    className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                                  >
                                    <ChevronRight className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              );
                            })()}

                          <button
                            onClick={() => copyMessage(message)}
                            title={copiedId === message.id ? 'Copied' : 'Copy'}
                            aria-label="Copy response"
                            className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                          >
                            {copiedId === message.id ? (
                              <Check className="w-4 h-4 text-green-500" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
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
                      const vs = Array.isArray(message.variants) ? message.variants : null;
                      const activeIdx =
                        vs && vs.length
                          ? typeof message.activeVariant === 'number'
                            ? message.activeVariant
                            : vs.length - 1
                          : -1;
                      const tsValue =
                        (vs && activeIdx >= 0 && (vs[activeIdx] as any)?.createdAt) ||
                        message.createdAt;
                      const assistantIncomplete =
                        message.role === 'assistant' &&
                        // A failed/stopped turn is terminal — treat it as complete
                        // so its timestamp + actions show (not a "working" state).
                        !(message as any).deliveryStatus &&
                        (message.id === pendingReplyId ||
                          !!(message as any).liveImageCard ||
                          (streamingContent[message.id] !== undefined && isGenerating) ||
                          (preparingMessageId != null && message.id === preparingMessageId) ||
                          // no output yet (empty text and no cards) → still working
                          !(
                            !!message.content?.trim() ||
                            !!(message as any).listCard ||
                            !!(message as any).editCards?.length ||
                            !!(message as any).infoCards?.length ||
                            !!(message as any).postCard ||
                            !!(message as any).autopilotCard
                          ));
                      if (!tsValue || assistantIncomplete) return null;
                      return (
                        <div
                          className={`mt-2 text-xs text-gray-500 dark:text-gray-400 ${message.role === 'user' ? 'text-right' : 'text-left'}`}
                        >
                          {new Date(tsValue).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ))}

          {/* Pending AI indicator — shown immediately when generation starts
              (before the first server event arrives) and until THIS conversation
              has a streaming assistant message. Scoped to the messages on screen
              (not a global streamingContent check) so it still appears when
              another conversation is streaming in the background (multi-tasking). */}
          {isGenerating &&
            !messages.some(m => m.role === 'assistant' && streamingContent[m.id] !== undefined) && (
              <div className="flex flex-col space-y-2 items-start">
                <div className="max-w-4xl w-full">
                  <div className="mb-2 flex items-center gap-1.5">
                    <span className="text-[13px] font-semibold tracking-tight text-gray-900 dark:text-white">
                      VeeGPT
                    </span>
                    <span className="text-gray-300 dark:text-gray-600">·</span>
                    <span className="text-xs font-medium text-blue-600 dark:text-blue-400 animate-pulse">
                      Analyzing…
                    </span>
                  </div>
                  {/* Match the streaming message's unified "Thinking…" indicator
                      EXACTLY — same wrapper padding (px-4 py-3), same small size,
                      weight, color, chevron slot, and left offset — so when this
                      pending bubble is replaced by the real streaming row there is
                      no jump in size OR position. */}
                  <div className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                      <ChevronRight className="h-3 w-3 shrink-0 invisible" />
                      {/* Reflect the live tool/thinking status (e.g. "Searching
                          the web…") so tool calls are shown honestly, not a static
                          "Thinking…". */}
                      <span className="shimmer-text">{aiStatus || 'Thinking…'}</span>
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
      <div
        ref={composerWrapRef}
        style={{
          position: 'absolute',
          bottom: '34px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: '48rem',
          padding: '0 24px',
          pointerEvents: 'none',
          zIndex: 1000,
        }}
      >
        {/* Pending attachment thumbnails are rendered INSIDE the composer pill
            (see below) so they stay within the input box, ChatGPT-style. */}

        {attachmentError && (
          <div
            role="alert"
            className="mb-2 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-500/40 dark:bg-amber-950/30"
          >
            <AlertTriangle className="mt-[1px] h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0 flex-1 whitespace-pre-line text-[12.5px] leading-[1.5] text-amber-900 dark:text-amber-200">
              {attachmentError}
            </div>
            <button
              onClick={() => onDismissAttachmentError?.()}
              className="shrink-0 rounded p-0.5 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40"
              title="Dismiss"
              aria-label="Dismiss"
            >
              <X style={{ width: 12, height: 12 }} />
            </button>
          </div>
        )}

        {/* Advanced selectors: VeeGPT agent (persona) + social account focus */}
        {agents && agents.length > 0 && onSelectAgent && onSelectAccount && (
          <div
            style={{
              pointerEvents: 'auto',
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap',
            }}
          >
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
                className="flex items-center gap-1 rounded-full border border-blue-400 dark:border-blue-400/50 bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 px-2.5 py-1 text-xs font-medium shadow-sm transition-colors hover:bg-blue-100 dark:hover:bg-blue-500/20"
              >
                <Wrench className="w-3 h-3" />
                {getComposerTool(selectedTool)?.label || 'Tool'}
                <X className="w-3 h-3 opacity-70" />
              </button>
            )}
          </div>
        )}

        {/* Low-usage hint (only rendered by the parent when near the limit). */}
        {usageHint}

        {/* Pill-shaped composer container */}
        <div
          className="veegpt-composer"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            padding: '12px 16px',
            borderRadius: '26px',
            transition: 'all 0.2s ease',
            pointerEvents: 'auto',
            minHeight: '52px',
          }}
        >
          {/* Pending attachments — INSIDE the composer, above the input row */}
          {attachments.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {attachments.map((att, i) => {
                const isImage = att.mimeType?.startsWith('image/');
                const isVideo = att.mimeType?.startsWith('video/');
                const canPreview = isImage && !!att.previewUrl;
                return (
                  <div key={i} className="relative group">
                    <div
                      onClick={() =>
                        canPreview &&
                        att.previewUrl &&
                        setLightbox({ url: att.previewUrl, mimeType: att.mimeType, name: att.name })
                      }
                      className={`w-16 h-16 rounded-lg overflow-hidden border border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-slate-800 flex items-center justify-center ${canPreview ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''}`}
                      title={att.name}
                    >
                      {isImage && att.previewUrl ? (
                        <img
                          src={att.previewUrl}
                          alt={att.name}
                          className="w-full h-full object-cover"
                          onError={e => {
                            const el = e.currentTarget;
                            el.style.display = 'none';
                            const parent = el.parentElement;
                            if (parent && !parent.querySelector('[data-fallback]')) {
                              const tag = document.createElement('div');
                              tag.setAttribute('data-fallback', '1');
                              tag.className =
                                'flex flex-col items-center justify-center gap-0.5 text-center';
                              const ext = (att.name || '').split('.').pop() || 'IMG';
                              tag.innerHTML =
                                `<span class="text-[10px] font-bold text-gray-600 dark:text-gray-300">${ext.toUpperCase()}</span>` +
                                `<span class="text-[8px] text-gray-500 px-1 truncate max-w-[56px]">${att.name || ''}</span>`;
                              parent.appendChild(tag);
                            }
                          }}
                        />
                      ) : isVideo ? (
                        <div className="relative w-full h-full bg-black">
                          {att.posterUrl ? (
                            <img src={att.posterUrl} alt={att.name} className="w-full h-full object-cover" />
                          ) : att.previewUrl ? (
                            <video
                              src={att.previewUrl}
                              className="w-full h-full object-cover"
                              muted
                              loop
                              autoPlay
                              playsInline
                              preload="auto"
                            />
                          ) : null}
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="w-6 h-6 rounded-full bg-black/50 flex items-center justify-center">
                              <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M8 5v14l11-7z" />
                              </svg>
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
                );
              })}
            </div>
          )}

          {/* Input row — vertically centred so a single line of text sits in the
              middle of the pill (and the +/send/mic align with it). */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <ComposerPlusMenu
              compact
              onAddFiles={files => onAddAttachments?.(files)}
              selectedTool={selectedTool ?? null}
              onSelectTool={id => onSelectTool?.(id)}
            />
          </div>

          <div
            style={{
              flex: 1,
              position: 'relative',
              display: 'flex',
              alignItems: 'flex-start',
              minHeight: '20px',
            }}
          >
            <div
              ref={inputRef}
              contentEditable
              suppressContentEditableWarning
              className="veegpt-chat-input text-gray-900 dark:text-gray-100"
              onInput={e => {
                const text = e.currentTarget.innerText;
                onInputChange(text);
              }}
              onPaste={e => {
                // If the clipboard has image files (e.g. a screenshot or copied
                // image), attach them like an upload instead of pasting binary.
                const items = e.clipboardData?.items;
                if (!items) return;
                const files: File[] = [];
                for (let i = 0; i < items.length; i++) {
                  const it = items[i];
                  if (it.kind === 'file' && it.type.startsWith('image/')) {
                    const f = it.getAsFile();
                    if (f) files.push(f);
                  }
                }
                if (files.length && onAddAttachments) {
                  e.preventDefault();
                  onAddAttachments(files);
                }
              }}
              onKeyDown={onKeyPress}
              style={{
                width: '100%',
                minHeight: '20px',
                maxHeight: '200px',
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
                overflowWrap: 'break-word',
              }}
              data-placeholder="Message VeeGPT"
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
                cursor: inputText.trim() || attachments.length ? 'pointer' : 'not-allowed',
                color: inputText.trim() || attachments.length ? '#1f2937' : '#9ca3af',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: '2px',
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
                justifyContent: 'center',
              }}
              className={speech.listening ? 'animate-pulse' : ''}
            >
              <Mic
                style={{
                  width: '20px',
                  height: '20px',
                  color: speech.listening ? '#ef4444' : '#6b7280',
                }}
              />
            </button>
          )}
          </div>
        </div>
      </div>

      {/* Footer text positioned below the floating input */}
      <div
        style={{
          position: 'absolute',
          bottom: '10px',
          left: '50%',
          transform: 'translateX(-50%)',
          textAlign: 'center',
          pointerEvents: 'none',
          zIndex: 999,
        }}
      >
        <div className="text-xs text-gray-500 dark:text-gray-400 px-3 py-1">
          VeeGPT can make mistakes. Check important info.
        </div>
      </div>

      {/* Fullscreen media viewer (lightbox) — opens on attachment click. */}
      {lightbox && (
        <MediaLightbox
          url={lightbox.url}
          mimeType={lightbox.mimeType}
          name={lightbox.name}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
};
