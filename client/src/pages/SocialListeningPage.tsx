import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher';
import { apiRequest } from '@/lib/queryClient';
import {
  Activity, TrendingUp, AlertTriangle, Lightbulb, MessageSquare,
  Search, Bot, Zap, ArrowUpRight, ExternalLink, Heart, MessageCircle,
  Settings, Target, RefreshCw, Loader2, Radio, Hash, Eye, Flame, Sparkles, Send, BarChart3,
  Download, Users, ShieldAlert, Crown, Bell, Smile, Filter, Globe,
  Plus, History, Trash2, MessageSquarePlus, X
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  ScatterChart, Scatter, ZAxis
} from 'recharts';

/* ------------------------------------------------------------------ */
/* Design system: professional blue / sky brand accent on a slate      */
/* canvas. Emerald = positive sentiment, rose = negative, amber =       */
/* warnings (semantic only). Full light + dark theme support.           */
/* No purple/indigo anywhere.                                          */
/* ------------------------------------------------------------------ */

const fmtCompact = (n: number) => {
  if (!n || n < 1000) return String(n || 0);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
};

const platformStyle = (platform: string) => {
  const p = (platform || '').toLowerCase();
  if (p === 'youtube') return 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400';
  if (p === 'reddit') return 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400';
  if (p === 'hackernews') return 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400';
  if (p === 'news') return 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400';
  return 'bg-gray-100 text-gray-600 dark:bg-gray-500/10 dark:text-gray-400';
};
const platformLabel = (p: string) => (p === 'hackernews' ? 'HN' : p === 'news' ? 'News' : p);

const SEARCH_STEPS = [
  'Scanning Reddit, YouTube, Hacker News & News…',
  'Collecting matching posts across the network…',
  'Scoring relevance to your query…',
  'Running AI sentiment & topic analysis…',
  'Aggregating mentions, reach & hashtags…',
  'Almost there — finalizing insights…',
];

const ANALYST_HINTS = [
  'What themes are trending in my niche right now?',
  'What is my audience most frustrated about?',
  'Give me 3 content ideas based on current trends',
  'Which hooks should I use for my next post?',
  'Is sentiment positive or negative this week?',
  'What hashtags should I target?',
];

function SearchLoadingStatus() {
  const [step, setStep] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t1 = setInterval(() => setStep((s) => Math.min(s + 1, SEARCH_STEPS.length - 1)), 4000);
    const t2 = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, []);
  const pct = Math.min(95, (step + 1) * (100 / SEARCH_STEPS.length));
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6">
      <div className="relative mb-5">
        <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center">
          {/* skeleton-guard-allow: action-spinner — live search progress indicator (with
              step text, elapsed timer, and progress bar) for a 20–60s user-triggered
              live search, not a content-structure loading placeholder */}
          <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
        </div>
      </div>
      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1 text-center">{SEARCH_STEPS[step]}</p>
      <p className="text-xs text-gray-400 mb-4">{elapsed}s elapsed · live search usually takes 20–60s</p>
      <div className="w-full max-w-md bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-sky-500 h-full rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function formatEta(seconds: number | null | undefined): string {
  if (seconds == null || seconds <= 0) return 'almost done';
  if (seconds < 60) return `~${seconds}s remaining`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `~${m}m ${s}s remaining` : `~${m}m remaining`;
}

const SYNC_PHASE_LABEL: Record<string, string> = {
  queued: 'Starting sync',
  fetching: 'Collecting mentions',
  analyzing: 'Analyzing with AI',
  computing: 'Computing trends',
  completed: 'Complete',
  failed: 'Sync failed',
};

/**
 * Persistent live-sync status bar. Driven by the server-side status doc (polled
 * by the page), so it shows the real phase, progress %, live counts and an ETA,
 * and stays visible after a page refresh until the data is genuinely ready.
 */
