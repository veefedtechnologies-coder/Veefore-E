/**
 * SettingsLayout Component
 * 
 * Orchestrator for settings page navigation and routing.
 * Manages tab-based navigation between different settings sections.
 * 
 * Requirements: 11.4 - Implement tab navigation system
 */

import { useState, useEffect, ReactNode } from 'react'
import { useLocation } from 'wouter'
import { Settings as SettingsIcon, Search, Menu, X } from 'lucide-react'
import type { SettingsRoute, SettingsCategory, SettingsLayoutProps } from './types'

export type { SettingsRoute, SettingsCategory, SettingsLayoutProps } from './types'

export function SettingsLayout({
  categories,
  defaultTab = 'account',
  title = 'Settings',
  subtitle = 'Manage your enterprise workspace and preferences'
}: SettingsLayoutProps) {
  const [location] = useLocation()
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    const tab = params.get('tab')
    
    if (!tab) return defaultTab
    
    // Check for route aliases
    for (const category of categories) {
      for (const route of category.items) {
        if (route.id === tab || route.aliases?.includes(tab)) {
          return route.id
        }
      }
    }
    
    return defaultTab
  })

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    params.set('tab', activeTab)
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`)
  }, [activeTab])

  const renderActiveContent = (): ReactNode => {
    for (const category of categories) {
      const route = category.items.find(item => item.id === activeTab)
      if (route) {
        const Component = route.component
        return <Component />
      }
    }

    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <SettingsIcon className="w-16 h-16 text-gray-300 dark:text-gray-700 mb-4" />
        <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Coming Soon</h3>
        <p className="text-gray-500 dark:text-gray-400 mt-2 max-w-sm">
          This settings category is currently under development.
        </p>
      </div>
    )
  }

  const filteredCategories = searchQuery
    ? categories
        .map(cat => ({
          ...cat,
          items: cat.items.filter(item =>
            item.label.toLowerCase().includes(searchQuery.toLowerCase())
          )
        }))
        .filter(cat => cat.items.length > 0)
    : categories

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-600 rounded-xl shadow-sm shadow-blue-500/20 hidden sm:block">
              <SettingsIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">{title}</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">{subtitle}</p>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative w-full md:w-72">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search settings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white shadow-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Mobile Menu Toggle */}
          <div className="lg:hidden">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="w-full flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm text-gray-900 dark:text-gray-100 font-medium"
            >
              <span>Menu</span>
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

          {/* Sidebar Navigation */}
          <div className={`lg:col-span-3 ${isMobileMenuOpen ? 'block' : 'hidden lg:block'}`}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 sticky top-24">
              {filteredCategories.map((category, idx) => (
                <div key={category.group} className={idx > 0 ? 'mt-6' : ''}>
                  <h4 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 px-3">
                    {category.group}
                  </h4>
                  <nav className="space-y-1">
                    {category.items.map((route) => {
                      const Icon = route.icon
                      const isActive = activeTab === route.id
                      const isDanger = route.danger || false

                      return (
                        <button
                          key={route.id}
                          onClick={() => {
                            setActiveTab(route.id)
                            setIsMobileMenuOpen(false)
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 text-sm font-medium
                            ${isActive && !isDanger ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' : ''}
                            ${!isActive && !isDanger ? 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-750' : ''}
                            ${isActive && isDanger ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400' : ''}
                            ${!isActive && isDanger ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10' : ''}
                          `}
                        >
                          <Icon className={`w-4 h-4 ${isActive && !isDanger ? 'text-blue-600 dark:text-blue-400' : ''} ${isDanger ? 'text-red-500' : ''}`} />
                          {route.label}
                        </button>
                      )
                    })}
                  </nav>
                </div>
              ))}
            </div>
          </div>

          {/* Content Area */}
          <div className="lg:col-span-9">{renderActiveContent()}</div>
        </div>
      </div>
    </div>
  )
}

export function createSettingsRoutes(routes: SettingsRoute[]): SettingsRoute[] {
  return routes
}

export function createSettingsCategories(categories: SettingsCategory[]): SettingsCategory[] {
  return categories
}

export default SettingsLayout
