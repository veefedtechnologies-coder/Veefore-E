import React from 'react'
import { useLocation } from 'wouter'

/**
 * Dashboard Quick Action buttons.
 *
 * Each button navigates to the correct app page:
 *  - Create from scratch  → /create           (blank post composer)
 *  - Post across networks → /create?mode=multi (composer with all platforms pre-selected)
 *  - Post about a trend   → /social-listening  (trend discovery, then "Create post" from a topic)
 *  - Start with AI        → /veegpt            (VeeGPT AI assistant)
 */

interface QuickAction {
  title: string
  href: string
  icon: React.ReactNode
  hoverColor: string
}

const quickActions: QuickAction[] = [
  {
    title: 'Schedule a post',
    href: '/plan',
    hoverColor: 'hover:bg-emerald-50 dark:hover:bg-emerald-900/20',
    icon: (
      <div className="w-24 h-24 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center relative">
        {/* Calendar grid */}
        <div className="w-14 h-14 bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-lg shadow-sm relative overflow-hidden">
          {/* Calendar header */}
          <div className="w-full h-4 bg-emerald-500 rounded-t-md flex items-center justify-around px-1">
            <div className="w-1 h-1 bg-white rounded-full" />
            <div className="w-1 h-1 bg-white rounded-full" />
          </div>
          {/* Calendar grid cells */}
          <div className="grid grid-cols-3 gap-0.5 p-1 pt-0.5">
            {[...Array(6)].map((_, i) => (
              <div key={i} className={`h-2 rounded-sm ${i === 3 ? 'bg-emerald-400' : 'bg-gray-200 dark:bg-gray-500'}`} />
            ))}
          </div>
        </div>
        {/* Clock overlay */}
        <div className="absolute bottom-2 right-2 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
          <div className="w-2 h-2 border border-white rounded-full relative">
            <div className="absolute top-0.5 left-0.5 w-0.5 h-1 bg-white rounded" />
          </div>
        </div>
      </div>
    ),
  },
  {
    title: 'Post across networks',
    href: '/create?mode=multi',
    hoverColor: 'hover:bg-blue-50 dark:hover:bg-blue-900/20',
    icon: (
      <div className="w-24 h-24 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center relative">
        <div className="w-14 h-10 bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-lg shadow-sm relative">
          <div className="p-1.5">
            <div className="w-8 h-1 bg-blue-400 rounded mb-1" />
            <div className="w-6 h-1 bg-gray-300 dark:bg-gray-500 rounded" />
          </div>
        </div>
        <div className="absolute top-3 right-3 w-6 h-6 bg-slate-800 rounded-md flex items-center justify-center">
          <div className="w-2 h-2 bg-white rounded-full" />
        </div>
        <div className="absolute bottom-3 left-3 w-4 h-4 bg-pink-500 rounded-md" />
      </div>
    ),
  },
  {
    title: 'Post about a trend',
    href: '/social-listening',
    hoverColor: 'hover:bg-pink-50 dark:hover:bg-pink-900/20',
    icon: (
      <div className="w-24 h-24 bg-pink-100 dark:bg-pink-900/30 rounded-2xl flex items-center justify-center relative">
        <div className="w-14 h-12 bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-lg shadow-sm relative p-2">
          <div className="w-full h-full relative">
            <div className="absolute bottom-0 left-1 w-6 h-4 bg-red-400 rounded-sm transform skew-x-12" />
            <div className="absolute top-1 right-1 w-3 h-2 bg-red-500 rounded-full" />
          </div>
        </div>
        <div className="absolute bottom-2 right-2 w-4 h-4 relative">
          <div className="w-3 h-0.5 bg-green-500 absolute bottom-1 left-0 transform rotate-45" />
          <div className="w-1 h-1 bg-green-500 absolute bottom-0 right-0" />
        </div>
      </div>
    ),
  },
  {
    title: 'Start with AI',
    href: '/veegpt',
    hoverColor: 'hover:bg-purple-50 dark:hover:bg-purple-900/20',
    icon: (
      <div className="w-24 h-24 bg-purple-100 dark:bg-purple-900/30 rounded-2xl flex items-center justify-center relative">
        <div className="w-14 h-10 bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-lg shadow-sm relative">
          <div className="w-full h-6 bg-gradient-to-r from-purple-200 to-pink-200 dark:from-purple-300 dark:to-pink-300 rounded-t-md" />
          <div className="p-1">
            <div className="w-8 h-1 bg-gray-300 dark:bg-gray-500 rounded" />
          </div>
        </div>
        <div className="absolute top-2 right-2 w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center">
          <span className="text-white text-xs">✨</span>
        </div>
        <div className="absolute bottom-2 left-2 w-4 h-3 bg-pink-400 rounded-lg" />
      </div>
    ),
  },
]

export function QuickActions() {
  const [, setLocation] = useLocation()

  return (
    <div className="mb-16" data-testid="quick-actions">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-10 px-3 sm:px-4 lg:px-6">
        {quickActions.map((action) => (
          <button
            key={action.title}
            onClick={() => setLocation(action.href)}
            className={`group cursor-pointer bg-transparent ${action.hoverColor} transition-all duration-200 p-8 rounded-2xl min-h-[200px] flex flex-col items-center justify-center active:scale-95`}
            aria-label={action.title}
          >
            <div className="mb-8 flex justify-center group-hover:scale-105 transition-transform duration-200">
              {action.icon}
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 leading-tight group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                {action.title}
              </h3>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