function SyncStatusBar({ status }: { status: any }) {
  const failed = status.phase === 'failed';
  const pct = Math.max(0, Math.min(100, status.progress || 0));
  const isBackground = status.mode === 'background';
  const phaseLabel = isBackground && status.active
    ? 'Auto-refreshing in background'
    : (SYNC_PHASE_LABEL[status.phase] || 'Syncing');

  const counts: string[] = [];
  if (status.postsFetched) counts.push(`${status.postsFetched} posts`);
  if (status.commentsFetched) counts.push(`${status.commentsFetched} comments`);
  if (status.phase === 'analyzing' && status.postsToAnalyze) {
    counts.push(`${status.postsAnalyzed || 0}/${status.postsToAnalyze} analyzed`);
  }
  if (status.batchMode) counts.push('batch mode · 50% cheaper');
  if (status.trendsComputed) counts.push(`${status.trendsComputed} trends`);

  return (
    <div className="px-5 lg:px-8 pb-3">
      <div
        className={`rounded-xl border px-4 py-3 ${
          failed
            ? 'border-rose-200 bg-rose-50/70 dark:border-rose-500/30 dark:bg-rose-500/5'
            : 'border-blue-200 bg-blue-50/70 dark:border-blue-500/30 dark:bg-blue-500/5'
        }`}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-3">
          {failed ? (
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
          ) : (
            <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-3">
              <p className={`text-sm font-semibold truncate ${failed ? 'text-rose-700 dark:text-rose-300' : 'text-blue-700 dark:text-blue-300'}`}>
                {phaseLabel}
                {!failed && <span className="ml-2 font-normal text-blue-600/70 dark:text-blue-400/70">{status.message}</span>}
                {failed && status.error && <span className="ml-2 font-normal text-rose-600/80 dark:text-rose-400/80">{status.error}</span>}
              </p>
              {!failed && (
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 shrink-0 tabular-nums">
                  {pct}% · {formatEta(status.estimatedSecondsRemaining)}
                </span>
              )}
            </div>
            {!failed && (
              <div className="mt-2 w-full bg-blue-100 dark:bg-blue-500/15 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-600 to-sky-500 h-full rounded-full transition-all duration-700"
                  style={{ width: `${Math.max(4, pct)}%` }}
                />
              </div>
            )}
            {!failed && counts.length > 0 && (
              <p className="mt-1.5 text-[11px] text-blue-600/70 dark:text-blue-400/70">{counts.join(' · ')}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const priorityChip = (p: string) =>
  p === 'high' ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400 ring-1 ring-rose-200/60 dark:ring-rose-500/20'
  : p === 'medium' ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 ring-1 ring-amber-200/60 dark:ring-amber-500/20'
  : 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 ring-1 ring-blue-200/60 dark:ring-blue-500/20';

const rankBadge = (i: number) =>
  i === 0 ? 'bg-gradient-to-br from-blue-600 to-sky-500 text-white'
  : i === 1 ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
  : i === 2 ? 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300'
  : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400';

const alertStyle = (type: string) => {
  switch (type) {
    case 'risk': return { ring: 'border-rose-200 dark:border-rose-500/30 bg-rose-50/60 dark:bg-rose-500/5', icon: 'text-rose-500 bg-rose-100 dark:bg-rose-500/15', Icon: ShieldAlert };
    case 'opportunity': return { ring: 'border-blue-200 dark:border-blue-500/30 bg-blue-50/60 dark:bg-blue-500/5', icon: 'text-blue-500 bg-blue-100 dark:bg-blue-500/15', Icon: Flame };
    case 'positive': return { ring: 'border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/5', icon: 'text-emerald-500 bg-emerald-100 dark:bg-emerald-500/15', Icon: Sparkles };
    default: return { ring: 'border-amber-200 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/5', icon: 'text-amber-500 bg-amber-100 dark:bg-amber-500/15', Icon: Lightbulb };
  }
};

const EMOTION_EMOJI: Record<string, string> = {
  joy: '😄', happy: '😄', happiness: '😄', excitement: '🤩', excited: '🤩', love: '❤️',
  anger: '😠', angry: '😠', frustration: '😤', frustrated: '😤', sadness: '😢', sad: '😢',
  fear: '😨', anxiety: '😰', surprise: '😲', surprised: '😲', disgust: '🤢', trust: '🤝',
  anticipation: '👀', curiosity: '🧐', curious: '🧐', hope: '🌱', hopeful: '🌱',
  nostalgia: '🕰️', pride: '🏆', confusion: '😕', confused: '😕', gratitude: '🙏',
  amusement: '😂', funny: '😂', boredom: '🥱', neutral: '😐', concern: '😟', concerned: '😟',
};
const emotionEmoji = (e: string) => EMOTION_EMOJI[e?.toLowerCase()?.trim()] || '💬';

/* Color + label for a 0..100 strength score (used by hooks & pain points). */
const scoreTone = (score: number, negative = false) => {
  if (score >= 80) return negative
    ? { bar: 'from-rose-500 to-red-500', text: 'text-rose-600 dark:text-rose-400', chip: 'bg-rose-50 dark:bg-rose-500/10', label: 'Critical' }
    : { bar: 'from-emerald-500 to-green-500', text: 'text-emerald-600 dark:text-emerald-400', chip: 'bg-emerald-50 dark:bg-emerald-500/10', label: 'High' };
  if (score >= 55) return negative
    ? { bar: 'from-orange-500 to-amber-500', text: 'text-orange-600 dark:text-orange-400', chip: 'bg-orange-50 dark:bg-orange-500/10', label: 'Moderate' }
    : { bar: 'from-amber-500 to-yellow-500', text: 'text-amber-600 dark:text-amber-400', chip: 'bg-amber-50 dark:bg-amber-500/10', label: 'Solid' };
  return negative
    ? { bar: 'from-amber-400 to-yellow-400', text: 'text-amber-600 dark:text-amber-400', chip: 'bg-amber-50 dark:bg-amber-500/10', label: 'Minor' }
    : { bar: 'from-sky-400 to-blue-400', text: 'text-sky-600 dark:text-sky-400', chip: 'bg-sky-50 dark:bg-sky-500/10', label: 'Niche' };
};

/* ---- Chat session types & persistence (per-workspace, localStorage) ---- */
type ChatMessage = { role: 'user' | 'assistant'; content: string };
type Conversation = { id: string; title: string; messages: ChatMessage[]; updatedAt: number };

const convStorageKey = (wsId?: string) => `veefore-sl-chats-${wsId || 'default'}`;

const loadConversations = (wsId?: string): Conversation[] => {
  try {
    const raw = localStorage.getItem(convStorageKey(wsId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
};

const saveConversations = (wsId: string | undefined, convs: Conversation[]) => {
  try { localStorage.setItem(convStorageKey(wsId), JSON.stringify(convs.slice(0, 30))); } catch { /* quota */ }
};

const titleFromMessage = (msg: string) => {
  const t = msg.trim().replace(/\s+/g, ' ');
  return t.length > 40 ? t.slice(0, 38) + '…' : t || 'New conversation';
};

const timeAgo = (ts: number) => {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); return `${d}d ago`;
};

/* Render light markdown (bold, line breaks, simple bullets/numbers) from the
   AI reply so users see formatted text instead of raw ** and \n. */
function FormattedMessage({ text }: { text: string }) {
  const renderInline = (s: string, keyBase: string) => {
    // Split on **bold** segments and render <strong> for the inner text.
    const parts = s.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      const m = part.match(/^\*\*([^*]+)\*\*$/);
      if (m) return <strong key={`${keyBase}-${i}`} className="font-bold">{m[1]}</strong>;
      // Also strip stray single asterisks / leftover markdown markers.
      return <span key={`${keyBase}-${i}`}>{part.replace(/\*\*/g, '')}</span>;
    });
  };

  // Normalize: turn " 1) " / " - " inline lists onto their own lines for clarity.
  const normalized = text
    .replace(/\s+(\d+\))\s+/g, '\n$1 ')
    .replace(/\s+[-•]\s+/g, '\n• ');

  const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean);
  return (
    <div className="space-y-1">
      {lines.map((line, i) => (
        <p key={i} className="leading-relaxed">{renderInline(line, `l${i}`)}</p>
      ))}
    </div>
  );
}

export default function SocialListeningPage() {
  const queryClient = useQueryClient();
  const { currentWorkspace } = useCurrentWorkspace();
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [showConvList, setShowConvList] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [railTab, setRailTab] = useState<'signals' | 'analyst' | 'alerts'>('signals');
  const [trendFilter, setTrendFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, railTab]);

  // Load saved conversations for this workspace.
  useEffect(() => {
    const convs = loadConversations(currentWorkspace?.id);
    setConversations(convs);
    if (convs.length > 0) {
      setActiveConvId(convs[0].id);
      setChatHistory(convs[0].messages);
    } else {
      setActiveConvId(null);
      setChatHistory([]);
    }
    setShowConvList(false);
  }, [currentWorkspace?.id]);

  // Persist the active conversation whenever the chat changes.
  const persistConversation = (msgs: ChatMessage[]) => {
    if (msgs.length === 0) return;
    setConversations((prev) => {
      let id = activeConvId;
      let next: Conversation[];
      const firstUser = msgs.find((m) => m.role === 'user');
      const title = firstUser ? titleFromMessage(firstUser.content) : 'New conversation';
      if (id && prev.some((c) => c.id === id)) {
        next = prev.map((c) => c.id === id ? { ...c, messages: msgs, title, updatedAt: Date.now() } : c);
      } else {
        id = `conv_${Date.now()}`;
        setActiveConvId(id);
        next = [{ id, title, messages: msgs, updatedAt: Date.now() }, ...prev];
      }
      next.sort((a, b) => b.updatedAt - a.updatedAt);
      saveConversations(currentWorkspace?.id, next);
      return next;
    });
  };

  const startNewChat = () => {
    setActiveConvId(null);
    setChatHistory([]);
    setChatMessage('');
    setShowConvList(false);
  };

  const openConversation = (id: string) => {
    const conv = conversations.find((c) => c.id === id);
    if (conv) {
      setActiveConvId(id);
      setChatHistory(conv.messages);
      setShowConvList(false);
    }
  };

  const deleteConversation = (id: string) => {
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      saveConversations(currentWorkspace?.id, next);
      return next;
    });
    if (id === activeConvId) startNewChat();
  };

  const { data: userData } = useQuery({
    queryKey: ['social-listening-user-profile'],
    queryFn: async () => await apiRequest('/api/v1/user'),
  });
  const resolvedUser = userData?.data || userData?.user || null;
  const userNiche = (resolvedUser?.niche || resolvedUser?.preferences?.contentNiche || '').trim() || 'Not Set';

  const fetchLiveMutation = useMutation({
    mutationFn: async () => {
      if (!currentWorkspace?.id) throw new Error('No workspace');
      return await apiRequest(`/api/social-listening/fetch-live/${currentWorkspace.id}?niche=${encodeURIComponent(userNiche)}`, { method: 'POST' });
    },
    onSuccess: () => {
      // The sync now runs in the background; start polling its status so the
      // indicator stays accurate (and survives a refresh) until data is ready.
      queryClient.invalidateQueries({ queryKey: ['social-listening-sync-status', currentWorkspace?.id] });
    },
  });

  // Poll the live-sync status. Refresh-proof: on mount it reads the persisted
  // status, so reloading the page mid-sync still shows "Syncing… (phase, ETA)".
  // Polls quickly while a sync is active, then backs off once it completes.
  const { data: syncStatusData } = useQuery({
    queryKey: ['social-listening-sync-status', currentWorkspace?.id],
    queryFn: async () =>
      currentWorkspace?.id
        ? apiRequest(`/api/social-listening/sync-status/${currentWorkspace.id}`)
        : { status: null },
    enabled: !!currentWorkspace?.id,
    refetchInterval: (query) => {
      const active = (query.state.data as any)?.status?.active;
      return active ? 2500 : false;
    },
  });
  const syncStatus = syncStatusData?.status || null;
  // A background auto-refresh shouldn't block the button — clicking supersedes
  // it (and cancels its batch). Only an interactive sync disables the button.
  const interactiveSyncing = fetchLiveMutation.isPending || (!!syncStatus?.active && syncStatus?.mode === 'interactive');

  // When a background sync finishes, refresh all the dashboard panels once.
  const prevSyncingRef = useRef(false);
  useEffect(() => {
    if (prevSyncingRef.current && !syncStatus?.active && syncStatus?.phase === 'completed') {
      ['overview', 'timeline', 'clusters', 'hooks', 'posts', 'trending', 'summary', 'alerts', 'audience'].forEach((k) =>
        queryClient.invalidateQueries({ queryKey: [`social-listening-${k}`, currentWorkspace?.id] })
      );
    }
    prevSyncingRef.current = !!syncStatus?.active;
  }, [syncStatus?.active, syncStatus?.phase, currentWorkspace?.id]);

  const sl = (path: string) => `/api/social-listening/${path}/${currentWorkspace?.id}?niche=${encodeURIComponent(userNiche)}`;

  const { data: overviewData } = useQuery({
    queryKey: ['social-listening-overview', currentWorkspace?.id],
    queryFn: async () => (currentWorkspace?.id ? apiRequest(sl('dashboard/overview')) : { data: null }),
    enabled: !!currentWorkspace?.id,
  });
  const { data: timelineData, isLoading: timelineLoading } = useQuery({
    queryKey: ['social-listening-timeline', currentWorkspace?.id],
    queryFn: async () => (currentWorkspace?.id ? apiRequest(sl('dashboard/sentiment-timeline')) : { timeline: [] }),
    enabled: !!currentWorkspace?.id,
  });
  const { data: clusterData, isLoading: clusterLoading } = useQuery({
    queryKey: ['social-listening-clusters', currentWorkspace?.id],
    queryFn: async () => (currentWorkspace?.id ? apiRequest(sl('dashboard/topic-clusters')) : { clusters: [] }),
    enabled: !!currentWorkspace?.id,
  });
  const { data: hooksData, isLoading: hooksLoading } = useQuery({
    queryKey: ['social-listening-hooks', currentWorkspace?.id],
    queryFn: async () => (currentWorkspace?.id ? apiRequest(sl('dashboard/viral-hooks')) : { hooks: [], painPoints: [] }),
    enabled: !!currentWorkspace?.id,
  });
  const { data: postsData, isLoading: postsLoading } = useQuery({
    queryKey: ['social-listening-posts', currentWorkspace?.id],
    queryFn: async () => (currentWorkspace?.id ? apiRequest(sl('posts')) : { posts: [] }),
    enabled: !!currentWorkspace?.id,
  });
  const { data: trendingData, isLoading: trendingLoading } = useQuery({
    queryKey: ['social-listening-trending', currentWorkspace?.id],
    queryFn: async () => (currentWorkspace?.id ? apiRequest(sl('dashboard/trending')) : { topics: [] }),
    enabled: !!currentWorkspace?.id,
  });
  const { data: summaryData } = useQuery({
    queryKey: ['social-listening-summary', currentWorkspace?.id],
    queryFn: async () => (currentWorkspace?.id ? apiRequest(sl('dashboard/summary')) : { data: null }),
    enabled: !!currentWorkspace?.id,
  });
  const { data: alertsData, isLoading: alertsLoading } = useQuery({
    queryKey: ['social-listening-alerts', currentWorkspace?.id],
    queryFn: async () => (currentWorkspace?.id ? apiRequest(sl('alerts')) : { alerts: [] }),
    enabled: !!currentWorkspace?.id,
  });
  const { data: audienceData, isLoading: audienceLoading } = useQuery({
    queryKey: ['social-listening-audience', currentWorkspace?.id],
    queryFn: async () => (currentWorkspace?.id ? apiRequest(sl('dashboard/audience')) : { data: null }),
    enabled: !!currentWorkspace?.id,
  });
  const { data: searchData, isFetching: searchLoading } = useQuery({
    queryKey: ['social-listening-search', currentWorkspace?.id, activeQuery],
    queryFn: async () => {
      if (!currentWorkspace?.id || !activeQuery) return null;
      return apiRequest(`/api/social-listening/search/${currentWorkspace.id}?niche=${encodeURIComponent(userNiche)}&q=${encodeURIComponent(activeQuery)}`);
    },
    enabled: !!currentWorkspace?.id && !!activeQuery,
    staleTime: 60_000,
  });

  const runSearch = () => { const q = searchQuery.trim(); if (q) setActiveQuery(q); };

  const chatMutation = useMutation({
    mutationFn: async (message: string) =>
      apiRequest(`/api/social-listening/chat/${currentWorkspace?.id}?niche=${encodeURIComponent(userNiche)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          // Send recent turns so the analyst has conversational memory.
          history: chatHistory.slice(-8),
          context: { userNiche },
        }),
      }),
    onSuccess: (data) => {
      // Safety net: if a reply ever arrives as a JSON blob, surface the text.
      let reply = data?.reply || 'I could not generate a response. Try asking about your niche trends, audience sentiment, or content ideas.';
      if (typeof reply === 'string') {
        const s = reply.trim();
        if (s.startsWith('{') && s.endsWith('}')) {
          try {
            const o = JSON.parse(s);
            reply = o.reply || o.message || o.answer || o.response || o.text || reply;
          } catch { /* keep as-is */ }
        }
      }
      setChatHistory((p) => {
        const next = [...p, { role: 'assistant' as const, content: reply }];
        persistConversation(next);
        return next;
      });
    },
    onError: () => {
      setChatHistory((p) => {
        const next = [...p, {
          role: 'assistant' as const,
          content: '⚠️ I had trouble reaching the AI service. Check your AI Configuration in Settings and try again.',
        }];
        persistConversation(next);
        return next;
      });
    },
  });
  const sendChat = (text: string) => {
    const msg = text.trim();
    if (!msg || chatMutation.isPending) return;
    if (userNiche === 'Not Set') {
      setChatHistory((p) => [...p, { role: 'assistant', content: 'Please set your niche in Settings first so I can analyze the right audience.' }]);
      return;
    }
    setChatHistory((p) => {
      const next = [...p, { role: 'user' as const, content: msg }];
      persistConversation(next);
      return next;
    });
    chatMutation.mutate(msg);
    setChatMessage('');
  };
  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendChat(chatMessage);
  };

  const overview = overviewData?.data || null;
  const timeline = timelineData?.timeline || [];
  const clusters = clusterData?.clusters || [];
  const hooks = hooksData?.hooks || [];
  const painPoints = hooksData?.painPoints || [];
  const posts = postsData?.posts || [];
  const trendingTopics = trendingData?.topics || [];
  const summary = summaryData?.data || null;
  const alerts = alertsData?.alerts || [];
  const audience = audienceData?.data || null;

  const sentimentLabel = overview?.sentimentLabel || ((overview?.averageSentiment || 0) > 0.2 ? 'Positive' : (overview?.averageSentiment || 0) < -0.2 ? 'Negative' : 'Neutral');
  const sentimentPct = Math.round(Math.max(0, Math.min(100, 50 + (overview?.averageSentiment || 0) * 50)));
  const nicheSet = userNiche !== 'Not Set';

  const filteredTrending = trendFilter === 'all'
    ? trendingTopics
    : trendingTopics.filter((t: any) => (t.priority || 'medium') === trendFilter);

  const exportTrendsCsv = () => {
    if (!trendingTopics.length) return;
    const header = ['Rank', 'Topic', 'Priority', 'Status', 'Mentions', 'Engagement', 'Growth%', 'Velocity', 'Sentiment', 'Hashtags', 'Description'];
    const rows = trendingTopics.map((t: any, i: number) => [
      i + 1, t.topic, t.priority, t.status, t.mentions, t.engagement, t.growth, t.velocity,
      t.sentiment, (t.hashtags || []).map((h: string) => `#${h}`).join(' '), t.description,
    ]);
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `social-listening-trends-${userNiche}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-50">
      {/* ============ HEADER ============ */}
      <div className="border-b border-gray-200/70 dark:border-gray-800/70 bg-white dark:bg-gray-800">
        <div className="px-5 lg:px-8 py-3 flex flex-wrap items-center gap-x-4 gap-y-3">
          {/* Brand + title */}
          <div className="flex items-center gap-2.5 mr-auto">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 to-sky-500 flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
              <Radio className="w-5 h-5 text-white" />
            </div>
            <div className="leading-tight">
              <h1 className="text-base lg:text-lg font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
                Social Intelligence
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  {/* skeleton-guard-allow: status-dot — live 'Live' status indicator dot, not a loading placeholder */}
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" /> Live
                </span>
              </h1>
              <Link href="/settings?tab=profile">
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-400 hover:text-blue-500 transition-colors cursor-pointer capitalize">
                  <Target className="w-3 h-3" /> Niche: {userNiche} <Settings className="w-2.5 h-2.5 opacity-60" />
                </span>
              </Link>
            </div>
          </div>

          {/* Search + actions */}
          <div className="relative flex-1 min-w-[200px] sm:max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
              placeholder="Search topics, #hashtags, @mentions…"
              className="w-full pl-10 pr-20 h-10 bg-gray-50 dark:bg-gray-900/60 border-gray-200 dark:border-gray-800 rounded-lg text-sm focus-visible:ring-blue-500"
            />
            <Button
              onClick={runSearch}
              disabled={!searchQuery.trim() || !nicheSet}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 px-3 rounded-md bg-gray-900 hover:bg-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 text-white text-xs font-semibold"
            >
              Search
            </Button>
          </div>
          <Button
            onClick={() => fetchLiveMutation.mutate()}
            disabled={interactiveSyncing || !nicheSet}
            className="h-10 px-4 rounded-lg bg-gradient-to-r from-blue-600 to-sky-500 hover:from-blue-700 hover:to-sky-600 text-white font-semibold text-sm shadow-md shadow-blue-500/20 disabled:opacity-50 shrink-0"
          >
            {/* skeleton-guard-allow: action-spinner — "Sync Live Data" button in-flight spinner, not a loading placeholder */}
            {interactiveSyncing ? <Loader2 className="w-4 h-4 sm:mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 sm:mr-2" />}
            <span className="hidden sm:inline">{interactiveSyncing ? 'Syncing…' : 'Sync Live Data'}</span>
          </Button>
        </div>

        {/* ============ LIVE SYNC STATUS BAR ============ */}
        {/* Refresh-proof: driven by the persisted server-side sync status, so the
            progress/ETA stays visible after a reload until data is genuinely ready. */}
        {syncStatus && (syncStatus.active || syncStatus.phase === 'failed') && (
          <SyncStatusBar status={syncStatus} />
        )}
      </div>

      <div className="px-5 lg:px-8 py-6">
        {/* ============ SEARCH RESULTS (overlay panel) ============ */}
        {activeQuery && (
          <div className="mb-6 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800/70">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-500 flex items-center justify-center"><Search className="w-[18px] h-[18px]" /></div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white leading-tight flex items-center gap-2">
                    Results for “{activeQuery}”
                    {searchData?.searchType && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400">{searchData.searchType}</span>
                    )}
                  </h3>
                  <p className="text-xs text-gray-400">Live across Reddit, YouTube, Hacker News &amp; News</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="text-gray-500 hover:text-gray-700" onClick={() => { setActiveQuery(''); setSearchQuery(''); }}>Clear</Button>
            </div>
            <div className="p-6">
              {searchLoading ? <SearchLoadingStatus /> : searchData?.summary ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { l: 'Mentions', v: fmtCompact(searchData.summary.totalMentions), c: 'text-blue-500' },
                      { l: 'Est. Reach', v: fmtCompact(searchData.summary.estimatedReach), c: 'text-sky-500' },
                      { l: 'Engagement', v: fmtCompact(searchData.summary.totalEngagement), c: 'text-blue-500' },
                      { l: 'Overall Mood', v: searchData.summary.overallSentiment, c: searchData.summary.overallSentiment === 'negative' ? 'text-rose-500' : 'text-emerald-500' },
                    ].map((s) => (
                      <div key={s.l} className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 bg-gray-50/50 dark:bg-gray-900/40">
                        <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">{s.l}</p>
                        <p className={`text-2xl font-black capitalize ${s.c}`}>{s.v}</p>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                      <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-3">Sentiment Split</p>
                      <div className="flex h-2.5 rounded-full overflow-hidden mb-2">
                        <div className="bg-emerald-500" style={{ width: `${searchData.summary.sentiment.positive}%` }} />
                        <div className="bg-gray-300 dark:bg-gray-600" style={{ width: `${searchData.summary.sentiment.neutral}%` }} />
                        <div className="bg-rose-500" style={{ width: `${searchData.summary.sentiment.negative}%` }} />
                      </div>
                      <div className="flex justify-between text-[11px] font-medium">
                        <span className="text-emerald-600">{searchData.summary.sentiment.positive}% pos</span>
                        <span className="text-gray-400">{searchData.summary.sentiment.neutral}% neu</span>
                        <span className="text-rose-600">{searchData.summary.sentiment.negative}% neg</span>
                      </div>
                    </div>
                    <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                      <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-3">Platforms</p>
                      <div className="space-y-1.5">
                        {Object.entries(searchData.summary.platformBreakdown || {}).map(([plat, count]: any) => (
                          <div key={plat} className="flex items-center justify-between text-xs">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${platformStyle(plat)}`}>{platformLabel(plat)}</span>
                            <span className="font-bold text-gray-900 dark:text-white">{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                      <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-3">Top Hashtags</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(searchData.summary.topHashtags || []).length > 0 ? searchData.summary.topHashtags.map((h: string) => (
                          <span key={h} className="text-[10px] font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 rounded-full px-2 py-0.5">#{h}</span>
                        )) : <span className="text-xs text-gray-400">No hashtags found</span>}
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-3">Matching Posts ({searchData.results?.length || 0})</p>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {(searchData.results || []).map((r: any) => (
                        <a key={r.id} href={r.url} target="_blank" rel="noopener noreferrer" className="block p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/40 hover:border-blue-300 dark:hover:border-blue-500/40 hover:shadow-md transition-all">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${platformStyle(r.platform)}`}>{platformLabel(r.platform)}</span>
                              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">@{r.author}</span>
                            </div>
                            {r.sentiment && <span className={`text-[10px] font-bold capitalize ${r.sentiment === 'positive' ? 'text-emerald-500' : r.sentiment === 'negative' ? 'text-rose-500' : 'text-gray-400'}`}>{r.sentiment}</span>}
                          </div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-1 mb-1">{r.title}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">{r.content}</p>
                          <div className="flex items-center gap-3 text-[11px] text-gray-400">
                            <span className="flex items-center"><Heart className="w-3 h-3 mr-1" /> {fmtCompact(r.metrics?.likes || 0)}</span>
                            <span className="flex items-center"><MessageCircle className="w-3 h-3 mr-1" /> {fmtCompact(r.metrics?.comments || 0)}</span>
                            {r.metrics?.views > 0 && <span className="flex items-center"><Eye className="w-3 h-3 mr-1" /> {fmtCompact(r.metrics.views)}</span>}
                            <span className="ml-auto text-blue-500 font-semibold">{r.relevance}% match</span>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-gray-500 text-sm">No results found for “{activeQuery}”. Try a different keyword or hashtag.</div>
              )}
            </div>
          </div>
        )}

        {/* ============ MAIN GRID: content (8) + intelligence rail (4) ============ */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* ---------- MAIN COLUMN ---------- */}
          <div className="xl:col-span-8 space-y-6">
            {/* Bento KPI cluster: big sentiment tile + 3 stacked metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Hero sentiment tile spans 1 col but taller visual weight */}
              <div className="sm:row-span-2 relative overflow-hidden rounded-2xl border border-blue-200/60 dark:border-blue-500/20 bg-gradient-to-br from-blue-50 to-sky-50/50 dark:from-blue-950/40 dark:to-gray-800 p-5 flex flex-col justify-between">
                <div className="absolute -top-10 -right-10 w-36 h-36 bg-blue-400/10 blur-3xl rounded-full pointer-events-none" />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-white/70 dark:bg-gray-900/60 flex items-center justify-center text-emerald-500"><Activity className="w-5 h-5" /></div>
                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Overall Sentiment</p>
                  </div>
                  <p className={`text-4xl font-black tracking-tight ${sentimentLabel === 'Negative' ? 'text-rose-500' : sentimentLabel === 'Positive' ? 'text-emerald-500' : 'text-gray-500'}`}>{sentimentLabel}</p>
                  <p className="text-xs text-gray-400 mt-1">{sentimentPct}% positive lean</p>
                </div>
                <div className="relative mt-5">
                  <div className="w-full bg-white/60 dark:bg-gray-800 rounded-full h-2.5 overflow-hidden flex">
                    <div className="bg-emerald-500 h-full transition-all" style={{ width: `${sentimentPct}%` }} />
                    <div className="bg-rose-400 h-full transition-all" style={{ width: `${100 - sentimentPct}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] font-semibold text-gray-400 mt-1.5">
                    <span>Negative</span><span>Positive</span>
                  </div>
                </div>
              </div>

              {/* Mentions */}
              <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 p-5 flex items-center justify-between shadow-sm">
                <div>
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Total Mentions</p>
                  <p className="text-3xl font-black tracking-tight text-gray-900 dark:text-white">{fmtCompact(overview?.totalMentions || 0)}</p>
                  <p className="text-[11px] font-semibold text-gray-400 mt-0.5">Niche-filtered</p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-500 flex items-center justify-center"><MessageSquare className="w-5 h-5" /></div>
              </div>

              {/* Active trends */}
              <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 p-5 flex items-center justify-between shadow-sm">
                <div>
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Active Trends</p>
                  <p className="text-3xl font-black tracking-tight text-gray-900 dark:text-white">{overview?.activeTrends ?? 0}</p>
                  <p className="text-[11px] font-semibold text-gray-400 mt-0.5">Tracked now</p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-sky-50 dark:bg-sky-500/10 text-sky-500 flex items-center justify-center"><TrendingUp className="w-5 h-5" /></div>
              </div>

              {/* Risk factors (spans 2 to balance bottom row) */}
              <div className="sm:col-span-2 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 p-5 flex items-center justify-between shadow-sm">
                <div>
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Risk Factors</p>
                  <p className={`text-3xl font-black tracking-tight ${(overview?.topPainPoints || 0) > 0 ? 'text-rose-500' : 'text-gray-900 dark:text-white'}`}>{overview?.topPainPoints ?? 0}</p>
                  <p className="text-[11px] font-semibold text-gray-400 mt-0.5">{(overview?.topPainPoints || 0) > 0 ? 'Audience pain points need attention' : 'Audience stable — no critical issues'}</p>
                </div>
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${(overview?.topPainPoints || 0) > 0 ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-500' : 'bg-gray-50 dark:bg-gray-800 text-gray-400'}`}><AlertTriangle className="w-5 h-5" /></div>
              </div>
            </div>

            {/* Velocity matrix */}
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 shadow-sm flex flex-col h-[380px]">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-800/70">
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-500 flex items-center justify-center"><BarChart3 className="w-[18px] h-[18px]" /></div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white leading-tight">Topic Velocity Matrix</h3>
                  <p className="text-xs text-gray-400">Growth velocity vs. mention volume — bigger &amp; higher = hotter</p>
                </div>
              </div>
              <div className="flex-1 p-5">
                {clusterLoading ? (
                  <Skeleton variant="chart" className="h-full w-full rounded-xl" />
                ) : clusters.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-gray-800" opacity={0.6} />
                      <XAxis type="number" dataKey="volume" name="Volume" stroke="currentColor" className="text-gray-400" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} domain={[0, 'dataMax + 5']} />
                      <YAxis type="number" dataKey="velocity" name="Velocity" stroke="currentColor" className="text-gray-400" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                      <ZAxis type="number" dataKey="volume" range={[120, 700]} />
                      <RechartsTooltip cursor={{ strokeDasharray: '3 3', stroke: '#2563eb' }} content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const d = payload[0].payload;
                          return (
                            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-3 rounded-xl shadow-xl">
                              <p className="text-gray-900 dark:text-white font-bold mb-2 flex items-center"><Flame className="w-4 h-4 text-blue-500 mr-1.5" /> {d.topic}</p>
                              <p className="text-xs text-gray-500 flex justify-between gap-6"><span>Mentions</span><span className="font-bold text-gray-900 dark:text-white">{d.volume}</span></p>
                              <p className="text-xs text-gray-500 flex justify-between gap-6"><span>Velocity</span><span className="font-bold text-blue-600">+{d.velocity}%</span></p>
                            </div>
                          );
                        }
                        return null;
                      }} />
                      <Scatter name="Topics" data={clusters} fill="#2563eb" fillOpacity={0.8} shape="circle" />
                    </ScatterChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-gray-300 dark:text-gray-600">
                    <TrendingUp className="w-12 h-12 mb-3" />
                    <p className="text-sm font-medium text-gray-400">Awaiting data signals…</p>
                  </div>
                )}
              </div>
            </div>

            {/* Mood history */}
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 shadow-sm flex flex-col h-[300px]">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-800/70">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500 flex items-center justify-center"><Activity className="w-[18px] h-[18px]" /></div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white leading-tight">Audience Mood History</h3>
                  <p className="text-xs text-gray-400">Positive vs. negative sentiment over time</p>
                </div>
              </div>
              <div className="flex-1 p-5">
                {timelineLoading ? (
                  <Skeleton variant="chart" className="h-full w-full rounded-xl" />
                ) : timeline.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={timeline} margin={{ top: 10, right: 0, left: -25, bottom: 0 }}>
                      <defs>
                        <linearGradient id="cPos" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.4} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                        <linearGradient id="cNeg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4} /><stop offset="95%" stopColor="#f43f5e" stopOpacity={0} /></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-gray-200 dark:text-gray-800" opacity={0.5} />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} stroke="currentColor" className="text-gray-400" tick={{ fontSize: 11 }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} stroke="currentColor" className="text-gray-400" tick={{ fontSize: 11 }} />
                      <RechartsTooltip contentStyle={{ backgroundColor: 'rgba(17,24,39,0.95)', borderColor: '#374151', borderRadius: '12px', color: '#f9fafb' }} />
                      <Area type="monotone" dataKey="positive" stroke="#10b981" strokeWidth={3} fill="url(#cPos)" />
                      <Area type="monotone" dataKey="negative" stroke="#f43f5e" strokeWidth={3} fill="url(#cNeg)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-gray-300 dark:text-gray-600"><Activity className="w-10 h-10 mb-2" /><p className="text-sm text-gray-400">No historical data.</p></div>
                )}
              </div>
            </div>

            {/* Trending topics — ranked vertical list (new structure) */}
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-gray-100 dark:border-gray-800/70">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-500 flex items-center justify-center"><Flame className="w-[18px] h-[18px]" /></div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-white leading-tight">Trending Topics</h3>
                    <p className="text-xs text-gray-400">Ranked by momentum in your niche</p>
                  </div>
                </div>
                <div className="flex items-center gap-5">
                  {[
                    { l: 'Keywords', v: summary?.keywordsMonitored ?? 0, c: 'text-gray-900 dark:text-white' },
                    { l: 'Mentions', v: fmtCompact(summary?.totalMentions ?? 0), c: 'text-gray-900 dark:text-white' },
                    { l: 'Alerts', v: summary?.activeAlerts ?? 0, c: 'text-amber-500' },
                  ].map((s) => (
                    <div key={s.l} className="text-center">
                      <div className={`text-lg font-black ${s.c}`}>{s.v}</div>
                      <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">{s.l}</div>
                    </div>
                  ))}
                  <button
                    onClick={exportTrendsCsv}
                    disabled={!trendingTopics.length}
                    title="Export trends to CSV"
                    className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-40"
                  >
                    <Download className="w-3.5 h-3.5" /> Export
                  </button>
                </div>
              </div>
              {/* Priority filter chips */}
              {trendingTopics.length > 0 && (
                <div className="flex items-center gap-2 px-6 pt-4">
                  <Filter className="w-3.5 h-3.5 text-gray-400" />
                  {(['all', 'high', 'medium', 'low'] as const).map((f) => {
                    const count = f === 'all' ? trendingTopics.length : trendingTopics.filter((t: any) => (t.priority || 'medium') === f).length;
                    return (
                      <button
                        key={f}
                        onClick={() => setTrendFilter(f)}
                        className={`text-[11px] font-bold capitalize px-2.5 py-1 rounded-full transition-all ${trendFilter === f ? 'bg-gray-900 dark:bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                      >
                        {f} <span className="opacity-60">{count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="p-4">
                {trendingLoading ? (
                  <div className="space-y-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} variant="card" className="h-24 rounded-xl" />)}</div>
                ) : filteredTrending.length > 0 ? (
                  <div className="space-y-2.5">
                    {filteredTrending.map((t: any, i: number) => (
                      <div key={t.id} className="group flex gap-4 rounded-xl p-4 border border-transparent hover:border-blue-200 dark:hover:border-blue-500/30 hover:bg-gray-50/70 dark:hover:bg-gray-900/40 transition-all">
                        <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black ${rankBadge(i)}`}>{i + 1}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3 mb-1">
                            <h4 className="font-bold text-gray-900 dark:text-white text-sm leading-snug">{t.topic}</h4>
                            <span className={`text-[10px] font-bold uppercase tracking-wide shrink-0 px-2.5 py-1 rounded-full ${priorityChip(t.priority)}`}>{t.priority}</span>
                          </div>
                          <p className="text-[13px] text-gray-500 dark:text-gray-400 leading-relaxed mb-2 line-clamp-2">{t.description}</p>
                          {t.hashtags?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {t.hashtags.map((h: string) => (
                                <span key={h} className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 rounded-full px-2 py-0.5"><Hash className="w-2.5 h-2.5" />{h}</span>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center gap-4 text-[11px] font-medium text-gray-400">
                            <span className="flex items-center"><MessageCircle className="w-3.5 h-3.5 mr-1" /> {fmtCompact(t.mentions)}</span>
                            <span className="flex items-center"><Eye className="w-3.5 h-3.5 mr-1" /> {fmtCompact(t.engagement)}</span>
                            <span className={`flex items-center font-bold ${t.sentiment === 'negative' ? 'text-rose-500' : 'text-emerald-500'}`}><ArrowUpRight className="w-3.5 h-3.5 mr-0.5" /> +{t.growth}%</span>
                            <span className="ml-auto text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">{t.status}</span>
                          </div>
                          <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 overflow-hidden mt-2">
                            <div className="bg-gradient-to-r from-blue-600 to-sky-500 h-full rounded-full transition-all" style={{ width: `${Math.min(100, t.velocity)}%` }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-12 text-center text-gray-400 text-sm">{trendingTopics.length > 0 ? `No ${trendFilter} priority topics. Try another filter.` : 'No trending topics yet. Hit “Sync Live Data” to analyze your niche.'}</div>
                )}
              </div>
            </div>

            {/* Viral hooks — horizontal scroll strip (new structure) */}
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 shadow-sm">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-800/70">
                <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-500 flex items-center justify-center"><Lightbulb className="w-[18px] h-[18px]" /></div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white leading-tight">Viral Hooks</h3>
                  <p className="text-xs text-gray-400">Reusable angles pulled from top-performing posts</p>
                </div>
              </div>
              <div className="p-5">
                {hooksLoading ? (
                  <div className="flex gap-3 overflow-hidden">{[1, 2, 3].map((i) => <Skeleton key={i} variant="card" className="h-28 w-72 shrink-0 rounded-xl" />)}</div>
                ) : hooks.length > 0 ? (
                  <div className="flex gap-3 overflow-x-auto custom-scrollbar pb-2 -mb-2">
                    {hooks.map((hook: any, i: number) => {
                      const tone = scoreTone(hook.score || 0);
                      return (
                        <div key={i} className="group shrink-0 w-72 rounded-xl p-4 border border-gray-200 dark:border-gray-800 bg-gradient-to-br from-amber-50/40 to-white dark:from-amber-950/20 dark:to-gray-800 hover:border-amber-300 dark:hover:border-amber-500/40 hover:shadow-md transition-all flex flex-col justify-between">
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 leading-snug mb-3 line-clamp-3">“{hook.content}”</p>
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className={`inline-flex items-center gap-1 text-[10px] font-bold ${tone.text} ${tone.chip} rounded-full px-2 py-0.5`}><Sparkles className="w-2.5 h-2.5" /> {tone.label} · {hook.score}</span>
                              <Link href="/create"><span className="text-[10px] font-bold uppercase text-gray-400 group-hover:text-blue-500 transition-colors cursor-pointer">Use →</span></Link>
                            </div>
                            <div className="w-full bg-gray-100 dark:bg-gray-700/60 rounded-full h-1.5 overflow-hidden">
                              <div className={`bg-gradient-to-r ${tone.bar} h-full rounded-full transition-all`} style={{ width: `${Math.min(100, hook.score || 0)}%` }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : <p className="text-sm text-gray-400 text-center py-8">No hooks detected yet.</p>}
              </div>
            </div>

            {/* Audience Intelligence — emotions, platform mix, hashtag cloud */}
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 shadow-sm">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-800/70">
                <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-500/10 text-sky-500 flex items-center justify-center"><Users className="w-[18px] h-[18px]" /></div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white leading-tight">Audience Intelligence</h3>
                  <p className="text-xs text-gray-400">{audience ? `Derived from ${audience.totalAnalyzed} analyzed posts` : 'How your niche audience feels & where they talk'}</p>
                </div>
              </div>
              <div className="p-6">
                {audienceLoading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} variant="card" className="h-32 rounded-xl" />)}</div>
                ) : audience && audience.totalAnalyzed > 0 ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {/* Emotions */}
                      <div>
                        <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-1.5"><Smile className="w-3.5 h-3.5 text-amber-500" /> Dominant Emotions</p>
                        {audience.topEmotions?.length > 0 ? (
                          <div className="space-y-2">
                            {audience.topEmotions.map((e: any) => {
                              const max = audience.topEmotions[0].count || 1;
                              return (
                                <div key={e.emotion} className="flex items-center gap-2">
                                  <span className="text-base w-6 text-center">{emotionEmoji(e.emotion)}</span>
                                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300 capitalize w-24 shrink-0">{e.emotion}</span>
                                  <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-2 overflow-hidden">
                                    <div className="bg-gradient-to-r from-amber-400 to-orange-400 h-full rounded-full" style={{ width: `${Math.round((e.count / max) * 100)}%` }} />
                                  </div>
                                  <span className="text-[11px] font-bold text-gray-400 w-6 text-right">{e.count}</span>
                                </div>
                              );
                            })}
                          </div>
                        ) : <p className="text-xs text-gray-400">No emotion data yet.</p>}
                      </div>

                      {/* Platform mix */}
                      <div>
                        <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-blue-500" /> Where Conversations Happen</p>
                        {audience.platformMix?.length > 0 ? (
                          <div className="space-y-2.5">
                            {audience.platformMix.map((p: any) => (
                              <div key={p.platform} className="flex items-center gap-2">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase w-14 text-center ${platformStyle(p.platform)}`}>{platformLabel(p.platform)}</span>
                                <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-2 overflow-hidden">
                                  <div className="bg-gradient-to-r from-blue-500 to-sky-500 h-full rounded-full" style={{ width: `${p.pct}%` }} />
                                </div>
                                <span className="text-[11px] font-bold text-gray-500 w-16 text-right">{p.count} · {p.pct}%</span>
                              </div>
                            ))}
                          </div>
                        ) : <p className="text-xs text-gray-400">No platform data yet.</p>}
                      </div>
                    </div>

                    {/* Top voices */}
                    {audience.topVoices?.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-1.5"><Crown className="w-3.5 h-3.5 text-amber-500" /> Influential Voices</p>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                          {audience.topVoices.map((v: any) => {
                            const inner = (
                              <>
                                <div className="flex items-center gap-2 mb-2">
                                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-600 to-sky-500 text-white flex items-center justify-center text-[11px] font-bold shrink-0">{(v.username || '?').charAt(0).toUpperCase()}</div>
                                  <span className="text-xs font-bold text-gray-800 dark:text-gray-100 truncate flex-1">@{v.username}</span>
                                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0 ${platformStyle(v.platform)}`}>{platformLabel(v.platform)}</span>
                                </div>
                                <div className="flex items-center gap-3 text-[10px] font-medium text-gray-400">
                                  {v.followerCount > 0 && <span className="flex items-center gap-1"><Users className="w-3 h-3" />{fmtCompact(v.followerCount)}</span>}
                                  <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-blue-500" />{fmtCompact(v.engagement)}</span>
                                  <span className="ml-auto" title="Posts by this creator within the analyzed sample">{v.posts} in sample</span>
                                </div>
                              </>
                            );
                            return v.url ? (
                              <a key={v.username} href={v.url} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-gray-200 dark:border-gray-800 p-3 bg-gray-50/50 dark:bg-gray-900/40 hover:border-blue-300 dark:hover:border-blue-500/40 transition-colors">{inner}</a>
                            ) : (
                              <div key={v.username} className="rounded-xl border border-gray-200 dark:border-gray-800 p-3 bg-gray-50/50 dark:bg-gray-900/40">{inner}</div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Engagement leaders */}
                    {audience.engagementLeaders?.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-blue-500" /> Top-Performing Posts</p>
                        <div className="space-y-2">
                          {audience.engagementLeaders.map((p: any, i: number) => (
                            <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-500/40 hover:bg-gray-50/70 dark:hover:bg-gray-900/40 transition-all">
                              <span className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black ${rankBadge(i)}`}>{i + 1}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-semibold text-gray-800 dark:text-gray-100 truncate">{p.title}</p>
                                <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5">
                                  <span className={`px-1 py-0.5 rounded uppercase font-bold ${platformStyle(p.platform)}`}>{platformLabel(p.platform)}</span>
                                  <span>@{p.author}</span>
                                  {p.sentiment && <span className={`font-bold capitalize ${p.sentiment === 'positive' ? 'text-emerald-500' : p.sentiment === 'negative' ? 'text-rose-500' : 'text-gray-400'}`}>{p.sentiment}</span>}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-sm font-black text-blue-600 dark:text-blue-400">{fmtCompact(p.engagement)}</p>
                                <p className="text-[10px] text-gray-400">engagement</p>
                              </div>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Hashtag cloud */}
                    {audience.topHashtags?.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-1.5"><Hash className="w-3.5 h-3.5 text-blue-500" /> Trending Hashtags</p>
                        <div className="flex flex-wrap gap-2">
                          {audience.topHashtags.map((h: any) => {
                            const max = audience.topHashtags[0].count || 1;
                            const scale = 0.72 + (h.count / max) * 0.6;
                            return (
                              <span key={h.tag} className="inline-flex items-center gap-1 font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 rounded-full px-2.5 py-1" style={{ fontSize: `${scale}rem` }}>
                                <Hash className="w-3 h-3 opacity-60" />{h.tag}
                                <span className="text-[9px] opacity-50">{h.count}</span>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-12 text-center text-gray-400 text-sm">No audience data yet. Hit “Sync Live Data” to build your audience profile.</div>
                )}
              </div>
            </div>

            {/* Pain Points — audience frustrations to address in content */}
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 shadow-sm">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-800/70">
                <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-500 flex items-center justify-center"><ShieldAlert className="w-[18px] h-[18px]" /></div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white leading-tight">Audience Pain Points</h3>
                  <p className="text-xs text-gray-400">Frustrations to solve in your next post</p>
                </div>
              </div>
              <div className="p-5">
                {hooksLoading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{[1, 2].map((i) => <Skeleton key={i} variant="card" className="h-16 rounded-xl" />)}</div>
                ) : painPoints.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {painPoints.map((pp: any, i: number) => {
                      const tone = scoreTone(pp.score || 0, true);
                      return (
                        <div key={i} className="flex items-start gap-3 rounded-xl p-4 border border-gray-200 dark:border-gray-800 bg-gradient-to-br from-rose-50/40 to-white dark:from-rose-950/20 dark:to-gray-800">
                          <div className="shrink-0 w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-500/15 text-rose-500 flex items-center justify-center"><AlertTriangle className="w-4 h-4" /></div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-medium text-gray-700 dark:text-gray-200 leading-snug">{pp.content}</p>
                            <div className="flex items-center gap-2 mt-1.5 mb-1.5">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${platformStyle(pp.platform)}`}>{platformLabel(pp.platform)}</span>
                              <span className={`text-[10px] font-bold ${tone.text}`}>{tone.label} · {pp.score}</span>
                            </div>
                            <div className="w-full bg-gray-100 dark:bg-gray-700/60 rounded-full h-1.5 overflow-hidden">
                              <div className={`bg-gradient-to-r ${tone.bar} h-full rounded-full transition-all`} style={{ width: `${Math.min(100, pp.score || 0)}%` }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-8">No pain points detected — your audience seems content.</p>
                )}
              </div>
            </div>
          </div>

          {/* ---------- STICKY INTELLIGENCE RAIL ---------- */}
          <div className="xl:col-span-4">
            <div className="xl:sticky xl:top-4 space-y-4">
              {/* Tab switcher */}
              <div className="flex p-1 rounded-xl bg-gray-100 dark:bg-gray-900/70 border border-gray-200 dark:border-gray-800">
                <button
                  onClick={() => setRailTab('signals')}
                  className={`flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg text-xs font-bold transition-all ${railTab === 'signals' ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                >
                  <Radio className="w-3.5 h-3.5" /> Signals
                </button>
                <button
                  onClick={() => setRailTab('alerts')}
                  className={`relative flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg text-xs font-bold transition-all ${railTab === 'alerts' ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                >
                  <Bell className="w-3.5 h-3.5" /> Alerts
                  {alerts.length > 0 && (
                    <span className="absolute top-1 right-2 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">{alerts.length}</span>
                  )}
                </button>
                <button
                  onClick={() => setRailTab('analyst')}
                  className={`flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg text-xs font-bold transition-all ${railTab === 'analyst' ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                >
                  <Bot className="w-3.5 h-3.5" /> Analyst
                </button>
              </div>

              {/* Smart alerts feed */}
              {railTab === 'alerts' && (
                <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 shadow-sm flex flex-col h-[640px] overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-800/70 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Smart Alerts</span>
                    <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">{alerts.length} active</span>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
                    {alertsLoading ? (
                      <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} variant="card" className="h-20 rounded-xl" />)}</div>
                    ) : alerts.length > 0 ? alerts.map((a: any, i: number) => {
                      const st = alertStyle(a.type);
                      return (
                        <div key={i} className={`rounded-xl border p-3.5 ${st.ring}`}>
                          <div className="flex items-start gap-2.5">
                            <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${st.icon}`}><st.Icon className="w-4 h-4" /></div>
                            <div className="min-w-0">
                              <p className="text-[13px] font-bold text-gray-900 dark:text-white leading-snug">{a.title}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mt-0.5">{a.detail}</p>
                            </div>
                          </div>
                        </div>
                      );
                    }) : (
                      <div className="h-full flex flex-col items-center justify-center text-gray-400 text-sm px-6 text-center"><Bell className="w-8 h-8 mb-2 text-gray-300" />No alerts right now. You're all caught up.</div>
                    )}
                  </div>
                </div>
              )}

              {/* Live signals feed */}
              {railTab === 'signals' && (
                <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 shadow-sm flex flex-col h-[640px] overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-800/70 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Latest matching posts</span>
                    {/* skeleton-guard-allow: status-dot — live 'Live' matching-posts status indicator dot, not a loading placeholder */}
                    <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" /> {posts.length}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {postsLoading ? (
                      <div className="p-5 space-y-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} variant="rectangle" className="h-16 rounded-lg" />)}</div>
                    ) : posts.length > 0 ? (
                      <div className="divide-y divide-gray-100 dark:divide-gray-800/70">
                        {posts.slice(0, 200).map((post: any) => (
                          <div key={post._id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors group">
                            <div className="flex justify-between items-center mb-1.5">
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${platformStyle(post.platform)}`}>{platformLabel(post.platform)}</span>
                                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">@{post.author?.username || 'anon'}</span>
                              </div>
                              <a href={post.url} target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-blue-500"><ExternalLink className="w-3.5 h-3.5" /></a>
                            </div>
                            <p className="text-[13px] text-gray-600 dark:text-gray-300 line-clamp-2 leading-relaxed mb-2">{post.title || post.content}</p>
                            <div className="flex items-center gap-3 text-[11px] text-gray-400">
                              <span className="flex items-center"><Heart className="w-3 h-3 mr-1" /> {fmtCompact(post.metrics?.likes || 0)}</span>
                              <span className="flex items-center"><MessageCircle className="w-3 h-3 mr-1" /> {fmtCompact(post.metrics?.comments || 0)}</span>
                              {post.metrics?.views > 0 && <span className="flex items-center"><Eye className="w-3 h-3 mr-1" /> {fmtCompact(post.metrics.views)}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-gray-400 text-sm px-6 text-center"><Radio className="w-8 h-8 mb-2 text-gray-300" />No live signals yet. Hit “Sync Live Data”.</div>
                    )}
                  </div>
                </div>
              )}

              {/* AI analyst */}
              {railTab === 'analyst' && (
                <div className="rounded-2xl border border-blue-200/60 dark:border-blue-500/20 bg-gradient-to-br from-blue-50/60 to-sky-50/40 dark:from-blue-950/30 dark:to-gray-800 shadow-sm flex flex-col h-[640px] overflow-hidden relative">
                  <div className="px-4 py-3 border-b border-blue-100/60 dark:border-blue-500/10 flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-sky-500 flex items-center justify-center shadow-lg shadow-blue-500/30 shrink-0"><Bot className="w-4 h-4 text-white" /></div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate">
                        {activeConvId ? (conversations.find((c) => c.id === activeConvId)?.title || 'AI Analyst') : 'AI Analyst'}
                      </h3>
                      <p className="text-[11px] text-gray-400">Niche &amp; audience insights</p>
                    </div>
                    <button
                      onClick={() => setShowConvList((v) => !v)}
                      title="Conversation history"
                      className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${showConvList ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700/60'}`}
                    >
                      <History className="w-4 h-4" />
                      {conversations.length > 0 && (
                        <span className="absolute -mt-5 ml-5 min-w-[15px] h-[15px] px-1 rounded-full bg-blue-500 text-white text-[8px] font-bold flex items-center justify-center">{conversations.length}</span>
                      )}
                    </button>
                    <button
                      onClick={startNewChat}
                      title="New chat"
                      className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700/60 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                      <MessageSquarePlus className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Conversation history dropdown */}
                  {showConvList && (
                    <div className="absolute inset-0 z-20 bg-white dark:bg-gray-800 flex flex-col">
                      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700/70 flex items-center justify-between">
                        <span className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2"><History className="w-4 h-4 text-blue-500" /> Conversations</span>
                        <button onClick={() => setShowConvList(false)} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-4 h-4" /></button>
                      </div>
                      <button onClick={startNewChat} className="mx-3 mt-3 flex items-center justify-center gap-2 h-9 rounded-lg bg-gradient-to-r from-blue-600 to-sky-500 text-white text-xs font-bold shadow-sm hover:from-blue-700 hover:to-sky-600 transition-colors">
                        <Plus className="w-4 h-4" /> New Chat
                      </button>
                      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1.5">
                        {conversations.length === 0 ? (
                          <p className="text-xs text-gray-400 text-center py-10">No past conversations yet.</p>
                        ) : conversations.map((c) => (
                          <div
                            key={c.id}
                            onClick={() => openConversation(c.id)}
                            className={`group flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer transition-colors ${c.id === activeConvId ? 'bg-blue-50 dark:bg-blue-500/10 border border-blue-200/60 dark:border-blue-500/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border border-transparent'}`}
                          >
                            <MessageSquarePlus className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">{c.title}</p>
                              <p className="text-[10px] text-gray-400">{c.messages.length} messages · {timeAgo(c.updatedAt)}</p>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteConversation(c.id); }}
                              title="Delete"
                              className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-gray-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                    {chatHistory.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center px-2">
                        <div className="w-12 h-12 rounded-2xl bg-white dark:bg-gray-900 flex items-center justify-center mb-3 shadow-sm border border-gray-200 dark:border-gray-800"><Zap className="w-6 h-6 text-blue-500" /></div>
                        <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-1">Ask your Social Analyst</p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-4 max-w-[230px]">I analyze your niche's trends, sentiment, hooks &amp; pain points. Try one of these:</p>
                        <div className="flex flex-col gap-2 w-full">
                          {ANALYST_HINTS.slice(0, 4).map((q) => (
                            <button
                              key={q}
                              onClick={() => sendChat(q)}
                              disabled={chatMutation.isPending}
                              className="group flex items-center gap-2 text-left text-[12px] font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 hover:border-blue-300 dark:hover:border-blue-500/40 hover:text-blue-600 dark:hover:text-blue-400 transition-colors disabled:opacity-50"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                              <span className="flex-1">{q}</span>
                              <Send className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {chatHistory.map((msg, i) => (
                          <div key={i} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            {msg.role === 'assistant' && (
                              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-600 to-sky-500 flex items-center justify-center shrink-0 shadow-sm"><Bot className="w-3.5 h-3.5 text-white" /></div>
                            )}
                            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs font-medium leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-gradient-to-r from-blue-600 to-sky-500 text-white rounded-br-sm' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-bl-sm'}`}>{msg.role === 'assistant' ? <FormattedMessage text={msg.content} /> : msg.content}</div>
                          </div>
                        ))}
                        {chatMutation.isPending && (
                          <div className="flex items-end gap-2 justify-start">
                            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-600 to-sky-500 flex items-center justify-center shrink-0 shadow-sm"><Bot className="w-3.5 h-3.5 text-white" /></div>
                            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center space-x-1.5"><div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" /><div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} /><div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} /></div>
                          </div>
                        )}
                        <div ref={chatEndRef} />
                      </div>
                    )}
                  </div>
                  {/* Quick-hint chips above input (only once a convo started) */}
                  {chatHistory.length > 0 && (
                    <div className="px-3 pt-2 flex gap-1.5 overflow-x-auto custom-scrollbar">
                      {ANALYST_HINTS.map((q) => (
                        <button
                          key={q}
                          onClick={() => sendChat(q)}
                          disabled={chatMutation.isPending}
                          className="shrink-0 text-[10px] font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 rounded-full px-2.5 py-1 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors disabled:opacity-50 whitespace-nowrap"
                        >
                          {q.length > 28 ? q.slice(0, 26) + '…' : q}
                        </button>
                      ))}
                    </div>
                  )}
                  <form onSubmit={handleChatSubmit} className="relative p-3 border-t border-blue-100/60 dark:border-blue-500/10">
                    <Input
                      value={chatMessage}
                      onChange={(e) => setChatMessage(e.target.value)}
                      placeholder="Ask about your niche…"
                      maxLength={600}
                      className="pr-11 bg-white dark:bg-gray-900/80 border-gray-200 dark:border-gray-700 rounded-xl h-10 text-xs focus-visible:ring-blue-500"
                      disabled={chatMutation.isPending}
                    />
                    <Button type="submit" size="icon" className="absolute right-4 top-1/2 -translate-y-1/2 h-7 w-7 rounded-lg bg-gradient-to-r from-blue-600 to-sky-500 hover:from-blue-700 hover:to-sky-600 text-white disabled:opacity-50" disabled={chatMutation.isPending || !chatMessage.trim()}>
                      {/* skeleton-guard-allow: action-spinner — chat send button in-flight spinner, not a loading placeholder */}
                      {chatMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    </Button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
