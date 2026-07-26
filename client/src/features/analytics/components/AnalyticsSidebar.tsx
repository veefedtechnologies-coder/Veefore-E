/**
 * AnalyticsSidebar — the secondary navigation for the Analytics workspace.
 * Categorised nav items with larger text, taller buttons, and proper spacing.
 */

import { useCallback } from 'react'
import { useLocation } from 'wouter'
import { Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

import { ANALYTICS_NAV_ITEMS } from '../config/navigation'
import { useAnalyticsActiveRoute } from '../hooks/useAnalyticsActiveRoute'
import type { AnalyticsNavItem } from '../types'
import useSubscription from '@/hooks/useSubscription'
import { canAccessDashboard } from '../config/entitlements'

interface AnalyticsSidebarProps {
  onNavigate?: () => void
  className?: string
  collapsed?: boolean
}

/** Grouped navigation categories */
const NAV_GROUPS: { label: string; ids: string[] }[] = [
  { label: 'Performance', ids: ['overview', 'executive'] },
  { label: 'Audience & Content', ids: ['audience', 'reach', 'engagement', 'content'] },
  { label: 'Intelligence', ids: ['insights', 'best-time'] },
  { label: 'Publishing', ids: ['publishing'] },
  { label: 'Tools', ids: ['builder', 'reports'] },
]

export function AnalyticsSidebar({ onNavigate, className, collapsed = false }: AnalyticsSidebarProps) {
  const [, setLocation] = useLocation()
  const { item: activeItem } = useAnalyticsActiveRoute()
  const activeId = activeItem?.id ?? null
  const { limits } = useSubscription()
  // A nav item is locked when its dashboard requires a feature the plan lacks.
  const isLocked = (id: string) => !canAccessDashboard(id, limits?.features)

  const navigate = useCallback(
    (path: string) => {
      setLocation(path)
      onNavigate?.()
    },
    [setLocation, onNavigate]
  )

  // Build a lookup map for fast access
  const itemById = Object.fromEntries(ANALYTICS_NAV_ITEMS.map((i) => [i.id, i]))

  return (
    <nav
      aria-label="Analytics navigation"
      className={cn(
        'flex h-full flex-col overflow-y-auto bg-white dark:bg-gray-900',
        '[&::-webkit-scrollbar]:w-[4px] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-200 dark:[&::-webkit-scrollbar-thumb]:bg-gray-700',
        className
      )}
    >
      {/* No inner header — AnalyticsLayout owns the header */}

      {collapsed ? (
        /* ── Icon-only mode ──────────────────────────────────────── */
        <ul className="flex flex-col gap-1 px-2 py-4">
          {ANALYTICS_NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = item.id === activeId
            return (
              <li key={item.id}>
                <a
                  href={item.path}
                  title={item.label}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                    e.preventDefault()
                    navigate(item.path)
                  }}
                  className={cn(
                    'flex items-center justify-center h-10 w-10 mx-auto rounded-xl transition-colors',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
                  )}
                >
                  {Icon && <Icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />}
                </a>
              </li>
            )
          })}
        </ul>
      ) : (
        /* ── Full expanded mode with categories ──────────────────── */
        <div className="flex flex-col py-3">
          {NAV_GROUPS.map((group, gi) => {
            const items = group.ids.map((id) => itemById[id]).filter(Boolean)
            if (!items.length) return null
            return (
              <div key={group.label} className={cn('px-3', gi > 0 && 'mt-5')}>
                {/* Category label */}
                <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-widest text-gray-950 dark:text-gray-300">
                  {group.label}
                </p>
                {/* Items */}
                <ul className="flex flex-col gap-0.5">
                  {items.map((item) => {
                    const Icon = item.icon
                    const isActive = item.id === activeId
                    return (
                      <li key={item.id}>
                        <a
                          href={item.path}
                          aria-current={isActive ? 'page' : undefined}
                          onClick={(e) => {
                            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                            e.preventDefault()
                            navigate(item.path)
                          }}
                          className={cn(
                            'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors',
                            'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-gray-900',
                            isActive
                              ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                              : 'text-gray-950 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800/60 hover:text-black dark:hover:text-white'
                          )}
                        >
                          {Icon && (
                            <Icon
                              className={cn(
                                'h-[18px] w-[18px] flex-shrink-0 transition-colors',
                                isActive
                                  ? 'text-blue-600 dark:text-blue-400'
                                  : 'text-gray-950 dark:text-gray-400 group-hover:text-black dark:group-hover:text-gray-100'
                              )}
                              aria-hidden="true"
                            />
                          )}
                          <span className="truncate">{item.label}</span>
                          {/* Locked (plan) indicator */}
                          {isLocked(item.id) && (
                            <Lock className="ml-auto h-3.5 w-3.5 flex-shrink-0 text-gray-400 dark:text-gray-500" aria-label="Upgrade required" />
                          )}
                          {/* Active indicator dot */}
                          {isActive && !isLocked(item.id) && (
                            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                          )}
                        </a>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </nav>
  )
}
