import React from 'react'
import {
  Home, Calendar, Plus, MessageSquare, BarChart3, Zap, Activity,
  Shield, Settings, LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * SidebarSkeleton — the FIRST-PAINT icon-rail sidebar.
 *
 * The sidebar is static chrome (logo + fixed navigation), so instead of grey
 * shimmer tiles we render the REAL rail — the VeeFore logo and the actual nav
 * icons + labels — exactly matching `components/layout/sidebar.tsx`. It is pure
 * and presentational (no onClick, no hooks, no Create dropdown, no hover/active
 * animations), so it renders identically on the server (SSR shell) and on the
 * client while the real, interactive `Sidebar` loads — with zero layout shift
 * when it swaps in. The active item is highlighted from the current pathname so
 * the rail looks fully loaded, not a placeholder.
 *
 * Keep the nav list below in sync with `sidebarGroups` in
 * `components/layout/sidebar.tsx`.
 */

interface NavItem {
  icon: React.ComponentType<{ className?: string }>
  label: string
  key: string
  url?: string
}

// Mirrors the flattened `sidebarGroups` in the real sidebar (respecting the same
// Meta review-mode feature flag so the rail matches exactly).
const REVIEW_MODE = import.meta.env.VITE_META_PHASE_1_REVIEW_MODE === 'true'
const NAV_ITEMS: NavItem[] = [
  { icon: Home, label: 'Home', key: 'home', url: '/' },
  { icon: Calendar, label: 'Plan', key: 'plan', url: '/plan' },
  { icon: Plus, label: 'Create', key: 'create' },
  ...(REVIEW_MODE ? [] : [{ icon: MessageSquare, label: 'Inbox 2.0', key: 'inbox', url: '/inbox' }]),
  { icon: BarChart3, label: 'Analytics', key: 'analytics', url: '/analytics' },
  ...(REVIEW_MODE ? [] : [{ icon: Zap, label: 'Automation', key: 'automation', url: '/automation' }]),
  { icon: Activity, label: 'Listening', key: 'social-listening', url: '/social-listening' },
  { icon: Shield, label: 'Security Health', key: 'encryption-health', url: '/encryption-health' },
  { icon: Settings, label: 'Test Fixtures', key: 'test-fixtures', url: '/test-fixtures' },
]

function activeKeyFromPath(pathname: string): string {
  const loc = pathname || '/'
  if (loc === '/') return 'home'
  if (loc.startsWith('/plan')) return 'plan'
  if (loc.startsWith('/veegpt')) return 'veegpt'
  if (loc.startsWith('/inbox')) return 'inbox'
  if (loc.startsWith('/analytics')) return 'analytics'
  if (loc.startsWith('/automation')) return 'automation'
  if (loc.startsWith('/social-listening')) return 'social-listening'
  if (loc.startsWith('/settings')) return 'settings'
  if (loc.startsWith('/encryption-health')) return 'encryption-health'
  if (loc.startsWith('/test-fixtures')) return 'test-fixtures'
  return 'home'
}

function NavTile({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon
  return (
    <div
      data-nav={item.key}
      className={cn(
        'flex flex-col items-center transition-all duration-300 relative py-2',
        active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300'
      )}
    >
      <div className={cn(
        'w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 mb-1',
        active
          ? 'bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 shadow-lg border border-blue-200/50 dark:border-blue-600/50'
          : ''
      )}>
        <Icon className="w-5 h-5" />
      </div>
      <span className={cn(
        'text-xs font-medium',
        active ? 'text-blue-600 dark:text-blue-400 font-semibold' : 'text-gray-600 dark:text-gray-300'
      )}>
        {item.label}
      </span>
    </div>
  )
}

function SidebarSkeletonImpl({ pathname }: { pathname?: string }) {
  const path = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '/')
  const active = activeKeyFromPath(path)
  return (
    <div
      data-testid="sidebar-skeleton"
      className="w-24 bg-white dark:bg-slate-800 flex flex-col h-full min-h-full relative transition-colors duration-300"
    >
      {/* VeeGPT logo section — real logo, matches the py-6 block + w-16 h-16 tile */}
      <div className="flex flex-col items-center py-6 bg-white dark:bg-slate-800">
        <div
          data-nav="veegpt"
          className={cn(
            'flex flex-col items-center py-2 mb-4',
            active === 'veegpt' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300'
          )}
        >
          <div className="w-16 h-16 bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-700 dark:via-gray-800 dark:to-gray-900 rounded-2xl flex items-center justify-center mb-2 shadow-lg border border-gray-200/50 dark:border-gray-600/50">
            <img src="/veefore-logo.png" alt="VeeFore" className="w-10 h-10 drop-shadow-lg" />
          </div>
        </div>
      </div>

      {/* Main navigation — real icons + labels */}
      <div className="flex-1 flex flex-col justify-center bg-white dark:bg-slate-800">
        <nav className="flex flex-col space-y-4">
          {NAV_ITEMS.map((item) => (
            <NavTile key={item.key} item={item} active={active === item.key} />
          ))}
        </nav>
      </div>

      {/* Bottom section — Settings + Logout (real) */}
      <div className="flex flex-col space-y-4 py-6 bg-white dark:bg-slate-800">
        <NavTile item={{ icon: Settings, label: 'Settings', key: 'settings', url: '/settings' }} active={active === 'settings'} />
        <div className="flex flex-col items-center py-2 text-gray-600 dark:text-gray-300">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 via-red-600 to-red-700 dark:from-red-600 dark:via-red-700 dark:to-red-800 flex items-center justify-center mb-1">
            <LogOut className="w-5 h-5 text-white" />
          </div>
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Logout</span>
        </div>
      </div>
    </div>
  )
}

export const SidebarSkeleton = React.memo(SidebarSkeletonImpl)
SidebarSkeleton.displayName = 'SidebarSkeleton'
