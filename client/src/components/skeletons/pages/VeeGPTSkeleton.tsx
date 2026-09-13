import React from 'react'
import {
  Edit, Search, Edit3, Rocket, Paperclip, Send,
  Lightbulb, TrendingUp, Camera, Target, Calendar, PenSquare,
  PanelLeft, ChevronDown, Images,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import type { ShellChrome } from '@/lib/bootstrap'

/**
 * VeeGPTSkeleton — Page_Skeleton for the `/veegpt` route.
 *
 * The VeeGPT chrome is STATIC (the conversation-sidebar logo + New chat + nav,
 * the welcome screen's title/input/prompt pills, and the chat composer), so we
 * render it FOR REAL on first paint — only the conversation LIST and the chat
 * MESSAGES area are data-dependent and get a loading/blank state. This mirrors
 * the real page, which itself renders the static welcome screen instantly.
 *
 * Conditional-rendering parity (R9): the real page shows one of two layouts and
 * the sidebar only conditionally. We predict the EXACT same variant the page
 * does (`initialPredictionRef` in pages/VeeGPT.tsx), read synchronously from the
 * page's persisted signals before its bundle mounts:
 *   - `veegpt-state` cache (`conversationId`): a cached id ⇒ the page restores a
 *     chat session. With NO cache but the "has conversations" hint set, the page
 *     auto-selects the first conversation ⇒ also a chat session. Otherwise the
 *     welcome/new-chat screen.
 *   - `veegpt-has-conversations` hint ⇒ whether the conversation sidebar shows.
 *
 * Variant/sidebar can be forced via props (tests). Pure/presentational.
 */

export type VeeGPTSkeletonVariant = 'welcome' | 'chat' | 'album'

export interface VeeGPTSkeletonProps {
  variant?: VeeGPTSkeletonVariant
  showSidebar?: boolean
  /**
   * Server-supplied "has conversations" hint for the active workspace, used on
   * the SSR shell where localStorage isn't readable. Ignored on the client,
   * which reads the more precise localStorage signals directly.
   */
  hasConversationsHint?: boolean
  /**
   * First-paint chrome (seeded conversation titles + user identity) so the
   * conversation sidebar renders REAL on first byte — identical to the live
   * page, so the overlay dissolve has nothing to swap (no width shift / flicker).
   */
  chrome?: ShellChrome
}

const STATE_CACHE_KEY = 'veegpt-state'
const HAS_CONVERSATIONS_KEY = 'veegpt-has-conversations'

// Mirrors QUICK_PROMPTS in pages/VeeGPT.tsx (static list) — same order/layout.
const QUICK_PROMPTS: { icon: React.ComponentType<{ className?: string }>; text: string }[] = [
  { icon: Lightbulb, text: 'Inspire me!' },
  { icon: Camera, text: 'Caption an image' },
  { icon: Target, text: 'I need a campaign idea' },
  { icon: Edit3, text: 'Draft a TikTok script' },
  { icon: Edit3, text: 'Write an Instagram post' },
  { icon: Rocket, text: 'How can I boost engagement?' },
  { icon: TrendingUp, text: "What's trending in my industry?" },
  { icon: Calendar, text: 'Draft a posting schedule for next month' },
]

function readCachedState(): {
  conversationId: number | null
  activeView?: 'chat' | 'album' | 'autopilot'
} | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    const raw = localStorage.getItem(STATE_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (Date.now() - parsed.timestamp < 86_400_000) {
      return { conversationId: parsed.conversationId ?? null, activeView: parsed.activeView }
    }
  } catch (_) {}
  return null
}

function readHasConversations(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false
    return localStorage.getItem(HAS_CONVERSATIONS_KEY) === '1'
  } catch (_) {
    return false
  }
}

/** Real, static conversation-sidebar chrome that mirrors `ConversationSidebar`
 *  EXACTLY (width, background, header w/ collapse button, nav, "Chats" label,
 *  bottom user row). The conversation list + user identity are rendered from the
 *  seeded `chrome` data so the overlay dissolve has NOTHING to swap (no width
 *  shift, no placeholder→real flicker). Falls back to placeholders only when the
 *  seed is absent (e.g. bare Suspense fallback during in-app navigation). */
