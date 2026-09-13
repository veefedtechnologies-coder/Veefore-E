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

import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SEO, seoConfig, generateStructuredData } from '@/lib/seo-optimization';
import {
  Mic,
  Send,
  Lightbulb,
  TrendingUp,
  Camera,
  Target,
  Rocket,
  Sparkles,
  Edit3,
  Calendar,
  X,
  Download,
  Play,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/queryClient';
import { setVeegptLayoutCookie } from '@/lib/bootstrap';
import { useUser } from '@/hooks/useUser';

import { ChatInterface } from '@/features/chat/components/ChatInterface';
import { ConversationSidebar } from '@/features/chat/components/ConversationSidebar';
import { AutoPilotPage } from '@/features/autopilot';
import { AlbumView, type AlbumImage } from '@/features/chat/components/AlbumView';
import { useChatStream } from '@/features/chat/hooks/useChatStream';
import type { ResearchProgressState } from '@/features/chat/types/chat.types';
import { useSpeechToText } from '@/features/chat/hooks/useSpeechToText';
import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher';
import { useSocialAccounts } from '@/hooks/useSocialAccounts';
import { PostConfirmCard } from '@/features/chat/components/PostConfirmCard';
import { PostListCard } from '@/features/chat/components/PostListCard';
import { EditConfirmCard } from '@/features/chat/components/EditConfirmCard';
import { InfoCard, type InfoCardData } from '@/features/chat/components/InfoCard';
import { ResearchReportViewer } from '@/features/chat/components/ResearchReportViewer';
import { DocumentViewer } from '@/features/chat/components/DocumentViewer';
import { ApprovalCard, type ApprovalCardData } from '@/features/autopilot/components/ApprovalCard';
import {
  ContentBriefCard,
  type ContentBriefCardData,
} from '@/features/autopilot/components/ContentBriefCard';
import { SearchChatsModal } from '@/features/chat/components/SearchChatsModal';
import { VeeGPTSelectors, accountOptionId } from '@/features/chat/components/VeeGPTSelectors';
import { useVeeGPTAgents } from '@/features/chat/hooks/useVeeGPTAgents';
import { ComposerPlusMenu } from '@/features/chat/components/ComposerPlusMenu';
import { getComposerTool } from '@/features/chat/composerTools';
import { validateAttachments } from '@shared/attachment-support';
import useSubscription from '@/hooks/useSubscription';

// The conversational AI Video Editor lives INSIDE VeeGPT as its own view
// (keeping the conversation sidebar), just like Auto Pilot and Album. Lazily
// loaded so it never bloats the main VeeGPT chat bundle.
const VideoEditorPage = React.lazy(() =>
  import('@/features/video-editor').then((m) => ({ default: m.VideoEditorPage })),
);

// ─── Local time helpers (for tool-calling: the model needs the user's current
// local date/time to resolve relative times like "tomorrow 5pm" correctly). ──
function localNowStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ChatConversation = {
  id: number;
  userId: string;
  workspaceId: string;
  title: string;
  messageCount: number;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

type ChatMessage = {
  id: number;
  conversationId: number;
  role: 'user' | 'assistant';
  content: string;
  attachments?: { name?: string; mimeType: string; url?: string }[];
  tokensUsed: number;
  createdAt: Date | string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Ordered as a natural progression — discover → create → grow/plan — and laid
// out shortest-first so the pills form a tidy, centered pyramid (rows of 3/3/2).
const QUICK_PROMPTS = [
  // Row 1 — discover / spark ideas (short, inviting)
  { icon: Lightbulb, text: 'Inspire me!' },
  { icon: Camera, text: 'Caption an image' },
  { icon: Target, text: 'I need a campaign idea' },
  // Row 2 — create
  { icon: Edit3, text: 'Draft a TikTok script' },
  { icon: Edit3, text: 'Write an Instagram post' },
  { icon: Rocket, text: 'How can I boost engagement?' },
  // Row 3 — research / plan (longer)
  { icon: TrendingUp, text: "What's trending in my industry?" },
  { icon: Calendar, text: 'Draft a posting schedule for next month' },
];

// ── VeeGPT usage-limit hint (soft "running low" nudge) ─────────────────────
// Shape mirrors GET /api/chat/limits. We NEVER show exact numbers — only a
// friendly status, and ONLY when the user is genuinely near their limit.
interface VeegptLimitsWindow {
  used: number;
  limit: number | null;
  remaining: number | null;
  resetAt: number; // epoch seconds
}
interface VeegptLimitsResponse {
  plan: string | null;
  session: VeegptLimitsWindow | null;
  monthly: VeegptLimitsWindow | null;
  /**
   * The server's plain-language usage notice (spec §42). Authoritative wording —
   * the exact 70/85/95/100% phrasing lives on the server so it is defined once.
   * `band: 'none'` means show nothing.
   */
  notice?: {
    band: 'none' | 'heavy' | 'approaching' | 'almost' | 'reached';
    message: string | null;
    scope: 'session' | 'monthly';
    resetAt: number;
  } | null;
  upgrade?: { available: boolean; recommendedPlan: string | null } | null;
}

/** Composer grows with content up to this height, then scrolls (like ChatGPT/Claude). */
const COMPOSER_MIN_HEIGHT = 48;
const COMPOSER_MAX_HEIGHT = 240;

/**
 * Size the composer textarea to its content, capped at COMPOSER_MAX_HEIGHT.
 * Past the cap the box stops growing and scrolls internally, so a very long
 * prompt never pushes the toolbar (or the rest of the page) off-screen.
 */
function resizeComposer(el: HTMLTextAreaElement | null): void {
  if (!el) return;
  el.style.height = 'auto';
  const next = Math.min(COMPOSER_MAX_HEIGHT, Math.max(COMPOSER_MIN_HEIGHT, el.scrollHeight));
  el.style.height = next + 'px';
  el.style.overflowY = el.scrollHeight > COMPOSER_MAX_HEIGHT ? 'auto' : 'hidden';
}

/**
 * True when the conversation's last message is an assistant reply that is still
 * being generated server-side: an empty placeholder (content is just the ' '
 * seed), not a failed/retryable message, and recent. This is how a returning
 * user (who navigated away mid-generation, so the client is no longer streaming)
 * detects that a reply is still in flight — so the UI can show a working state
 * and poll until the persisted answer lands, instead of rendering a blank thread.
 */
function isPendingAssistantReply(msgs?: ChatMessage[]): boolean {
  if (!msgs || msgs.length === 0) return false;
  const last = msgs[msgs.length - 1];
  if (!last || last.role !== 'assistant') return false;
  if (last.content && last.content.trim()) return false; // already has an answer
  if ((last as any).retryable) return false; // failed — not in flight
  // A turn that failed or was stopped is terminal — never treat it as in-flight
  // (otherwise an aborted reply stays stuck on "Analyzing / Working on it").
  if ((last as any).deliveryStatus) return false;
  const createdMs = new Date(last.createdAt as any).getTime();
  // Only treat RECENT placeholders as in-flight, so a stale empty row from an
  // old aborted turn can't cause an endless spinner / poll.
  return Number.isFinite(createdMs) && Date.now() - createdMs < 15 * 60 * 1000;
}

type UsageLevel = 'ok' | 'low' | 'critical';

/** Classify one window. 'ok' → hidden; only 'low'/'critical' surface a hint. */
function usageWindowLevel(w?: VeegptLimitsWindow | null): UsageLevel {
  if (!w || w.limit == null || w.remaining == null) return 'ok';
  const { remaining, limit } = w;
  // Near-limit thresholds: absolute floors keep this sensible on tiny (Free)
  // and large (Business) caps alike. Anything above ~20% left stays hidden.
  if (remaining <= Math.max(2, Math.ceil(limit * 0.05))) return 'critical';
  if (remaining <= Math.max(5, Math.ceil(limit * 0.2))) return 'low';
  return 'ok';
}

/** Compact reset phrase, e.g. "4h 32m", "45 min", "5 days". */
function formatResetShort(resetAt: number): string {
  const secs = Math.max(0, resetAt - Math.floor(Date.now() / 1000));
  if (secs >= 36 * 3600) {
    const d = Math.round(secs / 86400);
    return `${d} day${d === 1 ? '' : 's'}`;
  }
  if (secs >= 3600) {
    // Round to whole minutes FIRST, then split into h/m — otherwise rounding a
    // 59.x-minute remainder up to 60 renders as "4h 60m" instead of "5h".
    const totalMin = Math.round(secs / 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const m = Math.max(1, Math.round(secs / 60));
  return `${m} min`;
}

/**
 * Build the low-usage hint node, or null when the user is NOT near a limit
 * (so nothing renders in the normal case). Picks whichever window (session or
 * monthly) is more urgent and uses soft language — never exact counts.
 */
function buildUsageHint(usage?: VeegptLimitsResponse): React.ReactNode {
  if (!usage) return null;

  // Prefer the server's §42 notice: its wording is the spec's, defined once, and
  // it fires on the spec's 70/85/95/100% bands rather than the client's own
  // remaining-based heuristic. Only fall back to the local computation when the
  // server did not send one (older server, or notice omitted).
  if (usage.notice && usage.notice.band !== 'none' && usage.notice.message) {
    const n = usage.notice;
    const critical = n.band === 'almost' || n.band === 'reached';
    const upgrade = usage.upgrade?.available ?? false;
    const reset = formatResetShort(n.resetAt);
    const resetText =
      n.scope === 'monthly' ? `Resets in ${reset}.` : `More unlocks in ${reset}.`;
    const tone = critical
      ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-950 dark:text-amber-200'
      : 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-500/40 dark:bg-blue-950 dark:text-blue-200';
    return (
      <div
        className={`mb-2 flex items-start gap-2.5 rounded-2xl border px-3.5 py-2.5 shadow-sm ${tone}`}
      >
        <Rocket className="mt-0.5 h-4 w-4 shrink-0 opacity-80" />
        <p className="min-w-0 flex-1 text-[13px] font-medium leading-snug">
          {n.message} {n.band === 'reached' || n.band === 'almost' ? resetText : null}
        </p>
        {upgrade && (
          <a
            href="/settings/billing"
            className="shrink-0 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-blue-700"
          >
            Upgrade
          </a>
        )}
      </div>
    );
  }

  const sessionLevel = usageWindowLevel(usage.session);
  const monthlyLevel = usageWindowLevel(usage.monthly);
  const rank: Record<UsageLevel, number> = { ok: 0, low: 1, critical: 2 };
  const useMonthly = rank[monthlyLevel] > rank[sessionLevel];
  const level = useMonthly ? monthlyLevel : sessionLevel;
  if (level === 'ok') return null;

  const win = (useMonthly ? usage.monthly : usage.session) as VeegptLimitsWindow;
  const reset = formatResetShort(win.resetAt);
  const upgrade = usage.plan === 'free' || usage.plan === 'creator' || usage.plan === 'pro';
  const headline =
    level === 'critical'
      ? "You're almost out of VeeGPT messages"
      : "You're running low on VeeGPT messages";
  const resetText = useMonthly ? `Resets in ${reset}.` : `More unlock in ${reset}.`;
  const tone =
    level === 'critical'
      ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-950 dark:text-red-300'
      : 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-950 dark:text-amber-300';

  return (
    <div
      className={`mb-2 flex items-center justify-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm ${tone}`}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${level === 'critical' ? 'bg-red-500' : 'bg-amber-500'}`}
      />
      <span className="text-center">
        {headline} {useMonthly ? 'this month' : 'right now'}. {resetText}
      </span>
      {upgrade && (
        <a
          href="/settings/billing"
          className="font-semibold text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
        >
          Upgrade
        </a>
      )}
    </div>
  );
}

// Cache helpers (localStorage, 24-hour expiry)
const CACHE_KEY = 'veegpt-state';
const getCachedState = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.timestamp < 86_400_000) return parsed;
    }
  } catch (_) {}
  return null;
};
const setCachedState = (
  conversationId: number | null,
  hasSentFirstMessage: boolean,
  activeView: 'chat' | 'album' | 'autopilot' | 'video-editor' = 'chat',
  previewUrl: string | null = null
) => {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        conversationId,
        hasSentFirstMessage,
        activeView,
        previewUrl,
        timestamp: Date.now(),
      })
    );
  } catch (_) {}
};
const clearCachedState = () => {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (_) {}
};

// ─── Default export ───────────────────────────────────────────────────────────

/**
 * Does the user's text actually ask to publish/schedule something?
 *
 * Only used to decide whether an ATTACHMENT goes down the post-agent flow.
 * Attaching an image is not by itself a posting signal — people also ask "what is
 * this?", "read this PDF", "does this fit my brand?". Deliberately narrow: a false
 * positive drops the user into a scheduling flow they never asked for, whereas a
 * false negative just yields a normal chat reply (and the model can still raise a
 * schedule_post tool call on its own).
 */
const POSTING_INTENT =
  /\b(post|publish|schedule|upload)\s+(this|these|it|that|them)\b|\b(post|publish|schedule)\b[^.]{0,20}\b(on|to)\s+(instagram|facebook|ig|fb|story|reel|feed)\b|\b(make|create|draft)\s+(a\s+)?(post|reel|story|carousel)\b|\b(add|put)\s+(this|it)\s+(to|on)\s+my\s+(feed|calendar|schedule)\b/i;

export default function VeeGPT() {
  return (
    <>
      <SEO {...seoConfig.veeGPT} structuredData={generateStructuredData.softwareApplication()} />
      <VeeGPTContent />
    </>
  );
}

// ─── Page Orchestrator ────────────────────────────────────────────────────────

function VeeGPTContent() {
  const { userData, loading: userLoading, user: firebaseUser } = useUser();
  const queryClient = useQueryClient();
  // Canonical subscription plan (from /api/v2/subscription/me). The legacy
  // `userData.plan` field is stale/unreliable (it showed "Enterprise" for a
  // Free account), so the displayed plan MUST come from the subscription source.
  const { plan: subscriptionPlan } = useSubscription();
  const planLabel = subscriptionPlan
    ? subscriptionPlan.charAt(0).toUpperCase() + subscriptionPlan.slice(1)
    : 'Free';

  // Normalize user data across Firebase / API sources
  const displayUserData =
    userData ||
    (firebaseUser
      ? {
          displayName: firebaseUser.displayName,
          email: firebaseUser.email,
          avatar: firebaseUser.photoURL,
          plan: 'Free',
        }
      : null);
  const finalUserData = displayUserData
    ? {
        displayName: displayUserData.displayName || (displayUserData as any).username,
        email: displayUserData.email,
        avatar: displayUserData.avatar || (displayUserData as any).photoURL,
        // Always the canonical subscription plan, never the stale userData.plan.
        plan: planLabel,
      }
    : null;

  // ── Local page state ──────────────────────────────────────────────────────
  const [refreshKey, setRefreshKey] = useState(0);
  const [inputText, setInputText] = useState('');
  // Visible notice shown when the user hits a VeeGPT usage limit (per-minute
  // burst, 5h session, or monthly). `upgrade` drives an inline Upgrade CTA.
  const [limitNotice, setLimitNotice] = useState<{ message: string; upgrade: boolean } | null>(
    null
  );
  // Structured model-quota refusal (spec §28, §43). Distinct from limitNotice
  // because it offers a CHOICE — "Continue with Fast" — instead of just telling
  // the user to wait. Only ever set when the server said the refusal is solvable
  // by dropping to the Light model (a burst/monthly refusal is not).
  const [refusal, setRefusal] = useState<{
    message: string;
    code?: string;
    upgrade: boolean;
  } | null>(null);
  // Replays the just-refused message on the Light model when the user clicks
  // "Continue with Fast". Captured at send time so the button has everything it
  // needs without re-reading the (already-cleared) composer.
  const continueWithFastRef = useRef<null | (() => Promise<void>)>(null);
  const [continuingWithFast, setContinuingWithFast] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);
  const [hasSentFirstMessage, setHasSentFirstMessage] = useState(false);
  const [hasUserStartedNewChat, setHasUserStartedNewChat] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Deep-research report open in the full-screen viewer (overlays the chat body).
  const [openReport, setOpenReport] = useState<InfoCardData | null>(null);
  // Generated document open in the in-app document viewer (overlays the chat body).
  const [openDocument, setOpenDocument] = useState<InfoCardData | null>(null);
  // Which image the user picked in each media-choice card (keyed by card id), so
  // the selection sticks across re-renders: the picker then collapses to the
  // chosen image and locks (a card is used once).
  const [mediaPicks, setMediaPicks] = useState<Record<string, number>>({});
  // Which surface the main panel shows: the normal VeeGPT chat, or the in-page
  // Auto Pilot "mission bot". Auto Pilot lives INSIDE VeeGPT (keeping the
  // conversation sidebar) instead of a separate /autopilot route.
  // Restore the view (chat / album / autopilot) synchronously from cache so a
  // refresh lands exactly where the user left — no flash of the welcome screen.
  const [activeView, setActiveView] = useState<'chat' | 'autopilot' | 'album' | 'video-editor'>(
    () =>
      (getCachedState()?.activeView as 'chat' | 'autopilot' | 'album' | 'video-editor') || 'chat'
  );
  // The album image the user had open in the preview (restored on refresh).
  const [albumPreviewUrl, setAlbumPreviewUrl] = useState<string | null>(
    () => getCachedState()?.previewUrl ?? null
  );
  // Queued programmatic send used by the Album's Create/Edit actions. Set after
  // switching to chat + (new chat | selecting the source conversation); an effect
  // fires it once that state has settled so it lands in the right conversation.
  const [albumSendReq, setAlbumSendReq] = useState<{ text: string; nonce: number } | null>(null);
  // The Album's own sidebar-collapsed state (independent of chat). It's expanded
  // while browsing the gallery, and auto-collapses to the slim rail ONLY while an
  // image preview is open (so the rail stays visible beside the preview).
  const [albumSidebarCollapsed, setAlbumSidebarCollapsed] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [optimisticMessages, setOptimisticMessages] = useState<ChatMessage[]>([]);
  // True while an attachment is uploading to storage AFTER its optimistic bubble
  // is already on screen. Guards the "clear optimistic once real messages load"
  // effect from nuking that bubble mid-upload (so the thumbnail stays visible the
  // instant the user sends, exactly like the mobile app).
  const uploadingOptimisticRef = useRef(false);
  // ChatGPT-style search-chats modal + the message to scroll-to/highlight on open.
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  // True while a brand-new chat's first message is being created (before its
  // conversation id exists). Locks the welcome composer so one send can't spawn
  // two conversations, without blocking sends to OTHER chats (multi-tasking).
  const [newChatPending, setNewChatPending] = useState(false);
  // Synchronous mirror of newChatPending: blocks a rapid double Enter/click from
  // creating two conversations before React state updates (state lags a tick).
  const creatingChatRef = useRef(false);
  const [highlightMessageId, setHighlightMessageId] = useState<number | null>(null);
  const [highlightQuery, setHighlightQuery] = useState<string>('');
  // Whether the AI post agent is mid-flow (drives display so its optimistic
  // shimmer + inline confirm card aren't clobbered by the messages refetch).
  const [postAgentActive, setPostAgentActive] = useState(false);
  // Pending file attachments (images/PDFs) for the next message. We keep the raw
  // File plus a preview; they're base64-encoded and sent with the message.
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  // Why the last pick was rejected (unsupported type / too large / too many).
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  // Generated poster frames for pending video files (keyed by name+size).
  const [pendingVideoPosters, setPendingVideoPosters] = useState<Record<string, string>>({});
  // Fullscreen media viewer (lightbox) for clicking a pending attachment chip.
  const [lightbox, setLightbox] = useState<{ url: string; mimeType: string; name?: string } | null>(
    null
  );
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);
  const fileKey = (f: File) => `${f.name}:${f.size}`;
  // STABLE object URLs per file. Recreating these every render makes the
  // <img>/<video> src change constantly so it never paints — cache them.
  const previewUrlCacheRef = useRef<Map<string, string>>(new Map());
  const getPreviewUrl = (f: File): string | undefined => {
    if (!(f.type.startsWith('image/') || f.type.startsWith('video/'))) return undefined;
    const key = fileKey(f);
    const cache = previewUrlCacheRef.current;
    if (!cache.has(key)) cache.set(key, URL.createObjectURL(f));
    return cache.get(key);
  };
  const attachmentPreviews = pendingFiles.map(f => ({
    name: f.name,
    mimeType: f.type,
    previewUrl: getPreviewUrl(f),
    posterUrl: f.type.startsWith('video/') ? pendingVideoPosters[fileKey(f)] : undefined,
  }));
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Keep the welcome composer sized to its content. The <textarea> only
  // auto-grows from its own onChange, so any *programmatic* change to inputText
  // (e.g. restoring the user's draft after a usage-limit refusal) would leave
  // the box stuck at its 48px min-height and clip the restored text. Recompute
  // the height whenever the value changes so the text is never cut off.
  useEffect(() => {
    resizeComposer(textareaRef.current);
  }, [inputText]);

  // Generate poster frames for any pending video files so the input preview
  // shows a still thumbnail (not a chip) before sending.
  useEffect(() => {
    pendingFiles.forEach(f => {
      if (!f.type.startsWith('video/')) return;
      const key = fileKey(f);
      if (pendingVideoPosters[key]) return;
      videoPosterFromFile(f).then(poster => {
        if (poster) setPendingVideoPosters(prev => (prev[key] ? prev : { ...prev, [key]: poster }));
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFiles]);

  // ── Chat streaming hook (HTTP streaming, not WebSocket) ───────────────────
  const {
    isGenerating,
    aiStatus,
    streamingContent,
    reasoningContent,
    researchProgress,

    streamingConvId,
    generatingConvIds,
    subscribeToConversation,
    sendMessage: wsSendMessage,
    createAndStream,
    regenerate,
    stopGeneration,
    clearStreamingContent,
    isGeneratingRef,
  } = useChatStream();

  // Voice dictation for the welcome-screen composer (browser-native Web Speech
  // API → OS mic-permission prompt; no getUserMedia hack).
  const welcomeDictateBaseRef = useRef('');
  const welcomeVoice = useSpeechToText({
    onStart: () => {
      welcomeDictateBaseRef.current = (inputText || '').trim();
    },
    onText: transcript => {
      const base = welcomeDictateBaseRef.current;
      setInputText((base ? base + ' ' : '') + transcript);
    },
  });

  // The workspace the user is actively viewing — VeeGPT scopes its context
  // (accounts, analytics, recommendations) to THIS workspace.
  const { currentWorkspaceId } = useCurrentWorkspace();
  const { validAccounts } = useSocialAccounts(currentWorkspaceId || undefined);

  // ── Advanced VeeGPT composer selectors ────────────────────────────────────
  // Which agent (persona) answers, and which connected social account VeeGPT is
  // focused on. When an account is selected, the backend fetches that account's
  // full data ON DEMAND (via the get_account_details tool) instead of stuffing
  // it into every prompt.
  const { agents: veegptAgents } = useVeeGPTAgents();
  const [selectedAgentId, setSelectedAgentId] = useState<string>('default');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  // A tool the user explicitly armed from the composer "+" → Tools menu. When set,
  // VeeGPT is forced to run that tool on the next message; cleared after sending.
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  // If the selected account disappears (disconnected / workspace switch), reset.
  useEffect(() => {
    if (
      selectedAccountId &&
      !validAccounts.some((a: any) => accountOptionId(a) === selectedAccountId)
    ) {
      setSelectedAccountId(null);
    }
  }, [validAccounts, selectedAccountId]);
  // Reset the account focus when switching workspaces (accounts differ per ws).
  useEffect(() => {
    setSelectedAccountId(null);
  }, [currentWorkspaceId]);
  // If the selected persona isn't available on the user's plan (the server only
  // returns tier-allowed agents), fall back to the default VeeGPT persona.
  useEffect(() => {
    if (veegptAgents.length && !veegptAgents.some(a => a.id === selectedAgentId)) {
      setSelectedAgentId('default');
    }
  }, [veegptAgents, selectedAgentId]);

  // Debounce refreshKey when user data changes
  useEffect(() => {
    if (finalUserData) {
      const t = setTimeout(() => setRefreshKey(k => k + 1), 100);
      return () => clearTimeout(t);
    }
  }, [finalUserData]);

  // ── Data fetching ─────────────────────────────────────────────────────────
  const { data: conversations = [], isLoading: conversationsLoading } = useQuery<
    ChatConversation[]
  >({
    queryKey: ['/api/chat/conversations'],
    // Scope the list to the workspace the user is actively viewing. The query
    // key is kept workspace-agnostic on purpose (so the many optimistic
    // setQueryData/invalidate calls elsewhere keep targeting one cache); a
    // dedicated effect below refetches when the workspace changes.
    queryFn: () =>
      apiRequest(
        '/api/chat/conversations?workspaceId=' + encodeURIComponent(currentWorkspaceId || '')
      ),
  });

  // Persist a lightweight "has conversations" hint so the VeeGPT Page_Skeleton
  // (Suspense fallback, rendered before this bundle mounts) can predict whether
  // the conversation sidebar will show on the welcome screen — without it the
  // skeleton cannot tell a brand-new user (no sidebar) from a returning user on
  // the new-chat page (sidebar present). Survives `startNewChat` (unlike the
  // chat-state cache) so the prediction stays correct.
  useEffect(() => {
    if (conversationsLoading) return;
    try {
      localStorage.setItem('veegpt-has-conversations', conversations.length > 0 ? '1' : '0');
    } catch (_) {}
  }, [conversationsLoading, conversations.length]);

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
  const prevWorkspaceIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const prev = prevWorkspaceIdRef.current;
    const curr = currentWorkspaceId || null;
    prevWorkspaceIdRef.current = curr;
    if (prev === curr) return;
    if (prev === undefined) {
      // First observation. If a workspace is already known, scope the list.
      if (curr)
        queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations'], exact: true });
      return;
    }
    // A genuine real→real workspace switch resets the open conversation; a
    // late null→real resolution only re-scopes the list.
    if (prev && curr) {
      setCurrentConversationId(null);
      setHasSentFirstMessage(false);
      setInputText('');
      clearStreamingContent();
      setOptimisticMessages([]);
      clearCachedState();
      postConvIdRef.current = null;
      postAgentMsgsRef.current = [];
      postMediaUrlsRef.current = [];
      postHasVideoRef.current = false;
      setPostAgentActive(false);
    }
    queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations'], exact: true });
  }, [currentWorkspaceId]);

  // True while THIS conversation is actively streaming on the client (the hook
  // is delivering the reply live). Used to skip the "returning user" polling.
  const streamingThisConv = !!(
    currentConversationId && generatingConvIds[currentConversationId]
  );
  // Deep-research activity feed RESUMED from the server after a reconnect (user
  // navigated away mid-research and came back). Fed into the same banner as the
  // live stream. Empty during normal streaming (the hook drives it then).
  const [resumedResearch, setResumedResearch] = useState<{
    [id: number]: ResearchProgressState;
  }>({});
  // Live PARTIAL answer text RESUMED from the server after a reconnect (user
  // navigated away / closed the app mid-generation and returned). The server
  // buffers the cumulative partial text; we poll it and show the real answer as
  // it builds — instead of a blank "working" indicator — until the finished
  // reply lands via the messages poll.
  const [resumedPartial, setResumedPartial] = useState<{ [id: number]: string }>({});

  // Resumed LIVE image-generation/editing card after a reconnect (refreshed or
  // reopened the app while an image tool was running). Re-shows the SAME animated
  // card as the live stream, keyed by the pending reply's message id.
  const [resumedImage, setResumedImage] = useState<{
    [id: number]: { kind: 'image'; status: string; operation?: string; subject?: string }
  }>({})

  // Resumed LIVE video-editor card after a reconnect (refreshed or reopened the
  // app while the video_editor tool was running). Re-shows the SAME animated
  // editor card (phase/percent/status) as the live stream, keyed by the pending
  // reply's message id. Mirrors resumedImage.
  const [resumedVideoEditor, setResumedVideoEditor] = useState<{
    [id: number]: {
      kind: 'video_editor'
      status: string
      subject?: string
      phase?: string
      percent?: number
    }
  }>({})

  // Brief grace window after a reconnect: the resume probes (image / research /
  // partial) need one HTTP round-trip to resolve. Until then we suppress the
  // generic "Working on it…" line so it doesn't FLASH for a few hundred ms before
  // the real card/banner/partial replaces it. Set false while probing, true once
  // the probes have had time to land (or immediately when data arrives).
  const [resumeProbed, setResumeProbed] = useState(false)

  const { data: messages = [], isLoading: messagesLoading } = useQuery<ChatMessage[]>({
    queryKey: ['/api/chat/conversations', currentConversationId, 'messages'],
    queryFn: async () => {
      const fresh: ChatMessage[] = await apiRequest(
        `/api/chat/conversations/${currentConversationId}/messages`
      );
      // Preserve CLIENT-ONLY transient render fields the server doesn't return
      // (the live image-generation card, streamed cards, reasoning, variants).
      // Without this, a background poll (or a switch-away-and-back refetch) wipes
      // an in-progress card mid-turn — the card disappears and the message falls
      // back to a generic "working on it" indicator. Merging keeps the live card
      // stable until finalize replaces it with the real output.
      try {
        const prev = queryClient.getQueryData<ChatMessage[]>([
          '/api/chat/conversations',
          currentConversationId,
          'messages',
        ]);
        if (prev && prev.length) {
          const prevById = new Map(prev.map(m => [m.id, m as any]));
          const TRANSIENT = [
            'liveImageCard',
            'liveVideoEditorCard',
            'postCard',
            'listCard',
            'editCards',
            'infoCards',
            'reasoning',
            'variants',
            'activeVariant',
          ];
          return fresh.map((m: any) => {
            const p = prevById.get(m.id);
            if (!p) return m;
            const merged: any = { ...m };
            for (const k of TRANSIENT) {
              if (merged[k] == null && p[k] != null) merged[k] = p[k];
            }
            return merged;
          });
        }
      } catch {
        /* fall through — return the fresh list unchanged */
      }
      return fresh;
    },
    enabled: !!currentConversationId,
    // Don't refetch on focus/mount/reconnect — the messages cache is kept in
    // sync via HTTP streaming + optimistic writes. Aggressive refetching
    // briefly empties the list and makes the just-sent message flicker.
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    staleTime: 30_000,
    // If the last reply is still being generated server-side (the user navigated
    // away mid-generation — e.g. during Deep Research — so the client is no
    // longer streaming it), poll until it lands. The server keeps generating and
    // persists the result, so this is how a returning user sees the finished
    // answer instead of a blank thread. Stops the instant the reply has content.
    // Skipped while WE are actively streaming this chat — the hook drives the UI
    // live then, so polling would be redundant.
    refetchInterval: query =>
      !streamingThisConv &&
      isPendingAssistantReply(query.state.data as ChatMessage[] | undefined)
        ? 2500
        : false,
  });

  // ── VeeGPT usage limits (for the soft "running low" hint) ─────────────────
  // Read-only snapshot; refetched on focus and every 2 min, and invalidated
  // right after each send so the hint reacts as the balance drops.
  const { data: usageLimits } = useQuery<VeegptLimitsResponse>({
    queryKey: ['/api/chat/limits'],
    queryFn: () => apiRequest('/api/chat/limits'),
    refetchInterval: 120_000,
    staleTime: 60_000,
  });
  const usageHintNode = buildUsageHint(usageLimits);

  // ── Display messages composition ─────────────────────────────────────────
  let displayMessages: ChatMessage[] = [...messages];
  // While the post agent is active we render its optimistic thread (live shimmer
  // + inline confirm card) so the server messages refetch can't clobber it.
  // An optimistic USER bubble for the CURRENT conversation (e.g. an attachment
  // uploading in the background) must show immediately too — merged into the
  // persisted history and deduped by id once the real record lands.
  const hasCurrentConvOptimistic =
    !!currentConversationId &&
    optimisticMessages.some(m => m.conversationId === currentConversationId);
  if (
    optimisticMessages.length > 0 &&
    (postAgentActive ||
      !currentConversationId ||
      messages.length === 0 ||
      hasCurrentConvOptimistic)
  ) {
    if ((postAgentActive || hasCurrentConvOptimistic) && messages.length > 0) {
      // Continuing inside an existing conversation: keep the persisted history
      // and append the optimistic message(s) on top (don't hide history).
      const existingIds = new Set(messages.map(m => m.id));
      displayMessages = [...messages, ...optimisticMessages.filter(m => !existingIds.has(m.id))];
    } else {
      displayMessages = [...optimisticMessages];
    }
  }

  // After a routeToChat handoff the post agent is no longer active, but a stray
  // empty assistant placeholder from its optimistic thread can linger for a
  // frame and render a SECOND "Analyzing…/Thinking" block beneath the real
  // streamed reply. Drop empty optimistic assistant placeholders once the post
  // agent is done — the streaming hook's own indicator covers the gap.
  // A reply still being generated server-side (user navigated away mid-stream)
  // shows as a recent empty assistant placeholder. Keep it visible with a
  // "working" indicator (see pendingReplyId) instead of filtering it out — that
  // filtering was what made everything "disappear" on return.
  const lastMsgForPending = messages[messages.length - 1];
  const pendingReplyId =
    isPendingAssistantReply(messages) &&
    lastMsgForPending &&
    // Only when the client is NOT streaming this reply — i.e. a genuine reconnect
    // (navigated away and back), not normal live generation.
    streamingContent[lastMsgForPending.id] === undefined &&
    !streamingThisConv
      ? lastMsgForPending.id
      : null;

  // Resume the LIVE deep-research activity feed after a reconnect. While a reply
  // is pending server-side (not being streamed here), poll the buffered progress
  // and feed it into the same DeepResearchBanner — so returning shows the real
  // "reading N sources / M searches" feed, not just a spinner. Stops as soon as
  // the reply is no longer pending (its content landed via the messages poll).
  useEffect(() => {
    if (!currentConversationId || pendingReplyId == null) {
      setResumedResearch(prev => (Object.keys(prev).length ? {} : prev));
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const data: any = await apiRequest(
          `/api/chat/conversations/${currentConversationId}/research-progress`
        );
        if (cancelled) return;
        if (data && data.active && Array.isArray(data.steps)) {
          setResumedResearch({
            [pendingReplyId]: {
              active: true,
              phase: data.phase,
              steps: data.steps,
              sources: Array.isArray(data.sources) ? data.sources : [],
              sourceCount: Number(data.sourceCount) || 0,
              searchCount: Number(data.searchCount) || 0,
            },
          });
        } else {
          setResumedResearch(prev => (Object.keys(prev).length ? {} : prev));
        }
      } catch {
        /* ignore — fall back to the plain working indicator */
      }
    };
    poll();
    const t = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentConversationId, pendingReplyId]);

  // Resume the LIVE partial ANSWER TEXT after a reconnect (navigated away /
  // reopened the app mid-generation). While a reply is pending server-side and
  // we're not streaming it locally, poll the buffered partial text and show it
  // building live — so a returning user sees the real in-progress answer, not a
  // generic spinner. Stops the instant the finished reply lands (pending clears).
  useEffect(() => {
    if (!currentConversationId || pendingReplyId == null) {
      setResumedPartial(prev => (Object.keys(prev).length ? {} : prev));
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const data: any = await apiRequest(
          `/api/chat/conversations/${currentConversationId}/generation-state`
        );
        if (cancelled) return;
        if (data && data.active && typeof data.content === 'string' && data.content.trim()) {
          setResumedPartial({ [pendingReplyId]: data.content });
        } else {
          setResumedPartial(prev => (Object.keys(prev).length ? {} : prev));
        }
      } catch {
        /* ignore — fall back to the plain working indicator */
      }
    };
    poll();
    const t = setInterval(poll, 1200);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentConversationId, pendingReplyId]);

  // Resume the LIVE image-generation/editing card after a reconnect (refreshed or
  // reopened the app while an image tool was running). While the reply is pending
  // server-side and we're not streaming it locally, poll the buffered image state
  // and re-show the SAME animated card — so a returning user sees "generating your
  // image…" instead of a blank spinner. Stops the instant the reply lands.
  useEffect(() => {
    if (!currentConversationId || pendingReplyId == null) {
      setResumedImage(prev => (Object.keys(prev).length ? {} : prev));
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const data: any = await apiRequest(
          `/api/chat/conversations/${currentConversationId}/image-progress`
        );
        if (cancelled) return;
        if (data && data.active) {
          setResumedImage({
            [pendingReplyId]: {
              kind: 'image',
              status: data.status || 'generating',
              operation: data.operation || 'generation',
              subject: data.subject || '',
            },
          });
        } else {
          setResumedImage(prev => (Object.keys(prev).length ? {} : prev));
        }
      } catch {
        /* ignore — fall back to the plain working indicator */
      }
    };
    poll();
    const t = setInterval(poll, 1500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentConversationId, pendingReplyId]);

  // Resume the LIVE video-editor card after a reconnect (refreshed or reopened the
  // app while the video_editor tool was running). While the reply is pending
  // server-side and we're not streaming it locally, poll the buffered edit state
  // and re-show the SAME animated card — so a returning user sees "editing your
  // video…" (phase/percent) instead of a blank spinner. Stops when the reply lands.
  useEffect(() => {
    if (!currentConversationId || pendingReplyId == null) {
      setResumedVideoEditor(prev => (Object.keys(prev).length ? {} : prev));
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const data: any = await apiRequest(
          `/api/chat/conversations/${currentConversationId}/video-editor-progress`
        );
        if (cancelled) return;
        if (data && data.active) {
          setResumedVideoEditor({
            [pendingReplyId]: {
              kind: 'video_editor',
              status: data.status || 'preparing',
              subject: data.subject || '',
              phase: data.phase,
              percent: typeof data.percent === 'number' ? data.percent : undefined,
            },
          });
        } else {
          setResumedVideoEditor(prev => (Object.keys(prev).length ? {} : prev));
        }
      } catch {
        /* ignore — fall back to the plain working indicator */
      }
    };
    poll();
    const t = setInterval(poll, 1500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentConversationId, pendingReplyId]);

  // Drive the resume grace window. On becoming pending, hold the generic "Working
  // on it…" line until ALL resume probes (image / research / partial) have
  // actually RETURNED — so a resumed card/banner/partial always wins the race and
  // never flashes in after "Working on it…", regardless of connection speed. The
  // separate effect below flips it early the instant any resume DATA lands; a
  // safety timeout guarantees we never hold the indicator hostage if a request
  // hangs. Applies uniformly to image generation, deep research, and plain text.
  useEffect(() => {
    if (pendingReplyId == null || !currentConversationId) {
      setResumeProbed(false);
      return;
    }
    setResumeProbed(false);
    let cancelled = false;
    const probe = async () => {
      try {
        await Promise.allSettled([
          apiRequest(`/api/chat/conversations/${currentConversationId}/image-progress`),
          apiRequest(`/api/chat/conversations/${currentConversationId}/research-progress`),
          apiRequest(`/api/chat/conversations/${currentConversationId}/generation-state`),
          apiRequest(`/api/chat/conversations/${currentConversationId}/video-editor-progress`),
        ]);
      } finally {
        if (!cancelled) setResumeProbed(true);
      }
    };
    probe();
    // Safety ceiling: never hold the indicator more than ~1.5s even if a probe hangs.
    const t = setTimeout(() => {
      if (!cancelled) setResumeProbed(true);
    }, 1500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [pendingReplyId, currentConversationId]);

  useEffect(() => {
    if (pendingReplyId == null) return;
    if (
      resumedImage[pendingReplyId] ||
      resumedResearch[pendingReplyId] ||
      resumedPartial[pendingReplyId] ||
      resumedVideoEditor[pendingReplyId]
    ) {
      setResumeProbed(true);
    }
  }, [pendingReplyId, resumedImage, resumedResearch, resumedPartial, resumedVideoEditor]);
  if (!postAgentActive) {
    displayMessages = displayMessages.filter(
      m =>
        m.id === pendingReplyId ||
        // Never drop a turn that failed or was stopped — even with no text it
        // must stay so the header can show "Response failed" / "Stopped"
        // (otherwise a failed reply vanishes on refresh).
        !!(m as any).deliveryStatus ||
        !(
          m.role === 'assistant' &&
          (!m.content || !m.content.trim()) &&
          streamingContent[m.id] === undefined
        )
    );
  }

  // Clear optimistic messages once real messages load — but NOT while the post
  // agent is mid-flow (its UI lives entirely in optimistic messages).
  useEffect(() => {
    if (
      !postAgentActive &&
      !uploadingOptimisticRef.current &&
      currentConversationId &&
      messages.length > 0 &&
      optimisticMessages.length > 0
    ) {
      setOptimisticMessages([]);
    }
  }, [postAgentActive, currentConversationId, messages.length, optimisticMessages.length]);

  // Clear a streaming buffer ONCE its persisted content has landed in the cache.
  // Skip while THIS conversation is still generating — otherwise a regenerate
  // (which streams into a message that already has old content) would be cleared
  // mid-stream and the live text would jump to the bottom placeholder.
  useEffect(() => {
    if (currentConversationId && messages.length > 0 && !generatingConvIds[currentConversationId]) {
      Object.keys(streamingContent).forEach(id => {
        const numId = parseInt(id);
        const real = messages.find(m => m.id === numId);
        if (real?.content?.trim()) clearStreamingContent(numId);
      });
    }
  }, [currentConversationId, messages, streamingContent, clearStreamingContent, generatingConvIds]);

  // Inject streaming placeholders into the display list — ONLY for messages that
  // definitively belong to the conversation on screen (exact match; an unknown or
  // other-conversation stream is never injected), so an in-flight reply in another
  // chat can't bleed into this one during multi-tasking.
  Object.keys(streamingContent).forEach(id => {
    const numId = parseInt(id);
    if (streamingConvId[numId] !== currentConversationId) return;
    if (!displayMessages.some(m => m.id === numId)) {
      displayMessages.push({
        id: numId,
        conversationId: currentConversationId || 0,
        role: 'assistant',
        content: '',
        tokensUsed: 0,
        createdAt: new Date(),
      });
    }
  });

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
    const byId = new Map<number, ChatMessage>();
    for (const m of displayMessages) {
      const existing = byId.get(m.id);
      if (!existing) {
        byId.set(m.id, m);
        continue;
      }
      // Same id seen twice → keep the one with real content (or the streaming
      // target if this id is actively streaming), so we never drop the live reply.
      const existingHasContent = !!existing.content?.trim();
      const currentHasContent = !!m.content?.trim();
      if (!existingHasContent && currentHasContent) byId.set(m.id, m);
    }
    displayMessages = Array.from(byId.values());
  }

  // Hard conversation-scope guard: only ever render messages that belong to the
  // conversation on screen (or not-yet-persisted optimistic ones with no convId).
  // This guarantees a reply from another chat can never visually bleed in, even
  // if a cache write slipped through during concurrent multi-tasking streams.
  if (currentConversationId) {
    displayMessages = displayMessages.filter(
      m => !m.conversationId || m.conversationId === currentConversationId
    );
  }

  // Resume: show the buffered live partial answer on the pending reply (from the
  // server generation-state poll) so a returning user sees the real in-progress
  // text, not a blank spinner. Only fills an otherwise-empty pending message.
  if (pendingReplyId != null && resumedPartial[pendingReplyId]) {
    displayMessages = displayMessages.map(m =>
      m.id === pendingReplyId && !(m.content && m.content.trim())
        ? { ...m, content: resumedPartial[pendingReplyId] }
        : m
    );
  }

  // Same for a resumed image-generation card: re-attach the buffered live card to
  // the pending reply so a returning user sees the animated "generating…" surface
  // (not a blank spinner) until the finished image lands via the messages poll.
  if (pendingReplyId != null && resumedImage[pendingReplyId]) {
    displayMessages = displayMessages.map(m =>
      m.id === pendingReplyId && !(m as any).liveImageCard
        ? { ...m, liveImageCard: resumedImage[pendingReplyId] }
        : m
    );
  }

  // Same for a resumed video-editor card: re-attach the buffered live card to the
  // pending reply so a returning user sees the animated "editing…" surface (phase/
  // percent) instead of a blank spinner until the finished video lands.
  if (pendingReplyId != null && resumedVideoEditor[pendingReplyId]) {
    displayMessages = displayMessages.map(m =>
      m.id === pendingReplyId && !(m as any).liveVideoEditorCard
        ? { ...m, liveVideoEditorCard: resumedVideoEditor[pendingReplyId] }
        : m
    );
  }

  // Collapse TRUE adjacent duplicate assistant replies — identical non-empty
  // text with NO distinguishing cards — which can occur if the orchestrator
  // persisted the same reply twice (the "two VeeGPT · Response ready" bug). This
  // never drops a card-bearing message or two genuinely different replies.
  {
    const hasCards = (x: any) =>
      !!(
        x?.postCard ||
        x?.listCard ||
        x?.editCards?.length ||
        x?.infoCards?.length ||
        x?.autopilotCard ||
        x?.liveImageCard ||
        x?.liveVideoEditorCard
      );
    const collapsed: ChatMessage[] = [];
    for (const m of displayMessages) {
      const prev = collapsed[collapsed.length - 1] as any;
      if (
        prev &&
        prev.role === 'assistant' &&
        m.role === 'assistant' &&
        !!m.content?.trim() &&
        prev.content?.trim() === m.content.trim() &&
        !hasCards(prev) &&
        !hasCards(m)
      ) {
        // Keep the later record (usually the persisted one) — replace prev.
        collapsed[collapsed.length - 1] = m;
        continue;
      }
      collapsed.push(m);
    }
    displayMessages = collapsed;
  }

  // The generating state for the CURRENTLY VIEWED conversation only. This is what
  // enables multi-tasking: a chat that isn't streaming shows Send (you can fire
  // a new message) even while another chat is still streaming in the background.
  const viewGenerating = currentConversationId
    ? !!generatingConvIds[currentConversationId]
    : isGenerating || newChatPending;

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
      queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations'] });
    },
  });

  // ── Attachment handlers ───────────────────────────────────────────────────
  // Accepted types come from shared/attachment-support.ts, the same list the
  // server validates against.
  const addAttachments = (files: FileList | File[]) => {
    const picked = Array.from(files);
    setPendingFiles(prev => {
      const { accepted, rejected } = validateAttachments(picked, prev.length);

      // Tell the user WHY a file was dropped. The previous code filtered silently,
      // so picking a HEIC did nothing at all: no attachment, no message, and a
      // send with no text then bailed out — which read as the chat dying.
      setAttachmentError(
        rejected.length
          ? rejected.map(r => `${r.name}: ${r.reason}`).join('\n')
          : null
      );

      const merged = [...prev];
      for (const f of accepted) {
        // Avoid obvious dupes by name+size.
        if (!merged.some(m => m.name === f.name && m.size === f.size)) merged.push(f);
      }
      return merged;
    });
  };
  const removeAttachment = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };
  /** Read a File into { mimeType, data(base64), name }. */
  const fileToAttachment = (
    file: File
  ): Promise<{ mimeType: string; data: string; name: string }> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const comma = result.indexOf(',');
        resolve({
          mimeType: file.type,
          data: comma !== -1 ? result.slice(comma + 1) : result,
          name: file.name,
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  // Upload a file to object storage and return its opaque KEY. This is the
  // storage-key path (same as the mobile app): the server reads the key and
  // feeds the model inline (small) or via the Gemini Files API (large video/PDF),
  // instead of shipping base64 over the wire. Returns null on failure so the
  // caller can fall back to base64 for that one file.
  const uploadFileToKey = async (file: File): Promise<string | null> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const form = new FormData();
        form.append('file', file);
        const up = await apiRequest('/api/chat/attachments/upload', {
          method: 'POST',
          body: form,
        });
        if (up?.key) return String(up.key);
      } catch (err) {
        console.error('[VeeGPT] attachment key upload attempt failed', attempt, err);
      }
    }
    return null;
  };

  /** Capture a static poster frame (data URL) from a video File so chat shows a
   *  still thumbnail instead of a playable-looking clip. Falls back to null.
   *  Robust across browsers (incl. Safari): mounts an off-screen video, waits
   *  for a decodable frame, seeks, then draws to a canvas. */
  const videoPosterFromFile = (file: File): Promise<string | null> =>
    new Promise(resolve => {
      let url: string | null = null;
      let done = false;
      const video = document.createElement('video');
      const cleanup = () => {
        try {
          video.removeAttribute('src');
          video.load();
        } catch {}
        try {
          if (video.parentNode) video.parentNode.removeChild(video);
        } catch {}
        if (url) {
          try {
            URL.revokeObjectURL(url);
          } catch {}
          url = null;
        }
      };
      const finish = (result: string | null) => {
        if (done) return;
        done = true;
        cleanup();
        resolve(result);
      };
      try {
        url = URL.createObjectURL(file);
        video.muted = true;
        (video as any).playsInline = true;
        video.preload = 'auto';
        video.crossOrigin = 'anonymous';
        // Off-screen but in the DOM — Safari needs an attached element to decode.
        video.style.position = 'fixed';
        video.style.left = '-10000px';
        video.style.top = '0';
        video.style.width = '2px';
        video.style.height = '2px';
        video.style.opacity = '0';
        video.style.pointerEvents = 'none';
        document.body.appendChild(video);
        video.src = url;

        const capture = () => {
          try {
            const w = video.videoWidth || 320;
            const h = video.videoHeight || 320;
            if (!w || !h) return; // no decoded frame yet
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) return finish(null);
            ctx.drawImage(video, 0, 0, w, h);
            const data = canvas.toDataURL('image/jpeg', 0.7);
            // A fully-black/empty frame is ~tiny; if so, treat as failure.
            finish(data && data.length > 1000 ? data : null);
          } catch {
            finish(null);
          }
        };

        // Prefer requestVideoFrameCallback — it fires ONLY when a real frame is
        // actually painted, which is the reliable signal across codecs/browsers
        // that drawImage will produce a non-black thumbnail. We let the video
        // play (muted) for a frame, grab it, then pause.
        const anyVideo = video as any;
        const grabViaRVFC = () => {
          try {
            anyVideo.requestVideoFrameCallback(() => {
              capture();
              try {
                video.pause();
              } catch {}
            });
          } catch {
            // Older browsers: fall back to a timed capture after play starts.
            setTimeout(() => {
              if (!done) capture();
            }, 250);
          }
        };

        video.onloadedmetadata = () => {
          // Seek slightly past the start so we skip a black leading keyframe.
          const t = Math.min(0.1, (video.duration || 1) / 2);
          try {
            video.currentTime = t;
          } catch {}
          if (typeof anyVideo.requestVideoFrameCallback === 'function') grabViaRVFC();
        };
        // Once a real frame is decoded after seeking, capture it.
        video.onseeked = () => {
          if (typeof anyVideo.requestVideoFrameCallback === 'function') grabViaRVFC();
          else capture();
        };
        video.onerror = () => finish(null);
        // Kick decoding (muted playback is allowed and forces a frame to render).
        video
          .play()
          .then(() => {
            if (typeof anyVideo.requestVideoFrameCallback === 'function') grabViaRVFC();
          })
          .catch(() => {
            // Autoplay blocked — seek will still fire onseeked above.
          });
        setTimeout(() => finish(null), 6000);
      } catch {
        finish(null);
      }
    });

  // ── Handlers ──────────────────────────────────────────────────────────────

  // While we prepare a post (parse → upload image → generate caption/hashtags), we
  // show a shimmering assistant message in the chat.
  const [preparingMessageId, setPreparingMessageId] = useState<number | null>(null);
  const [preparingStatus, setPreparingStatus] = useState<string>('');
  const postConvIdRef = useRef<number | null>(null);
  // Last plain-text message sent, for one-tap Retry after a provider failure.
  const lastUserTextRef = useRef<string>('');

  // ── Post Agent (AI-driven, no composer) ───────────────────────────────────
  // The agent reasons in chat: it asks for what it needs and, when ready, shows
  // an inline one-tap confirm card. We keep the running agent conversation, the
  // uploaded media URLs, and the current ready-plan here.
  // (postAgentActive is declared above with the main page state.)
  const postAgentMsgsRef = useRef<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const postMediaUrlsRef = useRef<string[]>([]);
  // Whether any uploaded media in this post is a video (→ reel).
  const postHasVideoRef = useRef<boolean>(false);
  // Per-message persisted cards (keyed by assistant message id) so the inline
  // confirm card survives refresh and renders from chat history.
  const [postCardByMsg, setPostCardByMsg] = useState<
    Record<
      number,
      {
        plan: any;
        mediaUrls: string[];
        status: 'idle' | 'working' | 'done' | 'error';
        resultText?: string;
      }
    >
  >({});
  // Maps an optimistic assistant message id → the real persisted server message
  // id, so confirm/cancel can update the correct stored card (avoids 404s).
  const postCardServerIdRef = useRef<Record<number, number>>({});
  // Live edit-card state keyed by `${messageId}:${cardId}` (status while applying/after).
  const [editCardByMsg, setEditCardByMsg] = useState<
    Record<string, { status: 'idle' | 'working' | 'done' | 'error'; resultText?: string }>
  >({});

  /** Confirm or cancel ONE inline edit card → applies the change server-side. */
  const applyEdit = async (
    msgId: number,
    cardId: string | undefined,
    action: 'confirm' | 'cancel'
  ) => {
    const key = `${msgId}:${cardId || ''}`;
    setEditCardByMsg(prev => ({ ...prev, [key]: { status: 'working' } }));
    try {
      const r = await apiRequest(`/api/chat/messages/${msgId}/apply-edit`, {
        method: 'POST',
        body: JSON.stringify({
          action,
          cardId,
          workspaceId: currentWorkspaceId,
          localNow: localNowStr(),
        }),
      });
      setEditCardByMsg(prev => ({
        ...prev,
        [key]: { status: (r?.status as any) || 'done', resultText: r?.resultText },
      }));
      if (currentConversationId)
        queryClient.invalidateQueries({
          queryKey: ['/api/chat/conversations', currentConversationId, 'messages'],
        });
    } catch (e: any) {
      setEditCardByMsg(prev => ({
        ...prev,
        [key]: { status: 'error', resultText: e?.message || 'Could not apply the change' },
      }));
    }
  };

  /**
   * "Continue with Fast" (spec §43). The user chose to run the refused message on
   * the Light model. This is an explicit decision, not a silent swap — it only
   * ever runs because the user clicked. Clears the refusal and replays.
   */
  const handleContinueWithFast = async () => {
    const replay = continueWithFastRef.current;
    if (!replay) return;
    setRefusal(null);
    continueWithFastRef.current = null;
    setContinuingWithFast(true);
    try {
      await replay();
    } catch (err) {
      const anyErr = err as any;
      // Even Fast can be refused by the burst/monthly budget — no model helps
      // then, so fall back to the plain limit notice.
      if (anyErr?.rateLimited || anyErr?.canContinueWithFast) {
        setLimitNotice({
          message: anyErr.message || 'You have reached your VeeGPT usage limit.',
          upgrade: anyErr.upgrade === true,
        });
      }
    } finally {
      setContinuingWithFast(false);
      queryClient.invalidateQueries({ queryKey: ['/api/chat/limits'] });
    }
  };

  const handleSendMessage = async (overrideText?: string) => {
    // `overrideText` lets UI affordances (e.g. tapping an image in the media
    // picker) send a message programmatically. Guarded with a typeof check so
    // existing handlers wired as onClick/onSendMessage (which pass an event)
    // fall back to the composer's input text.
    const content = (typeof overrideText === 'string' ? overrideText : inputText).trim();
    const filesToSend = typeof overrideText === 'string' ? [] : pendingFiles;
    if (!content && filesToSend.length === 0) return;
    // A fresh send supersedes any pending refusal.
    setRefusal(null);
    continueWithFastRef.current = null;

    const hasMediaPending = filesToSend.some(
      f => f.type.startsWith('image/') || f.type.startsWith('video/')
    );

    // ─── ROUTING ─────────────────────────────────────────────────────────────
    // Attaching media used to force the post-agent flow unconditionally, on the
    // theory that media == posting intent. It isn't: "what is this logo?" with an
    // image attached answered "what date should I schedule it for?", and the image
    // never reached a vision model at all — the post-agent uploads to storage
    // instead of passing pixels to the LLM.
    //
    // So route on INTENT instead:
    //   • already mid post-flow, or the text actually asks to post → post-agent
    //   • otherwise → normal streaming chat WITH the attachments, so the model
    //     sees the image/PDF/VIDEO and keeps the conversation's context. Video is
    //     uploaded to storage and analysed via the Gemini Files API server-side.
    const wantsToPost = POSTING_INTENT.test(content);
    // Mid-scheduling signal: if the assistant's most recent reply asked the user
    // to attach media (or gave a schedule time and is waiting on the image), then
    // an image the user attaches next IS for the post — even if this message's
    // text has no posting keyword (e.g. just "tomorrow 6pm"). Without this the
    // image would go down the plain-attachment (vision) path and never be
    // uploaded to hosting, so schedule_post would keep seeing "no media".
    // Broadened to catch EVERY posting/scheduling ask (both the deterministic
    // server prompts AND free-form LLM ones), and scanned across the recent
    // assistant turns — NOT just the last one — because a caption request (or
    // any aside) can land between the scheduling ask and the media upload. If we
    // only checked the last message, an image attached right after "here are 3
    // captions" would wrongly go down the vision path and never reach hosting,
    // so schedule_post would keep seeing "no media" (exactly the lost-media bug).
    const AWAIT_POST_MEDIA_RE =
      /attach the (image|video|photo|media)|please attach|when to publish|where to publish|what date and time should i schedule|for the post we were preparing|to get this (scheduled|posted)|which account to post to|feed post, a reel, or a story|ready to (post|schedule)|i just need you to/i;
    const recentAssistantMsgs = [...messages, ...optimisticMessages]
      .filter(
        (m: any) => m?.role === 'assistant' && typeof m?.content === 'string'
      )
      .slice(-5) as any[];
    const awaitingPostMedia = recentAssistantMsgs.some(m =>
      AWAIT_POST_MEDIA_RE.test(m.content)
    );
    // Image-EDIT intent: when the user attaches an image AND asks to change it
    // (edit/remove background/relight/expand/add logo/etc.), route it through the
    // hosting-upload path so the image becomes a hosted URL and the edit_image
    // tool receives it. Without this the image would go down the vision path
    // (tools disabled) and editing could never run. Only matters when an image
    // is actually attached, so broad matching is safe.
    const IMAGE_EDIT_INTENT =
      /\b(edit|retouch|enhance|remove|erase|replace|swap|change|recolou?r|re-?colou?r|restyle|background|relight|lighting|cinematic|studio|upscale|expand|extend|reframe|add (a |my )?(logo|text|watermark|background)|make (it|this|the)|turn (it|this) into|blur|sharpen)\b/i
    const wantsImageEdit = IMAGE_EDIT_INTENT.test(content)
    // Video no longer forces the post-agent. The storage-key path now uploads a
    // video to S3 and the server analyses it via the Gemini Files API (same as
    // mobile), so "tell me about this video" streams a real answer in normal
    // chat. Video still routes to the post-agent when the intent is to POST/edit
    // it (covered by the hasMediaPending clause below, since that includes video).
    const enterPostAgent =
      postAgentActive ||
      (hasMediaPending && (wantsToPost || awaitingPostMedia || wantsImageEdit));

    // Re-entrancy lock for NEW-chat creation only: a single send action must not
    // spawn two conversations (double Enter/click before state updates). This is
    // NOT a global "is generating" block — sends to existing/idle chats are still
    // allowed concurrently, so multi-tasking works.
    const willCreateNewChat = !currentConversationId && !enterPostAgent;
    if (willCreateNewChat) {
      if (creatingChatRef.current) return;
      creatingChatRef.current = true;
      setNewChatPending(true);
    }
    if (enterPostAgent) {
      const mediaFiles = filesToSend.filter(
        f => f.type.startsWith('image/') || f.type.startsWith('video/')
      );
      const hasVideo = mediaFiles.some(f => f.type.startsWith('video/'));
      // Local preview URLs so a thumbnail shows the INSTANT the message sends
      // (before the hosted URL arrives). Swapped for hosted URLs after upload.
      const localAttachments = filesToSend
        .map(f => ({
          name: f.name,
          mimeType: f.type,
          url:
            f.type.startsWith('image/') || f.type.startsWith('video/')
              ? URL.createObjectURL(f)
              : undefined,
        }))
        .filter(a => a.url) as {
        name: string;
        mimeType: string;
        url: string;
        posterUrl?: string;
      }[];

      setInputText('');
      if (textareaRef.current) textareaRef.current.value = '';
      setPendingFiles([]);
      setHasSentFirstMessage(true);
      setPostAgentActive(true);

      // ONE client-generated id shared by the optimistic bubble, the cache entry,
      // and the persisted server record — so they all collapse to a single bubble
      // (no duplicates) and the media renders straight from the messages cache,
      // ChatGPT-style (survives refresh; never disappears/reappears).
      const userMsgId = Date.now();
      const prepId = userMsgId + 1;
      const convId = postConvIdRef.current || currentConversationId;

      // Show the user's message + a shimmering assistant placeholder during the
      // brief upload window. (postAgentActive keeps this optimistic thread
      // visible without the messages refetch clobbering it.)
      setOptimisticMessages(prev => [
        ...prev,
        {
          id: userMsgId,
          conversationId: convId || 0,
          role: 'user',
          content: content || ' ',
          attachments: localAttachments.length ? (localAttachments as any) : undefined,
          tokensUsed: 0,
          createdAt: new Date(),
        },
        {
          id: prepId,
          conversationId: convId || 0,
          role: 'assistant',
          content: '',
          tokensUsed: 0,
          createdAt: new Date(),
        },
      ]);
      setPreparingMessageId(prepId);
      setPreparingStatus(
        hasVideo
          ? 'Uploading your video…'
          : mediaFiles.length
            ? 'Uploading your image…'
            : 'Thinking…'
      );

      // Generate static poster frames for video attachments → patch the bubble.
      filesToSend.forEach((f, idx) => {
        if (!f.type.startsWith('video/')) return;
        videoPosterFromFile(f).then(poster => {
          if (!poster) return;
          setOptimisticMessages(prev =>
            prev.map(m => {
              if (m.id !== userMsgId || !m.attachments) return m;
              const next = m.attachments.map((a, i) =>
                i === idx ? { ...a, posterUrl: poster } : a
              );
              return { ...m, attachments: next as any };
            })
          );
        });
      });

      try {
        // Upload media → hosted URLs via the chat attachment endpoint (S3 + CloudFront).
        // The attachment endpoint stores files in the same private bucket as AI images
        // and returns a durable proxy URL that persists across reloads, so the user's
        // message bubble always shows the real thumbnail.
        if (mediaFiles.length) {
          // Capture the real server error (size/type/etc.) so a failed video
          // upload reports exactly why, instead of a generic "too large".
          let lastUploadError: string | null = null;
          const uploadOne = async (f: File): Promise<string | null> => {
            for (let attempt = 0; attempt < 2; attempt++) {
              try {
                const form = new FormData();
                form.append('file', f);
                const up = await apiRequest('/api/chat/attachments/upload', {
                  method: 'POST',
                  body: form,
                });
                // Returns { url (proxy path), absoluteUrl (full URL for scheduling), key, mimeType, name }
                // For mediaUrls sent to the scheduler (which needs a fetchable URL),
                // use absoluteUrl. For display, the relative proxy path is fine.
                const url = up?.absoluteUrl || up?.url;
                if (url) return url.startsWith('http') ? url : `${window.location.origin}${url}`;
              } catch (err) {
                // apiRequest throws `"<status>: <statusText> - <body>"`; extract
                // the server's JSON `{ error }` message when present.
                const raw = err instanceof Error ? err.message : String(err);
                const match = raw.match(/\{\s*"error"\s*:\s*"([^"]+)"/);
                lastUploadError = match?.[1] || raw;
                console.error('[VeeGPT] attachment upload attempt failed', attempt, err);
              }
            }
            return null;
          };
          const uploaded = (await Promise.all(mediaFiles.map(uploadOne))).filter(
            Boolean
          ) as string[];
          postMediaUrlsRef.current = uploaded;
          if (hasVideo && uploaded.length) postHasVideoRef.current = true;

          // Upload failed entirely → tell the user (keep the bubble), don't stream.
          if (!uploaded.length) {
            setPreparingMessageId(null);
            const kind = hasVideo ? 'video' : 'image';
            const errText = lastUploadError
              ? `I couldn't upload that ${kind}: ${lastUploadError}`
              : `I couldn't upload that ${kind} — it may be too large or an unsupported format. Could you try attaching it again?`;
            if (convId) {
              // Existing conversation: write the bubble + error into the cache so
              // they render from the canonical thread (optimistic isn't shown for
              // a persisted conversation).
              queryClient.setQueryData(
                ['/api/chat/conversations', convId, 'messages'],
                (old: any) => {
                  const list = Array.isArray(old) ? old : [];
                  const next = list.some((m: any) => m.id === userMsgId)
                    ? list
                    : [
                        ...list,
                        {
                          id: userMsgId,
                          conversationId: convId,
                          role: 'user',
                          content: content || ' ',
                          attachments: localAttachments.length ? localAttachments : undefined,
                          tokensUsed: 0,
                          createdAt: new Date().toISOString(),
                        },
                      ];
                  return [
                    ...next,
                    {
                      id: prepId,
                      conversationId: convId,
                      role: 'assistant',
                      content: errText,
                      tokensUsed: 0,
                      createdAt: new Date().toISOString(),
                    },
                  ];
                }
              );
              setOptimisticMessages(prev =>
                prev.filter(m => m.id !== prepId && m.id !== userMsgId)
              );
              setPostAgentActive(false);
            } else {
              // No conversation yet: keep the optimistic thread visible with the error.
              setOptimisticMessages(prev =>
                prev.map(m => (m.id === prepId ? { ...m, content: errText } : m))
              );
            }
            return;
          }
        }

        // Build the optimistic attachments WITH hosted URLs (+ preserved posters)
        // for the streaming hook so the bubble is identical before/after handoff.
        const posterByIdx: Record<number, string | undefined> = {};
        setOptimisticMessages(prev => {
          const u = prev.find(m => m.id === userMsgId);
          u?.attachments?.forEach((a: any, i) => {
            posterByIdx[i] = a.posterUrl;
          });
          return prev;
        });
        const hostedAttachments = mediaFiles
          .map((f, i) => ({
            name: f.name,
            mimeType: f.type,
            // Prefer the hosted URL (S3 upload); fall back to the local object URL
            // so the bubble always shows the image even when the upload to
            // /api/video/upload-image is skipped or fails (chat-only attachments
            // sent as base64 never need a hosted URL for the image to render).
            url: postMediaUrlsRef.current[i] ?? localAttachments[i]?.url,
            posterUrl: posterByIdx[i],
          }))
          .filter(a => a.url);

        const nowDate = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        const localNow = `${nowDate.getFullYear()}-${pad(nowDate.getMonth() + 1)}-${pad(nowDate.getDate())}T${pad(nowDate.getHours())}:${pad(nowDate.getMinutes())}`;
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

        setPreparingMessageId(null);

        if (convId) {
          // EXISTING conversation: seed the user bubble (hosted media) into the
          // canonical messages cache, then drop the optimistic thread. The cache
          // now owns the bubble (no gap), and the streaming hook renders the
          // assistant reply + any confirm card into the same cache.
          if (currentConversationId !== convId) setCurrentConversationId(convId);
          queryClient.setQueryData(['/api/chat/conversations', convId, 'messages'], (old: any) => {
            const list = Array.isArray(old) ? old : [];
            if (list.some((m: any) => m.id === userMsgId)) return list;
            return [
              ...list,
              {
                id: userMsgId,
                conversationId: convId,
                role: 'user',
                content: content || ' ',
                attachments: hostedAttachments.length ? hostedAttachments : undefined,
                tokensUsed: 0,
                createdAt: new Date().toISOString(),
              },
            ];
          });
          setOptimisticMessages(prev => prev.filter(m => m.id !== prepId && m.id !== userMsgId));
          setPostAgentActive(false);
          await wsSendMessage(convId, content, currentWorkspaceId || undefined, [], {
            seedOptimistic: false,
            includeWorkspaceContext: true,
            enableTools: true,
            localNow,
            timezone,
            userMessageId: userMsgId,
            mediaUrls: postMediaUrlsRef.current,
          });
        } else {
          // NEW conversation: keep the optimistic user bubble visible (no convId
          // yet) and stream. createAndStream seeds the cache (same userMsgId) on
          // the conversation event; the server persists the hosted media on that
          // record so it survives refresh. Clear optimistic once we have the id.
          setOptimisticMessages(prev => prev.filter(m => m.id !== prepId));
          const result = await createAndStream(content, currentWorkspaceId || undefined, [], {
            enableTools: true,
            localNow,
            timezone,
            userMessageId: userMsgId,
            optimisticAttachments: hostedAttachments as any,
            mediaUrls: postMediaUrlsRef.current,
            onConversation: cid => {
              setCurrentConversationId(cid);
              setOptimisticMessages([]);
            },
          });
          if (result?.conversationId) {
            // Don't switch the view on completion (onConversation already did at
            // creation) — only track the id for the post flow and refresh the list.
            postConvIdRef.current = result.conversationId;
            queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations'], exact: true });
          }
        }
      } catch (e) {
        console.error('[VeeGPT] media post flow error', e);
        setPreparingMessageId(null);
        const anyErr = e as any;
        if (anyErr?.rateLimited) {
          // Usage limit hit mid post-flow — show the notice and a clear inline
          // message instead of the generic "snag" text.
          setLimitNotice({
            message: anyErr.message || 'You have reached your VeeGPT usage limit.',
            upgrade: anyErr.upgrade === true,
          });
          setOptimisticMessages(prev =>
            prev.map(m =>
              m.id === prepId
                ? { ...m, content: anyErr.message || 'You have reached your VeeGPT usage limit.' }
                : m
            )
          );
        } else {
          setOptimisticMessages(prev =>
            prev.map(m =>
              m.id === prepId
                ? { ...m, content: 'I hit a snag — please try again in a moment.' }
                : m
            )
          );
        }
        setPostAgentActive(false);
      } finally {
        setPostAgentActive(false);
        postMediaUrlsRef.current = [];
        postHasVideoRef.current = false;
      }
      return;
    }

    setInputText('');
    if (textareaRef.current) textareaRef.current.value = '';
    setPendingFiles([]);

    // Remember the last plain-text message so a failed (rate-limited) turn can
    // be retried with one tap.
    lastUserTextRef.current = content;

    isGeneratingRef.current = true;

    try {
      const displayContent = content || ' ';
      // Local object URLs so the attachment renders as a real thumbnail in the
      // user's bubble the INSTANT they hit send — BEFORE the (possibly slow)
      // storage upload — exactly like the mobile optimistic bubble. Images/videos
      // get a preview URL; PDFs fall back to a chip.
      const attachMeta = filesToSend.map(f => ({
        name: f.name,
        mimeType: f.type,
        ...(f.type.startsWith('image/') || f.type.startsWith('video/')
          ? { url: URL.createObjectURL(f) }
          : {}),
      }));
      // ONE client-generated id shared by the optimistic bubble AND the persisted
      // record (via userMessageId) so they collapse to a single bubble (dedup by id).
      const userMsgId = Date.now();

      // Show the user bubble with its attachment(s) immediately, then upload in
      // the background. The uploadingOptimisticRef flag keeps this bubble alive
      // (the "clear optimistic" effect won't nuke it mid-upload).
      if (filesToSend.length) uploadingOptimisticRef.current = true;
      const optimisticBubble: ChatMessage = {
        id: userMsgId,
        conversationId: currentConversationId || 0,
        role: 'user',
        content: displayContent,
        attachments: attachMeta.length ? (attachMeta as any) : undefined,
        tokensUsed: 0,
        createdAt: new Date(),
      };
      if (!currentConversationId) {
        setOptimisticMessages([optimisticBubble]);
        setHasSentFirstMessage(true);
      } else {
        setOptimisticMessages(prev => [...prev, optimisticBubble]);
      }

      // Storage-key path (matches mobile): upload each file to S3 first and send
      // opaque KEYS via `attachmentIds`. The server routes them through the
      // Gemini Files API (large video/PDF) or inline (small) — no base64 over the
      // wire, no 20MB inline ceiling. Any file that fails to upload falls back to
      // base64 so a send never silently drops an attachment.
      const attachmentIds: string[] = [];
      const attachments: { mimeType: string; data: string; name: string }[] = [];
      await Promise.all(
        filesToSend.map(async f => {
          const key = await uploadFileToKey(f);
          if (key) attachmentIds.push(key);
          else attachments.push(await fileToAttachment(f));
        })
      );
      const hasAnyAttachment = attachmentIds.length > 0 || attachments.length > 0;
      if (!currentConversationId) {
        // New conversation: create + stream the reply over a single HTTP request.
        const result = await createAndStream(
          content,
          currentWorkspaceId || undefined,
          attachments,
          {
            enableTools: true,
            localNow: localNowStr(),
            timezone: localTimezone(),
            attachmentIds,
            hasMedia: hasAnyAttachment,
            userMessageId: userMsgId,
            // The instant local previews carry over to the seeded cache bubble so
            // the thumbnail never flickers away while the hosted URL arrives.
            optimisticAttachments: attachMeta.length ? (attachMeta as any) : undefined,
            selectedAccountId,
            selectedAgentId,
            forcedTool: selectedTool,
            // Switch to the real conversation the MOMENT it's created (mid-stream),
            // so the messages query enables and inline cards render as they arrive
            // — not only after the whole stream finishes.
            onConversation: cid => {
              uploadingOptimisticRef.current = false;
              setCurrentConversationId(cid);
              setOptimisticMessages([]);
              creatingChatRef.current = false;
              setNewChatPending(false);
            },
          }
        );
        uploadingOptimisticRef.current = false;
        if (result?.conversationId) {
          // NOTE: do NOT set currentConversationId here. onConversation already
          // switched to this chat at creation time. Re-setting it when the stream
          // FINISHES is what caused two bugs: (1) completing a reply yanked the
          // user back to this chat if they'd navigated away, and (2) if the user
          // opened a new chat while this was finishing, the late switch made the
          // next "hi" get sent into THIS conversation instead of a new one.
          queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations'], exact: true });
        }
      } else {
        await wsSendMessage(
          currentConversationId,
          content,
          currentWorkspaceId || undefined,
          attachments,
          {
            enableTools: true,
            localNow: localNowStr(),
            timezone: localTimezone(),
            attachmentIds,
            hasMedia: hasAnyAttachment,
            userMessageId: userMsgId,
            optimisticAttachments: attachMeta.length ? (attachMeta as any) : undefined,
            selectedAccountId,
            selectedAgentId,
            forcedTool: selectedTool,
          }
        );
        // The hook seeded the persisted bubble (same id) into the cache during
        // streaming; drop our page-level optimistic copy now (display deduped it
        // by id meanwhile, so there was never a duplicate).
        uploadingOptimisticRef.current = false;
        setOptimisticMessages(prev => prev.filter(m => m.id !== userMsgId));
      }
    } catch (err) {
      uploadingOptimisticRef.current = false;
      setHasSentFirstMessage(false);
      setOptimisticMessages([]);
      setInputText(content);
      if (textareaRef.current) textareaRef.current.value = content;
      const anyErr = err as any;
      if (anyErr?.canContinueWithFast) {
        // The user's selected model was refused for quota, but the refusal CAN be
        // solved by dropping to the Light model. Do NOT switch silently — offer
        // the choice (spec §28). The replay re-sends THIS exact message with
        // continueWithFast, on the same target (new chat vs existing).
        const targetConvId = currentConversationId;
        continueWithFastRef.current = async () => {
          const replayAttachments = await Promise.all(
            filesToSend.map(fileToAttachment)
          );
          const commonOpts = {
            enableTools: true,
            localNow: localNowStr(),
            timezone: localTimezone(),
            hasMedia: replayAttachments.length > 0,
            selectedAccountId,
            selectedAgentId,
            forcedTool: selectedTool,
            continueWithFast: true,
          };
          if (targetConvId) {
            await wsSendMessage(
              targetConvId,
              content,
              currentWorkspaceId || undefined,
              replayAttachments,
              commonOpts
            );
          } else {
            await createAndStream(content, currentWorkspaceId || undefined, replayAttachments, {
              ...commonOpts,
              onConversation: cid => {
                setCurrentConversationId(cid);
                setOptimisticMessages([]);
              },
            });
          }
        };
        setRefusal({
          message: anyErr.message || 'Premium AI capacity reached.',
          code: anyErr.code,
          upgrade: anyErr.upgrade === true,
        });
      } else if (anyErr?.rateLimited) {
        // A burst/monthly refusal: no model choice would help, so just tell the
        // user, restoring their text so they can resend once the window resets.
        setLimitNotice({
          message: anyErr.message || 'You have reached your VeeGPT usage limit.',
          upgrade: anyErr.upgrade === true,
        });
      } else {
        // Any OTHER failure (server error, auth, network, …). Previously this was
        // swallowed silently — the message just vanished with no explanation,
        // which read as "can't send". Surface the REAL reason so it's visible and
        // the user can retry, and log the full error for debugging.
        console.error('[VeeGPT] send failed:', anyErr);
        setLimitNotice({
          message:
            (typeof anyErr?.message === 'string' && anyErr.message.trim()
              ? anyErr.message
              : 'Something went wrong sending your message.') + ' Your text is restored — try again.',
          upgrade: false,
        });
      }
    } finally {
      // Always release the new-chat creation lock so the composer never gets
      // stuck disabled (covers the rare path where onConversation never fired).
      if (creatingChatRef.current) {
        creatingChatRef.current = false;
        setNewChatPending(false);
      }
      // Refresh the usage snapshot so the "running low" hint reacts to this send.
      queryClient.invalidateQueries({ queryKey: ['/api/chat/limits'] });
    }
  };

  // Fire a queued Album send once the target conversation state has settled
  // (new chat created, or source conversation selected) — see handleAlbumCreate
  // / handleAlbumEdit. Runs post-render so handleSendMessage sees the right
  // currentConversationId.
  useEffect(() => {
    if (!albumSendReq) return;
    handleSendMessage(albumSendReq.text);
    setAlbumSendReq(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albumSendReq]);

  // ── Post agent: confirm (one-tap) → resolve AI fields, then create + schedule
  //    via the proven content endpoints, and confirm in chat. Operates on a
  //    specific message's card so it works for both the live card and a card
  //    rehydrated from history after refresh. ─────────────────────────────────
  const setCardState = (
    msgId: number,
    patch: Partial<{
      plan: any;
      mediaUrls: string[];
      status: 'idle' | 'working' | 'done' | 'error';
      resultText?: string;
    }>
  ) => {
    setPostCardByMsg(prev => ({
      ...prev,
      [msgId]: { ...(prev[msgId] || { plan: null, mediaUrls: [], status: 'idle' }), ...patch },
    }));
  };

  const confirmPost = async (msgId: number, plan: any, mediaUrls: string[]) => {
    if (!plan) return;
    console.log('[VeeGPT] confirmPost', { msgId, hasPlan: !!plan, mediaUrls });
    if (!mediaUrls.length) {
      setCardState(msgId, {
        plan,
        mediaUrls,
        status: 'error',
        resultText: 'No image found — attach one and try again.',
      });
      setOptimisticMessages(prev => [
        ...prev,
        {
          id: Date.now(),
          conversationId: 0,
          role: 'assistant',
          content:
            "I couldn't find the media for this post — it may not have uploaded. Please start again and re-attach your image or video.",
          tokensUsed: 0,
          createdAt: new Date(),
        } as any,
      ]);
      return;
    }
    // Always carry plan + mediaUrls so the card keeps rendering. (Cards rendered
    // from persisted history have no live state yet; without this, setCardState
    // would seed plan:null and the card would disappear when status flips.)
    setCardState(msgId, { plan, mediaUrls, status: 'working' });
    try {
      // 1) Resolve AI caption/hashtags if the plan asked for it (server-side).
      let caption = (plan.caption || '').toString();
      let hashtags: string[] = Array.isArray(plan.hashtags) ? plan.hashtags : [];
      if (plan.generateCaption || plan.generateHashtags) {
        try {
          const r = await apiRequest('/api/chat/post-agent/execute', {
            method: 'POST',
            body: JSON.stringify({ workspaceId: currentWorkspaceId, plan, mediaUrls }),
          });
          if (r?.caption) caption = r.caption;
          if (Array.isArray(r?.hashtags) && r.hashtags.length) hashtags = r.hashtags;
        } catch {}
      }

      // 2) Create the content (same endpoint the manual flow uses).
      const acct =
        validAccounts.find((a: any) => (a.id || a._id || a.accountId) === plan.accountId) ||
        validAccounts[0];
      // Detect video media so we save the right content type (Instagram treats
      // a single video as a reel). Honor an explicit 'story' choice.
      const isVideo =
        mediaUrls.some(u => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u)) || postHasVideoRef.current;
      let contentType = plan.type || 'post';
      if (isVideo && contentType !== 'story') contentType = 'reel';
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
      });
      const contentId = created?.data?.id || created?.data?._id || created?.id || created?._id;
      if (!contentId) throw new Error('Could not create the post');

      // 3) Schedule or publish.
      let whenText = 'now';
      if (plan.schedule && plan.scheduledLocal) {
        const dt = new Date(plan.scheduledLocal);
        await apiRequest(`/api/content/${contentId}/schedule`, {
          method: 'POST',
          body: JSON.stringify({
            scheduledAt: dt.toISOString(),
            platform: acct?.platform || 'instagram',
          }),
        });
        whenText = dt.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
      } else {
        await apiRequest(`/api/content/${contentId}/publish`, { method: 'POST' });
      }
      // Refresh the best-time recommendation immediately instead of waiting out its
      // staleTime. Predicate covers both the analytics hook's key and the calendar's key.
      queryClient.invalidateQueries({
        predicate: q =>
          typeof q.queryKey[0] === 'string' &&
          (q.queryKey[0] as string).startsWith('/api/v1/analytics/best-time'),
      });

      const doneText = plan.schedule ? `Scheduled for ${whenText}` : 'Published';
      setCardState(msgId, { plan, mediaUrls, status: 'done', resultText: doneText });
      // Persist the card's done state so it stays confirmed after refresh.
      const serverId = postCardServerIdRef.current[msgId] || msgId;
      apiRequest(`/api/chat/messages/${serverId}/post-card`, {
        method: 'POST',
        body: JSON.stringify({ status: 'done', resultText: doneText, plan }),
      }).catch(() => {});

      // Confirm in chat + persist a follow-up assistant message.
      const confirmMsg = plan.schedule
        ? `Done — your ${plan.type || 'post'} is scheduled for ${whenText}. You'll find it under Plan → Posts → Scheduled. ✅`
        : `Done — your ${plan.type || 'post'} is live. 🎉`;
      // FIX 5: one STABLE id shared by the optimistic bubble AND the persisted
      // record. The server honors a client-supplied message id, so when the
      // saved message lands in the cache, id-based dedup collapses the two into
      // a single bubble (no duplicate) and it survives refresh.
      const confirmMsgId = Date.now() + 1;
      postAgentMsgsRef.current.push({ role: 'assistant', content: confirmMsg });

      // SEAMLESS HANDOFF (no flash): before leaving the post-agent's optimistic
      // view, merge the CURRENT optimistic thread + this confirm message into the
      // canonical messages cache. This way, when we flip postAgentActive=false,
      // the cache already holds the full conversation (with the done card and the
      // confirmation) — there is no empty frame and no "clear then repopulate"
      // flicker while the network refetch is in flight.
      const convForRefetch = postConvIdRef.current || currentConversationId;
      if (convForRefetch) {
        const doneCardMsgId = msgId;
        queryClient.setQueryData(
          ['/api/chat/conversations', convForRefetch, 'messages'],
          (old: any) => {
            const persisted: any[] = Array.isArray(old) ? old : [];
            const seen = new Set(persisted.map((m: any) => m.id));
            // Bring over any optimistic-only turns (ask/reply/ready card) not yet
            // in the cache, stamping the card message with its done state.
            const fromOptimistic = optimisticMessages
              .filter(m => !seen.has(m.id))
              .map(m =>
                m.id === doneCardMsgId
                  ? { ...m, postCard: { plan, mediaUrls, status: 'done', resultText: doneText } }
                  : m
              );
            // Ensure the done card is reflected even if it was already persisted.
            const merged = [...persisted, ...fromOptimistic].map((m: any) =>
              m.id === doneCardMsgId
                ? { ...m, postCard: { plan, mediaUrls, status: 'done', resultText: doneText } }
                : m
            );
            return [
              ...merged,
              {
                id: confirmMsgId,
                conversationId: convForRefetch,
                role: 'assistant',
                content: confirmMsg,
                tokensUsed: 0,
                createdAt: new Date(),
              },
            ];
          }
        );
      }

      // Persist the follow-up assistant message (best-effort; the cache already
      // shows it). Refetch the conversation list for the sidebar.
      apiRequest('/api/chat/conversations/log', {
        method: 'POST',
        body: JSON.stringify({
          workspaceId: currentWorkspaceId,
          // FIX 5: always log into the CURRENT conversation (never omit it, which
          // made the server spin up a brand-new conversation that vanished on
          // refresh), and reuse the SAME stable id so it dedups with the
          // optimistic bubble.
          conversationId:
            postConvIdRef.current || currentConversationId || convForRefetch || undefined,
          messages: [{ id: confirmMsgId, role: 'assistant', content: confirmMsg }],
        }),
      })
        .then((r: any) => {
          if (r?.conversation?.id) postConvIdRef.current = r.conversation.id;
          queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations'], exact: true });
        })
        .catch(() => {});

      // Now leave the post-agent view. The cache already holds the full thread,
      // so this is a seamless swap (no flash). Clear optimistic AFTER seeding.
      setPostAgentActive(false);
      postAgentMsgsRef.current = [];
      postMediaUrlsRef.current = [];
      postHasVideoRef.current = false;
      if (convForRefetch) setOptimisticMessages([]);
    } catch (e: any) {
      console.error('[VeeGPT] confirmPost failed', e);
      setCardState(msgId, {
        plan,
        mediaUrls,
        status: 'error',
        resultText: e?.message || 'Could not complete the post',
      });
      setOptimisticMessages(prev => [
        ...prev,
        {
          id: Date.now(),
          conversationId: 0,
          role: 'assistant',
          content: `I couldn't complete that — ${e?.message || 'something went wrong'}. You can tap Retry on the card.`,
          tokensUsed: 0,
          createdAt: new Date(),
        } as any,
      ]);
    }
  };

  const cancelPost = (
    msgId: number,
    opts?: {
      reason?: string;
      chatMessage?: string;
      expired?: boolean;
      plan?: any;
      mediaUrls?: string[];
    }
  ) => {
    setPostAgentActive(false);
    postAgentMsgsRef.current = [];
    postMediaUrlsRef.current = [];
    postHasVideoRef.current = false;
    const resultText = opts?.reason || 'Cancelled';
    // Preserve the plan + media so the card stays visible showing a "Cancelled"
    // state (don't let setCardState reset plan to null, which would hide it).
    const patch: any = { status: 'done', resultText };
    if (opts?.plan) patch.plan = opts.plan;
    if (opts?.mediaUrls) patch.mediaUrls = opts.mediaUrls;
    setCardState(msgId, patch);
    const serverId = postCardServerIdRef.current[msgId] || msgId;
    apiRequest(`/api/chat/messages/${serverId}/post-card`, {
      method: 'POST',
      body: JSON.stringify({ status: 'done', resultText }),
    }).catch(() => {});
    const chatMessage =
      opts?.chatMessage ||
      "No problem — I've cancelled that. Let me know if you'd like to try again.";
    // Write the cancellation reply into the canonical messages cache (not just
    // optimisticMessages) so it survives leaving the post-agent view, and refetch
    // the full persisted thread so the conversation doesn't appear to "clear".
    const convForCancel = postConvIdRef.current || currentConversationId;
    if (convForCancel) {
      queryClient.setQueryData(
        ['/api/chat/conversations', convForCancel, 'messages'],
        (old: any) => {
          const list = Array.isArray(old) ? old : [];
          return [
            ...list,
            {
              id: Date.now() + 1,
              conversationId: convForCancel,
              role: 'assistant',
              content: chatMessage,
              tokensUsed: 0,
              createdAt: new Date(),
            },
          ];
        }
      );
      setOptimisticMessages([]);
      apiRequest('/api/chat/conversations/log', {
        method: 'POST',
        body: JSON.stringify({
          workspaceId: currentWorkspaceId,
          conversationId: convForCancel,
          messages: [{ role: 'assistant', content: chatMessage }],
        }),
      })
        .then((r: any) => {
          if (r?.conversation?.id) postConvIdRef.current = r.conversation.id;
          queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations'], exact: true });
          queryClient.invalidateQueries({
            queryKey: ['/api/chat/conversations', convForCancel, 'messages'],
          });
        })
        .catch(() => {});
      return;
    }
    setOptimisticMessages(prev => [
      ...prev,
      {
        id: Date.now(),
        conversationId: 0,
        role: 'assistant',
        content: chatMessage,
        tokensUsed: 0,
        createdAt: new Date(),
      } as any,
    ]);
    // Persist the explanatory assistant message so it survives refresh. Append
    // it to the conversation the card lives in (postConvIdRef OR the currently
    // open conversation) — never let conversationId be undefined, which would
    // create a brand-new duplicate conversation.
    if (opts?.expired) {
      const convId = postConvIdRef.current || currentConversationId;
      if (convId) {
        // Show the cancellation reply IMMEDIATELY by injecting it into the
        // messages cache for the open conversation (optimistic messages aren't
        // rendered for a persisted conversation, so without this it would only
        // appear after a refresh).
        queryClient.setQueryData(['/api/chat/conversations', convId, 'messages'], (old: any) => {
          const list = Array.isArray(old) ? old : [];
          return [
            ...list,
            {
              id: Date.now() + 1,
              conversationId: convId,
              role: 'assistant',
              content: chatMessage,
              tokensUsed: 0,
              createdAt: new Date(),
            },
          ];
        });
        apiRequest('/api/chat/conversations/log', {
          method: 'POST',
          body: JSON.stringify({
            workspaceId: currentWorkspaceId,
            conversationId: convId,
            messages: [{ role: 'assistant', content: chatMessage }],
          }),
        })
          .then((r: any) => {
            if (r?.conversation?.id) postConvIdRef.current = r.conversation.id;
            queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations'], exact: true });
            queryClient.invalidateQueries({
              queryKey: ['/api/chat/conversations', convId, 'messages'],
            });
          })
          .catch(() => {});
      }
    }
  };

  // Parse a "YYYY-MM-DDTHH:mm" LOCAL schedule string to a Date (local time).
  const parseScheduledLocal = (s?: string | null): Date | null => {
    if (!s) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(s));
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  };

  // Auto-cancel a SCHEDULE card (never a post-now card) once its scheduled time
  // passes while it's still awaiting confirmation. Checks live + persisted cards
  // on an interval, and explains to the user why it was cancelled.
  useEffect(() => {
    const checkExpired = () => {
      const now = Date.now();
      // Live in-memory cards.
      const candidates: { msgId: number; plan: any; mediaUrls: string[] }[] = [];
      Object.entries(postCardByMsg).forEach(([id, card]) => {
        if (
          card?.plan?.schedule &&
          card.plan.scheduledLocal &&
          (card.status === 'idle' || !card.status)
        ) {
          candidates.push({ msgId: Number(id), plan: card.plan, mediaUrls: card.mediaUrls || [] });
        }
      });
      // Persisted cards from history that aren't already in the live map.
      (messages as any[]).forEach(m => {
        const pc = (m as any).postCard;
        if (
          pc?.plan?.schedule &&
          pc.plan.scheduledLocal &&
          (pc.status === 'idle' || !pc.status) &&
          !postCardByMsg[m.id]
        ) {
          candidates.push({ msgId: m.id, plan: pc.plan, mediaUrls: pc.mediaUrls || [] });
        }
      });
      for (const { msgId, plan, mediaUrls } of candidates) {
        const when = parseScheduledLocal(plan.scheduledLocal);
        if (when && when.getTime() <= now) {
          const whenText = when.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
          cancelPost(msgId, {
            reason: 'Auto-cancelled — time passed',
            chatMessage: `I automatically cancelled this — the scheduled time (${whenText}) passed before you confirmed it, so it can't be scheduled anymore. Just tell me a new time and I'll set it up again.`,
            expired: true,
            plan,
            mediaUrls,
          });
        }
      }
    };
    checkExpired();
    const t = setInterval(checkExpired, 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postCardByMsg, messages]);

  const handleStopGeneration = async () => {
    // Stop ONLY the conversation on screen — other chats streaming in the
    // background (multi-tasking) keep going. stopGeneration returns the revealed
    // partial(s) so we can persist EXACTLY what the user saw.
    const stopped = stopGeneration(currentConversationId ?? undefined);
    if (currentConversationId) {
      const mine = stopped.find(s => s.conversationId === currentConversationId);
      // Which assistant message to flag as stopped. Prefer the one the hook froze
      // (it had streamed text). Otherwise the user aborted BEFORE any text arrived
      // — there's no targetRef entry, so fall back to the last empty assistant
      // placeholder. Without this the reply stays stuck on "Analyzing / Working
      // on it" forever instead of showing "Stopped".
      let targetId = mine?.messageId;
      const msgsKey = ['/api/chat/conversations', currentConversationId, 'messages'];
      if (targetId == null) {
        const msgs = queryClient.getQueryData<ChatMessage[]>(msgsKey) || [];
        const last = msgs[msgs.length - 1];
        if (last && last.role === 'assistant' && !(last.content && last.content.trim())) {
          targetId = last.id;
        }
      }
      // Flag it stopped in the cache immediately so the UI drops the working
      // indicator now (the server persists the same flag for refresh survival).
      if (targetId != null) {
        queryClient.setQueryData<ChatMessage[]>(msgsKey, (old = []) =>
          (old || []).map(m =>
            m.id === targetId ? { ...m, deliveryStatus: 'stopped' as const } : m
          )
        );
      }
      try {
        await stopGenerationMutation.mutateAsync({
          convId: currentConversationId,
          messageId: targetId,
          // Send '' (not undefined) for an aborted-before-text turn so the server
          // still runs its persist branch and saves deliveryStatus:'stopped'.
          content: mine?.text ?? (targetId != null ? '' : undefined),
        });
      } catch (_) {}
    }
  };

  // Retry the last message after a provider failure (e.g. rate limit). Re-streams
  // the last user text into the current conversation; the failed assistant
  // placeholder stays in history but a fresh reply is generated.
  const handleRetry = async () => {
    const text = lastUserTextRef.current?.trim();
    if (!text || isGenerating) return;
    try {
      if (currentConversationId) {
        await wsSendMessage(currentConversationId, text, currentWorkspaceId || undefined, [], {
          skipUserMessage: true, // the user message is already in the thread
          includeWorkspaceContext: true,
          enableTools: true,
          localNow: localNowStr(),
          timezone: localTimezone(),
        });
      } else {
        await createAndStream(text, currentWorkspaceId || undefined, [], {
          enableTools: true,
          localNow: localNowStr(),
          timezone: localTimezone(),
          onConversation: cid => {
            setCurrentConversationId(cid);
          },
        });
      }
    } catch (e) {
      console.error('[VeeGPT] retry failed', e);
    }
  };

  // Regenerate an assistant reply (ChatGPT-style). Re-answers the same user
  // prompt and streams into the SAME message (server appends a 1/2, 2/2 variant),
  // so the reply stays exactly where it is on the page.
  const handleRegenerate = async (assistantMsg: ChatMessage) => {
    if (!currentConversationId) return;
    if (currentConversationId && generatingConvIds[currentConversationId]) return;
    const list = messages as ChatMessage[];
    const idx = list.findIndex(m => m.id === assistantMsg.id);
    let userText = '';
    for (let i = idx - 1; i >= 0; i--) {
      if (list[i].role === 'user' && list[i].content?.trim()) {
        userText = list[i].content;
        break;
      }
    }
    if (!userText) userText = lastUserTextRef.current || '';
    if (!userText.trim()) return;
    try {
      await regenerate(currentConversationId, assistantMsg.id, userText, {
        workspaceId: currentWorkspaceId || undefined,
        enableTools: true,
        localNow: localNowStr(),
        timezone: localTimezone(),
      });
    } catch (e) {
      console.error('[VeeGPT] regenerate failed', e);
    }
  };

  // Switch which regenerated variant is shown. Optimistically mirrors the chosen
  // variant's content/cards into the cached message, then persists server-side.
  const handleSwitchVariant = (assistantMsg: ChatMessage, index: number) => {
    if (!currentConversationId) return;
    const variants = (assistantMsg as any).variants as any[] | undefined;
    if (!Array.isArray(variants) || index < 0 || index >= variants.length) return;
    const v = variants[index];
    queryClient.setQueryData(
      ['/api/chat/conversations', currentConversationId, 'messages'],
      (old: any) => {
        const l = Array.isArray(old) ? old : [];
        return l.map((m: any) =>
          m.id === assistantMsg.id
            ? {
                ...m,
                activeVariant: index,
                content: v.content,
                postCard: v.postCard,
                listCard: v.listCard,
                editCards: v.editCards,
                infoCards: v.infoCards,
              }
            : m
        );
      }
    );
    apiRequest(`/api/chat/messages/${assistantMsg.id}/active-variant`, {
      method: 'POST',
      body: JSON.stringify({ index }),
    }).catch(() => {});
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const startNewChat = () => {
    setActiveView('chat');
    setCurrentConversationId(null);
    setHasSentFirstMessage(false);
    setHasUserStartedNewChat(true);
    setInputText('');
    clearStreamingContent();
    setOptimisticMessages([]);
    clearCachedState();
    // Reset the post-agent flow refs too. Without this, postConvIdRef still
    // holds the PREVIOUS conversation id, so the next message would be appended
    // to the old chat instead of starting a fresh one.
    postConvIdRef.current = null;
    postAgentMsgsRef.current = [];
    postMediaUrlsRef.current = [];
    postHasVideoRef.current = false;
    setPostAgentActive(false);
  };

  const selectConversation = (id: number) => {
    setActiveView('chat');
    setCurrentConversationId(id);
    setHasSentFirstMessage(true);
    subscribeToConversation(id);
    // NOTE: don't wipe streaming buffers here. An in-flight reply belongs to its
    // own conversation (tracked by the hook) and is gated to display only in that
    // chat, so switching away/back must not clear it — that was what made a
    // pending reply vanish or jump to the chat you switched to.
    setOptimisticMessages([]);
    // Sync the post-agent refs to the selected conversation so the next message
    // targets THIS chat (not whatever was last active in the post flow).
    postConvIdRef.current = id;
    postAgentMsgsRef.current = [];
    postMediaUrlsRef.current = [];
    postHasVideoRef.current = false;
    setPostAgentActive(false);
  };

  // ── Album handoffs ─────────────────────────────────────────────────────────
  // Create: open a brand-new chat and generate from the prompt (the LLM calls
  // generate_image). Edit: jump to the image's source conversation (where that
  // image is in context) and send the edit instruction (LLM calls edit_image).
  // Both queue the actual send via `albumSendReq` so it fires AFTER the view /
  // conversation state has settled (see the effect below handleSendMessage).
  const handleAlbumCreate = (p: string) => {
    startNewChat();
    setAlbumSendReq({ text: p, nonce: Date.now() });
  };
  const handleAlbumEdit = (image: AlbumImage, instruction: string) => {
    selectConversation(image.conversationId);
    setAlbumSendReq({ text: instruction, nonce: Date.now() });
  };

  // Open a conversation from the search modal; scroll-to + highlight the matched
  // message for ~10 seconds (cleared by a timer).
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openConversationFromSearch = (
    id: number,
    matchedMessageId?: number | null,
    query?: string
  ) => {
    selectConversation(id);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightQuery(query?.trim() || '');
    if (matchedMessageId) {
      setHighlightMessageId(matchedMessageId);
      highlightTimerRef.current = setTimeout(() => {
        setHighlightMessageId(null);
        setHighlightQuery('');
      }, 10000);
    } else {
      setHighlightMessageId(null);
    }
  };

  // ── Cache / init ──────────────────────────────────────────────────────────
  useEffect(() => {
    const cached = getCachedState();
    if (cached) {
      setCurrentConversationId(cached.conversationId);
      setHasSentFirstMessage(cached.hasSentFirstMessage);
      setIsInitializing(false);
    } else {
      const t = setTimeout(() => setIsInitializing(false), 100);
      return () => clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    if (!isInitializing)
      setCachedState(currentConversationId, hasSentFirstMessage, activeView, albumPreviewUrl);
  }, [currentConversationId, hasSentFirstMessage, isInitializing, activeView, albumPreviewUrl]);

  // Auto-select first conversation on first load if no cache
  useEffect(() => {
    if (
      conversations.length > 0 &&
      !currentConversationId &&
      !hasUserStartedNewChat &&
      !hasSentFirstMessage
    ) {
      if (!getCachedState()) {
        setHasSentFirstMessage(true);
        setCurrentConversationId(conversations[0].id);
      }
    }
  }, [conversations, currentConversationId, hasUserStartedNewChat, hasSentFirstMessage]);

  // ── Render helpers ────────────────────────────────────────────────────────

  // Synchronous landing prediction (computed once at mount from the persisted
  // cache + "has conversations" hint, the same signals the Page_Skeleton uses).
  // The welcome / new-chat screen is purely STATIC UI (title + input + prompt
  // pills) with no data behind it, so when we can tell the user is landing
  // there we render it INSTANTLY instead of waiting on the conversations query.
  // Only the sidebar (conversation list) and the chat message area actually
  // load data, so those are the only regions allowed a loading state.
  const initialPredictionRef = useRef<'welcome' | 'chat'>();
  const hasConvHintRef = useRef<boolean>(false);
  if (initialPredictionRef.current === undefined) {
    const cached = getCachedState();
    let hasConvHint = false;
    try {
      hasConvHint = localStorage.getItem('veegpt-has-conversations') === '1';
    } catch (_) {}
    hasConvHintRef.current = hasConvHint;
    // A restored Album/Auto Pilot view is NOT the welcome screen — predict the
    // non-welcome layout so the pre-mount shell doesn't flash the welcome hero
    // before the album/autopilot mounts.
    const restoredNonChat =
      cached?.activeView === 'album' ||
      cached?.activeView === 'autopilot' ||
      cached?.activeView === 'video-editor';
    // chat iff a conversation is cached, or (no cache) the user has conversations
    // and will auto-select the first one; otherwise the static welcome screen.
    initialPredictionRef.current =
      restoredNonChat ||
      cached?.conversationId != null ||
      (cached == null && hasConvHint)
        ? 'chat'
        : 'welcome';
  }

  // Show the sidebar when we actually have conversations, or while the query is
  // in flight ONLY if the persisted hint says conversations exist. A brand-new
  // user (no hint) therefore never sees the sidebar flash in/out during load.
  // The `sidebarEverShownRef` ensures the sidebar never disappears once it has
  // appeared — a transient empty conversations response (race / network blip /
  // refetch) cannot cause it to vanish for an existing user.
  const sidebarEverShownRef = useRef(false);
  const sidebarVisible =
    conversations.length > 0 ||
    (conversationsLoading && hasConvHintRef.current) ||
    !!currentConversationId;  // In a chat → sidebar must always be present
  if (sidebarVisible) sidebarEverShownRef.current = true;
  const shouldShowSidebar = sidebarVisible || sidebarEverShownRef.current;

  const resolvedWelcome =
    !isInitializing &&
    !conversationsLoading &&
    !currentConversationId &&
    (!hasSentFirstMessage || hasUserStartedNewChat) &&
    optimisticMessages.length === 0;
  // Show the static welcome screen immediately while data is still loading when
  // we predict the user is landing there (no flash, no skeleton for static UI).
  const predictedWelcomeWhileLoading =
    (isInitializing || conversationsLoading) &&
    !currentConversationId &&
    optimisticMessages.length === 0 &&
    initialPredictionRef.current === 'welcome';
  // Only the chat view has a welcome screen. Album / Auto Pilot render in their
  // own branches (above), so never treat them as "welcome" — that also keeps the
  // SSR layout cookie from flashing the welcome hero on a refresh into album.
  const showWelcomeScreen =
    activeView === 'chat' && (resolvedWelcome || predictedWelcomeWhileLoading);

  // Mirror the resolved layout (welcome-vs-chat + whether the sidebar shows)
  // into the `vf_vg` cookie so the SERVER renders the SSR shell overlay with the
  // EXACT same VeeGPT layout on the next load — no variant-mismatch flicker when
  // the overlay dissolves (the server can't read this page's localStorage state).
  useEffect(() => {
    const layout =
      activeView === 'album' ? 'album' : showWelcomeScreen ? 'welcome' : 'chat';
    setVeegptLayoutCookie(layout, shouldShowSidebar);
  }, [showWelcomeScreen, shouldShowSidebar, activeView]);

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
  const shellDissolvedRef = useRef(false);
  useEffect(() => {
    if (shellDissolvedRef.current) return;
    const settled = !isInitializing && !conversationsLoading && !!finalUserData;
    if (!settled) return;
    shellDissolvedRef.current = true;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          (window as any).__vfRemoveShell?.('veegpt-settled');
        } catch {
          /* ignore */
        }
      });
    });
    return () => cancelAnimationFrame(id);
  }, [
    isInitializing,
    conversationsLoading,
    finalUserData,
    showWelcomeScreen,
    currentConversationId,
  ]);

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
            style={{
              left: `${(i * 7.3) % 100}%`,
              top: `${(i * 6.1) % 100}%`,
              animationDelay: `${i * 3}s`,
              animationDuration: `${18 + (i % 5) * 2}s`,
            }}
          />
        ))}
      </div>
    </div>
  );

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
      onOpenConversation={(id, matchedMessageId, query) =>
        openConversationFromSearch(id, matchedMessageId, query)
      }
      onNewChat={startNewChat}
    />
  );

  const lightboxModal = lightbox && (
    <div
      className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => setLightbox(null)}
    >
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3"
        onClick={e => e.stopPropagation()}
      >
        <span className="text-sm text-white/80 truncate max-w-[60%]">
          {lightbox.name || 'Attachment'}
        </span>
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
      <div
        className="max-w-[90vw] max-h-[85vh] flex items-center justify-center"
        onClick={e => e.stopPropagation()}
      >
        {lightbox.mimeType?.startsWith('image/') ? (
          <img
            src={lightbox.url}
            alt={lightbox.name || 'image'}
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg"
          />
        ) : lightbox.mimeType?.startsWith('video/') ? (
          <video
            src={lightbox.url}
            className="max-w-[90vw] max-h-[85vh] rounded-lg"
            controls
            autoPlay
            playsInline
          />
        ) : (
          <div className="text-white/80 text-sm bg-white/10 rounded-lg px-6 py-10 text-center">
            <p className="mb-3">Preview isn't available for this file type.</p>
            <a
              href={lightbox.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-blue-300 hover:text-blue-200"
            >
              <Download className="w-4 h-4" /> Open in new tab
            </a>
          </div>
        )}
      </div>
    </div>
  );

  // Inline notice shown right above the composer (Claude-style — never a
  // floating modal). It shares ONE slot with the soft low-usage hint: when the
  // user actually hits a limit, the "limit reached" banner takes over the slot
  // (so the "running low" hint doesn't vanish into a separate popup — it simply
  // upgrades in place). Dismissible, with an Upgrade CTA when the server
  // flagged the plan. `composerNotice` is passed to both the welcome and chat
  // composers so it's always anchored to wherever the user is typing.
  const composerNotice: React.ReactNode = limitNotice ? (
    <div className="mb-2 flex items-start gap-2.5 rounded-2xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 shadow-sm dark:border-amber-500/40 dark:bg-amber-950">
      <Rocket className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
      <p className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-amber-800 dark:text-amber-200">
        {limitNotice.message}
      </p>
      {limitNotice.upgrade && (
        <a
          href="/settings/billing"
          className="shrink-0 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-blue-700"
        >
          Upgrade
        </a>
      )}
      <button
        type="button"
        onClick={() => setLimitNotice(null)}
        className="shrink-0 rounded-md p-0.5 text-amber-500/70 transition hover:bg-amber-100 hover:text-amber-700 dark:hover:bg-amber-500/20"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  ) : refusal ? (
    // The user's selected model was refused for quota (spec §28, §43). The server
    // did NOT switch models — it asked. We present the choice: continue on the
    // Light model, or upgrade. Nothing happens until the user picks.
    <div className="mb-2 flex items-start gap-2.5 rounded-2xl border border-blue-300 bg-blue-50 px-3.5 py-2.5 shadow-sm dark:border-blue-500/40 dark:bg-blue-950">
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium leading-snug text-blue-800 dark:text-blue-200">
          {refusal.message} Continue with VeeGPT Fast?
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleContinueWithFast}
            disabled={continuingWithFast}
            className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {continuingWithFast ? 'Continuing…' : 'Continue with Fast'}
          </button>
          {refusal.upgrade && (
            <a
              href="/settings/billing"
              className="rounded-lg border border-blue-300 px-3 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 dark:border-blue-500/40 dark:text-blue-200 dark:hover:bg-blue-500/20"
            >
              Upgrade
            </a>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          setRefusal(null);
          continueWithFastRef.current = null;
        }}
        className="shrink-0 rounded-md p-0.5 text-blue-500/70 transition hover:bg-blue-100 hover:text-blue-700 dark:hover:bg-blue-500/20"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  ) : (
    usageHintNode
  );

  // ── Auto Pilot (in-page view) ─────────────────────────────────────────────
  // Rendered INSIDE VeeGPT — same shell + conversation sidebar — so Auto Pilot
  // feels like a VeeGPT bot, not a separate page.
  if (activeView === 'autopilot') {
    return (
      <div className="h-full w-full bg-gray-50 dark:bg-slate-900 flex relative overflow-hidden">
        <Background />
        <div className="relative z-10 w-full h-full flex">
          <ConversationSidebar
            conversations={conversations as any}
            conversationsLoading={conversationsLoading}
            currentConversationId={currentConversationId}
            sidebarCollapsed={sidebarCollapsed}
            setSidebarCollapsed={setSidebarCollapsed}
            onSelectConversation={selectConversation}
            onStartNewChat={startNewChat}
            onOpenSearch={() => setSearchModalOpen(true)}
            onOpenAutoPilot={() => setActiveView('autopilot')}
            autopilotActive
            onOpenAlbum={() => setActiveView('album')}
            onOpenVideoEditor={() => setActiveView('video-editor')}
            userData={finalUserData}
            userLoading={userLoading}
            refreshKey={refreshKey}
          />
          <div className="flex-1 h-full min-h-0 flex flex-col overflow-hidden">
            <AutoPilotPage />
          </div>
        </div>
        {lightboxModal}
        {searchModal}
      </div>
    );
  }

  // Video Editor — conversational AI video editing, rendered INSIDE VeeGPT with
  // the same shell + conversation sidebar (like Auto Pilot), so it feels like a
  // VeeGPT capability rather than a separate page.
  if (activeView === 'video-editor') {
    return (
      <div className="h-full w-full bg-gray-50 dark:bg-slate-900 flex relative overflow-hidden">
        <Background />
        <div className="relative z-10 w-full h-full flex">
          <ConversationSidebar
            conversations={conversations as any}
            conversationsLoading={conversationsLoading}
            currentConversationId={currentConversationId}
            sidebarCollapsed={sidebarCollapsed}
            setSidebarCollapsed={setSidebarCollapsed}
            onSelectConversation={selectConversation}
            onStartNewChat={startNewChat}
            onOpenSearch={() => setSearchModalOpen(true)}
            onOpenAutoPilot={() => setActiveView('autopilot')}
            onOpenAlbum={() => setActiveView('album')}
            onOpenVideoEditor={() => setActiveView('video-editor')}
            videoEditorActive
            userData={finalUserData}
            userLoading={userLoading}
            refreshKey={refreshKey}
          />
          <div className="flex-1 h-full min-h-0 flex flex-col overflow-hidden">
            <React.Suspense fallback={<div className="flex-1" />}>
              <VideoEditorPage />
            </React.Suspense>
          </div>
        </div>
        {lightboxModal}
        {searchModal}
      </div>
    );
  }

  // Album — gallery of every image VeeGPT generated/edited, inside the shell.
  if (activeView === 'album') {
    return (
      <div className="h-full w-full bg-gray-50 dark:bg-slate-900 flex relative overflow-hidden">
        <Background />
        <div className="relative z-10 w-full h-full flex">
          <ConversationSidebar
            conversations={conversations as any}
            conversationsLoading={conversationsLoading}
            currentConversationId={currentConversationId}
            sidebarCollapsed={albumSidebarCollapsed}
            setSidebarCollapsed={setAlbumSidebarCollapsed}
            onSelectConversation={selectConversation}
            onStartNewChat={startNewChat}
            onOpenSearch={() => setSearchModalOpen(true)}
            onOpenAutoPilot={() => setActiveView('autopilot')}
            onOpenAlbum={() => setActiveView('album')}
            albumActive
            onOpenVideoEditor={() => setActiveView('video-editor')}
            userData={finalUserData}
            userLoading={userLoading}
            refreshKey={refreshKey}
          />
          <AlbumView
            workspaceId={currentWorkspaceId || undefined}
            onOpenConversation={selectConversation}
            onCreateImage={handleAlbumCreate}
            onEditImage={handleAlbumEdit}
            // Collapse the VeeGPT sidebar to the slim rail while a preview is open.
            onPreviewOpenChange={setAlbumSidebarCollapsed}
            // Persist/restore the open preview image across refresh.
            initialPreviewUrl={albumPreviewUrl}
            onPreviewImageChange={setAlbumPreviewUrl}
          />
        </div>
        {lightboxModal}
        {searchModal}
      </div>
    );
  }

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
              onOpenAutoPilot={() => setActiveView('autopilot')}
              onOpenAlbum={() => setActiveView('album')}
              onOpenVideoEditor={() => setActiveView('video-editor')}
              userData={finalUserData}
              userLoading={userLoading}
              refreshKey={refreshKey}
            />
          )}

          {/* Welcome content */}
          <div className="flex-1 flex flex-col items-center justify-center px-4">
            <div className="w-full max-w-3xl">
              <div className="text-center mb-10">
                <div className="relative mb-6 inline-flex items-center justify-center">
                  {/* Soft ambient glow bloom behind the transparent mark */}
                  <div className="absolute inset-0 -z-10 rounded-full bg-blue-500/20 blur-3xl scale-150" />
                  {/* Transparent brand mark — no boxed background, just the logo */}
                  <img
                    src="/veefore.svg"
                    alt="VeeFore"
                    className="h-14 w-auto object-contain drop-shadow-[0_8px_24px_rgba(59,130,246,0.35)]"
                  />
                </div>
                <h1 className="text-[2.65rem] leading-[1.1] font-semibold tracking-tight text-gray-900 dark:text-gray-50">
                  How can{' '}
                  <span className="bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600 bg-clip-text text-transparent">
                    VeeGPT
                  </span>{' '}
                  help?
                  <span className="align-middle ml-3 px-2.5 py-1 bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-300 text-[11px] font-semibold rounded-full ring-1 ring-blue-200/60 dark:ring-blue-500/30">
                    Beta
                  </span>
                </h1>
                <p className="mt-3.5 text-[15px] text-gray-500 dark:text-gray-400">
                  Your AI co-pilot for content, growth, and research.
                </p>
              </div>

              {/* Usage / limit notice — inline, right above the composer. */}
              {composerNotice}

              {/* Main input */}
              <div className="group bg-white/90 dark:bg-slate-800/70 backdrop-blur-md rounded-[24px] shadow-[0_8px_30px_-12px_rgba(15,23,42,0.18)] dark:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.5)] mb-8 border border-gray-200/70 dark:border-white/10 transition-all duration-200 focus-within:border-blue-400/70 dark:focus-within:border-blue-400/40 focus-within:shadow-[0_10px_36px_-8px_rgba(59,130,246,0.25)] focus-within:ring-1 focus-within:ring-blue-400/20">
                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={e => {
                    setInputText(e.target.value);
                    resizeComposer(e.target);
                  }}
                  onKeyDown={handleKeyPress}
                  onPaste={e => {
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
                    if (files.length) {
                      e.preventDefault();
                      addAttachments(files);
                    }
                  }}
                  placeholder="Ask VeeGPT a question"
                  className="w-full px-5 py-3 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 bg-transparent border-0 resize-none focus:outline-none focus:ring-0"
                  style={{
                    fontSize: '16px',
                    height: '48px',
                    maxHeight: `${COMPOSER_MAX_HEIGHT}px`,
                    lineHeight: '24px',
                    border: 'none',
                    boxShadow: 'none',
                    wordBreak: 'break-word',
                    overflowWrap: 'anywhere',
                    whiteSpace: 'pre-wrap',
                  }}
                  rows={1}
                />

                {/* Pending attachment chips */}
                {attachmentPreviews.length > 0 && (
                  <div className="flex flex-wrap gap-2 px-5 pb-2">
                    {attachmentPreviews.map((att, i) => {
                      const isImage = att.mimeType?.startsWith('image/');
                      const isVideo = att.mimeType?.startsWith('video/');
                      return (
                        <div key={i} className="relative group">
                          <div
                            className="w-16 h-16 rounded-lg overflow-hidden border border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-slate-700 flex items-center justify-center"
                            title={att.name}
                          >
                            {isImage && att.previewUrl ? (
                              <img
                                src={att.previewUrl}
                                alt={att.name}
                                onClick={() => {
                                  const u = att.previewUrl;
                                  if (u)
                                    setLightbox({ url: u, mimeType: att.mimeType, name: att.name });
                                }}
                                className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                              />
                            ) : isVideo ? (
                              <div
                                onClick={() => {
                                  const u = att.previewUrl;
                                  if (u)
                                    setLightbox({ url: u, mimeType: att.mimeType, name: att.name });
                                }}
                                className="relative w-full h-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity"
                                title={att.name}
                              >
                                {att.posterUrl ? (
                                  <img
                                    src={att.posterUrl}
                                    alt={att.name}
                                    className="absolute inset-0 w-full h-full object-cover"
                                  />
                                ) : null}
                                {/* Static play badge — never autoplays. Click opens the modal. */}
                                <div className="relative w-7 h-7 rounded-full bg-black/50 flex items-center justify-center pointer-events-none">
                                  <Play className="w-3.5 h-3.5 text-white" fill="currentColor" />
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center justify-center gap-1">
                                <span className="text-[10px] font-bold text-red-600 dark:text-red-300">
                                  PDF
                                </span>
                                <span className="text-[8px] text-gray-500 px-1 truncate max-w-[56px]">
                                  {att.name}
                                </span>
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => removeAttachment(i)}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-700 text-white flex items-center justify-center shadow hover:bg-gray-900"
                            title="Remove"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
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
                        aria-label={
                          welcomeVoice.listening ? 'Stop voice input' : 'Speak your message'
                        }
                        className={
                          welcomeVoice.listening
                            ? 'text-red-500 animate-pulse'
                            : 'text-gray-600 dark:text-gray-400'
                        }
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
                        className="flex items-center gap-1 rounded-full border border-blue-400 dark:border-blue-400/50 bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 px-2.5 py-1 text-xs font-medium shadow-sm transition-colors hover:bg-blue-100 dark:hover:bg-blue-500/20"
                      >
                        <Wrench className="w-3 h-3" />
                        {getComposerTool(selectedTool)?.label || 'Tool'}
                        <X className="w-3 h-3 opacity-70" />
                      </button>
                    )}
                  </div>
                  <Button
                    onClick={() => handleSendMessage()}
                    disabled={
                      (!inputText.trim() && attachmentPreviews.length === 0) || newChatPending
                    }
                    className={`p-2 rounded-lg transition-all duration-300 ${inputText.trim() || attachmentPreviews.length ? 'bg-gradient-to-r from-blue-500 to-blue-600 hover:brightness-110 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-400 dark:text-gray-500'}`}
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Quick prompts */}
              <div className="space-y-2.5">
                {[QUICK_PROMPTS.slice(0, 3), QUICK_PROMPTS.slice(3, 6), QUICK_PROMPTS.slice(6)].map(
                  (row, ri) => (
                    <div key={ri} className="flex flex-wrap gap-2.5 justify-center">
                      {row.map((p, pi) => (
                        <button
                          key={pi}
                          onClick={() => setInputText(p.text)}
                          className="group flex items-center gap-2 pl-2 pr-4 py-1.5 bg-white/80 dark:bg-white/[0.04] backdrop-blur-sm border border-gray-200/70 dark:border-white/10 rounded-full text-gray-700 dark:text-gray-200 shadow-[0_1px_3px_rgba(15,23,42,0.05)] hover:bg-white dark:hover:bg-white/[0.08] hover:border-blue-300/70 dark:hover:border-blue-400/40 hover:shadow-[0_6px_16px_-6px_rgba(59,130,246,0.30)] hover:-translate-y-0.5 transition-all duration-200 whitespace-nowrap"
                        >
                          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-50 dark:bg-blue-500/15 text-blue-500 dark:text-blue-400 group-hover:bg-blue-100 dark:group-hover:bg-blue-500/25 transition-colors">
                            <p.icon className="w-[15px] h-[15px] flex-shrink-0 group-hover:scale-110 transition-transform" />
                          </span>
                          <span className="text-[13px] font-medium">{p.text}</span>
                        </button>
                      ))}
                    </div>
                  )
                )}
              </div>

              <div className="text-center mt-10">
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  VeeGPT can make mistakes. Check important info.
                </p>
              </div>
            </div>
          </div>
        </div>
        {lightboxModal}
        {searchModal}
      </div>
    );
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
            onOpenAutoPilot={() => setActiveView('autopilot')}
            onOpenAlbum={() => setActiveView('album')}
            onOpenVideoEditor={() => setActiveView('video-editor')}
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
          reasoningContent={reasoningContent}
          // Live hook stream takes precedence; resumed (polled) feed fills in for
          // a reply we reconnected to after navigating away.
          researchProgress={{ ...resumedResearch, ...researchProgress }}
          pendingReplyId={pendingReplyId}
          // During the brief post-reconnect grace window, hide the generic
          // "Working on it…" line so a resumed card/banner doesn't flash after it.
          suppressPendingIndicator={pendingReplyId != null && !resumeProbed}
          title={
            (conversations as ChatConversation[]).find(c => c.id === currentConversationId)?.title
          }
          onNewChat={startNewChat}
          onInputChange={setInputText}
          onSendMessage={handleSendMessage}
          onStopGeneration={handleStopGeneration}
          onKeyPress={handleKeyPress}
          onRetry={handleRetry}
          onRegenerate={handleRegenerate}
          onSwitchVariant={handleSwitchVariant}
          attachments={attachmentPreviews}
          attachmentError={attachmentError}
          onDismissAttachmentError={() => setAttachmentError(null)}
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
          usageHint={composerNotice}
          reportOverlay={
            openDocument ? (
              <DocumentViewer card={openDocument} onClose={() => setOpenDocument(null)} />
            ) : openReport ? (
              <ResearchReportViewer card={openReport} onClose={() => setOpenReport(null)} />
            ) : null
          }
          preparingMessageId={preparingMessageId}
          preparingStatus={preparingStatus}
          highlightMessageId={highlightMessageId}
          highlightQuery={highlightQuery}
          renderMessageCard={(message: any) => {
            // Read-only list of posts (scheduled/draft/published) as cards.
            const listCard = message.listCard;
            // Edit-confirmation cards (multi-tool array, or legacy single).
            const editCards: any[] =
              Array.isArray(message.editCards) && message.editCards.length
                ? message.editCards
                : message.editCard
                  ? [{ id: undefined, ...message.editCard }]
                  : [];
            // Info/assist cards (captions, hashtags, insight, recommendations, best_time, trends).
            const infoCards: any[] = Array.isArray(message.infoCards) ? message.infoCards : [];
            // Transient LIVE image-generation card (shows the animated surface
            // WHILE the image is being generated, before the final card lands).
            const liveImageCard = (message as any).liveImageCard;
            // Transient LIVE video-editor card (shows the "preparing" surface
            // WHILE the server ingests/probes the attached video, before the
            // final video_editor card with projectId/sourceId lands).
            const liveVideoEditorCard = (message as any).liveVideoEditorCard;
            // Auto Pilot Approval_Card / Content_Brief pushed by the Operating Loop (R4.3/R4.5/R7.8).
            const autopilotCard = message.autopilotCard;
            // Post compose/schedule confirm card.
            const live = postCardByMsg[message.id];
            const persisted = message.postCard;
            const card = live || persisted;

            if (
              !listCard &&
              !editCards.length &&
              !infoCards.length &&
              !liveImageCard &&
              !liveVideoEditorCard &&
              !autopilotCard &&
              (!card || !card.plan)
            )
              return null;

            const acct = card?.plan
              ? validAccounts.find(
                  (a: any) => (a.id || a._id || a.accountId) === card.plan.accountId
                ) || validAccounts[0]
              : null;
            return (
              <div className="flex flex-col items-start gap-2 max-w-4xl w-full">
                {listCard && (
                  <PostListCard
                    kind={listCard.kind}
                    title={listCard.title}
                    items={listCard.items || []}
                  />
                )}
                {infoCards.map((ic, i) => {
                  const cardKey = ic.id || `info_${i}`
                  const pickedOrdinal = mediaPicks[cardKey]
                  return (
                    <InfoCard
                      key={cardKey}
                      card={ic}
                      onOpenFull={setOpenReport}
                      onOpenDocument={setOpenDocument}
                      selectedOrdinal={pickedOrdinal}
                      // A media picker is single-use: locked once an image was
                      // chosen from it (survives re-render via mediaPicks).
                      mediaLocked={pickedOrdinal != null}
                      onSelectMedia={(ordinal, label) => {
                        if (mediaPicks[cardKey] != null) return
                        setMediaPicks((prev) => ({ ...prev, [cardKey]: ordinal }))
                        handleSendMessage(
                          `Schedule image ${ordinal}${label ? ` (${label})` : ''}.`
                        )
                      }}
                    />
                  )
                })}
                {liveImageCard && !infoCards.some((ic) => ic.kind === 'image') && (
                  <InfoCard card={liveImageCard as any} />
                )}
                {liveVideoEditorCard &&
                  !infoCards.some((ic) => ic.kind === 'video_editor') && (
                    <InfoCard card={liveVideoEditorCard as any} />
                  )}
                {autopilotCard && autopilotCard.kind === 'approval' && (
                  <ApprovalCard card={autopilotCard as ApprovalCardData} />
                )}
                {autopilotCard && autopilotCard.kind === 'content-brief' && (
                  <ContentBriefCard card={autopilotCard as ContentBriefCardData} />
                )}
                {editCards.map((ec, i) => {
                  const liveEdit = editCardByMsg[`${message.id}:${ec.id || ''}`];
                  const merged = { ...ec, ...(liveEdit || {}) };
                  return (
                    <EditConfirmCard
                      key={ec.id || i}
                      card={merged as any}
                      onConfirm={() => applyEdit(message.id, ec.id, 'confirm')}
                      onCancel={() => applyEdit(message.id, ec.id, 'cancel')}
                    />
                  );
                })}
                {card && card.plan && (
                  <PostConfirmCard
                    plan={card.plan}
                    mediaUrls={card.mediaUrls || []}
                    accountUsername={acct?.username}
                    status={card.status || 'idle'}
                    resultText={card.resultText}
                    onConfirm={() => confirmPost(message.id, card.plan, card.mediaUrls || [])}
                    onCancel={() =>
                      cancelPost(message.id, { plan: card.plan, mediaUrls: card.mediaUrls || [] })
                    }
                  />
                )}
              </div>
            );
          }}
        />
      </div>
      {lightboxModal}
      {searchModal}
    </div>
  );
}
