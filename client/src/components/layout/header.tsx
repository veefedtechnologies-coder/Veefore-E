import React from 'react'
import { Bell, Search, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import WorkspaceSwitcher from '../WorkspaceSwitcher'
import { ProfileDropdown } from '../ProfileDropdown'
import { useUser } from '@/hooks/useUser'
import { useLocation } from 'wouter'
import { ThemeSelector } from '@/components/ui/theme-selector'

interface HeaderProps {
  className?: string
  onCreateClick?: () => void
}

export function Header({ className, onCreateClick }: HeaderProps) {
  const [location, setLocation] = useLocation()
  const { userData } = useUser()

  const getDisplayName = () => {
    if (userData?.displayName) return userData.displayName
    if (userData?.email) {
      // Extract name from email (before @)
      const emailName = userData.email.split('@')[0]
      // Convert username format to readable name
      return emailName.replace(/_\d+$/, '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    }
    return 'User'
  }

  return (
    <header data-testid="dashboard-header" className={cn("min-h-[8rem] h-auto py-6 lg:py-0 lg:h-32 bg-white/98 dark:bg-gray-900/98 backdrop-blur-xl border-b border-gray-200/60 dark:border-gray-700/60 flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-4 sm:px-6 lg:px-10 shadow-lg flex-shrink-0 transition-colors duration-300", className)}>
      {/* Left Section */}
      <div className="flex items-center flex-1 min-w-0">
        <div className="flex flex-col space-y-2 lg:space-y-3 min-w-0 w-full">
          {/* Trial Badge */}
          <div className="flex items-center space-x-3">
            <div className="w-2 h-2 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full animate-pulse"></div>
            <span className="text-xs lg:text-sm font-semibold tracking-wide text-[#1e63e5] dark:text-blue-400">TRIAL ENDS IN 25 DAYS</span>
          </div>
          
          {/* Welcome Message */}
          <div className="min-w-0 w-full">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black bg-gradient-to-r from-gray-900 via-slate-800 to-gray-900 dark:from-gray-100 dark:via-gray-200 dark:to-gray-100 bg-clip-text text-transparent tracking-tight truncate">
              Welcome, {getDisplayName()}!
            </h1>
          </div>
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-3 sm:gap-4 lg:gap-6 flex-shrink-0 flex-wrap lg:flex-nowrap">
        {/* Search */}
        <div className="relative hidden md:block">
          <Search className="absolute left-4 lg:left-5 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4 lg:w-5 lg:h-5" />
          <input
            type="text"
            placeholder="Search..."
            className="pl-10 lg:pl-14 pr-4 lg:pr-8 py-3 lg:py-4 border border-gray-200/60 dark:border-gray-600/60 rounded-xl lg:rounded-2xl bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm focus:outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-400/60 w-48 xl:w-80 text-sm font-medium placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-gray-100 transition-all duration-300 shadow-sm hover:shadow-md"
          />
        </div>

        {/* Theme Selector */}
        <ThemeSelector variant="compact" />

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative w-10 h-10 lg:w-14 lg:h-14 rounded-xl lg:rounded-2xl hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all duration-300 shadow-sm hover:shadow-md flex-shrink-0">
          <Bell className="w-5 h-5 lg:w-6 lg:h-6 text-gray-600 dark:text-gray-300" />
          <span className="absolute -top-1 -right-1 w-4 h-4 lg:w-5 lg:h-5 bg-gradient-to-r from-red-500 to-rose-600 rounded-full text-xs flex items-center justify-center shadow-lg">
            <span className="w-2 h-2 lg:w-2.5 lg:h-2.5 bg-white rounded-full"></span>
          </span>
        </Button>

        {/* Workspace Switcher */}
        <WorkspaceSwitcher onNavigateToWorkspaces={() => setLocation('/workspaces')} />

        {/* Profile */}
        <ProfileDropdown />
      </div>
    </header>
  )
}