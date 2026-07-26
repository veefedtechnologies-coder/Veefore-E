import React from 'react'
import { Bell, Search, Building2, Crown, ChevronDown } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import type { ShellChrome } from '@/lib/bootstrap'

/**
 * HeaderSkeleton — first-paint top bar.
 *
 * The header's STATIC chrome (search field, notification bell, layout) always
 * renders for real. The IDENTITY bits (welcome name, avatar initials, the active
 * workspace pill) render for real too WHEN seeded `chrome` is available (server
 * SSR shell + client loading shell both pass the SAME bootstrap-derived chrome,
 * so first paint is correct with no placeholder swap). Without chrome (e.g. a
 * cold load with no seeded user) they fall back to light placeholders. Pure and
 * presentational — no data fetching, no effects.
 *
 * Matches `components/layout/header.tsx` so there's no layout shift when the real
 * header swaps in.
 */

// Mirrors getDisplayName() in header.tsx / ProfileDropdown.tsx.
function resolveDisplayName(chrome?: ShellChrome): string | null {
  if (chrome?.displayName) return chrome.displayName
  if (chrome?.email) {
    const emailName = chrome.email.split('@')[0]
    return emailName.replace(/_\d+$/, '').replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
  }
  return null
}

function initialsOf(name: string): string {
  if (!name) return 'U'
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

// Mirrors getThemeGradient()/getPersonalityIcon() in WorkspaceSwitcher.tsx.
function themeGradient(theme?: string): string {
  switch (theme) {
    case 'space': return 'from-purple-500 to-indigo-600'
    case 'ocean': return 'from-blue-500 to-cyan-600'
    case 'forest': return 'from-green-500 to-emerald-600'
    case 'sunset': return 'from-orange-500 to-red-600'
    default: return 'from-gray-500 to-gray-600'
  }
}
function personalityIcon(p?: string): string {
  switch (p) {
    case 'creative': return '🎨'
    case 'casual': return '😊'
    case 'technical': return '⚙️'
    case 'friendly': return '🤝'
    default: return '💼'
  }
}

function HeaderSkeletonImpl({ chrome }: { chrome?: ShellChrome }) {
  const name = resolveDisplayName(chrome)
  const ws = chrome?.workspace

  return (
    <header
      data-testid="header-skeleton"
      className="min-h-[8rem] h-auto py-6 lg:py-0 lg:h-32 bg-white/98 dark:bg-gray-900/98 backdrop-blur-xl border-b border-gray-200/60 dark:border-gray-700/60 flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-4 sm:px-6 lg:px-10 shadow-lg flex-shrink-0"
    >
      {/* Left Section — trial badge (static) + welcome heading */}
      <div className="flex items-center flex-1 min-w-0">
        <div className="flex flex-col space-y-2 lg:space-y-3 min-w-0 w-full">
          <div className="flex items-center space-x-3">
            {/* skeleton-guard-allow: status-dot — decorative 'trial ends' accent dot, not a loading placeholder */}
            <div className="w-2 h-2 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full"></div>
            <span className="text-xs lg:text-sm font-semibold tracking-wide text-[#1e63e5] dark:text-blue-400">TRIAL ENDS IN 25 DAYS</span>
          </div>
          {name ? (
            <div className="min-w-0 w-full">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black bg-gradient-to-r from-gray-900 via-slate-800 to-gray-900 dark:from-gray-100 dark:via-gray-200 dark:to-gray-100 bg-clip-text text-transparent tracking-tight truncate">
                Welcome, {name}!
              </h1>
            </div>
          ) : (
            <Skeleton variant="text" className="h-9 lg:h-10 w-64 sm:w-80" />
          )}
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-3 sm:gap-4 lg:gap-6 flex-shrink-0 flex-wrap lg:flex-nowrap">
        {/* Search field — real (non-interactive) input */}
        <div className="relative hidden md:block">
          <Search className="absolute left-4 lg:left-5 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4 lg:w-5 lg:h-5" />
          <input
            type="text"
            placeholder="Search..."
            readOnly
            tabIndex={-1}
            aria-hidden="true"
            className="pl-10 lg:pl-14 pr-4 lg:pr-8 py-3 lg:py-4 border border-gray-200/60 dark:border-gray-600/60 rounded-xl lg:rounded-2xl bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm w-48 xl:w-80 text-sm font-medium placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-gray-100 shadow-sm"
          />
        </div>

        {/* Theme selector (compact placeholder) */}
        <Skeleton variant="rectangle" className="w-10 h-10 rounded-xl" />

        {/* Notifications — real bell button shape */}
        <div className="relative w-10 h-10 lg:w-14 lg:h-14 rounded-xl lg:rounded-2xl flex items-center justify-center shadow-sm flex-shrink-0">
          <Bell className="w-5 h-5 lg:w-6 lg:h-6 text-gray-600 dark:text-gray-300" />
        </div>

        {/* Workspace switcher — real pill when seeded, else placeholder */}
        {ws?.name ? (
          <div className="flex items-center space-x-3 h-auto p-2 rounded-xl">
            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${themeGradient(ws.theme)} flex items-center justify-center text-white shadow-sm`}>
              <Building2 className="w-4 h-4" />
            </div>
            <div className="flex items-center space-x-2">
              <div className="text-left">
                <div className="flex items-center space-x-1">
                  <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">{ws.name}</span>
                  {ws.isDefault && <Crown className="w-3 h-3 text-yellow-500" />}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center space-x-1">
                  <span>{personalityIcon(ws.aiPersonality)}</span>
                  <span>{ws.credits ?? 0} credits</span>
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500" />
            </div>
          </div>
        ) : (
          <Skeleton variant="rectangle" className="h-10 w-36 rounded-xl" />
        )}

        {/* Profile avatar — real initials tile when seeded (matches ProfileDropdown) */}
        {name ? (
          <div className="flex items-center space-x-4 px-4 py-3">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 via-purple-600 to-blue-700 rounded-2xl shadow-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">{initialsOf(name)}</span>
            </div>
            <ChevronDown className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </div>
        ) : (
          <Skeleton variant="avatar" className="w-10 h-10 rounded-full" />
        )}
      </div>
    </header>
  )
}

export const HeaderSkeleton = React.memo(HeaderSkeletonImpl)
HeaderSkeleton.displayName = 'HeaderSkeleton'
