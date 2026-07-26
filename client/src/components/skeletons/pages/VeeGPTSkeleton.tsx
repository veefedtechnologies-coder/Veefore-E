import React from 'react'
import {
  Edit, Search, Edit3, Rocket, Paperclip, Send,
  Lightbulb, TrendingUp, Camera, Target, Calendar, PenSquare,
  PanelLeft, ChevronDown,
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

export type VeeGPTSkeletonVariant = 'welcome' | 'chat'

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

// Mirrors QUICK_PROMPTS in pages/VeeGPT.tsx (static list).
const QUICK_PROMPTS: { icon: React.ComponentType<{ className?: string }>; text: string }[] = [
  { icon: Lightbulb, text: 'Inspire me!' },
  { icon: TrendingUp, text: "What's trending in my industry?" },
  { icon: Camera, text: 'Caption an image' },
  { icon: Target, text: 'I need a campaign idea' },
  { icon: Rocket, text: 'How can I boost engagement?' },
  { icon: Edit3, text: 'Draft a TikTok script' },
  { icon: Edit3, text: 'Write an Instagram post' },
  { icon: Calendar, text: 'Draft a posting schedule for next month' },
]

function readCachedState(): { conversationId: number | null } | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    const raw = localStorage.getItem(STATE_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (Date.now() - parsed.timestamp < 86_400_000) {
      return { conversationId: parsed.conversationId ?? null }
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
    <div className="w-full flex items-center px-3 py-2 text-sm font-medium text-gray-800 dark:text-gray-200 rounded-lg">
      <Icon className="w-[18px] h-[18px] flex-shrink-0 text-gray-400 dark:text-gray-500" />
      <span className="ml-3">{label}</span>
    </div>
  )

  return (
    <div className="w-[17.5rem] bg-gray-100/80 dark:bg-slate-950/50 dark:backdrop-blur-xl border-r border-gray-200/80 dark:border-white/10 flex flex-col">
      <div className="flex-1 overflow-y-auto overflow-x-hidden sidebar-scroll">
        {/* Logo header (real) + collapse affordance */}
        <div className="p-3 flex items-center justify-between">
          <img src="/veefore-logo.png" alt="VeeFore" className="w-8 h-8" />
          <div className="w-9 h-9 flex items-center justify-center rounded-lg">
            <PanelLeft className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </div>
        </div>

        {/* New chat button (real) */}
        <div className="px-3 pb-4">
          <div className="w-full flex items-center px-3 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <Edit className="w-4 h-4 flex-shrink-0 text-blue-500 dark:text-blue-400" />
            <span className="ml-3">New chat</span>
          </div>
        </div>

        {/* Nav menu (real) */}
        <div className="px-3 pb-5 space-y-0.5">
          {navItem(Search, 'Search chats')}
          {navItem(Edit3, 'Content Studio')}
          {navItem(Rocket, 'Auto Pilot')}
          <div className="w-full flex items-center px-3 py-2 text-sm font-medium text-gray-800 dark:text-gray-200 rounded-lg">
            <div className="w-[18px] h-[18px] flex-shrink-0 flex items-center justify-center">
              <div className="w-3 h-3 bg-gradient-to-r from-blue-400 to-blue-500 rounded-full shadow-sm shadow-blue-500/40"></div>
            </div>
            <span className="ml-3">AI Models</span>
          </div>
        </div>

        {/* Chats list */}
        <div className="px-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2 px-2">
            Chats
          </div>
          {hasSeed ? (
            <div className="space-y-1">
              {list.map((c) => {
                const isCurrent = currentConversationId != null && c.id === currentConversationId
                return (
                  <div key={c.id} className="relative">
                    <div
                      className={`w-full text-left px-3 py-2 text-sm rounded-lg truncate relative ${
                        isCurrent
                          ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white font-medium shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:shadow-none'
                          : 'text-gray-900 dark:text-gray-200'
                      }`}
                    >
                      {isCurrent && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-gradient-to-b from-blue-500 to-blue-600" />
                      )}
                      <span className="block truncate whitespace-nowrap pr-1">{c.title}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="space-y-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center space-x-3 px-3 py-2.5 rounded-lg">
                  <Skeleton className="w-4 h-4 rounded bg-gray-300 dark:bg-gray-700" />
                  <Skeleton className="h-4 flex-1 rounded bg-gray-300 dark:bg-gray-700" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom user row */}
      <div className="p-2.5 border-t border-gray-200/80 dark:border-white/10">
        {userName ? (
          <div className="flex items-center space-x-3 px-2 py-2 rounded-xl">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0 ring-2 ring-white dark:ring-white/10 shadow-sm">
              <span className="text-white text-sm font-bold">{initial}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {userName} ✅
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                {userPlan || 'Free'}
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500" />
          </div>
        ) : (
          <div className="flex items-center space-x-3 px-2 py-2">
            <Skeleton variant="avatar" className="w-9 h-9 rounded-full flex-shrink-0" />
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

        {/* Input box (real, non-interactive) */}
        <div className="bg-white dark:bg-slate-800/70 dark:backdrop-blur-sm rounded-[20px] shadow-[0_2px_16px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.3)] mb-7 border border-gray-200/80 dark:border-white/10">
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
          {[QUICK_PROMPTS.slice(0, 4), QUICK_PROMPTS.slice(4, 7), QUICK_PROMPTS.slice(7)].map((row, ri) => (
            <div key={ri} className="flex flex-wrap gap-2.5 justify-center">
              {row.map((p, pi) => {
                const Icon = p.icon
                return (
                  <div
                    key={pi}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800/60 border border-gray-200/80 dark:border-white/10 rounded-full text-gray-700 dark:text-gray-200 shadow-[0_1px_2px_rgba(0,0,0,0.04)] whitespace-nowrap"
                  >
                    <Icon className="w-4 h-4 flex-shrink-0 text-blue-500 dark:text-blue-400" />
                    <span className="text-sm font-medium">{p.text}</span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        <div className="text-center mt-9">
          <p className="text-xs text-gray-400 dark:text-gray-500">VeeGPT can make mistakes. Check important info.</p>
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
      <div className="flex items-center justify-between px-4 h-14 border-b border-gray-200 dark:border-white/10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm z-20 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <img src="/veefore-logo.png" alt="VeeFore" className="w-6 h-6 flex-shrink-0" />
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
    ? ((cached?.conversationId != null || (cached == null && hasConv)) ? 'chat' : 'welcome')
    : (cookieVariant ?? ((cached == null && hasConv) ? 'chat' : 'welcome'))
  const resolvedVariant: VeeGPTSkeletonVariant = variant ?? predictedVariant

  const predictedShowSidebar = canReadStorage
    ? (resolvedVariant === 'chat' || hasConv)
    : (cookieShowSidebar ?? (resolvedVariant === 'chat' || hasConv))
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
        {resolvedVariant === 'chat' ? <ChatContentShell /> : <WelcomeContentShell />}
      </div>
    </div>
  )
}

export const VeeGPTSkeleton = React.memo(VeeGPTSkeletonImpl)
VeeGPTSkeleton.displayName = 'VeeGPTSkeleton'