function ConversationSidebarShell({
  conversations,
  userName,
  userPlan,
  currentConversationId,
}: {
  conversations?: Array<{ id: number; title: string }>
  userName?: string
  userPlan?: string
  currentConversationId?: number | null
}) {
  const hasSeed = Array.isArray(conversations)
  const list = conversations ?? []
  const initial = (userName || 'U').charAt(0).toUpperCase()

  const navItem = (
    Icon: React.ComponentType<{ className?: string }>,
    label: string,
  ) => (
    <div className="w-full flex items-center px-2.5 py-2 text-[14px] font-medium text-gray-700 dark:text-gray-300 rounded-lg">
      <Icon className="w-[18px] h-[18px] flex-shrink-0 text-gray-500 dark:text-gray-400" />
      <span className="ml-2.5">{label}</span>
    </div>
  )

  return (
    <div className="w-[260px] relative z-10 bg-gray-50 dark:bg-slate-950/50 dark:backdrop-blur-xl border-r border-gray-200/70 dark:border-white/[0.06] shadow-[6px_0_16px_-8px_rgba(0,0,0,0.12)] dark:shadow-[6px_0_20px_-10px_rgba(0,0,0,0.55)] flex flex-col">
      {/* Fixed top region — header + primary nav stay put while chats scroll */}
      <div className="shrink-0">
        {/* Logo header (real) + collapse affordance — matches ConversationSidebar
            (fixed h-14 + border so it lines up flush with the chat header). */}
        <div className="h-14 px-2.5 flex items-center justify-between border-b border-gray-200/70 dark:border-white/[0.06]">
          <div className="flex items-end py-1 pl-1.5 pr-2">
            <img src="/veefore.svg" alt="V" className="h-[22px] w-auto shrink-0" />
            <span className="-ml-[5px] text-[19px] font-semibold leading-none tracking-tight text-gray-900 dark:text-white">eeGPT</span>
          </div>
          <div className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400">
            <PanelLeft className="w-[18px] h-[18px]" />
          </div>
        </div>

        {/* Primary navigation (New chat + options share one spacing rhythm) */}
        <div className="px-2 pt-3 pb-3 space-y-0.5">
          <div className="w-full flex items-center px-2.5 py-2 text-[14px] font-medium text-gray-800 dark:text-gray-100 rounded-lg">
            <Edit className="w-[18px] h-[18px] flex-shrink-0 text-gray-500 dark:text-gray-400" />
            <span className="ml-2.5">New chat</span>
          </div>
          {navItem(Search, 'Search chats')}
          {navItem(Images, 'Album')}
          {navItem(Rocket, 'Auto Pilot')}
          <div className="w-full flex items-center px-2.5 py-2 text-[14px] font-medium text-gray-700 dark:text-gray-300 rounded-lg">
            <div className="w-[18px] h-[18px] flex-shrink-0 flex items-center justify-center">
              <div className="w-[9px] h-[9px] bg-gradient-to-br from-blue-400 to-blue-600 rounded-full shadow-sm shadow-blue-500/40"></div>
            </div>
            <span className="ml-2.5">AI Models</span>
          </div>
        </div>

        {/* Chats label — stays fixed above the scrolling list */}
        <div className="flex items-center justify-between px-4 pt-2 pb-3 text-[11px] font-semibold tracking-wide text-gray-400 dark:text-gray-500">
          <span>Chats</span>
          <ChevronDown className="w-3.5 h-3.5" />
        </div>
      </div>

      {/* Scrollable region — only the chats list scrolls */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden sidebar-scroll px-2 pb-2">
        <div>
          {hasSeed ? (
            <div className="space-y-1">
              {list.map((c) => {
                const isCurrent = currentConversationId != null && c.id === currentConversationId
                return (
                  <div key={c.id} className="relative">
                    <div
                      className={`w-full text-left px-2.5 py-2 text-[14px] rounded-lg truncate relative ${
                        isCurrent
                          ? 'bg-gray-200/80 dark:bg-white/[0.08] text-gray-900 dark:text-white font-medium'
                          : 'text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      <span className="block truncate whitespace-nowrap pr-1">{c.title}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="space-y-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center space-x-3 px-2.5 py-2.5 rounded-lg">
                  <Skeleton className="w-4 h-4 rounded bg-gray-300 dark:bg-gray-700" />
                  <Skeleton className="h-4 flex-1 rounded bg-gray-300 dark:bg-gray-700" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom user row */}
      <div className="p-2 border-t border-gray-200/70 dark:border-white/[0.06]">
        {userName ? (
          <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-sm">
              <span className="text-white text-[13px] font-semibold">{initial}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-gray-900 dark:text-white truncate leading-tight">
                {userName}
              </div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400 capitalize leading-tight mt-0.5">
                {userPlan || 'Free'} plan
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500" />
          </div>
        ) : (
          <div className="flex items-center space-x-3 px-2 py-2">
            <Skeleton variant="avatar" className="w-8 h-8 rounded-full flex-shrink-0" />
            <div className="flex-1 min-w-0 space-y-1">
              <Skeleton variant="text" className="h-4 w-full" />
              <Skeleton variant="text" className="h-3 w-12" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Real, static welcome screen (logo, title, subtitle, input box, prompt pills). */
function WelcomeContentShell() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-10">
          <div className="relative mb-6 inline-flex items-center justify-center">
            <div className="absolute inset-0 -z-10 rounded-full bg-blue-500/20 blur-3xl scale-150" />
            <img src="/veefore.svg" alt="VeeFore" className="h-14 w-auto object-contain drop-shadow-[0_8px_24px_rgba(59,130,246,0.35)]" />
          </div>
          <h1 className="text-[2.65rem] leading-[1.1] font-semibold tracking-tight text-gray-900 dark:text-gray-50">
            How can <span className="bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600 bg-clip-text text-transparent">VeeGPT</span> help?
            <span className="align-middle ml-3 px-2.5 py-1 bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-300 text-[11px] font-semibold rounded-full ring-1 ring-blue-200/60 dark:ring-blue-500/30">Beta</span>
          </h1>
          <p className="mt-3.5 text-[15px] text-gray-500 dark:text-gray-400">Your AI co-pilot for content, growth, and research.</p>
        </div>

        {/* Input box (real, non-interactive) */}
        <div className="bg-white/90 dark:bg-slate-800/70 backdrop-blur-md rounded-[24px] shadow-[0_8px_30px_-12px_rgba(15,23,42,0.18)] dark:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.5)] mb-8 border border-gray-200/70 dark:border-white/10">
          <textarea
            readOnly
            tabIndex={-1}
            aria-hidden="true"
            placeholder="Ask VeeGPT a question"
            className="w-full px-5 py-3 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 bg-transparent border-0 resize-none focus:outline-none focus:ring-0"
            style={{ fontSize: '16px', height: '48px', lineHeight: '24px', border: 'none', boxShadow: 'none' }}
            rows={1}
          />
          <div className="flex items-center justify-between px-5 pb-4">
            <div className="flex items-center gap-1">
              <div className="p-2 rounded-lg text-gray-600 dark:text-gray-400">
                <Paperclip className="w-4 h-4" />
              </div>
            </div>
            <div className="p-2 rounded-lg bg-gray-200 dark:bg-slate-700 text-gray-400 dark:text-gray-500">
              <Send className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Quick-prompt pills (real, static) */}
        <div className="space-y-2.5">
          {[QUICK_PROMPTS.slice(0, 3), QUICK_PROMPTS.slice(3, 6), QUICK_PROMPTS.slice(6)].map((row, ri) => (
            <div key={ri} className="flex flex-wrap gap-2.5 justify-center">
              {row.map((p, pi) => {
                const Icon = p.icon
                return (
                  <div
                    key={pi}
                    className="flex items-center gap-2 pl-2 pr-4 py-1.5 bg-white/80 dark:bg-white/[0.04] border border-gray-200/70 dark:border-white/10 rounded-full text-gray-700 dark:text-gray-200 shadow-[0_1px_3px_rgba(15,23,42,0.05)] whitespace-nowrap"
                  >
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-50 dark:bg-blue-500/15 text-blue-500 dark:text-blue-400">
                      <Icon className="w-[15px] h-[15px] flex-shrink-0" />
                    </span>
                    <span className="text-[13px] font-medium">{p.text}</span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        <div className="text-center mt-10">
          <p className="text-xs text-gray-400 dark:text-gray-500">VeeGPT can make mistakes. Check important info.</p>
        </div>
      </div>
    </div>
  )
}

/** Album content: mirrors the real Album's create surface (header + composer +
 *  style templates) and a gallery grid of image placeholders, so a refresh into
 *  the Album paints an album-shaped skeleton — never the welcome/chat one. */
function AlbumContentShell() {
  const templates = ['Caricature', 'Anime', 'Product shot', 'Poster', 'Logo', 'Cinematic', '3D render', 'Watercolor']
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-white dark:bg-slate-900">
      {/* Create surface */}
      <div className="border-b border-gray-200/70 dark:border-white/[0.06] bg-gradient-to-b from-blue-50/40 to-transparent dark:from-blue-500/[0.06]">
        <div className="mx-auto w-full max-w-5xl px-6 pt-8 pb-6">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-[0_6px_16px_-6px_rgba(37,99,235,0.7)]">
              <Images className="h-[18px] w-[18px]" />
            </span>
            <div>
              <div className="text-[18px] font-semibold tracking-tight text-gray-900 dark:text-white leading-tight">Album</div>
              <div className="text-[12px] text-gray-500 dark:text-gray-400 leading-tight">
                Create, edit, and revisit everything VeeGPT makes for you
              </div>
            </div>
          </div>
          {/* Composer */}
          <div className="flex items-center gap-2 rounded-2xl border border-gray-200/80 dark:border-white/10 bg-white dark:bg-slate-800/60 px-3.5 py-2.5 shadow-[0_8px_30px_-14px_rgba(15,23,42,0.25)]">
            <div className="h-[18px] w-[18px] rounded bg-blue-100 dark:bg-blue-500/20" />
            <span className="flex-1 text-[14px] text-gray-400 dark:text-gray-500">Describe an image to create…</span>
            <div className="h-8 w-8 rounded-full bg-gray-900 dark:bg-white" />
          </div>
          {/* Template pills */}
          <div className="mt-3 flex flex-wrap gap-2">
            {templates.map(t => (
              <div
                key={t}
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-200/80 dark:border-white/10 bg-white/70 dark:bg-white/[0.04] px-3 py-1.5 text-[12.5px] font-medium text-gray-500 dark:text-gray-400"
              >
                {t}
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Gallery grid placeholders */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="mx-auto w-full max-w-5xl px-6 py-6">
          <div className="mb-4 h-3 w-24 rounded bg-gray-200 dark:bg-white/10" />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {Array.from({ length: 15 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-xl bg-gray-200/80 dark:bg-white/[0.06]" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Chat-session content: the real top header bar + blank message canvas + the
 *  REAL static composer pill. The header bar mirrors ChatInterface EXACTLY (a
 *  56px `h-14` bar with the logo, title, and New chat action) — without it the
 *  skeleton's message area sits 56px higher than the real chat, so the dissolve
 *  caused a visible vertical jump/flicker once the user had a cached
 *  conversation (the predicted `chat` variant). */
function ChatContentShell() {
  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 relative">
      {/* Header bar (real, static) — matches ChatInterface's h-14 top bar. */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-gray-200/70 dark:border-white/[0.06] bg-gray-50/30 dark:bg-slate-900 z-20 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">VeeGPT</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300">
          <PenSquare className="w-4 h-4" />
          <span className="hidden sm:inline">New chat</span>
        </div>
      </div>

      {/* Messages area — intentionally blank (real messages stream in). Matches
          ChatInterface's gradient so the dissolve has no background change. */}
      <div
        className="flex-1 overflow-hidden p-6 bg-gradient-to-b from-gray-50/30 to-white dark:from-slate-900/40 dark:to-slate-900"
        style={{ paddingBottom: '100px' }}
      />

      {/* Floating composer (real, non-interactive) */}
      <div
        style={{
          position: 'absolute', bottom: '34px', left: '50%', transform: 'translateX(-50%)',
          width: '100%', maxWidth: '48rem', padding: '0 24px',
        }}
      >
        <div className="flex items-center gap-3 px-4 py-3 rounded-[25px] border border-gray-200/60 dark:border-white/10 bg-white/80 dark:bg-slate-800/60 min-h-[44px]">
          <Paperclip className="w-5 h-5 flex-shrink-0 text-gray-400 dark:text-gray-500" />
          <span className="flex-1 text-sm text-gray-400 dark:text-gray-500">Ask VeeGPT a question</span>
          <div className="p-1.5 rounded-lg bg-gray-200 dark:bg-slate-700">
            <Send className="w-4 h-4 text-gray-400 dark:text-gray-500" />
          </div>
        </div>
      </div>
    </div>
  )
}

function VeeGPTSkeletonImpl({ variant, showSidebar, hasConversationsHint, chrome }: VeeGPTSkeletonProps) {
  const canReadStorage = typeof window !== 'undefined' && !!window.localStorage
  const cached = (variant === undefined || showSidebar === undefined) ? readCachedState() : null
  // Seeded conversation titles (real data) + the layout hint. On the client we
  // prefer the precise localStorage signal; on the server we use the hint.
  const seededConversations = chrome?.veegpt?.conversations
  const hintHasConv =
    hasConversationsHint ?? (!!seededConversations && seededConversations.length > 0)
  const hasConv = canReadStorage ? readHasConversations() : hintHasConv

  // Resolve the welcome-vs-chat variant + whether the sidebar shows:
  //  - explicit prop wins (tests),
  //  - on the CLIENT read the precise localStorage signals (current state),
  //  - on the SERVER (overlay, no localStorage) use the `vf_vg` cookie layout the
  //    page mirrored last load (exact match), falling back to the has-conv guess.
  const cookieVariant = chrome?.veegpt?.variant
  const cookieShowSidebar = chrome?.veegpt?.showSidebar
  const predictedVariant: VeeGPTSkeletonVariant = canReadStorage
    ? cached?.activeView === 'album'
      ? 'album'
      : (cached?.conversationId != null || (cached == null && hasConv))
        ? 'chat'
        : 'welcome'
    : (cookieVariant ?? ((cached == null && hasConv) ? 'chat' : 'welcome'))
  const resolvedVariant: VeeGPTSkeletonVariant = variant ?? predictedVariant

  // Album + chat both show the conversation sidebar.
  const wantsSidebar = resolvedVariant === 'chat' || resolvedVariant === 'album'
  const predictedShowSidebar = canReadStorage
    ? (wantsSidebar || hasConv)
    : (cookieShowSidebar ?? (wantsSidebar || hasConv))
  const resolvedShowSidebar = showSidebar ?? predictedShowSidebar

  // The page highlights the cached/selected conversation in the chat variant.
  const currentConversationId = resolvedVariant === 'chat' ? (cached?.conversationId ?? null) : null

  const userName = chrome?.displayName || chrome?.email?.split('@')[0] || undefined

  return (
    <div
      data-testid="veegpt-skeleton"
      data-variant={resolvedVariant}
      className="h-full w-full bg-gray-50 dark:bg-slate-900 flex relative overflow-hidden"
    >
      {/* Static mirror of the real page's <Background/> (gradient + soft glows) so
          the skeleton and the live page are visually identical and the overlay
          removal is seamless. Animated particles are intentionally omitted (they
          move continuously and are opacity-30 / negligible). */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-white to-blue-50/60 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900" />
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-blue-500/5 dark:bg-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-blue-600/5 dark:bg-blue-600/10 blur-3xl" />
      </div>
      <div className="relative z-10 w-full h-full flex">
        {resolvedShowSidebar && (
          <ConversationSidebarShell
            conversations={seededConversations}
            userName={userName}
            userPlan={chrome?.plan}
            currentConversationId={currentConversationId}
          />
        )}
        {resolvedVariant === 'chat' ? (
          <ChatContentShell />
        ) : resolvedVariant === 'album' ? (
          <AlbumContentShell />
        ) : (
          <WelcomeContentShell />
        )}
      </div>
    </div>
  )
}

export const VeeGPTSkeleton = React.memo(VeeGPTSkeletonImpl)
VeeGPTSkeleton.displayName = 'VeeGPTSkeleton'
