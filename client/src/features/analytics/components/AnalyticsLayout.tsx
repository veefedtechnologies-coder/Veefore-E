/**
 * AnalyticsLayout — the Analytics workspace shell.
 * Header style matches Hootsuite: title + collapse toggle live in the sidebar header,
 * no separate full-width top bar.
 */

import { useCallback, useEffect, useState } from 'react'
import { Menu, X, ChevronsLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { AnalyticsSidebar } from './AnalyticsSidebar'

interface AnalyticsLayoutProps {
  children: React.ReactNode
}

/** Fixed sidebar widths */
const EXPANDED_W = 'w-64'
const COLLAPSED_W = 'w-14'

export function AnalyticsLayout({ children }: AnalyticsLayoutProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

  const closeDrawer = useCallback(() => setIsDrawerOpen(false), [])

  useEffect(() => {
    if (!isDrawerOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsDrawerOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isDrawerOpen])

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Desktop docked sidebar — sticks in place, doesn't scroll with content ── */}
      <aside className={cn(
        'hidden lg:flex flex-col flex-shrink-0',
        'bg-white dark:bg-gray-900 shadow-[1px_0_0_0_#e5e7eb] dark:shadow-[1px_0_0_0_#374151]',
        'transition-all duration-300 ease-in-out',
        'sticky top-0 h-screen overflow-y-auto',
        isSidebarCollapsed ? COLLAPSED_W : EXPANDED_W
      )}>
        {/* Sidebar header — "Analytics" title + collapse button */}
        <div className={cn(
          'flex items-center border-b border-gray-200 dark:border-gray-700 flex-shrink-0 overflow-hidden',
          isSidebarCollapsed ? 'justify-center px-0 py-4' : 'justify-between px-5 py-5'
        )}>
          {/* Title — fades out when collapsed */}
          <span className={cn(
            'text-lg font-bold text-gray-950 dark:text-gray-100 tracking-tight truncate transition-all duration-200',
            isSidebarCollapsed ? 'opacity-0 w-0 pointer-events-none' : 'opacity-100'
          )}>
            Analytics
          </span>
          <button
            type="button"
            onClick={() => setIsSidebarCollapsed((v) => !v)}
            aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="flex h-8 w-8 items-center justify-center rounded-md text-gray-950 hover:text-black dark:text-gray-200 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-all flex-shrink-0"
          >
            <ChevronsLeft className={cn(
              'h-5 w-5 text-gray-950 dark:text-gray-200 transition-transform duration-300 ease-in-out',
              isSidebarCollapsed && 'rotate-180'
            )} />
          </button>
        </div>

        {/* Nav items — fade out when collapsed */}
        <div className={cn(
          'flex-1 overflow-y-auto transition-opacity duration-200',
          isSidebarCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
        )}>
          <AnalyticsSidebar collapsed={false} className="h-full border-r-0" />
        </div>
      </aside>

      {/* ── Mobile drawer + backdrop ───────────────────────────────── */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={closeDrawer}
            className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Analytics navigation"
            className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-xl bg-white dark:bg-gray-900 flex flex-col"
          >
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-3">
              <span className="text-base font-bold text-gray-900 dark:text-gray-100">Analytics</span>
              <Button variant="ghost" size="icon" aria-label="Close navigation" onClick={closeDrawer} className="h-8 w-8">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <AnalyticsSidebar className="flex-1 border-r-0" onNavigate={closeDrawer} />
          </div>
        </div>
      )}

      {/* ── Content region — scrolls independently ─────────────────── */}
      <div className="min-w-0 flex-1 overflow-y-auto h-screen bg-gray-50 dark:bg-gray-950">
        {/* Mobile nav trigger */}
        <div className="px-6 pt-4 pb-0 lg:hidden">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsDrawerOpen(true)}
            aria-expanded={isDrawerOpen}
            aria-haspopup="dialog"
            className="gap-2"
          >
            <Menu className="h-4 w-4" />
            Analytics menu
          </Button>
        </div>

        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  )
}
